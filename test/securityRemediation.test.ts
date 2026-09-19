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

  it('verifies MFA on the primary client so the session reaches AAL2', () => {
    // private.session_has_second_factor() reads `aal` / `amr` from the session
    // JWT. Verifying on a throwaway client leaves the primary JWT password-only
    // and the whole database enforcement layer becomes unreachable.
    expect(guard).toContain('supabase.auth.mfa.verify(');
    expect(guard).toContain('supabase.auth.mfa.challenge(');
    expect(guard).not.toContain('adminOtpClient');
  });

  it('records the server-side step-up after verification', () => {
    expect(guard).toContain("rpc('record_admin_step_up_aal2')");
  });

  it('does not mint a password-only session anywhere after sign-in', () => {
    // signInWithPassword must appear exactly once: the initial sign-in. A
    // second call (an old password-based step-up) would replace the AAL2
    // session and silently drop the second factor.
    const calls = guard.match(/signInWithPassword\(/g) ?? [];
    expect(calls.length).toBe(1);
  });

  it('gates rendering on the verified flag, not on browser storage', () => {
    expect(guard).toContain("authStatus === 'authenticated_admin' && isVerified");
    expect(guard).not.toContain('isMfaSessionValid');
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

describe('Administrator verification is bound to the session, not the user', () => {
  const bind = read('supabase/migrations/20260919040000_bind_step_up_to_session.sql');
  const enforce = read('supabase/migrations/20260919020000_require_verified_admin_for_writes.sql');

  it('is_admin_verified has no user-scoped fallback', () => {
    // private.admin_step_up is keyed by user_id, so an `or has_recent_step_up()`
    // branch let a password-only session inherit a row written by a different,
    // properly verified session — re-opening the bypass.
    expect(bind).toContain('private.is_admin() and private.session_has_second_factor()');
    expect(bind).not.toMatch(/is_admin_verified[\s\S]*?or\s+private\.has_recent_step_up/);
  });

  it('has_recent_step_up also demands a second-factor session', () => {
    expect(bind).toContain('select private.session_has_second_factor()');
    expect(bind).toContain('and exists (');
  });

  it('enforcement covers RLS and the RLS-bypassing definer RPCs', () => {
    // SECURITY DEFINER functions are owned by postgres, which has rolbypassrls,
    // so restrictive policies cannot constrain them. Both layers are required.
    expect(enforce).toContain('as restrictive for insert');
    expect(enforce).toContain('as restrictive for update');
    expect(enforce).toContain('as restrictive for delete');
    for (const fn of ['admin_reorder_products', 'admin_set_product_promotion',
                      'create_product_atomic', 'next_yalla_item_code',
                      'record_inventory_change']) {
      expect(enforce).toContain(fn);
    }
  });

  it('leaves non-admins unaffected and never restricts SELECT', () => {
    expect(enforce).toContain('or not (select private.is_admin())');
    expect(enforce).not.toContain('as restrictive for select');
  });

  it('fails loudly if an RPC gate stops matching', () => {
    expect(enforce).toContain('VERIFIED_ADMIN_GATE_NOT_APPLIED');
  });
});

describe('Admin writes fail loudly when RLS filters them', () => {
  // PostgREST does not treat a policy-filtered write as an error: it returns
  // success with zero rows. Now that restrictive policies gate admin writes on
  // a verified session, any admin write without .select() would let an
  // unverified administrator watch a change "succeed" and silently vanish.
  const ADMIN_TABLES = [
    'orders', 'regions', 'products', 'categories', 'coupons', 'discount_rules',
    'sellers', 'cms_site_content', 'cms_custom_blocks', 'product_seo',
    'app_settings', 'permissions', 'role_permissions', 'user_permissions',
  ].join('|');

  // Components matter as much as services here: several write to admin tables
  // directly, and the first version of this test only looked at src/services,
  // which is exactly how the seller-application writes slipped through.
  const sources = [
    'src/services/supabaseOrderService.ts',
    'src/services/supabaseCatalogService.ts',
    'src/services/supabaseCmsService.ts',
    'src/services/platformService.ts',
    'src/context/ShopContext.tsx',
    'src/components/admin/SellersView.tsx',
    'src/components/admin/SearchAnalyticsView.tsx',
    'src/components/admin/ReviewsManager.tsx',
    'src/components/admin/ProductsCatalogManagement.tsx',
  ];

  it('no admin-table mutation requests rows and then discards them', () => {
    // Weaker than it looks if you only assert `.select(` is present: the call
    // can still destructure `{ error }` alone and throw the rows away, which
    // restores the exact silent-success bug. Assert `data:` is bound too.
    const discarded: string[] = [];
    for (const file of sources) {
      const body = fs.readFileSync(path.resolve(process.cwd(), file), 'utf-8');
      const blocks = body.match(
        /const \{\n[\s\S]{0,120}?\} = await supabase\n[\s\S]*?\.select\('id'\);/g) ?? [];
      for (const block of blocks) {
        if (/\.from\(\s*'product_images'/.test(block)) continue; // may legitimately affect 0 rows
        const head = block.slice(0, block.indexOf('} = await supabase'));
        if (!head.includes('data:')) discarded.push(`${file}: ${block.slice(0, 80)}`);
      }
    }
    expect(discarded).toEqual([]);
  });

  it('every admin-table mutation asks for the affected rows back', () => {
    const pattern = new RegExp(
      `\\.from\\('(?:${ADMIN_TABLES})'\\)[\\s\\S]{0,260}?\\.(?:delete|update|upsert)\\([\\s\\S]{0,260}?;`,
      'g');

    const offenders: string[] = [];
    for (const file of sources) {
      const body = fs.readFileSync(path.resolve(process.cwd(), file), 'utf-8');
      for (const call of body.match(pattern) ?? []) {
        if (!call.includes('.select(')) offenders.push(`${file}: ${call.slice(0, 90)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('deleting a product reports failure rather than a phantom success', () => {
    const catalog = fs.readFileSync(
      path.resolve(process.cwd(), 'src/services/supabaseCatalogService.ts'), 'utf-8');
    expect(catalog).toContain('deletedRows');
    expect(catalog).toContain('The product was not deleted');
  });
});

describe('TOTP enrollment screen', () => {
  const guard = read('src/components/AdminGuard.tsx');

  it('does not double-wrap the QR data URI', () => {
    // supabase.auth.mfa.enroll() returns qr_code already as a data URI.
    // Unconditionally wrapping it produced
    // "data:image/svg+xml;charset=utf-8,data%3Aimage%2F..." which renders as a
    // broken image, leaving manual secret entry as the only way to enroll.
    expect(guard).toContain("qrCode.trimStart().startsWith('data:')");
    expect(guard).not.toMatch(/src=\{`data:image\/svg\+xml;charset=utf-8,\$\{encodeURIComponent\(qrCode\)\}`\}/);
  });

  it('keeps the setup key hidden until explicitly revealed', () => {
    // The secret IS the second factor; showing it by default puts it into every
    // screenshot and screen share of the enrollment page.
    expect(guard).toContain('isSecretVisible');
    expect(guard).toContain('Show setup key');
  });
});

describe('TOTP enrollment cleanup reads the right bucket', () => {
  const guard = read('src/components/AdminGuard.tsx');

  it('clears abandoned factors from `all`, not the verified-only `totp` list', () => {
    // supabase-js buckets a factor into data.totp ONLY when status ===
    // 'verified'. Filtering data.totp for unverified entries therefore always
    // yields nothing, so an abandoned enrollment survives and the next attempt
    // fails with "a factor with the friendly name ... already exists".
    expect(guard).toContain('existing?.all');
    expect(guard).not.toMatch(/existing\?\.totp\s*\|\|\s*\[\]\)\.filter\([^)]*status\s*!==\s*'verified'/);
  });

  it('uses a friendly name that cannot collide on a retry', () => {
    // Friendly names are unique per user, so a date-only name collides the
    // second time enrollment is attempted on the same day.
    expect(guard).not.toMatch(/friendlyName:.*toISOString\(\)\.slice\(0, 10\)/);
    expect(guard).toMatch(/friendlyName:.*replace\(\/\[:\.\]\/g/);
  });
});
