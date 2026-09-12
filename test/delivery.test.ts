import { describe, it, expect } from 'vitest';
import { calcDeliveryFeeUSD, FREE_DELIVERY_THRESHOLD_USD } from '../src/lib/delivery';
import { LEBANON_REGIONS } from '../src/data/regions';

describe('Delivery calculation consistency', () => {
  it('waives delivery fee for orders exceeding threshold across all domestic regions', () => {
    const bekaaRegion = LEBANON_REGIONS.find(r => r.id === 'bekaa')!;
    expect(bekaaRegion).toBeDefined();

    // $55 Bekaa order (express unavailable)
    const fee = calcDeliveryFeeUSD({
      speed: 'express_beirut',
      regionId: bekaaRegion.id,
      matchedRegion: bekaaRegion,
      subtotalUSD: 55,
    });

    expect(fee).toBe(0);
  });

  it('charges base region rate for orders below $50 threshold', () => {
    const bekaaRegion = LEBANON_REGIONS.find(r => r.id === 'bekaa')!;
    const fee = calcDeliveryFeeUSD({
      speed: 'standard',
      regionId: bekaaRegion.id,
      matchedRegion: bekaaRegion,
      subtotalUSD: 30,
    });

    expect(fee).toBe(bekaaRegion.baseDeliveryUSD);
  });

  it('always applies international shipping rate regardless of domestic threshold', () => {
    const diasporaRegion = LEBANON_REGIONS.find(r => r.id === 'diaspora_global')!;
    const fee = calcDeliveryFeeUSD({
      speed: 'diaspora_air',
      regionId: diasporaRegion.id,
      matchedRegion: diasporaRegion,
      subtotalUSD: 100,
    });

    expect(fee).toBe(diasporaRegion.baseDeliveryUSD);
  });
});
