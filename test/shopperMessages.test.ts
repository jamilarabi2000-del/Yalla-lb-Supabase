import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  accountCreatedMessage, addedToCartMessage, detailsNotSavedMessage, providerSignInFailedMessage, redirectingToProviderMessage,
  removedFromCartMessage, signedInMessage, signedOutHereMessage, signedOutMessage, verificationEmailFailedMessage,
} from '../src/lib/shopperMessages';

// An Arabic shopper who added an item to the basket read "Added 1x "Wild Zaatar"
// to cart!" in English, with its "!" at the wrong end of the line. The messages a
// shopper gets after they act now come in their language; English is unchanged.
const read = (f: string) => fs.readFileSync(path.resolve(process.cwd(), f), 'utf8');

describe('added to the basket', () => {
  const zaatar = { name: 'Wild Zaatar (250 g)', arabicName: 'زعتر بري (٢٥٠ غ)' };

  it('English is exactly what it was, parenthesis dropped from the name', () => {
    expect(addedToCartMessage(zaatar, 2, 'en')).toBe('Added 2x "Wild Zaatar" to cart!');
    expect(addedToCartMessage({ name: 'Olive Oil' }, 1, 'en')).toBe('Added 1x "Olive Oil" to cart!');
  });

  it('Arabic names the product in Arabic, with the count', () => {
    expect(addedToCartMessage(zaatar, 2, 'ar')).toBe('تمت إضافة 2× "زعتر بري" إلى السلة!');
  });

  it('Arabic falls back to the English name when the product has no Arabic one', () => {
    expect(addedToCartMessage({ name: 'Olive Oil', arabicName: '' }, 1, 'ar')).toBe('تمت إضافة 1× "Olive Oil" إلى السلة!');
    expect(addedToCartMessage({ name: 'Olive Oil' }, 1, 'ar')).toBe('تمت إضافة 1× "Olive Oil" إلى السلة!');
  });

  it('English never shows the Arabic name', () => {
    expect(addedToCartMessage(zaatar, 1, 'en')).not.toMatch(/[؀-ۿ]/);
  });
});

describe('every message, in Arabic and in English', () => {
  const all = (language: string) => ({
    removed: removedFromCartMessage(language),
    redirectGoogle: redirectingToProviderMessage('Google', language),
    redirectApple: redirectingToProviderMessage('Apple', language),
    failedGoogle: providerSignInFailedMessage('Google', undefined, language),
    failedApple: providerSignInFailedMessage('Apple', 'popup closed', language),
    created: accountCreatedMessage(language),
    signedIn: signedInMessage(language),
    signedOut: signedOutMessage(language),
    signedOutHere: signedOutHereMessage(language),
    notSaved: detailsNotSavedMessage(language),
    verifyFailed: verificationEmailFailedMessage(language),
  });

  it('English is word for word what the site said before', () => {
    expect(all('en')).toEqual({
      removed: 'Item removed from cart',
      redirectGoogle: 'Redirecting to Google sign in...',
      redirectApple: 'Redirecting to Apple sign in...',
      failedGoogle: 'Failed to sign in with Google: Unknown error',
      failedApple: 'Failed to sign in with Apple: popup closed',
      created: 'Account created successfully!',
      signedIn: 'Successfully signed in!',
      signedOut: 'Signed out successfully',
      signedOutHere: 'Signed out',
      notSaved: 'Could not save your details. Please try again.',
      verifyFailed: 'Failed to resend verification email.',
    });
  });

  it('Arabic has no English in it, apart from the provider names and the reason the provider gave', () => {
    for (const [name, text] of Object.entries(all('ar'))) {
      const english = text.replace(/Google|Apple|popup closed/g, '');
      expect(english, name).not.toMatch(/[A-Za-z]/);
      expect(text, name).toMatch(/[؀-ۿ]/);
    }
  });

  it('a provider that gave a reason has it shown, in either language', () => {
    expect(providerSignInFailedMessage('Google', 'Access blocked', 'en')).toBe('Failed to sign in with Google: Access blocked');
    expect(providerSignInFailedMessage('Google', 'Access blocked', 'ar')).toContain('Access blocked');
  });

  it('any other language gets English', () => {
    expect(removedFromCartMessage('fr')).toBe('Item removed from cart');
    expect(addedToCartMessage({ name: 'Olive Oil', arabicName: 'زيت زيتون' }, 1, 'fr')).toBe('Added 1x "Olive Oil" to cart!');
  });
});

describe('the shop uses them', () => {
  const ctx = read('src/context/ShopContext.tsx');

  it('through the helper, with the shopper\'s language', () => {
    for (const call of [
      'showToast(addedToCartMessage(currentProduct, plan.added, language));',
      "showToast(allInBasketMessage(currentProduct, plan.stock, language), 'warning');",
      "showToast(addedLimitedMessage(currentProduct, plan.added, plan.stock, plan.total, language), 'warning');",
      "showToast(removedFromCartMessage(language), 'info');",
      "showToast(redirectingToProviderMessage('Google', language), 'info');",
      "showToast(providerSignInFailedMessage('Google', error.message, language), 'warning');",
      "showToast(redirectingToProviderMessage('Apple', language), 'info');",
      "showToast(providerSignInFailedMessage('Apple', error.message, language), 'warning');",
      "showToast(accountCreatedMessage(language), 'success');",
      "showToast(signedInMessage(language), 'success');",
      "showToast(signedOutMessage(language), 'info');",
      "showToast(signedOutHereMessage(language), 'info');",
      "showToast(detailsNotSavedMessage(language), 'error');",
      'showToast(err.message || verificationEmailFailedMessage(language)',
    ]) expect(ctx, call).toContain(call);
  });

  it('and the English-only literals are gone', () => {
    for (const literal of [
      "showToast('Item removed from cart'", 'to cart!`)', "showToast('Redirecting to", "showToast('Failed to sign in with",
      "showToast('Account created successfully!'", "showToast('Successfully signed in!'", "showToast('Signed out successfully'",
      "showToast('Signed out'", "showToast('Could not save your details. Please try again.'",
    ]) expect(ctx, literal).not.toContain(literal);
  });
});
