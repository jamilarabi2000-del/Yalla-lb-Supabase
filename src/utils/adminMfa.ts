/**
 * Client-side administrator step-up UI/session helper for the Supabase build.
 *
 * IMPORTANT:
 * This module is only a UI/session convenience. Browser sessionStorage is
 * never authorization proof by itself. Protected database mutations must be
 * independently enforced by Supabase Auth + PostgreSQL RLS/RPC authorization.
 *
 * The stored timestamp is therefore used only to decide whether the UI should
 * prompt for re-authentication again. It must not be treated as a server-side
 * privilege claim.
 */

const MFA_SESSION_KEY = 'yallalb_admin_mfa_session';
export const MFA_VALIDITY_MS = 30 * 60 * 1000;
export const HIGH_RISK_VALIDITY_MS = 15 * 60 * 1000;

export interface AdminMfaSession {
  uid: string;
  verifiedAt: number;
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
      keys: () => Object.keys(window.sessionStorage),
    };
  }

  if (typeof sessionStorage !== 'undefined') {
    return {
      getItem: (k: string) => sessionStorage.getItem(k),
      setItem: (k: string, v: string) => sessionStorage.setItem(k, v),
      removeItem: (k: string) => sessionStorage.removeItem(k),
      keys: () => Object.keys(sessionStorage),
    };
  }

  return {
    getItem: (k: string) => memoryStorage.get(k) ?? null,
    setItem: (k: string, v: string) => memoryStorage.set(k, v),
    removeItem: (k: string) => { memoryStorage.delete(k); },
    keys: () => Array.from(memoryStorage.keys()),
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

    if (Date.now() - session.verifiedAt > MFA_VALIDITY_MS) {
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
    storage.setItem(
      `${MFA_SESSION_KEY}_${uid}`,
      JSON.stringify({ uid, verifiedAt: Date.now() } satisfies AdminMfaSession),
    );
  } catch {
    // Best-effort UI state only.
  }
}

export function _setMfaSessionRawForTesting(uid: string, timestamp: number): void {
  const storage = getStorage();
  if (!uid) return;

  try {
    storage.setItem(
      `${MFA_SESSION_KEY}_${uid}`,
      JSON.stringify({ uid, verifiedAt: timestamp } satisfies AdminMfaSession),
    );
  } catch {
    // Test helper.
  }
}

export function clearAdminMfaSession(uid?: string): void {
  const storage = getStorage();
  try {
    if (uid) {
      storage.removeItem(`${MFA_SESSION_KEY}_${uid}`);
      return;
    }

    for (const key of storage.keys?.() ?? []) {
      if (key.startsWith(MFA_SESSION_KEY)) {
        storage.removeItem(key);
      }
    }
  } catch {
    // Best-effort UI state only.
  }
}

export function isMfaSessionValid(uid?: string): boolean {
  return getAdminMfaSession(uid) !== null;
}

export function isHighRiskStepUpValid(uid?: string): boolean {
  const session = getAdminMfaSession(uid);
  return !!session && Date.now() - session.verifiedAt <= HIGH_RISK_VALIDITY_MS;
}

/**
 * UI gate for high-risk actions. The actual authorization must still be
 * enforced by Supabase RLS/RPC. This function only decides whether the UI
 * should request a fresh administrator re-authentication.
 */
export async function assertHighRiskAuthorization(uid?: string): Promise<boolean> {
  if (isHighRiskStepUpValid(uid)) return true;

  const success = await promptStepUpModal();
  if (success && uid) {
    setAdminMfaSession(uid);
    return true;
  }

  return false;
}
