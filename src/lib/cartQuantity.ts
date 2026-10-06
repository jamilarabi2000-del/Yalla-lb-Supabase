/**
 * How much of a product can go into the basket, and what happened when a shopper asked for some.
 *
 * Stock is a hard limit: the server refuses an order for more than exists. The storefront used to
 * let a shopper pick any quantity in Quick View, quietly keep only what was in stock, and then say
 * "Added 3 to your basket" (a second message replaced the stock warning). One rule, here, now
 * decides how many go in, so the basket, the message and the quantity stepper cannot disagree.
 */

/** A product's stock as a whole number of at least 0 (anything unreadable counts as none). */
export const stockOf = (product: { stock?: unknown } | null | undefined): number => {
  const n = Number(product?.stock);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
};

/** How many more can still be added, given how many are already in the basket. */
export const remainingStock = (stock: number, inBasket: number): number => Math.max(0, stock - Math.max(0, inBasket));

/** A requested quantity as a whole number of at least 1. */
const asked = (requested: unknown): number => {
  const n = Math.floor(Number(requested));
  return Number.isFinite(n) && n >= 1 ? n : 1;
};

/**
 * What adding `requested` of a product does:
 *  - out-of-stock: there is none to add;
 *  - at-limit:     all there is, is already in the basket; nothing is added;
 *  - limited:      some were added, fewer than asked for, because stock ran out;
 *  - added:        all that was asked for.
 * `total` is what the basket line holds afterwards: never more than the stock, even if the line
 * had grown past it because the stock dropped after it was added.
 */
export type AddPlan =
  | { status: 'out-of-stock'; stock: number; added: 0; total: 0 }
  | { status: 'at-limit'; stock: number; added: 0; total: number }
  | { status: 'limited'; stock: number; added: number; total: number }
  | { status: 'added'; stock: number; added: number; total: number };

export function planAdd(stock: number, inBasket: number, requested: number): AddPlan {
  const have = Math.max(0, Math.floor(inBasket) || 0);
  if (stock <= 0) return { status: 'out-of-stock', stock: 0, added: 0, total: 0 };
  const room = remainingStock(stock, have);
  if (room <= 0) return { status: 'at-limit', stock, added: 0, total: Math.min(have, stock) };
  const wanted = asked(requested);
  const added = Math.min(wanted, room);
  return { status: added < wanted ? 'limited' : 'added', stock, added, total: have + added };
}

/** The quantity in the basket line for this product and option (0 if there is none). */
export const quantityInBasket = (cart: ReadonlyArray<{ product: { id: string }; quantity: number; selectedOption?: string }>, productId: string, option?: string): number =>
  cart.find(line => line.product.id === productId && line.selectedOption === option)?.quantity ?? 0;
