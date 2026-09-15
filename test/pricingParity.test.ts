import { describe, expect, it } from 'vitest';
import { applyDiscounts } from '../src/lib/pricing';

const product = (overrides: Record<string, unknown> = {}) => ({
  id: 'p1', name: 'Product One', artisan: 'Brand A', origin: 'Beirut', category: 'cat-a',
  priceUSD: 10, rating: 0, reviewsCount: 0, image: '', description: '', craftStory: '', stock: 20, tags: [],
  sellerId: 'seller-1', seller: 'Seller One', ...overrides,
});

describe('discount checkout parity', () => {
  it('matches checkout seller targeting by seller id/name, not artisan/origin', () => {
    const result = applyDiscounts(
      [{ product: product(), quantity: 1 }],
      [{ id: 'r1', name: 'Seller promo', type: 'percentage', value: 10, target: 'seller', targetValue: 'seller-1', isActive: true } as any],
    );
    expect(result.discountUSD).toBe(1);
  });

  it('matches checkout multi-product BOGO grouping semantics', () => {
    const result = applyDiscounts(
      [
        { product: product({ id: 'p1', priceUSD: 10 }), quantity: 3 },
        { product: product({ id: 'p2', priceUSD: 20 }), quantity: 3 },
      ],
      [{ id: 'b1', name: 'BOGO', type: 'bogo', value: 100, buyQty: 1, getQty: 1, target: 'all', isActive: true } as any],
    );
    // checkout computes one group per product line, then applies the resulting
    // get-count to each eligible line.
    expect(result.discountUSD).toBe(60);
  });
});
