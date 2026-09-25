// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { createRoot, type Root } from 'react-dom/client';

// Shoppers and sellers sign in with their password and then a code emailed to
// them. A new account is made with a password typed twice and its email is
// confirmed with an emailed code. Forgot password emails a code, then asks
// for a new password. Signing in reaches existing accounts only, so a new
// shopper signs up first, and every account carries what the sign-up form
// requires (name, phone, email, City / Region, street, building). The shop
// context is large; these components read a few fields of it.
const shop: Record<string, any> = {};
vi.mock('../src/context/ShopContext', () => ({ useShop: () => shop }));
const fetchProfile = vi.fn();
vi.mock('../src/services/supabaseUserDataService', () => ({ supabaseUserDataService: { fetchProfile: (...a: unknown[]) => fetchProfile(...a) } }));

const { EmailPasswordSignIn } = await import('../src/components/EmailPasswordSignIn');
const { NewPasswordPrompt } = await import('../src/components/NewPasswordPrompt');
const { RequiredDetailsPrompt, missingRequiredDetails } = await import('../src/components/RequiredDetailsPrompt');
const { signupMetadata, cityRegionProblem, emailProblem, phoneProblem, isNoAccountError } = await import('../src/lib/signupDetails');
const { isLoginPasswordStatus, newPasswordProblem, signInRefusalMessage } = await import('../src/lib/passwordSignIn');
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
const click = async (sel: string) => act(async () => { $<HTMLButtonElement>(sel)!.click(); });
const step = () => $('#t-form')?.getAttribute('data-step');
const lastToast = () => shop.showToast.mock.calls.at(-1)?.[0] as string | undefined;

const details = {
  firstName: 'Rima', lastName: 'Haddad', phone: '+961 70123456',
  city: 'Achrafieh, Beirut', address: 'Gouraud St', building: 'Bldg 2', notes: '',
};

const withShop = () => {
  Object.assign(shop, {
    language: 'en',
    showToast: vi.fn(),
    verifyLoginPassword: vi.fn(async () => 'ok'),
    sendEmailOtp: vi.fn(async () => {}),
    verifyEmailOtp: vi.fn(async () => {}),
    signUpWithPassword: vi.fn(async () => 'code_sent'),
    confirmSignupCode: vi.fn(async () => {}),
    resendEmailVerification: vi.fn(async () => {}),
    resetPassword: vi.fn(async () => {}),
    confirmPasswordResetCode: vi.fn(async () => {}),
  });
  return shop;
};

describe('signing in: the password, then a code emailed to the account', () => {
  it('checks the password, emails a code, then signs in with it', async () => {
    const s = withShop();
    const onSignedIn = vi.fn();
    act(() => root.render(<EmailPasswordSignIn idPrefix="t" purpose="signin" onSignedIn={onSignedIn} />));
    expect($<HTMLInputElement>('#t-password')!.type).toBe('password');

    type('#t-email', ' rima@example.com ');
    type('#t-password', 'Cedar-Tree-42');
    await submit('#t-form');
    expect(s.verifyLoginPassword).toHaveBeenCalledWith('rima@example.com', 'Cedar-Tree-42');
    expect(s.sendEmailOtp).toHaveBeenCalledWith('rima@example.com');
    expect(s.verifyLoginPassword.mock.invocationCallOrder[0]).toBeLessThan(s.sendEmailOtp.mock.invocationCallOrder[0]);
    expect(step()).toBe('code');

    // Supabase refuses a new code within the minute, and so does the button.
    expect($<HTMLButtonElement>('#t-resend-code-btn')!.disabled).toBe(true);
    expect($<HTMLButtonElement>('#t-verify-code-btn')!.disabled).toBe(true);

    type('#t-code-input', '12 34 56');
    expect($<HTMLInputElement>('#t-code-input')!.value).toBe('123456');
    await submit('#t-form');
    // The password step is renewed just before the code, then the code signs in.
    expect(s.verifyLoginPassword).toHaveBeenCalledTimes(2);
    expect(s.verifyLoginPassword.mock.invocationCallOrder[1]).toBeLessThan(s.verifyEmailOtp.mock.invocationCallOrder[0]);
    expect(s.verifyEmailOtp).toHaveBeenCalledWith('rima@example.com', '123456');
    expect(s.confirmSignupCode).not.toHaveBeenCalled();
    expect(onSignedIn).toHaveBeenCalledWith('rima@example.com');
  });

  it('emails no code after a wrong password, and says why', async () => {
    const s = withShop();
    act(() => root.render(<EmailPasswordSignIn idPrefix="t" purpose="signin" />));
    type('#t-email', 'rima@example.com');
    type('#t-password', 'Wrong-Pass-1');
    s.verifyLoginPassword.mockResolvedValueOnce('wrong');
    await submit('#t-form');
    expect(s.sendEmailOtp).not.toHaveBeenCalled();
    expect(lastToast()).toMatch(/^Wrong email or password\. .*Forgot password/);
    expect(step()).toBe('credentials');

    s.verifyLoginPassword.mockResolvedValueOnce('locked');
    await submit('#t-form');
    expect(s.sendEmailOtp).not.toHaveBeenCalled();
    expect(lastToast()).toBe('Too many wrong passwords. Wait 15 minutes, or use Forgot password.');
  });

  it('sends an email with no account to sign up first', async () => {
    const s = withShop();
    const onNoAccount = vi.fn();
    s.verifyLoginPassword.mockResolvedValueOnce('no_account');
    act(() => root.render(<EmailPasswordSignIn idPrefix="t" purpose="signin" onNoAccount={onNoAccount} />));
    type('#t-email', ' new@example.com ');
    type('#t-password', 'Cedar-Tree-42');
    await submit('#t-form');
    expect(onNoAccount).toHaveBeenCalledWith('new@example.com');
    expect(s.sendEmailOtp).not.toHaveBeenCalled();
    expect(lastToast()).toBe('There is no account with this email yet. Please sign up first.');
  });

  it('checks the email and asks for the password before anything is sent', async () => {
    const s = withShop();
    act(() => root.render(<EmailPasswordSignIn idPrefix="t" purpose="signin" />));
    type('#t-email', 'not-an-email');
    type('#t-password', 'Cedar-Tree-42');
    await submit('#t-form');
    type('#t-email', 'rima@example.com');
    type('#t-password', '');
    await submit('#t-form');
    expect(lastToast()).toBe('Enter your password.');
    expect(s.verifyLoginPassword).not.toHaveBeenCalled();
    expect(s.sendEmailOtp).not.toHaveBeenCalled();
  });

  it('goes back to the password if it no longer matches when the code is entered', async () => {
    const s = withShop();
    act(() => root.render(<EmailPasswordSignIn idPrefix="t" purpose="signin" />));
    type('#t-email', 'rima@example.com');
    type('#t-password', 'Cedar-Tree-42');
    await submit('#t-form');
    s.verifyLoginPassword.mockResolvedValueOnce('wrong');
    type('#t-code-input', '123456');
    await submit('#t-form');
    expect(s.verifyEmailOtp).not.toHaveBeenCalled();
    expect(step()).toBe('credentials');
  });

  it('can go back and use another address, and shows the password on request', async () => {
    withShop();
    act(() => root.render(<EmailPasswordSignIn idPrefix="t" purpose="signin" />));
    await click('#t-toggle-password-btn');
    expect($<HTMLInputElement>('#t-password')!.type).toBe('text');
    await click('#t-toggle-password-btn');
    expect($<HTMLInputElement>('#t-password')!.type).toBe('password');
    type('#t-email', 'rima@example.com');
    type('#t-password', 'Cedar-Tree-42');
    await submit('#t-form');
    await click('#t-back-btn');
    expect(step()).toBe('credentials');
    expect($<HTMLInputElement>('#t-email')!.value).toBe('rima@example.com');
  });

  it('starts with the email the sign-up form found an account for, and says so', () => {
    withShop();
    act(() => root.render(<EmailPasswordSignIn idPrefix="t" purpose="signin" existingAccountEmail="rima@example.com" />));
    expect($<HTMLInputElement>('#t-email')!.value).toBe('rima@example.com');
    expect($('#t-existing-account-note')!.textContent).toContain('rima@example.com already has an account');
  });
});

describe('creating an account: a password typed twice, then the emailed code', () => {
  const fill = (password: string, confirm: string) => {
    type('#t-email', 'rima@example.com');
    type('#t-password', password);
    type('#t-password-confirm', confirm);
  };

  it("holds the password to the shop's rules and to its second typing", async () => {
    const s = withShop();
    act(() => root.render(<EmailPasswordSignIn idPrefix="t" purpose="signup" collectSignupDetails={async () => details} />));
    expect($('#t-password-rules')!.textContent).toContain('At least 8 characters');
    fill('Short1', 'Short1');
    await submit('#t-form');
    expect(lastToast()).toBe('Password must be at least 8 characters long.');
    fill('cedar-tree-42', 'cedar-tree-42');
    await submit('#t-form');
    expect(lastToast()).toBe('Password must contain both uppercase and lowercase letters.');
    fill('Cedar-Tree-42', 'Cedar-Tree-43');
    await submit('#t-form');
    expect(lastToast()).toBe('The two passwords do not match.');
    expect(s.signUpWithPassword).not.toHaveBeenCalled();
  });

  it('sends nothing until the details form is complete', async () => {
    const s = withShop();
    act(() => root.render(<EmailPasswordSignIn idPrefix="t" purpose="signup" collectSignupDetails={async () => null} />));
    fill('Cedar-Tree-42', 'Cedar-Tree-42');
    await submit('#t-form');
    expect(s.signUpWithPassword).not.toHaveBeenCalled();
  });

  it('creates the account with its password and details, then confirms the email with the code', async () => {
    vi.useFakeTimers();
    const s = withShop();
    const onSignedIn = vi.fn();
    act(() => root.render(<EmailPasswordSignIn idPrefix="t" purpose="signup" collectSignupDetails={async () => details} onSignedIn={onSignedIn} />));
    fill('Cedar-Tree-42', 'Cedar-Tree-42');
    await submit('#t-form');
    expect(s.signUpWithPassword).toHaveBeenCalledWith('rima@example.com', 'Cedar-Tree-42', details);
    expect(step()).toBe('code');
    expect($('label[for="t-code-input"]')!.textContent).toBe('Confirmation code *');

    for (let i = 0; i < 60; i++) act(() => { vi.advanceTimersByTime(1000); });
    await click('#t-resend-code-btn');
    expect(s.resendEmailVerification).toHaveBeenCalledWith('rima@example.com');
    expect(s.sendEmailOtp).not.toHaveBeenCalled();

    type('#t-code-input', '654321');
    await submit('#t-form');
    expect(s.verifyLoginPassword).toHaveBeenCalledWith('rima@example.com', 'Cedar-Tree-42');
    expect(s.confirmSignupCode).toHaveBeenCalledWith('rima@example.com', '654321', details);
    expect(s.verifyEmailOtp).not.toHaveBeenCalled();
    expect(onSignedIn).toHaveBeenCalledWith('rima@example.com');
  });

  it('sends an email that already has an account to sign in', async () => {
    const s = withShop();
    const onAccountExists = vi.fn();
    s.signUpWithPassword.mockResolvedValueOnce('exists');
    act(() => root.render(<EmailPasswordSignIn idPrefix="t" purpose="signup" collectSignupDetails={async () => details} onAccountExists={onAccountExists} />));
    fill('Cedar-Tree-42', 'Cedar-Tree-42');
    await submit('#t-form');
    expect(onAccountExists).toHaveBeenCalledWith('rima@example.com');
    expect(lastToast()).toContain('already has an account');
    expect(step()).toBe('credentials');
  });

  it('starts with the email the sign-in form found no account for, and says so', async () => {
    const s = withShop();
    act(() => root.render(<EmailPasswordSignIn idPrefix="t" purpose="signup" noAccountEmail="new@example.com" collectSignupDetails={async () => details} />));
    expect($<HTMLInputElement>('#t-email')!.value).toBe('new@example.com');
    expect($('#t-no-account-note')!.textContent).toContain('There is no account for new@example.com yet');
    type('#t-password', 'Cedar-Tree-42');
    type('#t-password-confirm', 'Cedar-Tree-42');
    await submit('#t-form');
    expect(s.signUpWithPassword).toHaveBeenCalledWith('new@example.com', 'Cedar-Tree-42', details);
  });

  it('stores the details as user metadata the database copies into the profile', () => {
    expect(signupMetadata({ ...details, firstName: '  Rima ', city: ' Achrafieh, Beirut ' })).toEqual({
      name: 'Rima Haddad', first_name: 'Rima', last_name: 'Haddad', default_city: 'Achrafieh, Beirut',
      default_address: 'Gouraud St', default_building: 'Bldg 2', default_notes: '',
    });
  });
});

describe('Forgot password: a code emailed to the account, then a new password', () => {
  it('emails a reset code and signs in with it, without the old password', async () => {
    const s = withShop();
    const onSignedIn = vi.fn();
    act(() => root.render(<EmailPasswordSignIn idPrefix="t" purpose="signin" onSignedIn={onSignedIn} />));
    type('#t-email', 'rima@example.com');
    await click('#t-forgot-btn');
    expect(step()).toBe('reset-email');
    expect($<HTMLInputElement>('#t-reset-email')!.value).toBe('rima@example.com');
    await submit('#t-form');
    expect(s.resetPassword).toHaveBeenCalledWith('rima@example.com');
    expect(step()).toBe('reset-code');
    type('#t-code-input', '111222');
    await submit('#t-form');
    expect(s.confirmPasswordResetCode).toHaveBeenCalledWith('rima@example.com', '111222');
    expect(s.verifyLoginPassword).not.toHaveBeenCalled();
    expect(s.verifyEmailOtp).not.toHaveBeenCalled();
    expect(onSignedIn).toHaveBeenCalledWith('rima@example.com');
  });

  it('can go back to signing in', async () => {
    withShop();
    act(() => root.render(<EmailPasswordSignIn idPrefix="t" purpose="signin" />));
    await click('#t-forgot-btn');
    await click('#t-back-btn');
    expect(step()).toBe('credentials');
  });

  const renderPrompt = (overrides: Record<string, unknown> = {}) => {
    Object.assign(shop, {
      authUser: { uid: 'u1', email: 'rima@example.com' }, passwordRecoveryPending: true, isAdminUser: false, isSellerUser: false,
      setNewPassword: vi.fn(async () => {}), signOutUser: vi.fn(async () => {}), language: 'en', showToast: vi.fn(), ...overrides,
    });
    act(() => root.render(<NewPasswordPrompt />));
    return shop;
  };

  it('then asks for the new password twice, and cannot be dismissed with Escape', async () => {
    const s = renderPrompt();
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect($('#new-password-prompt')).not.toBeNull();
    type('#new-password-input', 'Cedar-Tree-42');
    type('#new-password-confirm', 'Cedar-Tree-24');
    await submit('#new-password-prompt form');
    expect(s.setNewPassword).not.toHaveBeenCalled();
    expect(lastToast()).toBe('The two passwords do not match.');
    type('#new-password-confirm', 'Cedar-Tree-42');
    await submit('#new-password-prompt form');
    expect(s.setNewPassword).toHaveBeenCalledWith('Cedar-Tree-42');
  });

  it("holds sellers to the stricter rules, and offers signing out instead", async () => {
    const s = renderPrompt({ isSellerUser: true });
    type('#new-password-input', 'CedarTree4242');
    type('#new-password-confirm', 'CedarTree4242');
    await submit('#new-password-prompt form');
    expect(lastToast()).toBe('Privileged accounts (admin/seller) require at least one special symbol.');
    expect(s.setNewPassword).not.toHaveBeenCalled();
    act(() => { [...host.querySelectorAll('button')].find(b => b.textContent?.includes('Cancel and sign out'))!.click(); });
    expect(s.signOutUser).toHaveBeenCalled();
  });

  it('shows only while a reset sign-in has no new password yet', () => {
    renderPrompt({ passwordRecoveryPending: false });
    expect($('#new-password-prompt')).toBeNull();
    renderPrompt({ authUser: null });
    expect($('#new-password-prompt')).toBeNull();
  });
});

describe('what the password step answers', () => {
  it('knows its four answers and nothing else', () => {
    for (const status of ['ok', 'wrong', 'no_account', 'locked']) expect(isLoginPasswordStatus(status)).toBe(true);
    for (const other of ['OK', '', null, undefined, true, 'error']) expect(isLoginPasswordStatus(other)).toBe(false);
  });

  it('says what is wrong with a new password, in English or Arabic', () => {
    expect(newPasswordProblem('Cedar-Tree-42', 'Cedar-Tree-42', 'en')).toBeNull();
    expect(newPasswordProblem('CedarTree', 'CedarTree', 'en')).toBe('Password must contain at least one digit.');
    expect(newPasswordProblem('Cedar-Tree-42', 'cedar-tree-42', 'en')).toBe('The two passwords do not match.');
    expect(newPasswordProblem('Short1', 'Short1', 'ar')).toBe('يجب ألا تقل كلمة المرور عن 8 أحرف.');
    expect(newPasswordProblem('Cedar-Tree-42', 'x', 'ar')).toBe('كلمتا المرور غير متطابقتين.');
    expect(newPasswordProblem('Cedar-Tree-42', 'Cedar-Tree-42', 'en', true)).toBeNull();
    expect(newPasswordProblem('Cedar-Tree1', 'Cedar-Tree1', 'en', true)).toBe('Password must be at least 12 characters long.');
  });

  it("says the sign-in hook's refusals in Arabic too, and leaves other messages alone", () => {
    expect(signInRefusalMessage('Enter your password first, then the code we email you.', 'ar')).toBe('أدخل كلمة المرور أولاً، ثم الرمز الذي نرسله إلى بريدك.');
    expect(signInRefusalMessage('Enter your password first, then the code we email you.', 'en')).toBe('Enter your password first, then the code we email you.');
    expect(signInRefusalMessage('Token has expired or is invalid', 'ar')).toBe('Token has expired or is invalid');
  });

  it('still recognises Supabase refusing a code for an unknown email', () => {
    expect(isNoAccountError({ code: 'otp_disabled' })).toBe(true);
    expect(isNoAccountError(new Error('Signups not allowed for otp'))).toBe(true);
    expect(isNoAccountError({ code: 'signup_disabled', message: 'Signups not allowed for this instance' })).toBe(false);
    expect(isNoAccountError(null)).toBe(false);
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
      isCompletingSignup: false, passwordRecoveryPending: false, activeTab: 'home', user: { email: '', phone: '', defaultCity: '' },
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

  it('stays away when all is saved, on the checkout, while a sign-up is saving or a new password is being chosen, and for the administrator and sellers', async () => {
    await renderPrompt({}, complete);
    expect($('#required-details-prompt')).toBeNull();
    await renderPrompt({ activeTab: 'checkout' }, { ...complete, phone: '' });
    expect($('#required-details-prompt')).toBeNull();
    fetchProfile.mockClear();
    await renderPrompt({ isCompletingSignup: true }, { ...complete, phone: '' });
    await renderPrompt({ isAdminUser: true }, { ...complete, phone: '' });
    await renderPrompt({ isSellerUser: true }, { ...complete, phone: '' });
    await renderPrompt({ passwordRecoveryPending: true }, { ...complete, phone: '' });
    expect($('#required-details-prompt')).toBeNull();
    expect(fetchProfile).not.toHaveBeenCalled();
  });
});

describe('where shoppers sign in', () => {
  const read = (f: string) => fs.readFileSync(path.resolve(process.cwd(), f), 'utf8');
  const strip = (s: string) => s.replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('asks for the password and then an emailed code, on /account and in checkout', () => {
    for (const file of ['src/components/AccountView.tsx', 'src/components/CheckoutView.tsx']) {
      const code = strip(read(file));
      expect(code, file).toContain('<EmailPasswordSignIn');
      for (const gone of ['signInWithEmail', 'signUpWithEmail', 'signInWithPassword', '<EmailCodeSignIn']) {
        expect(code, `${file}: ${gone}`).not.toContain(gone);
      }
    }
    // The form goes through the context; it never talks to Supabase itself.
    const form = strip(read('src/components/EmailPasswordSignIn.tsx'));
    expect(form).not.toMatch(/from '\.\.\/lib\/supabase'|supabase\./);
    expect(form.indexOf('verifyLoginPassword(cleanEmail, password)')).toBeLessThan(form.indexOf('await sendEmailOtp(cleanEmail)'));
  });

  it('lets only the sign-up form create an account, with a password, and sends an unknown email there', () => {
    const context = strip(read('src/context/ShopContext.tsx'));
    const send = context.slice(context.indexOf('const sendEmailOtp'), context.indexOf('const verifyEmailOtp'));
    expect(send).toContain('shouldCreateUser: false');
    expect(context).not.toMatch(/shouldCreateUser: (true|Boolean)/);
    const link = context.slice(context.indexOf('const sendEmailSignInLink'), context.indexOf('const completeEmailLinkSignIn'));
    expect(link).toContain('shouldCreateUser: false');
    const signUp = context.slice(context.indexOf('const signUpWithPassword'), context.indexOf('const PASSWORD_RECOVERY_KEY'));
    expect(signUp).toContain('supabase.auth.signUp({');
    expect(signUp).toContain('data: signupMetadata(details)');
    expect(signUp).toContain('data.user.identities.length === 0');
    expect(signUp.indexOf('supabase.auth.signUp(')).toBeLessThan(signUp.indexOf('verifyLoginPassword(cleanEmail, password)'));
    for (const file of ['src/components/AccountView.tsx', 'src/components/CheckoutView.tsx']) {
      const code = strip(read(file));
      expect(code, file).toContain("onNoAccount={email => { setNoAccountEmail(email); setAuthMode('signup'); }}");
      expect(code, file).toContain('noAccountEmail={noAccountEmail}');
      expect(code, file).toContain("onAccountExists={email => { setExistingAccountEmail(email); setAuthMode('signin'); }}");
      expect(code, file).toContain('existingAccountEmail={existingAccountEmail}');
    }
  });

  it('takes the reset step before Supabase emails or accepts a Forgot password code', () => {
    const context = strip(read('src/context/ShopContext.tsx'));
    const reset = context.slice(context.indexOf('const resetPassword = async'), context.indexOf('const confirmPasswordResetCode'));
    expect(reset.indexOf("rpc('begin_password_reset'")).toBeGreaterThan(-1);
    expect(reset.indexOf("rpc('begin_password_reset'")).toBeLessThan(reset.indexOf('resetPasswordForEmail('));
    const confirm = context.slice(context.indexOf('const confirmPasswordResetCode'), context.indexOf('const setNewPassword'));
    expect(confirm.indexOf("rpc('begin_password_reset'")).toBeLessThan(confirm.indexOf("verifyEmailOtp(cleanEmail, token, 'recovery')"));
    // A reset link as well as a reset code opens the new-password prompt.
    expect(context).toContain("event === 'PASSWORD_RECOVERY'");
    expect(strip(read('src/App.tsx'))).toContain('<NewPasswordPrompt />');
    expect(read('src/components/RequiredDetailsPrompt.tsx')).toContain('!passwordRecoveryPending');
  });

  it('says why an emailed link did not sign in', () => {
    const context = strip(read('src/context/ShopContext.tsx'));
    expect(context).toContain("callback.has('code') || callback.has('error_description')");
    expect(context).toContain('supabase.auth.initialize().then');
    expect(context).toContain('signInRefusalMessage(message, language)');
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

  it('names the tabs Sign In and Sign Up in checkout, as on /account', () => {
    const checkout = strip(read('src/components/CheckoutView.tsx'));
    const tab = checkout.slice(checkout.indexOf('id="checkout-switch-signup-btn"'), checkout.indexOf('</button>', checkout.indexOf('id="checkout-switch-signup-btn"')));
    expect(tab).toContain("'Sign Up'");
    expect(checkout).not.toContain('New Account');
    expect(strip(read('src/components/AccountView.tsx'))).toMatch(/>\s*Sign Up\s*</);
  });

  it('follows the Account page settings in checkout too, and offers no phone-code sign-in', () => {
    const checkout = strip(read('src/components/CheckoutView.tsx'));
    expect(checkout).toContain('{showGoogleAuth && (');
    expect(checkout).toContain('{showAppleAuth && (');
    for (const file of ['src/components/AccountView.tsx', 'src/components/CheckoutView.tsx', 'src/data/cmsContent.ts', 'src/types.ts']) {
      expect(read(file), file).not.toMatch(/PhoneAuthModal|showSmsAuth|phoneCodeChannel/);
    }
    expect(fs.existsSync(path.resolve(process.cwd(), 'src/components/PhoneAuthModal.tsx'))).toBe(false);
  });
});

describe('the CMS Account tab', () => {
  const account = { title: 't', subtitle: 's', ordersTabLabel: 'o', profileTabLabel: 'p', wishlistTabLabel: 'w' };

  it('says how shoppers sign in, and offers only the Google and Apple switches', () => {
    const onChangeField = vi.fn();
    act(() => root.render(<CMSAccountTab accountData={account} onChangeField={onChangeField} />));
    expect(host.textContent).toContain('sign in with their password and then a code emailed to them');
    expect($('[aria-label="Phone code sign-in visibility"]')).toBeNull();
    expect($('#cms-phone-code-card')).toBeNull();
    act(() => $<HTMLButtonElement>('[aria-label="Google authentication visibility"]')!.click());
    expect(onChangeField).toHaveBeenCalledWith('showGoogleAuth', false);
    expect(host.textContent).toContain('Also switch Google on in Supabase');
  });
});
