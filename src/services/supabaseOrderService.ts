import { supabase } from '../lib/supabase';
import { CartItem, Order, OrderStatus, PaymentMethod, Currency, Product } from '../types';

/**
 * Server-authoritative checkout against Supabase.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * THE AUTHORITATIVE FUNCTION (read from the live database, not guessed)
 * ──────────────────────────────────────────────────────────────────────────────
 *   private.checkout_create_order(
 *     p_shipping        jsonb,
 *     p_payment_method  payment_method,
 *     p_currency        currency_code,
 *     p_delivery_speed  delivery_speed,
 *     p_items           jsonb,
 *     p_coupon_code     text DEFAULT NULL,
 *     p_idempotency_key text DEFAULT NULL
 *   ) RETURNS uuid
 *   SECURITY DEFINER, search_path = public, private
 *
 * It returns the new order's UUID and nothing else. It is solely responsible
 * for: authenticating the caller, resolving and validating the region and
 * delivery speed, reading authoritative unit prices from `products`, checking
 * publication/seller/category visibility, validating and atomically
 * decrementing stock under FOR UPDATE, applying product bundles, applying
 * active discount rules, validating and metering coupons, computing delivery,
 * capping the discount at 70% of subtotal, and writing `orders` +
 * `order_items` in a single transaction. None of that is reproduced or
 * second-guessed here.
 *
 * Because the RPC returns only an id, the call itself cannot reveal the
 * authoritative money values. `createOrderAuthoritative` therefore reads the
 * committed row back and returns that. Client-supplied subtotal, discount,
 * delivery fee and total are never sent to the server and never used to render
 * a placed order.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * WHAT WAS WRONG BEFORE
 * ──────────────────────────────────────────────────────────────────────────────
 *   supabase.rpc('checkout_create_order', { order_payload: payload })
 *     -> targets public.checkout_create_order, which does not exist
 *     -> passes one blob where seven named parameters are required
 *   supabase.rpc('private.checkout_create_order', ...)
 *     -> PostgREST does not accept a dotted, schema-qualified function name
 * Both failed, and both fell through to `return {}` — so checkout reported
 * success while creating nothing, then fell back to a dead Firebase callable.
 * The correct form is supabase.rpc('checkout_create_order'), the public
 * delegate to private.checkout_create_order_gateway. Only `public` is
 * guaranteed to be exposed through the Data API.
 */

/** RFC 4122 shape. `products.id` is uuid; Firebase slugs like `prod-2` are not. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CheckoutRpcPayload {
  items: {
    /** Must be a `products.id` UUID. */
    productId: string;
    quantity: number;
    selectedOption?: string;
  }[];
  shipping: {
    fullName: string;
    phone: string;
    email?: string;
    /** Region id, name_en or name_ar — the RPC resolves all three. */
    governorate: string;
    city: string;
    village?: string;
    street: string;
    building: string;
    floorApartment?: string;
    deliveryNotes?: string;
    deliverySpeed: string;
  };
  paymentMethod: string;
  currency?: string;
  couponCode?: string;
  deliverySpeed: string;
  /** RFC 4122 v4 UUID. Reused across retries so a resubmit is idempotent. */
  idempotencyKey: string;
}

/**
 * A checkout failure with a stable `code` and a message safe to show a customer.
 *
 * `code` is the raw signal (an RPC exception name, a PostgREST code, or a
 * client-side precondition). `message` is already user-facing, so the UI can
 * render it directly without interpreting the code.
 */
export class CheckoutError extends Error {
  readonly code: string;
  /** Set for PRODUCT_UNAVAILABLE / INSUFFICIENT_STOCK, which name a product. */
  readonly productId?: string;
  /** True when the customer can sensibly retry after adjusting something. */
  readonly retryable: boolean;

  constructor(code: string, message: string, opts: { productId?: string; retryable?: boolean } = {}) {
    super(message);
    this.name = 'CheckoutError';
    this.code = code;
    this.productId = opts.productId;
    this.retryable = opts.retryable ?? false;
  }
}

/** Exceptions `private.checkout_create_order` can raise, mapped to copy. */
const RPC_ERROR_COPY: Record<string, string> = {
  INVALID_ITEMS: 'Your cart is empty or has too many different items. Orders are limited to 50 distinct items.',
  INVALID_SHIPPING: 'Your delivery details are incomplete. Please review them and try again.',
  REGION_REQUIRED: 'Please choose a delivery region.',
  INVALID_REGION: 'We do not deliver to the selected region. Please choose another.',
  INVALID_DELIVERY_SPEED: 'That delivery speed is not available for the selected region.',
  EXPRESS_UNAVAILABLE: 'Express delivery is not available for the selected region.',
  INVALID_PRODUCT_ID: 'One of the items in your cart is no longer valid. Please empty your cart and add the items again.',
  INVALID_QUANTITY: 'Please choose a quantity between 1 and 99 for each item.',
  INVALID_OPTION: 'One of the selected product options is too long. Please reselect it.',
  MAX_TOTAL_QUANTITY_EXCEEDED: 'Your order exceeds the maximum of 200 units. Please reduce the quantities.',
  MAX_ORDER_VALUE_EXCEEDED: 'Your order exceeds the maximum order value. Please split it into smaller orders.',
  INVALID_COUPON: 'That coupon code is not valid or has expired.',
  COUPON_EXHAUSTED: 'That coupon has reached its usage limit.',
  COUPON_USER_LIMIT: 'You have already used that coupon the maximum number of times.',
};

/** Failures the customer can meaningfully act on and retry. */
const RETRYABLE = new Set([
  'INSUFFICIENT_STOCK',
  'PRODUCT_UNAVAILABLE',
  'INVALID_COUPON',
  'COUPON_EXHAUSTED',
  'COUPON_USER_LIMIT',
  'INVALID_QUANTITY',
  'EXPRESS_UNAVAILABLE',
  'INVALID_DELIVERY_SPEED',
  'INVALID_REGION',
  'REGION_REQUIRED',
  'NETWORK',
]);

/**
 * Translates a PostgREST/Postgres error into a CheckoutError.
 *
 * Every branch yields a code and a message; nothing is swallowed.
 */
function toCheckoutError(error: { message?: string; code?: string; details?: string; hint?: string }): CheckoutError {
  const raw = `${error?.message ?? ''} ${error?.details ?? ''}`.trim();

  // Codes that embed the offending product uuid: "INSUFFICIENT_STOCK:<uuid>".
  const scoped = raw.match(/\b(INSUFFICIENT_STOCK|PRODUCT_UNAVAILABLE):([0-9a-f-]{36})/i);
  if (scoped) {
    const code = scoped[1].toUpperCase();
    return new CheckoutError(
      code,
      code === 'INSUFFICIENT_STOCK'
        ? 'Sorry — one of the items in your cart just sold out or no longer has enough stock. Please adjust the quantity.'
        : 'Sorry — one of the items in your cart is no longer available. Please remove it and try again.',
      { productId: scoped[2], retryable: true }
    );
  }

  for (const [code, message] of Object.entries(RPC_ERROR_COPY)) {
    if (raw.includes(code)) {
      return new CheckoutError(code, message, { retryable: RETRYABLE.has(code) });
    }
  }

  if (/authentication required/i.test(raw)) {
    return new CheckoutError('UNAUTHENTICATED', 'Please sign in to place your order.');
  }
  if (/valid UUID idempotency key required/i.test(raw)) {
    return new CheckoutError('BAD_IDEMPOTENCY_KEY', 'Something went wrong starting your checkout. Please refresh the page and try again.');
  }

  // PGRST106: the target schema is not in PostgREST's exposed-schema list.
  // A deployment misconfiguration, not a customer problem — so the message
  // names the exact remedy for whoever reads the logs.
  if (error?.code === 'PGRST106' || /schema must be one of the following/i.test(raw)) {
    return new CheckoutError(
      'PRIVATE_SCHEMA_NOT_EXPOSED',
      'Checkout is temporarily unavailable. (Configuration: the "private" schema is not exposed to the API. ' +
        'Add it in Supabase Dashboard → Project Settings → API → Exposed schemas.)'
    );
  }
  // PGRST202: no function with that name and argument list.
  if (error?.code === 'PGRST202') {
    return new CheckoutError(
      'CHECKOUT_RPC_NOT_FOUND',
      'Checkout is temporarily unavailable. (Configuration: private.checkout_create_order was not found with the expected arguments.)'
    );
  }
  if (error?.code === '42501' || /permission denied|row-level security/i.test(raw)) {
    return new CheckoutError('FORBIDDEN', 'You do not have permission to place this order. Please sign in again.');
  }
  if (/failed to fetch|network|timeout/i.test(raw)) {
    return new CheckoutError('NETWORK', 'Network problem while placing your order. Please check your connection and try again.', { retryable: true });
  }

  return new CheckoutError('UNKNOWN', 'We could not place your order. Please try again, or contact support if it keeps happening.');
}

const asStr = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);
const asNum = (v: unknown, d = 0): number => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  // Postgres numeric arrives as a string over PostgREST.
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return d;
};
const asStrArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

/** Rebuilds a CartItem from an `order_items` row, using the purchase-time snapshot. */
function orderItemToCartItem(row: Record<string, unknown>): CartItem {
  const snap = (row.product_snapshot ?? {}) as Record<string, unknown>;

  const product: Product = {
    id: asStr(row.product_id) || asStr(snap.id),
    name: asStr(snap.name),
    arabicName: asStr(snap.arabic_name) || undefined,
    artisan: asStr(snap.artisan) || asStr(snap.seller_name),
    seller: asStr(snap.seller_name) || undefined,
    sellerId: asStr(snap.seller_id) || undefined,
    origin: '',
    category: asStr(snap.category_id),
    // Historical unit price at purchase time. Never re-read from the live
    // catalog: a past order must not change when a price changes.
    priceUSD: asNum(row.unit_price_usd, asNum(snap.price_usd)),
    rating: 0,
    reviewsCount: 0,
    image: asStr(snap.image),
    description: '',
    craftStory: '',
    stock: 0,
    tags: [],
  };

  return {
    product,
    quantity: asNum(row.quantity, 1),
    selectedOption: asStr(row.selected_option) || undefined,
  };
}

/** Maps an `orders` row (with embedded `order_items`) to the frontend Order. */
export function mapSupabaseOrder(row: Record<string, unknown>): Order {
  const itemRows = Array.isArray(row.order_items) ? (row.order_items as Record<string, unknown>[]) : [];
  const shipping = (row.shipping ?? {}) as Record<string, unknown>;

  return {
    id: asStr(row.id),
    userId: asStr(row.user_id) || undefined,
    sellerIds: asStrArr(row.seller_ids),
    productIds: asStrArr(row.product_ids),
    date: asStr(row.created_at) || asStr(row.order_date) || new Date().toISOString(),
    items: itemRows.map(orderItemToCartItem),
    shipping: {
      fullName: asStr(shipping.full_name ?? shipping.fullName),
      phone: asStr(shipping.phone),
      email: asStr(shipping.email),
      governorate: asStr(shipping.governorate ?? shipping.region_id),
      city: asStr(shipping.city),
      village: asStr(shipping.village) || undefined,
      street: asStr(shipping.street),
      building: asStr(shipping.building),
      floorApartment: asStr(shipping.floor_apartment ?? shipping.floorApartment) || undefined,
      deliveryNotes: asStr(shipping.delivery_notes ?? shipping.deliveryNotes) || undefined,
      deliverySpeed: asStr(shipping.delivery_speed ?? shipping.deliverySpeed, 'standard') as Order['shipping']['deliverySpeed'],
    },
    paymentMethod: asStr(row.payment_method, 'cod_usd') as PaymentMethod,
    currency: asStr(row.currency, 'USD').toUpperCase() as Currency,
    // Every money field below is the server's, read back from the committed row.
    subtotalUSD: asNum(row.subtotal_usd),
    deliveryFeeUSD: asNum(row.delivery_fee_usd),
    discountUSD: asNum(row.discount_usd),
    totalUSD: asNum(row.total_usd),
    totalLBP: asNum(row.total_lbp),
    status: asStr(row.status, 'pending') as OrderStatus,
    estimatedDelivery: asStr(row.estimated_delivery),
    trackingNumber: asStr(row.tracking_number),
    appliedCoupon: asStr(row.applied_coupon) || undefined,
    adminNotes: Array.isArray(row.admin_notes) ? (row.admin_notes as Order['adminNotes']) : undefined,
  };
}

/** Single projection for every order read, so the embed name is declared once. */
const ORDER_SELECT = '*, order_items(*)';

export const supabaseOrderService = {
  /**
   * Calls the authoritative checkout RPC and returns the new order's UUID.
   *
   * Throws CheckoutError on every failure path. Never returns an empty object,
   * never falls back to another implementation.
   */
  async checkoutCreateOrder(payload: CheckoutRpcPayload): Promise<{ orderId: string }> {
    // Fail before the round trip if the cart carries non-UUID product ids. The
    // RPC casts `product_id` to uuid and would raise INVALID_PRODUCT_ID;
    // catching it here gives a clearer diagnostic and proves we never send
    // Firebase slugs (e.g. `prod-2`) as `product_id`.
    const badIds = payload.items
      .map((i) => String(i.productId ?? '').trim())
      .filter((id) => !UUID_RE.test(id));
    if (badIds.length > 0) {
      console.error(
        '[checkout] Cart contains product ids that are not products.id UUIDs: ' +
          `${badIds.join(', ')}. These look like legacy Firebase slugs; the catalog must supply ` +
          'Supabase UUIDs (products.legacy_id holds the old slug).'
      );
      throw new CheckoutError(
        'CLIENT_PRODUCT_ID_NOT_UUID',
        'Some items in your cart are out of date. Please empty your cart, add the items again, and retry.'
      );
    }

    if (!UUID_RE.test(payload.idempotencyKey.trim())) {
      throw new CheckoutError(
        'BAD_IDEMPOTENCY_KEY',
        'Something went wrong starting your checkout. Please refresh the page and try again.'
      );
    }

    const { data, error } = await supabase.rpc('checkout_create_order', {
      // The RPC reads the region from region_id, then regionId, then
      // governorate. Both keys are sent so an id or a display name resolves.
      p_shipping: {
        region_id: payload.shipping.governorate,
        governorate: payload.shipping.governorate,
        full_name: payload.shipping.fullName,
        phone: payload.shipping.phone,
        email: payload.shipping.email ?? null,
        city: payload.shipping.city,
        village: payload.shipping.village ?? null,
        street: payload.shipping.street,
        building: payload.shipping.building,
        floor_apartment: payload.shipping.floorApartment ?? null,
        delivery_notes: payload.shipping.deliveryNotes ?? null,
        delivery_speed: payload.deliverySpeed,
      },
      p_payment_method: payload.paymentMethod,
      p_currency: payload.currency ?? 'USD',
      p_delivery_speed: payload.deliverySpeed,
      p_items: payload.items.map((i) => ({
        product_id: i.productId,
        quantity: i.quantity,
        selected_option: i.selectedOption ?? null,
      })),
      p_coupon_code: payload.couponCode ? payload.couponCode.trim().toUpperCase() : null,
      p_idempotency_key: payload.idempotencyKey.trim(),
    });

    if (error) {
      // Log the raw error for operators; throw only the customer-safe message.
      console.error('[checkout] private.checkout_create_order failed:', error);
      throw toCheckoutError(error);
    }

    // RETURNS uuid — a scalar, delivered as a bare string.
    const orderId = typeof data === 'string' ? data.trim() : '';
    if (!UUID_RE.test(orderId)) {
      console.error('[checkout] RPC returned an unexpected value instead of an order uuid:', data);
      throw new CheckoutError(
        'NO_ORDER_ID',
        'Your order may have been placed but we could not confirm it. Please check your order history before trying again.'
      );
    }

    return { orderId };
  },

  /** Reads one order with its line items. RLS scopes visibility. */
  async fetchOrderById(orderId: string): Promise<Order | null> {
    // A non-uuid would make Postgres reject the comparison outright.
    if (!UUID_RE.test(orderId.trim())) return null;

    const { data, error } = await supabase.from('orders').select(ORDER_SELECT).eq('id', orderId.trim()).maybeSingle();
    if (error) {
      console.error('[checkout] fetchOrderById failed:', error);
      return null;
    }
    return data ? mapSupabaseOrder(data as Record<string, unknown>) : null;
  },

  /**
   * Looks up one order by its server-assigned tracking number (`YAL-...`).
   *
   * No ownership filter: `orders_read` already restricts rows to the owner, an
   * admin, or a seller on the order. A non-owner simply gets zero rows, so the
   * client never has to decide who may see what.
   */
  async fetchOrderByTrackingNumber(trackingNumber: string): Promise<Order | null> {
    const clean = trackingNumber.trim();
    if (!clean) return null;

    const { data, error } = await supabase
      .from('orders')
      .select(ORDER_SELECT)
      .eq('tracking_number', clean.toUpperCase())
      .maybeSingle();

    if (error) {
      console.error('[orders] fetchOrderByTrackingNumber failed:', error);
      return null;
    }
    return data ? mapSupabaseOrder(data as Record<string, unknown>) : null;
  },

  /**
   * Places an order and returns the authoritative row the database committed.
   *
   * Combined deliberately: the RPC yields only an id, so a caller that skipped
   * the read-back would have to fall back to client-computed money values.
   * This makes that impossible.
   */
  async createOrderAuthoritative(payload: CheckoutRpcPayload): Promise<Order> {
    const { orderId } = await this.checkoutCreateOrder(payload);

    const order = await this.fetchOrderById(orderId);
    if (!order) {
      // The order exists — the RPC committed it — but it cannot be read back.
      // Say so precisely: retrying with the same idempotency key is safe and
      // returns the same order, but the customer must not be told it failed.
      throw new CheckoutError(
        'ORDER_CREATED_BUT_UNREADABLE',
        `Your order was placed (reference ${orderId}) but we could not load its details. ` +
          'Please check your order history — do not place the order again.'
      );
    }
    return order;
  },

  /** Orders visible to the caller. RLS decides scope: own, seller's, or all. */
  async fetchOrders(): Promise<Order[]> {
    // No .eq('user_id', ...) filter: `orders_read` already restricts rows to
    // the owner, an admin, or a seller listed in seller_ids. Filtering here
    // would make the client the authorization boundary, which it must not be.
    const { data, error } = await supabase
      .from('orders')
      .select(ORDER_SELECT)
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) {
      console.error('[orders] fetchOrders failed:', error);
      throw error;
    }
    return ((data ?? []) as Record<string, unknown>[]).map(mapSupabaseOrder);
  },

  /** Admin/seller status update. Column-level grants decide what may change. */
  async updateOrderStatus(orderId: string, status: OrderStatus, adminNotes?: unknown[]): Promise<void> {
    const payload: Record<string, unknown> = { status };
    if (adminNotes !== undefined) payload.admin_notes = adminNotes;

    // A write RLS filters succeeds with zero rows, so ask for the row back:
    // an unverified administrator must not see a status change 'succeed'.
    const { data: updated, error } = await supabase
      .from('orders')
      .update(payload)
      .eq('id', orderId)
      .select('id');
    if (!error && (!updated || updated.length === 0)) {
      throw new Error(`[orders] updateOrder: order ${orderId} was not updated. Your session may not be verified for administrator changes.`);
    }
    if (error) {
      console.error('[orders] updateOrderStatus failed:', error);
      throw error;
    }
  },

  /**
   * Deletes an order. Admin only, and never a delivered one.
   *
   * `public.orders` has SELECT/INSERT/UPDATE policies but no DELETE policy, so
   * `supabase.from('orders').delete()` is filtered out by RLS and PostgREST
   * reports success having removed nothing — which is what the admin panel was
   * doing. Deletion therefore goes through private.admin_delete_order, a
   * SECURITY DEFINER function that checks is_admin() from auth.uid(), refuses a
   * delivered order, and returns the id it actually deleted. order_items rows
   * follow through the FK's ON DELETE CASCADE.
   *
   * Throws on refusal so the caller cannot report a deletion that did not
   * happen:
   *   42501 - the caller is not an administrator
   *   P0002 - no such order
   *   P0001 - the order is delivered
   */
  async deleteOrder(orderId: string): Promise<void> {
    if (!UUID_RE.test(orderId)) {
      throw new Error(
        `[orders] deleteOrder: "${orderId}" is not an orders.id UUID. Legacy ` +
          'Firebase order references (e.g. YLB-98421) cannot address a row.'
      );
    }

    const { data, error } = await supabase
      .rpc('admin_delete_order', { p_order_id: orderId });

    if (error) {
      console.error('[orders] deleteOrder failed:', error);
      throw error;
    }

    // The function returns the deleted id; anything else means no row went.
    if (!data) {
      throw new Error(`[orders] deleteOrder: order ${orderId} was not deleted.`);
    }
  },
};
