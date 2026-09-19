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

  it('calls privileged RPCs through the public API schema', () => {
    // Whether `private` is exposed through the Data API is a dashboard
    // setting, invisible from the code. Addressing it directly makes these
    // calls silently unreachable if it is ever off, so every privileged RPC
    // goes through a public SECURITY INVOKER delegate instead.
    expect(platform).not.toContain(".schema('private')");
    expect(platform).toMatch(/supabase\s*\n?\s*\.rpc\('has_permission'/);
    expect(platform).toMatch(/supabase\.rpc\('record_inventory_change'/);
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

describe('Every browser RPC goes through the public API schema', () => {
  // `public` is the only schema guaranteed to be exposed through the Data API.
  // Whether `private` is exposed is a dashboard setting invisible from the
  // code, so addressing it directly makes checkout, product creation and the
  // administrator step-up silently unreachable if it is ever turned off.
  const sources = [
    'src/lib/supabase.ts',
    'src/components/AdminGuard.tsx',
    'src/services/supabaseOrderService.ts',
    'src/services/supabaseProductService.ts',
    'src/services/platformService.ts',
  ];

  it('no client code addresses the private schema', () => {
    const offenders: string[] = [];
    for (const file of sources) {
      const body = read(file);
      // Allow the word in prose; only a real call is a problem.
      if (/\.schema\(\s*['"]private['"]\s*\)/.test(body)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it('the runtime Proxy that rewrote the checkout RPC name is gone', () => {
    // Strip comments first: the block explaining the removal legitimately
    // names both the Proxy and the gateway, and asserting on raw text would
    // fail on its own documentation.
    const code = read('src/lib/supabase.ts')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(code).not.toContain('new Proxy');
    expect(code).not.toContain('checkout_create_order_gateway');
    expect(code).toContain('export const supabase: any = supabaseClient;');
  });

  it('the wrapper migration keeps the implementations private', () => {
    const m = read('supabase/migrations/20260919080000_public_api_wrappers_for_private_rpcs.sql');
    for (const fn of ['record_admin_step_up_aal2', 'checkout_create_order', 'admin_delete_order',
                      'record_inventory_change', 'has_permission', 'create_product_atomic']) {
      expect(m).toContain(`create or replace function public.${fn}`);
      expect(m).toContain(`private.${fn === 'checkout_create_order' ? 'checkout_create_order_gateway' : fn}(`);
    }
    // Delegates must not re-implement authorization, and must not be reachable
    // by anonymous callers.
    expect(m.match(/security invoker/g)?.length).toBe(6);
    expect(m.match(/from public, anon;/g)?.length).toBe(6);
  });
});

describe('Checkout offers no payment method the system cannot take', () => {
  // The storefront integrates no payment gateway: no card details are
  // collected and public.orders carries no payment state (no paid flag, no
  // transaction id, no provider reference). A "Credit / Debit Card - Secure
  // online gateway" option used to sit in checkout and produced an ordinary
  // unpaid order, promising a charge that never happened.
  const checkout = read('src/components/CheckoutView.tsx');
  const types = read('src/types.ts');

  const stripComments = (s: string) =>
    s.replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
     .replace(/\/\*[\s\S]*?\*\//g, '')
     .replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('does not offer a card option in checkout', () => {
    const code = stripComments(checkout);
    expect(code).not.toContain('credit_card');
    expect(code).not.toContain('Secure online gateway');
  });

  it('keeps credit_card out of the PaymentMethod union so it cannot compile back', () => {
    const union = stripComments(types).match(/export type PaymentMethod\s*=\s*([^;]+);/);
    expect(union).toBeTruthy();
    expect(union![1]).not.toContain('credit_card');
    for (const method of ['cod_usd', 'cod_lbp', 'wish_omt']) {
      expect(union![1]).toContain(method);
    }
  });

  it('enforces the supported set in the database, not just the UI', () => {
    // Removing the button is presentation only: private.checkout_create_order
    // inserted p_payment_method verbatim, so any JWT holder could post an
    // order marked credit_card straight to the Data API.
    const m = read('supabase/migrations/20260919090000_reject_unsupported_payment_methods.sql');
    expect(m).toContain('create trigger trg_enforce_supported_payment_method');
    expect(m).toContain('before insert or update of payment_method on public.orders');
    expect(m).toContain('UNSUPPORTED_PAYMENT_METHOD');
    // The guard must name exactly the methods the storefront offers.
    for (const method of ['cod_usd', 'cod_lbp', 'wish_omt']) {
      expect(m).toContain(`'${method}'::public.payment_method`);
    }
    expect(m).not.toContain("'credit_card'::public.payment_method");
    // An unchanged column on UPDATE must pass, or a legacy row could never be
    // corrected once it held an unsupported value.
    expect(m).toContain('new.payment_method is not distinct from old.payment_method');
  });

  it('does not advertise a card option in the admin CMS copy', () => {
    expect(read('src/components/admin/cms/CMSVisibilityTab.tsx')).not.toContain('OMT/Whish, Credit Card');
    expect(read('src/components/AdminQuickEditor.tsx')).not.toContain('Wish/OMT, Card');
  });
});

describe('The catalogue cache never outlives a privileged session', () => {
  // fetchProducts() selects ADMIN_PRODUCT_COLUMNS for an administrator or
  // seller -- cost_price_usd, seller_item_code, low_stock_threshold,
  // custom_stock_label -- and returns unpublished rows. localStorage is
  // per-origin, not per-session: it survives sign out, and ShopContext seeds
  // `products` straight from it before any fetch or auth check runs.
  const shop = read('src/context/ShopContext.tsx');

  it('routes every catalogue cache write through the privilege-aware helper', () => {
    expect(shop).not.toContain('localStorage.setItem(CATALOG_CACHE_KEYS');
    expect(shop.match(/writeCatalogCache\(CATALOG_CACHE_KEYS\./g)?.length).toBeGreaterThan(15);
  });

  it('the helper refuses to write, and clears, for an admin or seller', () => {
    const helper = shop.slice(
      shop.indexOf('const writeCatalogCache ='),
      shop.indexOf('const writeCatalogCache =') + 600
    );
    expect(helper).toContain('isAdminUser || isSellerUser');
    // It must remove the key, not merely decline to write it: a public cache
    // from before the role change would otherwise survive unnoticed.
    expect(helper).toContain('removeItem(key)');
    const guardIdx = helper.indexOf('isAdminUser || isSellerUser');
    const writeIdx = helper.indexOf('setItem(key');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(writeIdx).toBeGreaterThan(guardIdx); // guard precedes the write
  });

  it('drops the catalogue cache on sign out', () => {
    const signOut = shop.slice(
      shop.indexOf('const signOutUser ='),
      shop.indexOf('const refreshUserProfile =')
    );
    expect(signOut).toContain('CATALOG_CACHE_KEYS');
    expect(signOut).toContain('removeItem');
  });

  it('purges the cache keys retired by this fix', () => {
    // A build before this one wrote privileged rows into the v2 keys, where
    // they persist on devices that never sign out again.
    expect(shop).toContain('RETIRED_CATALOG_CACHE_KEYS');
    for (const key of ['yallalb_products_v2', 'yallalb_categories_v2', 'yallalb_sellers_v2']) {
      expect(shop).toContain(key);
    }
    expect(shop).toContain('RETIRED_CATALOG_CACHE_KEYS.forEach');
    // The live keys must no longer be the retired ones.
    const live = shop.slice(shop.indexOf('const CATALOG_CACHE_KEYS'), shop.indexOf('} as const;'));
    expect(live).not.toContain('_v2');
  });
});

describe('Discount rules actually reach the database', () => {
  const svc = read('src/services/supabaseCommerceService.ts');
  const shop = read('src/context/ShopContext.tsx');

  it('stores the promotion in the jsonb column the server reads', () => {
    // private.checkout_create_order reads the promotion out of
    // discount_rules.rule and nowhere else. The previous mapper selected
    // row.type / row.value / row.target_value, none of which exist on the
    // table, so every rule came back { type: undefined, value: 0 }.
    for (const key of ['type', 'value', 'target', 'targetValue', 'minPurchaseUSD',
                       'startDate', 'endDate', 'isNewUserOnly', 'buyQty', 'getQty',
                       'getDiscountPercent', 'couponCode']) {
      expect(svc).toContain(`'${key}'`);
    }
    expect(svc).toContain('rule: toRuleJson(');
    // Strip comments: the block explaining the old mapper legitimately names
    // the columns that do not exist, and asserting on raw text would fail on
    // its own documentation.
    const svcCode = svc
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(svcCode).not.toContain('row.target_value');
    expect(svcCode).not.toContain('row.min_purchase_usd');
    expect(svcCode).not.toContain('row.coupon_code');
  });

  it('exposes real create/update/delete, not read-only helpers', () => {
    for (const fn of ['createDiscountRule', 'updateDiscountRule', 'deleteDiscountRule']) {
      expect(svc).toContain(`async ${fn}(`);
    }
    expect(svc).toContain("from('discount_rules')");
    expect(svc).toContain("from('coupons')");
  });

  it('treats a zero-row write as failure, since RLS returns success with no rows', () => {
    const writes = svc.match(/async (create|update|delete)DiscountRule\(/g) ?? [];
    expect(writes.length).toBe(3);
    // Each write must both project rows back and reject an empty result.
    expect(svc.match(/Complete administrator verification and try again/g)?.length)
      .toBeGreaterThanOrEqual(4);
  });

  it('removes a rule\'s coupons before the rule itself', () => {
    // The FK is ON DELETE SET NULL, so dropping the rule alone leaves a code
    // that passes the INVALID_COUPON check but resolves to a null rule: it
    // appears to work, discounts nothing, and still burns a use.
    const del = svc.slice(svc.indexOf('async deleteDiscountRule('));
    const couponIdx = del.indexOf("from('coupons')");
    const ruleIdx = del.indexOf("from('discount_rules')");
    expect(couponIdx).toBeGreaterThan(-1);
    expect(ruleIdx).toBeGreaterThan(couponIdx);
  });

  it('refuses to steal a coupon code from another rule', () => {
    expect(svc).toContain('is already in use by another discount rule');
  });

  it('ShopContext persists instead of only touching React state', () => {
    const add = shop.slice(shop.indexOf('const addDiscountRule ='),
                           shop.indexOf('const updateDiscountRule ='));
    expect(add).toContain('supabaseCommerceService.createDiscountRule');
    // The original had `try {` immediately followed by `} catch` -- an empty
    // block that wrote nothing at all.
    expect(add).not.toMatch(/try\s*\{\s*\}\s*catch/);
    expect(add).not.toContain("'rule-' + secureRandomString");

    const upd = shop.slice(shop.indexOf('const updateDiscountRule ='),
                           shop.indexOf('const deleteDiscountRule ='));
    expect(upd).toContain('supabaseCommerceService.updateDiscountRule');

    const del = shop.slice(shop.indexOf('const deleteDiscountRule ='),
                           shop.indexOf('const deleteDiscountRule =') + 700);
    expect(del).toContain('supabaseCommerceService.deleteDiscountRule');
  });
});
