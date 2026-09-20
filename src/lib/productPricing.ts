export interface ProductPricing {
  currentPrice: number;
  originalPrice: number | null;
  discount: number;
  isPromo: boolean;
}

/** Canonical storefront pricing: priceUSD is the current/sale price; originalPriceUSD is the pre-promotion price. */
export function getProductPricing(product: { priceUSD?: number | null; originalPriceUSD?: number | null; discountPercentage?: number | null }): ProductPricing {
  const currentPrice = Number(product.priceUSD || 0);
  const original = Number(product.originalPriceUSD || 0);
  const isPromo = currentPrice > 0 && original > currentPrice;
  const originalPrice = isPromo ? original : null;
  // Never trust a stored discount percentage when the price relationship is invalid.
  // A promotion exists only when the current/sale price is strictly below the regular/original price.
  const discount = isPromo
    ? Math.round((1 - currentPrice / original) * 100)
    : 0;
  return { currentPrice, originalPrice, discount, isPromo };
}

export function formatUSD(amount: number): string {
  return '$' + Number(amount || 0).toFixed(2);
}
