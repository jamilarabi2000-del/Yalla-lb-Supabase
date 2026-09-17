import { describe, it, expect } from 'vitest';
import { buildRuleJson, mapDiscountRow, mapBundleRow, mapRegionRow } from '../src/services/supabaseCommerceService';

/**
 * discount_rules stores its payload in a single `rule` jsonb column and
 * private.checkout_create_order reads it with exact camelCase keys. If these
 * keys drift, a promotion is saved successfully and then silently never
 * applies at checkout, which is not visible from the admin UI.
 */
describe('Discount rule jsonb contract', () => {
  it('writes exactly the keys the checkout RPC reads', () => {
    const json = buildRuleJson({
      type: 'percentage', value: 15, target: 'category', targetValue: 'spices',
      minPurchaseUSD: 20, startDate: '2026-01-01T00:00', endDate: '2026-02-01T00:00',
      isNewUserOnly: true, buyQty: 1, getQty: 1, getDiscountPercent: 50, couponCode: 'welcome',
    });
    expect(json).toEqual({
      type: 'percentage', value: 15, target: 'category', targetValue: 'spices',
      minPurchaseUSD: 20, startDate: '2026-01-01T00:00', endDate: '2026-02-01T00:00',
      isNewUserOnly: true, buyQty: 1, getQty: 1, getDiscountPercent: 50, couponCode: 'WELCOME',
    });
  });

  it('omits unset keys instead of writing nulls', () => {
    expect(buildRuleJson({ type: 'fixed', value: 5, target: 'all' })).toEqual({ type: 'fixed', value: 5, target: 'all' });
  });

  it('reads the rule back out of the jsonb column, not from flat columns', () => {
    const rule = mapDiscountRow({
      id: 'r1', name: 'Spring', is_active: true,
      rule: { type: 'percentage', value: 15, target: 'all', minPurchaseUSD: 20 },
      coupons: [{ coupon_code: 'SPRING', max_total_uses: 100, max_uses_per_user: 1 }],
    });
    expect(rule.type).toBe('percentage');
    expect(rule.value).toBe(15);
    expect(rule.minPurchaseUSD).toBe(20);
    expect(rule.couponCode).toBe('SPRING');
    expect(rule.maxTotalUses).toBe(100);
  });
});

describe('Product bundle column contract', () => {
  it('maps price_usd and is_published, the columns that actually exist', () => {
    const bundle = mapBundleRow({
      id: 'b1', name: 'Breakfast', product_ids: ['p1', 'p2'],
      price_usd: '24.50', is_published: true, show_in_slider: false,
    });
    expect(bundle.bundlePriceUSD).toBe(24.5);
    expect(bundle.isActive).toBe(true);
    expect(bundle.productIds).toEqual(['p1', 'p2']);
  });
});

describe('Region mapping', () => {
  it('maps the delivery fee the checkout RPC charges', () => {
    const region = mapRegionRow({ id: 'beirut', name_en: 'Beirut', name_ar: 'بيروت', major_cities: ['Beirut'], express_available: true, base_delivery_usd: '3.5' });
    expect(region.baseDeliveryUSD).toBe(3.5);
    expect(region.expressAvailable).toBe(true);
  });
});
