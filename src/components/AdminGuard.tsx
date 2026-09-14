import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
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

type AuthMode = 'login' | 'email_link_sent' | 'verify_email_notice';

const ADMIN_REDIRECT_URL = 'https://yalla-lb-supabase.netlify.app/admin';

export const AdminGuard: React.FC<AdminGuardProps> = ({ children }) => {
  const { authStatus, authUser, signOutUser } = useShop();
  const [mode, setMode] = useState<AuthMode>('login');
  const [loginMethod, setLoginMethod] = useState<'password' | 'email_link'>('email_link');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
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

  // Supabase automatically restores the session from the Magic Link redirect.
  // React to the resulting SIGNED_IN event, then perform the authoritative
  // profile/role check before allowing the admin console to render.
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== 'SIGNED_IN' || !session?.user) return;

      void (async () => {
        setIsSubmitting(true);
        setLoginError(null);
        try {
          await verifyAdminRole(session.user.id);
          setAdminMfaSession(session.user.id);
          setMode('login');
        } catch (err: any) {
          await supabase.auth.signOut();
          setLoginError(err?.message || 'This account is not authorized for the admin console.');
        } finally {
          setIsSubmitting(false);
        }
      })();
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    return registerMfaPromptHandler((resolve) => {
      resolverRef.current = resolve;
      setStepUpPassword('');
      setStepUpError(null);
      setShowStepUpModal(true);
    });
  }, []);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim();

    if (!cleanEmail) {
      setLoginError('Please enter your administrator email address.');
      return;
    }

    setIsSubmitting(true);
    setLoginError(null);

    try {
      if (loginMethod === 'email_link') {
        // Supabase Auth sends the Magic Link. No Resend/custom domain is used.
        // shouldCreateUser=false prevents an unknown address from creating a new account.
        const { error } = await supabase.auth.signInWithOtp({
          email: cleanEmail,
          options: {
            shouldCreateUser: false,
            emailRedirectTo: ADMIN_REDIRECT_URL,
          },
        });

        if (error) throw error;
        setMode('email_link_sent');
        return;
      }

      if (!password) {
        setLoginError('Please enter your administrator password.');
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (error) throw error;
      if (!data.user) throw new Error('No authenticated administrator was returned.');

      await verifyAdminRole(data.user.id);
      setAdminMfaSession(data.user.id);
    } catch (err: any) {
      const message = String(err?.message || '').toLowerCase();
      if (message.includes('invalid login credentials')) {
        setLoginError('Invalid administrator email or password.');
      } else if (message.includes('email not confirmed')) {
        setMode('verify_email_notice');
      } else {
        setLoginError(err?.message || 'Administrator authentication failed.');
      }
    } finally {
      setIsSubmitting(false);
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
    setAdminMfaSession(data.user.id);
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

  if (mode === 'email_link_sent') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white border border-slate-200 p-8 rounded-3xl max-w-md w-full text-center space-y-6 shadow-sm">
          <Mail className="mx-auto w-10 h-10 text-indigo-600" />
          <h1 className="text-xl font-bold">Sign-In Link Sent</h1>
          <p className="text-sm text-slate-600">A secure Supabase sign-in link was sent to:</p>
          <p className="p-3 bg-indigo-50 rounded-xl font-mono text-sm">{email}</p>
          <p className="text-xs text-slate-500">Open the email and click the link. You will be returned directly to the admin console.</p>
          <button
            onClick={() => setMode('login')}
            className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold"
          >
            Back to Sign In
          </button>
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
            <p className="text-xs text-slate-500">Secure administrator authentication via Supabase</p>
          </div>

          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setLoginMethod('password')}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg ${loginMethod === 'password' ? 'bg-white shadow-sm' : 'text-slate-500'}`}
            >
              Password
            </button>
            <button
              onClick={() => setLoginMethod('email_link')}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg ${loginMethod === 'email_link' ? 'bg-white shadow-sm' : 'text-slate-500'}`}
            >
              Email Link
            </button>
          </div>

          <form onSubmit={handleSignIn} className="space-y-4">
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Administrator email"
              required
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3"
            />
            {loginMethod === 'password' && (
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Password"
                required
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3"
              />
            )}
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
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : loginMethod === 'email_link' ? (
                <>Send Supabase Sign-In Link <ArrowRight className="w-4 h-4" /></>
              ) : (
                'Sign In'
              )}
            </button>
          </form>
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
