import { supabase } from '../lib/supabase';
import { Product, CategoryItem, Seller, TerroirRegion } from '../types';
import { DEFAULT_CATEGORIES } from '../data/categories';
import { DEFAULT_SELLERS } from '../data/sellers';
import { LEBANON_REGIONS } from '../data/regions';
import { INITIAL_PRODUCTS } from '../data/products';

/**
 * Maps raw Supabase database row to frontend Product interface.
 * Handles both snake_case and camelCase database columns.
 */
export function mapSupabaseProduct(row: Record<string, any>): Product {
  return {
    id: String(row.id || row.product_id || ''),
    name: String(row.name || ''),
    arabicName: row.arabic_name ?? row.arabicName ?? undefined,
    artisan: String(row.artisan || row.seller || row.name_en || 'Lebanese Artisan'),
    seller: row.seller ?? row.artisan ?? undefined,
    arabicSeller: row.arabic_seller ?? row.arabicSeller ?? undefined,
    sellerId: row.seller_id ?? row.sellerId ?? undefined,
    sellerActive: row.seller_active ?? row.sellerActive ?? true,
    origin: String(row.origin || 'Lebanon'),
    category: String(row.category || 'grocery'),
    priceUSD: Number(row.price_usd ?? row.priceUSD ?? row.price ?? 0),
    originalPriceUSD: row.original_price_usd != null ? Number(row.original_price_usd) : (row.originalPriceUSD != null ? Number(row.originalPriceUSD) : undefined),
    discountPercentage: row.discount_percentage != null ? Number(row.discount_percentage) : (row.discountPercentage != null ? Number(row.discountPercentage) : undefined),
    rating: Number(row.rating ?? 5),
    reviewsCount: Number(row.reviews_count ?? row.reviewsCount ?? 0),
    image: String(row.image ?? row.image_url ?? 'https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=600&q=80'),
    additionalImages: Array.isArray(row.additional_images) ? row.additional_images : (Array.isArray(row.additionalImages) ? row.additionalImages : []),
    videoUrl: row.video_url ?? row.videoUrl ?? undefined,
    additionalVideos: Array.isArray(row.additional_videos) ? row.additional_videos : (Array.isArray(row.additionalVideos) ? row.additionalVideos : []),
    videos: Array.isArray(row.videos) ? row.videos : [],
    description: String(row.description || ''),
    craftStory: String(row.craft_story ?? row.craftStory ?? ''),
    stock: Number(row.stock ?? 0),
    isNewArrival: Boolean(row.is_new_arrival ?? row.isNewArrival ?? false),
    isFeatured: Boolean(row.is_featured ?? row.isFeatured ?? false),
    isBestseller: Boolean(row.is_bestseller ?? row.isBestseller ?? false),
    isPublished: row.is_published !== undefined ? Boolean(row.is_published) : (row.isPublished !== undefined ? Boolean(row.isPublished) : true),
    displayOrder: row.display_order != null ? Number(row.display_order) : (row.displayOrder != null ? Number(row.displayOrder) : 9999),
    sellerItemCode: row.seller_item_code ?? row.sellerItemCode ?? undefined,
    lowStockThreshold: row.low_stock_threshold != null ? Number(row.low_stock_threshold) : (row.lowStockThreshold != null ? Number(row.lowStockThreshold) : undefined),
    lowStockNotice: row.low_stock_notice ?? row.lowStockNotice ?? undefined,
    customStockLabel: row.custom_stock_label ?? row.customStockLabel ?? undefined,
    costPriceUSD: row.cost_price_usd != null ? Number(row.cost_price_usd) : (row.costPriceUSD != null ? Number(row.costPriceUSD) : undefined),
    tags: Array.isArray(row.tags) ? row.tags : (typeof row.tags === 'string' ? row.tags.split(',').map((t: string) => t.trim()) : []),
    keywords: Array.isArray(row.keywords) ? row.keywords : [],
    arabicKeywords: Array.isArray(row.arabic_keywords) ? row.arabic_keywords : (Array.isArray(row.arabicKeywords) ? row.arabicKeywords : []),
    seoTitle: row.seo_title ?? row.seoTitle ?? undefined,
    seoArabicTitle: row.seo_arabic_title ?? row.seoArabicTitle ?? undefined,
    seoDescription: row.seo_description ?? row.seoDescription ?? undefined,
    seoArabicDescription: row.seo_arabic_description ?? row.seoArabicDescription ?? undefined,
    weightOrVolume: row.weight_or_volume ?? row.weightOrVolume ?? undefined,
    createdAt: row.created_at ?? row.createdAt ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? row.updatedAt ?? new Date().toISOString(),
  };
}

/**
 * Maps raw Supabase row to CategoryItem.
 */
export function mapSupabaseCategory(row: Record<string, any>): CategoryItem {
  return {
    id: String(row.id || ''),
    nameEn: String(row.name_en || row.nameEn || row.name || ''),
    nameAr: String(row.name_ar || row.nameAr || row.arabicName || ''),
    icon: String(row.icon || '🛍️'),
    description: String(row.description || ''),
    descriptionAr: row.description_ar ?? row.descriptionAr ?? undefined,
    subcategories: Array.isArray(row.subcategories) ? row.subcategories : (typeof row.subcategories === 'string' ? JSON.parse(row.subcategories) : []),
    bannerUrl: String(row.banner_url || row.bannerUrl || 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=800&q=80'),
    arabicKeywords: Array.isArray(row.arabic_keywords) ? row.arabic_keywords : (Array.isArray(row.arabicKeywords) ? row.arabicKeywords : []),
    englishKeywords: Array.isArray(row.english_keywords) ? row.english_keywords : (Array.isArray(row.englishKeywords) ? row.englishKeywords : []),
    isPublished: row.is_published !== undefined ? Boolean(row.is_published) : (row.isPublished !== undefined ? Boolean(row.isPublished) : true),
    displayOrder: row.display_order != null ? Number(row.display_order) : (row.displayOrder != null ? Number(row.displayOrder) : 9999),
  };
}

/**
 * Maps raw Supabase row to Seller.
 */
export function mapSupabaseSeller(row: Record<string, any>): Seller {
  return {
    id: String(row.id || row.seller_id || ''),
    sellerCode: row.seller_code ?? row.sellerCode ?? undefined,
    nameEn: String(row.name_en || row.nameEn || row.name || ''),
    nameAr: row.name_ar ?? row.nameAr ?? undefined,
    logoUrl: row.logo_url ?? row.logoUrl ?? undefined,
    bannerImage: row.banner_image ?? row.bannerImage ?? undefined,
    bioEn: row.bio_en ?? row.bioEn ?? undefined,
    bioAr: row.bio_ar ?? row.bioAr ?? undefined,
    governorate: row.governorate ?? undefined,
    district: row.district ?? undefined,
    village: row.village ?? undefined,
    exactAddress: row.exact_address ?? row.exactAddress ?? undefined,
    region: row.region ?? undefined,
    contactPhone: row.contact_phone ?? row.contactPhone ?? undefined,
    contactEmail: row.contact_email ?? row.contactEmail ?? undefined,
    craftCategory: row.craft_category ?? row.craftCategory ?? undefined,
    commissionPct: row.commission_pct != null ? Number(row.commission_pct) : (row.commissionPct != null ? Number(row.commissionPct) : undefined),
    isActive: row.is_active !== undefined ? Boolean(row.is_active) : (row.isActive !== undefined ? Boolean(row.isActive) : true),
    hasAccount: row.has_account != null ? Boolean(row.has_account) : (row.hasAccount != null ? Boolean(row.hasAccount) : undefined),
    accountEmail: row.account_email ?? row.accountEmail ?? undefined,
    accountUid: row.account_uid ?? row.accountUid ?? undefined,
    createdAt: row.created_at ?? row.createdAt ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? row.updatedAt ?? new Date().toISOString(),
  };
}

/**
 * Maps raw Supabase row to TerroirRegion.
 */
export function mapSupabaseRegion(row: Record<string, any>): TerroirRegion {
  return {
    id: String(row.id || ''),
    nameEn: String(row.name_en || row.nameEn || row.name || ''),
    nameAr: String(row.name_ar || row.nameAr || ''),
    majorCities: Array.isArray(row.major_cities) ? row.major_cities : (Array.isArray(row.majorCities) ? row.majorCities : []),
    expressAvailable: Boolean(row.express_available ?? row.expressAvailable ?? false),
    baseDeliveryUSD: Number(row.base_delivery_usd ?? row.baseDeliveryUSD ?? 3.0),
    estimatedTimeEn: row.estimated_time_en ?? row.estimatedTimeEn ?? '24-48 Hours',
    estimatedTimeAr: row.estimated_time_ar ?? row.estimatedTimeAr ?? '٢٤-٤٨ ساعة',
  };
}

export const supabaseCatalogService = {
  /**
   * Fetches products from Supabase PostgreSQL (public_catalog view or products table).
   * Falls back gracefully to local default catalog if database is in migration or offline.
   */
  async fetchProducts(options?: {
    isAdmin?: boolean;
    isSeller?: boolean;
    sellerId?: string | null;
  }): Promise<Product[]> {
    try {
      // First try public_catalog view or products table
      let query = supabase.from('products').select('*');

      if (!options?.isAdmin) {
        if (options?.isSeller && options.sellerId) {
          query = query.or(`is_published.eq.true,seller_id.eq.${options.sellerId}`);
        } else {
          query = query.eq('is_published', true);
        }
      }

      const { data, error } = await query.order('display_order', { ascending: true, nullsFirst: false });

      if (error) {
        // Fallback: try public_catalog view
        const { data: viewData, error: viewError } = await supabase.from('public_catalog').select('*');
        if (viewData && !viewError && viewData.length > 0) {
          return viewData.map(mapSupabaseProduct);
        }
        console.warn('[supabaseCatalogService] Products query returned error, using fallback:', error.message);
        return INITIAL_PRODUCTS;
      }

      if (data && data.length > 0) {
        return data.map(mapSupabaseProduct);
      }

      return INITIAL_PRODUCTS;
    } catch (err: any) {
      console.warn('[supabaseCatalogService] fetchProducts failed:', err);
      return INITIAL_PRODUCTS;
    }
  },

  /**
   * Fetches categories from Supabase PostgreSQL categories table.
   */
  async fetchCategories(): Promise<CategoryItem[]> {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('display_order', { ascending: true, nullsFirst: false });

      if (error) {
        console.warn('[supabaseCatalogService] Categories query returned error, using default categories:', error.message);
        return DEFAULT_CATEGORIES;
      }

      if (data && data.length > 0) {
        return data.map(mapSupabaseCategory);
      }

      return DEFAULT_CATEGORIES;
    } catch (err: any) {
      console.warn('[supabaseCatalogService] fetchCategories failed:', err);
      return DEFAULT_CATEGORIES;
    }
  },

  /**
   * Fetches sellers from Supabase PostgreSQL sellers table.
   */
  async fetchSellers(): Promise<Seller[]> {
    try {
      const { data, error } = await supabase
        .from('sellers')
        .select('*')
        .order('name_en', { ascending: true });

      if (error) {
        console.warn('[supabaseCatalogService] Sellers query returned error, using default sellers:', error.message);
        return DEFAULT_SELLERS;
      }

      if (data && data.length > 0) {
        return data.map(mapSupabaseSeller);
      }

      return DEFAULT_SELLERS;
    } catch (err: any) {
      console.warn('[supabaseCatalogService] fetchSellers failed:', err);
      return DEFAULT_SELLERS;
    }
  },

  /**
   * Fetches terroir delivery regions.
   */
  async fetchRegions(): Promise<TerroirRegion[]> {
    try {
      const { data, error } = await supabase
        .from('regions')
        .select('*')
        .order('name_en', { ascending: true });

      if (!error && data && data.length > 0) {
        return data.map(mapSupabaseRegion);
      }
      return LEBANON_REGIONS;
    } catch {
      return LEBANON_REGIONS;
    }
  },

  /**
   * Upserts a product in Supabase PostgreSQL.
   */
  async upsertProduct(product: Partial<Product> & { id: string }): Promise<void> {
    const payload: Record<string, any> = {
      id: product.id,
      name: product.name,
      arabic_name: product.arabicName,
      artisan: product.artisan || product.seller,
      seller: product.seller || product.artisan,
      arabic_seller: product.arabicSeller,
      seller_id: product.sellerId,
      origin: product.origin,
      category: product.category,
      price_usd: product.priceUSD,
      original_price_usd: product.originalPriceUSD,
      discount_percentage: product.discountPercentage,
      rating: product.rating,
      reviews_count: product.reviewsCount,
      image: product.image,
      additional_images: product.additionalImages,
      video_url: product.videoUrl,
      additional_videos: product.additionalVideos,
      videos: product.videos,
      description: product.description,
      craft_story: product.craftStory,
      stock: product.stock,
      is_new_arrival: product.isNewArrival,
      is_featured: product.isFeatured,
      is_bestseller: product.isBestseller,
      is_published: product.isPublished,
      display_order: product.displayOrder,
      seller_item_code: product.sellerItemCode,
      low_stock_threshold: product.lowStockThreshold,
      low_stock_notice: product.lowStockNotice,
      custom_stock_label: product.customStockLabel,
      cost_price_usd: product.costPriceUSD,
      tags: product.tags,
      keywords: product.keywords,
      arabic_keywords: product.arabicKeywords,
      seo_title: product.seoTitle,
      seo_arabic_title: product.seoArabicTitle,
      seo_description: product.seoDescription,
      seo_arabic_description: product.seoArabicDescription,
      weight_or_volume: product.weightOrVolume,
      updated_at: new Date().toISOString(),
    };

    // Remove undefined values
    Object.keys(payload).forEach((key) => payload[key] === undefined && delete payload[key]);

    const { error } = await supabase.from('products').upsert(payload);
    if (error) {
      console.error('[supabaseCatalogService] upsertProduct error:', error);
      throw error;
    }
  },

  /**
   * Deletes a product by ID.
   */
  async deleteProduct(productId: string): Promise<void> {
    const { error } = await supabase.from('products').delete().eq('id', productId);
    if (error) {
      console.error('[supabaseCatalogService] deleteProduct error:', error);
      throw error;
    }
  },

  /**
   * Upserts a category.
   */
  async upsertCategory(cat: Partial<CategoryItem> & { id: string }): Promise<void> {
    const payload: Record<string, any> = {
      id: cat.id,
      name_en: cat.nameEn,
      name_ar: cat.nameAr,
      icon: cat.icon,
      description: cat.description,
      description_ar: cat.descriptionAr,
      subcategories: cat.subcategories,
      banner_url: cat.bannerUrl,
      arabic_keywords: cat.arabicKeywords,
      english_keywords: cat.englishKeywords,
      is_published: cat.isPublished,
      display_order: cat.displayOrder,
    };
    Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);
    const { error } = await supabase.from('categories').upsert(payload);
    if (error) throw error;
  },

  /**
   * Deletes a category.
   */
  async deleteCategory(id: string): Promise<void> {
    const { error } = await supabase.from('categories').delete().eq('id', id);
    if (error) throw error;
  },

  /**
   * Upserts a seller.
   */
  async upsertSeller(seller: Partial<Seller> & { id: string }): Promise<void> {
    const payload: Record<string, any> = {
      id: seller.id,
      seller_code: seller.sellerCode,
      name_en: seller.nameEn,
      name_ar: seller.nameAr,
      logo_url: seller.logoUrl,
      banner_image: seller.bannerImage,
      bio_en: seller.bioEn,
      bio_ar: seller.bioAr,
      governorate: seller.governorate,
      district: seller.district,
      village: seller.village,
      exact_address: seller.exactAddress,
      region: seller.region,
      contact_phone: seller.contactPhone,
      contact_email: seller.contactEmail,
      craft_category: seller.craftCategory,
      commission_pct: seller.commissionPct,
      is_active: seller.isActive,
      updated_at: new Date().toISOString(),
    };
    Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);
    const { error } = await supabase.from('sellers').upsert(payload);
    if (error) throw error;
  },

  /**
   * Deletes a seller.
   */
  async deleteSeller(id: string): Promise<void> {
    const { error } = await supabase.from('sellers').delete().eq('id', id);
    if (error) throw error;
  },
};
