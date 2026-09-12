import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getDb } from './db.js';

if (getApps().length === 0) {
  initializeApp();
}

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string, maxCalls: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxCalls) {
    return false;
  }
  entry.count += 1;
  return true;
}

export function normalizePhoneNumber(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('Phone number is required.');
  }
  let digits = trimmed.replace(/\D/g, '');
  if (digits.startsWith('00961')) {
    digits = digits.slice(5);
  } else if (digits.startsWith('961')) {
    digits = digits.slice(3);
  }

  if (digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  if ((digits.length === 7 && digits.startsWith('3')) || (digits.length === 8 && /^[78]/.test(digits))) {
    return `+961${digits}`;
  }

  throw new Error('Invalid Lebanese phone number format.');
}

export const checkPhoneAvailability = onCall(
  {
    region: 'europe-west1',
    enforceAppCheck: true,
    consumeAppCheckToken: true,
    cors: true,
  },
  async (request) => {
    const callerKey = request.auth?.uid || request.rawRequest.ip || 'anonymous';
    if (!checkRateLimit(callerKey, 30, 60 * 1000)) {
      throw new HttpsError('resource-exhausted', 'Too many requests. Please try again in a moment.');
    }

    const data = request.data || {};
    const phone = typeof data.phone === 'string' ? data.phone : '';
    const excludeUid = typeof data.excludeUid === 'string' ? data.excludeUid : undefined;

    if (!phone) {
      throw new HttpsError('invalid-argument', 'Phone number parameter is required.');
    }

    let formattedPhone: string;
    try {
      formattedPhone = normalizePhoneNumber(phone);
    } catch (e: any) {
      return { available: false, reason: e?.message || 'Invalid phone format.' };
    }

    const digits = formattedPhone.replace(/\D/g, '').slice(3); // Remove +961
    const registryKey = `phone_${digits}`;

    try {
      const db = getDb();
      const regSnap = await db.collection('phone_registry').doc(registryKey).get();
      if (regSnap.exists) {
        const regData = regSnap.data();
        if (regData && regData.uid && (!excludeUid || regData.uid !== excludeUid)) {
          return {
            available: false,
            reason: 'This phone number is already registered to another account. Please sign in or use a different phone number.'
          };
        }
      }
    } catch (checkErr: any) {
      console.warn('[checkPhoneAvailability Warning]:', checkErr?.message || checkErr);
    }

    return { available: true };
  }
);

/**
 * Authoritative admin step-up marker record.
 * Called only by verified administrators to record step-up timestamp
 * in admin_stepup/{uid} for destructive Firestore actions.
 * No OTP is generated, handled, or stored here; Firebase Authentication handles MFA.
 */
export const recordAdminStepUp = onCall(
  {
    region: 'europe-west1',
    enforceAppCheck: true,
    consumeAppCheckToken: true,
    cors: true,
  },
  async (request) => {
    if (!request.auth || !request.auth.uid) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    // Authoritative check: Firebase custom claim admin === true
    if (request.auth.token.admin !== true) {
      throw new HttpsError('permission-denied', 'Administrator privileges are required.');
    }

    // Authoritative check: Email must be verified
    if (request.auth.token.email_verified !== true) {
      throw new HttpsError('permission-denied', 'A verified administrator email address is required.');
    }

    const now = Date.now();
    try {
      const db = getDb();
      await db.collection('admin_stepup').doc(request.auth.uid).set({
        uid: request.auth.uid,
        email: request.auth.token.email || '',
        factor: 'firebase_native_email',
        verifiedAtMs: now,
        expiresAtMs: now + 30 * 60 * 1000,
      });
    } catch (err: any) {
      console.warn('[recordAdminStepUp Warning]: Firestore write unavailable:', err?.message || err);
    }

    return { success: true, verifiedAtMs: now };
  }
);
