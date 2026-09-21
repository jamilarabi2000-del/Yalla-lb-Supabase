import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo
} from 'react';

import {
  Product,
  CartItem,
  Order,
  UserProfile,
  Currency,
  SiteContent,
  SectionVisibilityConfig,
  CMSCustomBlock,
  RecentActivity,
  DiscountRule,
  ProductBundle,
  CategoryItem,
  TerroirRegion,
  Seller,
  SearchLog
} from '../types';

import { applyDiscounts } from '../lib/pricing';
import { calcDeliveryFeeUSD } from '../lib/delivery';
import { DEFAULT_SITE_CONTENT } from '../data/cmsContent';
import { LEBANON_REGIONS } from '../data/regions';

import {
  normalizeLebanesePhone,
  isValidLebanesePhone
} from '../utils/phoneUtils';

import {
  generateIdempotencyKey,
  generateUuidV4,
  isUuid,
  secureRandomInt,
  secureRandomString
} from '../utils/uuid';

import Papa from 'papaparse';

import {
  translations,
  Language
} from '../utils/translations';

import {
  resolveSeller,
  resolveCategory,
  parsePrice,
  parseStock,
  isCsvRowEmpty
} from '../utils/importerResolvers';

import {
  checkDuplicateProductNumber,
  checkDuplicateDescription
} from '../lib/productValidation';

import { filterPublicCmsContent } from '../utils/cmsPublicProjection';
import { assertHighRiskAuthorization } from '../utils/adminMfa';

import { supabase } from '../lib/supabase';

import type {
  User as SupabaseUser,
  Session,
  AuthChangeEvent,
  AuthError,
  EmailOtpType
} from '@supabase/supabase-js';

import {
  supabaseCatalogService,
  supabaseUserDataService,
  supabaseOrderService,
  supabaseCmsService
} from '../services';

import { CheckoutError } from '../services/supabaseOrderService';
import { supabaseAdminService } from '../services/supabaseAdminService';
import { supabaseProductPatchService } from '../services/supabaseProductPatchService';
import { supabaseCommerceService } from '../services/supabaseCommerceService';

import {
  dbLogger,
  calculateObjectDiff
} from '../utils/dbLogger';

import {
  dbMonitor,
  sanitizeDocumentData
} from '../utils/databaseMonitor';


// -----------------------------------------------------------------------------
// Checkout
// -----------------------------------------------------------------------------

/**
 * Client-side checkout cap.
 *
 * This is only a UI protection against an oversized cart.
 * The authoritative checkout limit must be enforced by the Supabase
 * checkout RPC / server-side implementation.
 */
export const MAX_ORDER_LINE_ITEMS = 50;


// -----------------------------------------------------------------------------
// Product / Seller helpers
// -----------------------------------------------------------------------------

export const ensureSellerItemCode = (p: Product): Product => {
  if (!p) return p;
  return p;
};

export const ensureSellerCode = (
  s: Seller,
  index = 0
): Seller => {
  if (!s.sellerCode || !s.sellerCode.trim()) {
    const codeNum = index + 101;

    return {
      ...s,
      sellerCode: `SLR-${codeNum}`
    };
  }

  return s;
};


// -----------------------------------------------------------------------------
// Authentication compatibility types
// -----------------------------------------------------------------------------

/**
 * Compatibility adapter used by the existing UI.
 *
 * IMPORTANT:
 * - This is NOT a Firebase user.
 * - Supabase Auth is the real authentication system.
 * - Database authorization is enforced by Supabase RLS.
 * - Admin/seller privileges must come from the authoritative
 *   profiles table / server-side authorization.
 */
export interface AuthUserLike {
  uid: string;
  id?: string;
  email?: string | null;
  emailVerified: boolean;
  displayName?: string | null;
  photoURL?: string | null;
  user_metadata?: Record<string, any>;
  app_metadata?: Record<string, any>;

  /**
   * Returns the live Supabase access token.
   *
   * Kept only for compatibility with existing callers.
   * It must never be used as a replacement for RLS authorization.
   */
  getIdToken: (
    forceRefresh?: boolean
  ) => Promise<string>;
}

export type AuthUser = AuthUserLike;

/**
 * Legacy compatibility name.
 *
 * The application no longer uses Firebase Authentication.
 * This type is simply an adapter around Supabase Auth.
 */
export type FirebaseUser = AuthUserLike;


// -----------------------------------------------------------------------------
// UI helpers
// -----------------------------------------------------------------------------

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'info' | 'warning' | 'error';
}


// -----------------------------------------------------------------------------
// Navigation
// -----------------------------------------------------------------------------

export type NavTab =
  | 'home'
  | 'products'
  | 'product_detail'
  | 'checkout'
  | 'account'
  | 'admin'
  | 'favorites'
  | 'seller';

const getInitialNavTab = (): NavTab => {
  if (typeof window === 'undefined') {
    return 'home';
  }

  const path = window.location.pathname.replace(/^\/+/, '');

  if (path === 'admin') {
    return 'admin';
  }

  if (path === 'seller') {
    return 'seller';
  }

  if (path.startsWith('product/')) {
    return 'product_detail';
  }

  if (path.startsWith('products')) {
    return 'products';
  }

  if (
    path === 'checkout' ||
    path === 'account' ||
    path === 'favorites'
  ) {
    return path as NavTab;
  }

  return 'home';
};

const getInitialCategory = (): string => {
  if (typeof window === 'undefined') {
    return 'all';
  }

  const path = window.location.pathname.replace(/^\/+/, '');

  if (path.startsWith('products/')) {
    const cat = path.replace('products/', '');

    return decodeURIComponent(cat) || 'all';
  }

  return 'all';
};


// -----------------------------------------------------------------------------
// Catalogue cache
// -----------------------------------------------------------------------------

/**
 * Cache keys for catalogue data served by Supabase.
 *
 * Versioned keys prevent older bundled/demo catalogue data from being
 * accidentally loaded into the storefront.
 *
 * Supabase remains the authoritative source.
 */
const CATALOG_CACHE_KEYS = {
  products: 'yallalb_products_v3',
  categories: 'yallalb_categories_v3',
  sellers: 'yallalb_sellers_v3'
} as const;

/**
 * Keys retired by the privileged-cache fix below. A build before it wrote
 * administrator and seller catalogue rows -- cost prices included -- into the
 * v2 keys, where they outlived the session. Bumping the key abandons those
 * caches; PURGE_ON_LOAD deletes them outright so the data does not simply sit
 * there unread.
 */
const RETIRED_CATALOG_CACHE_KEYS = [
  'yallalb_products_v2',
  'yallalb_categories_v2',
  'yallalb_sellers_v2'
] as const;

if (typeof window !== 'undefined') {
  try {
    RETIRED_CATALOG_CACHE_KEYS.forEach(key => window.localStorage.removeItem(key));
  } catch {}
}


/**
 * Reads a cached catalogue list.
 *
 * This is cache-only.
 * It never falls back to bundled/demo products.
 */
const readCachedList = <T,>(
  key: string
): T[] => {
  try {
    if (typeof window === 'undefined') {
      return [];
    }

    const saved = window.localStorage.getItem(key);

    if (!saved) {
      return [];
    }

    const parsed: unknown = JSON.parse(saved);

    return Array.isArray(parsed)
      ? (parsed as T[])
      : [];
  } catch {
    return [];
  }
};


// -----------------------------------------------------------------------------
// Initial product detail
// -----------------------------------------------------------------------------

const getInitialProductDetail = (): Product | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  const path = window.location.pathname.replace(/^\/+/, '');

  if (!path.startsWith('product/')) {
    return null;
  }

  const prodId = path.replace('product/', '');

  /**
   * Only use cached rows that were previously loaded from Supabase.
   *
   * If the product is not cached, return null and allow the product-detail
   * loading logic later in ShopContext to retrieve it from Supabase.
   */
  return (
    readCachedList<Product>(
      CATALOG_CACHE_KEYS.products
    ).find(
      product => product.id === prodId
    ) || null
  );
};


// -----------------------------------------------------------------------------
// Shop Context
// -----------------------------------------------------------------------------

interface ShopContextType {
  // Navigation
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  navigateToProductCategory: (category: string) => void;
  selectedProductDetail: Product | null;
  setSelectedProductDetail: (p: Product | null) => void;
  openProductDetail: (product: Product) => void;
  goBack: () => void;

  // Language & Translations
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (
    key: keyof typeof translations['en'],
    params?: Record<string, string>
  ) => string;

  // Products
  products: Product[];
  addProduct: (
    product: Omit<Product, 'id'>
  ) => Promise<void>;
  updateProduct: (
    id: string,
    updates: Partial<Product>
  ) => Promise<void>;
  deleteProduct: (
    id: string
  ) => Promise<void>;
  deleteMultipleProducts: (
    ids: string[]
  ) => Promise<void>;
  reorderProducts: (
    orderedProducts: Product[]
  ) => Promise<void>;
  toggleProductPublish: (
    productId: string
  ) => Promise<void>;
  syncAllProductsToDatabase: () => Promise<void>;

  selectedProductForModal: Product | null;
  setSelectedProductForModal: (
    p: Product | null
  ) => void;

  isDbSyncing: boolean;

  /**
   * Whether the catalogue on screen has been confirmed against Supabase.
   *
   * 'ready' + zero products = genuinely empty catalogue.
   * 'error' = database read failed.
   *
   * The storefront must never interpret a database outage as an empty shop.
   */
  catalogStatus:
    | 'loading'
    | 'ready'
    | 'error';

  catalogError: string | null;

  hasMoreProducts: boolean;
  isFetchingMore: boolean;

  loadMoreProducts: () => Promise<void>;

  // Currency
  currency: Currency;
  setCurrency: (c: Currency) => void;
  formatPrice: (
    amountUSD: number
  ) => string;
  convertUSDToLBP: (
    amountUSD: number
  ) => number;
  currencySymbol: string;
  currencyRate: number;
  const currencySymbol = '$';
  const currencyRate = 1;
  const lbpRate = 0;
  const convertUSDToLBP = (amountUSD: number) => amountUSD;

  const formatPrice = (amountUSD: number) => '$' + amountUSD.toFixed(2);

  const addToCart = (product: Product, quantity = 1, option?: string) => {
    // Determine the product from our master products list to get the most up-to-date stock
    const currentProduct = products.find(p => p.id === product.id) || product;
    const availableStock = Number.isFinite(Number(currentProduct.stock)) ? Math.max(0, Math.floor(Number(currentProduct.stock))) : 0;
    
    if (availableStock <= 0) {
      showToast(
        language === 'ar'
          ? 'عذراً، هذا المنتج غير متوفر حالياً'
          : 'Sorry, this product is currently out of stock!',
        'warning'
      );
      return;
    }

    setCart(prev => {
      const existingIndex = prev.findIndex(item => item.product.id === product.id && item.selectedOption === option);
      if (existingIndex > -1) {
        const existingQty = prev[existingIndex].quantity;
        const targetQty = existingQty + quantity;
        if (targetQty > availableStock) {
          const clampedQty = availableStock;
          showToast(
            language === 'ar'
              ? `تم تحديد الكمية بـ ${clampedQty} (الحد الأقصى للمخزون)`
              : `Quantity limited to ${clampedQty} (maximum stock available)`,
            'warning'
          );
          return prev.map((item, idx) =>
            idx === existingIndex
              ? { ...item, quantity: clampedQty }
              : item
          );
        }
        return prev.map((item, idx) =>
          idx === existingIndex
            ? { ...item, quantity: targetQty }
            : item
        );
      }
      
      const initialQty = quantity > availableStock ? availableStock : quantity;
      if (initialQty < quantity) {
        showToast(
          language === 'ar'
            ? `تمت إضافة ${initialQty} قطع فقط (الحد الأقصى للمخزون)`
            : `Added only ${initialQty} items due to stock limit`,
          'warning'
        );
      }
      return [...prev, { product: currentProduct, quantity: initialQty, selectedOption: option }];
    });
    showToast(`Added ${quantity}x "${product.name.split('(')[0].trim()}" to cart!`);
  };

  const addMultipleToCart = (itemsToAdd: { product: Product; quantity?: number; option?: string }[]) => {
    setCart(prev => {
      const nextCart = [...prev];
      for (const item of itemsToAdd) {
        const currentProd = products.find(p => p.id === item.product.id) || item.product;
        const availableStock = Number.isFinite(Number(currentProd.stock)) ? Math.max(0, Math.floor(Number(currentProd.stock))) : 0;
        if (availableStock <= 0) continue;

        const qty = item.quantity || 1;
        const existingIndex = nextCart.findIndex(c => c.product.id === item.product.id && c.selectedOption === item.option);
        if (existingIndex > -1) {
          const targetQty = Math.min(nextCart[existingIndex].quantity + qty, availableStock);
          nextCart[existingIndex] = {
            ...nextCart[existingIndex],
            quantity: targetQty
          };
        } else {
          nextCart.push({
            product: currentProd,
            quantity: Math.min(qty, availableStock),
            selectedOption: item.option
          });
        }
      }
      return nextCart;
    });
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.product.id !== productId));
    showToast('Item removed from cart', 'info');
  };

  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }
    const currentProduct = products.find(p => p.id === productId);
    const availableStock = currentProduct && Number.isFinite(Number(currentProduct.stock)) ? Math.max(0, Math.floor(Number(currentProduct.stock))) : 0;

    let finalQty = quantity;
    if (finalQty > availableStock) {
      finalQty = availableStock;
      showToast(
        language === 'ar'
          ? `عذراً، المخزون المتاح هو ${availableStock} قطع فقط`
          : `Sorry, only ${availableStock} items are available in stock`,
        'warning'
      );
    }

    setCart(prev =>
      prev.map(item =>
        item.product.id === productId ? { ...item, quantity: finalQty } : item
      )
    );
  };

  const clearCart = () => {
    setCart([]);
  };

  const toggleWishlist = (productId: string) => {
    let nextWishlist: string[] = [];
    const exists = wishlist.includes(productId);
    if (exists) {
      nextWishlist = wishlist.filter(id => id !== productId);
      showToast(language === 'ar' ? 'تمت إزالة المنتج من المفضلة' : 'Removed from saved favorites', 'info');
    } else {
      nextWishlist = [...wishlist, productId];
      showToast(language === 'ar' ? 'تمت إضافة المنتج إلى المفضلة' : 'Saved to your favorites!', 'success');
    }
    setWishlist(nextWishlist);
  };

  const removeFromWishlist = (productId: string) => {
    setWishlist(prev => prev.filter(id => id !== productId));
    showToast(language === 'ar' ? 'تمت إزالة المنتج من المفضلة' : 'Removed from saved favorites', 'info');
  };

  const isInWishlist = (productId: string) => wishlist.includes(productId);

  const clearWishlist = () => {
    setWishlist([]);
  };

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const [appliedCouponCode, setAppliedCouponCode] = useState<string>(() => {
    try {
      return localStorage.getItem('yallalb_applied_coupon') || '';
    } catch {
      return '';
    }
  });

  useEffect(() => {
    try {
      if (appliedCouponCode) {
        localStorage.setItem('yallalb_applied_coupon', appliedCouponCode);
      } else {
        localStorage.removeItem('yallalb_applied_coupon');
      }
    } catch {}
  }, [appliedCouponCode]);

  const isNewUser = useMemo(() => {
    if (!authUser) return true;
    const userOrdersCount = orders.filter(o => o.userId === authUser.uid).length;
    return userOrdersCount === 0;
  }, [authUser, orders]);

  const discountCalculation = useMemo(() => {
    return applyDiscounts(cart, discountRules, {
      couponCode: appliedCouponCode,
      isNewUser,
      productBundles
    });
  }, [cart, discountRules, appliedCouponCode, isNewUser, productBundles]);

  const discountUSD = discountCalculation.discountUSD;
  const finalCartTotalUSD = discountCalculation.finalSubtotalUSD;
  const appliedDiscountRules = discountCalculation.appliedRules;

  // Maintain cartTotalUSD as the effective total for backwards-compatible consumers
  const cartTotalUSD = finalCartTotalUSD;

  const applyCoupon = useCallback((code: string): boolean => {
    const normalized = code.trim().toUpperCase();
    if (!normalized) return false;
    const testResult = applyDiscounts(cart, discountRules, { couponCode: normalized, isNewUser, productBundles });
    if (testResult.discountUSD > 0) {
      setAppliedCouponCode(normalized);
      showToast(
        language === 'ar' 
          ? `تم تطبيق الكوبون (${normalized}) بنجاح! وفرت $${testResult.discountUSD.toFixed(2)}` 
          : `Coupon (${normalized}) applied! You saved $${testResult.discountUSD.toFixed(2)}`,
        'success'
      );
      return true;
    } else {
      showToast(
        language === 'ar' 
          ? 'رمز الكوبون غير صالح أو لم يستوفِ الحد الأدنى للشراء' 
          : 'Coupon is invalid or does not meet minimum order requirements',
        'warning'
      );
      return false;
    }
  }, [cart, discountRules, language, isNewUser, productBundles]);

  const removeCoupon = useCallback(() => {
    setAppliedCouponCode('');
    showToast(language === 'ar' ? 'تمت إزالة الكوبون' : 'Coupon code removed', 'info');
  }, [language]);

  const addBundleToCart = useCallback((bundleId: string) => {
    const bundle = productBundles.find(b => b.id === bundleId);
    if (!bundle) return;
    
    // Find matching products
    const itemsToAdd = products.filter(p => bundle.productIds.includes(p.id));
    if (itemsToAdd.length === 0) {
      showToast(language === 'ar' ? 'المنتجات في هذه الباقة غير متوفرة حالياً' : 'Bundle products are currently unavailable', 'warning');
      return;
    }

    // Add each item to cart
    itemsToAdd.forEach(p => {
      setCart(prev => {
        const existingIndex = prev.findIndex(ci => ci.product.id === p.id);
        if (existingIndex > -1) {
          const updated = [...prev];
          updated[existingIndex] = { ...updated[existingIndex], quantity: updated[existingIndex].quantity + 1 };
          return updated;
        }
        return [...prev, { product: p, quantity: 1 }];
      });
    });

    showToast(
      language === 'ar'
        ? `تمت إضافة صفقة "${bundle.nameAr || bundle.name}" إلى سلة التسوق!`
        : `Added "${bundle.name}" Combo Deal to your cart!`,
      'success'
    );
  }, [productBundles, products, language, showToast]);

  const lastLoggedSearchRef = useRef<{ query: string; time: number }>({ query: '', time: 0 });

  const logSearchQuery = useCallback(async (query: string, origin: 'navbar' | 'products_page' | 'mobile_menu' | 'direct' = 'direct') => {
    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 2) return;

    // Flood protection: Avoid logging identical consecutive queries within 6 seconds
    const now = Date.now();
    if (
      lastLoggedSearchRef.current.query.toLowerCase() === trimmed.toLowerCase() &&
      now - lastLoggedSearchRef.current.time < 6000
    ) {
      return;
    }
    lastLoggedSearchRef.current = { query: trimmed, time: now };

    const searchEntry: SearchLog = {
      id: `srch_${Date.now()}_${secureRandomString(5)}`,
      query: trimmed,
      timestamp: new Date().toISOString(),
      userId: authUser?.uid || null,
      userEmail: authUser?.email || user?.email || null,
      userName: user?.name || null,
      origin: origin
    };

    // Immediate Local Cache for instant UI updates & offline fallback
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = localStorage.getItem('yallalb_search_logs_cache');
        const list: SearchLog[] = raw ? JSON.parse(raw) : [];
        list.unshift(searchEntry);
        localStorage.setItem('yallalb_search_logs_cache', JSON.stringify(list.slice(0, 200)));
      }
    } catch (cacheErr) {
      console.warn("[ShopContext] Search cache notice:", cacheErr);
    }

    // public.search_logs. `search_insert` permits user_id = auth.uid() OR
    // NULL, so an anonymous visitor's search is recorded without being
    // attributed to anyone.
    await supabaseAdminService.logSearch(searchEntry.query, origin);
  }, [authUser, user]);

  // Place Order — server-authoritative via private.checkout_create_order.
  //
  // The database RPC is the single source of truth for pricing, discounts,
  // bundles, coupons, delivery and stock. This function only collects the
  // customer's selections and delivery details, submits them, and renders the
  // order the database committed. It deliberately does not send, and does not
  // fall back to, any client-computed subtotal / discount / delivery / total.
  const placeOrder = async (
    orderData: Omit<Order, 'id' | 'date' | 'trackingNumber' | 'status'>,
    customIdempotencyKey?: string
  ): Promise<Order> => {
    // Reused across retries by CheckoutView so a resubmit is idempotent: the
    // RPC returns the original order instead of creating a second one.
    const idempotencyKey = (customIdempotencyKey || generateIdempotencyKey()).trim();
    const lineItems = orderData.items && orderData.items.length > 0 ? orderData.items : cart;

    if (lineItems.length === 0) {
      const errMsg = language === 'ar' ? 'سلة التسوق فارغة.' : 'Your cart is empty.';
      showToast(errMsg, 'warning');
      throw new Error(errMsg);
    }

    if (lineItems.length > MAX_ORDER_LINE_ITEMS) {
      const errMsg = language === 'ar'
        ? `الحد الأقصى لعدد المنتجات المختلفة في الطلب الواحد هو ${MAX_ORDER_LINE_ITEMS}. يرجى تقسيم الطلب.`
        : `Orders are limited to a maximum of ${MAX_ORDER_LINE_ITEMS} distinct items per checkout. Please split your order.`;
      showToast(errMsg, 'warning');
      throw new Error(errMsg);
    }

    const rawShipping = orderData.shipping || ({} as Order['shipping']);
    const chosenSpeed = rawShipping.deliverySpeed || 'standard';

    try {
      const placedOrder = await supabaseOrderService.createOrderAuthoritative({
        items: lineItems.map(it => ({
          productId: it.product.id,
          quantity: Math.max(1, Math.floor(it.quantity || 1)),
          ...(it.selectedOption ? { selectedOption: it.selectedOption } : {})
        })),
        shipping: {
          fullName: String(rawShipping.fullName || '').trim(),
          phone: String(rawShipping.phone || '').trim(),
          email: String(rawShipping.email || user?.email || '').trim() || undefined,
          governorate: String(rawShipping.governorate || '').trim(),
          city: String(rawShipping.city || '').trim(),
          village: String(rawShipping.village || '').trim() || undefined,
          street: String(rawShipping.street || (rawShipping as any)?.address || '').trim(),
          building: String(rawShipping.building || 'N/A').trim(),
          floorApartment: String(rawShipping.floorApartment || '').trim() || undefined,
          deliveryNotes: String(rawShipping.deliveryNotes || (rawShipping as any)?.notes || '').trim() || undefined,
          deliverySpeed: chosenSpeed
        },
        paymentMethod: orderData.paymentMethod || 'cod_usd',
        currency: orderData.currency || currency,
        couponCode: appliedCouponCode || undefined,
        deliverySpeed: chosenSpeed,
        idempotencyKey
      });

      // Optimistic local stock decrement so the shopper immediately sees the
      // new availability. Realtime on `products` corrects it either way.
      setProducts(prevProducts =>
        prevProducts.map(p => {
          const line = lineItems.find(i => i.product.id === p.id);
          return line ? { ...p, stock: Math.max(0, (p.stock || 0) - line.quantity) } : p;
        })
      );

      setOrders(prev => (prev.some(o => o.id === placedOrder.id) ? prev : [placedOrder, ...prev]));

      // Cart is cleared ONLY after a confirmed order id.
      clearCart();
      setAppliedCouponCode('');

      showToast(
        `Mabrouk! Order ${placedOrder.trackingNumber || `#${placedOrder.id.slice(0, 8)}`} placed and confirmed by server.`,
        'success'
      );
      return placedOrder;
    } catch (error: any) {
      // CheckoutError.message is already customer-safe. Anything else gets a
      // generic message so raw Postgres/PostgREST text never reaches the DOM.
      const isCheckoutError = error instanceof CheckoutError;
      const displayMsg = isCheckoutError
        ? error.message
        : (language === 'ar'
            ? 'تعذر إتمام الطلب. يرجى المحاولة مرة أخرى.'
            : 'We could not place your order. Please try again.');

      console.error('[ShopContext] placeOrder failed:', isCheckoutError ? `${error.code}: ${error.message}` : error);
      showToast(displayMsg, 'warning');

      // The cart is intentionally preserved on every failure path: losing a
      // cart is worse for the customer than a retry, and the idempotency key
      // makes a retry safe.
      throw error;
    }
  };

  // Update order status - persists to public.orders
  const updateOrderStatus = async (orderId: string, status: Order['status']) => {
    const targetOrder = orders.find(o => o.id === orderId);
    if (targetOrder && targetOrder.status === 'delivered' && status === 'cancelled') {
      showToast('Cannot cancel an order that has already been delivered.', 'warning');
      throw new Error('Cannot cancel a delivered order.');
    }

    dbLogger.logFormInput({
      sourceComponent: 'AdminView',
      actionName: 'updateOrderStatus',
      targetPath: `orders/${orderId}`,
      summary: `Updating order #${orderId} status to "${status}"`,
      payload: { status }
    });

    const { startTime } = dbLogger.logDbWriteStart({
      operation: 'upsert',
      targetPath: `orders/${orderId}`,
      sourceComponent: 'ShopContext',
      actionName: 'updateOrderStatus',
      summary: `Persisting status change for order #${orderId} to orders...`
    });

    const previousOrders = [...orders];

    // Authoritative write first. Do not report success from local state alone.
    try {
      await supabaseOrderService.updateOrderStatus(orderId, status);
    } catch (err: any) {
      console.error('[ShopContext] updateOrderStatus failed:', err);
      showToast(`Could not update order status: ${err?.message || 'unknown error'}`, 'error');
      throw err;
    }

    setOrders(prev => {
      const next = prev.map(ord => (ord.id === orderId ? { ...ord, status } : ord));
      try { localStorage.setItem('yallalb_orders', JSON.stringify(next)); } catch {}
      return next;
    });

    await logAdminActivity(
      'order_status',
      `Order #${orderId} status updated`,
      `Shifted fulfillment status to "${status.replace(/_/g, ' ')}".`
    );
    showToast(`Order status updated to ${status.replace('_', ' ')}`, 'info');
  };

  // Delete order - removes the row from public.orders
  const deleteOrder = async (orderId: string) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) {
      showToast('Order not found.', 'warning');
      return;
    }
    if (order.status === 'delivered') {
      showToast('Cannot delete a delivered order.', 'warning');
      return;
    }

    dbLogger.logFormInput({
      sourceComponent: 'AdminView',
      actionName: 'deleteOrder',
      targetPath: `orders/${orderId}`,
      summary: `Admin deleting order #${orderId}`
    });

    const { startTime } = dbLogger.logDbWriteStart({
      operation: 'delete',
      targetPath: `orders/${orderId}`,
      sourceComponent: 'ShopContext',
      actionName: 'deleteOrder',
      summary: `Deleting row from orders (id ${orderId})...`
    });

    // ── Authoritative delete: private.admin_delete_order ────────────────────
    // The row is removed first, then the UI. This used to drop the order from
    // React state and localStorage only, so it came back on the next load
    // after the admin had been told it was permanently removed. A direct
    // .delete() cannot replace the RPC: orders has no DELETE policy, so RLS
    // filters the delete and PostgREST still answers 200.
    const previousOrders = orders;
    try {
      await supabaseOrderService.deleteOrder(orderId);
    } catch (err: any) {
      dbLogger.logDbWriteError({
        operation: 'delete',
        targetPath: `orders/${orderId}`,
        sourceComponent: 'ShopContext',
        actionName: 'deleteOrder',
        startTime,
        summary: `Delete of order ${orderId} was refused.`,
        error: err,
      });
      setOrders(previousOrders);
      const detail = String(err?.message || '');
      const msg = err?.code === '42501' || detail.includes('administrator')
        ? 'Only an administrator may delete an order.'
        : detail.includes('delivered')
          ? 'Cannot delete a delivered order.'
          : `Failed to delete order: ${detail || 'unknown error'}`;
      console.error('[ShopContext] deleteOrder failed:', err);
      showToast(msg, 'error');
      throw err;
    }

    dbLogger.logDbWriteSuccess({
      operation: 'delete',
      targetPath: `orders/${orderId}`,
      sourceComponent: 'ShopContext',
      actionName: 'deleteOrder',
      startTime,
      summary: `Order ${orderId} deleted from orders.`,
    });

    setOrders(prev => {
      const next = prev.filter(o => o.id !== orderId);
      try {
        localStorage.setItem('yallalb_orders', JSON.stringify(next));
      } catch {}
      return next;
    });

    await logAdminActivity(
      'order_delete',
      `Order #${orderId} deleted`,
      `Permanently removed order #${orderId} from system.`
    );
    showToast('Order deleted!');
  };

  // Add product - writes products, product_private and product_images
  const addProduct = async (newProdData: Omit<Product, 'id'> & { id?: string }) => {
    // Seller authorization check: non-admin sellers can only create products for their own workshop
    if (!isAdminUser && isSellerUser) {
      if (!sellerId) {
        const errorMsg = 'Unauthorized: Your account is not linked to a registered seller workshop.';
        showToast(errorMsg, 'error');
        throw new Error(errorMsg);
      }
      newProdData.sellerId = sellerId;
    }

    // 1. Validation: Duplicate Product Number (sellerItemCode or custom ID)
    if (newProdData.sellerItemCode) {
      const targetSellerId = newProdData.sellerId;
      const targetSellerName = newProdData.artisan || newProdData.seller;
      const dupCodeCheck = checkDuplicateProductNumber(newProdData.sellerItemCode, null, products, targetSellerId, targetSellerName);
      if (dupCodeCheck.isDuplicate) {
        const errorMsg = `Duplicate seller item code: "${newProdData.sellerItemCode}" is already in use by "${dupCodeCheck.conflictingProduct?.name}" for seller "${targetSellerName || 'this seller'}".`;
        showToast(errorMsg, 'error');
        throw new Error(errorMsg);
      }
    }

    if (newProdData.id) {
      const dupIdCheck = checkDuplicateProductNumber(newProdData.id, null, products);
      if (dupIdCheck.isDuplicate) {
        const errorMsg = `Duplicate product ID/SKU: "${newProdData.id}" is already in use by "${dupIdCheck.conflictingProduct?.name}".`;
        showToast(errorMsg, 'error');
        throw new Error(errorMsg);
      }
    }

    // Duplicate Description validation removed for flexibility

    const { rating = 0, reviewsCount = 0, sellerItemCode, lowStockThreshold, lowStockNotice, customStockLabel, costPriceUSD, ...restProdData } = newProdData;

    // products.id is uuid. The old `prod-custom-<timestamp>` id cannot be cast
    // to it, so an admin-created product could never reach Supabase — and a
    // cart built from one is rejected by the checkout RPC, which requires
    // product ids that match products.id.
    if (newProdData.id && !isUuid(newProdData.id)) {
      const errorMsg = `Invalid product id "${newProdData.id}": products.id is a uuid column. Leave it blank to have one generated.`;
      showToast(errorMsg, 'error');
      throw new Error(errorMsg);
    }
    const id = newProdData.id || generateUuidV4();
    const nowIso = new Date().toISOString();
    
    // Public product object stored in /products/{id} (does not expose merchant/cost internals)
    const publicProduct: Product = {
      createdAt: nowIso,
      updatedAt: nowIso,
      rating,
      reviewsCount,
      ...restProdData,
      id
    } as Product;
    delete (publicProduct as any).sellerItemCode;
    delete (publicProduct as any).lowStockThreshold;
    delete (publicProduct as any).lowStockNotice;
    delete (publicProduct as any).customStockLabel;
    delete (publicProduct as any).costPriceUSD;

    const sanitizedProduct = sanitizeDocumentData(publicProduct);

    // Private metadata payload stored in /product_private/{id}
    const privatePayload: Record<string, any> = {
      productId: id,
      sellerId: publicProduct.sellerId || (isSellerUser ? sellerId : null) || null,
      updatedAt: nowIso
    };
    if (sellerItemCode !== undefined && sellerItemCode !== '') privatePayload.sellerItemCode = sellerItemCode;
    if (lowStockThreshold !== undefined) privatePayload.lowStockThreshold = lowStockThreshold;
    if (lowStockNotice !== undefined) privatePayload.lowStockNotice = lowStockNotice;
    if (customStockLabel !== undefined) privatePayload.customStockLabel = customStockLabel;
    if (costPriceUSD !== undefined) privatePayload.costPriceUSD = costPriceUSD;

    // Full in-memory product representation for the current UI session
    const newProduct: Product = {
      ...publicProduct,
      sellerItemCode,
      lowStockThreshold,
      lowStockNotice,
      customStockLabel,
      costPriceUSD
    };
    
    dbLogger.logFormInput({
      sourceComponent: 'AdminView (AddProductModal)',
      actionName: 'addProduct',
      targetPath: `products/${id}`,
      summary: `Admin created new product "${newProduct.name}" ($${newProduct.regularPriceUSD})`,
      payload: sanitizedProduct
    });

    const { startTime } = dbLogger.logDbWriteStart({
      operation: 'upsert',
      targetPath: `products/${id}`,
      sourceComponent: 'ShopContext',
      actionName: 'addProduct',
      summary: `Writing new row to products (id ${id})...`,
      payload: sanitizedProduct
    });

    // Optimistically update state
    setProducts(prev => {
      const next = [newProduct, ...prev];
      try {
        writeCatalogCache(CATALOG_CACHE_KEYS.products, next);
      } catch {}
      return next;
    });

    // ── Authoritative write: Supabase ─────────────────────────────────────
    // products for the public columns, product_private for the merchant
    // fields, product_images for the gallery. This is the only write; the
    // Firestore mirror that used to follow it is gone.
    //
    // On failure the optimistic row is rolled back and the error rethrown: an
    // admin must not be told a product was created when it does not exist.
    try {
      await supabaseCatalogService.upsertProduct(newProduct);
    } catch (supaErr: any) {
      setProducts(prev => {
        const next = prev.filter(p => p.id !== id);
        try {
          writeCatalogCache(CATALOG_CACHE_KEYS.products, next);
        } catch {}
        return next;
      });
      console.error('[ShopContext] addProduct Supabase write failed:', supaErr);
      showToast(`Could not save product: ${supaErr?.message || 'unknown error'}`, 'error');
      throw supaErr;
    }

    await logAdminActivity(
      'product_add',
      `Product "${newProduct.name}" created`,
      `Added new catalog item with ID: ${newProduct.id}, category: ${newProduct.category}, and price: $${newProduct.regularPriceUSD}.`,
      newProduct.id,
      null,
      newProduct
    );
    showToast(`Product "${newProduct.name}" saved!`);
  };

  // Update product - updates products, product_private and product_images
  const updateProduct = async (id: string, updates: Partial<Product>) => {
    const existing = products.find(p => p.id === id);

    // Seller authorization check: non-admin sellers can only update their own products
    if (!isAdminUser && isSellerUser) {
      if (!sellerId || !existing || existing.sellerId?.toLowerCase() !== sellerId?.toLowerCase()) {
        const errorMsg = 'Unauthorized: You can only edit products belonging to your workshop.';
        showToast(errorMsg, 'error');
        throw new Error(errorMsg);
      }
      updates.sellerId = sellerId;
    }

    // 1. Validation: Duplicate Product Number
    if (updates.sellerItemCode) {
      const targetSellerId = updates.sellerId || existing?.sellerId;
      const targetSellerName = updates.artisan || updates.seller || existing?.artisan || existing?.seller;
      const dupCodeCheck = checkDuplicateProductNumber(updates.sellerItemCode, id, products, targetSellerId, targetSellerName);
      if (dupCodeCheck.isDuplicate) {
        const errorMsg = `Duplicate seller item code: "${updates.sellerItemCode}" is already assigned to "${dupCodeCheck.conflictingProduct?.name}" for seller "${targetSellerName || 'this seller'}".`;
        showToast(errorMsg, 'error');
        throw new Error(errorMsg);
      }
    }

    const {
      sellerItemCode,
      lowStockThreshold,
      lowStockNotice,
      customStockLabel,
      costPriceUSD,
      ...publicUpdates
    } = updates;

    const nowIso = new Date().toISOString();
    const mergedUpdates = { ...updates, updatedAt: nowIso };
    const mergedPublicUpdates = { ...publicUpdates, updatedAt: nowIso };
    const sanitizedUpdates = sanitizeDocumentData(mergedPublicUpdates);

    const privateUpdates: Record<string, any> = {
      productId: id,
      sellerId: updates.sellerId || existing?.sellerId || (isSellerUser ? sellerId : null) || null,
      updatedAt: nowIso
    };
    let hasPrivateUpdates = false;
    if (sellerItemCode !== undefined) { privateUpdates.sellerItemCode = sellerItemCode; hasPrivateUpdates = true; }
    if (lowStockThreshold !== undefined) { privateUpdates.lowStockThreshold = lowStockThreshold; hasPrivateUpdates = true; }
    if (lowStockNotice !== undefined) { privateUpdates.lowStockNotice = lowStockNotice; hasPrivateUpdates = true; }
    if (customStockLabel !== undefined) { privateUpdates.customStockLabel = customStockLabel; hasPrivateUpdates = true; }
    if (costPriceUSD !== undefined) { privateUpdates.costPriceUSD = costPriceUSD; hasPrivateUpdates = true; }
    
    dbLogger.logFormInput({
      sourceComponent: 'AdminView',
      actionName: 'updateProduct',
      targetPath: `products/${id}`,
      summary: `Admin updated product #${id} (${existing?.name || 'Item'}): [${Object.keys(updates).join(', ')}]`,
      payload: sanitizedUpdates,
      diff: calculateObjectDiff(existing as any, { ...existing, ...mergedUpdates } as any)
    });

    const { startTime } = dbLogger.logDbWriteStart({
      operation: 'upsert',
      targetPath: `products/${id}`,
      sourceComponent: 'ShopContext',
      actionName: 'updateProduct',
      summary: `Persisting product #${id} updates to products...`,
      payload: sanitizedUpdates
    });

    setProducts(prev => {
      const next = prev.map(p => (p.id === id ? { ...p, ...mergedUpdates } : p));
      try {
        writeCatalogCache(CATALOG_CACHE_KEYS.products, next);
      } catch {}
      return next;
    });

    // ── Authoritative write: Supabase ─────────────────────────────────────
    // Only the fields the caller actually changed are sent, so a targeted edit
    // (a price, a publish toggle) cannot blank out columns it never mentioned:
    // upsertProduct drops undefined keys, and leaves product_private and
    // product_images alone unless those fields were supplied.
    try {
      await supabaseProductPatchService.patchProduct(id, updates);
    } catch (supaErr: any) {
      if (existing) {
        setProducts(prev => {
          const next = prev.map(p => (p.id === id ? existing : p));
          try {
            writeCatalogCache(CATALOG_CACHE_KEYS.products, next);
          } catch {}
          return next;
        });
      }
      console.error('[ShopContext] updateProduct Supabase write failed:', supaErr);
      showToast(`Could not save changes: ${supaErr?.message || 'unknown error'}`, 'error');
      throw supaErr;
    }

    await logAdminActivity(
      'product_update',
      `Product "${existing?.name || id}" updated`,
      `Modified attributes: ${Object.keys(updates).join(', ')}.`,
      id,
      existing,
      { ...existing, ...mergedUpdates }
    );
    showToast('Product updated!');
  };

  // Delete product - removes the row from public.products
  const deleteProduct = async (id: string) => {
    if (isAdminUser) {
      const authorized = await assertHighRiskAuthorization(authUser?.uid);
      if (!authorized) {
        showToast('High-risk action cancelled or verification expired.', 'error');
        throw new Error('High-risk authorization failed');
      }
    }

    const target = products.find(p => p.id === id);
    
    // Seller authorization check: non-admin sellers can only delete their own products
    if (!isAdminUser && isSellerUser) {
      if (!sellerId || !target || target.sellerId?.toLowerCase() !== sellerId?.toLowerCase()) {
        const errorMsg = 'Unauthorized: You can only delete products belonging to your workshop.';
        showToast(errorMsg, 'error');
        throw new Error(errorMsg);
      }
    }

    dbLogger.logFormInput({
      sourceComponent: 'AdminView',
      actionName: 'deleteProduct',
      targetPath: `products/${id}`,
      summary: `Admin deleted product #${id} ("${target?.name || id}")`
    });

    const { startTime } = dbLogger.logDbWriteStart({
      operation: 'delete',
      targetPath: `products/${id}`,
      sourceComponent: 'ShopContext',
      actionName: 'deleteProduct',
      summary: `Deleting row from products (id ${id})...`
    });

    setProducts(prev => {
      const next = prev.filter(p => p.id !== id);
      try {
        writeCatalogCache(CATALOG_CACHE_KEYS.products, next);
      } catch {}
      return next;
    });

    // ── Authoritative delete: Supabase ────────────────────────────────────
    // product_images and product_private rows go with it via ON DELETE
    // cascade on their product_id foreign keys. The row is restored on screen
    // if the delete fails, so the admin never sees a product disappear from a
    // catalogue that still contains it.
    try {
      await supabaseCatalogService.deleteProduct(id);
    } catch (supaErr: any) {
      if (target) {
        setProducts(prev => {
          const next = [target, ...prev.filter(p => p.id !== id)];
          try {
            writeCatalogCache(CATALOG_CACHE_KEYS.products, next);
          } catch {}
          return next;
        });
      }
      console.error('[ShopContext] deleteProduct Supabase delete failed:', supaErr);
      showToast(`Could not delete product: ${supaErr?.message || 'unknown error'}`, 'error');
      throw supaErr;
    }

    await logAdminActivity(
      'product_delete',
      `Product "${target?.name || id}" deleted`,
      `Permanently removed product #${id} from catalog.`,
      id,
      target,
      null
    );
    showToast('Product deleted!');
  };

  // Mass delete products - removes multiple rows from public.products
  const deleteMultipleProducts = async (ids: string[]) => {
    if (!ids || ids.length === 0) return;

    dbLogger.logFormInput({
      sourceComponent: 'AdminView',
      actionName: 'deleteMultipleProducts',
      targetPath: 'products/mass_delete',
      summary: `Admin bulk deleting ${ids.length} products`
    });

    const { startTime } = dbLogger.logDbWriteStart({
      operation: 'delete', // or mass delete
      targetPath: `products/mass_delete`,
      sourceComponent: 'ShopContext',
      actionName: 'deleteMultipleProducts',
      summary: `Deleting ${ids.length} rows from products...`
    });

    if (!isAdminUser) {
      throw new Error('Only a verified administrator may perform bulk product deletion.');
    }
    const authorized = await assertHighRiskAuthorization(authUser?.uid);
    if (!authorized) {
      showToast('High-risk action cancelled or verification expired.', 'error');
      throw new Error('High-risk authorization failed');
    }

    const targets = products.filter(p => ids.includes(p.id));
    const previousProducts = products;
    try {
      const { data, error } = await supabase.rpc('admin_bulk_delete_products', {
        p_product_ids: ids,
      });
      if (error) throw error;
      const deletedCount = Number(data ?? 0);
      if (deletedCount !== ids.length) {
        throw new Error(`Bulk deletion removed ${deletedCount} of ${ids.length} selected products.`);
      }
    } catch (err: any) {
      console.error('[ShopContext] bulk product delete failed:', err);
      setProducts(previousProducts);
      showToast(`Could not complete bulk deletion: ${err?.message || 'unknown error'}`, 'error');
      throw err;
    }

    setProducts(prev => {
      const next = prev.filter(p => !ids.includes(p.id));
      try { writeCatalogCache(CATALOG_CACHE_KEYS.products, next); } catch {}
      return next;
    });

    await logAdminActivity(
      'product_delete',
      `Bulk deleted ${targets.length} products`,
      `Permanently removed ${targets.length} products from catalog.`,
      'bulk_product_delete',
      targets,
      null
    );
    showToast(`${targets.length} products deleted!`);
  };

  /**
   * Re-reads the catalogue from Supabase.
   *
   * This used to restore the bundled seed catalogue: it batch-wrote every
   * INITIAL_PRODUCTS entry into the database, overwriting real admin edits with
   * sample data and inserting products whose ids are slugs rather than UUIDs —
   * which checkout then rejects. Seeding a production catalogue from bundled
   * demo data is not a recovery tool, so the action now does the thing an admin
   * actually wants from a "sync" button: discard local cache and re-read the
   * authoritative rows.
   */
  const syncAllProductsToDatabase = async () => {
    try {
      showToast('Reloading catalogue from Supabase...', 'info');

      const [freshProducts, freshCategories] = await Promise.all([
        supabaseCatalogService.fetchProducts({ isAdmin: isAdminUser, isSeller: isSellerUser, sellerId }),
        supabaseCatalogService.fetchCategories(),
      ]);
      await refreshSellersFromSupabase();

      setProducts(freshProducts.map(ensureSellerItemCode));
      setCategories(freshCategories);
      setCatalogStatus('ready');
      setCatalogError(null);

      try {
        writeCatalogCache(CATALOG_CACHE_KEYS.products, freshProducts);
        writeCatalogCache(CATALOG_CACHE_KEYS.categories, freshCategories);
      } catch {}

      showToast(
        freshProducts.length === 0
          ? 'Catalogue reloaded: the database has no products yet.'
          : `Catalogue reloaded: ${freshProducts.length} product(s) from Supabase.`,
        'success'
      );
    } catch (err: any) {
      console.error('[ShopContext] Catalogue reload failed:', err);
      setCatalogStatus('error');
      setCatalogError(err?.message || String(err));
      showToast(`Could not reload the catalogue: ${err?.message || 'unknown error'}`, 'error');
      throw err;
    }
  };

  // Check phone number uniqueness against the Supabase phone registry
  /**
   * Whether a phone number can be claimed by the current user.
   *
   * `excludeUid` is kept for call-site compatibility but is deliberately NOT
   * sent: the exclusion is the caller's own id, taken from auth.uid() inside
   * the function, so a client cannot free up another account's number by
   * naming it.
   *
   * This used to answer from `yallalb_registered_users_cache` in localStorage
   * — a per-browser list that said "available" for every number the browser
   * had not seen, and that a user can edit. A direct read of phone_registry is
   * no better: `phone_registry_own` restricts rows to their owner, so another
   * account's number simply comes back as missing. public.is_phone_available
   * answers server-side without disclosing who holds a number.
   *
   * The real guarantee is still the phone_key primary key at claim time; this
   * only lets the form warn before the round trip. A read failure therefore
   * reports availability rather than blocking a legitimate signup — but it is
   * logged, never swallowed.
   */
  const checkPhoneUniqueness = useCallback(async (phone: string, excludeUid?: string): Promise<{ available: boolean; reason?: string }> => {
    void excludeUid;

    const norm = normalizeLebanesePhone(phone);
    if (!norm.isValid) {
      return {
        available: false,
        reason: language === 'ar'
          ? 'يجب أن يتألف رقم الهاتف اللبناني من 8 أرقام صحيحة (مثال: 70123456 أو 03123456).'
          : 'Lebanese phone number must be strictly 8 valid digits (e.g. 70123456 or 03123456).'
      };
    }

    const { data, error } = await supabase.rpc('is_phone_available', {
      p_phone_key: norm.cleanDigits,
    });

    if (error) {
      console.error('[ShopContext] is_phone_available failed:', error);
      return { available: true };
    }

    if (data === false) {
      return {
        available: false,
        reason: language === 'ar'
          ? 'رقم الهاتف هذا مسجل مسبقاً بحساب آخر.'
          : 'This phone number is already registered to another account.'
      };
    }

    return { available: true };
  }, [language]);

  // Update user profile - persists to public.profiles
  const updateUser = async (updates: Partial<UserProfile>) => {
    // If phone number is updated, check uniqueness and manage registry
    if (updates.phone !== undefined && updates.phone !== '') {
      const norm = normalizeLebanesePhone(updates.phone);
      if (norm.isValid) {
        const oldNorm = normalizeLebanesePhone(user.phone);
        const isChanging = !oldNorm.isValid || oldNorm.cleanDigits !== norm.cleanDigits;
        const userUid = authUser?.uid || user.uid;

        if (isChanging) {
          const check = await checkPhoneUniqueness(norm.cleanDigits, userUid);
          if (!check.available) {
            showToast(check.reason || 'This phone number is already registered.', 'warning');
            throw new Error(check.reason || 'Phone number already registered.');
          }

        }
      }
    }

    // Strip privileged and authorization fields to prevent client-side privilege escalation
    const safeUpdates = { ...updates };
    delete (safeUpdates as any).role;
    delete (safeUpdates as any).sellerId;
    delete (safeUpdates as any).admin;
    delete (safeUpdates as any).seller;
    delete (safeUpdates as any).isAdminUser;
    delete (safeUpdates as any).isSellerUser;
    delete (safeUpdates as any).uid;
    delete (safeUpdates as any).isBanned;
    delete (safeUpdates as any).ordersPlaced;

    const updatedUser: UserProfile = {
      ...user,
      ...safeUpdates,
      uid: authUser ? authUser.uid : user.uid,
      role: 'customer',
      sellerId: sellerId || undefined
    };
    const sanitizedUser = sanitizeDocumentData(updatedUser);

    if (!authUser) {
      // Guest checkout details are intentionally browser-local only.
      setUser(updatedUser);
      try {
        localStorage.setItem('yallalb_saved_checkout_data', JSON.stringify(sanitizedUser));
      } catch {}
      return;
    }

    const userKey = authUser.uid;

    dbLogger.logDbWriteStart({
      operation: 'upsert',
      targetPath: `profiles/${userKey}`,
      sourceComponent: 'ShopContext',
      actionName: 'updateUser',
      summary: `Persisting profile and delivery details for user (${userKey}) to profiles...`,
      payload: sanitizedUser
    });

    // Database first: never expose a profile change in React/localStorage until
    // the authoritative Supabase write succeeds. This prevents a failed RLS or
    // network request from leaving the UI claiming that unsaved data was saved.
    // upsertProfile omits privilege fields; protect_profile_role() remains the
    // database-side authority for role/seller ownership.
    try {
      await supabaseUserDataService.upsertProfile(userKey, sanitizedUser as Partial<UserProfile>);
      setUser(updatedUser);
    } catch (err) {
      console.error('[ShopContext] Failed to save the user profile:', err);
      showToast('Could not save your details. Please try again.', 'error');
      throw err;
    }
  };

  const navigateToProductCategory = (category: string) => {
    setSelectedCategory(category);
    setActiveTab('products');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const providerValue = useMemo(() => ({
    activeTab,
    setActiveTab,
    navigateToProductCategory,
    selectedProductDetail,
    setSelectedProductDetail,
    openProductDetail,
    goBack,
    language,
    setLanguage,
    t,
    products,
    addProduct,
    updateProduct,
    deleteProduct,
    deleteMultipleProducts,
    reorderProducts,
    syncAllProductsToDatabase,
    selectedProductForModal,
    setSelectedProductForModal,
    isDbSyncing,
    catalogStatus,
    catalogError,
    hasMoreProducts,
    isFetchingMore,
    loadMoreProducts,
    currency,
    setCurrency,
    formatPrice,
    convertUSDToLBP,
    lbpRate,
    currencySymbol,
    currencyRate,
    cart,
    addToCart,
    addMultipleToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    cartTotalUSD,
    cartCount,
    isCartOpen,
    setIsCartOpen,
    wishlist,
    toggleWishlist,
    removeFromWishlist,
    isInWishlist,
    clearWishlist,
    orders,
    hasMoreOrders,
    isLoadingMoreOrders,
    loadMoreOrders,
    placeOrder,
    updateOrderStatus,
    deleteOrder,
    user,
    updateUser,
    checkPhoneUniqueness,
    authUser,
    // Compatibility alias; never an authorization source (see the type).
    firebaseUser: authUser,
    isAdminUser,
    isSellerUser,
    sellerId,
    isEmailVerified,
    signInWithEmail,
    signUpWithEmail,
    sendEmailOtp,
    verifyEmailOtp,
    resendEmailVerification,
    sendEmailSignInLink,
    completeEmailLinkSignIn,
    resetPassword,
    signInWithGoogle,
    signInWithApple,
    signOutUser,
    refreshUserProfile,
    isLoadingAuth,
    authStatus: (isLoadingAuth
      ? 'loading'
      : !authUser
      ? 'unauthenticated'
      : isAdminUser
      ? 'authenticated_admin'
      : 'authenticated_non_admin') as 'loading' | 'unauthenticated' | 'authenticated_non_admin' | 'authenticated_admin',
    searchQuery,
    setSearchQuery,
    logSearchQuery,
    selectedCategory,
    setSelectedCategory,
    toast,
    showToast,
    siteContent,
    updateSiteContent,
    toggleSectionVisibility,
    toggleProductPublish,
    addCustomBlock,
    updateCustomBlock,
    deleteCustomBlock,
    isVisualEditMode,
    setIsVisualEditMode,
    isCustomBlockModalOpen,
    setIsCustomBlockModalOpen,
    customBlockToEdit,
    setCustomBlockToEdit,
    isAdminUnlocked,
    setIsAdminUnlocked,
    recentActivities,
    logAdminActivity,
    undoAdminActivity,
    discountRules,
    appliedCouponCode,
    applyCoupon,
    removeCoupon,
    discountUSD,
    finalCartTotalUSD,
    appliedDiscountRules,
    addDiscountRule,
    updateDiscountRule,
    deleteDiscountRule,
    productBundles,
    addProductBundle,
    updateProductBundle,
    deleteProductBundle,
    addBundleToCart,
    categories,
    addCategory,
    updateCategory,
    deleteCategory,
    reorderCategories,
    regions,
    updateRegion,
    addRegion,
    deleteRegion,
    sellers,
    addSeller,
    updateSeller,
    toggleSellerActive,
    deleteSeller,
    bulkImportProducts
  }), [
    activeTab,
    selectedProductDetail,
    language,
    products,
    selectedProductForModal,
    isDbSyncing,
    catalogStatus,
    catalogError,
    hasMoreProducts,
    isFetchingMore,
    loadMoreProducts,
    currency,
    lbpRate,
    cart,
    cartTotalUSD,
    cartCount,
    isCartOpen,
    wishlist,
    orders,
    hasMoreOrders,
    isLoadingMoreOrders,
    loadMoreOrders,
    user,
    checkPhoneUniqueness,
    authUser,
    isEmailVerified,
    isAdminUser,
    isSellerUser,
    searchQuery,
    logSearchQuery,
    selectedCategory,
    toast,
    siteContent,
    isVisualEditMode,
    isCustomBlockModalOpen,
    customBlockToEdit,
    isAdminUnlocked,
    recentActivities,
    discountRules,
    appliedCouponCode,
    applyCoupon,
    removeCoupon,
    discountUSD,
    finalCartTotalUSD,
    appliedDiscountRules,
    productBundles,
    addBundleToCart,
    categories,
    regions,
    sellers
  ]);

  return (
    <ShopContext.Provider value={providerValue}>
      {children}
    </ShopContext.Provider>
  );
};

export const useShop = () => {
  const context = useContext(ShopContext);
  if (!context) {
    throw new Error('useShop must be used within a ShopProvider');
  }
  return context;
};
