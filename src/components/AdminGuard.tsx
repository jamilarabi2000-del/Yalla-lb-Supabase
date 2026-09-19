import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowRight, Eye, EyeOff, Loader2, Lock, ShieldAlert } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useShop } from '../context/ShopContext';
import { clearAdminMfaSession, registerMfaPromptHandler } from '../utils/adminMfa';

interface AdminGuardProps { children: React.ReactNode; }
type AuthMode = 'login' | 'mfa' | 'enroll';

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
  const [aal2, setAal2] = useState(false);
  const [busy, setBusy] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showStepUp, setShowStepUp] = useState(false);
  const [stepUpError, setStepUpError] = useState<string | null>(null);
  const resolverRef = useRef<((success: boolean) => void) | null>(null);
  const lastActivityRef = useRef(Date.now());

  const userId = authUser?.uid;

  const verifyAdminRole = async (uid: string) => {
    const { data, error } = await supabase.from('profiles').select('role').eq('id', uid).maybeSingle();
    if (error) throw error;
    if (data?.role !== 'admin') throw new Error('This account does not have administrator privileges.');
  };

  const recordNativeStepUp = async () => {
    const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalError) throw aalError;
    if (aal.currentLevel !== 'aal2') throw new Error('MFA verification did not reach AAL2.');
    const { error } = await supabase.schema('private').rpc('record_admin_step_up_aal2');
    if (error) throw error;
    setAal2(true);
    lastActivityRef.current = Date.now();
  };

  const loadMfaState = async () => {
    const { data, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalError) throw aalError;
    if (data.currentLevel === 'aal2') {
      await recordNativeStepUp();
      return;
    }
    const { data: factors, error: factorError } = await supabase.auth.mfa.listFactors();
    if (factorError) throw factorError;
    const verifiedTotp = (factors?.totp || []).find((factor: any) => factor.status === 'verified');
    if (verifiedTotp) {
      setFactorId(verifiedTotp.id);
      setMode('mfa');
      return;
    }
    setMode('enroll');
  };

  const startChallenge = async (id = factorId) => {
    if (!id) throw new Error('No verified authenticator factor is available.');
    const { data, error } = await supabase.auth.mfa.challenge({ factorId: id });
    if (error) throw error;
    setChallengeId(data.id);
  };

  const verifyCode = async () => {
    const cleanCode = code.replace(/\D/g, '');
    if (cleanCode.length !== 6) throw new Error('Enter the 6-digit code from your authenticator app.');
    let activeChallengeId = challengeId;
    if (!factorId) throw new Error('No verified authenticator factor is available.');
    if (!activeChallengeId) {
      const challenge = await supabase.auth.mfa.challenge({ factorId });
      if (challenge.error) throw challenge.error;
      activeChallengeId = challenge.data.id;
      setChallengeId(activeChallengeId);
    }
    const { error } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: activeChallengeId,
      code: cleanCode,
    });
    if (error) throw error;
    await recordNativeStepUp();
    setCode('');
    setChallengeId('');
    setMode('login');
  };

  const enrollTotp = async () => {
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'Yalla Administrator',
    });
    if (error) throw error;
    setFactorId(data.id);
    setQrCode(data.totp?.qr_code || '');
    setSecret(data.totp?.secret || '');
    setMode('enroll');
  };

  const verifyEnrollment = async () => {
    if (!factorId) throw new Error('MFA enrollment has not started.');
    const challenge = await supabase.auth.mfa.challenge({ factorId });
    if (challenge.error) throw challenge.error;
    const cleanCode = code.replace(/\D/g, '');
    if (cleanCode.length !== 6) throw new Error('Enter the 6-digit code from your authenticator app.');
    const result = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.data.id,
      code: cleanCode,
    });
    if (result.error) throw result.error;
    await recordNativeStepUp();
    setCode('');
    setQrCode('');
    setSecret('');
    setChallengeId('');
    setMode('login');
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const cleanEmail = email.trim().toLowerCase();
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
      if (signInError) throw signInError;
      if (!data.user) throw new Error('No authenticated administrator was returned.');
      await verifyAdminRole(data.user.id);
      await loadMfaState();
    } catch (err: any) {
      const message = String(err?.message || '');
      setError(message.toLowerCase().includes('invalid login credentials')
        ? 'Invalid administrator email or password.'
        : message || 'Administrator authentication failed.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (authStatus !== 'authenticated_admin' || !userId || aal2 || mode !== 'login') return;
    let cancelled = false;
    setBusy(true);
    setError(null);
    void (async () => {
      try {
        await verifyAdminRole(userId);
        await loadMfaState();
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Could not verify administrator MFA state.');
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [authStatus, userId, aal2, mode]);

  useEffect(() => {
    registerMfaPromptHandler((resolve) => {
      resolverRef.current = resolve;
      setStepUpError(null);
      setCode('');
      setShowStepUp(true);
      void (async () => {
        try {
          const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
          if (error) throw error;
          if (data.currentLevel === 'aal2') {
            await recordNativeStepUp();
            setShowStepUp(false);
            resolverRef.current?.(true);
            resolverRef.current = null;
            return;
          }
          const { data: factors, error: factorError } = await supabase.auth.mfa.listFactors();
          if (factorError) throw factorError;
          const factor = (factors?.totp || []).find((item: any) => item.status === 'verified');
          if (!factor) throw new Error('No verified authenticator is enrolled for this administrator.');
          setFactorId(factor.id);
          await startChallenge(factor.id);
        } catch (err: any) {
          setStepUpError(err?.message || 'Could not start MFA step-up verification.');
        }
      })();
    });
  }, []);

  useEffect(() => {
    if (authStatus !== 'authenticated_admin' || !userId || !aal2) return;
    lastActivityRef.current = Date.now();
    const markActivity = () => { lastActivityRef.current = Date.now(); };
    ADMIN_ACTIVITY_EVENTS.forEach(event => window.addEventListener(event, markActivity, { passive: true }));
    const timer = window.setInterval(async () => {
      if (Date.now() - lastActivityRef.current < ADMIN_INACTIVITY_TIMEOUT_MS) return;
      window.clearInterval(timer);
      ADMIN_ACTIVITY_EVENTS.forEach(event => window.removeEventListener(event, markActivity));
      clearAdminMfaSession(userId);
      setAal2(false);
      setMode('login');
      setCode('');
      await signOutUser();
      setError('Your administrator session expired after 30 minutes of inactivity. Please sign in again.');
    }, 30_000);
    return () => {
      window.clearInterval(timer);
      ADMIN_ACTIVITY_EVENTS.forEach(event => window.removeEventListener(event, markActivity));
    };
  }, [authStatus, userId, aal2, signOutUser]);

  if (authStatus === 'loading') {
    return <div className="min-h-screen flex items-center justify-center bg-[#F7F7F8]"><Loader2 className="w-6 h-6 animate-spin text-[#B89753]" /></div>;
  }

  if (authStatus === 'authenticated_admin' && aal2) return <>{children}</>;

  if (mode === 'mfa') return (
    <div className="min-h-screen bg-[#F7F7F8] flex items-center justify-center p-4">
      <div className="bg-white border border-[#E5E5E5] p-8 rounded-3xl max-w-sm w-full space-y-6 shadow-[0_12px_32px_-12px_rgba(184,151,83,0.18)]">
        <div className="text-center space-y-3">
          <div className="mx-auto w-16 h-16 rounded-[22px] gold-gradient-bg flex items-center justify-center text-white"><ShieldAlert className="w-7 h-7" /></div>
          <h1 className="text-2xl font-bold">Authenticator Verification</h1>
          <p className="text-sm text-[#666666]">Enter the 6-digit code from your authenticator app.</p>
        </div>
        <form onSubmit={async e => { e.preventDefault(); setBusy(true); setError(null); try { await verifyCode(); } catch (err: any) { setError(err?.message || 'MFA verification failed.'); } finally { setBusy(false); } }} className="space-y-4">
          <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus placeholder="123456" className="w-full bg-[#F7F7F8] border border-[#E5E5E5] rounded-xl px-4 py-4 text-center text-2xl tracking-[0.25em] font-mono" />
          {error && <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-[#C62828] flex gap-2"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div>}
          <button disabled={busy || code.length !== 6} className="gold-btn w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Verify & Continue <ArrowRight className="w-4 h-4" /></>}</button>
        </form>
        <button onClick={async () => { await supabase.auth.signOut(); setMode('login'); setCode(''); }} className="w-full text-sm text-[#666666]">Cancel and Sign Out</button>
      </div>
    </div>
  );

  if (mode === 'enroll') return (
    <div className="min-h-screen bg-[#F7F7F8] flex items-center justify-center p-4">
      <div className="bg-white border border-[#E5E5E5] p-8 rounded-3xl max-w-md w-full space-y-6 shadow-[0_12px_32px_-12px_rgba(184,151,83,0.18)]">
        <div className="text-center space-y-3"><div className="mx-auto w-16 h-16 rounded-[22px] gold-gradient-bg flex items-center justify-center text-white"><ShieldAlert className="w-7 h-7" /></div><h1 className="text-2xl font-bold">Set Up Authenticator</h1><p className="text-sm text-[#666666]">Scan this QR code with Google Authenticator, Microsoft Authenticator, 1Password, or another TOTP app.</p></div>
        {!qrCode && <button onClick={async () => { setBusy(true); setError(null); try { await enrollTotp(); } catch (err: any) { setError(err?.message || 'Could not start MFA enrollment.'); } finally { setBusy(false); } }} disabled={busy} className="gold-btn w-full py-3 rounded-xl font-bold">{busy ? 'Preparing…' : 'Start MFA Setup'}</button>}
        {qrCode && <div className="space-y-4">
          <div className="flex justify-center p-4 bg-white border rounded-2xl"><img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrCode)}`} alt="Authenticator QR code" className="w-52 h-52" /></div>
          {secret && <div className="text-xs text-[#666666]">Can't scan? Enter this secret manually:<div className="mt-2 p-3 bg-[#F7F7F8] rounded-xl font-mono break-all text-center">{secret}</div></div>}
          <form onSubmit={async e => { e.preventDefault(); setBusy(true); setError(null); try { await verifyEnrollment(); } catch (err: any) { setError(err?.message || 'MFA enrollment verification failed.'); } finally { setBusy(false); } }} className="space-y-4">
            <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="Enter 6-digit code" className="w-full bg-[#F7F7F8] border border-[#E5E5E5] rounded-xl px-4 py-4 text-center text-2xl tracking-[0.25em] font-mono" />
            <button disabled={busy || code.length !== 6} className="gold-btn w-full py-3 rounded-xl font-bold disabled:opacity-50">{busy ? 'Verifying…' : 'Enable Authenticator'}</button>
          </form>
        </div>}
        {error && <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-[#C62828] flex gap-2"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div>}
        <button onClick={async () => { await supabase.auth.signOut(); setMode('login'); }} className="w-full text-sm text-[#666666]">Cancel and Sign Out</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F7F7F8] flex items-center justify-center p-4">
      <div className="bg-white border border-[#E5E5E5] p-8 rounded-3xl max-w-md w-full space-y-7 shadow-[0_12px_32px_-12px_rgba(184,151,83,0.18)]">
        <div className="text-center space-y-3"><div className="mx-auto w-16 h-16 rounded-[22px] gold-gradient-bg flex items-center justify-center text-white"><Lock className="w-7 h-7" /></div><h1 className="text-2xl font-bold">Administrator Access</h1><p className="text-sm text-[#666666]">Sign in with your administrator credentials.</p></div>
        <form onSubmit={handleSignIn} className="space-y-4">
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" placeholder="Administrator email" disabled={busy} className="w-full bg-[#F7F7F8] border border-[#E5E5E5] rounded-xl px-4 py-3" />
          <div className="relative"><input type={passwordVisible ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" placeholder="Administrator password" disabled={busy} className="w-full bg-[#F7F7F8] border border-[#E5E5E5] rounded-xl px-4 py-3 pr-12" /><button type="button" aria-label={passwordVisible ? 'Hide password' : 'Show password'} onClick={() => setPasswordVisible(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#666666]">{passwordVisible ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}</button></div>
          {error && <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-[#C62828] flex gap-2"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div>}
          <button disabled={busy} className="gold-btn w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Continue <ArrowRight className="w-4 h-4" /></>}</button>
        </form>
      </div>
    </div>
  );
};
