// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { showCrashScreen } from '../src/lib/crashScreen';

// Three pieces of error handling did not do what they appeared to:
// - main.tsx swallowed ANY error whose message contained "closing", "hidden",
//   "abort" or "indexeddb" (and stopped every other listener from seeing it).
//   It was written for Firebase/IndexedDB errors; no such code remains, so what
//   it hid was the app's own errors, such as "Cannot read properties of
//   undefined (reading 'hidden')". It is gone.
// - index.html carried a copy as an inline script, which the site's Content
//   Security Policy refuses ("Refused to execute inline script"), so it never ran.
// - The crash screen's Refresh button used an inline onclick="...", refused the
//   same way, so pressing it did nothing.
const read = (f: string) => fs.readFileSync(path.resolve(process.cwd(), f), 'utf8');

describe('the entry module no longer hides errors', () => {
  it('an error is left alone whatever words its message contains', async () => {
    vi.doMock('../src/App.tsx', () => ({ default: () => null }));
    vi.doMock('../src/components/SessionSecurityGuard', () => ({ SessionSecurityGuard: () => null }));
    document.body.innerHTML = '<div id="root"></div>';
    await import('../src/main.tsx');

    // The test runner marks an error event as handled itself, so what the app
    // did is read first, by a capture listener added after the app's own would
    // have been (a filter would have run before it, and cancelled or stopped it).
    const seen: { type: string; message: string; prevented: boolean }[] = [];
    const record = (event: Event) => {
      const message = (event as ErrorEvent).message ?? String((event as Event & { reason?: Error }).reason?.message);
      seen.push({ type: event.type, message, prevented: event.defaultPrevented });
      event.preventDefault();   // keep the runner from reporting the pretend error
    };
    window.addEventListener('error', record, true);
    window.addEventListener('unhandledrejection', record, true);

    const messages = [
      "Cannot read properties of undefined (reading 'hidden')",
      'Order placement aborted: stock changed',
      'database is closing',
      'IndexedDB: a request failed',
      'The shop is closing early today',
    ];
    try {
      for (const message of messages) {
        window.dispatchEvent(new ErrorEvent('error', { message, error: new Error(message), cancelable: true }));
        window.dispatchEvent(Object.assign(new Event('unhandledrejection', { cancelable: true }), { reason: new Error(message) }));
      }
    } finally {
      window.removeEventListener('error', record, true);
      window.removeEventListener('unhandledrejection', record, true);
    }

    // every event reached the listener (nothing stopped it) and arrived untouched
    expect(seen).toHaveLength(messages.length * 2);
    for (const entry of seen) expect(entry.prevented, `${entry.type}: ${entry.message}`).toBe(false);
  });

  it('no source file keeps a filter that stops other listeners from seeing an error', () => {
    const walk = (dir: string): string[] => fs.readdirSync(path.resolve(process.cwd(), dir), { withFileTypes: true })
      .flatMap(e => e.isDirectory() ? walk(`${dir}/${e.name}`) : /\.(tsx?|html)$/.test(e.name) ? [`${dir}/${e.name}`] : []);
    for (const file of [...walk('src'), 'index.html']) {
      const text = read(file);
      expect(text, file).not.toMatch(/addEventListener\(\s*['"]unhandledrejection['"]/);
      expect(text, file).not.toMatch(/stopImmediatePropagation/);
    }
  });
});

describe('what the Content Security Policy refuses stays out of the page', () => {
  it('index.html has no inline script, only the app module', () => {
    const scripts = [...read('index.html').matchAll(/<script\b[^>]*>/g)].map(m => m[0]);
    expect(scripts).toEqual(['<script type="module" src="/src/main.tsx">']);
  });

  it('no HTML written from code carries an inline event-handler attribute', () => {
    const walk = (dir: string): string[] => fs.readdirSync(path.resolve(process.cwd(), dir), { withFileTypes: true })
      .flatMap(e => e.isDirectory() ? walk(`${dir}/${e.name}`) : /\.(tsx?|html)$/.test(e.name) ? [`${dir}/${e.name}`] : []);
    // lower-case attribute names written as text (onclick="..."); JSX props are camelCase and are not matched
    for (const file of [...walk('src'), 'index.html']) {
      expect(read(file), file).not.toMatch(/\son[a-z]+\s*=\s*["'`]/);
    }
  });

  it('the policy still has no unsafe-inline for scripts', () => {
    const vercel = JSON.parse(read('vercel.json')) as { headers: { headers: { key: string; value: string }[] }[] };
    for (const rule of vercel.headers) {
      const csp = rule.headers.find(h => h.key === 'Content-Security-Policy')?.value;
      if (csp) expect(csp.split(';').find(d => d.trim().startsWith('script-src'))).not.toContain('unsafe-inline');
    }
  });
});

describe('the crash screen', () => {
  const show = (reload: () => void) => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    showCrashScreen(root, reload);
    return root;
  };

  it('has a Refresh button that reloads the page when pressed', () => {
    const reload = vi.fn();
    const root = show(reload);
    const button = root.querySelector('button') as HTMLButtonElement;
    expect(button.textContent).toBe('Refresh Storefront');
    button.click();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('wires nothing through attributes, which the policy would refuse', () => {
    const root = show(vi.fn());
    for (const el of root.querySelectorAll('*')) {
      expect([...el.attributes].map(a => a.name).filter(n => n.startsWith('on')), el.tagName).toEqual([]);
    }
  });

  it('says what it is', () => {
    const root = show(vi.fn());
    expect(root.textContent).toContain('Yalla Marketplace');
    expect(root.textContent).toContain('Preparing your marketplace experience...');
  });

  it('main.tsx shows it, reloading the real page', () => {
    expect(read('src/main.tsx')).toContain('showCrashScreen(rootElement, () => window.location.reload());');
  });
});
