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
import { LEBANON_REGIONS, LBP_USD_RATE } from '../data/regions';

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
  products: 'yallalb_products_v2',
  categories: 'yallalb_categories_v2',
  sellers: 'yallalb_sellers_v2'
} as const;


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

  // Cart
  cart: CartItem[];
  addToCart: (
    product: Product,
    quantity?: number,
    option?: string
  ) => void;
  addMultipleToCart: (
    items: {
      product: Product;
      quantity?: number;
      option?: string;
    }[]
  ) => void;
  removeFromCart: (
    productId: string
  ) => void;
  updateQuantity: (
    productId: string,
    quantity: number
  ) => void;
  clearCart: () => void;
  cartTotalUSD: number;
  cartCount: number;
  isCartOpen: boolean;
  setIsCartOpen: (
    open: boolean
  ) => void;

  // Wishlist
  wishlist: string[];
  toggleWishlist: (productId: string) => void;
  removeFromWishlist: (productId: string) => void;
  isInWishlist: (productId: string) => boolean;
  clearWishlist: () => void;

  // Orders
  orders: Order[];
  placeOrder: (
    orderData: Omit<
      Order,
      'id' | 'date' | 'trackingNumber' | 'status'
    >,
    customIdempotencyKey?: string
  ) => Promise<Order>;
  updateOrderStatus: (
    orderId: string,
    status: Order['status']
  ) => Promise<void>;
  deleteOrder: (
    orderId: string
  ) => Promise<void>;

  // User Profile
  user: UserProfile;
  updateUser: (
    updates: Partial<UserProfile>
  ) => Promise<void>;
  checkPhoneUniqueness: (
    phone: string,
    excludeUid?: string
  ) => Promise<{
    available: boolean;
    reason?: string;
  }>;

  // Supabase Auth & email OTP verification
  authUser: AuthUser | null;

  /**
   * The same object as `authUser`, under the name the pre-migration UI used.
   *
   * Compatibility only. It is a plain adapter over the Supabase user and holds
   * no signed claim: never branch on it for privilege. `isAdminUser` /
   * `isSellerUser` come from public.profiles, and the database's RLS policies
   * are what actually decide access.
   */
  firebaseUser: AuthUser | null;

  isAdminUser: boolean;
  isSellerUser: boolean;
  sellerId: string | null;
  isEmailVerified: boolean;
  isLoadingAuth: boolean;

  authStatus:
    | 'loading'
    | 'unauthenticated'
    | 'authenticated_non_admin'
    | 'authenticated_admin';

  signInWithEmail: (
    email: string,
    pass: string
  ) => Promise<void>;

  signUpWithEmail: (
    email: string,
    pass: string,
    phone?: string
  ) => Promise<void>;

  sendEmailOtp: (
    email: string
  ) => Promise<void>;

  verifyEmailOtp: (
    email: string,
    token: string,
    type?: EmailOtpType
  ) => Promise<void>;

  resendEmailVerification: (
    email?: string
  ) => Promise<void>;

  sendEmailSignInLink: (
    email: string
  ) => Promise<void>;

  completeEmailLinkSignIn: (
    email?: string,
    url?: string
  ) => Promise<void>;

  resetPassword: (
    email: string
  ) => Promise<void>;

  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signOutUser: () => Promise<void>;
  refreshUserProfile: () => Promise<void>;

  // Search & Filtering
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  logSearchQuery: (
    query: string,
    origin?:
      | 'navbar'
      | 'products_page'
      | 'mobile_menu'
      | 'direct'
  ) => Promise<void>;
  selectedCategory: string;
  setSelectedCategory: (cat: string) => void;

  // Feedback Toast
  toast: Toast | null;
  showToast: (
    message: string,
    type?: 'success' | 'info' | 'warning' | 'error'
  ) => void;

  // Site Content CMS (Admin Managed)
  siteContent: SiteContent;
  updateSiteContent: (
    updates:
      | Partial<SiteContent>
      | ((prev: SiteContent) => SiteContent)
  ) => Promise<void>;
  toggleSectionVisibility: (
    sectionKey: keyof SectionVisibilityConfig
  ) => Promise<void>;
  addCustomBlock: (
    block: Omit<CMSCustomBlock, 'id'>
  ) => Promise<void>;
  updateCustomBlock: (
    id: string,
    updates: Partial<CMSCustomBlock>
  ) => Promise<void>;
  deleteCustomBlock: (
    id: string
  ) => Promise<void>;

  // Visual Edit Mode
  isVisualEditMode: boolean;
  setIsVisualEditMode: (val: boolean) => void;
  isCustomBlockModalOpen: boolean;
  setIsCustomBlockModalOpen: (open: boolean) => void;
  customBlockToEdit: CMSCustomBlock | null;
  setCustomBlockToEdit: (
    block: CMSCustomBlock | null
  ) => void;

  // Admin Security Lock
  isAdminUnlocked: boolean;
  setIsAdminUnlocked: (val: boolean) => void;

  // Recent Activities (Audit Logs)
  recentActivities: RecentActivity[];
  logAdminActivity: (
    actionType: RecentActivity['actionType'],
    summary: string,
    details: string,
    targetId?: string,
    snapshotBefore?: any,
    snapshotAfter?: any
  ) => Promise<void>;
  undoAdminActivity: (
    activityId: string
  ) => Promise<void>;

  // Discounts & Promos
  discountRules: DiscountRule[];
  appliedCouponCode: string;
  applyCoupon: (code: string) => boolean;
  removeCoupon: () => void;
  discountUSD: number;
  finalCartTotalUSD: number;
  appliedDiscountRules: {
    rule: DiscountRule;
    savedUSD: number;
  }[];
  addDiscountRule: (
    rule: Omit<DiscountRule, 'id'>,
    couponCode?: string,
    maxTotalUses?: number,
    maxUsesPerUser?: number
  ) => Promise<void>;
  updateDiscountRule: (
    id: string,
    updates: Partial<DiscountRule>,
    couponCode?: string,
    maxTotalUses?: number,
    maxUsesPerUser?: number
  ) => Promise<void>;
  deleteDiscountRule: (
    id: string
  ) => Promise<void>;

  // Bundles & Combo Deals
  productBundles: ProductBundle[];
  addProductBundle: (
    bundle: Omit<
      ProductBundle,
      'id' | 'createdAt' | 'updatedAt'
    >
  ) => Promise<void>;
  updateProductBundle: (
    id: string,
    updates: Partial<ProductBundle>
  ) => Promise<void>;
  deleteProductBundle: (
    id: string
  ) => Promise<void>;
  addBundleToCart: (
    bundleId: string
  ) => void;

  // Categories & Details Management
  categories: CategoryItem[];
  addCategory: (
    cat: Omit<CategoryItem, 'id'> & { id?: string }
  ) => Promise<void>;
  updateCategory: (
    id: string,
    updates: Partial<CategoryItem>
  ) => Promise<void>;
  deleteCategory: (
    id: string,
    reassignCategoryId?: string,
    deleteAttachedProducts?: boolean
  ) => Promise<void>;
  reorderCategories: (
    newOrder: CategoryItem[]
  ) => Promise<void>;

  // Terroir Regions & Logistics
  regions: TerroirRegion[];
  updateRegion: (
    id: string,
    updates: Partial<TerroirRegion>
  ) => Promise<void>;
  addRegion: (
    reg: TerroirRegion
  ) => Promise<void>;
  deleteRegion: (
    id: string
  ) => Promise<void>;

  // Sellers Management
  sellers: Seller[];
  addSeller: (
    seller: Omit<
      Seller,
      'id' | 'createdAt' | 'updatedAt'
    > & { id?: string }
  ) => Promise<void>;
  updateSeller: (
    id: string,
    updates: Partial<Seller>
  ) => Promise<void>;
  toggleSellerActive: (
    sellerId: string,
    isActive: boolean
  ) => Promise<void>;
  deleteSeller: (
    id: string,
    reassignSellerId?: string
  ) => Promise<void>;
  bulkImportProducts: (
    csvText: string,
    options?: {
      targetSellerId?: string;
      fallbackCategoryId?: string;
    }
  ) => Promise<{
    created: number;
    updated: number;
    errors: string[];
  }>;
}

    
const ShopContext = createContext<ShopContextType | undefined>(undefined);

export const INITIAL_USER: UserProfile = {
  name: '',
  email: '',
  phone: '',
  avatar: '',
  defaultGovernorate: '',
  defaultCity: '',
  defaultAddress: ''
};

/**
 * Strict allowlisted UserProfile mapper for ShopContext.
 *
 * Supabase Auth (`auth.users`) provides the user's identity and email.
 * `public.profiles` provides application-level profile information.
 *
 * IMPORTANT:
 * - This mapper does NOT determine admin/seller privileges.
 * - Role authorization is read from `public.profiles.role`.
 * - Seller authorization is read from `public.profiles.seller_id`.
 * - Supabase RLS is the actual security boundary.
 *
 * The returned role intentionally defaults to `customer`.
 */
export function mapSafeShopUserProfile(
  data: Record<string, any>,
  authUser: AuthUser | AuthUserLike | any,
  authoritativeSellerId: string | null,
  cachedShipping?: Partial<UserProfile>,
  fallbackNames?: {
    firstName: string;
    lastName: string;
    name: string;
  }
): UserProfile {
  const firstName =
    (typeof data.firstName === 'string' && data.firstName.trim()) ||
    (typeof data.first_name === 'string' && data.first_name.trim()) ||
    (
      typeof data.name === 'string' &&
      data.name.trim()
        ? data.name.trim().split(' ')[0]
        : ''
    ) ||
    cachedShipping?.firstName ||
    fallbackNames?.firstName ||
    '';

  const lastName =
    (typeof data.lastName === 'string' && data.lastName.trim()) ||
    (typeof data.last_name === 'string' && data.last_name.trim()) ||
    (
      typeof data.name === 'string' &&
      data.name.trim()
        ? data.name.trim().split(' ').slice(1).join(' ')
        : ''
    ) ||
    cachedShipping?.lastName ||
    fallbackNames?.lastName ||
    '';

  const phone =
    (typeof data.phone === 'string' && data.phone.trim()) ||
    cachedShipping?.phone ||
    '';

  const defaultGovernorate =
    (typeof data.defaultGovernorate === 'string' &&
      data.defaultGovernorate.trim()) ||
    (typeof data.default_governorate === 'string' &&
      data.default_governorate.trim()) ||
    INITIAL_USER.defaultGovernorate ||
    '';

  const defaultCity =
    (typeof data.defaultCity === 'string' &&
      data.defaultCity.trim()) ||
    (typeof data.default_city === 'string' &&
      data.default_city.trim()) ||
    cachedShipping?.defaultCity ||
    '';

  const defaultAddress =
    (typeof data.defaultAddress === 'string' &&
      data.defaultAddress.trim()) ||
    (typeof data.default_address === 'string' &&
      data.default_address.trim()) ||
    cachedShipping?.defaultAddress ||
    '';

  const defaultBuilding =
    (typeof data.defaultBuilding === 'string' &&
      data.defaultBuilding.trim()) ||
    (typeof data.default_building === 'string' &&
      data.default_building.trim()) ||
    cachedShipping?.defaultBuilding ||
    undefined;

  const defaultNotes =
    (typeof data.defaultNotes === 'string' &&
      data.defaultNotes.trim()) ||
    (typeof data.default_notes === 'string' &&
      data.default_notes.trim()) ||
    cachedShipping?.defaultNotes ||
    undefined;

  const uid =
    authUser?.uid ||
    authUser?.id ||
    '';

  const emailVerified =
    typeof authUser?.emailVerified === 'boolean'
      ? authUser.emailVerified
      : Boolean(authUser?.email_confirmed_at);

  return {
    uid,

    name:
      (typeof data.name === 'string' && data.name.trim()) ||
      `${firstName} ${lastName}`.trim() ||
      authUser?.displayName ||
      authUser?.user_metadata?.full_name ||
      authUser?.user_metadata?.name ||
      '',

    firstName,
    lastName,

    email:
      (typeof data.email === 'string' && data.email.trim()) ||
      authUser?.email ||
      '',

    phone,

    avatar:
      (typeof data.avatar === 'string' && data.avatar.trim()) ||
      (typeof data.avatar_url === 'string' && data.avatar_url.trim()) ||
      authUser?.photoURL ||
      authUser?.user_metadata?.avatar_url ||
      INITIAL_USER.avatar,

    defaultGovernorate,
    defaultCity,
    defaultAddress,
    defaultBuilding,
    defaultNotes,

    /**
     * Never infer privileges from the client.
     *
     * The actual profile role is loaded separately from Supabase.
     */
    role: 'customer',

    sellerId:
      authoritativeSellerId || undefined,

    emailVerified,

    isOtpVerified:
      typeof data.isOtpVerified === 'boolean'
        ? data.isOtpVerified
        : undefined
  };
}

/**
 * Creates the compatibility user object consumed by the existing UI.
 *
 * This is NOT a Firebase user.
 *
 * It only adapts the Supabase Auth user to the shape expected by the
 * existing application while the rest of the UI is being migrated.
 *
 * No Firebase claims are generated.
 * No admin/seller claims are generated.
 * No authorization decision is made here.
 */
export function createAuthUserAdapter(
  supaUser: SupabaseUser,
  profileData: Record<string, any> = {}
): AuthUser {
  const isEmailConfirmed =
    Boolean(supaUser.email_confirmed_at);

  return {
    uid: supaUser.id,

    id: supaUser.id,

    email: supaUser.email,

    emailVerified: isEmailConfirmed,

    displayName:
      profileData.name ||
      (
        profileData.first_name &&
        profileData.last_name
          ? `${profileData.first_name} ${profileData.last_name}`.trim()
          : ''
      ) ||
      supaUser.user_metadata?.name ||
      supaUser.user_metadata?.full_name ||
      null,

    photoURL:
      profileData.avatar ||
      profileData.avatar_url ||
      supaUser.user_metadata?.avatar_url ||
      null,

    user_metadata:
      supaUser.user_metadata,

    app_metadata:
      supaUser.app_metadata,

    /**
     * Compatibility method for existing code that expects a Firebase-style
     * getIdToken() function.
     *
     * This returns the current Supabase access token.
     *
     * IMPORTANT:
     * This token must never be interpreted as a Firebase token.
     */
    getIdToken: async (_force?: boolean) => {
      const {
        data,
        error
      } = await supabase.auth.getSession();

      if (error) {
        throw error;
      }

      return data.session?.access_token || '';
    }
  };
}

export const mapUserProfile =
  mapSafeShopUserProfile;

/**
 * Backward-compatible wrapper used by existing ShopContext code.
 *
 * `_uid` is intentionally retained so existing callers do not need to change
 * yet. Supabase Auth's user ID remains the authoritative identity.
 */
export function mapSafeUserProfile(
  authUser: AuthUser | any,
  _uid: string,
  data: Record<string, any> | undefined,
  sellerId: string | null
): UserProfile {
  return mapSafeShopUserProfile(
    data || {},
    authUser,
    sellerId
  );
}


const INITIAL_ORDERS: Order[] = [];

export const ShopProvider: React.FC<{ children: React.ReactNode }> = ({
  children
}) => {
  const [activeTab, setActiveTabState] =
    useState<NavTab>(getInitialNavTab);

  const [selectedProductDetail, setSelectedProductDetail] =
    useState<Product | null>(getInitialProductDetail);

  const [authUser, setAuthUser] =
    useState<AuthUser | null>(null);

  const [isAdminUser, setIsAdminUser] =
    useState(false);

  const [isSellerUser, setIsSellerUser] =
    useState(false);

  const [sellerId, setSellerId] =
    useState<string | null>(null);

  const [isEmailVerified, setIsEmailVerified] =
    useState(false);

  const [isLoadingAuth, setIsLoadingAuth] =
    useState(true);

  /**
   * Role and email verification are authoritative from Supabase.
   *
   * - Authentication: Supabase Auth
   * - Email verification: auth.users.email_confirmed_at
   * - Application role: public.profiles.role
   * - Seller identity: public.profiles.seller_id
   * - Actual authorization: Supabase RLS
   */
  useEffect(() => {
    if (!authUser) {
      setIsEmailVerified(false);
      setIsAdminUser(false);
      setIsSellerUser(false);
      setSellerId(null);
    }
  }, [authUser]);

  const [isLocalAdminUnlocked, setIsLocalAdminUnlockedState] =
    useState<boolean>(() => {
      try {
        return localStorage.getItem('yallalb_admin_unlocked') === 'true';
      } catch {
        return false;
      }
    });

  const isAdminUnlocked = useMemo(() => {
    return isAdminUser && isLocalAdminUnlocked;
  }, [isAdminUser, isLocalAdminUnlocked]);

  const setIsAdminUnlocked = (val: boolean) => {
    setIsLocalAdminUnlockedState(val);

    try {
      localStorage.setItem(
        'yallalb_admin_unlocked',
        String(val)
      );
    } catch {}
  };

  const [isDbSyncing, setIsDbSyncing] =
    useState<boolean>(true);

  /**
   * Compatibility refs only.
   * Supabase is authoritative and production must not seed
   * demo products/orders automatically.
   */
  const hasSeededProductsRef =
    useRef<boolean>(false);

  const hasSeededOrdersRef =
    useRef<boolean>(false);

  // Verify Supabase is reachable.
  useEffect(() => {
    const checkSupabase = async () => {
      const { error } = await supabase
        .from('categories')
        .select('id')
        .limit(1);

      if (error) {
        console.error(
          '[ShopContext] Supabase is not reachable:',
          error.message
        );
      }
    };

    void checkSupabase();
  }, []);

  // UI state
  const [selectedProductForModal, setSelectedProductForModal] =
    useState<Product | null>(null);

  const [currency, setCurrency] =
    useState<Currency>('USD');

  const [isCartOpen, setIsCartOpen] =
    useState(false);

  const [searchQuery, setSearchQuery] =
    useState('');

  const [selectedCategory, setSelectedCategory] =
    useState<string>(getInitialCategory);

  const [toast, setToast] =
    useState<Toast | null>(null);

  // Pagination
  const [hasMoreProducts, setHasMoreProducts] =
    useState(true);

  const [isFetchingMore, setIsFetchingMore] =
    useState(false);

  const lastProductCursorRef = useRef<{
    displayOrder: number;
    id: string;
  } | null>(null);

  // Core catalogue state
  const [products, setProducts] = useState<Product[]>(() =>
    readCachedList<Product>(
      CATALOG_CACHE_KEYS.products
    ).map(ensureSellerItemCode)
  );

  const [catalogStatus, setCatalogStatus] =
    useState<'loading' | 'ready' | 'error'>('loading');

  const [catalogError, setCatalogError] =
    useState<string | null>(null);
  // Orders are never seeded from localStorage: the cache is not scoped per
  // account, so restoring it would have shown one shopper another's orders.
  // The authoritative list is loaded from public.orders, where RLS decides
  // which rows the signed-in user may see.
  const [orders, setOrders] = useState<Order[]>(INITIAL_ORDERS);

  const [user, setUser] = useState<UserProfile>(() => {
  try {
    const saved = localStorage.getItem('yallalb_user');

    if (saved) {
      const parsed = JSON.parse(saved);

      return {
        ...INITIAL_USER,
        ...parsed
      };
    }

    return INITIAL_USER;
  } catch {
    return INITIAL_USER;
  }
});

  // Site Content CMS state
  const [siteContent, setSiteContent] = useState<SiteContent>(() => {
    try {
      if (typeof window !== 'undefined') {
        const isCmsPreview = new URLSearchParams(window.location.search).get('cmsPreview') === '1';
        if (isCmsPreview) {
          const sessionDraft = sessionStorage.getItem('yalla_cms_preview');
          if (sessionDraft) {
            const parsedDraft = JSON.parse(sessionDraft);
            return parsedDraft;
          }
        }
      }
      const saved = localStorage.getItem('yallalb_site_content');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.customBlocks) {
          parsed.customBlocks = parsed.customBlocks.filter((b: CMSCustomBlock) => b.id !== 'heritage-diaspora-banner');
        }
        return parsed;
      }
      return DEFAULT_SITE_CONTENT;
    } catch {
      return DEFAULT_SITE_CONTENT;
    }
  });

  const [isVisualEditMode, setIsVisualEditMode] = useState<boolean>(false);
  const [isCustomBlockModalOpen, setIsCustomBlockModalOpen] = useState<boolean>(false);
  const [customBlockToEdit, setCustomBlockToEdit] = useState<CMSCustomBlock | null>(null);

   const [recentActivities, setRecentActivities] =
  useState<RecentActivity[]>([]);

  // Real-time recent-activity sync from Supabase
  useEffect(() => {
    /**
     * Recent admin activity, from public.admin_activities.
     *
     * Replaces an onSnapshot listener over the Firestore `recent_activity`
     * collection. `activities_admin` is is_admin(), so a non-admin gets
     * nothing; the table is not in the supabase_realtime publication, so the
     * list loads on mount rather than streaming.
     */
    if (!isAdminUser) return;
    let isMounted = true;

    supabaseAdminService
      .fetchActivities(200)
      .then((rows) => {
        if (!isMounted) return;
        setRecentActivities(
          rows.map((row) => ({
            id: row.id,
            timestamp: row.createdAt,
            actionType: row.actionType as RecentActivity['actionType'],
            summary: row.summary,
            details: row.details || '',
            // admin_activities stores actor_id, not an email: profiles_select
            // does not let one user read another's, so the id is shown and an
            // email is not invented.
            adminEmail: row.actorId || '',
            targetId: row.targetId,
            snapshotBefore: row.snapshotBefore,
            snapshotAfter: row.snapshotAfter,
          }))
        );
      })
      .catch((err) => {
        console.error('[ShopContext] Failed to load recent activity:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [isAdminUser]);

  const logAdminActivity = async (
  actionType: RecentActivity['actionType'],
  summary: string,
  details: string,
  targetId?: string,
  snapshotBefore?: any,
  snapshotAfter?: any
) => {
  try {
    if (!isAdminUser || !authUser?.id) {
      console.warn(
        '[ShopContext] Admin activity rejected: current user is not an authenticated admin.'
      );
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', authUser.id)
      .maybeSingle();

    if (profileError) {
      throw profileError;
    }

    if (profile?.role !== 'admin') {
      console.warn(
        '[ShopContext] Admin activity rejected: user is not an admin.'
      );
      return;
    }

    const { data, error } = await supabase
      .from('admin_activities')
      .insert({
        actor_id: authUser.id,
        action_type: actionType,
        summary,
        details,
        target_id: targetId ?? null,
        snapshot_before:
          snapshotBefore !== undefined
            ? snapshotBefore
            : null,
        snapshot_after:
          snapshotAfter !== undefined
            ? snapshotAfter
            : null
      })
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    if (data) {
      const newActivity: RecentActivity = {
        id: data.id,
        timestamp: data.created_at,
        actionType:
          data.action_type as RecentActivity['actionType'],
        summary: data.summary,
        details: data.details || '',
        adminEmail: data.actor_id || '',
        targetId: data.target_id || undefined,
        snapshotBefore: data.snapshot_before,
        snapshotAfter: data.snapshot_after
      };

      setRecentActivities(prev =>
        [newActivity, ...prev].slice(0, 200)
      );
    }
  } catch (err) {
    console.warn(
      '[ShopContext] Failed to log admin activity:',
      err
    );
  }
};

    
  const undoAdminActivity = async (activityId: string) => {
    const act = recentActivities.find(a => a.id === activityId);
    if (!act) {
      showToast('Activity log entry not found.', 'error');
      return;
    }
    if (act.isUndone) {
      showToast('This action has already been undone.', 'error');
      return;
    }

    try {
      if (
        act.actionType === 'product_update' &&
        act.targetId &&
        act.snapshotBefore
      ) {
        const restoredProduct = act.snapshotBefore as Product;

        const { error } = await supabase
          .from('products')
          .update({
            name: restoredProduct.name,
            arabic_name: restoredProduct.arabicName ?? null,
            artisan: restoredProduct.artisan,
            seller_id: restoredProduct.sellerId ?? null,
            origin: restoredProduct.origin,
            category_id: restoredProduct.category
              ? restoredProduct.category
              : null,
            price_usd: restoredProduct.priceUSD,
            original_price_usd:
              restoredProduct.originalPriceUSD ?? null,
            discount_percentage:
              restoredProduct.discountPercentage ?? null,
            rating: restoredProduct.rating,
            reviews_count: restoredProduct.reviewsCount,
            image: restoredProduct.image,
            video_url: restoredProduct.videoUrl ?? null,
            description: restoredProduct.description,
            craft_story: restoredProduct.craftStory,
            stock: restoredProduct.stock,
            is_new_arrival:
              restoredProduct.isNewArrival ?? false,
            is_featured:
              restoredProduct.isFeatured ?? false,
            is_bestseller:
              restoredProduct.isBestseller ?? false,
            is_published:
              restoredProduct.isPublished ?? true,
            display_order:
              restoredProduct.displayOrder ?? 0,
            seller_item_code:
              restoredProduct.sellerItemCode ?? null,
            low_stock_threshold:
              restoredProduct.lowStockThreshold ?? null,
            low_stock_notice:
              restoredProduct.lowStockNotice ?? null,
            custom_stock_label:
              restoredProduct.customStockLabel ?? null,
            cost_price_usd:
              restoredProduct.costPriceUSD ?? null,
            tags: restoredProduct.tags ?? [],
            keywords:
              restoredProduct.keywords ?? [],
            arabic_keywords:
              restoredProduct.arabicKeywords ?? [],
            seo_title:
              restoredProduct.seoTitle ?? null,
            seo_arabic_title:
              restoredProduct.seoArabicTitle ?? null,
            seo_description:
              restoredProduct.seoDescription ?? null,
            seo_arabic_description:
              restoredProduct.seoArabicDescription ?? null,
            weight_or_volume:
              restoredProduct.weightOrVolume ?? null
          })
          .eq('id', act.targetId);

        if (error) {
          throw error;
        }

        setProducts(prev =>
          prev.map(p =>
            p.id === act.targetId
              ? { ...restoredProduct }
              : p
          )
        );
      } else if (
        act.actionType === 'product_add' &&
        act.targetId
      ) {
        const { error } = await supabase
          .from('products')
          .delete()
          .eq('id', act.targetId);

        if (error) {
          throw error;
        }

        setProducts(prev =>
          prev.filter(p => p.id !== act.targetId)
        );
      } else if (
        act.actionType === 'product_delete' &&
        act.targetId &&
        act.snapshotBefore
      ) {
        const restoredProduct =
          act.snapshotBefore as Product;

        const { error } = await supabase
          .from('products')
          .insert({
            id: restoredProduct.id,
            name: restoredProduct.name,
            arabic_name:
              restoredProduct.arabicName ?? null,
            artisan: restoredProduct.artisan,
            seller_id:
              restoredProduct.sellerId ?? null,
            origin: restoredProduct.origin,
            category_id:
              restoredProduct.category || null,
            price_usd: restoredProduct.priceUSD,
            original_price_usd:
              restoredProduct.originalPriceUSD ?? null,
            discount_percentage:
              restoredProduct.discountPercentage ?? null,
            rating: restoredProduct.rating,
            reviews_count:
              restoredProduct.reviewsCount,
            image: restoredProduct.image,
            video_url:
              restoredProduct.videoUrl ?? null,
            description:
              restoredProduct.description,
            craft_story:
              restoredProduct.craftStory,
            stock: restoredProduct.stock,
            is_new_arrival:
              restoredProduct.isNewArrival ?? false,
            is_featured:
              restoredProduct.isFeatured ?? false,
            is_bestseller:
              restoredProduct.isBestseller ?? false,
            is_published:
              restoredProduct.isPublished ?? true,
            display_order:
              restoredProduct.displayOrder ?? 0,
            seller_item_code:
              restoredProduct.sellerItemCode ?? null,
            low_stock_threshold:
              restoredProduct.lowStockThreshold ?? null,
            low_stock_notice:
              restoredProduct.lowStockNotice ?? null,
            custom_stock_label:
              restoredProduct.customStockLabel ?? null,
            cost_price_usd:
              restoredProduct.costPriceUSD ?? null,
            tags:
              restoredProduct.tags ?? [],
            keywords:
              restoredProduct.keywords ?? [],
            arabic_keywords:
              restoredProduct.arabicKeywords ?? [],
            seo_title:
              restoredProduct.seoTitle ?? null,
            seo_arabic_title:
              restoredProduct.seoArabicTitle ?? null,
            seo_description:
              restoredProduct.seoDescription ?? null,
            seo_arabic_description:
              restoredProduct.seoArabicDescription ?? null,
            weight_or_volume:
              restoredProduct.weightOrVolume ?? null
          });

        if (error) {
          throw error;
        }

        setProducts(prev => [
          ...prev.filter(p => p.id !== act.targetId),
          restoredProduct
        ]);
      } else if (
        act.actionType === 'product_bulk_update' &&
        Array.isArray(act.snapshotBefore)
      ) {
        const restoredProducts =
          act.snapshotBefore as Product[];

        for (const restoredProduct of restoredProducts) {
          const { error } = await supabase
            .from('products')
            .update({
              name: restoredProduct.name,
              arabic_name:
                restoredProduct.arabicName ?? null,
              artisan:
                restoredProduct.artisan,
              seller_id:
                restoredProduct.sellerId ?? null,
              origin:
                restoredProduct.origin,
              price_usd:
                restoredProduct.priceUSD,
              original_price_usd:
                restoredProduct.originalPriceUSD ?? null,
              discount_percentage:
                restoredProduct.discountPercentage ?? null,
              rating:
                restoredProduct.rating,
              reviews_count:
                restoredProduct.reviewsCount,
              image:
                restoredProduct.image,
              video_url:
                restoredProduct.videoUrl ?? null,
              description:
                restoredProduct.description,
              craft_story:
                restoredProduct.craftStory,
              stock:
                restoredProduct.stock,
              is_new_arrival:
                restoredProduct.isNewArrival ?? false,
              is_featured:
                restoredProduct.isFeatured ?? false,
              is_bestseller:
                restoredProduct.isBestseller ?? false,
              is_published:
                restoredProduct.isPublished ?? true,
              display_order:
                restoredProduct.displayOrder ?? 0,
              seller_item_code:
                restoredProduct.sellerItemCode ?? null,
              low_stock_threshold:
                restoredProduct.lowStockThreshold ?? null,
              low_stock_notice:
                restoredProduct.lowStockNotice ?? null,
              custom_stock_label:
                restoredProduct.customStockLabel ?? null,
              tags:
                restoredProduct.tags ?? [],
              keywords:
                restoredProduct.keywords ?? [],
              arabic_keywords:
                restoredProduct.arabicKeywords ?? []
            })
            .eq('id', restoredProduct.id);

          if (error) {
            throw error;
          }
        }

        const restoredMap = new Map(
          restoredProducts.map(p => [p.id, p])
        );

        setProducts(prev =>
          prev.map(
            p => restoredMap.get(p.id) || p
          )
        );
      } else {
        showToast(
          'Undo is only supported for product additions, updates, and deletions.',
          'warning'
        );
        return;
      }

      const undoneTimestamp =
        new Date().toISOString();

 setRecentActivities(prev =>
  prev.map(a =>
    a.id === activityId
      ? {
          ...a,
          isUndone: true,
          undoneAt: undoneTimestamp
        }
      : a
  )
);

await logAdminActivity(
  'product_update',
  `Undid: ${act.summary}`,
  `Reverted changes from activity logged at ${new Date(
    act.timestamp
  ).toLocaleTimeString()}`,
  act.targetId
);

showToast(
  `Successfully undone: "${act.summary}"! Changes recovered.`,
  'success'
);

const [discountRules, setDiscountRules] =
  useState<DiscountRule[]>([]);


    
  // Load discount rules from Supabase
useEffect(() => {
  /**
   * Discount rules come from public.discount_rules.
   *
   * The database/RLS controls which users may access the rules.
   * Client-side discount rules are display data only.
   *
   * The checkout RPC remains authoritative for:
   * - discount eligibility
   * - coupon validation
   * - discount calculation
   * - final order totals
   */
  let isMounted = true;

  supabaseCommerceService
    .fetchDiscountRules()
    .then((rules) => {
      if (isMounted) setDiscountRules(rules);
    })
    .catch((err) => {
      console.error(
        '[ShopContext] Failed to load discount rules:',
        err
      );
    });

  return () => {
    isMounted = false;
  };
}, [isAdminUser]);

    
  const addDiscountRule = async (
  ruleData: Omit<DiscountRule, 'id'>,
  couponCode?: string,
  maxTotalUses?: number,
  maxUsesPerUser?: number
) => {
  try {
    const { data, error } = await supabase
      .from('discount_rules')
      .insert({
        name: ruleData.name,
        type: ruleData.type,
        value: ruleData.value,
        target: ruleData.target,
        target_value: ruleData.targetValue ?? null,
        is_active: ruleData.isActive ?? true,
        min_purchase_usd:
          ruleData.minPurchaseUSD ?? null,
        coupon_code: couponCode ?? null,
        max_total_uses: maxTotalUses ?? null,
        max_uses_per_user: maxUsesPerUser ?? null
      })
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    if (!data) {
      throw new Error(
        'Supabase did not return the created discount rule.'
      );
    }

    const createdRule: DiscountRule = {
      ...ruleData,
      id: data.id,
      couponCode: data.coupon_code ?? undefined,
      maxTotalUses:
        data.max_total_uses ?? undefined,
      maxUsesPerUser:
        data.max_uses_per_user ?? undefined
    };

    setDiscountRules(prev => [
      createdRule,
      ...prev
    ]);

    await logAdminActivity(
      'meta_change',
      'Created Discount Rule',
      `Created discount: ${createdRule.name}`,
      createdRule.id
    );
  } catch (err) {
    console.error(
      '[ShopContext] Error saving discount rule to Supabase:',
      err
    );

    showToast(
      'Failed to save discount rule to database',
      'warning'
    );

    throw err;
  }
};

    
  const updateDiscountRule = async (
  id: string,
  updates: Partial<DiscountRule>,
  couponCode?: string,
  maxTotalUses?: number,
  maxUsesPerUser?: number
) => {
  const target = discountRules.find(r => r.id === id);

  if (!target) {
    showToast('Discount rule not found.', 'warning');
    return;
  }

  try {
    const updatePayload: Record<string, any> = {};

    if (updates.name !== undefined) {
      updatePayload.name = updates.name;
    }

    if (updates.type !== undefined) {
      updatePayload.type = updates.type;
    }

    if (updates.value !== undefined) {
      updatePayload.value = updates.value;
    }

    if (updates.target !== undefined) {
      updatePayload.target = updates.target;
    }

    if (updates.targetValue !== undefined) {
      updatePayload.target_value =
        updates.targetValue ?? null;
    }

    if (updates.isActive !== undefined) {
      updatePayload.is_active =
        updates.isActive;
    }

    if (updates.minPurchaseUSD !== undefined) {
      updatePayload.min_purchase_usd =
        updates.minPurchaseUSD ?? null;
    }

    if (couponCode !== undefined) {
      updatePayload.coupon_code =
        couponCode || null;
    }

    if (maxTotalUses !== undefined) {
      updatePayload.max_total_uses =
        maxTotalUses ?? null;
    }

    if (maxUsesPerUser !== undefined) {
      updatePayload.max_uses_per_user =
        maxUsesPerUser ?? null;
    }

    if (Object.keys(updatePayload).length === 0) {
      return;
    }

    const { data, error } = await supabase
      .from('discount_rules')
      .update(updatePayload)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    if (!data) {
      throw new Error(
        'Supabase did not return the updated discount rule.'
      );
    }

    const updatedRule: DiscountRule = {
      ...target,
      ...updates,
      id: data.id,
      couponCode:
        data.coupon_code ?? undefined,
      maxTotalUses:
        data.max_total_uses ?? undefined,
      maxUsesPerUser:
        data.max_uses_per_user ?? undefined
    };

    setDiscountRules(prev =>
      prev.map(rule =>
        rule.id === id
          ? updatedRule
          : rule
      )
    );

    await logAdminActivity(
      'meta_change',
      'Updated Discount Rule',
      `Updated discount ID: ${id}`,
      id
    );
  } catch (err) {
    console.error(
      '[ShopContext] Error updating discount rule in Supabase:',
      err
    );

    showToast(
      'Failed to update discount rule in database',
      'warning'
    );

    throw err;
  }
};

    
  const deleteDiscountRule = async (id: string) => {
  try {
    const { error } = await supabase
      .from('discount_rules')
      .delete()
      .eq('id', id);

    if (error) {
      throw error;
    }

    setDiscountRules(prev =>
      prev.filter(rule => rule.id !== id)
    );

    await logAdminActivity(
      'meta_change',
      'Deleted Discount Rule',
      `Deleted discount ID: ${id}`,
      id
    );
  } catch (err) {
    console.error(
      '[ShopContext] Error deleting discount rule from Supabase:',
      err
    );

    showToast(
      'Failed to delete discount rule from database',
      'warning'
    );

    throw err;
  }
};

    
  // Product Bundles & Combo Deals State
const [productBundles, setProductBundles] =
  useState<ProductBundle[]>([]);

    
  // Load product bundles from Supabase
useEffect(() => {
  /**
   * Product bundles come from public.product_bundles.
   *
   * Supabase/RLS controls which bundles the current user may read.
   * Published bundles are available to shoppers; unpublished bundles
   * remain available only to authorized admin users.
   *
   * The database is the authoritative source.
   * No localStorage fallback or automatic demo-bundle seeding is used.
   */
  let isMounted = true;

  supabaseCommerceService
    .fetchProductBundles()
    .then((bundles) => {
      if (isMounted) {
        setProductBundles(bundles);
      }
    })
    .catch((err) => {
      console.error(
        '[ShopContext] Failed to load product bundles:',
        err
      );
    });

  return () => {
    isMounted = false;
  };
}, [isAdminUser]);

    
  const addProductBundle = async (
  bundleData: Omit<ProductBundle, 'id' | 'createdAt' | 'updatedAt'>
) => {
  try {
    const { data, error } = await supabase
      .from('product_bundles')
      .insert({
        name: bundleData.name,
        name_ar: bundleData.nameAr,
        description: bundleData.description,
        description_ar: bundleData.descriptionAr,
        badge_text: bundleData.badgeText,
        badge_text_ar: bundleData.badgeTextAr,
        product_ids: bundleData.productIds,
        bundle_price_usd: bundleData.bundlePriceUSD,
        is_active: bundleData.isActive
      })
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    if (!data) {
      throw new Error(
        'Supabase did not return the created product bundle.'
      );
    }

    const newBundle: ProductBundle = {
      ...bundleData,
      id: data.id,
      createdAt: data.created_at,
      updatedAt: data.updated_at ?? data.created_at
    };

    setProductBundles(prev => [
      newBundle,
      ...prev
    ]);

    await logAdminActivity(
      'meta_change',
      'Created Combo Deal',
      `Created bundle: ${newBundle.name}`,
      newBundle.id
    );
  } catch (err) {
    console.error(
      '[ShopContext] Error saving bundle to Supabase:',
      err
    );

    showToast(
      'Failed to create combo deal in database',
      'warning'
    );

    throw err;
  }
};

    
  const updateProductBundle = async (
  id: string,
  updates: Partial<ProductBundle>
) => {
  const target = productBundles.find(bundle => bundle.id === id);

  if (!target) {
    showToast('Product bundle not found.', 'warning');
    return;
  }

  try {
    const updatePayload: Record<string, any> = {};

    if (updates.name !== undefined) {
      updatePayload.name = updates.name;
    }

    if (updates.nameAr !== undefined) {
      updatePayload.name_ar = updates.nameAr;
    }

    if (updates.description !== undefined) {
      updatePayload.description = updates.description;
    }

    if (updates.descriptionAr !== undefined) {
      updatePayload.description_ar = updates.descriptionAr;
    }

    if (updates.badgeText !== undefined) {
      updatePayload.badge_text = updates.badgeText;
    }

    if (updates.badgeTextAr !== undefined) {
      updatePayload.badge_text_ar = updates.badgeTextAr;
    }

    if (updates.productIds !== undefined) {
      updatePayload.product_ids = updates.productIds;
    }

    if (updates.bundlePriceUSD !== undefined) {
      updatePayload.bundle_price_usd = updates.bundlePriceUSD;
    }

    if (updates.isActive !== undefined) {
      updatePayload.is_active = updates.isActive;
    }

    if (Object.keys(updatePayload).length === 0) {
      return;
    }

    const { data, error } = await supabase
      .from('product_bundles')
      .update(updatePayload)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    if (!data) {
      throw new Error(
        'Supabase did not return the updated product bundle.'
      );
    }

    const updatedBundle: ProductBundle = {
      ...target,
      ...updates,
      id: data.id,
      createdAt: data.created_at,
      updatedAt: data.updated_at ?? data.created_at
    };

    setProductBundles(prev =>
      prev.map(bundle =>
        bundle.id === id
          ? updatedBundle
          : bundle
      )
    );

    await logAdminActivity(
      'meta_change',
      'Updated Combo Deal',
      `Updated bundle: ${updatedBundle.name}`,
      id
    );
  } catch (err) {
    console.error(
      '[ShopContext] Error updating bundle in Supabase:',
      err
    );

    showToast(
      'Failed to update combo deal in database',
      'warning'
    );

    throw err;
  }
};


  const deleteProductBundle = async (id: string) => {
  const target = productBundles.find(
    bundle => bundle.id === id
  );

  if (!target) {
    showToast('Product bundle not found.', 'warning');
    return;
  }

  try {
    const { error } = await supabase
      .from('product_bundles')
      .delete()
      .eq('id', id);

    if (error) {
      throw error;
    }

    setProductBundles(prev =>
      prev.filter(bundle => bundle.id !== id)
    );

    await logAdminActivity(
      'meta_change',
      'Deleted Combo Deal',
      `Deleted bundle: ${target.name}`,
      id
    );
  } catch (err) {
    console.error(
      '[ShopContext] Error deleting bundle from Supabase:',
      err
    );

    showToast(
      'Failed to delete combo deal from database',
      'warning'
    );

    throw err;
  }
};
    

  // Categories & Details Management State. Cache or empty, never the bundled
  // DEFAULT_CATEGORIES: those carry slug ids that no product's category_id can
  // match, so they would render categories that are permanently empty.
  const [categories, setCategories] = useState<CategoryItem[]>(() =>
    readCachedList<CategoryItem>(CATALOG_CACHE_KEYS.categories)
  );

  // Terroir Regions & Logistics State
  const [regions, setRegions] = useState<TerroirRegion[]>(() =>
  readCachedList<TerroirRegion>(CATALOG_CACHE_KEYS.regions)
);

  
  /**
 * True once Supabase has successfully loaded CMS site content.
 *
 * Supabase is the authoritative source for CMS content. This flag prevents
 * bundled/default content from overwriting content already loaded from the
 * database.
 */
const cmsSupabaseAuthoritativeRef = useRef(false);

/**
 * True once Supabase has successfully loaded CMS custom blocks.
 *
 * CMS site content and custom blocks are stored separately, so they are
 * tracked independently. This prevents bundled/default blocks from
 * overwriting blocks loaded from Supabase.
 */
const cmsBlocksFromSupabaseRef = useRef(false);

// Supabase Catalog, Categories, Sellers, Products, and CMS Hydration
useEffect(() => {
  let isMounted = true;

  const hydrateFromSupabase = async () => {
    // These reads are independent. A failure in one area should not prevent
    // the remaining catalog or CMS data from loading.
    const [
      categoriesRes,
      regionsRes,
      sellersRes,
      productsRes,
      blocksRes,
      contentRes
    ] = await Promise.allSettled([
      supabaseCatalogService.fetchCategories(),

      supabaseCatalogService.fetchRegions(),

      supabaseCatalogService.fetchSellers(),

      supabaseCatalogService.fetchProducts({
        isAdmin: isAdminUser,
        isSeller: isSellerUser,
        sellerId
      }),

      // Admins can load published and draft blocks.
      // Public users receive only blocks allowed by the public CMS service.
      isAdminUser
        ? supabaseCmsService.fetchAllCmsBlocks()
        : supabaseCmsService.fetchAllPublicCmsBlocks(),

      supabaseCmsService.fetchSiteContent()
    ]);

    // The individual result handlers continue below.
    // Do not add Firebase listeners or localStorage fallbacks here.
  };

  void hydrateFromSupabase();

  return () => {
    isMounted = false;
  };
}, [isAdminUser, isSellerUser, sellerId]);


    
    if (!isMounted) return;

const failures: string[] = [];

const valueOf = <T,>(
  res: PromiseSettledResult<T>,
  label: string
): T | undefined => {
  if (res.status === 'fulfilled') {
    return res.value;
  }

  console.error(
    `[ShopContext] Supabase hydration failed for ${label}:`,
    res.reason
  );

  failures.push(label);

  return undefined;
};

    
    const supabaseCategories = valueOf(
  categoriesRes,
  'categories'
);

const supabaseRegions = valueOf(
  regionsRes,
  'regions'
);

const supabaseSellers = valueOf(
  sellersRes,
  'sellers'
);

const supabaseProds = valueOf(
  productsRes,
  'products'
);

const supabaseBlocks = valueOf(
  blocksRes,
  'cms_custom_blocks'
);

const supabaseContent = valueOf(
  contentRes,
  'cms_site_content'
);

// `undefined` means the Supabase read failed, so keep the current UI state.
// A fulfilled empty array is valid and authoritative: it means the
// corresponding table currently contains no records.
if (supabaseCategories !== undefined) {
  setCategories(supabaseCategories);
}

if (supabaseRegions !== undefined) {
  setRegions(supabaseRegions);
}

if (supabaseSellers !== undefined) {
  setSellers(supabaseSellers);
}

if (supabaseProds !== undefined) {
  setProducts(
    supabaseProds.map(ensureSellerItemCode)
  );
}
    
    // Catalogue status reflects the actual Supabase products read.
// A successful empty result is a valid empty catalogue.
// A failed read is an error and must not be presented as "no products".
if (productsRes.status === 'rejected') {
  setCatalogStatus('error');
  setCatalogError(
    productsRes.reason instanceof Error
      ? productsRes.reason.message
      : String(productsRes.reason)
  );
} else {
  setCatalogStatus('ready');
  setCatalogError(null);
}

// CMS: cms_site_content and cms_custom_blocks are separate Supabase
// sources, but both are authoritative once their respective reads succeed.
//
// `undefined` means the read failed.
// An empty result is valid and authoritative.

if (supabaseContent !== undefined) {
  cmsSupabaseAuthoritativeRef.current = true;
}

if (supabaseBlocks !== undefined) {
  cmsBlocksFromSupabaseRef.current = true;
}

if (
  supabaseContent !== undefined ||
  supabaseBlocks !== undefined
) {
  setSiteContent(prev => {
    const next: SiteContent = supabaseContent
      ? {
          ...prev,
          ...supabaseContent,
          visibility: {
            ...DEFAULT_SITE_CONTENT.visibility,
            ...(prev.visibility || {}),
            ...(supabaseContent.visibility || {}),
          },
        }
      : prev;

    return next;
  });
}

    
          // Apply CMS custom blocks whenever the Supabase read succeeded.
      // An empty array is a valid result and means there are currently no
      // published/available blocks. `undefined` means the read failed, so
      // the existing blocks are preserved.
      if (supabaseBlocks !== undefined) {
        setSiteContent(prev => ({
          ...prev,
          customBlocks: supabaseBlocks,
        }));
      }

      if (failures.length > 0) {
        showToast(
          language === 'ar'
            ? `تعذر تحميل بعض البيانات من الخادم (${failures.join('، ')}).`
            : `Could not load some data from the server (${failures.join(', ')}).`,
          'error'
        );
      }
    };

    void hydrateFromSupabase();

    return () => {
      isMounted = false;
    };
  }, [isAdminUser, isSellerUser, sellerId]);
    
  /**
 * Refresh categories from Supabase.
 *
 * Supabase is the authoritative source for categories.
 * An empty array is a valid result and must be applied.
 * A failed request leaves the current category state unchanged.
 *
 * Realtime events trigger a fresh read so Supabase RLS determines exactly
 * which categories the current user is allowed to see.
 */
useEffect(() => {
  let isMounted = true;
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;

  const refreshCategories = async () => {
    try {
      const fresh =
        await supabaseCatalogService.fetchCategories();

      if (!isMounted) return;

      // Empty is a valid database result.
      setCategories(fresh);
    } catch (err) {
      if (!isMounted) return;

      console.error(
        '[ShopContext] Supabase category refresh failed:',
        err
      );
    }
  };

    
        const scheduleRefresh = () => {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }

      refreshTimer = setTimeout(() => {
        void refreshCategories();
      }, 400);
    };

    const channel = supabase
      .channel('yalla-categories')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'categories',
        },
        scheduleRefresh
      )
      .subscribe((status) => {
        if (
          status === 'CHANNEL_ERROR' ||
          status === 'TIMED_OUT'
        ) {
          console.error(
            `[ShopContext] Supabase realtime channel for categories: ${status}`
          );
        }
      });

    return () => {
      isMounted = false;

      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }

      void supabase.removeChannel(channel);
    };
  }, []);

  // Refresh regions from Supabase when the regions table changes.
  useEffect(() => {
    let isMounted = true;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const refreshRegions = async () => {
      try {
        const rows =
          await supabaseCatalogService.fetchRegions();

        if (!isMounted) return;

        // An empty array is a valid Supabase result and must be applied.
        setRegions(rows);
      } catch (err) {
        if (!isMounted) return;

        console.error(
          '[ShopContext] Supabase region refresh failed:',
          err
        );
      }
    };

    const scheduleRefresh = () => {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }

      refreshTimer = setTimeout(() => {
        void refreshRegions();
      }, 400);
    };

    const channel = supabase
      .channel('yalla-regions')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'regions',
        },
        scheduleRefresh
      )
      .subscribe((status) => {
        if (
          status === 'CHANNEL_ERROR' ||
          status === 'TIMED_OUT'
        ) {
          console.error(
            `[ShopContext] Supabase realtime channel for regions: ${status}`
          );
        }
      });

    return () => {
      isMounted = false;

      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }

      void supabase.removeChannel(channel);
    };
  }, []);
      
  const addCategory = async (
  catData: Omit<CategoryItem, 'id'> & { id?: string }
) => {
  // categories.id is UUID. Preserve the old readable identifier in
  // legacy_id instead of using it as the primary key.
  const slug =
    catData.id?.trim() ||
    catData.nameEn
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') ||
    '';

  if (
    slug &&
    categories.some(
      category =>
        category.legacyId === slug ||
        category.id === slug
    )
  ) {
    throw new Error(
      `A category with the ID "${slug}" already exists.`
    );
  }

  const newCategory: CategoryItem = {
    ...catData,
    id:
      catData.id && isUuid(catData.id)
        ? catData.id
        : generateUuidV4(),
    legacyId: slug || undefined,
    subcategories: catData.subcategories || [],
    arabicKeywords: catData.arabicKeywords || [],
    englishKeywords: catData.englishKeywords || [],
    isPublished: catData.isPublished ?? true,
    displayOrder:
      catData.displayOrder ?? categories.length + 1
  };

  try {
    // Supabase is authoritative.
    await supabaseCatalogService.upsertCategory(
      newCategory
    );

    // Update local state only after the database write succeeds.
    setCategories(prev => [
      ...prev,
      newCategory
    ]);

    await logAdminActivity(
      'category_create',
      `Category "${newCategory.nameEn}" created`,
      `Added category "${newCategory.nameEn}" (${newCategory.nameAr}) with ID "${newCategory.id}", ${newCategory.subcategories.length} subcategories, and Arabic SEO tags.`,
      newCategory.id,
      null,
      newCategory
    );
  } catch (err: any) {
    console.error(
      '[ShopContext] addCategory Supabase write failed:',
      err
    );

    showToast(
      `Could not save category: ${
        err?.message || 'unknown error'
      }`,
      'error'
    );

    throw err;
  }
};
      
  const updateCategory = async (
  id: string,
  updates: Partial<CategoryItem>
) => {
  const existing = categories.find(
    category => category.id === id
  );

  if (!existing) {
    showToast('Category not found.', 'warning');
    return;
  }

  try {
    // Supabase is authoritative.
    // Only the changed fields are written so untouched
    // category fields are preserved.
    await supabaseCatalogService.upsertCategory({
      ...updates,
      id
    });

    // Update local state only after Supabase succeeds.
    setCategories(prev =>
      prev.map(category =>
        category.id === id
          ? { ...category, ...updates }
          : category
      )
    );

    await logAdminActivity(
      'category_update',
      `Category "${existing.nameEn}" updated`,
      `Modified attributes for category: ${Object.keys(updates).join(', ')}.`,
      id,
      existing,
      { ...existing, ...updates }
    );
  } catch (err: any) {
    console.error(
      '[ShopContext] updateCategory Supabase write failed:',
      err
    );

    showToast(
      `Could not save category: ${
        err?.message || 'unknown error'
      }`,
      'error'
    );

    throw err;
  }
};

const deleteCategory = async (
  id: string,
  reassignCategoryId?: string,
  deleteAttachedProducts?: boolean
) => {
  if (isAdminUser) {
    const authorized = await assertHighRiskAuthorization(
      authUser?.uid
    );

    if (!authorized) {
      showToast(
        'High-risk action cancelled or verification expired.',
        'error'
      );
      throw new Error('High-risk authorization failed');
    }
  }

  const target = categories.find(
    category => category.id === id
  );

  if (!target) {
    showToast('Category not found.', 'warning');
    return;
  }

  /*
   * Product.category is the value exposed by the compatibility
   * layer. Use it only to identify products belonging to this
   * category in the current ShopContext state.
   */
  const affectedProducts = products.filter(
    product => product.category === id
  );

  const shouldDeleteProducts =
    deleteAttachedProducts === true ||
    reassignCategoryId === '__delete_products__';

  /*
   * Do not allow an accidental category deletion when products
   * are still attached and the caller has not explicitly chosen
   * what to do with them.
   */
  if (
    affectedProducts.length > 0 &&
    !reassignCategoryId &&
    !shouldDeleteProducts
  ) {
    throw new Error(
      `${affectedProducts.length} product(s) are in this category. Choose an action for the attached products.`
    );
  }

  /*
   * A category cannot be reassigned to itself.
   */
  if (
    reassignCategoryId &&
    reassignCategoryId !== '__delete_products__' &&
    reassignCategoryId === id
  ) {
    throw new Error(
      'Products cannot be reassigned to the category being deleted.'
    );
  }

  /*
   * Validate the destination category before making any
   * database changes.
   */
  let destinationCategory: CategoryItem | undefined;

  if (
    reassignCategoryId &&
    reassignCategoryId !== '__delete_products__'
  ) {
    destinationCategory = categories.find(
      category => category.id === reassignCategoryId
    );

    if (!destinationCategory) {
      throw new Error(
        'The selected reassignment category was not found.'
      );
    }
  }

  const previousCategories = [...categories];
  const previousProducts = [...products];

  try {
    /*
     * IMPORTANT:
     * Product/category relationships are stored in Supabase.
     * Handle attached products before deleting the category.
     */
    if (affectedProducts.length > 0) {
      if (shouldDeleteProducts) {
        for (const product of affectedProducts) {
          await supabaseCatalogService.deleteProduct(
            product.id
          );
        }
      } else if (destinationCategory) {
        for (const product of affectedProducts) {
          await supabaseCatalogService.upsertProduct({
            ...product,
            category: destinationCategory.id
          });
        }
      }
    }

    /*
     * Delete the category from Supabase only after the attached
     * product action has completed successfully.
     */
    await supabaseCatalogService.deleteCategory(id);

    /*
     * Update local state only after all authoritative Supabase
     * operations have succeeded.
     */
    if (affectedProducts.length > 0) {
      if (shouldDeleteProducts) {
        const affectedIds = new Set(
          affectedProducts.map(product => product.id)
        );

        setProducts(prev =>
          prev.filter(product => !affectedIds.has(product.id))
        );
      } else if (destinationCategory) {
        setProducts(prev =>
          prev.map(product =>
            product.category === id
              ? {
                  ...product,
                  category: destinationCategory!.id
                }
              : product
          )
        );
      }
    }

    setCategories(prev =>
      prev.filter(category => category.id !== id)
    );

    /*
     * Record the authoritative change for the admin activity
     * history, including enough information to understand what
     * happened.
     */
    await logAdminActivity(
      'category_delete',
      `Category "${target.nameEn}" deleted`,
      shouldDeleteProducts
        ? `Deleted category "${target.nameEn}" and ${affectedProducts.length} attached product(s).`
        : destinationCategory
          ? `Deleted category "${target.nameEn}" and reassigned ${affectedProducts.length} product(s) to "${destinationCategory.nameEn}".`
          : `Deleted category "${target.nameEn}".`,
      id,
      {
        category: target,
        affectedProductIds: affectedProducts.map(
          product => product.id
        )
      },
      null
    );
  } catch (err: any) {
    /*
     * Restore the in-memory state if any Supabase operation fails.
     * The database remains authoritative.
     */
    setCategories(previousCategories);
    setProducts(previousProducts);

    console.error(
      '[ShopContext] deleteCategory Supabase operation failed:',
      err
    );

    showToast(
      `Could not delete category: ${
        err?.message || 'unknown error'
      }`,
      'error'
    );

    throw err;
  }
};
    
    // Authoritative Supabase delete.
// Any attached products have already been handled above.
try {
  await supabaseCatalogService.deleteCategory(id);
} catch (supaErr: any) {
  setCategories(previousCategories);
  setProducts(previousProducts);

  console.error(
    '[ShopContext] deleteCategory Supabase delete failed:',
    supaErr
  );

  showToast(
    `Could not delete category: ${
      supaErr?.message || 'unknown error'
    }`,
    'error'
  );

  throw supaErr;
}

// Update local product state only after the Supabase
// category deletion has succeeded.
if (shouldDeleteProducts) {
  const affectedIds = new Set(
    affectedProducts.map(product => product.id)
  );

  const nextProducts = products.filter(
    product => !affectedIds.has(product.id)
  );

  setProducts(nextProducts);

  try {
    localStorage.setItem(
      CATALOG_CACHE_KEYS.products,
      JSON.stringify(nextProducts)
    );
  } catch {}
} else if (
  reassignCategoryId &&
  reassignCategoryId !== '__delete_products__'
) {
  const nextProducts = products.map(product =>
    product.category === id
      ? {
          ...product,
          category: reassignCategoryId
        }
      : product
  );

  setProducts(nextProducts);

  try {
    localStorage.setItem(
      CATALOG_CACHE_KEYS.products,
      JSON.stringify(nextProducts)
    );
  } catch {}
}

// Remove the category from the local state.
setCategories(prev =>
  prev.filter(category => category.id !== id)
);

await logAdminActivity(
  'category_delete',
  `Category "${target?.nameEn || id}" deleted`,
  shouldDeleteProducts
    ? `Removed category "${target?.nameEn || id}" and permanently deleted ${affectedProducts.length} attached product(s).`
    : reassignCategoryId &&
        reassignCategoryId !== '__delete_products__'
      ? `Removed category "${target?.nameEn || id}" and reassigned ${affectedProducts.length} attached product(s) to category "${reassignCategoryId}".`
      : `Removed category "${target?.nameEn || id}".`,
  id,
  {
    category: target,
    affectedProductIds: affectedProducts.map(
      product => product.id
    )
  },
  null
);
    
  const reorderCategories = async (newOrder: CategoryItem[]) => {
  const previousCategories = [...categories];

  const normalized = newOrder.map((category, index) => ({
    ...category,
    displayOrder: index + 1
  }));

  try {
    // Supabase is authoritative.
    // Persist each category's new display order.
    for (const category of normalized) {
      await supabaseCatalogService.upsertCategory({
        id: category.id,
        displayOrder: category.displayOrder
      });
    }

    // Update local state only after all Supabase writes succeed.
    setCategories(normalized);

    try {
      localStorage.setItem(
        CATALOG_CACHE_KEYS.categories,
        JSON.stringify(normalized)
      );
    } catch {}

    await logAdminActivity(
      'category_update',
      'Categories reordered',
      `Admin reordered ${normalized.length} categories.`,
      undefined,
      previousCategories,
      normalized
    );
  } catch (err: any) {
    // Restore previous state if any database write fails.
    setCategories(previousCategories);

    console.error(
      '[ShopContext] reorderCategories Supabase write failed:',
      err
    );

    showToast(
      `Could not reorder categories: ${
        err?.message || 'unknown error'
      }`,
      'error'
    );

    throw err;
  }
};

const reorderProducts = async (
  orderedProducts: Product[]
) => {
  const previousProducts = [...products];

  const orderMap = new Map<string, number>();

  orderedProducts.forEach((product, index) => {
    orderMap.set(product.id, index + 1);
  });

  const updatedProducts = [...products]
    .map(product => {
      const newOrder = orderMap.get(product.id);

      return newOrder !== undefined
        ? {
            ...product,
            displayOrder: newOrder
          }
        : product;
    })
    .sort((a, b) => {
      const orderA = a.displayOrder ?? 9999;
      const orderB = b.displayOrder ?? 9999;

      return orderA - orderB;
    });

  try {
    // Supabase is authoritative.
    // Persist the new display order for each affected product.
    for (const product of orderedProducts) {
      const displayOrder = orderMap.get(product.id);

      if (displayOrder === undefined) continue;

      await supabaseCatalogService.upsertProduct({
        id: product.id,
        displayOrder
      });
    }

    // Update local state only after all Supabase writes succeed.
    setProducts(updatedProducts);

    try {
      localStorage.setItem(
        CATALOG_CACHE_KEYS.products,
        JSON.stringify(updatedProducts)
      );
    } catch {}

    await logAdminActivity(
      'product_update',
      'Products reordered',
      `Admin reordered ${orderedProducts.length} products.`,
      undefined,
      previousProducts,
      updatedProducts
    );
  } catch (err: any) {
    // Restore previous state if any database write fails.
    setProducts(previousProducts);

    console.error(
      '[ShopContext] reorderProducts Supabase write failed:',
      err
    );

    showToast(
      `Could not reorder products: ${
        err?.message || 'unknown error'
      }`,
      'error'
    );

    throw err;
  }
};
    
  const updateRegion = async (
  id: string,
  updates: Partial<TerroirRegion>
) => {
  const existing = regions.find(region => region.id === id);

  if (!existing) {
    showToast('Region not found.', 'warning');
    return;
  }

  try {
    await supabaseCatalogService.upsertRegion({
      ...updates,
      id
    });

    setRegions(prev =>
      prev.map(region =>
        region.id === id
          ? { ...region, ...updates }
          : region
      )
    );

    await logAdminActivity(
      'region_update',
      `Region "${existing.nameEn}" updated`,
      `Updated regional logistics and delivery fees.`,
      id,
      existing,
      { ...existing, ...updates }
    );
  } catch (err: any) {
    console.error(
      '[ShopContext] updateRegion Supabase write failed:',
      err
    );

    showToast(
      `Could not save region: ${
        err?.message || 'unknown error'
      }`,
      'error'
    );

    throw err;
  }
};

const addRegion = async (newReg: TerroirRegion) => {
  const existing = regions.find(
    region => region.id === newReg.id
  );

  if (existing) {
    throw new Error(
      `A region with the ID "${newReg.id}" already exists.`
    );
  }

  try {
    await supabaseCatalogService.upsertRegion(newReg);

    setRegions(prev => [
      ...prev,
      newReg
    ]);

    await logAdminActivity(
      'region_update',
      `Region zone "${newReg.nameEn}" added`,
      `Added delivery zone with base fee $${newReg.baseDeliveryUSD}.`,
      newReg.id,
      null,
      newReg
    );
  } catch (err: any) {
    console.error(
      '[ShopContext] addRegion Supabase write failed:',
      err
    );

    showToast(
      `Could not save region: ${
        err?.message || 'unknown error'
      }`,
      'error'
    );

    throw err;
  }
};

const deleteRegion = async (id: string) => {
  const target = regions.find(
    region => region.id === id
  );

  if (!target) {
    showToast('Region not found.', 'warning');
    return;
  }

  try {
    await supabaseCatalogService.deleteRegion(id);

    setRegions(prev =>
      prev.filter(region => region.id !== id)
    );

    await logAdminActivity(
      'region_update',
      `Region zone "${target.nameEn}" deleted`,
      `Removed shipping zone ${id}.`,
      id,
      target,
      null
    );
  } catch (err: any) {
    console.error(
      '[ShopContext] deleteRegion Supabase delete failed:',
      err
    );

    showToast(
      `Could not delete region: ${
        err?.message || 'unknown error'
      }`,
      'error'
    );

    throw err;
  }
};


// ============================================================
// Sellers Management State & Sync
// ============================================================

// Cache only. Supabase remains the authoritative seller source.
const [sellers, setSellers] = useState<Seller[]>(() =>
  readCachedList<Seller>(
    CATALOG_CACHE_KEYS.sellers
  ).map((seller, index) =>
    ensureSellerCode(seller, index)
  )
);

useEffect(() => {
  try {
    localStorage.setItem(
      CATALOG_CACHE_KEYS.sellers,
      JSON.stringify(sellers)
    );
  } catch {}
});

/**
 * Sellers are authoritative in Supabase.
 *
 * There is intentionally no realtime subscription here because
 * the current Supabase realtime publication does not include
 * the sellers table.
 */
const refreshSellersFromSupabase = useCallback(async () => {
  try {
    const fresh =
      await supabaseCatalogService.fetchSellers();

    const normalized = fresh.map(
      (seller, index) =>
        ensureSellerCode(seller, index)
    );

    setSellers(normalized);

    try {
      localStorage.setItem(
        CATALOG_CACHE_KEYS.sellers,
        JSON.stringify(normalized)
      );
    } catch {}
  } catch (err) {
    console.error(
      '[ShopContext] Seller refresh failed:',
      err
    );

    throw err;
  }
}, []);

const addSeller = async (
  sellerData: Omit<
    Seller,
    'id' | 'createdAt' | 'updatedAt'
  > & {
    id?: string;
    sellerCode?: string;
  }
) => {
  // sellers.id is UUID.
  // The human-readable workshop slug is stored in legacyId.
  const slug =
    sellerData.id?.trim() ||
    sellerData.nameEn
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') ||
    '';

  if (
    slug &&
    sellers.some(
      seller =>
        seller.legacyId === slug ||
        seller.id === slug
    )
  ) {
    throw new Error(
      `A seller with the ID "${slug}" already exists.`
    );
  }

  const sellerCode =
    sellerData.sellerCode?.trim() ||
    `SLR-${secureRandomInt(100, 1000)}`;

  const now = new Date().toISOString();

  const newSeller: Seller = {
    ...sellerData,
    id:
      sellerData.id && isUuid(sellerData.id)
        ? sellerData.id
        : generateUuidV4(),
    legacyId: slug || undefined,
    sellerCode,
    isActive:
      sellerData.isActive ?? true,
    createdAt: now,
    updatedAt: now
  };

  try {
    await supabaseCatalogService.upsertSeller(
      newSeller
    );

    setSellers(prev => [
      ...prev,
      newSeller
    ]);

    await refreshSellersFromSupabase();

    await logAdminActivity(
      'seller_create',
      `Seller "${newSeller.nameEn}" added`,
      `Added seller "${newSeller.nameEn}" with seller code "${newSeller.sellerCode}".`,
      newSeller.id,
      null,
      newSeller
    );
  } catch (err: any) {
    console.error(
      '[ShopContext] addSeller Supabase write failed:',
      err
    );

    showToast(
      `Could not save seller: ${
        err?.message || 'unknown error'
      }`,
      'error'
    );

    throw err;
  }
};
      // Supabase is authoritative. The local state is updated only
    // after the database write succeeds.
    try {
      await supabaseCatalogService.upsertSeller(newSeller);

      await refreshSellersFromSupabase();

      await logAdminActivity(
        'meta_change',
        `Seller "${newSeller.nameEn}" added`,
        `Created seller "${newSeller.nameEn}" with seller code "${newSeller.sellerCode}" and ID "${newSeller.id}".`,
        newSeller.id,
        null,
        newSeller
      );
    } catch (err: any) {
      setSellers(previous);

      console.error(
        '[ShopContext] addSeller Supabase write failed:',
        err
      );

      showToast(
        `Could not save seller: ${
          err?.message || 'unknown error'
        }`,
        'error'
      );

      throw err;
    }
  };

  const updateSeller = async (
    id: string,
    updates: Partial<Seller>
  ) => {
    const existing = sellers.find(
      seller => seller.id === id
    );

    if (!existing) {
      showToast('Seller not found.', 'warning');
      return;
    }

    const updatedSeller: Seller = {
      ...existing,
      ...updates,
      id,
      updatedAt: new Date().toISOString()
    };

    try {
      // Only the changed fields are written to Supabase.
      // This prevents an edit to one field from clearing
      // unrelated seller information.
      await supabaseCatalogService.upsertSeller({
        ...updates,
        id,
        updatedAt: updatedSeller.updatedAt
      });

      // Refresh from Supabase so the UI reflects the actual
      // database representation rather than assuming the write.
      await refreshSellersFromSupabase();

      await logAdminActivity(
        'meta_change',
        `Seller "${existing.nameEn}" updated`,
        `Updated seller attributes: ${Object.keys(updates).join(', ')}.`,
        id,
        existing,
        updatedSeller
      );
    } catch (err: any) {
      console.error(
        '[ShopContext] updateSeller Supabase write failed:',
        err
      );

      showToast(
        `Could not save seller: ${
          err?.message || 'unknown error'
        }`,
        'error'
      );

      throw err;
    }
  };
      
  const toggleSellerActive = async (
  sellerId: string,
  isActive: boolean
) => {
  const existing = sellers.find(
    seller => seller.id === sellerId
  );

  if (!existing) {
    showToast('Seller not found.', 'warning');
    return;
  }

  const updatedSeller: Seller = {
    ...existing,
    isActive,
    updatedAt: new Date().toISOString()
  };

  try {
    // Supabase is authoritative.
    await supabaseCatalogService.upsertSeller({
      id: sellerId,
      isActive,
      updatedAt: updatedSeller.updatedAt
    });

    // Refresh from Supabase so local state reflects the
    // actual database representation.
    await refreshSellersFromSupabase();

    await logAdminActivity(
      'meta_change',
      `Seller "${existing.nameEn}" active status changed to ${isActive}`,
      isActive
        ? `Seller "${existing.nameEn}" was activated.`
        : `Seller "${existing.nameEn}" was deactivated.`,
      sellerId,
      existing,
      updatedSeller
    );
  } catch (err: any) {
    console.error(
      '[ShopContext] toggleSellerActive Supabase write failed:',
      err
    );

    showToast(
      `Could not update seller status: ${
        err?.message || 'unknown error'
      }`,
      'error'
    );

    throw err;
  }
};

const deleteSeller = async (
  id: string,
  reassignSellerId?: string
) => {
  const target = sellers.find(
    seller => seller.id === id
  );

  if (!target) {
    showToast('Seller not found.', 'warning');
    return;
  }

  if (
    reassignSellerId &&
    reassignSellerId === id
  ) {
    throw new Error(
      'Products cannot be reassigned to the seller being deleted.'
    );
  }

  const affectedProducts = products.filter(
    product => product.sellerId === id
  );

  /*
   * Do not allow deletion while products are still attached
   * unless a destination seller has explicitly been selected.
   */
  if (
    affectedProducts.length > 0 &&
    !reassignSellerId
  ) {
    throw new Error(
      `${affectedProducts.length} product(s) belong to this seller. Choose a seller to move them to.`
    );
  }

  let destinationSeller: Seller | undefined;

  if (reassignSellerId) {
    destinationSeller = sellers.find(
      seller => seller.id === reassignSellerId
    );

    if (!destinationSeller) {
      throw new Error(
        'The selected reassignment seller was not found.'
      );
    }

    if (!destinationSeller.isActive) {
      throw new Error(
        'Products cannot be reassigned to an inactive seller.'
      );
    }
  }

  const previousSellers = [...sellers];
  const previousProducts = [...products];

  try {
    /*
     * Reassign the products in Supabase before deleting
     * the seller. This prevents the seller deletion from
     * leaving the products pointing to a non-existent seller.
     */
    if (
      destinationSeller &&
      affectedProducts.length > 0
    ) {
      for (const product of affectedProducts) {
        await supabaseCatalogService.upsertProduct({
          id: product.id,
          sellerId: destinationSeller.id
        });
      }
    }

    /*
     * Delete the seller only after all affected products
     * have been successfully reassigned.
     */
    await supabaseCatalogService.deleteSeller(id);

    /*
     * Update local product state after Supabase succeeds.
     */
    if (
      destinationSeller &&
      affectedProducts.length > 0
    ) {
      const affectedIds = new Set(
        affectedProducts.map(product => product.id)
      );

      setProducts(prev =>
        prev.map(product =>
          affectedIds.has(product.id)
            ? {
                ...product,
                sellerId: destinationSeller!.id,
                seller: destinationSeller!.nameEn,
                arabicSeller:
                  destinationSeller!.nameAr
              }
            : product
        )
      );
    }

    /*
     * Remove the seller locally only after the database
     * deletion succeeds.
     */
    setSellers(prev =>
      prev.filter(seller => seller.id !== id)
    );

    /*
     * Refresh sellers from Supabase so the local seller
     * cache exactly matches the authoritative database.
     */
    await refreshSellersFromSupabase();

    await logAdminActivity(
      'meta_change',
      `Seller "${target.nameEn}" deleted`,
      destinationSeller
        ? `Deleted seller "${target.nameEn}" and reassigned ${affectedProducts.length} product(s) to "${destinationSeller.nameEn}".`
        : `Deleted seller "${target.nameEn}".`,
      id,
      {
        seller: target,
        affectedProductIds: affectedProducts.map(
          product => product.id
        )
      },
      null
    );
  } catch (err: any) {
    /*
     * Restore local state if any Supabase operation fails.
     */
    setSellers(previousSellers);
    setProducts(previousProducts);

    console.error(
      '[ShopContext] deleteSeller Supabase operation failed:',
      err
    );

    showToast(
      `Could not delete seller: ${
        err?.message || 'unknown error'
      }`,
      'error'
    );

    throw err;
  }
};
      
// 1. Validate duplicate Product Number (SKU & Seller Item Code)
const normSku = sku.toLowerCase().trim();
const normItemCode = sellerItemCode.toLowerCase().trim();

const sellerKey = (
  resolvedSeller?.sellerId ||
  resolvedSeller?.sellerName ||
  ''
)
  .toLowerCase()
  .trim();

const sellerCodeKey = `${sellerKey}::${normItemCode}`;

// Prevent duplicate SKU inside the same CSV file.
if (seenSkusInFile.has(normSku)) {
  errors.push(
    `Row ${rowNum} ("${name}"): Duplicate SKU / Product ID "${sku}" appears multiple times in CSV import.`
  );
  return;
}

// Prevent duplicate Seller Item Code for the same seller
// inside the same CSV file.
if (seenItemCodesInFile.has(sellerCodeKey)) {
  errors.push(
    `Row ${rowNum} ("${name}"): Duplicate Seller Item Code "${sellerItemCode}" for seller "${resolvedSeller.sellerName}" appears multiple times in CSV import.`
  );
  return;
}

/*
 * Check the current in-memory catalog first.
 *
 * Supabase is authoritative, but the products state was already
 * hydrated from Supabase before the import. We therefore use it
 * to determine whether this CSV row is an INSERT or UPDATE.
 */
const existingProduct = products.find(
  product => product.id === sku
);

const isExistingSku = Boolean(existingProduct);

/*
 * Seller Item Code must be unique per seller.
 *
 * The helper checks the current catalog while allowing the same
 * product to retain its own Seller Item Code during an update.
 */
const dupCodeCheck = checkDuplicateProductNumber(
  sellerItemCode,
  isExistingSku ? sku : null,
  products,
  resolvedSeller.sellerId,
  resolvedSeller.sellerName
);

if (dupCodeCheck.isDuplicate) {
  errors.push(
    `Row ${rowNum} ("${name}"): Seller Item Code "${sellerItemCode}" is already assigned to existing product "${dupCodeCheck.conflictingProduct?.name}" for seller "${resolvedSeller.sellerName}".`
  );
  return;
}

const description = (
  row.description_en ||
  row.description ||
  'Imported artisanal product.'
)
  .toString()
  .trim();

const craftStory = (
  row.description_ar ||
  row.craftstory ||
  row.arabic_description ||
  'حرفية أصيلة.'
)
  .toString()
  .trim();

seenSkusInFile.add(normSku);
seenItemCodesInFile.add(sellerCodeKey);

const mainImage = (
  row.image_url ||
  row.image ||
  ''
)
  .toString()
  .trim();

const addlImagesRaw =
  row.additional_images ||
  row.images ||
  row.gallery;

const additionalImages = addlImagesRaw
  ? String(addlImagesRaw)
      .split(/[|,]/)
      .map((url: string) => url.trim())
      .filter(Boolean)
  : undefined;

const videoUrl =
  (
    row.video_url ||
    row.video ||
    ''
  )
    .toString()
    .trim() || undefined;

const addlVideosRaw =
  row.additional_videos ||
  row.videos;

const additionalVideos = addlVideosRaw
  ? String(addlVideosRaw)
      .split(/[|,]/)
      .map((video: string) => video.trim())
      .filter(Boolean)
  : undefined;

const nowIso = new Date().toISOString();

const importedProduct: Product = {
  /*
   * Existing SKU keeps its existing UUID.
   * New products use the CSV SKU as the compatibility ID
   * expected by the current import workflow.
   */
  id: sku,

  sellerItemCode,

  name,

  arabicName: (
    row.name_ar ||
    row.arabic_name ||
    name
  )
    .toString()
    .trim(),

  artisan: resolvedSeller.sellerName,

  seller: resolvedSeller.sellerName,

  arabicSeller:
    resolvedSeller.arabicSeller ||
    row.arabic_seller ||
    '',

  sellerId: resolvedSeller.sellerId,

  sellerActive: true,

  /*
   * Product.category is the compatibility-layer value.
   * The Supabase catalog service must map this to
   * products.category_id.
   */
  category: resolvedCategory.categoryId,

  priceUSD,

  originalPriceUSD:
    row.original_price_usd !== undefined &&
    row.original_price_usd !== ''
      ? parsePrice(row.original_price_usd)
      : undefined,

  stock: Math.floor(stock),

  image: mainImage,

  additionalImages:
    additionalImages &&
    additionalImages.length > 0
      ? additionalImages
      : undefined,

  videoUrl,

  additionalVideos:
    additionalVideos &&
    additionalVideos.length > 0
      ? additionalVideos
      : undefined,

  videos:
    additionalVideos &&
    additionalVideos.length > 0
      ? additionalVideos
      : videoUrl
        ? [videoUrl]
        : undefined,

  description,

  craftStory,

  tags: row.tags
    ? String(row.tags)
        .split(/[|,]/)
        .map((tag: string) => tag.trim())
        .filter(Boolean)
    : ['Artisanal'],

  /*
   * Do not overwrite existing rating/review information
   * during a CSV catalog import.
   */
  rating: existingProduct?.rating ?? 0,

  reviewsCount:
    existingProduct?.reviewsCount ?? 0,

  origin: (
    row.origin ||
    row.origin_terroir ||
    'Lebanon'
  )
    .toString()
    .trim(),

  weightOrVolume: (
    row.weight_or_volume ||
    row.weight ||
    row.volume ||
    ''
  )
    .toString()
    .trim() || undefined,

  isPublished,

  /*
   * Preserve original creation date on updates.
   */
  createdAt:
    existingProduct?.createdAt ||
    nowIso,

  updatedAt: nowIso
};

validRows.push({
  sku,
  product: importedProduct,
  isUpdate: isExistingSku
});
});

if (validRows.length === 0) {
  resolve({
    created,
    updated,
    errors
  });
  return;
}

/*
 * ============================================================
 * SUPABASE AUTHORITATIVE WRITE
 * ============================================================
 *
 * Do NOT write the imported products directly to localStorage
 * before Supabase succeeds.
 *
 * Each product is written through the Supabase catalog service.
 */
const successfullyWritten: typeof validRows = [];

for (const item of validRows) {
  try {
    await supabaseCatalogService.upsertProduct(
      item.product
    );

    successfullyWritten.push(item);
  } catch (err: any) {
    errors.push(
      `Product "${item.product.name}" (${item.sku}) could not be saved: ${
        err?.message || 'unknown Supabase error'
      }`
    );

    console.error(
      '[ShopContext] CSV product import failed:',
      {
        sku: item.sku,
        error: err
      }
    );
  }
}

/*
 * If every database write failed, do not modify the local
 * catalog.
 */
if (successfullyWritten.length === 0) {
  resolve({
    created: 0,
    updated: 0,
    errors
  });
  return;
}

/*
 * Update counters only for products that were actually
 * persisted to Supabase.
 */
successfullyWritten.forEach(item => {
  if (item.isUpdate) {
    updated++;
  } else {
    created++;
  }
});

/*
 * Update React state from the successfully persisted products.
 */
setProducts(prevProducts => {
  const nextMap = new Map<string, Product>();

  prevProducts.forEach(product => {
    nextMap.set(product.id, product);
  });

  successfullyWritten.forEach(item => {
    nextMap.set(
      item.product.id,
      item.product
    );
  });

  const merged = Array.from(
    nextMap.values()
  );

  /*
   * LocalStorage is only a cache.
   * Supabase remains the source of truth.
   */
  try {
    localStorage.setItem(
      CATALOG_CACHE_KEYS.products,
      JSON.stringify(merged)
    );
  } catch {}

  return merged;
});

/*
 * Build activity snapshots only from products that were
 * actually written successfully.
 */
const previousSnapshots = successfullyWritten
  .map(item =>
    products.find(
      product => product.id === item.sku
    )
  )
  .filter(
    (product): product is Product =>
      Boolean(product)
  );

const updatedSnapshots =
  successfullyWritten.map(
    item => item.product
  );

await logAdminActivity(
  'product_bulk_update',
  `CSV Bulk Import (${successfullyWritten.length} products)`,
  `Created: ${created}, Updated: ${updated}, Errors: ${errors.length}`,
  'bulk_csv_import',
  previousSnapshots,
  updatedSnapshots
);

resolve({
  created,
  updated,
  errors
});
      
  // ============================================================
// CMS: Local cache + Preview + Supabase-authoritative writes
// ============================================================

/*
 * LocalStorage is a cache only.
 *
 * Supabase (`cms_site_content` + `cms_custom_blocks`) is the
 * authoritative CMS source. CMS preview drafts are deliberately
 * kept separate from the published/local cache.
 */
useEffect(() => {
  try {
    const isCmsPreview =
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get(
        'cmsPreview'
      ) === '1';

    if (isCmsPreview) return;

    localStorage.setItem(
      'yallalb_site_content',
      JSON.stringify(siteContent)
    );
  } catch (err) {
    console.warn(
      '[ShopContext] Failed to persist CMS cache:',
      err
    );
  }
}, [siteContent]);

/*
 * Live CMS preview updates.
 *
 * The preview window can receive draft content without changing
 * the published Supabase content.
 */
useEffect(() => {
  if (typeof window === 'undefined') return;

  const isCmsPreview =
    new URLSearchParams(window.location.search).get(
      'cmsPreview'
    ) === '1';

  if (!isCmsPreview) return;

  const handleMessage = (event: MessageEvent) => {
    if (
      event.data?.type === 'CMS_DRAFT_UPDATE' &&
      event.data?.payload
    ) {
      setSiteContent(prev => ({
        ...prev,
        ...event.data.payload
      }));
    } else if (
      event.data?.type === 'CMS_LANG_UPDATE' &&
      event.data?.payload
    ) {
      setLanguage(event.data.payload);
    }
  };

  window.addEventListener(
    'message',
    handleMessage
  );

  return () => {
    window.removeEventListener(
      'message',
      handleMessage
    );
  };
}, []);

/*
 * CMS preview draft hydration.
 *
 * Preview drafts are temporary and must never overwrite the
 * authoritative published CMS data.
 */
useEffect(() => {
  if (typeof window === 'undefined') return;

  const isCmsPreview =
    new URLSearchParams(window.location.search).get(
      'cmsPreview'
    ) === '1';

  if (!isCmsPreview) return;

  try {
    const draft =
      sessionStorage.getItem(
        'yalla_cms_preview'
      );

    if (!draft) return;

    const parsedDraft = JSON.parse(draft);

    setSiteContent(prev => ({
      ...prev,
      ...parsedDraft
    }));
  } catch (err) {
    console.error(
      '[ShopContext] Could not read CMS preview draft:',
      err
    );
  }
}, []);

/*
 * CMS realtime synchronization.
 *
 * cms_custom_blocks is synchronized through Supabase realtime.
 * cms_site_content is refreshed through the existing hydration
 * and CMS service logic.
 */
useEffect(() => {
  let isMounted = true;
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;

  const refreshCmsBlocks = async () => {
    try {
      const blocks =
        isAdminUser
          ? await supabaseCmsService.fetchAllCmsBlocks()
          : await supabaseCmsService.fetchAllPublicCmsBlocks();

      if (!isMounted) return;

      cmsBlocksFromSupabaseRef.current = true;

      setSiteContent(prev => ({
        ...prev,
        customBlocks: blocks
      }));
    } catch (err) {
      if (!isMounted) return;

      console.error(
        '[ShopContext] CMS block realtime refresh failed:',
        err
      );
    }
  };

  const scheduleRefresh = () => {
    if (refreshTimer) {
      clearTimeout(refreshTimer);
    }

    refreshTimer = setTimeout(() => {
      void refreshCmsBlocks();
    }, 400);
  };

  const channel = supabase
    .channel('yalla-cms-custom-blocks')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'cms_custom_blocks'
      },
      scheduleRefresh
    )
    .subscribe(status => {
      if (
        status === 'CHANNEL_ERROR' ||
        status === 'TIMED_OUT'
      ) {
        console.error(
          `[ShopContext] Supabase CMS realtime channel: ${status}`
        );
      }
    });

  return () => {
    isMounted = false;

    if (refreshTimer) {
      clearTimeout(refreshTimer);
    }

    void supabase.removeChannel(channel);
  };
}, [isAdminUser]);

const updateSiteContent = async (
  updates:
    | Partial<SiteContent>
    | ((prev: SiteContent) => SiteContent)
) => {
  /*
   * Calculate the next complete CMS state without modifying
   * React state yet.
   */
  const nextContent =
    typeof updates === 'function'
      ? updates(siteContent)
      : {
          ...siteContent,
          ...updates
        };

  /*
   * Calculate the changed CMS fields for the admin activity/
   * diagnostic log.
   */
  const diff = calculateObjectDiff(
    siteContent as any,
    nextContent as any
  );

  const modifiedKeys = Object.keys(diff);

  /*
   * Keep the existing logger calls only as diagnostics.
   * They do not represent persistence.
   */
  dbLogger.logFormInput({
    sourceComponent: 'ShopContext',
    actionName: 'updateSiteContent',
    targetPath: 'cms_site_content/main',
    summary:
      `CMS update initiated for ${modifiedKeys.length} section(s): ` +
      `[${modifiedKeys.join(', ') || 'full update'}]`,
    payload: nextContent,
    diff
  });

  /*
   * Remove undefined values before sending data to Supabase.
   */
  const sanitized =
    sanitizeDocumentData(nextContent);

  dbLogger.logSanitization({
    sourceComponent: 'ShopContext',
    actionName: 'sanitizeDbPayload',
    targetPath: 'cms_site_content/main',
    summary:
      'Removed undefined values from the CMS payload before the Supabase write.',
    cleanedPayload: sanitized
  });

  dbLogger.logDbWriteStart({
    operation: 'upsert',
    targetPath: 'cms_site_content/main',
    sourceComponent: 'ShopContext',
    actionName: 'upsert(cms_site_content/main)',
    summary:
      'Persisting updated CMS content to Supabase.',
    payload: sanitized
  });

  try {
    /*
     * --------------------------------------------------------
     * 1. Synchronize custom blocks
     * --------------------------------------------------------
     *
     * Blocks are stored in cms_custom_blocks, not inside the
     * cms_site_content JSONB document.
     */
    const nextBlocks =
      (nextContent.customBlocks || []) as CMSCustomBlock[];

    const currentBlocks =
      (siteContent.customBlocks || []) as CMSCustomBlock[];

    const syncedBlocks =
      await supabaseCmsService.syncCustomBlocks(
        currentBlocks,
        nextBlocks
      );

    /*
     * An empty block array is also authoritative.
     * Do NOT use `length > 0` as the success condition.
     */
    cmsBlocksFromSupabaseRef.current = true;

    /*
     * --------------------------------------------------------
     * 2. Save site-level CMS content
     * --------------------------------------------------------
     *
     * saveSiteContent is responsible for storing the
     * cms_site_content row. Custom blocks remain in their
     * dedicated table.
     */
    const contentForDatabase = {
      ...sanitized,
      customBlocks: undefined
    };

    const savedContent =
      await supabaseCmsService.saveSiteContent(
        contentForDatabase as SiteContent
      );

    cmsSupabaseAuthoritativeRef.current = true;

    /*
     * --------------------------------------------------------
     * 3. Update React state only after Supabase succeeds
     * --------------------------------------------------------
     *
     * Re-attach the synchronized blocks because they live in
     * cms_custom_blocks rather than cms_site_content.
     */
    const authoritativeContent: SiteContent = {
      ...sanitized,
      ...(savedContent || {}),
      customBlocks: syncedBlocks
    };

    setSiteContent(authoritativeContent);

    /*
     * LocalStorage is only a performance/offline cache.
     * It is never treated as the CMS source of truth.
     */
    try {
      localStorage.setItem(
        'yallalb_site_content',
        JSON.stringify(authoritativeContent)
      );
    } catch (localErr) {
      console.warn(
        '[ShopContext] Failed to persist CMS cache:',
        localErr
      );
    }

    /*
     * Record the successful CMS change.
     */
    await logAdminActivity(
      'cms_update',
      'Site content updated',
      `Updated CMS sections: ${
        modifiedKeys.join(', ') || 'full update'
      }. Custom blocks synchronized: ${
        syncedBlocks.length
      }.`,
      'cms_site_content/main',
      siteContent,
      authoritativeContent
    );
  } catch (err: any) {
    /*
     * IMPORTANT:
     * Do not update React state or claim the CMS was saved when
     * Supabase rejected the operation.
     */
    console.error(
      '[ShopContext] Failed to save CMS content to Supabase:',
      err
    );

    showToast(
      language === 'ar'
        ? `تعذر حفظ محتوى الموقع: ${
            err?.message || 'خطأ غير معروف'
          }`
        : `Could not save site content: ${
            err?.message || 'unknown error'
          }`,
      'error'
    );

    throw err;
  }
};
    
    const isMetaChange =
      modifiedKeys.includes('seo') ||
      Object.keys(diff).some(key =>
        key.startsWith('seo.')
      );

    if (isMetaChange) {
      await logAdminActivity(
        'meta_change',
        'SEO Meta Tags updated',
        `Modified global page title or description for search engines: [${modifiedKeys.join(', ')}].`,
        'cms_site_content/main',
        siteContent,
        nextContent
      );
    } else {
      await logAdminActivity(
        'cms_update',
        'Site content updated',
        `Published updates to sections: [${modifiedKeys.join(', ') || 'none'}].`,
        'cms_site_content/main',
        siteContent,
        nextContent
      );
    }
  };

  const toggleSectionVisibility = async (
    sectionKey: keyof SectionVisibilityConfig
  ) => {
    const currentVal =
      siteContent.visibility?.[sectionKey] ?? true;

    const nextVal = !currentVal;

    await updateSiteContent(prev => ({
      ...prev,
      visibility: {
        ...(prev.visibility ||
          DEFAULT_SITE_CONTENT.visibility),
        [sectionKey]: nextVal
      }
    }));

    showToast(
      `Section "${String(sectionKey)}" is now ${
        nextVal
          ? 'VISIBLE (Published)'
          : 'HIDDEN'
      }`,
      'info'
    );
  };

  // ============================================================
  // CMS Custom Blocks
  // ============================================================

  const addCustomBlock = async (
    newBlockData: Omit<CMSCustomBlock, 'id'>
  ) => {
    const newBlock: CMSCustomBlock = {
      ...newBlockData,
      id: generateUuidV4()
    };

    try {
      const saved =
        await supabaseCmsService.upsertCustomBlock(
          newBlock
        );

      setSiteContent(prev => ({
        ...prev,
        customBlocks: [
          ...(prev.customBlocks || []),
          saved
        ]
      }));

      cmsBlocksFromSupabaseRef.current = true;

      await logAdminActivity(
        'cms_update',
        `Custom block "${saved.title}" created`,
        `Created and published CMS custom block "${saved.title}".`,
        saved.id,
        null,
        saved
      );

      showToast(
        `Custom element "${saved.title}" created & published!`,
        'success'
      );
    } catch (err: any) {
      console.error(
        '[ShopContext] addCustomBlock failed:',
        err
      );

      showToast(
        language === 'ar'
          ? `تعذر إنشاء العنصر: ${
              err?.message || 'خطأ غير معروف'
            }`
          : `Could not create block: ${
              err?.message || 'unknown error'
            }`,
        'error'
      );

      throw err;
    }
  };

  const updateCustomBlock = async (
    id: string,
    updates: Partial<CMSCustomBlock>
  ) => {
    const existing = (
      siteContent.customBlocks || []
    ).find(block => block.id === id);

    if (!existing) {
      showToast(
        'Custom block not found.',
        'warning'
      );
      return;
    }

    try {
      const saved =
        await supabaseCmsService.upsertCustomBlock({
          ...existing,
          ...updates,
          id
        });

      setSiteContent(prev => ({
        ...prev,
        customBlocks: (
          prev.customBlocks || []
        ).map(block =>
          block.id === id
            ? saved
            : block
        )
      }));

      cmsBlocksFromSupabaseRef.current = true;

      await logAdminActivity(
        'cms_update',
        `Custom block "${existing.title}" updated`,
        `Updated custom block attributes: ${Object.keys(updates).join(', ')}.`,
        id,
        existing,
        saved
      );

      showToast(
        'Custom block updated and published!',
        'success'
      );
    } catch (err: any) {
      console.error(
        '[ShopContext] updateCustomBlock failed:',
        err
      );

      showToast(
        language === 'ar'
          ? `تعذر تحديث العنصر: ${
              err?.message || 'خطأ غير معروف'
            }`
          : `Could not update block: ${
              err?.message || 'unknown error'
            }`,
        'error'
      );

      throw err;
    }
  };

  const deleteCustomBlock = async (
    id: string
  ) => {
    const existing = (
      siteContent.customBlocks || []
    ).find(block => block.id === id);

    if (!existing) {
      showToast(
        'Custom block not found.',
        'warning'
      );
      return;
    }

    try {
      await supabaseCmsService.deleteCustomBlock(
        id
      );

      setSiteContent(prev => ({
        ...prev,
        customBlocks: (
          prev.customBlocks || []
        ).filter(
          block => block.id !== id
        )
      }));

      cmsBlocksFromSupabaseRef.current = true;

      await logAdminActivity(
        'cms_update',
        `Custom block "${existing.title}" deleted`,
        `Deleted custom block "${existing.title}" from the CMS.`,
        id,
        existing,
        null
      );

      showToast(
        'Custom block deleted from page',
        'warning'
      );
    } catch (err: any) {
      console.error(
        '[ShopContext] deleteCustomBlock failed:',
        err
      );

      showToast(
        language === 'ar'
          ? `تعذر حذف العنصر: ${
              err?.message || 'خطأ غير معروف'
            }`
          : `Could not delete block: ${
              err?.message || 'unknown error'
            }`,
        'error'
      );

      throw err;
    }
  };

  const toggleProductPublish = async (
    productId: string
  ) => {
    const targetProd = products.find(
      product => product.id === productId
    );

    if (!targetProd) {
      showToast(
        'Product not found.',
        'warning'
      );
      return;
    }

    const isCurrentlyPublished =
      targetProd.isPublished !== false;

    const nextState =
      !isCurrentlyPublished;

    await updateProduct(
      productId,
      {
        isPublished: nextState
      }
    );

    showToast(
      `Product "${targetProd.name}" is now ${
        nextState
          ? 'PUBLISHED'
          : 'HIDDEN'
      }`,
      'info'
    );
  };

  // ============================================================
  // Catalog Cache
  // ============================================================

  /*
   * LocalStorage is only a cache.
   * Supabase remains the authoritative product catalog.
   */
  useEffect(() => {
    try {
      localStorage.setItem(
        CATALOG_CACHE_KEYS.products,
        JSON.stringify(products)
      );
    } catch {}
  }, [products]);

  /*
   * Guests only:
   * authenticated carts are persisted to Supabase public.carts.
   */
  useEffect(() => {
    if (authUser) return;

    try {
      localStorage.setItem(
        GUEST_CART_KEY,
        JSON.stringify(storedCart)
      );
    } catch {}
  }, [storedCart, authUser]);

  /*
   * Guests only:
   * authenticated wishlists are persisted to Supabase.
   */
  useEffect(() => {
    if (authUser) return;

    try {
      localStorage.setItem(
        GUEST_WISHLIST_KEY,
        JSON.stringify(wishlist)
      );
    } catch {}
  }, [wishlist, authUser]);

  /*
   * Orders:
   *
   * Supabase is authoritative.
   * Only a customer's own orders are cached locally.
   * Admin-wide order lists are NEVER cached in localStorage.
   */
  useEffect(() => {
    try {
      if (
        !isAdminUser &&
        authUser &&
        orders.length > 0
      ) {
        localStorage.setItem(
          'yallalb_orders',
          JSON.stringify(orders)
        );
      } else if (!authUser) {
        localStorage.removeItem(
          'yallalb_orders'
        );
      }
    } catch {}
  }, [
    orders,
    isAdminUser,
    authUser
  ]);

  /*
   * User profile:
   * localStorage is only a UI cache.
   * Supabase profiles remain authoritative.
   */
  useEffect(() => {
    try {
      localStorage.setItem(
        'yallalb_user',
        JSON.stringify(user)
      );
    } catch {}
  }, [user]);
      /**
 * Live catalogue sync from Supabase Realtime.
 *
 * Supabase is the only catalogue source of truth.
 *
 * Realtime events are treated as invalidation signals only. We do not merge
 * raw Realtime rows directly into `products` because those rows do not contain
 * the joined seller/category/gallery data required by the UI.
 *
 * After an INSERT/UPDATE/DELETE on products or product_images, the catalogue
 * is re-read through the same audience-aware Supabase service used during
 * hydration.
 */
useEffect(() => {
  let isMounted = true;
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;

  const refreshCatalog = async () => {
    try {
      const fresh =
        await supabaseCatalogService.fetchProducts({
          isAdmin: isAdminUser,
          isSeller: isSellerUser,
          sellerId
        });

      if (!isMounted) return;

      const normalized =
        fresh.map(ensureSellerItemCode);

      // Supabase is authoritative, including an empty catalogue.
      setProducts(normalized);
      setHasMoreProducts(false);
      setCatalogStatus('ready');
      setCatalogError(null);

      try {
        localStorage.setItem(
          CATALOG_CACHE_KEYS.products,
          JSON.stringify(normalized)
        );
      } catch {}
    } catch (err) {
      if (!isMounted) return;

      console.error(
        '[ShopContext] Supabase realtime catalogue refresh failed:',
        err
      );

      setCatalogStatus('error');
      setCatalogError(
        err instanceof Error
          ? err.message
          : String(err)
      );
    } finally {
      if (isMounted) {
        setIsDbSyncing(false);
      }
    }
  };

  /*
   * Coalesce multiple row events into one catalogue refresh.
   *
   * A single admin operation can generate several events, especially when
   * product images are changed. Waiting 400ms prevents unnecessary duplicate
   * reads while still keeping the storefront effectively live.
   */
  const scheduleRefresh = () => {
    if (refreshTimer) {
      clearTimeout(refreshTimer);
    }

    refreshTimer = setTimeout(() => {
      void refreshCatalog();
    }, 400);
  };

  const channel = supabase
    .channel('yalla-products-catalog')

    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'products'
      },
      scheduleRefresh
    )

    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'product_images'
      },
      scheduleRefresh
    )

    .subscribe(status => {
      if (
        status === 'CHANNEL_ERROR' ||
        status === 'TIMED_OUT'
      ) {
        console.error(
          `[ShopContext] Supabase realtime channel for products: ${status}`
        );
      }
    });

  setIsDbSyncing(false);

  return () => {
    isMounted = false;

    if (refreshTimer) {
      clearTimeout(refreshTimer);
    }

    void supabase.removeChannel(channel);
  };
}, [
  isAdminUser,
  isSellerUser,
  sellerId
]);

/**
 * Catalogue pagination compatibility.
 *
 * The current Supabase catalogue service loads the complete audience-specific
 * catalogue. The existing storefront still calls this function for its
 * infinite-scroll compatibility, so keep it as a no-op.
 *
 * If pagination is introduced later, it should be implemented directly in
 * supabaseCatalogService using Supabase `.range()` rather than reintroducing
 * Firebase pagination.
 */
const loadMoreProducts = useCallback(async () => {
  return;
}, []);

/**
 * Product-private data.
 *
 * No separate Firebase/private-product listener is required.
 *
 * `fetchProducts()` already returns the fields allowed for the current
 * audience, while Supabase RLS remains the actual security boundary.
 *
 * Cost price and other merchant-private fields must never be exposed through
 * the public catalogue path.
 */
    
    // ============================================================
  // Real-time Orders Sync
  // ============================================================
  //
  // Supabase is the authoritative source for orders.
  //
  // The database/RLS decides which rows the current user can see:
  //   - customer -> own orders
  //   - admin    -> permitted admin order set
  //   - seller   -> permitted seller-related order set
  //
  // Realtime events are treated as invalidation signals. We re-read through
  // supabaseOrderService instead of merging raw Realtime rows into state,
  // because an order screen normally depends on order_items and related data.
  //
  useEffect(() => {
    if (!authUser) {
      setOrders([]);
      return;
    }

    let isMounted = true;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const loadOrders = async () => {
      try {
        const rows =
          await supabaseOrderService.fetchOrders();

        if (!isMounted) return;

        setOrders(rows);
      } catch (err) {
        if (!isMounted) return;

        console.error(
          '[ShopContext] Failed to load orders from Supabase:',
          err
        );
      }
    };

    void loadOrders();

    /*
     * Coalesce multiple order events into one read.
     *
     * A checkout/status update can generate multiple database events.
     */
    const scheduleRefresh = () => {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }

      refreshTimer = setTimeout(() => {
        void loadOrders();
      }, 400);
    };

    const channel = supabase
      .channel('yalla-orders')

      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders'
        },
        scheduleRefresh
      )

      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'order_items'
        },
        scheduleRefresh
      )

      .subscribe(status => {
        if (
          status === 'CHANNEL_ERROR' ||
          status === 'TIMED_OUT'
        ) {
          console.error(
            `[ShopContext] Supabase realtime channel for orders: ${status}`
          );
        }
      });

    return () => {
      isMounted = false;

      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }

      void supabase.removeChannel(channel);
    };
  }, [
    authUser,
    isAdminUser,
    isSellerUser,
    sellerId
  ]);

  // ============================================================
  // Supabase Auth + Profile + Cart + Wishlist Synchronization
  // ============================================================

  useEffect(() => {
    let isMounted = true;

    /*
     * Every auth event gets its own generation.
     *
     * This prevents a slow profile/cart request belonging to an old session
     * from overwriting state after the user has already signed out or another
     * user has signed in.
     */
    let authGeneration = 0;

    console.log(
      '[ShopContext] Initializing Supabase Auth listener...'
    );

    const deriveNames = (
      displayName?: string | null,
      email?: string | null
    ) => {
      if (
        displayName &&
        displayName.trim()
      ) {
        const parts =
          displayName
            .trim()
            .split(/\s+/);

        return {
          firstName: parts[0],
          lastName:
            parts.slice(1).join(' ') || '',
          name: displayName.trim()
        };
      }

      if (
        email &&
        email.includes('@')
      ) {
        const raw =
          email
            .split('@')[0]
            .replace(/[0-9]+/g, ' ')
            .trim();

        const parts =
          raw
            .split(/[\._\-\s]+/)
            .filter(Boolean);

        if (parts.length >= 2) {
          const first =
            parts[0]
              .charAt(0)
              .toUpperCase() +
            parts[0]
              .slice(1)
              .toLowerCase();

          const last =
            parts[1]
              .charAt(0)
              .toUpperCase() +
            parts[1]
              .slice(1)
              .toLowerCase();

          return {
            firstName: first,
            lastName: last,
            name: `${first} ${last}`
          };
        }

        if (
          parts.length === 1 &&
          parts[0].length > 0
        ) {
          const first =
            parts[0]
              .charAt(0)
              .toUpperCase() +
            parts[0]
              .slice(1)
              .toLowerCase();

          return {
            firstName: first,
            lastName: '',
            name: first
          };
        }
      }

      return {
        firstName: '',
        lastName: '',
        name: ''
      };
    };

    const handleAuthUser = (
      supaUser: SupabaseUser | null
    ) => {
      if (!isMounted) return;

      authGeneration += 1;

      const myGeneration =
        authGeneration;

      const isCurrent = () =>
        isMounted &&
        myGeneration ===
          authGeneration;

      // ========================================================
      // Signed out
      // ========================================================

      if (!supaUser) {
        setAuthUser(null);
        setUser(INITIAL_USER);

        setIsAdminUser(false);
        setIsSellerUser(false);
        setSellerId(null);

        setIsEmailVerified(false);
        setIsLocalAdminUnlockedState(false);

        setIsLoadingAuth(false);

        setOrders([]);

        try {
          localStorage.removeItem(
            'yallalb_orders'
          );
        } catch {}

        /*
         * Close authenticated persistence gates.
         */
        setCartHydratedForUserId(null);

        lastPersistedCartRef.current =
          null;

        lastPersistedWishlistRef.current =
          null;

        /*
         * Never leave an authenticated user's cart/wishlist in browser
         * storage for the next person using this browser.
         *
         * A genuine guest cart is preserved.
         */
        if (
          readLocalCartOwner() !==
          'guest'
        ) {
          setCart([]);
          setWishlist([]);

          try {
            localStorage.removeItem(
              GUEST_CART_KEY
            );

            localStorage.removeItem(
              GUEST_WISHLIST_KEY
            );

            localStorage.removeItem(
              LEGACY_CART_KEY
            );

            localStorage.removeItem(
              LEGACY_WISHLIST_KEY
            );
          } catch {}

          writeLocalCartOwner(
            'guest'
          );
        } else {
          /*
           * Restore the legitimate guest cart/wishlist.
           */
          try {
            const guestCart =
              getGuestStorage(
                GUEST_CART_KEY,
                LEGACY_CART_KEY
              );

            if (guestCart) {
              const parsed =
                JSON.parse(
                  guestCart
                );

              if (
                Array.isArray(parsed)
              ) {
                setCart(parsed);
              }
            }

            const guestWishlist =
              getGuestStorage(
                GUEST_WISHLIST_KEY,
                LEGACY_WISHLIST_KEY
              );

            if (guestWishlist) {
              const parsed =
                JSON.parse(
                  guestWishlist
                );

              if (
                Array.isArray(parsed)
              ) {
                setWishlist(parsed);
              }
            }
          } catch (err) {
            console.error(
              '[ShopContext] Failed to restore guest cart/wishlist:',
              err
            );
          }
        }

        return;
      }

      // ========================================================
      // Signed in
      // ========================================================

      setAuthUser(
        createAuthUserAdapter(
          supaUser
        )
      );

      /*
       * Supabase Auth is the source of truth for email verification.
       *
       * Do not use a client-side profile flag as the security authority.
       */
      setIsEmailVerified(
        Boolean(
          supaUser.email_confirmed_at
        )
      );

      /*
       * Start the authenticated-user loading state.
       */
      setIsLoadingAuth(true);

      /*
       * Profile, role, seller ownership, cart and wishlist are loaded
       * asynchronously. Every continuation checks `isCurrent()` so an
       * earlier session cannot overwrite a newer session.
       */
      void (async () => {
        try {
          const [
            profile,
            savedCart,
            savedWishlist
          ] = await Promise.all([
            supabaseUserDataService.fetchProfile(
              supaUser.id
            ),
            supabaseUserDataService.fetchCart(
              supaUser.id
            ),
            supabaseUserDataService.fetchWishlist(
              supaUser.id
            )
          ]);

          if (!isCurrent()) return;

          /*
           * Role and seller ownership come from the Supabase profile.
           *
           * These values control UI behavior only.
           * Actual authorization remains enforced by RLS/database policies.
           */
          const role =
            profile?.role;

          const admin =
            role === 'admin';

          const seller =
            role === 'seller';

          const profileSellerId =
            profile?.sellerId ??
            null;

          setIsAdminUser(admin);
          setIsSellerUser(seller);
          setSellerId(
            seller
              ? profileSellerId
              : null
          );

          /*
           * Build the UI user from the authoritative Supabase profile.
           */
          const metadata =
            supaUser.user_metadata ||
            {};

          const derived =
            deriveNames(
              metadata.display_name ??
                metadata.full_name ??
                metadata.name ??
                null,
              supaUser.email
            );

          const nextUser =
            mapSafeShopUserProfile(
              profile,
              {
                id: supaUser.id,
                email:
                  supaUser.email,
                displayName:
                  metadata.display_name ??
                  metadata.full_name ??
                  metadata.name ??
                  derived.name,
                photoURL:
                  metadata.avatar_url ??
                  metadata.picture ??
                  null
              }
            );

          setUser(
            nextUser || {
              ...INITIAL_USER,
              id: supaUser.id,
              email:
                supaUser.email || '',
              firstName:
                derived.firstName,
              lastName:
                derived.lastName,
              name:
                derived.name
            }
          );

          /*
           * The authenticated user's cart/wishlist now come from Supabase.
           *
           * Mark the cart as hydrated only after the database read succeeds.
           * This prevents the persistence effect from accidentally overwriting
           * a user's saved cart with an empty initial React state.
           */
          setCart(
            Array.isArray(savedCart)
              ? savedCart
              : []
          );

          setWishlist(
            Array.isArray(
              savedWishlist
            )
              ? savedWishlist
              : []
          );

          setCartHydratedForUserId(
            supaUser.id
          );

          lastPersistedCartRef.current =
            JSON.stringify(
              Array.isArray(
                savedCart
              )
                ? savedCart
                : []
            );

          lastPersistedWishlistRef.current =
            JSON.stringify(
              Array.isArray(
                savedWishlist
              )
                ? savedWishlist
                : []
            );

          /*
           * Authenticated data must no longer be treated as a guest-owned
           * browser cart.
           */
          writeLocalCartOwner(
            supaUser.id
          );

          try {
            localStorage.removeItem(
              GUEST_CART_KEY
            );

            localStorage.removeItem(
              GUEST_WISHLIST_KEY
            );

            localStorage.removeItem(
              LEGACY_CART_KEY
            );

            localStorage.removeItem(
              LEGACY_WISHLIST_KEY
            );
          } catch {}

          if (!isCurrent()) return;

          setIsLoadingAuth(false);
        } catch (err) {
          if (!isCurrent()) return;

          console.error(
            '[ShopContext] Failed to hydrate Supabase user:',
            err
          );

          /*
           * Do not silently promote the user to admin/seller or invent
           * profile/cart data when the database read fails.
           */
          setIsAdminUser(false);
          setIsSellerUser(false);
          setSellerId(null);

          setIsLoadingAuth(false);
        }
      })();
    };

    /*
     * Read the current Supabase session first.
     *
     * `getSession()` restores the persisted browser session while
     * `onAuthStateChange()` handles subsequent SIGNED_IN/SIGNED_OUT/
     * TOKEN_REFRESHED events.
     */
    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!isMounted) return;

        if (error) {
          console.error(
            '[ShopContext] Supabase getSession failed:',
            error
          );

          handleAuthUser(null);
          return;
        }

        handleAuthUser(
          data.session?.user ??
            null
        );
      });

    const {
      data: authSubscription
    } =
      supabase.auth.onAuthStateChange(
        (event, session) => {
          if (!isMounted) return;

          /*
           * Supabase can emit INITIAL_SESSION immediately after registering
           * the listener. It is safe to process because handleAuthUser()
           * uses the generation guard.
           */
          console.log(
            `[ShopContext] Supabase auth event: ${event}`
          );

          handleAuthUser(
            session?.user ?? null
          );
        }
      );

    return () => {
      isMounted = false;
      authSubscription.subscription.unsubscribe();
    };
  }, []);
      
          // ============================================================
      // Supabase user/profile/cart hydration
      // ============================================================

      /*
       * Set the auth adapter immediately so the UI knows that a Supabase
       * session exists. The database profile is loaded separately below.
       *
       * IMPORTANT:
       * This adapter does NOT grant authorization. Admin/seller permissions
       * are determined by the Supabase `profiles` row and enforced by RLS.
       */
      const initialUserAdapter =
        createAuthUserAdapter(
          supaUser,
          'customer',
          null,
          {}
        );

      setAuthUser(
        initialUserAdapter
      );

      setIsEmailVerified(
        Boolean(
          supaUser.email_confirmed_at
        )
      );

      /*
       * Supabase Auth callbacks should not perform a large chain of database
       * operations synchronously inside the auth callback.
       *
       * Defer the profile/cart/wishlist hydration to the next event-loop turn.
       */
      setTimeout(() => {
        if (!isCurrent()) return;

        void (async () => {
          try {
            // ============================================================
            // 1. Load authoritative profile
            // ============================================================

            let profileRole:
              | 'admin'
              | 'seller'
              | 'customer' =
              'customer';

            let profileSellerId:
              string | null = null;

            let profileData:
              Record<string, any> = {};

            try {
              const {
                data: profile,
                error: profileError
              } = await supabase
                .from('profiles')
                .select(
                  'id,name,first_name,last_name,email,phone,avatar,default_address,default_city,default_region,default_country,role,seller_id,email_verified,is_otp_verified,created_at,updated_at'
                )
                .eq(
                  'id',
                  supaUser.id
                )
                .maybeSingle();

              if (profileError) {
                throw profileError;
              }

              if (profile) {
                profileData =
                  profile;

                if (
                  profile.role ===
                  'admin'
                ) {
                  profileRole =
                    'admin';
                } else if (
                  profile.role ===
                  'seller'
                ) {
                  profileRole =
                    'seller';
                }

                profileSellerId =
                  profile.seller_id ??
                  null;
              }
            } catch (profileErr) {
              /*
               * Do not invent an admin/seller role when the profile cannot
               * be read. Fail closed to customer for UI purposes.
               */
              console.error(
                '[ShopContext] Failed to load Supabase profile:',
                profileErr
              );

              profileRole =
                'customer';

              profileSellerId =
                null;

              profileData = {};
            }

            if (!isCurrent()) return;

            // ============================================================
            // 2. Apply authoritative role/profile state
            // ============================================================

            const isAdmin =
              profileRole ===
              'admin';

            const isSeller =
              profileRole ===
              'seller';

            const isEmailConfirmed =
              Boolean(
                supaUser.email_confirmed_at
              );

            setIsAdminUser(
              isAdmin
            );

            setIsSellerUser(
              isSeller
            );

            setSellerId(
              isSeller
                ? profileSellerId
                : null
            );

            setIsEmailVerified(
              isEmailConfirmed
            );

            /*
             * Rebuild the compatibility adapter using the actual Supabase
             * profile. This keeps the existing UI compatible while Supabase
             * remains the real authentication system.
             */
            const authoritativeUserAdapter =
              createAuthUserAdapter(
                supaUser,
                profileRole,
                profileSellerId,
                profileData
              );

            setAuthUser(
              authoritativeUserAdapter
            );

            // ============================================================
            // 3. Build application user profile
            // ============================================================

            let cachedShipping:
              Partial<UserProfile> =
              {};

            try {
              const rawCache =
                localStorage.getItem(
                  'yallalb_saved_checkout_data'
                );

              if (rawCache) {
                cachedShipping =
                  JSON.parse(
                    rawCache
                  );
              }
            } catch {
              cachedShipping =
                {};
            }

            const fallbackNames =
              deriveNames(
                authoritativeUserAdapter.displayName,
                supaUser.email
              );

            const safeProfile =
              mapSafeShopUserProfile(
                profileData,
                authoritativeUserAdapter,
                profileSellerId,
                cachedShipping,
                fallbackNames
              );

            if (!isCurrent()) return;

            setUser(
              safeProfile
            );

            // ============================================================
            // 4. Hydrate authenticated cart + wishlist
            // ============================================================

            /*
             * Supabase is authoritative for authenticated users.
             *
             * Before loading the account's rows, make sure a previous
             * account's browser data cannot leak into this session.
             */
            const localOwner =
              readLocalCartOwner();

            const localBelongsToSomeoneElse =
              localOwner !==
                'guest' &&
              localOwner !==
                supaUser.id;

            if (
              localBelongsToSomeoneElse
            ) {
              setCart([]);
              setWishlist([]);

              try {
                localStorage.removeItem(
                  GUEST_CART_KEY
                );

                localStorage.removeItem(
                  GUEST_WISHLIST_KEY
                );

                localStorage.removeItem(
                  LEGACY_CART_KEY
                );

                localStorage.removeItem(
                  LEGACY_WISHLIST_KEY
                );
              } catch {}
            }

            /*
             * Keep the persistence gate CLOSED while these reads are in
             * progress. Otherwise the initial React state could overwrite
             * the user's saved Supabase cart.
             */
            setCartHydratedForUserId(
              null
            );

            const [
              savedCart,
              savedWishlist
            ] = await Promise.all([
              supabaseUserDataService.fetchCart(
                supaUser.id
              ),
              supabaseUserDataService.fetchWishlist(
                supaUser.id
              )
            ]);

            if (!isCurrent()) return;

            // ============================================================
            // 5. Apply saved cart
            // ============================================================

            /*
             * `null` means there is no row yet.
             *
             * It is different from a failed request. A successful null
             * allows the authenticated persistence layer to continue.
             */
            if (
              savedCart !== null &&
              savedCart !== undefined
            ) {
              setCart(
                savedCart
              );

              lastPersistedCartRef.current =
                JSON.stringify(
                  savedCart
                );
            } else {
              lastPersistedCartRef.current =
                null;
            }

            // ============================================================
            // 6. Apply saved wishlist
            // ============================================================

            if (
              savedWishlist !== null &&
              savedWishlist !== undefined
            ) {
              setWishlist(
                savedWishlist
              );

              lastPersistedWishlistRef.current =
                JSON.stringify(
                  savedWishlist
                );
            } else {
              lastPersistedWishlistRef.current =
                null;
            }

            // ============================================================
            // 7. Mark account hydration complete
            // ============================================================

            writeLocalCartOwner(
              supaUser.id
            );

            /*
             * Only AFTER the Supabase rows have been successfully read may
             * the cart/wishlist persistence effects write to the database.
             */
            setCartHydratedForUserId(
              supaUser.id
            );

            // ============================================================
            // 8. Remove guest browser data
            // ============================================================

            try {
              localStorage.removeItem(
                GUEST_CART_KEY
              );

              localStorage.removeItem(
                GUEST_WISHLIST_KEY
              );

              localStorage.removeItem(
                LEGACY_CART_KEY
              );

              localStorage.removeItem(
                LEGACY_WISHLIST_KEY
              );
            } catch {}

            if (!isCurrent()) return;

            setIsLoadingAuth(
              false
            );
          } catch (err) {
            if (!isCurrent()) return;

            /*
             * A failed cart/wishlist read must NOT be interpreted as an
             * empty account.
             *
             * Keep the hydration gate closed so the persistence effects
             * cannot overwrite the existing Supabase data.
             */
            console.error(
              '[ShopContext] Failed to hydrate Supabase user data:',
              err
            );

            setCartHydratedForUserId(
              null
            );

            /*
             * Fail closed for authorization state if the profile/data
             * hydration failed.
             */
            setIsAdminUser(
              false
            );

            setIsSellerUser(
              false
            );

            setSellerId(
              null
            );

            setIsLoadingAuth(
              false
            );

            showToast(
              language === 'ar'
                ? 'تعذر تحميل بيانات حسابك. يرجى تحديث الصفحة والمحاولة مرة أخرى.'
                : 'Could not load your account data. Please refresh the page and try again.',
              'error'
            );
          }
        })();
      }, 0);
    };
                
      // ============================================================
  // Supabase Auth Session Restoration
  // ============================================================

  /*
   * Restore the existing Supabase session when the provider mounts.
   *
   * `handleAuthUser()` is responsible for profile, role, cart and wishlist
   * hydration. Supabase Auth remains the only authentication authority.
   */
  void supabase.auth
    .getSession()
    .then(({ data, error }) => {
      if (error) {
        console.error(
          '[ShopContext] Failed to restore Supabase session:',
          error
        );

        handleAuthUser(null);
        return;
      }

      handleAuthUser(
        data.session?.user ?? null
      );
    })
    .catch(err => {
      console.error(
        '[ShopContext] Supabase session restoration failed:',
        err
      );

      handleAuthUser(null);
    });

  // ============================================================
  // Supabase Auth State Listener
  // ============================================================

  const {
    data: {
      subscription
    }
  } =
    supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log(
          `[ShopContext] Supabase Auth event: ${event}`,
          session?.user?.id ??
            'None (Guest)'
        );

        handleAuthUser(
          session?.user ?? null
        );
      }
    );

  return () => {
    isMounted = false;

    subscription.unsubscribe();
  };
}, []);

/**
 * Persist the authenticated user's cart to Supabase.
 *
 * Supabase `carts` is authoritative for signed-in users.
 * Guest carts remain localStorage-only.
 *
 * The hydration gate is critical: the cart cannot be written until the
 * current user's saved cart has successfully been loaded.
 */
useEffect(() => {
  const userId =
    authUser?.uid;

  if (!userId) return;

  if (
    cartHydratedForUserId !==
    userId
  ) {
    return;
  }

  const payload =
    JSON.stringify(
      storedCart
    );

  if (
    payload ===
    lastPersistedCartRef.current
  ) {
    return;
  }

  const handler =
    setTimeout(() => {
      void supabaseUserDataService
        .saveCart(
          userId,
          storedCart
        )
        .then(() => {
          lastPersistedCartRef.current =
            payload;
        })
        .catch(err => {
          console.error(
            '[ShopContext] Failed to save cart to Supabase:',
            err
          );

          showToast(
            language === 'ar'
              ? 'تعذر حفظ سلتك على الخادم.'
              : 'Could not save your cart to the server.',
            'error'
          );
        });
    }, 800);

  return () =>
    clearTimeout(handler);

  /*
   * `language` is intentionally not included because it is declared later
   * in this component and would be accessed while still in its temporal
   * dead zone. The callback executes after render has completed.
   */
}, [
  storedCart,
  authUser,
  cartHydratedForUserId
]);

/**
 * Persist the authenticated user's wishlist to Supabase.
 *
 * Supabase `wishlists` is authoritative for signed-in users.
 * Guest wishlists remain localStorage-only.
 */
useEffect(() => {
  const userId =
    authUser?.uid;

  if (!userId) return;

  if (
    cartHydratedForUserId !==
    userId
  ) {
    return;
  }

  const payload =
    JSON.stringify(
      wishlist
    );

  if (
    payload ===
    lastPersistedWishlistRef.current
  ) {
    return;
  }

  const handler =
    setTimeout(() => {
      void supabaseUserDataService
        .saveWishlist(
          userId,
          wishlist
        )
        .then(() => {
          lastPersistedWishlistRef.current =
            payload;
        })
        .catch(err => {
          console.error(
            '[ShopContext] Failed to save wishlist to Supabase:',
            err
          );

          /*
           * Product IDs are UUIDs in Supabase. If old/migrated demo IDs are
           * encountered, this is a migration/data issue rather than an Auth
           * failure.
           */
          if (
            err?.name ===
            'NonUuidProductIdsError'
          ) {
            return;
          }

          showToast(
            language === 'ar'
              ? 'تعذر حفظ قائمة رغباتك على الخادم.'
              : 'Could not save your wishlist to the server.',
            'error'
          );
        });
    }, 800);

  return () =>
    clearTimeout(handler);
}, [
  wishlist,
  authUser,
  cartHydratedForUserId
]);

// ============================================================
// Supabase Auth Error Classification
// ============================================================

type AuthErrorKind =
  | 'invalid_credentials'
  | 'unconfirmed_email'
  | 'already_registered'
  | 'weak_password'
  | 'invalid_email'
  | 'rate_limited'
  | 'network'
  | 'not_found'
  | 'unknown';

const classifyAuthError = (
  error: any
): AuthErrorKind => {
  const code = String(
    error?.code ?? ''
  ).toLowerCase();

  const status = Number(
    error?.status ?? 0
  );

  const message = String(
    error?.message ?? ''
  ).toLowerCase();

  // ------------------------------------------------------------
  // Network / transport errors
  // ------------------------------------------------------------

  if (
    error?.name ===
      'AuthRetryableFetchError' ||
    error instanceof TypeError ||
    message.includes(
      'failed to fetch'
    ) ||
    message.includes(
      'fetch failed'
    ) ||
    message.includes(
      'networkerror'
    ) ||
    message.includes(
      'load failed'
    )
  ) {
    return 'network';
  }

  // ------------------------------------------------------------
  // Invalid credentials
  // ------------------------------------------------------------

  if (
    code ===
      'invalid_credentials' ||
    message.includes(
      'invalid login credentials'
    ) ||
    message.includes(
      'invalid credentials'
    )
  ) {
    return 'invalid_credentials';
  }

  // ------------------------------------------------------------
  // Email confirmation
  // ------------------------------------------------------------

  if (
    code ===
      'email_not_confirmed' ||
    message.includes(
      'email not confirmed'
    )
  ) {
    return 'unconfirmed_email';
  }

  // ------------------------------------------------------------
  // Existing account
  // ------------------------------------------------------------

  if (
    code ===
      'user_already_exists' ||
    code ===
      'email_exists' ||
    message.includes(
      'already registered'
    ) ||
    message.includes(
      'already in use'
    ) ||
    message.includes(
      'user already exists'
    )
  ) {
    return 'already_registered';
  }

  // ------------------------------------------------------------
  // Password validation
  // ------------------------------------------------------------

  if (
    code ===
      'weak_password' ||
    message.includes(
      'password should be'
    ) ||
    message.includes(
      'password is too weak'
    )
  ) {
    return 'weak_password';
  }

  // ------------------------------------------------------------
  // Email validation
  // ------------------------------------------------------------

  if (
    code ===
      'validation_failed' ||
    message.includes(
      'invalid email'
    ) ||
    message.includes(
      'unable to validate email'
    )
  ) {
    return 'invalid_email';
  }

  // ------------------------------------------------------------
  // Rate limiting
  // ------------------------------------------------------------

  if (
    status === 429 ||
    code.includes(
      'rate_limit'
    ) ||
    message.includes(
      'rate limit'
    ) ||
    message.includes(
      'too many requests'
    )
  ) {
    return 'rate_limited';
  }

  // ------------------------------------------------------------
  // User not found
  // ------------------------------------------------------------

  if (
    status === 404 ||
    code ===
      'user_not_found' ||
    message.includes(
      'user not found'
    )
  ) {
    return 'not_found';
  }

  return 'unknown';
};
                
   /**
   * Determines whether a Supabase/backend failure is safe to retry.
   *
   * Retry:
   *   - network/transport failures
   *   - Supabase AuthRetryableFetchError
   *   - HTTP 408
   *   - HTTP 429
   *   - HTTP 5xx
   *
   * Never retry:
   *   - authentication/authorization failures
   *   - validation errors
   *   - RLS failures
   *   - PostgreSQL constraint errors
   *   - application/business-rule errors
   */
  const isRetryableBackendError = (
    error: any
  ): boolean => {
    if (!error) return false;

    const status = Number(
      error?.status ??
      error?.statusCode ??
      0
    );

    const code = String(
      error?.code ?? ''
    ).toLowerCase();

    const message = String(
      error?.message ?? ''
    ).toLowerCase();

    // ------------------------------------------------------------
    // Never retry deterministic client/auth/database failures
    // ------------------------------------------------------------

    if (
      [
        400,
        401,
        403,
        404,
        409,
        422
      ].includes(status)
    ) {
      return false;
    }

    /*
     * PostgreSQL / PostgREST errors:
     *
     * 42501 -> insufficient_privilege / RLS
     * 42xxx -> SQL/schema errors
     * 23xxx -> constraint violations
     * P0001/P0002 -> application-raised PostgreSQL exceptions
     * PGRSTxxx -> PostgREST errors
     */
    if (
      /^(42501|42\d{3}|23\d{3}|P0001|P0002|PGRST\d+)$/i.test(
        code
      )
    ) {
      return false;
    }

    if (
      message.includes(
        'invalid login credentials'
      ) ||
      message.includes(
        'invalid credentials'
      ) ||
      message.includes(
        'email not confirmed'
      ) ||
      message.includes(
        'already registered'
      ) ||
      message.includes(
        'already exists'
      ) ||
      message.includes(
        'row-level security'
      ) ||
      message.includes(
        'permission denied'
      ) ||
      message.includes(
        'violates'
      ) ||
      message.includes(
        'duplicate key'
      ) ||
      message.includes(
        'foreign key'
      ) ||
      message.includes(
        'not-null'
      )
    ) {
      return false;
    }

    // ------------------------------------------------------------
    // Explicit Supabase retryable Auth transport error
    // ------------------------------------------------------------

    if (
      error?.name ===
      'AuthRetryableFetchError'
    ) {
      return true;
    }

    // ------------------------------------------------------------
    // Temporary HTTP failures
    // ------------------------------------------------------------

    if (
      status === 408 ||
      status === 429 ||
      (status >= 500 &&
        status <= 599)
    ) {
      return true;
    }

    // ------------------------------------------------------------
    // Network / transport failures
    // ------------------------------------------------------------

    if (
      error instanceof TypeError ||
      message.includes(
        'failed to fetch'
      ) ||
      message.includes(
        'fetch failed'
      ) ||
      message.includes(
        'networkerror'
      ) ||
      message.includes(
        'network request failed'
      ) ||
      message.includes(
        'load failed'
      ) ||
      message.includes(
        'connection reset'
      ) ||
      message.includes(
        'connection refused'
      ) ||
      message.includes(
        'socket'
      ) ||
      message.includes(
        'timeout'
      ) ||
      message.includes(
        'timed out'
      )
    ) {
      return true;
    }

    return false;
  };

  /**
   * Execute a Supabase operation with bounded exponential retry.
   *
   * Default:
   *   attempt 1 -> immediate
   *   attempt 2 -> +1 second
   *   attempt 3 -> +2 seconds
   *
   * Only retryable transport/server failures are retried.
   * Authentication, RLS, validation and database constraint failures are
   * immediately returned to the caller.
   */
  async function executeWithRetry<T>(
    fn: () => Promise<T>,
    retries = 2,
    delay = 1000
  ): Promise<T> {
    try {
      return await fn();
    } catch (error: any) {
      if (
        retries <= 0 ||
        !isRetryableBackendError(error)
      ) {
        throw error;
      }

      console.warn(
        '[ShopContext] Retryable Supabase failure:',
        {
          name:
            error?.name,
          code:
            error?.code,
          status:
            error?.status,
          retriesRemaining:
            retries
        }
      );

      await new Promise<void>(
        resolve =>
          setTimeout(
            resolve,
            delay
          )
      );

      return executeWithRetry(
        fn,
        retries - 1,
        Math.min(
          delay * 2,
          8000
        )
      );
    }
  }

  // ============================================================
  // OAuth
  // ============================================================

  const signInWithGoogle =
    async () => {
      try {
        const {
          error
        } =
          await supabase.auth.signInWithOAuth(
            {
              provider:
                'google',
              options: {
                redirectTo:
                  typeof window !==
                  'undefined'
                    ? window.location
                        .origin
                    : undefined
              }
            }
          );

        if (error) {
          throw error;
        }

        showToast(
          language === 'ar'
            ? 'جارٍ تحويلك لتسجيل الدخول باستخدام Google...'
            : 'Redirecting to Google sign in...',
          'info'
        );
      } catch (
        error: any
      ) {
        console.error(
          '[ShopContext] Supabase Google sign-in failed:',
          error
        );

        showToast(
          language === 'ar'
            ? `فشل تسجيل الدخول باستخدام Google: ${
                error?.message ||
                'خطأ غير معروف'
              }`
            : `Failed to sign in with Google: ${
                error?.message ||
                'Unknown error'
              }`,
          'warning'
        );
      }
    };

  const signInWithApple =
    async () => {
      try {
        const {
          error
        } =
          await supabase.auth.signInWithOAuth(
            {
              provider:
                'apple',
              options: {
                redirectTo:
                  typeof window !==
                  'undefined'
                    ? window.location
                        .origin
                    : undefined
              }
            }
          );

        if (error) {
          throw error;
        }

        showToast(
          language === 'ar'
            ? 'جارٍ تحويلك لتسجيل الدخول باستخدام Apple...'
            : 'Redirecting to Apple sign in...',
          'info'
        );
      } catch (
        error: any
      ) {
        console.error(
          '[ShopContext] Supabase Apple sign-in failed:',
          error
        );

        showToast(
          language === 'ar'
            ? `فشل تسجيل الدخول باستخدام Apple: ${
                error?.message ||
                'خطأ غير معروف'
              }`
            : `Failed to sign in with Apple: ${
                error?.message ||
                'Unknown error'
              }`,
          'warning'
        );
      }
    };

  // ============================================================
  // Password Reset
  // ============================================================

  const resetPassword =
    async (
      email: string
    ) => {
      const cleanEmail =
        email
          .trim()
          .toLowerCase();

      if (!cleanEmail) {
        const msg =
          language === 'ar'
            ? 'الرجاء إدخال البريد الإلكتروني'
            : 'Please enter an email address.';

        showToast(
          msg,
          'warning'
        );

        throw new Error(
          msg
        );
      }

      try {
        /*
         * Supabase sends the password-reset email.
         *
         * The redirect URL must point back to the application. The reset
         * callback should then use Supabase's PASSWORD_RECOVERY event/session.
         */
        const {
          error
        } =
          await supabase.auth.resetPasswordForEmail(
            cleanEmail,
            {
              redirectTo:
                typeof window !==
                'undefined'
                  ? `${window.location.origin}/reset-password`
                  : undefined
            }
          );

        if (error) {
          throw error;
        }

        /*
         * Keep the response generic. Do not reveal whether an email address
         * exists in Supabase.
         */
        showToast(
          language === 'ar'
            ? 'إذا كان البريد مسجلاً، فستصلك رسالة لإعادة تعيين كلمة المرور.'
            : 'If the email is registered, you will receive a password reset email.',
          'success'
        );
      } catch (
        error: any
      ) {
        const kind =
          classifyAuthError(
            error
          );

        console.error(
          '[ShopContext] Supabase password reset failed:',
          error
        );

        /*
         * Do not expose account-enumeration information to the user.
         */
        if (
          kind ===
          'network'
        ) {
          showToast(
            language === 'ar'
              ? 'تعذر الاتصال بالخادم. يرجى المحاولة مرة أخرى.'
              : 'Could not connect to the server. Please try again.',
            'error'
          );
        } else if (
          kind ===
          'rate_limited'
        ) {
          showToast(
            language === 'ar'
              ? 'تم إجراء محاولات كثيرة. يرجى الانتظار قليلاً ثم المحاولة مرة أخرى.'
              : 'Too many attempts. Please wait a while and try again.',
            'warning'
          );
        } else {
          /*
           * Generic response intentionally avoids confirming whether the
           * account exists.
           */
          showToast(
            language === 'ar'
              ? 'تعذر معالجة طلب إعادة تعيين كلمة المرور.'
              : 'Unable to process the password reset request.',
            'error'
          );
        }

        throw error;
      }
    };
        
      const resetPassword = async (
    email: string
  ) => {
    const cleanEmail = email
      .trim()
      .toLowerCase();

    if (
      !cleanEmail ||
      !cleanEmail.includes('@')
    ) {
      const msg =
        language === 'ar'
          ? 'الرجاء إدخال بريد إلكتروني صالح'
          : 'Please enter a valid email address.';

      showToast(
        msg,
        'warning'
      );

      throw new Error(msg);
    }

    try {
      const {
        error
      } =
        await supabase.auth.resetPasswordForEmail(
          cleanEmail,
          {
            redirectTo:
              typeof window !==
              'undefined'
                ? `${window.location.origin}/account?resetPassword=true`
                : undefined
          }
        );

      if (error) {
        throw error;
      }

      /*
       * Always use a generic response.
       * This prevents user/email enumeration.
       */
      showToast(
        language === 'ar'
          ? 'إذا كان البريد مسجلاً لدينا، فقد تم إرسال رابط إعادة تعيين كلمة المرور إلى صندوق الوارد.'
          : 'If an account exists for this email address, a password reset link has been sent.',
        'success'
      );
    } catch (
      error: any
    ) {
      console.error(
        '[ShopContext] resetPassword error:',
        error
      );

      const kind =
        classifyAuthError(
          error
        );

      /*
       * Never reveal whether the email exists.
       */
      if (
        kind === 'not_found'
      ) {
        showToast(
          language === 'ar'
            ? 'إذا كان البريد مسجلاً لدينا، فقد تم إرسال رابط إعادة تعيين كلمة المرور إلى صندوق الوارد.'
            : 'If an account exists for this email address, a password reset link has been sent.',
          'success'
        );
        return;
      }

      if (
        kind === 'network'
      ) {
        const msg =
          language === 'ar'
            ? 'تعذر الاتصال بالخادم. يرجى المحاولة مرة أخرى.'
            : 'Could not connect to the server. Please try again.';

        showToast(
          msg,
          'warning'
        );

        throw error;
      }

      if (
        kind === 'rate_limited'
      ) {
        const msg =
          language === 'ar'
            ? 'تم إجراء محاولات كثيرة. يرجى الانتظار قليلاً ثم المحاولة مرة أخرى.'
            : 'Too many attempts. Please wait a while and try again.';

        showToast(
          msg,
          'warning'
        );

        throw error;
      }

      const msg =
        language === 'ar'
          ? 'تعذر معالجة طلب إعادة تعيين كلمة المرور.'
          : 'Unable to process the password reset request.';

      showToast(
        msg,
        'warning'
      );

      throw error;
    }
  };

  // ============================================================
  // Email OTP
  // ============================================================

  const sendEmailOtp = async (
    email: string
  ) => {
    const cleanEmail =
      email
        .trim()
        .toLowerCase();

    if (
      !cleanEmail ||
      !cleanEmail.includes('@')
    ) {
      const msg =
        language === 'ar'
          ? 'الرجاء إدخال بريد إلكتروني صالح'
          : 'Please enter a valid email address.';

      showToast(
        msg,
        'warning'
      );

      throw new Error(msg);
    }

    try {
      const {
        error
      } =
        await supabase.auth.signInWithOtp(
          {
            email:
              cleanEmail,

            options: {
              /*
               * Keep this true if OTP should also support
               * creating a new customer account.
               */
              shouldCreateUser:
                true,

              /*
               * Supabase handles the email delivery.
               * No Resend/custom domain is required here.
               */
              emailRedirectTo:
                typeof window !==
                'undefined'
                  ? `${window.location.origin}/account`
                  : undefined
            }
          }
        );

      if (error) {
        throw error;
      }

      if (
        typeof window !==
        'undefined'
      ) {
        window.localStorage.setItem(
          'emailForSignIn',
          cleanEmail
        );
      }

      showToast(
        language === 'ar'
          ? `تم إرسال رمز التحقق إلى ${cleanEmail}! يرجى مراجعة بريدك الإلكتروني.`
          : `Verification code sent to ${cleanEmail}! Please check your email inbox.`,
        'success'
      );
    } catch (
      error: any
    ) {
      console.error(
        '[ShopContext] sendEmailOtp error:',
        error
      );

      const kind =
        classifyAuthError(
          error
        );

      if (
        kind ===
        'rate_limited'
      ) {
        const msg =
          language === 'ar'
            ? 'تم إرسال عدد كبير من الرموز. يرجى الانتظار قليلاً قبل طلب رمز جديد.'
            : 'Too many OTP requests. Please wait a while before requesting another code.';

        showToast(
          msg,
          'warning'
        );

        throw error;
      }

      if (
        kind === 'network'
      ) {
        const msg =
          language === 'ar'
            ? 'تعذر الاتصال بخدمة التحقق. يرجى المحاولة مرة أخرى.'
            : 'Could not connect to the verification service. Please try again.';

        showToast(
          msg,
          'warning'
        );

        throw error;
      }

      const msg =
        error?.message ||
        (
          language === 'ar'
            ? 'فشل إرسال رمز التحقق.'
            : 'Failed to send verification code.'
        );

      showToast(
        msg,
        'warning'
      );

      throw error;
    }
  };

  // ============================================================
  // Verify Email OTP
  // ============================================================

  const verifyEmailOtp = async (
    email: string,
    token: string,
    type:
      | 'email'
      | 'signup'
      | 'magiclink'
      | 'recovery' = 'email'
  ) => {
    const cleanEmail =
      email
        .trim()
        .toLowerCase();

    const cleanToken =
      token.trim();

    if (
      !cleanEmail ||
      !cleanToken
    ) {
      const msg =
        language === 'ar'
          ? 'يرجى إدخال البريد الإلكتروني ورمز التحقق'
          : 'Please enter email and verification code.';

      showToast(
        msg,
        'warning'
      );

      throw new Error(msg);
    }

    try {
      const {
        data,
        error
      } =
        await supabase.auth.verifyOtp(
          {
            email:
              cleanEmail,
            token:
              cleanToken,
            type
          }
        );

      if (error) {
        throw error;
      }

      /*
       * Supabase has now established/updated the authenticated session.
       * The auth listener will hydrate the profile and application state.
       */
      if (
        typeof window !==
        'undefined'
      ) {
        window.localStorage.removeItem(
          'emailForSignIn'
        );
      }

      console.log(
        '[ShopContext] Email OTP verified:',
        data?.user?.id ??
          'unknown-user'
      );

      showToast(
        language === 'ar'
          ? 'تم التحقق بنجاح!'
          : 'Verification successful!',
        'success'
      );
    } catch (
      error: any
    ) {
      console.error(
        '[ShopContext] verifyEmailOtp error:',
        error
      );

      const kind =
        classifyAuthError(
          error
        );

      let msg: string;

      if (
        kind === 'rate_limited'
      ) {
        msg =
          language === 'ar'
            ? 'تم إجراء محاولات كثيرة. يرجى الانتظار قليلاً ثم المحاولة مرة أخرى.'
            : 'Too many attempts. Please wait a while and try again.';
      } else if (
        kind === 'network'
      ) {
        msg =
          language === 'ar'
            ? 'تعذر الاتصال بالخادم. يرجى المحاولة مرة أخرى.'
            : 'Could not connect to the server. Please try again.';
      } else {
        /*
         * Do not expose raw Supabase internals to customers.
         */
        msg =
          language === 'ar'
            ? 'رمز التحقق غير صالح أو منتهي الصلاحية.'
            : 'Invalid or expired verification code.';
      }

      showToast(
        msg,
        'warning'
      );

      throw error;
    }
  };

  // ============================================================
  // Resend Email Verification
  // ============================================================

  const resendEmailVerification =
    async (
      email?: string
    ) => {
      const targetEmail =
        (
          email ||
          authUser?.email ||
          user.email ||
          ''
        )
          .trim()
          .toLowerCase();

      if (!targetEmail) {
        const msg =
          language === 'ar'
            ? 'الرجاء إدخال البريد الإلكتروني'
            : 'Please provide an email address.';

        showToast(
          msg,
          'warning'
        );

        return;
      }

      try {
        const {
          error
        } =
          await supabase.auth.resend(
            {
              type:
                'signup',

              email:
                targetEmail,

              options: {
                emailRedirectTo:
                  typeof window !==
                  'undefined'
                    ? `${window.location.origin}/account?verified=true`
                    : undefined
              }
            }
          );

        if (error) {
          throw error;
        }

        showToast(
          language === 'ar'
            ? 'تم إرسال بريد التحقق بنجاح! يرجى مراجعة صندوق الوارد.'
            : 'Verification email sent successfully! Please check your inbox.',
          'success'
        );
      } catch (
        error: any
      ) {
        console.error(
          '[ShopContext] resendEmailVerification error:',
          error
        );

        const kind =
          classifyAuthError(
            error
          );

        if (
          kind ===
          'rate_limited'
        ) {
          showToast(
            language === 'ar'
              ? 'تم إرسال عدد كبير من الرسائل. يرجى الانتظار قليلاً قبل المحاولة مرة أخرى.'
              : 'Too many verification emails requested. Please wait a while before trying again.',
            'warning'
          );
        } else if (
          kind === 'network'
        ) {
          showToast(
            language === 'ar'
              ? 'تعذر الاتصال بالخادم. يرجى المحاولة مرة أخرى.'
              : 'Could not connect to the server. Please try again.',
            'warning'
          );
        } else {
          showToast(
            language === 'ar'
              ? 'تعذر إرسال بريد التحقق.'
              : 'Failed to send verification email.',
            'warning'
          );
        }

        throw error;
      }
    };
        
    const signUpWithEmail = async (
    email: string,
    pass: string,
    phone?: string
  ) => {
    // ------------------------------------------------------------
    // Recover temporary signup data
    // ------------------------------------------------------------

    let tempSignup: any = {};

    try {
      const rawTemp =
        localStorage.getItem(
          'yallalb_signup_profile_temp'
        );

      if (rawTemp) {
        tempSignup =
          JSON.parse(rawTemp);
      }
    } catch {
      tempSignup = {};
    }

    const cleanEmail =
      email
        .trim()
        .toLowerCase();

    const targetPhone =
      phone?.trim() ||
      String(
        tempSignup.phone ||
        ''
      ).trim();

    // ------------------------------------------------------------
    // Basic email validation
    // ------------------------------------------------------------

    if (
      !cleanEmail ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        cleanEmail
      )
    ) {
      const msg =
        language === 'ar'
          ? 'الرجاء إدخال بريد إلكتروني صالح.'
          : 'Please enter a valid email address.';

      showToast(
        msg,
        'warning'
      );

      throw new Error(msg);
    }

    // ------------------------------------------------------------
    // Check phone uniqueness before creating the Auth account
    // ------------------------------------------------------------

    if (targetPhone) {
      try {
        const phoneCheck =
          await checkPhoneUniqueness(
            targetPhone
          );

        if (!phoneCheck.available) {
          const msg =
            phoneCheck.reason ||
            (
              language === 'ar'
                ? 'رقم الهاتف هذا مسجل مسبقاً بحساب آخر.'
                : 'This phone number is already registered to another account.'
            );

          showToast(
            msg,
            'warning'
          );

          throw new Error(
            msg
          );
        }
      } catch (
        error: any
      ) {
        /*
         * Preserve the explicit duplicate-phone error.
         * Do not continue signup if the uniqueness check failed.
         */
        console.error(
          '[ShopContext] Phone uniqueness check failed:',
          error
        );

        throw error;
      }
    }

    // ------------------------------------------------------------
    // Password validation
    // ------------------------------------------------------------

    if (
      pass.length < 8
    ) {
      const msg =
        language === 'ar'
          ? 'يجب أن تتكون كلمة المرور من 8 أحرف على الأقل.'
          : 'Password must be at least 8 characters long.';

      showToast(
        msg,
        'warning'
      );

      throw new Error(msg);
    }

    const hasUppercase =
      /[A-Z]/.test(pass);

    const hasLowercase =
      /[a-z]/.test(pass);

    const hasNumber =
      /[0-9]/.test(pass);

    const hasSpecial =
      /[^A-Za-z0-9]/.test(pass);

    if (
      !hasUppercase ||
      !hasLowercase ||
      !hasNumber ||
      !hasSpecial
    ) {
      const msg =
        language === 'ar'
          ? 'يجب أن تحتوي كلمة المرور على حرف كبير وحرف صغير ورقم ورمز خاص.'
          : 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character.';

      showToast(
        msg,
        'warning'
      );

      throw new Error(msg);
    }

    // ------------------------------------------------------------
    // Create Supabase Auth account
    // ------------------------------------------------------------

    try {
      const fullName =
        [
          tempSignup.firstName,
          tempSignup.lastName
        ]
          .filter(Boolean)
          .join(' ')
          .trim();

      const {
        data:
          supaAuthData,
        error:
          supaErr
      } =
        await supabase.auth.signUp(
          {
            email:
              cleanEmail,

            password:
              pass,

            options: {
              /*
               * These values are metadata only.
               * Authorization must NEVER depend on user_metadata.
               */
              data: {
                name:
                  fullName,

                first_name:
                  tempSignup.firstName ||
                  '',

                last_name:
                  tempSignup.lastName ||
                  '',

                phone:
                  targetPhone ||
                  ''
              },

              emailRedirectTo:
                typeof window !==
                'undefined'
                  ? `${window.location.origin}/account?verified=true`
                  : undefined
            }
          }
        );

      if (supaErr) {
        throw supaErr;
      }

      const authUser =
        supaAuthData?.user;

      if (!authUser) {
        throw new Error(
          'Supabase did not return a user after signup.'
        );
      }

      // ----------------------------------------------------------
      // Profile synchronization
      // ----------------------------------------------------------
      //
      // The database trigger should create the profiles row.
      // This update only synchronizes signup information.
      //
      // IMPORTANT:
      // Do NOT allow the client to set:
      //   role
      //   seller_id
      //   email_verified
      //   is_otp_verified
      //
      // Those values must remain server/database controlled.
      // ----------------------------------------------------------

      try {
        const {
          error:
            profileError
        } =
          await supabase
            .from('profiles')
            .update(
              {
                first_name:
                  tempSignup.firstName ||
                  '',

                last_name:
                  tempSignup.lastName ||
                  '',

                name:
                  fullName,

                phone:
                  targetPhone ||
                  '',

                /*
                 * These are the actual profile columns from
                 * the Supabase schema.
                 */
                default_address:
                  tempSignup.defaultAddress ||
                  '',

                default_city:
                  tempSignup.defaultCity ||
                  '',

                /*
                 * If your current schema uses default_region,
                 * store the governorate/region there.
                 */
                default_region:
                  tempSignup.defaultGovernorate ||
                  '',

                default_country:
                  tempSignup.defaultCountry ||
                  'Lebanon'
              }
            )
            .eq(
              'id',
              authUser.id
            );

        if (profileError) {
          /*
           * Do not fail the Auth account creation because the
           * optional profile synchronization failed.
           *
           * The database trigger remains responsible for creating
           * the base profile row.
           */
          console.warn(
            '[ShopContext] Signup profile synchronization notice:',
            profileError
          );
        }
      } catch (
        profileError
      ) {
        console.warn(
          '[ShopContext] Signup profile synchronization notice:',
          profileError
        );
      }

      // ----------------------------------------------------------
      // Clean temporary signup data
      // ----------------------------------------------------------

      try {
        localStorage.removeItem(
          'yallalb_signup_profile_temp'
        );
      } catch {}

      // ----------------------------------------------------------
      // Supabase email confirmation state
      // ----------------------------------------------------------

      if (
        !supaAuthData.session
      ) {
        /*
         * Email confirmation is required.
         * Supabase has created the Auth user but has not established
         * a normal authenticated session yet.
         */
        showToast(
          language === 'ar'
            ? 'تم إنشاء الحساب! تحقق من بريدك الإلكتروني واضغط على رابط التفعيل للمتابعة.'
            : 'Account created! Check your email and click the verification link to continue.',
          'success'
        );
      } else {
        /*
         * This can happen when email confirmation is disabled
         * in the Supabase project.
         */
        showToast(
          language === 'ar'
            ? 'تم إنشاء الحساب بنجاح!'
            : 'Account created successfully!',
          'success'
        );
      }

      return authUser;
    } catch (
      error: any
    ) {
      console.error(
        '[ShopContext] Supabase signup error:',
        error
      );

      const kind =
        classifyAuthError(
          error
        );

      let msg: string;

      switch (
        kind
      ) {
        case 'already_registered':
          msg =
            language === 'ar'
              ? 'هذا البريد الإلكتروني مستخدم بالفعل. إذا كان لديك حساب، يرجى تسجيل الدخول بدلاً من إنشاء حساب جديد.'
              : 'This email is already in use. If you already have an account, please sign in instead.';
          break;

        case 'weak_password':
          msg =
            language === 'ar'
              ? 'كلمة المرور ضعيفة. يرجى اختيار كلمة مرور أقوى.'
              : 'Password is too weak. Please choose a stronger password.';
          break;

        case 'invalid_email':
          msg =
            language === 'ar'
              ? 'عنوان البريد الإلكتروني غير صالح.'
              : 'Invalid email address format.';
          break;

        case 'rate_limited':
          msg =
            language === 'ar'
              ? 'تم إجراء عدد كبير من محاولات التسجيل. يرجى الانتظار قليلاً ثم المحاولة مرة أخرى.'
              : 'Too many sign-up attempts. Please wait a moment and try again.';
          break;

        case 'network':
          msg =
            language === 'ar'
              ? 'تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت والمحاولة مرة أخرى.'
              : 'Network connection error. Please check your internet connection and try again.';
          break;

        default:
          msg =
            language === 'ar'
              ? 'فشل إنشاء الحساب. يرجى المحاولة مرة أخرى.'
              : 'Sign up failed. Please try again.';
          break;
      }

      showToast(
        msg,
        'warning'
      );

      throw error;
    }
  };

  // ============================================================
  // Passwordless Email Sign-In Link / Magic Link
  // ============================================================

  const sendEmailSignInLink =
    async (
      email: string
    ) => {
      const cleanEmail =
        email
          .trim()
          .toLowerCase();

      if (
        !cleanEmail ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
          cleanEmail
        )
      ) {
        const msg =
          language === 'ar'
            ? 'الرجاء إدخال بريد إلكتروني صالح.'
            : 'Please enter a valid email address.';

        showToast(
          msg,
          'warning'
        );

        throw new Error(msg);
      }

      try {
        const {
          error
        } =
          await supabase.auth.signInWithOtp(
            {
              email:
                cleanEmail,

              options: {
                /*
                 * Do not set shouldCreateUser:false here unless you
                 * explicitly want to prevent passwordless signup.
                 *
                 * For a normal Yalla magic-link login flow,
                 * Supabase can create the user when appropriate.
                 */
                shouldCreateUser:
                  true,

                emailRedirectTo:
                  typeof window !==
                  'undefined'
                    ? `${window.location.origin}/account`
                    : undefined
              }
            }
          );

        if (error) {
          throw error;
        }

        if (
          typeof window !==
          'undefined'
        ) {
          window.localStorage.setItem(
            'emailForSignIn',
            cleanEmail
          );
        }

        showToast(
          language === 'ar'
            ? `تم إرسال رابط تسجيل الدخول إلى ${cleanEmail}. يرجى مراجعة بريدك الإلكتروني.`
            : `A sign-in link has been sent to ${cleanEmail}. Please check your email inbox.`,
          'success'
        );
      } catch (
        error: any
      ) {
        console.error(
          '[ShopContext] sendEmailSignInLink error:',
          error
        );

        const kind =
          classifyAuthError(
            error
          );

        if (
          kind ===
          'rate_limited'
        ) {
          showToast(
            language === 'ar'
              ? 'تم إرسال عدد كبير من الطلبات. يرجى الانتظار قليلاً ثم المحاولة مرة أخرى.'
              : 'Too many requests. Please wait a while and try again.',
            'warning'
          );
        } else if (
          kind === 'network'
        ) {
          showToast(
            language === 'ar'
              ? 'تعذر الاتصال بالخادم. يرجى المحاولة مرة أخرى.'
              : 'Could not connect to the server. Please try again.',
            'warning'
          );
        } else {
          showToast(
            language === 'ar'
              ? 'تعذر إرسال رابط تسجيل الدخول.'
              : 'Failed to send sign-in link.',
            'warning'
          );
        }

        throw error;
      }
    };
        
          const successMsg =
        language === 'ar'
          ? `تم إرسال رابط الدخول الآمن إلى ${cleanEmail}! تحقق من صندوق بريدك الإلكتروني.`
          : `Secure sign-in link sent to ${cleanEmail}! Please check your email inbox.`;

      showToast(
        successMsg,
        'success'
      );
    } catch (
      error: any
    ) {
      console.error(
        '[ShopContext] sendEmailSignInLink error:',
        error
      );

      const kind =
        classifyAuthError(
          error
        );

      if (
        kind ===
        'rate_limited'
      ) {
        showToast(
          language === 'ar'
            ? 'تم إرسال عدد كبير من الطلبات. يرجى الانتظار قليلاً ثم المحاولة مرة أخرى.'
            : 'Too many requests. Please wait a while and try again.',
          'warning'
        );
      } else if (
        kind === 'network'
      ) {
        showToast(
          language === 'ar'
            ? 'تعذر الاتصال بالخادم. يرجى المحاولة مرة أخرى.'
            : 'Could not connect to the server. Please try again.',
          'warning'
        );
      } else {
        showToast(
          language === 'ar'
            ? 'تعذر إرسال رابط تسجيل الدخول.'
            : 'Failed to send sign-in link.',
          'warning'
        );
      }

      throw error;
    }
  };

  // ============================================================
  // Complete Email OTP / Magic-Link Sign-In
  // ============================================================

  const completeEmailLinkSignIn = async (
    emailInput?: string,
    urlOrToken?: string
  ) => {
    const currentUrl =
      typeof window !== 'undefined'
        ? window.location.href
        : '';

    const storedEmail =
      typeof window !== 'undefined'
        ? window.localStorage.getItem(
            'emailForSignIn'
          ) || ''
        : '';

    const email =
      (
        emailInput ||
        storedEmail
      )
        .trim()
        .toLowerCase();

    try {
      // ----------------------------------------------------------
      // 1. Six-digit OTP
      // ----------------------------------------------------------

      if (
        urlOrToken &&
        /^\d{6}$/.test(
          urlOrToken.trim()
        ) &&
        email
      ) {
        await verifyEmailOtp(
          email,
          urlOrToken.trim(),
          'email'
        );

        return;
      }

      // ----------------------------------------------------------
      // 2. Parse callback URL
      // ----------------------------------------------------------

      const callbackUrl =
        new URL(
          urlOrToken ||
            currentUrl ||
            'http://localhost/'
        );

      const hashParams =
        new URLSearchParams(
          callbackUrl.hash.startsWith(
            '#'
          )
            ? callbackUrl.hash.slice(1)
            : callbackUrl.hash
        );

      // ----------------------------------------------------------
      // 3. Handle Supabase callback errors
      // ----------------------------------------------------------

      const callbackError =
        callbackUrl.searchParams.get(
          'error_description'
        ) ||
        callbackUrl.searchParams.get(
          'error'
        ) ||
        hashParams.get(
          'error_description'
        ) ||
        hashParams.get(
          'error'
        );

      if (callbackError) {
        throw new Error(
          decodeURIComponent(
            callbackError.replace(
              /\+/g,
              ' '
            )
          )
        );
      }

      // ----------------------------------------------------------
      // 4. Explicit token_hash verification
      // ----------------------------------------------------------
      //
      // This is required for email templates that use:
      // ?token_hash=...&type=...
      //
      // PKCE ?code=... is handled by Supabase Auth because
      // detectSessionInUrl=true in src/lib/supabase.ts.
      // ----------------------------------------------------------

      const tokenHash =
        callbackUrl.searchParams.get(
          'token_hash'
        );

      const linkType =
        callbackUrl.searchParams.get(
          'type'
        );

      if (tokenHash) {
        const allowedTypes =
          [
            'email',
            'signup',
            'magiclink',
            'recovery'
          ] as const;

        const resolvedType =
          allowedTypes.includes(
            linkType as any
          )
            ? (linkType as
                | 'email'
                | 'signup'
                | 'magiclink'
                | 'recovery')
            : 'magiclink';

        const {
          error:
            verifyError
        } =
          await supabase.auth.verifyOtp(
            {
              token_hash:
                tokenHash,
              type:
                resolvedType
            }
          );

        if (verifyError) {
          throw verifyError;
        }
      }

      // ----------------------------------------------------------
      // 5. Wait for Supabase session
      // ----------------------------------------------------------

      /*
       * detectSessionInUrl is enabled in the Supabase client.
       * Supabase therefore handles the PKCE ?code=... callback.
       *
       * getSession() retrieves the resulting session.
       */
      const {
        data,
        error
      } =
        await supabase.auth.getSession();

      if (error) {
        throw error;
      }

      const sessionUser =
        data.session?.user;

      if (!sessionUser) {
        throw new Error(
          language === 'ar'
            ? 'رابط تسجيل الدخول غير صالح أو انتهت صلاحيته.'
            : 'Sign-in link is invalid or has expired.'
        );
      }

      // ----------------------------------------------------------
      // 6. Clean callback information
      // ----------------------------------------------------------

      if (
        typeof window !==
        'undefined'
      ) {
        window.localStorage.removeItem(
          'emailForSignIn'
        );

        [
          'code',
          'token_hash',
          'type',
          'error',
          'error_code',
          'error_description',
          'emailSignIn'
        ].forEach(
          key =>
            callbackUrl.searchParams.delete(
              key
            )
        );

        callbackUrl.hash = '';

        const cleanedUrl =
          `${callbackUrl.pathname || '/'}${
            callbackUrl.search
          }`;

        window.history.replaceState(
          {},
          document.title,
          cleanedUrl
        );
      }

      /*
       * The Supabase auth state listener will now hydrate:
       *   - authUser
       *   - profile
       *   - cart
       *   - wishlist
       *   - seller/admin UI state
       */
      showToast(
        language === 'ar'
          ? 'تم تسجيل الدخول بنجاح عبر البريد الإلكتروني!'
          : 'Successfully signed in via email!',
        'success'
      );

      return sessionUser;
    } catch (
      error: any
    ) {
      console.error(
        '[ShopContext] completeEmailLinkSignIn error:',
        error
      );

      const kind =
        classifyAuthError(
          error
        );

      let msg: string;

      if (
        kind ===
        'network'
      ) {
        msg =
          language === 'ar'
            ? 'تعذر الاتصال بالخادم. يرجى المحاولة مرة أخرى.'
            : 'Could not connect to the server. Please try again.';
      } else if (
        kind ===
        'rate_limited'
      ) {
        msg =
          language === 'ar'
            ? 'تم إجراء محاولات كثيرة. يرجى الانتظار قليلاً ثم المحاولة مرة أخرى.'
            : 'Too many attempts. Please wait a while and try again.';
      } else {
        msg =
          language === 'ar'
            ? 'رابط تسجيل الدخول غير صالح أو انتهت صلاحيته.'
            : 'Sign-in link is invalid or has expired.';
      }

      showToast(
        msg,
        'warning'
      );

      throw error;
    }
  };

  // ============================================================
  // Email + Password Sign-In
  // ============================================================

  const signInWithEmail = async (
    email: string,
    pass: string
  ) => {
    const cleanEmail =
      email
        .trim()
        .toLowerCase();

    if (
      !cleanEmail ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        cleanEmail
      )
    ) {
      const msg =
        language === 'ar'
          ? 'الرجاء إدخال بريد إلكتروني صالح.'
          : 'Please enter a valid email address.';

      showToast(
        msg,
        'warning'
      );

      throw new Error(msg);
    }

    if (!pass) {
      const msg =
        language === 'ar'
          ? 'الرجاء إدخال كلمة المرور.'
          : 'Please enter your password.';

      showToast(
        msg,
        'warning'
      );

      throw new Error(msg);
    }

    try {
      const {
        data,
        error
      } =
        await executeWithRetry(
          () =>
            supabase.auth.signInWithPassword(
              {
                email:
                  cleanEmail,
                password:
                  pass
              }
            )
        );

      if (error) {
        throw error;
      }

      if (!data.user) {
        throw new Error(
          'Supabase did not return an authenticated user.'
        );
      }

      /*
       * The auth listener is authoritative and will hydrate the
       * complete ShopContext state from Supabase.
       */
      showToast(
        language === 'ar'
          ? 'تم تسجيل الدخول بنجاح!'
          : 'Successfully signed in!',
        'success'
      );

      return data.user;
    } catch (
      error: any
    ) {
      console.error(
        '[ShopContext] Email/password authentication error:',
        error
      );

      const kind =
        classifyAuthError(
          error
        );

      let msg: string;

      switch (
        kind
      ) {
        case 'invalid_credentials':
        case 'not_found':
          msg =
            language === 'ar'
              ? 'البريد الإلكتروني أو كلمة المرور غير صحيحة. إذا نسيت كلمة المرور، يرجى استخدام "نسيت كلمة المرور؟".'
              : 'Incorrect email or password. If you forgot your password, please use "Forgot Password?".';
          break;

        case 'unconfirmed_email':
          msg =
            language === 'ar'
              ? 'يرجى تأكيد بريدك الإلكتروني أولاً. تحقق من صندوق بريدك الإلكتروني للحصول على رابط التفعيل.'
              : 'Please confirm your email address first. Check your inbox for the verification link.';
          break;

        case 'network':
          msg =
            language === 'ar'
              ? 'تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت والمحاولة مرة أخرى.'
              : 'Network connection error. Please check your internet connection and try again.';
          break;

        case 'invalid_email':
          msg =
            language === 'ar'
              ? 'عنوان البريد الإلكتروني غير صالح.'
              : 'Invalid email address format.';
          break;

        case 'rate_limited':
          msg =
            language === 'ar'
              ? 'تم إجراء محاولات كثيرة. يرجى الانتظار قليلاً ثم المحاولة مرة أخرى.'
              : 'Too many attempts. Please wait a moment and try again.';
          break;

        default:
          msg =
            language === 'ar'
              ? 'تعذر تسجيل الدخول. يرجى المحاولة مرة أخرى.'
              : 'Authentication failed. Please try again.';
          break;
      }

      showToast(
        msg,
        'warning'
      );

      throw error;
    }
  };

  // ============================================================
  // Sign Out
  // ============================================================

  const signOutUser = async () => {
    try {
      const {
        error
      } =
        await supabase.auth.signOut();

      if (error) {
        throw error;
      }

      /*
       * Reset local UI state immediately.
       * The Supabase auth listener will also receive SIGNED_OUT and
       * keep the application state synchronized.
       */
      setAuthUser(
        null
      );

      setUser(
        INITIAL_USER
      );

      setIsAdminUser(
        false
      );

      setIsSellerUser(
        false
      );

      setSellerId(
        null
      );

      setIsLocalAdminUnlockedState(
        false
      );

      setOrders(
        []
      );

      /*
       * Prevent authenticated cart/wishlist data from being
       * accidentally persisted under the next account.
       */
      setCartHydratedForUserId(
        null
      );

      try {
        localStorage.removeItem(
          'yallalb_orders'
        );

        localStorage.removeItem(
          'yallalb_saved_checkout_data'
        );

        localStorage.removeItem(
          'emailForSignIn'
        );

        localStorage.removeItem(
          'yallalb_admin_unlocked'
        );
      } catch {}

      showToast(
        language === 'ar'
          ? 'تم تسجيل الخروج بنجاح.'
          : 'Signed out successfully.',
        'info'
      );
    } catch (
      error: any
    ) {
      console.error(
        '[ShopContext] Supabase signOut error:',
        error
      );

      /*
       * If the local session is already gone, still reset the UI.
       */
      setAuthUser(
        null
      );

      setUser(
        INITIAL_USER
      );

      setIsAdminUser(
        false
      );

      setIsSellerUser(
        false
      );

      setSellerId(
        null
      );

      setIsLocalAdminUnlockedState(
        false
      );

      setOrders(
        []
      );

      setCartHydratedForUserId(
        null
      );

      showToast(
        language === 'ar'
          ? 'تم تسجيل الخروج.'
          : 'Signed out.',
        'info'
      );
    }
  };
        
    const refreshUserProfile = async () => {
    try {
      // ----------------------------------------------------------
      // Get the currently authenticated Supabase user
      // ----------------------------------------------------------

      const {
        data: authData,
        error: authError
      } =
        await supabase.auth.getUser();

      if (authError) {
        console.warn(
          '[ShopContext] Unable to retrieve Supabase user:',
          authError
        );
        return;
      }

      const supaUser =
        authData?.user;

      if (!supaUser) {
        // No authenticated user: reset user-related UI state.
        setAuthUser(null);
        setIsAdminUser(false);
        setIsSellerUser(false);
        setSellerId(null);
        setIsEmailVerified(false);
        setUser(INITIAL_USER);
        return;
      }

      // ----------------------------------------------------------
      // Load only the profile fields required by the application
      // ----------------------------------------------------------
      //
      // Do not use SELECT * here.
      // Explicit columns prevent accidental exposure/use of newly
      // added private columns and keep the client contract clear.
      // ----------------------------------------------------------

      const {
        data: profile,
        error: profileError
      } =
        await supabase
          .from('profiles')
          .select(
            [
              'id',
              'name',
              'first_name',
              'last_name',
              'email',
              'phone',
              'avatar',
              'default_address',
              'default_city',
              'default_region',
              'default_country',
              'role',
              'seller_id',
              'email_verified',
              'is_otp_verified',
              'created_at',
              'updated_at'
            ].join(',')
          )
          .eq(
            'id',
            supaUser.id
          )
          .maybeSingle();

      if (profileError) {
        /*
         * Fail closed.
         *
         * A profile/RLS error must NEVER result in assuming the user
         * is an admin or seller.
         */
        console.warn(
          '[ShopContext] Failed to load Supabase profile:',
          profileError
        );
      }

      // ----------------------------------------------------------
      // Determine UI role from the database profile
      // ----------------------------------------------------------
      //
      // This is used only for UI behavior.
      // Supabase RLS remains the actual security boundary.
      // ----------------------------------------------------------

      let profileRole:
        | 'admin'
        | 'seller'
        | 'customer' =
        'customer';

      let profileSellerId:
        | string
        | null =
        null;

      const profileData:
        Record<string, any> =
        profile &&
        !profileError
          ? profile
          : {};

      if (
        !profileError &&
        profile
      ) {
        if (
          profile.role ===
          'admin'
        ) {
          profileRole =
            'admin';
        } else if (
          profile.role ===
          'seller'
        ) {
          profileRole =
            'seller';
        }

        if (
          profile.seller_id
        ) {
          profileSellerId =
            profile.seller_id;
        }
      }

      const hasAdminRole =
        profileRole ===
        'admin';

      const hasSellerRole =
        profileRole ===
        'seller';

      // ----------------------------------------------------------
      // Email verification
      // ----------------------------------------------------------
      //
      // Supabase Auth is authoritative for actual email confirmation.
      // Do not trust profiles.email_verified as the primary source.
      // ----------------------------------------------------------

      const emailVerified =
        Boolean(
          supaUser.email_confirmed_at
        );

      setIsEmailVerified(
        emailVerified
      );

      // ----------------------------------------------------------
      // UI authorization state
      // ----------------------------------------------------------

      setIsAdminUser(
        hasAdminRole
      );

      setIsSellerUser(
        hasSellerRole
      );

      setSellerId(
        profileSellerId
      );

      // ----------------------------------------------------------
      // Create the compatibility AuthUser object
      // ----------------------------------------------------------

      const userAdapter =
        createAuthUserAdapter(
          supaUser,
          profileRole,
          profileSellerId,
          profileData
        );

      setAuthUser(
        userAdapter
      );

      // ----------------------------------------------------------
      // Recover cached checkout/shipping information
      // ----------------------------------------------------------

      let cachedShipping:
        Partial<UserProfile> =
        {};

      try {
        const rawCache =
          localStorage.getItem(
            'yallalb_saved_checkout_data'
          );

        if (rawCache) {
          cachedShipping =
            JSON.parse(
              rawCache
            );
        }
      } catch {
        cachedShipping = {};
      }

      // ----------------------------------------------------------
      // Build safe fallback names
      // ----------------------------------------------------------

      const metadataName =
        typeof supaUser
          .user_metadata
          ?.name === 'string'
          ? supaUser
              .user_metadata
              .name
          : '';

      const fallbackNames = {
        firstName:
          profileData.first_name ||
          '',

        lastName:
          profileData.last_name ||
          '',

        name:
          profileData.name ||
          metadataName ||
          ''
      };

      // ----------------------------------------------------------
      // Map the authoritative Supabase profile into ShopContext
      // ----------------------------------------------------------

      const safeUser =
        mapSafeShopUserProfile(
          profileData,
          userAdapter,
          profileSellerId,
          cachedShipping,
          fallbackNames
        );

      /*
       * Ensure the Auth-confirmed email state is reflected in the
       * application profile as well.
       *
       * This does NOT write anything to Supabase.
       */
      setUser({
        ...safeUser,
        email:
          safeUser.email ||
          supaUser.email ||
          '',
        emailVerified
      });
    } catch (
      error
    ) {
      /*
       * Never elevate privileges when profile refresh fails.
       */
      console.warn(
        '[ShopContext] refreshUserProfile notice:',
        error
      );

      setIsAdminUser(false);
      setIsSellerUser(false);
      setSellerId(null);
    }
  };
          
    // ============================================================
  // Cart
  // ============================================================

  const removeFromCart = (
    productId: string
  ) => {
    setCart(prev =>
      prev.filter(
        item =>
          item.product.id !==
          productId
      )
    );

    showToast(
      language === 'ar'
        ? 'تمت إزالة المنتج من السلة'
        : 'Item removed from cart',
      'info'
    );
  };

  const updateQuantity = (
    productId: string,
    quantity: number
  ) => {
    if (quantity <= 0) {
      removeFromCart(
        productId
      );
      return;
    }

    const currentProduct =
      products.find(
        product =>
          product.id ===
          productId
      );

    const availableStock =
      currentProduct &&
      Number.isFinite(
        Number(
          currentProduct.stock
        )
      )
        ? Math.max(
            0,
            Math.floor(
              Number(
                currentProduct.stock
              )
            )
          )
        : 0;

    /*
     * If the product disappeared or is now out of stock,
     * do not leave an impossible quantity in the cart.
     */
    if (
      !currentProduct ||
      availableStock <= 0
    ) {
      setCart(prev =>
        prev.filter(
          item =>
            item.product.id !==
            productId
        )
      );

      showToast(
        language === 'ar'
          ? 'هذا المنتج لم يعد متوفراً.'
          : 'This product is no longer available.',
        'warning'
      );

      return;
    }

    const finalQty =
      Math.min(
        Math.max(
          1,
          Math.floor(
            quantity
          )
        ),
        availableStock
      );

    if (
      finalQty !==
      quantity
    ) {
      showToast(
        language === 'ar'
          ? `عذراً، المخزون المتاح هو ${availableStock} قطع فقط`
          : `Sorry, only ${availableStock} items are available in stock`,
        'warning'
      );
    }

    setCart(prev =>
      prev.map(item =>
        item.product.id ===
        productId
          ? {
              ...item,
              quantity:
                finalQty,
              /*
               * Keep the latest product data from Supabase
               * instead of retaining a stale cart snapshot.
               */
              product:
                currentProduct
            }
          : item
      )
    );
  };

  const clearCart = () => {
    setCart([]);
  };

  // ============================================================
  // Wishlist
  // ============================================================

  const toggleWishlist = (
    productId: string
  ) => {
    setWishlist(prev => {
      const exists =
        prev.includes(
          productId
        );

      if (exists) {
        showToast(
          language === 'ar'
            ? 'تمت إزالة المنتج من المفضلة'
            : 'Removed from saved favorites',
          'info'
        );

        return prev.filter(
          id =>
            id !== productId
        );
      }

      showToast(
        language === 'ar'
          ? 'تمت إضافة المنتج إلى المفضلة'
          : 'Saved to your favorites!',
        'success'
      );

      /*
       * Avoid duplicate UUIDs even if the function is triggered
       * more than once before React finishes the state update.
       */
      return [
        ...new Set([
          ...prev,
          productId
        ])
      ];
    });
  };

  const removeFromWishlist = (
    productId: string
  ) => {
    setWishlist(prev =>
      prev.filter(
        id =>
          id !== productId
      )
    );

    showToast(
      language === 'ar'
        ? 'تمت إزالة المنتج من المفضلة'
        : 'Removed from saved favorites',
      'info'
    );
  };

  const isInWishlist = (
    productId: string
  ) =>
    wishlist.includes(
      productId
    );

  const clearWishlist = () => {
    setWishlist([]);
  };

  // ============================================================
  // Cart Totals
  // ============================================================

  const rawSubtotalUSD =
    Math.round(
      cart.reduce(
        (
          sum,
          item
        ) =>
          sum +
          Number(
            item.product
              .priceUSD
          ) *
            item.quantity,
        0
      ) * 100
    ) / 100;

  const cartCount =
    cart.reduce(
      (
        sum,
        item
      ) =>
        sum +
        item.quantity,
      0
    );

  // ============================================================
  // Coupon
  // ============================================================

  const [
    appliedCouponCode,
    setAppliedCouponCode
  ] =
    useState<string>(() => {
      try {
        return (
          localStorage.getItem(
            'yallalb_applied_coupon'
          ) || ''
        )
          .trim()
          .toUpperCase();
      } catch {
        return '';
      }
    });

  /*
   * Coupon code is only a client-side checkout preference/cache.
   *
   * The actual coupon validity, discount and final order total MUST
   * be revalidated by the Supabase checkout RPC.
   */
  useEffect(() => {
    try {
      if (
        appliedCouponCode
      ) {
        localStorage.setItem(
          'yallalb_applied_coupon',
          appliedCouponCode
        );
      } else {
        localStorage.removeItem(
          'yallalb_applied_coupon'
        );
      }
    } catch {}
  }, [
    appliedCouponCode
  ]);

  // ============================================================
  // New Customer
  // ============================================================

  const isNewUser =
    useMemo(() => {
      if (!authUser) {
        return true;
      }

      const userOrdersCount =
        orders.filter(
          order =>
            order.userId ===
            authUser.uid
        ).length;

      return (
        userOrdersCount ===
        0
      );
    }, [
      authUser,
      orders
    ]);

  // ============================================================
  // Client-Side Discount Preview
  // ============================================================
  //
  // This is for displaying an estimated cart discount only.
  // It is NOT trusted during checkout.
  //
  // private.checkout_create_order must independently calculate:
  //   - product prices
  //   - stock
  //   - discounts
  //   - coupon
  //   - bundles
  //   - delivery
  //   - final total
  // ============================================================

  const discountCalculation =
    useMemo(() => {
      return applyDiscounts(
        cart,
        discountRules,
        {
          couponCode:
            appliedCouponCode,
          isNewUser,
          productBundles
        }
      );
    }, [
      cart,
      discountRules,
      appliedCouponCode,
      isNewUser,
      productBundles
    ]);

  const discountUSD =
    discountCalculation.discountUSD;

  const finalCartTotalUSD =
    discountCalculation.finalSubtotalUSD;

  const appliedDiscountRules =
    discountCalculation.appliedRules;

  /*
   * Backwards-compatible consumer name.
   */
  const cartTotalUSD =
    finalCartTotalUSD;

  // ============================================================
  // Apply Coupon
  // ============================================================

  const applyCoupon =
    useCallback(
      (
        code: string
      ): boolean => {
        const normalized =
          code
            .trim()
            .toUpperCase();

        if (!normalized) {
          return false;
        }

        /*
         * This is only a UI preview.
         * The server will revalidate the coupon during checkout.
         */
        const testResult =
          applyDiscounts(
            cart,
            discountRules,
            {
              couponCode:
                normalized,
              isNewUser,
              productBundles
            }
          );

        if (
          testResult.discountUSD >
          0
        ) {
          setAppliedCouponCode(
            normalized
          );

          showToast(
            language === 'ar'
              ? `تم تطبيق الكوبون (${normalized}) بنجاح! وفرت $${testResult.discountUSD.toFixed(2)}`
              : `Coupon (${normalized}) applied! You saved $${testResult.discountUSD.toFixed(2)}`,
            'success'
          );

          return true;
        }

        showToast(
          language === 'ar'
            ? 'رمز الكوبون غير صالح أو لم يستوفِ الحد الأدنى للشراء'
            : 'Coupon is invalid or does not meet minimum order requirements',
          'warning'
        );

        return false;
      },
      [
        cart,
        discountRules,
        language,
        isNewUser,
        productBundles
      ]
    );

  const removeCoupon =
    useCallback(() => {
      setAppliedCouponCode(
        ''
      );

      showToast(
        language === 'ar'
          ? 'تمت إزالة الكوبون'
          : 'Coupon code removed',
        'info'
      );
    }, [
      language
    ]);

  // ============================================================
  // Product Bundle
  // ============================================================

  const addBundleToCart =
    useCallback(
      (
        bundleId: string
      ) => {
        const bundle =
          productBundles.find(
            item =>
              item.id ===
              bundleId
          );

        if (!bundle) {
          return;
        }

        const itemsToAdd =
          products.filter(
            product =>
              bundle.productIds.includes(
                product.id
              )
          );

        if (
          itemsToAdd.length ===
          0
        ) {
          showToast(
            language === 'ar'
              ? 'المنتجات في هذه الباقة غير متوفرة حالياً'
              : 'Bundle products are currently unavailable',
            'warning'
          );

          return;
        }

        /*
         * Update the cart once instead of calling setCart once per
         * product. This prevents multiple asynchronous state updates
         * and makes the operation atomic from the React UI perspective.
         */
        setCart(prev => {
          const nextCart =
            [...prev];

          for (
            const product of
              itemsToAdd
          ) {
            const availableStock =
              Number.isFinite(
                Number(
                  product.stock
                )
              )
                ? Math.max(
                    0,
                    Math.floor(
                      Number(
                        product.stock
                      )
                    )
                  )
                : 0;

            if (
              availableStock <=
              0
            ) {
              continue;
            }

            const existingIndex =
              nextCart.findIndex(
                item =>
                  item.product.id ===
                  product.id
              );

            if (
              existingIndex >
              -1
            ) {
              const existing =
                nextCart[
                  existingIndex
                ];

              nextCart[
                existingIndex
              ] = {
                ...existing,
                product,
                quantity:
                  Math.min(
                    existing.quantity +
                      1,
                    availableStock
                  )
              };
            } else {
              nextCart.push({
                product,
                quantity: 1
              });
            }
          }

          return nextCart;
        });

        showToast(
          language === 'ar'
            ? `تمت إضافة صفقة "${bundle.nameAr || bundle.name}" إلى سلة التسوق!`
            : `Added "${bundle.name}" Combo Deal to your cart!`,
          'success'
        );
      },
      [
        productBundles,
        products,
        language
      ]
    );

  // ============================================================
  // Search Logging
  // ============================================================

  const lastLoggedSearchRef =
    useRef<{
      query: string;
      time: number;
    }>({
      query: '',
      time: 0
    });

  const logSearchQuery =
    useCallback(
      async (
        query: string,
        origin:
          | 'navbar'
          | 'products_page'
          | 'mobile_menu'
          | 'direct' =
          'direct'
      ) => {
        const trimmed =
          query.trim();

        if (
          trimmed.length <
          2
        ) {
          return;
        }

        // Prevent duplicate consecutive searches within 6 seconds.
        const now =
          Date.now();

        if (
          lastLoggedSearchRef
            .current
            .query
            .toLowerCase() ===
            trimmed.toLowerCase() &&
          now -
            lastLoggedSearchRef
              .current.time <
            6000
        ) {
          return;
        }

        lastLoggedSearchRef.current =
          {
            query:
              trimmed,
            time:
              now
          };

        /*
         * Keep a local cache for admin/UI convenience and offline
         * behavior, but do not generate the database ID client-side.
         */
        try {
          if (
            typeof window !==
              'undefined' &&
            window.localStorage
          ) {
            const raw =
              localStorage.getItem(
                'yallalb_search_logs_cache'
              );

            const list: SearchLog[] =
              raw
                ? JSON.parse(
                    raw
                  )
                : [];

            const searchEntry: SearchLog =
              {
                id:
                  `local_${Date.now()}_${secureRandomString(5)}`,
                query:
                  trimmed,
                timestamp:
                  new Date().toISOString(),
                userId:
                  authUser?.uid ||
                  null,
                userEmail:
                  authUser?.email ||
                  user?.email ||
                  null,
                userName:
                  user?.name ||
                  null,
                origin
              };

            list.unshift(
              searchEntry
            );

            localStorage.setItem(
              'yallalb_search_logs_cache',
              JSON.stringify(
                list.slice(
                  0,
                  200
                )
              )
            );
          }
        } catch (
          cacheError
        ) {
          console.warn(
            '[ShopContext] Search cache notice:',
            cacheError
          );
        }

        // --------------------------------------------------------
        // Supabase is authoritative.
        // --------------------------------------------------------
        //
        // Do not send userEmail/userName to the database.
        // The database should derive identity from auth.uid().
        //
        // Anonymous searches can be stored with NULL user_id if
        // the RLS policy permits anonymous inserts.
        // --------------------------------------------------------

        try {
          await supabase
            .from(
              'search_logs'
            )
            .insert({
              query:
                trimmed,
              user_id:
                authUser?.uid ||
                null,
              origin
            });
        } catch (
          error
        ) {
          /*
           * Search analytics must never break the shopping experience.
           */
          console.warn(
            '[ShopContext] Failed to persist search log to Supabase:',
            error
          );
        }
      },
      [
        authUser,
        user
      ]
    );

  // ============================================================
  // Place Order
  // ============================================================
  //
  // KEEP YOUR EXISTING placeOrder FUNCTION BELOW THIS POINT.
  //
  // The checkout RPC remains authoritative for:
  //   - prices
  //   - stock
  //   - discounts
  //   - coupons
  //   - bundles
  //   - delivery
  //   - final total
  //   - order creation
  //   - idempotency
  //
                
     // ============================================================
    // AUTHORITATIVE CHECKOUT
    // ============================================================

    const rawShipping =
      orderData.shipping ||
      ({} as Order['shipping']);

    const chosenSpeed =
      rawShipping.deliverySpeed ||
      'standard';

    /*
     * The browser only sends customer selections.
     *
     * Supabase remains authoritative for:
     * - product prices
     * - stock
     * - discounts
     * - coupons
     * - bundles
     * - delivery fees
     * - final total
     * - order creation
     * - order items
     * - stock decrement
     * - idempotency
     */
    const normalizedItems =
      lineItems.map(item => ({
        productId:
          item.product.id,

        quantity:
          Math.max(
            1,
            Math.floor(
              Number(
                item.quantity
              ) || 1
            )
          ),

        ...(item.selectedOption
          ? {
              selectedOption:
                item.selectedOption
            }
          }
          : {})
      }));

    if (
      normalizedItems.length ===
      0
    ) {
      const errorMessage =
        language === 'ar'
          ? 'سلة التسوق فارغة.'
          : 'Your cart is empty.';

      showToast(
        errorMessage,
        'warning'
      );

      throw new Error(
        errorMessage
      );
    }

    if (
      normalizedItems.length >
      MAX_ORDER_LINE_ITEMS
    ) {
      const errorMessage =
        language === 'ar'
          ? `الحد الأقصى لعدد المنتجات المختلفة في الطلب الواحد هو ${MAX_ORDER_LINE_ITEMS}. يرجى تقسيم الطلب.`
          : `Orders are limited to a maximum of ${MAX_ORDER_LINE_ITEMS} distinct items per checkout. Please split your order.`;

      showToast(
        errorMessage,
        'warning'
      );

      throw new Error(
        errorMessage
      );
    }

    const normalizedShipping = {
      fullName:
        String(
          rawShipping.fullName ||
            ''
        ).trim(),

      phone:
        String(
          rawShipping.phone ||
            ''
        ).trim(),

      email:
        String(
          rawShipping.email ||
            user?.email ||
            authUser?.email ||
            ''
        ).trim() ||
        undefined,

      governorate:
        String(
          rawShipping.governorate ||
            ''
        ).trim(),

      city:
        String(
          rawShipping.city ||
            ''
        ).trim(),

      village:
        String(
          rawShipping.village ||
            ''
        ).trim() ||
        undefined,

      street:
        String(
          rawShipping.street ||
            (rawShipping as any)
              ?.address ||
            ''
        ).trim(),

      building:
        String(
          rawShipping.building ||
            ''
        ).trim() ||
        'N/A',

      floorApartment:
        String(
          rawShipping.floorApartment ||
            ''
        ).trim() ||
        undefined,

      deliveryNotes:
        String(
          rawShipping.deliveryNotes ||
            (rawShipping as any)
              ?.notes ||
            ''
        ).trim() ||
        undefined,

      deliverySpeed:
        chosenSpeed
    };

    /*
     * Basic client-side validation.
     *
     * This is only for user experience.
     * The Supabase RPC MUST validate everything again.
     */
    if (
      !normalizedShipping.fullName ||
      !normalizedShipping.phone ||
      !normalizedShipping.governorate ||
      !normalizedShipping.city ||
      !normalizedShipping.street
    ) {
      const errorMessage =
        language === 'ar'
          ? 'يرجى إكمال معلومات التوصيل المطلوبة.'
          : 'Please complete the required delivery information.';

      showToast(
        errorMessage,
        'warning'
      );

      throw new CheckoutError(
        'INVALID_SHIPPING',
        errorMessage
      );
    }

    try {
      /*
       * ==========================================================
       * SUPABASE AUTHORITATIVE CHECKOUT
       * ==========================================================
       *
       * DO NOT calculate or send:
       * - subtotal
       * - discount amount
       * - delivery fee
       * - final total
       * - product price
       *
       * The database calculates these values from trusted data.
       */
      const placedOrder =
        await supabaseOrderService.createOrderAuthoritative({
          items:
            normalizedItems,

          shipping:
            normalizedShipping,

          paymentMethod:
            orderData.paymentMethod ||
            'cod_usd',

          currency:
            orderData.currency ||
            currency,

          couponCode:
            appliedCouponCode ||
            undefined,

          deliverySpeed:
            chosenSpeed,

          idempotencyKey
        });

      /*
       * IMPORTANT:
       *
       * Do NOT manually decrement product stock here.
       *
       * checkout_create_order must decrement stock atomically.
       * The existing Supabase Realtime products listener will refresh
       * the catalogue after the database change.
       */

      /*
       * Add the confirmed order to the current UI.
       *
       * Realtime/order refresh will reconcile the state afterward.
       */
      setOrders(prev =>
        prev.some(
          order =>
            order.id ===
            placedOrder.id
        )
          ? prev
          : [
              placedOrder,
              ...prev
            ]
      );

      /*
       * The cart is cleared ONLY after Supabase confirms the order.
       */
      clearCart();

      /*
       * The coupon is also cleared only after successful checkout.
       */
      setAppliedCouponCode(
        ''
      );

      const orderReference =
        placedOrder.trackingNumber ||
        `#${placedOrder.id.slice(
          0,
          8
        )}`;

      showToast(
        language === 'ar'
          ? `مبروك! تم تأكيد طلبك ${orderReference}.`
          : `Mabrouk! Order ${orderReference} placed and confirmed by server.`,
        'success'
      );

      return placedOrder;
    } catch (error: any) {
      /*
       * CheckoutError contains customer-safe messages.
       * Never expose raw Postgres/PostgREST/RPC errors to the DOM.
       */
      const isCheckoutError =
        error instanceof
        CheckoutError;

      const displayMsg =
        isCheckoutError
          ? error.message
          : language === 'ar'
            ? 'تعذر إتمام الطلب. يرجى المحاولة مرة أخرى.'
            : 'We could not place your order. Please try again.';

      console.error(
        '[ShopContext] placeOrder failed:',
        isCheckoutError
          ? `${error.code}: ${error.message}`
          : error
      );

      /*
       * IMPORTANT:
       *
       * Never clear the cart on failure.
       *
       * If the RPC rejected the order, the customer keeps the cart and
       * can retry. The idempotency key prevents duplicate orders when
       * the same checkout is retried.
       */
      showToast(
        displayMsg,
        'warning'
      );

      throw error;
    }
  };

  // ============================================================
  // Update Order Status
  // ============================================================

  const updateOrderStatus = async (
    orderId: string,
    status: Order['status']
  ) => {
    const targetOrder =
      orders.find(
        order =>
          order.id ===
          orderId
      );

    if (!targetOrder) {
      const errorMessage =
        language === 'ar'
          ? 'الطلب غير موجود.'
          : 'Order not found.';

      showToast(
        errorMessage,
        'warning'
      );

      throw new Error(
        errorMessage
      );
    }

    if (
      targetOrder.status ===
        'delivered' &&
      status === 'cancelled'
    ) {
      const errorMessage =
        language === 'ar'
          ? 'لا يمكن إلغاء طلب تم تسليمه بالفعل.'
          : 'Cannot cancel an order that has already been delivered.';

      showToast(
        errorMessage,
        'warning'
      );

      throw new Error(
        errorMessage
      );
    }

    dbLogger.logFormInput({
      sourceComponent:
        'AdminView',

      actionName:
        'updateOrderStatus',

      targetPath:
        `orders/${orderId}`,

      summary:
        `Updating order #${orderId} status to "${status}"`,

      payload: {
        status
      }
    });

    const {
      startTime
    } =
      dbLogger.logDbWriteStart({
        operation:
          'upsert',

        targetPath:
          `orders/${orderId}`,

        sourceComponent:
          'ShopContext',

        actionName:
          'updateOrderStatus',

        summary:
          `Persisting status change for order #${orderId}...`
      });

    const previousOrders =
      [...orders];

    try {
      /*
       * The service/RPC must enforce administrator/seller authorization
       * server-side.
       *
       * Do not perform a blind client-side update on public.orders.
       */
      const updatedOrder =
        await supabaseOrderService.updateOrderStatus(
          orderId,
          status
        );

      /*
       * Only update React state AFTER Supabase confirms the write.
       */
      setOrders(prev =>
        prev.map(order =>
          order.id ===
          orderId
            ? {
                ...order,
                ...updatedOrder,
                status
              }
            : order
        )
      );

      dbLogger.logDbWriteSuccess({
        operation:
          'upsert',

        targetPath:
          `orders/${orderId}`,

        sourceComponent:
          'ShopContext',

        actionName:
          'updateOrderStatus',

        startTime,

        summary:
          `Order ${orderId} status changed to "${status}".`
      });

      await logAdminActivity(
        'order_status',

        `Order #${orderId} status updated`,

        `Shifted fulfillment status to "${status.replace(
          /_/g,
          ' '
        )}".`
      );

      showToast(
        language === 'ar'
          ? `تم تحديث حالة الطلب إلى ${status.replace(
              /_/g,
              ' '
            )}`
          : `Order status updated to ${status.replace(
              /_/g,
              ' '
            )}`,

        'info'
      );
    } catch (error: any) {
      /*
       * Restore the previous UI state if Supabase rejected the change.
       */
      setOrders(
        previousOrders
      );

      dbLogger.logDbWriteError({
        operation:
          'upsert',

        targetPath:
          `orders/${orderId}`,

        sourceComponent:
          'ShopContext',

        actionName:
          'updateOrderStatus',

        startTime,

        summary:
          `Order ${orderId} status update failed.`,

        error
      });

      console.error(
        '[ShopContext] updateOrderStatus failed:',
        error
      );

      const message =
        language === 'ar'
          ? 'تعذر تحديث حالة الطلب.'
          : 'Failed to update order status.';

      showToast(
        message,
        'error'
      );

      throw error;
    }
  };

  // ============================================================
  // Delete Order
  // ============================================================

  const deleteOrder = async (
    orderId: string
  ) => {
    const order =
      orders.find(
        item =>
          item.id ===
          orderId
      );

    if (!order) {
      showToast(
        language === 'ar'
          ? 'الطلب غير موجود.'
          : 'Order not found.',
        'warning'
      );

      return;
    }

    if (
      order.status ===
      'delivered'
    ) {
      showToast(
        language === 'ar'
          ? 'لا يمكن حذف طلب تم تسليمه.'
          : 'Cannot delete a delivered order.',
        'warning'
      );

      return;
    }

    dbLogger.logFormInput({
      sourceComponent:
        'AdminView',

      actionName:
        'deleteOrder',

      targetPath:
        `orders/${orderId}`,

      summary:
        `Admin deleting order #${orderId}`
    });

    const {
      startTime
    } =
      dbLogger.logDbWriteStart({
        operation:
          'delete',

        targetPath:
          `orders/${orderId}`,

        sourceComponent:
          'ShopContext',

        actionName:
          'deleteOrder',

        summary:
          `Deleting order ${orderId}...`
      });

    const previousOrders =
      [...orders];

    try {
      /*
       * Authoritative server-side deletion.
       *
       * This must be implemented through the secure Supabase RPC/service
       * rather than a direct browser-side delete.
       */
      await supabaseOrderService.deleteOrder(
        orderId
      );
    } catch (
      error: any
    ) {
      dbLogger.logDbWriteError({
        operation:
          'delete',

        targetPath:
          `orders/${orderId}`,

        sourceComponent:
          'ShopContext',

        actionName:
          'deleteOrder',

        startTime,

        summary:
          `Delete of order ${orderId} was refused.`,

        error
      });

      setOrders(
        previousOrders
      );

      console.error(
        '[ShopContext] deleteOrder failed:',
        error
      );

      const detail =
        String(
          error?.message ||
            ''
        );

      const errorCode =
        String(
          error?.code ||
            ''
        );

      let message: string;

      if (
        errorCode ===
          '42501' ||
        detail
          .toLowerCase()
          .includes(
            'administrator'
          ) ||
        detail
          .toLowerCase()
          .includes(
            'admin'
          )
      ) {
        message =
          language === 'ar'
            ? 'فقط المسؤول يمكنه حذف الطلب.'
            : 'Only an administrator may delete an order.';
      } else if (
        detail
          .toLowerCase()
          .includes(
            'delivered'
          )
      ) {
        message =
          language === 'ar'
            ? 'لا يمكن حذف طلب تم تسليمه.'
            : 'Cannot delete a delivered order.';
      } else {
        message =
          language === 'ar'
            ? 'تعذر حذف الطلب.'
            : 'Failed to delete the order.';
      }

      showToast(
        message,
        'error'
      );

      throw error;
    }

    dbLogger.logDbWriteSuccess({
      operation:
        'delete',

      targetPath:
        `orders/${orderId}`,

      sourceComponent:
        'ShopContext',

      actionName:
        'deleteOrder',

      startTime,

      summary:
        `Order ${orderId} deleted from orders.`
    });

    /*
     * Update the UI only after the database confirms deletion.
     *
     * Do not use localStorage as the source of truth.
     */
    setOrders(prev =>
      prev.filter(
        order =>
          order.id !==
          orderId
      )
    );

    await logAdminActivity(
      'order_delete',

      `Order #${orderId} deleted`,

      `Permanently removed order #${orderId} from system.`
    );

    showToast(
      language === 'ar'
        ? 'تم حذف الطلب بنجاح.'
        : 'Order deleted!',
      'success'
    );
  };

  // ============================================================
// Add product - writes products, product_private and product_images
// ============================================================

const addProduct = async (
  newProdData: Omit<Product, 'id'> & {
    id?: string;
  }
) => {
  // ----------------------------------------------------------
  // Seller authorization
  // ----------------------------------------------------------
  if (
    !isAdminUser &&
    isSellerUser
  ) {
    if (!sellerId) {
      const errorMsg =
        'Unauthorized: Your account is not linked to a registered seller workshop.';

      showToast(
        errorMsg,
        'error'
      );

      throw new Error(
        errorMsg
      );
    }

    newProdData.sellerId =
      sellerId;
  }

  // ----------------------------------------------------------
  // Duplicate seller item code
  // ----------------------------------------------------------
  if (
    newProdData.sellerItemCode
  ) {
    const targetSellerId =
      newProdData.sellerId;

    const targetSellerName =
      newProdData.artisan ||
      newProdData.seller;

    const dupCodeCheck =
      checkDuplicateProductNumber(
        newProdData.sellerItemCode,
        null,
        products,
        targetSellerId,
        targetSellerName
      );

    if (
      dupCodeCheck.isDuplicate
    ) {
      const errorMsg =
        `Duplicate seller item code: "${newProdData.sellerItemCode}" is already in use by "${dupCodeCheck.conflictingProduct?.name}" for seller "${targetSellerName || 'this seller'}".`;

      showToast(
        errorMsg,
        'error'
      );

      throw new Error(
        errorMsg
      );
    }
  }

  // ----------------------------------------------------------
  // Validate custom product ID
  // ----------------------------------------------------------
  if (newProdData.id) {
    const dupIdCheck =
      checkDuplicateProductNumber(
        newProdData.id,
        null,
        products
      );

    if (
      dupIdCheck.isDuplicate
    ) {
      const errorMsg =
        `Duplicate product ID/SKU: "${newProdData.id}" is already in use by "${dupIdCheck.conflictingProduct?.name}".`;

      showToast(
        errorMsg,
        'error'
      );

      throw new Error(
        errorMsg
      );
    }

    /*
     * products.id is UUID in Supabase.
     */
    if (
      !isUuid(
        newProdData.id
      )
    ) {
      const errorMsg =
        `Invalid product id "${newProdData.id}": products.id must be a valid UUID. Leave it blank to generate one automatically.`;

      showToast(
        errorMsg,
        'error'
      );

      throw new Error(
        errorMsg
      );
    }
  }

  // ----------------------------------------------------------
  // Separate public and private fields
  // ----------------------------------------------------------
  const {
    rating = 0,
    reviewsCount = 0,
    sellerItemCode,
    lowStockThreshold,
    lowStockNotice,
    customStockLabel,
    costPriceUSD,
    ...restProdData
  } = newProdData;

  const id =
    newProdData.id ||
    generateUuidV4();

  const nowIso =
    new Date().toISOString();

  /*
   * Public product representation.
   *
   * Sensitive merchant fields are deliberately excluded.
   */
  const publicProduct: Product =
    {
      createdAt:
        nowIso,

      updatedAt:
        nowIso,

      rating,

      reviewsCount,

      ...restProdData,

      id
    } as Product;

  delete (
    publicProduct as any
  ).sellerItemCode;

  delete (
    publicProduct as any
  ).lowStockThreshold;

  delete (
    publicProduct as any
  ).lowStockNotice;

  delete (
    publicProduct as any
  ).customStockLabel;

  delete (
    publicProduct as any
  ).costPriceUSD;

  const sanitizedProduct =
    sanitizeDocumentData(
      publicProduct
    );

  /*
   * Full UI representation.
   *
   * These private fields may be returned to authorized admin/seller
   * views by the catalog service, but must never be exposed publicly.
   */
  const newProduct: Product =
    {
      ...publicProduct,

      sellerItemCode,

      lowStockThreshold,

      lowStockNotice,

      customStockLabel,

      costPriceUSD
    };

  // ----------------------------------------------------------
  // Logging
  // ----------------------------------------------------------
  dbLogger.logFormInput({
    sourceComponent:
      'AdminView (AddProductModal)',

    actionName:
      'addProduct',

    targetPath:
      `products/${id}`,

    summary:
      `Admin created new product "${newProduct.name}" ($${newProduct.priceUSD})`,

    payload:
      sanitizedProduct
  });

  const {
    startTime
  } =
    dbLogger.logDbWriteStart({
      operation:
        'upsert',

      targetPath:
        `products/${id}`,

      sourceComponent:
        'ShopContext',

      actionName:
        'addProduct',

      summary:
        `Writing new product ${id} to Supabase...`,

      payload:
        sanitizedProduct
    });

  /*
   * Optimistic UI update.
   *
   * This is only a temporary UI/cache representation.
   * Supabase remains authoritative.
   */
  setProducts(prev => {
    const next = [
      newProduct,
      ...prev
    ];

    try {
      localStorage.setItem(
        CATALOG_CACHE_KEYS.products,
        JSON.stringify(
          next
        )
      );
    } catch {}

    return next;
  });

  // ----------------------------------------------------------
  // Authoritative Supabase write
  // ----------------------------------------------------------
  try {
    await supabaseCatalogService.upsertProduct(
      newProduct
    );

    dbLogger.logDbWriteSuccess({
      operation:
        'upsert',

      targetPath:
        `products/${id}`,

      sourceComponent:
        'ShopContext',

      actionName:
        'addProduct',

      startTime,

      summary:
        `Product ${id} successfully saved to Supabase.`
    });
  } catch (
    supaErr: any
  ) {
    /*
     * Roll back optimistic UI if Supabase rejected the write.
     */
    setProducts(prev => {
      const next =
        prev.filter(
          product =>
            product.id !==
            id
        );

      try {
        localStorage.setItem(
          CATALOG_CACHE_KEYS.products,
          JSON.stringify(
            next
          )
        );
      } catch {}

      return next;
    });

    dbLogger.logDbWriteError({
      operation:
        'upsert',

      targetPath:
        `products/${id}`,

      sourceComponent:
        'ShopContext',

      actionName:
        'addProduct',

      startTime,

      summary:
        `Supabase rejected creation of product ${id}.`,

      error:
        supaErr
    });

    console.error(
      '[ShopContext] addProduct Supabase write failed:',
      supaErr
    );

    showToast(
      language === 'ar'
        ? 'تعذر حفظ المنتج. يرجى المحاولة مرة أخرى.'
        : 'Could not save product. Please try again.',
      'error'
    );

    throw supaErr;
  }

  // ----------------------------------------------------------
  // Admin activity
  // ----------------------------------------------------------
  await logAdminActivity(
    'product_add',

    `Product "${newProduct.name}" created`,

    `Added new catalog item with ID: ${newProduct.id}, category: ${newProduct.category}, and price: $${newProduct.priceUSD}.`,

    newProduct.id,

    null,

    newProduct
  );

  showToast(
    language === 'ar'
      ? `تم حفظ المنتج "${newProduct.name}" بنجاح!`
      : `Product "${newProduct.name}" saved!`,
    'success'
  );
};


// ============================================================
// Update product
// ============================================================

const updateProduct = async (
  id: string,
  updates: Partial<Product>
) => {
  const existing =
    products.find(
      product =>
        product.id ===
        id
    );

  if (!existing) {
    const errorMsg =
      language === 'ar'
        ? 'المنتج غير موجود.'
        : 'Product not found.';

    showToast(
      errorMsg,
      'error'
    );

    throw new Error(
      errorMsg
    );
  }

  // ----------------------------------------------------------
  // Seller authorization
  // ----------------------------------------------------------
  if (
    !isAdminUser &&
    isSellerUser
  ) {
    if (
      !sellerId ||
      existing.sellerId?.toLowerCase() !==
        sellerId.toLowerCase()
    ) {
      const errorMsg =
        language === 'ar'
          ? 'غير مصرح لك بتعديل منتجات ورشتك فقط.'
          : 'Unauthorized: You can only edit products belonging to your workshop.';

      showToast(
        errorMsg,
        'error'
      );

      throw new Error(
        errorMsg
      );
    }

    updates = {
      ...updates,
      sellerId
    };
  }

  // ----------------------------------------------------------
  // Duplicate seller item code
  // ----------------------------------------------------------
  if (
    updates.sellerItemCode
  ) {
    const targetSellerId =
      updates.sellerId ||
      existing.sellerId;

    const targetSellerName =
      updates.artisan ||
      updates.seller ||
      existing.artisan ||
      existing.seller;

    const dupCodeCheck =
      checkDuplicateProductNumber(
        updates.sellerItemCode,
        id,
        products,
        targetSellerId,
        targetSellerName
      );

    if (
      dupCodeCheck.isDuplicate
    ) {
      const errorMsg =
        `Duplicate seller item code: "${updates.sellerItemCode}" is already assigned to "${dupCodeCheck.conflictingProduct?.name}" for seller "${targetSellerName || 'this seller'}".`;

      showToast(
        errorMsg,
        'error'
      );

      throw new Error(
        errorMsg
      );
    }
  }

  // ----------------------------------------------------------
  // Separate private fields
  // ----------------------------------------------------------
  const {
    sellerItemCode,
    lowStockThreshold,
    lowStockNotice,
    customStockLabel,
    costPriceUSD,
    ...publicUpdates
  } = updates;

  const nowIso =
    new Date().toISOString();

  const mergedUpdates = {
    ...updates,
    updatedAt:
      nowIso
  };

  const mergedPublicUpdates =
    {
      ...publicUpdates,
      updatedAt:
        nowIso
    };

  const sanitizedUpdates =
    sanitizeDocumentData(
      mergedPublicUpdates
    );

  // ----------------------------------------------------------
  // Logging
  // ----------------------------------------------------------
  dbLogger.logFormInput({
    sourceComponent:
      'AdminView',

    actionName:
      'updateProduct',

    targetPath:
      `products/${id}`,

    summary:
      `Admin updated product #${id} (${existing.name}): [${Object.keys(
        updates
      ).join(', ')}]`,

    payload:
      sanitizedUpdates,

    diff:
      calculateObjectDiff(
        existing as any,
        {
          ...existing,
          ...mergedUpdates
        } as any
      )
  });

  const {
    startTime
  } =
    dbLogger.logDbWriteStart({
      operation:
        'upsert',

      targetPath:
        `products/${id}`,

      sourceComponent:
        'ShopContext',

      actionName:
        'updateProduct',

      summary:
        `Persisting product #${id} updates to Supabase...`,

      payload:
        sanitizedUpdates
    });

  const previousProduct =
    existing;

  /*
   * Optimistic UI update.
   */
  setProducts(prev => {
    const next =
      prev.map(
        product =>
          product.id ===
          id
            ? {
                ...product,
                ...mergedUpdates
              }
            : product
      );

    try {
      localStorage.setItem(
        CATALOG_CACHE_KEYS.products,
        JSON.stringify(
          next
        )
      );
    } catch {}

    return next;
  });

  // ----------------------------------------------------------
  // Authoritative Supabase write
  // ----------------------------------------------------------
  try {
    /*
     * Only supplied fields are sent.
     *
     * This prevents a targeted edit such as changing price from
     * accidentally overwriting unrelated columns.
     */
    await supabaseCatalogService.upsertProduct(
      {
        ...updates,
        id
      }
    );

    dbLogger.logDbWriteSuccess({
      operation:
        'upsert',

      targetPath:
        `products/${id}`,

      sourceComponent:
        'ShopContext',

      actionName:
        'updateProduct',

      startTime,

      summary:
        `Product ${id} successfully updated in Supabase.`
    });
  } catch (
    supaErr: any
  ) {
    /*
     * Roll back optimistic state.
     */
    setProducts(prev => {
      const next =
        prev.map(
          product =>
            product.id ===
            id
              ? previousProduct
              : product
        );

      try {
        localStorage.setItem(
          CATALOG_CACHE_KEYS.products,
          JSON.stringify(
            next
          )
        );
      } catch {}

      return next;
    });

    dbLogger.logDbWriteError({
      operation:
        'upsert',

      targetPath:
        `products/${id}`,

      sourceComponent:
        'ShopContext',

      actionName:
        'updateProduct',

      startTime,

      summary:
        `Supabase rejected update of product ${id}.`,

      error:
        supaErr
    });

    console.error(
      '[ShopContext] updateProduct Supabase write failed:',
      supaErr
    );

    showToast(
      language === 'ar'
        ? 'تعذر حفظ تغييرات المنتج. يرجى المحاولة مرة أخرى.'
        : 'Could not save product changes. Please try again.',
      'error'
    );

    throw supaErr;
  }

  // ----------------------------------------------------------
  // Admin activity
  // ----------------------------------------------------------
  await logAdminActivity(
    'product_update',

    `Product "${existing.name}" updated`,

    `Modified attributes: ${Object.keys(
      updates
    ).join(', ')}.`,

    id,

    existing,

    {
      ...existing,
      ...mergedUpdates
    }
  );

  showToast(
    language === 'ar'
      ? 'تم تحديث المنتج بنجاح!'
      : 'Product updated!',
    'success'
  );
};


// ============================================================
// Delete product
// ============================================================

const deleteProduct = async (
  id: string
) => {
  /*
   * High-risk authorization is still required for administrators.
   */
  if (
    isAdminUser
  ) {
    const authorized =
      await assertHighRiskAuthorization(
        authUser?.uid
      );

    if (!authorized) {
      showToast(
        language === 'ar'
          ? 'تم إلغاء العملية أو انتهت صلاحية التحقق.'
          : 'High-risk action cancelled or verification expired.',
        'error'
      );

      throw new Error(
        'High-risk authorization failed'
      );
    }
  }

  const target =
    products.find(
      product =>
        product.id ===
        id
    );

  if (!target) {
    const errorMsg =
      language === 'ar'
        ? 'المنتج غير موجود.'
        : 'Product not found.';

    showToast(
      errorMsg,
      'warning'
    );

    return;
  }

  // ----------------------------------------------------------
  // Seller authorization
  // ----------------------------------------------------------
  if (
    !isAdminUser &&
    isSellerUser
  ) {
    if (
      !sellerId ||
      target.sellerId?.toLowerCase() !==
        sellerId.toLowerCase()
    ) {
      const errorMsg =
        language === 'ar'
          ? 'غير مصرح لك بحذف منتجات ورشتك فقط.'
          : 'Unauthorized: You can only delete products belonging to your workshop.';

      showToast(
        errorMsg,
        'error'
      );

      throw new Error(
        errorMsg
      );
    }
  }

  dbLogger.logFormInput({
    sourceComponent:
      'AdminView',

    actionName:
      'deleteProduct',

    targetPath:
      `products/${id}`,

    summary:
      `Admin deleted product #${id} ("${target.name}")`
  });

  const {
    startTime
  } =
    dbLogger.logDbWriteStart({
      operation:
        'delete',

      targetPath:
        `products/${id}`,

      sourceComponent:
        'ShopContext',

      actionName:
        'deleteProduct',

      summary:
        `Deleting product ${id} from Supabase...`
    });

  const previousProducts =
    [...products];

  /*
   * Optimistic removal.
   */
  setProducts(prev => {
    const next =
      prev.filter(
        product =>
          product.id !==
          id
      );

    try {
      localStorage.setItem(
        CATALOG_CACHE_KEYS.products,
        JSON.stringify(
          next
        )
      );
    } catch {}

    return next;
  });

  // ----------------------------------------------------------
  // Authoritative Supabase delete
  // ----------------------------------------------------------
  try {
    await supabaseCatalogService.deleteProduct(
      id
    );

    dbLogger.logDbWriteSuccess({
      operation:
        'delete',

      targetPath:
        `products/${id}`,

      sourceComponent:
        'ShopContext',

      actionName:
        'deleteProduct',

      startTime,

      summary:
        `Product ${id} deleted from Supabase.`
    });
  } catch (
    supaErr: any
  ) {
    /*
     * Restore the product if the database deletion failed.
     */
    setProducts(
      previousProducts
    );

    try {
      localStorage.setItem(
        CATALOG_CACHE_KEYS.products,
        JSON.stringify(
          previousProducts
        )
      );
    } catch {}

    dbLogger.logDbWriteError({
      operation:
        'delete',

      targetPath:
        `products/${id}`,

      sourceComponent:
        'ShopContext',

      actionName:
        'deleteProduct',

      startTime,

      summary:
        `Supabase rejected deletion of product ${id}.`,

      error:
        supaErr
    });

    console.error(
      '[ShopContext] deleteProduct Supabase delete failed:',
      supaErr
    );

    showToast(
      language === 'ar'
        ? 'تعذر حذف المنتج. يرجى المحاولة مرة أخرى.'
        : 'Could not delete product. Please try again.',
      'error'
    );

    throw supaErr;
  }

  await logAdminActivity(
    'product_delete',

    `Product "${target.name}" deleted`,

    `Permanently removed product #${id} from catalog.`,

    id,

    target,

    null
  );

  showToast(
    language === 'ar'
      ? 'تم حذف المنتج بنجاح!'
      : 'Product deleted!',
    'success'
  );
};


// ============================================================
// Mass delete products
// ============================================================

const deleteMultipleProducts =
  async (
    ids: string[]
  ) => {
    if (
      !ids ||
      ids.length === 0
    ) {
      return;
    }

    /*
     * Only valid UUID product IDs should reach Supabase.
     */
    const validIds =
      ids.filter(
        id =>
          isUuid(id)
      );

    if (
      validIds.length ===
      0
    ) {
      showToast(
        language === 'ar'
          ? 'لا توجد منتجات صالحة للحذف.'
          : 'No valid products were selected for deletion.',
        'warning'
      );

      return;
    }

    /*
     * High-risk authorization for administrators.
     */
    if (
      isAdminUser
    ) {
      const authorized =
        await assertHighRiskAuthorization(
          authUser?.uid
        );

      if (!authorized) {
        showToast(
          language === 'ar'
            ? 'تم إلغاء العملية أو انتهت صلاحية التحقق.'
            : 'High-risk action cancelled or verification expired.',
          'error'
        );

        throw new Error(
          'High-risk authorization failed'
        );
      }
    }

    /*
     * Sellers may only delete their own products.
     */
    if (
      !isAdminUser &&
      isSellerUser
    ) {
      if (!sellerId) {
        const errorMsg =
          language === 'ar'
            ? 'حساب البائع غير مرتبط بورشة.'
            : 'Your seller account is not linked to a workshop.';

        showToast(
          errorMsg,
          'error'
        );

        throw new Error(
          errorMsg
        );
      }

      const unauthorized =
        products.some(
          product =>
            validIds.includes(
              product.id
            ) &&
            product.sellerId?.toLowerCase() !==
              sellerId.toLowerCase()
        );

      if (
        unauthorized
      ) {
        const errorMsg =
          language === 'ar'
            ? 'يمكنك حذف منتجات ورشتك فقط.'
            : 'You can only delete products belonging to your workshop.';

        showToast(
          errorMsg,
          'error'
        );

        throw new Error(
          errorMsg
        );
      }
    }

    dbLogger.logFormInput({
      sourceComponent:
        'AdminView',

      actionName:
        'deleteMultipleProducts',

      targetPath:
        'products/mass_delete',

      summary:
        `Deleting ${validIds.length} products`
    });

    const {
      startTime
    } =
      dbLogger.logDbWriteStart({
        operation:
          'delete',

        targetPath:
          'products/mass_delete',

        sourceComponent:
          'ShopContext',

        actionName:
          'deleteMultipleProducts',

        summary:
          `Deleting ${validIds.length} products from Supabase...`
      });

    const previousProducts =
      [...products];

    /*
     * Optimistic UI update.
     */
    setProducts(prev => {
      const next =
        prev.filter(
          product =>
            !validIds.includes(
              product.id
            )
        );

      try {
        localStorage.setItem(
          CATALOG_CACHE_KEYS.products,
          JSON.stringify(
            next
          )
        );
      } catch {}

      return next;
    });

    try {
      /*
       * Delete each product through the authoritative catalog service.
       *
       * This preserves the existing service authorization/RLS model and
       * ensures product_private/product_images are handled consistently.
       */
      for (
        const productId of
          validIds
      ) {
        await supabaseCatalogService.deleteProduct(
          productId
        );
      }

      dbLogger.logDbWriteSuccess({
        operation:
          'delete',

        targetPath:
          'products/mass_delete',

        sourceComponent:
          'ShopContext',

        actionName:
          'deleteMultipleProducts',

        startTime,

        summary:
          `Deleted ${validIds.length} products from Supabase.`
      });
    } catch (
      supaErr: any
    ) {
      /*
       * Restore everything if any deletion failed.
       */
      setProducts(
        previousProducts
      );

      try {
        localStorage.setItem(
          CATALOG_CACHE_KEYS.products,
          JSON.stringify(
            previousProducts
          )
        );
      } catch {}

      dbLogger.logDbWriteError({
        operation:
          'delete',

        targetPath:
          'products/mass_delete',

        sourceComponent:
          'ShopContext',

        actionName:
          'deleteMultipleProducts',

        startTime,

        summary:
          'Bulk product deletion failed.',

        error:
          supaErr
      });

      console.error(
        '[ShopContext] deleteMultipleProducts failed:',
        supaErr
      );

      showToast(
        language === 'ar'
          ? 'تعذر حذف المنتجات المحددة. لم يتم اعتماد العملية بالكامل.'
          : 'Could not delete the selected products. The operation was not fully completed.',
        'error'
      );

      throw supaErr;
    }

    await logAdminActivity(
      'product_delete',

      `Bulk deleted ${validIds.length} products`,

      `Permanently removed ${validIds.length} products from catalog.`
    );

    showToast(
      language === 'ar'
        ? `تم حذف ${validIds.length} منتج بنجاح!`
        : `${validIds.length} products deleted!`,
      'success'
    );
  };


// ============================================================
// Reload catalogue from Supabase
// ============================================================

const syncAllProductsToDatabase =
  async () => {
    try {
      showToast(
        language === 'ar'
          ? 'جارٍ إعادة تحميل الكتالوج من Supabase...'
          : 'Reloading catalogue from Supabase...',
        'info'
      );

      const [
        freshProducts,
        freshCategories
      ] =
        await Promise.all([
          supabaseCatalogService.fetchProducts(
            {
              isAdmin:
                isAdminUser,

              isSeller:
                isSellerUser,

              sellerId
            }
          ),

          supabaseCatalogService.fetchCategories()
        ]);

      await refreshSellersFromSupabase();

      const normalizedProducts =
        freshProducts.map(
          ensureSellerItemCode
        );

      setProducts(
        normalizedProducts
      );

      setCategories(
        freshCategories
      );

      setCatalogStatus(
        'ready'
      );

      setCatalogError(
        null
      );

      /*
       * localStorage is only a cache.
       */
      try {
        localStorage.setItem(
          CATALOG_CACHE_KEYS.products,
          JSON.stringify(
            normalizedProducts
          )
        );

        localStorage.setItem(
          CATALOG_CACHE_KEYS.categories,
          JSON.stringify(
            freshCategories
          )
        );
      } catch {}

      showToast(
        normalizedProducts.length ===
          0
          ? language === 'ar'
            ? 'تم تحديث الكتالوج. لا توجد منتجات في قاعدة البيانات حالياً.'
            : 'Catalogue reloaded: the database has no products yet.'
          : language === 'ar'
            ? `تم تحديث الكتالوج: ${normalizedProducts.length} منتج من Supabase.`
            : `Catalogue reloaded: ${normalizedProducts.length} product(s) from Supabase.`,
        'success'
      );
    } catch (
      err: any
    ) {
      console.error(
        '[ShopContext] Catalogue reload failed:',
        err
      );

      setCatalogStatus(
        'error'
      );

      setCatalogError(
        err?.message ||
          String(err)
      );

      showToast(
        language === 'ar'
          ? 'تعذر إعادة تحميل الكتالوج.'
          : 'Could not reload the catalogue.',
        'error'
      );

      throw err;
    }
  };


// ============================================================
// Check phone number uniqueness
// ============================================================

const checkPhoneUniqueness =
  useCallback(
    async (
      phone: string,
      excludeUid?: string
    ): Promise<{
      available: boolean;
      reason?: string;
    }> => {
      /*
       * Kept for compatibility with existing callers.
       *
       * The database derives the authenticated UID from auth.uid().
       * Never allow the browser to exclude another user's UID.
       */
      void excludeUid;

      const norm =
        normalizeLebanesePhone(
          phone
        );

      if (
        !norm.isValid
      ) {
        return {
          available:
            false,

          reason:
            language === 'ar'
              ? 'يجب أن يتألف رقم الهاتف اللبناني من 8 أرقام صحيحة (مثال: 70123456 أو 03123456).'
              : 'Lebanese phone number must be strictly 8 valid digits (e.g. 70123456 or 03123456).'
        };
      }

      const {
        data,
        error
      } =
        await supabase.rpc(
          'is_phone_available',
          {
            p_phone_key:
              norm.cleanDigits
          }
        );

      if (error) {
        console.error(
          '[ShopContext] is_phone_available failed:',
          error
        );

        /*
         * This check is advisory only.
         * The unique phone_key constraint remains authoritative.
         */
        return {
          available:
            true
        };
      }

      if (
        data === false
      ) {
        return {
          available:
            false,

          reason:
            language === 'ar'
              ? 'رقم الهاتف هذا مسجل مسبقاً بحساب آخر.'
              : 'This phone number is already registered to another account.'
        };
      }

      return {
        available:
          true
      };
    },
    [
      language
    ]
  );


// ============================================================
// Update user profile
// ============================================================

const updateUser =
  async (
    updates: Partial<UserProfile>
  ) => {
    // ----------------------------------------------------------
    // Phone uniqueness
    // ----------------------------------------------------------
    if (
      updates.phone !==
        undefined &&
      updates.phone !==
        ''
    ) {
      const norm =
        normalizeLebanesePhone(
          updates.phone
        );

      if (
        norm.isValid
      ) {
        const oldNorm =
          normalizeLebanesePhone(
            user.phone
          );

        const isChanging =
          !oldNorm.isValid ||
          oldNorm.cleanDigits !==
            norm.cleanDigits;

        const userUid =
          authUser?.uid ||
          user.uid;

        if (
          isChanging
        ) {
          const check =
            await checkPhoneUniqueness(
              norm.cleanDigits,
              userUid
            );

          if (
            !check.available
          ) {
            const message =
              check.reason ||
              (
                language === 'ar'
                  ? 'رقم الهاتف مسجل مسبقاً.'
                  : 'This phone number is already registered.'
              );

            showToast(
              message,
              'warning'
            );

            throw new Error(
              message
            );
          }
        }
      }
    }

    // ----------------------------------------------------------
    // Strip privileged fields
    // ----------------------------------------------------------
    const safeUpdates =
      {
        ...updates
      };

    /*
     * These fields can NEVER be changed through the customer profile
     * update path.
     *
     * Authorization is controlled by Supabase/RLS/database functions,
     * not by this client state.
     */
    delete (
      safeUpdates as any
    ).role;

    delete (
      safeUpdates as any
    ).sellerId;

    delete (
      safeUpdates as any
    ).admin;

    delete (
      safeUpdates as any
    ).seller;

    delete (
      safeUpdates as any
    ).isAdminUser;

    delete (
      safeUpdates as any
    ).isSellerUser;

    delete (
      safeUpdates as any
    ).uid;

    delete (
      safeUpdates as any
    ).isBanned;

    delete (
      safeUpdates as any
    ).ordersPlaced;

    delete (
      safeUpdates as any
    ).emailVerified;

    delete (
      safeUpdates as any
    ).isOtpVerified;

    // ----------------------------------------------------------
    // Build local representation
    // ----------------------------------------------------------
    const updatedUser:
      UserProfile =
      {
        ...user,

        ...safeUpdates,

        uid:
          authUser?.uid ||
          user.uid,

        /*
         * Do not allow this function to manufacture admin/seller
         * privileges locally.
         */
        role:
          user.role,

        sellerId:
          user.sellerId
      };

    const sanitizedUser =
      sanitizeDocumentData(
        updatedUser
      );

    setUser(
      updatedUser
    );

    // ----------------------------------------------------------
    // Guest profile
    // ----------------------------------------------------------
    if (!authUser) {
      try {
        localStorage.setItem(
          'yallalb_saved_checkout_data',
          JSON.stringify(
            sanitizedUser
          )
        );
      } catch {}

      return;
    }

    // ----------------------------------------------------------
    // Authenticated profile
    // ----------------------------------------------------------
    const userKey =
      authUser.uid;

    const {
      startTime
    } =
      dbLogger.logDbWriteStart({
        operation:
          'upsert',

        targetPath:
          `profiles/${userKey}`,

        sourceComponent:
          'ShopContext',

        actionName:
          'updateUser',

        summary:
          `Persisting profile and delivery details for user ${userKey}...`,

        payload:
          sanitizedUser
      });

    try {
      /*
       * upsertProfile must itself restrict writable columns.
       *
       * Never allow this path to update:
       * role
       * seller_id
       * email_verified
       * is_otp_verified
       */
      await supabaseUserDataService.upsertProfile(
        userKey,
        sanitizedUser as Partial<UserProfile>
      );

      dbLogger.logDbWriteSuccess({
        operation:
          'upsert',

        targetPath:
          `profiles/${userKey}`,

        sourceComponent:
          'ShopContext',

        actionName:
          'updateUser',

        startTime,

        summary:
          `Profile ${userKey} successfully saved to Supabase.`
      });
    } catch (
      err
    ) {
      dbLogger.logDbWriteError({
        operation:
          'upsert',

        targetPath:
          `profiles/${userKey}`,

        sourceComponent:
          'ShopContext',

        actionName:
          'updateUser',

        startTime,

        summary:
          'Supabase profile update failed.',

        error:
          err
      });

      console.error(
        '[ShopContext] Failed to save the user profile:',
        err
      );

      /*
       * Restore the previous profile in the UI because the database
       * rejected the operation.
       */
      setUser(
        user
      );

      showToast(
        language === 'ar'
          ? 'تعذر حفظ بياناتك. يرجى المحاولة مرة أخرى.'
          : 'Could not save your details. Please try again.',
        'error'
      );

      throw err;
    }
  };


// ============================================================
// Navigation
// ============================================================

const navigateToProductCategory =
  (
    category: string
  ) => {
    setSelectedCategory(
      category
    );

    setActiveTab(
      'products'
    );

    window.scrollTo({
      top: 0,
      behavior:
        'smooth'
    });
  };


// ============================================================
// Provider value
// ============================================================

const providerValue =
  useMemo(
    () => ({
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

      // --------------------------------------------------------
      // Catalogue
      // --------------------------------------------------------
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

      // --------------------------------------------------------
      // Currency
      // --------------------------------------------------------
      currency,
      setCurrency,

      formatPrice,
      convertUSDToLBP,

      currencySymbol,
      currencyRate,

      // --------------------------------------------------------
      // Cart
      // --------------------------------------------------------
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

      // --------------------------------------------------------
      // Wishlist
      // --------------------------------------------------------
      wishlist,

      toggleWishlist,
      removeFromWishlist,
      isInWishlist,
      clearWishlist,

      // --------------------------------------------------------
      // Orders
      // --------------------------------------------------------
      orders,

      placeOrder,
      updateOrderStatus,
      deleteOrder,

      // --------------------------------------------------------
      // User
      // --------------------------------------------------------
      user,
      updateUser,
      checkPhoneUniqueness,

      authUser,

      /*
       * Compatibility alias.
       *
       * This MUST NOT be used for authorization.
       */
      firebaseUser:
        authUser,

      isAdminUser,
      isSellerUser,
      sellerId,
      isEmailVerified,

      // --------------------------------------------------------
      // Authentication
      // --------------------------------------------------------
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

      authStatus:
        (isLoadingAuth
          ? 'loading'
          : !authUser
            ? 'unauthenticated'
            : isAdminUser
              ? 'authenticated_admin'
              : 'authenticated_non_admin') as
          | 'loading'
          | 'unauthenticated'
          | 'authenticated_non_admin'
          | 'authenticated_admin',

      // --------------------------------------------------------
      // Search
      // --------------------------------------------------------
      searchQuery,
      setSearchQuery,
      logSearchQuery,

      // --------------------------------------------------------
      // Categories
      // --------------------------------------------------------
      selectedCategory,
      setSelectedCategory,

      categories,

      addCategory,
      updateCategory,
      deleteCategory,
      reorderCategories,

      // --------------------------------------------------------
      // Regions
      // --------------------------------------------------------
      regions,

      updateRegion,
      addRegion,
      deleteRegion,

      // --------------------------------------------------------
      // Sellers
      // --------------------------------------------------------
      sellers,

      addSeller,
      updateSeller,
      toggleSellerActive,
      deleteSeller,

      // --------------------------------------------------------
      // Toast
      // --------------------------------------------------------
      toast,
      showToast,

      // --------------------------------------------------------
      // CMS
      // --------------------------------------------------------
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

      // --------------------------------------------------------
      // Admin
      // --------------------------------------------------------
      isAdminUnlocked,
      setIsAdminUnlocked,

      recentActivities,

      logAdminActivity,
      undoAdminActivity,

      // --------------------------------------------------------
      // Discounts
      // --------------------------------------------------------
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

      // --------------------------------------------------------
      // Bundles
      // --------------------------------------------------------
      productBundles,

      addProductBundle,
      updateProductBundle,
      deleteProductBundle,

      addBundleToCart,

      // --------------------------------------------------------
      // Bulk import
      // --------------------------------------------------------
      bulkImportProducts
    }),
    [
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

      cart,
      cartTotalUSD,
      cartCount,

      isCartOpen,

      wishlist,

      orders,

      user,

      checkPhoneUniqueness,

      authUser,

      isEmailVerified,

      isAdminUser,
      isSellerUser,
      sellerId,

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
    ]
  );

return (
  <ShopContext.Provider
    value={
      providerValue
    }
  >
    {children}
  </ShopContext.Provider>
);

};

export const useShop =
  () => {
    const context =
      useContext(
        ShopContext
      );

    if (!context) {
      throw new Error(
        'useShop must be used within a ShopProvider'
      );
    }

    return context;
  };
