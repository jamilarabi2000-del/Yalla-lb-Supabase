import { describe, it, expect } from 'vitest';
import { round2, computeDiscounts } from '../src/lib/pricing';
import { calcDeliveryFeeUSD } from '../src/lib/delivery';

describe('Authoritative Pricing and Discount Engine', () => {
  it('correctly rounds to 2 decimal places without floating drift', () => {
    expect(round2(10.005)).toBe(10.01);
    expect(round2(19.994)).toBe(19.99);
    expect(round2(0)).toBe(0);
  });

  it('guarantees free domestic delivery for orders at or above $50', () => {
    expect(calcDeliveryFeeUSD({ speed: 'standard', subtotalUSD: 50 })).toBe(0);
    expect(calcDeliveryFeeUSD({ speed: 'express_beirut', subtotalUSD: 65 })).toBe(0);
    expect(calcDeliveryFeeUSD({ speed: 'standard', subtotalUSD: 49.99 })).toBe(2);
  });

  it('applies percentage and fixed discounts accurately', () => {
    const mockProduct = { id: 'prod-1', name: 'Olive Oil 1L', priceUSD: 20, artisan: 'Koura Press', origin: 'Koura', category: 'Pantry', rating: 5, reviewsCount: 10, image: '', description: '', craftStory: '', stock: 50, tags: [] };
    const lines = [{ product: mockProduct, quantity: 2, unitPriceUSD: 20 }];
    const rules = [{ id: 'rule-welcome10', name: '10% Welcome', type: 'percentage' as const, value: 10, couponCode: 'WELCOME10', isActive: true }];
    const result = computeDiscounts({ lines, discounts: rules, bundles: [], couponCode: 'WELCOME10', subtotalUSD: 40 });
    expect(result.discountUSD).toBe(4);
    expect(result.finalSubtotalUSD).toBe(36);
  });

  it('bounds discount so it can never exceed the order subtotal', () => {
    const mockProduct = { id: 'prod-2', name: 'Wild Zaatar', priceUSD: 10, artisan: 'Chouf Cooperative', origin: 'Chouf', category: 'Pantry', rating: 5, reviewsCount: 5, image: '', description: '', craftStory: '', stock: 20, tags: [] };
    const lines = [{ product: mockProduct, quantity: 1, unitPriceUSD: 10 }];
    const rules = [{ id: 'rule-huge', name: 'Huge coupon', type: 'fixed' as const, value: 500, couponCode: 'HUGE500', isActive: true }];
    const result = computeDiscounts({ lines, discounts: rules, bundles: [], couponCode: 'HUGE500', subtotalUSD: 10 });
    expect(result.discountUSD).toBeLessThanOrEqual(10);
    expect(result.finalSubtotalUSD).toBeGreaterThanOrEqual(0);
  });

  it('resists adversarial NaN, negative and infinite discount values', () => {
    const mockProduct = { id: 'prod-3', name: 'Soap Bar', priceUSD: 8, stock: 10, artisan: 'Test', origin: 'Lebanon', category: 'Bath', rating: 0, reviewsCount: 0, image: '', description: '', craftStory: '', tags: [] };
    const lines = [{ product: mockProduct, quantity: 2, unitPriceUSD: 8 }];
    const maliciousRules = [
      { id: 'bad-1', name: 'NaN', type: 'percentage' as const, value: NaN, isActive: true },
      { id: 'bad-2', name: 'Negative', type: 'fixed' as const, value: -100, isActive: true },
      { id: 'bad-3', name: 'Infinite', type: 'percentage' as const, value: Infinity, isActive: true },
    ];
    const result = computeDiscounts({ lines, discounts: maliciousRules, bundles: [], subtotalUSD: 16 });
    expect(Number.isFinite(result.discountUSD)).toBe(true);
    expect(result.discountUSD).toBeGreaterThanOrEqual(0);
    expect(result.discountUSD).toBeLessThanOrEqual(16);
  });

  it('calculates BOGO discounts in the same client pricing engine used by the storefront', () => {
    const mockProduct = { id: 'prod-jam', name: 'Fig Jam', priceUSD: 10, stock: 20, artisan: 'Test', origin: 'Lebanon', category: 'Pantry', rating: 0, reviewsCount: 0, image: '', description: '', craftStory: '', tags: [] };
    const lines = [{ product: mockProduct, quantity: 4, unitPriceUSD: 10 }];
    const bogoRule = [{ id: 'bogo-jam', name: 'BOGO', type: 'bogo' as const, target: 'product' as const, targetValue: 'prod-jam', buyQty: 1, getQty: 1, getDiscountPercent: 100, isActive: true }];
    const result = computeDiscounts({ lines, discounts: bogoRule, bundles: [], subtotalUSD: 40 });
    expect(result.discountUSD).toBe(20);
  });
});
