/** What a sign-up form collects before the sign-in code is emailed. */
export interface SignupDetails {
  firstName: string;
  lastName: string;
  /** "+961 70123456", or '' when not given. */
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
