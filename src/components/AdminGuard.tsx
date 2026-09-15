import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  RefreshCw,
  ShieldAlert,
  X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useShop } from '../context/ShopContext';
import {
  clearAdminMfaSession,
  isMfaSessionValid,
  registerMfaPromptHandler,
  setAdminMfaSession,
} from '../utils/adminMfa';

interface AdminGuardProps {
  children: React.ReactNode;
}

type AuthMode = 'login' | 'otp' | 'verify_email_notice';

const ADMIN_INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;
const ADMIN_ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'] as const;

/**
 * Always return the origin currently serving the application.
 * This avoids hard-coding the production Netlify hostname, which breaks
 * authentication redirects on deploy previews, branch deploys, localhost,
 * and any future custom domain.
 */
const getAdminRedirectUrl = () => {
  if (typeof window === 'undefined') return '/admin';
  return `${window.location.origin}/admin`;
};

export const AdminGuard: React.FC<AdminGuardProps> = ({ children }) => {
  const { authStatus, authUser, signOutUser } = useShop();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [isResendingOtp, setIsResendingOtp] = useState(false);
  const [emailVerifSent, setEmailVerifSent] = useState(false);
  const [isSendingVerifEmail, setIsSendingVerifEmail] = useState(false);
  const [showStepUpModal, setShowStepUpModal] = useState(false);
  const [stepUpPassword, setStepUpPassword] = useState('');
  const [stepUpError, setStepUpError] = useState<string | null>(null);
  const [isStepUpVerifying, setIsStepUpVerifying] = useState(false);
  const resolverRef = useRef<((success: boolean) => void) | null>(null);
  const lastActivityRef = useRef(Date.now());

  const userId = authUser?.uid;
  const isMfaVerified = isMfaSessionValid(userId);

  const verifyAdminRole = async (uid: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', uid)
      .maybeSingle();

    if (error) throw error;
    if (data?.role !== 'admin') {
      throw new Error('This account does not have administrator privileges.');
    }
  };

  useEffect(() => {
    return registerMfaPromptHandler((resolve) => {
      resolverRef.current = resolve;
      setStepUpPassword('');
      setStepUpError(null);
      setShowStepUpModal(true);
    });
  }, []);

  // Free-tier replacement for Supabase's paid inactivity timeout:
  // after successful admin OTP verification, 30 minutes without activity
  // signs the admin out and clears the client-side step-up state.
  useEffect(() => {
    if (authStatus !== 'authenticated_admin' || !userId || !isMfaVerified) return;

    lastActivityRef.current = Date.now();
    const markActivity = () => {
      lastActivityRef.current = Date.now();
    };

    ADMIN_ACTIVITY_EVENTS.forEach((event) => {
      window.addEventListener(event, markActivity, { passive: true });
    });

    const timer = window.setInterval(async () => {
      if (Date.now() - lastActivityRef.current < ADMIN_INACTIVITY_TIMEOUT_MS) return;

      window.clearInterval(timer);
      ADMIN_ACTIVITY_EVENTS.forEach((event) => {
        window.removeEventListener(event, markActivity);
      });

      clearAdminMfaSession(userId);
      setMode('login');
      setOtp('');
      setPassword('');
      setLoginError('Your administrator session expired after 30 minutes of inactivity. Please sign in again.');
      await signOutUser();
    }, 30_000);

    return () => {
      window.clearInterval(timer);
      ADMIN_ACTIVITY_EVENTS.forEach((event) => {
        window.removeEventListener(event, markActivity);
      });
    };
  }, [authStatus, userId, isMfaVerified, signOutUser]);

  const sendLoginOtp = async () => {
    const targetEmail = email.trim().toLowerCase();
    if (!targetEmail) throw new Error('No administrator email is available for OTP verification.');

    // Standard Supabase email OTP. This is intentionally separate from
    // password re-authentication so the administrator receives a normal
    // sign-in verification code by email.
    const { error } = await supabase.auth.signInWithOtp({
      email: targetEmail,
      options: { shouldCreateUser: false },
    });
    if (error) throw error;

    setEmail(targetEmail);
    setOtp('');
    setOtpError(null);
    setMode('otp');
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      setLoginError('Please enter your administrator email address.');
      return;
    }

    if (!password) {
      setLoginError('Please enter your administrator password.');
      return;
    }

    setIsSubmitting(true);
    setLoginError(null);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (error) throw error;
      if (!data.user) throw new Error('No authenticated administrator was returned.');

      await verifyAdminRole(data.user.id);
      setEmail(cleanEmail);
      await sendLoginOtp();
    } catch (err: any) {
      const message = String(err?.message || '').toLowerCase();
      if (message.includes('invalid login credentials')) {
        setLoginError('Invalid administrator email or password.');
      } else if (message.includes('email not confirmed')) {
        setMode('verify_email_notice');
      } else if (message.includes('rate limit') || message.includes('too many')) {
        setLoginError('Too many authentication attempts. Please wait and try again.');
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

    if (cleanOtp.length < 6 || cleanOtp.length > 10) {
      setOtpError('Enter the complete security code sent to your email.');
      return;
    }

    setIsSubmitting(true);
    setOtpError(null);

    try {
      const targetEmail = email.trim().toLowerCase();
      const { data, error } = await supabase.auth.verifyOtp({
        email: targetEmail,
        token: cleanOtp,
        type: 'email',
      });

      if (error) throw error;
      if (!data.user) throw new Error('OTP verification did not return an authenticated administrator.');

      await verifyAdminRole(data.user.id);
      setAdminMfaSession(data.user.id);
      setOtp('');
      setPassword('');
      setMode('login');
    } catch (err: any) {
      const message = String(err?.message || '').toLowerCase();
      if (message.includes('expired') || message.includes('invalid') || message.includes('otp')) {
        setOtpError('Invalid or expired verification code. Please request a new code and try again.');
      } else {
        setOtpError(err?.message || 'OTP verification failed.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const resendLoginOtp = async () => {
    setIsResendingOtp(true);
    setOtpError(null);
    try {
      await sendLoginOtp();
    } catch (err: any) {
      setOtpError(err?.message || 'Could not send a new verification code. Please wait before requesting another code.');
    } finally {
      setIsResendingOtp(false);
    }
  };

  const resendVerification = async () => {
    const target = authUser?.email;
    if (!target) return;

    setIsSendingVerifEmail(true);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: target,
        options: { emailRedirectTo: getAdminRedirectUrl() },
      });
      if (error) throw error;
      setEmailVerifSent(true);
    } catch (err: any) {
      setLoginError(err?.message || 'Could not send the verification email.');
    } finally {
      setIsSendingVerifEmail(false);
    }
  };

  const checkVerification = async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error) return setLoginError(error.message);
    if (!data.user) return setLoginError('No active administrator session.');
    if (!data.user.email_confirmed_at) {
      return setLoginError('Email is still unverified. Please check your inbox.');
    }

    await verifyAdminRole(data.user.id);
    setEmail(data.user.email || '');
    await sendLoginOtp();
  };

  const handleStepUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authUser?.email) return setStepUpError('No active administrator session.');
    if (!stepUpPassword) return setStepUpError('Please enter your administrator password.');

    setIsStepUpVerifying(true);
    setStepUpError(null);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: authUser.email,
        password: stepUpPassword,
      });
      if (error) throw error;
      if (!data.user) throw new Error('Re-authentication failed.');

      await verifyAdminRole(data.user.id);
      setAdminMfaSession(data.user.id);
      lastActivityRef.current = Date.now();
      setShowStepUpModal(false);
      resolverRef.current?.(true);
      resolverRef.current = null;
    } catch (err: any) {
      setStepUpError(
        err?.message?.toLowerCase().includes('invalid login credentials')
          ? 'Incorrect administrator password.'
          : err?.message || 'Step-up verification failed.'
      );
    } finally {
      setIsStepUpVerifying(false);
    }
  };

  const cancelStepUp = () => {
    setShowStepUpModal(false);
    resolverRef.current?.(false);
    resolverRef.current = null;
  };

  if (authStatus === 'loading' || isSubmitting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F7F8] text-[#111111]">
        <Loader2 className="w-6 h-6 animate-spin text-[#B89753]" />
      </div>
    );
  }

  if (mode === 'otp') {
    return (
      <div className="min-h-screen bg-[#F7F7F8] text-[#111111] flex items-center justify-center p-4">
        <div className="bg-white text-[#111111] border border-[#E5E5E5] p-8 rounded-3xl max-w-sm w-full space-y-7 shadow-[0_12px_32px_-12px_rgba(184,151,83,0.18)]">
          <div className="text-center space-y-3">
            <div className="mx-auto w-16 h-16 rounded-[22px] gold-gradient-bg flex items-center justify-center text-white">
              <ShieldAlert className="w-7 h-7" />
            </div>
            <h1 className="text-2xl font-bold text-[#111111]">Verify Your Identity</h1>
            <p className="text-sm text-[#666666]">Enter the security code sent to your administrator email.</p>
            <p className="px-3 py-2 bg-[#F3E5AB] rounded-xl font-mono text-xs text-[#8F7137] break-all">{email}</p>
          </div>

          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={10}
              value={otp}
              onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="Enter security code"
              className="w-full bg-[#F7F7F8] border border-[#E5E5E5] text-[#111111] placeholder:text-[#666666] rounded-xl px-4 py-4 text-center text-2xl tracking-[0.25em] font-mono"
              autoFocus
            />

            {otpError && (
              <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-[#C62828] flex gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {otpError}
              </div>
            )}

            <button
              disabled={isSubmitting || otp.length < 6 || otp.length > 10}
              className="gold-btn w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:transform-none"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Verify & Continue <ArrowRight className="w-4 h-4" /></>}
            </button>
          </form>

          <div className="space-y-3 text-center">
            <button
              onClick={resendLoginOtp}
              disabled={isResendingOtp}
              className="text-sm text-[#8F7137] hover:text-[#B89753] font-semibold disabled:opacity-50"
            >
              {isResendingOtp ? 'Sending new code…' : 'Resend security code'}
            </button>
            <button
              onClick={async () => {
                clearAdminMfaSession(userId);
                await supabase.auth.signOut();
                setOtp('');
                setPassword('');
                setMode('login');
              }}
              className="block w-full text-sm text-[#666666] hover:text-[#111111]"
            >
              Cancel and Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'verify_email_notice') {
    return (
      <div className="min-h-screen bg-[#F7F7F8] text-[#111111] flex items-center justify-center p-4">
        <div className="bg-white text-[#111111] border border-[#E5E5E5] p-8 rounded-3xl max-w-md w-full text-center space-y-5 shadow-[0_12px_32px_-12px_rgba(184,151,83,0.18)]">
          <Mail className="mx-auto w-10 h-10 text-[#B89753]" />
          <h1 className="text-xl font-bold text-[#111111]">Email Verification Required</h1>
          <p className="text-sm text-[#666666]">Verify your administrator email before accessing the console.</p>
          {emailVerifSent && (
            <p className="text-sm text-[#16803C] flex items-center justify-center gap-2">
              <CheckCircle2 className="w-4 h-4" /> Verification email sent.
            </p>
          )}
          <button
            onClick={resendVerification}
            disabled={isSendingVerifEmail}
            className="gold-btn w-full py-3 rounded-xl font-bold disabled:opacity-50"
          >
            Send Verification Email
          </button>
          <button
            onClick={checkVerification}
            className="gold-btn w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-4 h-4" /> Check Again
          </button>
        </div>
      </div>
    );
  }

  if (authStatus !== 'authenticated_admin' || !isMfaVerified) {
    return (
      <div className="min-h-screen bg-[#F7F7F8] text-[#111111] flex items-center justify-center p-4">
        <div className="bg-white border border-[#E5E5E5] p-8 rounded-3xl max-w-sm w-full space-y-6 shadow-[0_12px_32px_-12px_rgba(184,151,83,0.18)]">
          <div className="text-center space-y-3">
            <div className="mx-auto w-16 h-16 rounded-[22px] gold-gradient-bg flex items-center justify-center text-white">
              <Lock className="w-7 h-7" />
            </div>
            <h1 className="text-2xl font-bold">Administrator Access</h1>
            <p className="text-sm text-[#666666]">Sign in with your administrator account, then verify the email OTP.</p>
          </div>

          <form onSubmit={handleSignIn} className="space-y-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-[#666666]">Administrator email</span>
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-[#F7F7F8] border border-[#E5E5E5] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#B89753]"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-[#666666]">Password</span>
              <div className="relative">
                <input
                  type={isPasswordVisible ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full bg-[#F7F7F8] border border-[#E5E5E5] rounded-xl px-4 py-3 pr-11 text-sm outline-none focus:border-[#B89753]"
                />
                <button
                  type="button"
                  onClick={() => setIsPasswordVisible(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#666666]"
                  aria-label={isPasswordVisible ? 'Hide password' : 'Show password'}
                >
                  {isPasswordVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </label>

            {loginError && (
              <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-[#C62828] flex gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {loginError}
              </div>
            )}

            <button disabled={isSubmitting} className="gold-btn w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50">
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Continue <ArrowRight className="w-4 h-4" /></>}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <>
      {children}
      {showStepUpModal && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4">
          <form onSubmit={handleStepUp} className="bg-white rounded-3xl p-7 w-full max-w-sm space-y-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold">Confirm administrator identity</h2>
                <p className="text-xs text-[#666666] mt-1">Enter your password to continue this sensitive action.</p>
              </div>
              <button type="button" onClick={cancelStepUp} aria-label="Close" className="text-[#666666]"><X className="w-5 h-5" /></button>
            </div>
            <input
              type="password"
              autoComplete="current-password"
              autoFocus
              value={stepUpPassword}
              onChange={e => setStepUpPassword(e.target.value)}
              className="w-full bg-[#F7F7F8] border border-[#E5E5E5] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#B89753]"
              placeholder="Administrator password"
            />
            {stepUpError && <p className="text-xs text-[#C62828]">{stepUpError}</p>}
            <div className="flex gap-3">
              <button type="button" onClick={cancelStepUp} className="flex-1 py-3 rounded-xl border border-[#E5E5E5] font-semibold">Cancel</button>
              <button disabled={isStepUpVerifying} className="gold-btn flex-1 py-3 rounded-xl font-bold disabled:opacity-50">
                {isStepUpVerifying ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Verify'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
};
