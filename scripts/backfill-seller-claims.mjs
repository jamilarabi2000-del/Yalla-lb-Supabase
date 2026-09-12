import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { projectId } from './lib/db.mjs';

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
  initializeApp({ cert: cert(serviceAccount), projectId: projectId || expectedProjectId });
} catch (err) {
  console.error('Failed to initialize Firebase Admin SDK.', err);
  process.exit(1);
}

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');

async function backfillSellerClaims() {
  console.log(`Starting seller claims backfill... ${isDryRun ? '(DRY RUN)' : ''}`);
  const auth = getAuth();
  let nextPageToken;
  let totalSellers = 0;
  let updatedCount = 0;

  do {
    const listResult = await auth.listUsers(1000, nextPageToken);
    for (const user of listResult.users) {
      const claims = user.customClaims || {};
      if (claims.seller === true) {
        totalSellers++;
        if (claims.sellerActive === undefined) {
          console.log(`User ${user.email} (${user.uid}) has seller:true but missing sellerActive. Setting sellerActive:true.`);
          if (!isDryRun) {
            await auth.setCustomUserClaims(user.uid, {
              ...claims,
              sellerActive: true
            });
          }
          updatedCount++;
        }
      }
    }
    nextPageToken = listResult.pageToken;
  } while (nextPageToken);

  console.log(`Backfill completed. Total sellers inspected: ${totalSellers}. Backfilled: ${updatedCount}.`);
}

backfillSellerClaims().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
