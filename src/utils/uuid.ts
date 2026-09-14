/**
 * Cryptographically strong RFC 4122 v4 UUID helpers.
 * Uses native crypto.randomUUID() or crypto.getRandomValues().
 * Fails closed without falling back to Math.random().
 */
export function generateUuidV4(): string {
  return generateIdempotencyKey();
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

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
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  }
  throw new Error('Security Error: No cryptographically secure random number generator available. Failing closed.');
}

export function secureRandomInt(min: number, max: number): number {
  if (!Number.isInteger(min) || !Number.isInteger(max) || max <= min) {
    throw new Error('Invalid secure random integer range.');
  }
  const cryptoObj = (typeof window !== 'undefined' && window.crypto) || (typeof globalThis !== 'undefined' && globalThis.crypto);
  if (!cryptoObj || typeof cryptoObj.getRandomValues !== 'function') {
    throw new Error('Security Error: Cryptographically secure random number generator not available.');
  }
  const range = max - min;
  const limit = Math.floor(0x100000000 / range) * range;
  const bytes = new Uint32Array(1);
  do {
    cryptoObj.getRandomValues(bytes);
  } while (bytes[0] >= limit);
  return min + (bytes[0] % range);
}

export function secureRandomString(length: number): string {
  if (!Number.isInteger(length) || length < 0) throw new Error('Invalid secure random string length.');
  const cryptoObj = (typeof window !== 'undefined' && window.crypto) || (typeof globalThis !== 'undefined' && globalThis.crypto);
  if (!cryptoObj || typeof cryptoObj.getRandomValues !== 'function') {
    throw new Error('Security Error: Cryptographically secure random number generator not available.');
  }
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const result: string[] = [];
  const bytes = new Uint8Array(length);
  cryptoObj.getRandomValues(bytes);
  for (let i = 0; i < length; i++) result.push(chars[bytes[i] % chars.length]);
  return result.join('');
}
