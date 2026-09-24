/**
 * A /product/<id> address opened before the catalogue loaded shows the
 * product page with no product; once the catalogue arrives, this is the
 * product to open.
 *
 * Only that case. Leaving a product page clears the product a moment before
 * the address changes, so "on /product/<id> with no product selected" alone
 * also describes someone who just clicked the logo or Products. Reading it as
 * a deep link opened the product again, and every link on a product page did
 * nothing. The product page must still be the one showing.
 */
export function pendingDeepLinkProduct<P extends { id: string }>(args: {
  pathname: string;
  activeTab: string;
  selectedProductId: string | null | undefined;
  products: readonly P[];
  notFound: boolean;
}): P | null {
  const { pathname, activeTab, selectedProductId, products, notFound } = args;
  if (notFound || activeTab !== 'product_detail' || selectedProductId) return null;
  const match = pathname.match(/^\/product\/([^/]+)$/);
  if (!match) return null;
  let id: string;
  try {
    id = decodeURIComponent(match[1]);
  } catch {
    return null; // a malformed address is not a product
  }
  return products.find(p => p.id === id) ?? null;
}
