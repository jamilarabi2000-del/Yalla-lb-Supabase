import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';
import type { CategoryItem, Product, Seller } from '../src/types';
import {
  blankTemplateCsv,
  catalogTemplateCsv,
  checkProductTemplate,
  importTemplateRows,
  MAX_TEMPLATE_ROWS,
  PRODUCT_TEMPLATE_COLUMNS,
  PRODUCT_TEMPLATE_GUIDE,
  type TemplateColumn,
} from '../src/lib/productTemplate';

// Bulk adds and updates go through one strict template, so missing or wrong
// data never reaches the catalogue.

const P1 = '11111111-1111-4111-8111-111111111111';
const P2 = '22222222-2222-4222-8222-222222222222';

const sellers: Seller[] = [
  { id: 's-1', nameEn: 'Chouf Eco Soap', sellerCode: 'SLR-101', isActive: true, createdAt: '', updatedAt: '' },
  { id: 's-2', nameEn: 'Koura Oil', sellerCode: 'SLR-102', isActive: false, createdAt: '', updatedAt: '' },
];
const categories = [
  { id: 'c-1', nameEn: 'Soap', nameAr: 'صابون' },
  { id: 'c-2', nameEn: 'Mouneh', nameAr: 'مونة' },
] as CategoryItem[];
const product = (over: Partial<Product> = {}): Product => ({
  id: P1, name: 'Laurel Soap', arabicName: 'صابون غار', sellerId: 's-1', sellerItemCode: 'LS-1', category: 'c-1',
  brand: 'Chouf Eco Soap', priceUSD: 8, stock: 5, isPublished: true, image: 'https://img.example.com/ls.jpg',
  additionalImages: [], description: 'Olive and laurel.', craftStory: '', origin: 'Lebanon', weightOrVolume: '',
  tags: ['soap'], ...over,
} as Product);
const ctx = (products: Product[] = [product()]) => ({ products, sellers, categories });

type Row = Partial<Record<TemplateColumn, string>>;
const good: Row = {
  seller_code: 'SLR-101', seller_item_code: 'ZT-500', name_en: 'Wild Zaatar', name_ar: 'زعتر بري',
  category: 'Mouneh', price_usd: '12.50', stock: '10', status: 'published', image_url: 'https://img.example.com/z.jpg',
};
const csv = (rows: Row[], columns: readonly string[] = PRODUCT_TEMPLATE_COLUMNS) =>
  Papa.unparse({ fields: [...columns], data: rows.map(r => columns.map(c => r[c as TemplateColumn] ?? '')) });
const check = (rows: Row[], products?: Product[]) => checkProductTemplate(csv(rows), ctx(products));
const errorsOf = (rows: Row[], products?: Product[]) => check(rows, products).rows.flatMap(r => r.errors).join(' | ');

describe('the file must be the template', () => {
  it('accepts the template as downloaded, Excel byte-order mark and all', () => {
    const text = blankTemplateCsv().replace(/\r\n$/, '') + '\r\n' + csv([good]).split('\n').slice(1).join('\n');
    expect(text.startsWith('﻿')).toBe(true);
    const result = checkProductTemplate(text, ctx());
    expect(result.fileErrors).toEqual([]);
    expect(result.ready).toBe(true);
  });

  it('refuses a missing, extra, renamed or repeated column, and imports nothing', () => {
    const without = PRODUCT_TEMPLATE_COLUMNS.filter(c => c !== 'stock');
    expect(checkProductTemplate(csv([good], without), ctx()).fileErrors.join(' ')).toMatch(/Missing column: stock/);
    expect(checkProductTemplate(csv([good], [...PRODUCT_TEMPLATE_COLUMNS, 'colour']), ctx()).fileErrors.join(' '))
      .toMatch(/Column "colour" is not part of the template/);
    const renamed = PRODUCT_TEMPLATE_COLUMNS.map(c => (c === 'price_usd' ? 'price' : c));
    expect(checkProductTemplate(csv([good], renamed), ctx()).fileErrors.join(' ')).toMatch(/"price" is not part.*Missing column: price_usd/);
    const repeated = [...PRODUCT_TEMPLATE_COLUMNS, 'stock'];
    expect(checkProductTemplate(csv([good], repeated), ctx()).fileErrors.join(' ')).toMatch(/"stock" appears more than once/);
    for (const cols of [without, renamed, repeated]) {
      const r = checkProductTemplate(csv([good], cols), ctx());
      expect(r.ready).toBe(false);
      expect(r.rows).toEqual([]);
    }
  });

  it('refuses an empty file, a file with no products, and too many rows', () => {
    expect(checkProductTemplate('', ctx()).fileErrors.join(' ')).toMatch(/empty/);
    expect(checkProductTemplate(blankTemplateCsv(), ctx()).fileErrors.join(' ')).toMatch(/no products/);
    const many = Array.from({ length: MAX_TEMPLATE_ROWS + 1 }, (_, i) => ({ ...good, seller_item_code: `C-${i}` }));
    expect(check(many).fileErrors.join(' ')).toMatch(/at most 1000/);
  });

  it('catches a row whose cells shifted, and skips blank rows', () => {
    const text = csv([good]) + '\r\n' + ',,,,,,,,,,,,,,,,,' + '\r\n' + 'a,b,c';
    const result = checkProductTemplate(text, ctx());
    expect(result.rows).toHaveLength(2);
    expect(result.rows[1]).toMatchObject({ row: 4 });
    expect(result.rows[1].errors.join(' ')).toMatch(/3 cells but the template has 18 columns/);
    expect(result.ready).toBe(false);
  });

  it('describes every column it asks for', () => {
    expect(Object.keys(PRODUCT_TEMPLATE_GUIDE)).toEqual([...PRODUCT_TEMPLATE_COLUMNS]);
    expect(Papa.parse<string[]>(blankTemplateCsv().replace(/^﻿/, '')).data[0]).toEqual([...PRODUCT_TEMPLATE_COLUMNS]);
  });
});

describe('every row is checked before anything is written', () => {
  it('requires the required values', () => {
    const e = errorsOf([{ description: 'Only a description' }]);
    for (const col of ['name_en', 'name_ar', 'seller_code', 'seller_item_code', 'category', 'price_usd', 'stock', 'status']) {
      expect(e).toContain(`${col}: required`);
    }
    // A draft may wait for its image; a published product may not.
    expect(check([{ ...good, status: 'draft', image_url: '' }]).ready).toBe(true);
    expect(errorsOf([{ ...good, image_url: '' }])).toContain('image_url: required to publish.');
  });

  it('refuses wrong values', () => {
    const cases: Array<[Row, RegExp]> = [
      [{ price_usd: '$12' }, /price_usd: "\$12" is not a price/],
      [{ price_usd: '12,50' }, /price_usd: "12,50" is not a price/],
      [{ price_usd: '0' }, /price_usd: "0" is not a price/],
      [{ price_usd: '10000.01' }, /price_usd: "10000.01" is not a price/],
      [{ price_usd: '12.345' }, /price_usd: "12.345" is not a price/],
      [{ promo_price_usd: '12.50' }, /promo_price_usd: must be lower than price_usd/],
      [{ promo_price_usd: 'half' }, /promo_price_usd: "half" is not a price/],
      [{ stock: '2.5' }, /stock: "2.5" is not a whole number/],
      [{ stock: '-1' }, /stock: "-1" is not a whole number/],
      [{ stock: '500ml' }, /stock: "500ml" is not a whole number/],
      [{ status: 'live' }, /status: "live" is not allowed/],
      [{ name_ar: 'Wild Zaatar' }, /name_ar: must be written in Arabic letters/],
      [{ seller_code: 'SLR-999' }, /seller_code: no seller has the code "SLR-999"/],
      [{ seller_code: 'Chouf Eco Soap' }, /seller_code: no seller has the code/],
      [{ category: 'Mouneh & Pantry' }, /category: no category is named "Mouneh & Pantry"/],
      [{ category: 'mouneh products' }, /category: no category is named/],
      [{ image_url: 'http://img.example.com/z.jpg' }, /image_url: must be a full link starting with https:\/\//],
      [{ image_url: 'javascript:alert(1)' }, /image_url: must be a full link/],
      [{ additional_image_urls: 'https://a.example/1.jpg,https://a.example/2.jpg' }, /additional_image_urls: .* is not a full https:\/\/ link/],
      [{ seller_item_code: 'bad*code' }, /seller_item_code: use letters, digits/],
      [{ product_id: 'p-1' }, /product_id: "p-1" is not a product id/],
      [{ product_id: P2 }, /product_id: No product has the id/],
      [{ name_en: 'x'.repeat(201) }, /name_en: longer than 200/],
      [{ tags: Array.from({ length: 21 }, (_, i) => `t${i}`).join('|') }, /tags: at most 20 tags/],
    ];
    for (const [change, pattern] of cases) {
      const result = check([{ ...good, ...change }]);
      expect(result.ready, JSON.stringify(change)).toBe(false);
      expect(result.rows[0].errors.join(' | '), JSON.stringify(change)).toMatch(pattern);
    }
  });

  it('matches sellers by code and categories by exact name, ignoring case only', () => {
    expect(check([{ ...good, seller_code: 'slr-101', category: 'MOUNEH' }]).ready).toBe(true);
    expect(check([{ ...good, category: 'c-2' }]).ready).toBe(true);
    const twins = [...categories, { id: 'c-3', nameEn: 'Mouneh', nameAr: 'مونة ٢' }] as CategoryItem[];
    const result = checkProductTemplate(csv([good]), { ...ctx(), categories: twins });
    expect(result.rows[0].errors.join(' ')).toMatch(/more than one category is named "Mouneh"/);
  });

  it('holds published products to what the store requires', () => {
    expect(errorsOf([{ ...good, price_usd: '0.50' }])).toMatch(/at least 1.00 to publish/);
    expect(errorsOf([{ ...good, price_usd: '5', promo_price_usd: '0.90' }])).toMatch(/at least 1.00 to publish/);
    expect(errorsOf([{ ...good, seller_code: 'SLR-102' }])).toMatch(/Koura Oil is switched off/);
    expect(check([{ ...good, seller_code: 'SLR-102', status: 'draft', price_usd: '0.50' }]).ready).toBe(true);
  });

  it('refuses duplicates inside the file and codes another product already has', () => {
    const dupes = check([good, { ...good, seller_item_code: 'zt-500' }]);
    expect(dupes.rows[1].errors.join(' ')).toMatch(/"zt-500" is also on row 2 for the same seller/);
    const sameId = check([{ ...good, product_id: P1, seller_item_code: 'LS-1' }, { ...good, product_id: P1, seller_item_code: 'LS-9' }]);
    expect(sameId.rows[1].errors.join(' ')).toMatch(/product_id: the same product is also on row 2/);
    // Adding a product whose code exists points the admin to its id instead.
    expect(errorsOf([{ ...good, seller_item_code: 'LS-1' }])).toMatch(new RegExp(`"Laurel Soap" already has this code for this seller. To update it, put its product_id \\(${P1}\\)`));
    // The same code is fine for another seller, and for the product that owns it.
    expect(check([{ ...good, seller_item_code: 'LS-1', seller_code: 'SLR-102', status: 'draft' }]).ready).toBe(true);
    expect(check([{ ...good, product_id: P1, seller_item_code: 'LS-1' }]).rows[0].errors).toEqual([]);
  });

  it('blocks the whole file when any row has a problem', () => {
    const result = check([good, { ...good, seller_item_code: 'ZT-2', price_usd: 'free' }]);
    expect(result.counts).toMatchObject({ create: 1, invalid: 1 });
    expect(result.ready).toBe(false);
  });
});

describe('what an accepted file writes', () => {
  it('creates a product through create_product_atomic with every checked value', () => {
    const [row] = check([{
      ...good, promo_price_usd: '9.99', brand: '', origin: '', tags: 'mouneh| organic |mouneh',
      additional_image_urls: 'https://img.example.com/2.jpg|https://img.example.com/3.jpg',
    }]).rows;
    expect(row.action).toBe('create');
    expect(row.create).toEqual({
      product: {
        name: 'Wild Zaatar', arabic_name: 'زعتر بري', artisan: 'Chouf Eco Soap', brand: 'Chouf Eco Soap',
        seller_id: 's-1', seller_item_code: 'ZT-500', category_id: 'c-2', regular_price: 12.5, promo_price: 9.99,
        stock: 10, is_published: true, image: 'https://img.example.com/z.jpg', description: '', craft_story: '',
        origin: 'Lebanon', weight_or_volume: '', tags: ['mouneh', 'organic'],
      },
      privateData: { seller_id: 's-1', seller_item_code: 'ZT-500' },
      images: [
        { url: 'https://img.example.com/2.jpg', media_type: 'image', display_order: 1 },
        { url: 'https://img.example.com/3.jpg', media_type: 'image', display_order: 2 },
      ],
    });
  });

  it('round-trips the current catalog unchanged', () => {
    const products = [
      product(),
      product({ id: P2, name: 'Zaatar', arabicName: 'زعتر', sellerItemCode: 'Z-1', category: 'c-2', priceUSD: 9, originalPriceUSD: 12,
        additionalImages: ['https://img.example.com/2.jpg'], tags: ['a', 'b'], isPublished: false, image: '' }),
    ];
    const result = checkProductTemplate(catalogTemplateCsv(ctx(products)), ctx(products));
    expect(result.fileErrors).toEqual([]);
    expect(result.rows.map(r => [r.action, r.errors])).toEqual([['unchanged', []], ['unchanged', []]]);
    expect(result.ready).toBe(false); // nothing to change
  });

  it('updates only what the file changes', () => {
    const products = [product({ originalPriceUSD: 10, videoUrl: 'https://v.example.com/a.mp4' })];
    const exported = Papa.parse<Record<string, string>>(catalogTemplateCsv(ctx(products)).replace(/^﻿/, ''), { header: true }).data[0];
    const edit = (change: Row) => check([{ ...exported, ...change } as Row], products).rows[0];

    expect(edit({ stock: '7' })).toMatchObject({ action: 'update', changes: ['stock'], update: { stock: 7 } });
    const unsale = edit({ promo_price_usd: '' });
    expect(unsale.changes).toEqual(['promo_price_usd']);
    expect(unsale.update).toHaveProperty('originalPriceUSD', undefined); // clears the sale
    expect(unsale.update).toMatchObject({ priceUSD: 10 });
    const images = edit({ image_url: 'https://img.example.com/new.jpg' });
    expect(images.update).toMatchObject({ image: 'https://img.example.com/new.jpg', videoUrl: 'https://v.example.com/a.mp4' });
    expect(edit({ status: 'draft', seller_code: 'SLR-102' }).update).toMatchObject({ isPublished: false, sellerId: 's-2', artisan: 'Koura Oil' });
  });

  it('carries description and craft story from their own columns, both ways', () => {
    // The importer this replaced once wrote these from undeclared variables
    // and failed every row.
    const [created] = check([{ ...good, description: 'Hand-picked in spring.', craft_story: 'Three generations in Chouf.' }]).rows;
    expect(created.create?.product).toMatchObject({ description: 'Hand-picked in spring.', craft_story: 'Three generations in Chouf.' });

    const products = [product({ description: 'Old text', craftStory: 'Old story' })];
    const exported = Papa.parse<Record<string, string>>(catalogTemplateCsv(ctx(products)).replace(/^\uFEFF/, ''), { header: true }).data[0];
    const edited = check([{ ...exported, description: 'New text' } as Row], products).rows[0];
    expect(edited).toMatchObject({ changes: ['description'], update: { description: 'New text' } });
    const cleared = check([{ ...exported, craft_story: '' } as Row], products).rows[0];
    expect(cleared).toMatchObject({ changes: ['craft_story'], update: { craftStory: '' } });
  });

  it('keeps formula-looking text as text both ways', () => {
    const products = [product({ name: '=HYPERLINK("http://evil.example","x")', description: '+961 70 123 456' })];
    const text = catalogTemplateCsv(ctx(products));
    expect(text).toContain(`"'=HYPERLINK(""http://evil.example"",""x"")"`);
    expect(checkProductTemplate(text, ctx(products)).rows[0]).toMatchObject({ action: 'unchanged', errors: [] });
  });
});

describe('importing', () => {
  const writers = () => ({ create: vi.fn(async () => 'new-id'), update: vi.fn(async () => {}) });

  it('writes creates and updates in file order and skips unchanged rows', async () => {
    const products = [product()];
    const result = check([good, { ...good, product_id: P1, seller_item_code: 'LS-1', name_en: 'Laurel Soap 2', name_ar: 'صابون غار' }], products);
    const w = writers();
    const progress = vi.fn();
    const out = await importTemplateRows(result, w, progress);
    expect(out).toMatchObject({ created: 1, updated: 1, errors: [] });
    expect(w.create).toHaveBeenCalledTimes(1);
    expect(w.update).toHaveBeenCalledWith(P1, expect.objectContaining({ name: 'Laurel Soap 2' }));
    expect(progress).toHaveBeenLastCalledWith(2, 2);
  });

  it('stops at the first row the database refuses and says how far it got', async () => {
    const result = check([good, { ...good, seller_item_code: 'B' }, { ...good, seller_item_code: 'C' }]);
    const w = writers();
    w.create.mockResolvedValueOnce('a').mockRejectedValueOnce(new Error('Administrator authorization required'));
    const out = await importTemplateRows(result, w);
    expect(out.created).toBe(1);
    expect(out.errors).toEqual([
      'Row 3 ("Wild Zaatar") was not saved: Administrator authorization required. The 1 row after it was not imported.',
    ]);
    expect(w.create).toHaveBeenCalledTimes(2);
  });

  it('refuses a file that did not check clean', async () => {
    const w = writers();
    await expect(importTemplateRows(check([{ ...good, price_usd: 'x' }]), w)).rejects.toThrow(/nothing was imported/);
    expect(w.create).not.toHaveBeenCalled();
  });
});

describe('both bulk screens use the template', () => {
  const read = (file: string) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');

  it('and nothing parses product CSV any other way', () => {
    for (const file of ['src/components/admin/SellersView.tsx', 'src/components/admin/ProductsCatalogManagement.tsx']) {
      const text = read(file);
      expect(text, file).toContain('<BulkProductImport');
      expect(text, file).not.toMatch(/Papa\.parse\(/);
    }
    expect(read('src/context/ShopContext.tsx')).not.toMatch(/Papa\.parse\(/);
    expect(read('src/context/ShopContext.tsx')).toContain('importTemplateRows(check');
  });

  it('never mistakes the seller code for the product code', () => {
    // The old importer read row.seller_code into sellerItemCode.
    expect(read('src/context/ShopContext.tsx')).not.toMatch(/seller_item_code \|\| row\.seller_code/);
    expect(check([{ ...good }]).rows[0].create?.product).toMatchObject({ seller_id: 's-1', seller_item_code: 'ZT-500' });
  });
});
