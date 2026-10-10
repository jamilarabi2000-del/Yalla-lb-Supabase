import { describe, it, expect } from 'vitest';
import { classify, checkCaptcha } from '../scripts/check-captcha.mjs';

// The owner's one-request check that CAPTCHA is on. It must never report "on" for an answer that does not say so.
describe('reading the sign-in endpoint\'s answer', () => {
  it('captcha_failed means CAPTCHA is on', () => {
    expect(classify(400, { code: 400, error_code: 'captcha_failed', msg: 'captcha protection: request disallowed (not-provided)' }).state).toBe('on');
    expect(classify(400, { msg: 'captcha verification process failed' }).state).toBe('on');
  });
  it('invalid_credentials means it looked at the credentials without asking for a token: off', () => {
    expect(classify(400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' }).state).toBe('off');
    expect(classify(400, { msg: 'Invalid login credentials' }).state).toBe('off');
  });
  it('anything else is "could not tell", including rate limits, server errors and non-JSON', () => {
    expect(classify(429, { error_code: 'over_request_rate_limit' }).state).toBe('unknown');
    expect(classify(500, { msg: 'boom' }).state).toBe('unknown');
    expect(classify(200, { access_token: 'x' }).state).toBe('unknown');
    expect(classify(502, null).state).toBe('unknown');
  });
});

describe('the request it makes', () => {
  it('is one password sign-in for a made-up address, with no CAPTCHA token, using only the public key', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return { status: 400, json: async () => ({ error_code: 'captcha_failed' }) } as Response;
    }) as unknown as typeof fetch;
    const result = await checkCaptcha('https://abc.supabase.co/', 'sb_publishable_x', fake);
    expect(result.state).toBe('on');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://abc.supabase.co/auth/v1/token?grant_type=password');
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.headers).toEqual({ apikey: 'sb_publishable_x', 'Content-Type': 'application/json' });
    const body = JSON.parse(String(calls[0].init.body));
    expect(Object.keys(body).sort()).toEqual(['email', 'password']);   // no gotrue_meta_security / captcha token
    expect(body.email).toMatch(/@example\.com$/);
  });
  it('treats a non-JSON answer as "could not tell"', async () => {
    const fake = (async () => ({ status: 503, json: async () => { throw new Error('not json'); } })) as unknown as typeof fetch;
    expect((await checkCaptcha('https://abc.supabase.co', 'k', fake)).state).toBe('unknown');
  });
});
