import React, { useEffect, useState } from 'react';
import { ArrowLeft, KeyRound, Mail, RefreshCw } from 'lucide-react';
import { useShop } from '../context/ShopContext';
import { emailProblem, isNoAccountError, type SignupDetails } from '../lib/signupDetails';

/** Supabase sends six digits unless the project is set to more (up to ten). */
const CODE_PATTERN = /^\d{6,10}$/;
/** Supabase refuses a new code to the same address within a minute. */
const RESEND_SECONDS = 60;

interface EmailCodeSignInProps {
  /** Prefix for element ids, so the account and checkout forms stay distinct. */
  idPrefix: string;
  purpose: 'signin' | 'signup';
  /** Sign-up: checks the details form and returns it, or null to stop (it says why). */
  collectSignupDetails?: () => Promise<SignupDetails | null>;
  /** Runs once the code is accepted and the session exists. */
  onSignedIn?: (email: string) => void;
  /** Sign-in: the email has no account yet, so the shopper should sign up first. */
  onNoAccount?: (email: string) => void;
  /** Sign-up: the email the sign-in form found no account for; the form starts with it and says so. */
  noAccountEmail?: string;
}

/**
 * Sign in, or create an account, with a code emailed each time: there is no
 * password for a shopper or a seller to guess. The email also carries a link
 * that signs in on the device where it is opened. Signing in reaches existing
 * accounts only; a new shopper creates the account first, with its details.
 */
export const EmailCodeSignIn: React.FC<EmailCodeSignInProps> = ({ idPrefix, purpose, collectSignupDetails, onSignedIn, onNoAccount, noAccountEmail }) => {
  const { language, sendEmailOtp, verifyEmailOtp, confirmSignupCode, showToast } = useShop();
  const ar = language === 'ar';
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState(noAccountEmail ?? '');
  const [code, setCode] = useState('');
  const [details, setDetails] = useState<SignupDetails | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown(seconds => seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const send = async (withDetails: SignupDetails | null) => {
    await sendEmailOtp(email.trim(), withDetails ?? undefined);
    setStep('code');
    setCode('');
    setCooldown(RESEND_SECONDS);
  };

  const onSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = emailProblem(email, language);
    if (problem) {
      showToast(problem, 'warning');
      return;
    }
    setBusy(true);
    try {
      let collected: SignupDetails | null = null;
      if (purpose === 'signup') {
        collected = (await collectSignupDetails?.()) ?? null;
        if (!collected) return;
      }
      setDetails(collected);
      await send(collected);
    } catch (err) {
      // sendEmailOtp has already said what went wrong.
      if (purpose === 'signin' && isNoAccountError(err)) onNoAccount?.(email.trim());
    } finally {
      setBusy(false);
    }
  };

  const onResend = async () => {
    setBusy(true);
    try {
      await send(details);
    } catch {
      // sendEmailOtp has already said what went wrong.
    } finally {
      setBusy(false);
    }
  };

  const onVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = code.trim();
    if (!CODE_PATTERN.test(token)) {
      showToast(ar ? 'أدخل الرمز المكوّن من 6 أرقام من الرسالة.' : 'Enter the 6-digit code from the email.', 'warning');
      return;
    }
    setBusy(true);
    try {
      if (details) await confirmSignupCode(email.trim(), token, details);
      else await verifyEmailOtp(email.trim(), token);
      onSignedIn?.(email.trim());
    } catch {
      // verifyEmailOtp has already said what went wrong.
    } finally {
      setBusy(false);
    }
  };

  const label = 'block text-[11px] font-bold uppercase tracking-wider text-[#737373] mb-1';
  const input = 'w-full px-4 py-2.5 bg-[#F8F8F6] text-[#171717] text-sm rounded-lg border border-[#E5E5E5] focus:outline-none focus:border-[#B89753] focus:bg-white';
  const primary = 'w-full py-3 bg-[#171717] hover:bg-black text-white font-bold rounded-lg text-xs uppercase tracking-wider transition-all shadow-sm cursor-pointer disabled:bg-neutral-300 disabled:cursor-not-allowed flex items-center justify-center gap-2';

  if (step === 'email') {
    return (
      <form id={`${idPrefix}-code-form`} onSubmit={onSend} className="space-y-3" data-step="email">
        {purpose === 'signup' && noAccountEmail && (
          <p id={`${idPrefix}-no-account-note`} className="text-xs text-[#8F7137] bg-[#B89753]/10 border border-[#B89753]/30 rounded-lg px-3 py-2 leading-relaxed" role="status">
            {ar
              ? `لا يوجد حساب بالبريد ${noAccountEmail} بعد. يرجى إدخال بياناتك أعلاه لإنشاء حساب أولاً.`
              : `There is no account for ${noAccountEmail} yet. Please fill in your details above to create one first.`}
          </p>
        )}
        <div>
          <label htmlFor={`${idPrefix}-code-email`} className={label}>{ar ? 'البريد الإلكتروني *' : 'Email Address *'}</label>
          <input
            id={`${idPrefix}-code-email`}
            type="email"
            autoComplete="email"
            placeholder="name@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className={input}
            required
          />
        </div>
        <button type="submit" id={`${idPrefix}-send-code-btn`} disabled={busy} className={primary}>
          <Mail className="w-4 h-4 text-[#B89753]" aria-hidden="true" />
          <span>
            {busy
              ? (ar ? 'جارٍ الإرسال…' : 'Sending…')
              : purpose === 'signup'
                ? (ar ? 'أرسل لي رمزاً لإنشاء حسابي' : 'Email me a code to create my account')
                : (ar ? 'أرسل لي رمز الدخول' : 'Email me a sign-in code')}
          </span>
        </button>
        <p className="text-[11px] text-[#737373] text-center">
          {ar
            ? 'نرسل إلى بريدك رمزاً من 6 أرقام في كل مرة تسجّل فيها الدخول، دون كلمة مرور.'
            : 'We email you a 6-digit code each time you sign in. No password needed.'}
        </p>
      </form>
    );
  }

  return (
    <form id={`${idPrefix}-code-form`} onSubmit={onVerify} className="space-y-3" data-step="code">
      <p className="text-xs text-[#525252] leading-relaxed" role="status">
        {ar ? `أرسلنا رمزاً إلى ${email.trim()}. أدخله هنا، أو افتح الرابط في الرسالة على هذا الجهاز.` : `We emailed a code to ${email.trim()}. Enter it here, or open the link in that email on this device.`}
      </p>
      <div>
        <label htmlFor={`${idPrefix}-code-input`} className={label}>{ar ? 'رمز الدخول *' : 'Sign-in code *'}</label>
        <input
          id={`${idPrefix}-code-input`}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={10}
          placeholder="••••••"
          value={code}
          onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
          className={`${input} text-center text-lg font-mono tracking-[0.4em]`}
          autoFocus
          required
        />
      </div>
      <button type="submit" id={`${idPrefix}-verify-code-btn`} disabled={busy || code.length < 6} className={primary}>
        <KeyRound className="w-4 h-4 text-[#B89753]" aria-hidden="true" />
        <span>
          {busy
            ? (ar ? 'جارٍ التحقق…' : 'Checking…')
            : purpose === 'signup'
              ? (ar ? 'تأكيد وإنشاء الحساب' : 'Confirm and create account')
              : (ar ? 'تأكيد وتسجيل الدخول' : 'Confirm and sign in')}
        </span>
      </button>
      <div className="flex items-center justify-between gap-2 text-[11px] font-bold">
        <button
          type="button"
          onClick={() => { setStep('email'); setCode(''); }}
          disabled={busy}
          className="inline-flex items-center gap-1 text-[#737373] hover:text-[#171717] cursor-pointer disabled:opacity-50"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{ar ? 'بريد آخر' : 'Use a different email'}</span>
        </button>
        <button
          type="button"
          id={`${idPrefix}-resend-code-btn`}
          onClick={onResend}
          disabled={busy || cooldown > 0}
          className="inline-flex items-center gap-1 text-[#8F7137] hover:text-[#B89753] cursor-pointer disabled:text-[#A3A3A3] disabled:cursor-not-allowed"
        >
          <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{cooldown > 0 ? (ar ? `إعادة الإرسال بعد ${cooldown} ث` : `Resend in ${cooldown}s`) : (ar ? 'أعد إرسال الرمز' : 'Resend code')}</span>
        </button>
      </div>
    </form>
  );
};
