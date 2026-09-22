import { supabase } from '../lib/supabase';
import {
  Product,
  CategoryItem,
  Seller,
  TerroirRegion,
} from '../types';

/**
 * Convert an unknown value to a string array.
 */
function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter(
        (item): item is string =>
          typeof item === 'string',
      )
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

/**
 * Convert an unknown value to a number or undefined.
 */
function toNumberOrUndefined(
  value: unknown,
): number | undefined {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return undefined;
  }

  const numberValue = Number(value);

  return Number.isFinite(numberValue)
    ? numberValue
    : undefined;
}

/**
 * Remove undefined properties from a payload.
 */
function removeUndefined<T extends Record<string, any>>(
  payload: T,
): Partial<T> {
  Object.keys(payload).forEach((key) => {
    if (payload[key] === undefined) {
      delete payload[key];
    }
  });

  return payload;
}

/**
 * Maps a Supabase product row to the frontend Product interface.
 *
 * Notes:
 * - Product.category is the Supabase category UUID.
 * - Product.sellerId is the Supabase seller UUID.
 * - Product media is stored in product_images.
 * - Private product fields are mapped only when they are
 *   returned by an authorized/admin query.
 */
export function mapSupabaseProduct(
  row: Record<string, any>,
): Product {
  const additionalImages =
    toStringArray(row.additional_images);

  const additionalVideos =
    toStringArray(row.additional_videos);

  const videos =
    toStringArray(row.videos);

  return {
    id: String(row.id || ''),

    yallaItemCode: row.yalla_item_code ?? undefined,

    name: String(row.name || ''),

    arabicName:
      row.arabic_name ?? undefined,

    artisan: String(
      row.artisan ||
        row.seller_name_en ||
        'Lebanese Artisan',
    ),

    seller:
      row.seller_name_en ??
      row.artisan ??
      undefined,

    arabicSeller:
      row.seller_name_ar ??
      undefined,

    sellerId:
      row.seller_id ??
      undefined,

    sellerActive:
      row.seller_active !== undefined
        ? Boolean(row.seller_active)
        : true,

    origin:
      String(
        row.origin || 'Lebanon',
      ),

    /**
     * products.brand is NOT NULL and defaults to an empty string, so it is
     * normalised to undefined rather than carrying '' into the UI. Consumers
     * fall back with `brand || seller || artisan`.
     */
    brand: row.brand
      ? String(row.brand)
      : undefined,

    /**
     * Product.category intentionally contains
     * the Supabase category UUID.
     */
    category:
      String(row.category_id || ''),

    // Canonical pricing: promo_price is the effective selling price
    // when a promotion exists; otherwise regular_price is used.
    priceUSD:
      Number(
        row.promo_price ??
        row.regular_price ??
        0,
      ),

    // The frontend keeps this field name for its existing Product interface.
    // It is derived from the canonical database pricing fields.
    originalPriceUSD:
      row.promo_price !== null &&
      row.promo_price !== undefined
        ? toNumberOrUndefined(
            row.regular_price,
          )
        : undefined;

    discountPercentage:
      toNumberOrUndefined(
        row.discount_percentage,
      ),

    rating:
      Number(row.rating ?? 0),

    reviewsCount:
      Number(row.reviews_count ?? 0),

    image:
      String(row.image || ''),

    additionalImages,

    videoUrl:
      row.video_url ??
      undefined,

    additionalVideos,

    videos,

    description:
      String(row.description || ''),

    craftStory:
      String(row.craft_story || ''),

    stock:
      Number(row.stock ?? 0),

    isNewArrival:
      Boolean(row.is_new_arrival),

    isFeatured:
      Boolean(row.is_featured),

    isBestseller:
      Boolean(row.is_bestseller),

    isPublished:
      Boolean(row.is_published),

    displayOrder:
      Number(row.display_order ?? 0),

    /**
     * Private/admin fields.
     *
     * These are NOT selected by the public
     * storefront query.
     */
    sellerItemCode:
      row.seller_item_code ??
      undefined,

    lowStockThreshold:
      toNumberOrUndefined(
        row.low_stock_threshold,
      ),

    lowStockNotice:
      row.low_stock_notice ??
      undefined,

    customStockLabel:
      row.custom_stock_label ??
      undefined,

    costPriceUSD:
      toNumberOrUndefined(
        row.cost_price_usd,
      ),

    tags:
      toStringArray(row.tags),

    keywords:
      toStringArray(row.keywords),

    arabicKeywords:
      toStringArray(
        row.arabic_keywords,
      ),

    seoTitle:
      row.seo_title ??
      undefined,

    seoArabicTitle:
      row.seo_arabic_title ??
      undefined,

    seoDescription:
      row.seo_description ??
      undefined,

    seoArabicDescription:
      row.seo_arabic_description ??
      undefined,

    weightOrVolume:
      row.weight_or_volume ??
      undefined,

    createdAt:
      row.created_at ??
      undefined,

    updatedAt:
      row.updated_at ??
      undefined,
  };
}

/**
 * Maps a Supabase category row to CategoryItem.
 */
export function mapSupabaseCategory(
  row: Record<string, any>,
): CategoryItem {
  return {
    id:
      String(row.id || ''),

    nameEn:
      String(row.name_en || ''),

    nameAr:
      String(row.name_ar || ''),

    icon:
      String(
        row.icon || '🛍️',
      ),

    description:
      String(
        row.description || '',
      ),

    descriptionAr:
      row.description_ar ??
      undefined,

    subcategories:
      toStringArray(
        row.subcategories,
      ),

    bannerUrl:
      String(
        row.banner_url || '',
      ),

    arabicKeywords:
      toStringArray(
        row.arabic_keywords,
      ),

    englishKeywords:
      toStringArray(
        row.english_keywords,
      ),

    isPublished:
      row.is_published !== undefined
        ? Boolean(row.is_published)
        : true,

    displayOrder:
      Number(
        row.display_order ?? 0,
      ),
  };
}

/**
 * Maps a Supabase seller row to Seller.
 *
 * Sensitive seller fields are supported by the mapper,
 * but are intentionally excluded from the public query.
 */
export function mapSupabaseSeller(
  row: Record<string, any>,
): Seller {
  return {
    id:
      String(row.id || ''),

    sellerCode:
      row.seller_code ??
      undefined,

    nameEn:
      String(row.name_en || ''),

    nameAr:
      row.name_ar ??
      undefined,

    logoUrl:
      row.logo_url ??
      undefined,

    bannerImage:
      row.banner_image ??
      undefined,

    bioEn:
      row.bio_en ??
      undefined,

    bioAr:
      row.bio_ar ??
      undefined,

    governorate:
      row.governorate ??
      undefined,

    district:
      row.district ??
      undefined,

    village:
      row.village ??
      undefined,

    /**
     * exactAddress is intentionally not requested
     * by the public seller query.
     */
    exactAddress:
      row.exact_address ??
      undefined,

    region:
      row.region ??
      undefined,

    contactPhone:
      row.contact_phone ??
      undefined,

    contactEmail:
      row.contact_email ??
      undefined,

    craftCategory:
      row.craft_category ??
      undefined,

    commissionPct:
      toNumberOrUndefined(
        row.commission_pct,
      ),

    isActive:
      row.is_active !== undefined
        ? Boolean(row.is_active)
        : true,

    hasAccount:
      row.has_account !== undefined
        ? Boolean(row.has_account)
        : undefined,

    accountEmail:
      row.account_email ??
      undefined,

    accountUid:
      row.account_uid ??
      undefined,

    createdAt:
      row.created_at ??
      undefined,

    updatedAt:
      row.updated_at ??
      undefined,
  };
}

/**
 * Maps a Supabase region row to TerroirRegion.
 */
export function mapSupabaseRegion(
  row: Record<string, any>,
): TerroirRegion {
  return {
    id:
      String(row.id || ''),

    nameEn:
      String(row.name_en || ''),

    nameAr:
      String(row.name_ar || ''),

    majorCities:
      toStringArray(
        row.major_cities,
      ),

    expressAvailable:
      Boolean(
        row.express_available,
      ),

    baseDeliveryUSD:
      Number(
        row.base_delivery_usd ?? 0,
      ),

    estimatedTimeEn:
      row.estimated_time_en ??
      '24-48 Hours',

    estimatedTimeAr:
      row.estimated_time_ar ??
      '٢٤-٤٨ ساعة',
  };
}

/**
 * Convert Product media into product_images rows.
 */
function buildProductMediaRows(
  product: Partial<Product> & {
    id: string;
  },
) {
  const rows: Array<{
    product_id: string;
    url: string;
    media_type: 'image' | 'video';
    display_order: number;
  }> = [];

  const mainImage =
    product.image?.trim();

  if (mainImage) {
    rows.push({
      product_id: product.id,
      url: mainImage,
      media_type: 'image',
      display_order: 0,
    });
  }

  const additionalImages =
    Array.isArray(
      product.additionalImages,
    )
      ? product.additionalImages
      : [];

  additionalImages.forEach(
    (url, index) => {
      if (!url?.trim()) {
        return;
      }

      rows.push({
        product_id: product.id,
        url: url.trim(),
        media_type: 'image',
        display_order: index + 1,
      });
    },
  );

  const mainVideo =
    product.videoUrl?.trim();

  if (mainVideo) {
    rows.push({
      product_id: product.id,
      url: mainVideo,
      media_type: 'video',
      display_order: rows.length,
    });
  }

  const additionalVideos =
    Array.isArray(
      product.additionalVideos,
    )
      ? product.additionalVideos
      : [];

  additionalVideos.forEach(
    (url) => {
      if (!url?.trim()) {
        return;
      }

      rows.push({
        product_id: product.id,
        url: url.trim(),
        media_type: 'video',
        display_order: rows.length,
      });
    },
  );

  /**
   * Legacy videos array support.
   */
  const legacyVideos =
    Array.isArray(product.videos)
      ? product.videos
      : [];

  legacyVideos.forEach(
    (url) => {
      if (!url?.trim()) {
        return;
      }

      const normalizedUrl =
        url.trim();

      const alreadyExists =
        rows.some(
          (row) =>
            row.url ===
              normalizedUrl &&
            row.media_type ===
              'video',
        );

      if (alreadyExists) {
        return;
      }

      rows.push({
        product_id: product.id,
        url: normalizedUrl,
        media_type: 'video',
        display_order: rows.length,
      });
    },
  );

  return rows;
}

/**
 * PUBLIC PRODUCT COLUMNS
 *
 * IMPORTANT:
 * Never include:
 * - seller_item_code
 * - low_stock_threshold
 * - low_stock_notice
 * - custom_stock_label
 * - cost_price_usd
 *
 * The products table contains these operational columns, but the
 * storefront must not request them.
 */
const PUBLIC_PRODUCT_COLUMNS = `
  id,
  yalla_item_code,
  name,
  arabic_name,
  artisan,
  seller_id,
  origin,
  brand,
  category_id,
  regular_price,
  promo_price,
  discount_percentage,
  rating,
  reviews_count,
  image,
  video_url,
  description,
  craft_story,
  stock,
  is_new_arrival,
  is_featured,
  is_bestseller,
  is_published,
  display_order,
  tags,
  keywords,
  arabic_keywords,
  seo_title,
  seo_arabic_title,
  seo_description,
  seo_arabic_description,
  weight_or_volume,
  created_at,
  updated_at,

  sellers!products_seller_id_fkey (
    name_en,
    name_ar,
    is_active
  ),

  categories!products_category_id_fkey (
    name_en,
    name_ar
  )
`;

/**
 * ADMIN / SELLER PRODUCT COLUMNS
 *
 * These fields are only requested for admin/seller queries.
 */
const ADMIN_PRODUCT_COLUMNS = `
  id,
  yalla_item_code,
  name,
  arabic_name,
  artisan,
  seller_id,
  origin,
  brand,
  category_id,
  price_usd,
  original_price_usd,
  discount_percentage,
  rating,
  reviews_count,
  image,
  video_url,
  description,
  craft_story,
  stock,
  is_new_arrival,
  is_featured,
  is_bestseller,
  is_published,
  display_order,

  seller_item_code,
  low_stock_threshold,
  low_stock_notice,
  custom_stock_label,
  cost_price_usd,

  tags,
  keywords,
  arabic_keywords,
  seo_title,
  seo_arabic_title,
  seo_description,
  seo_arabic_description,
  weight_or_volume,
  created_at,
  updated_at,

  sellers!products_seller_id_fkey (
    name_en,
    name_ar,
    is_active
  ),

  categories!products_category_id_fkey (
    name_en,
    name_ar
  )
`;

/**
 * Attach product_images media to products.
 */
async function attachProductMedia(
  products: Product[],
): Promise<Product[]> {
  if (products.length === 0) {
    return products;
  }

  const productIds =
    products.map(
      (product) => product.id,
    );

  const {
    data,
    error,
  } = await supabase
    .from('product_images')
    .select(`
      product_id,
      url,
      media_type,
      display_order
    `)
    .in(
      'product_id',
      productIds,
    )
    .order(
      'display_order',
      {
        ascending: true,
      },
    );

  if (error) {
    console.error(
      '[supabaseCatalogService] attachProductMedia:',
      error,
    );

    throw error;
  }

  const mediaByProduct =
    new Map<
      string,
      Array<{
        url: string;
        media_type:
          | 'image'
          | 'video';
      }>
    >();

  for (const row of data ?? []) {
    if (
      !mediaByProduct.has(
        row.product_id,
      )
    ) {
      mediaByProduct.set(
        row.product_id,
        [],
      );
    }

    mediaByProduct
      .get(row.product_id)!
      .push({
        url: row.url,
        media_type:
          row.media_type,
      });
  }

  return products.map(
    (product) => {
      const media =
        mediaByProduct.get(
          product.id,
        ) ?? [];

      const images =
        media
          .filter(
            (item) =>
              item.media_type ===
              'image',
          )
          .map(
            (item) => item.url,
          );

      const videos =
        media
          .filter(
            (item) =>
              item.media_type ===
              'video',
          )
          .map(
            (item) => item.url,
          );

      return {
        ...product,

        additionalImages:
          images.length > 0
            ? images.filter(
                (url) =>
                  url !==
                  product.image,
              )
            : product.additionalImages ??
              [],

        videos,

        additionalVideos:
          videos,

        videoUrl:
          product.videoUrl ??
          videos[0] ??
          undefined,
      };
    },
  );
}

/**
 * Synchronize private product fields.
 *
 * The current database contains these fields in both
 * products and product_private.
 *
 * products remains the compatibility/source used by
 * the existing admin/seller catalog UI.
 *
 * product_private is synchronized as the protected
 * private-data table.
 */
async function syncProductPrivate(
  product: Partial<Product> & {
    id: string;
  },
): Promise<void> {
  const hasPrivateFields =
    product.sellerId !==
      undefined ||
    product.sellerItemCode !==
      undefined ||
    product.lowStockThreshold !==
      undefined ||
    product.lowStockNotice !==
      undefined ||
    product.customStockLabel !==
      undefined ||
    product.costPriceUSD !==
      undefined;

  if (!hasPrivateFields) {
    return;
  }

  const privatePayload =
    removeUndefined({
      product_id:
        product.id,

      seller_id:
        product.sellerId,

      seller_item_code:
        product.sellerItemCode,

      low_stock_threshold:
        product.lowStockThreshold,

      low_stock_notice:
        product.lowStockNotice,

      custom_stock_label:
        product.customStockLabel,

      cost_price_usd:
        product.costPriceUSD,

      updated_at:
        new Date().toISOString(),
    });

  const {
    error,
  } = await supabase
    .from('product_private')
    .upsert(
      privatePayload,
      {
        onConflict:
          'product_id',
      },
    );

  if (error) {
    console.error(
      '[supabaseCatalogService] syncProductPrivate:',
      error,
    );

    throw error;
  }
}

export const supabaseCatalogService = {
  /**
   * Fetch products from Supabase.
   *
   * Public:
   * - published products only
   * - no private product fields
   * - no demo/local fallback
   *
   * Admin:
   * - all products
   * - private product fields
   *
   * Seller:
   * - published products
   * - seller's own unpublished products
   * - private product fields
   */
  async fetchProducts(
    options?: {
      isAdmin?: boolean;
      isSeller?: boolean;
      sellerId?: string | null;
    },
  ): Promise<Product[]> {
    const isAdmin =
      options?.isAdmin === true;

    const isSeller =
      options?.isSeller === true &&
      Boolean(
        options?.sellerId,
      );

    const columns: string =
      isAdmin || isSeller
        ? String(ADMIN_PRODUCT_COLUMNS)
        : String(PUBLIC_PRODUCT_COLUMNS);

    /**
     * The anonymous storefront uses a SECURITY DEFINER RPC instead of
     * querying public.products directly. The products table intentionally has
     * no broad anon SELECT grant because it contains private operational
     * columns. The RPC returns only the public catalog projection and applies
     * the same published-category/published-seller visibility rules.
     *
     * Admin/seller sessions keep the direct table query because their existing
     * RLS policies authorize the additional private fields they need.
     */
    let query: any;

    if (!isAdmin && !isSeller) {
      // Public storefront reads use a dedicated, column allowlisted view.
      // This avoids relying on PostgREST RPC discovery/schema-cache state for
      // the critical storefront catalogue request. The view contains only
      // customer-safe fields and applies the published/category/seller filters.
      const { data, error } = await supabase
        .from('public_storefront_products')
        .select('*')
        .order('display_order', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true });

      if (error) {
        console.error('[supabaseCatalogService] public storefront products view failed:', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
          status: error.status,
        });
        throw error;
      }

      return (data ?? []).map((row: any) =>
        mapSupabaseProduct({
          ...row,
          seller_name_en: row.seller_name_en,
          seller_name_ar: row.seller_name_ar,
          seller_active: row.seller_active,
        }),
      );
    } else {
      query = supabase
        .from('products')
        .select(columns)
        .order(
          'display_order',
          {
            ascending: true,
            nullsFirst: false,
          },
        );

      if (!isAdmin && isSeller && options?.sellerId) {
        query = query.or(
          `is_published.eq.true,seller_id.eq.${options.sellerId}`,
        );
      }
    }

    /**
     * Fetched in pages rather than one unbounded request.
     *
     * This had no .range() and no .limit(), which is a correctness problem
     * before it is a performance one: PostgREST caps a response at
     * `db-max-rows` (1000 on Supabase by default), so past that the
     * storefront would silently render only the first page of the catalogue
     * with no error and no indication anything was missing.
     *
     * Paging to exhaustion keeps the whole catalogue correct at any size and
     * bounds each individual response. CATALOG_PAGE_CEILING is a guard
     * against an unbounded loop, not a product limit; hitting it is logged
     * rather than swallowed.
     */
    const PAGE_SIZE = 1000;
    const CATALOG_PAGE_CEILING = 50;

    const rows: any[] = [];

    for (let page = 0; page < CATALOG_PAGE_CEILING; page += 1) {
      const from = page * PAGE_SIZE;

      const {
        data,
        error,
      } = await query.range(
        from,
        from + PAGE_SIZE - 1,
      );

      if (error) {
        console.error(
          '[supabaseCatalogService] fetchProducts:',
          error,
        );

        throw error;
      }

      const batch = data ?? [];

      rows.push(...batch);

      if (batch.length < PAGE_SIZE) break;

      if (page === CATALOG_PAGE_CEILING - 1) {
        console.error(
          `[supabaseCatalogService] fetchProducts: stopped at ${CATALOG_PAGE_CEILING * PAGE_SIZE} rows; the catalogue is larger than this loader expects.`,
        );
      }
    }

    const mapped =
      rows.map(
        (row: any) =>
          mapSupabaseProduct({
            ...row,

            seller_name_en:
              row.seller_name_en ??
              row.sellers?.name_en,

            seller_name_ar:
              row.seller_name_ar ??
              row.sellers?.name_ar,

            seller_active:
              row.seller_active ??
              row.sellers?.is_active,
          }),
      );

    return attachProductMedia(
      mapped,
    );
  },

  /**
   * Fetch published categories.
   */
  async fetchCategories(): Promise<
    CategoryItem[]
  > {
    const {
      data,
      error,
    } = await supabase
      .from('categories')
      .select(`
        id,
        name_en,
        name_ar,
        icon,
        description,
        description_ar,
        subcategories,
        banner_url,
        arabic_keywords,
        english_keywords,
        is_published,
        display_order
      `)
      .eq(
        'is_published',
        true,
      )
      .order(
        'display_order',
        {
          ascending: true,
          nullsFirst: false,
        },
      );

    if (error) {
      console.error(
        '[supabaseCatalogService] fetchCategories:',
        error,
      );

      throw error;
    }

    return (
      data ?? []
    ).map(
      mapSupabaseCategory,
    );
  },

  /**
   * Fetch active sellers for the storefront.
   *
   * Sensitive fields are deliberately excluded.
   */
  async fetchSellers(): Promise<
    Seller[]
  > {
    const {
      data,
      error,
    } = await supabase
      .from('sellers')
      .select(`
        id,
        seller_code,
        name_en,
        name_ar,
        logo_url,
        banner_image,
        bio_en,
        bio_ar,
        governorate,
        district,
        village,
        region,
        contact_phone,
        craft_category,
        is_active,
        has_account,
        created_at,
        updated_at
      `)
      .eq(
        'is_active',
        true,
      )
      .order(
        'name_en',
        {
          ascending: true,
        },
      );

    if (error) {
      console.error(
        '[supabaseCatalogService] fetchSellers:',
        error,
      );

      throw error;
    }

    return (
      data ?? []
    ).map(
      mapSupabaseSeller,
    );
  },

  /**
   * Fetch delivery regions.
   */
  async fetchRegions(): Promise<
    TerroirRegion[]
  > {
    const {
      data,
      error,
    } = await supabase
      .from('regions')
      .select(`
        id,
        name_en,
        name_ar,
        major_cities,
        express_available,
        base_delivery_usd,
        estimated_time_en,
        estimated_time_ar
      `)
      .order(
        'name_en',
        {
          ascending: true,
        },
      );

    if (error) {
      console.error(
        '[supabaseCatalogService] fetchRegions:',
        error,
      );

      throw error;
    }

    return (
      data ?? []
    ).map(
      mapSupabaseRegion,
    );
  },

  /**
   * Create or update a product.
   *
   * Main product data is stored in products.
   *
   * Private product fields are also synchronized
   * into product_private.
   *
   * Media is stored in product_images.
   */
  async upsertProduct(
    product: Partial<Product> & {
      id: string;
    },
  ): Promise<void> {
    if (!product.id) {
      throw new Error(
        'Product ID is required.',
      );
    }

    const productPayload =
      removeUndefined({
        id:
          product.id,

        name:
          product.name ?? '',

        arabic_name:
          product.arabicName,

        artisan:
          product.artisan ??
          product.seller ??
          '',

        seller_id:
          product.sellerId,

        origin:
          product.origin ??
          'Lebanon',

        category_id:
          product.category,

        // Canonical writable pricing fields.
        regular_price:
          product.priceUSD ??
          0,

        promo_price:
          product.originalPriceUSD,

        discount_percentage:
          product.discountPercentage,

        rating:
          product.rating ??
          0,

        reviews_count:
          product.reviewsCount ??
          0,

        image:
          product.image ??
          '',

        video_url:
          product.videoUrl,

        description:
          product.description ??
          '',

        craft_story:
          product.craftStory ??
          '',

        stock:
          product.stock ??
          0,

        is_new_arrival:
          product.isNewArrival ??
          false,

        is_featured:
          product.isFeatured ??
          false,

        is_bestseller:
          product.isBestseller ??
          false,

        is_published:
          product.isPublished ??
          false,

        display_order:
          product.displayOrder ??
          0,

        /**
         * These columns currently exist
         * in products and are kept here for
         * compatibility with the existing
         * admin/catalog schema.
         */
        seller_item_code:
          product.sellerItemCode,

        low_stock_threshold:
          product.lowStockThreshold,

        low_stock_notice:
          product.lowStockNotice,

        custom_stock_label:
          product.customStockLabel,

        cost_price_usd:
          product.costPriceUSD,

        tags:
          product.tags ??
          [],

        keywords:
          product.keywords ??
          [],

        arabic_keywords:
          product.arabicKeywords ??
          [],

        seo_title:
          product.seoTitle,

        seo_arabic_title:
          product.seoArabicTitle,

        seo_description:
          product.seoDescription,

        seo_arabic_description:
          product.seoArabicDescription,

        weight_or_volume:
          product.weightOrVolume,

        updated_at:
          new Date().toISOString(),
      });

    const {
      data: productRows,
      error: productError,
    } = await supabase
      .from('products')
      .upsert(
        productPayload,
        {
          onConflict:
            'id',
        },
      )
      .select('id');

    if (productError) {
      console.error(
        '[supabaseCatalogService] upsertProduct products:',
        productError,
      );

      throw productError;
    }

    if (!productRows?.length) {
      throw new Error(
        'The product was not saved. Your administrator session may not be verified.',
      );
    }

    /**
     * Keep product_private synchronized.
     */
    await syncProductPrivate(
      product,
    );

    /**
     * Replace the product's media rows
     * with the current frontend state.
     */
    const mediaRows =
      buildProductMediaRows(
        product,
      );

    const {
      error: deleteMediaError,
    } = await supabase
      .from('product_images')
      .delete()
      .eq(
        'product_id',
        product.id,
      );

    if (deleteMediaError) {
      console.error(
        '[supabaseCatalogService] upsertProduct delete media:',
        deleteMediaError,
      );

      throw deleteMediaError;
    }

    if (
      mediaRows.length > 0
    ) {
      const {
        error:
          insertMediaError,
      } = await supabase
        .from('product_images')
        .insert(
          mediaRows,
        );

      if (insertMediaError) {
        console.error(
          '[supabaseCatalogService] upsertProduct insert media:',
          insertMediaError,
        );

        throw insertMediaError;
      }
    }
  },

  /**
   * Delete product and dependent data.
   */
  async deleteProduct(
    productId: string,
  ): Promise<void> {
    if (!productId) {
      throw new Error(
        'Product ID is required.',
      );
    }

    /**
     * Remove product media.
     */
    const {
      error: mediaError,
    } = await supabase
      .from('product_images')
      .delete()
      .eq(
        'product_id',
        productId,
      );

    if (mediaError) {
      console.error(
        '[supabaseCatalogService] deleteProduct media:',
        mediaError,
      );

      throw mediaError;
    }

    /**
     * Remove private product record.
     */
    const {
      error: privateError,
    } = await supabase
      .from('product_private')
      .delete()
      .eq(
        'product_id',
        productId,
      );

    if (privateError) {
      console.error(
        '[supabaseCatalogService] deleteProduct private:',
        privateError,
      );

      throw privateError;
    }

    /**
     * Finally remove the main product.
     *
     * `.select()` is not cosmetic here. A DELETE that RLS filters out is not an
     * error to PostgREST — it succeeds and reports zero rows. Without asking
     * for the deleted rows back, an administrator whose session is not
     * second-factor verified, or a seller (who has no DELETE policy on
     * products at all), would see the row vanish from the UI while it remained
     * in the database, reappearing on the next refresh.
     */
    const {
      data: deletedRows,
      error: productError,
    } = await supabase
      .from('products')
      .delete()
      .eq(
        'id',
        productId,
      )
      .select('id');

    if (productError) {
      console.error(
        '[supabaseCatalogService] deleteProduct product:',
        productError,
      );

      throw productError;
    }

    if (!deletedRows || deletedRows.length === 0) {
      throw new Error(
        'The product was not deleted. Your session may not be verified for ' +
          'administrator changes, or the product belongs to another workshop.',
      );
    }
  },

  /**
   * Create or update a category.
   */
  async upsertCategory(
    category: Partial<CategoryItem> & { id: string },
  ): Promise<void> {
    if (!category.id) throw new Error('Category ID is required.');

    const payload = removeUndefined({
      id: category.id,
      ...(Object.prototype.hasOwnProperty.call(category, 'nameEn') ? { name_en: category.nameEn } : {}),
      ...(Object.prototype.hasOwnProperty.call(category, 'nameAr') ? { name_ar: category.nameAr } : {}),
      ...(Object.prototype.hasOwnProperty.call(category, 'icon') ? { icon: category.icon } : {}),
      ...(Object.prototype.hasOwnProperty.call(category, 'description') ? { description: category.description } : {}),
      ...(Object.prototype.hasOwnProperty.call(category, 'descriptionAr') ? { description_ar: category.descriptionAr } : {}),
      ...(Object.prototype.hasOwnProperty.call(category, 'subcategories') ? { subcategories: category.subcategories } : {}),
      ...(Object.prototype.hasOwnProperty.call(category, 'bannerUrl') ? { banner_url: category.bannerUrl } : {}),
      ...(Object.prototype.hasOwnProperty.call(category, 'arabicKeywords') ? { arabic_keywords: category.arabicKeywords } : {}),
      ...(Object.prototype.hasOwnProperty.call(category, 'englishKeywords') ? { english_keywords: category.englishKeywords } : {}),
      ...(Object.prototype.hasOwnProperty.call(category, 'isPublished') ? { is_published: category.isPublished } : {}),
      ...(Object.prototype.hasOwnProperty.call(category, 'displayOrder') ? { display_order: category.displayOrder } : {}),
      updated_at: new Date().toISOString(),
    });

    const { data, error } = await supabase.from('categories').upsert(payload, { onConflict: 'id' }).select('id');
    if (error) throw error;
    if (!data?.length) throw new Error('The category was not saved. Your administrator session may not be verified.');
  },

  /**
   * Delete category.
   */
  async deleteCategory(
    id: string,
    reassignCategoryId?: string,
    deleteAttachedProducts?: boolean,
  ): Promise<{ affectedProducts: number; reassignedProducts: number; deletedProducts: number }> {
    if (!id) throw new Error('Category ID is required.');

    const { data, error } = await supabase.rpc('admin_delete_category', {
      p_category_id: id,
      p_reassign_category_id: reassignCategoryId || null,
      p_delete_attached_products: deleteAttachedProducts === true,
    });

    if (error) {
      console.error('[supabaseCatalogService] deleteCategory:', error);
      throw error;
    }

    if (!data) {
      throw new Error('The category deletion did not return a result.');
    }

    return {
      affectedProducts: Number(data.affected_products ?? 0),
      reassignedProducts: Number(data.reassigned_products ?? 0),
      deletedProducts: Number(data.deleted_products ?? 0),
    };
  },

  /** Create or update a delivery region. */
  async upsertRegion(region: Partial<TerroirRegion> & { id: string }): Promise<void> {
    if (!region.id) throw new Error('Region ID is required.');
    const payload = removeUndefined({
      id: region.id,
      ...(Object.prototype.hasOwnProperty.call(region, 'nameEn') ? { name_en: region.nameEn } : {}),
      ...(Object.prototype.hasOwnProperty.call(region, 'nameAr') ? { name_ar: region.nameAr } : {}),
      ...(Object.prototype.hasOwnProperty.call(region, 'majorCities') ? { major_cities: region.majorCities } : {}),
      ...(Object.prototype.hasOwnProperty.call(region, 'expressAvailable') ? { express_available: region.expressAvailable } : {}),
      ...(Object.prototype.hasOwnProperty.call(region, 'baseDeliveryUSD') ? { base_delivery_usd: region.baseDeliveryUSD } : {}),
      ...(Object.prototype.hasOwnProperty.call(region, 'estimatedTimeEn') ? { estimated_time_en: region.estimatedTimeEn } : {}),
      ...(Object.prototype.hasOwnProperty.call(region, 'estimatedTimeAr') ? { estimated_time_ar: region.estimatedTimeAr } : {}),
      updated_at: new Date().toISOString(),
    });
    const { data, error } = await supabase.from('regions').upsert(payload, { onConflict: 'id' }).select('id');
    if (error) throw error;
    if (!data?.length) throw new Error('The region was not saved. Your administrator session may not be verified.');
  },

  /** Delete a delivery region. */
  async deleteRegion(id: string): Promise<void> {
    if (!id) throw new Error('Region ID is required.');
    const { data, error } = await supabase
      .from('regions')
      .delete()
      .eq('id', id)
      .select('id');
    if (error) throw error;
    if (!data?.length) {
      throw new Error('The region was not deleted. Your administrator session may not be verified.');
    }
  },
  /**
   * Create or update a seller.
   *
   * Intended for authorized admin operations.
   */
  async upsertSeller(seller: Partial<Seller> & { id: string }): Promise<void> {
    if (!seller.id) throw new Error('Seller ID is required.');
    const has = (key: keyof Seller) => Object.prototype.hasOwnProperty.call(seller, key);
    const payload = removeUndefined({
      id: seller.id,
      ...(has('sellerCode') ? { seller_code: seller.sellerCode } : {}),
      ...(has('nameEn') ? { name_en: seller.nameEn } : {}),
      ...(has('nameAr') ? { name_ar: seller.nameAr } : {}),
      ...(has('logoUrl') ? { logo_url: seller.logoUrl } : {}),
      ...(has('bannerImage') ? { banner_image: seller.bannerImage } : {}),
      ...(has('bioEn') ? { bio_en: seller.bioEn } : {}),
      ...(has('bioAr') ? { bio_ar: seller.bioAr } : {}),
      ...(has('governorate') ? { governorate: seller.governorate } : {}),
      ...(has('district') ? { district: seller.district } : {}),
      ...(has('village') ? { village: seller.village } : {}),
      ...(has('exactAddress') ? { exact_address: seller.exactAddress } : {}),
      ...(has('region') ? { region: seller.region } : {}),
      ...(has('contactPhone') ? { contact_phone: seller.contactPhone } : {}),
      ...(has('contactEmail') ? { contact_email: seller.contactEmail } : {}),
      ...(has('craftCategory') ? { craft_category: seller.craftCategory } : {}),
      ...(has('commissionPct') ? { commission_pct: seller.commissionPct } : {}),
      ...(has('isActive') ? { is_active: seller.isActive } : {}),
      ...(has('hasAccount') ? { has_account: seller.hasAccount } : {}),
      ...(has('accountEmail') ? { account_email: seller.accountEmail } : {}),
      ...(has('accountUid') ? { account_uid: seller.accountUid } : {}),
      updated_at: new Date().toISOString(),
    });
    const { data, error } = await supabase.from('sellers').upsert(payload, { onConflict: 'id' }).select('id');
    if (error) throw error;
    if (!data?.length) throw new Error('The seller was not saved. Your administrator session may not be verified.');
  },

  /**
   * Delete seller.
   */
  async deleteSeller(id: string, reassignSellerId?: string): Promise<{ reassignedProducts: number }> {
    if (!id) throw new Error('Seller ID is required.');
    const { data, error } = await supabase.rpc('admin_delete_seller', {
      p_seller_id: id,
      p_reassign_seller_id: reassignSellerId || null,
    });
    if (error) throw error;
    if (!data) throw new Error('The seller deletion did not return a result.');
    return { reassignedProducts: Number(data.reassigned_products ?? 0) };
  },};
