import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (relativePath: string) =>
  fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf-8');

const executableSource = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');

describe('Supabase Security Regression Suite', () => {
  it('has no Firebase imports or Firebase configuration files in the Supabase client', () => {
    const treeFiles = [
      'src/context/ShopContext.tsx',
      'src/components/AdminGuard.tsx',
      'src/lib/supabase.ts',
      'src/services/supabaseCatalogService.ts',
      'src/services/supabaseOrderService.ts',
      'src/services/supabaseAdminService.ts',
      'src/services/supabaseCommerceService.ts',
    ];

    for (const file of treeFiles) {
      const content = read(file);
      expect(content).not.toContain("from '../firebase'");
      expect(content).not.toContain("from './firebase'");
      expect(content).not.toContain('firebase-admin');
      expect(content).not.toContain('firebase/functions');
      expect(content).not.toContain('firebase/firestore');
    }
  });

  it('never exposes a Supabase service-role or secret key in frontend source', () => {
    const files = [
      'src/lib/supabase.ts',
      'src/context/ShopContext.tsx',
      'src/services/supabaseAdminService.ts',
    ];

    for (const file of files) {
      const content = read(file);
      expect(content).not.toContain('service_role');
      expect(content).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
      expect(content).not.toContain('sb_secret_');
    }
  });

  it('uses the publishable/anon client key and fails closed in production when configuration is missing', () => {
    const client = read('src/lib/supabase.ts');
    expect(client).toContain('VITE_SUPABASE_URL');
    expect(client).toContain('VITE_SUPABASE_PUBLISHABLE_KEY');
    expect(client).toContain('VITE_SUPABASE_ANON_KEY');
    expect(client).toContain('import.meta.env.PROD');
    expect(client).toContain('Production cannot start without Supabase configuration');
  });

  it('uses PKCE and persistent Supabase sessions', () => {
    const client = read('src/lib/supabase.ts');
    expect(client).toContain('persistSession: true');
    expect(client).toContain('autoRefreshToken: true');
    expect(client).toContain('detectSessionInUrl: true');
    expect(client).toContain("flowType: 'pkce'");
  });

  it('keeps checkout authoritative on the server-side RPC and does not silently fall back', () => {
    const checkout = executableSource(read('src/services/supabaseOrderService.ts'));
    expect(checkout).toContain("schema('private').rpc('checkout_create_order'");
    expect(checkout).toContain('CheckoutError');
    expect(checkout).not.toContain('httpsCallable');
    expect(checkout).not.toContain('functionsInstance');
    expect(checkout).not.toMatch(/\breturn\s*\{\s*\}/);
  });

  it('does not expose private product cost fields in the public catalogue projection', () => {
    const catalog = read('src/services/supabaseCatalogService.ts');
    const publicProjection = catalog.slice(
      catalog.indexOf('const PUBLIC_PRODUCT_COLUMNS'),
      catalog.indexOf('const ADMIN_PRODUCT_COLUMNS'),
    );
    expect(publicProjection).not.toContain('cost_price_usd');
    expect(publicProjection).not.toContain('seller_item_code');
    expect(publicProjection).not.toContain('low_stock_threshold');
    expect(publicProjection).not.toContain('custom_stock_label');
  });

  it('requires server-side admin role verification and password + reauthentication OTP', () => {
    const guard = read('src/components/AdminGuard.tsx');
    expect(guard).toContain(".from('profiles')");
    expect(guard).toContain("data?.role !== 'admin'");
    expect(guard).toContain('supabase.auth.reauthenticate()');
    expect(guard).toContain("type: 'reauthentication'");
    expect(guard).toContain('cleanOtp.length !== 8');
    expect(guard).toContain('maxLength={8}');
  });

  it('does not use a hidden URL as authorization', () => {
    const guard = read('src/components/AdminGuard.tsx');
    expect(guard).not.toContain('portal-x9k2m7v8');
    expect(guard).not.toContain('claims.admin = true');
  });

  it('keeps the application root in the light theme', () => {
    const app = read('src/App.tsx');
    expect(app).toContain('bg-[#F7F7F8] text-[#111111]');
    expect(app).not.toContain('bg-[#1a1a2e] text-slate-100');
  });

  it('sanitizes CSV formula injection', async () => {
    const { csvSafe } = await import('../src/utils/csvSafe');
    expect(csvSafe('=SUM(A1:A10)')).toBe("'=SUM(A1:A10)");
    expect(csvSafe('+12345')).toBe("'+12345");
    expect(csvSafe('@HYPERLINK("evil.com")')).toBe("'@HYPERLINK(\"evil.com\")");
  });

  it('rejects unsafe URL schemes', async () => {
    const { isSafeUrl } = await import('../src/lib/safeUrl');
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('vbscript:msgbox(1)')).toBe(false);
    expect(isSafeUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isSafeUrl('https://yalla.lb')).toBe(true);
  });
});
