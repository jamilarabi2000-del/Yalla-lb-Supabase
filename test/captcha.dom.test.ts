// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Sign-in forms ask Cloudflare Turnstile for a token before each Supabase
// Auth call -- once VITE_TURNSTILE_SITE_KEY is set. Until then nothing
// changes, so turning the Supabase setting on is the only step that can
// break sign-in, and it must come after the site key.

type Options = Record<string, (arg?: string) => void> & Record<string, unknown>;

function fakeTurnstile() {
  let options: Options | null = null;
  const api = {
    render: vi.fn((_el: HTMLElement, opts: Options) => { options = opts; return 'w1'; }),
    execute: vi.fn(),
    reset: vi.fn(),
    solve: (token: string) => (options!.callback as (t: string) => void)(token),
    fail: () => (options!['error-callback'] as () => void)(),
    options: () => options,
  };
  return api;
}

async function loadWithKey(key: string) {
  vi.stubEnv('VITE_TURNSTILE_SITE_KEY', key);
  return import('../src/lib/captcha');
}

beforeEach(() => {
  vi.resetModules();
  delete window.turnstile;
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('while no site key is set', () => {
  it('asks for nothing and loads nothing', async () => {
    const captcha = await loadWithKey('');
    expect(captcha.captchaEnabled()).toBe(false);
    await expect(captcha.getCaptchaToken()).resolves.toBeUndefined();
    expect(document.querySelector('script')).toBeNull();
  });
});

describe('with a site key', () => {
  it('gets a fresh token from one invisible widget for every call', async () => {
    const turnstile = fakeTurnstile();
    window.turnstile = turnstile as never;
    const captcha = await loadWithKey('0x4AAA-test');

    const first = captcha.getCaptchaToken();
    await vi.waitFor(() => expect(turnstile.execute).toHaveBeenCalledTimes(1));
    expect(turnstile.options()).toMatchObject({ sitekey: '0x4AAA-test', execution: 'execute', appearance: 'interaction-only' });
    turnstile.solve('token-1');
    await expect(first).resolves.toBe('token-1');

    const second = captcha.getCaptchaToken();
    await vi.waitFor(() => expect(turnstile.execute).toHaveBeenCalledTimes(2));
    turnstile.solve('token-2');
    await expect(second).resolves.toBe('token-2');

    expect(turnstile.render).toHaveBeenCalledTimes(1);
    expect(turnstile.reset).toHaveBeenCalledTimes(2); // tokens are single-use
    expect(document.getElementById('yalla-captcha')!.hasAttribute('data-yalla-editor')).toBe(true);
  });

  it('reports a failed challenge instead of signing in without a token', async () => {
    const turnstile = fakeTurnstile();
    window.turnstile = turnstile as never;
    const captcha = await loadWithKey('0x4AAA-test');
    const attempt = captcha.getCaptchaToken();
    await vi.waitFor(() => expect(turnstile.execute).toHaveBeenCalled());
    turnstile.fail();
    await expect(attempt).rejects.toThrow(captcha.CAPTCHA_FAILED);
  });

  it('gives up after 90 seconds rather than leaving the button spinning', async () => {
    vi.useFakeTimers();
    const turnstile = fakeTurnstile();
    window.turnstile = turnstile as never;
    const captcha = await loadWithKey('0x4AAA-test');
    const attempt = captcha.getCaptchaToken();
    const outcome = attempt.catch((e: Error) => e.message);
    await vi.waitFor(() => expect(turnstile.execute).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(90_000);
    await expect(outcome).resolves.toBe(captcha.CAPTCHA_FAILED);
  });

  it('says so when the Turnstile script cannot load, and tries again next time', async () => {
    const captcha = await loadWithKey('0x4AAA-test');
    const attempt = captcha.getCaptchaToken();
    const script = document.querySelector('script') as HTMLScriptElement;
    expect(script.src).toBe('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit');
    script.onerror!(new Event('error'));
    await expect(attempt).rejects.toThrow(captcha.CAPTCHA_UNAVAILABLE);

    void captcha.getCaptchaToken().catch(() => {});
    expect(document.querySelectorAll('script')).toHaveLength(2);
  });
});

describe('every Supabase Auth call that accepts a token sends one', () => {
  const sources = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? sources(p) : /\.(ts|tsx)$/.test(d.name) ? [p] : [];
  });

  /** The argument list of each call to `name`, balanced on parentheses. */
  const calls = (text: string, name: string) => {
    const out: string[] = [];
    for (let i = text.indexOf(name); i !== -1; i = text.indexOf(name, i + 1)) {
      let depth = 0;
      let j = text.indexOf('(', i);
      const start = j;
      for (; j < text.length; j++) {
        if (text[j] === '(') depth++;
        else if (text[j] === ')' && --depth === 0) break;
      }
      out.push(text.slice(start, j + 1));
    }
    return out;
  };

  it.each(['signInWithPassword', 'signUp', 'signInWithOtp', 'resetPasswordForEmail', 'resend'])('auth.%s', method => {
    let seen = 0;
    for (const file of sources('src')) {
      const text = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
      for (const args of calls(text, `supabase.auth.${method}(`)) {
        seen++;
        expect(args, `${file}: supabase.auth.${method}${args.slice(0, 60)}`).toMatch(/captchaToken:\s*await getCaptchaToken\(\)/);
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('the security headers let the Turnstile widget load', () => {
    const csp = fs.readFileSync(path.resolve(process.cwd(), 'vercel.json'), 'utf8');
    expect(csp).toMatch(/script-src 'self' https:\/\/challenges\.cloudflare\.com;/);
    expect(csp).toMatch(/frame-src https:\/\/challenges\.cloudflare\.com;/);
  });
});
