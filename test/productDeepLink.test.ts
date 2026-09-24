import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pendingDeepLinkProduct } from '../src/lib/productDeepLink';

// A product link opened before the catalogue loads resolves once it arrives
// -- and leaving a product page is never mistaken for that.

const soap = { id: '37982e66-bf42-4804-9502-9843571aab9f', name: 'Laurel Soap' };
const oil = { id: 'olive oil', name: 'Olive Oil' };
const at = (over: Partial<Parameters<typeof pendingDeepLinkProduct>[0]> = {}) => pendingDeepLinkProduct({
  pathname: `/product/${soap.id}`, activeTab: 'product_detail', selectedProductId: null,
  products: [soap, oil], notFound: false, ...over,
});

describe('pendingDeepLinkProduct', () => {
  it('opens the linked product once the catalogue has it', () => {
    expect(at()).toBe(soap);
    expect(at({ pathname: '/product/olive%20oil' })).toBe(oil);
  });

  it('leaves the user alone after they click away from a product page', () => {
    // The logo, Products and Checkout clear the product before the address
    // catches up; the page is no longer the product page.
    for (const tab of ['home', 'products', 'checkout', 'account', 'favorites', 'admin']) {
      expect(at({ activeTab: tab }), tab).toBeNull();
    }
  });

  it('does nothing while a product is already open', () => {
    expect(at({ selectedProductId: soap.id })).toBeNull();
    expect(at({ selectedProductId: oil.id })).toBeNull();
  });

  it('waits for the catalogue, and ignores other addresses and missing pages', () => {
    expect(at({ products: [] })).toBeNull();
    expect(at({ pathname: '/products' })).toBeNull();
    expect(at({ pathname: `/product/${soap.id}/reviews` })).toBeNull();
    expect(at({ pathname: '/product/%E0%A4%A' })).toBeNull();
    expect(at({ notFound: true })).toBeNull();
  });

  it('is what the app uses to resolve product links', () => {
    const app = fs.readFileSync(path.resolve(process.cwd(), 'src/App.tsx'), 'utf8');
    const effect = app.slice(app.indexOf('Resolve a direct product deep link'), app.indexOf('Resolve a direct product deep link') + 900);
    expect(effect).toContain('pendingDeepLinkProduct({');
    expect(effect).toContain('activeTab,');
    // Marking the next address update as Back/Forward swallowed the user's
    // next navigation.
    expect(effect).not.toContain('isPopStateRef.current = true');
  });
});
