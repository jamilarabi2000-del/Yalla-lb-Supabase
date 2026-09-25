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
      .replace(/\w+(?:!\w+)?\s*\([^)]*\)/g, '') // drop embedded joins
      .split(/[,\n]/).map(c => c.trim()).filter(c => /^\w+$/.test(c));
  };

  // anon and authenticated both hold COLUMN-level SELECT on products.
  // PostgreSQL fails the whole statement if a SELECT names any column the role
  // cannot read, so adding one of these to a products projection empties the
  // catalogue for everyone using it.
  const NEVER_PUBLIC = [
    'cost_price_usd', 'seller_item_code', 'low_stock_threshold',
    'low_stock_notice', 'custom_stock_label',
  ];

  it('never requests a private column for anonymous visitors', () => {
    const pub = projection('PUBLIC_PRODUCT_COLUMNS');
    expect(pub.filter(c => NEVER_PUBLIC.includes(c))).toEqual([]);
  });

  it('reads the private columns for admins and sellers from product_private, never from products', () => {
    const raw = svc.match(/const ADMIN_PRODUCT_COLUMNS = `([\s\S]*?)`;/)![1];
    const embedded = raw.match(/product_private\s*\(([^)]*)\)/);
    expect(embedded, 'product_private embed').not.toBeNull();
    for (const c of NEVER_PUBLIC) expect(embedded![1]).toContain(c);
    expect(projection('ADMIN_PRODUCT_COLUMNS').filter(c => NEVER_PUBLIC.includes(c))).toEqual([]);
    // The mapper takes them from the embedded row.
    expect(svc).toMatch(/const merchant: Record<string, any> =\s*\(Array\.isArray\(row\.product_private\)/);
    for (const c of NEVER_PUBLIC) expect(svc).toContain(`merchant.${c}`);
  });

  it('asks the authenticated role only for columns it may read (20260925 grant)', () => {
    const grantFile = fs.readdirSync(path.resolve(process.cwd(), 'supabase/migrations'))
      .find(f => /(?:^|_)products_merchant_fields_hidden_from_shoppers\.sql$/.test(f));
    expect(grantFile, 'grant migration').toBeTruthy();
    const grant = fs.readFileSync(path.resolve(process.cwd(), 'supabase/migrations', grantFile!), 'utf-8')
      .replace(/--.*$/gm, '');
    expect(grant).toMatch(/revoke select on table public\.products from authenticated;/);
    const granted = grant.match(/grant select \(([^)]*)\) on public\.products to authenticated;/)![1]
      .split(',').map(c => c.trim());
    expect(granted.filter(c => NEVER_PUBLIC.includes(c))).toEqual([]);
    // Every column the admin/seller catalogue requests from products must be granted,
    // or the whole request fails for every administrator and seller.
    expect(projection('ADMIN_PRODUCT_COLUMNS').filter(c => !granted.includes(c))).toEqual([]);
  });

  it('creates a product with a plain insert, which needs no read access to the merchant columns', () => {
    const upsert = svc.slice(svc.indexOf('async upsertProduct('), svc.indexOf('upsertProduct products:'));
    expect(upsert).toMatch(/\.from\('products'\)[\s\S]*?\.insert\(\s*productPayload,?\s*\)\s*\.select\('id'\)/);
    expect(upsert).not.toMatch(/onConflict:\s*'id'/);
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

// The loose CSV importer these tests guarded was replaced by the strict product
// template; test/productTemplate.test.ts covers how it reads every column.

describe('Catalogue fetch is not silently truncated', () => {
  const svc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/services/supabaseCatalogService.ts'),
    'utf8',
  );

  const fetchProductsBody = () => {
    const start = svc.indexOf('async fetchProducts(');
    expect(start).toBeGreaterThan(-1);
    const after = svc.slice(start + 1);
    const end = after.search(/\n  async [a-zA-Z]+\(/);
    const body = after.slice(0, end === -1 ? undefined : end);
    // Strip comments: the block explaining this fix legitimately names
    // `.range()`, so asserting on raw text passes on the documentation alone
    // even when the call itself is gone.
    return body
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
  };

  it('pages the query instead of issuing one unbounded request', () => {
    // PostgREST caps a response at db-max-rows (1000 on Supabase). Without a
    // range the storefront would render only the first page of a larger
    // catalogue, with no error and nothing to indicate rows were missing.
    const body = fetchProductsBody();
    expect(body).toContain('.range(');
    expect(body).toMatch(/PAGE_SIZE/);
  });

  it('stops when a short page is returned rather than looping forever', () => {
    const body = fetchProductsBody();
    expect(body).toContain('if (batch.length < PAGE_SIZE) break;');
    expect(body).toMatch(/CATALOG_PAGE_CEILING/);
  });

  it('reports hitting the ceiling instead of truncating in silence', () => {
    const body = fetchProductsBody();
    expect(body).toMatch(/console\.error[\s\S]{0,200}larger than this loader expects/);
  });
});

describe('News category filter is wired to the UI', () => {
  const news = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/NewsSection.tsx'),
    'utf8',
  );
  const code = news
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('renders a control that can change the active category', () => {
    // The type, the bilingual labels, the state and the filter all existed;
    // no selector was rendered, so activeCategory was frozen at 'all' and the
    // filter branch was unreachable.
    expect(code).toContain('setActiveCategory(cat.id)');
    expect(code).toContain('categories.map(');
  });

  it('keeps the filter applied to what is actually rendered', () => {
    expect(code).toMatch(/const filteredNews\s*=/);
    expect(code).toContain('filteredNews.map(');
  });

  it('does not offer a category with no articles', () => {
    // Selecting an empty category would swap the track for nothing at all.
    expect(code).toContain('disabled={count === 0}');
  });

  it('resets the slider when the category changes', () => {
    expect(code).toMatch(/useEffect\([\s\S]{0,260}scrollTo[\s\S]{0,160}\[activeCategory\]\)/);
  });

  it('carries no frozen autoplay state', () => {
    // isAutoPlay was permanently false, so `!canScroll && !isAutoPlay` was
    // just `!canScroll`.
    expect(code).not.toContain('isAutoPlay');
  });
});
