/**
 * Lebanese Phone Number Normalization and Validation Utilities
 *
 * Lebanese phone format:
 * - 8 digits (e.g., 03xxxxxx, 70xxxxxx, 71xxxxxx, 76xxxxxx, 78xxxxxx, 79xxxxxx, 81xxxxxx, 01xxxxxx, etc.)
 * - Country code: +961
 */

export interface NormalizedPhone {
  raw: string;
  cleanDigits: string;
  formatted: string;
  isValid: boolean;
  registryKey: string;
}

export function normalizeLebanesePhone(rawPhone: string | null | undefined): NormalizedPhone {
  if (!rawPhone || typeof rawPhone !== 'string') {
    return {
      raw: '',
      cleanDigits: '',
      formatted: '',
      isValid: false,
      registryKey: '',
    };
  }

  const raw = rawPhone.trim();
  let digits = raw.replace(/\D/g, '');

  // Strip international country code 961 if present at start
  if (digits.startsWith('961') && digits.length >= 10) {
    digits = digits.slice(3);
  }

  // Handle 7-digit mobile without leading 0 (e.g. 3123456 -> 03123456)
  if (digits.length === 7 && digits.startsWith('3')) {
    digits = '0' + digits;
  }

  const isValid = digits.length === 8 && /^[0-9]{8}$/.test(digits);
  const formatted = isValid ? `+961 ${digits}` : raw;
  const registryKey = isValid ? `phone_${digits}` : '';

  return {
    raw,
    cleanDigits: digits,
    formatted,
    isValid,
    registryKey,
  };
}

export function isValidLebanesePhone(phone: string | null | undefined): boolean {
  return normalizeLebanesePhone(phone).isValid;
}

export function formatPhoneDisplay(phone: string | null | undefined): string {
  const norm = normalizeLebanesePhone(phone);
  if (norm.isValid) {
    return norm.formatted;
  }
  return phone || '';
}
