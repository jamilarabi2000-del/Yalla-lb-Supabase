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
  console.error('Usage: npm run verify-admin -- <email_or_uid>');
  process.exit(1);
}

try {
  let user;
  if (identifier.includes('@')) {
    user = await getAuth().getUserByEmail(identifier);
  } else {
    user = await getAuth().getUser(identifier);
  }
  const claims = user.customClaims || {};
  const isAdminTrue = claims.admin === true;

  console.log(`Firebase project: ${expectedProjectId}`);
  console.log(`User email: ${user.email}`);
  console.log(`UID: ${user.uid}`);
  console.log(`Email verified: ${user.emailVerified}`);
  console.log(`Custom claims:`, claims);
  console.log(`Admin claim: ${isAdminTrue ? 'TRUE' : 'FALSE'}`);
} catch (error) {
  console.error(`Error verifying admin for ${identifier}:`, error instanceof Error ? error.message : error);
  process.exit(1);
}
