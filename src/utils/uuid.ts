/**
 * Cryptographically strong RFC 4122 v4 UUID generator for idempotency keys.
 * Uses native crypto.randomUUID() or crypto.getRandomValues().
 * Fails closed without falling back to Math.random().
 */
export function generateIdempotencyKey(): string {
  if (typeof window !== 'undefined' && window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  if (typeof globalThis !== 'undefined' && globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  const cryptoObj = (typeof window !== 'undefined' && window.crypto) || (typeof globalThis !== 'undefined' && globalThis.crypto);
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    cryptoObj.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant RFC4122
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  }
  throw new Error('Security Error: No cryptographically secure random number generator available. Failing closed.');
}

export function secureRandomInt(min: number, max: number): number {
  const cryptoObj = (typeof window !== 'undefined' && window.crypto) || (typeof globalThis !== 'undefined' && globalThis.crypto);
  if (!cryptoObj || typeof cryptoObj.getRandomValues !== 'function') {
    throw new Error('Security Error: Cryptographically secure random number generator not available.');
  }
  const range = max - min;
  const bytes = new Uint32Array(1);
  cryptoObj.getRandomValues(bytes);
  return min + (bytes[0] % range);
}

export function secureRandomString(length: number): string {
  const cryptoObj = (typeof window !== 'undefined' && window.crypto) || (typeof globalThis !== 'undefined' && globalThis.crypto);
  if (!cryptoObj || typeof cryptoObj.getRandomValues !== 'function') {
    throw new Error('Security Error: Cryptographically secure random number generator not available.');
  }
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(length);
  cryptoObj.getRandomValues(bytes);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}


