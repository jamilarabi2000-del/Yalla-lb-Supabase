export const FREE_DELIVERY_THRESHOLD_USD = 50;

export const DELIVERY_FEES = {
  express_beirut: 3,
  standard: 2,
  diaspora_air: 28,
} as const;

export const REGION_DELIVERY_BASE: Record<string, { baseUSD: number; expressAvailable: boolean }> = {
  beirut: { baseUSD: 3.0, expressAvailable: true },
  mount_lebanon: { baseUSD: 4.5, expressAvailable: true },
  north: { baseUSD: 5.0, expressAvailable: false },
  south: { baseUSD: 5.5, expressAvailable: false },
  bekaa: { baseUSD: 5.5, expressAvailable: false },
  diaspora_global: { baseUSD: 28.0, expressAvailable: true },
};

function normalizeGovKey(gov?: string): string {
  if (!gov) return '';
  const s = gov.toLowerCase().trim();
  if (s.includes('diaspora') || s.includes('international')) return 'diaspora_global';
  if (s.includes('beirut') || s.includes('بيروت')) return 'beirut';
  if (s.includes('mount') || s.includes('جبل')) return 'mount_lebanon';
  if (s.includes('north') || s.includes('akkar') || s.includes('شمال')) return 'north';
  if (s.includes('south') || s.includes('nabatieh') || s.includes('جنوب')) return 'south';
  if (s.includes('bekaa') || s.includes('بقاع')) return 'bekaa';
  return s;
}

export function computeDelivery(speed: string = 'standard', governorate?: string, netSubtotalUSD: number = 0): number {
  const govKey = normalizeGovKey(governorate);
  const isDiaspora = govKey === 'diaspora_global' || speed === 'diaspora_air' || speed === 'diaspora_global';
  if (isDiaspora) {
    return DELIVERY_FEES.diaspora_air;
  }

  // Free delivery threshold for all domestic Lebanese governorates
  if (netSubtotalUSD >= FREE_DELIVERY_THRESHOLD_USD) {
    return 0;
  }

  const regionInfo = REGION_DELIVERY_BASE[govKey];
  if (regionInfo) {
    if (speed === 'express_beirut') {
      return regionInfo.expressAvailable ? regionInfo.baseUSD : regionInfo.baseUSD + 1.5;
    }
    return regionInfo.baseUSD;
  }

  if (speed === 'express_beirut') {
    return DELIVERY_FEES.express_beirut;
  }

  return DELIVERY_FEES.standard;
}
