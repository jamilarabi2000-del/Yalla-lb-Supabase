import type { Product } from '../types';

/**
 * Admin behavior is intentionally backend-agnostic.
 * This module captures the catalog rules used by the original Yalla admin UI
 * without importing or depending on Firebase.
 */
export const ADMIN_PRODUCT_REQUIRED_FIELDS = ['name', 'category', 'priceUSD'] as const;

/**
 * Treats '' / null / undefined as "not supplied" rather than as 0.
 *
 * Number('') is 0, so clearing an optional numeric field used to write a real
 * zero: display order jumped to the front of the catalogue, the low-stock
 * threshold silently disabled its own warnings, and stock read as sold out.
 */
function optionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export const ADMIN_PRODUCT_DEFAULTS = {
  // No default category: category_id is a uuid foreign key, so a slug such as
  // 'grocery' can never resolve. The admin must pick a real category.
  category: '',
  origin: 'Lebanon',
  stock: 25,
  lowStockThreshold: 5,
  isNewArrival: true,
  isFeatured: false,
  isBestseller: false,
  isPublished: false,
} as const;

export function validateAdminProductInput(input: Partial<Product>): {
  valid: boolean;
  message?: string;
} {
  if (!String(input.name ?? '').trim()) {
    return { valid: false, message: 'Product name is required.' };
  }
  if (!String(input.category ?? '').trim()) {
    return { valid: false, message: 'Category is required.' };
  }

  const price = Number(input.priceUSD);
  if (!Number.isFinite(price) || price <= 0) {
    return { valid: false, message: 'Price must be greater than 0.' };
  }

  // Stock is optional in the admin form. When supplied, it must represent units.
  if (input.stock !== undefined && input.stock !== null) {
    const stock = Number(input.stock);
    if (!Number.isInteger(stock) || stock < 0) {
      return { valid: false, message: 'Stock quantity must be a whole number of units (0 or more).' };
    }
  }

  return { valid: true };
}

export function normalizeAdminProductPayload(
  input: Partial<Product>,
  published: boolean,
): Omit<Product, 'id' | 'rating' | 'reviewsCount'> {
  const stock = optionalNumber(input.stock) ?? ADMIN_PRODUCT_DEFAULTS.stock;

  return {
    name: String(input.name ?? '').trim(),
    arabicName: String(input.arabicName ?? '').trim() || undefined,
    category: String(input.category ?? ADMIN_PRODUCT_DEFAULTS.category).trim(),
    artisan: String(input.artisan ?? input.seller ?? 'Independent Artisan').trim(),
    seller: String(input.seller ?? input.artisan ?? 'Independent Artisan').trim(),
    sellerId: input.sellerId || undefined,
    arabicSeller: String(input.arabicSeller ?? '').trim() || undefined,
    origin: String(input.origin ?? ADMIN_PRODUCT_DEFAULTS.origin).trim() || ADMIN_PRODUCT_DEFAULTS.origin,
    brand: String(input.brand ?? '').trim() || undefined,
    priceUSD: Number(input.priceUSD),
    originalPriceUSD: optionalNumber(input.originalPriceUSD),
    discountPercentage: optionalNumber(input.discountPercentage),
    image: String(input.image ?? '').trim(),
    additionalImages: (input.additionalImages ?? []).filter(Boolean),
    videoUrl: String(input.videoUrl ?? '').trim() || undefined,
    additionalVideos: (input.additionalVideos ?? []).filter(Boolean),
    videos: (input.videos ?? input.additionalVideos ?? []).filter(Boolean),
    description: String(input.description ?? '').trim(),
    craftStory: String(input.craftStory ?? '').trim(),
    stock,
    isNewArrival: input.isNewArrival ?? ADMIN_PRODUCT_DEFAULTS.isNewArrival,
    isFeatured: input.isFeatured ?? ADMIN_PRODUCT_DEFAULTS.isFeatured,
    isBestseller: input.isBestseller ?? ADMIN_PRODUCT_DEFAULTS.isBestseller,
    isPublished: published,
    displayOrder: optionalNumber(input.displayOrder),
    sellerItemCode: String(input.sellerItemCode ?? '').trim() || undefined,
    lowStockThreshold: optionalNumber(input.lowStockThreshold),
    lowStockNotice: String(input.lowStockNotice ?? '').trim() || undefined,
    customStockLabel: String(input.customStockLabel ?? '').trim() || undefined,
    costPriceUSD: optionalNumber(input.costPriceUSD),
    tags: (input.tags ?? []).filter(Boolean),
    keywords: (input.keywords ?? []).filter(Boolean),
    arabicKeywords: (input.arabicKeywords ?? []).filter(Boolean),
    seoTitle: String(input.seoTitle ?? '').trim() || undefined,
    seoArabicTitle: String(input.seoArabicTitle ?? '').trim() || undefined,
    seoDescription: String(input.seoDescription ?? '').trim() || undefined,
    seoArabicDescription: String(input.seoArabicDescription ?? '').trim() || undefined,
    weightOrVolume: String(input.weightOrVolume ?? '').trim() || undefined,
  };
}
