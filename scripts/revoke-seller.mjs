import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { getDb } from './lib/db.mjs';

const serviceAccountJson = process.env.SERVICE_ACCOUNT_JSON;
if (!serviceAccountJson) {
  console.error('Error: SERVICE_ACCOUNT_JSON environment variable is required.');
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
if (!email) {
  console.error('Usage: npm run revoke-seller -- <email>');
  process.exit(1);
}

try {
  const user = await getAuth().getUserByEmail(email);
  const currentClaims = user.customClaims || {};
  const sellerId = currentClaims.sellerId;

  await getAuth().setCustomUserClaims(user.uid, { 
    ...currentClaims, 
    sellerActive: false
  });

  await getAuth().revokeRefreshTokens(user.uid);
  console.log('Revoked refresh tokens successfully.');

  if (sellerId) {
    const db = getDb();
    await db.collection('sellers').doc(sellerId).set({
      isActive: false,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  }

  console.log(`Successfully revoked seller status (sellerActive: false) for ${user.email} (${user.uid})`);
} catch (error) {
  console.error(`Error revoking seller status for ${email}:`, error instanceof Error ? error.message : error);
  process.exit(1);
}
