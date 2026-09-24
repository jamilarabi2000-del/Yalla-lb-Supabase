/**
 * The product template: the one file format for adding and updating products
 * in bulk. Both bulk screens (Products, and Sellers & Bulk Import) download
 * it, check it and import it through this module, so a file is judged the same
 * way wherever it is uploaded.
 *
 * It is strict on purpose, so that missing or wrong data never reaches the
 * catalogue:
 *   - the file must carry exactly the template's columns, no more, no fewer;
 *   - every row is checked against the live catalogue before anything is
 *     written: required values, number formats, allowed values, and sellers,
 *     categories and product codes that exist;
 *   - one problem anywhere blocks the whole file.
 *
 * Updating works on the same file: "Download current catalog" writes every
 * product into the template with its product_id, and uploading it back saves
 * each row exactly as it appears -- an emptied optional cell clears that field.
 */
import Papa from 'papaparse';
import type { CategoryItem, Product, Seller } from '../types';
import { fromRegularAndPromo, toRegularAndPromo } from './productPricing';
import { isSafeImageUrl } from './safeUrl';

export const PRODUCT_TEMPLATE_COLUMNS = [
  'product_id', 'seller_code', 'seller_item_code', 'name_en', 'name_ar', 'category', 'brand',
  'price_usd', 'promo_price_usd', 'stock', 'status', 'image_url', 'additional_image_urls',
  'description', 'craft_story', 'origin', 'weight_or_volume', 'tags',
] as const;

export type TemplateColumn = (typeof PRODUCT_TEMPLATE_COLUMNS)[number];

export const MAX_TEMPLATE_ROWS = 1000;
export const LIST_SEPARATOR = '|';
const MAX_ADDITIONAL_IMAGES = 10;
const MAX_TAGS = 20;

export interface ColumnGuide {
  required: 'always' | 'to publish' | 'no';
  rule: string;
  example: string;
}

/** What each column accepts; the admin screens show it beside the upload. */
export const PRODUCT_TEMPLATE_GUIDE: Record<TemplateColumn, ColumnGuide> = {
  product_id: { required: 'no', rule: 'Leave empty to add a new product. To update a product, keep the id that "Download current catalog" wrote.', example: '' },
  seller_code: { required: 'always', rule: 'The seller\'s code, as shown in Sellers.', example: 'SLR-101' },
  seller_item_code: { required: 'always', rule: 'The seller\'s own code for this product, different for each of their products. Letters, digits, spaces and . _ - / only; up to 64 characters.', example: 'ZAATAR-500G' },
  name_en: { required: 'always', rule: 'The English name; up to 200 characters.', example: 'Wild Zaatar Mix 500g' },
  name_ar: { required: 'always', rule: 'The Arabic name, in Arabic letters; up to 200 characters.', example: 'خلطة زعتر بري ٥٠٠ غ' },
  category: { required: 'always', rule: 'The category\'s English name, exactly as in Categories & Details.', example: 'Mouneh' },
  brand: { required: 'no', rule: 'Up to 100 characters. Empty uses the seller\'s name.', example: '' },
  price_usd: { required: 'always', rule: 'The regular price in US dollars: above 0, at most 10000, up to 2 decimals, no $ sign. At least 1.00 to publish.', example: '12.50' },
  promo_price_usd: { required: 'no', rule: 'The sale price, lower than price_usd. Leave empty when there is no sale.', example: '' },
  stock: { required: 'always', rule: 'A whole number, 0 or more.', example: '40' },
  status: { required: 'always', rule: '"published" (in the store) or "draft" (hidden).', example: 'draft' },
  image_url: { required: 'to publish', rule: 'The main image: a full link starting with https://.', example: 'https://images.example.com/zaatar.jpg' },
  additional_image_urls: { required: 'no', rule: `Up to ${MAX_ADDITIONAL_IMAGES} more https:// image links, separated by ${LIST_SEPARATOR}.`, example: '' },
  description: { required: 'no', rule: 'Up to 5000 characters.', example: '' },
  craft_story: { required: 'no', rule: 'Up to 5000 characters.', example: '' },
  origin: { required: 'no', rule: 'Up to 100 characters. Empty uses Lebanon.', example: 'Koura' },
  weight_or_volume: { required: 'no', rule: 'Up to 50 characters.', example: '500 g' },
  tags: { required: 'no', rule: `Up to ${MAX_TAGS} tags separated by ${LIST_SEPARATOR}, each up to 40 characters.`, example: 'mouneh|organic' },
};

export interface TemplateContext {
  products: Product[];
  sellers: Seller[];
  categories: CategoryItem[];
}

/** Arguments for create_product_atomic. */
export interface TemplateCreate {
  product: Record<string, unknown>;
  privateData: Record<string, unknown>;
  images: Array<Record<string, unknown>>;
}

export interface TemplateRow {
  /** The row number a spreadsheet shows; the header is row 1. */
  row: number;
  action: 'create' | 'update' | 'unchanged';
  name: string;
  productId?: string;
  /** "column: problem" -- any entry blocks the whole file. */
  errors: string[];
  /** For an update, the fields that change. */
  changes: string[];
  create?: TemplateCreate;
  update?: Partial<Product>;
}

export interface TemplateCheck {
  /** Problems with the file as a whole (columns, size, format). */
  fileErrors: string[];
  rows: TemplateRow[];
  counts: { create: number; update: number; unchanged: number; invalid: number };
  /** True only when nothing is wrong anywhere and something would change. */
  ready: boolean;
}

// ── Reading cells ───────────────────────────────────────────────────────────

/**
 * Exports escape cells that a spreadsheet would run as a formula by putting an
 * apostrophe in front; reading one back takes the apostrophe off again.
 */
const unescapeCell = (value: string) => (/^'[=+\-@\t\r]/.test(value) ? value.slice(1) : value);

const MONEY = /^(0|[1-9][0-9]{0,4})(\.[0-9]{1,2})?$/;
const WHOLE = /^[0-9]{1,6}$/;
const ITEM_CODE = /^[\p{L}\p{N}][\p{L}\p{N} ._/-]{0,63}$/u;
const ARABIC = /[؀-ۿ]/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Commas are legal in a link, but two links joined by one is a wrong separator.
const isHttpsImage = (url: string) =>
  /^https:\/\/[^\s|]+$/i.test(url) && !/,\s*https?:\/\//i.test(url) && isSafeImageUrl(url);
const splitList = (value: string) => value.split(LIST_SEPARATOR).map(v => v.trim()).filter(Boolean);
const fold = (value: string) => value.trim().toLowerCase();
const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i]);

// ── Checking a file ─────────────────────────────────────────────────────────

export function checkProductTemplate(csvText: string, ctx: TemplateContext): TemplateCheck {
  const fileErrors: string[] = [];
  const rows: TemplateRow[] = [];
  const finish = (): TemplateCheck => {
    const counts = {
      create: rows.filter(r => !r.errors.length && r.action === 'create').length,
      update: rows.filter(r => !r.errors.length && r.action === 'update').length,
      unchanged: rows.filter(r => !r.errors.length && r.action === 'unchanged').length,
      invalid: rows.filter(r => r.errors.length > 0).length,
    };
    return {
      fileErrors,
      rows,
      counts,
      ready: fileErrors.length === 0 && counts.invalid === 0 && counts.create + counts.update > 0,
    };
  };

  const parsed = Papa.parse<string[]>(csvText.replace(/^﻿/, ''), { header: false, skipEmptyLines: false });
  for (const err of parsed.errors) {
    fileErrors.push(`The file could not be read${err.row !== undefined ? ` near row ${err.row + 1}` : ''}: ${err.message}.`);
  }
  const records = parsed.data;
  if (!records.length || records[0].every(cell => !String(cell ?? '').trim())) {
    fileErrors.push('The file is empty. Download the template and fill it in.');
    return finish();
  }

  // Columns: exactly the template's.
  const header = records[0].map(cell => fold(String(cell ?? '')));
  const expected = new Set<string>(PRODUCT_TEMPLATE_COLUMNS);
  const seen = new Set<string>();
  for (const name of header) {
    if (!name) fileErrors.push('A column has no name. Use the header row of the template exactly as downloaded.');
    else if (!expected.has(name)) fileErrors.push(`Column "${name}" is not part of the template. Remove it or download the template again.`);
    else if (seen.has(name)) fileErrors.push(`Column "${name}" appears more than once.`);
    seen.add(name);
  }
  const missing = PRODUCT_TEMPLATE_COLUMNS.filter(c => !seen.has(c));
  if (missing.length) fileErrors.push(`Missing column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.`);
  if (fileErrors.length) return finish();

  const body = records
    .map((cells, index) => ({ cells: cells.map(c => unescapeCell(String(c ?? '').trim())), row: index + 1 }))
    .slice(1)
    .filter(r => r.cells.some(Boolean));
  if (!body.length) {
    fileErrors.push('The file has no products in it: fill in at least one row under the header.');
    return finish();
  }
  if (body.length > MAX_TEMPLATE_ROWS) {
    fileErrors.push(`The file has ${body.length} products; import at most ${MAX_TEMPLATE_ROWS} at a time.`);
    return finish();
  }

  const sellersByCode = new Map<string, Seller>();
  for (const s of ctx.sellers) if (s.sellerCode) sellersByCode.set(fold(s.sellerCode), s);
  const categoryIndex = new Map<string, CategoryItem[]>();
  for (const c of ctx.categories) {
    for (const key of new Set([fold(c.nameEn || ''), fold(c.id)])) {
      if (!key) continue;
      categoryIndex.set(key, [...(categoryIndex.get(key) ?? []), c]);
    }
  }
  const productsById = new Map(ctx.products.map(p => [p.id, p]));
  const codeOwner = new Map<string, Product>();
  for (const p of ctx.products) {
    if (p.sellerId && p.sellerItemCode) codeOwner.set(`${p.sellerId}::${fold(p.sellerItemCode)}`, p);
  }
  const idRows = new Map<string, number>();
  const codeRows = new Map<string, number>();

  for (const { cells, row } of body) {
    const errors: string[] = [];
    const cell = (column: TemplateColumn) => cells[header.indexOf(column)] ?? '';
    const problem = (column: TemplateColumn, message: string) => errors.push(`${column}: ${message}`);

    if (cells.length !== header.length) {
      errors.push(`This row has ${cells.length} cells but the template has ${header.length} columns. A comma inside a value needs the whole value in double quotes.`);
      rows.push({ row, action: 'create', name: cell('name_en'), errors, changes: [] });
      continue;
    }

    // Which product.
    const productId = cell('product_id');
    let existing: Product | undefined;
    if (productId) {
      if (!UUID.test(productId)) problem('product_id', `"${productId}" is not a product id. Leave it empty to add a new product.`);
      else if (!(existing = productsById.get(productId))) problem('product_id', `No product has the id "${productId}". Leave it empty to add a new product, or download the current catalog for the right ids.`);
      const earlier = idRows.get(productId.toLowerCase());
      if (earlier) problem('product_id', `the same product is also on row ${earlier}.`);
      else idRows.set(productId.toLowerCase(), row);
    }

    // Names.
    const nameEn = cell('name_en');
    const nameAr = cell('name_ar');
    if (!nameEn) problem('name_en', 'required.');
    else if (nameEn.length > 200) problem('name_en', 'longer than 200 characters.');
    if (!nameAr) problem('name_ar', 'required.');
    else if (!ARABIC.test(nameAr)) problem('name_ar', 'must be written in Arabic letters.');
    else if (nameAr.length > 200) problem('name_ar', 'longer than 200 characters.');

    // Seller and the seller's product code.
    const sellerCode = cell('seller_code');
    const seller = sellerCode ? sellersByCode.get(fold(sellerCode)) : undefined;
    if (!sellerCode) problem('seller_code', 'required. Use the code shown in Sellers.');
    else if (!seller) problem('seller_code', `no seller has the code "${sellerCode}".`);

    const itemCode = cell('seller_item_code');
    if (!itemCode) problem('seller_item_code', 'required.');
    else if (!ITEM_CODE.test(itemCode)) problem('seller_item_code', 'use letters, digits, spaces and . _ - / only, up to 64 characters.');
    else if (seller) {
      const key = `${seller.id}::${fold(itemCode)}`;
      const earlier = codeRows.get(key);
      if (earlier) problem('seller_item_code', `"${itemCode}" is also on row ${earlier} for the same seller.`);
      else codeRows.set(key, row);
      const owner = codeOwner.get(key);
      if (owner && owner.id !== existing?.id) {
        problem('seller_item_code', existing
          ? `"${itemCode}" already belongs to "${owner.name}" of this seller.`
          : `"${owner.name}" already has this code for this seller. To update it, put its product_id (${owner.id}) in this row.`);
      }
    }

    // Category.
    const categoryValue = cell('category');
    const categoryMatches = categoryValue ? categoryIndex.get(fold(categoryValue)) ?? [] : [];
    const category = categoryMatches.length === 1 ? categoryMatches[0] : undefined;
    if (!categoryValue) problem('category', 'required.');
    else if (!categoryMatches.length) problem('category', `no category is named "${categoryValue}". Use a name from Categories & Details.`);
    else if (categoryMatches.length > 1) problem('category', `more than one category is named "${categoryValue}". Rename one in Categories & Details first.`);

    // Prices and stock.
    const priceText = cell('price_usd');
    const promoText = cell('promo_price_usd');
    const price = MONEY.test(priceText) ? Number(priceText) : NaN;
    const promo = promoText ? (MONEY.test(promoText) ? Number(promoText) : NaN) : null;
    if (!priceText) problem('price_usd', 'required.');
    else if (!(price > 0 && price <= 10000)) problem('price_usd', `"${priceText}" is not a price. Use a number above 0 and at most 10000, like 12.50, without a $ sign.`);
    if (promo !== null && !(promo > 0 && promo <= 10000)) problem('promo_price_usd', `"${promoText}" is not a price. Use a number like 9.99, or leave it empty.`);
    else if (promo !== null && price > 0 && promo >= price) problem('promo_price_usd', 'must be lower than price_usd.');

    const stockText = cell('stock');
    if (!stockText) problem('stock', 'required.');
    else if (!WHOLE.test(stockText)) problem('stock', `"${stockText}" is not a whole number of 0 or more.`);
    const stock = Number(stockText);

    const statusText = fold(cell('status'));
    if (!statusText) problem('status', 'required: "published" or "draft".');
    else if (statusText !== 'published' && statusText !== 'draft') problem('status', `"${cell('status')}" is not allowed: use "published" or "draft".`);
    const publish = statusText === 'published';

    // Media.
    const image = cell('image_url');
    if (image && !isHttpsImage(image)) problem('image_url', 'must be a full link starting with https://.');
    const additionalImages = splitList(cell('additional_image_urls'));
    if (additionalImages.length > MAX_ADDITIONAL_IMAGES) problem('additional_image_urls', `at most ${MAX_ADDITIONAL_IMAGES} links.`);
    const badImage = additionalImages.find(url => !isHttpsImage(url));
    if (badImage) problem('additional_image_urls', `"${badImage}" is not a full https:// link. Separate links with ${LIST_SEPARATOR}.`);

    // Text.
    const brand = cell('brand');
    if (brand.length > 100) problem('brand', 'longer than 100 characters.');
    const description = cell('description');
    if (description.length > 5000) problem('description', 'longer than 5000 characters.');
    const craftStory = cell('craft_story');
    if (craftStory.length > 5000) problem('craft_story', 'longer than 5000 characters.');
    const origin = cell('origin');
    if (origin.length > 100) problem('origin', 'longer than 100 characters.');
    const weightOrVolume = cell('weight_or_volume');
    if (weightOrVolume.length > 50) problem('weight_or_volume', 'longer than 50 characters.');
    const tags = [...new Set(splitList(cell('tags')))];
    if (tags.length > MAX_TAGS) problem('tags', `at most ${MAX_TAGS} tags.`);
    const longTag = tags.find(t => t.length > 40);
    if (longTag) problem('tags', `"${longTag}" is longer than 40 characters.`);

    // What the store needs before a product can be published.
    if (publish) {
      if (!image) problem('image_url', 'required to publish.');
      if (Math.min(price, promo ?? price) < 1) problem('price_usd', 'the price a customer pays must be at least 1.00 to publish.');
      if (seller && !seller.isActive) problem('seller_code', `${seller.nameEn} is switched off in Sellers, so this product cannot be published.`);
    }

    const name = nameEn || existing?.name || '';
    if (errors.length || !seller || !category) {
      rows.push({ row, action: existing ? 'update' : 'create', name, productId: existing?.id, errors, changes: [] });
      continue;
    }

    const values = {
      name: nameEn,
      arabicName: nameAr,
      sellerId: seller.id,
      sellerItemCode: itemCode,
      category: category.id,
      brand: brand || seller.nameEn,
      regular: price,
      promo,
      stock,
      isPublished: publish,
      image,
      additionalImages,
      description,
      craftStory,
      origin: origin || 'Lebanon',
      weightOrVolume,
      tags,
    };

    if (!existing) {
      rows.push({
        row, action: 'create', name, errors, changes: [],
        create: {
          product: {
            name: values.name,
            arabic_name: values.arabicName,
            artisan: seller.nameEn,
            brand: values.brand,
            seller_id: seller.id,
            seller_item_code: values.sellerItemCode,
            category_id: values.category,
            regular_price: values.regular,
            promo_price: values.promo,
            stock: values.stock,
            is_published: values.isPublished,
            image: values.image,
            description: values.description,
            craft_story: values.craftStory,
            origin: values.origin,
            weight_or_volume: values.weightOrVolume,
            tags: values.tags,
          },
          privateData: { seller_id: seller.id, seller_item_code: values.sellerItemCode },
          images: values.additionalImages.map((url, index) => ({ url, media_type: 'image', display_order: index + 1 })),
        },
      });
      continue;
    }

    // An update saves only what differs from the product as it is now.
    const current = toRegularAndPromo(existing);
    const update: Partial<Product> = {};
    const changes: string[] = [];
    const change = (label: string, patch: Partial<Product>) => { changes.push(label); Object.assign(update, patch); };
    if (values.name !== existing.name) change('name_en', { name: values.name });
    if (values.arabicName !== (existing.arabicName || '')) change('name_ar', { arabicName: values.arabicName });
    if (values.sellerId !== existing.sellerId) change('seller_code', { sellerId: values.sellerId, artisan: seller.nameEn });
    if (values.sellerItemCode !== (existing.sellerItemCode || '')) change('seller_item_code', { sellerItemCode: values.sellerItemCode });
    if (values.category !== existing.category) change('category', { category: values.category });
    if (values.brand !== (existing.brand || '')) change('brand', { brand: values.brand });
    if (values.regular !== current.regular || values.promo !== current.promo) {
      const { priceUSD, originalPriceUSD } = fromRegularAndPromo(values.regular, values.promo);
      const label = [values.regular !== current.regular && 'price_usd', values.promo !== current.promo && 'promo_price_usd']
        .filter(Boolean).join(', ');
      // originalPriceUSD is sent even when undefined: that clears a promotion.
      change(label, { priceUSD, originalPriceUSD });
    }
    if (values.stock !== Number(existing.stock)) change('stock', { stock: values.stock });
    if (values.isPublished !== (existing.isPublished !== false)) change('status', { isPublished: values.isPublished });
    if (values.image !== (existing.image || '') || !sameList(values.additionalImages, existing.additionalImages || [])) {
      // Saving images rewrites the product's media, so its videos go along.
      change('images', {
        image: values.image,
        additionalImages: values.additionalImages,
        videoUrl: existing.videoUrl,
        additionalVideos: existing.additionalVideos,
      });
    }
    if (values.description !== (existing.description || '')) change('description', { description: values.description });
    if (values.craftStory !== (existing.craftStory || '')) change('craft_story', { craftStory: values.craftStory });
    if (values.origin !== (existing.origin || '')) change('origin', { origin: values.origin });
    if (values.weightOrVolume !== (existing.weightOrVolume || '')) change('weight_or_volume', { weightOrVolume: values.weightOrVolume });
    if (!sameList(values.tags, existing.tags || [])) change('tags', { tags: values.tags });

    rows.push({
      row, name, productId: existing.id, errors, changes,
      action: changes.length ? 'update' : 'unchanged',
      ...(changes.length ? { update } : {}),
    });
  }

  return finish();
}

// ── Importing ───────────────────────────────────────────────────────────────

export interface TemplateWriters {
  /** create_product_atomic; resolves to the new product's id. */
  create: (input: TemplateCreate) => Promise<string>;
  /** The partial product update the admin editor uses. */
  update: (productId: string, update: Partial<Product>) => Promise<void>;
}

export interface TemplateImportResult {
  created: number;
  updated: number;
  errors: string[];
  /** What was written, in order: the new product's id, or the updated one's. */
  written: Array<{ row: number; productId: string; action: 'create' | 'update' }>;
}

/**
 * Writes the rows of a file that checked clean, in file order, and stops at
 * the first row the database refuses, so the result says exactly how far it
 * got. Rows with problems are never written: the screens only offer this once
 * checkProductTemplate reports the file ready, and it is refused here too.
 */
export async function importTemplateRows(
  check: Pick<TemplateCheck, 'ready' | 'rows'>,
  writers: TemplateWriters,
  onProgress?: (done: number, total: number) => void,
): Promise<TemplateImportResult> {
  if (!check.ready) throw new Error('The file has problems; nothing was imported.');
  const work = check.rows.filter(r => r.action === 'create' || r.action === 'update');
  const result: TemplateImportResult = { created: 0, updated: 0, errors: [], written: [] };

  for (const [index, item] of work.entries()) {
    try {
      if (item.action === 'create' && item.create) {
        const productId = await writers.create(item.create);
        result.created++;
        result.written.push({ row: item.row, productId, action: 'create' });
      } else if (item.action === 'update' && item.update && item.productId) {
        await writers.update(item.productId, item.update);
        result.updated++;
        result.written.push({ row: item.row, productId: item.productId, action: 'update' });
      }
    } catch (err: any) {
      const left = work.length - index - 1;
      result.errors.push(
        `Row ${item.row} ("${item.name}") was not saved: ${String(err?.message || 'the database refused the change').replace(/\.$/, '')}.` +
        (left > 0 ? ` The ${left} row${left > 1 ? 's' : ''} after it ${left > 1 ? 'were' : 'was'} not imported.` : ''),
      );
      break;
    } finally {
      onProgress?.(index + 1, work.length);
    }
  }
  return result;
}

// ── Writing files ───────────────────────────────────────────────────────────

/** Formula-looking cells are escaped, so a spreadsheet shows them as text. */
const unparse = (data: string[][]) =>
  '﻿' + Papa.unparse({ fields: [...PRODUCT_TEMPLATE_COLUMNS], data }, { escapeFormulae: true, newline: '\r\n' });

/** The header row alone, for adding products. */
export function blankTemplateCsv(): string {
  return unparse([]);
}

/** Every product in template form, with its product_id, for updating. */
export function catalogTemplateCsv(ctx: TemplateContext): string {
  const sellers = new Map(ctx.sellers.map(s => [s.id, s]));
  const categories = new Map(ctx.categories.map(c => [c.id, c]));
  const data = ctx.products.map(p => {
    const { regular, promo } = toRegularAndPromo(p);
    const values: Record<TemplateColumn, string> = {
      product_id: p.id,
      seller_code: (p.sellerId && sellers.get(p.sellerId)?.sellerCode) || '',
      seller_item_code: p.sellerItemCode || '',
      name_en: p.name || '',
      name_ar: p.arabicName || '',
      category: categories.get(p.category)?.nameEn || p.category || '',
      brand: p.brand || '',
      price_usd: regular === null ? '' : String(Math.round(regular * 100) / 100),
      promo_price_usd: promo === null ? '' : String(Math.round(promo * 100) / 100),
      stock: String(p.stock ?? 0),
      status: p.isPublished === false ? 'draft' : 'published',
      image_url: p.image || '',
      additional_image_urls: (p.additionalImages || []).join(LIST_SEPARATOR),
      description: p.description || '',
      craft_story: p.craftStory || '',
      origin: p.origin || '',
      weight_or_volume: p.weightOrVolume || '',
      tags: (p.tags || []).join(LIST_SEPARATOR),
    };
    return PRODUCT_TEMPLATE_COLUMNS.map(c => values[c]);
  });
  return unparse(data);
}
