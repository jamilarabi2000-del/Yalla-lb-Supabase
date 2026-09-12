import { Seller, CategoryItem } from '../types';

export interface ResolvedSeller {
  sellerId: string;
  sellerName: string;
  arabicSeller?: string;
}

export interface ResolvedCategory {
  categoryId: string;
  categoryName: string;
}

/**
 * Checks whether a parsed CSV row is blank/empty (e.g. trailing blank lines, empty commas, whitespace).
 */
export function isCsvRowEmpty(row: any): boolean {
  if (!row || typeof row !== 'object') return true;
  const values = Object.values(row);
  if (values.length === 0) return true;

  // Check if all fields are empty/whitespace
  const hasAnyValue = values.some(v => v !== undefined && v !== null && String(v).trim() !== '');
  if (!hasAnyValue) return true;

  // Check if at least one meaningful product attribute exists (name, title, sku, price, category, etc.)
  const hasName = Boolean(row.name || row.name_en || row.title || row.product_name);
  const hasSku = Boolean(row.sku || row.product_id || row.seller_item_code || row.item_code);
  const hasPrice = Boolean(row.price || row.price_usd || row.unit_price);
  const hasCategory = Boolean(row.category || row.category_id || row.collection);

  return !hasName && !hasSku && !hasPrice && !hasCategory;
}

/**
 * Normalizes text for fuzzy matching (lowercase, removes special chars, trims).
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\u0600-\u06FF]+/g, ' ')
    .trim();
}

/**
 * Intelligent seller ID resolver:
 * Matches by explicit target selection, exact ID, case-insensitive ID, nameEn, nameAr, slug, or substring.
 */
export function resolveSeller(
  row: any,
  sellers: Seller[],
  targetSellerId?: string
): ResolvedSeller | null {
  // If user selected an explicit target seller override from the UI dropdown, prioritize it
  if (targetSellerId && targetSellerId !== 'auto') {
    const forced = sellers.find(s => s.id === targetSellerId || s.id.toLowerCase() === targetSellerId.toLowerCase());
    if (forced) {
      return {
        sellerId: forced.id,
        sellerName: forced.nameEn || forced.id,
        arabicSeller: forced.nameAr
      };
    }
  }

  // Extract raw value from various common column header permutations
  const rawValue = (
    row.seller_code ??
    row.sellercode ??
    row.seller_id ??
    row.sellerid ??
    row.seller ??
    row.artisan ??
    row.seller_artisan ??
    row.seller_name ??
    row.sellername ??
    row['seller / artisan'] ??
    row['seller id'] ??
    row['seller code'] ??
    row['artisan / seller'] ??
    row.vendor ??
    row.merchant ??
    row.brand ??
    row.producer ??
    row.arabic_seller ??
    row.arabic_artisan ??
    ''
  ).toString().trim();

  // If no value provided in the row:
  if (!rawValue || rawValue.toLowerCase() === 'undefined' || rawValue.toLowerCase() === 'null') {
    // If target seller is set, use it
    if (targetSellerId && targetSellerId !== 'auto') {
      const matched = sellers.find(s => s.id === targetSellerId);
      if (matched) {
        return {
          sellerId: matched.id,
          sellerName: matched.nameEn || matched.id,
          arabicSeller: matched.nameAr
        };
      }
    }
    // If only 1 seller exists in total, default to it
    if (sellers.length === 1) {
      return {
        sellerId: sellers[0].id,
        sellerName: sellers[0].nameEn || sellers[0].id,
        arabicSeller: sellers[0].nameAr
      };
    }
    return null;
  }

  // 0. Direct sellerCode match
  const byCode = sellers.find(s => s.sellerCode && s.sellerCode.toLowerCase() === rawValue.toLowerCase());
  if (byCode) {
    return {
      sellerId: byCode.id,
      sellerName: byCode.nameEn || byCode.id,
      arabicSeller: byCode.nameAr
    };
  }

  // 1. Direct ID match
  const byId = sellers.find(s => s.id.toLowerCase() === rawValue.toLowerCase());
  if (byId) {
    return {
      sellerId: byId.id,
      sellerName: byId.nameEn || byId.id,
      arabicSeller: byId.nameAr
    };
  }

  // 2. Direct Name match (EN / AR)
  const byName = sellers.find(s =>
    (s.nameEn && s.nameEn.toLowerCase() === rawValue.toLowerCase()) ||
    (s.nameAr && s.nameAr.toLowerCase() === rawValue.toLowerCase())
  );
  if (byName) {
    return {
      sellerId: byName.id,
      sellerName: byName.nameEn || byName.id,
      arabicSeller: byName.nameAr
    };
  }

  // 3. Normalized string match
  const normRaw = normalizeText(rawValue);
  const byNorm = sellers.find(s => {
    const n1 = normalizeText(s.id);
    const n2 = normalizeText(s.nameEn || '');
    const n3 = normalizeText(s.nameAr || '');
    return n1 === normRaw || n2 === normRaw || n3 === normRaw;
  });
  if (byNorm) {
    return {
      sellerId: byNorm.id,
      sellerName: byNorm.nameEn || byNorm.id,
      arabicSeller: byNorm.nameAr
    };
  }

  // 4. Substring inclusion match (e.g. "FONENG" matching "FONENG Store")
  const bySub = sellers.find(s => {
    const nId = normalizeText(s.id);
    const nName = normalizeText(s.nameEn || '');
    return (
      (nId && (nId.includes(normRaw) || normRaw.includes(nId))) ||
      (nName && (nName.includes(normRaw) || normRaw.includes(nName)))
    );
  });
  if (bySub) {
    return {
      sellerId: bySub.id,
      sellerName: bySub.nameEn || bySub.id,
      arabicSeller: bySub.nameAr
    };
  }

  // 5. Fallback to target seller if selected
  if (targetSellerId && targetSellerId !== 'auto') {
    const matched = sellers.find(s => s.id === targetSellerId);
    if (matched) {
      return {
        sellerId: matched.id,
        sellerName: matched.nameEn || matched.id,
        arabicSeller: matched.nameAr
      };
    }
  }

  // 6. If only 1 seller exists in total, fallback
  if (sellers.length === 1) {
    return {
      sellerId: sellers[0].id,
      sellerName: sellers[0].nameEn || sellers[0].id,
      arabicSeller: sellers[0].nameAr
    };
  }

  return null;
}

/**
 * Intelligent category resolver:
 * Matches by explicit fallback, exact ID, name, Arabic name, slug, or substring.
 */
export function resolveCategory(
  row: any,
  categories: CategoryItem[],
  fallbackCategoryId?: string
): ResolvedCategory | null {
  const rawCat = (
    row.category ??
    row.category_id ??
    row.categoryid ??
    row.category_name ??
    row['category name'] ??
    row.collection ??
    row.type ??
    ''
  ).toString().trim();

  // If empty or undefined
  if (!rawCat || rawCat.toLowerCase() === 'undefined' || rawCat.toLowerCase() === 'null') {
    if (fallbackCategoryId && fallbackCategoryId !== 'auto') {
      const matched = categories.find(c => c.id === fallbackCategoryId);
      if (matched) return { categoryId: matched.id, categoryName: matched.nameEn };
    }
    return null;
  }

  // 1. Direct ID match
  const byId = categories.find(c => c.id.toLowerCase() === rawCat.toLowerCase());
  if (byId) return { categoryId: byId.id, categoryName: byId.nameEn };

  // 2. Direct Name match
  const byName = categories.find(c =>
    (c.nameEn && c.nameEn.toLowerCase() === rawCat.toLowerCase()) ||
    (c.nameAr && c.nameAr.toLowerCase() === rawCat.toLowerCase())
  );
  if (byName) return { categoryId: byName.id, categoryName: byName.nameEn };

  // 3. Normalized / slug match
  const normRaw = normalizeText(rawCat);
  const byNorm = categories.find(c => {
    const nId = normalizeText(c.id);
    const nName = normalizeText(c.nameEn || '');
    const nAr = normalizeText(c.nameAr || '');
    return nId === normRaw || nName === normRaw || nAr === normRaw;
  });
  if (byNorm) return { categoryId: byNorm.id, categoryName: byNorm.nameEn };

  // 4. Substring match
  const bySub = categories.find(c => {
    const nId = normalizeText(c.id);
    const nName = normalizeText(c.nameEn || '');
    return (
      (nId && (nId.includes(normRaw) || normRaw.includes(nId))) ||
      (nName && (nName.includes(normRaw) || normRaw.includes(nName)))
    );
  });
  if (bySub) return { categoryId: bySub.id, categoryName: bySub.nameEn };

  // 5. Fallback category if given
  if (fallbackCategoryId && fallbackCategoryId !== 'auto') {
    const matched = categories.find(c => c.id === fallbackCategoryId);
    if (matched) return { categoryId: matched.id, categoryName: matched.nameEn };
  }

  return null;
}

/**
 * Sanitizes numeric price values from dirty string inputs (e.g., "$15.50", "15,50 USD").
 */
export function parsePrice(val: any): number {
  if (typeof val === 'number') {
    if (isNaN(val) || !isFinite(val)) return 0;
    return Math.max(0, Math.round(val * 100) / 100);
  }
  if (!val) return 0;
  const str = String(val).replace(/[^0-9.,]/g, '').replace(',', '.');
  const num = parseFloat(str);
  if (isNaN(num) || !isFinite(num)) return 0;
  return Math.max(0, Math.round(num * 100) / 100);
}

/**
 * Sanitizes numeric stock quantity strictly.
 * Accepts only plain integers (with optional commas as thousands separators).
 * Returns NaN for unit suffixes (e.g. "500ml", "750g", "245 Pcs") or missing values,
 * so the importer/form can reject invalid rows and not invent defaults.
 */
export function parseStock(val: any): number {
  if (typeof val === 'number') return isNaN(val) ? NaN : Math.max(0, Math.floor(val));
  if (val === undefined || val === null || String(val).trim() === '') return NaN;
  const raw = String(val).trim();
  // Reject if it contains unit letters or characters other than digits and commas/spaces
  if (/[a-zA-Z]/.test(raw)) {
    return NaN;
  }
  const clean = raw.replace(/,/g, '').trim();
  if (!/^\d+$/.test(clean)) {
    return NaN;
  }
  const num = parseInt(clean, 10);
  return isNaN(num) ? NaN : Math.max(0, num);
}
