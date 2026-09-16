import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useShop } from '../context/ShopContext';
import { clearAdminMfaSession, isMfaSessionValid } from '../utils/adminMfa';

interface AdminSessionGateProps {
  children: React.ReactNode;
}

const ADMIN_OTP_STAGE_KEY = 'yalla_admin_otp_stage';
const ADMIN_OTP_STAGE_MAX_AGE_MS = 10 * 60 * 1000;

/**
 * Returns true only while the admin password-authenticated session is in the
 * short-lived password -> email-OTP step-up flow. The OTP screen itself is
 * intentionally outside the protected admin console, so keeping the primary
 * Supabase session alive here is required for the second factor to complete.
 */
const hasPendingAdminOtpStage = (): boolean => {
  try {
    if (typeof window === 'undefined') return false;
    const raw = window.sessionStorage.getItem(ADMIN_OTP_STAGE_KEY);
    if (!raw) return false;

    const parsed = JSON.parse(raw) as { email?: unknown; createdAt?: unknown };
    const email = String(parsed.email || '').trim();
    const createdAt = Number(parsed.createdAt);

    if (!email || !Number.isFinite(createdAt)) {
      window.sessionStorage.removeItem(ADMIN_OTP_STAGE_KEY);
      return false;
    }

    if (Date.now() - createdAt > ADMIN_OTP_STAGE_MAX_AGE_MS) {
      window.sessionStorage.removeItem(ADMIN_OTP_STAGE_KEY);
      return false;
    }

    return true;
  } catch {
    return false;
  }
};

/**
 * Route-level safety boundary for the administrator console.
 *
 * A Supabase admin session proves authentication + database role, but it does
 * not prove that the administrator completed the Yalla password + email OTP
 * step-up flow for this browser session. If an admin session exists without a
 * valid step-up session, sign it out before the protected UI can render.
 *
 * IMPORTANT: an active password -> OTP transition is the one exception. The
 * primary Supabase session must remain alive while the isolated OTP client
 * proves mailbox possession. AdminGuard still prevents the protected console
 * from rendering until MFA is verified.
 */
export const AdminSessionGate: React.FC<AdminSessionGateProps> = ({ children }) => {
  const { authStatus, authUser, signOutUser } = useShop();
  const [enforcing, setEnforcing] = useState(true);

  const uid = authUser?.uid;
  const mfaValid = isMfaSessionValid(uid);

  useEffect(() => {
    let cancelled = false;

    const enforce = async () => {
      if (authStatus === 'loading') return;

      const pendingOtp = hasPendingAdminOtpStage();

      if (authStatus === 'authenticated_admin' && uid && !mfaValid && !pendingOtp) {
        clearAdminMfaSession(uid);
        await signOutUser();
      }

      if (!cancelled) setEnforcing(false);
    };

    void enforce();
    return () => {
      cancelled = true;
    };
  }, [authStatus, uid, mfaValid, signOutUser]);

  const pendingOtp = hasPendingAdminOtpStage();

  if (
    enforcing ||
    authStatus === 'loading' ||
    (authStatus === 'authenticated_admin' && !!uid && !mfaValid && !pendingOtp)
  ) {
    return (
      <div className="min-h-screen bg-[#F7F7F8] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-[#B89753]" />
      </div>
    );
  }

  return <>{children}</>;
};
