/**
 * Pure logic behind the admin Sellers & Bulk Import screen, kept out of the
 * component so it can be tested without React.
 */
import type { Product, Seller } from '../types';
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

// ── Edit form ───────────────────────────────────────────────────────────────

export interface SellerForm {
  /**
   * Shown, never sent: the database assigns the code when the seller is
   * created and refuses to change it (private.assign_seller_code).
   */
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

export function validateSellerForm(form: SellerForm): Partial<Record<keyof SellerForm, string>> {
  const e: Partial<Record<keyof SellerForm, string>> = {};
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
  // No sellerCode: the database assigns it, and a changed one is refused.
  const clean: Record<Exclude<keyof SellerForm, 'sellerCode'>, unknown> = {
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
  (Object.keys(clean) as Array<keyof typeof clean>).forEach(key => {
    const value = clean[key];
    if (isCreate) {
      if (value !== '' && value !== null) payload[key] = value;
      return;
    }
    if (form[key] !== initial[key]) payload[key] = value;
  });
  return payload as Partial<Seller>;
}

