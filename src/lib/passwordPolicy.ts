export function generateSecurePassword(length: number = 16): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+~`|}{[]:;?><,./-=';
  const array = new Uint32Array(length);
  const cryptoObj = (typeof window !== 'undefined' && window.crypto) || (typeof globalThis !== 'undefined' && globalThis.crypto);
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    cryptoObj.getRandomValues(array);
  } else {
    throw new Error('Security Error: Cryptographically secure random number generator is unavailable.');
  }
  
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset[array[i] % charset.length];
  }
  
  // Ensure it meets privileged requirements: upper, lower, digit, symbol
  if (!validatePassword(password, true).isValid) {
    return generateSecurePassword(length);
  }
  
  return password;
}

const OBVIOUS_PATTERNS: RegExp[] = [
  /^(.)\1+$/, /^(?:012|123|234|345|456|567|678|789|890)+/,
  /password/i, /qwerty/i, /^yalla\d*!?$/i,
];

export function validatePassword(password: string, isPrivilegedRole: boolean = false): { isValid: boolean; message: string } {
  const minLength = isPrivilegedRole ? 12 : 8;
  if (!password || password.length < minLength) {
    return { isValid: false, message: `Password must be at least ${minLength} characters long.` };
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password)) {
    return { isValid: false, message: 'Password must contain both uppercase and lowercase letters.' };
  }
  if (!/[0-9]/.test(password)) {
    return { isValid: false, message: 'Password must contain at least one digit.' };
  }
  if (isPrivilegedRole && !/[!@#$%^&*()_+~`|}{[\]:;?><,./\-=]/.test(password)) {
    return { isValid: false, message: 'Privileged accounts (admin/seller) require at least one special symbol.' };
  }
  
  if (OBVIOUS_PATTERNS.some(re => re.test(password))) {
    return { isValid: false, message: 'Password is too predictable.' };
  }

  return { isValid: true, message: 'Valid password.' };
}
