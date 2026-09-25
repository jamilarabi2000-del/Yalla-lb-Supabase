/** What a sign-up form collects besides the email and password. */
export interface SignupDetails {
  firstName: string;
  lastName: string;
  /** "+961 70123456". */
  phone: string;
  city: string;
  address: string;
  building: string;
  notes: string;
}

/**
 * The details as user metadata on the new account. public.handle_new_user
 * copies these keys into the profile (trimmed and bounded there too), so they
 * are kept even when the emailed code is used on another device.
 */
export function signupMetadata(details: SignupDetails): Record<string, string> {
  const firstName = details.firstName.trim();
  const lastName = details.lastName.trim();
  return {
    name: `${firstName} ${lastName}`.trim(),
    first_name: firstName,
    last_name: lastName,
    default_city: details.city.trim(),
    default_address: details.address.trim(),
    default_building: details.building.trim(),
    default_notes: details.notes.trim(),
  };
}

/**
 * Supabase's refusal when a sign-in code is asked for an email that has no
 * account: codes reach existing accounts only (shouldCreateUser false), so
 * the shopper is sent to sign up first. The password step usually says so
 * first ('no_account'); this covers an account removed in between.
 */
export function isNoAccountError(error: unknown): boolean {
  const e = error as { code?: unknown; message?: unknown } | null | undefined;
  return e?.code === 'otp_disabled' || (typeof e?.message === 'string' && /signups not allowed for otp/i.test(e.message));
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Why an email address cannot be used, or null when it can. */
export function emailProblem(email: string | undefined | null, language: 'en' | 'ar'): string | null {
  const value = (email ?? '').trim();
  if (!value) return language === 'ar' ? 'البريد الإلكتروني مطلوب.' : 'Email address is required.';
  if (!EMAIL_PATTERN.test(value)) return language === 'ar' ? 'يرجى إدخال بريد إلكتروني صالح.' : 'Please enter a valid email address.';
  return null;
}

/** Why a phone number (the 8 digits after +961) cannot be saved, or null when it can. */
export function phoneProblem(digits: string | undefined | null, language: 'en' | 'ar'): string | null {
  const value = (digits ?? '').replace(/\D/g, '');
  if (!value) return language === 'ar' ? 'رقم الهاتف مطلوب.' : 'Phone number is required.';
  if (value.length !== 8) return language === 'ar' ? 'يجب أن يتألف رقم الهاتف اللبناني من 8 أرقام' : 'Lebanese phone number must be strictly 8 digits';
  return null;
}

/** handle_new_user keeps at most this much of it. */
export const CITY_REGION_MAX_LENGTH = 120;

/** Why a City / Region cannot be saved, or null when it can. */
export function cityRegionProblem(city: string | undefined | null, language: 'en' | 'ar'): string | null {
  const value = (city ?? '').trim();
  if (!value) return language === 'ar' ? 'المدينة / المنطقة مطلوبة.' : 'City / Region is required.';
  if (value.length > CITY_REGION_MAX_LENGTH) {
    return language === 'ar'
      ? `المدينة / المنطقة طويلة جداً (${CITY_REGION_MAX_LENGTH} حرفاً كحد أقصى).`
      : `City / Region is too long (at most ${CITY_REGION_MAX_LENGTH} characters).`;
  }
  return null;
}
