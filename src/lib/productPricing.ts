/**
 * The single definition of how product prices move between the app and the
 * database. Every read and every write goes through here.
 *
 * There were two contradictory conventions in the codebase for the same two
 * `Product` fields:
 *
 *   canonical  priceUSD = what the customer pays, originalPriceUSD = the
 *              struck-through "was" price. Used by the Product type, the
 *              storefront, cart, checkout, mapSupabaseProduct, upsertProduct
 *              and SellerDashboard.
 *
 *   swapped    priceUSD = the regular price, originalPriceUSD = the promo
 *              price. Used by ProductsCatalogManagement's submit paths and by
 *              supabaseProductPatchService.buildPayload.
 *
 * Both fed the same `updateProduct` -> patchProduct writer, and the same
 * SellerDashboard payload also feeds upsertProduct, so one of the two was
 * always wrong. Under the swapped convention a discounted product wrote
 * regular_price = selling and promo_price = was, which the database rejects:
 *
 *   CHECK (regular_price > 0
 *          AND (promo_price IS NULL
 *               OR (promo_price > 0 AND promo_price <= regular_price)))
 *
 * so saving any discounted product, or applying a new discount, failed with
 * 23514 and surfaced as "Some of the information is invalid."
 *
 * The database columns mean:
 *   regular_price  the list / "was" price. Always set, always > 0.
 *   promo_price    the discounted price actually charged. NULL when there is
 *                  no promotion; otherwise > 0 and <= regular_price.
 */

export interface CanonicalPrice {
  /** What the customer actually pays. */
  priceUSD: number;
  /** The struck-through "was" price; undefined when not discounted. */
  originalPriceUSD?: number;
}

export interface PriceColumns {
  regular_price: number;
  promo_price: number | null;
}

/** True only for a promotion the database will accept: strictly cheaper. */
export function isDiscounted(
  priceUSD: unknown,
  originalPriceUSD: unknown,
): boolean {
  const price = Number(priceUSD);
  const original = Number(originalPriceUSD);
  return (
    originalPriceUSD !== null &&
    originalPriceUSD !== undefined &&
    Number.isFinite(price) &&
    Number.isFinite(original) &&
    original > price
  );
}

/**
 * Canonical Product fields -> the two writable database columns.
 *
 * `original > price` rather than `original !== price` is deliberate: an
 * "original" that is equal to or below the selling price is not a promotion,
 * and writing it as one produces promo_price > regular_price, which the CHECK
 * constraint rejects.
 */
export function toPriceColumns(input: CanonicalPrice): PriceColumns {
  const price = Number(input.priceUSD);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error('A product price must be a positive number.');
  }

  if (!isDiscounted(input.priceUSD, input.originalPriceUSD)) {
    return { regular_price: price, promo_price: null };
  }

  return { regular_price: Number(input.originalPriceUSD), promo_price: price };
}

/** The two database columns -> canonical Product fields. */
export function fromPriceColumns(row: {
  regular_price?: unknown;
  promo_price?: unknown;
}): CanonicalPrice {
  const regular = Number(row.regular_price ?? 0);
  const promo =
    row.promo_price === null || row.promo_price === undefined
      ? undefined
      : Number(row.promo_price);

  // A promotion is only a promotion while it is actually cheaper, so a stale
  // or equal promo_price reads back as an undiscounted price rather than
  // rendering a "was" line that is not a saving.
  if (promo !== undefined && Number.isFinite(promo) && promo > 0 && promo < regular) {
    return { priceUSD: promo, originalPriceUSD: regular };
  }

  return { priceUSD: promo !== undefined && promo > 0 ? promo : regular };
}

/**
 * Form model (Regular Price + Promo Price, as the admin catalog editor shows
 * them) -> canonical Product fields. The editor keeps its own two-box model;
 * this is the one place that translates it.
 */
export function fromRegularAndPromo(
  regularPrice: number,
  promoPrice: number | null | undefined,
): CanonicalPrice {
  const regular = Number(regularPrice);
  const promo = Number(promoPrice ?? 0);

  if (Number.isFinite(promo) && promo > 0 && promo < regular) {
    return { priceUSD: promo, originalPriceUSD: regular };
  }

  return { priceUSD: regular };
}

/**
 * Canonical Product fields -> the admin editor's two boxes. The inverse of
 * fromRegularAndPromo; the editor used to do this inline, which left the
 * load and save halves of the same conversion in different places.
 * `promo` is null when there is no promotion in force.
 */
export function toRegularAndPromo(product: {
  priceUSD?: unknown;
  originalPriceUSD?: unknown;
}): { regular: number | null; promo: number | null } {
  const price = Number(product.priceUSD);
  if (isDiscounted(product.priceUSD, product.originalPriceUSD)) {
    return { regular: Number(product.originalPriceUSD), promo: price };
  }
  return { regular: Number.isFinite(price) ? price : null, promo: null };
}

