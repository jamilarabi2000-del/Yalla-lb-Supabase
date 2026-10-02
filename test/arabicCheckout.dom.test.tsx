// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// The Arabic checkout showed the English CMS text (the *Arabic fields existed
// and were never read), the delivery form had labels not tied to their inputs,
// no autofill hints and no inline errors (a failed attempt left a 3.5 s toast),
// and a pasted "+961 70 123 456" in the sign-up phone box was cut to "96170".
const shop: Record<string, any> = {};
vi.mock('../src/context/ShopContext', () => ({ useShop: () => shop }));
vi.mock('../src/components/ui/SearchableSelect', () => ({
  SearchableSelect: ({ id, value, onChange, children }: any) => <select id={id} value={value} onChange={onChange}>{children}</select>,
}));
// The sign-in widget has its own tests; here it only lets the sign-up form's check run.
vi.mock('../src/components/EmailPasswordSignIn', () => ({
  EmailPasswordSignIn: (props: any) => <button data-testid={`submit-${props.purpose}`} onClick={() => { void props.collectSignupDetails?.(); }}>go</button>,
}));

const { CheckoutView } = await import('../src/components/CheckoutView');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CMS = {
  title: 'English title', titleArabic: 'عنوان عربي',
  subtitle: 'English subtitle', subtitleArabic: 'وصف عربي',
  shippingHeading: 'English shipping', shippingHeadingArabic: 'عنوان الشحن بالعربية',
  paymentHeading: 'English payment', paymentHeadingArabic: 'الدفع',
  summaryHeading: 'English summary', summaryHeadingArabic: 'ملخص بالعربية',
  orderButtonText: 'English order', orderButtonTextArabic: 'زر الطلب',
  guaranteeBadgeText: 'English guarantee', guaranteeBadgeTextArabic: 'ضمان عربي',
};
const VISIBLE = {
  checkoutSteps: true, checkoutAddressForm: true, checkoutDeliverySpeed: true, checkoutPaymentMethod: true,
  checkoutPaymentCOD: true, checkoutPaymentWish: true, checkoutOrderSummary: true, checkoutGuarantees: true,
};
const emptyProfile = { name: '', firstName: '', lastName: '', phone: '', email: '', defaultGovernorate: 'beirut', defaultCity: '', defaultAddress: '', defaultBuilding: '', defaultNotes: '' };

let host: HTMLDivElement;
let root: Root;
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const render = async () => { await act(async () => { root.render(<CheckoutView />); }); await flush(); };
const $ = <T extends HTMLElement>(sel: string) => host.querySelector(sel) as T | null;
const click = (el: HTMLElement | null) => act(async () => { el!.click(); });
const type = (sel: string, value: string) => act(async () => {
  const input = $<HTMLInputElement>(sel)!;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
});

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  for (const key of Object.keys(shop)) delete shop[key];
  Object.assign(shop, {
    language: 'ar',
    cart: [{ product: { id: 'p1', name: 'Zaatar', image: '', priceUSD: 12.5, category: 'c1' }, quantity: 1 }],
    cartTotalUSD: 12.5, discountUSD: 0, appliedCouponCode: '', applyCoupon: vi.fn(), removeCoupon: vi.fn(), appliedDiscountRules: [],
    formatPrice: (n: number) => `$${n.toFixed(2)}`, currency: 'USD', setActiveTab: vi.fn(), goBack: vi.fn(),
    placeOrder: vi.fn(async () => ({ id: 'o1', totalUSD: 12.5, items: [], shipping: {} })), showToast: vi.fn(), t: (k: string) => k,
    authUser: { uid: 'u1', email: '' }, isEmailVerified: true, user: { ...emptyProfile }, updateUser: vi.fn(async () => {}),
    checkPhoneUniqueness: vi.fn(async () => ({ available: true })), signInWithGoogle: vi.fn(), signInWithApple: vi.fn(), signOutUser: vi.fn(),
    siteContent: { visibility: VISIBLE, checkoutPage: CMS, accountPage: {}, customBlocks: [] }, siteContentReady: true,
    isVisualEditMode: false, isAdminUnlocked: false, regions: [], categories: [], freeDeliveryFromUSD: null,
  });
  localStorage.clear();
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = '';
});

describe('the Arabic checkout shows Arabic', () => {
  it('the administrator\'s Arabic text, never the English', async () => {
    await render();
    const text = host.textContent!;
    for (const arabic of ['عنوان عربي', 'وصف عربي', 'عنوان الشحن بالعربية', 'ملخص بالعربية', 'ضمان عربي']) expect(text, arabic).toContain(arabic);
    // the amount is the basket plus delivery, so only its shape is fixed here
    expect($('#place-order-btn')!.textContent).toMatch(/^زر الطلب \(\$\d+\.\d\d\)$/);
    for (const english of ['English title', 'English subtitle', 'English shipping', 'English summary', 'English guarantee', 'English order']) expect(text, english).not.toContain(english);
  });

  it('the built-in Arabic when the Arabic text was cleared, not the English', async () => {
    shop.siteContent.checkoutPage = { ...CMS, titleArabic: '', subtitleArabic: '', shippingHeadingArabic: '', summaryHeadingArabic: '', orderButtonTextArabic: '', guaranteeBadgeTextArabic: '' };
    await render();
    const text = host.textContent!;
    expect(text).toContain('إتمام التسوية والطلب');
    expect(text).toContain('بيانات المستلم والعنوان في لبنان');
    expect(text).toContain('ملخص الطلب');
    expect(text).toContain('100% من نقابات الحرفيين اللبنانيين الأصيلة');
    expect($('#place-order-btn')!.textContent).toMatch(/^تأكيد الطلب اللبناني \(\$\d+\.\d\d\)$/);
    expect(text).not.toMatch(/English/);
  });

  it('the English text in English, as before', async () => {
    shop.language = 'en';
    await render();
    const text = host.textContent!;
    for (const english of ['English title', 'English subtitle', 'English shipping', 'English summary', 'English guarantee']) expect(text, english).toContain(english);
    expect($('#place-order-btn')!.textContent).toMatch(/^English order \(\$\d+\.\d\d\)$/);
    expect(text).not.toContain('عنوان عربي');
  });

  it('the item count uses the right Arabic form', async () => {
    await render();
    expect(host.textContent).toContain('منتج واحد');
    shop.cart = [{ ...shop.cart[0], quantity: 1 }, { product: { id: 'p2', name: 'Honey', image: '', priceUSD: 5, category: 'c1' }, quantity: 1 }];
    await render();
    expect(host.textContent).toContain('منتجان');
    expect(host.textContent).not.toContain('1 منتجات');
  });

  it('example texts and the trust line are in Arabic too', async () => {
    await render();
    expect($<HTMLInputElement>('#checkout-first-name-input')!.placeholder).toBe('مثال: وليد');
    expect($<HTMLInputElement>('#checkout-city-input')!.placeholder).toBe('مثال: الأشرفية، بيروت');
    expect($<HTMLInputElement>('#checkout-street-input')!.placeholder).toBe('مثال: شارع غورو، بجانب مخبز بول');
    expect(host.textContent).toContain('تأكيد عبر واتساب من مندوب التوصيل قبل التسليم');
    expect(host.textContent).not.toContain('Dedicated courier');
  });

  it('no faux-italic Arabic in the heading', async () => {
    shop.siteContent.checkoutPage = { ...CMS, titleArabic: '' };
    await render();
    expect($('h1 span')!.className).not.toContain('italic');
  });
});

describe('the delivery form can be understood and filled by the browser and by assistive technology', () => {
  const FIELDS: Record<string, string> = {
    'checkout-first-name-input': 'given-name', 'checkout-last-name-input': 'family-name', 'checkout-phone-input': 'tel',
    'checkout-email-input': 'email', 'checkout-city-input': 'address-level2', 'checkout-street-input': 'address-line1',
    'checkout-building-input': 'address-line2', 'checkout-floor-apartment-input': 'address-line3', 'checkout-notes-input': 'off',
  };

  it('every field has a label tied to it and says what it is for autofill', async () => {
    await render();
    for (const [id, token] of Object.entries(FIELDS)) {
      const input = $<HTMLInputElement>(`#${id}`)!;
      expect(input, id).not.toBeNull();
      expect(input.labels?.length, `${id} has a label`).toBe(1);
      expect(input.getAttribute('autocomplete'), id).toBe(token);
    }
    expect($<HTMLSelectElement>('#checkout-governorate-select')!.labels?.length).toBe(1);
  });

  it('the required fields say so to assistive technology', async () => {
    await render();
    for (const id of ['checkout-first-name-input', 'checkout-phone-input', 'checkout-email-input', 'checkout-city-input', 'checkout-street-input']) {
      expect($(`#${id}`)!.getAttribute('aria-required'), id).toBe('true');
    }
  });

  it('phone and email are typed left to right and bring up the right keyboard', async () => {
    await render();
    expect($('#checkout-phone-input')!.getAttribute('dir')).toBe('ltr');
    expect($('#checkout-phone-input')!.getAttribute('inputmode')).toBe('tel');
    expect($('#checkout-email-input')!.getAttribute('dir')).toBe('ltr');
    expect($('#checkout-email-input')!.getAttribute('inputmode')).toBe('email');
  });

  it('the city label no longer repeats "Governorate"', async () => {
    await render();
    const city = $<HTMLInputElement>('#checkout-city-input')!.labels![0].textContent;
    expect(city).toBe('المدينة / المنطقة *');
    shop.language = 'en';
    await render();
    expect($<HTMLInputElement>('#checkout-city-input')!.labels![0].textContent).toBe('City / Area *');
  });
});

describe('placing an order with details missing', () => {
  const placeOrder = async () => { await click($('#place-order-btn')); await flush(); };

  it('says what is wrong beside each field, not only in a passing toast', async () => {
    await render();
    await placeOrder();
    expect(shop.placeOrder).not.toHaveBeenCalled();
    expect(shop.showToast).toHaveBeenCalledWith(expect.stringContaining('يرجى إكمال بيانات التوصيل'), 'warning');
    const expected: Record<string, string> = {
      'checkout-first-name-input': 'أدخل الاسم الأول', 'checkout-phone-input': 'أدخل رقم هاتفك', 'checkout-email-input': 'أدخل بريدك الإلكتروني',
      'checkout-city-input': 'أدخل مدينتك أو منطقتك', 'checkout-street-input': 'أدخل الشارع أو نقطة دلالة قريبة',
    };
    for (const [id, message] of Object.entries(expected)) {
      const input = $(`#${id}`)!;
      expect(input.getAttribute('aria-invalid'), id).toBe('true');
      expect(input.getAttribute('aria-describedby'), id).toBe(`${id}-error`);
      expect($(`#${id}-error`)!.textContent, id).toBe(message);
    }
    // fields that are fine say nothing
    expect($('#checkout-building-input')!.getAttribute('aria-invalid')).toBeNull();
  });

  it('puts the cursor in the first field that needs attention', async () => {
    await render();
    await placeOrder();
    expect(document.activeElement?.id).toBe('checkout-first-name-input');
    await type('#checkout-first-name-input', 'Rima');
    await placeOrder();
    expect(document.activeElement?.id).toBe('checkout-phone-input');
  });

  it('the message goes away as soon as the field is corrected', async () => {
    await render();
    await placeOrder();
    expect($('#checkout-city-input-error')).not.toBeNull();
    await type('#checkout-city-input', 'Beirut');
    expect($('#checkout-city-input-error')).toBeNull();
    expect($('#checkout-city-input')!.getAttribute('aria-invalid')).toBeNull();
    expect($('#checkout-street-input-error')).not.toBeNull();   // the others stay until fixed
  });

  it('in English the messages are English', async () => {
    shop.language = 'en';
    await render();
    await placeOrder();
    expect($('#checkout-first-name-input-error')!.textContent).toBe('Enter your first name');
    expect($('#checkout-street-input-error')!.textContent).toBe('Enter your street or a nearby landmark');
  });

  it('with everything filled in the order is placed and no error is shown', async () => {
    shop.user = { ...emptyProfile, firstName: 'Rima', lastName: 'Saad', phone: '+961 70 123 456', email: 'rima@example.com', defaultCity: 'Beirut', defaultAddress: 'Hamra Street' };
    shop.authUser = { uid: 'u1', email: 'rima@example.com' };
    await render();
    await placeOrder();
    expect(shop.placeOrder).toHaveBeenCalledTimes(1);
    expect(host.querySelector('[id$="-error"]')).toBeNull();
  });
});

describe('signing up from the checkout', () => {
  const openSignUp = async () => { shop.authUser = null; await render(); await click($('#checkout-switch-signup-btn')); };
  const submitSignUp = async () => { await click($('[data-testid="submit-signup"]')); await flush(); };

  it('a pasted phone number keeps all its digits', async () => {
    await openSignUp();
    for (const pasted of ['+961 70 123 456', '00961 70123456', '070 123 456', '70123456']) {
      await type('#checkout-signup-phone-input', pasted);
      expect($<HTMLInputElement>('#checkout-signup-phone-input')!.value, pasted).toBe('70123456');
    }
    expect($('#checkout-signup-phone-input')!.hasAttribute('maxlength')).toBe(false);
  });

  it('the sign-up fields are labelled and say what they are for autofill', async () => {
    await openSignUp();
    const fields: Record<string, string> = { 'checkout-signup-firstname-input': 'given-name', 'checkout-signup-lastname-input': 'family-name', 'checkout-signup-phone-input': 'tel-national' };
    for (const [id, token] of Object.entries(fields)) {
      const input = $<HTMLInputElement>(`#${id}`)!;
      expect(input.labels?.length, id).toBe(1);
      expect(input.getAttribute('autocomplete'), id).toBe(token);
      expect(input.getAttribute('aria-required'), id).toBe('true');
    }
  });

  it('missing names are shown beside the fields, and the first takes focus', async () => {
    await openSignUp();
    await submitSignUp();
    expect($('#checkout-signup-firstname-input-error')!.textContent).toBe('أدخل الاسم الأول');
    expect($('#checkout-signup-lastname-input-error')!.textContent).toBe('أدخل اسم العائلة');
    expect(document.activeElement?.id).toBe('checkout-signup-firstname-input');
    await type('#checkout-signup-firstname-input', 'Rima');
    expect($('#checkout-signup-firstname-input-error')).toBeNull();
    await submitSignUp();
    expect(document.activeElement?.id).toBe('checkout-signup-lastname-input');
  });

  it('a phone number that is too short is explained beside its field', async () => {
    await openSignUp();
    await type('#checkout-signup-firstname-input', 'Rima');
    await type('#checkout-signup-lastname-input', 'Saad');
    await type('#checkout-signup-phone-input', '7012');
    await submitSignUp();
    expect($('#checkout-signup-phone-input-error')!.textContent).toBe('أدخل رقم هاتفك اللبناني المؤلف من 8 أرقام');
    expect(document.activeElement?.id).toBe('checkout-signup-phone-input');
    expect(shop.checkPhoneUniqueness).not.toHaveBeenCalled();
  });

  it('a number already used by another account is explained beside its field too', async () => {
    shop.checkPhoneUniqueness = vi.fn(async () => ({ available: false, reason: 'هذا الرقم مسجل' }));
    await openSignUp();
    await type('#checkout-signup-firstname-input', 'Rima');
    await type('#checkout-signup-lastname-input', 'Saad');
    await type('#checkout-signup-phone-input', '70 123 456');
    await submitSignUp();
    expect(shop.checkPhoneUniqueness).toHaveBeenCalledWith('70123456');
    expect($('#checkout-signup-phone-input-error')!.textContent).toBe('هذا الرقم مسجل');
  });
});
