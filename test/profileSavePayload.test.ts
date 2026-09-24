import { describe, it, expect } from 'vitest';
import { sanitizeDocumentData, redactPII } from '../src/utils/databaseMonitor';

// updateUser sends its payload through sanitizeDocumentData on the way to
// public.profiles. It was once the log redactor, so every saved profile had
// its email, phone and names stored as the text "[REDACTED_PII]".
describe('what a profile save sends to the database', () => {
  it('keeps email, phone and names as typed, dropping only undefined values', () => {
    const profile = {
      name: 'Rima Haddad', firstName: 'Rima', lastName: 'Haddad', email: 'rima@example.com', phone: '+961 70123456',
      defaultCity: 'Beirut', defaultAddress: 'Gouraud St', defaultBuilding: undefined,
      nested: { keep: 1, drop: undefined }, list: [{ a: 1, b: undefined }],
    };
    const sent = sanitizeDocumentData(profile);
    expect(sent).toEqual({
      name: 'Rima Haddad', firstName: 'Rima', lastName: 'Haddad', email: 'rima@example.com', phone: '+961 70123456',
      defaultCity: 'Beirut', defaultAddress: 'Gouraud St', nested: { keep: 1 }, list: [{ a: 1 }],
    });
    expect('defaultBuilding' in sent).toBe(false);
    expect(JSON.stringify(sent)).not.toContain('REDACTED');
    // The caller's object is left as it was.
    expect(profile.defaultBuilding).toBeUndefined();
    expect('defaultBuilding' in profile).toBe(true);
  });

  it('leaves dates, nulls and plain values alone', () => {
    const when = new Date('2026-09-24T00:00:00Z');
    const sent = sanitizeDocumentData({ when, cleared: null });
    expect(sent.when).toBe(when);
    expect(sent.cleared).toBeNull();
    expect(sanitizeDocumentData(null)).toBeNull();
    expect(sanitizeDocumentData('x')).toBe('x');
  });

  it('still redacts, but only for logs', () => {
    expect(redactPII({ email: 'rima@example.com', city: 'Beirut' })).toEqual({ email: '[REDACTED_PII]', city: 'Beirut' });
    expect(sanitizeDocumentData).not.toBe(redactPII);
  });
});
