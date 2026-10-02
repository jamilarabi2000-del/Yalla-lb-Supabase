// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import fs from 'node:fs';
import path from 'node:path';

// The words on the three Account tabs, and which of them are shown, belong to
// the CMS. They used to be written into the page after it had been drawn: the
// controller replaced the text of each button and hid buttons with inline
// styles. That overwrote the "Sign In" label a signed-out visitor is meant to
// see, made the tab wider than the scrolling it had been given (so on a 390 px
// phone the sign-in tab sat off-screen), and in Arabic fell back to the English
// text of the same label. AccountView now draws them itself.
const shop: Record<string, any> = {};
vi.mock('../src/context/ShopContext', () => ({ useShop: () => shop }));
vi.mock('../src/components/ui/SearchableSelect', () => ({
  SearchableSelect: ({ value, onChange, children }: any) => <select value={value} onChange={onChange}>{children}</select>,
}));
vi.mock('../src/components/EmailPasswordSignIn', () => ({
  EmailPasswordSignIn: (props: any) => <div data-testid={`email-${props.purpose}`} />,
}));
vi.mock('../src/components/AccountSupportCard', () => ({
  AccountSupportCard: () => <div data-testid="support-card" />,
}));

const { AccountViewController } = await import('../src/components/AccountViewController');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const read = (f: string) => fs.readFileSync(path.resolve(process.cwd(), f), 'utf8');

const signedIn = { uid: 'u1', email: 'rima@example.com', emailVerified: true, displayName: 'Rima' };
const profile = { name: 'Rima Saad', firstName: 'Rima', lastName: 'Saad', phone: '+961 70 123 456', email: 'rima@example.com', defaultGovernorate: 'beirut', defaultCity: 'Beirut', defaultAddress: 'Hamra', defaultBuilding: 'Bldg 4', defaultNotes: '' };
// What a fresh store ships with (src/data/cmsContent.ts)
const CMS_LABELS = {
  ordersTabLabel: 'Order History & Tracking', ordersTabLabelArabic: 'سجل الطلبات والتتبع',
  wishlistTabLabel: 'Saved Wishlist', wishlistTabLabelArabic: 'قائمة المفضلة',
  profileTabLabel: 'Profile & Delivery Details', profileTabLabelArabic: 'البيانات الشخصية وعنوان التوصيل',
};

let host: HTMLDivElement;
let root: Root;
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const render = async () => { await act(async () => { root.render(<AccountViewController />); }); await flush(); };
const $ = <T extends HTMLElement>(sel: string) => host.querySelector(sel) as T | null;
const label = (tab: string) => $(`#tab-${tab} > span:first-of-type`)?.textContent;
const isActive = (tab: string) => $(`#tab-${tab}`)!.className.includes('bg-[#171717]');
const click = (el: HTMLElement | null | undefined) => act(async () => { el!.click(); });
const configure = (accountPage: Record<string, unknown>, visibility: Record<string, boolean> = {}) => {
  shop.siteContent = { accountPage, visibility, customBlocks: [] };
};

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  (Element.prototype as any).scrollIntoView = () => {};
  for (const key of Object.keys(shop)) delete shop[key];
  Object.assign(shop, {
    language: 'en', authReady: true, firebaseUser: signedIn, user: { ...profile },
    orders: [], wishlist: [], products: [], formatPrice: (n: number) => `$${n}`, setActiveTab: vi.fn(), goBack: vi.fn(), t: (k: string) => k,
    siteContentReady: true,
    updateUser: vi.fn(async () => {}), checkPhoneUniqueness: vi.fn(async () => ({ available: true })), showToast: vi.fn(), removeFromWishlist: vi.fn(),
    isSellerUser: false, signInWithGoogle: vi.fn(), signInWithApple: vi.fn(), signOutUser: vi.fn(), resendEmailVerification: vi.fn(),
    isVisualEditMode: false, isAdminUnlocked: false,
  });
  configure({ ...CMS_LABELS });
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = '';
  delete (Element.prototype as any).scrollIntoView;
});

describe('the words on the tabs', () => {
  it('come from the CMS, in the page language, and follow a language change without a reload', async () => {
    await render();
    expect([label('orders'), label('wishlist'), label('profile')]).toEqual(['Order History & Tracking', 'Saved Wishlist', 'Profile & Delivery Details']);
    shop.language = 'ar';
    await render();
    expect([label('orders'), label('wishlist'), label('profile')]).toEqual(['سجل الطلبات والتتبع', 'قائمة المفضلة', 'البيانات الشخصية وعنوان التوصيل']);
  });

  it('a label the owner changed shows as written', async () => {
    configure({ ...CMS_LABELS, ordersTabLabel: 'My purchases', wishlistTabLabelArabic: 'مفضلتي' });
    await render();
    expect(label('orders')).toBe('My purchases');
    shop.language = 'ar';
    await render();
    expect(label('wishlist')).toBe('مفضلتي');
  });

  it('in Arabic, an empty Arabic label gives the built-in Arabic, never the English text of that label', async () => {
    configure({ ordersTabLabel: 'Order History & Tracking', wishlistTabLabel: 'Saved Wishlist', profileTabLabel: 'Profile & Delivery Details' });
    shop.language = 'ar';
    await render();
    expect([label('orders'), label('wishlist'), label('profile')]).toEqual(['سجل الطلبات', 'المفضلة والمحفوظات', 'تفاصيل الحساب']);
    expect($('#tab-orders')!.parentElement!.textContent).not.toMatch(/[A-Za-z]/);
  });

  it('in English, an empty label gives the built-in English', async () => {
    configure({});
    await render();
    expect([label('orders'), label('wishlist'), label('profile')]).toEqual(['My Orders', 'Saved Favorites', 'Profile']);
  });

  it('settings saved before these labels existed still give all three tabs, with the built-in words', async () => {
    shop.siteContent = { customBlocks: [] };
    await render();
    expect([label('orders'), label('wishlist'), label('profile')]).toEqual(['My Orders', 'Saved Favorites', 'Profile']);
    expect($('[data-testid="support-card"]')).not.toBeNull();
  });
});

describe('a visitor who is not signed in', () => {
  it('sees the tab that holds the sign-in form called "Sign In", whatever the CMS calls the profile tab', async () => {
    shop.firebaseUser = null;
    await render();
    expect(label('profile')).toBe('Sign In');
    expect(isActive('profile')).toBe(true);
    shop.language = 'ar';
    await render();
    expect(label('profile')).toBe('تسجيل الدخول');
  });

  it('the other two tabs still carry the CMS words', async () => {
    shop.firebaseUser = null;
    await render();
    expect([label('orders'), label('wishlist')]).toEqual(['Order History & Tracking', 'Saved Wishlist']);
  });
});

describe('a tab the CMS switches off', () => {
  it('is not drawn, and the first tab that is shown opens in its place', async () => {
    configure({ ...CMS_LABELS }, { accountOrders: false });
    await render();
    expect($('#tab-orders')).toBeNull();
    expect($('#tab-wishlist')).not.toBeNull();
    expect(isActive('wishlist')).toBe(true);
    configure({ ...CMS_LABELS }, { accountOrders: false, accountWishlist: false });
    await render();
    expect($('#tab-wishlist')).toBeNull();
    expect(isActive('profile')).toBe(true);
  });

  it('a switch made while the visitor is on that tab moves them to one that is shown', async () => {
    await render();
    await click($('#tab-profile'));
    expect(isActive('profile')).toBe(true);
    configure({ ...CMS_LABELS }, { accountProfile: false });
    await render();
    expect($('#tab-profile')).toBeNull();
    expect(isActive('orders')).toBe(true);
    configure({ ...CMS_LABELS }, {});
    await render();
    expect($('#tab-profile')).not.toBeNull();
  });

  it('a signed-out visitor whose sign-in tab is switched off is offered the first tab that is shown', async () => {
    shop.firebaseUser = null;
    configure({ ...CMS_LABELS }, { accountProfile: false });
    await render();
    expect($('#tab-profile')).toBeNull();
    expect(isActive('orders')).toBe(true);
    expect($('#account-orders-signin-hint')).not.toBeNull();
  });

  it('is left out of the page itself, not hidden with a style the next render could undo', async () => {
    configure({ ...CMS_LABELS }, { accountWishlist: false });
    await render();
    expect($('#tab-wishlist')).toBeNull();
    for (const tab of ['orders', 'profile']) {
      const button = $(`#tab-${tab}`)!;
      expect(button.getAttribute('style'), tab).toBeNull();
      expect(button.hasAttribute('aria-hidden'), tab).toBe(false);
      expect(button.hasAttribute('data-cms-visibility-managed'), tab).toBe(false);
      expect(button.tabIndex, tab).toBe(0);
    }
  });
});

describe('the controller', () => {
  it('does not reach into the page to change what React drew', () => {
    const source = read('src/components/AccountViewController.tsx');
    expect(source).not.toMatch(/document\.|querySelector|getElementById|\.textContent\s*=|\.style\.|\.dataset|\.setAttribute|\.click\(\)|useEffect/);
    // it hands the tab settings to the page instead
    expect(source).toContain('<AccountView tabs={tabs} />');
  });

  it('still shows the support card under the page', async () => {
    await render();
    expect($('[data-testid="support-card"]')).not.toBeNull();
  });
});
