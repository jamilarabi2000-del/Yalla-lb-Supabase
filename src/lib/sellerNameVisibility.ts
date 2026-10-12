/**
 * The admin's "Show seller name" switch (CMS Studio → Visibility). Every place a shopper sees or searches a seller's
 * (artisan's) name asks this one question, so the switch cannot be honoured in one place and forgotten in another.
 *
 * A missing value means "show": a site saved before the switch existed keeps its names until the admin turns it off.
 * This hides the name on screen. It does not remove it from the data the shop loads.
 */
export const sellerNameShown = (visibility?: { sellerName?: boolean } | null): boolean => visibility?.sellerName !== false;
