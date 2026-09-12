/**
 * src/utils/adminMfa.ts
 *
 * Administrative MFA Step-Up and Session Manager (Client-Side UI Helper)
 *
 * IMPORTANT SECURITY DESIGN:
 * This client-side helper manages UI modal prompts and temporary tab session state.
 * Browser sessionStorage is NEVER considered proof of administrator authorization by itself.
 * All protected, high-risk operations are independently and authoritatively enforced server-side:
 * 1. Cloud Functions verify request.auth.token.admin === true and require step-up verification.
 * 2. Firestore Security Rules enforce hasRecentAdminStepUp(), requiring an active, unexpired
 *    server-issued record in admin_stepup/{request.auth.uid}.
 * 3. The client cannot write to or tamper with admin_stepup or admin_otps collections.
 */

const MFA_SESSION_KEY = 'yallalb_admin_mfa_session';
export const MFA_VALIDITY_MS = 30 * 60 * 1000; // 30 mins
export const HIGH_RISK_VALIDITY_MS = 15 * 60 * 1000; // 15 mins

export interface AdminMfaSession {
  uid: string;
  verifiedAt: number; // epoch ms
}

let mfaPromptListener: ((resolve: (success: boolean) => void) => void) | null = null;

export function registerMfaPromptHandler(handler: (resolve: (success: boolean) => void) => void): () => void {
  mfaPromptListener = handler;
  return () => {
    if (mfaPromptListener === handler) {
      mfaPromptListener = null;
    }
  };
}

export function promptStepUpModal(): Promise<boolean> {
  return new Promise((resolve) => {
    if (mfaPromptListener) {
      mfaPromptListener(resolve);
    } else {
      // Fallback if no modal listener registered
      resolve(false);
    }
  });
}

const memoryStorage = new Map<string, string>();

interface SimpleStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  keys?(): string[];
}

function getStorage(): SimpleStorage {
  if (typeof window !== 'undefined' && window.sessionStorage) {
    return {
      getItem: (k: string) => window.sessionStorage.getItem(k),
      setItem: (k: string, v: string) => window.sessionStorage.setItem(k, v),
      removeItem: (k: string) => window.sessionStorage.removeItem(k),
      keys: () => Object.keys(window.sessionStorage)
    };
  }
  if (typeof sessionStorage !== 'undefined') {
    return {
      getItem: (k: string) => sessionStorage.getItem(k),
      setItem: (k: string, v: string) => sessionStorage.setItem(k, v),
      removeItem: (k: string) => sessionStorage.removeItem(k),
      keys: () => Object.keys(sessionStorage)
    };
  }
  return {
    getItem: (k: string) => memoryStorage.get(k) ?? null,
    setItem: (k: string, v: string) => memoryStorage.set(k, v),
    removeItem: (k: string) => { memoryStorage.delete(k); },
    keys: () => Array.from(memoryStorage.keys())
  };
}

export function getAdminMfaSession(uid?: string): AdminMfaSession | null {
  const storage = getStorage();
  if (!uid) return null;
  try {
    const raw = storage.getItem(`${MFA_SESSION_KEY}_${uid}`);
    if (!raw) return null;
    const session: AdminMfaSession = JSON.parse(raw);
    if (session.uid !== uid) return null;
    const now = Date.now();
    if (now - session.verifiedAt > MFA_VALIDITY_MS) {
      storage.removeItem(`${MFA_SESSION_KEY}_${uid}`);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function setAdminMfaSession(uid: string): void {
  const storage = getStorage();
  if (!uid) return;
  try {
    const session: AdminMfaSession = {
      uid,
      verifiedAt: Date.now(),
    };
    storage.setItem(`${MFA_SESSION_KEY}_${uid}`, JSON.stringify(session));
  } catch {}
}

export function _setMfaSessionRawForTesting(uid: string, timestamp: number): void {
  const storage = getStorage();
  if (!uid) return;
  try {
    const session: AdminMfaSession = {
      uid,
      verifiedAt: timestamp,
    };
    storage.setItem(`${MFA_SESSION_KEY}_${uid}`, JSON.stringify(session));
  } catch {}
}

export function clearAdminMfaSession(uid?: string): void {
  const storage = getStorage();
  try {
    if (uid) {
      storage.removeItem(`${MFA_SESSION_KEY}_${uid}`);
    } else if (storage.keys) {
      const allKeys = storage.keys();
      for (const k of allKeys) {
        if (k.startsWith(MFA_SESSION_KEY)) {
          storage.removeItem(k);
        }
      }
    }
  } catch {}
}

export function isMfaSessionValid(uid?: string): boolean {
  return getAdminMfaSession(uid) !== null;
}

export function isHighRiskStepUpValid(uid?: string): boolean {
  const session = getAdminMfaSession(uid);
  if (!session) return false;
  return Date.now() - session.verifiedAt <= HIGH_RISK_VALIDITY_MS;
}

/**
 * Asserts high-risk eligibility for destructive operations (role changes, banking updates, bulk deletes).
 * If expired (>15 min), prompts for OTP step-up verification.
 */
export async function assertHighRiskAuthorization(uid?: string): Promise<boolean> {
  if (isHighRiskStepUpValid(uid)) {
    return true;
  }
  // Step-up is required
  const success = await promptStepUpModal();
  if (success && uid) {
    setAdminMfaSession(uid);
    return true;
  }
  return false;
}
