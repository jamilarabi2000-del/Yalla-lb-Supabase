import React, { useState, useEffect, useRef } from 'react';
import { useShop } from '../context/ShopContext';
import { Lock, AlertCircle, Loader2, KeyRound, ShieldAlert, X, Mail, CheckCircle2, RefreshCw, ArrowRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  functionsInstance,
  httpsCallable,
} from '../firebase';
import {
  isMfaSessionValid,
  setAdminMfaSession,
  clearAdminMfaSession,
  registerMfaPromptHandler,
} from '../utils/adminMfa';

interface AdminGuardProps {
  children: React.ReactNode;
}

type AuthMode = 'login' | 'email_link_sent' | 'verify_email_notice';

const EMAIL_LINK_KEY = 'yallalb_admin_email_for_signin';

export const AdminGuard: React.FC<AdminGuardProps> = ({ children }) => {
  const { authStatus, firebaseUser, signOutUser } = useShop();
  const [mode, setMode] = useState<AuthMode>('login');
  const [loginMethod, setLoginMethod] = useState<'password' | 'email_link'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Unverified Email Notice State
  const [emailVerifSent, setEmailVerifSent] = useState(false);
  const [isSendingVerifEmail, setIsSendingVerifEmail] = useState(false);

  // High-Risk Step-Up Modal State (Re-Authentication)
  const [showStepUpModal, setShowStepUpModal] = useState(false);
  const [stepUpPassword, setStepUpPassword] = useState('');
  const [stepUpError, setStepUpError] = useState<string | null>(null);
  const [isStepUpVerifying, setIsStepUpVerifying] = useState(false);
  const stepUpResolverRef = useRef<((success: boolean) => void) | null>(null);

  const [isMfaVerified, setIsMfaVerified] = useState<boolean>(() => isMfaSessionValid(firebaseUser?.uid));

  // Handle Email Link Sign-In Completion on mount
  useEffect(() => {
    const handleEmailLinkCompletion = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (data.session?.user) {
          const user = data.session.user;
          // Check admin profile role
          const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .maybeSingle();

          const isUserAdmin = profile?.role === 'admin';

          if (!isUserAdmin) {
            setLoginError('This account does not have administrator privileges.');
            await supabase.auth.signOut();
            setIsSubmitting(false);
            return;
          }

          setAdminMfaSession(user.id);
          setIsMfaVerified(true);
          setMode('login');
        }
      } catch (err: any) {
        console.error('[AdminGuard Email Link Error]:', err);
        setLoginError(err?.message || 'Failed to complete email link authentication.');
      } finally {
        setIsSubmitting(false);
      }
    };

    handleEmailLinkCompletion();
  }, []);

  // Sync session state when user changes
  useEffect(() => {
    if (firebaseUser?.uid) {
      setIsMfaVerified(isMfaSessionValid(firebaseUser.uid));
    } else {
      setIsMfaVerified(false);
    }
  }, [firebaseUser?.uid]);

  // High-Risk Step-Up Listener
  useEffect(() => {
    const unregister = registerMfaPromptHandler(async (resolve) => {
      stepUpResolverRef.current = resolve;
      setShowStepUpModal(true);
      setStepUpPassword('');
      setStepUpError(null);
    });
    return () => unregister();
  }, []);

  const handleStepUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stepUpPassword.trim()) {
      setStepUpError('Please enter your administrator password to confirm.');
      return;
    }
    const currentEmail = firebaseUser?.email;
    if (!firebaseUser || !currentEmail) {
      setStepUpError('No active administrator session.');
      return;
    }

    setIsStepUpVerifying(true);
    setStepUpError(null);
    try {
      // Re-authenticate natively with Supabase Password Sign-in
      const { data, error } = await supabase.auth.signInWithPassword({
        email: currentEmail,
        password: stepUpPassword,
      });

      if (error) throw error;

      // Record authoritative step-up on server if available
      try {
        const recordStepUpFn = httpsCallable<void, { success: boolean }>(
          functionsInstance,
          'recordAdminStepUp'
        );
        await recordStepUpFn();
      } catch (err) {
        console.warn('[AdminGuard] Step-up record notice:', err);
      }

      setAdminMfaSession(firebaseUser.uid);
      setIsMfaVerified(true);
      setShowStepUpModal(false);

      if (stepUpResolverRef.current) {
        stepUpResolverRef.current(true);
        stepUpResolverRef.current = null;
      }
    } catch (err: any) {
      console.warn('Step-up verification failed:', err?.message || err);
      if (
        err.message?.toLowerCase().includes('invalid login credentials') ||
        err.code === 'auth/wrong-password' ||
        err.code === 'auth/invalid-credential'
      ) {
        setStepUpError('Incorrect administrator password.');
      } else {
        setStepUpError(err?.message || 'Step-up verification failed.');
      }
    } finally {
      setIsStepUpVerifying(false);
    }
  };

  // Primary Sign In Handler (Email/Password OR Supabase Email Link / OTP)
  const handlePrimarySignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setLoginError('Please enter your administrator email address.');
      return;
    }
    setIsSubmitting(true);
    setLoginError(null);

    try {
      if (loginMethod === 'email_link') {
        // Supabase Native Email Sign-In Link / OTP
        const { error } = await supabase.auth.signInWithOtp({
          email: email.trim(),
          options: {
            emailRedirectTo: `${window.location.origin}${window.location.pathname}?adminAuth=emailLink`,
          },
        });
        if (error) throw error;
        window.localStorage.setItem(EMAIL_LINK_KEY, email.trim());
        setMode('email_link_sent');
      } else {
        // Supabase Email & Password Sign-In
        if (!password) {
          setLoginError('Please enter your administrator password.');
          setIsSubmitting(false);
          return;
        }

        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) throw error;
        if (!data.user) throw new Error('No user returned from sign in.');

        // Step 1: Check admin profile role
        const { data: profile, error: profError } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', data.user.id)
          .maybeSingle();

        const isUserAdmin = profile?.role === 'admin';

        if (!isUserAdmin) {
          setLoginError('This account does not have administrator privileges.');
          await supabase.auth.signOut();
          setIsSubmitting(false);
          return;
        }

        // Step 2: Ensure administrator email is confirmed
        const isEmailVerified = Boolean(data.user.email_confirmed_at || data.user.confirmed_at);
        if (!isEmailVerified) {
          setMode('verify_email_notice');
          setIsSubmitting(false);
          return;
        }

        // Step 3: Record server-authoritative step-up
        try {
          const recordStepUpFn = httpsCallable<void, { success: boolean }>(
            functionsInstance,
            'recordAdminStepUp'
          );
          await recordStepUpFn();
        } catch (err) {
          console.warn('[AdminGuard] Step-up record notice:', err);
        }

        setAdminMfaSession(data.user.id);
        setIsMfaVerified(true);
      }
    } catch (err: any) {
      console.error('[Admin Sign-In Error]:', err);
      if (
        err.message?.toLowerCase().includes('invalid login credentials') ||
        err.code === 'auth/invalid-credential' ||
        err.code === 'auth/user-not-found' ||
        err.code === 'auth/wrong-password'
      ) {
        setLoginError('Invalid administrator email or password.');
      } else if (err.code === 'auth/too-many-requests') {
        setLoginError('Too many failed attempts. Please wait a moment before trying again.');
      } else {
        setLoginError(err.message || 'An unexpected authentication error occurred.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendVerificationEmail = async () => {
    if (!firebaseUser?.email) return;
    setIsSendingVerifEmail(true);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: firebaseUser.email,
        options: {
          emailRedirectTo: `${window.location.origin}/admin?verified=true`,
        }
      });
      if (error) throw error;
      setEmailVerifSent(true);
    } catch (err: any) {
      console.error('Failed to send verification email via Supabase:', err);
    } finally {
      setIsSendingVerifEmail(false);
    }
  };

  // Render: Loading state
  if (authStatus === 'loading') {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-white">
        <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl max-w-sm w-full space-y-6 shadow-2xl text-center">
          <div className="mx-auto w-16 h-16 rounded-[22px] bg-indigo-600 flex items-center justify-center text-white font-black text-2xl shadow-lg shadow-indigo-500/30 animate-pulse">
            YL
          </div>
          <div className="space-y-2">
            <h1 className="text-lg font-bold tracking-tight">Verifying Admin Identity</h1>
            <p className="text-xs text-slate-400">
              Validating cryptographic credentials & administrator session state...
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 pt-2">
            <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
            <span className="text-xs text-indigo-400 font-mono font-medium">Authenticating...</span>
          </div>
        </div>
      </div>
    );
  }

  // Render: Firebase Native Email Link Sent Notice
  if (mode === 'email_link_sent') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white border border-slate-200 p-8 sm:p-10 rounded-3xl max-w-md w-full space-y-6 shadow-sm text-center">
          <div className="mx-auto w-16 h-16 rounded-[22px] bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
            <Mail className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-bold text-slate-900">Sign-In Link Dispatched</h1>
            <p className="text-xs text-slate-600 leading-relaxed">
              A secure, passwordless sign-in link has been sent directly from Firebase to your administrator email:
            </p>
            <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl text-xs font-mono font-semibold text-indigo-800">
              {email}
            </div>
            <p className="text-xs text-slate-500 pt-1">
              Click the link inside your email to automatically authenticate into the admin console.
            </p>
          </div>

          <div className="space-y-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setEmail('');
                setPassword('');
              }}
              className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold transition-all text-xs cursor-pointer"
            >
              Back to Sign In
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Render: Unverified Email Notice
  if (mode === 'verify_email_notice') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white border border-slate-200 p-8 sm:p-10 rounded-3xl max-w-md w-full space-y-6 shadow-sm text-center">
          <div className="mx-auto w-16 h-16 rounded-[22px] bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
            <Mail className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-bold text-slate-900">Email Verification Required</h1>
            <p className="text-xs text-slate-600 leading-relaxed">
              To protect administrative access, your administrator email address must be verified.
            </p>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs space-y-3">
            <p className="font-mono text-slate-800 font-semibold">{firebaseUser?.email}</p>
            {emailVerifSent ? (
              <div className="flex items-center justify-center gap-1.5 text-emerald-700 font-medium pt-1">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Verification email sent! Please check your inbox and click the link.</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleSendVerificationEmail}
                disabled={isSendingVerifEmail}
                className="w-full py-2.5 px-4 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-xl font-semibold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                {isSendingVerifEmail ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                <span>Send Verification Email</span>
              </button>
            )}
          </div>

          <div className="space-y-2 pt-2">
            <button
              type="button"
              onClick={async () => {
                const { data } = await supabase.auth.getUser();
                if (data.user) {
                  const isEmailVerified = Boolean(data.user.email_confirmed_at || data.user.confirmed_at);
                  if (isEmailVerified) {
                    try {
                      const recordStepUpFn = httpsCallable<void, { success: boolean }>(
                        functionsInstance,
                        'recordAdminStepUp'
                      );
                      await recordStepUpFn();
                    } catch (err) {
                      console.warn('[AdminGuard] Step-up record notice:', err);
                    }
                    setAdminMfaSession(data.user.id);
                    setIsMfaVerified(true);
                    setMode('login');
                  } else {
                    setLoginError('Email is still unverified. Please verify your email before proceeding.');
                  }
                }
              }}
              className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold transition-all text-xs cursor-pointer flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>I Have Verified My Email (Check Again)</span>
            </button>

            <button
              type="button"
              onClick={async () => {
                await signOutUser();
                setMode('login');
              }}
              className="w-full py-2 px-4 text-xs font-semibold text-slate-500 hover:text-slate-700"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Render: Unauthenticated Login Screen
  if (authStatus === 'unauthenticated' || !firebaseUser) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white border border-slate-200 p-8 sm:p-10 rounded-3xl max-w-sm w-full space-y-8 shadow-sm">
          <div className="text-center space-y-4">
            <div className="mx-auto w-16 h-16 rounded-[22px] bg-slate-900 flex items-center justify-center text-white shadow-md">
              <Lock className="w-7 h-7 text-white" />
            </div>
            <div className="space-y-1.5">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                Admin Console
              </h1>
              <p className="text-xs text-slate-500 leading-relaxed">
                Secure administrator authentication via Firebase
              </p>
            </div>
          </div>

          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setLoginMethod('password')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                loginMethod === 'password'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Password
            </button>
            <button
              type="button"
              onClick={() => setLoginMethod('email_link')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                loginMethod === 'email_link'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Email Link
            </button>
          </div>

          <form autoComplete="off" onSubmit={handlePrimarySignIn}>
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider ml-1">Admin Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-4 py-3 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium"
                  placeholder="admin@yallalb.com"
                  required
                />
              </div>

              {loginMethod === 'password' && (
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider ml-1">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-4 py-3 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium font-mono"
                    placeholder="••••••••"
                    required
                  />
                </div>
              )}

              {loginError && (
                <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-rose-600 font-medium leading-relaxed">{loginError}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3.5 px-4 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-xl font-bold shadow-md shadow-slate-200 flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Authenticating...</span>
                  </>
                ) : loginMethod === 'email_link' ? (
                  <>
                    <span>Send Firebase Sign-In Link</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                ) : (
                  <span>Sign In</span>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // Render: Authenticated Non-Admin
  if (authStatus === 'authenticated_non_admin') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white border border-slate-200 p-8 sm:p-10 rounded-3xl max-w-sm w-full space-y-8 shadow-sm text-center">
          <div className="mx-auto w-16 h-16 rounded-[22px] bg-rose-50 flex items-center justify-center text-rose-600 shadow-sm border border-rose-100">
            <AlertCircle className="w-7 h-7" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-bold text-slate-900">Access Unavailable</h1>
            <p className="text-xs text-slate-500 pt-2 leading-relaxed">
              This account does not have administrator privileges.
            </p>
          </div>

          <div className="space-y-3 pt-2">
            <button
              type="button"
              onClick={async (e) => {
                e.stopPropagation();
                window.location.reload();
              }}
              className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold transition-all cursor-pointer"
            >
              Refresh Session
            </button>
            <button
              type="button"
              onClick={async () => {
                await signOutUser();
                window.location.reload();
              }}
              className="w-full py-3 px-4 bg-white border-2 border-slate-200 hover:bg-slate-50 hover:border-slate-300 text-slate-700 rounded-xl font-bold transition-all cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Render: Authenticated admin but email is unverified
  if (authStatus === 'authenticated_admin' && firebaseUser && !firebaseUser.emailVerified) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white border border-slate-200 p-8 sm:p-10 rounded-3xl max-w-md w-full space-y-6 shadow-sm text-center">
          <div className="mx-auto w-16 h-16 rounded-[22px] bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
            <Mail className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-bold text-slate-900">Email Verification Required</h1>
            <p className="text-xs text-slate-600 leading-relaxed">
              Your administrator email must be verified before accessing the console.
            </p>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs space-y-3">
            <p className="font-mono text-slate-800 font-semibold">{firebaseUser.email}</p>
            {emailVerifSent ? (
              <div className="flex items-center justify-center gap-1.5 text-emerald-700 font-medium pt-1">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Verification email sent! Check your inbox and click the link.</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleSendVerificationEmail}
                disabled={isSendingVerifEmail}
                className="w-full py-2.5 px-4 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-xl font-semibold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                {isSendingVerifEmail ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                <span>Send Verification Email</span>
              </button>
            )}
          </div>

          <div className="space-y-2 pt-2">
            <button
              type="button"
              onClick={async () => {
                const { data } = await supabase.auth.getUser();
                if (data.user) {
                  const isEmailVerified = Boolean(data.user.email_confirmed_at || data.user.confirmed_at);
                  if (isEmailVerified) {
                    try {
                      const recordStepUpFn = httpsCallable<void, { success: boolean }>(
                        functionsInstance,
                        'recordAdminStepUp'
                      );
                      await recordStepUpFn();
                    } catch (err) {
                      console.warn('[AdminGuard] Step-up record notice:', err);
                    }
                    setAdminMfaSession(data.user.id);
                    setIsMfaVerified(true);
                  } else {
                    setLoginError('Email is still unverified.');
                  }
                }
              }}
              className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold transition-all text-xs cursor-pointer flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>I Have Verified My Email (Check Again)</span>
            </button>

            <button
              type="button"
              onClick={async () => {
                clearAdminMfaSession(firebaseUser?.uid);
                await signOutUser();
              }}
              className="w-full py-2 px-4 text-xs font-semibold text-slate-500 hover:text-slate-700"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Render: Authenticated and verified
  return (
    <>
      {children}
      {showStepUpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 p-6 sm:p-8 rounded-3xl max-w-sm w-full space-y-6 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Confirm Security Action</h2>
                  <p className="text-xs text-slate-500">Administrator re-authentication</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowStepUpModal(false);
                  if (stepUpResolverRef.current) {
                    stepUpResolverRef.current(false);
                    stepUpResolverRef.current = null;
                  }
                }}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              This high-risk action requires step-up authentication. Please enter your administrator password for <span className="font-mono font-semibold text-slate-800">{firebaseUser?.email}</span>.
            </p>

            <form autoComplete="off" onSubmit={handleStepUpSubmit} className="space-y-4">
              {stepUpError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-rose-600 text-xs shadow-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <p className="leading-snug">{stepUpError}</p>
                </div>
              )}

              <input
                type="password"
                value={stepUpPassword}
                onChange={(e) => setStepUpPassword(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-mono text-sm"
                placeholder="Admin password"
                disabled={isStepUpVerifying}
                autoFocus
              />

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowStepUpModal(false);
                    if (stepUpResolverRef.current) {
                      stepUpResolverRef.current(false);
                      stepUpResolverRef.current = null;
                    }
                  }}
                  className="flex-1 py-3 px-4 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-semibold text-sm transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isStepUpVerifying || !stepUpPassword}
                  className="flex-1 py-3 px-4 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-xl font-semibold text-sm shadow-md shadow-amber-200 flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  {isStepUpVerifying ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

