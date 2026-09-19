import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowRight, Eye, EyeOff, Loader2, Lock, ShieldAlert } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useShop } from '../context/ShopContext';
import { clearAdminMfaSession, registerMfaPromptHandler } from '../utils/adminMfa';

interface AdminGuardProps { children: React.ReactNode; }

/**
 * Administrator gate.
 *
 * The console renders only once the session has reached AAL2 via Supabase's
 * native TOTP MFA. This is not merely a UI gate: the same second factor is what
 * private.is_admin_verified() reads, and that function guards every admin write
 * through restrictive RLS policies and the SECURITY DEFINER RPCs. A session that
 * cannot render the console also cannot write through the REST API.
 *
 * MFA is verified on the PRIMARY Supabase client on purpose. Verifying on a
 * throwaway client would leave the primary JWT at aal1, and the database could
 * not distinguish a verified administrator from someone who only knows the
 * password.
 */
type AuthMode = 'login' | 'mfa' | 'enroll' | 'verify_email_notice';

const ADMIN_INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;
const ADMIN_ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'] as const;

export const AdminGuard: React.FC<AdminGuardProps> = ({ children }) => {
  const { authStatus, authUser, signOutUser } = useShop();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [factorId, setFactorId] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [isSecretVisible, setIsSecretVisible] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showStepUp, setShowStepUp] = useState(false);
  const [stepUpError, setStepUpError] = useState<string | null>(null);

  const resolverRef = useRef<((success: boolean) => void) | null>(null);
  const lastActivityRef = useRef(Date.now());
  const bootstrappedRef = useRef(false);

  const userId = authUser?.uid;

  const verifyAdminRole = useCallback(async (uid: string) => {
    const { data, error: roleError } = await supabase.from('profiles').select('role').eq('id', uid).maybeSingle();
    if (roleError) throw roleError;
    if (data?.role !== 'admin') throw new Error('This account does not have administrator privileges.');
  }, []);

  /** Persist the step-up so destructive RPCs that demand a *fresh* factor pass. */
  const recordStepUp = useCallback(async () => {
    const { error: rpcError } = await supabase.schema('private').rpc('record_admin_step_up_aal2');
    // Non-fatal: the AAL2 claim in the session JWT is already the primary proof
    // that private.is_admin_verified() reads. This row only adds freshness for
    // delete operations.
    if (rpcError) console.warn('[AdminGuard] Could not record step-up:', rpcError.message);
  }, []);

  const markVerified = useCallback(async () => {
    await recordStepUp();
    setIsVerified(true);
    lastActivityRef.current = Date.now();
  }, [recordStepUp]);

  /** Decide which screen the administrator needs next. */
  const resolveMfaState = useCallback(async () => {
    const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalError) throw aalError;

    if (aal.currentLevel === 'aal2') {
      await markVerified();
      setMode('login');
      return;
    }

    const { data: factors, error: factorError } = await supabase.auth.mfa.listFactors();
    if (factorError) throw factorError;

    const verifiedFactor = (factors?.totp || []).find((f: any) => f.status === 'verified');
    if (verifiedFactor) {
      setFactorId(verifiedFactor.id);
      const challenge = await supabase.auth.mfa.challenge({ factorId: verifiedFactor.id });
      if (challenge.error) throw challenge.error;
      setChallengeId(challenge.data.id);
      setMode('mfa');
      return;
    }

    setMode('enroll');
  }, [markVerified]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) return setError('Please enter your administrator email address.');
    if (!password) return setError('Please enter your administrator password.');

    setBusy(true);
    setError(null);
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
      if (signInError) throw signInError;
      if (!data.user) throw new Error('No authenticated administrator was returned.');
      await verifyAdminRole(data.user.id);
      setPassword('');
      await resolveMfaState();
    } catch (err: any) {
      const message = String(err?.message || '');
      if (message.toLowerCase().includes('invalid login credentials')) {
        setError('Invalid administrator email or password.');
      } else if (message.toLowerCase().includes('email not confirmed')) {
        setMode('verify_email_notice');
      } else {
        setError(message || 'Administrator authentication failed.');
      }
    } finally {
      setBusy(false);
    }
  };

  /** Verify a 6-digit code against an existing, already-verified factor. */
  const verifyCode = useCallback(async () => {
    const cleanCode = code.replace(/\D/g, '');
    if (cleanCode.length !== 6) throw new Error('Enter the 6-digit code from your authenticator app.');
    if (!factorId) throw new Error('No verified authenticator is enrolled for this administrator.');

    let activeChallenge = challengeId;
    if (!activeChallenge) {
      const challenge = await supabase.auth.mfa.challenge({ factorId });
      if (challenge.error) throw challenge.error;
      activeChallenge = challenge.data.id;
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: activeChallenge,
      code: cleanCode,
    });
    // A spent or expired challenge cannot be retried; force a fresh one.
    if (verifyError) {
      setChallengeId('');
      throw verifyError;
    }

    await markVerified();
    setCode('');
    setChallengeId('');
  }, [code, factorId, challengeId, markVerified]);

  const enrollTotp = async () => {
    setBusy(true);
    setError(null);
    try {
      // Clear any half-finished enrollment so retrying never hits
      // "factor already exists".
      //
      // This MUST read `all`, not `totp`. listFactors() buckets a factor into
      // `totp` only when status === 'verified', so `totp` is a verified-only
      // list and filtering it for unverified entries always yields nothing —
      // leaving the abandoned factor in place to collide on the next attempt.
      const { data: existing, error: listError } = await supabase.auth.mfa.listFactors();
      if (listError) throw listError;

      const abandoned = (existing?.all ?? []).filter(
        (f: any) => f.factor_type === 'totp' && f.status !== 'verified',
      );
      for (const stale of abandoned) {
        const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: stale.id });
        if (unenrollError) throw unenrollError;
      }

      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        // Friendly names are unique per user, so anything coarser than a
        // timestamp collides when enrollment is attempted twice in one day.
        friendlyName: `Yalla Administrator ${new Date().toISOString().replace(/[:.]/g, '-')}`,
      });
      if (enrollError) throw enrollError;
      setFactorId(data.id);
      setQrCode(data.totp?.qr_code || '');
      setSecret(data.totp?.secret || '');
      setIsSecretVisible(false);
    } catch (err: any) {
      setError(err?.message || 'Could not start authenticator enrollment.');
    } finally {
      setBusy(false);
    }
  };

  const verifyEnrollment = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (!factorId) throw new Error('Authenticator enrollment has not started.');
      const cleanCode = code.replace(/\D/g, '');
      if (cleanCode.length !== 6) throw new Error('Enter the 6-digit code from your authenticator app.');

      const challenge = await supabase.auth.mfa.challenge({ factorId });
      if (challenge.error) throw challenge.error;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.data.id,
        code: cleanCode,
      });
      if (verifyError) throw verifyError;

      await markVerified();
      setCode('');
      setQrCode('');
      setSecret('');
    setIsSecretVisible(false);
      setIsSecretVisible(false);
      setMode('login');
    } catch (err: any) {
      setError(err?.message || 'Authenticator verification failed.');
    } finally {
      setBusy(false);
    }
  };

  // Resume an existing admin session (page reload with a live session).
  useEffect(() => {
    if (authStatus !== 'authenticated_admin' || !userId) {
      bootstrappedRef.current = false;
      return;
    }
    if (isVerified || bootstrappedRef.current) return;

    bootstrappedRef.current = true;
    let cancelled = false;
    setBusy(true);
    void (async () => {
      try {
        await verifyAdminRole(userId);
        await resolveMfaState();
      } catch (err: any) {
        bootstrappedRef.current = false;
        if (!cancelled) setError(err?.message || 'Could not determine administrator MFA state.');
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [authStatus, userId, isVerified, verifyAdminRole, resolveMfaState]);

  // High-risk actions ask for a fresh factor through this handler.
  useEffect(() => registerMfaPromptHandler((resolve) => {
    resolverRef.current = resolve;
    setStepUpError(null);
    setCode('');
    setShowStepUp(true);
    void (async () => {
      try {
        const { data: factors, error: factorError } = await supabase.auth.mfa.listFactors();
        if (factorError) throw factorError;
        const factor = (factors?.totp || []).find((f: any) => f.status === 'verified');
        if (!factor) throw new Error('No verified authenticator is enrolled for this administrator.');
        setFactorId(factor.id);
        const challenge = await supabase.auth.mfa.challenge({ factorId: factor.id });
        if (challenge.error) throw challenge.error;
        setChallengeId(challenge.data.id);
      } catch (err: any) {
        setStepUpError(err?.message || 'Could not start step-up verification.');
      }
    })();
  }), []);

  // Inactivity sign-out.
  useEffect(() => {
    if (authStatus !== 'authenticated_admin' || !userId || !isVerified) return;
    lastActivityRef.current = Date.now();
    const markActivity = () => { lastActivityRef.current = Date.now(); };
    ADMIN_ACTIVITY_EVENTS.forEach(event => window.addEventListener(event, markActivity, { passive: true }));
    const timer = window.setInterval(async () => {
      if (Date.now() - lastActivityRef.current < ADMIN_INACTIVITY_TIMEOUT_MS) return;
      window.clearInterval(timer);
      ADMIN_ACTIVITY_EVENTS.forEach(event => window.removeEventListener(event, markActivity));
      clearAdminMfaSession(userId);
      setIsVerified(false);
      setMode('login');
      setCode('');
      setPassword('');
      await signOutUser();
      setError('Your administrator session expired after 30 minutes of inactivity. Please sign in again.');
    }, 30_000);
    return () => {
      window.clearInterval(timer);
      ADMIN_ACTIVITY_EVENTS.forEach(event => window.removeEventListener(event, markActivity));
    };
  }, [authStatus, userId, isVerified, signOutUser]);

  const signOutAndReset = async () => {
    clearAdminMfaSession(userId);
    await supabase.auth.signOut();
    setIsVerified(false);
    setMode('login');
    setCode('');
    setPassword('');
    setQrCode('');
    setSecret('');
    setIsSecretVisible(false);
    setChallengeId('');
    bootstrappedRef.current = false;
  };

  const codeInputClass =
    'w-full bg-[#F7F7F8] border border-[#E5E5E5] rounded-xl px-4 py-4 text-center text-2xl tracking-[0.25em] font-mono';
  const errorBox = (message: string) => (
    <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-[#C62828] flex gap-2">
      <AlertCircle className="w-4 h-4 shrink-0" />{message}
    </div>
  );

  if (authStatus === 'loading') return (
    <div className="min-h-screen flex items-center justify-center bg-[#F7F7F8]"><Loader2 className="w-6 h-6 animate-spin text-[#B89753]" /></div>
  );

  if (authStatus === 'authenticated_admin' && isVerified) return (
    <>
      {children}
      {showStepUp && (
        <div className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E5E5E5] p-7 rounded-3xl max-w-sm w-full space-y-5 shadow-2xl">
            <div className="text-center space-y-2">
              <div className="mx-auto w-14 h-14 rounded-2xl gold-gradient-bg flex items-center justify-center text-white"><ShieldAlert className="w-6 h-6" /></div>
              <h2 className="text-xl font-bold">Re-verify Administrator</h2>
              <p className="text-sm text-[#666666]">Enter the current 6-digit code from your authenticator app.</p>
            </div>
            <form
              onSubmit={async e => {
                e.preventDefault();
                setBusy(true);
                setStepUpError(null);
                try {
                  await verifyCode();
                  setShowStepUp(false);
                  resolverRef.current?.(true);
                  resolverRef.current = null;
                } catch (err: any) {
                  setStepUpError(err?.message || 'Step-up verification failed.');
                } finally {
                  setBusy(false);
                }
              }}
              className="space-y-4"
            >
              <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus placeholder="123456" className={codeInputClass} />
              {stepUpError && errorBox(stepUpError)}
              <button disabled={busy || code.length !== 6} className="gold-btn w-full py-3 rounded-xl font-bold disabled:opacity-50">{busy ? 'Verifying…' : 'Verify Step-Up'}</button>
            </form>
            <button onClick={() => { setShowStepUp(false); resolverRef.current?.(false); resolverRef.current = null; }} className="w-full text-sm text-[#666666]">Cancel</button>
          </div>
        </div>
      )}
    </>
  );

  if (mode === 'mfa') return (
    <div className="min-h-screen bg-[#F7F7F8] flex items-center justify-center p-4">
      <div className="bg-white border border-[#E5E5E5] p-8 rounded-3xl max-w-sm w-full space-y-6 shadow-[0_12px_32px_-12px_rgba(184,151,83,0.18)]">
        <div className="text-center space-y-3">
          <div className="mx-auto w-16 h-16 rounded-[22px] gold-gradient-bg flex items-center justify-center text-white"><ShieldAlert className="w-7 h-7" /></div>
          <h1 className="text-2xl font-bold">Authenticator Verification</h1>
          <p className="text-sm text-[#666666]">Enter the 6-digit code from your authenticator app.</p>
        </div>
        <form onSubmit={async e => { e.preventDefault(); setBusy(true); setError(null); try { await verifyCode(); setMode('login'); } catch (err: any) { setError(err?.message || 'Verification failed.'); } finally { setBusy(false); } }} className="space-y-4">
          <label htmlFor="admin-totp" className="block text-sm font-semibold text-[#333333]">Authenticator code</label>
          <input id="admin-totp" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus placeholder="123456" className={codeInputClass} />
          {error && errorBox(error)}
          <button disabled={busy || code.length !== 6} className="gold-btn w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Verify &amp; Continue <ArrowRight className="w-4 h-4" /></>}</button>
        </form>
        <button onClick={signOutAndReset} className="w-full text-sm text-[#666666]">Cancel and Sign Out</button>
      </div>
    </div>
  );

  if (mode === 'enroll') return (
    <div className="min-h-screen bg-[#F7F7F8] flex items-center justify-center p-4">
      <div className="bg-white border border-[#E5E5E5] p-8 rounded-3xl max-w-md w-full space-y-6 shadow-[0_12px_32px_-12px_rgba(184,151,83,0.18)]">
        <div className="text-center space-y-3">
          <div className="mx-auto w-16 h-16 rounded-[22px] gold-gradient-bg flex items-center justify-center text-white"><ShieldAlert className="w-7 h-7" /></div>
          <h1 className="text-2xl font-bold">Set Up Authenticator</h1>
          <p className="text-sm text-[#666666]">Administrator writes require a second factor. Scan this code with Google Authenticator, Microsoft Authenticator, 1Password or any TOTP app.</p>
        </div>

        {!qrCode && (
          <button onClick={enrollTotp} disabled={busy} className="gold-btn w-full py-3 rounded-xl font-bold disabled:opacity-50">{busy ? 'Preparing…' : 'Start Authenticator Setup'}</button>
        )}

        {qrCode && (
          <div className="space-y-4">
            <div className="flex justify-center p-4 bg-white border rounded-2xl">
              {/*
                supabase.auth.mfa.enroll() already returns qr_code as a data
                URI. Wrapping it in another one yields
                "data:image/svg+xml;charset=utf-8,data%3Aimage%2F..." which no
                browser can render. Only encode when the value is a bare <svg>.
              */}
              <img
                src={qrCode.trimStart().startsWith('data:')
                  ? qrCode
                  : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrCode)}`}
                alt="Authenticator QR code"
                className="w-52 h-52"
              />
            </div>
            {secret && (
              <div className="text-xs text-[#666666]">
                {/*
                  The secret IS the second factor. Keep it off-screen by
                  default so it cannot be captured by a screenshot, a screen
                  share or someone standing behind you.
                */}
                <button
                  type="button"
                  onClick={() => setIsSecretVisible(v => !v)}
                  className="text-[#8F7137] font-semibold"
                >
                  {isSecretVisible ? 'Hide setup key' : "Can't scan? Show setup key"}
                </button>
                {isSecretVisible && (
                  <>
                    <div className="mt-2 p-3 bg-[#F7F7F8] rounded-xl font-mono break-all text-center">{secret}</div>
                    <p className="mt-2 text-[#C62828]">
                      Treat this like a password. Anyone who sees it can generate your codes.
                    </p>
                  </>
                )}
              </div>
            )}
            <form onSubmit={verifyEnrollment} className="space-y-4">
              <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="Enter 6-digit code" className={codeInputClass} />
              <button disabled={busy || code.length !== 6} className="gold-btn w-full py-3 rounded-xl font-bold disabled:opacity-50">{busy ? 'Verifying…' : 'Enable Authenticator'}</button>
            </form>
          </div>
        )}

        {error && errorBox(error)}
        <button onClick={signOutAndReset} className="w-full text-sm text-[#666666]">Cancel and Sign Out</button>
      </div>
    </div>
  );

  if (mode === 'verify_email_notice') return (
    <div className="min-h-screen bg-[#F7F7F8] flex items-center justify-center p-4">
      <div className="bg-white border border-[#E5E5E5] p-8 rounded-3xl max-w-md w-full text-center space-y-5">
        <ShieldAlert className="mx-auto w-10 h-10 text-[#B89753]" />
        <h1 className="text-xl font-bold">Email Verification Required</h1>
        <p className="text-sm text-[#666666]">Verify your administrator email before accessing the console.</p>
        {error && errorBox(error)}
        <button onClick={signOutAndReset} className="text-sm text-[#666666]">Back to login</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F7F7F8] flex items-center justify-center p-4">
      <div className="bg-white border border-[#E5E5E5] p-8 rounded-3xl max-w-md w-full space-y-7 shadow-[0_12px_32px_-12px_rgba(184,151,83,0.18)]">
        <div className="text-center space-y-3">
          <div className="mx-auto w-16 h-16 rounded-[22px] gold-gradient-bg flex items-center justify-center text-white"><Lock className="w-7 h-7" /></div>
          <h1 className="text-2xl font-bold">Administrator Access</h1>
          <p className="text-sm text-[#666666]">Enter your administrator credentials to continue.</p>
        </div>
        <form onSubmit={handleSignIn} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="admin-email" className="block text-sm font-semibold text-[#333333]">Email</label>
            <input id="admin-email" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" placeholder="Enter administrator email" disabled={busy} className="w-full bg-[#F7F7F8] border border-[#E5E5E5] rounded-xl px-4 py-3 outline-none focus:border-[#B89753]" />
          </div>
          <div className="space-y-2">
            <label htmlFor="admin-password" className="block text-sm font-semibold text-[#333333]">Password</label>
            <div className="relative">
              <input id="admin-password" type={isPasswordVisible ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" placeholder="Enter administrator password" disabled={busy} className="w-full bg-[#F7F7F8] border border-[#E5E5E5] rounded-xl px-4 py-3 pr-12 outline-none focus:border-[#B89753]" />
              <button type="button" aria-label={isPasswordVisible ? 'Hide password' : 'Show password'} onClick={() => setIsPasswordVisible(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#666666]">{isPasswordVisible ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}</button>
            </div>
          </div>
          {error && errorBox(error)}
          <button disabled={busy} className="gold-btn w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Continue <ArrowRight className="w-4 h-4" /></>}</button>
        </form>
      </div>
    </div>
  );
};
