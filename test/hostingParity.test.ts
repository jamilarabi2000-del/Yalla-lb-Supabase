import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// The site may move from Vercel to an Apache or LiteSpeed host (for example Hostinger). vercel.json is what Vercel
// reads; public/.htaccess is what such a host reads (Vite copies it to the root of the built site). The protections
// must be the same on both, so this fails if they ever differ. What it can NOT prove: how a real Apache or LiteSpeed
// server answers. It compares the two files' rules, and runs the one pattern they share (the preview query) here.
const read = (f: string) => fs.readFileSync(path.resolve(process.cwd(), f), 'utf8');
type Rule = {
  source: string;
  has?: { key: string; value?: string }[];
  missing?: { key: string; value?: string }[];
  headers: { key: string; value: string }[];
};
const vercel = JSON.parse(read('vercel.json')) as { headers: Rule[]; rewrites: { source: string; destination: string }[] };
const htaccess = read('public/.htaccess');
const code = htaccess.split('\n').filter(line => !/^\s*#/.test(line)).join('\n');

const vercelPage = (preview: boolean) => {
  const rule = vercel.headers.find(r => r.source === '/(.*)' && (preview ? r.has : r.missing))!;
  return Object.fromEntries(rule.headers.map(h => [h.key, h.value]));
};

const headerLines = [...code.matchAll(/^\s*Header always set (\S+) "((?:[^"\\]|\\.)*)"(?: env=(\S+))?\s*$/gm)]
  .map(m => ({ name: m[1], value: m[2], env: m[3] ?? null }));
/** What the host sends on a page, given whether the request is the CMS preview (CMS_PREVIEW set). */
const apachePage = (preview: boolean) => {
  const out: Record<string, string> = {};
  for (const line of headerLines) {
    const applies = line.env === null || (line.env === 'CMS_PREVIEW' && preview) || (line.env === '!CMS_PREVIEW' && !preview);
    if (!applies) continue;
    expect(out[line.name], `${line.name} is set twice for one request`).toBeUndefined();
    out[line.name] = line.value;
  }
  return out;
};

describe('the security headers on a page are the same on Vercel and on an Apache/LiteSpeed host', () => {
  it('for an ordinary page', () => { expect(apachePage(false)).toEqual(vercelPage(false)); });
  it('for the CMS preview, the only page that may be framed (and only by this site)', () => { expect(apachePage(true)).toEqual(vercelPage(true)); });
  it('and an ordinary page cannot be framed by anyone', () => {
    const h = apachePage(false);
    expect(h['X-Frame-Options']).toBe('DENY');
    expect(h['Content-Security-Policy']).toContain("frame-ancestors 'none'");
  });
  it('without any of the rules being optional: every header is set with `always`, so error pages carry them too', () => {
    expect(code).not.toMatch(/^\s*Header (set|add|merge|append) (Content-Security-Policy|Strict-Transport-Security|X-Frame-Options|X-Content-Type-Options)/m);
  });
});

describe('the CMS preview exception', () => {
  const pattern = code.match(/^\s*SetEnvIf Query_String "([^"]+)" CMS_PREVIEW=1\s*$/m)?.[1];
  const matches = (query: string) => new RegExp(pattern!).test(query);
  it('is decided by the query string alone, with one rule', () => {
    expect(pattern).toBeDefined();
    expect(code.match(/SetEnvIf/g)).toHaveLength(1);
  });
  it('matches cmsPreview=1 as Vercel does (a query key with exactly the value 1), wherever it sits in the query', () => {
    for (const q of ['cmsPreview=1', 'cmsPreview=1&lang=ar', 'lang=ar&cmsPreview=1', 'a=1&cmsPreview=1&b=2']) expect(matches(q), q).toBe(true);
  });
  it('and nothing else: another value, another key, or a longer key', () => {
    for (const q of ['', 'cmsPreview=0', 'cmsPreview=', 'cmsPreview=10', 'cmsPreview=1x', 'xcmsPreview=1', 'cmsPreviewX=1', 'a=cmsPreview=1', 'lang=ar']) expect(matches(q), q).toBe(false);
  });
});

describe('app files and the page itself are cached as on Vercel', () => {
  const immutable = vercel.headers.find(r => r.source === '/assets/(.*)')!.headers.find(h => h.key === 'Cache-Control')!.value;
  it('the hashed files under /assets get the same one-year immutable value, and only when the request was for /assets', () => {
    expect(code).toContain(`Header set Cache-Control "${immutable}" env=YALLA_HASHED_ASSET`);
    expect(code.match(/E=YALLA_HASHED_ASSET/g)).toHaveLength(1);
    expect(code).toContain('RewriteRule ^assets/ - [E=YALLA_HASHED_ASSET:1]');
    expect(code.replace(immutable, '')).not.toContain('max-age=31536000');   // the year-long value appears nowhere else
  });
  it('marks the request before the "real file" rule ends rewriting, or existing files would never be marked', () => {
    expect(code.indexOf('E=YALLA_HASHED_ASSET')).toBeGreaterThan(-1);
    expect(code.indexOf('E=YALLA_HASHED_ASSET')).toBeLessThan(code.indexOf('REQUEST_FILENAME} -f'));
  });
  it('the page is always re-checked, so a new deployment is picked up at once', () => {
    expect(code).toMatch(/<FilesMatch "\\\.html\$">\s*Header set Cache-Control "public, max-age=0, must-revalidate"\s*<\/FilesMatch>/);
  });
  it('nothing in public/ can land under /assets unhashed and be cached for a year', () => {
    expect(fs.existsSync(path.resolve(process.cwd(), 'public/assets'))).toBe(false);
  });
});

describe('every address is the app, except a missing file under /assets', () => {
  const fallback = vercel.rewrites.at(-1)!;
  it('Vercel sends everything but /assets/* to index.html', () => {
    expect(fallback).toEqual({ source: '/((?!assets/).*)', destination: '/index.html' });
  });
  it('the Apache rules do the same: real files and folders as they are, then everything outside /assets to /index.html', () => {
    const steps = code.split('\n').map(l => l.trim()).filter(l => /^Rewrite(Cond|Rule)/.test(l));
    expect(steps).toEqual([
      'RewriteRule ^assets/ - [E=YALLA_HASHED_ASSET:1]',
      'RewriteCond %{REQUEST_FILENAME} -f [OR]',
      'RewriteCond %{REQUEST_FILENAME} -d',
      'RewriteRule ^ - [L]',
      'RewriteCond %{REQUEST_URI} !^/assets/',
      'RewriteRule ^ /index.html [L]',
    ]);
  });
  it('the two excluded-path patterns agree on a set of addresses', () => {
    const vercelPattern = new RegExp(`^${fallback.source}$`);
    const apacheExcluded = new RegExp(code.match(/RewriteCond %\{REQUEST_URI\} !(\S+)/)![1]);
    for (const p of ['/', '/products', '/admin', '/admin/x', '/account', '/assetsy', '/assets', '/assets/main-abc123.js', '/assets/AdminView-ClvOCIUk.js', '/x/assets/y']) {
      expect(!apacheExcluded.test(p), p).toBe(vercelPattern.test(p));
    }
  });
});

describe('the file does what its comment says it leaves out, and nothing riskier', () => {
  it('does not list folders', () => { expect(code).toMatch(/^Options -Indexes$/m); });
  it('does not redirect http to https itself (the host switch does; a redirect behind Cloudflare can loop)', () => {
    expect(code).not.toMatch(/%\{HTTPS\}|%\{HTTP:X-Forwarded-Proto\}|R=30[12]/i);
  });
  it('contains no secret, key or token', () => {
    expect(code).not.toMatch(/service_role|secret|password|eyJ[A-Za-z0-9_-]{20,}|sb_secret/i);
  });
});
