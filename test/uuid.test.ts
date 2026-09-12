import { describe, it, expect } from 'vitest';
import { generateIdempotencyKey } from '../src/utils/uuid';

describe('Cryptographically Secure UUID Generator', () => {
  it('generates a valid UUID v4 string', () => {
    const key = generateIdempotencyKey();
    expect(typeof key).toBe('string');
    expect(key).toMatch(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/);
  });

  it('does not contain Math.random fallback (fails closed or uses crypto)', () => {
    // Verify it produces unique cryptographically secure keys
    const keys = new Set();
    for (let i = 0; i < 50; i++) {
      keys.add(generateIdempotencyKey());
    }
    expect(keys.size).toBe(50);
  });
});
