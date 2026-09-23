/**
 * Bot protection for signing in, signing up, email links, SMS codes and
 * password resets.
 *
 * Off until VITE_TURNSTILE_SITE_KEY is set to a (free) Cloudflare Turnstile
 * site key: until then every call below gets no token and nothing changes.
 * Once it is set, each Supabase Auth call that accepts a captchaToken asks
 * for a fresh one first, and Supabase -- with CAPTCHA protection turned on
 * and the matching secret key -- refuses attempts without a valid token, so a
 * script cannot try passwords or send codes at volume. Turn the site key on
 * before the Supabase setting, or sign-in stops working in between.
 *
 * One invisible widget serves every form. Turnstile decides on its own; it
 * shows itself, bottom-centre, only when it wants the person to click.
 */
import { EDITOR_ATTR } from './textStyleDom';

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const CAPTCHA_TIMEOUT_MS = 90_000;

interface Turnstile {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  execute(widgetId: string): void;
  reset(widgetId: string): void;
}

declare global {
  interface Window { turnstile?: Turnstile }
}

const siteKey = () => String(import.meta.env.VITE_TURNSTILE_SITE_KEY ?? '').trim();

export const captchaEnabled = () => siteKey().length > 0;

export const CAPTCHA_UNAVAILABLE =
  'The security check could not load. Check your connection, or turn off content blockers for this site, and try again.';
export const CAPTCHA_FAILED = 'The security check did not complete. Please try again.';

let scriptLoad: Promise<Turnstile> | null = null;

function loadTurnstile(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  scriptLoad ??= new Promise<Turnstile>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error(CAPTCHA_UNAVAILABLE)));
    script.onerror = () => reject(new Error(CAPTCHA_UNAVAILABLE));
    document.head.appendChild(script);
  }).catch(err => {
    scriptLoad = null; // let the next attempt load it again
    throw err;
  });
  return scriptLoad;
}

interface Widget {
  id: string;
  resolve: ((token: string) => void) | null;
  reject: ((err: Error) => void) | null;
}

let widget: Widget | null = null;

function settle(outcome: { token: string } | { error: Error }) {
  if (!widget) return;
  const { resolve, reject } = widget;
  widget.resolve = widget.reject = null;
  if ('token' in outcome) resolve?.(outcome.token);
  else reject?.(outcome.error);
}

function ensureWidget(turnstile: Turnstile): Widget {
  if (widget) return widget;
  const host = document.createElement('div');
  host.id = 'yalla-captcha';
  // Not page text: the click-to-style editor leaves it alone.
  host.setAttribute(EDITOR_ATTR, '');
  host.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:10001';
  document.body.appendChild(host);
  widget = { id: '', resolve: null, reject: null };
  widget.id = turnstile.render(host, {
    sitekey: siteKey(),
    execution: 'execute',
    appearance: 'interaction-only',
    callback: (token: string) => settle({ token }),
    'error-callback': () => settle({ error: new Error(CAPTCHA_FAILED) }),
    'timeout-callback': () => settle({ error: new Error(CAPTCHA_FAILED) }),
  });
  return widget;
}

/**
 * A fresh, single-use token for one Supabase Auth call, or undefined while
 * CAPTCHA is off. Call it right before each request -- including each retry
 * -- because Supabase accepts a token once.
 */
export async function getCaptchaToken(): Promise<string | undefined> {
  if (!captchaEnabled()) return undefined;
  const turnstile = await loadTurnstile();
  const current = ensureWidget(turnstile);
  return new Promise<string>((resolve, reject) => {
    // A newer request replaces an unfinished one.
    current.reject?.(new Error(CAPTCHA_FAILED));
    // A challenge nobody answers must not leave a sign-in button spinning.
    const timer = window.setTimeout(() => settle({ error: new Error(CAPTCHA_FAILED) }), CAPTCHA_TIMEOUT_MS);
    current.resolve = token => { window.clearTimeout(timer); resolve(token); };
    current.reject = err => { window.clearTimeout(timer); reject(err); };
    turnstile.reset(current.id);
    turnstile.execute(current.id);
  });
}
