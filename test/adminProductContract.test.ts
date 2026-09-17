import { describe, it, expect } from 'vitest';
import { normalizeAdminProductPayload, validateAdminProductInput, ADMIN_PRODUCT_DEFAULTS } from '../src/lib/adminBehavior';

/**
 * Behavioural coverage for the admin product contract.
 *
 * The previous suite asserted that strings appeared in source files, which is
 * how a completely broken create flow passed CI. These assert what the
 * functions actually return.
 */
describe('Admin product required fields', () => {
  const base = { name: 'Zaatar', category: '5dfdaacf-10c5-48fa-b3a9-2dad19f420e8', priceUSD: 10 } as any;

  it('requires name, category and price and nothing else', () => {
    expect(validateAdminProductInput(base).valid).toBe(true);
    expect(validateAdminProductInput({ ...base, name: '' }).valid).toBe(false);
    expect(validateAdminProductInput({ ...base, category: '' }).valid).toBe(false);
    expect(validateAdminProductInput({ ...base, priceUSD: 0 }).valid).toBe(false);
  });

  it('accepts a product with every optional field blank', () => {
    const result = validateAdminProductInput({
      ...base, artisan: '', origin: '', brand: '', description: '', craftStory: '', image: '',
    } as any);
    expect(result.valid).toBe(true);
  });

  it('does not default the category to an unresolvable slug', () => {
    // 'grocery' can never match a category_id uuid.
    expect(ADMIN_PRODUCT_DEFAULTS.category).toBe('');
  });
});

describe('Admin product normalisation', () => {
  const base = { name: 'Zaatar', category: 'cat-uuid', priceUSD: 10 } as any;

  it('treats a cleared numeric field as "not supplied", never as zero', () => {
    const out = normalizeAdminProductPayload(
      { ...base, displayOrder: '', lowStockThreshold: '', discountPercentage: '', costPriceUSD: '' } as any,
      false,
    );
    expect(out.displayOrder).toBeUndefined();
    expect(out.lowStockThreshold).toBeUndefined();
    expect(out.discountPercentage).toBeUndefined();
    expect(out.costPriceUSD).toBeUndefined();
  });

  it('keeps a real zero when a zero is genuinely supplied', () => {
    const out = normalizeAdminProductPayload({ ...base, displayOrder: 0, lowStockThreshold: 0 } as any, false);
    expect(out.displayOrder).toBe(0);
    expect(out.lowStockThreshold).toBe(0);
  });

  it('falls back to the documented stock default only when stock is blank', () => {
    expect(normalizeAdminProductPayload({ ...base, stock: '' } as any, false).stock).toBe(ADMIN_PRODUCT_DEFAULTS.stock);
    expect(normalizeAdminProductPayload({ ...base, stock: 0 } as any, false).stock).toBe(0);
    expect(normalizeAdminProductPayload({ ...base, stock: 7 } as any, false).stock).toBe(7);
  });

  it('never carries rating or reviews_count, which the database owns', () => {
    const out = normalizeAdminProductPayload({ ...base, rating: 5, reviewsCount: 99 } as any, false) as any;
    expect(out.rating).toBeUndefined();
    expect(out.reviewsCount).toBeUndefined();
  });

  it('carries the publish flag through from the caller', () => {
    expect(normalizeAdminProductPayload(base, true).isPublished).toBe(true);
    expect(normalizeAdminProductPayload(base, false).isPublished).toBe(false);
  });
});
