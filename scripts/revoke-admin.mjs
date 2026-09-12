import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const serviceAccountJson = process.env.SERVICE_ACCOUNT_JSON;
if (!serviceAccountJson) {
  console.error('Error: SERVICE_ACCOUNT_JSON environment variable is required.');
  console.error('Please run with: SERVICE_ACCOUNT_JSON="$(cat serviceAccount.json)" npm run revoke-admin -- email@example.com');
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
  console.error('Failed to initialize Firebase Admin SDK.', err instanceof Error ? err.message : err);
  process.exit(1);
}

const email = process.argv[2];
if (!email) {
  console.error('Usage: npm run revoke-admin -- <email>');
  process.exit(1);
}

try {
  console.log(`Firebase project: ${expectedProjectId}`);
  const user = await getAuth().getUserByEmail(email);
  console.log(`User email: ${user.email}`);
  console.log(`UID: ${user.uid}`);

  const existingClaims = user.customClaims || {};
  console.log(`Existing custom claims:`, existingClaims);

  const mergedClaims = { ...existingClaims };
  delete mergedClaims.admin;

  await getAuth().setCustomUserClaims(user.uid, mergedClaims);
  await getAuth().revokeRefreshTokens(user.uid);
  console.log('Revoked refresh tokens successfully.');

  // Read user again to verify
  const verifiedUser = await getAuth().getUser(user.uid);
  const finalClaims = verifiedUser.customClaims || {};
  console.log(`Final custom claims:`, finalClaims);

  const isAdminTrue = finalClaims.admin === true;
  console.log(`Admin claim: ${isAdminTrue ? 'TRUE' : 'FALSE'}`);

  if (isAdminTrue) {
    console.error('Error: Failed to confirm admin revocation in final custom claims.');
    process.exit(1);
  }

  console.log(`Successfully and securely revoked admin privileges for ${user.email} (${user.uid}) on project ${expectedProjectId}`);
} catch (error) {
  console.error(`Error revoking admin privileges for ${email}:`, error instanceof Error ? error.message : error);
  process.exit(1);
}
