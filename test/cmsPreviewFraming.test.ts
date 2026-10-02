import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// CMS Studio shows the storefront in an iframe of the same site. The site's
// security headers used to forbid every frame (frame-src listed only the
// Turnstile host, frame-ancestors was 'none' and X-Frame-Options DENY), so the
// preview pane was refused by the browser. Checked in Chromium with these exact
// values: "Refused to frame ... frame-src". Now only a request with
// ?cmsPreview=1 may be framed, and only by the same site.
type Condition = { type: string; key: string; value?: string };
type Rule = { source: string; has?: Condition[]; missing?: Condition[]; headers: { key: string; value: string }[] };
const vercel = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'vercel.json'), 'utf8')) as { headers: Rule[] };

// Vercel's matching, for the two kinds of condition used here.
const satisfied = (c: Condition, query: URLSearchParams) =>
  c.type === 'query' && query.has(c.key) && (c.value === undefined || query.get(c.key) === c.value);
const matches = (rule: Rule, url: string) => {
  const { pathname, searchParams } = new URL(url, 'https://shop.example');
  return new RegExp(`^${rule.source.replace('(.*)', '.*')}$`).test(pathname)
    && (rule.has ?? []).every(c => satisfied(c, searchParams))
    && !(rule.missing ?? []).some(c => satisfied(c, searchParams));
};
const headersFor = (url: string) => {
  const out: Record<string, string> = {};
  for (const rule of vercel.headers.filter(r => matches(r, url))) for (const h of rule.headers) out[h.key] = h.value;
  return out;
};
const directive = (csp: string, name: string) => csp.split(';').map(s => s.trim()).find(s => s === name || s.startsWith(`${name} `));

const pageRules = vercel.headers.filter(r => r.source === '/(.*)');

describe('the two header rules for pages', () => {
  it('there are two, and exactly one applies to any address', () => {
    expect(pageRules).toHaveLength(2);
    for (const url of ['/', '/products', '/checkout?x=1', '/?cmsPreview=1', '/products?cmsPreview=1&lang=ar', '/?cmsPreview=0', '/?cmsPreview=', '/?cmsPreviewX=1', '/assets/main-abc.js']) {
      expect(pageRules.filter(r => matches(r, url)), url).toHaveLength(1);
    }
  });

  it('they differ only in who may frame the page', () => {
    const [normal, preview] = pageRules;
    const swap = (rule: Rule, framing: { csp: string; xfo: string }) => rule.headers.map(h =>
      h.key === 'Content-Security-Policy' ? { ...h, value: h.value.replace(framing.csp, 'FRAMING') }
        : h.key === 'X-Frame-Options' ? { ...h, value: 'FRAMING' } : h);
    expect(swap(normal, { csp: "frame-ancestors 'none'", xfo: 'DENY' })).toEqual(swap(preview, { csp: "frame-ancestors 'self'", xfo: 'SAMEORIGIN' }));
  });
});

describe('who may frame what', () => {
  it('no ordinary page can be framed by anyone', () => {
    for (const url of ['/', '/products', '/checkout', '/account', '/admin', '/?lang=ar', '/?cmsPreview=0']) {
      const h = headersFor(url);
      expect(directive(h['Content-Security-Policy'], 'frame-ancestors'), url).toBe("frame-ancestors 'none'");
      expect(h['X-Frame-Options'], url).toBe('DENY');
    }
  });

  it('a preview request can be framed by this site only', () => {
    for (const url of ['/?cmsPreview=1', '/?cmsPreview=1&lang=en', '/products?cmsPreview=1&lang=ar', '/checkout?cmsPreview=1']) {
      const h = headersFor(url);
      expect(directive(h['Content-Security-Policy'], 'frame-ancestors'), url).toBe("frame-ancestors 'self'");
      expect(h['X-Frame-Options'], url).toBe('SAMEORIGIN');
    }
  });

  it('every page may frame itself (the Studio) and the Turnstile widget, nothing else', () => {
    for (const url of ['/', '/?cmsPreview=1']) {
      expect(directive(headersFor(url)['Content-Security-Policy'], 'frame-src')).toBe("frame-src 'self' https://challenges.cloudflare.com");
    }
  });

  it('the rest of the policy is untouched', () => {
    const csp = headersFor('/')['Content-Security-Policy'];
    expect(directive(csp, 'script-src')).toBe("script-src 'self' https://challenges.cloudflare.com");
    expect(directive(csp, 'object-src')).toBe("object-src 'none'");
    expect(directive(csp, 'default-src')).toBe("default-src 'self'");
    expect(directive(csp, 'script-src')).not.toContain('unsafe-inline');
    for (const url of ['/', '/?cmsPreview=1']) {
      const h = headersFor(url);
      expect(h['Strict-Transport-Security']).toContain('max-age=63072000');
      expect(h['X-Content-Type-Options']).toBe('nosniff');
      expect(h['Cross-Origin-Opener-Policy']).toBe('same-origin');
      expect(h['Cross-Origin-Resource-Policy']).toBe('same-origin');
    }
  });
});
