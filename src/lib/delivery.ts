/**
 * Delivery fees as private.checkout_create_order charges them. The server
 * decides what an order pays; this is the storefront's estimate of it, so
 * every rule here mirrors one there:
 *
 *   diaspora                          $28
 *   Lebanon, free-delivery rule met   $0
 *   Lebanon, express                  $3
 *   Lebanon, standard                 the region's delivery fee
 *
 * Delivery in Lebanon is free when the subtotal before discounts reaches the
 * administrator's amount (app_settings 'lebanon_free_delivery_from_usd'), or
 * when every item is in a category marked "Free delivery across Lebanon".
 */

/** The amount used until the administrator's setting has loaded. */
export const DEFAULT_FREE_DELIVERY_FROM_USD = 50;

export const DELIVERY_FEES = {
  express_beirut: 3,
  standard: 2,
  diaspora_air: 28,
} as const;

/**
 * The shop-wide rule: orders in Lebanon ship free from this subtotal. 0 means
 * every order; null means the rule is off.
 */
export type FreeDeliveryFrom = number | null;

/** The rule as app_settings stores it: 'off', or an amount like '50' or '12.5'. */
export function parseFreeDeliveryFrom(value: unknown): FreeDeliveryFrom {
  const text = String(value ?? '').trim();
  if (text === 'off') return null;
  if (!/^(0|[1-9][0-9]{0,3})(\.[0-9]{1,2})?$/.test(text)) return DEFAULT_FREE_DELIVERY_FROM_USD;
  return Number(text);
}

/** The inverse of parseFreeDeliveryFrom; the database refuses anything else. */
export function formatFreeDeliveryFrom(from: FreeDeliveryFrom): string {
  if (from === null) return 'off';
  if (!Number.isFinite(from) || from < 0 || from > 9999.99) {
    throw new Error('The amount must be between $0 and $9,999.99.');
  }
  return String(Math.round(from * 100) / 100);
}

export interface RegionInfo {
  id: string;
  expressAvailable: boolean;
  baseDeliveryUSD: number;
}

export interface DeliveryCalculationParams {
  speed?: string;
  regionId?: string;
  matchedRegion?: RegionInfo;
  /** Before discounts: the amount checkout compares with the rule. */
  subtotalUSD: number;
  /** The administrator's rule; the $50 default until it has loaded. */
  freeFromUSD?: FreeDeliveryFrom;
  /** Every item is in a free-delivery category (everyItemShipsFree). */
  allItemsShipFree?: boolean;
}

/** Whether an order in Lebanon ships free. */
export function lebanonDeliveryIsFree({
  subtotalUSD,
  freeFromUSD = DEFAULT_FREE_DELIVERY_FROM_USD,
  allItemsShipFree = false,
}: Pick<DeliveryCalculationParams, 'subtotalUSD' | 'freeFromUSD' | 'allItemsShipFree'>): boolean {
  return allItemsShipFree || (freeFromUSD !== null && subtotalUSD >= freeFromUSD);
}

/**
 * True when the cart holds at least one item and every item's category ships
 * free across Lebanon. An item with no category does not qualify.
 */
export function everyItemShipsFree(
  items: ReadonlyArray<{ product: { category?: string } }>,
  categories: ReadonlyArray<{ id: string; freeDeliveryLebanon?: boolean }>,
): boolean {
  if (items.length === 0) return false;
  const free = new Set(categories.filter(c => c.freeDeliveryLebanon === true).map(c => c.id));
  return items.every(item => Boolean(item.product.category) && free.has(item.product.category!));
}

/** The subtotal checkout compares with the rule: unit prices times quantities, before discounts. */
export function cartSubtotalUSD(items: ReadonlyArray<{ product: { priceUSD: number }; quantity: number }>): number {
  return Math.round(items.reduce((sum, item) => sum + item.product.priceUSD * item.quantity, 0) * 100) / 100;
}

export function calcDeliveryFeeUSD(params: DeliveryCalculationParams): number {
  const { speed, regionId, matchedRegion } = params;
  if (regionId === 'diaspora_global' || speed === 'diaspora_air' || speed === 'diaspora_global') {
    return DELIVERY_FEES.diaspora_air;
  }
  if (lebanonDeliveryIsFree(params)) return 0;
  if (speed === 'express_beirut') return DELIVERY_FEES.express_beirut;
  return matchedRegion ? matchedRegion.baseDeliveryUSD : DELIVERY_FEES.standard;
}

export function deliveryFeeUSD(speed: keyof typeof DELIVERY_FEES | string, subtotalUSD: number): number {
  return calcDeliveryFeeUSD({ speed, subtotalUSD });
}
