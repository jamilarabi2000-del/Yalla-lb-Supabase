import React, { useEffect, useState } from 'react';
import { ArrowLeft, Eye, EyeOff, KeyRound, Mail, RefreshCw } from 'lucide-react';
import { useShop } from '../context/ShopContext';
import { emailProblem, type SignupDetails } from '../lib/signupDetails';
import { loginStatusMessage, newPasswordProblem, noAccountMessage, passwordRulesHint } from '../lib/passwordSignIn';

/** Supabase sends six digits unless the project is set to more (up to ten). */
const CODE_PATTERN = /^\d{6,10}$/;
/** Supabase refuses a new email to the same address within a minute. */
const RESEND_SECONDS = 60;
/** bcrypt, which Supabase uses, reads no further. */
const PASSWORD_MAX_LENGTH = 72;

type Step = 'credentials' | 'code' | 'reset-email' | 'reset-code';

interface EmailPasswordSignInProps {
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
  /** Sign-up: the email already has an account, so the shopper should sign in. */
  onAccountExists?: (email: string) => void;
  /** Sign-in: the email the sign-up form found an account for; the form starts with it and says so. */
  existingAccountEmail?: string;
}

/**
 * Signing in takes the account's password and then a code emailed to it; a
 * new account is made with a password chosen twice, then its email is
 * confirmed with a code; Forgot password emails a code that lets the shopper
 * choose a new password (NewPasswordPrompt asks for it once they are in).
 * Supabase enforces the password + code pair: see
 * 20260925013551_code_sign_in_needs_password.sql.
 *
 * Each step is its own small form, and none may sit inside another form.
 */
export const EmailPasswordSignIn: React.FC<EmailPasswordSignInProps> = ({
  idPrefix, purpose, collectSignupDetails, onSignedIn, onNoAccount, noAccountEmail, onAccountExists, existingAccountEmail,
}) => {
  const {
    language, showToast, verifyLoginPassword, sendEmailOtp, verifyEmailOtp, signUpWithPassword, confirmSignupCode,
    resendEmailVerification, resetPassword, confirmPasswordResetCode,
  } = useShop();
  const ar = language === 'ar';
  const [step, setStep] = useState<Step>('credentials');
  const [email, setEmail] = useState(noAccountEmail ?? existingAccountEmail ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState('');
  const [details, setDetails] = useState<SignupDetails | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown(seconds => seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const cleanEmail = email.trim();
  const goTo = (next: Step) => {
    setStep(next);
    setCode('');
  };
  const codeSent = (next: 'code' | 'reset-code') => {
    goTo(next);
    setCooldown(RESEND_SECONDS);
  };

  /** Runs one step; the context has already said what went wrong when it throws. */
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
    } catch {
      // Reported where it happened.
    } finally {
      setBusy(false);
    }
  };

  const checkEmail = () => {
    const problem = emailProblem(cleanEmail, language);
    if (problem) showToast(problem, 'warning');
    return !problem;
  };

  const onCredentials = (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkEmail()) return;
    if (purpose === 'signin') {
      if (!password) {
        showToast(ar ? 'أدخل كلمة المرور.' : 'Enter your password.', 'warning');
        return;
      }
      return run(async () => {
        const status = await verifyLoginPassword(cleanEmail, password);
        if (status === 'no_account') {
          showToast(noAccountMessage(language), 'warning');
          onNoAccount?.(cleanEmail);
          return;
        }
        if (status !== 'ok') {
          showToast(loginStatusMessage(status, language), 'warning');
          return;
        }
        await sendEmailOtp(cleanEmail);
        codeSent('code');
      });
    }
    const problem = newPasswordProblem(password, confirm, language);
    if (problem) {
      showToast(problem, 'warning');
      return;
    }
    return run(async () => {
      const collected = (await collectSignupDetails?.()) ?? null;
      if (!collected) return;
      const result = await signUpWithPassword(cleanEmail, password, collected);
      if (result === 'exists') {
        showToast(ar
          ? `يوجد حساب بالبريد ${cleanEmail}. سجّل الدخول بكلمة مروره، أو استخدم "نسيت كلمة المرور".`
          : `${cleanEmail} already has an account. Sign in with its password, or use Forgot password.`, 'warning');
        onAccountExists?.(cleanEmail);
        return;
      }
      setDetails(collected);
      codeSent('code');
    });
  };

  const onCode = (e: React.FormEvent) => {
    e.preventDefault();
    const token = code.trim();
    if (!CODE_PATTERN.test(token)) {
      showToast(ar ? 'أدخل الرمز المكوّن من 6 أرقام من الرسالة.' : 'Enter the 6-digit code from the email.', 'warning');
      return;
    }
    return run(async () => {
      if (step === 'reset-code') {
        await confirmPasswordResetCode(cleanEmail, token);
      } else {
        // Renew the password step: the code may have taken a while to arrive.
        const status = await verifyLoginPassword(cleanEmail, password);
        if (status !== 'ok') {
          showToast(status === 'no_account' ? noAccountMessage(language) : loginStatusMessage(status, language), 'warning');
          if (status === 'wrong') goTo('credentials');
          return;
        }
        if (purpose === 'signup' && details) await confirmSignupCode(cleanEmail, token, details);
        else await verifyEmailOtp(cleanEmail, token);
      }
      setPassword('');
      setConfirm('');
      setCode('');
      onSignedIn?.(cleanEmail);
    });
  };

  const onResend = () => run(async () => {
    if (step === 'reset-code') await resetPassword(cleanEmail);
    else if (purpose === 'signup') await resendEmailVerification?.(cleanEmail);
    else await sendEmailOtp(cleanEmail);
    setCooldown(RESEND_SECONDS);
  });

  const onResetEmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkEmail()) return;
    return run(async () => {
      await resetPassword(cleanEmail);
      codeSent('reset-code');
    });
  };

  const label = 'block text-[11px] font-bold uppercase tracking-wider text-[#737373] mb-1';
  const input = 'w-full px-4 py-2.5 bg-[#F8F8F6] text-[#171717] text-sm rounded-lg border border-[#E5E5E5] focus:outline-none focus:border-[#B89753] focus:bg-white';
  const primary = 'w-full py-3 bg-[#171717] hover:bg-black text-white font-bold rounded-lg text-xs uppercase tracking-wider transition-all shadow-sm cursor-pointer disabled:bg-neutral-300 disabled:cursor-not-allowed flex items-center justify-center gap-2';
  const link = 'inline-flex items-center gap-1 text-[11px] font-bold cursor-pointer disabled:opacity-50';
  const note = 'text-xs text-[#8F7137] bg-[#B89753]/10 border border-[#B89753]/30 rounded-lg px-3 py-2 leading-relaxed';

  const emailField = (id: string) => (
    <div>
      <label htmlFor={id} className={label}>{ar ? 'البريد الإلكتروني *' : 'Email Address *'}</label>
      <input
        id={id}
        type="email"
        autoComplete="email"
        placeholder="name@example.com"
        value={email}
        onChange={e => setEmail(e.target.value)}
        className={input}
        required
      />
    </div>
  );

  const passwordField = (id: string, value: string, onChange: (value: string) => void, labelText: string, withToggle: boolean) => (
    <div>
      <label htmlFor={id} className={label}>{labelText}</label>
      <div className="relative">
        <input
          id={id}
          type={showPassword ? 'text' : 'password'}
          autoComplete={purpose === 'signup' ? 'new-password' : 'current-password'}
          maxLength={PASSWORD_MAX_LENGTH}
          value={value}
          onChange={e => onChange(e.target.value)}
          className={`${input} pe-11`}
          required
        />
        {withToggle && (
          <button
            type="button"
            id={`${idPrefix}-toggle-password-btn`}
            onClick={() => setShowPassword(shown => !shown)}
            aria-label={showPassword ? (ar ? 'إخفاء كلمة المرور' : 'Hide password') : (ar ? 'إظهار كلمة المرور' : 'Show password')}
            aria-pressed={showPassword}
            className="absolute end-3 top-1/2 -translate-y-1/2 text-[#737373] hover:text-[#171717] cursor-pointer"
          >
            {showPassword ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
          </button>
        )}
      </div>
    </div>
  );

  if (step === 'credentials') {
    return (
      <form id={`${idPrefix}-form`} onSubmit={onCredentials} className="space-y-3" data-step="credentials">
        {purpose === 'signup' && noAccountEmail && (
          <p id={`${idPrefix}-no-account-note`} className={note} role="status">
            {ar
              ? `لا يوجد حساب بالبريد ${noAccountEmail} بعد. يرجى إدخال بياناتك أعلاه لإنشاء حساب أولاً.`
              : `There is no account for ${noAccountEmail} yet. Please fill in your details above to create one first.`}
          </p>
        )}
        {purpose === 'signin' && existingAccountEmail && (
          <p id={`${idPrefix}-existing-account-note`} className={note} role="status">
            {ar
              ? `يوجد حساب بالبريد ${existingAccountEmail}. سجّل الدخول بكلمة مروره، أو استخدم "نسيت كلمة المرور".`
              : `${existingAccountEmail} already has an account. Sign in with its password, or use Forgot password.`}
          </p>
        )}
        {emailField(`${idPrefix}-email`)}
        {passwordField(`${idPrefix}-password`, password, setPassword, ar ? 'كلمة المرور *' : 'Password *', true)}
        {purpose === 'signup' && (
          <>
            {passwordField(`${idPrefix}-password-confirm`, confirm, setConfirm, ar ? 'تأكيد كلمة المرور *' : 'Confirm Password *', false)}
            <p id={`${idPrefix}-password-rules`} className="text-[11px] text-[#737373]">{passwordRulesHint(language)}</p>
          </>
        )}
        {purpose === 'signin' && (
          <div className="flex justify-end">
            <button
              type="button"
              id={`${idPrefix}-forgot-btn`}
              onClick={() => goTo('reset-email')}
              disabled={busy}
              className={`${link} text-[#8F7137] hover:text-[#B89753]`}
            >
              {ar ? 'نسيت كلمة المرور؟' : 'Forgot password?'}
            </button>
          </div>
        )}
        <button type="submit" id={`${idPrefix}-submit-btn`} disabled={busy} className={primary}>
          <KeyRound className="w-4 h-4 text-[#B89753]" aria-hidden="true" />
          <span>
            {busy
              ? (ar ? 'لحظة…' : 'One moment…')
              : purpose === 'signup'
                ? (ar ? 'إنشاء الحساب' : 'Create account')
                : (ar ? 'متابعة' : 'Continue')}
          </span>
        </button>
        <p className="text-[11px] text-[#737373] text-center">
          {purpose === 'signup'
            ? (ar ? 'بعدها نرسل إلى بريدك رمزاً لتأكيده.' : 'Next, we email you a code to confirm your email address.')
            : (ar ? 'بعدها نرسل إلى بريدك رمزاً من 6 أرقام لإكمال تسجيل الدخول.' : 'Next, we email you a 6-digit code to finish signing in.')}
        </p>
      </form>
    );
  }

  if (step === 'reset-email') {
    return (
      <form id={`${idPrefix}-form`} onSubmit={onResetEmail} className="space-y-3" data-step="reset-email">
        <p className="text-xs text-[#525252] leading-relaxed">
          {ar
            ? 'أدخل بريد حسابك. نرسل إليه رمزاً، ثم تختار كلمة مرور جديدة.'
            : "Enter your account's email. We email it a code, then you choose a new password."}
        </p>
        {emailField(`${idPrefix}-reset-email`)}
        <button type="submit" id={`${idPrefix}-reset-send-btn`} disabled={busy} className={primary}>
          <Mail className="w-4 h-4 text-[#B89753]" aria-hidden="true" />
          <span>{busy ? (ar ? 'جارٍ الإرسال…' : 'Sending…') : (ar ? 'أرسل لي رمز إعادة التعيين' : 'Email me a reset code')}</span>
        </button>
        <button type="button" id={`${idPrefix}-back-btn`} onClick={() => goTo('credentials')} disabled={busy} className={`${link} text-[#737373] hover:text-[#171717]`}>
          <ArrowLeft className="w-3.5 h-3.5 rtl:rotate-180" aria-hidden="true" />
          <span>{ar ? 'العودة إلى تسجيل الدخول' : 'Back to sign in'}</span>
        </button>
      </form>
    );
  }

  const resetting = step === 'reset-code';
  return (
    <form id={`${idPrefix}-form`} onSubmit={onCode} className="space-y-3" data-step={step}>
      <p className="text-xs text-[#525252] leading-relaxed" role="status">
        {resetting
          ? (ar
            ? `إذا كان للبريد ${cleanEmail} حساب، فقد أرسلنا إليه رمزاً. أدخله هنا لاختيار كلمة مرور جديدة.`
            : `If ${cleanEmail} has an account, we emailed it a code. Enter it here to choose a new password.`)
          : purpose === 'signup'
            ? (ar
              ? `أرسلنا رمزاً إلى ${cleanEmail} لتأكيد بريدك. أدخله هنا، أو افتح الرابط في الرسالة على هذا الجهاز.`
              : `We emailed a code to ${cleanEmail} to confirm your email. Enter it here, or open the link in that email on this device.`)
            : (ar
              ? `أرسلنا رمزاً إلى ${cleanEmail}. أدخله هنا لإكمال تسجيل الدخول، أو افتح الرابط في الرسالة على هذا الجهاز.`
              : `We emailed a code to ${cleanEmail}. Enter it here to finish signing in, or open the link in that email on this device.`)}
      </p>
      <div>
        <label htmlFor={`${idPrefix}-code-input`} className={label}>
          {resetting
            ? (ar ? 'رمز إعادة التعيين *' : 'Reset code *')
            : purpose === 'signup'
              ? (ar ? 'رمز التأكيد *' : 'Confirmation code *')
              : (ar ? 'رمز الدخول *' : 'Sign-in code *')}
        </label>
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
            : resetting
              ? (ar ? 'تحقق من الرمز' : 'Verify code')
              : purpose === 'signup'
                ? (ar ? 'تأكيد وإنشاء الحساب' : 'Confirm and create account')
                : (ar ? 'تأكيد وتسجيل الدخول' : 'Confirm and sign in')}
        </span>
      </button>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          id={`${idPrefix}-back-btn`}
          onClick={() => goTo(resetting ? 'reset-email' : 'credentials')}
          disabled={busy}
          className={`${link} text-[#737373] hover:text-[#171717]`}
        >
          <ArrowLeft className="w-3.5 h-3.5 rtl:rotate-180" aria-hidden="true" />
          <span>{ar ? 'بريد آخر' : 'Use a different email'}</span>
        </button>
        <button
          type="button"
          id={`${idPrefix}-resend-code-btn`}
          onClick={onResend}
          disabled={busy || cooldown > 0}
          className={`${link} text-[#8F7137] hover:text-[#B89753] disabled:text-[#A3A3A3] disabled:cursor-not-allowed`}
        >
          <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{cooldown > 0 ? (ar ? `إعادة الإرسال بعد ${cooldown} ث` : `Resend in ${cooldown}s`) : (ar ? 'أعد إرسال الرمز' : 'Resend code')}</span>
        </button>
      </div>
    </form>
  );
};
