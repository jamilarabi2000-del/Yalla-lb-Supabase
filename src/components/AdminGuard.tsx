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
  isMfaSessionValid,
  registerMfaPromptHandler,
  setAdminMfaSession,
} from '../utils/adminMfa';

interface AdminGuardProps {
  children: React.ReactNode;
}

type AuthMode = 'login' | 'otp' | 'verify_email_notice';

const ADMIN_REDIRECT_URL = 'https://yalla-lb-supabase.netlify.app/admin';

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

  const sendLoginOtp = async () => {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    if (!userData.user?.email) throw new Error('No administrator email is available for OTP verification.');

    const { error } = await supabase.auth.reauthenticate();
    if (error) throw error;

    setEmail(userData.user.email);
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

    if (cleanOtp.length !== 6) {
      setOtpError('Enter the 6-digit verification code sent to your email.');
      return;
    }

    setIsSubmitting(true);
    setOtpError(null);

    try {
      const targetEmail = email.trim().toLowerCase();
      const { data, error } = await supabase.auth.verifyOtp({
        email: targetEmail,
        token: cleanOtp,
        type: 'reauthentication',
      });

      if (error) throw error;
      if (!data.user) throw new Error('OTP verification did not return an authenticated administrator.');

      await verifyAdminRole(data.user.id);
      setAdminMfaSession(data.user.id);
      setOtp('');
      setMode('login');
    } catch (err: any) {
      const message = String(err?.message || '').toLowerCase();
      if (message.includes('reauthentication') || message.includes('invalid') || message.includes('code')) {
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
      setOtpError(err?.message || 'Could not send a new verification code.');
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
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (mode === 'otp') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white border border-slate-200 p-8 rounded-3xl max-w-sm w-full space-y-7 shadow-sm">
          <div className="text-center space-y-3">
            <div className="mx-auto w-16 h-16 rounded-[22px] bg-indigo-600 flex items-center justify-center text-white">
              <ShieldAlert className="w-7 h-7" />
            </div>
            <h1 className="text-2xl font-bold">Verify Your Identity</h1>
            <p className="text-sm text-slate-600">A 6-digit security code was sent to your administrator email.</p>
            <p className="px-3 py-2 bg-indigo-50 rounded-xl font-mono text-xs text-indigo-700 break-all">{email}</p>
          </div>

          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={otp}
              onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="Enter 6-digit code"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-4 text-center text-2xl tracking-[0.4em] font-mono"
              autoFocus
            />

            {otpError && (
              <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-xs text-rose-700 flex gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {otpError}
              </div>
            )}

            <button
              disabled={isSubmitting || otp.length !== 6}
              className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Verify & Continue <ArrowRight className="w-4 h-4" /></>}
            </button>
          </form>

          <div className="space-y-3 text-center">
            <button
              onClick={resendLoginOtp}
              disabled={isResendingOtp}
              className="text-sm text-indigo-600 font-semibold disabled:opacity-50"
            >
              {isResendingOtp ? 'Sending new code…' : 'Resend security code'}
            </button>
            <button
              onClick={async () => {
                await supabase.auth.signOut();
                setOtp('');
                setMode('login');
              }}
              className="block w-full text-sm text-slate-500"
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
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white border border-slate-200 p-8 rounded-3xl max-w-md w-full text-center space-y-5 shadow-sm">
          <Mail className="mx-auto w-10 h-10 text-amber-600" />
          <h1 className="text-xl font-bold">Email Verification Required</h1>
          <p className="text-sm text-slate-600">Verify your administrator email before accessing the console.</p>
          {emailVerifSent && (
            <p className="text-sm text-emerald-700 flex items-center justify-center gap-2">
              <CheckCircle2 className="w-4 h-4" /> Verification email sent.
            </p>
          )}
          <button
            onClick={resendVerification}
            disabled={isSendingVerifEmail}
            className="w-full py-3 bg-amber-600 text-white rounded-xl font-bold disabled:opacity-50"
          >
            Send Verification Email
          </button>
          <button
            onClick={checkVerification}
            className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-4 h-4" /> Check Again
          </button>
          <button onClick={signOutUser} className="text-sm text-slate-500">Sign Out</button>
        </div>
      </div>
    );
  }

  if (authStatus === 'unauthenticated' || !authUser) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white border border-slate-200 p-8 rounded-3xl max-w-sm w-full space-y-7 shadow-sm">
          <div className="text-center space-y-3">
            <div className="mx-auto w-16 h-16 rounded-[22px] bg-slate-900 flex items-center justify-center text-white">
              <Lock className="w-7 h-7" />
            </div>
            <h1 className="text-2xl font-bold">Admin Console</h1>
            <p className="text-xs text-slate-500">Sign in with your administrator credentials</p>
          </div>

          <form onSubmit={handleSignIn} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-2">Administrator Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="Enter administrator email"
                autoComplete="username"
                required
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-2">Password</label>
              <div className="relative">
                <input
                  type={isPasswordVisible ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter administrator password"
                  autoComplete="current-password"
                  required
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 pr-12"
                />
                <button
                  type="button"
                  onClick={() => setIsPasswordVisible(value => !value)}
                  aria-label={isPasswordVisible ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 px-4 text-slate-500 hover:text-slate-800"
                >
                  {isPasswordVisible ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {loginError && (
              <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-xs text-rose-700 flex gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {loginError}
              </div>
            )}

            <button
              disabled={isSubmitting}
              className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Sign In <ArrowRight className="w-4 h-4" /></>}
            </button>
          </form>

          <div className="flex items-center gap-2 text-[11px] text-slate-500 justify-center">
            <ShieldAlert className="w-3.5 h-3.5" />
            Password + email OTP verification required
          </div>
        </div>
      </div>
    );
  }

  if (authStatus === 'authenticated_non_admin') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <AlertCircle className="mx-auto w-10 h-10 text-rose-600" />
          <h1 className="text-xl font-bold">Access Unavailable</h1>
          <p className="text-sm text-slate-500">This account does not have administrator privileges.</p>
          <button onClick={signOutUser} className="px-5 py-3 bg-slate-900 text-white rounded-xl font-bold">Sign Out</button>
        </div>
      </div>
    );
  }

  if (authStatus === 'authenticated_admin' && !authUser.emailVerified) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <Mail className="mx-auto w-10 h-10 text-amber-600" />
          <h1 className="text-xl font-bold">Email Verification Required</h1>
          <button onClick={resendVerification} className="px-5 py-3 bg-amber-600 text-white rounded-xl font-bold">Send Verification Email</button>
        </div>
      </div>
    );
  }

  return (
    <>
      {children}
      {showStepUpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white p-7 rounded-3xl max-w-sm w-full space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ShieldAlert className="w-6 h-6 text-amber-600" />
                <div>
                  <h2 className="font-bold">Confirm Security Action</h2>
                  <p className="text-xs text-slate-500">Administrator re-authentication</p>
                </div>
              </div>
              <button onClick={cancelStepUp}><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-slate-600">Re-enter your administrator password to continue.</p>
            <form onSubmit={handleStepUp} className="space-y-4">
              {stepUpError && <div className="p-3 bg-rose-50 rounded-xl text-xs text-rose-700">{stepUpError}</div>}
              <input
                type="password"
                value={stepUpPassword}
                onChange={e => setStepUpPassword(e.target.value)}
                placeholder="Administrator password"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl"
                autoFocus
              />
              <div className="flex gap-2">
                <button type="button" onClick={cancelStepUp} className="flex-1 py-3 border rounded-xl font-semibold">Cancel</button>
                <button disabled={isStepUpVerifying} className="flex-1 py-3 bg-amber-600 text-white rounded-xl font-semibold">
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
