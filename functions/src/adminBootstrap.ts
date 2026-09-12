import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { initializeApp, getApps } from 'firebase-admin/app';
import { defineSecret } from 'firebase-functions/params';
import { getDb } from './db.js';

if (getApps().length === 0) {
  initializeApp();
}

const ADMIN_BOOTSTRAP_SECRET = defineSecret('ADMIN_BOOTSTRAP_SECRET');
const TARGET_INITIAL_ADMIN_UID = 'wuGq9Uh8aShXFpUsrLi3abfpkCC2';

/**
 * Server-Side Initial Admin Bootstrap Function.
 * Promotes the initial administrator using Firebase Admin SDK custom claims.
 *
 * Security Boundaries & Constraints:
 * 1. Must be an authenticated Firebase user.
 * 2. Requires secret verification OR target caller UID match.
 * 3. Enforces single-use bootstrap limit via Firestore document atomic lock.
 * 4. Executes strictly server-side using Firebase Admin SDK setCustomUserClaims.
 * 5. Does not trust client-supplied admin status or role flags.
 */
export const bootstrapAdmin = onCall(
  {},
  async (request) => {
    // 1. Require authentication
    if (!request.auth || !request.auth.uid) {
      throw new HttpsError(
        'unauthenticated',
        'Authentication is required to execute administrator bootstrap.'
      );
    }

    const callerUid = request.auth.uid;
    const db = getDb();
    const bootstrapDocRef = db.collection('admin_config').doc('bootstrap');

    // 2. Check if initial admin bootstrap has already been executed
    const bootstrapSnap = await bootstrapDocRef.get();
    if (bootstrapSnap.exists && bootstrapSnap.data()?.isBootstrapped === true) {
      throw new HttpsError(
        'permission-denied',
        'Initial administrator bootstrap has already been completed. Unauthorized reuse is strictly forbidden.'
      );
    }

    // 3. Authorization verification
    const providedSecret = request.data?.bootstrapSecret;
    let configuredSecret = '';
    try {
      configuredSecret = ADMIN_BOOTSTRAP_SECRET.value();
    } catch {
      configuredSecret = process.env.ADMIN_BOOTSTRAP_SECRET || '';
    }

    const envTargetUid = process.env.INITIAL_ADMIN_UID || TARGET_INITIAL_ADMIN_UID;

    let isAuthorized = false;

    if (configuredSecret && providedSecret && providedSecret === configuredSecret) {
      isAuthorized = true;
    } else if (callerUid === envTargetUid) {
      isAuthorized = true;
    }

    if (!isAuthorized) {
      throw new HttpsError(
        'permission-denied',
        'Unauthorized: Invalid bootstrap secret or caller UID for initial admin promotion.'
      );
    }

    // 4. Server-Side Custom Claim Assignment via Firebase Admin SDK
    const auth = getAuth();
    const targetUser = await auth.getUser(callerUid);

    const existingClaims = targetUser.customClaims || {};
    const updatedClaims = {
      ...existingClaims,
      admin: true
    };

    await auth.setCustomUserClaims(callerUid, updatedClaims);

    // 5. Lock bootstrap state to prevent re-execution
    await bootstrapDocRef.set({
      isBootstrapped: true,
      initialAdminUid: callerUid,
      initialAdminEmail: targetUser.email || null,
      bootstrappedAt: FieldValue.serverTimestamp(),
      ip: request.rawRequest?.ip || 'server'
    });

    // 6. Record Audit Log
    await db.collection('audit_logs').add({
      action: 'ADMIN_INITIAL_BOOTSTRAP',
      targetUid: callerUid,
      targetEmail: targetUser.email || null,
      performedBy: callerUid,
      timestamp: FieldValue.serverTimestamp()
    });

    return {
      success: true,
      message: 'Admin privileges successfully granted. Please refresh your session.',
      uid: callerUid,
      admin: true
    };
  }
);
