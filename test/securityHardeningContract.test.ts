import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());

function walk(dir: string): string[] {
  const result: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'dist'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...walk(full));
    else result.push(full);
  }
  return result;
}

const sourceFiles = () => walk(path.join(root, 'src')).filter(f => /\.(ts|tsx|js|jsx)$/.test(f));
const read = (file: string) => fs.readFileSync(file, 'utf8');

describe('Yalla production security hardening contracts', () => {
  it('contains no executable Firebase imports anywhere under src', () => {
    const forbidden = [
      "from 'firebase/",
      'from "firebase/',
      "from '../firebase",
      'from "../firebase',
      "from './firebase",
      'from "./firebase',
      'firebase-admin',
      'firebase/functions',
      'firebase/firestore',
    ];

    for (const file of sourceFiles()) {
      const content = read(file);
      for (const token of forbidden) expect(content, file).not.toContain(token);
    }
  });

  it('never contains service-role or secret-key browser configuration', () => {
    for (const file of sourceFiles()) {
      const content = read(file);
      expect(content, file).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
      expect(content, file).not.toContain('SUPABASE_SECRET_KEY');
      expect(content, file).not.toContain('sb_secret_');
    }
  });

  it('uses Supabase server-authoritative checkout and idempotency', () => {
    const source = read(path.join(root, 'src/services/supabaseOrderService.ts'));
    expect(source).toContain("schema('private').rpc('checkout_create_order'");
    expect(source).toContain('idempotency');
    expect(source).not.toContain('httpsCallable');
  });

  it('protects product operational fields from non-admin browser updates', () => {
    const migration = read(path.join(root, 'supabase/migrations/20260915040000_protect_product_operational_fields.sql'));
    for (const field of [
      'cost_price_usd',
      'seller_item_code',
      'low_stock_threshold',
      'low_stock_notice',
      'custom_stock_label',
      'seller_id',
      'reviews_count',
      'rating',
    ]) {
      expect(migration).toContain(field);
    }
    expect(migration).toContain("role = 'admin'::app_role");
    expect(migration).toContain("using errcode = '42501'");
  });

  it('locks the admin MFA UI to a bounded lifetime and reauthentication OTP', () => {
    const mfa = read(path.join(root, 'src/utils/adminMfa.ts'));
    const guard = read(path.join(root, 'src/components/AdminGuard.tsx'));
    expect(mfa).toContain('MFA_VALIDITY_MS = 30 * 60 * 1000');
    expect(mfa).toContain('HIGH_RISK_VALIDITY_MS = 15 * 60 * 1000');
    expect(guard).toContain('supabase.auth.reauthenticate()');
    expect(guard).toContain("type: 'reauthentication'");
  });

  it('keeps security-critical authorization in the database rather than sessionStorage', () => {
    const mfa = read(path.join(root, 'src/utils/adminMfa.ts'));
    expect(mfa).toContain('never authorization proof by itself');
    expect(mfa).toContain('Supabase Auth + PostgreSQL RLS/RPC authorization');
  });

  it('has automated verification and secret scanning workflows', () => {
    const verify = read(path.join(root, '.github/workflows/verify.yml'));
    const security = read(path.join(root, '.github/workflows/security.yml'));
    expect(verify).toContain('npm run verify');
    expect(security).toContain('gitleaks/gitleaks-action');
  });
});
