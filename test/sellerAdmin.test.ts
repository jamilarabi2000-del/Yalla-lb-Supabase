import { describe, it, expect } from 'vitest';
import type { CategoryItem, Product, Seller } from '../src/types';
import {
  CSV_TEMPLATE_HEADERS,
  buildSellerPayload,
  catalogExportRows,
  filterSellers,
  isValidLbMobile,
  linkedProductCounts,
  mergeSellerPrivate,
  previewCsvImport,
  sellerStatusCounts,
  sellerToForm,
  validateSellerForm,
  whatsAppHref,
} from '../src/lib/sellerAdmin';

const seller = (over: Partial<Seller> = {}): Seller => ({
  id: 's-1', nameEn: 'Chouf Eco Soap', nameAr: 'صابون الشوف', sellerCode: 'SLR-101',
  governorate: 'mount_lebanon', district: 'Chouf', village: 'Deir El Qamar',
  contactPhone: '+96170123456', isActive: true, createdAt: '', updatedAt: '', ...over,
} as Seller);

const product = (over: Partial<Product> = {}): Product => ({
  id: 'p-1', name: 'Laurel Soap', priceUSD: 8, stock: 5, category: 'c-1',
  sellerId: 's-1', isPublished: true, ...over,
} as Product);

const category = (over: Partial<CategoryItem> = {}): CategoryItem => ({
  id: 'c-1', nameEn: 'Soap', nameAr: 'صابون', icon: '', description: '', subcategories: [],
  bannerUrl: '', ...over,
} as CategoryItem);

describe('editing a seller never wipes fields it did not change', () => {
  // What fetchSellers actually hands the admin screen: no commission, email or
  // address, because those columns are not granted to clients.
  const loaded = seller({ commissionPct: undefined, contactEmail: undefined, exactAddress: undefined });

  it('saving an untouched form sends nothing', () => {
    const initial = sellerToForm(loaded);
    expect(buildSellerPayload(initial, { ...initial }, false)).toEqual({});
  });

  it('changing the name sends only the name -- not commission_pct: null', () => {
    // The old form sent Number(form.commissionPct) for every save. With
    // commission never loaded that was Number(undefined) = NaN, which JSON
    // serialises as null, so every seller edit wiped the commission rate.
    const initial = sellerToForm(loaded);
    const payload = buildSellerPayload(initial, { ...initial, nameEn: 'Chouf Soap Co.' }, false);
    expect(payload).toEqual({ nameEn: 'Chouf Soap Co.' });
    expect(JSON.stringify(payload)).not.toContain('commission');
  });

  it('never produces NaN for commission under any input', () => {
    const initial = sellerToForm(loaded);
    for (const typed of ['', '12', '12.5', '0', '100']) {
      const payload = buildSellerPayload(initial, { ...initial, commissionPct: typed }, false);
      if ('commissionPct' in payload) expect(Number.isNaN(payload.commissionPct as number)).toBe(false);
    }
  });

  it('an explicit clear is sent as null, a typed rate as a number', () => {
    const initial = sellerToForm(seller({ commissionPct: 12 }));
    expect(buildSellerPayload(initial, { ...initial, commissionPct: '' }, false)).toEqual({ commissionPct: null });
    expect(buildSellerPayload(initial, { ...initial, commissionPct: '15' }, false)).toEqual({ commissionPct: 15 });
  });

  it('creating a seller sends every filled field, normalised', () => {
    const form = { ...sellerToForm(), nameEn: 'New Artisan',
      governorate: 'north', district: 'Koura', village: 'Amioun', contactPhone: '70 123 456', commissionPct: '10' };
    const payload = buildSellerPayload(sellerToForm(), form, true);
    expect(payload).toMatchObject({ nameEn: 'New Artisan', governorate: 'north', contactPhone: '+96170123456',
      commissionPct: 10, isActive: true });
    expect(payload).not.toHaveProperty('exactAddress');
  });

  it('never sends a seller code: the database assigns it and refuses a change', () => {
    const initial = sellerToForm(seller());
    const tampered = { ...initial, sellerCode: 'SLR-999' };
    expect(buildSellerPayload(initial, tampered, false)).not.toHaveProperty('sellerCode');
    expect(buildSellerPayload(sellerToForm(), { ...tampered, nameEn: 'New' }, true)).not.toHaveProperty('sellerCode');
  });
});

describe('seller form validation', () => {
  const valid = { ...sellerToForm(), nameEn: 'A', governorate: 'north',
    district: 'Koura', village: 'Amioun' };

  it('requires the fields the spec marks with *, and never asks for a code', () => {
    const e = validateSellerForm(sellerToForm());
    expect(Object.keys(e).sort()).toEqual(['district', 'governorate', 'nameEn', 'village']);
    expect(validateSellerForm(valid)).toEqual({});
  });

  it('checks phone, email and commission range', () => {
    const e = validateSellerForm({ ...valid, contactPhone: '12345', contactEmail: 'nope', commissionPct: '140' });
    expect(Object.keys(e).sort()).toEqual(['commissionPct', 'contactEmail', 'contactPhone']);
  });
});

describe('listing, search and counts', () => {
  const sellers = [seller(), seller({ id: 's-2', nameEn: 'Koura Oil', sellerCode: 'SLR-102', isActive: false })];
  const products = [product({ sellerItemCode: 'KOR-OLIVE-9', sellerId: 's-2' }), product({ id: 'p-2', isPublished: false })];

  it('counts All / Active / Inactive', () => {
    expect(sellerStatusCounts(sellers)).toEqual({ all: 2, active: 1, inactive: 1 });
  });

  it('filters by status', () => {
    expect(filterSellers(sellers, products, '', 'active').map(s => s.id)).toEqual(['s-1']);
    expect(filterSellers(sellers, products, '', 'inactive').map(s => s.id)).toEqual(['s-2']);
  });

  it('finds a seller by a linked product\'s item code', () => {
    expect(filterSellers(sellers, products, 'kor-olive', 'all').map(s => s.id)).toEqual(['s-2']);
  });

  it('counts live and total linked products', () => {
    expect(linkedProductCounts(products, 's-1')).toEqual({ total: 1, live: 0 });
  });
});

describe('admin-only fields and codes', () => {
  it('merges email, address and commission from the private RPC', () => {
    const [merged] = mergeSellerPrivate([seller()], [{
      id: 's-1', account_email: 'login@x.lb', contact_email: 'c@x.lb', exact_address: 'Bldg 4', commission_pct: '12.5',
    }]);
    expect(merged).toMatchObject({ accountEmail: 'login@x.lb', contactEmail: 'c@x.lb', exactAddress: 'Bldg 4', commissionPct: 12.5 });
  });

  it('accepts Lebanese mobiles in every common written form', () => {
    // The old seller form accepted only +961 forms: it kept the trunk zero on
    // 03 numbers and left 70/71/76/78/79/81 numbers un-normalised.
    for (const written of ['03 123 456', '+961 3 123 456', '70 123 456', '+961 70 123 456',
      '96170123456', '0096170123456', '81 234 567']) {
      expect(isValidLbMobile(written), written).toBe(true);
    }
    for (const bad of ['12345', '01 123 456', '+33 6 12 34 56 78', '']) {
      expect(isValidLbMobile(bad), bad).toBe(false);
    }
  });

  it('builds WhatsApp links only for valid Lebanese mobiles', () => {
    expect(whatsAppHref('03 123 456')).toBe('https://wa.me/9613123456');
    expect(whatsAppHref('+961 70 123 456', 'Marhaba!')).toBe('https://wa.me/96170123456?text=Marhaba!');
    expect(whatsAppHref('12345')).toBeUndefined();
  });
});

describe('CSV dry run predicts the importer', () => {
  const ctx = { products: [product()], sellers: [seller()], categories: [category()] };
  const base = { sku: 'new-1', name: 'Olive Oil', price_usd: '12.50', category_id: 'c-1', seller_id: 's-1', stock: '10' };

  it('marks a complete row Ready and labels Create vs Update', () => {
    const [created, updated] = previewCsvImport([base, { ...base, sku: 'p-1' }], ctx);
    expect(created).toMatchObject({ row: 2, action: 'Create', seller: 'Chouf Eco Soap', category: 'Soap', issues: [] });
    expect(updated.action).toBe('Update');
  });

  it('flags a missing stock, which the importer rejects and the old dry run ignored', () => {
    const [row] = previewCsvImport([{ ...base, stock: '' }], ctx);
    expect(row.issues.join(' ')).toMatch(/stock/i);
  });

  it('flags a missing or unknown seller code', () => {
    const two = { ...ctx, sellers: [seller(), seller({ id: 's-2', nameEn: 'Koura Oil', sellerCode: 'SLR-102' })] };
    expect(previewCsvImport([{ ...base, seller_id: '' }], two)[0].issues.join(' ')).toMatch(/Missing seller code/);
    expect(previewCsvImport([{ ...base, seller_id: 'SLR-999' }], two)[0].issues.join(' ')).toMatch(/does not match/);
    // A target seller chosen in the UI resolves it, exactly as the importer does.
    expect(previewCsvImport([{ ...base, seller_id: '' }], { ...two, targetSellerId: 's-1' })[0].issues).toEqual([]);
  });

  it('like the importer, assigns a seller-less row to the only seller when there is one', () => {
    expect(previewCsvImport([{ ...base, seller_id: '' }], ctx)[0]).toMatchObject({ seller: 'Chouf Eco Soap', issues: [] });
  });

  it('resolves a seller by code as well as by id', () => {
    expect(previewCsvImport([{ ...base, seller_id: 'SLR-101' }], ctx)[0].issues).toEqual([]);
  });

  it('flags invalid prices, the $1.00 floor unless draft, and duplicate SKUs', () => {
    const rows = previewCsvImport([
      { ...base, sku: 'a', price_usd: 'abc' },
      { ...base, sku: 'b', price_usd: '0.50' },
      { ...base, sku: 'c', price_usd: '0.50', is_published: 'no' },
      { ...base, sku: 'd' },
      { ...base, sku: 'D' },
    ], ctx);
    expect(rows[0].issues.join(' ')).toMatch(/Invalid price/);
    expect(rows[1].issues.join(' ')).toMatch(/\$1\.00 minimum/);
    expect(rows[2].issues).toEqual([]);
    expect(rows[4].issues.join(' ')).toMatch(/Duplicate SKU -- also on row 5/);
  });

  it('skips blank lines the way the importer does', () => {
    expect(previewCsvImport([base, {}, { name: '' }], ctx)).toHaveLength(1);
  });

  it('exports the catalog in a format the template and importer share', () => {
    const [row] = catalogExportRows([product({ originalPriceUSD: 10 })]);
    for (const header of CSV_TEMPLATE_HEADERS) expect(row).toHaveProperty(header);
    expect(row).toMatchObject({ sku: 'p-1', price_usd: 8, original_price_usd: 10, is_published: 'yes' });
  });
});

describe('geography and applications', () => {
  it('covers all eight governorates by the id sellers.governorate stores', async () => {
    const { LEBANON_GOVERNORATES_DATA } = await import('../src/lib/sellerAdmin');
    expect(Object.keys(LEBANON_GOVERNORATES_DATA).sort()).toEqual(
      ['akkar', 'baalbek_hermel', 'beirut', 'bekaa', 'mount_lebanon', 'nabatieh', 'north', 'south']);
    expect(Object.values(LEBANON_GOVERNORATES_DATA).every(g => g.label && g.districts.length > 0)).toBe(true);
    // Production's one seller: governorate 'mount_lebanon', district 'Chouf'.
    expect(LEBANON_GOVERNORATES_DATA.mount_lebanon.districts).toContain('Chouf');
  });

  it('keeps every id equal to its label in snake case, which legacy names rely on', async () => {
    const { LEBANON_GOVERNORATES_DATA, geoKey } = await import('../src/lib/sellerAdmin');
    for (const [id, g] of Object.entries(LEBANON_GOVERNORATES_DATA)) expect(geoKey(g.label), id).toBe(id);
  });

  it('resolves ids and legacy display names to the same id', async () => {
    const { governorateId, governorateLabel } = await import('../src/lib/sellerAdmin');
    expect(governorateId('mount_lebanon')).toBe('mount_lebanon');
    expect(governorateId('Mount Lebanon')).toBe('mount_lebanon');
    expect(governorateId(' baalbek-hermel ')).toBe('baalbek_hermel');
    expect(governorateId('Baalbek Hermel')).toBe('baalbek_hermel');
    expect(governorateId('')).toBe('');
    expect(governorateId(undefined)).toBe('');
    // Unknown values survive, so the picker can show them instead of a blank.
    expect(governorateId('Mount Leb.')).toBe('Mount Leb.');
    expect(governorateLabel('mount_lebanon')).toBe('Mount Lebanon');
    expect(governorateLabel('Mount Leb.')).toBe('Mount Leb.');
  });

  it('opens a stored seller with its governorate selected, whichever form it was saved in', () => {
    expect(sellerToForm(seller()).governorate).toBe('mount_lebanon');
    expect(sellerToForm(seller({ governorate: 'Mount Lebanon' })).governorate).toBe('mount_lebanon');
  });

  it('does not rewrite a legacy governorate the admin did not touch', () => {
    const initial = sellerToForm(seller({ governorate: 'Mount Lebanon' }));
    expect(buildSellerPayload(initial, { ...initial, village: 'Beiteddine' }, false))
      .toEqual({ village: 'Beiteddine' });
    expect(buildSellerPayload(initial, { ...initial, governorate: 'north', district: 'Koura' }, false))
      .toEqual({ governorate: 'north', district: 'Koura' });
  });

  it('formats the card location line and tolerates gaps', async () => {
    const { sellerLocationLabel } = await import('../src/lib/sellerAdmin');
    expect(sellerLocationLabel({ district: 'Chouf', governorate: 'mount_lebanon', village: 'Deir El Qamar' }))
      .toBe('Chouf, Mount Lebanon • Deir El Qamar');
    expect(sellerLocationLabel({ district: 'Chouf', governorate: 'Mount Lebanon', village: 'Deir El Qamar' }))
      .toBe('Chouf, Mount Lebanon • Deir El Qamar');
    expect(sellerLocationLabel({ village: 'Amioun' })).toBe('Amioun');
  });

  it('finds a seller by the governorate name an admin would type', () => {
    expect(filterSellers([seller()], [], 'mount lebanon', 'all')).toHaveLength(1);
  });

  it('extracts only safe applicant photo URLs', async () => {
    const { applicationPhotos } = await import('../src/lib/sellerAdmin');
    const { isSafeImageUrl } = await import('../src/lib/safeUrl');
    const photos = applicationPhotos({
      photos: ['https://images.unsplash.com/a.jpg', 'javascript:alert(1)'],
      photo_url: 'https://images.unsplash.com/a.jpg',
    }, isSafeImageUrl);
    expect(photos.every(isSafeImageUrl)).toBe(true);
    expect(photos).not.toContain('javascript:alert(1)');
    expect(new Set(photos).size).toBe(photos.length);
  });
});
