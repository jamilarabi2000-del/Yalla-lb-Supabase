import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), 'utf8');

describe('Atomic product creation', () => {
  it('routes product creation through the private Supabase RPC', () => {
    const service = read('src/services/supabaseProductService.ts');
    expect(service).toContain("schema('private').rpc('create_product_atomic'");
    expect(service).not.toContain("from('products').insert");
    expect(service).not.toContain("from('product_private').insert");
    expect(service).not.toContain("from('product_images').insert");
  });

  it('requires administrator authorization and validates core product fields in the RPC', () => {
    const migration = read('supabase/migrations/20260916010000_create_product_atomic_rpc.sql');
    expect(migration).toContain('if not private.is_admin()');
    expect(migration).toContain("set search_path = ''");
    for (const field of ['name','artisan','origin','brand','description','craft_story','image','price_usd','stock']) {
      expect(migration).toContain(`p_product->>'${field}'`);
    }
    expect(migration).toContain("revoke all on function private.create_product_atomic");
    expect(migration).toContain('grant execute on function private.create_product_atomic');
  });

  it('wires the Admin Products Create draft action directly to the atomic service', () => {
    const adminView = read('src/components/AdminView.tsx');
    expect(adminView).toContain("import { supabaseProductService } from '../services/supabaseProductService';");
    expect(adminView).toContain('await supabaseProductService.createProduct({');
    expect(adminView).toContain("publish_status: 'draft'");
    expect(adminView).toContain('await syncProducts();');
    expect(adminView).not.toContain('const addProduct = shop.addProduct');
  });
});
