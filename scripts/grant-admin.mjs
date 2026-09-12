import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const serviceAccountJson = process.env.SERVICE_ACCOUNT_JSON;
const expectedProjectId = 'yalla-lb-2026';

if (serviceAccountJson) {
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(serviceAccountJson);
  } catch (err) {
    console.error('Failed to parse SERVICE_ACCOUNT_JSON as JSON.', err instanceof Error ? err.message : err);
    process.exit(1);
  }

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
} else {
  try {
    initializeApp({ projectId: expectedProjectId });
  } catch (err) {
    console.error('Failed to initialize Firebase Admin SDK with default credentials.', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

const identifier = process.argv[2];
if (!identifier) {
  console.error('Usage: npm run grant-admin -- <email_or_uid>');
  process.exit(1);
}

try {
  console.log(`Firebase project: ${expectedProjectId}`);
  let user;
  if (identifier.includes('@')) {
    user = await getAuth().getUserByEmail(identifier);
  } else {
    user = await getAuth().getUser(identifier);
  }
  console.log(`User email: ${user.email}`);
  console.log(`UID: ${user.uid}`);
  console.log(`Email verified: ${user.emailVerified}`);

  const existingClaims = user.customClaims || {};
  console.log(`Existing custom claims:`, existingClaims);

  const mergedClaims = { ...existingClaims, admin: true };
  await getAuth().setCustomUserClaims(user.uid, mergedClaims);

  // Read user again to verify
  const verifiedUser = await getAuth().getUser(user.uid);
  const finalClaims = verifiedUser.customClaims || {};
  console.log(`Final custom claims:`, finalClaims);

  const isAdminTrue = finalClaims.admin === true;
  console.log(`Admin claim: ${isAdminTrue ? 'TRUE' : 'FALSE'}`);

  if (!isAdminTrue) {
    console.error('Error: Failed to confirm admin: true in final custom claims.');
    process.exit(1);
  }

  console.log(`Successfully and securely granted admin privileges to ${user.email || user.uid} (${user.uid}) on project ${expectedProjectId}`);
} catch (error) {
  console.error(`Error granting admin privileges to ${identifier}:`, error instanceof Error ? error.message : error);
  process.exit(1);
}
