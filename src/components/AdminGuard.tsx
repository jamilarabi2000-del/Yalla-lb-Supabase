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

const ADMIN_REDIRECT_URL = 'https://yalla-lb-supabase.netlify.app/admin';
const ADMIN_INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;
const ADMIN_ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'] as const;

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

    // Standard email OTP: this is intentionally NOT reauthenticate(), because
    // reauthentication OTPs can use a different code format and purpose.
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
        options: { emailRedirectTo: ADMIN_REDIRECT_URL },
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
          <button onClick={signOutUser} className="text-sm text-[#666666] hover:text-[#111111]">Sign Out</button>
        </div>
      </div>
    );
  }

  if (authStatus === 'unauthenticated' || !authUser) {
    return (
      <div className="min-h-screen bg-[#F7F7F8] text-[#111111] flex items-center justify-center p-4">
        <div className="bg-white text-[#111111] border border-[#E5E5E5] p-8 rounded-3xl max-w-sm w-full space-y-7 shadow-[0_12px_32px_-12px_rgba(184,151,83,0.18)]">
          <div className="text-center space-y-3">
            <div className="mx-auto w-16 h-16 rounded-[22px] gold-gradient-bg flex items-center justify-center text-white">
              <Lock className="w-7 h-7" />
            </div>
            <h1 className="text-2xl font-bold text-[#111111]">Admin Console</h1>
            <p className="text-xs text-[#666666]">Sign in with your administrator credentials</p>
          </div>

          <form onSubmit={handleSignIn} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#111111] mb-2">Administrator Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="Enter administrator email"
                autoComplete="username"
                required
                className="w-full bg-[#F7F7F8] border border-[#E5E5E5] text-[#111111] placeholder:text-[#666666] rounded-xl px-4 py-3"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#111111] mb-2">Password</label>
              <div className="relative">
                <input
                  type={isPasswordVisible ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter administrator password"
                  autoComplete="current-password"
                  required
                  className="w-full bg-[#F7F7F8] border border-[#E5E5E5] text-[#111111] placeholder:text-[#666666] rounded-xl px-4 py-3 pr-12"
                />
                <button
                  type="button"
                  onClick={() => setIsPasswordVisible(value => !value)}
                  aria-label={isPasswordVisible ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 px-4 text-[#666666] hover:text-[#8F7137]"
                >
                  {isPasswordVisible ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {loginError && (
              <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-[#C62828] flex gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {loginError}
              </div>
            )}

            <button
              disabled={isSubmitting}
              className="gold-btn w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:transform-none"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Sign In <ArrowRight className="w-4 h-4" /></>}
            </button>
          </form>

          <div className="flex items-center gap-2 text-[11px] text-[#666666] justify-center">
            <ShieldAlert className="w-3.5 h-3.5 text-[#B89753]" />
            Password + email OTP verification required
          </div>
        </div>
      </div>
    );
  }

  if (authStatus === 'authenticated_non_admin') {
    return (
      <div className="min-h-screen bg-[#F7F7F8] text-[#111111] flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <AlertCircle className="mx-auto w-10 h-10 text-[#C62828]" />
          <h1 className="text-xl font-bold text-[#111111]">Access Unavailable</h1>
          <p className="text-sm text-[#666666]">This account does not have administrator privileges.</p>
          <button onClick={signOutUser} className="gold-btn px-5 py-3 rounded-xl font-bold">Sign Out</button>
        </div>
      </div>
    );
  }

  if (authStatus === 'authenticated_admin' && !authUser.emailVerified) {
    return (
      <div className="min-h-screen bg-[#F7F7F8] text-[#111111] flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <Mail className="mx-auto w-10 h-10 text-[#B89753]" />
          <h1 className="text-xl font-bold text-[#111111]">Email Verification Required</h1>
          <button onClick={resendVerification} className="gold-btn px-5 py-3 rounded-xl font-bold">Send Verification Email</button>
        </div>
      </div>
    );
  }

  return (
    <>
      {children}
      {showStepUpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#111111]/60 backdrop-blur-sm">
          <div className="bg-white text-[#111111] p-7 rounded-3xl max-w-sm w-full space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ShieldAlert className="w-6 h-6 text-[#B89753]" />
                <div>
                  <h2 className="font-bold text-[#111111]">Confirm Security Action</h2>
                  <p className="text-xs text-[#666666]">Administrator re-authentication</p>
                </div>
              </div>
              <button onClick={cancelStepUp} className="text-[#666666] hover:text-[#111111]"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-[#666666]">Re-enter your administrator password to continue.</p>
            <form onSubmit={handleStepUp} className="space-y-4">
              {stepUpError && <div className="p-3 bg-red-50 rounded-xl text-xs text-[#C62828]">{stepUpError}</div>}
              <input
                type="password"
                value={stepUpPassword}
                onChange={e => setStepUpPassword(e.target.value)}
                placeholder="Administrator password"
                className="w-full px-4 py-3 bg-[#F7F7F8] border border-[#E5E5E5] text-[#111111] placeholder:text-[#666666] rounded-xl"
                autoFocus
              />
              <div className="flex gap-2">
                <button type="button" onClick={cancelStepUp} className="flex-1 py-3 border border-[#E5E5E5] text-[#111111] rounded-xl font-semibold hover:bg-[#F7F7F8]">Cancel</button>
                <button disabled={isStepUpVerifying} className="gold-btn flex-1 py-3 rounded-xl font-semibold disabled:opacity-50">
                  {isStepUpVerifying ? <Loader2 className="mx-auto w-4 h-4 animate-spin" /> : 'Confirm'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};