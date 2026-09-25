import { validatePassword } from './passwordPolicy';

/**
 * What public.verify_login_password answers. 'ok' also leaves the database a
 * note that lets the code emailed next sign the account in (see
 * 20260925013151_password_check_for_sign_in.sql).
 */
export type LoginPasswordStatus = 'ok' | 'wrong' | 'no_account' | 'locked';

export function isLoginPasswordStatus(value: unknown): value is LoginPasswordStatus {
  return value === 'ok' || value === 'wrong' || value === 'no_account' || value === 'locked';
}

type Language = 'en' | 'ar';

/** What to tell someone whose password was not accepted. */
export function loginStatusMessage(status: 'wrong' | 'locked', language: Language): string {
  if (status === 'locked') {
    return language === 'ar'
      ? 'محاولات خاطئة كثيرة. انتظر 15 دقيقة، أو استخدم "نسيت كلمة المرور".'
      : 'Too many wrong passwords. Wait 15 minutes, or use Forgot password.';
  }
  return language === 'ar'
    ? 'البريد الإلكتروني أو كلمة المرور غير صحيحة. إذا أنشأت حسابك برمز عبر البريد، أو نسيت كلمة المرور، فاستخدم "نسيت كلمة المرور" لتعيين واحدة.'
    : 'Wrong email or password. If you created your account with an emailed code, or forgot your password, use Forgot password to set one.';
}

/** The sign-in form reaches existing accounts only; a new shopper signs up first. */
export function noAccountMessage(language: Language): string {
  return language === 'ar'
    ? 'لا يوجد حساب بهذا البريد الإلكتروني بعد. يرجى إنشاء حساب أولاً.'
    : 'There is no account with this email yet. Please sign up first.';
}

export function passwordRulesHint(language: Language): string {
  return language === 'ar'
    ? '8 أحرف على الأقل، مع أحرف كبيرة وصغيرة ورقم.'
    : 'At least 8 characters, with upper- and lower-case letters and a number.';
}

const ARABIC_POLICY_MESSAGES: Record<string, string> = {
  'Password must contain both uppercase and lowercase letters.': 'يجب أن تحتوي كلمة المرور على أحرف كبيرة وصغيرة.',
  'Password must contain at least one digit.': 'يجب أن تحتوي كلمة المرور على رقم واحد على الأقل.',
  'Privileged accounts (admin/seller) require at least one special symbol.': 'حسابات البائعين والإدارة تحتاج إلى رمز خاص واحد على الأقل.',
  'Password is too predictable.': 'كلمة المرور سهلة التخمين.',
};

/**
 * Why a new password (typed twice) cannot be used, or null when it can. The
 * rules are the shop's password policy; sellers and the administrator get the
 * stricter one.
 */
export function newPasswordProblem(password: string, confirm: string, language: Language, privileged = false): string | null {
  const policy = validatePassword(password, privileged);
  if (!policy.isValid) {
    if (language !== 'ar') return policy.message;
    const minLength = policy.message.match(/at least (\d+) characters/);
    if (minLength) return `يجب ألا تقل كلمة المرور عن ${minLength[1]} أحرف.`;
    return ARABIC_POLICY_MESSAGES[policy.message] ?? policy.message;
  }
  if (password !== confirm) {
    return language === 'ar' ? 'كلمتا المرور غير متطابقتين.' : 'The two passwords do not match.';
  }
  return null;
}

const HOOK_MESSAGES: Record<string, string> = {
  'Enter your password first, then the code we email you.': 'أدخل كلمة المرور أولاً، ثم الرمز الذي نرسله إلى بريدك.',
  'Sign in with your password and the code we email you.': 'سجّل الدخول بكلمة المرور والرمز الذي نرسله إلى بريدك.',
  'This way of signing in is not available.': 'طريقة تسجيل الدخول هذه غير متاحة.',
};

/** Supabase passes the sign-in hook's refusals on in English; this says them in the shop's language. */
export function signInRefusalMessage(message: string, language: Language): string {
  return language === 'ar' ? HOOK_MESSAGES[message] ?? message : message;
}
