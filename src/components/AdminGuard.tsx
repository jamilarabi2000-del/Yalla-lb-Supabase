import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowRight, Eye, EyeOff, Loader2, Lock, Mail, ShieldAlert } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { adminOtpClient } from '../lib/adminOtpClient';
import { useShop } from '../context/ShopContext';
import { adminStepUpService } from '../services/adminStepUpService';
import {
  clearAdminMfaSession,
  isMfaSessionValid,
  registerMfaPromptHandler,
  setAdminMfaSession,
} from '../utils/adminMfa';

interface AdminGuardProps { children: React.ReactNode; }
type AuthMode = 'login' | 'otp' | 'verify_email_notice';

type PendingAdminOtpStage = { email: string; createdAt: number };
const ADMIN_OTP_STAGE_KEY = 'yalla_admin_otp_stage';
const ADMIN_OTP_STAGE_MAX_AGE_MS = 10 * 60 * 1000;
const ADMIN_OTP_LAST_SENT_KEY = 'yalla_admin_otp_last_sent';
const ADMIN_OTP_RESEND_COOLDOWN_MS = 60 * 1000;

const readPendingAdminOtpStage = (): PendingAdminOtpStage | null => {
  try {
    const raw = sessionStorage.getItem(ADMIN_OTP_STAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingAdminOtpStage>;
    const targetEmail = String(parsed.email || '').trim().toLowerCase();
    const createdAt = Number(parsed.createdAt);
    if (!targetEmail || !Number.isFinite(createdAt) || Date.now() - createdAt > ADMIN_OTP_STAGE_MAX_AGE_MS) {
      sessionStorage.removeItem(ADMIN_OTP_STAGE_KEY);
      return null;
    }
    return { email: targetEmail, createdAt };
  } catch {
    return null;
  }
};

const writePendingAdminOtpStage = (email: string) => {
  try {
    sessionStorage.setItem(ADMIN_OTP_STAGE_KEY, JSON.stringify({ email: email.trim().toLowerCase(), createdAt: Date.now() }));
  } catch {
    // sessionStorage can be unavailable in hardened/private browser contexts.
  }
};

const clearPendingAdminOtpStage = () => {
  try { sessionStorage.removeItem(ADMIN_OTP_STAGE_KEY); } catch { /* no-op */ }
};

const readOtpLastSentAt = () => {
  try {
    const value = Number(sessionStorage.getItem(ADMIN_OTP_LAST_SENT_KEY));
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
};

const writeOtpLastSentAt = (timestamp: number) => {
  try { sessionStorage.setItem(ADMIN_OTP_LAST_SENT_KEY, String(timestamp)); } catch { /* no-op */ }
};

const clearOtpLastSentAt = () => {
  try { sessionStorage.removeItem(ADMIN_OTP_LAST_SENT_KEY); } catch { /* no-op */ }
};

const getOtpCooldownSeconds = () => Math.max(0, Math.ceil((ADMIN_OTP_RESEND_COOLDOWN_MS - (Date.now() - readOtpLastSentAt())) / 1000));

const ADMIN_INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;
const OTP_SEND_TIMEOUT_MS = 15_000;
const ADMIN_ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'] as const;

export const AdminGuard: React.FC<AdminGuardProps> = ({ children }) => {
  const { authStatus, authUser, signOutUser } = useShop();
  // Always start at the credential screen. An OTP stage is created only after
  // the current page's password authentication succeeds.
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isResendingOtp, setIsResendingOtp] = useState(false);
  const [otpCooldownSeconds, setOtpCooldownSeconds] = useState(getOtpCooldownSeconds());
  const [loginError, setLoginError] = useState<string | null>(null);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [showStepUpModal, setShowStepUpModal] = useState(false);
  const [stepUpPassword, setStepUpPassword] = useState('');
  const [stepUpError, setStepUpError] = useState<string | null>(null);
  const [isStepUpVerifying, setIsStepUpVerifying] = useState(false);
  const resolverRef = useRef<((success: boolean) => void) | null>(null);
  const lastActivityRef = useRef(Date.now());
  const otpSendLockRef = useRef(false);

  const userId = authUser?.uid;
  const [serverStepUp, setServerStepUp] = useState<boolean | null>(null);
  // Both must hold: the local stamp keeps the UI responsive, the server record
  // is the one an attacker cannot forge from DevTools.
  const isMfaVerified = isMfaSessionValid(userId) && serverStepUp === true;

  useEffect(() => {
    const timer = window.setInterval(() => setOtpCooldownSeconds(getOtpCooldownSeconds()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (authStatus !== 'authenticated_admin' || !userId) {
      setServerStepUp(null);
      return;
    }
    adminStepUpService.hasRecentStepUp()
      .then(ok => { if (!cancelled) setServerStepUp(ok); })
      .catch(() => { if (!cancelled) setServerStepUp(false); });
    return () => { cancelled = true; };
  }, [authStatus, userId, mode]);

  const verifyAdminRole = async (uid: string) => {
    const { data, error } = await supabase.from('profiles').select('role').eq('id', uid).maybeSingle();
    if (error) throw error;
    if (data?.role !== 'admin') throw new Error('This account does not have administrator privileges.');
  };

  useEffect(() => registerMfaPromptHandler((resolve) => {
    resolverRef.current = resolve;
    setStepUpPassword('');
    setStepUpError(null);
    setShowStepUpModal(true);
  }), []);

  useEffect(() => {
    if (authStatus !== 'authenticated_admin' || !userId || !isMfaVerified) return;
    lastActivityRef.current = Date.now();
    const markActivity = () => { lastActivityRef.current = Date.now(); };
    ADMIN_ACTIVITY_EVENTS.forEach(event => window.addEventListener(event, markActivity, { passive: true }));
    const timer = window.setInterval(async () => {
      if (Date.now() - lastActivityRef.current < ADMIN_INACTIVITY_TIMEOUT_MS) return;
      window.clearInterval(timer);
      ADMIN_ACTIVITY_EVENTS.forEach(event => window.removeEventListener(event, markActivity));
      clearAdminMfaSession(userId);
      await adminStepUpService.clear();
      clearPendingAdminOtpStage();
      clearOtpLastSentAt();
      setMode('login');
      setOtp('');
      setPassword('');
      setLoginError('Your administrator session expired after 30 minutes of inactivity. Please sign in again.');
      await signOutUser();
    }, 30_000);
    return () => {
      window.clearInterval(timer);
      ADMIN_ACTIVITY_EVENTS.forEach(event => window.removeEventListener(event, markActivity));
    };
  }, [authStatus, userId, isMfaVerified, signOutUser]);

  const sendLoginOtp = async (target?: string) => {
    const targetEmail = (target || email).trim().toLowerCase();
    if (!targetEmail) throw new Error('No administrator email is available for OTP verification.');

    if (otpSendLockRef.current) {
      throw new Error('A security-code request is already in progress. Please wait.');
    }

    const cooldownSeconds = getOtpCooldownSeconds();
    if (cooldownSeconds > 0) {
      throw new Error(`Please wait ${cooldownSeconds} seconds before requesting another security code.`);
    }

    otpSendLockRef.current = true;
    writePendingAdminOtpStage(targetEmail);
    setEmail(targetEmail);
    setOtp('');
    setOtpError(null);
    setMode('otp');
    setIsSendingOtp(true);
    try {
      const result = await Promise.race([
        adminOtpClient.auth.signInWithOtp({ email: targetEmail, options: { shouldCreateUser: false } }),
        new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error('The security-code request timed out. Please try again.')), OTP_SEND_TIMEOUT_MS)),
      ]);
      if (result.error) throw result.error;
      writeOtpLastSentAt(Date.now());
      setOtpCooldownSeconds(Math.ceil(ADMIN_OTP_RESEND_COOLDOWN_MS / 1000));
    } catch (error: any) {
      const code = String(error?.code || '').toLowerCase();
      const message = String(error?.message || 'Could not send the security code. Please try again.');
      if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || message.toLowerCase().includes('rate limit')) {
        setOtpError('Supabase is temporarily rate-limiting security-code emails. Please wait before requesting another code.');
      } else {
        setOtpError(message);
      }
      throw error;
    } finally {
      otpSendLockRef.current = false;
      setIsSendingOtp(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otpSendLockRef.current || isSubmitting) return;
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) return setLoginError('Please enter your administrator email address.');
    if (!password) return setLoginError('Please enter your administrator password.');

    clearPendingAdminOtpStage();
    setIsSubmitting(true);
    setLoginError(null);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
      if (error) throw error;
      if (!data.user) throw new Error('No authenticated administrator was returned.');

      writePendingAdminOtpStage(cleanEmail);
      await verifyAdminRole(data.user.id);
      await sendLoginOtp(cleanEmail);
    } catch (err: any) {
      const message = String(err?.message || '').toLowerCase();
      // A failed role check previously left a fully authenticated non-admin
      // session in place behind the error message.
      if (message.includes('administrator privileges')) {
        clearPendingAdminOtpStage();
        await supabase.auth.signOut();
        setLoginError('This account does not have administrator privileges.');
      } else if (message.includes('invalid login credentials')) {
        clearPendingAdminOtpStage();
        setLoginError('Invalid administrator email or password.');
      } else if (message.includes('email not confirmed')) {
        clearPendingAdminOtpStage();
        setMode('verify_email_notice');
      } else if (message.includes('rate limit') || message.includes('too many')) {
        setOtpError('Supabase is temporarily rate-limiting security-code emails. Please wait before requesting another code.');
      } else if (message.includes('already in progress')) {
        setOtpError('A security-code request is already in progress. Please wait.');
      } else {
        setLoginError(err?.message || 'Administrator authentication failed.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanOtp = otp.replace(/\D/g, '');
    if (cleanOtp.length < 6 || cleanOtp.length > 10) return setOtpError('Enter the complete security code sent to your email.');
    setIsSubmitting(true);
    setOtpError(null);
    try {
      const { data, error } = await adminOtpClient.auth.verifyOtp({ email: email.trim().toLowerCase(), token: cleanOtp, type: 'email' });
      if (error) throw error;
      if (!data.user) throw new Error('OTP verification did not return an authenticated administrator.');
      await verifyAdminRole(data.user.id);
      const primarySession = await supabase.auth.getSession();
      if (!primarySession.data.session?.user?.id) {
        throw new Error('The administrator password session was lost. Please sign in again.');
      }
      if (primarySession.data.session.user.id !== data.user.id) {
        throw new Error('The verification code does not belong to the signed-in administrator.');
      }

      // The server records the step-up from the OTP session's own JWT. The
      // sessionStorage stamp below is only a UI convenience; the database
      // record is what actually gates destructive administrator operations.
      try {
        await adminStepUpService.recordFromOtpSession();
      } catch (stepUpError: any) {
        throw new Error(
          'Your identity could not be verified with the server. Please request a new code and try again.'
          + (stepUpError?.message ? ` (${stepUpError.message})` : ''),
        );
      }

      setAdminMfaSession(data.user.id);
      setServerStepUp(true);
      clearPendingAdminOtpStage();
      clearOtpLastSentAt();
      setOtp('');
      setPassword('');
      setMode('login');
    } catch (err: any) {
      const message = String(err?.message || '').toLowerCase();
      setOtpError(message.includes('expired') || message.includes('invalid') || message.includes('otp')
        ? 'Invalid or expired verification code. Please request a new code and try again.'
        : (err?.message || 'OTP verification failed.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const resendLoginOtp = async () => {
    if (isResendingOtp || isSendingOtp || otpCooldownSeconds > 0) return;
    setIsResendingOtp(true);
    setOtpError(null);
    try { await sendLoginOtp(); }
    catch (err: any) {
      const message = String(err?.message || 'Could not send a new verification code. Please wait before requesting another code.');
      setOtpError(message);
    }
    finally { setIsResendingOtp(false); }
  };

  const handleStepUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authUser?.email) return setStepUpError('No active administrator session.');
    if (!stepUpPassword) return setStepUpError('Please enter your administrator password.');
    setIsStepUpVerifying(true);
    setStepUpError(null);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: authUser.email, password: stepUpPassword });
      if (error) throw error;
      if (!data.user) throw new Error('Re-authentication failed.');
      await verifyAdminRole(data.user.id);
      setAdminMfaSession(data.user.id);
      lastActivityRef.current = Date.now();
      setShowStepUpModal(false);
      resolverRef.current?.(true);
      resolverRef.current = null;
    } catch (err: any) {
      setStepUpError(err?.message?.toLowerCase().includes('invalid login credentials') ? 'Incorrect administrator password.' : (err?.message || 'Step-up verification failed.'));
    } finally { setIsStepUpVerifying(false); }
  };

  const cancelStepUp = () => {
    setShowStepUpModal(false);
    resolverRef.current?.(false);
    resolverRef.current = null;
  };

  if (mode === 'otp') return (
    <div className="min-h-screen bg-[#F7F7F8] flex items-center justify-center p-4">
      <div className="bg-white border border-[#E5E5E5] p-8 rounded-3xl max-w-sm w-full space-y-7 shadow-[0_12px_32px_-12px_rgba(184,151,83,0.18)]">
        <div className="text-center space-y-3">
          <div className="mx-auto w-16 h-16 rounded-[22px] gold-gradient-bg flex items-center justify-center text-white"><ShieldAlert className="w-7 h-7" /></div>
          <h1 className="text-2xl font-bold">Verify Your Identity</h1>
          <p className="text-sm text-[#666666]">Enter the security code sent to your administrator email.</p>
          <p className="px-3 py-2 bg-[#F3E5AB] rounded-xl font-mono text-xs text-[#8F7137] break-all">{email}</p>
        </div>
        {isSendingOtp && <div className="p-3 rounded-xl bg-[#F7F7F8] border border-[#E5E5E5] text-sm text-[#666666] flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Sending security code…</div>}
        <form onSubmit={handleVerifyOtp} className="space-y-4">
          <label htmlFor="admin-otp" className="block text-sm font-semibold text-[#333333]">Security code</label>
          <input id="admin-otp" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={10} value={otp} disabled={isSendingOtp} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="Enter security code" className="w-full bg-[#F7F7F8] border border-[#E5E5E5] rounded-xl px-4 py-4 text-center text-2xl tracking-[0.25em] font-mono" autoFocus={!isSendingOtp} />
          {otpError && <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-[#C62828] flex gap-2"><AlertCircle className="w-4 h-4 shrink-0" />{otpError}</div>}
          <button disabled={isSubmitting || isSendingOtp || otp.length < 6} className="gold-btn w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50">{isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Verify & Continue <ArrowRight className="w-4 h-4" /></>}</button>
        </form>
        <div className="space-y-3 text-center">
          <button onClick={resendLoginOtp} disabled={isResendingOtp || isSendingOtp || otpCooldownSeconds > 0} className="text-sm text-[#8F7137] font-semibold disabled:opacity-50">
            {isResendingOtp ? 'Sending new code…' : otpCooldownSeconds > 0 ? `Resend security code (${otpCooldownSeconds}s)` : 'Resend security code'}
          </button>
          <button onClick={async () => { clearPendingAdminOtpStage(); clearOtpLastSentAt(); clearAdminMfaSession(userId); await adminStepUpService.clear(); await supabase.auth.signOut(); setOtp(''); setPassword(''); setMode('login'); }} className="block w-full text-sm text-[#666666]">Cancel and Sign Out</button>
        </div>
      </div>
    </div>
  );

  if (mode === 'verify_email_notice') return (
    <div className="min-h-screen bg-[#F7F7F8] flex items-center justify-center p-4">
      <div className="bg-white border border-[#E5E5E5] p-8 rounded-3xl max-w-md w-full text-center space-y-5">
        <Mail className="mx-auto w-10 h-10 text-[#B89753]" />
        <h1 className="text-xl font-bold">Email Verification Required</h1>
        <p className="text-sm text-[#666666]">Verify your administrator email before accessing the console.</p>
        <button onClick={async () => { const { data, error } = await supabase.auth.getUser(); if (error) return setLoginError(error.message); if (!data.user?.email_confirmed_at) return setLoginError('Email is still unverified. Please check your inbox.'); await verifyAdminRole(data.user.id); await sendLoginOtp(data.user.email || email); }} className="gold-btn w-full py-3 rounded-xl font-bold">I verified my email — continue</button>
        {loginError && <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-[#C62828]">{loginError}</div>}
        <button onClick={async () => { clearPendingAdminOtpStage(); clearOtpLastSentAt(); clearAdminMfaSession(userId); await adminStepUpService.clear(); await supabase.auth.signOut(); setMode('login'); }} className="text-sm text-[#666666]">Back to login</button>
      </div>
    </div>
  );

  if (authStatus === 'loading') return (
    <div className="min-h-screen flex items-center justify-center bg-[#F7F7F8]"><Loader2 className="w-6 h-6 animate-spin text-[#B89753]" /></div>
  );

  if (authStatus === 'authenticated_admin' && isMfaVerified) return <>{children}</>;

  return (
    <div className="min-h-screen bg-[#F7F7F8] flex items-center justify-center p-4">
      <div className="bg-white border border-[#E5E5E5] p-8 rounded-3xl max-w-md w-full space-y-7 shadow-[0_12px_32px_-12px_rgba(184,151,83,0.18)]">
        <div className="text-center space-y-3"><div className="mx-auto w-16 h-16 rounded-[22px] gold-gradient-bg flex items-center justify-center text-white"><Lock className="w-7 h-7" /></div><h1 className="text-2xl font-bold">Administrator Access</h1><p className="text-sm text-[#666666]">Enter your administrator credentials to continue.</p></div>
        <form onSubmit={handleSignIn} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="admin-email" className="block text-sm font-semibold text-[#333333]">Email</label>
            <input id="admin-email" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" placeholder="Enter administrator email" disabled={isSubmitting} className="w-full bg-[#F7F7F8] border border-[#E5E5E5] rounded-xl px-4 py-3 outline-none focus:border-[#B89753]" />
          </div>
          <div className="space-y-2">
            <label htmlFor="admin-password" className="block text-sm font-semibold text-[#333333]">Password</label>
            <div className="relative"><input id="admin-password" type={isPasswordVisible ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" placeholder="Enter administrator password" disabled={isSubmitting} className="w-full bg-[#F7F7F8] border border-[#E5E5E5] rounded-xl px-4 py-3 pr-12 outline-none focus:border-[#B89753]" /><button type="button" aria-label={isPasswordVisible ? 'Hide password' : 'Show password'} onClick={() => setIsPasswordVisible(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#666666]">{isPasswordVisible ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}</button></div>
          </div>
          {loginError && <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-[#C62828] flex gap-2"><AlertCircle className="w-4 h-4 shrink-0" />{loginError}</div>}
          <button disabled={isSubmitting} className="gold-btn w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50">{isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Continue <ArrowRight className="w-4 h-4" /></>}</button>
        </form>
      </div>
    </div>
  );
};
