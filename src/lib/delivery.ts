export const FREE_DELIVERY_THRESHOLD_USD = 50;

export const DELIVERY_FEES = {
  express_beirut: 3,
  standard: 2,
  diaspora_air: 28,
} as const;

export interface RegionInfo {
  id: string;
  expressAvailable: boolean;
  baseDeliveryUSD: number;
}

export interface DeliveryCalculationParams {
  speed?: string;
  regionId?: string;
  matchedRegion?: RegionInfo;
  subtotalUSD: number;
}

/**
 * Checkout delivery rules: Lebanon Standard is $2 below $50 and free at/above $50;
 * Diaspora Air is always $28. Beirut Express is intentionally out of scope.
 */
export function calcDeliveryFeeUSD({ speed, regionId, matchedRegion, subtotalUSD }: DeliveryCalculationParams): number {
  const isDiaspora = regionId === 'diaspora_global' || speed === 'diaspora_air' || speed === 'diaspora_global';
  if (isDiaspora) {
    return matchedRegion ? matchedRegion.baseDeliveryUSD : DELIVERY_FEES.diaspora_air;
  }

  // Free delivery threshold for all domestic Lebanese governorates
  if (subtotalUSD >= FREE_DELIVERY_THRESHOLD_USD) {
    return 0;
  }

  if (speed === 'standard') return DELIVERY_FEES.standard;

  // Beirut Express is intentionally out of checkout scope.
  return 0;
}

export function deliveryFeeUSD(speed: keyof typeof DELIVERY_FEES | string, subtotalUSD: number): number {
  return calcDeliveryFeeUSD({ speed, subtotalUSD });
}
