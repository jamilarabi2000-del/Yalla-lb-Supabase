// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DEFAULT_SITE_CONTENT } from '../src/data/cmsContent';

// The shop context is large; these components read only a few fields of it.
const shop: Record<string, unknown> = {};
vi.mock('../src/context/ShopContext', () => ({ useShop: () => shop }));

const { Navbar } = await import('../src/components/Navbar');
const { takeAccountSignInRequest } = await import('../src/lib/accountSignIn');
const { Footer } = await import('../src/components/Footer');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
const setActiveTab = vi.fn();

const withSellerPortal = (sellerPortal: boolean | undefined) => {
  const visibility = { ...DEFAULT_SITE_CONTENT.visibility } as Record<string, unknown>;
  if (sellerPortal === undefined) delete visibility.sellerPortal;
  else visibility.sellerPortal = sellerPortal;
  Object.assign(shop, {
    activeTab: 'home', setActiveTab, cartCount: 0, setIsCartOpen: vi.fn(), wishlist: [],
    searchQuery: '', setSearchQuery: vi.fn(), logSearchQuery: vi.fn(), setSelectedCategory: vi.fn(),
    language: 'en', setLanguage: vi.fn(), t: (k: string) => k, isAdminUser: false, authUser: null,
    user: {}, categories: [], isVisualEditMode: false,
    siteContent: { ...DEFAULT_SITE_CONTENT, visibility },
  });
  act(() => root.render(<><Navbar /><Footer /></>));
  // The mobile menu holds the second link.
  act(() => { (host.querySelector('#mobile-menu-toggle-btn') as HTMLButtonElement).click(); });
};

const links = () => ['#nav-seller-btn', '#nav-mobile-seller-btn']
  .map(sel => host.querySelector(sel) as HTMLButtonElement | null);
const footerText = () => host.querySelector('footer')?.textContent ?? '';

beforeEach(() => {
  setActiveTab.mockClear();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = '';
});

describe('the Seller Portal link', () => {
  it('shows in the menu and mobile menu, and opens the Account sign-in form', () => {
    withSellerPortal(true);
    const signInRequests = vi.fn();
    window.addEventListener('yalla:account-signin', signInRequests);
    for (const link of links()) {
      expect(link).not.toBeNull();
      act(() => link!.click());
      // The Account page starts on its orders tab; the link asks for the form.
      expect(takeAccountSignInRequest()).toBe(true);
    }
    window.removeEventListener('yalla:account-signin', signInRequests);
    expect(signInRequests).toHaveBeenCalledTimes(2);
    expect(setActiveTab.mock.calls.map(c => c[0])).toEqual(['account', 'account']);
  });

  it('is not in the footer, even when the admin shows it', () => {
    withSellerPortal(true);
    expect(host.querySelector('footer')).not.toBeNull();
    expect(host.querySelector('#footer-seller-portal-btn')).toBeNull();
    expect(footerText()).not.toMatch(/Seller Portal|Seller & Merchant Portal/);
  });

  it('shows for sites saved before the switch existed', () => {
    withSellerPortal(undefined);
    expect(links().every(Boolean)).toBe(true);
  });

  it('disappears everywhere when the admin hides it', () => {
    withSellerPortal(false);
    expect(links()).toEqual([null, null]);
    expect(host.textContent).not.toMatch(/Seller Portal|Seller & Merchant Portal/);
  });
});
