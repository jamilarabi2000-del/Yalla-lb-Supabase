/**
 * What the storefront tells a shopper after they act, in their language. These
 * were English-only strings inside ShopContext, so an Arabic shopper who added
 * an item to the basket (the most common message on the site) read an English
 * sentence, with its "!" at the wrong end of the line.
 *
 * English is word for word what it was.
 */
const isArabic = (language: string) => language === 'ar';

type ProviderName = 'Google' | 'Apple';

/** "Added 2x "Olive Oil" to cart!" — the product's Arabic name in Arabic when it has one. */
export const addedToCartMessage = (product: { name: string; arabicName?: string }, quantity: number, language: string): string => {
  const name = ((isArabic(language) && product.arabicName) || product.name).split('(')[0].trim();
  return isArabic(language) ? `تمت إضافة ${quantity}× "${name}" إلى السلة!` : `Added ${quantity}x "${name}" to cart!`;
};

export const removedFromCartMessage = (language: string): string =>
  isArabic(language) ? 'تمت إزالة المنتج من السلة' : 'Item removed from cart';

export const redirectingToProviderMessage = (provider: ProviderName, language: string): string =>
  isArabic(language) ? `جارٍ تحويلك إلى تسجيل الدخول عبر ${provider}...` : `Redirecting to ${provider} sign in...`;

/** The reason the provider gave is shown as it came: it is the useful part. */
export const providerSignInFailedMessage = (provider: ProviderName, reason: string | undefined, language: string): string =>
  isArabic(language)
    ? `تعذر تسجيل الدخول عبر ${provider}: ${reason || 'خطأ غير معروف'}`
    : `Failed to sign in with ${provider}: ${reason || 'Unknown error'}`;

export const accountCreatedMessage = (language: string): string =>
  isArabic(language) ? 'تم إنشاء الحساب بنجاح!' : 'Account created successfully!';

export const signedInMessage = (language: string): string =>
  isArabic(language) ? 'تم تسجيل الدخول بنجاح!' : 'Successfully signed in!';

export const signedOutMessage = (language: string): string =>
  isArabic(language) ? 'تم تسجيل الخروج بنجاح' : 'Signed out successfully';

/** Shown when signing out hit a snag but the visitor is signed out on this device regardless. */
export const signedOutHereMessage = (language: string): string =>
  isArabic(language) ? 'تم تسجيل الخروج' : 'Signed out';

export const detailsNotSavedMessage = (language: string): string =>
  isArabic(language) ? 'تعذر حفظ بياناتك. يرجى المحاولة مرة أخرى.' : 'Could not save your details. Please try again.';

export const verificationEmailFailedMessage = (language: string): string =>
  isArabic(language) ? 'تعذر إعادة إرسال بريد التحقق.' : 'Failed to resend verification email.';
