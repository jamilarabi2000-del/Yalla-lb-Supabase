import { readFileSync } from 'fs';
import { initializeTestEnvironment, assertFails, assertSucceeds }
  from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, deleteDoc, collection, query, where } from 'firebase/firestore';
import { beforeAll, afterAll, test as baseTest, expect, describe as baseDescribe } from 'vitest';

const hasEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const test = hasEmulator ? baseTest : baseTest.skip;
const describe = hasEmulator ? baseDescribe : baseDescribe.skip;

let env: any;

const validProduct = {
  id: 'p-order',
  name: 'Test Product',
  priceUSD: 10,
  stock: 10,
};

const validOrder = (id: string) => ({
  id,
  userId: 'cust-1',
  sellerIds: [],
  productIds: ['p-order'],
  date: '2026-09-07',
  items: [
    {
      quantity: 1,
      product: {
        id: 'p-order',
        priceUSD: 10,
      },
    },
  ],
  shipping: {
    fullName: 'Test Customer',
    deliveryNotes: '',
  },
  paymentMethod: 'cod_usd',
  currency: 'USD',
  subtotalUSD: 10,
  deliveryFeeUSD: 0,
  totalUSD: 10,
  totalLBP: 0,
  status: 'pending',
  estimatedDelivery: '',
  trackingNumber: 'TEST-001',
  discountUSD: 0,
  appliedCoupon: '',
  notes: '',
  customerNote: '',
  adminNotes: '',
  createdAt: '2026-09-07',
  updatedAt: '2026-09-07',
});

beforeAll(async () => {
  if (!hasEmulator) {
    console.info('[test/rules.test.ts] FIRESTORE_EMULATOR_HOST not set. Skipping live emulator rules tests.');
    return;
  }
  env = await initializeTestEnvironment({
    projectId: 'yalla-lb-test',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });

  await env.withSecurityRulesDisabled(async (ctx: any) => {
    await setDoc(
      doc(ctx.firestore(), 'products', 'p-order'),
      validProduct
    );
    await setDoc(
      doc(ctx.firestore(), 'users', 'seller-uid-1'),
      {
        uid: 'seller-uid-1',
        role: 'seller',
        sellerId: 'seller-tripoli',
        email: 'seller1@example.com'
      }
    );
    await setDoc(
      doc(ctx.firestore(), 'sellers', 'seller-tripoli'),
      {
        id: 'seller-tripoli',
        name: 'Tripoli Workshop',
        isActive: true
      }
    );
  });
});
afterAll(() => {
  if (env && typeof env.cleanup === 'function') {
    return env.cleanup();
  }
});

const unauthenticated = () => env.unauthenticatedContext().firestore();
const customer = () => env.authenticatedContext('cust-1', {
  email: 'c@example.com', email_verified: true,
}).firestore();
const seller = (sellerId = 'seller-tripoli') => env.authenticatedContext('seller-uid-1', {
  email: 'seller1@example.com', email_verified: true, seller: true, sellerId,
}).firestore();
const admin = () => env.authenticatedContext('admin-1', {
  email: 'a@example.com', email_verified: true, admin: true,
}).firestore();

// Destructive admin writes additionally require a recent OTP step-up, recorded by the
// verifyOtp Cloud Function in admin_stepup/{uid}. That document is server-only
// (allow read, write: if false), so tests must seed it with rules disabled.
const grantAdminStepUp = async (uid = 'admin-1', ttlMs = 30 * 60 * 1000) => {
  await env.withSecurityRulesDisabled(async (ctx: any) => {
    await setDoc(doc(ctx.firestore(), 'admin_stepup', uid), {
      uid,
      verifiedAtMs: Date.now(),
      expiresAtMs: Date.now() + ttlMs,
    });
  });
};

// ── Strict Security Tests: Order creation is backend-only via placeOrder Cloud Function ───

test('TEST A: Unauthenticated client cannot create an order', async () => {
  await assertFails(
    setDoc(
      doc(unauthenticated(), 'orders', 'o-unauth'),
      validOrder('o-unauth')
    )
  );
});

test('TEST B: Normal authenticated customer cannot create an order directly', async () => {
  await assertFails(
    setDoc(
      doc(customer(), 'orders', 'o1'),
      validOrder('o1')
    )
  );
});

test('TEST C: Authenticated seller cannot create an order directly', async () => {
  await assertFails(
    setDoc(
      doc(seller(), 'orders', 'o-seller'),
      validOrder('o-seller')
    )
  );
});

test('TEST D: Authenticated admin cannot create an order directly', async () => {
  await assertFails(
    setDoc(
      doc(admin(), 'orders', 'o-admin'),
      validOrder('o-admin')
    )
  );
});

test('TEST E: The existing placeOrder Cloud Function can still successfully create an order using the Admin SDK', async () => {
  await env.withSecurityRulesDisabled(async (ctx: any) => {
    const adminDb = ctx.firestore();
    await assertSucceeds(
      setDoc(
        doc(adminDb, 'orders', 'o-backend-admin-sdk'),
        validOrder('o-backend-admin-sdk')
      )
    );
    const snap = await getDoc(doc(adminDb, 'orders', 'o-backend-admin-sdk'));
    expect(snap.exists()).toBe(true);
    expect(snap.data()?.id).toBe('o-backend-admin-sdk');
  });
});

test('TEST F: order_idempotency is completely inaccessible to clients (read & write = false)', async () => {
  const dummyRecord = {
    orderId: 'ord-123',
    trackingNumber: 'LB-EXP-ABC',
    createdAt: new Date().toISOString(),
    totalUSD: 50
  };

  // Unauthenticated client cannot read or write
  await assertFails(getDoc(doc(unauthenticated(), 'order_idempotency', 'uid_key1')));
  await assertFails(setDoc(doc(unauthenticated(), 'order_idempotency', 'uid_key1'), dummyRecord));

  // Customer cannot read or write
  await assertFails(getDoc(doc(customer(), 'order_idempotency', 'customer-123_key1')));
  await assertFails(setDoc(doc(customer(), 'order_idempotency', 'customer-123_key1'), dummyRecord));

  // Seller cannot read or write
  await assertFails(getDoc(doc(seller(), 'order_idempotency', 'seller-123_key1')));
  await assertFails(setDoc(doc(seller(), 'order_idempotency', 'seller-123_key1'), dummyRecord));

  // Admin cannot read or write directly via client SDK
  await assertFails(getDoc(doc(admin(), 'order_idempotency', 'admin-123_key1')));
  await assertFails(setDoc(doc(admin(), 'order_idempotency', 'admin-123_key1'), dummyRecord));

  // Admin SDK in Cloud Functions CAN read & write
  await env.withSecurityRulesDisabled(async (ctx: any) => {
    const adminDb = ctx.firestore();
    await assertSucceeds(setDoc(doc(adminDb, 'order_idempotency', 'backend_key1'), dummyRecord));
    const snap = await getDoc(doc(adminDb, 'order_idempotency', 'backend_key1'));
    expect(snap.exists()).toBe(true);
    expect(snap.data()?.orderId).toBe('ord-123');
  });
});

test('customer cannot create a pre-advanced order', async () => {
  await assertFails(
    setDoc(
      doc(customer(), 'orders', 'o2'),
      {
        ...validOrder('o2'),
        status: 'crafting',
      }
    )
  );
});

// ── Regression 2: v5 — stock rule let any signed-in user zero the catalog ─────
test('customer cannot decrement product stock', async () => {
  await env.withSecurityRulesDisabled(async (ctx: any) => {
    await setDoc(doc(ctx.firestore(), 'products', 'p1'), { priceUSD: 10, stock: 5 });
  });
  await assertFails(setDoc(doc(customer(), 'products', 'p1'), { stock: 0 }, { merge: true }));
});

// ── Regression 3: v6 — direct client writes ────────────────────────────────────
test('customer cannot write to products or orders', async () => {
  await assertFails(setDoc(doc(customer(), 'products', 'p1'), { stock: 4 }, { merge: true }));
  await assertFails(
    setDoc(
      doc(customer(), 'orders', 'o3'),
      validOrder('o3')
    )
  );
});

// ── Standing authorization invariants ────────────────────────────────────────
test('customer cannot read another customer order', async () => {
  await env.withSecurityRulesDisabled(async (ctx: any) => {
    await setDoc(doc(ctx.firestore(), 'orders', 'other'), { userId: 'cust-2', totalUSD: 1 });
  });
  await assertFails(getDoc(doc(customer(), 'orders', 'other')));
});

test('unverified email cannot order', async () => {
  const unverified = env.authenticatedContext('cust-3', { email_verified: false }).firestore();
  await assertFails(setDoc(doc(unverified, 'orders', 'o4'), {
    userId: 'cust-3', status: 'pending', subtotalUSD: 5, deliveryFeeUSD: 0, totalUSD: 5, items: [], shipping: {},
  }));
});

test('admin can write products and cms', async () => {
  await assertSucceeds(setDoc(doc(admin(), 'products', 'p2'), { priceUSD: 1, stock: 1 }));
  await assertSucceeds(setDoc(doc(admin(), 'cms', 'main'), { navbar: {} }, { merge: true }));
});

test('non-admin cannot write cms', async () => {
  await assertFails(setDoc(doc(customer(), 'cms', 'main'), { navbar: {} }, { merge: true }));
});

test('unauthenticated user cannot read order with trackingNumber', async () => {
  await env.withSecurityRulesDisabled(async (ctx: any) => {
    await setDoc(doc(ctx.firestore(), 'orders', 'order-tracking'), {
      userId: 'cust-1', trackingNumber: 'TRK12345', totalUSD: 10
    });
  });
  await assertFails(getDoc(doc(unauthenticated(), 'orders', 'order-tracking')));
});

test('phone_registry is not publicly readable', async () => {
  await env.withSecurityRulesDisabled(async (ctx: any) => {
    await setDoc(doc(ctx.firestore(), 'phone_registry', '96170123456'), { uid: 'cust-1' });
  });
  await assertFails(getDoc(doc(unauthenticated(), 'phone_registry', '96170123456')));
  await assertSucceeds(getDoc(doc(customer(), 'phone_registry', '96170123456')));
});

test('unauthenticated user cannot write search_logs', async () => {
  await assertFails(setDoc(doc(unauthenticated(), 'search_logs', 's1'), { query: 'olive oil' }));
  await assertSucceeds(setDoc(doc(customer(), 'search_logs', 's2'), { userId: 'cust-1', query: 'soap' }));
});

// ── Adversarial Attack Tests ─────────────────────────────────────────────────

// 1. Discount manipulation
test('adversarial: customer cannot arbitrarily inflate discountUSD to create a free order', async () => {
  await assertFails(
    setDoc(
      doc(customer(), 'orders', 'o-discount-attack'),
      {
        ...validOrder('o-discount-attack'),
        discountUSD: 10,
        totalUSD: 0,
      }
    )
  );
});

// 2. Fake review creation without purchase or from non-delivered orders
test('adversarial: customer cannot review a product they never purchased', async () => {
  await assertFails(
    setDoc(
      doc(customer(), 'review_private', 'cust-1_unbought-prod'),
      {
        id: 'cust-1_unbought-prod',
        reviewId: 'cust-1_unbought-prod',
        userId: 'cust-1',
        productId: 'unbought-prod',
        orderId: 'o1',
        createdAt: '2026-09-07',
        updatedAt: '2026-09-07'
      }
    )
  );
});

test('adversarial: customer cannot review a product from a pending, shipped, or cancelled order', async () => {
  await env.withSecurityRulesDisabled(async (ctx: any) => {
    // Order 1: Pending order
    await setDoc(doc(ctx.firestore(), 'orders', 'ord-pending-1'), {
      ...validOrder('ord-pending-1'),
      status: 'pending',
      userId: 'cust-1',
      productIds: ['p-order']
    });
    // Order 2: In transit order
    await setDoc(doc(ctx.firestore(), 'orders', 'ord-transit-1'), {
      ...validOrder('ord-transit-1'),
      status: 'in_transit',
      userId: 'cust-1',
      productIds: ['p-order']
    });
    // Order 3: Cancelled order
    await setDoc(doc(ctx.firestore(), 'orders', 'ord-cancelled-1'), {
      ...validOrder('ord-cancelled-1'),
      status: 'cancelled',
      userId: 'cust-1',
      productIds: ['p-order']
    });
    // Order 4: Delivered order belonging to OTHER customer (cust-2)
    await setDoc(doc(ctx.firestore(), 'orders', 'ord-delivered-other'), {
      ...validOrder('ord-delivered-other'),
      status: 'delivered',
      userId: 'cust-2',
      productIds: ['p-order']
    });
    // Order 5: Successfully delivered order belonging to cust-1
    await setDoc(doc(ctx.firestore(), 'orders', 'ord-delivered-cust1'), {
      ...validOrder('ord-delivered-cust1'),
      status: 'delivered',
      userId: 'cust-1',
      productIds: ['p-order']
    });
  });

  // Review referencing pending order -> DENY on review_private
  await assertFails(
    setDoc(doc(customer(), 'review_private', 'cust-1_p-order'), {
      id: 'cust-1_p-order',
      reviewId: 'cust-1_p-order',
      userId: 'cust-1',
      productId: 'p-order',
      orderId: 'ord-pending-1',
      createdAt: '2026-09-07',
      updatedAt: '2026-09-07',
    })
  );

  // Review referencing in-transit order -> DENY on review_private
  await assertFails(
    setDoc(doc(customer(), 'review_private', 'cust-1_p-order'), {
      id: 'cust-1_p-order',
      reviewId: 'cust-1_p-order',
      userId: 'cust-1',
      productId: 'p-order',
      orderId: 'ord-transit-1',
      createdAt: '2026-09-07',
      updatedAt: '2026-09-07',
    })
  );

  // Review referencing cancelled order -> DENY on review_private
  await assertFails(
    setDoc(doc(customer(), 'review_private', 'cust-1_p-order'), {
      id: 'cust-1_p-order',
      reviewId: 'cust-1_p-order',
      userId: 'cust-1',
      productId: 'p-order',
      orderId: 'ord-cancelled-1',
      createdAt: '2026-09-07',
      updatedAt: '2026-09-07',
    })
  );

  // Review referencing other customer's delivered order -> DENY on review_private
  await assertFails(
    setDoc(doc(customer(), 'review_private', 'cust-1_p-order'), {
      id: 'cust-1_p-order',
      reviewId: 'cust-1_p-order',
      userId: 'cust-1',
      productId: 'p-order',
      orderId: 'ord-delivered-other',
      createdAt: '2026-09-07',
      updatedAt: '2026-09-07',
    })
  );

  // Legitimate review referencing own delivered order -> ALLOW on review_private then ALLOW on reviews
  await assertSucceeds(
    setDoc(doc(customer(), 'review_private', 'cust-1_p-order'), {
      id: 'cust-1_p-order',
      reviewId: 'cust-1_p-order',
      userId: 'cust-1',
      productId: 'p-order',
      orderId: 'ord-delivered-cust1',
      createdAt: '2026-09-07',
      updatedAt: '2026-09-07',
    })
  );

  await assertSucceeds(
    setDoc(doc(customer(), 'reviews', 'cust-1_p-order'), {
      id: 'cust-1_p-order',
      productId: 'p-order',
      userName: 'Customer 1',
      rating: 5,
      comment: 'Authentic handmade Lebanese craft! Delivered in perfect condition.',
      createdAt: '2026-09-07',
      date: '2026-09-07',
    })
  );
});

test('adversarial: test collection is locked down to connection diagnostic only', async () => {
  await env.withSecurityRulesDisabled(async (ctx: any) => {
    await setDoc(doc(ctx.firestore(), 'test', 'connection'), {
      status: 'ok',
      timestamp: '2026-09-07'
    });
    await setDoc(doc(ctx.firestore(), 'test', 'internal_secrets'), {
      secretData: 'do_not_read'
    });
  });

  // /test/connection can be read by unauthenticated, customer, and admin
  await assertSucceeds(getDoc(doc(unauthenticated(), 'test', 'connection')));
  await assertSucceeds(getDoc(doc(customer(), 'test', 'connection')));
  await assertSucceeds(getDoc(doc(admin(), 'test', 'connection')));

  // /test/anything-else CANNOT be read by anyone (unauthenticated, customer, admin)
  await assertFails(getDoc(doc(unauthenticated(), 'test', 'internal_secrets')));
  await assertFails(getDoc(doc(customer(), 'test', 'internal_secrets')));
  await assertFails(getDoc(doc(admin(), 'test', 'internal_secrets')));

  // Non-admins cannot write to /test/*
  await assertFails(setDoc(doc(unauthenticated(), 'test', 'connection'), { status: 'hacked' }));
  await assertFails(setDoc(doc(customer(), 'test', 'connection'), { status: 'hacked' }));
  await assertFails(setDoc(doc(customer(), 'test', 'new_probe'), { status: 'hacked' }));

  // Admin can write to /test/*
  await assertSucceeds(setDoc(doc(admin(), 'test', 'connection'), { status: 'admin_ping' }));
  await assertSucceeds(setDoc(doc(admin(), 'test', 'internal_secrets'), { secretData: 'admin_update' }));
});

// 3. Order / productIds mismatch attack
test('adversarial: customer cannot create order where product in items is missing from productIds', async () => {
  await assertFails(
    setDoc(
      doc(customer(), 'orders', 'o-mismatch'),
      {
        ...validOrder('o-mismatch'),
        productIds: ['another-product-id'], // mismatch
      }
    )
  );
});

// 4. Seller impersonation / cross-seller modification
test('adversarial: seller cannot modify another seller profile', async () => {
  const sellerA = env.authenticatedContext('user-seller-a', {
    email: 'sellera@example.com', email_verified: true,
  }).firestore();

  // Create seller documents
  await env.withSecurityRulesDisabled(async (ctx: any) => {
    await setDoc(doc(ctx.firestore(), 'sellers', 'seller-a'), {
      id: 'seller-a',
      accountUid: 'user-seller-a',
      nameEn: 'Seller A',
      sellerCode: 'SELLER-A',
    });
    await setDoc(doc(ctx.firestore(), 'sellers', 'seller-b'), {
      id: 'seller-b',
      accountUid: 'user-seller-b',
      nameEn: 'Seller B',
      sellerCode: 'SELLER-B',
    });
  });

  // Seller A tries to modify Seller B profile
  await assertFails(
    setDoc(
      doc(sellerA, 'sellers', 'seller-b'),
      { nameEn: 'Defaced by Seller A' },
      { merge: true }
    )
  );
});

// 5. User security-field manipulation
test('adversarial: customer cannot grant themselves admin role or alter emailVerified in user profile', async () => {
  await env.withSecurityRulesDisabled(async (ctx: any) => {
    await setDoc(doc(ctx.firestore(), 'users', 'cust-1'), {
      uid: 'cust-1',
      name: 'Customer 1',
      role: 'customer',
      emailVerified: false,
    });
  });

  // Customer tries to elevate role
  await assertFails(
    setDoc(
      doc(customer(), 'users', 'cust-1'),
      { role: 'admin' },
      { merge: true }
    )
  );

  // Customer tries to alter emailVerified
  await assertFails(
    setDoc(
      doc(customer(), 'users', 'cust-1'),
      { emailVerified: true },
      { merge: true }
    )
  );

  // Customer tries to modify ordersPlaced directly (must only be updated server-side by placeOrder)
  await assertFails(
    setDoc(
      doc(customer(), 'users', 'cust-1'),
      { ordersPlaced: 1 },
      { merge: true }
    )
  );
});

// 6. User ordersPlaced creation guard
test('adversarial: customer cannot create user profile with ordersPlaced preset', async () => {
  const newCust = env.authenticatedContext('cust-new', {
    email: 'new@example.com', email_verified: true,
  }).firestore();

  await assertFails(
    setDoc(
      doc(newCust, 'users', 'cust-new'),
      {
        uid: 'cust-new',
        name: 'New Customer',
        email: 'new@example.com',
        ordersPlaced: 5,
      }
    )
  );
});

// 7. Seller product permissions hardening
test('adversarial: seller cannot manipulate sellerActive, rating, reviewCount, or hijack sellerId', async () => {
  const sellerContext = env.authenticatedContext('user-seller-x', {
    email: 'sellerx@example.com',
    email_verified: true,
    seller: true,
    sellerId: 'seller-x',
    sellerActive: true
  }).firestore();

  // Seed seller profile mapping
  await env.withSecurityRulesDisabled(async (ctx: any) => {
    await setDoc(doc(ctx.firestore(), 'sellers', 'seller-x'), {
      id: 'seller-x',
      accountUid: 'user-seller-x',
      nameEn: 'Seller X',
      sellerCode: 'SELLER-X',
      isActive: true,
    });
    await setDoc(doc(ctx.firestore(), 'products', 'p-seller-x'), {
      id: 'p-seller-x',
      sellerId: 'seller-x',
      name: 'Artisan Soap',
      priceUSD: 15,
      stock: 50,
      sellerActive: false, // Suspended by admin
      rating: 4.0,
      reviewCount: 2,
    });
  });

  // Seller tries to reactivate own product by bypassing platform suspension (sellerActive: true)
  await assertFails(
    setDoc(
      doc(sellerContext, 'products', 'p-seller-x'),
      { sellerActive: true },
      { merge: true }
    )
  );

  // Seller tries to artificially inflate rating or review count
  await assertFails(
    setDoc(
      doc(sellerContext, 'products', 'p-seller-x'),
      { rating: 5.0, reviewCount: 100 },
      { merge: true }
    )
  );

  // Seller tries to reassign product to another seller
  await assertFails(
    setDoc(
      doc(sellerContext, 'products', 'p-seller-x'),
      { sellerId: 'seller-other' },
      { merge: true }
    )
  );
});

// 8. Product Document ID Integrity
test('adversarial: seller cannot create or update product with mismatched ID', async () => {
  const sellerContext = env.authenticatedContext('user-seller-x', {
    email: 'sellerx@example.com',
    email_verified: true,
    seller: true,
    sellerId: 'seller-x',
    sellerActive: true
  }).firestore();

  // Mismatched ID on create
  await assertFails(
    setDoc(
      doc(sellerContext, 'products', 'p-actual-id'),
      {
        id: 'p-spoofed-id',
        sellerId: 'seller-x',
        name: 'Spoofed ID Product',
        priceUSD: 20,
        stock: 10,
      }
    )
  );

  // Altering ID on update
  await assertFails(
    setDoc(
      doc(sellerContext, 'products', 'p-seller-x'),
      { id: 'p-changed-id' },
      { merge: true }
    )
  );
});

// 9. Email Integrity in User Profile
test('adversarial: customer cannot set profile email to another user email', async () => {
  await assertFails(
    setDoc(
      doc(customer(), 'users', 'cust-1'),
      { email: 'victim@example.com' },
      { merge: true }
    )
  );

  // Succeeds when setting matching token email
  await assertSucceeds(
    setDoc(
      doc(customer(), 'users', 'cust-1'),
      { email: 'c@example.com' },
      { merge: true }
    )
  );
});

// 10. Phone Registry Privacy
test('adversarial: customer cannot query or read another user phone registry', async () => {
  await env.withSecurityRulesDisabled(async (ctx: any) => {
    await setDoc(doc(ctx.firestore(), 'phone_registry', '96170999999'), {
      uid: 'victim-cust',
      phone: '+961 70 999 999',
      cleanDigits: '70999999',
    });
  });

  // Customer tries to read victim phone registry
  await assertFails(getDoc(doc(customer(), 'phone_registry', '96170999999')));
});

// 11. Secret Coupons Access Restriction
test('adversarial: non-admin cannot read or write coupons', async () => {
  await env.withSecurityRulesDisabled(async (ctx: any) => {
    await setDoc(doc(ctx.firestore(), 'coupons', 'SECRET50'), {
      code: 'SECRET50',
      discountPercent: 50,
    });
  });

  await assertFails(getDoc(doc(customer(), 'coupons', 'SECRET50')));
  await assertFails(getDoc(doc(unauthenticated(), 'coupons', 'SECRET50')));
  await assertFails(setDoc(doc(customer(), 'coupons', 'HACK100'), { code: 'HACK100' }));
});

// 12. Cart & Wishlist Schema Validation
test('adversarial: customer cannot inject arbitrary schemas or oversized payloads in carts/wishlists', async () => {
  // Invalid cart key
  await assertFails(
    setDoc(
      doc(customer(), 'carts', 'cust-1'),
      { maliciousField: 'attack' }
    )
  );

  // Oversized cart (>50 items)
  const oversizedItems = Array.from({ length: 51 }, (_, i) => ({
    quantity: 1,
    product: { id: `p-${i}` }
  }));
  await assertFails(
    setDoc(
      doc(customer(), 'carts', 'cust-1'),
      {
        userId: 'cust-1',
        items: oversizedItems,
        updatedAt: '2026-09-07T00:00:00.000Z',
      }
    )
  );

  // Valid cart succeeds
  await assertSucceeds(
    setDoc(
      doc(customer(), 'carts', 'cust-1'),
      {
        userId: 'cust-1',
        items: [{ quantity: 2, product: { id: 'p-1' } }],
        updatedAt: '2026-09-07T00:00:00.000Z',
      }
    )
  );
});

// 14. Seller Order Data Isolation
test('adversarial: seller order data isolation and fulfillment access', async () => {
  await env.withSecurityRulesDisabled(async (ctx: any) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'orders', 'ord-1'), {
      id: 'ord-1',
      userId: 'cust-1',
      sellerIds: ['seller-tripoli', 'seller-other'],
      totalUSD: 100,
    });
    await setDoc(doc(db, 'order_fulfillment', 'ord-1', 'sellers', 'seller-tripoli'), {
      orderId: 'ord-1',
      sellerId: 'seller-tripoli',
      status: 'pending',
      items: [{ product: { id: 'p-1' }, quantity: 1 }],
      shipping: { fullName: 'Test', phone: '+96170123456' }
    });
    await setDoc(doc(db, 'order_fulfillment', 'ord-1', 'sellers', 'seller-other'), {
      orderId: 'ord-1',
      sellerId: 'seller-other',
      status: 'pending',
      items: [{ product: { id: 'p-2' }, quantity: 1 }],
      shipping: { fullName: 'Test', phone: '+96170123456' }
    });
    await setDoc(doc(db, 'order_fulfillment', 'ord-2', 'sellers', 'seller-other'), {
      orderId: 'ord-2',
      sellerId: 'seller-other',
      status: 'pending',
      items: [{ product: { id: 'p-2' }, quantity: 1 }],
      shipping: { fullName: 'Test', phone: '+96170123456' }
    });
  });

  // Seller A (seller-tripoli) reads own fulfillment doc -> ALLOW
  await assertSucceeds(getDoc(doc(seller('seller-tripoli'), 'order_fulfillment', 'ord-1', 'sellers', 'seller-tripoli')));

  // Seller A reads Seller B fulfillment doc -> DENY
  await assertFails(getDoc(doc(seller('seller-tripoli'), 'order_fulfillment', 'ord-1', 'sellers', 'seller-other')));

  // Seller A reads non-existent/different order fulfillment doc -> DENY
  await assertFails(getDoc(doc(seller('seller-tripoli'), 'order_fulfillment', 'ord-diff-order', 'sellers', 'seller-other')));

  // Seller A reads different order fulfillment doc for another seller -> DENY
  await assertFails(getDoc(doc(seller('seller-tripoli'), 'order_fulfillment', 'ord-2', 'sellers', 'seller-other')));

  // Seller A attempts to read full /orders/ord-1 directly -> DENY (enforced by orders rules)
  await assertFails(getDoc(doc(seller('seller-tripoli'), 'orders', 'ord-1')));

  // Customer (cust-1) reads own order -> ALLOW
  await assertSucceeds(getDoc(doc(customer(), 'orders', 'ord-1')));

  // Customer cannot read seller fulfillment doc -> DENY
  await assertFails(getDoc(doc(customer(), 'order_fulfillment', 'ord-1', 'sellers', 'seller-tripoli')));

  // Unauthenticated cannot read seller fulfillment doc -> DENY
  await assertFails(getDoc(doc(unauthenticated(), 'order_fulfillment', 'ord-1', 'sellers', 'seller-tripoli')));

  // Admin reads full order & fulfillment -> ALLOW
  await assertSucceeds(getDoc(doc(admin(), 'orders', 'ord-1')));
  await assertSucceeds(getDoc(doc(admin(), 'order_fulfillment', 'ord-1', 'sellers', 'seller-tripoli')));

  // Admin manages fulfillment -> ALLOW
  await assertSucceeds(
    setDoc(doc(admin(), 'order_fulfillment', 'ord-1', 'sellers', 'seller-tripoli'), {
      status: 'delivered',
      adminNotes: 'Admin override'
    }, { merge: true })
  );

  // Seller cannot create fulfillment documents directly (backend-only creation) -> DENY
  await assertFails(
    setDoc(doc(seller('seller-tripoli'), 'order_fulfillment', 'ord-new', 'sellers', 'seller-tripoli'), {
      orderId: 'ord-new',
      sellerId: 'seller-tripoli',
      status: 'pending',
      items: [],
    })
  );

  // Customer cannot create fulfillment documents directly -> DENY
  await assertFails(
    setDoc(doc(customer(), 'order_fulfillment', 'ord-new', 'sellers', 'seller-tripoli'), {
      orderId: 'ord-new',
      sellerId: 'seller-tripoli',
      status: 'pending',
      items: [],
    })
  );
});

// 15. Seller Fulfillment State Machine & Tracking Number Protection
test('adversarial: seller fulfillment state machine transitions and tracking protection', async () => {
  await env.withSecurityRulesDisabled(async (ctx: any) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'order_fulfillment', 'ord-state', 'sellers', 'seller-tripoli'), {
      orderId: 'ord-state',
      sellerId: 'seller-tripoli',
      status: 'pending',
      trackingNumber: 'AUTHLB-123',
      items: [{ productId: 'p-1', quantity: 1 }],
      shipping: { fullName: 'Test', phone: '+96170123456' }
    });
  });

  const sellerDocRef = doc(seller('seller-tripoli'), 'order_fulfillment', 'ord-state', 'sellers', 'seller-tripoli');

  // Seller cannot change sellerId -> DENY
  await assertFails(setDoc(sellerDocRef, { sellerId: 'seller-hacked', updatedAt: '2026-09-07' }, { merge: true }));

  // Seller cannot change orderId -> DENY
  await assertFails(setDoc(sellerDocRef, { orderId: 'ord-hacked', updatedAt: '2026-09-07' }, { merge: true }));

  // Seller cannot change trackingNumber -> DENY
  await assertFails(setDoc(sellerDocRef, { trackingNumber: 'LB-EXP-HACKED', updatedAt: '2026-09-07' }, { merge: true }));

  // Seller cannot modify customer / shipping / items / pricing fields -> DENY
  await assertFails(setDoc(sellerDocRef, { shipping: { fullName: 'Modified Name' }, updatedAt: '2026-09-07' }, { merge: true }));
  await assertFails(setDoc(sellerDocRef, { items: [], updatedAt: '2026-09-07' }, { merge: true }));
  await assertFails(setDoc(sellerDocRef, { priceUSD: 0, updatedAt: '2026-09-07' }, { merge: true }));

  // Seller cannot add arbitrary fields -> DENY
  await assertFails(setDoc(sellerDocRef, { arbitraryField: 'malicious', updatedAt: '2026-09-07' }, { merge: true }));

  // Invalid state transition: pending -> delivered (skipped intermediate states) -> DENY
  await assertFails(setDoc(sellerDocRef, { status: 'delivered', updatedAt: '2026-09-07' }, { merge: true }));

  // Invalid state transition: pending -> in_transit (skipped) -> DENY
  await assertFails(setDoc(sellerDocRef, { status: 'in_transit', updatedAt: '2026-09-07' }, { merge: true }));

  // Valid state transition: pending -> confirmed -> ALLOW
  await assertSucceeds(setDoc(sellerDocRef, { status: 'confirmed', updatedAt: '2026-09-07' }, { merge: true }));

  // Invalid state transition: confirmed -> delivered (skipped intermediate states) -> DENY
  await assertFails(setDoc(sellerDocRef, { status: 'delivered', updatedAt: '2026-09-07' }, { merge: true }));

  // Seller can modify fulfillmentNotes and sellerTrackingNumber alongside status/updatedAt -> ALLOW
  await assertSucceeds(setDoc(sellerDocRef, {
    status: 'crafting',
    sellerTrackingNumber: 'COURIER-123',
    fulfillmentNotes: 'Handmade item is currently in crafting stage',
    updatedAt: '2026-09-07'
  }, { merge: true }));

  // Valid state transitions sequentially:
  // crafting -> courier_assigned -> ALLOW
  await assertSucceeds(setDoc(sellerDocRef, { status: 'courier_assigned', updatedAt: '2026-09-07' }, { merge: true }));

  // courier_assigned -> in_transit -> ALLOW
  await assertSucceeds(setDoc(sellerDocRef, { status: 'in_transit', updatedAt: '2026-09-07' }, { merge: true }));

  // in_transit -> delivered -> ALLOW
  await assertSucceeds(setDoc(sellerDocRef, { status: 'delivered', updatedAt: '2026-09-07' }, { merge: true }));

  // Invalid reversed transition: delivered -> crafting -> DENY
  await assertFails(setDoc(sellerDocRef, { status: 'crafting', updatedAt: '2026-09-07' }, { merge: true }));

  // Invalid reversed transition: delivered -> pending -> DENY
  await assertFails(setDoc(sellerDocRef, { status: 'pending', updatedAt: '2026-09-07' }, { merge: true }));

  // Valid transition from delivered: delivered -> returned -> ALLOW
  await assertSucceeds(setDoc(sellerDocRef, { status: 'returned', updatedAt: '2026-09-07' }, { merge: true }));

  // Invalid transition from returned: returned -> delivered -> DENY
  await assertFails(setDoc(sellerDocRef, { status: 'delivered', updatedAt: '2026-09-07' }, { merge: true }));
});

// 16. Server-only OTP Collection Direct Access Prevention
test('adversarial: otps collection prohibits direct client access for all users including admins', async () => {
  const otpRefUnauth = doc(unauthenticated(), 'otps', 'otp-secret-1');
  const otpRefCustomer = doc(customer(), 'otps', 'otp-secret-1');
  const otpRefSeller = doc(seller(), 'otps', 'otp-secret-1');
  const otpRefAdmin = doc(admin(), 'otps', 'otp-secret-1');

  const payload = {
    contact: 'test@example.com',
    actionType: 'login',
    otpHash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    attempts: 0,
    used: false
  };

  // Direct creates must fail for all client contexts
  await assertFails(setDoc(otpRefUnauth, payload));
  await assertFails(setDoc(otpRefCustomer, payload));
  await assertFails(setDoc(otpRefSeller, payload));
  await assertFails(setDoc(otpRefAdmin, payload));

  // Direct reads must fail for all client contexts
  await assertFails(getDoc(otpRefUnauth));
  await assertFails(getDoc(otpRefCustomer));
  await assertFails(getDoc(otpRefSeller));
  await assertFails(getDoc(otpRefAdmin));
});

// 17. Multi-Role Custom Claims Authoritative Verification Tests (Requirement 10)
describe('17. Authorization claims authoritative verification tests', () => {
  test('adversarial: normal user + users/{uid}.sellerId in Firestore cannot access seller resources', async () => {
    // A normal user who doesn't have custom claims, but has sellerId in their user document
    const client = env.authenticatedContext('hacky-user', {
      email: 'hacky@example.com',
      email_verified: true
      // No custom claims!
    }).firestore();

    // Ensure they cannot read from seller_private
    await assertFails(getDoc(doc(client, 'seller_private', 'seller-tripoli')));

    // Ensure they cannot create a product under that sellerId
    await assertFails(
      setDoc(
        doc(client, 'products', 'p-forged-seller'),
        {
          id: 'p-forged-seller',
          name: 'Forged Product',
          priceUSD: 10,
          stock: 5,
          sellerId: 'seller-tripoli'
        }
      )
    );
  });

  test('adversarial: normal user + users/{uid}.role="seller" in Firestore cannot access seller resources', async () => {
    // User with role='seller' in firestore but no actual custom claims
    const client = env.authenticatedContext('hacky-user-role', {
      email: 'hacky-role@example.com',
      email_verified: true
    }).firestore();

    await assertFails(getDoc(doc(client, 'seller_private', 'seller-tripoli')));
    await assertFails(
      setDoc(
        doc(client, 'products', 'p-forged-seller-role'),
        {
          id: 'p-forged-seller-role',
          name: 'Forged Product',
          priceUSD: 10,
          stock: 5,
          sellerId: 'seller-tripoli'
        }
      )
    );
  });

  test('adversarial: seller without matching sellerId claim cannot access another seller resources', async () => {
    // Seller with sellerId: seller-sidon claim
    const client = env.authenticatedContext('seller-sidon-uid', {
      email: 'sidon@example.com',
      email_verified: true,
      seller: true,
      sellerId: 'seller-sidon'
    }).firestore();

    // Attempting to read TRIPOLI's private resource -> DENY
    await assertFails(getDoc(doc(client, 'seller_private', 'seller-tripoli')));

    // Attempting to create product under TRIPOLI -> DENY
    await assertFails(
      setDoc(
        doc(client, 'products', 'p-forged-tripoli-prod'),
        {
          id: 'p-forged-tripoli-prod',
          name: 'Sidon Product under Tripoli',
          priceUSD: 10,
          stock: 5,
          sellerId: 'seller-tripoli'
        }
      )
    );
  });

  test('adversarial: seller with forged Firestore sellerId cannot change their authorization identity', async () => {
    // Authenticated seller with 'seller-sidon' in custom claims
    const client = env.authenticatedContext('seller-sidon-uid', {
      email: 'sidon@example.com',
      email_verified: true,
      seller: true,
      sellerId: 'seller-sidon'
    }).firestore();

    // Even if there exists a users profile doc for 'seller-sidon-uid' asserting sellerId='seller-tripoli',
    // the security rules must strictly evaluate only the custom claims token.
    await env.withSecurityRulesDisabled(async (ctx: any) => {
      await setDoc(doc(ctx.firestore(), 'users', 'seller-sidon-uid'), {
        uid: 'seller-sidon-uid',
        sellerId: 'seller-tripoli',
        role: 'seller'
      });
      await setDoc(doc(ctx.firestore(), 'sellers', 'seller-sidon'), {
        id: 'seller-sidon',
        name: 'Sidon Workshop',
        isActive: true
      });
    });

    // Attempting to write TRIPOLI products -> DENY because claims sellerId is still 'seller-sidon'
    await assertFails(
      setDoc(
        doc(client, 'products', 'p-forged-tripoli-from-sidon'),
        {
          id: 'p-forged-tripoli-from-sidon',
          name: 'Forged Tripoli Product',
          priceUSD: 10,
          stock: 5,
          sellerId: 'seller-tripoli'
        }
      )
    );

    // Attempting to write SIDON products -> ALLOW because claims sellerId matches 'seller-sidon'
    await assertSucceeds(
      setDoc(
        doc(client, 'products', 'p-valid-sidon-prod'),
        {
          id: 'p-valid-sidon-prod',
          name: 'Valid Sidon Product',
          priceUSD: 10,
          stock: 5,
          sellerId: 'seller-sidon'
        }
      )
    );
  });

  test('adversarial: only Firebase Auth custom claims determine seller privilege and sellerId ownership', async () => {
    // Prove that a user without custom claims but with matching DB record sellerId 'seller-tripoli' cannot write Tripoli resources
    const clientWithoutClaims = env.authenticatedContext('user-no-claims', {
      email: 'noclaims@example.com',
      email_verified: true
    }).firestore();

    await env.withSecurityRulesDisabled(async (ctx: any) => {
      await setDoc(doc(ctx.firestore(), 'users', 'user-no-claims'), {
        uid: 'user-no-claims',
        sellerId: 'seller-tripoli',
        role: 'seller'
      });
    });

    // Access to seller_private -> DENY
    await assertFails(getDoc(doc(clientWithoutClaims, 'seller_private', 'seller-tripoli')));

    // Now, with custom claims added
    const clientWithClaims = env.authenticatedContext('user-no-claims', {
      email: 'noclaims@example.com',
      email_verified: true,
      seller: true,
      sellerId: 'seller-tripoli'
    }).firestore();

    // Access to seller_private -> ALLOW
    await assertSucceeds(getDoc(doc(clientWithClaims, 'seller_private', 'seller-tripoli')));
  });

  test('adversarial: Requirements A & B - normal user with forged admin/role doc in users collection is NOT admin', async () => {
    const clientAttacker = env.authenticatedContext('attacker-uid', {
      email: 'attacker@example.com',
      email_verified: true
    }).firestore();

    await env.withSecurityRulesDisabled(async (ctx: any) => {
      await setDoc(doc(ctx.firestore(), 'users', 'attacker-uid'), {
        uid: 'attacker-uid',
        admin: true,
        role: 'admin',
        isAdmin: true
      });
    });

    // Writing to admin-protected collection 'coupons' -> DENY
    await assertFails(
      setDoc(doc(clientAttacker, 'coupons', 'coup-1'), {
        code: 'EVIL',
        discountUSD: 100
      })
    );

    // Writing to admin-protected test ping doc -> DENY
    await assertFails(
      setDoc(doc(clientAttacker, 'test', 'ping'), {
        status: 'hacked'
      })
    );
  });

  test('adversarial: Requirements C & D - normal user with forged seller/sellerId doc in users collection is NOT seller', async () => {
    const clientAttacker = env.authenticatedContext('attacker-seller-doc', {
      email: 'attacker-seller@example.com',
      email_verified: true
    }).firestore();

    await env.withSecurityRulesDisabled(async (ctx: any) => {
      await setDoc(doc(ctx.firestore(), 'users', 'attacker-seller-doc'), {
        uid: 'attacker-seller-doc',
        seller: true,
        sellerId: 'SELLER123',
        role: 'seller'
      });
    });

    // Creating a product under SELLER123 without custom claim -> DENY
    await assertFails(
      setDoc(doc(clientAttacker, 'products', 'p-forged-seller123'), {
        id: 'p-forged-seller123',
        name: 'Forged Honey',
        priceUSD: 20,
        stock: 10,
        sellerId: 'SELLER123'
      })
    );

    // Reading seller_private/SELLER123 -> DENY
    await assertFails(getDoc(doc(clientAttacker, 'seller_private', 'SELLER123')));
  });

  test('adversarial: Requirement E - seller with claim sellerId=SELLER123 cannot access or mutate SELLER456 resources', async () => {
    const clientSeller123 = env.authenticatedContext('seller-123-uid', {
      email: 'seller123@example.com',
      email_verified: true,
      seller: true,
      sellerId: 'SELLER123'
    }).firestore();

    // Create foreign product belonging to SELLER456 in DB
    await env.withSecurityRulesDisabled(async (ctx: any) => {
      await setDoc(doc(ctx.firestore(), 'products', 'p-foreign-456'), {
        id: 'p-foreign-456',
        name: 'Foreign Pottery',
        priceUSD: 35,
        stock: 5,
        sellerId: 'SELLER456'
      });
    });

    // Reading seller_private/SELLER456 -> DENY
    await assertFails(getDoc(doc(clientSeller123, 'seller_private', 'SELLER456')));

    // Updating SELLER456 product -> DENY
    await assertFails(
      setDoc(doc(clientSeller123, 'products', 'p-foreign-456'), {
        priceUSD: 5
      }, { merge: true })
    );

    // Deleting SELLER456 product -> DENY
    await assertFails(deleteDoc(doc(clientSeller123, 'products', 'p-foreign-456')));
  });

  test('adversarial: Requirements F, G & H - seller cannot change own sellerId, grant admin, or create under another sellerId', async () => {
    const clientSeller123 = env.authenticatedContext('seller-123-uid', {
      email: 'seller123@example.com',
      email_verified: true,
      seller: true,
      sellerId: 'SELLER123'
    }).firestore();

    // G: Grant themselves admin -> DENY
    await assertFails(
      setDoc(doc(clientSeller123, 'admins', 'seller-123-uid'), {
        uid: 'seller-123-uid',
        email: 'seller123@example.com'
      })
    );

    // H: Create product under another sellerId SELLER456 -> DENY
    await assertFails(
      setDoc(doc(clientSeller123, 'products', 'p-under-456'), {
        id: 'p-under-456',
        name: 'Illegal Product',
        priceUSD: 10,
        stock: 5,
        sellerId: 'SELLER456'
      })
    );

    // F: Change sellerId in user profile -> DENY
    await assertFails(
      setDoc(doc(clientSeller123, 'users', 'seller-123-uid'), {
        sellerId: 'SELLER456'
      }, { merge: true })
    );
  });
});

// 18. Seller Applications Server-Side Lockdown Tests
describe('18. Seller Applications collection server-only creation enforcement', () => {
  const sampleApp = {
    id: 'app-test-123',
    sellerCompany: 'Cedars Craft',
    firstName: 'Karim',
    lastName: 'Khoury',
    phone: '+961 70 123456',
    email: 'karim@example.com',
    status: 'pending'
  };

  test('Anonymous client cannot directly create a seller application in Firestore', async () => {
    await assertFails(
      setDoc(doc(unauthenticated(), 'seller_applications', 'app-test-123'), sampleApp)
    );
  });

  test('Authenticated customer cannot directly create a seller application in Firestore', async () => {
    await assertFails(
      setDoc(doc(customer(), 'seller_applications', 'app-test-123'), sampleApp)
    );
  });

  test('Authenticated seller cannot directly create a seller application in Firestore', async () => {
    await assertFails(
      setDoc(doc(seller(), 'seller_applications', 'app-test-123'), sampleApp)
    );
  });

  test('Admin client direct Firestore create is strictly DENIED (only Cloud Function creates)', async () => {
    await assertFails(
      setDoc(doc(admin(), 'seller_applications', 'app-test-123'), sampleApp)
    );
  });

  test('Non-admin users cannot read seller applications', async () => {
    await assertFails(getDoc(doc(unauthenticated(), 'seller_applications', 'app-test-123')));
    await assertFails(getDoc(doc(customer(), 'seller_applications', 'app-test-123')));
    await assertFails(getDoc(doc(seller(), 'seller_applications', 'app-test-123')));
  });

  test('Nobody can read or write to seller_application_rate_limits collection', async () => {
    await assertFails(setDoc(doc(unauthenticated(), 'seller_application_rate_limits', 'rate_test'), { hits: 1 }));
    await assertFails(setDoc(doc(customer(), 'seller_application_rate_limits', 'rate_test'), { hits: 1 }));
    await assertFails(setDoc(doc(seller(), 'seller_application_rate_limits', 'rate_test'), { hits: 1 }));
    await assertFails(getDoc(doc(customer(), 'seller_application_rate_limits', 'rate_test')));
  });

  test('Nobody can read or write to seller_application_locks collection', async () => {
    await assertFails(setDoc(doc(unauthenticated(), 'seller_application_locks', 'lock_test'), { status: 'pending' }));
    await assertFails(setDoc(doc(customer(), 'seller_application_locks', 'lock_test'), { status: 'pending' }));
    await assertFails(setDoc(doc(seller(), 'seller_application_locks', 'lock_test'), { status: 'pending' }));
    await assertFails(getDoc(doc(customer(), 'seller_application_locks', 'lock_test')));
  });
});

describe('19. Public/Private Firestore Data Separation Security Hardening', () => {
  test('unauthenticated user cannot read product_private data', async () => {
    await env.withSecurityRulesDisabled(async (ctx: any) => {
      await setDoc(doc(ctx.firestore(), 'product_private', 'p1'), { sellerItemCode: 'SECRET-CODE', costPriceUSD: 5 });
    });
    await assertFails(getDoc(doc(unauthenticated(), 'product_private', 'p1')));
    await assertFails(getDoc(doc(customer(), 'product_private', 'p1')));
  });

  test('unauthenticated user cannot read unpublished products', async () => {
    await env.withSecurityRulesDisabled(async (ctx: any) => {
      await setDoc(doc(ctx.firestore(), 'products', 'p-unpublished'), { name: 'Draft', isPublished: false, priceUSD: 10 });
    });
    await assertFails(getDoc(doc(unauthenticated(), 'products', 'p-unpublished')));
  });

  test('unauthenticated user cannot read seller_private data', async () => {
    await env.withSecurityRulesDisabled(async (ctx: any) => {
      await setDoc(doc(ctx.firestore(), 'seller_private', 'seller-123'), { exactAddress: 'Secret St', accountEmail: 'secret@cedars.lb' });
    });
    await assertFails(getDoc(doc(unauthenticated(), 'seller_private', 'seller-123')));
    await assertFails(getDoc(doc(customer(), 'seller_private', 'seller-123')));
  });

  test('unauthenticated user cannot read review_private data; owner can read', async () => {
    await env.withSecurityRulesDisabled(async (ctx: any) => {
      await setDoc(doc(ctx.firestore(), 'review_private', 'r1'), { userId: 'cust-1', orderId: 'ord-1' });
    });
    const otherCust = env.authenticatedContext('cust-other', {
      email: 'other@example.com',
      email_verified: true,
    }).firestore();
    await assertFails(getDoc(doc(unauthenticated(), 'review_private', 'r1')));
    await assertFails(getDoc(doc(otherCust, 'review_private', 'r1')));
    await assertSucceeds(getDoc(doc(customer(), 'review_private', 'r1')));
  });

  test('unauthenticated user cannot read admin CMS collection directly (must use cms_public)', async () => {
    await env.withSecurityRulesDisabled(async (ctx: any) => {
      await setDoc(doc(ctx.firestore(), 'cms', 'main'), { internalAdminConfig: 'secret' });
      await setDoc(doc(ctx.firestore(), 'cms_public', 'main'), { siteName: 'Yalla' });
    });
    await assertFails(getDoc(doc(unauthenticated(), 'cms', 'main')));
    await assertSucceeds(getDoc(doc(unauthenticated(), 'cms_public', 'main')));
  });

  test('unauthenticated user cannot read inactive discounts or shipping rules', async () => {
    await env.withSecurityRulesDisabled(async (ctx: any) => {
      await setDoc(doc(ctx.firestore(), 'discounts', 'd-inactive'), { name: 'Inactive', isActive: false });
      await setDoc(doc(ctx.firestore(), 'shipping_rules', 's-inactive'), { name: 'Inactive', isActive: false });
    });
    await assertFails(getDoc(doc(unauthenticated(), 'discounts', 'd-inactive')));
    await assertFails(getDoc(doc(unauthenticated(), 'shipping_rules', 's-inactive')));
  });

  // ── Round 3 Regression Test Suite ──
  test('Seller with isActive: false cannot create products', async () => {
    await env.withSecurityRulesDisabled(async (ctx: any) => {
      await setDoc(doc(ctx.firestore(), 'sellers', 'seller-inactive'), {
        id: 'seller-inactive',
        name: 'Inactive Workshop',
        isActive: false
      });
    });
    const inactiveSellerClient = env.authenticatedContext('seller-inactive-uid', {
      email: 'inactive@example.com',
      email_verified: true,
      seller: true,
      sellerId: 'seller-inactive'
    }).firestore();

    await assertFails(
      setDoc(doc(inactiveSellerClient, 'products', 'p-inactive-seller-prod'), {
        id: 'p-inactive-seller-prod',
        name: 'Inactive Seller Prod',
        priceUSD: 10,
        stock: 5,
        sellerId: 'seller-inactive'
      })
    );
  });

  test('Seller with no sellers/{id} document cannot create products (denied cleanly)', async () => {
    const orphanSellerClient = env.authenticatedContext('seller-orphan-uid', {
      email: 'orphan@example.com',
      email_verified: true,
      seller: true,
      sellerId: 'seller-nonexistent-999'
    }).firestore();

    await assertFails(
      setDoc(doc(orphanSellerClient, 'products', 'p-orphan-prod'), {
        id: 'p-orphan-prod',
        name: 'Orphan Seller Prod',
        priceUSD: 10,
        stock: 5,
        sellerId: 'seller-nonexistent-999'
      })
    );
  });

  test('Banned user cannot write to cart', async () => {
    await env.withSecurityRulesDisabled(async (ctx: any) => {
      await setDoc(doc(ctx.firestore(), 'users', 'banned-user-1'), {
        uid: 'banned-user-1',
        isBanned: true
      });
    });
    const bannedClient = env.authenticatedContext('banned-user-1', {
      email: 'banned@example.com',
      email_verified: true
    }).firestore();

    await assertFails(
      setDoc(doc(bannedClient, 'carts', 'banned-user-1'), {
        userId: 'banned-user-1',
        items: [{ productId: 'p-order', quantity: 1 }]
      })
    );
  });

  test('Non-banned user can write to own cart', async () => {
    const activeClient = env.authenticatedContext('active-cust-99', {
      email: 'active@example.com',
      email_verified: true
    }).firestore();

    await assertSucceeds(
      setDoc(doc(activeClient, 'carts', 'active-cust-99'), {
        userId: 'active-cust-99',
        items: [{ productId: 'p-order', quantity: 1 }]
      })
    );
  });

  test('Non-admin cannot read cms/site_content (denied); any visitor can read cms_public/site_content (allowed)', async () => {
    await env.withSecurityRulesDisabled(async (ctx: any) => {
      await setDoc(doc(ctx.firestore(), 'cms', 'site_content'), { adminNotes: 'secret' });
      await setDoc(doc(ctx.firestore(), 'cms_public', 'site_content'), { title: 'Welcome to Yalla' });
    });

    await assertFails(getDoc(doc(customer(), 'cms', 'site_content')));
    await assertFails(getDoc(doc(unauthenticated(), 'cms', 'site_content')));

    await assertSucceeds(getDoc(doc(customer(), 'cms_public', 'site_content')));
    await assertSucceeds(getDoc(doc(unauthenticated(), 'cms_public', 'site_content')));
    await assertSucceeds(getDoc(doc(admin(), 'cms', 'site_content')));
  });

  test('Discount write containing couponCode or coupon usage fields is denied', async () => {
    // Step-up granted, so these must fail on the forbidden fields alone, not on the step-up gate.
    await grantAdminStepUp();
    await assertFails(
      setDoc(doc(admin(), 'discounts', 'disc-coupon-leak'), {
        id: 'disc-coupon-leak',
        title: 'Spring Promo',
        couponCode: 'LEAK10',
        isActive: true
      })
    );
    await assertFails(
      setDoc(doc(admin(), 'discounts', 'disc-uses-leak'), {
        id: 'disc-uses-leak',
        title: 'Spring Promo',
        maxTotalUses: 100,
        isActive: true
      })
    );
  });

  test('Discount write without couponCode is allowed for admin', async () => {
    await grantAdminStepUp();
    await assertSucceeds(
      setDoc(doc(admin(), 'discounts', 'disc-clean-rule'), {
        id: 'disc-clean-rule',
        title: 'Spring Promo Automatic',
        discountType: 'percentage',
        value: 15,
        isActive: true
      })
    );
  });

  test('phone_registry cannot be read by unauthenticated users', async () => {
    await env.withSecurityRulesDisabled(async (ctx: any) => {
      await setDoc(doc(ctx.firestore(), 'phone_registry', 'phone_70123456'), {
        phone: '+96170123456',
        uid: 'user-70'
      });
    });
    await assertFails(getDoc(doc(unauthenticated(), 'phone_registry', 'phone_70123456')));
  });

  test('phone_registry cannot be listed or queried by authenticated non-admins', async () => {
    await assertFails(getDocs(collection(customer(), 'phone_registry')));
  });
});




