import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Seller codes are assigned by the database. These pin the migration that
// does it and every client path that used to mint or send a code.

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), 'utf8');
const stripTs = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const stripSql = (s: string) => s.replace(/--.*$/gm, '');

describe('the database assigns and guards the code', () => {
  const sql = stripSql(read('supabase/migrations/20260923174039_seller_code_system_generated.sql'));

  it('fills the code from a private sequence on insert, skipping codes already taken', () => {
    expect(sql).toMatch(/create sequence if not exists private\.seller_code_seq/);
    expect(sql).toMatch(/revoke all on sequence private\.seller_code_seq from public, anon, authenticated;/);
    expect(sql).toMatch(/v_code := 'SLR-' \|\| nextval\('private\.seller_code_seq'\)::text;/);
    expect(sql).toMatch(/exit when not exists \(select 1 from public\.sellers s where s\.seller_code = v_code\);/);
    expect(sql).toMatch(/before insert or update of seller_code on public\.sellers/);
  });

  it('ignores a code an app user sends; only trusted server writes may bring one', () => {
    // The early return is the only way a supplied code survives an insert.
    expect(sql).toMatch(/if \(select auth\.uid\(\)\) is null and nullif\(btrim\(coalesce\(new\.seller_code, ''\)\), ''\) is not null then\s*return new;/);
    expect(sql.match(/return new;/g)).toHaveLength(3);
  });

  it('refuses to change a code once assigned', () => {
    expect(sql).toMatch(/if new\.seller_code is distinct from old\.seller_code and \(select auth\.uid\(\)\) is not null then\s*raise exception using\s*errcode = '42501',\s*message = 'SELLER_CODE_IMMUTABLE'/);
  });

  it('never pads, which would truncate SLR-1000 to SLR-100', () => {
    expect(sql).not.toMatch(/lpad\s*\(/i);
  });

  it('runs with a fixed search path and is not callable by clients', () => {
    expect(sql).toMatch(/security definer\s*set search_path to ''/);
    expect(sql).toMatch(/revoke all on function private\.assign_seller_code\(\) from public, anon, authenticated;/);
    expect(sql).toMatch(/alter table public\.sellers alter column seller_code set not null;/);
  });
});

describe('the app never makes up or sends a code', () => {
  it('does not map sellerCode into the row it writes', () => {
    const svc = stripTs(read('src/services/supabaseCatalogService.ts'));
    const toRow = svc.slice(svc.indexOf('function toSellerRow'), svc.indexOf('return payload', svc.indexOf('function toSellerRow')));
    expect(toRow).toContain('name_en');
    expect(toRow).not.toMatch(/seller_code|sellerCode/);
  });

  it('reads back the code the database assigned when creating a seller', () => {
    const svc = stripTs(read('src/services/supabaseCatalogService.ts'));
    const upsert = svc.slice(svc.indexOf('async upsertSeller'), svc.indexOf('async updateSeller'));
    expect(upsert).toMatch(/\.select\('id, seller_code'\)/);
    expect(upsert).toMatch(/if \(!data\?\.length\) throw/);
    expect(upsert).toMatch(/return String\(data\[0\]\.seller_code/);
  });

  it('adds the seller to the list only after the write, with the assigned code', () => {
    const ctx = stripTs(read('src/context/ShopContext.tsx'));
    const add = ctx.slice(ctx.indexOf('const addSeller = async'), ctx.indexOf('const updateSeller = async'));
    expect(add).toMatch(/sellerCode = await supabaseCatalogService\.upsertSeller\(draft\);[\s\S]*const created: Seller = \{ \.\.\.draft, sellerCode \};\s*setSellers\(prev => \[\.\.\.prev, created\]\);/);
    expect(add).toMatch(/return created;/);
    // Not shown before the write: until then it has no code.
    expect(add.match(/setSellers\(/g)).toHaveLength(1);
    // No code is invented anywhere: not on create, not for a seller loaded without one.
    expect(ctx).not.toMatch(/`SLR-\$\{/);
    expect(ctx).not.toMatch(/ensureSellerCode/);
  });

  it('shows the code read-only in the seller form', () => {
    const view = stripTs(read('src/components/admin/SellersView.tsx'));
    expect(view).not.toMatch(/field\('sellerCode'/);
    expect(view).not.toMatch(/nextSellerCode|isDuplicateCode/);
    expect(view).toMatch(/Assigned automatically when you save/);
    expect(view).toMatch(/Assigned by the system\. It cannot be changed\./);
    expect(stripTs(read('src/lib/sellerAdmin.ts'))).not.toMatch(/nextSellerCode/);
  });

  it('does not credit a product without a seller to SLR-101 in reports', () => {
    expect(stripTs(read('src/utils/exportMasterReport.ts'))).not.toMatch(/'SLR-101'/);
  });
});
