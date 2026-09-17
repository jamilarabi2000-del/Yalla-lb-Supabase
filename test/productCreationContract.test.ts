import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), 'utf8');

describe('Atomic product creation', () => {
  it('routes product creation through the private Supabase RPC', () => {
    const service = read('src/services/supabaseProductService.ts');
    expect(service).toContain(".schema('private')");
    expect(service).toContain(".rpc('create_product_atomic'");
    expect(service).not.toContain("from('products').insert");
    expect(service).not.toContain("from('product_private').insert");
    expect(service).not.toContain("from('product_images').insert");
  });

  it('requires administrator authorization and enforces only the admin form required fields in the RPC', () => {
    const migration = read('supabase/migrations/20260917010000_fix_product_atomic_optional_fields.sql');
    expect(migration).toContain('if not private.is_admin()');
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("p_product->>'name'");
    expect(migration).toContain("p_product->>'category'");
    expect(migration).toContain("p_product->>'price_usd'");
    expect(migration).toContain("revoke all on function private.create_product_atomic");
    expect(migration).toContain('grant execute on function private.create_product_atomic');
    expect(migration).not.toContain("Product artisan is required");
    expect(migration).not.toContain("Product description is required");
    expect(migration).not.toContain("Product image is required");
  });

  it('wires the Admin Products Create draft action directly to the atomic service', () => {
    const adminProducts = read('src/components/admin/AdminProductManager.tsx');
    expect(adminProducts).toContain("import { supabaseProductService } from '../../services/supabaseProductService';");
    expect(adminProducts).toContain('await supabaseProductService.createProduct({');
    expect(adminProducts).toContain("publish_status: published ? 'published' : 'draft'");
    expect(adminProducts).toContain('await reload();');
    expect(adminProducts).not.toContain('const add=s.addProduct');
  });
});
