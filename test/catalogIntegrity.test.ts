import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseStock, parsePrice } from '../src/utils/importerResolvers';
import { isProductVisibleOnStorefront } from '../src/lib/storefrontVisibility';
import { Product, Seller } from '../src/types';
import { INITIAL_PRODUCTS } from '../src/data/products';
import { DEFAULT_SELLERS } from '../src/data/sellers';

describe('Catalog Integrity - Stock Parsing & Importer Rules', () => {
  it('rejects unit strings like "500ml", "750g", "245 Pcs" by returning NaN instead of coercing to number', () => {
    expect(parseStock('500ml')).toBeNaN();
    expect(parseStock('750g')).toBeNaN();
    expect(parseStock('245 Pcs')).toBeNaN();
    expect(parseStock('100 units')).toBeNaN();
    expect(parseStock('500ml Glass Bottle')).toBeNaN();
  });

  it('rejects missing or empty stock without inventing a default of 10', () => {
    expect(parseStock('')).toBeNaN();
    expect(parseStock(null)).toBeNaN();
    expect(parseStock(undefined)).toBeNaN();
  });

  it('preserves stock 0 exactly and parses pure numbers correctly', () => {
    expect(parseStock(0)).toBe(0);
    expect(parseStock('0')).toBe(0);
    expect(parseStock(10)).toBe(10);
    expect(parseStock('25')).toBe(25);
    expect(parseStock('1,250')).toBe(1250);
  });
});

describe('Production data ownership', () => {
  it('does not ship bundled product or seller demo records', () => {
    expect(INITIAL_PRODUCTS).toEqual([]);
    expect(DEFAULT_SELLERS).toEqual([]);
  });
});

describe('Storefront Visibility Rule', () => {
  const dummyProduct: Product = {
    id: 'prod-test-1',
    name: 'Test Artisan Soap',
    priceUSD: 10,
    category: 'beauty',
    stock: 5,
    sellerId: 'seller-1',
    seller: 'Maison Test',
    artisan: 'Maison Test',
    isPublished: true,
    rating: 5,
    reviewsCount: 1,
    image: 'https://example.com/img.jpg',
    description: 'Test',
    origin: 'Tripoli, Lebanon',
    craftStory: 'Traditional soap craftsmanship',
    tags: ['soap', 'handmade']
  };

  const dummySeller: Seller = {
    id: 'seller-1',
    nameEn: 'Maison Test',
    isActive: true,
    sellerCode: 'MST',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  it('shows product if seller is active and product is published', () => {
    expect(isProductVisibleOnStorefront(dummyProduct, [dummySeller])).toBe(true);
  });

  it('hides product if seller is deactivated (isActive === false)', () => {
    const inactiveSeller = { ...dummySeller, isActive: false };
    expect(isProductVisibleOnStorefront(dummyProduct, [inactiveSeller])).toBe(false);
  });

  it('hides product if product itself is unpublished (isPublished === false)', () => {
    const unpublishedProduct = { ...dummyProduct, isPublished: false };
    expect(isProductVisibleOnStorefront(unpublishedProduct, [dummySeller])).toBe(false);
  });

  it('keeps product visible if seller is not registered in sellers collection', () => {
    expect(isProductVisibleOnStorefront(dummyProduct, [])).toBe(true);
  });

  it('shows all products if visual edit mode is enabled', () => {
    const unpublished = { ...dummyProduct, isPublished: false };
    expect(isProductVisibleOnStorefront(unpublished, [], true)).toBe(true);
  });
});

describe('products.brand reaches the UI model', () => {
  const service = fs.readFileSync(
    path.resolve(process.cwd(), 'src/services/supabaseCatalogService.ts'), 'utf-8');

  it('selects brand in both the public and admin projections', () => {
    // Mapping brand without selecting it makes row.brand permanently undefined,
    // so the column must appear in both column lists.
    const lists = service.match(/const (?:PUBLIC|ADMIN)_PRODUCT_COLUMNS = `[\s\S]*?`;/g) ?? [];
    expect(lists.length).toBe(2);
    for (const list of lists) expect(list).toContain('brand,');
  });

  it('maps brand onto the product, normalising the NOT NULL empty default', () => {
    expect(service).toContain('brand: row.brand');
    expect(service).toContain(': undefined');
  });
});

describe('Public product projection stays within the anon column grant', () => {
  const svc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/services/supabaseCatalogService.ts'), 'utf-8');

  const projection = (name: string) => {
    const m = svc.match(new RegExp('const ' + name + ' = `([\\s\\S]*?)`;'));
    if (!m) throw new Error(name + ' not found');
    return m[1]
      .replace(/\w+!\w+\s*\([^)]*\)/g, '')       // drop embedded joins
      .split(/[,\n]/).map(c => c.trim()).filter(c => /^\w+$/.test(c));
  };

  // anon holds COLUMN-level SELECT on products. PostgreSQL fails the whole
  // statement if a SELECT names any column the role cannot read, so adding one
  // of these to the public projection empties the storefront for every
  // logged-out visitor — while staying invisible to a signed-in admin, who has
  // a table-level grant.
  const NEVER_PUBLIC = [
    'cost_price_usd', 'seller_item_code', 'low_stock_threshold',
    'low_stock_notice', 'custom_stock_label',
  ];

  it('never requests a private column for anonymous visitors', () => {
    const pub = projection('PUBLIC_PRODUCT_COLUMNS');
    expect(pub.filter(c => NEVER_PUBLIC.includes(c))).toEqual([]);
  });

  it('keeps the private columns available to the admin projection', () => {
    const adm = projection('ADMIN_PRODUCT_COLUMNS');
    for (const c of NEVER_PUBLIC) expect(adm).toContain(c);
  });

  it('documents the grant any newly public column needs', () => {
    // Adding a column here requires a matching
    //   grant select (<column>) on public.products to anon;
    // See supabase/migrations/20260919060000_restore_anon_catalog_column_grants.sql
    const pub = projection('PUBLIC_PRODUCT_COLUMNS');
    expect(pub).toContain('yalla_item_code');
    expect(pub.length).toBeGreaterThan(30);
  });
});

describe('Storefront visibility is enforced in the database', () => {
  const migration = fs.readFileSync(
    path.resolve(process.cwd(),
      'supabase/migrations/20260919070000_hide_products_of_hidden_category_or_seller.sql'), 'utf-8');
  const visibility = fs.readFileSync(
    path.resolve(process.cwd(), 'src/lib/storefrontVisibility.ts'), 'utf-8');

  it('narrows both SELECT policies on products, not just the anon one', () => {
    expect(migration).toContain('alter policy products_public_read');
    expect(migration).toContain('alter policy products_authenticated_read');
  });

  it('requires a published category and an active seller', () => {
    for (const clause of ['c.is_published', 's.is_active']) {
      // Once for each of the two policies.
      expect(migration.split(clause).length - 1).toBeGreaterThanOrEqual(2);
    }
  });

  it('keeps unaffiliated products visible', () => {
    // A NULL category or seller must not hide a product, matching
    // public_catalog and checkout_create_order.
    expect(migration).toContain('category_id is null');
    expect(migration).toContain('seller_id is null');
  });

  it('preserves the admin and owning-seller branches', () => {
    expect(migration).toContain('private.is_admin()');
    expect(migration).toContain('private.is_seller()');
  });

  it('records that the client-side check is not the boundary', () => {
    // The seller branch there is inert for visitors: RLS removes the inactive
    // seller from the array it looks in, so the check can never fire.
    expect(visibility).toContain('presentation only');
    expect(visibility).toContain('RLS');
  });
});
