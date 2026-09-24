// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { createRoot, type Root } from 'react-dom/client';

// Shoppers and sellers sign in with a code emailed each time: no password
// field anywhere they sign in, City / Region required on every account. The
// shop context is large; these components read a few fields of it.
const shop: Record<string, any> = {};
vi.mock('../src/context/ShopContext', () => ({ useShop: () => shop }));
const fetchProfile = vi.fn();
vi.mock('../src/services/supabaseUserDataService', () => ({ supabaseUserDataService: { fetchProfile: (...a: unknown[]) => fetchProfile(...a) } }));

const { EmailCodeSignIn } = await import('../src/components/EmailCodeSignIn');
const { CityRegionPrompt } = await import('../src/components/CityRegionPrompt');
const { signupMetadata, cityRegionProblem } = await import('../src/lib/signupDetails');
const { CMSAccountTab } = await import('../src/components/admin/cms/CMSAccountTab');

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
  fetchProfile.mockReset();
  vi.useRealTimers();
});

const $ = <T extends HTMLElement>(sel: string) => host.querySelector(sel) as T | null;
const type = (sel: string, value: string) => act(() => {
  const input = $<HTMLInputElement>(sel)!;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
const submit = async (sel: string) => act(async () => {
  $<HTMLFormElement>(sel)!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
});

const details = {
  firstName: 'Rima', lastName: 'Haddad', phone: '+961 70123456',
  city: 'Achrafieh, Beirut', address: 'Gouraud St', building: 'Bldg 2', notes: '',
};

const withShop = () => {
  Object.assign(shop, {
    language: 'en',
    showToast: vi.fn(),
    sendEmailOtp: vi.fn(async () => {}),
    verifyEmailOtp: vi.fn(async () => {}),
    saveSignupDetails: vi.fn(async () => {}),
  });
  return shop;
};

describe('signing in with an emailed code', () => {
  it('asks for an email, sends a code, then signs in with it', async () => {
    const s = withShop();
    const onSignedIn = vi.fn();
    act(() => root.render(<EmailCodeSignIn idPrefix="t" purpose="signin" onSignedIn={onSignedIn} />));
    expect(host.querySelector('input[type="password"]')).toBeNull();

    type('#t-code-email', ' rima@example.com ');
    await submit('#t-code-form');
    expect(s.sendEmailOtp).toHaveBeenCalledWith('rima@example.com', undefined);

    // Supabase refuses a new code within the minute, and so does the button.
    expect($<HTMLButtonElement>('#t-resend-code-btn')!.disabled).toBe(true);
    expect($<HTMLButtonElement>('#t-verify-code-btn')!.disabled).toBe(true);

    type('#t-code-input', '12 34 56');
    expect($<HTMLInputElement>('#t-code-input')!.value).toBe('123456');
    await submit('#t-code-form');
    expect(s.verifyEmailOtp).toHaveBeenCalledWith('rima@example.com', '123456');
    expect(s.saveSignupDetails).not.toHaveBeenCalled();
    expect(onSignedIn).toHaveBeenCalledWith('rima@example.com');
  });

  it('refuses an address that is not an email', async () => {
    const s = withShop();
    act(() => root.render(<EmailCodeSignIn idPrefix="t" purpose="signin" />));
    type('#t-code-email', 'not-an-email');
    await submit('#t-code-form');
    expect(s.sendEmailOtp).not.toHaveBeenCalled();
    expect(s.showToast).toHaveBeenCalled();
  });

  it('can go back and use another address', async () => {
    withShop();
    act(() => root.render(<EmailCodeSignIn idPrefix="t" purpose="signin" />));
    type('#t-code-email', 'rima@example.com');
    await submit('#t-code-form');
    act(() => { [...host.querySelectorAll('button')].find(b => b.textContent?.includes('different email'))!.click(); });
    expect($('#t-code-email')).not.toBeNull();
  });
});

describe('creating an account with an emailed code', () => {
  it('sends nothing until the details form is complete', async () => {
    const s = withShop();
    act(() => root.render(<EmailCodeSignIn idPrefix="t" purpose="signup" collectSignupDetails={async () => null} />));
    type('#t-code-email', 'rima@example.com');
    await submit('#t-code-form');
    expect(s.sendEmailOtp).not.toHaveBeenCalled();
  });

  it('carries the details with the code and saves them once it is accepted', async () => {
    const s = withShop();
    act(() => root.render(<EmailCodeSignIn idPrefix="t" purpose="signup" collectSignupDetails={async () => details} />));
    type('#t-code-email', 'rima@example.com');
    await submit('#t-code-form');
    expect(s.sendEmailOtp).toHaveBeenCalledWith('rima@example.com', details);
    type('#t-code-input', '654321');
    await submit('#t-code-form');
    expect(s.verifyEmailOtp).toHaveBeenCalledWith('rima@example.com', '654321');
    expect(s.saveSignupDetails).toHaveBeenCalledWith(details);
  });

  it('stores the details as user metadata the database copies into the profile', () => {
    expect(signupMetadata({ ...details, firstName: '  Rima ', city: ' Achrafieh, Beirut ' })).toEqual({
      name: 'Rima Haddad', first_name: 'Rima', last_name: 'Haddad', default_city: 'Achrafieh, Beirut',
      default_address: 'Gouraud St', default_building: 'Bldg 2', default_notes: '',
    });
  });
});

describe('City / Region is required', () => {
  it('rejects a blank or overlong value', () => {
    expect(cityRegionProblem('   ', 'en')).toBe('City / Region is required.');
    expect(cityRegionProblem(undefined, 'en')).toBe('City / Region is required.');
    expect(cityRegionProblem('x'.repeat(121), 'en')).toMatch(/too long/);
    expect(cityRegionProblem(' Jounieh ', 'en')).toBeNull();
  });

  const renderPrompt = async (overrides: Record<string, unknown>, savedCity: string | null) => {
    fetchProfile.mockResolvedValue(savedCity === null ? null : { defaultCity: savedCity });
    Object.assign(shop, {
      authUser: { uid: 'u1' }, isLoadingAuth: false, isAdminUser: false, isSellerUser: false, activeTab: 'home',
      user: { defaultCity: '' }, updateUser: vi.fn(async () => {}), signOutUser: vi.fn(async () => {}),
      language: 'en', showToast: vi.fn(), ...overrides,
    });
    await act(async () => { root.render(<CityRegionPrompt />); });
    return shop;
  };

  it('asks a signed-in shopper who has none saved, and cannot be dismissed with Escape', async () => {
    await renderPrompt({}, '');
    expect(fetchProfile).toHaveBeenCalledWith('u1');
    expect($('#city-region-prompt')).not.toBeNull();
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect($('#city-region-prompt')).not.toBeNull();
  });

  it('saves only a real value', async () => {
    const s = await renderPrompt({}, '');
    await submit('#city-region-prompt form');
    expect(s.updateUser).not.toHaveBeenCalled();
    type('#city-region-prompt-input', '  Jounieh ');
    await submit('#city-region-prompt form');
    expect(s.updateUser).toHaveBeenCalledWith({ defaultCity: 'Jounieh' });
    expect($('#city-region-prompt')).toBeNull();
  });

  it('checks the saved profile, not the browser cache', async () => {
    // The cached checkout city prefills the answer but does not count as saved.
    await renderPrompt({ user: { defaultCity: 'Zahle' } }, '');
    expect($('#city-region-prompt')).not.toBeNull();
    expect($<HTMLInputElement>('#city-region-prompt-input')!.value).toBe('Zahle');
  });

  it('offers signing out instead', async () => {
    const s = await renderPrompt({}, '');
    act(() => { [...host.querySelectorAll('button')].find(b => b.textContent?.includes('Sign out'))!.click(); });
    expect(s.signOutUser).toHaveBeenCalled();
  });

  it('stays away when a city is saved, on the checkout, and for the administrator and sellers', async () => {
    await renderPrompt({}, 'Beirut');
    expect($('#city-region-prompt')).toBeNull();
    await renderPrompt({ activeTab: 'checkout' }, '');
    expect($('#city-region-prompt')).toBeNull();
    fetchProfile.mockClear();
    await renderPrompt({ isAdminUser: true }, '');
    await renderPrompt({ isSellerUser: true }, '');
    expect($('#city-region-prompt')).toBeNull();
    expect(fetchProfile).not.toHaveBeenCalled();
  });
});

describe('where shoppers sign in', () => {
  const read = (f: string) => fs.readFileSync(path.resolve(process.cwd(), f), 'utf8');
  const strip = (s: string) => s.replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('has no password field, no reset link and no direct password sign-in, on /account or in checkout', () => {
    for (const file of ['src/components/AccountView.tsx', 'src/components/CheckoutView.tsx']) {
      const code = strip(read(file));
      expect(code, file).toContain('<EmailCodeSignIn');
      expect(code, file).not.toMatch(/type=\{showPassword|type="password"/);
      for (const gone of ['signInWithEmail', 'signUpWithEmail', 'resetPassword', 'Forgot Password']) {
        expect(code, `${file}: ${gone}`).not.toContain(gone);
      }
    }
  });

  it('marks City / Region required and checks it on sign-up and on saving the profile', () => {
    const account = strip(read('src/components/AccountView.tsx'));
    expect((account.match(/City \/ Region \*/g) ?? []).length).toBe(2);
    expect(account.slice(account.indexOf('const collectSignupDetails'), account.indexOf('const wishlistProducts'))).toContain('cityRegionProblem(profileCity');
    expect(account.slice(account.indexOf('const handleSaveProfile'))).toContain('cityRegionProblem(profileCity');
  });

  it('does not type a City / Region in for the shopper at checkout', () => {
    const checkout = strip(read('src/components/CheckoutView.tsx'));
    expect(checkout).not.toMatch(/city: 'Achrafieh, Beirut'|\|\| 'Achrafieh, Beirut'/);
  });

  it('follows the Account page settings in checkout too, with phone codes off unless turned on', () => {
    const checkout = strip(read('src/components/CheckoutView.tsx'));
    expect(checkout).toContain('{showPhoneCode && (');
    expect(checkout).toContain('{showGoogleAuth && (');
    expect(checkout).toContain('{showAppleAuth && (');
    expect(checkout).toContain('authVisibility.showSmsAuth === true');
    expect(strip(read('src/components/AccountView.tsx'))).toContain('authVisibility.showSmsAuth === true');
    expect(read('src/data/cmsContent.ts')).toMatch(/showSmsAuth: false,\s*phoneCodeChannel: 'whatsapp'/);
  });

  it('sends the phone code over the channel the admin chose', () => {
    const modal = read('src/components/PhoneAuthModal.tsx');
    expect(modal).toContain("options:{channel,captchaToken:await getCaptchaToken()}");
    for (const f of ['src/components/AccountView.tsx', 'src/components/CheckoutView.tsx']) {
      expect(read(f), f).toContain('channel={phoneCodeChannel}');
    }
  });
});

describe('the admin can turn on WhatsApp codes later', () => {
  const account = { title: 't', subtitle: 's', ordersTabLabel: 'o', profileTabLabel: 'p', wishlistTabLabel: 'w' };

  it('shows the phone code as off until it is turned on, WhatsApp by default', () => {
    const onChangeField = vi.fn();
    act(() => root.render(<CMSAccountTab accountData={account} onChangeField={onChangeField} />));
    const toggle = $<HTMLButtonElement>('[aria-label="Phone code sign-in visibility"]')!;
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect($('#cms-phone-code-whatsapp')!.getAttribute('aria-checked')).toBe('true');
    act(() => toggle.click());
    expect(onChangeField).toHaveBeenCalledWith('showSmsAuth', true);
    act(() => $<HTMLButtonElement>('#cms-phone-code-sms')!.click());
    expect(onChangeField).toHaveBeenCalledWith('phoneCodeChannel', 'sms');
  });

  it('says what Supabase needs before it works', () => {
    act(() => root.render(<CMSAccountTab accountData={{ ...account, showSmsAuth: true, phoneCodeChannel: 'whatsapp' }} onChangeField={vi.fn()} />));
    expect($('#cms-phone-code-card')!.textContent).toContain('WhatsApp sender (Twilio)');
    expect(host.textContent).toContain('Also switch Google on in Supabase');
  });
});
