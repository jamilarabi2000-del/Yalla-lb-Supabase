// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// On a 390 px phone the Account page opened on an empty "My Orders" list; the
// sign-in form lives on the third tab, off-screen in the tab row, so a visitor
// who was not signed in saw no way to sign in or sign up. A guest now lands on
// the sign-in form, the tab that holds it is called "Sign In" and is scrolled
// into view, and the orders tab offers the way in. The page waits for the first
// look for a saved sign-in, so a signed-in visitor never sees the form flash.
// The sign-up and profile forms are in Arabic, labelled, and autofill.
const shop: Record<string, any> = {};
vi.mock('../src/context/ShopContext', () => ({ useShop: () => shop }));
vi.mock('../src/components/ui/SearchableSelect', () => ({
  SearchableSelect: ({ value, onChange, children }: any) => <select value={value} onChange={onChange}>{children}</select>,
}));
vi.mock('../src/components/EmailPasswordSignIn', () => ({
  EmailPasswordSignIn: (props: any) => <div data-testid={`email-${props.purpose}`} />,
}));

const { AccountView } = await import('../src/components/AccountView');
const { ACCOUNT_SIGNIN_EVENT } = await import('../src/lib/accountSignIn');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const signedIn = { uid: 'u1', email: 'rima@example.com', emailVerified: true, displayName: 'Rima' };
const profile = { name: 'Rima Saad', firstName: 'Rima', lastName: 'Saad', phone: '+961 70 123 456', email: 'rima@example.com', defaultGovernorate: 'beirut', defaultCity: 'Beirut', defaultAddress: 'Hamra', defaultBuilding: 'Bldg 4', defaultNotes: '' };

let host: HTMLDivElement;
let root: Root;
let scrolled: string[];
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const render = async () => { await act(async () => { root.render(<AccountView />); }); await flush(); };
const $ = <T extends HTMLElement>(sel: string) => host.querySelector(sel) as T | null;
const click = (el: HTMLElement | null | undefined) => act(async () => { el!.click(); });
const type = (sel: string, value: string) => act(async () => {
  const input = $<HTMLInputElement>(sel)!;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
const isActive = (tab: string) => $(`#tab-${tab}`)!.className.includes('bg-[#171717]');
const buttonWithText = (text: string) => [...host.querySelectorAll('button')].find(b => b.textContent?.trim() === text) as HTMLButtonElement | undefined;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  scrolled = [];
  (Element.prototype as any).scrollIntoView = function (this: Element) { scrolled.push(this.id); };
  for (const key of Object.keys(shop)) delete shop[key];
  Object.assign(shop, {
    language: 'en', authReady: true, firebaseUser: null, user: { ...profile, name: '', firstName: '', lastName: '', phone: '', email: '', defaultCity: '', defaultAddress: '', defaultBuilding: '' },
    orders: [], wishlist: [], products: [], formatPrice: (n: number) => `$${n}`, setActiveTab: vi.fn(), goBack: vi.fn(), t: (k: string) => k,
    siteContent: { visibility: {}, accountPage: {}, customBlocks: [] }, siteContentReady: true,
    updateUser: vi.fn(async () => {}), checkPhoneUniqueness: vi.fn(async () => ({ available: true })), showToast: vi.fn(), removeFromWishlist: vi.fn(),
    isSellerUser: false, signInWithGoogle: vi.fn(), signInWithApple: vi.fn(), signOutUser: vi.fn(), resendEmailVerification: vi.fn(),
    isVisualEditMode: false, isAdminUnlocked: false,
  });
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = '';
  delete (Element.prototype as any).scrollIntoView;
});

describe('a visitor who is not signed in', () => {
  it('lands on the sign-in form, not on an empty order list', async () => {
    await render();
    expect(isActive('profile')).toBe(true);
    expect(isActive('orders')).toBe(false);
    expect(host.textContent).toContain('Welcome Back');
    expect($('[data-testid="email-signin"]')).not.toBeNull();
    expect($('#account-orders-signin-hint')).toBeNull();
  });

  it('sees the tab that holds the form called "Sign In" (a signed-in visitor sees "Profile")', async () => {
    await render();
    expect($('#tab-profile')!.textContent).toBe('Sign In');
    shop.firebaseUser = signedIn; shop.user = { ...profile };
    await render();
    expect($('#tab-profile')!.textContent).toBe('Profile');
  });

  it('has that tab scrolled into view in the tab row', async () => {
    await render();
    expect(scrolled).toContain('tab-profile');
  });

  it('the page is in Arabic when the language is', async () => {
    shop.language = 'ar';
    await render();
    expect($('#tab-profile')!.textContent).toBe('تسجيل الدخول');
    expect(host.textContent).toContain('أهلاً بعودتك');
    expect(host.textContent).toContain('أو عبر البريد الإلكتروني');
    expect(host.textContent).toContain('سجّل الدخول ببريدك الإلكتروني وكلمة المرور، ثم نرسل إليك رمزاً.');
  });

  it('is offered the way in from the orders tab', async () => {
    await render();
    await click($('#tab-orders'));
    expect(isActive('orders')).toBe(true);
    expect($('#account-orders-signin-hint')!.textContent).toContain('Sign in to see your orders');
    await click(buttonWithText('Sign in or create an account'));
    expect(isActive('profile')).toBe(true);
    expect($('#account-orders-signin-hint')).toBeNull();
  });

  it('the hint is in Arabic too', async () => {
    shop.language = 'ar';
    await render();
    await click($('#tab-orders'));
    expect($('#account-orders-signin-hint')!.textContent).toContain('سجّل الدخول لرؤية طلباتك');
    expect(buttonWithText('تسجيل الدخول أو إنشاء حساب')).toBeDefined();
  });

  it('keeps the tab they chose when the sign-in check finishes afterwards', async () => {
    shop.authReady = false;
    await render();
    await click($('#tab-wishlist'));
    shop.authReady = true;
    await render();
    expect(isActive('wishlist')).toBe(true);
  });

  it('is taken to the form by a Seller Portal link, as before', async () => {
    await render();
    await click($('#tab-wishlist'));
    expect(isActive('wishlist')).toBe(true);
    await act(async () => { window.dispatchEvent(new Event(ACCOUNT_SIGNIN_EVENT)); });
    expect(isActive('profile')).toBe(true);
  });
});

describe('while the page is still looking for a saved sign-in', () => {
  it('shows neither the sign-in form nor the orders, so nothing flashes', async () => {
    shop.authReady = false;
    await render();
    expect($('[data-testid="email-signin"]')).toBeNull();
    expect($('#account-orders-signin-hint')).toBeNull();
    expect(host.textContent).not.toContain('Welcome Back');
    expect(isActive('profile')).toBe(false);
    expect(isActive('orders')).toBe(false);
  });

  it('then shows the signed-in visitor their orders, never the sign-in form', async () => {
    shop.authReady = false;
    shop.firebaseUser = signedIn; shop.user = { ...profile };
    await render();
    expect(host.textContent).not.toContain('Welcome Back');
    shop.authReady = true;
    await render();
    expect(isActive('orders')).toBe(true);
    expect(host.textContent).not.toContain('Welcome Back');
    expect(host.textContent).toContain('No orders found.');
  });
});

describe('the sign-up form on this page', () => {
  const openSignUp = async () => { await render(); await click(buttonWithText(shop.language === 'ar' ? 'إنشاء حساب' : 'Sign Up')); };

  it('is in Arabic, with its labels tied to their fields and autofill hints', async () => {
    shop.language = 'ar';
    await openSignUp();
    const expected: Record<string, [string, string]> = {
      'account-signup-first-name': ['الاسم الأول (مطلوب)', 'given-name'],
      'account-signup-last-name': ['اسم العائلة (مطلوب)', 'family-name'],
      'account-signup-phone': ['الهاتف (واتساب) *', 'tel-national'],
      'account-signup-city': ['المدينة / المنطقة *', 'address-level2'],
      'account-signup-street': ['الشارع / نقطة علام معروفة *', 'address-line1'],
      'account-signup-building': ['المبنى والطابق والشقة *', 'address-line2'],
      'account-signup-notes': ['ملاحظات إضافية للتوصيل (اختياري)', 'off'],
    };
    for (const [id, [label, token]] of Object.entries(expected)) {
      const input = $<HTMLInputElement>(`#${id}`)!;
      expect(input, id).not.toBeNull();
      expect(input.labels?.[0]?.textContent, id).toBe(label);
      expect(input.getAttribute('autocomplete'), id).toBe(token);
    }
    expect($<HTMLInputElement>('#account-signup-first-name')!.placeholder).toBe('مثال: وليد');
  });

  it('is English in English, with the same labels as before', async () => {
    await openSignUp();
    expect($<HTMLInputElement>('#account-signup-first-name')!.labels![0].textContent).toBe('First Name (Required)');
    expect($<HTMLInputElement>('#account-signup-last-name')!.labels![0].textContent).toBe('Family Name (Required)');
    expect($<HTMLInputElement>('#account-signup-first-name')!.placeholder).toBe('John');
    expect(host.textContent).toContain('Create Your Account');
  });

  it('keeps every digit of a pasted phone number', async () => {
    await openSignUp();
    for (const pasted of ['+961 70 123 456', '00961 70123456', '070 123 456']) {
      await type('#account-signup-phone', pasted);
      expect($<HTMLInputElement>('#account-signup-phone')!.value, pasted).toBe('70123456');
    }
    expect($('#account-signup-phone')!.hasAttribute('maxlength')).toBe(false);
  });
});

describe('the profile form of a signed-in visitor', () => {
  const openProfile = async () => {
    shop.firebaseUser = signedIn; shop.user = { ...profile };
    await render();
    await click($('#tab-profile'));
  };

  it('is in Arabic', async () => {
    shop.language = 'ar';
    await openProfile();
    for (const text of ['المعلومات الشخصية', 'أدِر ملفك الشخصي وبيانات التوصيل الافتراضية', 'حفظ بيانات الملف الشخصي']) expect(host.textContent, text).toContain(text);
    expect($<HTMLInputElement>('#profile-first-name-input')!.labels![0].textContent).toBe('الاسم الأول (مطلوب)');
    expect($<HTMLInputElement>('#profile-email-input')!.labels![0].textContent).toBe('البريد الإلكتروني *');
    expect($<HTMLInputElement>('#profile-phone-input')!.labels![0].textContent).toBe('الهاتف (واتساب) *');
  });

  it('every field is labelled and says what it is for autofill', async () => {
    await openProfile();
    const tokens: Record<string, string> = {
      'profile-first-name-input': 'given-name', 'profile-last-name-input': 'family-name', 'profile-email-input': 'email', 'profile-phone-input': 'tel-national',
      'profile-city-input': 'address-level2', 'profile-street-input': 'address-line1', 'profile-building-input': 'address-line2', 'profile-notes-input': 'off',
    };
    for (const [id, token] of Object.entries(tokens)) {
      const input = $<HTMLInputElement>(`#${id}`)!;
      expect(input.labels?.length, id).toBe(1);
      expect(input.getAttribute('autocomplete'), id).toBe(token);
    }
    expect($('#profile-email-input')!.getAttribute('dir')).toBe('ltr');
  });

  it('keeps every digit of a pasted phone number here too', async () => {
    await openProfile();
    await type('#profile-phone-input', '+961 76 555 444');
    expect($<HTMLInputElement>('#profile-phone-input')!.value).toBe('76555444');
    expect($('#profile-phone-input')!.hasAttribute('maxlength')).toBe(false);
  });

  it('says in the page language that a name is missing, and saves nothing', async () => {
    const submit = () => act(async () => { $<HTMLInputElement>('#profile-first-name-input')!.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    shop.language = 'ar';
    await openProfile();
    await type('#profile-first-name-input', '');
    await submit();
    expect(shop.showToast).toHaveBeenCalledWith('الاسم الأول واسم العائلة مطلوبان', 'warning');
    expect(shop.updateUser).not.toHaveBeenCalled();
    shop.showToast.mockClear();
    shop.language = 'en';
    await render();
    await type('#profile-first-name-input', '');
    await submit();
    expect(shop.showToast).toHaveBeenCalledWith('First name and last name are required', 'warning');
  });

  it('says in the page language when saving fails and the server gave no reason', async () => {
    shop.language = 'ar';
    shop.updateUser = vi.fn(async () => { throw new Error(''); });
    await openProfile();
    await act(async () => { $<HTMLInputElement>('#profile-first-name-input')!.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await flush();
    expect(shop.updateUser).toHaveBeenCalledTimes(1);
    expect(shop.showToast).toHaveBeenCalledWith('تعذر حفظ التغييرات على الملف الشخصي', 'warning');
  });
});
