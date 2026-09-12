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
 * Single authoritative delivery fee calculator for all Lebanon governorates and diaspora shipping.
 * Guarantees that any domestic Lebanese order meeting the $50 free-delivery threshold receives $0 delivery fee.
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

  if (matchedRegion) {
    if (speed === 'express_beirut') {
      return matchedRegion.expressAvailable ? matchedRegion.baseDeliveryUSD : matchedRegion.baseDeliveryUSD + 1.5;
    }
    return matchedRegion.baseDeliveryUSD;
  }

  if (speed === 'express_beirut') return DELIVERY_FEES.express_beirut;
  return DELIVERY_FEES.standard;
}

export function deliveryFeeUSD(speed: keyof typeof DELIVERY_FEES | string, subtotalUSD: number): number {
  return calcDeliveryFeeUSD({ speed, subtotalUSD });
}
