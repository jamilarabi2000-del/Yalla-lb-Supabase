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
     * Product.category intentionally contains
     * the Supabase category UUID.
     */
    category:
      String(row.category_id || ''),

    priceUSD:
      Number(row.price_usd ?? 0),

    originalPriceUSD:
      toNumberOrUndefined(
        row.original_price_usd,
      ),

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
 * The products table contains these columns, but the
 * storefront must not request them.
 */
const PUBLIC_PRODUCT_COLUMNS = `
  id,
  name,
  arabic_name,
  artisan,
  seller_id,
  origin,
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
 * These fields exist in the current products table.
 *
 * They are only requested for admin/seller queries.
 */
const ADMIN_PRODUCT_COLUMNS = `
  id,
  name,
  arabic_name,
  artisan,
  seller_id,
  origin,
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

    let query: any =
      supabase
        .from('products')
        .select(columns)
        .order(
          'display_order',
          {
            ascending: true,
            nullsFirst: false,
          },
        );

    if (!isAdmin) {
      if (
        isSeller &&
        options?.sellerId
      ) {
        /**
         * Sellers can see:
         * - all published products
         * - their own products
         */
        query = query.or(
          `is_published.eq.true,seller_id.eq.${options.sellerId}`,
        );
      } else {
        /**
         * Public storefront:
         * published products only.
         */
        query = query.eq(
          'is_published',
          true,
        );
      }
    }

    const {
      data,
      error,
    } = await query;

    if (error) {
      console.error(
        '[supabaseCatalogService] fetchProducts:',
        error,
      );

      throw error;
    }

    const mapped =
      (data ?? []).map(
        (row: any) =>
          mapSupabaseProduct({
            ...row,

            seller_name_en:
              row.sellers?.name_en,

            seller_name_ar:
              row.sellers?.name_ar,

            seller_active:
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

    /**
     * Only columns the caller actually supplied are sent.
     *
     * These fields used to carry `?? ''` / `?? 0` / `?? false` fallbacks. That
     * is safe for a full create payload and destructive for a partial one: a
     * publish toggle sends `{ id, isPublished }`, so every other field
     * collapsed to its fallback and the upsert wrote an empty name, a zero
     * price, an empty image, zero stock, empty tags and display_order 0 over
     * a live product.
     *
     * Every one of these columns is NOT NULL with a database default (only
     * `name` has none, and creation always supplies it), so omitting an
     * unsupplied key lets Postgres apply the correct default on INSERT and
     * leaves the stored value untouched on UPDATE.
     */
    const productPayload =
      removeUndefined({
        id:
          product.id,

        name:
          product.name,

        arabic_name:
          product.arabicName,

        artisan:
          product.artisan ??
          product.seller,

        seller_id:
          product.sellerId,

        origin:
          product.origin,

        category_id:
          product.category,

        price_usd:
          product.priceUSD,

        original_price_usd:
          product.originalPriceUSD,

        discount_percentage:
          product.discountPercentage,

        image:
          product.image,

        video_url:
          product.videoUrl,

        description:
          product.description,

        craft_story:
          product.craftStory,

        stock:
          product.stock,

        is_new_arrival:
          product.isNewArrival,

        is_featured:
          product.isFeatured,

        is_bestseller:
          product.isBestseller,

        is_published:
          product.isPublished,

        display_order:
          product.displayOrder,

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
          product.tags,

        keywords:
          product.keywords,

        arabic_keywords:
          product.arabicKeywords,

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
      error: productError,
    } = await supabase
      .from('products')
      .upsert(
        productPayload,
        {
          onConflict:
            'id',
        },
      );

    if (productError) {
      console.error(
        '[supabaseCatalogService] upsertProduct products:',
        productError,
      );

      throw productError;
    }

    /**
     * Keep product_private synchronized.
     */
    await syncProductPrivate(
      product,
    );

    /**
     * Replace the product's media rows with the current frontend state --
     * but ONLY when the caller actually supplied media.
     *
     * This block used to delete every product_images row unconditionally and
     * re-insert only `if (mediaRows.length > 0)`. A partial update such as a
     * publish toggle supplies no media at all, so buildProductMediaRows
     * returned [] and the product's whole gallery was deleted with nothing
     * written back.
     */
    const mediaFieldsSupplied =
      product.image !== undefined ||
      product.additionalImages !== undefined ||
      product.videoUrl !== undefined ||
      product.additionalVideos !== undefined ||
      product.videos !== undefined;

    if (!mediaFieldsSupplied) {
      return;
    }

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
   * Delete many products and their dependent rows in one round trip.
   *
   * product_images and product_private are removed explicitly rather than
   * relying on cascade, matching deleteProduct, so the behaviour is identical
   * whether one product or fifty are removed.
   */
  async deleteProducts(
    productIds: string[],
  ): Promise<void> {
    const ids = (productIds || []).filter(Boolean);
    if (!ids.length) return;

    const { error: mediaError } = await supabase
      .from('product_images')
      .delete()
      .in('product_id', ids);
    if (mediaError) {
      console.error('[supabaseCatalogService] deleteProducts media:', mediaError);
      throw mediaError;
    }

    const { error: privateError } = await supabase
      .from('product_private')
      .delete()
      .in('product_id', ids);
    if (privateError) {
      console.error('[supabaseCatalogService] deleteProducts private:', privateError);
      throw privateError;
    }

    const { error } = await supabase.from('products').delete().in('id', ids);
    if (error) {
      console.error('[supabaseCatalogService] deleteProducts products:', error);
      throw error;
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
     */
    const {
      error: productError,
    } = await supabase
      .from('products')
      .delete()
      .eq(
        'id',
        productId,
      );

    if (productError) {
      console.error(
        '[supabaseCatalogService] deleteProduct product:',
        productError,
      );

      throw productError;
    }
  },

  /**
   * Create or update a category.
   */
  async upsertCategory(
    category: Partial<CategoryItem> & {
      id: string;
    },
  ): Promise<void> {
    if (!category.id) {
      throw new Error(
        'Category ID is required.',
      );
    }

    const payload =
      removeUndefined({
        id:
          category.id,

        name_en:
          category.nameEn ??
          '',

        name_ar:
          category.nameAr ??
          '',

        icon:
          category.icon ??
          '',

        description:
          category.description ??
          '',

        description_ar:
          category.descriptionAr,

        subcategories:
          category.subcategories ??
          [],

        banner_url:
          category.bannerUrl ??
          '',

        arabic_keywords:
          category.arabicKeywords ??
          [],

        english_keywords:
          category.englishKeywords ??
          [],

        is_published:
          category.isPublished ??
          true,

        display_order:
          category.displayOrder ??
          0,

        updated_at:
          new Date().toISOString(),
      });

    const {
      error,
    } = await supabase
      .from('categories')
      .upsert(
        payload,
        {
          onConflict:
            'id',
        },
      );

    if (error) {
      console.error(
        '[supabaseCatalogService] upsertCategory:',
        error,
      );

      throw error;
    }
  },

  /**
   * Delete category.
   */
  async deleteCategory(
    id: string,
  ): Promise<void> {
    if (!id) {
      throw new Error(
        'Category ID is required.',
      );
    }

    const {
      error,
    } = await supabase
      .from('categories')
      .delete()
      .eq(
        'id',
        id,
      );

    if (error) {
      console.error(
        '[supabaseCatalogService] deleteCategory:',
        error,
      );

      throw error;
    }
  },

  /**
   * Create or update a seller.
   *
   * Intended for authorized admin operations.
   */
  async upsertSeller(
    seller: Partial<Seller> & {
      id: string;
    },
  ): Promise<void> {
    if (!seller.id) {
      throw new Error(
        'Seller ID is required.',
      );
    }

    const payload =
      removeUndefined({
        id:
          seller.id,

        seller_code:
          seller.sellerCode,

        name_en:
          seller.nameEn ??
          '',

        name_ar:
          seller.nameAr,

        logo_url:
          seller.logoUrl,

        banner_image:
          seller.bannerImage,

        bio_en:
          seller.bioEn,

        bio_ar:
          seller.bioAr,

        governorate:
          seller.governorate,

        district:
          seller.district,

        village:
          seller.village,

        exact_address:
          seller.exactAddress,

        region:
          seller.region,

        contact_phone:
          seller.contactPhone,

        contact_email:
          seller.contactEmail,

        craft_category:
          seller.craftCategory,

        commission_pct:
          seller.commissionPct,

        is_active:
          seller.isActive ??
          true,

        has_account:
          seller.hasAccount ??
          false,

        account_email:
          seller.accountEmail,

        account_uid:
          seller.accountUid,

        updated_at:
          new Date().toISOString(),
      });

    const {
      error,
    } = await supabase
      .from('sellers')
      .upsert(
        payload,
        {
          onConflict:
            'id',
        },
      );

    if (error) {
      console.error(
        '[supabaseCatalogService] upsertSeller:',
        error,
      );

      throw error;
    }
  },

  /**
   * Delete seller.
   */
  async deleteSeller(
    id: string,
  ): Promise<void> {
    if (!id) {
      throw new Error(
        'Seller ID is required.',
      );
    }

    const {
      error,
    } = await supabase
      .from('sellers')
      .delete()
      .eq(
        'id',
        id,
      );

    if (error) {
      console.error(
        '[supabaseCatalogService] deleteSeller:',
        error,
      );

      throw error;
    }
  },
};
