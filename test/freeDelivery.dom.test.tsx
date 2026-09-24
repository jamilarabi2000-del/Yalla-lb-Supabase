// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// Free delivery across Lebanon: the administrator's controls in Categories &
// Details, and what the cart tells a shopper. The shop context is large; these
// components read a few fields of it.
const shop: Record<string, unknown> = {};
vi.mock('../src/context/ShopContext', () => ({ useShop: () => shop }));

const { FreeDeliveryPanel } = await import('../src/components/admin/FreeDeliveryPanel');
const { CartDrawer } = await import('../src/components/CartDrawer');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = '';
  for (const key of Object.keys(shop)) delete shop[key];
});

const $ = <T extends HTMLElement>(sel: string) => host.querySelector(sel) as T | null;
const click = (sel: string) => act(() => { $(sel)!.click(); });

/** React tracks input values itself; set it the way a keystroke would. */
const type = (sel: string, value: string) => act(() => {
  const input = $<HTMLInputElement>(sel)!;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
});

describe('the shop-wide free delivery setting', () => {
  const renderPanel = (freeDeliveryFromUSD: number | null) => {
    const saveFreeDeliveryFrom = vi.fn(async () => {});
    Object.assign(shop, { freeDeliveryFromUSD, saveFreeDeliveryFrom, showToast: vi.fn() });
    act(() => root.render(<FreeDeliveryPanel />));
    return saveFreeDeliveryFrom;
  };

  it('shows the rule in force and saves nothing until it changes', () => {
    const save = renderPanel(50);
    expect($('#free-delivery-current')!.textContent).toContain('Orders in Lebanon from $50.00 ship free.');
    expect($<HTMLButtonElement>('#free-delivery-mode-from')!.getAttribute('aria-checked')).toBe('true');
    expect($<HTMLButtonElement>('#free-delivery-save')!.disabled).toBe(true);
    expect(save).not.toHaveBeenCalled();
  });

  it('makes every order ship free', async () => {
    const save = renderPanel(50);
    click('#free-delivery-mode-always');
    await act(async () => { $('#free-delivery-save')!.click(); });
    expect(save).toHaveBeenCalledWith(0);
  });

  it('turns the rule off', async () => {
    const save = renderPanel(0);
    click('#free-delivery-mode-off');
    await act(async () => { $('#free-delivery-save')!.click(); });
    expect(save).toHaveBeenCalledWith(null);
  });

  it('sets a new amount, and refuses one the database would refuse', async () => {
    const save = renderPanel(50);
    for (const bad of ['0', '-5', 'abc', '12.345', '10000']) {
      type('#free-delivery-amount', bad);
      expect($<HTMLButtonElement>('#free-delivery-save')!.disabled, bad).toBe(true);
      expect(host.querySelector('[role="alert"]'), bad).not.toBeNull();
    }
    type('#free-delivery-amount', '35.5');
    expect(host.querySelector('[role="alert"]')).toBeNull();
    await act(async () => { $('#free-delivery-save')!.click(); });
    expect(save).toHaveBeenCalledWith(35.5);
  });
});

describe('the cart', () => {
  const product = (priceUSD: number, category: string) => ({
    id: `p-${priceUSD}-${category}`, name: 'Item', priceUSD, category, image: '', stock: 10,
  });
  const renderCart = (freeDeliveryFromUSD: number | null, items: Array<{ priceUSD: number; category: string }>) => {
    const cart = items.map(i => ({ product: product(i.priceUSD, i.category), quantity: 1 }));
    Object.assign(shop, {
      cart, isCartOpen: true, setIsCartOpen: vi.fn(), updateQuantity: vi.fn(), removeFromCart: vi.fn(),
      clearCart: vi.fn(), cartTotalUSD: cart.reduce((s, i) => s + i.product.priceUSD, 0), discountUSD: 0,
      appliedCouponCode: null, applyCoupon: vi.fn(), removeCoupon: vi.fn(), appliedDiscountRules: [],
      formatPrice: (n: number) => `$${n.toFixed(2)}`, setActiveTab: vi.fn(), t: (k: string) => k, language: 'en',
      categories: [{ id: 'mouneh', freeDeliveryLebanon: true }, { id: 'soap', freeDeliveryLebanon: false }],
      freeDeliveryFromUSD,
    });
    act(() => root.render(<CartDrawer />));
    return $('#cart-free-delivery-progress')?.textContent ?? null;
  };

  it('counts down to the administrator\'s amount', () => {
    expect(renderCart(30, [{ priceUSD: 10, category: 'soap' }])).toContain('Add $20.00 for Free Delivery');
  });

  it('says so once the order ships free', () => {
    expect(renderCart(30, [{ priceUSD: 30, category: 'soap' }])).toContain('Free delivery across Lebanon unlocked!');
    expect(renderCart(0, [{ priceUSD: 1, category: 'soap' }])).toContain('Free delivery across Lebanon unlocked!');
  });

  it('counts a cart whose every item ships free by category', () => {
    expect(renderCart(null, [{ priceUSD: 5, category: 'mouneh' }])).toContain('Free delivery across Lebanon unlocked!');
    expect(renderCart(50, [{ priceUSD: 5, category: 'mouneh' }, { priceUSD: 5, category: 'soap' }]))
      .toContain('Add $40.00 for Free Delivery');
  });

  it('shows no countdown while the rule is off', () => {
    expect(renderCart(null, [{ priceUSD: 500, category: 'soap' }])).toBeNull();
  });
});
