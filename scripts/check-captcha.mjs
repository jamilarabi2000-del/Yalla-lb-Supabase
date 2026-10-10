#!/usr/bin/env node
/**
 * Is CAPTCHA protection switched on in Supabase Auth? One request, nothing created, nobody emailed.
 *
 * It asks the sign-in endpoint for a password sign-in with a made-up address and NO CAPTCHA token:
 *   - CAPTCHA on  -> Supabase refuses before it looks at the credentials: error_code "captcha_failed".
 *   - CAPTCHA off -> it looks at the credentials and says they are wrong: "invalid_credentials".
 * A single failed sign-in for an address that does not exist; it adds nothing to the database.
 *
 *   VITE_SUPABASE_URL=https://<project>.supabase.co VITE_SUPABASE_PUBLISHABLE_KEY=<publishable key> \
 *     node scripts/check-captcha.mjs
 *
 * Both values are the public ones the website itself uses (never the secret or service-role key).
 * Exit code: 0 = on, 3 = off, 2 = could not tell.
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/** @returns {{ state: 'on' | 'off' | 'unknown', why: string }} */
export function classify(status, body) {
  const code = String(body?.error_code ?? body?.code ?? '').toLowerCase();
  const message = String(body?.msg ?? body?.message ?? body?.error_description ?? '').toLowerCase();
  if (code === 'captcha_failed' || message.includes('captcha')) {
    return { state: 'on', why: 'Supabase refused the sign-in for want of a CAPTCHA token.' };
  }
  if (code === 'invalid_credentials' || message.includes('invalid login credentials')) {
    return { state: 'off', why: 'Supabase looked at the credentials without asking for a CAPTCHA token.' };
  }
  if (status === 429 || code.includes('rate_limit')) {
    return { state: 'unknown', why: 'Supabase is rate limiting this address; try again in a few minutes.' };
  }
  return { state: 'unknown', why: `Unexpected answer (HTTP ${status}, ${code || 'no error code'}).` };
}

export async function checkCaptcha(url, key, fetchImpl = fetch) {
  const response = await fetchImpl(`${url.replace(/\/+$/, '')}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'captcha-check@example.com', password: 'not-a-real-password' }),
  });
  let body = null;
  try { body = await response.json(); } catch { /* not JSON: classified as unknown */ }
  return { status: response.status, ...classify(response.status, body) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    console.error('Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (the public values the website uses).');
    process.exit(2);
  }
  checkCaptcha(url, key).then(result => {
    const label = { on: 'CAPTCHA is ON', off: 'CAPTCHA is OFF', unknown: 'Could not tell' }[result.state];
    console.log(`${label}: ${result.why}`);
    process.exit({ on: 0, off: 3, unknown: 2 }[result.state]);
  }).catch(err => {
    console.error(`Could not reach Supabase: ${err.message}`);
    process.exit(2);
  });
}
