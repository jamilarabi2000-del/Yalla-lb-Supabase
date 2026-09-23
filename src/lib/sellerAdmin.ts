/**
 * Pure logic behind the admin Sellers & Bulk Import screen, kept out of the
 * component so it can be tested without React.
 */
import type { CategoryItem, Product, Seller } from '../types';
import {
  isCsvRowEmpty,
  parsePrice,
  parseStock,
  resolveCategory,
  resolveSeller,
} from '../utils/importerResolvers';
import { normalizeLebanesePhone } from '../utils/phoneUtils';

// ── Phones ──────────────────────────────────────────────────────────────────

/**
 * A Lebanese number in international form, e.g. +96170123456 or +9613123456.
 *
 * Built on normalizeLebanesePhone -- the normaliser the rest of the app and
 * the database's phone registry agree on -- rather than the old local one,
 * which kept the trunk zero ('03 123 456' became +96103123456) and left
 * '70 123 456' untouched, so both failed validation unless typed with +961.
 */
export function normalizeLbWhatsApp(value: string): string {
  const input = (value || '').trim().replace(/^\+/, '').replace(/^00/, '');
  const n = normalizeLebanesePhone(input);
  if (!n.isValid) return (value || '').replace(/[^0-9+]/g, '');
  const digits = n.cleanDigits;
  return '+961' + (digits.startsWith('0') ? digits.slice(1) : digits);
}

export function isValidLbMobile(value: string): boolean {
  return /^\+961(3|70|71|76|78|79|81)\d{6}$/.test(normalizeLbWhatsApp(value));
}

export function whatsAppHref(phone?: string, message?: string): string | undefined {
  if (!phone || !isValidLbMobile(phone)) return undefined;
  const base = 'https://wa.me/' + normalizeLbWhatsApp(phone).replace('+', '');
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

// ── Geography ───────────────────────────────────────────────────────────────

/**
 * Lebanon's governorates and their districts (qada), for the cascading
 * pickers. Keyed by the id stored in sellers.governorate ('mount_lebanon'),
 * the form the existing rows and the Seller type already use.
 */
export const LEBANON_GOVERNORATES_DATA: Record<string, { label: string; districts: string[] }> = {
  beirut: { label: 'Beirut', districts: ['Beirut'] },
  mount_lebanon: { label: 'Mount Lebanon', districts: ['Baabda', 'Aley', 'Chouf', 'Keserwan', 'Matn', 'Jbeil'] },
  north: { label: 'North', districts: ['Tripoli', 'Zgharta', 'Bsharri', 'Batroun', 'Koura', 'Minieh-Dinnieh'] },
  akkar: { label: 'Akkar', districts: ['Akkar'] },
  bekaa: { label: 'Bekaa', districts: ['Zahle', 'West Bekaa', 'Rashaya'] },
  baalbek_hermel: { label: 'Baalbek-Hermel', districts: ['Baalbek', 'Hermel'] },
  south: { label: 'South', districts: ['Saida', 'Jezzine', 'Tyre'] },
  nabatieh: { label: 'Nabatieh', districts: ['Nabatieh', 'Bint Jbeil', 'Hasbaya', 'Marjeyoun'] },
};

export const geoKey = (v: string) => v.trim().toLowerCase().replace(/[\s-]+/g, '_');

/**
 * The governorate id for a stored value, which may be an id or a display name
 * typed into the old free-text form -- each id is its label's geoKey, so both
 * resolve the same way. An unrecognised value is returned as is, so the picker
 * can show it rather than silently blanking it.
 */
export function governorateId(value?: string): string {
  const raw = (value || '').trim();
  if (!raw) return '';
  const key = geoKey(raw);
  return LEBANON_GOVERNORATES_DATA[key] ? key : raw;
}

export function governorateLabel(value?: string): string {
  const id = governorateId(value);
  return LEBANON_GOVERNORATES_DATA[id]?.label ?? id;
}

/** "Chouf, Mount Lebanon • Deir El Qamar", omitting whatever is missing. */
export function sellerLocationLabel(s: Pick<Seller, 'district' | 'governorate' | 'village'>): string {
  const region = [s.district, governorateLabel(s.governorate)].filter(Boolean).join(', ');
  return [region, s.village].filter(Boolean).join(' • ');
}

// ── Seller applications ─────────────────────────────────────────────────────

/**
 * Sample photos from an application payload. No storefront form writes
 * applications yet, so the key is not fixed; every plausible one is read, and
 * only URLs that pass the image allowlist are returned.
 */
export function applicationPhotos(payload: any, isSafe: (url: string) => boolean): string[] {
  if (!payload || typeof payload !== 'object') return [];
  const candidates = [payload.photos, payload.sample_photos, payload.images, payload.gallery, payload.photo_urls]
    .flatMap(v => (Array.isArray(v) ? v : []));
  if (typeof payload.photo_url === 'string') candidates.push(payload.photo_url);
  return [...new Set(candidates.filter((u): u is string => typeof u === 'string' && isSafe(u)))].slice(0, 6);
}

// ── Listing, filtering, counts ──────────────────────────────────────────────

export type SellerStatusFilter = 'all' | 'active' | 'inactive';

export function sellerStatusCounts(sellers: Seller[]) {
  const active = sellers.filter(s => s.isActive !== false).length;
  return { all: sellers.length, active, inactive: sellers.length - active };
}

/** Products linked to a seller; "live" means published to the storefront. */
export function linkedProductCounts(products: Product[], sellerId: string) {
  const linked = products.filter(p => p.sellerId === sellerId);
  return { total: linked.length, live: linked.filter(p => p.isPublished !== false).length };
}

/**
 * Search matches the seller's own fields and the item codes of the products
 * linked to it, so an admin holding a product's code can find its maker.
 */
export function filterSellers(
  sellers: Seller[],
  products: Product[],
  query: string,
  status: SellerStatusFilter,
): Seller[] {
  const q = query.trim().toLowerCase();
  return sellers.filter(s => {
    if (status === 'active' && s.isActive === false) return false;
    if (status === 'inactive' && s.isActive !== false) return false;
    if (!q) return true;
    const own = [s.nameEn, s.nameAr, s.id, s.legacyId, s.sellerCode, s.governorate,
      governorateLabel(s.governorate), s.district, s.village, s.contactPhone, s.contactEmail, s.accountEmail];
    if (own.some(v => v && String(v).toLowerCase().includes(q))) return true;
    return products.some(p =>
      p.sellerId === s.id &&
      [p.sellerItemCode, (p as any).yallaItemCode].some(c => c && String(c).toLowerCase().includes(q)));
  });
}

// ── Admin-only fields ───────────────────────────────────────────────────────

/** A row from public.admin_list_seller_private(). */
export interface SellerPrivateRow {
  id: string;
  account_email?: string | null;
  contact_email?: string | null;
  exact_address?: string | null;
  commission_pct?: number | string | null;
}

/**
 * The storefront seller read never carries email, address or commission -- the
 * columns are not granted to clients -- so admin screens merge them in from
 * the verified-admin RPC before showing or exporting a seller.
 */
export function mergeSellerPrivate(sellers: Seller[], rows: SellerPrivateRow[]): Seller[] {
  const byId = new Map(rows.map(r => [r.id, r]));
  return sellers.map(s => {
    const r = byId.get(s.id);
    if (!r) return s;
    const commission = r.commission_pct === null || r.commission_pct === undefined || r.commission_pct === ''
      ? undefined
      : Number(r.commission_pct);
    return {
      ...s,
      accountEmail: r.account_email ?? s.accountEmail,
      contactEmail: r.contact_email ?? s.contactEmail,
      exactAddress: r.exact_address ?? s.exactAddress,
      commissionPct: Number.isFinite(commission) ? commission : s.commissionPct,
    };
  });
}

// ── Seller codes ────────────────────────────────────────────────────────────

/** Next free sequential code, SLR-101 upwards. The unique index is the guard. */
export function nextSellerCode(sellers: Array<Pick<Seller, 'sellerCode'>>, skip = 0): string {
  const used = sellers
    .map(s => /^SLR-(\d+)$/i.exec(String(s.sellerCode || '').trim())?.[1])
    .filter(Boolean)
    .map(Number);
  const next = Math.max(100, ...used) + 1 + skip;
  return `SLR-${String(next).padStart(3, '0')}`;
}

// ── Edit form ───────────────────────────────────────────────────────────────

export interface SellerForm {
  sellerCode: string;
  nameEn: string;
  nameAr: string;
  governorate: string;
  district: string;
  village: string;
  exactAddress: string;
  contactPhone: string;
  contactEmail: string;
  isActive: boolean;
  commissionPct: string;
  craftCategory: string;
  region: string;
  logoUrl: string;
  bannerImage: string;
  bioEn: string;
  bioAr: string;
}

const text = (v: unknown) => (v === null || v === undefined ? '' : String(v));

export function sellerToForm(seller?: Partial<Seller>): SellerForm {
  return {
    sellerCode: text(seller?.sellerCode),
    nameEn: text(seller?.nameEn),
    nameAr: text(seller?.nameAr),
    // Normalised on both sides of the edit diff, so a legacy display name is
    // only rewritten as an id when the admin actually changes the governorate.
    governorate: governorateId(text(seller?.governorate)),
    district: text(seller?.district),
    village: text(seller?.village),
    exactAddress: text(seller?.exactAddress),
    contactPhone: text(seller?.contactPhone),
    contactEmail: text(seller?.contactEmail),
    isActive: seller?.isActive !== false,
    commissionPct: seller?.commissionPct === undefined || seller?.commissionPct === null
      ? '' : String(seller.commissionPct),
    craftCategory: text(seller?.craftCategory),
    region: text(seller?.region),
    logoUrl: text(seller?.logoUrl),
    bannerImage: text(seller?.bannerImage),
    bioEn: text(seller?.bioEn),
    bioAr: text(seller?.bioAr),
  };
}

export function validateSellerForm(
  form: SellerForm,
  opts: { sellers: Array<Pick<Seller, 'id' | 'sellerCode'>>; editingId?: string },
): Partial<Record<keyof SellerForm, string>> {
  const e: Partial<Record<keyof SellerForm, string>> = {};
  const code = form.sellerCode.trim().toUpperCase();
  if (!code) e.sellerCode = 'Seller code is required.';
  else if (!/^[A-Z0-9-]{3,20}$/.test(code)) e.sellerCode = 'Use 3-20 letters, digits or hyphens, e.g. SLR-101.';
  else if (opts.sellers.some(s => s.id !== opts.editingId && String(s.sellerCode || '').toUpperCase() === code)) {
    e.sellerCode = 'Another seller already uses this code.';
  }
  if (!form.nameEn.trim()) e.nameEn = 'English name is required.';
  if (!form.governorate) e.governorate = 'Governorate is required.';
  if (!form.district) e.district = 'District is required.';
  if (!form.village.trim()) e.village = 'Village or town is required.';
  if (form.contactPhone.trim() && !isValidLbMobile(form.contactPhone)) {
    e.contactPhone = 'Enter a Lebanese mobile, e.g. +961 70 123 456.';
  }
  if (form.contactEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail.trim())) {
    e.contactEmail = 'Enter a valid email address.';
  }
  if (form.commissionPct.trim()) {
    const n = Number(form.commissionPct);
    if (!Number.isFinite(n) || n < 0 || n > 100) e.commissionPct = 'Commission must be between 0 and 100.';
  }
  return e;
}

/**
 * What to send when saving the form.
 *
 * On edit, only fields the admin actually changed are sent. The previous form
 * sent every field, and commission went through Number() -- so a seller loaded
 * without its commission (the storefront read never carries it) saved
 * Number(undefined) = NaN, which JSON serialises as null: every edit wiped the
 * commission rate. Sending only changed fields means a value that failed to
 * load can never overwrite the real one.
 */
export function buildSellerPayload(initial: SellerForm, form: SellerForm, isCreate: boolean): Partial<Seller> {
  const clean: Record<keyof SellerForm, unknown> = {
    sellerCode: form.sellerCode.trim().toUpperCase(),
    nameEn: form.nameEn.trim(),
    nameAr: form.nameAr.trim(),
    governorate: form.governorate,
    district: form.district,
    village: form.village.trim(),
    exactAddress: form.exactAddress.trim(),
    contactPhone: form.contactPhone.trim() ? normalizeLbWhatsApp(form.contactPhone) : '',
    contactEmail: form.contactEmail.trim(),
    isActive: form.isActive,
    commissionPct: form.commissionPct.trim() === '' ? null : Number(form.commissionPct),
    craftCategory: form.craftCategory.trim(),
    region: form.region.trim(),
    logoUrl: form.logoUrl.trim(),
    bannerImage: form.bannerImage.trim(),
    bioEn: form.bioEn.trim(),
    bioAr: form.bioAr.trim(),
  };

  const payload: Record<string, unknown> = {};
  (Object.keys(clean) as Array<keyof SellerForm>).forEach(key => {
    const value = clean[key];
    if (isCreate) {
      if (value !== '' && value !== null) payload[key] = value;
      return;
    }
    if (form[key] !== initial[key]) payload[key] = value;
  });
  return payload as Partial<Seller>;
}

// ── CSV bulk import ─────────────────────────────────────────────────────────

/** Every header here is read by bulkImportProducts. */
export const CSV_TEMPLATE_HEADERS = [
  'sku', 'name', 'arabic_name', 'price_usd', 'category_id', 'seller_id',
  'seller_item_code', 'stock', 'origin', 'image_url',
] as const;

export interface ImportPreviewRow {
  row: number;
  sku: string;
  name: string;
  seller: string;
  category: string;
  action: 'Create' | 'Update';
  issues: string[];
}

const isDraftRow = (row: any) =>
  ['no', 'false', '0', 'draft'].includes(String(row.is_published ?? row.status ?? '').trim().toLowerCase());

/**
 * Dry run that predicts bulkImportProducts row for row. It calls the same
 * resolvers and parsers the importer does and applies the same rejections --
 * name, seller, category, price, stock -- so "Ready" means the import will
 * accept the row. It additionally flags duplicate SKUs within the file and a
 * price under the $1.00 floor the database enforces on published products.
 */
export function previewCsvImport(
  rows: any[],
  ctx: {
    products: Product[];
    sellers: Seller[];
    categories: CategoryItem[];
    targetSellerId?: string;
    fallbackCategoryId?: string;
  },
): ImportPreviewRow[] {
  const seen = new Map<string, number>();
  const out: ImportPreviewRow[] = [];

  rows.forEach((row, index) => {
    if (isCsvRowEmpty(row)) return;
    const rowNum = index + 2; // header is row 1
    const issues: string[] = [];

    const sku = String(row.sku || row.product_id || '').trim();
    const name = String(row.name_en || row.name || row.title || '').trim();
    const seller = resolveSeller(row, ctx.sellers, ctx.targetSellerId);
    const category = resolveCategory(row, ctx.categories, ctx.fallbackCategoryId);
    const rawPrice = row.price_usd || row.price || row.unit_price;
    const price = parsePrice(rawPrice);
    const rawStock = row.stock !== undefined ? row.stock : row.qty;
    const stock = parseStock(rawStock);

    if (!name) issues.push('Missing product name.');
    if (!seller) {
      const raw = row.seller_id || row.seller_code || row.seller || '';
      issues.push(raw
        ? `Seller "${raw}" does not match an active seller.`
        : 'Missing seller code -- add seller_id or pick a target seller.');
    }
    if (!category) {
      const raw = row.category_id || row.category || '';
      issues.push(raw ? `Category "${raw}" not found.` : 'Missing category -- add category_id or pick a fallback.');
    }
    if (price <= 0) issues.push(`Invalid price "${rawPrice ?? ''}" -- use a positive number, e.g. 12.50.`);
    else if (price < 1 && !isDraftRow(row)) issues.push('Price is below the $1.00 minimum for published products.');
    if (Number.isNaN(stock) || stock < 0) {
      issues.push(`Invalid stock "${rawStock ?? ''}" -- use a whole number.`);
    }
    if (sku) {
      const key = sku.toLowerCase();
      if (seen.has(key)) issues.push(`Duplicate SKU -- also on row ${seen.get(key)}.`);
      else seen.set(key, rowNum);
    }

    out.push({
      row: rowNum,
      sku,
      name,
      seller: seller?.sellerName || '—',
      category: category?.categoryName || '—',
      action: sku && ctx.products.some(p => p.id === sku) ? 'Update' : 'Create',
      issues,
    });
  });

  return out;
}

/**
 * Catalog export in the template's own format, so it round-trips through the
 * importer. Two columns beyond the template, both read by bulkImportProducts:
 * original_price_usd, without which a discount is lost on re-import, and
 * is_published, without which drafts would come back published.
 */
export function catalogExportRows(products: Product[]) {
  return products.map(p => ({
    sku: p.id,
    name: p.name,
    arabic_name: p.arabicName || '',
    price_usd: p.priceUSD,
    category_id: p.category,
    seller_id: p.sellerId || '',
    seller_item_code: p.sellerItemCode || '',
    stock: p.stock,
    origin: p.origin || '',
    image_url: p.image || '',
    original_price_usd: p.originalPriceUSD ?? '',
    is_published: p.isPublished === false ? 'no' : 'yes',
  }));
}
