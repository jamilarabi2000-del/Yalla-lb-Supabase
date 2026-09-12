import { describe, it, expect } from 'vitest';
import { round2, computeDiscounts, applyDiscounts } from '../src/lib/pricing';
import { calcDeliveryFeeUSD, FREE_DELIVERY_THRESHOLD_USD } from '../src/lib/delivery';
import { computeDiscounts as computeFunctionsDiscounts } from '../functions/src/pricing';

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
    const mockProduct = {
      id: 'prod-1',
      name: 'Olive Oil 1L',
      priceUSD: 20,
      artisan: 'Koura Press',
      origin: 'Koura',
      category: 'Pantry',
      rating: 5,
      reviewsCount: 10,
      image: '',
      description: '',
      craftStory: '',
      stock: 50,
      tags: []
    };

    const lines = [{ product: mockProduct, quantity: 2, unitPriceUSD: 20 }];
    const rules = [
      {
        id: 'rule-welcome10',
        name: '10% Welcome',
        type: 'percentage' as const,
        value: 10,
        couponCode: 'WELCOME10',
        isActive: true
      }
    ];

    const result = computeDiscounts({
      lines,
      discounts: rules,
      bundles: [],
      couponCode: 'WELCOME10',
      subtotalUSD: 40
    });

    expect(result.discountUSD).toBe(4);
    expect(result.finalSubtotalUSD).toBe(36);

    // Server-side functions pricing parity
    const fnResult = computeFunctionsDiscounts({
      lines,
      discounts: rules,
      bundles: [],
      couponCode: 'WELCOME10',
      subtotalUSD: 40
    });
    expect(fnResult.discountUSD).toBe(4);
    expect(fnResult.appliedCoupon).toBe('WELCOME10');
  });

  it('bounds discount so it can never exceed 100% of order subtotal', () => {
    const mockProduct = {
      id: 'prod-2',
      name: 'Wild Zaatar',
      priceUSD: 10,
      artisan: 'Chouf Cooperative',
      origin: 'Chouf',
      category: 'Pantry',
      rating: 5,
      reviewsCount: 5,
      image: '',
      description: '',
      craftStory: '',
      stock: 20,
      tags: []
    };

    const lines = [{ product: mockProduct, quantity: 1, unitPriceUSD: 10 }];
    const rules = [
      {
        id: 'rule-huge',
        name: 'Huge coupon',
        type: 'fixed' as const,
        value: 500, // Attempting $500 off on $10 item
        couponCode: 'HUGE500',
        isActive: true
      }
    ];

    const result = computeDiscounts({
      lines,
      discounts: rules,
      bundles: [],
      couponCode: 'HUGE500',
      subtotalUSD: 10
    });

    expect(result.discountUSD).toBe(7);
    expect(result.finalSubtotalUSD).toBe(3);

    const fnResult = computeFunctionsDiscounts({
      lines,
      discounts: rules,
      bundles: [],
      couponCode: 'HUGE500',
      subtotalUSD: 10
    });
    expect(fnResult.discountUSD).toBe(7);
  });

  it('resists adversarial inputs with NaN, negative, or infinite values', () => {
    const mockProduct = {
      id: 'prod-3',
      name: 'Soap Bar',
      priceUSD: 8,
      stock: 10
    };
    const lines = [{ product: mockProduct, quantity: 2, unitPriceUSD: 8 }];

    const maliciousRules = [
      { id: 'bad-1', type: 'percentage', value: NaN, isActive: true },
      { id: 'bad-2', type: 'fixed', value: -100, isActive: true },
      { id: 'bad-3', type: 'percentage', value: Infinity, isActive: true }
    ];

    const maliciousBundles = [
      { id: 'b-bad-1', bundlePriceUSD: -50, productIds: ['prod-3'], isActive: true },
      { id: 'b-bad-2', bundlePriceUSD: NaN, productIds: null as any, isActive: true }
    ];

    const fnResult = computeFunctionsDiscounts({
      lines,
      discounts: maliciousRules,
      bundles: maliciousBundles,
      subtotalUSD: 16
    });

    expect(Number.isFinite(fnResult.discountUSD)).toBe(true);
    expect(fnResult.discountUSD).toBeGreaterThanOrEqual(0);
    expect(fnResult.discountUSD).toBeLessThanOrEqual(16);
  });

  it('accurately calculates BOGO discounts in server engine', () => {
    const mockProduct = {
      id: 'prod-jam',
      name: 'Fig Jam',
      priceUSD: 10,
      stock: 20
    };
    const lines = [{ product: mockProduct, quantity: 4, unitPriceUSD: 10 }];
    const bogoRule = [
      {
        id: 'bogo-jam',
        type: 'bogo',
        target: 'product',
        targetValue: 'prod-jam',
        buyQty: 1,
        getQty: 1,
        getDiscountPercent: 100,
        isActive: true
      }
    ];

    const fnResult = computeFunctionsDiscounts({
      lines,
      discounts: bogoRule,
      bundles: [],
      subtotalUSD: 40
    });

    // 4 units bought with Buy 1 Get 1 Free = 2 free units = $20 discount
    expect(fnResult.discountUSD).toBe(20);
  });
});

