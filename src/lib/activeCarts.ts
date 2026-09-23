/**
 * The admin Active Carts view's logic, kept pure for testing.
 *
 * A cart row is written by its shopper, so nothing in it is trusted: each
 * line is checked, and names, prices and availability come from the catalog
 * by product id. The stored snapshot supplies only the name of a product that
 * no longer exists; its image URL is never used, so a crafted cart cannot make
 * the admin's browser load an address of the shopper's choosing.
 */
import type { Product } from '../types';

export interface CartRow {
  user_id: string;
  items: unknown;
  updated_at: string;
}

export type LineProblem = 'removed' | 'unpublished' | 'out_of_stock';

export interface CartLine {
  productId: string;
  name: string;
  quantity: number;
  /** Current catalog price; the checkout charges this, not the snapshot. */
  unitPriceUSD: number;
  lineTotalUSD: number;
  problem?: LineProblem;
}

export interface ActiveCart {
  userId: string;
  lines: CartLine[];
  /** Lines that could never be checked out (bad quantity, no product id). */
  ignoredLines: number;
  units: number;
  /** Purchasable lines only. */
  subtotalUSD: number;
  updatedAt: string;
  minutesIdle: number;
  abandoned: boolean;
}

/** Idle this long and the cart counts as abandoned. */
export const ABANDONED_AFTER_MINUTES = 30;
/** checkout_create_order refuses any other quantity (INVALID_QUANTITY). */
export const MAX_LINE_QUANTITY = 99;

const toCents = (n: number) => Math.round(n * 100);

export function parseCartLines(items: unknown, productsById: Map<string, Product>): { lines: CartLine[]; ignored: number } {
  const lines: CartLine[] = [];
  let ignored = 0;
  for (const raw of Array.isArray(items) ? items : []) {
    const entry = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
    const snapshot = (entry.product && typeof entry.product === 'object' ? entry.product : {}) as Record<string, any>;
    const productId = typeof snapshot.id === 'string' ? snapshot.id : '';
    const quantity = entry.quantity;
    if (!productId || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_LINE_QUANTITY) {
      ignored += 1;
      continue;
    }

    const product = productsById.get(productId);
    const problem: LineProblem | undefined = !product ? 'removed'
      : product.isPublished === false ? 'unpublished'
      : !(Number(product.stock) > 0) ? 'out_of_stock'
      : undefined;
    const unitPriceUSD = product && Number.isFinite(product.priceUSD) ? product.priceUSD : 0;
    lines.push({
      productId,
      name: product?.name || (typeof snapshot.name === 'string' && snapshot.name.trim()) || 'Unknown product',
      quantity,
      unitPriceUSD,
      lineTotalUSD: toCents(unitPriceUSD) * quantity / 100,
      problem,
    });
  }
  return { lines, ignored };
}

export function buildActiveCarts(rows: CartRow[], products: Product[], now: number = Date.now()): ActiveCart[] {
  const productsById = new Map(products.map(p => [p.id, p]));
  const carts: ActiveCart[] = [];
  for (const row of rows) {
    const { lines, ignored } = parseCartLines(row.items, productsById);
    if (lines.length === 0) continue;
    const purchasable = lines.filter(l => !l.problem);
    const updated = Date.parse(row.updated_at);
    const minutesIdle = Number.isFinite(updated) ? Math.max(0, Math.floor((now - updated) / 60000)) : 0;
    carts.push({
      userId: row.user_id,
      lines,
      ignoredLines: ignored,
      units: lines.reduce((sum, l) => sum + l.quantity, 0),
      subtotalUSD: purchasable.reduce((sum, l) => sum + toCents(l.unitPriceUSD) * l.quantity, 0) / 100,
      updatedAt: row.updated_at,
      minutesIdle,
      abandoned: minutesIdle >= ABANDONED_AFTER_MINUTES,
    });
  }
  return carts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Figures computed from the carts themselves -- nothing estimated. */
export function cartInsights(carts: ActiveCart[]) {
  const abandoned = carts.filter(c => c.abandoned);
  const cents = (list: ActiveCart[]) => list.reduce((sum, c) => sum + toCents(c.subtotalUSD), 0) / 100;
  return {
    carts: carts.length,
    totalValueUSD: cents(carts),
    totalUnits: carts.reduce((sum, c) => sum + c.units, 0),
    abandonedCount: abandoned.length,
    abandonedValueUSD: cents(abandoned),
  };
}

export function formatIdle(minutes: number): string {
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / (60 * 24))}d ago`;
}

export function recoveryMessage(subtotalUSD: number): string {
  return `Marhaba! We noticed you left some authentic Lebanese artisanal items in your cart on Yalla.lb ($${subtotalUSD.toFixed(2)}). Would you like help finalizing your delivery in Lebanon?`;
}
