import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useShop } from '../context/ShopContext';
import { clearAdminMfaSession, isMfaSessionValid } from '../utils/adminMfa';

interface AdminSessionGateProps {
  children: React.ReactNode;
}

/**
 * Route-level safety boundary for the administrator console.
 *
 * A Supabase admin session proves authentication + database role, but it does
 * not prove that the administrator completed the Yalla password + email OTP
 * step-up flow for this browser session. If an admin session exists without a
 * valid step-up session, sign it out before the protected UI can render.
 *
 * The database remains authoritative for authorization; this component only
 * prevents the protected admin UI from being exposed by a stale/persisted
 * client session.
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

      if (authStatus === 'authenticated_admin' && uid && !isMfaSessionValid(uid)) {
        clearAdminMfaSession(uid);
        await signOutUser();
      }

      if (!cancelled) setEnforcing(false);
    };

    void enforce();
    return () => {
      cancelled = true;
    };
  }, [authStatus, uid, signOutUser]);

  if (
    enforcing ||
    authStatus === 'loading' ||
    (authStatus === 'authenticated_admin' && !!uid && !mfaValid)
  ) {
    return (
      <div className="min-h-screen bg-[#F7F7F8] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-[#B89753]" />
      </div>
    );
  }

  return <>{children}</>;
};
