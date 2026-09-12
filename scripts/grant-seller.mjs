import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { getDb } from './lib/db.mjs';

const serviceAccountJson = process.env.SERVICE_ACCOUNT_JSON;
if (!serviceAccountJson) {
  console.error('Error: SERVICE_ACCOUNT_JSON environment variable is required.');
  console.error('Please run with: SERVICE_ACCOUNT_JSON="$(cat serviceAccount.json)" npm run grant-seller -- email@example.com');
  process.exit(1);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(serviceAccountJson);
} catch (err) {
  console.error('Failed to parse SERVICE_ACCOUNT_JSON as JSON.', err instanceof Error ? err.message : err);
  process.exit(1);
}

const expectedProjectId = 'yalla-lb-2026';
if (serviceAccount.project_id && serviceAccount.project_id !== expectedProjectId) {
  console.error(`Error: Firebase project ID mismatch. Expected '${expectedProjectId}', but service account has '${serviceAccount.project_id}'.`);
  process.exit(1);
}

try {
  initializeApp({ cert: cert(serviceAccount) });
} catch (err) {
  console.error('Failed to initialize Firebase Admin SDK. Check SERVICE_ACCOUNT_JSON format.', err);
  process.exit(1);
}

const email = process.argv[2];
const sellerId = process.argv[3];
if (!email) {
  console.error('Usage: npm run grant-seller -- <email> [sellerId]');
  process.exit(1);
}

try {
  const user = await getAuth().getUserByEmail(email);
  const currentClaims = user.customClaims || {};
  const effectiveSellerId = sellerId ? sellerId.trim() : (currentClaims.sellerId || `seller-${user.uid}`);
  
  await getAuth().setCustomUserClaims(user.uid, { 
    ...currentClaims, 
    seller: true,
    sellerActive: true,
    sellerId: effectiveSellerId
  });

  const db = getDb();
  const sellerRef = db.collection('sellers').doc(effectiveSellerId);
  await sellerRef.set({
    id: effectiveSellerId,
    isActive: true,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });

  console.log(`Successfully granted seller privileges (seller: true, sellerActive: true, sellerId: "${effectiveSellerId}") to ${user.email} (${user.uid}) and initialized sellers/${effectiveSellerId}`);
} catch (error) {
  console.error(`Error granting seller privileges to ${email}:`, error instanceof Error ? error.message : error);
  process.exit(1);
}
