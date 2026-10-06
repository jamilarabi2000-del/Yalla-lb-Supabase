// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import fs from 'node:fs';
import path from 'node:path';
import { planAdd, quantityInBasket, stockOf } from '../src/lib/cartQuantity';

// From Quick View a shopper could pick any quantity, 2 and then 3 of a product with 1 in stock, and the page said
// "Added 3 to your basket" whatever the basket really took. The stepper now stops at what can still be added, says
// why, and the page shows one message: the one the basket gives. The shop is a stand-in whose addToCart applies the
// real rules (src/lib/cartQuantity.ts); test/addToCart.dom.test.tsx runs the real shop provider.
const ctx = vi.hoisted(() => ({ shop: {} as any }));
vi.mock('../src/context/ShopContext', () => ({ useShop: () => ctx.shop }));
vi.mock('../src/components/ProductReviews', () => ({ ProductReviews: () => null }));
vi.mock('../src/components/ProductCard', () => ({ ProductCard: () => null }));

const { ProductModal } = await import('../src/components/ProductModal');
const { ProductDetailView } = await import('../src/components/ProductDetailView');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const make = (id: string, stock: number) => ({
  id, name: `Wild Zaatar ${id} (500 g)`, arabicName: `زعتر بري ${id}`, artisan: 'Seller: Mountain Farm', category: 'c1',
  priceUSD: 5, stock, image: '/p.jpg', description: 'Fresh', origin: 'Lebanon', images: [],
});

type Line = { product: ReturnType<typeof make>; quantity: number };
let host: HTMLDivElement;
let root: Root;
let shop: any;
let calls: { added: [any, number][]; closed: number; toasts: string[] };

const setUp = (opts: { stock: number; inBasket?: number; liveStock?: number; language?: 'en' | 'ar'; plan?: (stock: number, have: number, asked: number) => any }) => {
  const snapshot = make('p1', opts.stock);
  const live = make('p1', opts.liveStock ?? opts.stock);
  const cart: Line[] = (opts.inBasket ?? 0) > 0 ? [{ product: live, quantity: opts.inBasket! }] : [];
  calls = { added: [], closed: 0, toasts: [] };
  shop = {
    selectedProductForModal: snapshot,
    selectedProductDetail: snapshot,
    setSelectedProductForModal: (value: unknown) => { if (value === null) calls.closed += 1; },
    openProductDetail: vi.fn(),
    formatPrice: (n: number) => `$${n.toFixed(2)}`,
    addToCart: (product: any, quantity: number) => {
      calls.added.push([product, quantity]);
      return (opts.plan ?? planAdd)(stockOf(live), quantityInBasket(cart, product.id), quantity);
    },
    toggleWishlist: vi.fn(), isInWishlist: () => false,
    showToast: (message: string) => { calls.toasts.push(message); },
    products: [live], cart, categories: [], siteContent: undefined, goBack: vi.fn(),
    language: opts.language ?? 'en',
    t: (key: string) => (key === 'addToCart' ? 'Add to Basket' : key),
  };
  ctx.shop = shop;
};

const render = async (element: React.ReactElement) => { await act(async () => { root.render(element); }); };
const button = (label: string) => document.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement;
const press = async (el: Element | null) => { await act(async () => { (el as HTMLElement).click(); }); };
const cta = () => document.getElementById('modal-add-to-cart-btn') as HTMLButtonElement;
const note = () => document.getElementById('modal-stock-note')?.textContent ?? null;
const shown = () => button('Decrease quantity').nextElementSibling!.textContent;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = '';
  document.body.style.overflow = '';
  vi.restoreAllMocks();
});

describe('Quick View of a product with 1 in stock (the reported case)', () => {
  beforeEach(async () => { setUp({ stock: 1 }); await render(<ProductModal />); });

  it('does not let the quantity go past 1', async () => {
    expect(shown()).toBe('1');
    expect(button('Increase quantity').disabled).toBe(true);
    await press(button('Increase quantity'));
    await press(button('Increase quantity'));
    expect(shown()).toBe('1');
  });

  it('says how many are available', () => {
    expect(note()).toBe('Only 1 available');
    expect(button('Increase quantity').getAttribute('aria-describedby')).toBe('modal-stock-note');
  });

  it('adds the 1 and closes', async () => {
    await press(cta());
    expect(calls.added.map(([, quantity]) => quantity)).toEqual([1]);
    expect(calls.closed).toBe(1);
  });
});

describe('Quick View of a product with plenty in stock', () => {
  beforeEach(async () => { setUp({ stock: 10 }); await render(<ProductModal />); });

  it('lets the quantity go up to the stock and no further', async () => {
    for (let i = 0; i < 12; i++) await press(button('Increase quantity'));
    expect(shown()).toBe('10');
    expect(button('Increase quantity').disabled).toBe(true);
    expect(button('Decrease quantity').disabled).toBe(false);
  });

  it('adds exactly the quantity shown, and the price follows it', async () => {
    await press(button('Increase quantity'));
    await press(button('Increase quantity'));
    expect(shown()).toBe('3');
    expect(document.body.textContent).toContain('$15.00');
    await press(cta());
    expect(calls.added.map(([, quantity]) => quantity)).toEqual([3]);
    expect(calls.closed).toBe(1);
  });

  it('never goes below 1', async () => {
    expect(button('Decrease quantity').disabled).toBe(true);
    await press(button('Decrease quantity'));
    expect(shown()).toBe('1');
    await press(button('Increase quantity'));
    await press(button('Decrease quantity'));
    expect(shown()).toBe('1');
  });

  it('says how many are available once 10 or fewer are left', () => {
    expect(note()).toBe('Only 10 available');
  });

  it('says nothing about stock while more than 10 are left', async () => {
    setUp({ stock: 11 });
    await render(<ProductModal />);
    expect(note()).toBeNull();
    expect(button('Increase quantity').getAttribute('aria-describedby')).toBeNull();
  });
});

describe('Quick View when some are already in the basket', () => {
  it('stops at what is left, and says how many are in the basket', async () => {
    setUp({ stock: 10, inBasket: 4 });
    await render(<ProductModal />);
    expect(note()).toBe('4 already in your basket · 6 more available');
    for (let i = 0; i < 10; i++) await press(button('Increase quantity'));
    expect(shown()).toBe('6');
    await press(cta());
    expect(calls.added.map(([, quantity]) => quantity)).toEqual([6]);
  });

  it('when it is all in the basket: nothing to pick, nothing to add, and it says why', async () => {
    setUp({ stock: 1, inBasket: 1 });
    await render(<ProductModal />);
    expect(note()).toBe('All 1 in stock are already in your basket');
    expect(shown()).toBe('1');
    expect(button('Increase quantity').disabled).toBe(true);
    expect(button('Decrease quantity').disabled).toBe(true);
    expect(cta().disabled).toBe(true);
    await press(cta());
    expect(calls.added).toEqual([]);
    expect(calls.closed).toBe(0);
  });

  it('counts a basket that holds more than the stock (it dropped since) as full', async () => {
    setUp({ stock: 2, inBasket: 5 });
    await render(<ProductModal />);
    expect(cta().disabled).toBe(true);
    expect(note()).toBe('All 2 in stock are already in your basket');
  });
});

describe('Quick View of a product that is out of stock', () => {
  beforeEach(async () => { setUp({ stock: 0 }); await render(<ProductModal />); });

  it('has nothing to add, and no note about stock', () => {
    expect(cta().disabled).toBe(true);
    expect(note()).toBeNull();
    expect(document.body.textContent).toContain('Out of stock');
  });
});

describe('Quick View was opened with an older copy of the product', () => {
  it('follows the stock when it drops while Quick View is open', async () => {
    setUp({ stock: 10 });
    await render(<ProductModal />);
    for (let i = 0; i < 4; i++) await press(button('Increase quantity'));
    expect(shown()).toBe('5');
    shop.products = [make('p1', 3)];
    await render(<ProductModal />);
    expect(shown()).toBe('3');
    expect(document.body.textContent).toContain('$15.00');
    await press(cta());
    expect(calls.added.map(([, quantity]) => quantity)).toEqual([3]);
  });

  it('uses the stock in the product list: less than the copy says', async () => {
    setUp({ stock: 8, liveStock: 2 });
    await render(<ProductModal />);
    for (let i = 0; i < 6; i++) await press(button('Increase quantity'));
    expect(shown()).toBe('2');
    expect(note()).toBe('Only 2 available');
  });

  it('and when it has sold out since, cannot add and says out of stock', async () => {
    setUp({ stock: 8, liveStock: 0 });
    await render(<ProductModal />);
    expect(cta().disabled).toBe(true);
    expect(document.body.textContent).toContain('Out of stock');
  });
});

describe('after Add to Basket', () => {
  it('stays open when nothing went in, so the shopper can read why', async () => {
    setUp({ stock: 5, plan: () => ({ status: 'at-limit', stock: 5, added: 0, total: 5 }) });
    await render(<ProductModal />);
    await press(cta());
    expect(calls.added).toHaveLength(1);
    expect(calls.closed).toBe(0);
  });

  it('closes when fewer than asked went in (the basket says how many)', async () => {
    setUp({ stock: 5, plan: () => ({ status: 'limited', stock: 5, added: 1, total: 1 }) });
    await render(<ProductModal />);
    await press(button('Increase quantity'));
    await press(cta());
    expect(calls.closed).toBe(1);
  });

  it('adds no message of its own: the basket gives the one message', async () => {
    setUp({ stock: 10 });
    await render(<ProductModal />);
    await press(button('Increase quantity'));
    await press(cta());
    expect(calls.toasts).toEqual([]);
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/components/ProductModal.tsx'), 'utf8');
    expect(source).not.toMatch(/showToast/);
    expect(source).not.toMatch(/to your basket!/);
  });
});

describe('Quick View in Arabic', () => {
  it('names the stepper buttons and the stock in Arabic', async () => {
    setUp({ stock: 3, inBasket: 1, language: 'ar' });
    await render(<ProductModal />);
    expect(button('زيادة الكمية')).toBeTruthy();
    expect(button('تقليل الكمية')).toBeTruthy();
    expect(document.getElementById('modal-stock-note')?.textContent).toBe('1 في سلتك بالفعل · يمكنك إضافة 2 فقط');
  });
});

describe('the full product page', () => {
  const page = () => document.getElementById('detail-stock-note')?.textContent ?? null;
  const addButton = () => Array.from(document.querySelectorAll('button')).find(b => /Add to Cart/.test(b.textContent || '')) as HTMLButtonElement;
  const shownHere = () => button('Decrease quantity').nextElementSibling!.textContent;

  it('with 1 in stock: the quantity stays at 1, and adding gives the basket exactly that', async () => {
    setUp({ stock: 1 });
    await render(<ProductDetailView />);
    expect(button('Increase quantity').disabled).toBe(true);
    expect(document.body.textContent).toContain('In stock • 1 available');
    expect(page()).toBeNull();
    await press(addButton());
    expect(calls.added.map(([, quantity]) => quantity)).toEqual([1]);
  });

  it('with plenty: the quantity goes up to the stock; adding gives the basket that, and the page adds no message of its own', async () => {
    setUp({ stock: 4 });
    await render(<ProductDetailView />);
    for (let i = 0; i < 6; i++) await press(button('Increase quantity'));
    expect(shownHere()).toBe('4');
    await press(addButton());
    expect(calls.added.map(([, quantity]) => quantity)).toEqual([4]);
    expect(calls.toasts).toEqual([]);
  });

  it('with some in the basket: stops at what is left and says so', async () => {
    setUp({ stock: 10, inBasket: 4 });
    await render(<ProductDetailView />);
    expect(page()).toBe('4 already in your basket · 6 more available');
    for (let i = 0; i < 10; i++) await press(button('Increase quantity'));
    expect(shownHere()).toBe('6');
  });

  it('with all of it in the basket: cannot add, and says why', async () => {
    setUp({ stock: 1, inBasket: 1 });
    await render(<ProductDetailView />);
    expect(page()).toBe('All 1 in stock are already in your basket');
    expect(addButton().disabled).toBe(true);
    await press(addButton());
    expect(calls.added).toEqual([]);
  });

  it('goes back to 1 after something was added', async () => {
    setUp({ stock: 10 });
    await render(<ProductDetailView />);
    await press(button('Increase quantity'));
    await press(button('Increase quantity'));
    expect(shownHere()).toBe('3');
    await press(addButton());
    expect(shownHere()).toBe('1');
  });

  it('keeps the quantity when nothing went in', async () => {
    setUp({ stock: 10, plan: () => ({ status: 'at-limit', stock: 10, added: 0, total: 10 }) });
    await render(<ProductDetailView />);
    await press(button('Increase quantity'));
    await press(addButton());
    expect(shownHere()).toBe('2');
  });

  it('uses the stock in the product list, not the copy it was opened with', async () => {
    setUp({ stock: 9, liveStock: 2 });
    await render(<ProductDetailView />);
    expect(document.body.textContent).toContain('In stock • 2 available');
    for (let i = 0; i < 5; i++) await press(button('Increase quantity'));
    expect(shownHere()).toBe('2');
  });

  it('disables the minus button at 1 and enables it above 1', async () => {
    setUp({ stock: 4 });
    await render(<ProductDetailView />);
    expect(button('Decrease quantity').disabled).toBe(true);
    await press(button('Increase quantity'));
    expect(button('Decrease quantity').disabled).toBe(false);
    await press(button('Decrease quantity'));
    expect(shownHere()).toBe('1');
    expect(button('Decrease quantity').disabled).toBe(true);
  });

  it('follows the stock when it drops while the page is open', async () => {
    setUp({ stock: 10 });
    await render(<ProductDetailView />);
    for (let i = 0; i < 4; i++) await press(button('Increase quantity'));
    expect(shownHere()).toBe('5');
    shop.products = [make('p1', 3)];
    await render(<ProductDetailView />);
    expect(shownHere()).toBe('3');
    await press(addButton());
    expect(calls.added.map(([, quantity]) => quantity)).toEqual([3]);
  });

  it('names its stepper buttons in Arabic', async () => {
    setUp({ stock: 3, language: 'ar' });
    await render(<ProductDetailView />);
    expect(button('زيادة الكمية')).toBeTruthy();
    expect(button('تقليل الكمية')).toBeTruthy();
  });

  it('still adds through addToCartItem on a shop that has no addToCart, with its own message', async () => {
    setUp({ stock: 5 });
    const items: unknown[] = [];
    delete shop.addToCart;
    shop.addToCartItem = (item: unknown) => { items.push(item); };
    await render(<ProductDetailView />);
    await press(button('Increase quantity'));
    await press(addButton());
    expect(items).toHaveLength(1);
    expect((items[0] as { quantity: number }).quantity).toBe(2);
    expect(calls.toasts).toEqual(['Added to cart']);
  });
});
