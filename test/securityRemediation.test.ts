import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { isSafeUrl, isSafeImageUrl, sanitizeUrl } from '../src/lib/safeUrl';
import { csvSafe } from '../src/utils/csvSafe';

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), 'utf8');

describe('safeUrl — scheme-relative bypasses', () => {
  // Browsers normalise "\" to "/" in special schemes, so each of these
  // navigates to https://evil.com despite starting with a single "/".
  const offOrigin = [
    '//evil.com',
    '/\\evil.com',
    '\\/evil.com',
    '\\\\evil.com',
    '/\\\\evil.com',
    '  /\\evil.com  ',
  ];

  for (const url of offOrigin) {
    it(`rejects ${JSON.stringify(url)}`, () => {
      expect(isSafeUrl(url)).toBe(false);
      expect(isSafeImageUrl(url)).toBe(false);
      expect(sanitizeUrl(url, '/')).toBe('/');
    });
  }

  it('still accepts genuine same-origin and allowlisted URLs', () => {
    expect(isSafeUrl('/products')).toBe(true);
    expect(isSafeUrl('#section')).toBe(true);
    expect(isSafeUrl('./nested')).toBe(true);
    expect(isSafeUrl('https://example.com/page')).toBe(true);
    expect(isSafeUrl('mailto:hello@yalla.lb')).toBe(true);
    expect(isSafeUrl('tel:+9611234567')).toBe(true);
    expect(isSafeUrl('https://wa.me/9613000000')).toBe(true);
  });

  it('still rejects dangerous schemes and control characters', () => {
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isSafeUrl('vbscript:msgbox(1)')).toBe(false);
    expect(isSafeUrl('java\u0000script:alert(1)')).toBe(false);
    expect(isSafeImageUrl('data:image/svg+xml;base64,PHN2Zz4=')).toBe(false);
  });

  it('matches wa.me by parsed hostname, not by string prefix', () => {
    // The old implementation used startsWith('https://wa.me/'), so a lookalike
    // path could not be distinguished from the real host. Now the host is
    // compared after parsing.
    expect(new URL('https://wa.me.evil.com/123').hostname).not.toBe('wa.me');
    expect(isSafeUrl('whatsapp://send?text=hi')).toBe(true);
  });
});

describe('HeroBanner navigation is validated', () => {
  const hero = read('src/components/HeroBanner.tsx');

  it('never assigns location.href from an unvalidated target', () => {
    const assignments = hero.match(/window\.location\.href\s*=\s*[^;]+;/g) ?? [];
    expect(assignments.length).toBeGreaterThan(0);
    for (const assignment of assignments) {
      expect(assignment).toContain('sanitizeUrl(');
    }
  });

  it('gates the secondary action on isSafeUrl', () => {
    expect(hero).toContain('isSafeUrl(secondaryTarget)');
  });
});

describe('Rich text sanitization delegates to DOMPurify', () => {
  const sanitizer = read('src/utils/sanitizeRichText.ts');

  it('uses DOMPurify rather than a hand-rolled allowlist walker', () => {
    expect(sanitizer).toContain("from 'dompurify'");
    expect(sanitizer).toContain('DOMPurify.sanitize(');
    // The previous implementation recursed into the parent on every unwrap,
    // which was both mXSS-prone and exponential in disallowed sibling count.
    expect(sanitizer).not.toContain('cleanNode');
  });

  it('forbids the foreign-content elements used for mutation XSS', () => {
    for (const tag of ['svg', 'math', 'style', 'template', 'noscript']) {
      expect(sanitizer).toContain(`'${tag}'`);
    }
  });

  it('is a declared runtime dependency', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.dependencies.dompurify).toBeTruthy();
  });
});

describe('Privileged RPCs target the schema that grants EXECUTE', () => {
  const platform = read('src/services/platformService.ts');

  it('calls has_permission and record_inventory_change on the private schema', () => {
    // public.has_permission grants EXECUTE only to postgres/service_role, and
    // public.record_inventory_change no longer exists.
    expect(platform).not.toMatch(/supabase\.rpc\('has_permission'/);
    expect(platform).not.toMatch(/supabase\.rpc\('record_inventory_change'/);
    expect(platform).toContain(".schema('private')");
  });

  it('does not fall back to a coarse admin flag when the check fails', () => {
    const adminView = read('src/components/AdminView.tsx');
    expect(adminView).not.toContain('setAllowed(v||!!shop.isAdminUser)');
    expect(adminView).not.toContain('catch(()=>setAllowed(!!shop.isAdminUser))');
  });
});

describe('Admin second factor reaches the database', () => {
  const guard = read('src/components/AdminGuard.tsx');

  it('verifies the OTP on the primary client so the session JWT carries amr', () => {
    expect(guard).toContain('supabase.auth.verifyOtp(');
    expect(guard).not.toContain('adminOtpClient.auth.verifyOtp(');
  });

  it('records the server-side step-up after verification', () => {
    expect(guard).toContain("rpc('record_admin_step_up')");
  });

  it('does not mint a password-only session during step-up', () => {
    // signInWithPassword on the PRIMARY client would replace the OTP session
    // and silently discard its second-factor claim.
    expect(guard).not.toContain('supabase.auth.signInWithPassword({ email: authUser.email');
    expect(guard).toContain('adminOtpClient.auth.signInWithPassword({ email: authUser.email');
  });
});

describe('Seller provisioning function', () => {
  const fn = read('supabase/functions/admin-seller-provision/index.ts');

  it('never takes the target uid straight from the request body', () => {
    expect(fn).not.toContain('seller.account_uid || applicantUserId');
    expect(fn).toContain('approved');
  });

  it('refuses to re-provision an already privileged account', () => {
    expect(fn).toContain('PRIVILEGED_ROLES');
  });

  it('has no undefined audit identifier references', () => {
    const declared = fn.match(/\b(?:let|const)\s+(\w*[Aa]udit\w*)\b/g) ?? [];
    expect(declared.join(' ')).toContain('auditAttemptId');
    // `attemptAuditId` may only ever appear as an object KEY, never as a bare
    // variable reference, which would throw ReferenceError at runtime.
    expect(fn).not.toMatch(/(?<![.\w])attemptAuditId\s*,/);
  });

  it('enforces the privileged password policy the client can satisfy', () => {
    expect(fn).toContain('validatePrivilegedPassword');
    const sellers = read('src/components/admin/SellersView.tsx');
    // secureRandomString() emits lowercase+digits only and can never satisfy
    // the uppercase/symbol requirements.
    expect(sellers).not.toContain('secureRandomString(');
    expect(sellers).toContain('generateSecurePassword(');
  });

  it('does not use a wildcard CORS helper', () => {
    expect(fn).not.toContain("jsr:@supabase/supabase-js@2/cors");
    expect(fn).toContain('Access-Control-Allow-Origin');
  });
});

describe('Payment webhook replay protection', () => {
  const fn = read('supabase/functions/payment-webhook/index.ts');

  it('binds each event to a timestamp and a unique id', () => {
    expect(fn).toContain('MAX_CLOCK_SKEW_SECONDS');
    expect(fn).toContain('provider_event_id: eventId');
    expect(fn).toContain("error?.code === '23505'");
  });
});

describe('Transport security headers are declared', () => {
  const required = [
    'Content-Security-Policy',
    'Strict-Transport-Security',
    'X-Content-Type-Options',
    'X-Frame-Options',
    'Referrer-Policy',
    'Permissions-Policy',
  ];

  it('vercel.json sets them', () => {
    const vercel = read('vercel.json');
    for (const header of required) expect(vercel).toContain(header);
    expect(vercel).toContain("frame-ancestors 'none'");
    expect(vercel).toContain("object-src 'none'");
  });

  it('netlify.toml sets them', () => {
    const netlify = read('netlify.toml');
    for (const header of required) expect(netlify).toContain(header);
  });

  it('drops the obscurity-only admin alias', () => {
    expect(read('vercel.json')).not.toContain('portal-x9k2m7v8');
  });
});

describe('CSV export neutralises formula injection', () => {
  it('prefixes every spreadsheet formula trigger', () => {
    for (const payload of ['=1+1', '+1', '-1', '@SUM(A1)', '\tx', '\rx', '\nx', '|cmd']) {
      expect(csvSafe(payload).startsWith("'")).toBe(true);
    }
  });

  it('leaves ordinary values untouched', () => {
    expect(csvSafe('Beirut')).toBe('Beirut');
    expect(csvSafe(42)).toBe('42');
    expect(csvSafe(null)).toBe('');
  });
});

describe('Diagnostic logger', () => {
  const logger = read('src/utils/dbLogger.ts');

  it('redacts PII by pattern, not by an exact key list', () => {
    expect(logger).toContain('piiPattern');
    expect(logger).not.toContain("'fullName', 'firstName'");
  });

  it('only exposes the log buffer on window in development', () => {
    expect(logger).toContain('import.meta.env.DEV');
  });
});
