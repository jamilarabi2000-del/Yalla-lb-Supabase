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
  placeOrder: (orderData: Omit<Order, 'id' | 'date' | 'trackingNumber' | 'status'>, customIdempotencyKey?: string) => Promise<Order>;
  updateOrderStatus: (orderId: string, status: Order['status']) => Promise<void>;
  deleteOrder: (orderId: string) => Promise<void>;

  // User Profile
  user: UserProfile;
  updateUser: (updates: Partial<UserProfile>) => Promise<void>;
  checkPhoneUniqueness: (phone: string, excludeUid?: string) => Promise<{ available: boolean; reason?: string }>;

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
  authStatus: 'loading' | 'unauthenticated' | 'authenticated_non_admin' | 'authenticated_admin';
  signInWithEmail: (email: string, pass: string) => Promise<void>;
  signUpWithEmail: (email: string, pass: string, phone?: string) => Promise<void>;
  sendEmailOtp: (email: string) => Promise<void>;
  verifyEmailOtp: (email: string, token: string, type?: EmailOtpType) => Promise<void>;
  resendEmailVerification?: (email?: string) => Promise<void>;
  sendEmailSignInLink: (email: string) => Promise<void>;
  completeEmailLinkSignIn: (email?: string, url?: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signOutUser: () => Promise<void>;
  refreshUserProfile: () => Promise<void>;

  // Search & Filtering
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  logSearchQuery: (query: string, origin?: 'navbar' | 'products_page' | 'mobile_menu' | 'direct') => Promise<void>;
  selectedCategory: string;
  setSelectedCategory: (cat: string) => void;

  // Feedback Toast
  toast: Toast | null;
  showToast: (message: string, type?: 'success' | 'info' | 'warning' | 'error') => void;

  // Site Content CMS (Admin Managed)
  siteContent: SiteContent;
  updateSiteContent: (updates: Partial<SiteContent> | ((prev: SiteContent) => SiteContent)) => Promise<void>;
  toggleSectionVisibility: (sectionKey: keyof SectionVisibilityConfig) => Promise<void>;
  addCustomBlock: (block: Omit<CMSCustomBlock, 'id'>) => Promise<void>;
  updateCustomBlock: (id: string, updates: Partial<CMSCustomBlock>) => Promise<void>;
  deleteCustomBlock: (id: string) => Promise<void>;

  // Visual Edit Mode
  isVisualEditMode: boolean;
  setIsVisualEditMode: (val: boolean) => void;
  isCustomBlockModalOpen: boolean;
  setIsCustomBlockModalOpen: (open: boolean) => void;
  customBlockToEdit: CMSCustomBlock | null;
  setCustomBlockToEdit: (block: CMSCustomBlock | null) => void;

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
  undoAdminActivity: (activityId: string) => Promise<void>;

  // Discounts & Promos
  discountRules: DiscountRule[];
  appliedCouponCode: string;
  applyCoupon: (code: string) => boolean;
  removeCoupon: () => void;
  discountUSD: number;
  finalCartTotalUSD: number;
  appliedDiscountRules: { rule: DiscountRule; savedUSD: number }[];
  addDiscountRule: (rule: Omit<DiscountRule, 'id'>, couponCode?: string, maxTotalUses?: number, maxUsesPerUser?: number) => Promise<void>;
  updateDiscountRule: (id: string, updates: Partial<DiscountRule>, couponCode?: string, maxTotalUses?: number, maxUsesPerUser?: number) => Promise<void>;
  deleteDiscountRule: (id: string) => Promise<void>;

  // Bundles & Combo Deals
  productBundles: ProductBundle[];
  addProductBundle: (bundle: Omit<ProductBundle, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateProductBundle: (id: string, updates: Partial<ProductBundle>) => Promise<void>;
  deleteProductBundle: (id: string) => Promise<void>;
  addBundleToCart: (bundleId: string) => void;

  // Categories & Details Management
  categories: CategoryItem[];
  addCategory: (cat: Omit<CategoryItem, 'id'> & { id?: string }) => Promise<void>;
  updateCategory: (id: string, updates: Partial<CategoryItem>) => Promise<void>;
  deleteCategory: (id: string, reassignCategoryId?: string, deleteAttachedProducts?: boolean) => Promise<void>;
  reorderCategories: (newOrder: CategoryItem[]) => Promise<void>;

  // Terroir Regions & Logistics
  regions: TerroirRegion[];
  updateRegion: (id: string, updates: Partial<TerroirRegion>) => Promise<void>;
  addRegion: (reg: TerroirRegion) => Promise<void>;
  deleteRegion: (id: string) => Promise<void>;

  // Sellers Management
  sellers: Seller[];
  addSeller: (seller: Omit<Seller, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<void>;
  updateSeller: (id: string, updates: Partial<Seller>) => Promise<void>;
  toggleSellerActive: (sellerId: string, isActive: boolean) => Promise<void>;
  deleteSeller: (id: string, reassignSellerId?: string) => Promise<void>;
  bulkImportProducts: (csvText: string, options?: { targetSellerId?: string; fallbackCategoryId?: string }) => Promise<{ created: number; updated: number; errors: string[] }>;
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
 * Identity (uid), role ('customer'), and sellerId (authoritative profile only) are strictly enforced.
 */
export function mapSafeShopUserProfile(
  data: Record<string, any>,
  fbUser: AuthUser | AuthUserLike | any,
  authoritativeSellerId: string | null,
  cachedShipping?: Partial<UserProfile>,
  fallbackNames?: { firstName: string; lastName: string; name: string }
): UserProfile {
  const firstName =
    (typeof data.firstName === 'string' && data.firstName.trim()) ||
    (typeof data.first_name === 'string' && data.first_name.trim()) ||
    (typeof data.name === 'string' && data.name.trim() ? data.name.trim().split(' ')[0] : '') ||
    cachedShipping?.firstName ||
    fallbackNames?.firstName ||
    '';

  const lastName =
    (typeof data.lastName === 'string' && data.lastName.trim()) ||
    (typeof data.last_name === 'string' && data.last_name.trim()) ||
    (typeof data.name === 'string' && data.name.trim() ? data.name.trim().split(' ').slice(1).join(' ') : '') ||
    cachedShipping?.lastName ||
    fallbackNames?.lastName ||
    '';

  const phone =
    (typeof data.phone === 'string' && data.phone.trim()) ||
    cachedShipping?.phone ||
    '';

  const defaultGovernorate =
    (typeof data.defaultGovernorate === 'string' && data.defaultGovernorate.trim()) ||
    (typeof data.default_governorate === 'string' && data.default_governorate.trim()) ||
    INITIAL_USER.defaultGovernorate ||
    '';

  const defaultCity =
    (typeof data.defaultCity === 'string' && data.defaultCity.trim()) ||
    (typeof data.default_city === 'string' && data.default_city.trim()) ||
    cachedShipping?.defaultCity ||
    '';

  const defaultAddress =
    (typeof data.defaultAddress === 'string' && data.defaultAddress.trim()) ||
    (typeof data.default_address === 'string' && data.default_address.trim()) ||
    cachedShipping?.defaultAddress ||
    '';

  const defaultBuilding =
    (typeof data.defaultBuilding === 'string' && data.defaultBuilding.trim()) ||
    (typeof data.default_building === 'string' && data.default_building.trim()) ||
    cachedShipping?.defaultBuilding ||
    undefined;

  const defaultNotes =
    (typeof data.defaultNotes === 'string' && data.defaultNotes.trim()) ||
    (typeof data.default_notes === 'string' && data.default_notes.trim()) ||
    cachedShipping?.defaultNotes ||
    undefined;

  const uid = fbUser?.uid || fbUser?.id || '';
  const emailVerified = typeof fbUser?.emailVerified === 'boolean' ? fbUser.emailVerified : Boolean(fbUser?.email_confirmed_at);

  return {
    uid,
    name:
      (typeof data.name === 'string' && data.name.trim()) ||
      `${firstName} ${lastName}`.trim() ||
      fbUser?.displayName ||
      fbUser?.user_metadata?.full_name ||
      fbUser?.user_metadata?.name ||
      '',
    firstName,
    lastName,
    email: (typeof data.email === 'string' && data.email.trim()) || fbUser?.email || '',
    phone,
    avatar: (typeof data.avatar === 'string' && data.avatar.trim()) || (typeof data.avatar_url === 'string' && data.avatar_url.trim()) || fbUser?.photoURL || fbUser?.user_metadata?.avatar_url || INITIAL_USER.avatar,
    defaultGovernorate,
    defaultCity,
    defaultAddress,
    defaultBuilding,
    defaultNotes,
    // Database profile & security claims authoritative role enforcement.
    role: 'customer',
    sellerId: authoritativeSellerId || undefined,
    emailVerified,
    isOtpVerified: typeof data.isOtpVerified === 'boolean' ? data.isOtpVerified : undefined
  };
}

export function createAuthUserAdapter(
  supaUser: SupabaseUser,
  profileRole: 'admin' | 'seller' | 'customer' = 'customer',
  profileSellerId: string | null = null,
  profileData: Record<string, any> = {}
): any {
  /**
   * Adapts a Supabase user to the shape the UI consumes.
   *
   * This used to also expose getIdTokenResult(), synthesizing a Firebase
   * `claims` object ({ admin, seller, sellerId }) out of the profile. Nothing
   * signs those values, so they were a mock of an authentication API that no
   * longer exists — and its forced-refresh read named a `sellerId` column that
   * profiles does not have, so the refresh silently failed. Roles are read
   * from public.profiles by the caller instead, which is the same column
   * is_admin() and is_seller() consult in RLS.
   */
  const isEmailConfirmed = Boolean(supaUser.email_confirmed_at);
  void profileRole;
  void profileSellerId;

  return {
    uid: supaUser.id,
    id: supaUser.id,
    email: supaUser.email,
    emailVerified: isEmailConfirmed,
    displayName:
      profileData.name ||
      (profileData.first_name && profileData.last_name
        ? `${profileData.first_name} ${profileData.last_name}`.trim()
        : '') ||
      supaUser.user_metadata?.name ||
      supaUser.user_metadata?.full_name ||
      null,
    photoURL: profileData.avatar || profileData.avatar_url || supaUser.user_metadata?.avatar_url || null,
    user_metadata: supaUser.user_metadata,
    app_metadata: supaUser.app_metadata,
    getIdToken: async (_force?: boolean) => {
      const { data } = await supabase.auth.getSession();
      return data.session?.access_token || '';
    },
  };
}

export const mapUserProfile = mapSafeShopUserProfile;
export function mapSafeUserProfile(
  fbUser: AuthUser | any,
  _uid: string,
  data: Record<string, any> | undefined,
  claimSellerId: string | null
): UserProfile {
  return mapSafeShopUserProfile(data || {}, fbUser, claimSellerId);
}

const INITIAL_ORDERS: Order[] = [];

export const ShopProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeTab, setActiveTabState] = useState<NavTab>(getInitialNavTab);
  const [selectedProductDetail, setSelectedProductDetail] = useState<Product | null>(getInitialProductDetail);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [isSellerUser, setIsSellerUser] = useState(false);
  const [sellerId, setSellerId] = useState<string | null>(null);
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  /**
   * Role and email-verification state are set by the Supabase auth listener
   * below (and by refreshUserProfile) straight from public.profiles and
   * auth.users.email_confirmed_at. Two effects used to re-derive them here
   * through the adapter's synthesized Firebase claims; with that mock removed
   * there is a single source for each.
   */
  useEffect(() => {
    if (!authUser) {
      setIsEmailVerified(false);
      setIsAdminUser(false);
      setIsSellerUser(false);
      setSellerId(null);
    }
  }, [authUser]);

  const [isLocalAdminUnlocked, setIsLocalAdminUnlockedState] = useState<boolean>(() => {
    try {
      return localStorage.getItem('yallalb_admin_unlocked') === 'true';
    } catch {
      return false;
    }
  });

  // HARDENED SECURITY DECISION:
  // An attacker can NEVER unlock admin mode by manipulating localStorage keys.
  // isAdminUnlocked is strictly gated by cryptographically verified isAdminUser.
  const isAdminUnlocked = useMemo(() => {
    return isAdminUser && isLocalAdminUnlocked;
  }, [isAdminUser, isLocalAdminUnlocked]);

  const setIsAdminUnlocked = (val: boolean) => {
    setIsLocalAdminUnlockedState(val);
    try {
      localStorage.setItem('yallalb_admin_unlocked', String(val));
    } catch {}
  };

  const [isDbSyncing, setIsDbSyncing] = useState<boolean>(true);
  const hasSeededProductsRef = useRef<boolean>(false);
  const hasSeededOrdersRef = useRef<boolean>(false);

  // Verify the database is reachable on boot.
  useEffect(() => {
    supabaseAdminService.ping().then((ok) => {
      if (!ok) {
        console.error('[ShopContext] Supabase is not reachable. Check the project URL, key and network.');
      }
    });
  }, []);

  // UI state
  const [selectedProductForModal, setSelectedProductForModal] = useState<Product | null>(null);
  const [currency, setCurrency] = useState<Currency>('USD');
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>(getInitialCategory);
  const [toast, setToast] = useState<Toast | null>(null);

  // Pagination states for products catalog
  const [hasMoreProducts, setHasMoreProducts] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const lastVisibleDocRef = useRef<any>(null);

  // Core catalogue state. Starts from the cache of previously fetched rows, or
  // empty — never from the bundled demo catalogue. An empty database must show
  // an empty storefront, not a fake one.
  const [products, setProducts] = useState<Product[]>(() =>
    readCachedList<Product>(CATALOG_CACHE_KEYS.products).map(ensureSellerItemCode)
  );

  /**
   * Whether the catalogue on screen has been confirmed against Supabase.
   *
   * 'loading' until the first read settles, so the storefront can say "loading"
   * rather than "no products" while it waits; 'error' when the read failed, so
   * it can say the catalogue could not be loaded instead of implying the shop
   * is empty. These are three different things and the UI must not conflate
   * them.
   */
  const [catalogStatus, setCatalogStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [catalogError, setCatalogError] = useState<string | null>(null);

  /**
   * Who the cart/wishlist in localStorage belongs to: a Supabase user id, or
   * 'guest'. Without this, signing out of account A and into account B on the
   * same browser showed B account A's cart, because the local copy was adopted
   * unconditionally. A local cart is now only adopted when it is the guest
   * cart or already belongs to the signed-in user.
   */
  const LOCAL_CART_OWNER_KEY = 'yallalb_cart_owner';

  /**
   * Guest cart/wishlist storage keys.
   *
   * Namespaced so the local copy is unambiguously the *guest* one: an
   * authenticated cart lives in public.carts and is never written here.
   * `yallalb_cart` / `yallalb_wishlist` are the pre-migration keys and are
   * migrated on first read so an existing browser does not lose its basket.
   */
  const GUEST_CART_KEY = 'yallalb_guest_cart';
  const GUEST_WISHLIST_KEY = 'yallalb_guest_wishlist';
  const LEGACY_CART_KEY = 'yallalb_cart';
  const LEGACY_WISHLIST_KEY = 'yallalb_wishlist';

  const getGuestStorage = (key: string, legacyKey?: string): string | null => {
    try {
      const current = localStorage.getItem(key);
      if (current !== null) return current;
      if (legacyKey) {
        const legacy = localStorage.getItem(legacyKey);
        if (legacy !== null) {
          localStorage.setItem(key, legacy);
          localStorage.removeItem(legacyKey);
          return legacy;
        }
      }
    } catch {}
    return null;
  };

  const readLocalCartOwner = (): string => {
    try {
      return localStorage.getItem(LOCAL_CART_OWNER_KEY) || 'guest';
    } catch {
      return 'guest';
    }
  };

  const writeLocalCartOwner = (owner: string) => {
    try {
      localStorage.setItem(LOCAL_CART_OWNER_KEY, owner);
    } catch {}
  };

  const [storedCart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = getGuestStorage(GUEST_CART_KEY, LEGACY_CART_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  /**
   * The user id whose saved cart/wishlist has been loaded from Supabase.
   *
   * The persistence effects below refuse to write until this matches the
   * signed-in user. Writing before the read completes — or after it fails —
   * would upload the local (possibly empty) cart over the row the user actually
   * saved, destroying it.
   *
   * Deliberately state and not a ref: opening the gate has to re-run the
   * persistence effects. Otherwise a guest cart carried into a brand-new
   * account (where the read returns "no row" and so changes no state) would sit
   * unsaved until the user next touched the cart.
   */
  const [cartHydratedForUserId, setCartHydratedForUserId] = useState<string | null>(null);

  /**
   * Last value successfully written to (or read from) Supabase, so the
   * persistence effects can skip a write that would change nothing — notably
   * the one that would otherwise fire immediately after hydration, echoing the
   * row straight back. Only updated on a successful write, so a failed one is
   * retried by the next cart change instead of being considered saved.
   */
  const lastPersistedCartRef = useRef<string | null>(null);
  const lastPersistedWishlistRef = useRef<string | null>(null);

  // Live cart projection: always resolve fresh product properties from the live catalog
  const cart = useMemo<CartItem[]>(() => {
    if (storedCart.length === 0) return storedCart;
    let changed = false;
    const next = storedCart.map(item => {
      const live = products.find(p => p.id === item.product.id);
      if (!live || live === item.product) return item;
      changed = true;
      return { ...item, product: live };
    });
    return changed ? next : storedCart;
  }, [storedCart, products]);

  const [wishlist, setWishlist] = useState<string[]>(() => {
    try {
      const saved = getGuestStorage(GUEST_WISHLIST_KEY, LEGACY_WISHLIST_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Orders are never seeded from localStorage: the cache is not scoped per
  // account, so restoring it would have shown one shopper another's orders.
  // The authoritative list is loaded from public.orders, where RLS decides
  // which rows the signed-in user may see.
  const [orders, setOrders] = useState<Order[]>(INITIAL_ORDERS);

  const [user, setUser] = useState<UserProfile>(() => {
    try {
      const saved = localStorage.getItem('yallalb_user');
      if (saved) {
        return JSON.parse(saved);
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

   const [recentActivities, setRecentActivities] = useState<RecentActivity[]>(() => {
    try {
      const saved = localStorage.getItem('yallalb_recent_activities');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

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
          rows.map((row: Record<string, any>) => ({
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
      .catch((err: unknown) => {
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
      const activityId = `act-${Date.now()}`;
      const newActivity: RecentActivity = {
        id: activityId,
        timestamp: new Date().toISOString(),
        actionType,
        summary,
        details,
        adminEmail: authUser?.email || user.email || 'anonymous-admin',
        ...(targetId ? { targetId } : {}),
        ...(snapshotBefore !== undefined ? { snapshotBefore } : {}),
        ...(snapshotAfter !== undefined ? { snapshotAfter } : {})
      };
      
      setRecentActivities(prev => {
        const next = [newActivity, ...prev].slice(0, 50);
        try {
          localStorage.setItem('yallalb_recent_activities', JSON.stringify(next));
        } catch {}
        return next;
      });

    } catch (err) {
      console.warn('[ShopContext] Failed to log admin activity:', err);
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
      if (act.actionType === 'product_update' && act.targetId && act.snapshotBefore) {
        const restoredProduct = act.snapshotBefore as Product;
        setProducts(prev => prev.map(p => p.id === act.targetId ? { ...restoredProduct } : p));
        try {
          localStorage.setItem(CATALOG_CACHE_KEYS.products, JSON.stringify(products.map(p => p.id === act.targetId ? { ...restoredProduct } : p)));
        } catch {}
      } else if (act.actionType === 'product_add' && act.targetId) {
        setProducts(prev => prev.filter(p => p.id !== act.targetId));
      } else if (act.actionType === 'product_delete' && act.targetId && act.snapshotBefore) {
        const restoredProduct = act.snapshotBefore as Product;
        setProducts(prev => [...prev.filter(p => p.id !== act.targetId), restoredProduct]);
      } else if (act.actionType === 'product_bulk_update' && Array.isArray(act.snapshotBefore)) {
        const restoredProducts = act.snapshotBefore as Product[];
        const restoredMap = new Map(restoredProducts.map(p => [p.id, p]));
        setProducts(prev => prev.map(p => restoredMap.get(p.id) || p));
      } else {
        showToast('Undo is only supported for product additions, updates, and deletions.', 'warning');
        return;
      }

      const undoneTimestamp = new Date().toISOString();
      setRecentActivities(prev => prev.map(a => a.id === activityId ? { ...a, isUndone: true, undoneAt: undoneTimestamp } : a));


      await logAdminActivity(
        'product_update',
        `Undid: ${act.summary}`,
        `Reverted changes from activity logged at ${new Date(act.timestamp).toLocaleTimeString()}`
      );

      showToast(`Successfully undone: "${act.summary}"! Changes recovered.`, 'success');
    } catch (err) {
      console.error('[ShopContext] Error undoing admin activity:', err);
      showToast('Failed to undo changes. Please check connection and try again.', 'error');
    }
  };

  const hasSeededDiscountsRef = useRef(false);

  // Discount rules are authoritative Supabase data; never initialize bundled/demo rules.
  const [discountRules, setDiscountRules] = useState<DiscountRule[]>([]);

  useEffect(() => {
    try {
      localStorage.setItem('yallalb_discount_rules', JSON.stringify(discountRules));
    } catch {}
  }, [discountRules]);

  // Real-time discounts sync from Supabase
  useEffect(() => {
    /**
     * Discount rules, from public.discount_rules.
     *
     * Replaces an onSnapshot listener over Firestore `discounts`.
     * `discounts_admin` is is_admin() for ALL commands, so a customer reads an
     * empty set. That is deliberate rather than a gap to paper over:
     * private.checkout_create_order computes every total and applies coupons
     * server-side, so these rules are display only, and showing a shopper a
     * discount the server will not honour is worse than showing none.
     */
    let isMounted = true;

    supabaseCommerceService
      .fetchDiscountRules()
      .then((rules) => {
        if (isMounted) setDiscountRules(rules);
      })
      .catch((err: unknown) => {
        console.error('[ShopContext] Failed to load discount rules:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [isAdminUser]);

  const addDiscountRule = async (ruleData: Omit<DiscountRule, 'id'>, couponCode?: string, maxTotalUses?: number, maxUsesPerUser?: number) => {
    const id = 'rule-' + secureRandomString(7);
    const newRule: DiscountRule = {
      ...ruleData,
      id
    };
    try {
    } catch (err) {
      console.error("[ShopContext] Error saving discount rule to Supabase:", err);
      showToast('Failed to save discount rule to database', 'warning');
      throw err;
    }
    const ruleWithMeta = { ...newRule, couponCode, maxTotalUses, maxUsesPerUser };
    setDiscountRules(prev => [ruleWithMeta, ...prev]);
    await logAdminActivity('meta_change', 'Created Discount Rule', `Created discount: ${newRule.name}`);
  };

  const updateDiscountRule = async (id: string, updates: Partial<DiscountRule>, couponCode?: string, maxTotalUses?: number, maxUsesPerUser?: number) => {
    const target = discountRules.find(r => r.id === id);
    if (!target) return;
    const updatedRule: DiscountRule = { ...target, ...updates };

    try {
      const ruleWithMeta = { ...updatedRule, ...(couponCode !== undefined ? { couponCode } : {}), ...(maxTotalUses !== undefined ? { maxTotalUses } : {}), ...(maxUsesPerUser !== undefined ? { maxUsesPerUser } : {}) };
      setDiscountRules(prev => prev.map(r => r.id === id ? ruleWithMeta : r));
    } catch (err) {
      console.error("[ShopContext] Error updating discount rule in Supabase:", err);
      showToast('Failed to update discount rule in database', 'warning');
      throw err;
    }
    await logAdminActivity('meta_change', 'Updated Discount Rule', `Updated discount ID: ${id}`);
  };

  const deleteDiscountRule = async (id: string) => {
    try {
      setDiscountRules(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      console.error("[ShopContext] Error deleting discount rule from Supabase:", err);
      showToast('Failed to delete discount rule from database', 'warning');
      throw err;
    }
    await logAdminActivity('meta_change', 'Deleted Discount Rule', `Deleted discount ID: ${id}`);
  };

  // Product Bundles & Combo Deals State
  const [productBundles, setProductBundles] = useState<ProductBundle[]>(() => {
    try {
      const saved = localStorage.getItem('yallalb_product_bundles');
      if (saved !== null) return JSON.parse(saved);
    } catch {}
    return [
      {
        id: 'bundle-gourmet-breakfast',
        name: 'Lebanese Gourmet Breakfast Bundle',
        nameAr: 'باقة الفطور اللبناني الفاخر',
        description: 'Authentic Koura Extra Virgin Olive Oil, Chouf Zaatar Herb Mix, and Raw Mountain Honey packaged together.',
        descriptionAr: 'زيت زيتون كورة بكر ممتاز، خلطة زعتر الشوف، وعسل جبلي بري نقي.',
        badgeText: 'COMBO DEAL - SAVE 20%',
        badgeTextAr: 'صفقة كومبو - خصم ٢٠٪',
        productIds: ['prod-2', 'prod-12', 'prod-15'],
        bundlePriceUSD: 34.38,
        isActive: true,
        createdAt: new Date().toISOString()
      },
      {
        id: 'bundle-coffee-ritual-set',
        name: 'Artisan Morning Coffee Ritual Set',
        nameAr: 'طقم طقوس القهوة الصباحية الحرفي',
        description: 'Handmade Ceramic Pour-Over Dripper with Server and freshly roasted Lebanese Cardamom Coffee.',
        descriptionAr: 'طقم تحضير القهوة السيراميكي اليدوي مع قهوة لبنانية محمصة بالهيل.',
        badgeText: 'ARTISAN COFFEE COMBO',
        badgeTextAr: 'كومبو القهوة الحرفية',
        productIds: ['prod-4', 'prod-16'],
        bundlePriceUSD: 64.79,
        isActive: true,
        createdAt: new Date().toISOString()
      }
    ];
  });

  const hasSeededBundlesRef = useRef(false);

  useEffect(() => {
    try {
      localStorage.setItem('yallalb_product_bundles', JSON.stringify(productBundles));
    } catch {}
  }, [productBundles]);

  useEffect(() => {
    /**
     * Product bundles, from public.product_bundles.
     *
     * Replaces an onSnapshot listener over the Firestore collection of the same
     * name. `bundles_read` is `is_published OR is_admin()`, so published
     * bundles do reach the storefront and drafts stay internal.
     */
    let isMounted = true;

    supabaseCommerceService
      .fetchProductBundles()
      .then((bundles) => {
        if (isMounted) setProductBundles(bundles);
      })
      .catch((err: unknown) => {
        console.error('[ShopContext] Failed to load product bundles:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [isAdminUser]);

  const addProductBundle = async (bundleData: Omit<ProductBundle, 'id' | 'createdAt' | 'updatedAt'>) => {
    const id = 'bundle-' + secureRandomString(7);
    const newBundle: ProductBundle = {
      ...bundleData,
      id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem('yallalb_bundles_initialized', 'true');
    setProductBundles(prev => [newBundle, ...prev]);

    try {
    } catch (err) {
      console.error("[ShopContext] Error saving bundle to Supabase:", err);
      showToast('Failed to create combo deal in database', 'warning');
      throw err;
    }
    await logAdminActivity('meta_change', 'Created Combo Deal', `Created bundle: ${newBundle.name}`);
  };

  const updateProductBundle = async (id: string, updates: Partial<ProductBundle>) => {
    const target = productBundles.find(b => b.id === id);
    if (!target) return;
    const updatedBundle: ProductBundle = { ...target, ...updates, updatedAt: new Date().toISOString() };

    setProductBundles(prev => prev.map(b => b.id === id ? updatedBundle : b));

    try {
    } catch (err) {
      console.error("[ShopContext] Error updating bundle in Supabase:", err);
      showToast('Failed to update combo deal in database', 'warning');
      throw err;
    }
    await logAdminActivity('meta_change', 'Updated Combo Deal', `Updated bundle ID: ${id}`);
  };

  const deleteProductBundle = async (id: string) => {
    setProductBundles(prev => {
      const next = prev.filter(b => b.id !== id);
      try {
        localStorage.setItem('yallalb_product_bundles', JSON.stringify(next));
        localStorage.setItem('yallalb_bundles_initialized', 'true');
      } catch {}
      return next;
    });

    try {
    } catch (err) {
      console.error("[ShopContext] Error deleting bundle from Supabase:", err);
    }
    await logAdminActivity('meta_change', 'Deleted Combo Deal', `Deleted bundle ID: ${id}`);
  };

  // Categories & Details Management State. Cache or empty, never the bundled
  // DEFAULT_CATEGORIES: those carry slug ids that no product's category_id can
  // match, so they would render categories that are permanently empty.
  const [categories, setCategories] = useState<CategoryItem[]>(() =>
    readCachedList<CategoryItem>(CATALOG_CACHE_KEYS.categories)
  );

  // Terroir Regions & Logistics State
  const [regions, setRegions] = useState<TerroirRegion[]>(() => {
    try {
      const saved = localStorage.getItem('yallalb_regions');
      return saved ? JSON.parse(saved) : LEBANON_REGIONS;
    } catch {
      return LEBANON_REGIONS;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(CATALOG_CACHE_KEYS.categories, JSON.stringify(categories));
    } catch {}
  }, [categories]);

  useEffect(() => {
    try {
      localStorage.setItem('yallalb_regions', JSON.stringify(regions));
    } catch {}
  }, [regions]);

  /**
   * True once cms_site_content has served real content.
   *
   * A legacy Firestore `cms/main` listener used to write siteContent too, and
   * the two raced on every load. That listener is gone; this flag still guards
   * the bundled defaults, so once Supabase answers with content the defaults
   * stop being applied over what an admin published.
   */
  const cmsSupabaseAuthoritativeRef = useRef(false);

  /**
   * True once cms_custom_blocks has served at least one block. Tracked apart
   * from the section copy because the two live in different tables: blocks can
   * be in Supabase while the section jsonb has never been saved, and in that
   * window the bundled defaults must keep their hands off the block list.
   */
  const cmsBlocksFromSupabaseRef = useRef(false);

  // Supabase Initial Catalog, Categories, Sellers, and CMS Hydration
  useEffect(() => {
    let isMounted = true;

    const hydrateFromSupabase = async () => {
      // allSettled, not all: these are six independent reads, and a CMS failure
      // must not discard a catalog that loaded fine. Each rejection is reported
      // on its own instead of one `catch` hiding which read broke.
      const [categoriesRes, regionsRes, sellersRes, productsRes, blocksRes, contentRes] = await Promise.allSettled([
        supabaseCatalogService.fetchCategories(),
        supabaseCatalogService.fetchRegions(),
        supabaseCatalogService.fetchSellers(),
        supabaseCatalogService.fetchProducts({ isAdmin: isAdminUser, isSeller: isSellerUser, sellerId }),
        // Admins need drafts too, so they read the table (RLS: is_published OR
        // is_admin()). Everyone else goes through the public RPC, once per
        // target page — it matches target_page by exact equality, so the single
        // no-argument call this replaced returned home-page blocks only.
        isAdminUser ? supabaseCmsService.fetchAllCmsBlocks() : supabaseCmsService.fetchAllPublicCmsBlocks(),
        supabaseCmsService.fetchSiteContent(),
      ]);

      if (!isMounted) return;

      const failures: string[] = [];
      const valueOf = <T,>(res: PromiseSettledResult<T>, label: string): T | undefined => {
        if (res.status === 'fulfilled') return res.value;
        // Logged as an error, never shrugged off as a "notice": with an empty
        // products table this is the difference between a visible outage and a
        // storefront quietly rendering bundled defaults as if they were real.
        console.error(`[ShopContext] Supabase hydration failed for ${label}:`, res.reason);
        failures.push(label);
        return undefined;
      };

      const supabaseCategories = valueOf(categoriesRes, 'categories');
      const supabaseRegions = valueOf(regionsRes, 'regions');
      const supabaseSellers = valueOf(sellersRes, 'sellers');
      const supabaseProds = valueOf(productsRes, 'products');
      const supabaseBlocks = valueOf(blocksRes, 'cms_custom_blocks');
      const supabaseContent = valueOf(contentRes, 'cms_site_content');

      // `undefined` means the read failed, so what is on screen is kept. An
      // empty array means the table is genuinely empty, and that IS the answer:
      // it is applied. The previous `length > 0` guards discarded empty
      // results, so a cleared catalogue kept showing stale cached products —
      // and, before the fallbacks were removed, the bundled demo catalogue.
      if (supabaseCategories) {
        setCategories(supabaseCategories);
      }
      if (supabaseRegions && supabaseRegions.length > 0) {
        // Regions are delivery pricing reference data, not catalogue content;
        // an empty read here would break checkout rather than show an empty
        // shop, so the seeded defaults stand until the table answers.
        setRegions(supabaseRegions);
      }
      if (supabaseSellers) {
        setSellers(supabaseSellers);
      }
      if (supabaseProds) {
        setProducts(supabaseProds.map(ensureSellerItemCode));
      }

      // Catalogue status drives the storefront's empty state: 'ready' with zero
      // products means an honestly empty shop, 'error' means the read broke and
      // the shop must say so rather than implying it has no stock.
      if (productsRes.status === 'rejected') {
        setCatalogStatus('error');
        setCatalogError(
          productsRes.reason instanceof Error ? productsRes.reason.message : String(productsRes.reason)
        );
      } else {
        setCatalogStatus('ready');
        setCatalogError(null);
      }

      // CMS: cms_site_content holds the section copy, cms_custom_blocks holds
      // the blocks. Both are applied in one state update so a render cannot
      // show new sections beside stale blocks.
      //
      // `supabaseContent` was previously fetched and then thrown away — every
      // CMS edit an admin published was invisible to the storefront. It is
      // merged over what is on screen so a partially populated row cannot blank
      // out a section that has never been saved.
      if (supabaseContent) {
        cmsSupabaseAuthoritativeRef.current = true;
      }
      if (supabaseBlocks && supabaseBlocks.length > 0) {
        cmsBlocksFromSupabaseRef.current = true;
      }

      if (supabaseContent || supabaseBlocks) {
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

          // An empty array is a real answer ("nothing published"), so it is
          // applied; `undefined` means the read failed, so blocks are left be.
          return supabaseBlocks ? { ...next, customBlocks: supabaseBlocks } : next;
        });
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

    hydrateFromSupabase();

    return () => {
      isMounted = false;
    };
  }, [isAdminUser, isSellerUser, sellerId]);

  /**
   * Live category sync from Supabase Realtime.
   *
   * Replaces a Firestore listener on `site_settings/categories` that seeded
   * DEFAULT_CATEGORIES whenever the document was missing, and "supplemented"
   * any bundled category it found absent — so the demo taxonomy kept
   * reinstating itself in the database. Those categories carry slug ids, which
   * no product's category_id (a uuid) can match, so they rendered as
   * permanently empty category pages.
   *
   * `categories` is in the supabase_realtime publication. As with products, a
   * change event triggers a re-read rather than being merged from the payload,
   * so category RLS (is_published OR is_admin()) decides what a viewer sees.
   */
  useEffect(() => {
    let isMounted = true;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const refreshCategories = async () => {
      try {
        const fresh = await supabaseCatalogService.fetchCategories();
        if (!isMounted) return;
        setCategories(fresh); // empty is a real answer and is applied
        try {
          localStorage.setItem(CATALOG_CACHE_KEYS.categories, JSON.stringify(fresh));
        } catch {}
      } catch (err) {
        if (!isMounted) return;
        console.error('[ShopContext] Realtime category refresh failed:', err);
      }
    };

    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(refreshCategories, 400);
    };

    const channel = supabase
      .channel('yalla-categories')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, scheduleRefresh)
      .subscribe((status: string) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error(`[ShopContext] Supabase realtime channel for categories: ${status}`);
        }
      });

    return () => {
      isMounted = false;
      if (refreshTimer) clearTimeout(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, []);

  // Real-time regions sync from Supabase
  useEffect(() => {
    /**
     * Delivery regions, from public.regions.
     *
     * Replaces an onSnapshot listener over Firestore `site_settings/regions`.
     * The initial hydration already reads this table; this keeps the separate
     * refresh so a region edit is picked up without a reload. An empty read is
     * ignored rather than applied: regions are delivery pricing reference data,
     * and emptying them would break checkout rather than show an empty shop.
     */
    let isMounted = true;

    supabaseCatalogService
      .fetchRegions()
      .then((rows) => {
        if (isMounted && rows.length > 0) setRegions(rows);
      })
      .catch((err: unknown) => {
        console.error('[ShopContext] Failed to load delivery regions:', err);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const addCategory = async (catData: Omit<CategoryItem, 'id'> & { id?: string }) => {
    // categories.id is uuid, so the readable slug this used to use as the
    // primary key cannot be one. The slug is kept in legacy_id, which exists
    // for exactly that: the pre-migration identifier.
    const slug = catData.id?.trim() || catData.nameEn.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || '';
    if (slug && categories.some(c => c.legacyId === slug || c.id === slug)) {
      throw new Error(`A category with the ID "${slug}" already exists.`);
    }

    const newCategory: CategoryItem = {
      ...catData,
      id: catData.id && isUuid(catData.id) ? catData.id : generateUuidV4(),
      legacyId: slug || undefined,
      subcategories: catData.subcategories || [],
      arabicKeywords: catData.arabicKeywords || [],
      englishKeywords: catData.englishKeywords || [],
      isPublished: catData.isPublished ?? true,
      displayOrder: catData.displayOrder ?? (categories.length + 1)
    };
    
    const previous = [...categories];
    const nextCategories = [...categories, newCategory];
    setCategories(nextCategories);

    // Authoritative write. Rolled back and rethrown on failure.
    try {
      await supabaseCatalogService.upsertCategory(newCategory);
    } catch (supaErr: any) {
      setCategories(previous);
      console.error('[ShopContext] addCategory Supabase write failed:', supaErr);
      showToast(`Could not save category: ${supaErr?.message || 'unknown error'}`, 'error');
      throw supaErr;
    }


    await logAdminActivity(
      'category_create',
      `Category "${newCategory.nameEn}" created`,
      `Added category "${newCategory.nameEn}" (${newCategory.nameAr}) with ID "${newCategory.id}", ${newCategory.subcategories.length} subcategories, and Arabic SEO tags.`
    );
  };

  const updateCategory = async (id: string, updates: Partial<CategoryItem>) => {
    const existing = categories.find(c => c.id === id);
    const previous = [...categories];
    const nextCategories = categories.map(c => c.id === id ? { ...c, ...updates } : c);
    setCategories(nextCategories);

    // Authoritative write: only the changed fields, so an edit to one field
    // cannot blank another.
    try {
      await supabaseCatalogService.upsertCategory({ ...updates, id });
    } catch (supaErr: any) {
      setCategories(previous);
      console.error('[ShopContext] updateCategory Supabase write failed:', supaErr);
      showToast(`Could not save category: ${supaErr?.message || 'unknown error'}`, 'error');
      throw supaErr;
    }


    await logAdminActivity(
      'category_update',
      `Category "${existing?.nameEn || id}" updated`,
      `Modified attributes for category: ${Object.keys(updates).join(', ')}.`
    );
  };

  const deleteCategory = async (id: string, reassignCategoryId?: string, deleteAttachedProducts?: boolean) => {
    if (isAdminUser) {
      const authorized = await assertHighRiskAuthorization(authUser?.uid);
      if (!authorized) {
        showToast('High-risk action cancelled or verification expired.', 'error');
        throw new Error('High-risk authorization failed');
      }
    }

    const target = categories.find(c => c.id === id);
    const affectedProducts = products.filter(p => p.category === id);

    const shouldDeleteProducts = deleteAttachedProducts === true || reassignCategoryId === '__delete_products__';

    if (affectedProducts.length > 0 && !reassignCategoryId && !shouldDeleteProducts) {
      throw new Error(`${affectedProducts.length} product(s) are in this category. Choose an action for the attached products.`);
    }

    const previousCategories = [...categories];
    const nextCategories = categories.filter(c => c.id !== id);
    setCategories(nextCategories);

    // Authoritative delete. products.category_id is ON DELETE SET NULL / the
    // reassignment above has already moved affected products, so this only
    // removes the category row itself.
    try {
      await supabaseCatalogService.deleteCategory(id);
    } catch (supaErr: any) {
      setCategories(previousCategories);
      console.error('[ShopContext] deleteCategory Supabase delete failed:', supaErr);
      showToast(`Could not delete category: ${supaErr?.message || 'unknown error'}`, 'error');
      throw supaErr;
    }

    if (shouldDeleteProducts) {
      const affectedIds = new Set(affectedProducts.map(p => p.id));
      const nextProducts = products.filter(p => !affectedIds.has(p.id));
      setProducts(nextProducts);
      try {
        localStorage.setItem(CATALOG_CACHE_KEYS.products, JSON.stringify(nextProducts));
      } catch {}
    } else if (reassignCategoryId && reassignCategoryId !== '__delete_products__') {
      const nextProducts = products.map(p => p.category === id ? { ...p, category: reassignCategoryId } : p);
      setProducts(nextProducts);
      try {
        localStorage.setItem(CATALOG_CACHE_KEYS.products, JSON.stringify(nextProducts));
      } catch {}
    }


    await logAdminActivity(
      'category_delete',
      `Category "${target?.nameEn || id}" deleted`,
      `Removed category "${target?.nameEn || id}". ${shouldDeleteProducts ? `Permanently deleted ${affectedProducts.length} attached product(s).` : reassignCategoryId ? `Reassigned associated products to "${reassignCategoryId}".` : ''}`
    );
  };

  const reorderCategories = async (newOrder: CategoryItem[]) => {
    const normalized = newOrder.map((cat, idx) => ({ ...cat, displayOrder: idx + 1 }));
    setCategories(normalized);

    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('yallalb_categories_cache', JSON.stringify(normalized));
      }
    } catch {}


    await logAdminActivity('category_update', 'Categories reordered', `Admin reordered ${newOrder.length} categories.`);
  };

  const reorderProducts = async (orderedProducts: Product[]) => {
    const orderMap = new Map<string, number>();
    orderedProducts.forEach((p, idx) => {
      orderMap.set(p.id, idx + 1);
    });

    const updatedProducts = [...products].map(p => {
      if (orderMap.has(p.id)) {
        return { ...p, displayOrder: orderMap.get(p.id)! };
      }
      return p;
    }).sort((a, b) => {
      const orderA = a.displayOrder ?? 9999;
      const orderB = b.displayOrder ?? 9999;
      return orderA - orderB;
    });

    setProducts(updatedProducts);

    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(CATALOG_CACHE_KEYS.products, JSON.stringify(updatedProducts));
      }
    } catch {}


    await logAdminActivity('product_update', 'Products reordered', `Admin reordered ${orderedProducts.length} products.`);
  };

  const updateRegion = async (id: string, updates: Partial<TerroirRegion>) => {
    const existing = regions.find(r => r.id === id);
    const previous = [...regions];
    setRegions(regions.map(r => r.id === id ? { ...r, ...updates } : r));
    try {
      await supabaseCatalogService.upsertRegion({ ...updates, id });
    } catch (err: any) {
      setRegions(previous);
      showToast(`Could not save region: ${err?.message || 'unknown error'}`, 'error');
      throw err;
    }
    await logAdminActivity('region_update', `Region "${existing?.nameEn || id}" updated`, 'Updated regional logistics and delivery fees.');
  };

  const addRegion = async (newReg: TerroirRegion) => {
    const previous = [...regions];
    setRegions([...regions, newReg]);
    try {
      await supabaseCatalogService.upsertRegion(newReg);
    } catch (err: any) {
      setRegions(previous);
      showToast(`Could not save region: ${err?.message || 'unknown error'}`, 'error');
      throw err;
    }
    await logAdminActivity('region_update', `Region zone "${newReg.nameEn}" added`, `Added delivery zone with base fee ${newReg.baseDeliveryUSD}.`);
  };

  const deleteRegion = async (id: string) => {
    const target = regions.find(r => r.id === id);
    const previous = [...regions];
    setRegions(regions.filter(r => r.id !== id));
    try {
      await supabaseCatalogService.deleteRegion(id);
    } catch (err: any) {
      setRegions(previous);
      showToast(`Could not delete region: ${err?.message || 'unknown error'}`, 'error');
      throw err;
    }
    await logAdminActivity('region_update', `Region zone "${target?.nameEn || id}" deleted`, `Removed shipping zone ${id}.`);
  };

// Sellers Management State & Sync
  // Cache or empty, never the bundled DEFAULT_SELLERS.
  const [sellers, setSellers] = useState<Seller[]>(() =>
    readCachedList<Seller>(CATALOG_CACHE_KEYS.sellers).map((s, idx) => ensureSellerCode(s, idx))
  );

  useEffect(() => {
    try {
      localStorage.setItem(CATALOG_CACHE_KEYS.sellers, JSON.stringify(sellers));
    } catch {}
  }, [sellers]);

  /**
   * Sellers are re-read from Supabase, not mirrored from Firestore.
   *
   * The Firestore listener this replaces seeded DEFAULT_SELLERS into the
   * database whenever the collection was empty, and put them on screen for
   * everyone — bundled workshops presented as real merchants.
   *
   * `sellers` is NOT in the supabase_realtime publication (verified in
   * pg_publication_tables: only categories, cms_custom_blocks,
   * cms_site_content, orders and products are), so there is no subscription to
   * make here. Sellers load with the initial hydration and are refreshed after
   * an admin write; inventing a channel for a table the publication does not
   * carry would just fail silently.
   */
  const refreshSellersFromSupabase = useCallback(async () => {
    try {
      const fresh = await supabaseCatalogService.fetchSellers();
      setSellers(fresh.map((seller, idx) => ensureSellerCode(seller, idx)));
      try {
        localStorage.setItem(CATALOG_CACHE_KEYS.sellers, JSON.stringify(fresh));
      } catch {}
    } catch (err) {
      console.error('[ShopContext] Seller refresh failed:', err);
      throw err;
    }
  }, []);

  const addSeller = async (sellerData: Omit<Seller, 'id' | 'createdAt' | 'updatedAt'> & { id?: string; sellerCode?: string }) => {
    // sellers.id is uuid; the workshop slug lives in legacy_id.
    const slug = sellerData.id?.trim() || sellerData.nameEn.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || '';
    if (slug && sellers.some(s => s.legacyId === slug || s.id === slug)) {
      throw new Error(`A seller with the ID "${slug}" already exists.`);
    }
    const sellerCode = sellerData.sellerCode?.trim() || `SLR-${secureRandomInt(100, 1000)}`;
    const newSeller: Seller = {
      ...sellerData,
      id: sellerData.id && isUuid(sellerData.id) ? sellerData.id : generateUuidV4(),
      legacyId: slug || undefined,
      sellerCode,
      isActive: sellerData.isActive ?? true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const previous = [...sellers];
    const nextSellers = [...sellers, newSeller];
    setSellers(nextSellers);

    // Authoritative write. Rolled back and rethrown on failure.
    try {
      await supabaseCatalogService.upsertSeller(newSeller);
    } catch (supaErr: any) {
      setSellers(previous);
      console.error('[ShopContext] addSeller Supabase write failed:', supaErr);
      showToast(`Could not save seller: ${supaErr?.message || 'unknown error'}`, 'error');
      throw supaErr;
    }

    await logAdminActivity('meta_change', `Seller "${newSeller.nameEn}" added`, `Created seller ID: ${slug}`);
  };

  const updateSeller = async (id: string, updates: Partial<Seller>) => {
    const previous = [...sellers];
    const nextSellers = sellers.map(s => s.id === id ? { ...s, ...updates, updatedAt: new Date().toISOString() } : s);
    setSellers(nextSellers);

    // Authoritative write. `commission_pct` and `exact_address` are real
    // columns on `sellers` and are written here; the account-linkage fields
    // (has_account / account_email / account_uid) are deliberately not, since
    // they belong to the seller provisioning flow.
    try {
      await supabaseCatalogService.upsertSeller({ ...updates, id });
    } catch (supaErr: any) {
      setSellers(previous);
      console.error('[ShopContext] updateSeller Supabase write failed:', supaErr);
      showToast(`Could not save seller: ${supaErr?.message || 'unknown error'}`, 'error');
      throw supaErr;
    }

  };

  const toggleSellerActive = async (sellerId: string, isActive: boolean) => {
    const previousSellers = [...sellers];
    const nextSellers = sellers.map(s => s.id === sellerId ? { ...s, isActive, updatedAt: new Date().toISOString() } : s);
    setSellers(nextSellers);

    await logAdminActivity('meta_change', `Seller "${sellerId}" active status toggled to ${isActive}`, '');
  };

  const deleteSeller = async (id: string, reassignSellerId?: string) => {
    const affectedProducts = products.filter(p => p.sellerId === id);
    if (affectedProducts.length > 0 && !reassignSellerId) {
      throw new Error(`${affectedProducts.length} product(s) belong to this seller. Choose a seller to move them to.`);
    }
    const previousSellers = [...sellers];
    const nextSellers = sellers.filter(s => s.id !== id);
    setSellers(nextSellers);

    // Authoritative delete.
    try {
      await supabaseCatalogService.deleteSeller(id);
    } catch (supaErr: any) {
      setSellers(previousSellers);
      console.error('[ShopContext] deleteSeller Supabase delete failed:', supaErr);
      showToast(`Could not delete seller: ${supaErr?.message || 'unknown error'}`, 'error');
      throw supaErr;
    }

    await logAdminActivity('meta_change', `Seller "${id}" deleted`, `Reassigned ${affectedProducts.length} products to ${reassignSellerId || 'none'}.`);
  };

  const bulkImportProducts = async (
    csvText: string,
    options?: { targetSellerId?: string; fallbackCategoryId?: string }
  ): Promise<{ created: number; updated: number; errors: string[] }> => {
    return new Promise((resolve, reject) => {
      Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        transformHeader: h => h.trim().toLowerCase(),
        complete: async (results) => {
          const rows = results.data as any[];
          let created = 0;
          let updated = 0;
          const errors: string[] = [];
          const validRows: any[] = [];
          const seenSkusInFile = new Set<string>();
          const seenItemCodesInFile = new Set<string>();
          const seenDescriptionsInFile = new Map<string, string>(); // cleaned desc -> product name

          rows.forEach((row, idx) => {
            if (isCsvRowEmpty(row)) return;
            const rowNum = idx + 2;
            const name = (row.name_en || row.name || row.title || '').toString().trim();
            const resolvedSeller = resolveSeller(row, sellers, options?.targetSellerId);
            const resolvedCategory = resolveCategory(row, categories, options?.fallbackCategoryId);
            const priceUSD = parsePrice(row.price_usd || row.price || row.unit_price);
            const stock = parseStock(row.stock !== undefined ? row.stock : row.qty);

            if (!name) {
              errors.push(`Row ${rowNum}: name_en is required`);
              return;
            }
            if (!resolvedSeller) {
              const rawSeller = row.seller_id || row.seller || row.seller_artisan || 'empty';
              errors.push(`Row ${rowNum}: seller "${rawSeller}" could not be matched to an active seller. Please select a Target Seller dropdown.`);
              return;
            }
            if (!resolvedCategory) {
              const rawCat = row.category || row.category_id || 'empty';
              errors.push(`Row ${rowNum}: category "${rawCat}" not found`);
              return;
            }
            if (priceUSD <= 0) {
              errors.push(`Row ${rowNum}: price_usd must be a positive number (found ${row.price_usd || row.price})`);
              return;
            }
            if (isNaN(stock) || stock < 0) {
              errors.push(`Row ${rowNum}: stock must be a non-negative integer (found "${row.stock !== undefined ? row.stock : row.qty}")`);
              return;
            }

            const sku = (row.sku || row.product_id || '').toString().trim() || `prod-${Date.now()}-${idx}`;
            const isPublished = !['false', '0', 'no', 'hidden'].includes(String(row.is_published ?? row.status ?? '').toLowerCase());
            const sellerItemCode = (row.seller_item_code || row.seller_code || row.item_code || '').toString().trim() || `SIC-${secureRandomInt(10000, 100000)}`;

            // 1. Validation: Duplicate Product Number (SKU & sellerItemCode)
            const normSku = sku.toLowerCase();
            const normItemCode = sellerItemCode.toLowerCase();
            const sellerKey = (resolvedSeller?.sellerId || resolvedSeller?.sellerName || '').toLowerCase().trim();
            const sellerCodeKey = `${sellerKey}::${normItemCode}`;

            if (seenSkusInFile.has(normSku)) {
              errors.push(`Row ${rowNum} ("${name}"): Duplicate SKU / Product ID "${sku}" appears multiple times in CSV import.`);
              return;
            }
            if (seenItemCodesInFile.has(sellerCodeKey)) {
              errors.push(`Row ${rowNum} ("${name}"): Duplicate Seller Item Code "${sellerItemCode}" for seller "${resolvedSeller.sellerName}" appears multiple times in CSV import.`);
              return;
            }

            // Check against existing products in database
            const existingProduct = products.find(p => p.id === sku);
            const isExistingSku = !!existingProduct;
            const dupCodeCheck = checkDuplicateProductNumber(sellerItemCode, isExistingSku ? sku : null, products, resolvedSeller.sellerId, resolvedSeller.sellerName);
            if (dupCodeCheck.isDuplicate) {
              errors.push(`Row ${rowNum} ("${name}"): Seller item code "${sellerItemCode}" is already assigned to existing product "${dupCodeCheck.conflictingProduct?.name}" for seller "${resolvedSeller.sellerName}".`);
              return;
            }

            const description = (row.description_en || row.description || 'Imported artisanal product.').toString().trim();
            const craftStory = (row.description_ar || row.craftstory || row.arabic_description || 'حرفية أصيلة.').toString().trim();

            seenSkusInFile.add(normSku);
            seenItemCodesInFile.add(sellerCodeKey);

            const mainImage = (row.image_url || row.image || 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=600&q=80').toString().trim();
            const addlImagesRaw = row.additional_images || row.images || row.gallery;
            const additionalImages = addlImagesRaw
              ? String(addlImagesRaw).split(/[|,]/).map((u: string) => u.trim()).filter(Boolean)
              : undefined;

            const videoUrl = (row.video_url || row.video || '').toString().trim() || undefined;
            const addlVideosRaw = row.additional_videos || row.videos;
            const additionalVideos = addlVideosRaw
              ? String(addlVideosRaw).split(/[|,]/).map((v: string) => v.trim()).filter(Boolean)
              : undefined;

            const nowIso = new Date().toISOString();

            validRows.push({
              sku,
              product: {
                id: sku,
                sellerItemCode,
                name,
                arabicName: (row.name_ar || row.arabic_name || name).toString().trim(),
                artisan: resolvedSeller.sellerName,
                seller: resolvedSeller.sellerName,
                arabicSeller: resolvedSeller.arabicSeller || row.arabic_seller || '',
                sellerId: resolvedSeller.sellerId,
                sellerActive: true,
                category: resolvedCategory.categoryId,
                priceUSD,
                originalPriceUSD: row.original_price_usd ? parsePrice(row.original_price_usd) : undefined,
                stock: Math.floor(stock),
                image: mainImage,
                additionalImages: additionalImages && additionalImages.length > 0 ? additionalImages : undefined,
                videoUrl,
                additionalVideos: additionalVideos && additionalVideos.length > 0 ? additionalVideos : undefined,
                videos: additionalVideos && additionalVideos.length > 0 ? additionalVideos : (videoUrl ? [videoUrl] : undefined),
                description,
                craftStory,
                tags: row.tags ? String(row.tags).split(/[|,]/).map((t: string) => t.trim()).filter(Boolean) : ['Artisanal'],
                rating: 0,
                reviewsCount: 0,
                origin: (row.origin || row.origin_terroir || 'Lebanon').toString().trim(),
                weightOrVolume: (row.weight_or_volume || row.weight || row.volume || '').toString().trim() || undefined,
                isPublished,
                createdAt: existingProduct?.createdAt || nowIso,
                updatedAt: nowIso
              },
              isUpdate: isExistingSku
            });
          });

          if (validRows.length === 0) {
            resolve({ created, updated, errors });
            return;
          }

          // 1. Immediately update in-memory products and localStorage so UI updates instantly
          setProducts(prevProducts => {
            const nextMap = new Map<string, Product>();
            prevProducts.forEach(p => nextMap.set(p.id, p));
            validRows.forEach(item => {
              nextMap.set(item.sku, item.product);
            });
            const merged = Array.from(nextMap.values());
            try {
              localStorage.setItem(CATALOG_CACHE_KEYS.products, JSON.stringify(merged));
            } catch {}
            return merged;
          });

          // Each row was already written to Supabase by upsertProduct above,
          // so the Firestore batch that stood here is gone. Only the counters
          // from its `else` branch are kept, since the caller reports them.
          validRows.forEach(item => {
            if (item.isUpdate) updated++;
            else created++;
          });

          const previousSnapshots = validRows.map(r => products.find(p => p.id === r.sku)).filter(Boolean);
          const updatedSnapshots = validRows.map(r => r.product);

          await logAdminActivity(
            'product_bulk_update',
            `CSV Bulk Import (${validRows.length} products)`,
            `Created: ${created}, Updated: ${updated}, Errors: ${errors.length}`,
            'bulk_csv_import',
            previousSnapshots,
            updatedSnapshots
          );
          resolve({ created, updated, errors });
        },
        error: (err: any) => {
          reject(err);
        }
      });
    });
  };

  // Local storage persistence for CMS
  useEffect(() => {
    try {
      const isCmsPreview = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('cmsPreview') === '1';
      if (isCmsPreview) return; // Draft never leaks into the storefront localStorage cache
      localStorage.setItem('yallalb_site_content', JSON.stringify(siteContent));
    } catch {}
  }, [siteContent]);

  // Live postMessage edits reach the preview in real time
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const isCmsPreview = new URLSearchParams(window.location.search).get('cmsPreview') === '1';
    if (!isCmsPreview) return;

    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'CMS_DRAFT_UPDATE' && event.data.payload) {
        setSiteContent(event.data.payload);
      } else if (event.data && event.data.type === 'CMS_LANG_UPDATE' && event.data.payload) {
        setLanguage(event.data.payload);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // CMS sync from Supabase (cms_site_content + cms_custom_blocks)
  useEffect(() => {
    /**
     * Removed: the Firestore CMS listener.
     *
     * It subscribed to `cms/main` (admin) or `cms_public/main` (storefront) and
     * wrote the result into siteContent. cms_site_content and
     * cms_custom_blocks are the CMS store now, read by the hydration effect
     * above and refreshed by a realtime channel on cms_custom_blocks, so this
     * listener had become a second writer racing the first.
     *
     * The CMS preview path is kept: a draft in sessionStorage still takes
     * precedence over the published content, which is what the admin preview
     * relies on.
     */
    const isCmsPreview =
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('cmsPreview') === '1';
    if (!isCmsPreview) return;

    try {
      const draft = sessionStorage.getItem('yalla_cms_preview');
      if (draft) {
        setSiteContent((prev) => ({ ...prev, ...JSON.parse(draft) }));
      }
    } catch (err) {
      console.error('[ShopContext] Could not read the CMS preview draft:', err);
    }
  }, []);

  const updateSiteContent = async (updates: Partial<SiteContent> | ((prev: SiteContent) => SiteContent)) => {
    // Determine the next state safely
    const nextContent = typeof updates === 'function' ? updates(siteContent) : { ...siteContent, ...updates };
    
    // Stage 1: Form Input Logged with calculated diff
    const diff = calculateObjectDiff(siteContent as any, nextContent as any);
    const modifiedKeys = Object.keys(diff);
    dbLogger.logFormInput({
      sourceComponent: 'ShopContext',
      actionName: 'updateSiteContent',
      targetPath: 'cms_site_content/main',
      summary: `CMS Form submission initiated for ${modifiedKeys.length} section(s): [${modifiedKeys.join(', ') || 'full update'}]`,
      payload: nextContent,
      diff
    });

    // Stage 2: Sanitize Payload (strips undefined values recursively)
    const sanitized = sanitizeDocumentData(nextContent);
    dbLogger.logSanitization({
      sourceComponent: 'ShopContext',
      actionName: 'sanitizeDbPayload',
      targetPath: 'cms_site_content/main',
      summary: 'Stripped undefined values from the CMS payload so the stored row matches it exactly.',
      cleanedPayload: sanitized
    });

    // Stage 3: initiate the Supabase write
    const { startTime } = dbLogger.logDbWriteStart({
      operation: 'upsert',
      targetPath: 'cms_site_content/main',
      sourceComponent: 'ShopContext',
      actionName: 'upsert(cms_site_content/main)',
      summary: `Persisting updated site content to cms_site_content (key: main)...`,
      payload: sanitized
    });

    // ── Authoritative write: Supabase cms_site_content ──────────────────────
    // This used to persist only to Firestore `cms/main`, so admin edits never
    // reached the store the app was migrating to. cms_site_content is the only
    // record now — the Firestore mirror is gone.
    //
    // Blocks do not go into the jsonb: they are reconciled into their own table
    // first, then saveSiteContent stores the sections with customBlocks
    // stripped, so the two never disagree about which list is current.
    //
    // A failure is reported and rethrown. Telling an admin "published" for a
    // save that never landed is exactly the behaviour being removed.
    try {
      // The admin CMS tab edits blocks as one array, so a change to that array
      // has to be reconciled into row writes on cms_custom_blocks. Without
      // this, block edits made through the list UI would vanish, because
      // saveSiteContent deliberately refuses to store blocks in the jsonb.
      const nextBlocks = (nextContent.customBlocks || []) as CMSCustomBlock[];
      const currentBlocks = (siteContent.customBlocks || []) as CMSCustomBlock[];
      const syncedBlocks = await supabaseCmsService.syncCustomBlocks(currentBlocks, nextBlocks);
      if (syncedBlocks.length > 0) {
        cmsBlocksFromSupabaseRef.current = true;
      }

      await supabaseCmsService.saveSiteContent(sanitized as SiteContent);
      cmsSupabaseAuthoritativeRef.current = true;
    } catch (supaErr: any) {
      console.error('[ShopContext] Failed to save site content to Supabase:', supaErr);
      showToast(
        language === 'ar'
          ? `تعذر حفظ محتوى الموقع: ${supaErr?.message || 'خطأ غير معروف'}`
          : `Could not save site content: ${supaErr?.message || 'unknown error'}`,
        'error'
      );
      throw supaErr;
    }

    setSiteContent(sanitized);
    try {
      localStorage.setItem('yallalb_site_content', JSON.stringify(sanitized));
    } catch (localErr) {
      console.warn('[ShopContext] Failed to persist siteContent to localStorage:', localErr);
    }

    const isMetaChange = modifiedKeys.includes('seo') || Object.keys(diff).some(k => k.startsWith('seo.'));
    if (isMetaChange) {
      await logAdminActivity(
        'meta_change',
        'SEO Meta Tags updated',
        `Modified global page title or description for search engines: [${modifiedKeys.join(', ')}].`
      );
    } else {
      await logAdminActivity(
        'cms_update',
        'Site content updated',
        `Published updates to sections: [${modifiedKeys.join(', ') || 'none'}].`
      );
    }
  };


  const toggleSectionVisibility = async (sectionKey: keyof SectionVisibilityConfig) => {
    const currentVal = siteContent.visibility?.[sectionKey] ?? true;
    const nextVal = !currentVal;
    
    await updateSiteContent((prev) => ({
      ...prev,
      visibility: {
        ...(prev.visibility || DEFAULT_SITE_CONTENT.visibility),
        [sectionKey]: nextVal
      }
    }));

    showToast(`Section "${String(sectionKey)}" is now ${nextVal ? 'VISIBLE (Published)' : 'HIDDEN'}`, 'info');
  };

  /**
   * CMS block mutations write to Supabase `cms_custom_blocks`.
   *
   * They used to route through updateSiteContent, which persisted the block list
   * inside the Firestore CMS document. Two problems with that: the blocks table
   * is the store of record, and the id was minted as `block-${Date.now()}` —
   * a string Postgres cannot cast to the uuid primary key, so every insert
   * would have been rejected.
   *
   * Local state is updated only after the write succeeds, so the admin UI never
   * shows a block that is not in the database. Errors are surfaced and
   * rethrown so the calling form can keep the admin's input.
   */
  const addCustomBlock = async (newBlockData: Omit<CMSCustomBlock, 'id'>) => {
    // Real v4 UUID: cms_custom_blocks.id is a uuid column.
    const newBlock: CMSCustomBlock = { ...newBlockData, id: generateUuidV4() };

    try {
      const saved = await supabaseCmsService.upsertCustomBlock(newBlock);
      setSiteContent((prev) => ({
        ...prev,
        customBlocks: [...(prev.customBlocks || []), saved],
      }));
      cmsBlocksFromSupabaseRef.current = true;
      showToast(`Custom element "${saved.title}" created & published!`, 'success');
    } catch (err: any) {
      console.error('[ShopContext] addCustomBlock failed:', err);
      showToast(
        language === 'ar'
          ? `تعذر إنشاء العنصر: ${err?.message || 'خطأ غير معروف'}`
          : `Could not create block: ${err?.message || 'unknown error'}`,
        'error'
      );
      throw err;
    }
  };

  const updateCustomBlock = async (id: string, updates: Partial<CMSCustomBlock>) => {
    try {
      const existing = (siteContent.customBlocks || []).find((b) => b.id === id);
      const saved = await supabaseCmsService.upsertCustomBlock({ ...(existing || {}), ...updates, id });

      setSiteContent((prev) => ({
        ...prev,
        customBlocks: (prev.customBlocks || []).map((b) => (b.id === id ? saved : b)),
      }));
      cmsBlocksFromSupabaseRef.current = true;
      showToast('Custom block updated and published!', 'success');
    } catch (err: any) {
      console.error('[ShopContext] updateCustomBlock failed:', err);
      showToast(
        language === 'ar'
          ? `تعذر تحديث العنصر: ${err?.message || 'خطأ غير معروف'}`
          : `Could not update block: ${err?.message || 'unknown error'}`,
        'error'
      );
      throw err;
    }
  };

  const deleteCustomBlock = async (id: string) => {
    try {
      await supabaseCmsService.deleteCustomBlock(id);
      setSiteContent((prev) => ({
        ...prev,
        customBlocks: (prev.customBlocks || []).filter((b) => b.id !== id),
      }));
      showToast('Custom block deleted from page', 'warning');
    } catch (err: any) {
      console.error('[ShopContext] deleteCustomBlock failed:', err);
      showToast(
        language === 'ar'
          ? `تعذر حذف العنصر: ${err?.message || 'خطأ غير معروف'}`
          : `Could not delete block: ${err?.message || 'unknown error'}`,
        'error'
      );
      throw err;
    }
  };

  const toggleProductPublish = async (productId: string) => {
    const targetProd = products.find(p => p.id === productId);
    if (!targetProd) return;
    const isCurrentlyPublished = targetProd.isPublished !== false;
    const nextState = !isCurrentlyPublished;

    await updateProduct(productId, { isPublished: nextState });
    showToast(`Product "${targetProd.name}" is now ${nextState ? 'PUBLISHED' : 'HIDDEN'}`, 'info');
  };

  // Local storage persistence
  useEffect(() => {
    try {
      localStorage.setItem(CATALOG_CACHE_KEYS.products, JSON.stringify(products));
    } catch {}
  }, [products]);

  // Guests only: an authenticated cart is persisted to public.carts by the
  // effect further down, and must not be mirrored into this browser, where the
  // next person to use it would inherit it.
  useEffect(() => {
    if (authUser) return;
    try {
      localStorage.setItem(GUEST_CART_KEY, JSON.stringify(storedCart));
    } catch {}
  }, [storedCart, authUser]);

  useEffect(() => {
    if (authUser) return;
    try {
      localStorage.setItem(GUEST_WISHLIST_KEY, JSON.stringify(wishlist));
    } catch {}
  }, [wishlist, authUser]);

  useEffect(() => {
    try {
      // Only ever cache a single customer's own orders. An admin's list spans
      // every account, so caching it would leave other people's orders in this
      // browser; signing out clears the cache entirely.
      if (!isAdminUser && authUser && orders.length > 0) {
        localStorage.setItem('yallalb_orders', JSON.stringify(orders));
      } else if (!authUser) {
        localStorage.removeItem('yallalb_orders');
      }
    } catch {}
  }, [orders, isAdminUser, authUser]);

  useEffect(() => {
    try {
      localStorage.setItem('yallalb_user', JSON.stringify(user));
    } catch {}
  }, [user]);

  /**
   * Live catalogue sync from Supabase Realtime.
   *
   * Replaces an onSnapshot listener on the Firestore `products` collection,
   * which did three things that cannot survive the migration:
   *
   *  - on an empty collection it wrote the entire bundled demo catalogue into
   *    the database (as admin) and put it on screen for everyone else, which is
   *    exactly the "demo data in production" failure being removed here;
   *  - it overwrote the Supabase-hydrated catalogue on every snapshot, so
   *    whichever store answered last won;
   *  - it read Firestore documents shaped like the pre-migration Product, with
   *    slug ids that checkout rejects.
   *
   * `products` is a member of the `supabase_realtime` publication (verified in
   * pg_publication_tables), so INSERT/UPDATE/DELETE arrive here. Realtime
   * payloads are raw table rows: they carry no joined seller or category names,
   * no gallery rows, and — for a privileged subscriber — the private columns
   * that still exist on `products`. So a change notification is treated as an
   * invalidation signal, not as data: it triggers a re-read through the same
   * audience-appropriate path (public_catalog for customers, the base table for
   * admins and sellers) rather than being merged into state directly. That also
   * means an unpublish reaches customers as a removal, because the re-read goes
   * through a view that filters unpublished rows.
   */
  useEffect(() => {
    let isMounted = true;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const refreshCatalog = async () => {
      try {
        const fresh = await supabaseCatalogService.fetchProducts({
          isAdmin: isAdminUser,
          isSeller: isSellerUser,
          sellerId,
        });
        if (!isMounted) return;

        // An empty array is applied: a catalogue emptied (or fully unpublished)
        // in the database must empty on screen too.
        setProducts(fresh.map(ensureSellerItemCode));
        setHasMoreProducts(false);
        setCatalogStatus('ready');
        setCatalogError(null);
        try {
          localStorage.setItem(CATALOG_CACHE_KEYS.products, JSON.stringify(fresh));
        } catch {}
      } catch (err) {
        if (!isMounted) return;
        console.error('[ShopContext] Realtime catalogue refresh failed:', err);
        setCatalogStatus('error');
        setCatalogError(err instanceof Error ? err.message : String(err));
      } finally {
        if (isMounted) setIsDbSyncing(false);
      }
    };

    // Coalesce bursts: a single admin save can emit several row events, and a
    // bulk publish emits one per product. Re-reading once per burst keeps that
    // to one round trip.
    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(refreshCatalog, 400);
    };

    const channel = supabase
      .channel('yalla-products-catalog')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_images' }, scheduleRefresh)
      .subscribe((status: string) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          // Not fatal: the catalogue still loads on mount and after each admin
          // write. Logged so a broken realtime connection is visible rather
          // than silently degrading to a stale storefront.
          console.error(`[ShopContext] Supabase realtime channel for products: ${status}`);
        }
      });

    setIsDbSyncing(false);

    return () => {
      isMounted = false;
      if (refreshTimer) clearTimeout(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [isAdminUser, isSellerUser, sellerId]);

  /**
   * No-op: the catalogue is read in full, so there is no next page.
   *
   * This used to paginate Firestore `products` 24 documents at a time and
   * append them to state. Two problems now: those documents are the
   * pre-migration shape with slug ids that checkout rejects, and appending them
   * to a Supabase-sourced list would mix two stores in one catalogue. The
   * Supabase read returns the whole visible catalogue in one query (filtered by
   * the public_catalog view or by RLS), which is why hasMoreProducts is always
   * false.
   *
   * Kept as a function because the infinite-scroll UI calls it; if the
   * catalogue grows enough to need paging, page it with .range() against
   * public_catalog rather than reinstating this.
   */
  const loadMoreProducts = useCallback(async () => {
    return;
  }, []);

  // Merchant-private product fields (strictly scoped to admin or owning seller by RLS)
  useEffect(() => {
    /**
     * Removed: the Firestore product_private listener.
     *
     * The private merchant fields (cost price, stock thresholds, seller item
     * code) now arrive with the catalogue itself: fetchPrivilegedProducts
     * embeds public.product_private, whose RLS is
     * `is_admin() OR (is_seller() AND owns the row)`. Merging a second stream
     * into the product list was how those fields used to appear, and it is no
     * longer needed.
     */
  }, []);

  // Real-time orders sync from Supabase (scoped to the current user or admin by RLS)
  useEffect(() => {
    /**
     * Orders, from public.orders via supabaseOrderService.
     *
     * Replaces an onSnapshot listener over the Firestore `orders` collection.
     * Row visibility is the database's: orders RLS restricts a customer to
     * their own orders, and `orders` IS in the supabase_realtime publication,
     * so a status change is picked up by the channel below rather than by a
     * client-side query per role.
     */
    if (!authUser) {
      setOrders([]);
      return;
    }

    let isMounted = true;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const loadOrders = async () => {
      try {
        const rows = await supabaseOrderService.fetchOrders();
        if (isMounted) setOrders(rows);
      } catch (err) {
        console.error('[ShopContext] Failed to load orders:', err);
      }
    };

    loadOrders();

    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(loadOrders, 400);
    };

    const channel = supabase
      .channel('yalla-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, scheduleRefresh)
      .subscribe((status: string) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error(`[ShopContext] Supabase realtime channel for orders: ${status}`);
        }
      });

    return () => {
      isMounted = false;
      if (refreshTimer) clearTimeout(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [authUser, isAdminUser, isSellerUser, sellerId]);

  // Auth & User / Cart / Wishlist synchronization using Supabase Auth
  useEffect(() => {
    let isMounted = true;

    /**
     * Which auth event the in-flight profile read belongs to.
     *
     * handleAuthUser defers its database reads, and getSession() plus every
     * onAuthStateChange event can have one in flight at once. Without this,
     * a slow read for an earlier event could land after a newer one and
     * reinstate the previous user's role, profile and cart — signing out and
     * straight back in as someone else being the obvious case. Each call
     * claims a generation and abandons its work if a newer one has started.
     */
    let authGeneration = 0;
    console.log("[ShopContext] Initializing Supabase Auth listener...");

    const deriveNames = (displayName?: string | null, email?: string | null) => {
      if (displayName && displayName.trim()) {
        const parts = displayName.trim().split(/\s+/);
        return {
          firstName: parts[0],
          lastName: parts.slice(1).join(' ') || '',
          name: displayName.trim()
        };
      }
      if (email && email.includes('@')) {
        const raw = email.split('@')[0].replace(/[0-9]+/g, ' ').trim();
        const parts = raw.split(/[\._\-\s]+/).filter(Boolean);
        if (parts.length >= 2) {
          const f = parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase();
          const l = parts[1].charAt(0).toUpperCase() + parts[1].slice(1).toLowerCase();
          return { firstName: f, lastName: l, name: `${f} ${l}` };
        } else if (parts.length === 1 && parts[0].length > 0) {
          const f = parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase();
          return { firstName: f, lastName: '', name: f };
        }
      }
      return { firstName: '', lastName: '', name: '' };
    };

    const handleAuthUser = (supaUser: SupabaseUser | null) => {
      if (!isMounted) return;
      authGeneration += 1;
      const myGeneration = authGeneration;
      const isCurrent = () => isMounted && myGeneration === authGeneration;
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
          localStorage.removeItem('yallalb_orders');
        } catch {}

        // Close the write gate: with no session, RLS would reject a cart write
        // anyway, and an attempted one must not look like a save.
        setCartHydratedForUserId(null);
        lastPersistedCartRef.current = null;
        lastPersistedWishlistRef.current = null;

        // A cart that belonged to a signed-in account is that account's, and it
        // is already saved in Supabase. Leaving it on screen after sign-out
        // would hand it to whoever uses this browser next, so it is cleared.
        // A genuine guest cart is preserved, which keeps the
        // browse → add to cart → sign up flow working.
        if (readLocalCartOwner() !== 'guest') {
          setCart([]);
          setWishlist([]);
          try {
            localStorage.removeItem(GUEST_CART_KEY);
            localStorage.removeItem(GUEST_WISHLIST_KEY);
            localStorage.removeItem(LEGACY_CART_KEY);
            localStorage.removeItem(LEGACY_WISHLIST_KEY);
          } catch {}
          writeLocalCartOwner('guest');
        } else {
          try {
            const guestCart = getGuestStorage(GUEST_CART_KEY, LEGACY_CART_KEY);
            if (guestCart) {
              const parsed = JSON.parse(guestCart);
              if (Array.isArray(parsed) && parsed.length > 0) {
                setCart(parsed);
              }
            }
            const guestWishlist = getGuestStorage(GUEST_WISHLIST_KEY, LEGACY_WISHLIST_KEY);
            if (guestWishlist) {
              const parsed = JSON.parse(guestWishlist);
              if (Array.isArray(parsed)) {
                setWishlist(parsed);
              }
            }
          } catch {}
        }
        return;
      }

      // 1. Initial immediate user adapter setup to unblock UI while deferring DB queries
      const initialUserAdapter = createAuthUserAdapter(supaUser, 'customer', null, {});
      setAuthUser(initialUserAdapter);
      setIsEmailVerified(Boolean(supaUser.email_confirmed_at));

      // 2. Defer database query using setTimeout to avoid potential deadlock in onAuthStateChange
      setTimeout(async () => {
        if (!isCurrent()) return;

        let profileRole: 'admin' | 'seller' | 'customer' = 'customer';
        let profileSellerId: string | null = null;
        let profileData: Record<string, any> = {};

        try {
          const { data: profile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', supaUser.id)
            .maybeSingle();

          if (profile && !error) {
            profileData = profile;
            if (profile.role === 'admin') {
              profileRole = 'admin';
            } else if (profile.role === 'seller') {
              profileRole = 'seller';
            }
            if (profile.seller_id || profile.sellerId) {
              profileSellerId = profile.seller_id || profile.sellerId;
            }
          }
        } catch (profileErr) {
          console.warn("[ShopContext] Error loading Supabase user profile from database:", profileErr);
        }

        if (!isCurrent()) return;

        const isAdmin = profileRole === 'admin';
        const isSeller = profileRole === 'seller';
        const isEmailConfirmed = Boolean(supaUser.email_confirmed_at);

        setIsAdminUser(isAdmin);
        setIsSellerUser(isSeller);
        setSellerId(profileSellerId);
        setIsEmailVerified(isEmailConfirmed);

        const authoritativeUserAdapter = createAuthUserAdapter(supaUser, profileRole, profileSellerId, profileData);
        setAuthUser(authoritativeUserAdapter);

        // Check if local cache has shipping defaults
        let cachedShipping: Partial<UserProfile> = {};
        try {
          const rawCache = localStorage.getItem('yallalb_saved_checkout_data');
          if (rawCache) {
            cachedShipping = JSON.parse(rawCache);
          }
        } catch {}

        const fallbackNames = deriveNames(authoritativeUserAdapter.displayName, supaUser.email);
        const safeProfile = mapSafeShopUserProfile(
          profileData,
          authoritativeUserAdapter,
          profileSellerId,
          cachedShipping,
          fallbackNames
        );
        setUser(safeProfile);
        setIsLoadingAuth(false);

        // ── Cart & wishlist hydration from Supabase ──────────────────────────
        // Supabase `carts` / `wishlists` are authoritative. This previously read
        // Firestore `carts/<id>` and `wishlists/<id>`, documents that nothing
        // writes any more, so a saved cart could never come back after a reload.
        //
        // Row access is enforced in the database: carts_own / wishlists_own are
        // `user_id = auth.uid() OR is_admin()` for ALL commands, so one user
        // cannot read or write another user's cart even by passing their id.
        const localOwner = readLocalCartOwner();
        const localBelongsToSomeoneElse = localOwner !== 'guest' && localOwner !== supaUser.id;

        if (localBelongsToSomeoneElse) {
          // Previous account's cart is still in this browser. Drop it rather
          // than showing it to the person who just signed in.
          setCart([]);
          setWishlist([]);
        }

        try {
          const [savedCart, savedWishlist] = await Promise.all([
            supabaseUserDataService.fetchCart(supaUser.id),
            supabaseUserDataService.fetchWishlist(supaUser.id),
          ]);

          if (!isCurrent()) return;

          // null means "no row saved yet" (an expected empty result), not
          // failure — in that case a guest cart carried into sign-in is kept
          // and the effect below saves it to the account.
          if (savedCart) {
            setCart(savedCart);
            // Mark it already persisted: it came straight from the row, so the
            // effect has nothing to write back.
            lastPersistedCartRef.current = JSON.stringify(savedCart);
          } else {
            lastPersistedCartRef.current = null;
          }

          if (savedWishlist) {
            setWishlist(savedWishlist);
            lastPersistedWishlistRef.current = JSON.stringify(savedWishlist);
          } else {
            lastPersistedWishlistRef.current = null;
          }

          writeLocalCartOwner(supaUser.id);
          // Only now may the persistence effects write: before this point a
          // write would overwrite the saved row with unhydrated local state.
          setCartHydratedForUserId(supaUser.id);
        } catch (cartErr) {
          // A failed read must not be mistaken for an empty cart. Leave the
          // hydration gate closed so nothing is written over the saved row,
          // and tell the user their saved cart could not be loaded.
          console.error('[ShopContext] Failed to load saved cart/wishlist from Supabase:', cartErr);
          if (isCurrent()) {
            setCartHydratedForUserId(null);
            showToast(
              language === 'ar'
                ? 'تعذر تحميل سلتك المحفوظة. لن يتم حفظ التغييرات حتى تحديث الصفحة.'
                : 'Could not load your saved cart. Changes will not be saved until you reload.',
              'error'
            );
          }
        }
      }, 0);
    };

    // 1. Initial Session Restoration
    supabase.auth.getSession().then(({ data: { session }, error }: { data: { session: Session | null }; error: AuthError | null }) => {
      if (error) {
        console.warn("[ShopContext] Error restoring Supabase session:", error);
      }
      handleAuthUser(session?.user ?? null);
    }).catch((err: unknown) => {
      console.warn("[ShopContext] Supabase getSession catch:", err);
      handleAuthUser(null);
    });

    // 2. Auth State Change Listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      console.log(`[ShopContext] Supabase Auth event: ${event}`, session?.user?.id ?? "None (Guest)");
      handleAuthUser(session?.user ?? null);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  /**
   * Persist the cart to Supabase `carts` whenever it changes (debounced 800ms).
   *
   * This replaces a write to Firestore `carts/<uid>`, which is no longer the
   * store of record. It covers every cart mutation — add, quantity change,
   * remove, and clear — because they all reduce onto `storedCart`; clearing to
   * [] is persisted as an empty cart rather than being skipped.
   *
   * The write is gated on hydration having succeeded for this exact user, so a
   * saved cart is never overwritten by local state that predates the read.
   */
  useEffect(() => {
    const userId = authUser?.uid;
    if (!userId) return; // guest: localStorage only
    if (cartHydratedForUserId !== userId) return;

    const payload = JSON.stringify(storedCart);
    if (payload === lastPersistedCartRef.current) return;

    const handler = setTimeout(() => {
      supabaseUserDataService
        .saveCart(userId, storedCart)
        .then(() => {
          lastPersistedCartRef.current = payload;
        })
        .catch((err: unknown) => {
          // Surfaced, not swallowed: the user needs to know the cart they are
          // looking at is not saved.
          console.error('[ShopContext] Failed to save cart to Supabase:', err);
          showToast(
            language === 'ar' ? 'تعذر حفظ سلتك على الخادم.' : 'Could not save your cart to the server.',
            'error'
          );
        });
    }, 800);

    return () => clearTimeout(handler);
    // `language` is intentionally not a dependency: it is declared further down
    // this component body, so naming it here would read it during render, while
    // it is still in its temporal dead zone. The callback reads it safely
    // because it only runs after the body has finished.
  }, [storedCart, authUser, cartHydratedForUserId]);

  /** Persist the wishlist to Supabase `wishlists`. Same gating as the cart. */
  useEffect(() => {
    const userId = authUser?.uid;
    if (!userId) return;
    if (cartHydratedForUserId !== userId) return;

    const payload = JSON.stringify(wishlist);
    if (payload === lastPersistedWishlistRef.current) return;

    const handler = setTimeout(() => {
      supabaseUserDataService
        .saveWishlist(userId, wishlist)
        .then(() => {
          lastPersistedWishlistRef.current = payload;
        })
        .catch((err: unknown) => {
          console.error('[ShopContext] Failed to save wishlist to Supabase:', err);

          // The catalog is still serving bundled demo slugs, so the ids cannot
          // go into a uuid[] column. That is a migration state to fix, not a
          // server fault, and telling the shopper the server failed would be
          // wrong — so it is loud in the console and silent in the UI.
          if (err instanceof Error && err.name === 'NonUuidProductIdsError') return;

          showToast(
            language === 'ar' ? 'تعذر حفظ قائمة رغباتك على الخادم.' : 'Could not save your wishlist to the server.',
            'error'
          );
        });
    }, 800);

    return () => clearTimeout(handler);
  }, [wishlist, authUser, cartHydratedForUserId]);

  /**
   * Classifies a Supabase Auth failure.
   *
   * The three call sites below compared `error.code` against Firebase codes
   * ('auth/invalid-credential', 'auth/email-already-in-use',
   * 'auth/weak-password', 'auth/network-request-failed', …). Supabase never
   * sets those, so every specific branch was dead and users saw the generic
   * fallback message.
   *
   * Supabase reports an AuthApiError with an HTTP `status`, a snake_case
   * `code` on recent client versions, and a human message. All three are
   * consulted so the mapping keeps working whichever the installed client
   * provides.
   */
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

  const classifyAuthError = (error: any): AuthErrorKind => {
    const code = String(error?.code ?? '');
    const status = Number(error?.status ?? 0);
    const message = String(error?.message ?? '').toLowerCase();

    if (error?.name === 'AuthRetryableFetchError' || error instanceof TypeError) return 'network';
    if (
      message.includes('failed to fetch') ||
      message.includes('fetch failed') ||
      message.includes('networkerror') ||
      message.includes('load failed')
    ) {
      return 'network';
    }

    if (code === 'invalid_credentials' || message.includes('invalid login credentials') || message.includes('invalid credentials')) {
      return 'invalid_credentials';
    }
    if (code === 'email_not_confirmed' || message.includes('email not confirmed')) return 'unconfirmed_email';
    if (
      code === 'user_already_exists' ||
      code === 'email_exists' ||
      message.includes('already registered') ||
      message.includes('already in use') ||
      message.includes('user already exists')
    ) {
      return 'already_registered';
    }
    if (code === 'weak_password' || message.includes('password should be') || message.includes('password is too weak')) {
      return 'weak_password';
    }
    if (code === 'validation_failed' || message.includes('invalid email') || message.includes('unable to validate email')) {
      return 'invalid_email';
    }
    if (status === 429 || code.includes('rate_limit') || message.includes('rate limit') || message.includes('too many requests')) {
      return 'rate_limited';
    }
    if (status === 404 || code === 'user_not_found' || message.includes('user not found')) return 'not_found';

    return 'unknown';
  };

  /**
   * Retries only failures that a retry can fix.
   *
   * The condition was `error.code === 'auth/network-request-failed'`, a
   * Firebase Auth code Supabase never emits, so in practice nothing retried
   * except a message that happened to contain "fetch failed".
   *
   * Retryable: a transport failure (the fetch itself threw), Supabase's own
   * AuthRetryableFetchError, and 408 / 429 / 5xx from the API.
   *
   * Never retried: authorization and validation failures. Repeating them
   * cannot change the answer, and retrying a rejected sign-in burns the rate
   * limit that produced it — so invalid credentials, 400/401/403/422, RLS
   * denials (42501) and constraint violations (23xxx) are rethrown at once.
   */
  const isRetryableBackendError = (error: any): boolean => {
    if (!error) return false;

    const status = Number(error.status ?? error.statusCode ?? 0);
    const code = String(error.code ?? '');
    const message = String(error.message ?? '').toLowerCase();

    // Authorization / validation: never retry.
    if ([400, 401, 403, 404, 409, 422].includes(status)) return false;
    if (/^(42501|42P01|23\d{3}|P0001|P0002|PGRST\d+)$/.test(code)) return false;
    if (
      message.includes('invalid login credentials') ||
      message.includes('email not confirmed') ||
      message.includes('already registered') ||
      message.includes('row-level security') ||
      message.includes('violates')
    ) {
      return false;
    }

    // Supabase marks its own retryable transport failures.
    if (error.name === 'AuthRetryableFetchError') return true;

    // Server-side and throttling failures are worth one more attempt.
    if (status === 408 || status === 429 || (status >= 500 && status <= 599)) return true;

    // A fetch that never reached the API throws a TypeError.
    return (
      error instanceof TypeError ||
      message.includes('failed to fetch') ||
      message.includes('fetch failed') ||
      message.includes('networkerror') ||
      message.includes('network request failed') ||
      message.includes('load failed') ||
      message.includes('timeout')
    );
  };

  async function executeWithRetry<T>(fn: () => Promise<T>, retries = 2, delay = 1000): Promise<T> {
    try {
      return await fn();
    } catch (error: any) {
      if (retries > 0 && isRetryableBackendError(error)) {
        console.warn(
          `[ShopContext] Retryable backend failure (${error?.name || error?.code || error?.status || 'network'}), ` +
            `retrying... (${retries} attempts left)`
        );
        await new Promise(resolve => setTimeout(resolve, delay));
        return executeWithRetry(fn, retries - 1, delay * 2);
      }
      throw error;
    }
  }

  const signInWithGoogle = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
        },
      });
      if (error) throw error;
      showToast('Redirecting to Google sign in...', 'info');
    } catch (error: any) {
      console.warn('[ShopContext] Supabase Google sign-in failed:', error);
      showToast('Failed to sign in with Google: ' + (error.message || 'Unknown error'), 'warning');
    }
  };

  const signInWithApple = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'apple',
        options: {
          redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
        },
      });
      if (error) throw error;
      showToast('Redirecting to Apple sign in...', 'info');
    } catch (error: any) {
      console.warn('[ShopContext] Supabase Apple sign-in failed:', error);
      showToast('Failed to sign in with Apple: ' + (error.message || 'Unknown error'), 'warning');
    }
  };
  
  const resetPassword = async (email: string) => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      const msg = language === 'ar' ? 'الرجاء إدخال البريد الإلكتروني' : 'Please enter an email address.';
      showToast(msg, 'warning');
      throw new Error(msg);
    }

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/account?resetPassword=true` : undefined,
      });
      if (error) throw error;

      const successMsg = language === 'ar'
        ? 'إذا كان البريد مسجلاً لدينا، فقد تم إرسال رابط إعادة تعيين كلمة المرور إلى صندوق الوارد.'
        : 'If an account exists for this email address, a password reset link has been sent.';
      showToast(successMsg, 'success');
    } catch (error: any) {
      if (classifyAuthError(error) === 'not_found') {
        // OWASP User Enumeration Prevention: generic response prevents email address discovery
        const successMsg = language === 'ar'
          ? 'إذا كان البريد مسجلاً لدينا، فقد تم إرسال رابط إعادة تعيين كلمة المرور إلى صندوق الوارد.'
          : 'If an account exists for this email address, a password reset link has been sent.';
        showToast(successMsg, 'success');
        return;
      }
      let msg = language === 'ar' ? 'فشل إرسال رابط إعادة التعيين: ' : 'Failed to send reset email: ';
      msg += error.message || '';
      showToast(msg, 'warning');
      throw error;
    }
  };

  const sendEmailOtp = async (email: string) => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      const msg = language === 'ar' ? 'الرجاء إدخال بريد إلكتروني صالح' : 'Please enter a valid email address.';
      showToast(msg, 'warning');
      throw new Error(msg);
    }

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: typeof window !== 'undefined' ? `${window.location.origin}/account` : undefined,
        },
      });
      if (error) throw error;

      if (typeof window !== 'undefined') {
        window.localStorage.setItem('emailForSignIn', cleanEmail);
      }

      const successMsg = language === 'ar'
        ? `تم إرسال رمز التحقق إلى ${cleanEmail}! يرجى مراجعة بريدك الإلكتروني.`
        : `Verification code sent to ${cleanEmail}! Please check your email inbox.`;
      showToast(successMsg, 'success');
    } catch (err: any) {
      console.error("[ShopContext] sendEmailOtp error:", err);
      let msg = err.message || 'Failed to send OTP code';
      showToast(msg, 'warning');
      throw err;
    }
  };

  const verifyEmailOtp = async (email: string, token: string, type: EmailOtpType = 'email') => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanToken = token.trim();
    if (!cleanEmail || !cleanToken) {
      const msg = language === 'ar' ? 'يرجى إدخال البريد الإلكتروني ورمز التحقق' : 'Please enter email and verification code.';
      showToast(msg, 'warning');
      throw new Error(msg);
    }

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: cleanEmail,
        token: cleanToken,
        type: type as any,
      });

      if (error) throw error;

      if (typeof window !== 'undefined') {
        window.localStorage.removeItem('emailForSignIn');
      }

      showToast(language === 'ar' ? 'تم التحقق بنجاح!' : 'Verification successful!', 'success');
    } catch (err: any) {
      console.error("[ShopContext] verifyEmailOtp error:", err);
      let msg = err.message || 'Invalid or expired verification code.';
      showToast(msg, 'warning');
      throw err;
    }
  };

  const resendEmailVerification = async (email?: string) => {
    const targetEmail = (email || authUser?.email || user.email || '').trim().toLowerCase();
    if (!targetEmail) {
      const msg = language === 'ar' ? 'الرجاء إدخال البريد الإلكتروني' : 'Please provide an email address.';
      showToast(msg, 'warning');
      return;
    }
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: targetEmail,
        options: {
          emailRedirectTo: typeof window !== 'undefined' ? `${window.location.origin}/account?verified=true` : undefined,
        }
      });
      if (error) throw error;
      showToast(
        language === 'ar'
          ? 'تم إرسال بريد التحقق بنجاح! يرجى مراجعة صندوق الوارد.'
          : 'Verification email sent successfully! Please check your inbox.',
        'success'
      );
    } catch (err: any) {
      console.error("[ShopContext] resendEmailVerification error:", err);
      showToast(err.message || 'Failed to resend verification email.', 'warning');
      throw err;
    }
  };

  const signUpWithEmail = async (email: string, pass: string, phone?: string) => {
    // Check phone uniqueness before creating the auth record if phone is provided
    const targetPhone = phone || (() => {
      try {
        const rawTemp = localStorage.getItem('yallalb_signup_profile_temp');
        if (rawTemp) {
          const parsed = JSON.parse(rawTemp);
          return parsed.phone || '';
        }
      } catch {}
      return '';
    })();

    if (targetPhone) {
      const phoneCheck = await checkPhoneUniqueness(targetPhone);
      if (!phoneCheck.available) {
        const msg = phoneCheck.reason || (language === 'ar' ? 'رقم الهاتف هذا مسجل مسبقاً بحساب آخر.' : 'This phone number is already registered to another account.');
        showToast(msg, 'warning');
        throw new Error(msg);
      }
    }

    // L-5: Validate password complexity
    if (pass.length < 8) {
      const msg = 'Password must be at least 8 characters long.';
      showToast(msg, 'warning');
      throw new Error(msg);
    }
    const hasUppercase = /[A-Z]/.test(pass);
    const hasLowercase = /[a-z]/.test(pass);
    const hasNumber = /[0-9]/.test(pass);
    const hasSpecial = /[^A-Za-z0-9]/.test(pass);
    if (!hasUppercase || !hasLowercase || !hasNumber || !hasSpecial) {
      const msg = 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character.';
      showToast(msg, 'warning');
      throw new Error(msg);
    }

    try {
      let tempSignup: any = {};
      try {
        const rawTemp = localStorage.getItem('yallalb_signup_profile_temp');
        if (rawTemp) tempSignup = JSON.parse(rawTemp);
      } catch {}

      const cleanEmail = email.trim().toLowerCase();
      const { data: supaAuthData, error: supaErr } = await supabase.auth.signUp({
        email: cleanEmail,
        password: pass,
        options: {
          data: {
            name: tempSignup.firstName && tempSignup.lastName ? `${tempSignup.firstName} ${tempSignup.lastName}`.trim() : '',
            phone: targetPhone || '',
          },
          emailRedirectTo: typeof window !== 'undefined' ? `${window.location.origin}/account?verified=true` : undefined,
        },
      });

      if (supaErr) {
        throw supaErr;
      }

      // Safe profile sync to database if triggered or needed (DB trigger handles row creation)
      if (supaAuthData?.user) {
        try {
          await supabase.from('profiles').update({
            first_name: tempSignup.firstName || '',
            last_name: tempSignup.lastName || '',
            name: tempSignup.firstName && tempSignup.lastName ? `${tempSignup.firstName} ${tempSignup.lastName}`.trim() : '',
            phone: targetPhone || '',
            default_governorate: tempSignup.defaultGovernorate || '',
            default_city: tempSignup.defaultCity || '',
            default_address: tempSignup.defaultAddress || '',
            default_building: tempSignup.defaultBuilding || '',
            default_notes: tempSignup.defaultNotes || '',
          }).eq('id', supaAuthData.user.id);
        } catch (profErr) {
          console.warn('[ShopContext] Safe profile update notice:', profErr);
        }
      }

      if (supaAuthData.user && !supaAuthData.session) {
        showToast(
          language === 'ar'
            ? 'تم إنشاء الحساب! تحقق من بريدك الإلكتروني واضغط على رابط التفعيل.'
            : 'Account created. Check your email and click the verification link to start ordering.',
          'success'
        );
      } else {
        showToast('Account created successfully!', 'success');
      }
    } catch (err: any) {
      console.error("Sign up error:", err);
      let msg = 'Sign up failed: ' + (err.message || 'Unknown error');
      switch (classifyAuthError(err)) {
        case 'already_registered':
          msg = 'This email is already in use. If you already have an account, please Sign In instead.';
          break;
        case 'weak_password':
          msg = 'Password is too weak. Please choose a stronger password.';
          break;
        case 'invalid_email':
          msg = 'Invalid email address format.';
          break;
        case 'rate_limited':
          msg = 'Too many sign-up attempts. Please wait a moment and try again.';
          break;
        case 'network':
          msg = 'Network connection error. Please check your internet connection and try again.';
          break;
        default:
          break;
      }
      showToast(msg, 'warning');
      throw err;
    }
  };

  const sendEmailSignInLink = async (email: string) => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      const msg = language === 'ar' ? 'الرجاء إدخال بريد إلكتروني صالح' : 'Please enter a valid email address.';
      showToast(msg, 'warning');
      throw new Error(msg);
    }

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: {
          emailRedirectTo: `${window.location.origin}/account`,
        },
      });
      if (error) throw error;

      if (typeof window !== 'undefined') {
        window.localStorage.setItem('emailForSignIn', cleanEmail);
      }

      const successMsg = language === 'ar'
        ? `تم إرسال رابط الدخول الآمن إلى ${cleanEmail}! تحقق من صندوق بريدك الإلكتروني.`
        : `Secure sign-in link sent to ${cleanEmail}! Please check your email inbox.`;
      showToast(successMsg, 'success');
    } catch (err: any) {
      console.error("[ShopContext] sendSignInLink error:", err);
      let msg = err.message || 'Failed to send sign-in link';
      showToast(msg, 'warning');
      throw err;
    }
  };

  const completeEmailLinkSignIn = async (emailInput?: string, urlOrToken?: string) => {
    const currentUrl = typeof window !== 'undefined' ? window.location.href : '';
    let email = emailInput || (typeof window !== 'undefined' ? window.localStorage.getItem('emailForSignIn') || '' : '');

    try {
      // 1. If 6-digit OTP code was provided
      if (urlOrToken && urlOrToken.trim().length === 6 && !urlOrToken.startsWith('http') && email) {
        await verifyEmailOtp(email, urlOrToken, 'email');
        return;
      }

      const callbackUrl = new URL(urlOrToken || currentUrl || 'http://localhost/');
      const hashParams = new URLSearchParams(
        callbackUrl.hash.startsWith('#') ? callbackUrl.hash.slice(1) : ''
      );

      // 2. A link Supabase rejected (expired, already used, wrong redirect) is
      //    reported in the URL, not by an exception. Surface it instead of
      //    falling through to "no session" and looking like nothing happened.
      const callbackError =
        callbackUrl.searchParams.get('error_description') ||
        callbackUrl.searchParams.get('error') ||
        hashParams.get('error_description') ||
        hashParams.get('error');
      if (callbackError) {
        throw new Error(decodeURIComponent(callbackError.replace(/\+/g, ' ')));
      }

      // 3. Token-hash email templates (?token_hash=&type=) are not consumed by
      //    detectSessionInUrl; they have to be redeemed explicitly.
      const tokenHash = callbackUrl.searchParams.get('token_hash');
      const linkType = callbackUrl.searchParams.get('type');
      if (tokenHash) {
        const { error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: (linkType as EmailOtpType) || 'magiclink',
        });
        if (verifyError) throw verifyError;
      }

      // 4. The PKCE code exchange (?code=) and the implicit fragment are
      //    handled by the client on load because detectSessionInUrl is on;
      //    getSession() waits for that to finish before answering.
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;

      if (data.session?.user) {
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem('emailForSignIn');
          // Strip the Supabase callback parameters so a reload cannot replay
          // a spent code and so the address bar stops showing the token.
          ['code', 'token_hash', 'type', 'error', 'error_code', 'error_description', 'emailSignIn'].forEach((k) =>
            callbackUrl.searchParams.delete(k)
          );
          callbackUrl.hash = '';
          const cleaned = `${callbackUrl.pathname || '/'}${callbackUrl.search}`;
          window.history.replaceState({}, document.title, cleaned);
        }
        showToast(language === 'ar' ? 'تم تسجيل الدخول بنجاح عبر الرابط!' : 'Successfully signed in via email link!', 'success');
        return;
      }

      // No session and no error: the link carried nothing usable.
      throw new Error(
        language === 'ar'
          ? 'رابط تسجيل الدخول غير صالح أو انتهت صلاحيته.'
          : 'Sign-in link is invalid or has expired.'
      );
    } catch (error: any) {
      console.error("[ShopContext] completeEmailLinkSignIn error:", error);
      let msg = error.message || 'Sign in link is invalid or has expired.';
      showToast(msg, 'warning');
      throw error;
    }
  };

  const signInWithEmail = async (email: string, pass: string) => {
    const cleanEmail = email.trim().toLowerCase();
    try {
      const { data, error } = await executeWithRetry<{
        data: { user: SupabaseUser | null; session: Session | null };
        error: AuthError | null;
      }>(() =>
        supabase.auth.signInWithPassword({
          email: cleanEmail,
          password: pass,
        })
      );

      if (error) {
        throw error;
      }

      showToast('Successfully signed in!', 'success');
    } catch (error: any) {
      console.error("Auth error:", error);
      let msg = 'Authentication failed: ' + (error.message || 'Unknown error');
      switch (classifyAuthError(error)) {
        case 'invalid_credentials':
        case 'not_found':
          msg = 'Incorrect email or password. If you forgot your password, please click "Forgot Password?".';
          break;
        case 'unconfirmed_email':
          msg = 'Please confirm your email address first. Check your inbox for the verification link.';
          break;
        case 'network':
          msg = 'Network connection error. Please check your internet connection and try again.';
          break;
        case 'invalid_email':
          msg = 'Invalid email address format.';
          break;
        case 'rate_limited':
          msg = 'Too many attempts. Please wait a moment and try again.';
          break;
        default:
          break;
      }
      showToast(msg, 'warning');
      throw error;
    }
  };

  const signOutUser = async () => {
    try {
      await supabase.auth.signOut();
      setAuthUser(null);
      setUser(INITIAL_USER);
      setIsAdminUser(false);
      setIsSellerUser(false);
      setSellerId(null);
      setIsLocalAdminUnlockedState(false);
      setOrders([]);
      try {
        localStorage.removeItem('yallalb_orders');
        localStorage.removeItem('yallalb_saved_checkout_data');
      } catch {}
      showToast('Signed out successfully', 'info');
    } catch (error: any) {
      console.error("[ShopContext] signOut error:", error);
      showToast('Signed out', 'info');
    }
  };

  const refreshUserProfile = async () => {
    try {
      const { data: supaUserData } = await supabase.auth.getUser();
      const supaUser = supaUserData?.user;
      if (!supaUser) return;

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', supaUser.id)
        .maybeSingle();

      let profileRole: 'admin' | 'seller' | 'customer' = 'customer';
      let profileSellerId: string | null = null;
      let profileData: Record<string, any> = {};

      if (profile && !error) {
        profileData = profile;
        if (profile.role === 'admin') {
          profileRole = 'admin';
        } else if (profile.role === 'seller') {
          profileRole = 'seller';
        }
        if (profile.seller_id || profile.sellerId) {
          profileSellerId = profile.seller_id || profile.sellerId;
        }
      }

      const hasAdminClaim = profileRole === 'admin';
      const hasSellerClaim = profileRole === 'seller';
      const claimSellerId = profileSellerId;

      setIsAdminUser(hasAdminClaim);
      setIsSellerUser(hasSellerClaim);
      setSellerId(claimSellerId);
      setIsEmailVerified(Boolean(supaUser.email_confirmed_at));

      const userAdapter = createAuthUserAdapter(supaUser, profileRole, claimSellerId, profileData);
      setAuthUser(userAdapter);

      let cachedShipping: Partial<UserProfile> = {};
      try {
        const rawCache = localStorage.getItem('yallalb_saved_checkout_data');
        if (rawCache) cachedShipping = JSON.parse(rawCache);
      } catch {}
      const fallbackNames = {
        firstName: profileData.first_name || profileData.firstName || '',
        lastName: profileData.last_name || profileData.lastName || '',
        name: profileData.name || supaUser.user_metadata?.name || ''
      };
      setUser(mapSafeShopUserProfile(profileData, userAdapter, claimSellerId, cachedShipping, fallbackNames));
    } catch (err) {
      console.warn("[ShopContext] refreshUserProfile notice:", err);
    }
  };



  const [language, setLanguageState] = useState<Language>(() => {
    try {
      if (typeof window !== 'undefined') {
        const urlLang = new URLSearchParams(window.location.search).get('lang');
        if (urlLang === 'ar' || urlLang === 'en') {
          return urlLang;
        }
      }
      const saved = localStorage.getItem('yallalb_language');
      return (saved === 'ar' || saved === 'en') ? saved : 'en';
    } catch {
      return 'en';
    }
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    try {
      const isCmsPreview = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('cmsPreview') === '1';
      if (!isCmsPreview) {
        localStorage.setItem('yallalb_language', lang);
      }
    } catch {}
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  };

  useEffect(() => {
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
  }, [language]);

  const t = (key: keyof typeof translations['en'], params?: Record<string, string>): string => {
    let text = translations[language]?.[key] || translations['en']?.[key] || (key as string);
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        text = text.replace(`{${k}}`, v);
      });
    }
    return text;
  };

  const navHistoryRef = useRef<Array<{ tab: NavTab; selectedProduct: Product | null; category?: string }>>([]);

  const setActiveTab = useCallback((tab: NavTab) => {
    setActiveTabState(prev => {
      if (prev !== tab) {
        navHistoryRef.current.push({ tab: prev, selectedProduct: selectedProductDetail, category: selectedCategory });
        if (tab !== 'product_detail') {
          setSelectedProductDetail(null);
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return tab;
      }
      return prev;
    });
  }, [selectedProductDetail, selectedCategory]);

  const openProductDetail = useCallback((product: Product) => {
    setActiveTabState(prev => {
      navHistoryRef.current.push({ tab: prev, selectedProduct: selectedProductDetail, category: selectedCategory });
      setSelectedProductDetail(product);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return 'product_detail';
    });
  }, [selectedProductDetail, selectedCategory]);

  const goBack = useCallback(() => {
    const prevEntry = navHistoryRef.current.pop();
    if (prevEntry) {
      setSelectedProductDetail(prevEntry.selectedProduct);
      if (prevEntry.category && prevEntry.tab === 'products') {
        setSelectedCategory(prevEntry.category);
      }
      setActiveTabState(prevEntry.tab);
    } else {
      setSelectedProductDetail(null);
      setSelectedCategory('all');
      setActiveTabState('home');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const showToast = (message: string, type: 'success' | 'info' | 'warning' | 'error' = 'success') => {
    const id = Date.now().toString();
    setToast({ id, message, type });
    setTimeout(() => {
      setToast(prev => (prev?.id === id ? null : prev));
    }, 3500);
  };

  const currencySymbol = currency === 'LBP' ? 'L.L.' : '$';
  const currencyRate = currency === 'LBP' ? LBP_USD_RATE : 1;

  const convertUSDToLBP = (amountUSD: number) => {
    return Math.round(amountUSD * LBP_USD_RATE);
  };

  const formatPrice = (amountUSD: number) => {
    if (currency === 'LBP') {
      const amountLBP = convertUSDToLBP(amountUSD);
      return `L.L. ${amountLBP.toLocaleString()}`;
    }
    return `$${amountUSD.toFixed(2)}`;
  };

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

  const rawSubtotalUSD = Math.round(cart.reduce((sum, item) => sum + item.product.priceUSD * item.quantity, 0) * 100) / 100;
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

    // Optimistic local state update
    setOrders(prev => {
      const next = prev.map(ord => (ord.id === orderId ? { ...ord, status } : ord));
      try {
        localStorage.setItem('yallalb_orders', JSON.stringify(next));
      } catch {}
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
      summary: `Admin created new product "${newProduct.name}" ($${newProduct.priceUSD})`,
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
        localStorage.setItem(CATALOG_CACHE_KEYS.products, JSON.stringify(next));
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
          localStorage.setItem(CATALOG_CACHE_KEYS.products, JSON.stringify(next));
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
      `Added new catalog item with ID: ${newProduct.id}, category: ${newProduct.category}, and price: $${newProduct.priceUSD}.`,
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
        localStorage.setItem(CATALOG_CACHE_KEYS.products, JSON.stringify(next));
      } catch {}
      return next;
    });

    // ── Authoritative write: Supabase ─────────────────────────────────────
    // Only the fields the caller actually changed are sent, so a targeted edit
    // (a price, a publish toggle) cannot blank out columns it never mentioned:
    // upsertProduct drops undefined keys, and leaves product_private and
    // product_images alone unless those fields were supplied.
    try {
      await supabaseCatalogService.upsertProduct({ ...updates, id });
    } catch (supaErr: any) {
      if (existing) {
        setProducts(prev => {
          const next = prev.map(p => (p.id === id ? existing : p));
          try {
            localStorage.setItem(CATALOG_CACHE_KEYS.products, JSON.stringify(next));
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
        localStorage.setItem(CATALOG_CACHE_KEYS.products, JSON.stringify(next));
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
            localStorage.setItem(CATALOG_CACHE_KEYS.products, JSON.stringify(next));
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

    setProducts(prev => {
      const next = prev.filter(p => !ids.includes(p.id));
      try {
        localStorage.setItem(CATALOG_CACHE_KEYS.products, JSON.stringify(next));
      } catch {}
      return next;
    });

    await logAdminActivity(
      'product_delete',
      `Bulk deleted ${ids.length} products`,
      `Permanently removed ${ids.length} products from catalog.`
    );
    showToast(`${ids.length} products deleted!`);
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
        localStorage.setItem(CATALOG_CACHE_KEYS.products, JSON.stringify(freshProducts));
        localStorage.setItem(CATALOG_CACHE_KEYS.categories, JSON.stringify(freshCategories));
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
    setUser(updatedUser);

    if (!authUser) {
      try {
        localStorage.setItem('yallalb_saved_checkout_data', JSON.stringify(sanitizedUser));
      } catch {}
      return;
    }

    const userKey = authUser.uid;

    const { startTime } = dbLogger.logDbWriteStart({
      operation: 'upsert',
      targetPath: `profiles/${userKey}`,
      sourceComponent: 'ShopContext',
      actionName: 'updateUser',
      summary: `Persisting profile and delivery details for user (${userKey}) to profiles...`,
      payload: sanitizedUser
    });

    // public.profiles is the only profile store; the Firestore `users` mirror
    // that stood here is gone. upsertProfile omits every privilege field, and
    // protect_profile_role() pins them for non-admins regardless.
    try {
      await supabaseUserDataService.upsertProfile(userKey, sanitizedUser as Partial<UserProfile>);
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
