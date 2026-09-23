import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  toPriceColumns,
  fromPriceColumns,
  fromRegularAndPromo,
  isDiscounted,
} from '../src/lib/productPricing';

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), 'utf8');
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/**
 * public.products carries:
 *
 *   CHECK (regular_price > 0
 *          AND (promo_price IS NULL
 *               OR (promo_price > 0 AND promo_price <= regular_price)))
 *
 * Any write that violates it fails with 23514, which the UI shows as
 * "Some of the information is invalid." Modelled here so a mapping that would
 * be rejected by the database is rejected by the test suite first.
 */
const satisfiesCheckConstraint = (c: { regular_price: number; promo_price: number | null }) =>
  c.regular_price > 0 &&
  (c.promo_price === null || (c.promo_price > 0 && c.promo_price <= c.regular_price));

describe('canonical product pricing', () => {
  it('writes a discount as regular = was, promo = selling', () => {
    // The bug: regular_price := priceUSD and promo_price := originalPriceUSD,
    // giving regular=1 promo=2, which the CHECK rejects.
    const cols = toPriceColumns({ priceUSD: 1, originalPriceUSD: 2 });
    expect(cols).toEqual({ regular_price: 2, promo_price: 1 });
    expect(satisfiesCheckConstraint(cols)).toBe(true);
  });

  it('writes no promotion when there is no saving', () => {
    expect(toPriceColumns({ priceUSD: 10 })).toEqual({ regular_price: 10, promo_price: null });
    expect(toPriceColumns({ priceUSD: 10, originalPriceUSD: undefined }))
      .toEqual({ regular_price: 10, promo_price: null });
    // Equal is not a promotion...
    expect(toPriceColumns({ priceUSD: 10, originalPriceUSD: 10 }))
      .toEqual({ regular_price: 10, promo_price: null });
    // ...and neither is an "original" below the selling price, which would
    // otherwise produce promo_price > regular_price.
    expect(toPriceColumns({ priceUSD: 10, originalPriceUSD: 4 }))
      .toEqual({ regular_price: 10, promo_price: null });
  });

  it('never produces a row the database would reject', () => {
    const prices = [0.01, 1, 2, 9.99, 10, 1000];
    for (const priceUSD of prices) {
      for (const originalPriceUSD of [undefined, ...prices]) {
        const cols = toPriceColumns({ priceUSD, originalPriceUSD });
        expect(
          satisfiesCheckConstraint(cols),
          `priceUSD=${priceUSD} originalPriceUSD=${originalPriceUSD} -> ${JSON.stringify(cols)}`,
        ).toBe(true);
      }
    }
  });

  it('rejects a non-positive price rather than writing one the CHECK refuses', () => {
    expect(() => toPriceColumns({ priceUSD: 0 })).toThrow();
    expect(() => toPriceColumns({ priceUSD: -5 })).toThrow();
    expect(() => toPriceColumns({ priceUSD: Number.NaN })).toThrow();
  });

  it('round-trips through the database columns', () => {
    for (const canonical of [
      { priceUSD: 1, originalPriceUSD: 2 },
      { priceUSD: 10 },
      { priceUSD: 7.5, originalPriceUSD: 15 },
    ]) {
      expect(fromPriceColumns(toPriceColumns(canonical))).toEqual(canonical);
    }
  });

  it('reads promo_price as the price and regular_price as the was-price', () => {
    expect(fromPriceColumns({ regular_price: 2, promo_price: 1 }))
      .toEqual({ priceUSD: 1, originalPriceUSD: 2 });
    expect(fromPriceColumns({ regular_price: 5, promo_price: null }))
      .toEqual({ priceUSD: 5 });
  });

  it('does not render a "was" line for a promo that is not a saving', () => {
    expect(fromPriceColumns({ regular_price: 5, promo_price: 5 })).toEqual({ priceUSD: 5 });
  });

  it('translates the admin editor two-box model', () => {
    // The editor shows Regular Price + Promo Price.
    expect(fromRegularAndPromo(2, 1)).toEqual({ priceUSD: 1, originalPriceUSD: 2 });
    expect(fromRegularAndPromo(2, 0)).toEqual({ priceUSD: 2 });
    expect(fromRegularAndPromo(2, null)).toEqual({ priceUSD: 2 });
    expect(fromRegularAndPromo(2, undefined)).toEqual({ priceUSD: 2 });
    // A promo at or above the regular price is not a promotion.
    expect(fromRegularAndPromo(2, 2)).toEqual({ priceUSD: 2 });
    expect(fromRegularAndPromo(2, 3)).toEqual({ priceUSD: 2 });
  });

  it('isDiscounted requires a real saving', () => {
    expect(isDiscounted(1, 2)).toBe(true);
    expect(isDiscounted(2, 2)).toBe(false);
    expect(isDiscounted(2, 1)).toBe(false);
    expect(isDiscounted(2, null)).toBe(false);
    expect(isDiscounted(2, undefined)).toBe(false);
  });
});

describe('every price write goes through the shared mapping', () => {
  // Comments are stripped: the prose above each call site names the very
  // columns being asserted on, and would otherwise satisfy these checks.
  const patch = strip(read('src/services/supabaseProductPatchService.ts'));
  const catalog = strip(read('src/services/supabaseCatalogService.ts'));
  const adminCatalog = strip(read('src/components/admin/ProductsCatalogManagement.tsx'));

  it('patchProduct no longer assigns the price columns by hand', () => {
    expect(patch).toContain('toPriceColumns');
    expect(patch).not.toMatch(/payload\.regular_price\s*=/);
    expect(patch).not.toMatch(/payload\.promo_price\s*=/);
  });

  it('patchProduct reads back the side a partial update did not send', () => {
    // Otherwise sending only a new price silently drops an existing promotion.
    expect(patch).toContain('fromPriceColumns');
    expect(patch).toContain("select('regular_price, promo_price')");
  });

  it('upsertProduct and the row mapper share the same definition', () => {
    expect(catalog).toContain('toPriceColumns');
    expect(catalog).toContain('fromPriceColumns');
    // The old hand-rolled forms must be gone from both.
    expect(catalog).not.toContain('row.promo_price ??');
    expect(catalog).not.toMatch(/originalPriceUSD\s*!==\s*product\.priceUSD/);
  });

  it('the admin catalog editor emits canonical Product fields', () => {
    // It used to send its own form model (priceUSD = Regular Price), which is
    // the swapped convention that broke every discounted save.
    expect(adminCatalog).toContain('fromRegularAndPromo');
    expect(adminCatalog).not.toMatch(/priceUSD:\s*price,\s*\n\s*originalPriceUSD:/);
  });
});
