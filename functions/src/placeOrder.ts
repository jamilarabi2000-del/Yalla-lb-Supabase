import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { initializeApp, getApps } from 'firebase-admin/app';
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { computeDiscounts, round2 } from './pricing.js';
import { computeDelivery } from './delivery.js';
import { getDb } from './db.js';

if (getApps().length === 0) {
  initializeApp();
}

export function computeRequestFingerprint(payload: {
  items: Array<{ productId: string; quantity: number; selectedOption?: string }>;
  shipping: ShippingDetails;
  paymentMethod: string;
  couponCode?: string;
  deliverySpeed?: string;
}): string {
  const sortedItems = [...payload.items].sort((a, b) => a.productId.localeCompare(b.productId)).map(i => ({
    productId: i.productId.trim(),
    quantity: i.quantity,
    selectedOption: i.selectedOption ? i.selectedOption.trim() : null
  }));

  const canonical = {
    items: sortedItems,
    shipping: {
      fullName: payload.shipping.fullName,
      phone: payload.shipping.phone,
      governorate: payload.shipping.governorate,
      city: payload.shipping.city,
      street: payload.shipping.street,
      building: payload.shipping.building,
      deliveryNotes: payload.shipping.deliveryNotes || '',
      deliverySpeed: payload.shipping.deliverySpeed,
    },
    paymentMethod: payload.paymentMethod.trim().toLowerCase(),
    deliverySpeed: payload.deliverySpeed ? payload.deliverySpeed.trim().toLowerCase() : payload.shipping.deliverySpeed,
    couponCode: payload.couponCode ? payload.couponCode.trim() : null,
  };

  const jsonStr = JSON.stringify(canonical, Object.keys(canonical).sort());
  return createHash('sha256').update(jsonStr).digest('hex');
}

export interface ShippingDetails {
  fullName: string;
  phone: string;
  governorate: string;
  city: string;
  street: string;
  building: string;
  deliveryNotes?: string;
  deliverySpeed: 'standard' | 'express_beirut' | 'diaspora_air' | 'diaspora_global';
}

export interface ShippingInput {
  fullName: string;
  phone: string;
  governorate: string;
  city: string;
  street?: string;
  address?: string;
  building: string;
  deliveryNotes?: string;
  notes?: string;
  deliverySpeed?: string;
}

export interface PlaceOrderCartItem {
  productId: string;
  quantity: number;
  selectedOption?: string;
}

export interface PlaceOrderRequest {
  items: PlaceOrderCartItem[];
  shipping: ShippingInput;
  paymentMethod: string;
  couponCode?: string;
  deliverySpeed?: string;
  idempotencyKey: string;
}

export const ALLOWED_PAYMENT_METHODS = [
  'cod_usd',
  'cod_lbp',
  'wish_omt',
  'credit_card',
  'whish_pay',
  'omt_pay',
  'cash_on_delivery',
] as const;

export const ALLOWED_DELIVERY_SPEEDS = [
  'standard',
  'express_beirut',
  'diaspora_air',
  'diaspora_global',
] as const;

export type AllowedPaymentMethod = typeof ALLOWED_PAYMENT_METHODS[number];
export type AllowedDeliverySpeed = typeof ALLOWED_DELIVERY_SPEEDS[number];

export const ALLOWED_REQUEST_KEYS = new Set(['items', 'shipping', 'paymentMethod', 'couponCode', 'deliverySpeed', 'idempotencyKey']);
export const ALLOWED_ITEM_KEYS = new Set(['productId', 'quantity', 'selectedOption']);
export const ALLOWED_SHIPPING_KEYS = new Set([
  'fullName',
  'phone',
  'governorate',
  'city',
  'street',
  'address',
  'building',
  'deliveryNotes',
  'notes',
  'deliverySpeed',
]);

export const MAX_LINE_ITEMS = 50;
export const MAX_UNIQUE_PRODUCTS = 50;
export const MAX_TOTAL_QUANTITY = 200;
export const MAX_ORDER_VALUE_USD = 10000;

export const PRODUCT_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;
export const IDEMPOTENCY_KEY_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
export const MAX_IDEMPOTENCY_KEY_LENGTH = 36;

/**
 * Pure request validator for placeOrder payloads, exported for exhaustive testing.
 */
export function validatePlaceOrderPayload(data: any): {
  items: PlaceOrderCartItem[];
  cleanShipping: ShippingDetails;
  effectivePaymentMethod: AllowedPaymentMethod;
  effectiveSpeed: AllowedDeliverySpeed;
  couponCode?: string;
  totalQuantity: number;
  idempotencyKey: string;
} {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new HttpsError('invalid-argument', 'Request payload must be a non-null object.');
  }

  // 1. Strict top-level keys
  for (const key of Object.keys(data)) {
    if (!ALLOWED_REQUEST_KEYS.has(key)) {
      throw new HttpsError('invalid-argument', `Unexpected property in request: "${key}".`);
    }
  }

  const { items, shipping, paymentMethod, couponCode, deliverySpeed, idempotencyKey } = data;

  // 2. Strict idempotency key validation
  if (idempotencyKey === undefined || idempotencyKey === null) {
    throw new HttpsError('invalid-argument', 'idempotencyKey is required and must be provided by the client.');
  }
  if (typeof idempotencyKey !== 'string') {
    throw new HttpsError('invalid-argument', 'idempotencyKey must be a valid string.');
  }
  const cleanIdempotencyKey = idempotencyKey.trim();
  if (!cleanIdempotencyKey) {
    throw new HttpsError('invalid-argument', 'idempotencyKey must not be empty.');
  }
  if (cleanIdempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH || !IDEMPOTENCY_KEY_REGEX.test(cleanIdempotencyKey)) {
    throw new HttpsError(
      'invalid-argument',
      `Invalid idempotencyKey "${cleanIdempotencyKey}". Must be a valid UUID string (e.g. standard v4 UUID) up to ${MAX_IDEMPOTENCY_KEY_LENGTH} characters.`
    );
  }

  // 3. Strict cart items array bounds
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_LINE_ITEMS) {
    throw new HttpsError(
      'invalid-argument',
      `Invalid cart items count (${items?.length ?? 0}). Must contain between 1 and ${MAX_LINE_ITEMS} items.`
    );
  }

  const seenProductIds = new Set<string>();
  let totalQuantity = 0;

  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new HttpsError('invalid-argument', 'Each cart item must be a valid non-null object.');
    }
    for (const key of Object.keys(item)) {
      if (!ALLOWED_ITEM_KEYS.has(key)) {
        throw new HttpsError('invalid-argument', `Unexpected property in cart item: "${key}".`);
      }
    }

    // 2a. Strict productId validation
    if (typeof item.productId !== 'string' || !item.productId.trim()) {
      throw new HttpsError('invalid-argument', 'Each cart item must have a non-empty string productId.');
    }
    const trimmedPid = item.productId.trim();
    if (trimmedPid.length > 128 || !PRODUCT_ID_REGEX.test(trimmedPid)) {
      throw new HttpsError(
        'invalid-argument',
        `Invalid productId "${trimmedPid}". Must be alphanumeric and up to 128 characters without path traversal.`
      );
    }

    // 2b. Prevent ambiguous duplicate products
    if (seenProductIds.has(trimmedPid)) {
      throw new HttpsError(
        'invalid-argument',
        `Duplicate product ID "${trimmedPid}" detected in cart. Combine quantities into a single item line.`
      );
    }
    seenProductIds.add(trimmedPid);

    // 2c. Strict quantity validation (no float, no NaN, no string numbers, no out of bounds)
    if (
      typeof item.quantity !== 'number' ||
      !Number.isFinite(item.quantity) ||
      !Number.isInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > 99
    ) {
      throw new HttpsError(
        'invalid-argument',
        `Invalid quantity for product "${trimmedPid}". Quantity must be a valid integer between 1 and 99.`
      );
    }
    totalQuantity += item.quantity;

    // 2d. Strict selectedOption validation
    if (item.selectedOption !== undefined) {
      if (typeof item.selectedOption !== 'string') {
        throw new HttpsError('invalid-argument', 'selectedOption must be a string if provided.');
      }
      const trimmedOpt = item.selectedOption.trim();
      if (trimmedOpt.length > 100) {
        throw new HttpsError('invalid-argument', 'selectedOption exceeds 100 characters.');
      }
    }
  }

  if (seenProductIds.size > MAX_UNIQUE_PRODUCTS) {
    throw new HttpsError('invalid-argument', `Cart exceeds maximum unique product count of ${MAX_UNIQUE_PRODUCTS}.`);
  }

  if (totalQuantity > MAX_TOTAL_QUANTITY) {
    throw new HttpsError(
      'invalid-argument',
      `Total order quantity (${totalQuantity}) exceeds maximum allowed limit of ${MAX_TOTAL_QUANTITY} units.`
    );
  }

  // 3. Strict shipping details validation
  if (!shipping || typeof shipping !== 'object' || Array.isArray(shipping)) {
    throw new HttpsError('invalid-argument', 'Shipping details are required and must be an object.');
  }

  for (const key of Object.keys(shipping)) {
    if (!ALLOWED_SHIPPING_KEYS.has(key)) {
      throw new HttpsError('invalid-argument', `Unexpected property in shipping details: "${key}".`);
    }
  }

  if (typeof shipping.fullName !== 'string' || !shipping.fullName.trim()) {
    throw new HttpsError('invalid-argument', 'shipping.fullName is required and must be a non-empty string.');
  }
  if (typeof shipping.phone !== 'string' || !shipping.phone.trim()) {
    throw new HttpsError('invalid-argument', 'shipping.phone is required and must be a non-empty string.');
  }
  const ALLOWED_GOVERNORATES = [
    'beirut', 'mount_lebanon', 'north', 'south', 'bekaa', 'diaspora_global',
    'beirut (all districts)', 'mount lebanon', 'north lebanon & akkar',
    'south lebanon & nabatieh', 'bekaa & baalbek-hermel', 'international / diaspora express (dhl/aramex)',
    'بيروت', 'جبل لبنان', 'الشمال', 'الجنوب', 'البقاع'
  ];

  if (typeof shipping.governorate !== 'string' || !shipping.governorate.trim()) {
    throw new HttpsError('invalid-argument', 'shipping.governorate is required and must be a non-empty string.');
  }

  const govClean = shipping.governorate.trim().toLowerCase();
  const isGovValid = ALLOWED_GOVERNORATES.some(g => govClean.includes(g));
  if (!isGovValid) {
    throw new HttpsError('invalid-argument', `Invalid shipping governorate: "${shipping.governorate}". Must be a recognized Lebanese region or diaspora.`);
  }
  if (typeof shipping.city !== 'string' || !shipping.city.trim()) {
    throw new HttpsError('invalid-argument', 'shipping.city is required and must be a non-empty string.');
  }

  const rawStreet = shipping.street ?? shipping.address;
  if (typeof rawStreet !== 'string' || !rawStreet.trim()) {
    throw new HttpsError('invalid-argument', 'shipping.street (or address) is required and must be a non-empty string.');
  }
  if (typeof shipping.building !== 'string' || !shipping.building.trim()) {
    throw new HttpsError('invalid-argument', 'shipping.building is required and must be a non-empty string.');
  }

  const rawNotes = shipping.deliveryNotes ?? shipping.notes;
  if (rawNotes !== undefined && typeof rawNotes !== 'string') {
    throw new HttpsError('invalid-argument', 'shipping deliveryNotes must be a string if provided.');
  }

  if (shipping.fullName.trim().length > 200) {
    throw new HttpsError('invalid-argument', 'shipping.fullName exceeds 200 characters.');
  }
  if (shipping.phone.trim().length > 50) {
    throw new HttpsError('invalid-argument', 'shipping.phone exceeds 50 characters.');
  }
  if (shipping.governorate.trim().length > 100) {
    throw new HttpsError('invalid-argument', 'shipping.governorate exceeds 100 characters.');
  }
  if (shipping.city.trim().length > 100) {
    throw new HttpsError('invalid-argument', 'shipping.city exceeds 100 characters.');
  }
  if (rawStreet.trim().length > 200) {
    throw new HttpsError('invalid-argument', 'shipping.street exceeds 200 characters.');
  }
  if (shipping.building.trim().length > 100) {
    throw new HttpsError('invalid-argument', 'shipping.building exceeds 100 characters.');
  }
  if (rawNotes && rawNotes.trim().length > 1000) {
    throw new HttpsError('invalid-argument', 'shipping deliveryNotes exceeds 1000 characters.');
  }

  // 4. Strict payment method validation (no silent conversion)
  if (typeof paymentMethod !== 'string' || !paymentMethod.trim()) {
    throw new HttpsError('invalid-argument', 'paymentMethod is required and must be a valid payment method string.');
  }
  const normalizedPayment = paymentMethod.trim().toLowerCase();
  if (!ALLOWED_PAYMENT_METHODS.includes(normalizedPayment as AllowedPaymentMethod)) {
    throw new HttpsError(
      'invalid-argument',
      `Invalid payment method "${paymentMethod}". Allowed payment methods: ${ALLOWED_PAYMENT_METHODS.join(', ')}.`
    );
  }
  const effectivePaymentMethod = normalizedPayment as AllowedPaymentMethod;

  // 5. Strict delivery speed validation (no silent fallback on invalid speed)
  if (deliverySpeed !== undefined) {
    if (typeof deliverySpeed !== 'string' || !deliverySpeed.trim()) {
      throw new HttpsError('invalid-argument', 'deliverySpeed must be a valid string if provided.');
    }
    const normSpeed = deliverySpeed.trim().toLowerCase();
    if (!ALLOWED_DELIVERY_SPEEDS.includes(normSpeed as AllowedDeliverySpeed)) {
      throw new HttpsError(
        'invalid-argument',
        `Invalid deliverySpeed "${deliverySpeed}". Allowed speeds: ${ALLOWED_DELIVERY_SPEEDS.join(', ')}.`
      );
    }
  }

  if (shipping.deliverySpeed !== undefined) {
    if (typeof shipping.deliverySpeed !== 'string' || !shipping.deliverySpeed.trim()) {
      throw new HttpsError('invalid-argument', 'shipping.deliverySpeed must be a valid string if provided.');
    }
    const normSpeed = shipping.deliverySpeed.trim().toLowerCase();
    if (!ALLOWED_DELIVERY_SPEEDS.includes(normSpeed as AllowedDeliverySpeed)) {
      throw new HttpsError(
        'invalid-argument',
        `Invalid shipping.deliverySpeed "${shipping.deliverySpeed}". Allowed speeds: ${ALLOWED_DELIVERY_SPEEDS.join(', ')}.`
      );
    }
  }

  const rawSpeed = deliverySpeed ?? shipping.deliverySpeed ?? 'standard';
  const effectiveSpeed = (typeof rawSpeed === 'string' ? rawSpeed.trim().toLowerCase() : 'standard') as AllowedDeliverySpeed;
  if (!ALLOWED_DELIVERY_SPEEDS.includes(effectiveSpeed)) {
    throw new HttpsError(
      'invalid-argument',
      `Invalid delivery speed "${rawSpeed}". Allowed speeds: ${ALLOWED_DELIVERY_SPEEDS.join(', ')}.`
    );
  }

  // 6. Coupon code validation
  let cleanCouponCode: string | undefined = undefined;
  if (couponCode !== undefined) {
    if (typeof couponCode !== 'string') {
      throw new HttpsError('invalid-argument', 'couponCode must be a string if provided.');
    }
    cleanCouponCode = couponCode.trim();
    if (cleanCouponCode.length > 50) {
      throw new HttpsError('invalid-argument', 'couponCode exceeds 50 characters.');
    }
  }

  const cleanShipping: ShippingDetails = {
    fullName: shipping.fullName.trim(),
    phone: shipping.phone.trim(),
    governorate: shipping.governorate.trim(),
    city: shipping.city.trim(),
    street: rawStreet.trim(),
    building: shipping.building.trim(),
    deliveryNotes: rawNotes ? rawNotes.trim() : '',
    deliverySpeed: effectiveSpeed,
  };

  return {
    items,
    cleanShipping,
    effectivePaymentMethod,
    effectiveSpeed,
    couponCode: cleanCouponCode,
    totalQuantity,
    idempotencyKey: cleanIdempotencyKey,
  };
}

export const placeOrder = onCall<PlaceOrderRequest>(
  {
    region: 'europe-west1',
    enforceAppCheck: true,
    consumeAppCheckToken: true,
  },
  async (req) => {
    const authUser = req.auth;
    const uid = authUser?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Sign in to place an order.');
    }
    if (authUser?.token.email_verified !== true) {
      throw new HttpsError('failed-precondition', 'Please verify your email first.');
    }

    const {
      items,
      cleanShipping,
      effectivePaymentMethod,
      effectiveSpeed,
      couponCode,
      idempotencyKey,
    } = validatePlaceOrderPayload(req.data);

    const db = getDb();

    return db.runTransaction(async (tx) => {
      // 1. Transactional reads: Idempotency doc, products, discounts, bundles, and user profile read WITHIN transaction
      const idempotencyRef = db.doc(`order_idempotency/${uid}_${idempotencyKey}`);
      const productRefs = items.map(i => db.doc(`products/${i.productId.trim()}`));

      let couponQuery = undefined;
      if (couponCode) {
        couponQuery = db.collection('coupons').where('couponCode', '==', couponCode.trim().toUpperCase()).limit(1);
      }

      const [idempotencySnap, productSnaps, discountsSnap, bundlesSnap, userSnap, couponQuerySnap, currencyConfigSnap] = await Promise.all([
        tx.get(idempotencyRef),
        tx.getAll(...productRefs),
        tx.get(db.collection('discounts').where('isActive', '==', true)),
        tx.get(db.collection('product_bundles').where('isActive', '==', true)),
        tx.get(db.doc(`users/${uid}`)),
        couponQuery ? tx.get(couponQuery) : Promise.resolve(null),
        tx.get(db.doc('site_settings/currency')),
      ]);

      const requestFingerprint = computeRequestFingerprint({
        items,
        shipping: cleanShipping,
        paymentMethod: effectivePaymentMethod,
        couponCode,
        deliverySpeed: effectiveSpeed,
      });

      // 2. Authoritative idempotency check with request fingerprint verification
      if (idempotencySnap.exists) {
        const existingData = idempotencySnap.data() as any;
        if (existingData.requestFingerprint && existingData.requestFingerprint !== requestFingerprint) {
          throw new HttpsError('already-exists', 'Idempotency key reused with a different request payload.');
        }
        return {
          orderId: existingData.orderId,
          trackingNumber: existingData.trackingNumber,
          totalUSD: existingData.totalUSD,
          subtotalUSD: existingData.subtotalUSD,
          discountUSD: existingData.discountUSD,
          deliveryFeeUSD: existingData.deliveryFeeUSD,
          duplicate: true,
        };
      }

      // 3. Validate product existence, state, publication status, and stock
      const lines = items.map((line, idx) => {
        const snap = productSnaps[idx];
        if (!snap || !snap.exists) {
          throw new HttpsError('failed-precondition', `Product with ID "${line.productId}" does not exist.`);
        }
        const p = { id: snap.id, ...snap.data() } as any;

        // Authoritative availability checks
        if (p.isPublished === false) {
          throw new HttpsError('failed-precondition', `Product "${p.name || snap.id}" is unpublished.`);
        }
        if (p.isActive === false || p.sellerActive === false || p.status === 'inactive' || p.status === 'archived' || p.status === 'draft') {
          throw new HttpsError('failed-precondition', `Product "${p.name || snap.id}" is currently inactive.`);
        }
        if (p.isAvailable === false || p.available === false) {
          throw new HttpsError('failed-precondition', `Product "${p.name || snap.id}" is unavailable.`);
        }

        const qty = line.quantity;
        const availableStock = typeof p.stock === 'number' ? p.stock : 0;
        if (availableStock < qty) {
          throw new HttpsError('resource-exhausted', `"${p.name || 'Product'}" only has ${availableStock} items in stock.`);
        }
        return {
          ref: snap.ref,
          product: p,
          quantity: qty,
          unitPriceUSD: typeof p.priceUSD === 'number' ? p.priceUSD : 0,
          selectedOption: typeof line.selectedOption === 'string' ? line.selectedOption.slice(0, 100) : undefined
        };
      });

      // 3. Compute prices, discounts, delivery, and totals authoritatively on server
      const subtotalUSD = round2(lines.reduce((s, l) => s + l.unitPriceUSD * l.quantity, 0));

      if (subtotalUSD > MAX_ORDER_VALUE_USD) {
        throw new HttpsError(
          'invalid-argument',
          `Order subtotal ($${subtotalUSD.toFixed(2)}) exceeds maximum allowed limit of $${MAX_ORDER_VALUE_USD.toLocaleString()} USD.`
        );
      }

      const isNewCustomer = !userSnap.exists || (userSnap.data()?.ordersPlaced ?? 0) === 0;

      let verifiedCouponDoc: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData> | null = null;
      if (couponQuerySnap && !couponQuerySnap.empty) {
        const cDoc = couponQuerySnap.docs[0];
        const cData = cDoc.data();
        const usageCount = cData.usageCount || 0;
        const usedBy = cData.usedBy || [];
        const userUses = usedBy.filter((u: string) => u === uid).length;
        
        let valid = true;
        if (typeof cData.maxTotalUses === 'number' && usageCount >= cData.maxTotalUses) valid = false;
        if (typeof cData.maxUsesPerUser === 'number' && userUses >= cData.maxUsesPerUser) valid = false;
        
        if (valid) {
          verifiedCouponDoc = cDoc;
        }
      }

      const rawDiscounts = discountsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
      if (verifiedCouponDoc) {
        const cData = verifiedCouponDoc.data();
        const ruleIndex = rawDiscounts.findIndex(r => r.id === (cData.discountId || verifiedCouponDoc!.id));
        if (ruleIndex >= 0) {
          rawDiscounts[ruleIndex].couponCode = cData.couponCode;
        }
      }

      const { discountUSD, appliedCoupon } = computeDiscounts({
        lines,
        discounts: rawDiscounts,
        bundles: bundlesSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        couponCode,
        isNewCustomer,
        subtotalUSD,
      });

      const deliveryFeeUSD = computeDelivery(
        effectiveSpeed,
        cleanShipping.governorate,
        subtotalUSD - discountUSD
      );
      const totalUSD = round2(subtotalUSD - discountUSD + deliveryFeeUSD);

      // 4. Atomic stock & coupon updates
      for (const l of lines) {
        tx.update(l.ref, { stock: FieldValue.increment(-l.quantity) });
      }
      
      if (appliedCoupon && verifiedCouponDoc) {
        tx.update(verifiedCouponDoc.ref, {
          usageCount: FieldValue.increment(1),
          usedBy: FieldValue.arrayUnion(uid)
        });
      }

      // 5. Authoritative user profile handling
      if (!userSnap.exists) {
        tx.set(db.doc(`users/${uid}`), {
          uid,
          email: authUser.token.email || '',
          name: cleanShipping.fullName,
          phone: cleanShipping.phone,
          role: 'customer',
          isBanned: false,
          ordersPlaced: 1,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else {
        const userData = userSnap.data();
        if (userData?.isBanned === true) {
          throw new HttpsError('permission-denied', 'Your customer account has been suspended.');
        }
        tx.set(db.doc(`users/${uid}`), {
          ordersPlaced: FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      }

      // 6. Create authoritative Order record
      const orderRef = db.collection('orders').doc();
      const cryptoUuid = randomUUID();
      const trackingNumber = `LB-EXP-${cryptoUuid.slice(0, 12).toUpperCase()}`;

      // Canonical seller IDs exclusively from product.sellerId
      const canonicalSellerIds = Array.from(
        new Set(
          lines
            .map(l => (typeof l.product.sellerId === 'string' ? l.product.sellerId.trim() : ''))
            .filter((s): s is string => Boolean(s))
        )
      );

        const currencyData = currencyConfigSnap.exists ? (currencyConfigSnap.data() as any) : null;
        const lbpUsdRate = typeof currencyData?.lbpUsdRate === 'number' && currencyData.lbpUsdRate > 0
          ? currencyData.lbpUsdRate
          : 89500;

        const orderSafeProduct = (p: any) => ({
          id: p?.id || '',
          name: p?.name || '',
          arabicName: p?.arabicName || '',
          priceUSD: typeof p?.priceUSD === 'number' ? p.priceUSD : 0,
          image: p?.image || '',
          seller: p?.seller || '',
          arabicSeller: p?.arabicSeller || '',
          sellerId: p?.sellerId || '',
          category: p?.category || '',
          origin: p?.origin || ''
        });

        const orderData = {
          id: orderRef.id,
          userId: uid,
          status: 'pending',
          date: new Date().toISOString(),
          trackingNumber,
          items: lines.map(l => ({
            product: orderSafeProduct(l.product),
            quantity: l.quantity,
            selectedOption: l.selectedOption || null
          })),
          productIds: Array.from(new Set(lines.map(l => l.product.id).filter(Boolean))),
          sellerIds: canonicalSellerIds,
          shipping: cleanShipping,
          paymentMethod: effectivePaymentMethod,
          currency: 'USD',
          subtotalUSD,
          discountUSD,
          deliveryFeeUSD,
          totalUSD,
          totalLBP: Math.round(totalUSD * lbpUsdRate),
          appliedCoupon: appliedCoupon || null,
          createdAt: FieldValue.serverTimestamp(),
        };

      tx.set(orderRef, orderData);

      const sellerSafeProduct = (p: any, selectedOpt?: string, qty?: number) => ({
        productId: p.id,
        name: p.name || '',
        arabicName: p.arabicName || '',
        image: p.image || '',
        sellerItemCode: p.sellerItemCode || '',
        selectedOption: selectedOpt || null,
        quantity: qty || 1,
      });

      // 6b. Create seller fulfillment documents atomically with seller-safe product snapshot
      for (const sId of canonicalSellerIds) {
        const sellerLines = lines.filter(l => (typeof l.product.sellerId === 'string' ? l.product.sellerId.trim() : '') === sId);
        const fulfillmentRef = db.doc(`order_fulfillment/${orderRef.id}/sellers/${sId}`);
        tx.set(fulfillmentRef, {
          orderId: orderRef.id,
          sellerId: sId,
          status: 'pending',
          items: sellerLines.map(l => sellerSafeProduct(l.product, l.selectedOption, l.quantity)),
          shipping: {
            fullName: cleanShipping.fullName,
            phone: cleanShipping.phone,
            governorate: cleanShipping.governorate,
            city: cleanShipping.city,
            street: cleanShipping.street,
            building: cleanShipping.building,
            deliveryNotes: cleanShipping.deliveryNotes
          },
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      tx.set(idempotencyRef, {
        uid,
        idempotencyKey,
        requestFingerprint,
        orderId: orderRef.id,
        trackingNumber,
        totalUSD,
        subtotalUSD,
        discountUSD,
        deliveryFeeUSD,
        status: 'completed',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      return {
        orderId: orderRef.id,
        trackingNumber,
        totalUSD,
        subtotalUSD,
        discountUSD,
        deliveryFeeUSD,
        duplicate: false,
      };
    });
  }
);
