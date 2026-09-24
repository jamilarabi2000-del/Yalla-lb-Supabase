import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  calcDeliveryFeeUSD,
  cartSubtotalUSD,
  DEFAULT_FREE_DELIVERY_FROM_USD,
  everyItemShipsFree,
  formatFreeDeliveryFrom,
  lebanonDeliveryIsFree,
  parseFreeDeliveryFrom,
} from '../src/lib/delivery';
import { LEBANON_REGIONS } from '../src/data/regions';

const region = (id: string) => LEBANON_REGIONS.find(r => r.id === id)!;

describe('Delivery calculation consistency', () => {
  it('waives delivery fee for orders exceeding threshold across all domestic regions', () => {
    const bekaaRegion = region('bekaa');
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
    const bekaaRegion = region('bekaa');
    const fee = calcDeliveryFeeUSD({
      speed: 'standard',
      regionId: bekaaRegion.id,
      matchedRegion: bekaaRegion,
      subtotalUSD: 30,
    });

    expect(fee).toBe(bekaaRegion.baseDeliveryUSD);
  });

  it('always applies international shipping rate regardless of domestic threshold', () => {
    const diasporaRegion = region('diaspora_global');
    const fee = calcDeliveryFeeUSD({
      speed: 'diaspora_air',
      regionId: diasporaRegion.id,
      matchedRegion: diasporaRegion,
      subtotalUSD: 100,
    });

    expect(fee).toBe(diasporaRegion.baseDeliveryUSD);
  });
});

// Each case is one the migration's dry run charged through
// private.checkout_create_order on the live database; the storefront must
// quote the same fee.
describe('free delivery across Lebanon mirrors checkout', () => {
  const quote = (speed: string, regionId: string, subtotalUSD: number, extra: Record<string, unknown> = {}) =>
    calcDeliveryFeeUSD({ speed, regionId, matchedRegion: region(regionId), subtotalUSD, ...extra });

  it('keeps the $50 rule until the setting loads', () => {
    expect(DEFAULT_FREE_DELIVERY_FROM_USD).toBe(50);
    expect(quote('standard', 'beirut', 1)).toBe(3);
    expect(quote('standard', 'beirut', 49.99)).toBe(3);
    expect(quote('standard', 'beirut', 50)).toBe(0);
  });

  it('ships every order free when the amount is 0', () => {
    expect(quote('standard', 'beirut', 1, { freeFromUSD: 0 })).toBe(0);
    expect(quote('express_beirut', 'mount_lebanon', 0.5, { freeFromUSD: 0 })).toBe(0);
  });

  it('uses the administrator\'s amount', () => {
    expect(quote('standard', 'north', 2, { freeFromUSD: 1.5 })).toBe(0);
    expect(quote('standard', 'north', 1, { freeFromUSD: 1.5 })).toBe(5);
  });

  it('charges delivery on every order when the rule is off', () => {
    expect(quote('standard', 'south', 1000, { freeFromUSD: null })).toBe(5.5);
    expect(quote('express_beirut', 'beirut', 30, { freeFromUSD: null })).toBe(3);
  });

  it('ships free when every item is in a free-delivery category, standard or express', () => {
    expect(quote('standard', 'south', 3, { freeFromUSD: null, allItemsShipFree: true })).toBe(0);
    expect(quote('express_beirut', 'mount_lebanon', 1, { freeFromUSD: null, allItemsShipFree: true })).toBe(0);
  });

  it('never makes diaspora shipping free', () => {
    expect(quote('diaspora_air', 'diaspora_global', 1, { freeFromUSD: 0, allItemsShipFree: true })).toBe(28);
  });

  it('charges express at the flat $3 checkout charges, whatever the region fee', () => {
    // Mount Lebanon's standard fee is $4.50; checkout charges express at $3.
    expect(quote('express_beirut', 'mount_lebanon', 10)).toBe(3);
    expect(quote('standard', 'mount_lebanon', 10)).toBe(4.5);
  });

  it('measures the subtotal before discounts, as checkout does', () => {
    const cart = [
      { product: { priceUSD: 30, category: 'a' }, quantity: 1 },
      { product: { priceUSD: 12.5, category: 'b' }, quantity: 2 },
    ];
    expect(cartSubtotalUSD(cart)).toBe(55);
    expect(lebanonDeliveryIsFree({ subtotalUSD: cartSubtotalUSD(cart) })).toBe(true);
  });
});

describe('everyItemShipsFree', () => {
  const categories = [
    { id: 'mouneh', freeDeliveryLebanon: true },
    { id: 'soap', freeDeliveryLebanon: false },
    { id: 'honey' },
  ];
  const item = (category?: string) => ({ product: { category } });

  it('needs every item in a free-delivery category', () => {
    expect(everyItemShipsFree([item('mouneh'), item('mouneh')], categories)).toBe(true);
    expect(everyItemShipsFree([item('mouneh'), item('soap')], categories)).toBe(false);
    expect(everyItemShipsFree([item('honey')], categories)).toBe(false);
  });

  it('does not count an item with no category, or an unknown one, or an empty cart', () => {
    expect(everyItemShipsFree([item('mouneh'), item(undefined)], categories)).toBe(false);
    expect(everyItemShipsFree([item('gone')], categories)).toBe(false);
    expect(everyItemShipsFree([], categories)).toBe(false);
  });
});

describe('the stored setting', () => {
  it('reads what the database accepts', () => {
    expect(parseFreeDeliveryFrom('off')).toBeNull();
    expect(parseFreeDeliveryFrom('0')).toBe(0);
    expect(parseFreeDeliveryFrom('75.25')).toBe(75.25);
    expect(parseFreeDeliveryFrom('9999.99')).toBe(9999.99);
  });

  it('falls back to $50 for anything else rather than guessing', () => {
    for (const bad of ['', 'abc', '-1', '50.555', '10000', ' 50', '05', 'OFF', null, undefined]) {
      expect(parseFreeDeliveryFrom(bad)).toBe(50);
    }
  });

  it('writes only values the database constraint accepts', () => {
    const constraint = /^(off|(0|[1-9][0-9]{0,3})(\.[0-9]{1,2})?)$/;
    for (const from of [null, 0, 0.5, 1.5, 50, 75.25, 9999.99, 12.345]) {
      expect(formatFreeDeliveryFrom(from)).toMatch(constraint);
    }
    expect(formatFreeDeliveryFrom(12.345)).toBe('12.35');
    expect(() => formatFreeDeliveryFrom(-1)).toThrow();
    expect(() => formatFreeDeliveryFrom(10000)).toThrow();
    expect(() => formatFreeDeliveryFrom(Number.NaN)).toThrow();
  });

  it('matches the constraint and helper in the migration', () => {
    const dir = path.resolve(process.cwd(), 'supabase/migrations');
    const file = fs.readdirSync(dir).find(f => f.endsWith('_lebanon_free_delivery.sql'))!;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    expect(sql).toContain(String.raw`value ~ '^(off|(0|[1-9][0-9]{0,3})(\.[0-9]{1,2})?)$'`);
    expect(sql).toContain("'lebanon_free_delivery_from_usd', '50'");
    expect(sql).toContain('bool_and(coalesce(c.free_delivery_lebanon, false))');
    expect(sql).toContain('elsif private.lebanon_free_delivery_applies(v_subtotal, v_item_rows) then v_delivery:=0;');
    expect(sql).toContain('revoke all on function private.lebanon_free_delivery_applies(numeric, jsonb) from public, anon, authenticated;');
  });
});
