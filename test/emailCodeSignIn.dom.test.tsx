// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { createRoot, type Root } from 'react-dom/client';

// Shoppers and sellers sign in with a code emailed each time: no password
// field anywhere they sign in. Signing in reaches existing accounts only, so a
// new shopper signs up first, and every account carries what the sign-up form
// requires (name, phone, email, City / Region, street, building). The shop
// context is large; these components read a few fields of it.
const shop: Record<string, any> = {};
vi.mock('../src/context/ShopContext', () => ({ useShop: () => shop }));
const fetchProfile = vi.fn();
vi.mock('../src/services/supabaseUserDataService', () => ({ supabaseUserDataService: { fetchProfile: (...a: unknown[]) => fetchProfile(...a) } }));

const { EmailCodeSignIn } = await import('../src/components/EmailCodeSignIn');
const { RequiredDetailsPrompt, missingRequiredDetails } = await import('../src/components/RequiredDetailsPrompt');
const { signupMetadata, cityRegionProblem, emailProblem, phoneProblem, isNoAccountError } = await import('../src/lib/signupDetails');
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
    confirmSignupCode: vi.fn(async () => {}),
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
    expect(s.confirmSignupCode).not.toHaveBeenCalled();
    expect(onSignedIn).toHaveBeenCalledWith('rima@example.com');
  });

  it('sends an email with no account to sign up first', async () => {
    const s = withShop();
    const onNoAccount = vi.fn();
    s.sendEmailOtp.mockRejectedValueOnce(Object.assign(new Error('Signups not allowed for otp'), { code: 'otp_disabled', status: 422 }));
    act(() => root.render(<EmailCodeSignIn idPrefix="t" purpose="signin" onNoAccount={onNoAccount} />));
    type('#t-code-email', ' new@example.com ');
    await submit('#t-code-form');
    // Without sign-up details the request cannot make an account.
    expect(s.sendEmailOtp).toHaveBeenCalledWith('new@example.com', undefined);
    expect(onNoAccount).toHaveBeenCalledWith('new@example.com');
    expect($('#t-code-form')!.getAttribute('data-step')).toBe('email');

    // Any other failure is only reported, where it happened.
    s.sendEmailOtp.mockRejectedValueOnce(Object.assign(new Error('Email rate limit exceeded'), { code: 'over_email_send_rate_limit' }));
    await submit('#t-code-form');
    expect(onNoAccount).toHaveBeenCalledTimes(1);
  });

  it('recognises Supabase refusing an unknown email, and nothing else', () => {
    expect(isNoAccountError({ code: 'otp_disabled' })).toBe(true);
    expect(isNoAccountError(new Error('Signups not allowed for otp'))).toBe(true);
    expect(isNoAccountError({ code: 'signup_disabled', message: 'Signups not allowed for this instance' })).toBe(false);
    expect(isNoAccountError(new Error('Email rate limit exceeded'))).toBe(false);
    expect(isNoAccountError(null)).toBe(false);
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
    expect(s.confirmSignupCode).toHaveBeenCalledWith('rima@example.com', '654321', details);
    expect(s.verifyEmailOtp).not.toHaveBeenCalled();
  });

  it('starts with the email the sign-in form found no account for, and says so', async () => {
    const s = withShop();
    act(() => root.render(<EmailCodeSignIn idPrefix="t" purpose="signup" noAccountEmail="new@example.com" collectSignupDetails={async () => details} />));
    expect($<HTMLInputElement>('#t-code-email')!.value).toBe('new@example.com');
    expect($('#t-no-account-note')!.textContent).toContain('There is no account for new@example.com yet');
    await submit('#t-code-form');
    expect(s.sendEmailOtp).toHaveBeenCalledWith('new@example.com', details);
  });

  it('stores the details as user metadata the database copies into the profile', () => {
    expect(signupMetadata({ ...details, firstName: '  Rima ', city: ' Achrafieh, Beirut ' })).toEqual({
      name: 'Rima Haddad', first_name: 'Rima', last_name: 'Haddad', default_city: 'Achrafieh, Beirut',
      default_address: 'Gouraud St', default_building: 'Bldg 2', default_notes: '',
    });
  });
});

describe('every account has what the sign-up form requires', () => {
  it('rejects a blank or overlong City / Region', () => {
    expect(cityRegionProblem('   ', 'en')).toBe('City / Region is required.');
    expect(cityRegionProblem(undefined, 'en')).toBe('City / Region is required.');
    expect(cityRegionProblem('x'.repeat(121), 'en')).toMatch(/too long/);
    expect(cityRegionProblem(' Jounieh ', 'en')).toBeNull();
  });

  it('requires an email address and an 8-digit phone', () => {
    expect(emailProblem('  ', 'en')).toBe('Email address is required.');
    expect(emailProblem('rima@', 'en')).toBe('Please enter a valid email address.');
    expect(emailProblem(' rima@example.com ', 'en')).toBeNull();
    expect(phoneProblem('', 'en')).toBe('Phone number is required.');
    expect(phoneProblem('7012345', 'en')).toMatch(/8 digits/);
    expect(phoneProblem('70123456', 'en')).toBeNull();
  });

  const complete = {
    firstName: 'Rima', lastName: 'Haddad', phone: '+961 70123456', email: 'rima@example.com',
    defaultCity: 'Beirut', defaultAddress: 'Gouraud St', defaultBuilding: 'Bldg 2',
  };

  it('finds what a saved profile lacks', () => {
    expect(missingRequiredDetails(complete, 'rima@example.com')).toEqual([]);
    expect(missingRequiredDetails(null, '')).toEqual(['name', 'phone', 'email', 'city', 'address', 'building']);
    expect(missingRequiredDetails({ ...complete, phone: '12345' }, '')).toEqual(['phone']);
    // The address it signs in with is its email.
    expect(missingRequiredDetails({ ...complete, email: '' }, 'rima@example.com')).toEqual([]);
    expect(missingRequiredDetails({ ...complete, email: '' }, '')).toEqual(['email']);
  });

  const renderPrompt = async (overrides: Record<string, unknown>, saved: Record<string, unknown> | null) => {
    fetchProfile.mockResolvedValue(saved);
    Object.assign(shop, {
      authUser: { uid: 'u1', email: 'rima@example.com' }, isLoadingAuth: false, isAdminUser: false, isSellerUser: false,
      isCompletingSignup: false, activeTab: 'home', user: { email: '', phone: '', defaultCity: '' },
      updateUser: vi.fn(async () => {}), checkPhoneUniqueness: vi.fn(async () => ({ available: true })),
      signOutUser: vi.fn(async () => {}), language: 'en', showToast: vi.fn(), ...overrides,
    });
    await act(async () => { root.render(<RequiredDetailsPrompt />); });
    return shop;
  };
  const shown = () => ['first-name', 'last-name', 'phone', 'email', 'city', 'address', 'building']
    .filter(field => $(`#required-details-${field}`));

  it('asks only for what is missing, and cannot be dismissed with Escape', async () => {
    await renderPrompt({}, { ...complete, phone: '', defaultCity: '' });
    expect(fetchProfile).toHaveBeenCalledWith('u1');
    expect(shown()).toEqual(['phone', 'city']);
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect($('#required-details-prompt')).not.toBeNull();
  });

  it('saves the phone as +961 and the city once the number is known to be free', async () => {
    const s = await renderPrompt({}, { ...complete, phone: '', defaultCity: '' });
    await submit('#required-details-prompt form');
    expect(s.updateUser).not.toHaveBeenCalled();
    expect(s.showToast).toHaveBeenLastCalledWith('Phone number is required.', 'warning');

    type('#required-details-phone', '70 123 456');
    expect($<HTMLInputElement>('#required-details-phone')!.value).toBe('70123456');
    type('#required-details-city', '  Jounieh ');
    await submit('#required-details-prompt form');
    expect(s.checkPhoneUniqueness).toHaveBeenCalledWith('70123456');
    expect(s.updateUser).toHaveBeenCalledWith({ phone: '+961 70123456', defaultCity: 'Jounieh' });
    expect($('#required-details-prompt')).toBeNull();
  });

  it('refuses a short phone, or one another account holds', async () => {
    const s = await renderPrompt({}, { ...complete, phone: '' });
    type('#required-details-phone', '7012345');
    await submit('#required-details-prompt form');
    expect(s.showToast).toHaveBeenLastCalledWith('Lebanese phone number must be strictly 8 digits', 'warning');
    s.checkPhoneUniqueness.mockResolvedValueOnce({ available: false, reason: 'This phone number is already registered to another account.' });
    type('#required-details-phone', '70123456');
    await submit('#required-details-prompt form');
    expect(s.showToast).toHaveBeenLastCalledWith('This phone number is already registered to another account.', 'warning');
    expect(s.updateUser).not.toHaveBeenCalled();
    expect($('#required-details-prompt')).not.toBeNull();
  });

  it('asks for an email only when the account has none to sign in with', async () => {
    await renderPrompt({}, { ...complete, email: '' });
    expect($('#required-details-prompt')).toBeNull();

    const s = await renderPrompt({ authUser: { uid: 'u1', email: '' } }, { ...complete, email: '' });
    expect(shown()).toEqual(['email']);
    type('#required-details-email', 'rima@');
    await submit('#required-details-prompt form');
    expect(s.updateUser).not.toHaveBeenCalled();
    type('#required-details-email', ' rima@example.com ');
    await submit('#required-details-prompt form');
    expect(s.updateUser).toHaveBeenCalledWith({ email: 'rima@example.com' });
  });

  it('asks a shopper who came in through Google for everything the sign-up form would have', async () => {
    const s = await renderPrompt(
      { user: { firstName: 'Rima', lastName: 'Haddad', email: 'rima@example.com', phone: '', defaultCity: '' } },
      { firstName: '', lastName: '', phone: '', email: 'rima@example.com', defaultCity: '', defaultAddress: '', defaultBuilding: '' },
    );
    expect(shown()).toEqual(['first-name', 'last-name', 'phone', 'city', 'address', 'building']);
    // The name Google gave is offered, not assumed saved.
    expect($<HTMLInputElement>('#required-details-first-name')!.value).toBe('Rima');
    type('#required-details-phone', '03123456');
    type('#required-details-city', 'Zahle');
    type('#required-details-address', 'Main St');
    await submit('#required-details-prompt form');
    expect(s.showToast).toHaveBeenLastCalledWith('Street and building are required.', 'warning');
    type('#required-details-building', 'Bldg 5');
    await submit('#required-details-prompt form');
    expect(s.updateUser).toHaveBeenCalledWith({
      firstName: 'Rima', lastName: 'Haddad', name: 'Rima Haddad', phone: '+961 03123456',
      defaultCity: 'Zahle', defaultAddress: 'Main St', defaultBuilding: 'Bldg 5',
    });
  });

  it('checks the saved profile, not the browser cache', async () => {
    // Cached checkout details prefill the answers but do not count as saved.
    await renderPrompt({ user: { email: '', phone: '+961 70123456', defaultCity: 'Zahle' } }, { ...complete, phone: '', defaultCity: '' });
    expect($<HTMLInputElement>('#required-details-phone')!.value).toBe('70123456');
    expect($<HTMLInputElement>('#required-details-city')!.value).toBe('Zahle');
  });

  it('offers signing out instead', async () => {
    const s = await renderPrompt({}, { ...complete, defaultCity: '' });
    act(() => { [...host.querySelectorAll('button')].find(b => b.textContent?.includes('Sign out'))!.click(); });
    expect(s.signOutUser).toHaveBeenCalled();
  });

  it('stays away when all is saved, on the checkout, while a sign-up is saving, and for the administrator and sellers', async () => {
    await renderPrompt({}, complete);
    expect($('#required-details-prompt')).toBeNull();
    await renderPrompt({ activeTab: 'checkout' }, { ...complete, phone: '' });
    expect($('#required-details-prompt')).toBeNull();
    fetchProfile.mockClear();
    await renderPrompt({ isCompletingSignup: true }, { ...complete, phone: '' });
    await renderPrompt({ isAdminUser: true }, { ...complete, phone: '' });
    await renderPrompt({ isSellerUser: true }, { ...complete, phone: '' });
    expect($('#required-details-prompt')).toBeNull();
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

  it('lets only the sign-up form create an account, and sends an unknown email there', () => {
    const context = strip(read('src/context/ShopContext.tsx'));
    const send = context.slice(context.indexOf('const sendEmailOtp'), context.indexOf('const verifyEmailOtp'));
    expect(send).toContain('shouldCreateUser: Boolean(signup)');
    expect(context).not.toContain('shouldCreateUser: true');
    const link = context.slice(context.indexOf('const sendEmailSignInLink'), context.indexOf('const completeEmailLinkSignIn'));
    expect(link).toContain('shouldCreateUser: false');
    for (const file of ['src/components/AccountView.tsx', 'src/components/CheckoutView.tsx']) {
      const code = strip(read(file));
      expect(code, file).toContain("onNoAccount={email => { setNoAccountEmail(email); setAuthMode('signup'); }}");
      expect(code, file).toContain('noAccountEmail={noAccountEmail}');
    }
  });

  it('marks email and phone required on the profile and checks both before saving', () => {
    const account = strip(read('src/components/AccountView.tsx'));
    expect(account).toContain('>Email Address *</label>');
    expect((account.match(/>Phone \(WhatsApp\) \*<\/label>/g) ?? []).length).toBe(2);
    const save = account.slice(account.indexOf('const handleSaveProfile'), account.indexOf('if (isSellerUser)'));
    expect(save).toContain('emailProblem(email, language)');
    expect(save).toContain('phoneProblem(cleanPhone, language)');
    expect(save).toMatch(/email,\s*phone: formattedPhone,/);
    // The sign-in email is the account's email; it is shown, not retyped.
    expect(account).toContain('readOnly={Boolean(signInEmail)}');
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
