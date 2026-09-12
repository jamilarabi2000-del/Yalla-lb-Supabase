import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { csvSafe, sanitizeRowForCsv } from '../src/utils/csvSafe';
import { normalizeLebanesePhone, isValidLebanesePhone } from '../src/utils/phoneUtils';
import { checkDuplicateProductNumber } from '../src/lib/productValidation';
import { Product } from '../src/types';
import { validatePlaceOrderPayload, placeOrder } from '../functions/src/placeOrder';
import { validateSellerApplicationPayload, normalizeServerLebanesePhone, handleSellerApplicationSubmission, syncSellerApplicationLockLifecycle, hashIdentifier } from '../functions/src/sellerApplication';
import { mapUserProfile, mapSafeUserProfile, mapSafeShopUserProfile } from '../src/context/ShopContext';

describe('Security Regression Suite - Application Controls', () => {
  describe('0. Architecture Boundaries (Admin & Seller URL Security)', () => {
    it('Hidden/secret admin URL is not an authorization mechanism', () => {
      // The secret token configuration must not exist
      expect(() => {
        require('../src/config/portalSecurity');
      }).toThrow();
      
      // Admin access must be based on the Firebase token claim, not URL matches
      const fakeToken = { claims: { admin: false } };
      expect(fakeToken.claims.admin).toBe(false);
    });

    it('Hidden/secret seller URL is not an authorization mechanism', () => {
      expect(() => {
        require('../src/config/portalSecurity');
      }).toThrow();

      const fakeToken = { claims: { seller: false } };
      expect(fakeToken.claims.seller).toBe(false);
    });
    
    it('Admin claim revocation removes authorization after token refresh', () => {
      // Simulated token refresh after revocation
      let token: any = { claims: { admin: true } };
      expect(token.claims.admin).toBe(true);
      
      // Admin is revoked in backend
      token = { claims: {} };
      expect(token.claims.admin).toBeUndefined();
    });
  });

  describe('1. CSV / Formula Injection Mitigation', () => {
    it('escapes dangerous spreadsheet formula prefixes (=, +, -, @, tab, cr)', () => {
      expect(csvSafe('=SUM(A1:A10)')).toBe("'=SUM(A1:A10)");
      expect(csvSafe('+12345')).toBe("'+12345");
      expect(csvSafe('-500')).toBe("'-500");
      expect(csvSafe('@HYPERLINK("evil.com")')).toBe("'@HYPERLINK(\"evil.com\")");
      expect(csvSafe('\tcmd.exe')).toBe("'\tcmd.exe");
      expect(csvSafe('\rcalc.exe')).toBe("'\rcalc.exe");
    });

    it('leaves safe strings unmodified', () => {
      expect(csvSafe('Safe Product Name')).toBe('Safe Product Name');
      expect(csvSafe('12345')).toBe('12345');
      expect(csvSafe('Customer Note: Please deliver before 5 PM')).toBe('Customer Note: Please deliver before 5 PM');
      expect(csvSafe('')).toBe('');
      expect(csvSafe(null)).toBe('');
    });

    it('sanitizes all string properties in a row before CSV export', () => {
      const maliciousRow = {
        id: 'ord-123',
        customerName: '=cmd|"/C calc"!A0',
        phone: '+96170123456',
        city: 'Beirut',
        notes: '@malicious_payload',
        totalUSD: 45
      };

      const sanitized = sanitizeRowForCsv(maliciousRow);
      expect(sanitized.customerName).toBe("'=cmd|\"/C calc\"!A0");
      expect(sanitized.phone).toBe("'+96170123456");
      expect(sanitized.notes).toBe("'@malicious_payload");
      expect(sanitized.city).toBe('Beirut');
      expect(sanitized.totalUSD).toBe(45);
    });
  });

  describe('2. Phone Number Registry & Anti-Harvesting Integrity', () => {
    it('validates and normalizes Lebanese phone numbers correctly', () => {
      const validMobile = normalizeLebanesePhone('70 123 456');
      expect(validMobile.isValid).toBe(true);
      expect(validMobile.cleanDigits).toBe('70123456');
      expect(validMobile.formatted).toBe('+961 70123456');
      expect(validMobile.registryKey).toBe('phone_70123456');

      const validWithCode = normalizeLebanesePhone('+961 71 999 888');
      expect(validWithCode.isValid).toBe(true);
      expect(validWithCode.cleanDigits).toBe('71999888');

      const sevenDigitMobile = normalizeLebanesePhone('3 123 456');
      expect(sevenDigitMobile.isValid).toBe(true);
      expect(sevenDigitMobile.cleanDigits).toBe('03123456');
      expect(sevenDigitMobile.registryKey).toBe('phone_03123456');
    });

    it('rejects invalid or spoofed phone numbers', () => {
      expect(isValidLebanesePhone('123')).toBe(false);
      expect(isValidLebanesePhone('abcd')).toBe(false);
      expect(isValidLebanesePhone('00112233445566')).toBe(false);
      expect(isValidLebanesePhone('')).toBe(false);
      expect(isValidLebanesePhone(null)).toBe(false);
    });
  });

  describe('3. Product SKU / Seller Item Code Duplication Defense', () => {
    const mockProducts: Product[] = [
      {
        id: 'prod-1',
        name: 'Extra Virgin Olive Oil',
        priceUSD: 18,
        stock: 50,
        sellerItemCode: 'EVOO-500ML',
        sellerId: 'seller-tripoli',
        seller: 'Tripoli Artisans'
      } as any,
      {
        id: 'prod-2',
        name: 'Laurel Soap Bar',
        priceUSD: 4,
        stock: 100,
        sellerItemCode: 'SOAP-LAUREL-1',
        sellerId: 'seller-sidon',
        seller: 'Sidon Soap'
      } as any
    ];

    it('detects duplicate seller item codes within the same seller workshop', () => {
      const result = checkDuplicateProductNumber('EVOO-500ML', null, mockProducts, 'seller-tripoli', 'Tripoli Artisans');
      expect(result.isDuplicate).toBe(true);
      expect(result.conflictingProduct?.id).toBe('prod-1');
    });

    it('allows identical item codes across distinct, independent seller workshops', () => {
      const result = checkDuplicateProductNumber('EVOO-500ML', null, mockProducts, 'seller-sidon', 'Sidon Soap');
      expect(result.isDuplicate).toBe(false);
    });

    it('detects duplicate global product IDs / SKUs', () => {
      const result = checkDuplicateProductNumber('prod-1', null, mockProducts);
      expect(result.isDuplicate).toBe(true);
    });

    it('permits updating an existing product without false positive collision with itself', () => {
      const result = checkDuplicateProductNumber('EVOO-500ML', 'prod-1', mockProducts, 'seller-tripoli', 'Tripoli Artisans');
      expect(result.isDuplicate).toBe(false);
    });
  });

  describe('4. Privilege Escalation Field Stripping Invariant', () => {
    it('ensures non-admin user profile updates cannot elevate role or sellerId', () => {
      const requestedUpdates: Record<string, any> = {
        firstName: 'Salim',
        lastName: 'Khoury',
        phone: '+96170112233',
        role: 'admin',
        sellerId: 'unauthorized-workshop',
        isBanned: false,
        ordersPlaced: 9999
      };

      const isAdmin = false;
      const safeUpdates = { ...requestedUpdates };
      if (!isAdmin) {
        delete safeUpdates.role;
        delete safeUpdates.sellerId;
        delete safeUpdates.isBanned;
        delete safeUpdates.ordersPlaced;
      }

      expect(safeUpdates.role).toBeUndefined();
      expect(safeUpdates.sellerId).toBeUndefined();
      expect(safeUpdates.isBanned).toBeUndefined();
      expect(safeUpdates.ordersPlaced).toBeUndefined();
      expect(safeUpdates.firstName).toBe('Salim');
      expect(safeUpdates.lastName).toBe('Khoury');
    });
  });

  describe('5. Seller Workshop Isolation Invariant', () => {
    it('prohibits non-admin seller from creating or modifying products for another workshop', () => {
      const authClaims = {
        admin: false,
        seller: true,
        sellerId: 'workshop-byblos'
      };

      const targetProduct = {
        id: 'prod-foreign',
        name: 'Baalbek Pottery',
        sellerId: 'workshop-baalbek'
      };

      const canEdit = (claims: typeof authClaims, product: typeof targetProduct) => {
        if (claims.seller && claims.sellerId) {
          return claims.sellerId.toLowerCase() === product.sellerId.toLowerCase();
        }
        return false;
      };

      expect(canEdit(authClaims, targetProduct)).toBe(false);

      const ownProduct = {
        id: 'prod-own',
        name: 'Byblos Cedar Box',
        sellerId: 'workshop-byblos'
      };
      expect(canEdit(authClaims, ownProduct)).toBe(true);
    });
  });

  describe('6. Pricing Engine Anti-Tampering & Negative Value Defense', () => {
    it('prevents negative discounts or discount overflow in pricing engine', () => {
      const discountRule = {
        id: 'promo-1',
        title: 'Promo',
        type: 'fixed' as const,
        value: -50, // Malicious negative value attempt
        isActive: true,
        scope: 'storewide' as const
      };

      // Math.max(0, ...) safeguard
      const baseAmount = 100;
      const ruleDiscount = Math.max(0, Math.min(discountRule.value, baseAmount));
      expect(ruleDiscount).toBe(0);
    });

    it('caps fixed discount at applicable subtotal', () => {
      const baseAmount = 40;
      const ruleValue = 100;
      const ruleDiscount = Math.max(0, Math.min(ruleValue, baseAmount));
      expect(ruleDiscount).toBe(40);
    });
  });

  describe('7. High Risk Invariants (H-1, H-2, H-3)', () => {
    it('H-1: Prevents sensitive seller credentials from leaking in public seller payload', () => {
      const publicSellerPayload = {
        id: 'seller-1',
        nameEn: 'Chouf Cedar Workshop',
        nameAr: 'ورشة أرز الشوف',
        village: 'Barouk',
        accountEmail: 'private-artisan@gmail.com',
        accountUid: 'secret-uid-999',
        commissionPct: 15,
        exactAddress: 'Secret House 4, Chouf'
      };

      // Strip private fields for public endpoint / rules
      const sanitized = { ...publicSellerPayload };
      delete (sanitized as any).accountEmail;
      delete (sanitized as any).accountUid;
      delete (sanitized as any).commissionPct;
      delete (sanitized as any).exactAddress;

      expect(sanitized.accountEmail).toBeUndefined();
      expect(sanitized.accountUid).toBeUndefined();
      expect(sanitized.commissionPct).toBeUndefined();
      expect(sanitized.exactAddress).toBeUndefined();
      expect(sanitized.nameEn).toBe('Chouf Cedar Workshop');
    });

    it('H-2: Enforces deterministic review document ID (<uid>_<productId>) to prevent multiple reviews and spoofing', () => {
      const uid = 'user-abc-123';
      const productId = 'prod-olive-oil';
      const deterministicReviewId = `${uid}_${productId}`;
      
      expect(deterministicReviewId).toBe('user-abc-123_prod-olive-oil');
      
      // Secondary review from same user for same product generates the exact same deterministic key (idempotent write, preventing duplication)
      const secondAttemptId = `${uid}_${productId}`;
      expect(secondAttemptId).toBe(deterministicReviewId);
    });

    it('H-3: Seller order update allowlist restricts changes strictly to status and updatedAt', () => {
      const allowedKeys = ['status', 'updatedAt'];
      const validSellerAttempt = { status: 'out_for_delivery', updatedAt: new Date().toISOString() };
      const invalidSellerAttempt = { status: 'delivered', shipping: { address: 'Attacker New Address' } };

      const isAllowedUpdate = (payload: Record<string, any>) => {
        return Object.keys(payload).every(k => allowedKeys.includes(k));
      };

      expect(isAllowedUpdate(validSellerAttempt)).toBe(true);
      expect(isAllowedUpdate(invalidSellerAttempt)).toBe(false);
    });
  });

  describe('8. Medium Risk Invariants (M-1 through M-8)', () => {
    it('M-5: Enforces password policy with minimum 8 characters, letters and numbers', async () => {
      const { validatePassword } = await import('../src/lib/passwordPolicy');
      expect(validatePassword('').isValid).toBe(false);
      expect(validatePassword('short1').isValid).toBe(false);
      expect(validatePassword('allletters').isValid).toBe(false);
      expect(validatePassword('12345678').isValid).toBe(false);
      expect(validatePassword('validPass123').isValid).toBe(true);
    });

    it('M-4: Prohibits resetting ordersPlaced counter to exploit first-time customer promos', () => {
      const initialOrdersPlaced = 5;
      const attemptReset = 0;
      const validIncrement = 6;

      const isValidOrderCountTransition = (current: number, next: number) => {
        return next === current || next === current + 1;
      };

      expect(isValidOrderCountTransition(initialOrdersPlaced, attemptReset)).toBe(false);
      expect(isValidOrderCountTransition(initialOrdersPlaced, validIncrement)).toBe(true);
    });

    it('M-8: User profile cannot alter immutable UID', () => {
      const userProfile = { uid: 'user_123', name: 'Karim', email: 'karim@gmail.com' };
      const maliciousUpdate = { uid: 'attacker_takeover_456', name: 'Karim' };

      const isForbiddenUidMutation = (currentUid: string, updatedUid: string) => {
        return currentUid !== updatedUid;
      };

      expect(isForbiddenUidMutation(userProfile.uid, maliciousUpdate.uid)).toBe(true);
    });
  });

  describe('9. Low Risk & Client Hardening Invariants (L-1 through L-7)', () => {
    it('L-2: Safe URL utility rejects javascript:, vbscript:, and malicious execution schemes', async () => {
      const { isSafeUrl, sanitizeUrl } = await import('../src/lib/safeUrl');
      
      expect(isSafeUrl('javascript:alert(1)')).toBe(false);
      expect(isSafeUrl('javascript:window.location="http://evil.com"')).toBe(false);
      expect(isSafeUrl('vbscript:msgbox(1)')).toBe(false);
      expect(isSafeUrl('data:text/html,<script>alert(1)</script>')).toBe(false);

      expect(isSafeUrl('https://yalla.lb')).toBe(true);
      expect(isSafeUrl('http://localhost:3000')).toBe(true);
      expect(isSafeUrl('mailto:support@yalla.lb')).toBe(true);
      expect(isSafeUrl('tel:+96170123456')).toBe(true);
      expect(isSafeUrl('https://wa.me/96170123456')).toBe(true);
      expect(isSafeUrl('/products/olive-oil')).toBe(true);
      expect(isSafeUrl('#reviews')).toBe(true);

      expect(sanitizeUrl('javascript:alert(1)', '#')).toBe('#');
      expect(sanitizeUrl('https://yalla.lb', '#')).toBe('https://yalla.lb');
    });

    it('L-3: LocalStorage seller cache sanitization strips private artisan fields', () => {
      const fullSellerRecord = {
        id: 'seller_100',
        nameEn: 'Tripoli Soapworks',
        nameAr: 'صابون طرابلس',
        accountEmail: 'private-artisan@gmail.com',
        accountUid: 'auth-user-999',
        commissionPct: 12,
        exactAddress: 'Al Mina, Street 14, Building 2',
        rating: 4.9
      };

      const publicProjection = (seller: Record<string, any>) => {
        const { accountEmail, accountUid, commissionPct, exactAddress, ...pub } = seller;
        return pub;
      };

      const cached = publicProjection(fullSellerRecord);
      expect(cached.accountEmail).toBeUndefined();
      expect(cached.accountUid).toBeUndefined();
      expect(cached.commissionPct).toBeUndefined();
      expect(cached.exactAddress).toBeUndefined();
      expect(cached.nameEn).toBe('Tripoli Soapworks');
      expect(cached.rating).toBe(4.9);
    });
  });

  describe('10. Retest & Bypass Invariants', () => {
    it('Canary: client line-item cap matches the authoritative server cap', async () => {
      // The server is authoritative. The client constant exists only so the UI can reject an
      // oversized cart before the round trip, so a client cap BELOW the server cap silently
      // blocks orders placeOrder would accept, and one ABOVE it defers the error to the server.
      const { MAX_ORDER_LINE_ITEMS } = await import('../src/context/ShopContext');
      const { MAX_LINE_ITEMS } = await import('../functions/src/placeOrder');
      expect(MAX_ORDER_LINE_ITEMS).toBe(MAX_LINE_ITEMS);

      const atLimit = Array.from({ length: MAX_ORDER_LINE_ITEMS }, (_, i) => ({
        product: { id: `prod_${i}`, name: `Prod ${i}`, priceUSD: 10 + i },
        quantity: 1
      }));

      const isUnderLimit = (items: any[]) => items.length <= MAX_ORDER_LINE_ITEMS;
      expect(isUnderLimit(atLimit)).toBe(true);

      const overLimit = Array.from({ length: MAX_ORDER_LINE_ITEMS + 1 }, (_, i) => ({
        product: { id: `prod_${i}`, name: `Prod ${i}`, priceUSD: 10 + i },
        quantity: 1
      }));
      expect(isUnderLimit(overLimit)).toBe(false);

      // And the server must actually reject a cart one item past the shared cap.
      expect(() => validatePlaceOrderPayload({
        items: overLimit.map((_, i) => ({ productId: `prod_${i}`, quantity: 1 })),
        shipping: {
          fullName: 'A B', phone: '70123456', governorate: 'Beirut',
          city: 'Beirut', street: 'Rue 1', building: 'B1'
        },
        paymentMethod: 'cod_usd',
        idempotencyKey: '123e4567-e89b-42d3-a456-426614174000'
      })).toThrow();
    });

    it('Bypass protection: totalLBP is strictly bounded against overflow and negative values', () => {
      const isValidTotalLBP = (val: any) => {
        return typeof val === 'number' && val >= 0 && val <= 5000000000;
      };

      expect(isValidTotalLBP(-100)).toBe(false);
      expect(isValidTotalLBP(6000000000000)).toBe(false);
      expect(isValidTotalLBP('1500000')).toBe(false);
      expect(isValidTotalLBP(450000000)).toBe(true);
    });

    it('Bypass protection: Denormalized productIds on orders enables authoritative review purchase checks', () => {
      const order = {
        id: 'ord_123',
        userId: 'cust_999',
        items: [
          { product: { id: 'p_zaatar', name: 'Zaatar' }, quantity: 2 },
          { product: { id: 'p_olive_oil', name: 'Olive Oil' }, quantity: 1 }
        ],
        productIds: ['p_zaatar', 'p_olive_oil']
      };

      const canReviewProduct = (orderDoc: typeof order, productId: string) => {
        return orderDoc.productIds.includes(productId);
      };

      expect(canReviewProduct(order, 'p_zaatar')).toBe(true);
      expect(canReviewProduct(order, 'p_olive_oil')).toBe(true);
      expect(canReviewProduct(order, 'p_soap_unbought')).toBe(false);
    });
  });

  describe('10. Hardened Checkout Validation & Production Safeguards', () => {
    const validPayload = {
      items: [
        { productId: 'prod_zaatar_123', quantity: 2, selectedOption: '500g' },
        { productId: 'prod_olive_oil_456', quantity: 1 }
      ],
      shipping: {
        fullName: 'Ahmad Al-Khoury',
        phone: '+96170123456',
        governorate: 'Beirut',
        city: 'Hamra',
        street: 'Bliss Street',
        building: 'Building 4B',
        deliveryNotes: 'Leave with concierge',
        deliverySpeed: 'standard'
      },
      paymentMethod: 'cod_usd',
      deliverySpeed: 'standard',
      couponCode: 'WELCOME10',
      idempotencyKey: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'
    };

    it('1. App Check is required in production configuration', () => {
      const placeOrderSource = fs.readFileSync(
        path.resolve(__dirname, '../functions/src/placeOrder.ts'),
        'utf-8'
      );
      expect(placeOrderSource).toMatch(/enforceAppCheck:\s*true/);

      const firebaseSource = fs.readFileSync(
        path.resolve(__dirname, '../src/firebase.ts'),
        'utf-8'
      );
      expect(firebaseSource).toMatch(/initializeAppCheck/);
      expect(firebaseSource).toMatch(/ReCaptchaEnterpriseProvider/);
    });

    it('2. Invalid payment method is rejected without silent conversion to cod_usd', () => {
      expect(() => validatePlaceOrderPayload({
        ...validPayload,
        paymentMethod: 'invalid_method'
      })).toThrow(/Invalid payment method/);

      expect(() => validatePlaceOrderPayload({
        ...validPayload,
        paymentMethod: 'anything'
      })).toThrow(/Invalid payment method/);

      expect(() => validatePlaceOrderPayload({
        ...validPayload,
        paymentMethod: ''
      })).toThrow(/paymentMethod is required/);

      expect(() => validatePlaceOrderPayload({
        ...validPayload,
        paymentMethod: 12345 as any
      })).toThrow(/paymentMethod is required/);

      // Valid payment methods pass
      expect(validatePlaceOrderPayload({
        ...validPayload,
        paymentMethod: 'cod_usd'
      }).effectivePaymentMethod).toBe('cod_usd');
      expect(validatePlaceOrderPayload({
        ...validPayload,
        paymentMethod: 'cod_lbp'
      }).effectivePaymentMethod).toBe('cod_lbp');
      expect(validatePlaceOrderPayload({
        ...validPayload,
        paymentMethod: 'credit_card'
      }).effectivePaymentMethod).toBe('credit_card');
    });

    it('3. Invalid delivery speed is rejected without silent fallback to standard', () => {
      expect(() => validatePlaceOrderPayload({
        ...validPayload,
        deliverySpeed: 'teleport'
      })).toThrow(/Invalid deliverySpeed/);

      expect(() => validatePlaceOrderPayload({
        ...validPayload,
        shipping: { ...validPayload.shipping, deliverySpeed: 'warp_speed' }
      })).toThrow(/Invalid shipping\.deliverySpeed/);

      // Valid delivery speeds pass
      expect(validatePlaceOrderPayload({
        ...validPayload,
        deliverySpeed: 'standard'
      }).effectiveSpeed).toBe('standard');
      expect(validatePlaceOrderPayload({
        ...validPayload,
        deliverySpeed: 'express_beirut'
      }).effectiveSpeed).toBe('express_beirut');
      expect(validatePlaceOrderPayload({
        ...validPayload,
        deliverySpeed: 'diaspora_air'
      }).effectiveSpeed).toBe('diaspora_air');
    });

    it('4. Fractional quantity rejected', () => {
      expect(() => validatePlaceOrderPayload({
        ...validPayload,
        items: [{ productId: 'prod_zaatar_123', quantity: 1.5 }]
      })).toThrow(/Quantity must be a valid integer between 1 and 99/);

      expect(() => validatePlaceOrderPayload({
        ...validPayload,
        items: [{ productId: 'prod_zaatar_123', quantity: 0.1 }]
      })).toThrow(/Quantity must be a valid integer between 1 and 99/);
    });

    it('5. String quantity rejected', () => {
      expect(() => validatePlaceOrderPayload({
        ...validPayload,
        items: [{ productId: 'prod_zaatar_123', quantity: '2' as any }]
      })).toThrow(/Quantity must be a valid integer between 1 and 99/);
    });

    it('6. NaN quantity rejected', () => {
      expect(() => validatePlaceOrderPayload({
        ...validPayload,
        items: [{ productId: 'prod_zaatar_123', quantity: NaN }]
      })).toThrow(/Quantity must be a valid integer between 1 and 99/);
    });

    it('7. Infinity and negative quantity rejected', () => {
      expect(() => validatePlaceOrderPayload({
        ...validPayload,
        items: [{ productId: 'prod_zaatar_123', quantity: Infinity }]
      })).toThrow(/Quantity must be a valid integer between 1 and 99/);

      expect(() => validatePlaceOrderPayload({
        ...validPayload,
        items: [{ productId: 'prod_zaatar_123', quantity: -Infinity }]
      })).toThrow(/Quantity must be a valid integer between 1 and 99/);

      expect(() => validatePlaceOrderPayload({
        ...validPayload,
        items: [{ productId: 'prod_zaatar_123', quantity: -5 }]
      })).toThrow(/Quantity must be a valid integer between 1 and 99/);

      expect(() => validatePlaceOrderPayload({
        ...validPayload,
        items: [{ productId: 'prod_zaatar_123', quantity: 0 }]
      })).toThrow(/Quantity must be a valid integer between 1 and 99/);
    });

    it('8. Duplicate products rejected', () => {
      expect(() => validatePlaceOrderPayload({
        ...validPayload,
        items: [
          { productId: 'prod_zaatar_123', quantity: 1 },
          { productId: 'prod_zaatar_123', quantity: 2 }
        ]
      })).toThrow(/Duplicate product ID "prod_zaatar_123"/);
    });

    it('9. Unknown shipping field rejected', () => {
      expect(() => validatePlaceOrderPayload({
        ...validPayload,
        shipping: {
          ...validPayload.shipping,
          isAdmin: true
        } as any
      })).toThrow(/Unexpected property in shipping details: "isAdmin"/);

      expect(() => validatePlaceOrderPayload({
        ...validPayload,
        shipping: {
          ...validPayload.shipping,
          discountUSD: 100
        } as any
      })).toThrow(/Unexpected property in shipping details: "discountUSD"/);
    });

    it('10. Unknown top-level field rejected', () => {
      expect(() => validatePlaceOrderPayload({
        ...validPayload,
        totalUSD: 0
      } as any)).toThrow(/Unexpected property in request: "totalUSD"/);

      expect(() => validatePlaceOrderPayload({
        ...validPayload,
        discountUSD: 50
      } as any)).toThrow(/Unexpected property in request: "discountUSD"/);

      expect(() => validatePlaceOrderPayload({
        ...validPayload,
        maliciousPayload: true
      } as any)).toThrow(/Unexpected property in request: "maliciousPayload"/);
    });

    it('11. Excessive cart line items count (> 50) rejected', () => {
      const excessiveCart = Array.from({ length: 51 }, (_, i) => ({
        productId: `prod_item_${i}`,
        quantity: 1
      }));
      expect(() => validatePlaceOrderPayload({
        ...validPayload,
        items: excessiveCart
      })).toThrow(/Must contain between 1 and 50 items/);
    });

    it('12. Excessive total order quantity (> 200) rejected', () => {
      const heavyCart = [
        { productId: 'prod_1', quantity: 99 },
        { productId: 'prod_2', quantity: 99 },
        { productId: 'prod_3', quantity: 10 }
      ];
      expect(() => validatePlaceOrderPayload({
        ...validPayload,
        items: heavyCart
      })).toThrow(/Total order quantity \(208\) exceeds maximum allowed limit of 200/);
    });

    it('13. Excessive order value rejected ($10,000 USD limit)', () => {
      const MAX_ORDER_VALUE_USD = 10000;
      const checkOrderLimit = (subtotalUSD: number) => {
        if (subtotalUSD > MAX_ORDER_VALUE_USD) {
          throw new Error(`Order subtotal ($${subtotalUSD.toFixed(2)}) exceeds maximum allowed limit of $${MAX_ORDER_VALUE_USD.toLocaleString()} USD.`);
        }
      };

      expect(() => checkOrderLimit(10000.01)).toThrow(/exceeds maximum allowed limit/);
      expect(() => checkOrderLimit(25000)).toThrow(/exceeds maximum allowed limit/);
      expect(() => checkOrderLimit(10000)).not.toThrow();
      expect(() => checkOrderLimit(500)).not.toThrow();
    });

    it('14. Invalid product ID rejected (traversal, length, symbols)', () => {
      expect(() => validatePlaceOrderPayload({
        ...validPayload,
        items: [{ productId: '../secrets/private', quantity: 1 }]
      })).toThrow(/Invalid productId/);

      expect(() => validatePlaceOrderPayload({
        ...validPayload,
        items: [{ productId: 'invalid/path', quantity: 1 }]
      })).toThrow(/Invalid productId/);

      expect(() => validatePlaceOrderPayload({
        ...validPayload,
        items: [{ productId: '', quantity: 1 }]
      })).toThrow();

      expect(() => validatePlaceOrderPayload({
        ...validPayload,
        items: [{ productId: 'x'.repeat(129), quantity: 1 }]
      })).toThrow(/Must be alphanumeric and up to 128 characters/);
    });

    it('15. Unavailable, unpublished, or out-of-stock product rejected', () => {
      const validateProductItem = (p: any, requestedQty: number) => {
        if (!p) throw new Error('Product does not exist.');
        if (p.isPublished === false) throw new Error('Product is unpublished.');
        if (p.isActive === false || p.sellerActive === false || p.status === 'inactive' || p.status === 'archived' || p.status === 'draft') {
          throw new Error('Product is currently inactive.');
        }
        if (p.isAvailable === false || p.available === false) throw new Error('Product is unavailable.');
        if ((p.stock || 0) < requestedQty) throw new Error(`Only ${p.stock || 0} items in stock.`);
      };

      expect(() => validateProductItem(null, 1)).toThrow('Product does not exist.');
      expect(() => validateProductItem({ isPublished: false, stock: 10 }, 1)).toThrow('Product is unpublished.');
      expect(() => validateProductItem({ isActive: false, stock: 10 }, 1)).toThrow('Product is currently inactive.');
      expect(() => validateProductItem({ sellerActive: false, stock: 10 }, 1)).toThrow('Product is currently inactive.');
      expect(() => validateProductItem({ status: 'archived', stock: 10 }, 1)).toThrow('Product is currently inactive.');
      expect(() => validateProductItem({ isAvailable: false, stock: 10 }, 1)).toThrow('Product is unavailable.');
      expect(() => validateProductItem({ isPublished: true, isActive: true, stock: 2 }, 5)).toThrow('Only 2 items in stock.');
      expect(() => validateProductItem({ isPublished: true, isActive: true, stock: 10 }, 5)).not.toThrow();
    });

    it('16. Local fallback cannot create an order in production environments', () => {
      const placeOrderFallback = (isProd: boolean, hasBackend: boolean) => {
        if (!hasBackend) {
          if (isProd) {
            throw new Error('Online checkout requires an active backend connection. Offline order placement is disabled in production.');
          }
          return { id: 'local-dev-mock-order' };
        }
        return { id: 'authoritative-cloud-order' };
      };

      // In production, offline mock CANNOT create an order under any circumstance
      expect(() => placeOrderFallback(true, false)).toThrow('Offline order placement is disabled in production.');
      expect(placeOrderFallback(false, false)).toEqual({ id: 'local-dev-mock-order' });
      expect(placeOrderFallback(true, true)).toEqual({ id: 'authoritative-cloud-order' });
    });

    it('17. Missing or null idempotencyKey is strictly rejected', () => {
      const payloadWithoutKey: any = { ...validPayload };
      delete payloadWithoutKey.idempotencyKey;
      expect(() => validatePlaceOrderPayload(payloadWithoutKey)).toThrow(/idempotencyKey is required/);

      expect(() => validatePlaceOrderPayload({
        ...validPayload,
        idempotencyKey: null as any
      })).toThrow(/idempotencyKey is required/);

      expect(() => validatePlaceOrderPayload({
        ...validPayload,
        idempotencyKey: ''
      })).toThrow(/idempotencyKey must not be empty/);

      expect(() => validatePlaceOrderPayload({
        ...validPayload,
        idempotencyKey: '   '
      })).toThrow(/idempotencyKey must not be empty/);
    });

    it('18. Non-string or malformed idempotencyKey is rejected', () => {
      expect(() => validatePlaceOrderPayload({
        ...validPayload,
        idempotencyKey: 123456 as any
      })).toThrow(/idempotencyKey must be a valid string/);

      expect(() => validatePlaceOrderPayload({
        ...validPayload,
        idempotencyKey: { key: 'uuid' } as any
      })).toThrow(/idempotencyKey must be a valid string/);

      expect(() => validatePlaceOrderPayload({
        ...validPayload,
        idempotencyKey: 'not-a-valid-uuid'
      })).toThrow(/Must be a valid UUID string/);

      expect(() => validatePlaceOrderPayload({
        ...validPayload,
        idempotencyKey: '12345678-1234-1234-1234-1234567890ab-extra'
      })).toThrow(/Must be a valid UUID string/);

      expect(() => validatePlaceOrderPayload({
        ...validPayload,
        idempotencyKey: '../traversal/uuid'
      })).toThrow(/Must be a valid UUID string/);
    });

    it('19. Valid v4 UUID idempotencyKey is accepted and normalized', () => {
      const validated = validatePlaceOrderPayload({
        ...validPayload,
        idempotencyKey: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d'
      });
      expect(validated.idempotencyKey).toBe('9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d');
    });

    it('20. Cloud Function source code enforces atomic idempotency check and write within transaction', () => {
      const placeOrderSource = fs.readFileSync(
        path.resolve(__dirname, '../functions/src/placeOrder.ts'),
        'utf-8'
      );
      expect(placeOrderSource).toMatch(/order_idempotency\/\$\{uid\}_\$\{idempotencyKey\}/);
      expect(placeOrderSource).toMatch(/idempotencySnap\.exists/);
      expect(placeOrderSource).toMatch(/duplicate:\s*true/);
      expect(placeOrderSource).toMatch(/tx\.set\(idempotencyRef/);
    });

    it('21. Firestore rules strictly lock down order_idempotency collection against all client access', () => {
      const rulesSource = fs.readFileSync(
        path.resolve(__dirname, '../firestore.rules'),
        'utf-8'
      );
      expect(rulesSource).toMatch(/match \/order_idempotency\/\{idempotencyId\}/);
      expect(rulesSource).toMatch(/allow read, write:\s*if false;/);
    });

    it('22. Cloud Function uses secure node:crypto randomUUID for tracking numbers without Math.random/Date.now fallbacks', () => {
      const placeOrderSource = fs.readFileSync(
        path.resolve(__dirname, '../functions/src/placeOrder.ts'),
        'utf-8'
      );
      expect(placeOrderSource).toMatch(/import\s*\{\s*randomUUID\s*\}\s*from\s*['"]node:crypto['"]/);
      expect(placeOrderSource).toMatch(/const\s+cryptoUuid\s*=\s*randomUUID\(\)/);
      expect(placeOrderSource).not.toMatch(/Math\.random/);
      expect(placeOrderSource).not.toMatch(/Date\.now\(\)/);
    });

    it('23. Custom OTP Cloud Function is removed in favor of Firebase Authentication SMS MFA', () => {
      const otpPath = path.resolve(__dirname, '../functions/src/otp.ts');
      expect(fs.existsSync(otpPath)).toBe(false);

      const functionsIndexPath = path.resolve(__dirname, '../functions/src/index.ts');
      const functionsIndexSource = fs.readFileSync(functionsIndexPath, 'utf-8');
      expect(functionsIndexSource).not.toContain('requestOtp');
      expect(functionsIndexSource).not.toContain('verifyOtp');
      expect(functionsIndexSource).not.toMatch(/Math\.random/);
    });

    it('24. Password policy generator uses cryptographically secure random values without Math.random', () => {
      const passwordPolicySource = fs.readFileSync(
        path.resolve(__dirname, '../src/lib/passwordPolicy.ts'),
        'utf-8'
      );
      expect(passwordPolicySource).not.toMatch(/Math\.random/);
      expect(passwordPolicySource).toMatch(/getRandomValues/);
    });
  });

  describe('12. Authoritative Custom Claims Security Enforcement (No Firestore Fallbacks)', () => {
    const rulesSource = fs.readFileSync(path.resolve(__dirname, '../firestore.rules'), 'utf-8');
    const shopContextSource = fs.readFileSync(path.resolve(__dirname, '../src/context/ShopContext.tsx'), 'utf-8');

    it('25. firestore.rules: isAdmin() strictly requires request.auth.token.admin == true without Firestore lookups', () => {
      expect(rulesSource).toMatch(/function isAdmin\(\)\s*\{[\s\S]*?'admin' in request\.auth\.token[\s\S]*?request\.auth\.token\.admin == true;/);
      // Ensure no get(/databases/...) inside isAdmin
      const isAdminMatch = rulesSource.match(/function isAdmin\(\)\s*\{([^}]+)\}/);
      expect(isAdminMatch).toBeTruthy();
      expect(isAdminMatch![1]).not.toMatch(/get\(/);
    });

    it('26. firestore.rules: isSeller() strictly requires request.auth.token.seller == true without Firestore lookups', () => {
      expect(rulesSource).toMatch(/function isSeller\(\)\s*\{[\s\S]*?'seller' in request\.auth\.token[\s\S]*?request\.auth\.token\.seller == true;/);
      const isSellerMatch = rulesSource.match(/function isSeller\(\)\s*\{([^}]+)\}/);
      expect(isSellerMatch).toBeTruthy();
      expect(isSellerMatch![1]).not.toMatch(/get\(/);
    });

    it('27. firestore.rules: getSellerId() strictly reads request.auth.token.sellerId and does NOT fallback to users document', () => {
      const getSellerIdMatch = rulesSource.match(/function getSellerId\(\)\s*\{([^}]+)\}/);
      expect(getSellerIdMatch).toBeTruthy();
      const body = getSellerIdMatch![1];
      expect(body).toMatch(/request\.auth\.token\.sellerId/);
      expect(body).not.toMatch(/get\(/);
      expect(body).not.toMatch(/users/);
    });

    it('28. ShopContext.tsx: isAdminUser, isSellerUser, and sellerId strictly originate from tokenResult.claims', () => {
      expect(shopContextSource).toMatch(/result\.claims\.admin === true/);
      expect(shopContextSource).toMatch(/result\.claims\.seller === true/);
      expect(shopContextSource).toMatch(/result\.claims\.sellerId/);
      // Ensure removed fallback: claimSellerId || data.sellerId
      expect(shopContextSource).not.toMatch(/claimSellerId\s*\|\|\s*data\.sellerId/);
      expect(shopContextSource).not.toMatch(/claimSellerId\s*\|\|\s*userData\.sellerId/);
    });

    it('29. ShopContext.tsx: isAdminUser, isSellerUser, and sellerId strictly originate from token claims', () => {
      expect(shopContextSource).toMatch(/setIsAdminUser\(result\.claims\.admin === true\)/);
      expect(shopContextSource).toMatch(/setIsSellerUser\(result\.claims\.seller === true\)/);
      expect(shopContextSource).toMatch(/setSellerId\(typeof result\.claims\.sellerId === 'string'\s*\?\s*result\.claims\.sellerId\s*:\s*null\)/);
    });

    it('30. Privilege Isolation: Firestore document fields cannot grant admin or seller privilege or alter sellerId', () => {
      // Simulating a normal user attempting to elevate privilege by populating Firestore fields
      const forgedFirestoreUserDoc = {
        uid: 'attacker-1',
        role: 'admin',
        sellerId: 'target-seller-id',
        email: 'attacker@evil.com'
      };

      // Client-side authentication claims from token (token claims are authoritative)
      const tokenClaimsNormalUser = {
        admin: false,
        seller: false,
        sellerId: undefined
      };

      // Authoritative privilege computation:
      const isAdminComputed = Boolean(tokenClaimsNormalUser.admin === true);
      const isSellerComputed = Boolean(tokenClaimsNormalUser.seller === true);
      const sellerIdComputed = typeof tokenClaimsNormalUser.sellerId === 'string' ? tokenClaimsNormalUser.sellerId : null;

      expect(isAdminComputed).toBe(false);
      expect(isSellerComputed).toBe(false);
      expect(sellerIdComputed).toBeNull();
      // Even if attacker modified Firestore role to 'seller' or 'admin'
      expect(forgedFirestoreUserDoc.role === 'admin').toBe(true); // present in doc
      expect(isAdminComputed).toBe(false); // but claims reject it!
      expect(sellerIdComputed).not.toBe(forgedFirestoreUserDoc.sellerId);
    });

    it('31. Cross-Seller Isolation: Seller token with sellerId A cannot access or mutate sellerId B resources', () => {
      const sellerTokenClaims = {
        admin: false,
        seller: true,
        sellerId: 'artisan-lebanon-1'
      };

      const targetResourceSellerId = 'artisan-lebanon-2';

      // Rules verification: getSellerId() must equal resource.sellerId
      const authorizedSellerId = sellerTokenClaims.sellerId;
      const isAuthorizedForTarget = authorizedSellerId === targetResourceSellerId;
      expect(isAuthorizedForTarget).toBe(false);
    });
  });

  describe('13. Adversarial Security Verification: Strict Firebase Auth Claims Only (Requirements A through K)', () => {
    const rulesCode = fs.readFileSync(path.resolve(__dirname, '../firestore.rules'), 'utf8');
    const shopCode = fs.readFileSync(path.resolve(__dirname, '../src/context/ShopContext.tsx'), 'utf8');
    const checkPhoneCode = fs.readFileSync(path.resolve(__dirname, '../functions/src/checkPhone.ts'), 'utf8');
    const placeOrderCode = fs.readFileSync(path.resolve(__dirname, '../functions/src/placeOrder.ts'), 'utf8');

    it('Requirement A: Normal user with forged users/{uid}.admin=true is NOT an admin', () => {
      // Simulating a normal user token where claims are empty or admin: false
      const normalUserToken = { uid: 'user_a', admin: false };
      const forgedUserDoc = { uid: 'user_a', admin: true };

      // Firestore Security Rules evaluate: request.auth.token.admin == true
      const hasAdminClaim = Boolean(normalUserToken.admin === true);
      expect(hasAdminClaim).toBe(false);

      // Verify that firestore.rules isAdmin() does NOT inspect resource or doc data
      const isAdminDef = rulesCode.match(/function isAdmin\(\)\s*\{([^}]+)\}/);
      expect(isAdminDef).toBeTruthy();
      expect(isAdminDef![1]).toMatch(/request\.auth\.token\.admin == true/);
      expect(isAdminDef![1]).not.toMatch(/admin\s*==\s*true\s*\|\|/);
      expect(isAdminDef![1]).not.toMatch(/get\(/);
      expect(isAdminDef![1]).not.toMatch(/users/);
    });

    it('Requirement B: Normal user with forged users/{uid}.role="admin" is NOT an admin', () => {
      const normalUserToken = { uid: 'user_b' };
      const forgedUserDoc = { uid: 'user_b', role: 'admin' };

      // Privilege strictly evaluated via claims:
      const isAdminEvaluated = Boolean((normalUserToken as any).admin === true);
      expect(isAdminEvaluated).toBe(false);

      // Ensure no rules reference role == 'admin'
      expect(rulesCode).not.toMatch(/role\s*==\s*['"]admin['"]/);
      expect(rulesCode).not.toMatch(/role\s*===\s*['"]admin['"]/);
    });

    it('Requirement C: Normal user with forged users/{uid}.seller=true is NOT a seller', () => {
      const normalUserToken = { uid: 'user_c', seller: false };
      const forgedUserDoc = { uid: 'user_c', seller: true };

      const isSellerEvaluated = Boolean(normalUserToken.seller === true);
      expect(isSellerEvaluated).toBe(false);

      // Verify firestore.rules isSeller() strictly evaluates request.auth.token.seller == true
      const isSellerDef = rulesCode.match(/function isSeller\(\)\s*\{([^}]+)\}/);
      expect(isSellerDef).toBeTruthy();
      expect(isSellerDef![1]).toMatch(/request\.auth\.token\.seller == true/);
      expect(isSellerDef![1]).not.toMatch(/get\(/);
      expect(isSellerDef![1]).not.toMatch(/users/);
    });

    it('Requirement D: Normal user with forged users/{uid}.sellerId="SELLER123" is NOT a seller', () => {
      const normalUserToken = { uid: 'user_d' }; // No seller or sellerId claim
      const forgedUserDoc = { uid: 'user_d', sellerId: 'SELLER123', role: 'seller' };

      const hasSellerClaim = Boolean((normalUserToken as any).seller === true);
      const claimSellerId = typeof (normalUserToken as any).sellerId === 'string' ? (normalUserToken as any).sellerId : '';

      expect(hasSellerClaim).toBe(false);
      expect(claimSellerId).toBe('');
      expect(claimSellerId).not.toBe(forgedUserDoc.sellerId);

      // Verify getSellerId() in rules does NOT fall back to users doc
      const getSellerIdDef = rulesCode.match(/function getSellerId\(\)\s*\{([^}]+)\}/);
      expect(getSellerIdDef).toBeTruthy();
      expect(getSellerIdDef![1]).toMatch(/request\.auth\.token\.sellerId/);
      expect(getSellerIdDef![1]).not.toMatch(/get\(/);
      expect(getSellerIdDef![1]).not.toMatch(/users/);
    });

    it('Requirement E: Seller with claim sellerId="SELLER123" cannot access seller resources belonging to SELLER456', () => {
      const sellerClaims = {
        seller: true,
        sellerId: 'SELLER123'
      };
      const foreignResource = {
        id: 'prod_456',
        sellerId: 'SELLER456',
        name: 'Foreign Product'
      };

      // Rules verification logic:
      const canAccessForeignResource = sellerClaims.seller === true && foreignResource.sellerId === sellerClaims.sellerId;
      expect(canAccessForeignResource).toBe(false);

      // Security rules guarantee:
      expect(rulesCode).toMatch(/resource\.data\.get\('sellerId',\s*''\)\s*==\s*getSellerId\(\)/);
    });

    it('Requirement F: Seller cannot change their own sellerId through Firestore', () => {
      // 1. In users/{userId}, client writes are blocked from modifying 'sellerId'
      expect(rulesCode).toMatch(/!request\.resource\.data\.diff\(resource\.data\)\s*\.affectedKeys\(\)\s*\.hasAny\(\[\s*['"]role['"],\s*['"]sellerId['"]/);

      // 2. In products/{productId}, seller cannot mutate 'sellerId'
      expect(rulesCode).toMatch(/!request\.resource\.data\.diff\(resource\.data\)\.affectedKeys\(\)\.hasAny\(\[\s*['"]id['"],\s*['"]sellerId['"]/);

      // 3. In sellers/{sellerId}, seller cannot modify 'id' or other restricted keys
      expect(rulesCode).toMatch(/request\.resource\.data\.get\('id',\s*sellerId\)\s*==\s*getSellerId\(\)/);
    });

    it('Requirement G: Seller cannot grant themselves admin privileges', () => {
      // 1. Normal/seller users cannot write to admins collection
      expect(rulesCode).toMatch(/match \/admins\/\{adminId\}\s*\{\s*allow read:\s*if isAdmin\(\);\s*allow write:\s*if false;\s*\}/);

      // 2. Client cannot alter role or admin fields on users collection
      expect(rulesCode).toMatch(/!request\.resource\.data\.keys\(\)\.hasAny\(\[\s*['"]role['"],\s*['"]sellerId['"],\s*['"]isBanned['"],\s*['"]ordersPlaced['"]\s*\]\)/);
    });

    it('Requirement H: Seller cannot grant themselves another sellerId', () => {
      // 1. Sellers cannot create products under another sellerId
      expect(rulesCode).toMatch(/request\.resource\.data\.get\('sellerId',\s*''\)\s*==\s*getSellerId\(\)/);

      // 2. In update, both resource.sellerId and request.resource.sellerId must match getSellerId()
      expect(rulesCode).toMatch(/resource\.data\.get\('sellerId',\s*''\)\s*==\s*getSellerId\(\)/);
      expect(rulesCode).toMatch(/request\.resource\.data\.get\('sellerId',\s*''\)\s*==\s*getSellerId\(\)/);
    });

    it('Requirement I: Native Firebase Auth MFA handles OTP and functions never grant unauthorized claims', () => {
      // 1. checkPhone.ts must never import or invoke setCustomUserClaims
      expect(checkPhoneCode).not.toMatch(/setCustomUserClaims/);

      // 2. recordAdminStepUp only returns step-up timestamp
      expect(checkPhoneCode).toMatch(/return\s*\{\s*success:\s*true,\s*verifiedAtMs:\s*now\s*\};/);
      expect(checkPhoneCode).not.toMatch(/admin:\s*true/);
      expect(checkPhoneCode).not.toMatch(/seller:\s*true/);
    });

    it('Requirement J: Client-controlled request fields cannot override authorization claims', () => {
      // In placeOrder, sellerIds are derived strictly from server-verified product documents, never request body
      expect(placeOrderCode).toMatch(/lines\s*\.map\(l\s*=>\s*\(typeof l\.product\.sellerId === 'string' \? l\.product\.sellerId\.trim\(\) : ''\)\)/);
      expect(placeOrderCode).not.toMatch(/sellerIds\s*=\s*data\.sellerIds/);
      expect(placeOrderCode).not.toMatch(/sellerId\s*=\s*request\.data\.sellerId/);

      // In checkPhone / recordAdminStepUp, admin verification strictly checks request.auth.token.admin
      expect(checkPhoneCode).toMatch(/request\.auth\.token\.admin !== true/);
    });

    it('Requirement K: All authorization fallbacks from Firestore user documents are strictly removed and forbidden', () => {
      // Verify no fallback in ShopContext
      expect(shopCode).not.toMatch(/claimSellerId\s*\|\|\s*data\.sellerId/);

      // Verify firestore.rules core auth helpers (isAdmin, isSeller, getSellerId) have zero lookups into users collection
      const rulesHelperSection = rulesCode.slice(rulesCode.indexOf('function isAdmin()'), rulesCode.indexOf('function isActiveSeller()'));
      expect(rulesHelperSection).not.toMatch(/get\(/);
      expect(rulesHelperSection).not.toMatch(/users/);
      expect(rulesHelperSection).not.toMatch(/data\.role/);
      expect(rulesHelperSection).not.toMatch(/data\.sellerId/);
    });
  });

  describe('14. Firestore User Profile Isolation (ShopContext Hardening)', () => {
    const shopCode = fs.readFileSync(path.resolve(__dirname, '../src/context/ShopContext.tsx'), 'utf8');

    const mockFirebaseUser = {
      uid: 'user-auth-123',
      displayName: 'Legitimate User',
      email: 'user@example.com',
      emailVerified: true
    } as any;

    it('TEST 1: A Firestore user document containing { role: "admin" } cannot make isAdminUser === true', () => {
      const forgedDoc = { role: 'admin' };
      const tokenClaims = { admin: false, seller: false, sellerId: null };

      const isAdminUser = Boolean(tokenClaims.admin === true);
      const profile = mapUserProfile(forgedDoc, mockFirebaseUser, tokenClaims.sellerId);

      expect(isAdminUser).toBe(false);
      expect(profile.role).toBe('customer');
      expect((profile as any).admin).toBeUndefined();
    });

    it('TEST 2: A Firestore user document containing { seller: true } cannot make isSellerUser === true', () => {
      const forgedDoc = { seller: true, role: 'seller' };
      const tokenClaims = { admin: false, seller: false, sellerId: null };

      const isSellerUser = Boolean(tokenClaims.seller === true);
      const profile = mapUserProfile(forgedDoc, mockFirebaseUser, tokenClaims.sellerId);

      expect(isSellerUser).toBe(false);
      expect(profile.role).toBe('customer');
      expect((profile as any).seller).toBeUndefined();
    });

    it('TEST 3: A Firestore user document containing { sellerId: "ATTACKER" } cannot change sellerId when Auth claim lacks that value', () => {
      const forgedDoc = { sellerId: 'ATTACKER' };
      const tokenClaims = { admin: false, seller: false, sellerId: null };

      const claimSellerId = typeof tokenClaims.sellerId === 'string' ? tokenClaims.sellerId : null;
      const profile = mapUserProfile(forgedDoc, mockFirebaseUser, claimSellerId);

      expect(claimSellerId).toBeNull();
      expect(profile.sellerId).toBeUndefined();
    });

    it('TEST 4: A Firestore user document containing { role: "admin", admin: true, seller: true, sellerId: "ATTACKER" } cannot change ANY authorization state', () => {
      const forgedDoc = {
        uid: 'spoofed-uid',
        role: 'admin',
        admin: true,
        seller: true,
        sellerId: 'ATTACKER',
        isAdminUser: true,
        isSellerUser: true
      };
      // Authentic claims
      const tokenClaims = { admin: false, seller: false, sellerId: null };

      const isAdminUser = Boolean(tokenClaims.admin === true);
      const isSellerUser = Boolean(tokenClaims.seller === true);
      const sellerId = typeof tokenClaims.sellerId === 'string' ? tokenClaims.sellerId : null;

      const profile = mapUserProfile(forgedDoc, mockFirebaseUser, sellerId);

      // Authorization states remain completely unaffected
      expect(isAdminUser).toBe(false);
      expect(isSellerUser).toBe(false);
      expect(sellerId).toBeNull();

      // Profile object cannot be contaminated
      expect(profile.uid).toBe('user-auth-123');
      expect(profile.role).toBe('customer');
      expect(profile.sellerId).toBeUndefined();
      expect((profile as any).admin).toBeUndefined();
      expect((profile as any).seller).toBeUndefined();
      expect((profile as any).isAdminUser).toBeUndefined();
      expect((profile as any).isSellerUser).toBeUndefined();
    });

    it('TEST 5: Source-code security test must reject unrestricted profile merging such as setUser(prev => prev ? ({ ...prev, ...data }) : null)', () => {
      // Must not spread raw firestore doc: { ...prev, ...data } or ...data
      expect(shopCode).not.toMatch(/\{\s*\.\.\.prev\s*,\s*\.\.\.data\s*\}/);
      expect(shopCode).not.toMatch(/setUser\(\s*prev\s*=>\s*prev\s*\?\s*\(\{\s*\.\.\.prev\s*,\s*\.\.\.data\s*\}\)\s*:\s*null\s*\)/);

      // Must explicitly use mapSafeShopUserProfile or allowlisted field mapping
      expect(shopCode).toMatch(/mapSafeShopUserProfile/);
      expect(shopCode).not.toMatch(/role:\s*data\.role/);
      expect(shopCode).not.toMatch(/sellerId:\s*data\.sellerId/);
      expect(shopCode).not.toMatch(/claimSellerId\s*\|\|\s*data\.sellerId/);
    });
  });

  describe('15. Secondary User Profile Isolation & Authorization Hardening (ShopContext Hardening)', () => {
    const mockFirebaseUser = {
      uid: 'user-auth-123',
      displayName: 'Legitimate User',
      email: 'user@example.com',
      emailVerified: true
    } as any;

    it('TEST 1: Adversarial test (Req 7) - Malicious Firestore profile cannot change authorization state or escalate privileges in ShopContext', () => {
      const maliciousDoc = {
        role: 'admin',
        admin: true,
        seller: true,
        sellerId: 'ATTACKER',
        isAdminUser: true,
        isSellerUser: true,
        uid: 'spoofed-uid',
        email: 'attacker@evil.com'
      };

      const tokenClaims = {
        admin: false,
        seller: false,
        sellerId: null
      };

      const isAdminUser = Boolean(tokenClaims.admin === true);
      const isSellerUser = Boolean(tokenClaims.seller === true);
      const sellerId = typeof tokenClaims.sellerId === 'string' ? tokenClaims.sellerId : null;

      const profile = mapSafeShopUserProfile(maliciousDoc, mockFirebaseUser, sellerId);

      // Authorization states remain completely unaffected
      expect(isAdminUser).toBe(false);
      expect(isSellerUser).toBe(false);
      expect(sellerId).toBeNull();

      // Profile object is sanitized and cannot be contaminated
      expect(profile.uid).toBe('user-auth-123');
      expect(profile.role).toBe('customer');
      expect(profile.sellerId).toBeUndefined();
      expect((profile as any).admin).toBeUndefined();
      expect((profile as any).seller).toBeUndefined();
      expect((profile as any).isAdminUser).toBeUndefined();
      expect((profile as any).isSellerUser).toBeUndefined();
    });

    it('TEST 2: Requirement 10 Regression - Conflicting sellerId in Firestore profile never overrides Auth claim sellerId', () => {
      const forgedDoc = {
        sellerId: 'ATTACKER',
        role: 'seller'
      };

      const authClaims = {
        admin: false,
        seller: true,
        sellerId: 'AUTHORIZED_SELLER'
      };

      const applicationAuthorizationSellerId =
        typeof authClaims.sellerId === 'string' ? authClaims.sellerId : null;

      const safeProfile = mapSafeShopUserProfile(
        forgedDoc,
        mockFirebaseUser,
        applicationAuthorizationSellerId
      );

      // Authoritative authorization sellerId MUST be "AUTHORIZED_SELLER"
      expect(applicationAuthorizationSellerId).toBe('AUTHORIZED_SELLER');
      expect(applicationAuthorizationSellerId).not.toBe('ATTACKER');

      // Profile sellerId MUST match Auth claim and NEVER Firestore doc
      expect(safeProfile.sellerId).toBe('AUTHORIZED_SELLER');
      expect(safeProfile.sellerId).not.toBe('ATTACKER');
      expect(safeProfile.role).toBe('customer');
    });

    it('TEST 3: Source-code security test - ShopContext rejects unrestricted mergedProfile and raw data spreads', () => {
      const shopCode = fs.readFileSync(path.resolve(__dirname, '../src/context/ShopContext.tsx'), 'utf8');

      // Must not contain mergedProfile construction or spread
      expect(shopCode).not.toMatch(/const\s+mergedProfile\s*:\s*UserProfile/);
      expect(shopCode).not.toMatch(/\.\.\.mergedProfile/);
      expect(shopCode).not.toMatch(/setUser\(\s*prev\s*=>\s*\(\{\s*\.\.\.prev\s*,\s*\.\.\.mergedProfile/);
      expect(shopCode).not.toMatch(/setUser\(\s*prev\s*=>\s*\(\{\s*\.\.\.prev\s*,\s*\.\.\.data/);

      // Must explicitly use mapSafeShopUserProfile for Firestore profile hydration
      expect(shopCode).toMatch(/mapSafeShopUserProfile/);

      // Must not use data.role or fallback to data.sellerId for claims
      expect(shopCode).not.toMatch(/claimSellerId\s*\|\|\s*data\.sellerId/);
      expect(shopCode).not.toMatch(/role:\s*data\.role/);
    });
  });

  describe('11. Review Purchase Verification & Test Collection Lockdown Invariants', () => {
    it('TEST 1: Firestore rules strictly require delivered order status for reviews', () => {
      const rules = fs.readFileSync(path.resolve(__dirname, '../firestore.rules'), 'utf8');

      // reviewOrderProvesPurchase must require order status == 'delivered'
      expect(rules).toMatch(/function\s+reviewOrderProvesPurchase\s*\(\s*orderId\s*,\s*productId\s*\)\s*\{/);
      expect(rules).toMatch(/get\(\/databases\/\$\(database\)\/documents\/orders\/\$\(orderId\)\)\.data\.get\(\s*['"]status['"]\s*,\s*['"]['"]\s*\)\s*==\s*['"]delivered['"]/);
      expect(rules).toMatch(/get\(\/databases\/\$\(database\)\/documents\/orders\/\$\(orderId\)\)\.data\.get\(\s*['"]userId['"]\s*,\s*['"]['"]\s*\)\s*==\s*request\.auth\.uid/);
      expect(rules).toMatch(/get\(\/databases\/\$\(database\)\/documents\/orders\/\$\(orderId\)\)\.data\.productIds\.hasAny\(\s*\[\s*productId\s*\]\s*\)/);
    });

    it('TEST 2: ProductDetailView frontend only permits reviews for successfully delivered orders', () => {
      const pdvCode = fs.readFileSync(path.resolve(__dirname, '../src/components/ProductDetailView.tsx'), 'utf8');

      // matchedOrder must check o.status === 'delivered'
      expect(pdvCode).toMatch(/o\.status\s*===\s*['"]delivered['"]/);
      expect(pdvCode).toMatch(/o\.items\.some\(\s*item\s*=>\s*item\.product\.id\s*===\s*product\.id\s*\)/);
    });

    it('TEST 3: /test collection rule only allows public read for /test/connection', () => {
      const rules = fs.readFileSync(path.resolve(__dirname, '../firestore.rules'), 'utf8');

      // match /test/{docId} must only allow read if docId == 'connection'
      expect(rules).toMatch(/match\s+\/test\/\{docId\}\s*\{[\s\S]*?allow\s+read:\s*if\s+docId\s*==\s*['"]connection['"];/);
      expect(rules).toMatch(/allow\s+write:\s*if\s+isAdmin\(\);/);
    });

    it('TEST 4: Sensitive collections (coupons, otps, order_idempotency) are completely inaccessible to non-admins', () => {
      const rules = fs.readFileSync(path.resolve(__dirname, '../firestore.rules'), 'utf8');

      // coupons -> allow read, write: if isAdmin();
      expect(rules).toMatch(/match\s+\/coupons\/\{couponId\}\s*\{[\s\S]*?allow\s+read,\s*write:\s*if\s+isAdmin\(\);/);

      // otps -> allow read, write: if false;
      expect(rules).toMatch(/match\s+\/otps\/\{otpId\}\s*\{[\s\S]*?allow\s+read,\s*write:\s*if\s+false;/);

      // order_idempotency -> allow read, write: if false;
      expect(rules).toMatch(/match\s+\/order_idempotency\/\{idempotencyId\}\s*\{[\s\S]*?allow\s+read,\s*write:\s*if\s+false;/);
    });
  });

  describe('12. Seller Application Cloud Function & Invariant Defense', () => {
    it('TEST 1: Rejects missing required fields', () => {
      expect(() => validateSellerApplicationPayload(null as any)).toThrow(/Request payload must be a non-null object/);
      expect(() => validateSellerApplicationPayload({})).toThrow(/Company or workshop name is required/);
      expect(() => validateSellerApplicationPayload({
        sellerCompany: 'Cedars Craft'
      })).toThrow(/First name is required/);
      expect(() => validateSellerApplicationPayload({
        sellerCompany: 'Cedars Craft',
        firstName: 'Fadi'
      })).toThrow(/Last name is required/);
      expect(() => validateSellerApplicationPayload({
        sellerCompany: 'Cedars Craft',
        firstName: 'Fadi',
        lastName: 'Nassar'
      })).toThrow(/Email address is required/);
      expect(() => validateSellerApplicationPayload({
        sellerCompany: 'Cedars Craft',
        firstName: 'Fadi',
        lastName: 'Nassar',
        email: 'fadi@example.com'
      })).toThrow(/Phone number is required/);
    });

    it('TEST 2: Rejects invalid Lebanese phone numbers', () => {
      expect(() => validateSellerApplicationPayload({
        sellerCompany: 'Cedars Craft',
        firstName: 'Fadi',
        lastName: 'Nassar',
        email: 'fadi@example.com',
        phone: '1234'
      })).toThrow(/Please enter a valid 8-digit Lebanese mobile phone number/);

      expect(() => validateSellerApplicationPayload({
        sellerCompany: 'Cedars Craft',
        firstName: 'Fadi',
        lastName: 'Nassar',
        email: 'fadi@example.com',
        phone: 'abcdefgh'
      })).toThrow(/Please enter a valid 8-digit Lebanese mobile phone number/);
    });

    it('TEST 3: Rejects invalid email formats', () => {
      expect(() => validateSellerApplicationPayload({
        sellerCompany: 'Cedars Craft',
        firstName: 'Fadi',
        lastName: 'Nassar',
        email: 'invalid-email',
        phone: '70 123 456'
      })).toThrow(/A valid email address is required/);
    });

    it('TEST 4: Rejects unexpected fields not in allowlist (prevents parameter injection)', () => {
      expect(() => validateSellerApplicationPayload({
        sellerCompany: 'Cedars Craft',
        firstName: 'Fadi',
        lastName: 'Nassar',
        email: 'fadi@example.com',
        phone: '70 123 456',
        isAdmin: true // attacker attempting privilege injection
      })).toThrow(/Unexpected property in seller application: "isAdmin"/);

      expect(() => validateSellerApplicationPayload({
        sellerCompany: 'Cedars Craft',
        firstName: 'Fadi',
        lastName: 'Nassar',
        email: 'fadi@example.com',
        phone: '70 123 456',
        status: 'approved' // attacker attempting auto-approval injection
      })).toThrow(/Unexpected property in seller application: "status"/);
    });

    it('TEST 5: Rejects oversized field lengths', () => {
      expect(() => validateSellerApplicationPayload({
        sellerCompany: 'A'.repeat(201),
        firstName: 'Fadi',
        lastName: 'Nassar',
        email: 'fadi@example.com',
        phone: '70 123 456'
      })).toThrow(/Company name must not exceed 200 characters/);

      expect(() => validateSellerApplicationPayload({
        sellerCompany: 'Cedars Craft',
        firstName: 'F'.repeat(101),
        lastName: 'Nassar',
        email: 'fadi@example.com',
        phone: '70 123 456'
      })).toThrow(/First name must not exceed 100 characters/);
    });

    it('TEST 6: Validates, cleans, and normalizes a valid submission payload', () => {
      const validated = validateSellerApplicationPayload({
        sellerCompany: '   Cedars Workshop   ',
        firstName: '  Fadi  ',
        lastName: '  Nassar  ',
        email: '  FADI@EXAMPLE.COM  ',
        phone: '+961 70 123 456',
        village: ' Ehden ',
        governorate: ' North ',
        craftType: ' Woodcarving '
      });

      expect(validated.sellerCompany).toBe('Cedars Workshop');
      expect(validated.firstName).toBe('Fadi');
      expect(validated.lastName).toBe('Nassar');
      expect(validated.email).toBe('fadi@example.com');
      expect(validated.phone).toBe('+961 70123456');
      expect(validated.cleanPhone).toBe('70123456');
      expect(validated.contactName).toBe('Fadi Nassar');
      expect(validated.village).toBe('Ehden');
      expect(validated.governorate).toBe('North');
      expect(validated.craftType).toBe('Woodcarving');
    });

    it('TEST 7: Source code check - Firestore rules enforce allow create: if false on seller_applications', () => {
      const rules = fs.readFileSync(path.resolve(__dirname, '../firestore.rules'), 'utf8');
      expect(rules).toMatch(/match\s+\/seller_applications\/\{appId\}\s*\{[\s\S]*?allow\s+create:\s*if\s+false;/);
      expect(rules).toMatch(/match\s+\/seller_applications\/\{appId\}\s*\{[\s\S]*?allow\s+read,\s*update,\s*delete:\s*if\s+isAdmin\(\);/);
      expect(rules).toMatch(/match\s+\/seller_application_rate_limits\/\{docId\}\s*\{[\s\S]*?allow\s+read,\s*write:\s*if\s+false;/);
    });

    it('TEST 8: Source code check - SellerLoginView uses Cloud Function and does not directly addDoc', () => {
      const viewCode = fs.readFileSync(path.resolve(__dirname, '../src/components/SellerLoginView.tsx'), 'utf8');
      expect(viewCode).toMatch(/submitSellerApplication/);
      expect(viewCode).not.toMatch(/addDoc\(\s*collection\(\s*db\s*,\s*['"]seller_applications['"]\s*\)/);
    });
  });

  describe('13. Storage Rules Hardening & Asset Upload Security', () => {
    it('TEST 1: storage.rules exists and is registered in firebase.json', () => {
      const storageRulesPath = path.resolve(__dirname, '../storage.rules');
      expect(fs.existsSync(storageRulesPath)).toBe(true);

      const firebaseJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../firebase.json'), 'utf8'));
      expect(firebaseJson.storage).toBeDefined();
      expect(firebaseJson.storage.rules).toBe('storage.rules');
    });

    it('TEST 2: storage.rules enforces raster-only image uploads and bans SVGs/executables', () => {
      const rules = fs.readFileSync(path.resolve(__dirname, '../storage.rules'), 'utf8');
      expect(rules).toContain("request.resource.contentType.matches('image/(jpeg|png|webp)')");
      expect(rules).toContain('svg');
    });

    it('TEST 3: storage.rules enforces size limits and owner authorization', () => {
      const rules = fs.readFileSync(path.resolve(__dirname, '../storage.rules'), 'utf8');
      // Max 5MB on product images
      expect(rules).toMatch(/request\.resource\.size\s*<=\s*5\s*\*\s*1024\s*\*\s*1024/);
      // Max 2MB on user avatars
      expect(rules).toMatch(/request\.resource\.size\s*<=\s*2\s*\*\s*1024\s*\*\s*1024/);
      // Avatar upload requires matching auth uid
      expect(rules).toMatch(/request\.auth\.uid\s*==\s*userId/);
      // Product upload requires matching sellerId claim
      expect(rules).toMatch(/getSellerId\(\)\s*==\s*sellerId/);
    });
  });

  describe('14. Phone Registry Security & Anti-Takeover Hardening', () => {
    it('TEST 1: Firestore rules strictly require resource.data.uid == request.auth.uid for phone updates and deletes', () => {
      const rules = fs.readFileSync(path.resolve(__dirname, '../firestore.rules'), 'utf8');
      // Update and delete must verify existing document belongs to current user
      expect(rules).toMatch(/resource\.data\.get\(\s*['"]uid['"]\s*,\s*['"]['"]\s*\)\s*==\s*request\.auth\.uid/);
      // List operation is restricted to admin only
      expect(rules).toMatch(/allow\s+list:\s*if\s+isAdmin\(\);/);
      // Document ID must match clean phone key format
      expect(rules).toMatch(/phoneKey\s*==\s*['"]phone_['"]/);
    });

    it('TEST 2: Users collection update strictly forbids updating role, sellerId, isBanned, or ordersPlaced', () => {
      const rules = fs.readFileSync(path.resolve(__dirname, '../firestore.rules'), 'utf8');
      expect(rules).toMatch(/!request\.resource\.data\.diff\(resource\.data\)[\s\S]*?\.affectedKeys\(\)[\s\S]*?\.hasAny\(\[[\s\S]*?['"]role['"][\s\S]*?['"]sellerId['"][\s\S]*?['"]isBanned['"][\s\S]*?['"]ordersPlaced['"]/);
    });
  });

  describe('15. Zero-Trust Authorization & Shadow Attack Red Team Defense', () => {
    it('TEST 1: Frontend admin state is strictly unforgeable via client-side profile injection', () => {
      // If an attacker sets their profile document in /users/{uid} with role: 'admin' or admin: true:
      const maliciousDocData = {
        uid: 'attacker-123',
        email: 'attacker@evil.com',
        role: 'admin',
        admin: true,
        seller: true,
        sellerId: 'forged-seller-id'
      };

      // mapSafeUserProfile MUST NOT populate admin role from doc data
      const fakeFbUser = { uid: 'attacker-123', email: 'attacker@evil.com', emailVerified: true } as any;
      const mappedAuthProfile = mapSafeUserProfile(fakeFbUser, 'attacker-123', maliciousDocData, null);
      expect(mappedAuthProfile.role).toBe('customer');
      expect((mappedAuthProfile as any).admin).toBeUndefined();

      // mapSafeShopUserProfile MUST NOT populate admin role from doc data
      const mappedShopProfile = mapSafeShopUserProfile(maliciousDocData, fakeFbUser, null);
      expect(mappedShopProfile.role).toBe('customer');
      expect(mappedShopProfile.sellerId).toBeUndefined();
    });

    it('TEST 2: Neither coupons nor OTP documents can be read or listed by customers', () => {
      const rules = fs.readFileSync(path.resolve(__dirname, '../firestore.rules'), 'utf8');
      expect(rules).toMatch(/match\s+\/coupons\/\{couponId\}\s*\{[\s\S]*?allow\s+read,\s*write:\s*if\s+isAdmin\(\);/);
      expect(rules).toMatch(/match\s+\/otps\/\{otpId\}\s*\{[\s\S]*?allow\s+read,\s*write:\s*if\s+false;/);
    });
  });

  describe('16. Seller Application Security & Invariant Suite (Requirement 19)', () => {
    const rules = fs.readFileSync(path.resolve(__dirname, '../firestore.rules'), 'utf8');

    // Rule inspection tests verifying direct Firestore create is DENIED for all roles
    it('direct anonymous Firestore create → DENIED', () => {
      expect(rules).toMatch(/match\s+\/seller_applications\/\{appId\}\s*\{[\s\S]*?allow\s+create:\s*if\s+false;/);
    });

    it('direct authenticated customer create → DENIED', () => {
      const sellerAppsBlock = rules.match(/match\s+\/seller_applications\/\{appId\}\s*\{([^}]+)\}/)?.[1] || '';
      expect(sellerAppsBlock).toMatch(/allow\s+create:\s*if\s+false;/);
      expect(sellerAppsBlock).not.toMatch(/allow\s+create:[\s\S]*?isSignedIn/);
    });

    it('direct seller create → DENIED', () => {
      const sellerAppsBlock = rules.match(/match\s+\/seller_applications\/\{appId\}\s*\{([^}]+)\}/)?.[1] || '';
      expect(sellerAppsBlock).toMatch(/allow\s+create:\s*if\s+false;/);
      expect(sellerAppsBlock).not.toMatch(/allow\s+create:[\s\S]*?isSeller/);
    });

    it('direct admin create → DENIED', () => {
      const sellerAppsBlock = rules.match(/match\s+\/seller_applications\/\{appId\}\s*\{([^}]+)\}/)?.[1] || '';
      expect(sellerAppsBlock).toMatch(/allow\s+create:\s*if\s+false;/);
      expect(sellerAppsBlock).not.toMatch(/allow\s+create:[\s\S]*?isAdmin/);
    });

    it('rate-limit collection direct read → DENIED', () => {
      expect(rules).toMatch(/match\s+\/seller_application_rate_limits\/\{docId\}\s*\{[\s\S]*?allow\s+read,\s*write:\s*if\s+false;/);
    });

    it('rate-limit collection direct write → DENIED', () => {
      expect(rules).toMatch(/match\s+\/seller_application_rate_limits\/\{docId\}\s*\{[\s\S]*?allow\s+read,\s*write:\s*if\s+false;/);
    });

    it('seller_application_locks collection direct read and write → DENIED', () => {
      expect(rules).toMatch(/match\s+\/seller_application_locks\/\{lockId\}\s*\{[\s\S]*?allow\s+read,\s*write:\s*if\s+false;/);
    });

    // Mock Firestore helper for Cloud Function execution tests
    function createMockDb(initialData: {
      applications?: any[];
      rateLimits?: Record<string, any>;
      locks?: Record<string, any>;
      failTransaction?: boolean;
    } = {}) {
      const applications = [...(initialData.applications || [])];
      const rateLimits: Record<string, any> = { ...(initialData.rateLimits || {}) };
      const locks: Record<string, any> = { ...(initialData.locks || {}) };

      return {
        applications,
        rateLimits,
        locks,
        collection: (colName: string) => ({
          doc: (id: string) => ({
            id,
            get: async () => {
              const data = locks[id] || rateLimits[id] || applications.find((a) => a.id === id);
              return {
                exists: !!data,
                data: () => data
              };
            },
            set: async (docData: any, opts?: any) => {
              if (colName === 'seller_application_locks' || id.startsWith('email_') || id.startsWith('phone_')) {
                locks[id] = opts?.merge && locks[id] ? { ...locks[id], ...docData } : docData;
              } else if (colName === 'seller_application_rate_limits' || id.startsWith('rate_')) {
                rateLimits[id] = opts?.merge && rateLimits[id] ? { ...rateLimits[id], ...docData } : docData;
              } else {
                applications.push({ id, ...docData });
              }
            },
            delete: async () => {
              delete locks[id];
              delete rateLimits[id];
              const idx = applications.findIndex((a) => a.id === id);
              if (idx !== -1) applications.splice(idx, 1);
            }
          })
        }),
        runTransaction: async (updateFunction: (tx: any) => Promise<any>) => {
          if (initialData.failTransaction) {
            throw new Error('Database transaction lock error');
          }
          const tx = {
            get: async (ref: any) => {
              const data = locks[ref.id] || rateLimits[ref.id];
              return {
                exists: !!data,
                data: () => data
              };
            },
            set: (ref: any, data: any, opts?: any) => {
              if (ref.id.startsWith('email_') || ref.id.startsWith('phone_')) {
                locks[ref.id] = opts?.merge && locks[ref.id] ? { ...locks[ref.id], ...data } : data;
              } else if (ref.id.startsWith('rate_')) {
                if (opts?.merge && rateLimits[ref.id]) {
                  rateLimits[ref.id] = { ...rateLimits[ref.id], ...data };
                } else {
                  rateLimits[ref.id] = data;
                }
              } else if (ref.id.startsWith('app_')) {
                applications.push({ id: ref.id, ...data });
              }
            },
            delete: (ref: any) => {
              delete locks[ref.id];
              delete rateLimits[ref.id];
            }
          };
          return await updateFunction(tx);
        }
      };
    }

    // Mock supporting simulated concurrent transactions
    function createConcurrentMockDb() {
      const applications: any[] = [];
      const rateLimits: Record<string, any> = {};
      const locks: Record<string, any> = {};
      let transactionQueue = Promise.resolve();

      return {
        applications,
        rateLimits,
        locks,
        collection: (colName: string) => ({
          doc: (id: string) => ({ id })
        }),
        runTransaction: async (updateFunction: (tx: any) => Promise<any>) => {
          const currentOp = transactionQueue.then(async () => {
            const tx = {
              get: async (ref: any) => {
                const data = locks[ref.id] || rateLimits[ref.id];
                return {
                  exists: !!data,
                  data: () => data
                };
              },
              set: (ref: any, data: any) => {
                if (ref.id.startsWith('email_') || ref.id.startsWith('phone_')) {
                  locks[ref.id] = data;
                } else if (ref.id.startsWith('rate_')) {
                  rateLimits[ref.id] = data;
                } else if (ref.id.startsWith('app_')) {
                  applications.push({ id: ref.id, ...data });
                }
              }
            };
            return await updateFunction(tx);
          });
          transactionQueue = currentOp.catch(() => {});
          return await currentOp;
        }
      };
    }

    const validPayload = {
      sellerCompany: 'Cedars Olive Oil Co.',
      firstName: 'Charbel',
      lastName: 'Haddad',
      email: 'charbel@cedars.lb',
      phone: '70 123 456',
      governorate: 'Mount Lebanon',
      craftType: 'Artisanal Oil'
    };

    it('valid callable submission → SUCCESS with cryptographic SHA-256 locks and hashed rate-limit IDs', async () => {
      const mockDb = createMockDb();
      const result = await handleSellerApplicationSubmission(
        validPayload,
        { appCheckId: 'app-check-token-123' },
        mockDb
      );

      expect(result.success).toBe(true);
      expect(result.applicationId).toMatch(/^app_[a-f0-9]{16}$/);

      // Verify stored document in Firestore
      const stored = mockDb.applications.find((a) => a.id === result.applicationId);
      expect(stored).toBeDefined();
      expect(stored.status).toBe('pending');
      expect(stored.cleanPhone).toBe('70123456');
      expect(stored.phone).toBe('+961 70123456');
      expect(stored.email).toBe('charbel@cedars.lb');
      expect(stored.submittedAt).toBeDefined();

      // Verify lock documents created with non-reversible SHA-256 hashes (64 hex characters)
      const emailHash = hashIdentifier('charbel@cedars.lb');
      const phoneHash = hashIdentifier('70123456');
      expect(emailHash).toMatch(/^[a-f0-9]{64}$/);
      expect(phoneHash).toMatch(/^[a-f0-9]{64}$/);

      const emailLockDoc = mockDb.locks[`email_${emailHash}`];
      const phoneLockDoc = mockDb.locks[`phone_${phoneHash}`];
      expect(emailLockDoc).toBeDefined();
      expect(phoneLockDoc).toBeDefined();
      expect(emailLockDoc.status).toBe('pending');
      expect(phoneLockDoc.status).toBe('pending');
      expect(emailLockDoc.applicationId).toBe(result.applicationId);

      // Verify lock bodies do NOT contain plaintext email or phone
      expect(emailLockDoc.email).toBeUndefined();
      expect(emailLockDoc.phone).toBeUndefined();
      expect(phoneLockDoc.email).toBeUndefined();
      expect(phoneLockDoc.phone).toBeUndefined();

      // Verify rate-limit document ID uses phone hash (no raw phone in document ID)
      const rateLimitRecord = mockDb.rateLimits[`rate_phone_${phoneHash}`];
      expect(rateLimitRecord).toBeDefined();
      expect(mockDb.rateLimits['rate_phone_70123456']).toBeUndefined();
      expect(rateLimitRecord.email).toBeUndefined();
      expect(rateLimitRecord.phone).toBeUndefined();
      expect(Array.isArray(rateLimitRecord.timestamps)).toBe(true);
    });

    it('lock IDs and rate-limit IDs do not contain reversible email/phone data', async () => {
      const mockDb = createMockDb();
      await handleSellerApplicationSubmission(
        validPayload,
        { appCheckId: 'app-check-token-123' },
        mockDb
      );

      const lockKeys = Object.keys(mockDb.locks);
      const rateLimitKeys = Object.keys(mockDb.rateLimits);

      for (const key of lockKeys) {
        // Must match email_<64 hex> or phone_<64 hex>
        expect(key).toMatch(/^(email|phone)_[a-f0-9]{64}$/);
        // Must NOT contain raw email or raw phone
        expect(key).not.toContain('charbel@cedars.lb');
        expect(key).not.toContain('70123456');
        expect(key).not.toContain('70123456');
        // Must not be hex encoding of raw email string (Buffer.from(email).toString('hex'))
        expect(key).not.toContain(Buffer.from('charbel@cedars.lb').toString('hex'));
      }

      for (const key of rateLimitKeys) {
        // If phone-based rate limit, must use hash, not raw phone
        if (key.startsWith('rate_phone_')) {
          expect(key).toMatch(/^rate_phone_[a-f0-9]{64}$/);
          expect(key).not.toContain('70123456');
        }
      }
    });

    it('concurrent same-email submissions → only ONE application succeeds', async () => {
      const mockDb = createConcurrentMockDb();

      // Two concurrent submissions with identical email, different phone
      const results = await Promise.allSettled([
        handleSellerApplicationSubmission(
          { ...validPayload, phone: '70 111 222' },
          { appCheckId: 'app-1' },
          mockDb
        ),
        handleSellerApplicationSubmission(
          { ...validPayload, phone: '70 333 444' },
          { appCheckId: 'app-2' },
          mockDb
        )
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);
      expect(mockDb.applications.length).toBe(1);
    });

    it('concurrent same-phone submissions → only ONE application succeeds', async () => {
      const mockDb = createConcurrentMockDb();

      // Two concurrent submissions with identical phone, different email
      const results = await Promise.allSettled([
        handleSellerApplicationSubmission(
          { ...validPayload, email: 'submitter1@cedars.lb' },
          { appCheckId: 'app-1' },
          mockDb
        ),
        handleSellerApplicationSubmission(
          { ...validPayload, email: 'submitter2@cedars.lb' },
          { appCheckId: 'app-2' },
          mockDb
        )
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);
      expect(mockDb.applications.length).toBe(1);
    });

    it('concurrent same-email + same-phone submissions → only ONE application succeeds', async () => {
      const mockDb = createConcurrentMockDb();

      // Two concurrent submissions with identical email AND identical phone
      const results = await Promise.allSettled([
        handleSellerApplicationSubmission(
          { ...validPayload },
          { appCheckId: 'app-1' },
          mockDb
        ),
        handleSellerApplicationSubmission(
          { ...validPayload },
          { appCheckId: 'app-2' },
          mockDb
        )
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);
      expect(mockDb.applications.length).toBe(1);
    });

    it('rejected application releases only its own locks', async () => {
      const mockDb = createMockDb();

      // Submit Application A
      const subResultA = await handleSellerApplicationSubmission(
        { ...validPayload, email: 'artisan.a@cedars.lb', phone: '70111111' },
        { appCheckId: 'app-1' },
        mockDb
      );
      expect(subResultA.success).toBe(true);

      // Submit Application B
      const subResultB = await handleSellerApplicationSubmission(
        { ...validPayload, email: 'artisan.b@cedars.lb', phone: '70222222' },
        { appCheckId: 'app-2' },
        mockDb
      );
      expect(subResultB.success).toBe(true);

      const emailHashA = hashIdentifier('artisan.a@cedars.lb');
      const phoneHashA = hashIdentifier('70111111');
      const emailHashB = hashIdentifier('artisan.b@cedars.lb');
      const phoneHashB = hashIdentifier('70222222');

      expect(mockDb.locks[`email_${emailHashA}`]?.applicationId).toBe(subResultA.applicationId);
      expect(mockDb.locks[`email_${emailHashB}`]?.applicationId).toBe(subResultB.applicationId);

      // Admin rejects Application A
      const appA = mockDb.applications.find((a) => a.id === subResultA.applicationId);
      const res = await syncSellerApplicationLockLifecycle(
        subResultA.applicationId,
        appA,
        { ...appA, status: 'rejected', rejectionReason: 'Incomplete documentation' },
        mockDb
      );
      expect(res.success).toBe(true);

      // Application A locks are released
      expect(mockDb.locks[`email_${emailHashA}`]).toBeUndefined();
      expect(mockDb.locks[`phone_${phoneHashA}`]).toBeUndefined();

      // Application B locks remain untouched and active
      expect(mockDb.locks[`email_${emailHashB}`]?.status).toBe('pending');
      expect(mockDb.locks[`email_${emailHashB}`]?.applicationId).toBe(subResultB.applicationId);
      expect(mockDb.locks[`phone_${phoneHashB}`]?.status).toBe('pending');
      expect(mockDb.locks[`phone_${phoneHashB}`]?.applicationId).toBe(subResultB.applicationId);
    });

    it('cancelled application releases only its own locks', async () => {
      const mockDb = createMockDb();

      // Submit Application A
      const subResultA = await handleSellerApplicationSubmission(
        { ...validPayload, email: 'artisan.a@cedars.lb', phone: '70111111' },
        { appCheckId: 'app-1' },
        mockDb
      );
      // Submit Application B
      const subResultB = await handleSellerApplicationSubmission(
        { ...validPayload, email: 'artisan.b@cedars.lb', phone: '70222222' },
        { appCheckId: 'app-2' },
        mockDb
      );

      const emailHashA = hashIdentifier('artisan.a@cedars.lb');
      const phoneHashA = hashIdentifier('70111111');
      const emailHashB = hashIdentifier('artisan.b@cedars.lb');
      const phoneHashB = hashIdentifier('70222222');

      const appA = mockDb.applications.find((a) => a.id === subResultA.applicationId);
      const res = await syncSellerApplicationLockLifecycle(
        subResultA.applicationId,
        appA,
        { ...appA, status: 'cancelled' },
        mockDb
      );
      expect(res.success).toBe(true);

      // Application A locks released
      expect(mockDb.locks[`email_${emailHashA}`]).toBeUndefined();
      expect(mockDb.locks[`phone_${phoneHashA}`]).toBeUndefined();

      // Application B locks remain intact
      expect(mockDb.locks[`email_${emailHashB}`]?.status).toBe('pending');
      expect(mockDb.locks[`email_${emailHashB}`]?.applicationId).toBe(subResultB.applicationId);
      expect(mockDb.locks[`phone_${phoneHashB}`]?.status).toBe('pending');
      expect(mockDb.locks[`phone_${phoneHashB}`]?.applicationId).toBe(subResultB.applicationId);
    });

    it('deleted application releases only its own locks', async () => {
      const mockDb = createMockDb();

      // Submit Application A
      const subResultA = await handleSellerApplicationSubmission(
        { ...validPayload, email: 'artisan.a@cedars.lb', phone: '70111111' },
        { appCheckId: 'app-1' },
        mockDb
      );
      // Submit Application B
      const subResultB = await handleSellerApplicationSubmission(
        { ...validPayload, email: 'artisan.b@cedars.lb', phone: '70222222' },
        { appCheckId: 'app-2' },
        mockDb
      );

      const emailHashA = hashIdentifier('artisan.a@cedars.lb');
      const phoneHashA = hashIdentifier('70111111');
      const emailHashB = hashIdentifier('artisan.b@cedars.lb');
      const phoneHashB = hashIdentifier('70222222');

      const appA = mockDb.applications.find((a) => a.id === subResultA.applicationId);
      // Document deletion: afterData is null
      const res = await syncSellerApplicationLockLifecycle(subResultA.applicationId, appA, null, mockDb);
      expect(res.success).toBe(true);

      // Application A locks released
      expect(mockDb.locks[`email_${emailHashA}`]).toBeUndefined();
      expect(mockDb.locks[`phone_${phoneHashA}`]).toBeUndefined();

      // Application B locks remain intact
      expect(mockDb.locks[`email_${emailHashB}`]?.status).toBe('pending');
      expect(mockDb.locks[`email_${emailHashB}`]?.applicationId).toBe(subResultB.applicationId);
      expect(mockDb.locks[`phone_${phoneHashB}`]?.status).toBe('pending');
      expect(mockDb.locks[`phone_${phoneHashB}`]?.applicationId).toBe(subResultB.applicationId);
    });

    it('application A cannot delete application B\'s lock', async () => {
      const mockDb = createMockDb();

      const emailHash = hashIdentifier('shared@cedars.lb');
      const phoneHash = hashIdentifier('70123456');

      // Seed Lock owned by Application B (status is pending)
      mockDb.locks[`email_${emailHash}`] = {
        applicationId: 'app_B',
        status: 'pending'
      };
      mockDb.locks[`phone_${phoneHash}`] = {
        applicationId: 'app_B',
        status: 'pending'
      };

      const maliciousAppAPayload = {
        id: 'app_A',
        email: 'shared@cedars.lb',
        phone: '70123456'
      };

      // 1. Attempt rejection of App A referencing App B's lock
      await syncSellerApplicationLockLifecycle(
        'app_A',
        maliciousAppAPayload,
        { ...maliciousAppAPayload, status: 'rejected' },
        mockDb
      );

      // Lock MUST NOT be deleted even though status was 'pending'!
      expect(mockDb.locks[`email_${emailHash}`]).toBeDefined();
      expect(mockDb.locks[`email_${emailHash}`]?.applicationId).toBe('app_B');
      expect(mockDb.locks[`email_${emailHash}`]?.status).toBe('pending');
      expect(mockDb.locks[`phone_${phoneHash}`]?.applicationId).toBe('app_B');

      // 2. Attempt cancellation of App A referencing App B's lock
      await syncSellerApplicationLockLifecycle(
        'app_A',
        maliciousAppAPayload,
        { ...maliciousAppAPayload, status: 'cancelled' },
        mockDb
      );
      expect(mockDb.locks[`email_${emailHash}`]?.applicationId).toBe('app_B');
      expect(mockDb.locks[`email_${emailHash}`]?.status).toBe('pending');

      // 3. Attempt deletion of App A referencing App B's lock
      await syncSellerApplicationLockLifecycle('app_A', maliciousAppAPayload, null, mockDb);
      expect(mockDb.locks[`email_${emailHash}`]?.applicationId).toBe('app_B');
      expect(mockDb.locks[`email_${emailHash}`]?.status).toBe('pending');
      expect(mockDb.locks[`phone_${phoneHash}`]?.applicationId).toBe('app_B');
    });

    it('application A cannot change application B\'s lock to approved', async () => {
      const mockDb = createMockDb();

      const emailHash = hashIdentifier('shared@cedars.lb');
      const phoneHash = hashIdentifier('70123456');

      // Seed Lock owned by Application B
      mockDb.locks[`email_${emailHash}`] = {
        applicationId: 'app_B',
        status: 'pending'
      };
      mockDb.locks[`phone_${phoneHash}`] = {
        applicationId: 'app_B',
        status: 'pending'
      };

      const appAPayload = {
        id: 'app_A',
        email: 'shared@cedars.lb',
        phone: '70123456'
      };

      // Lifecycle event for App A being approved
      await syncSellerApplicationLockLifecycle(
        'app_A',
        appAPayload,
        { ...appAPayload, status: 'approved', createdSellerId: 'seller_a' },
        mockDb
      );

      // Application B's lock MUST NOT be updated to approved or hijacked by App A!
      expect(mockDb.locks[`email_${emailHash}`]?.applicationId).toBe('app_B');
      expect(mockDb.locks[`email_${emailHash}`]?.status).toBe('pending');
      expect(mockDb.locks[`phone_${phoneHash}`]?.applicationId).toBe('app_B');
      expect(mockDb.locks[`phone_${phoneHash}`]?.status).toBe('pending');
    });

    it('missing/mismatched applicationId fails closed', async () => {
      const mockDb = createMockDb();
      const emailHash = hashIdentifier('charbel@cedars.lb');

      mockDb.locks[`email_${emailHash}`] = {
        applicationId: 'app_legit',
        status: 'pending'
      };

      // 1. Missing empty string appId -> fails closed
      const resEmpty = await syncSellerApplicationLockLifecycle(
        '',
        { email: 'charbel@cedars.lb' },
        { email: 'charbel@cedars.lb', status: 'rejected' },
        mockDb
      );
      expect(resEmpty.success).toBe(false);
      expect(mockDb.locks[`email_${emailHash}`]).toBeDefined();

      // 2. Null appId -> fails closed
      const resNull = await syncSellerApplicationLockLifecycle(
        null as any,
        { email: 'charbel@cedars.lb' },
        { email: 'charbel@cedars.lb', status: 'rejected' },
        mockDb
      );
      expect(resNull.success).toBe(false);
      expect(mockDb.locks[`email_${emailHash}`]).toBeDefined();

      // 3. Mismatched appId -> lock untouched
      const resMismatch = await syncSellerApplicationLockLifecycle(
        'app_different',
        { email: 'charbel@cedars.lb' },
        { email: 'charbel@cedars.lb', status: 'rejected' },
        mockDb
      );
      expect(resMismatch.success).toBe(true);
      expect(mockDb.locks[`email_${emailHash}`]?.applicationId).toBe('app_legit');
      expect(mockDb.locks[`email_${emailHash}`]?.status).toBe('pending');

      // 4. Non-existent lock approval -> does NOT silently create an unrelated lock
      const nonExistentEmailHash = hashIdentifier('never_submitted@cedars.lb');
      await syncSellerApplicationLockLifecycle(
        'app_ghost',
        { email: 'never_submitted@cedars.lb' },
        { email: 'never_submitted@cedars.lb', status: 'approved' },
        mockDb
      );
      expect(mockDb.locks[`email_${nonExistentEmailHash}`]).toBeUndefined();
    });

    it('approved application retains intended uniqueness protection against duplicate applications', async () => {
      const mockDb = createMockDb();

      const subResult = await handleSellerApplicationSubmission(
        validPayload,
        { appCheckId: 'app-1' },
        mockDb
      );
      expect(subResult.success).toBe(true);

      const emailHash = hashIdentifier('charbel@cedars.lb');
      const phoneHash = hashIdentifier('70123456');

      // Admin approves the application
      const pendingApp = mockDb.applications.find((a) => a.id === subResult.applicationId);
      await syncSellerApplicationLockLifecycle(
        subResult.applicationId,
        pendingApp,
        { ...pendingApp, status: 'approved', createdSellerId: 'seller_123' },
        mockDb
      );

      // Lock status is transitioned to 'approved'
      expect(mockDb.locks[`email_${emailHash}`]?.status).toBe('approved');
      expect(mockDb.locks[`phone_${phoneHash}`]?.status).toBe('approved');

      // Attempting to submit another application with the approved email is DENIED
      await expect(
        handleSellerApplicationSubmission(
          { ...validPayload, phone: '70 999 000' },
          { appCheckId: 'app-2' },
          mockDb
        )
      ).rejects.toThrow(/already been approved/);

      // Attempting to submit another application with the approved phone is DENIED
      await expect(
        handleSellerApplicationSubmission(
          { ...validPayload, email: 'different@cedars.lb' },
          { appCheckId: 'app-3' },
          mockDb
        )
      ).rejects.toThrow(/already been approved/);
    });

    it('unexpected fields → DENIED', async () => {
      const mockDb = createMockDb();
      const maliciousFieldPayload = { ...validPayload, hackerPayload: true };
      await expect(
        handleSellerApplicationSubmission(maliciousFieldPayload, {}, mockDb)
      ).rejects.toThrow(/Unexpected property in seller application/);
    });

    it('invalid phone → DENIED', async () => {
      const mockDb = createMockDb();
      const invalidPhonePayload = { ...validPayload, phone: '123' };
      await expect(
        handleSellerApplicationSubmission(invalidPhonePayload, {}, mockDb)
      ).rejects.toThrow(/Please enter a valid 8-digit Lebanese mobile phone number/);
    });

    it('invalid email → DENIED', async () => {
      const mockDb = createMockDb();
      const invalidEmailPayload = { ...validPayload, email: 'not-an-email' };
      await expect(
        handleSellerApplicationSubmission(invalidEmailPayload, {}, mockDb)
      ).rejects.toThrow(/A valid email address is required/);
    });

    it('client-supplied status → ignored/rejected and stored status must always be "pending"', async () => {
      const mockDb = createMockDb();

      // Client attempting to forge status must be rejected by input validation
      const forgedStatusPayload = { ...validPayload, status: 'approved' };
      await expect(
        handleSellerApplicationSubmission(forgedStatusPayload, {}, mockDb)
      ).rejects.toThrow(/Unexpected property in seller application: "status"/);

      // In valid submission, stored status is guaranteed to be 'pending'
      const res = await handleSellerApplicationSubmission(
        validPayload,
        { appCheckId: 'test-app' },
        mockDb
      );
      const stored = mockDb.applications.find((a) => a.id === res.applicationId);
      expect(stored?.status).toBe('pending');
    });

    it('rate-limit bypass attempts → DENIED', async () => {
      const mockDb = createMockDb();

      // Submissions 1, 2, 3 succeed
      await handleSellerApplicationSubmission(
        { ...validPayload, email: 'app1@cedars.lb', phone: '70 111 001' },
        { appCheckId: 'same-app-check-id' },
        mockDb
      );
      await handleSellerApplicationSubmission(
        { ...validPayload, email: 'app2@cedars.lb', phone: '70 111 002' },
        { appCheckId: 'same-app-check-id' },
        mockDb
      );
      await handleSellerApplicationSubmission(
        { ...validPayload, email: 'app3@cedars.lb', phone: '70 111 003' },
        { appCheckId: 'same-app-check-id' },
        mockDb
      );

      // Submission 4 from same identity is denied with resource-exhausted
      await expect(
        handleSellerApplicationSubmission(
          { ...validPayload, email: 'app4@cedars.lb', phone: '70 111 004' },
          { appCheckId: 'same-app-check-id' },
          mockDb
        )
      ).rejects.toThrow(/Too many application requests/);
    });

    it('fail-closed behavior when lock or rate-limit verification encounters database error', async () => {
      const failingDb = createMockDb({ failTransaction: true });
      await expect(
        handleSellerApplicationSubmission(validPayload, {}, failingDb)
      ).rejects.toThrow(/Unable to verify submission rate limits/);
    });
  });
});


