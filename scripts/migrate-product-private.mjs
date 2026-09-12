import { initializeApp } from 'firebase-admin/app';
import { FieldValue } from 'firebase-admin/firestore';
import { getDb, projectId } from './lib/db.mjs';

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');

async function runMigration() {
  if (!projectId) {
    console.error('No projectId found in firebase-applet-config.json');
    process.exit(1);
  }

  initializeApp({ projectId });
  const db = getDb();
  db.settings({ ignoreUndefinedProperties: true });

  console.log(`Starting product_private migration on project ${projectId} (Dry run: ${isDryRun})`);
  const snapshot = await db.collection('products').get();
  
  const PRIVATE_FIELDS = ['sellerItemCode', 'lowStockThreshold', 'lowStockNotice', 'customStockLabel', 'costPriceUSD'];
  const migratedAt = new Date().toISOString();
  
  let count = 0;
  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    const privateData = {};
    let hasPrivate = false;

    for (const field of PRIVATE_FIELDS) {
      if (data[field] !== undefined && data[field] !== null) {
        privateData[field] = data[field];
        hasPrivate = true;
      }
    }

    if (hasPrivate) {
      count++;
      privateData.productId = docSnap.id;
      privateData.sellerId = data.sellerId || null;
      privateData.migratedAt = migratedAt;

      console.log(`[${isDryRun ? 'DRY-RUN' : 'MIGRATING'}] Product ${docSnap.id}: migrating ${Object.keys(privateData).join(', ')}`);

      if (!isDryRun) {
        const batch = db.batch();
        const privateRef = db.collection('product_private').doc(docSnap.id);
        batch.set(privateRef, privateData, { merge: true });

        const productUpdates = {};
        for (const field of PRIVATE_FIELDS) {
          productUpdates[field] = FieldValue.delete();
        }
        batch.update(docSnap.ref, productUpdates);

        await batch.commit();
      }
    }
  }

  console.log(`Migration finished. Products affected: ${count}`);
}

runMigration().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
