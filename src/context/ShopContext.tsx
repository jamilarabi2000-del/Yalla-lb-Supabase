import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Product, CartItem, Order, UserProfile, Currency, SiteContent, SectionVisibilityConfig, CMSCustomBlock, RecentActivity, DiscountRule, ProductBundle, CategoryItem, TerroirRegion, Seller, SearchLog } from '../types';
import { applyDiscounts } from '../lib/pricing';
import { calcDeliveryFeeUSD } from '../lib/delivery';
import { INITIAL_PRODUCTS } from '../data/products';
import { DEFAULT_SITE_CONTENT } from '../data/cmsContent';
import { DEFAULT_CATEGORIES } from '../data/categories';
import { DEFAULT_SELLERS } from '../data/sellers';
import { LEBANON_REGIONS, LBP_USD_RATE } from '../data/regions';
import { normalizeLebanesePhone, isValidLebanesePhone } from '../utils/phoneUtils';
import { generateIdempotencyKey, secureRandomInt, secureRandomString } from '../utils/uuid';
import Papa from 'papaparse';
import { translations, Language } from '../utils/translations';
import { resolveSeller, resolveCategory, parsePrice, parseStock, isCsvRowEmpty } from '../utils/importerResolvers';
import { checkDuplicateProductNumber, checkDuplicateDescription } from '../lib/productValidation';
import { filterPublicCmsContent } from '../utils/cmsPublicProjection';
import { assertHighRiskAuthorization } from '../utils/adminMfa';
import { auth, db, functionsInstance, httpsCallable, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, onIdTokenChanged, FirebaseUser, IS_FIREBASE_ENABLED, signInWithPopup, GoogleAuthProvider, googleProvider, OAuthProvider, appleProvider, sendPasswordResetEmail, sendEmailVerification, sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink } from '../firebase';
import { 
  dbLogger, 
  sanitizeFirestorePayload, 
  calculateObjectDiff 
} from '../utils/dbLogger';
import {
  dbMonitor,
  monitoredSetDoc,
  monitoredGetDoc,
  monitoredUpdateDoc,
  monitoredDeleteDoc,
  monitoredBatchCommit,
  sanitizeDocumentData
} from '../utils/databaseMonitor';
import { 
  doc, 
  getDoc, 
  setDoc, 
  deleteDoc, 
  collection, 
  collectionGroup,
  getDocs, 
  onSnapshot, 
  getDocFromServer,
  getDocFromCache,
  writeBatch,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  runTransaction,
  serverTimestamp,
  or
} from 'firebase/firestore';

const safeGetDoc = async (docRef: any): Promise<any> => {
  try {
    return await getDoc(docRef);
  } catch (err: any) {
    if (err.code === 'unavailable' || err.message?.includes('offline') || err.message?.includes('Failed to get document')) {
      console.warn("[ShopContext] safeGetDoc: Client is offline. Falling back to cache...", err.message);
      try {
        return await getDocFromCache(docRef);
      } catch (cacheErr) {
        throw err;
      }
    }
    throw err;
  }
};

// Client-side checkout cap. MUST equal MAX_LINE_ITEMS in functions/src/placeOrder.ts,
// which is the authoritative limit; this constant only lets the UI reject an oversized
// cart before the round trip. test/security.test.ts asserts the two stay in sync.
// (The former value of 8 predated server-authoritative checkout, when order payloads were
// still evaluated by firestore.rules. Orders are now `allow create: if false`, so no rule
// evaluates an order and that budget constraint no longer applies.)
export const MAX_ORDER_LINE_ITEMS = 50;

export const ensureSellerItemCode = (p: Product): Product => {
  if (!p) return p;
  return p;
};

export const ensureSellerCode = (s: Seller, index = 0): Seller => {
  if (!s.sellerCode || !s.sellerCode.trim()) {
    const codeNum = index + 101;
    return { ...s, sellerCode: `SLR-${codeNum}` };
  }
  return s;
};

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
  };
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errInfo = {
    error: errorMessage,
    authInfo: {
      userId: auth.currentUser?.uid,
      // Redact email to prevent PII leakage
      email: auth.currentUser?.email ? '[REDACTED_PII]' : null,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  return `Database error during ${operationType} on ${path || 'unknown'}: ${errorMessage}`;
}


interface Toast {
  id: string;
  message: string;
  type: 'success' | 'info' | 'warning' | 'error';
}

export type NavTab = 'home' | 'products' | 'product_detail' | 'checkout' | 'account' | 'admin' | 'favorites' | 'seller';

const getInitialNavTab = (): NavTab => {
  if (typeof window === 'undefined') return 'home';
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
  if (path === 'checkout' || path === 'account' || path === 'favorites') {
    return path as NavTab;
  }
  return 'home';
};

const getInitialCategory = (): string => {
  if (typeof window === 'undefined') return 'all';
  const path = window.location.pathname.replace(/^\/+/, '');
  if (path.startsWith('products/')) {
    const cat = path.replace('products/', '');
    return decodeURIComponent(cat) || 'all';
  }
  return 'all';
};

const getInitialProductDetail = (): Product | null => {
  if (typeof window === 'undefined') return null;
  const path = window.location.pathname.replace(/^\/+/, '');
  if (path.startsWith('product/')) {
    const prodId = path.replace('product/', '');
    try {
      const saved = localStorage.getItem('yallalb_products');
      const all = saved ? JSON.parse(saved) : INITIAL_PRODUCTS;
      return (all as Product[]).find(p => p.id === prodId) || null;
    } catch {
      return INITIAL_PRODUCTS.find(p => p.id === prodId) || null;
    }
  }
  return null;
};

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
  t: (key: keyof typeof translations['en'], params?: Record<string, string>) => string;

  // Products
  products: Product[];
  addProduct: (product: Omit<Product, 'id'>) => Promise<void>;
  updateProduct: (id: string, updates: Partial<Product>) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  deleteMultipleProducts: (ids: string[]) => Promise<void>;
  reorderProducts: (orderedProducts: Product[]) => Promise<void>;
  toggleProductPublish: (productId: string) => Promise<void>;
  syncAllProductsToDatabase: () => Promise<void>;
  selectedProductForModal: Product | null;
  setSelectedProductForModal: (p: Product | null) => void;
  isDbSyncing: boolean;
  hasMoreProducts: boolean;
  isFetchingMore: boolean;
  loadMoreProducts: () => Promise<void>;

  // Currency
  currency: Currency;
  setCurrency: (c: Currency) => void;
  formatPrice: (amountUSD: number) => string;
  convertUSDToLBP: (amountUSD: number) => number;
  currencySymbol: string;
  currencyRate: number;

  // Cart
  cart: CartItem[];
  addToCart: (product: Product, quantity?: number, option?: string) => void;
  addMultipleToCart: (items: { product: Product; quantity?: number; option?: string }[]) => void;
  removeFromCart: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  cartTotalUSD: number;
  cartCount: number;
  isCartOpen: boolean;
  setIsCartOpen: (open: boolean) => void;

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

  // Firebase Auth & OTP Verification
  firebaseUser: FirebaseUser | null;
  isAdminUser: boolean;
  isSellerUser: boolean;
  sellerId: string | null;
  isEmailVerified: boolean;
  isLoadingAuth: boolean;
  authStatus: 'loading' | 'unauthenticated' | 'authenticated_non_admin' | 'authenticated_admin';
  signInWithEmail: (email: string, pass: string) => Promise<void>;
  signUpWithEmail: (email: string, pass: string, phone?: string) => Promise<void>;
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
 * Firestore user documents are UNTRUSTED profile data.
 * Under NO circumstances are admin, seller, or sellerId permissions derived from Firestore.
 * Identity (uid), role ('customer'), and sellerId (claims only) are strictly enforced.
 */
export function mapSafeShopUserProfile(
  data: Record<string, any>,
  fbUser: FirebaseUser,
  authoritativeSellerId: string | null,
  cachedShipping?: Partial<UserProfile>,
  fallbackNames?: { firstName: string; lastName: string; name: string }
): UserProfile {
  const firstName =
    (typeof data.firstName === 'string' && data.firstName.trim()) ||
    (typeof data.name === 'string' && data.name.trim() ? data.name.trim().split(' ')[0] : '') ||
    cachedShipping?.firstName ||
    fallbackNames?.firstName ||
    '';

  const lastName =
    (typeof data.lastName === 'string' && data.lastName.trim()) ||
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
    INITIAL_USER.defaultGovernorate ||
    '';

  const defaultCity =
    (typeof data.defaultCity === 'string' && data.defaultCity.trim()) ||
    cachedShipping?.defaultCity ||
    '';

  const defaultAddress =
    (typeof data.defaultAddress === 'string' && data.defaultAddress.trim()) ||
    cachedShipping?.defaultAddress ||
    '';

  const defaultBuilding =
    (typeof data.defaultBuilding === 'string' && data.defaultBuilding.trim()) ||
    cachedShipping?.defaultBuilding ||
    undefined;

  const defaultNotes =
    (typeof data.defaultNotes === 'string' && data.defaultNotes.trim()) ||
    cachedShipping?.defaultNotes ||
    undefined;

  return {
    uid: fbUser.uid,
    name:
      (typeof data.name === 'string' && data.name.trim()) ||
      `${firstName} ${lastName}`.trim() ||
      fbUser.displayName ||
      '',
    firstName,
    lastName,
    email: (typeof data.email === 'string' && data.email.trim()) || fbUser.email || '',
    phone,
    avatar: (typeof data.avatar === 'string' && data.avatar.trim()) || fbUser.photoURL || INITIAL_USER.avatar,
    defaultGovernorate,
    defaultCity,
    defaultAddress,
    defaultBuilding,
    defaultNotes,
    // NEVER use Firestore role for authorization.
    role: 'customer',
    // ONLY Firebase Auth custom claim.
    sellerId: authoritativeSellerId || undefined,
    emailVerified: fbUser.emailVerified,
    isOtpVerified: typeof data.isOtpVerified === 'boolean' ? data.isOtpVerified : undefined
  };
}

export const mapUserProfile = mapSafeShopUserProfile;
export function mapSafeUserProfile(
  fbUser: FirebaseUser,
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
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [isSellerUser, setIsSellerUser] = useState(false);
  const [sellerId, setSellerId] = useState<string | null>(null);
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  useEffect(() => {
    if (!firebaseUser) { setIsEmailVerified(false); return; }
    // force refresh so a freshly-clicked verification link is picked up
    firebaseUser.getIdTokenResult(true)
      .then(r => setIsEmailVerified(r.claims.email_verified === true))
      .catch(() => setIsEmailVerified(false));
  }, [firebaseUser]);

  useEffect(() => {
    if (firebaseUser) {
      firebaseUser.getIdTokenResult(true) // force refresh
        .then(result => {
          setIsAdminUser(result.claims.admin === true);
          setIsSellerUser(result.claims.seller === true);
          setSellerId(typeof result.claims.sellerId === 'string' ? result.claims.sellerId : null);
        })
        .catch(() => {
          setIsAdminUser(false);
          setIsSellerUser(false);
          setSellerId(null);
        });
    } else {
      setIsAdminUser(false);
      setIsSellerUser(false);
      setSellerId(null);
    }
  }, [firebaseUser]);

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

  // Test Firestore Connection on Boot
  useEffect(() => {
    if (!IS_FIREBASE_ENABLED) return;
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
        console.log("[ShopContext] Firebase Firestore connection verified.");
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.warn("[ShopContext] Please check your Firebase configuration or network connection.");
        }
      }
    }
    testConnection();
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

  // Core Data States with local storage fallback
  const [products, setProducts] = useState<Product[]>(() => {
    try {
      const saved = localStorage.getItem('yallalb_products');
      const list = saved ? JSON.parse(saved) : INITIAL_PRODUCTS;
      return (list as Product[]).map(ensureSellerItemCode);
    } catch {
      return INITIAL_PRODUCTS.map(ensureSellerItemCode);
    }
  });

  const [storedCart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem('yallalb_cart');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

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
      const saved = localStorage.getItem('yallalb_wishlist');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [orders, setOrders] = useState<Order[]>(() => {
    // Only load orders from local storage in offline/no-firebase mode, never in Firebase mode to prevent cross-account leak
    if (!IS_FIREBASE_ENABLED) {
      try {
        const saved = localStorage.getItem('yallalb_orders');
        return saved ? JSON.parse(saved) : INITIAL_ORDERS;
      } catch {
        return INITIAL_ORDERS;
      }
    }
    return INITIAL_ORDERS;
  });

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

  // Real-time Recent Activity Sync from Firestore
  useEffect(() => {
    if (!IS_FIREBASE_ENABLED || !isAdminUser) return;
    const activityColRef = collection(db, 'recent_activity');
    const q = query(activityColRef, orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: RecentActivity[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() } as RecentActivity);
        });
        setRecentActivities(list.slice(0, 50));
      },
      (error) => {
        console.warn("[ShopContext] Recent activities listener warning:", error);
      }
    );
    return () => unsubscribe();
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
        adminEmail: firebaseUser?.email || user.email || 'anonymous-admin',
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

      if (IS_FIREBASE_ENABLED && isAdminUser) {
        await monitoredSetDoc(doc(db, 'recent_activity', activityId), sanitizeDocumentData(newActivity), undefined, 'ShopContext:logAdminActivity').catch((err) => {
          console.warn("[ShopContext] Non-blocking admin activity log notice:", err);
        });
      }
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
          localStorage.setItem('yallalb_products', JSON.stringify(products.map(p => p.id === act.targetId ? { ...restoredProduct } : p)));
        } catch {}
        if (IS_FIREBASE_ENABLED) {
          await monitoredSetDoc(doc(db, 'products', act.targetId), sanitizeDocumentData(restoredProduct), undefined, 'ShopContext:undoAdminActivity');
        }
      } else if (act.actionType === 'product_add' && act.targetId) {
        setProducts(prev => prev.filter(p => p.id !== act.targetId));
        if (IS_FIREBASE_ENABLED) {
          await monitoredDeleteDoc(doc(db, 'products', act.targetId), 'ShopContext:undoAdminActivity');
        }
      } else if (act.actionType === 'product_delete' && act.targetId && act.snapshotBefore) {
        const restoredProduct = act.snapshotBefore as Product;
        setProducts(prev => [...prev.filter(p => p.id !== act.targetId), restoredProduct]);
        if (IS_FIREBASE_ENABLED) {
          await monitoredSetDoc(doc(db, 'products', act.targetId), sanitizeDocumentData(restoredProduct), undefined, 'ShopContext:undoAdminActivity');
        }
      } else if (act.actionType === 'product_bulk_update' && Array.isArray(act.snapshotBefore)) {
        const restoredProducts = act.snapshotBefore as Product[];
        const restoredMap = new Map(restoredProducts.map(p => [p.id, p]));
        setProducts(prev => prev.map(p => restoredMap.get(p.id) || p));
        if (IS_FIREBASE_ENABLED) {
          const batch = writeBatch(db);
          restoredProducts.forEach(p => {
            batch.set(doc(db, 'products', p.id), sanitizeDocumentData(p));
          });
          await batch.commit();
        }
      } else {
        showToast('Undo is only supported for product additions, updates, and deletions.', 'warning');
        return;
      }

      const undoneTimestamp = new Date().toISOString();
      setRecentActivities(prev => prev.map(a => a.id === activityId ? { ...a, isUndone: true, undoneAt: undoneTimestamp } : a));

      if (IS_FIREBASE_ENABLED) {
        await monitoredSetDoc(doc(db, 'recent_activity', activityId), { isUndone: true, undoneAt: undoneTimestamp }, { merge: true });
      }

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

  const [discountRules, setDiscountRules] = useState<DiscountRule[]>(() => {
    try {
      const saved = localStorage.getItem('yallalb_discount_rules');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [
      {
        id: 'rule-1',
        name: 'Koura Olive Oil Special (15% Off)',
        type: 'percentage',
        value: 15,
        target: 'brand',
        targetValue: 'Koura, North Lebanon',
        isActive: true
      },
      {
        id: 'rule-2',
        name: 'Checkout Extra $5 Off',
        type: 'fixed',
        value: 5,
        target: 'checkout',
        isActive: true,
        minPurchaseUSD: 30
      }
    ];
  });

  useEffect(() => {
    try {
      localStorage.setItem('yallalb_discount_rules', JSON.stringify(discountRules));
    } catch {}
  }, [discountRules]);

  // Real-time Discounts Sync from Firestore Database
  useEffect(() => {
    if (!IS_FIREBASE_ENABLED) return;
    const discountsColRef = collection(db, 'discounts');
    const q = isAdminUser ? discountsColRef : query(discountsColRef, where('isActive', '==', true));
    const unsubscribe = onSnapshot(
      q,
      async (snapshot) => {
        if (snapshot.empty && !hasSeededDiscountsRef.current) {
          hasSeededDiscountsRef.current = true;
          const initialRules = [
            {
              id: 'rule-1',
              name: 'Koura Olive Oil Special (15% Off)',
              type: 'percentage' as const,
              value: 15,
              target: 'brand' as const,
              targetValue: 'Koura, North Lebanon',
              couponCode: 'KOURA_SEC26',
              isActive: true
            },
            {
              id: 'rule-2',
              name: 'Checkout Extra $5 Off',
              type: 'fixed' as const,
              value: 5,
              target: 'checkout' as const,
              couponCode: 'WELCOME_SEC26',
              isActive: true,
              minPurchaseUSD: 30
            }
          ];
          if (isAdminUser) {
            console.log("[ShopContext] Database discounts collection is empty. Seeding initial discount rules to Firestore...");
            try {
              const batch = writeBatch(db);
              initialRules.forEach(rule => {
                const docRef = doc(db, 'discounts', rule.id);
                const { couponCode, ...ruleWithoutCoupon } = rule;
                batch.set(docRef, sanitizeDocumentData(ruleWithoutCoupon));
                if (couponCode) {
                  const couponRef = doc(db, 'coupons', rule.id);
                  batch.set(couponRef, {
                    discountId: rule.id,
                    couponCode: couponCode,
                    usageCount: 0,
                    usedBy: []
                  });
                }
              });
              await monitoredBatchCommit(batch, initialRules.length * 2, 'discounts', 'ShopContext:AutoSeedDiscounts');
            } catch (seedErr) {
              console.warn("[ShopContext] Notice seeding initial discount rules (using in-memory defaults):", seedErr);
            }
          }
          setDiscountRules(initialRules as DiscountRule[]);
        } else if (!snapshot.empty) {
          try {
            let couponsMap = new Map();
            if (isAdminUser) {
              try {
                const couponsSnap = await getDocs(collection(db, 'coupons'));
                couponsSnap.forEach(d => {
                  couponsMap.set(d.data().discountId || d.id, d.data());
                });
              } catch (couponFetchErr: any) {
                console.warn('[ShopContext] Non-admin or limited permissions reading coupons collection:', couponFetchErr?.message || couponFetchErr);
              }
            }

            const rules: DiscountRule[] = [];
            snapshot.forEach(docSnap => {
              const r = docSnap.data() as DiscountRule;
              const c = couponsMap.get(r.id);
              if (c) {
                (r as any).couponCode = c.couponCode;
                (r as any).maxTotalUses = c.maxTotalUses;
                (r as any).maxUsesPerUser = c.maxUsesPerUser;
              }
              rules.push(r);
            });
            setDiscountRules(rules);
          } catch (err: any) {
            console.warn('Failed to fetch coupons (falling back gracefully):', err?.message || err);
            const rules: DiscountRule[] = [];
            snapshot.forEach(docSnap => {
              rules.push(docSnap.data() as DiscountRule);
            });
            setDiscountRules(rules);
          }
        }
      },
      (error) => {
        console.warn("[ShopContext] Non-blocking discounts listener warning:", error);
      }
    );
    return () => unsubscribe();
  }, [isAdminUser]);

  const addDiscountRule = async (ruleData: Omit<DiscountRule, 'id'>, couponCode?: string, maxTotalUses?: number, maxUsesPerUser?: number) => {
    const id = 'rule-' + secureRandomString(7);
    const newRule: DiscountRule = {
      ...ruleData,
      id
    };
    try {
      if (IS_FIREBASE_ENABLED) {
        const { couponCode: _c, maxTotalUses: _m, maxUsesPerUser: _u, ...safeDiscountDoc } = newRule as any;
        await monitoredSetDoc(doc(db, 'discounts', id), sanitizeDocumentData(safeDiscountDoc), undefined, 'ShopContext:addDiscountRule');
        if (couponCode && couponCode.trim() !== '') {
          await monitoredSetDoc(doc(db, 'coupons', id), { 
            discountId: id, 
            couponCode: couponCode.trim().toUpperCase(), 
            usageCount: 0, 
            usedBy: [],
            maxTotalUses: maxTotalUses || null,
            maxUsesPerUser: maxUsesPerUser || null
          }, undefined, 'ShopContext:addCoupon');
        }
      }
    } catch (err) {
      console.error("[ShopContext] Error saving discount rule to Firestore:", err);
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
      if (IS_FIREBASE_ENABLED) {
        const { couponCode: _c, maxTotalUses: _m, maxUsesPerUser: _u, ...safeUpdatesDoc } = updatedRule as any;
        await monitoredSetDoc(doc(db, 'discounts', id), sanitizeDocumentData(safeUpdatesDoc), { merge: true }, 'ShopContext:updateDiscountRule');
        if (couponCode !== undefined) {
          if (couponCode.trim() === '') {
            await monitoredDeleteDoc(doc(db, 'coupons', id), 'ShopContext:deleteCoupon').catch(() => {});
          } else {
            await monitoredSetDoc(doc(db, 'coupons', id), { 
              discountId: id, 
              couponCode: couponCode.trim().toUpperCase(),
              ...(maxTotalUses !== undefined && { maxTotalUses: maxTotalUses || null }),
              ...(maxUsesPerUser !== undefined && { maxUsesPerUser: maxUsesPerUser || null })
            }, { merge: true }, 'ShopContext:updateCoupon');
          }
        }
      }
      const ruleWithMeta = { ...updatedRule, ...(couponCode !== undefined ? { couponCode } : {}), ...(maxTotalUses !== undefined ? { maxTotalUses } : {}), ...(maxUsesPerUser !== undefined ? { maxUsesPerUser } : {}) };
      setDiscountRules(prev => prev.map(r => r.id === id ? ruleWithMeta : r));
    } catch (err) {
      console.error("[ShopContext] Error updating discount rule in Firestore:", err);
      showToast('Failed to update discount rule in database', 'warning');
      throw err;
    }
    await logAdminActivity('meta_change', 'Updated Discount Rule', `Updated discount ID: ${id}`);
  };

  const deleteDiscountRule = async (id: string) => {
    try {
      if (IS_FIREBASE_ENABLED) {
        await monitoredDeleteDoc(doc(db, 'discounts', id), 'ShopContext:deleteDiscountRule');
        await monitoredDeleteDoc(doc(db, 'coupons', id), 'ShopContext:deleteCoupon').catch(() => {});
      }
      setDiscountRules(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      console.error("[ShopContext] Error deleting discount rule from Firestore:", err);
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
    if (!IS_FIREBASE_ENABLED) return;
    const bundlesColRef = collection(db, 'product_bundles');
    const q = isAdminUser ? bundlesColRef : query(bundlesColRef, where('isActive', '==', true));
    const unsubscribe = onSnapshot(
      q,
      async (snapshot) => {
        const hasInitialized = localStorage.getItem('yallalb_bundles_initialized') === 'true';
        if (snapshot.empty && !hasSeededBundlesRef.current && !hasInitialized) {
          hasSeededBundlesRef.current = true;
          localStorage.setItem('yallalb_bundles_initialized', 'true');
          const initialBundles: ProductBundle[] = [
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
          if (isAdminUser) {
            for (const b of initialBundles) {
              await monitoredSetDoc(doc(db, 'product_bundles', b.id), sanitizeDocumentData(b), undefined, 'ShopContext:seedBundles');
            }
          }
        } else if (!snapshot.empty) {
          hasSeededBundlesRef.current = true;
          localStorage.setItem('yallalb_bundles_initialized', 'true');
          const list: ProductBundle[] = [];
          snapshot.forEach(docSnap => {
            list.push({ id: docSnap.id, ...docSnap.data() } as ProductBundle);
          });
          setProductBundles(list);
        } else if (snapshot.empty && (hasSeededBundlesRef.current || hasInitialized)) {
          setProductBundles([]);
        }
      },
      (error) => {
        console.warn("[ShopContext] Bundles listener warning:", error);
      }
    );
    return () => unsubscribe();
  }, []);

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
      if (IS_FIREBASE_ENABLED) {
        await monitoredSetDoc(doc(db, 'product_bundles', id), sanitizeDocumentData(newBundle), undefined, 'ShopContext:addProductBundle');
      }
    } catch (err) {
      console.error("[ShopContext] Error saving bundle to Firestore:", err);
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
      if (IS_FIREBASE_ENABLED) {
        await monitoredSetDoc(doc(db, 'product_bundles', id), sanitizeDocumentData(updatedBundle), { merge: true }, 'ShopContext:updateProductBundle');
      }
    } catch (err) {
      console.error("[ShopContext] Error updating bundle in Firestore:", err);
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
      if (IS_FIREBASE_ENABLED) {
        await monitoredDeleteDoc(doc(db, 'product_bundles', id), 'ShopContext:deleteProductBundle');
      }
    } catch (err) {
      console.error("[ShopContext] Error deleting bundle from Firestore:", err);
    }
    await logAdminActivity('meta_change', 'Deleted Combo Deal', `Deleted bundle ID: ${id}`);
  };

  // Categories & Details Management State
  const [categories, setCategories] = useState<CategoryItem[]>(() => {
    try {
      const saved = localStorage.getItem('yallalb_categories');
      return saved ? JSON.parse(saved) : DEFAULT_CATEGORIES;
    } catch {
      return DEFAULT_CATEGORIES;
    }
  });

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
      localStorage.setItem('yallalb_categories', JSON.stringify(categories));
    } catch {}
  }, [categories]);

  useEffect(() => {
    try {
      localStorage.setItem('yallalb_regions', JSON.stringify(regions));
    } catch {}
  }, [regions]);

  // Real-time Categories Sync from Firestore Database
  useEffect(() => {
    if (!IS_FIREBASE_ENABLED) return;
    const catDocRef = doc(db, 'site_settings', 'categories');
    const unsubscribe = onSnapshot(
      catDocRef,
      async (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (Array.isArray(data?.list) && data.list.length > 0) {
            // Check if any default categories are missing in Firestore list
            const firestoreIds = new Set(data.list.map((c: any) => c.id));
            const missingFromDefault = DEFAULT_CATEGORIES.filter(c => !firestoreIds.has(c.id));
            if (missingFromDefault.length > 0 && isAdminUser) {
              console.log('[ShopContext] Supplementing missing categories to Firestore:', missingFromDefault.map(c => c.id));
              const merged = [...data.list, ...missingFromDefault];
              setCategories(merged);
              try {
                await monitoredSetDoc(catDocRef, { list: sanitizeDocumentData(merged) }, undefined, 'ShopContext:supplementCategories');
              } catch (suppErr) {
                console.warn('[ShopContext] Error supplementing missing categories:', suppErr);
              }
            } else {
              setCategories(data.list);
            }
          }
        } else {
          if (isAdminUser) {
            try {
              await monitoredSetDoc(catDocRef, { list: sanitizeDocumentData(DEFAULT_CATEGORIES) }, undefined, 'ShopContext:seedCategories');
            } catch (seedErr) {
              console.warn('[ShopContext] Error seeding default categories to Firestore:', seedErr);
            }
          }
          setCategories(DEFAULT_CATEGORIES);
        }
      },
      (err) => {
        console.warn('[ShopContext] Categories snapshot sync warning:', err);
      }
    );
    return () => unsubscribe();
  }, []);

  // Real-time Regions Sync from Firestore Database
  useEffect(() => {
    if (!IS_FIREBASE_ENABLED) return;
    const regDocRef = doc(db, 'site_settings', 'regions');
    const unsubscribe = onSnapshot(
      regDocRef,
      async (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (Array.isArray(data?.list)) {
            setRegions(data.list);
          }
        } else {
          if (isAdminUser) {
            try {
              await monitoredSetDoc(regDocRef, { list: sanitizeDocumentData(LEBANON_REGIONS) }, undefined, 'ShopContext:seedRegions');
            } catch (seedErr) {
              console.warn('[ShopContext] Error seeding default regions to Firestore:', seedErr);
            }
          }
          setRegions(LEBANON_REGIONS);
        }
      },
      (err) => {
        console.warn('[ShopContext] Regions snapshot sync warning:', err);
      }
    );
    return () => unsubscribe();
  }, []);

  const addCategory = async (catData: Omit<CategoryItem, 'id'> & { id?: string }) => {
    const slug = catData.id?.trim() || catData.nameEn.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `cat-${Date.now()}`;
    if (categories.some(c => c.id === slug)) {
      throw new Error(`A category with the ID "${slug}" already exists.`);
    }

    const newCategory: CategoryItem = {
      ...catData,
      id: slug,
      subcategories: catData.subcategories || [],
      arabicKeywords: catData.arabicKeywords || [],
      englishKeywords: catData.englishKeywords || [],
      isPublished: catData.isPublished ?? true,
      displayOrder: catData.displayOrder ?? (categories.length + 1)
    };
    
    const previous = [...categories];
    const nextCategories = [...categories, newCategory];
    setCategories(nextCategories);

    if (IS_FIREBASE_ENABLED) {
      try {
        await monitoredSetDoc(doc(db, 'site_settings', 'categories'), { list: sanitizeDocumentData(nextCategories) }, undefined, 'ShopContext:addCategory');
      } catch (err) {
        setCategories(previous);
        console.error('[ShopContext] Failed to add category to Firestore:', err);
        throw err;
      }
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

    if (IS_FIREBASE_ENABLED) {
      try {
        await monitoredSetDoc(doc(db, 'site_settings', 'categories'), { list: sanitizeDocumentData(nextCategories) }, undefined, 'ShopContext:updateCategory');
      } catch (err) {
        setCategories(previous);
        console.error('[ShopContext] Failed to update category in Firestore:', err);
        throw err;
      }
    }

    await logAdminActivity(
      'category_update',
      `Category "${existing?.nameEn || id}" updated`,
      `Modified attributes for category: ${Object.keys(updates).join(', ')}.`
    );
  };

  const deleteCategory = async (id: string, reassignCategoryId?: string, deleteAttachedProducts?: boolean) => {
    if (isAdminUser) {
      const authorized = await assertHighRiskAuthorization(firebaseUser?.uid);
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

    if (shouldDeleteProducts) {
      const affectedIds = new Set(affectedProducts.map(p => p.id));
      const nextProducts = products.filter(p => !affectedIds.has(p.id));
      setProducts(nextProducts);
      try {
        localStorage.setItem('yallalb_products', JSON.stringify(nextProducts));
      } catch {}
    } else if (reassignCategoryId && reassignCategoryId !== '__delete_products__') {
      const nextProducts = products.map(p => p.category === id ? { ...p, category: reassignCategoryId } : p);
      setProducts(nextProducts);
      try {
        localStorage.setItem('yallalb_products', JSON.stringify(nextProducts));
      } catch {}
    }

    if (IS_FIREBASE_ENABLED) {
      try {
        const batch = writeBatch(db);
        batch.set(doc(db, 'site_settings', 'categories'), { list: sanitizeDocumentData(nextCategories) });
        
        if (shouldDeleteProducts) {
          for (const prod of affectedProducts) {
            batch.delete(doc(db, 'products', prod.id));
          }
        } else if (reassignCategoryId && reassignCategoryId !== '__delete_products__') {
          for (const prod of affectedProducts) {
            batch.update(doc(db, 'products', prod.id), { category: reassignCategoryId });
          }
        }
        await batch.commit();
      } catch (err) {
        setCategories(previousCategories);
        console.error('[ShopContext] Failed to delete category in Firestore:', err);
        throw err;
      }
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

    if (IS_FIREBASE_ENABLED) {
      try {
        await monitoredSetDoc(doc(db, 'site_settings', 'categories'), { list: sanitizeDocumentData(normalized) }, undefined, 'ShopContext:reorderCategories');
      } catch (err) {
        console.error('[ShopContext] Error reordering categories in Firestore:', err);
        showToast('Failed to save category order to database', 'warning');
        throw err;
      }
    }

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
        localStorage.setItem('yallalb_products', JSON.stringify(updatedProducts));
      }
    } catch {}

    if (IS_FIREBASE_ENABLED) {
      try {
        // Chunk into batches of 400 for Firestore safety
        const CHUNK_SIZE = 400;
        for (let i = 0; i < orderedProducts.length; i += CHUNK_SIZE) {
          const chunk = orderedProducts.slice(i, i + CHUNK_SIZE);
          const batch = writeBatch(db);
          chunk.forEach((p, chunkIdx) => {
            const actualIdx = i + chunkIdx + 1;
            const prodRef = doc(db, 'products', p.id);
            batch.update(prodRef, { displayOrder: actualIdx });
          });
          await batch.commit();
        }
      } catch (err) {
        console.error('[ShopContext] Error reordering products in Firestore:', err);
        showToast('Failed to save product order to database', 'warning');
        throw err;
      }
    }

    await logAdminActivity('product_update', 'Products reordered', `Admin reordered ${orderedProducts.length} products.`);
  };

  const updateRegion = async (id: string, updates: Partial<TerroirRegion>) => {
    const existing = regions.find(r => r.id === id);
    const previous = [...regions];
    const nextRegions = regions.map(r => r.id === id ? { ...r, ...updates } : r);
    setRegions(nextRegions);

    if (IS_FIREBASE_ENABLED) {
      try {
        await monitoredSetDoc(doc(db, 'site_settings', 'regions'), { list: sanitizeDocumentData(nextRegions) }, undefined, 'ShopContext:updateRegion');
      } catch (err) {
        setRegions(previous);
        console.error('[ShopContext] Failed to update region in Firestore:', err);
        throw err;
      }
    }

    await logAdminActivity('region_update', `Region "${existing?.nameEn || id}" updated`, `Updated regional logistics and delivery fees.`);
  };

  const addRegion = async (newReg: TerroirRegion) => {
    const previous = [...regions];
    const nextRegions = [...regions, newReg];
    setRegions(nextRegions);

    if (IS_FIREBASE_ENABLED) {
      try {
        await monitoredSetDoc(doc(db, 'site_settings', 'regions'), { list: sanitizeDocumentData(nextRegions) }, undefined, 'ShopContext:addRegion');
      } catch (err) {
        setRegions(previous);
        console.error('[ShopContext] Failed to add region in Firestore:', err);
        throw err;
      }
    }

    await logAdminActivity('region_update', `Region zone "${newReg.nameEn}" added`, `Added delivery zone with base fee $${newReg.baseDeliveryUSD}.`);
  };

  const deleteRegion = async (id: string) => {
    const target = regions.find(r => r.id === id);
    const previous = [...regions];
    const nextRegions = regions.filter(r => r.id !== id);
    setRegions(nextRegions);

    if (IS_FIREBASE_ENABLED) {
      try {
        await monitoredSetDoc(doc(db, 'site_settings', 'regions'), { list: sanitizeDocumentData(nextRegions) }, undefined, 'ShopContext:deleteRegion');
      } catch (err) {
        setRegions(previous);
        console.error('[ShopContext] Failed to delete region in Firestore:', err);
        throw err;
      }
    }

    await logAdminActivity('region_update', `Region zone "${target?.nameEn || id}" deleted`, `Removed shipping zone ${id}.`);
  };

// Sellers Management State & Sync
  const [sellers, setSellers] = useState<Seller[]>(() => {
    try {
      const saved = localStorage.getItem('yallalb_sellers');
      const list = saved ? JSON.parse(saved) : DEFAULT_SELLERS;
      return (list as Seller[]).map((s, idx) => ensureSellerCode(s, idx));
    } catch {
      return DEFAULT_SELLERS.map((s, idx) => ensureSellerCode(s, idx));
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('yallalb_sellers', JSON.stringify(sellers));
    } catch {}
  }, [sellers]);

  useEffect(() => {
    if (!IS_FIREBASE_ENABLED) return;
    const sellersColRef = collection(db, 'sellers');
    const q = isAdminUser ? sellersColRef : query(sellersColRef, where('isActive', '==', true));
    const unsubscribe = onSnapshot(
      q,
      async (snapshot) => {
        if (snapshot.empty) {
          if (isAdminUser) {
            try {
              const batch = writeBatch(db);
              DEFAULT_SELLERS.forEach(s => {
                batch.set(doc(db, 'sellers', s.id), sanitizeDocumentData(s));
              });
              await batch.commit();
            } catch (seedErr) {
              console.warn('[ShopContext] Error seeding default sellers to Firestore:', seedErr);
            }
          }
          setSellers(DEFAULT_SELLERS);
        } else {
          const list: Seller[] = [];
          let idx = 0;
          snapshot.forEach(docSnap => {
            const raw = { id: docSnap.id, ...docSnap.data() } as Seller;
            list.push(ensureSellerCode(raw, idx++));
          });
          setSellers(list);
        }
      },
      (err) => {
        console.warn('[ShopContext] Sellers subscription error:', err);
      }
    );
    return () => unsubscribe();
  }, [isAdminUser]);

  const addSeller = async (sellerData: Omit<Seller, 'id' | 'createdAt' | 'updatedAt'> & { id?: string; sellerCode?: string }) => {
    const slug = sellerData.id?.trim() || sellerData.nameEn.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `seller-${Date.now()}`;
    if (sellers.some(s => s.id === slug)) {
      throw new Error(`A seller with the ID "${slug}" already exists.`);
    }
    const sellerCode = sellerData.sellerCode?.trim() || `SLR-${secureRandomInt(100, 1000)}`;
    const newSeller: Seller = {
      ...sellerData,
      id: slug,
      sellerCode,
      isActive: sellerData.isActive ?? true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const previous = [...sellers];
    const nextSellers = [...sellers, newSeller];
    setSellers(nextSellers);

    if (IS_FIREBASE_ENABLED) {
      try {
        const publicData = { ...newSeller } as any;
        const privateData: any = {};
        const privateKeys = ['accountEmail', 'accountUid', 'commissionPct', 'exactAddress'];
        privateKeys.forEach(k => {
          if (k in publicData) {
            privateData[k] = publicData[k];
            delete publicData[k];
          }
        });
        
        await monitoredSetDoc(doc(db, 'sellers', slug), sanitizeDocumentData(publicData), undefined, 'ShopContext:addSeller');
        
        if (isAdminUser || isSellerUser) {
          try {
             await monitoredSetDoc(doc(db, 'seller_private', slug), sanitizeDocumentData(privateData), undefined, 'ShopContext:addSellerPrivate');
          } catch (privErr) {
             console.warn('Failed to write private seller data:', privErr);
          }
        }
      } catch (err) {
        setSellers(previous);
        throw err;
      }
    }
    await logAdminActivity('meta_change', `Seller "${newSeller.nameEn}" added`, `Created seller ID: ${slug}`);
  };

  const updateSeller = async (id: string, updates: Partial<Seller>) => {
    const previous = [...sellers];
    const nextSellers = sellers.map(s => s.id === id ? { ...s, ...updates, updatedAt: new Date().toISOString() } : s);
    setSellers(nextSellers);

    if (IS_FIREBASE_ENABLED) {
      try {
        const publicUpdates = { ...updates, updatedAt: new Date().toISOString() } as any;
        const privateUpdates: any = {};
        const privateKeys = ['accountEmail', 'accountUid', 'commissionPct', 'exactAddress'];
        let hasPrivateUpdates = false;
        
        privateKeys.forEach(k => {
          if (k in publicUpdates) {
            privateUpdates[k] = publicUpdates[k];
            delete publicUpdates[k];
            hasPrivateUpdates = true;
          }
        });

        if (hasPrivateUpdates && isAdminUser) {
          const authorized = await assertHighRiskAuthorization(firebaseUser?.uid);
          if (!authorized) {
            setSellers(previous);
            showToast('High-risk action cancelled or verification expired.', 'error');
            throw new Error('High-risk authorization failed');
          }
        }

        if (Object.keys(publicUpdates).filter(k => k !== 'updatedAt').length > 0 || !hasPrivateUpdates) {
           await monitoredUpdateDoc(doc(db, 'sellers', id), sanitizeDocumentData(publicUpdates), 'ShopContext:updateSeller');
        }
        
        if (hasPrivateUpdates && (isAdminUser || isSellerUser)) {
           try {
             await monitoredUpdateDoc(doc(db, 'seller_private', id), sanitizeDocumentData(privateUpdates), 'ShopContext:updateSellerPrivate');
           } catch (privErr) {
             // Fallback to set if doc doesn't exist
             await monitoredSetDoc(doc(db, 'seller_private', id), sanitizeDocumentData(privateUpdates), undefined, 'ShopContext:setSellerPrivate');
           }
        }
      } catch (err) {
        setSellers(previous);
        throw err;
      }
    }
  };

  const toggleSellerActive = async (sellerId: string, isActive: boolean) => {
    const previousSellers = [...sellers];
    const nextSellers = sellers.map(s => s.id === sellerId ? { ...s, isActive, updatedAt: new Date().toISOString() } : s);
    setSellers(nextSellers);

    if (IS_FIREBASE_ENABLED) {
      try {
        const batch = writeBatch(db);
        batch.update(doc(db, 'sellers', sellerId), { isActive, updatedAt: new Date().toISOString() });

        const affected = await getDocs(query(collection(db, 'products'), where('sellerId', '==', sellerId)));
        affected.forEach(d => {
          batch.update(d.ref, { sellerActive: isActive });
        });
        await batch.commit();
      } catch (err) {
        setSellers(previousSellers);
        throw err;
      }
    }
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

    if (IS_FIREBASE_ENABLED) {
      try {
        const batch = writeBatch(db);
        batch.delete(doc(db, 'sellers', id));
        if (reassignSellerId) {
          for (const prod of affectedProducts) {
            batch.update(doc(db, 'products', prod.id), { sellerId: reassignSellerId });
          }
        }
        await batch.commit();
      } catch (err) {
        setSellers(previousSellers);
        throw err;
      }
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
              localStorage.setItem('yallalb_products', JSON.stringify(merged));
            } catch {}
            return merged;
          });

          if (IS_FIREBASE_ENABLED) {
            try {
              const chunks = [];
              for (let i = 0; i < validRows.length; i += 450) {
                chunks.push(validRows.slice(i, i + 450));
              }
              for (const chunk of chunks) {
                const batch = writeBatch(db);
                for (const item of chunk) {
                  const docRef = doc(db, 'products', item.sku);
                  batch.set(docRef, sanitizeDocumentData(item.product), { merge: true });
                  if (item.isUpdate) updated++;
                  else created++;
                }
                await batch.commit();
              }
            } catch (err: any) {
              console.error('[ShopContext] Database batch commit failed:', err);
              errors.push(`Database batch commit failed: ${err.message}`);
            }
          } else {
            validRows.forEach(item => {
              if (item.isUpdate) updated++;
              else created++;
            });
          }

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

  // Real-time CMS Sync from Firestore Database (cms for admin, cms_public for public storefront)
  useEffect(() => {
    if (!IS_FIREBASE_ENABLED) return;
    const isCmsPreview = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('cmsPreview') === '1';
    if (isCmsPreview) return; // Preview draft takes precedence
    const targetCollection = isAdminUser ? 'cms' : 'cms_public';
    const cmsDocRef = doc(db, targetCollection, 'main');
    const unsubscribe = onSnapshot(
      cmsDocRef,
      async (snapshot) => {
        if (!snapshot.exists()) {
          console.log(`[ShopContext] CMS ${targetCollection}/main document does not exist.`);
          if (isAdminUser) {
            console.log("[ShopContext] Seeding DEFAULT_SITE_CONTENT to Firestore (cms and cms_public)...");
            try {
              const sanitizedDefault = sanitizeDocumentData(DEFAULT_SITE_CONTENT);
              const publicDefault = sanitizeDocumentData(filterPublicCmsContent(DEFAULT_SITE_CONTENT));
              await Promise.all([
                monitoredSetDoc(doc(db, 'cms', 'main'), sanitizedDefault, undefined, 'ShopContext:AutoSeedCMS'),
                monitoredSetDoc(doc(db, 'cms_public', 'main'), publicDefault, undefined, 'ShopContext:AutoSeedCMSPublic')
              ]);
              console.log("[ShopContext] Successfully seeded CMS default site content to Firestore.");
              dbLogger.logSnapshotSync({
                targetPath: 'cms/main',
                sourceComponent: 'ShopContext (AutoSeed)',
                summary: 'Seeded initial DEFAULT_SITE_CONTENT to Firestore (cms/main and cms_public/main).'
              });
            } catch (seedErr) {
              console.error("[ShopContext] Error seeding CMS content to Firestore:", seedErr);
            }
          }
        } else {
          const data = snapshot.data() as Partial<SiteContent>;
          if (data) {
            dbMonitor.logSnapshotSync({
              path: 'cms/main',
              caller: 'ShopContext:onSnapshot(cms/main)',
              docExists: true,
              data,
              metadata: {
                customBlocksCount: data.customBlocks?.length || 0,
                brandName: data.navbar?.brandName
              }
            });

            dbLogger.logSnapshotSync({
              targetPath: 'cms/main',
              sourceComponent: 'onSnapshot(cms/main)',
              summary: `Live CMS snapshot received from Firestore (${Object.keys(data).length} top-level fields).`,
              itemCountOrDetails: {
                customBlocksCount: data.customBlocks?.length || 0,
                brandName: data.navbar?.brandName
              }
            });

            setSiteContent((prev) => ({
              ...DEFAULT_SITE_CONTENT,
              ...data,
              visibility: {
                ...DEFAULT_SITE_CONTENT.visibility,
                ...(data.visibility || {})
              },
              customBlocks: (data.customBlocks || DEFAULT_SITE_CONTENT.customBlocks || []).filter((b: CMSCustomBlock) => b.id !== 'heritage-diaspora-banner'),
              navbar: {
                ...DEFAULT_SITE_CONTENT.navbar,
                ...(data.navbar || {}),
                brandName: data.navbar?.brandName === 'Yalla Lebanon' ? 'Yalla' : (data.navbar?.brandName || DEFAULT_SITE_CONTENT.navbar.brandName)
              },
              hero: {
                ...DEFAULT_SITE_CONTENT.hero,
                ...(data.hero || {})
              },
              offers: {
                ...DEFAULT_SITE_CONTENT.offers,
                ...(data.offers || {})
              },
              promoBanner: {
                ...DEFAULT_SITE_CONTENT.promoBanner,
                ...(data.promoBanner || {})
              },
              home: {
                ...DEFAULT_SITE_CONTENT.home,
                ...(data.home || {})
              },
              productsPage: {
                ...DEFAULT_SITE_CONTENT.productsPage,
                ...(data.productsPage || {})
              },
              productDetailPage: {
                ...DEFAULT_SITE_CONTENT.productDetailPage,
                ...(data.productDetailPage || {})
              },
              checkoutPage: {
                ...DEFAULT_SITE_CONTENT.checkoutPage,
                ...(data.checkoutPage || {})
              },
              accountPage: {
                ...DEFAULT_SITE_CONTENT.accountPage,
                ...(data.accountPage || {})
              },
              newsSection: {
                ...DEFAULT_SITE_CONTENT.newsSection,
                ...(data.newsSection || {})
              },
              socialLinks: {
                ...DEFAULT_SITE_CONTENT.socialLinks,
                ...(data.socialLinks || {})
              },
              footer: {
                ...DEFAULT_SITE_CONTENT.footer,
                ...(data.footer || {})
              }
            }));
          }
        }
      },
      (error) => {
        dbMonitor.logOperationFailure('snap-cms-error', error, {
          metadata: { path: 'cms/main', operation: 'SNAPSHOT_SYNC' }
        });
        console.warn("[ShopContext] Non-blocking CMS listener warning:", error);
      }
    );

    return () => unsubscribe();
  }, [isAdminUser]);

  const updateSiteContent = async (updates: Partial<SiteContent> | ((prev: SiteContent) => SiteContent)) => {
    // Determine the next state safely
    const nextContent = typeof updates === 'function' ? updates(siteContent) : { ...siteContent, ...updates };
    
    // Stage 1: Form Input Logged with calculated diff
    const diff = calculateObjectDiff(siteContent as any, nextContent as any);
    const modifiedKeys = Object.keys(diff);
    dbLogger.logFormInput({
      sourceComponent: 'ShopContext',
      actionName: 'updateSiteContent',
      targetPath: 'cms/main',
      summary: `CMS Form submission initiated for ${modifiedKeys.length} section(s): [${modifiedKeys.join(', ') || 'full update'}]`,
      payload: nextContent,
      diff
    });

    // Stage 2: Sanitize Payload (strips undefined values recursively)
    const sanitized = sanitizeDocumentData(nextContent);
    dbLogger.logSanitization({
      sourceComponent: 'ShopContext',
      actionName: 'sanitizeFirestorePayload',
      targetPath: 'cms/main',
      summary: 'Sanitized CMS document data for Firestore serialization compliance.',
      cleanedPayload: sanitized
    });

    // Stage 3: Initiate Firestore Write Operation
    const { startTime } = dbLogger.logFirestoreWriteStart({
      operation: 'setDoc',
      targetPath: 'cms/main',
      sourceComponent: 'ShopContext',
      actionName: 'setDoc(cms/main)',
      summary: `Persisting updated site content to Firestore document (cms/main)...`,
      payload: sanitized
    });

    if (!IS_FIREBASE_ENABLED) {
      setSiteContent(sanitized);
      try {
        localStorage.setItem('yallalb_site_content', JSON.stringify(sanitized));
      } catch {}

      const isMetaChange = modifiedKeys.includes('seo') || Object.keys(diff).some(k => k.startsWith('seo.'));
      if (isMetaChange) {
        await logAdminActivity(
          'meta_change',
          'SEO Meta Tags updated',
          `Modified global page title or description for search engines locally: [${modifiedKeys.join(', ')}].`
        );
      } else {
        await logAdminActivity(
          'cms_update',
          'CMS Content updated',
          `Modified fields locally: ${modifiedKeys.join(', ') || 'none'}.`
        );
      }
      return;
    }

    // Always update local state and localStorage first so admin preview and storefront reflect changes immediately
    setSiteContent(sanitized);
    try {
      localStorage.setItem('yallalb_site_content', JSON.stringify(sanitized));
    } catch (localErr) {
      console.warn('[ShopContext] Failed to persist siteContent to localStorage:', localErr);
    }

    try {
      const cmsDocRef = doc(db, 'cms', 'main');
      const cmsPublicDocRef = doc(db, 'cms_public', 'main');
      const publicSanitized = sanitizeDocumentData(filterPublicCmsContent(sanitized as SiteContent));

      await Promise.all([
        monitoredSetDoc(cmsDocRef, sanitized, { merge: true }, 'ShopContext:updateSiteContent'),
        monitoredSetDoc(cmsPublicDocRef, publicSanitized, { merge: true }, 'ShopContext:updateSiteContentPublic')
      ]);

      // Stage 4: Firestore Acknowledgment
      dbLogger.logFirestoreWriteSuccess({
        operation: 'setDoc',
        targetPath: 'cms/main',
        sourceComponent: 'ShopContext',
        actionName: 'setDoc(cms/main & cms_public/main)',
        summary: 'Firestore documents cms/main and cms_public/main successfully persisted and acknowledged by database.',
        startTime,
        payload: sanitized
      });

      // Check if SEO fields actually changed to log a "meta_change" rather than general "cms_update"
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
          `Published updates to sections: [${modifiedKeys.join(', ')}].`
        );
      }

    } catch (err: any) {
      dbLogger.logFirestoreWriteError({
        operation: 'setDoc',
        targetPath: 'cms/main',
        sourceComponent: 'ShopContext',
        actionName: 'setDoc(cms/main)',
        summary: 'Error writing CMS content to Firestore',
        startTime,
        error: err
      });
      console.error("[ShopContext] Error saving CMS content to Firestore:", err);
      throw err;
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

  const addCustomBlock = async (newBlockData: Omit<CMSCustomBlock, 'id'>) => {
    const id = `block-${Date.now()}`;
    const newBlock: CMSCustomBlock = { ...newBlockData, id };
    
    await updateSiteContent((prev) => ({
      ...prev,
      customBlocks: [...(prev.customBlocks || []), newBlock]
    }));

    showToast(`Custom element "${newBlock.title}" created & published!`, 'success');
  };

  const updateCustomBlock = async (id: string, updates: Partial<CMSCustomBlock>) => {
    await updateSiteContent((prev) => ({
      ...prev,
      customBlocks: (prev.customBlocks || []).map((b) => (b.id === id ? { ...b, ...updates } : b))
    }));

    showToast('Custom block updated and published!', 'success');
  };

  const deleteCustomBlock = async (id: string) => {
    await updateSiteContent((prev) => ({
      ...prev,
      customBlocks: (prev.customBlocks || []).filter((b) => b.id !== id)
    }));

    showToast('Custom block deleted from page', 'warning');
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
      localStorage.setItem('yallalb_products', JSON.stringify(products));
    } catch {}
  }, [products]);

  useEffect(() => {
    try {
      localStorage.setItem('yallalb_cart', JSON.stringify(storedCart));
    } catch {}
  }, [storedCart]);

  useEffect(() => {
    try {
      localStorage.setItem('yallalb_wishlist', JSON.stringify(wishlist));
    } catch {}
  }, [wishlist]);

  useEffect(() => {
    try {
      if (!IS_FIREBASE_ENABLED) {
        localStorage.setItem('yallalb_orders', JSON.stringify(orders));
      } else if (!isAdminUser && firebaseUser && orders.length > 0) {
        // Only cache user-specific orders for this session, never store admin whole-database orders in localStorage
        localStorage.setItem('yallalb_orders', JSON.stringify(orders));
      } else if (!firebaseUser) {
        localStorage.removeItem('yallalb_orders');
      }
    } catch {}
  }, [orders, isAdminUser, firebaseUser]);

  useEffect(() => {
    try {
      localStorage.setItem('yallalb_user', JSON.stringify(user));
    } catch {}
  }, [user]);

  // Real-time Products Sync from Firestore Database
  useEffect(() => {
    if (!IS_FIREBASE_ENABLED) {
      try {
        const stored = localStorage.getItem('yallalb_products');
        if (stored) {
          const list = JSON.parse(stored) as Product[];
          setProducts(list.map(ensureSellerItemCode));
        } else {
          const seeded = INITIAL_PRODUCTS.map(ensureSellerItemCode);
          setProducts(seeded);
          localStorage.setItem('yallalb_products', JSON.stringify(seeded));
        }
      } catch {
        setProducts(INITIAL_PRODUCTS.map(ensureSellerItemCode));
      }
      setIsDbSyncing(false);
      return;
    }

    const productsColRef = collection(db, 'products');
    const q = isAdminUser ? productsColRef : (isSellerUser && sellerId) ? query(productsColRef, or(where('isPublished', '==', true), where('sellerId', '==', sellerId))) : query(productsColRef, where('isPublished', '==', true));
    const unsubscribe = onSnapshot(
      q,
      async (snapshot) => {
        if (snapshot.empty && !hasSeededProductsRef.current) {
          hasSeededProductsRef.current = true;
          if (isAdminUser) {
            console.log("[ShopContext] Database products collection is empty. Seeding initial catalog to Firestore...");
            try {
              const batch = writeBatch(db);
              INITIAL_PRODUCTS.forEach((prod) => {
                const prodDocRef = doc(db, 'products', prod.id);
                batch.set(prodDocRef, sanitizeDocumentData(ensureSellerItemCode(prod)));
              });
              await monitoredBatchCommit(batch, INITIAL_PRODUCTS.length, 'products', 'ShopContext:AutoSeedProducts');
              console.log(`[ShopContext] Successfully seeded ${INITIAL_PRODUCTS.length} artisan products to Firestore database.`);
            } catch (seedErr) {
              console.error("[ShopContext] Error seeding products to Firestore:", seedErr);
            }
          }
          setProducts(INITIAL_PRODUCTS.map(ensureSellerItemCode));
          setHasMoreProducts(false);
        } else if (!snapshot.empty) {
          const dbProductsMap = new Map<string, Product>();
          snapshot.forEach((docSnap) => {
            const p = ensureSellerItemCode(docSnap.data() as Product);
            dbProductsMap.set(docSnap.id, p);
          });

          const allProducts = Array.from(dbProductsMap.values()).sort((a, b) => {
            const orderA = a.displayOrder ?? 9999;
            const orderB = b.displayOrder ?? 9999;
            return orderA - orderB;
          });
          setProducts(allProducts);
          setHasMoreProducts(false);

          try {
            localStorage.setItem('yallalb_products', JSON.stringify(allProducts));
          } catch {}

          dbMonitor.logSnapshotSync({
            path: 'products/*',
            caller: 'ShopContext:onSnapshot(products)',
            itemCount: snapshot.docs.length,
            metadata: { totalItems: dbProductsMap.size }
          });
        }
        setIsDbSyncing(false);
      },
      (error: any) => {
        dbMonitor.logOperationFailure('fetch-products-err', error, {
          metadata: { path: 'products/*', operation: 'SNAPSHOT_SYNC' }
        });
        console.warn("[ShopContext] Products listener warning:", error);
        handleFirestoreError(error, OperationType.GET, 'products');
        setIsDbSyncing(false);
      }
    );

    return () => unsubscribe();
  }, [isAdminUser]);

  const loadMoreProducts = useCallback(async () => {
    if (!IS_FIREBASE_ENABLED || isFetchingMore || !hasMoreProducts || !lastVisibleDocRef.current) {
      return;
    }

    setIsFetchingMore(true);
    try {
      const productsColRef = collection(db, 'products');
      let constraints: any[] = [orderBy('id'), startAfter(lastVisibleDocRef.current), limit(24)];
      if (!isAdminUser) {
        if (isSellerUser && sellerId) {
          constraints.unshift(or(where('isPublished', '==', true), where('sellerId', '==', sellerId)));
        } else {
          constraints.unshift(where('isPublished', '==', true));
        }
      }
      const q = query(productsColRef, ...constraints);
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        lastVisibleDocRef.current = snapshot.docs[snapshot.docs.length - 1];
        setHasMoreProducts(snapshot.docs.length === 24);

        const newProducts: Product[] = [];
        snapshot.forEach((docSnap) => {
          newProducts.push(docSnap.data() as Product);
        });

        setProducts((prev) => {
          // Filter duplicates just in case
          const prevIds = new Set(prev.map(p => p.id));
          const filteredNew = newProducts.filter(p => !prevIds.has(p.id));
          const updated = [...prev, ...filteredNew];
          try {
            localStorage.setItem('yallalb_products', JSON.stringify(updated));
          } catch {}
          return updated;
        });

        dbMonitor.logSnapshotSync({
          path: 'products/*',
          caller: 'ShopContext:loadMoreProducts',
          itemCount: snapshot.docs.length,
          metadata: { totalItems: snapshot.docs.length }
        });
      } else {
        setHasMoreProducts(false);
      }
    } catch (err) {
      console.error("[ShopContext] Error fetching paginated products:", err);
    } finally {
      setIsFetchingMore(false);
    }
  }, [isFetchingMore, hasMoreProducts]);

  // Real-time product_private Sync from Firestore Database (strictly scoped to admin or owning seller)
  useEffect(() => {
    if (!IS_FIREBASE_ENABLED || (!isAdminUser && (!isSellerUser || !sellerId))) {
      return;
    }

    let q;
    if (isAdminUser) {
      q = collection(db, 'product_private');
    } else {
      q = query(collection(db, 'product_private'), where('sellerId', '==', sellerId));
    }

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (!snapshot.empty) {
          const privMap = new Map<string, any>();
          snapshot.forEach((docSnap) => {
            privMap.set(docSnap.id, docSnap.data());
          });

          setProducts((prev) =>
            prev.map((p) => {
              const priv = privMap.get(p.id);
              if (!priv) return p;
              return {
                ...p,
                sellerItemCode: priv.sellerItemCode ?? p.sellerItemCode,
                lowStockThreshold: priv.lowStockThreshold ?? p.lowStockThreshold,
                lowStockNotice: priv.lowStockNotice ?? p.lowStockNotice,
                customStockLabel: priv.customStockLabel ?? p.customStockLabel,
                costPriceUSD: priv.costPriceUSD ?? p.costPriceUSD
              };
            })
          );
        }
      },
      (err) => {
        console.warn('[ShopContext] product_private listener warning:', err);
      }
    );

    return () => unsubscribe();
  }, [isAdminUser, isSellerUser, sellerId]);

  // Real-time Orders Sync from Firestore Database (strictly scoped to current user or admin)
  useEffect(() => {
    if (!IS_FIREBASE_ENABLED) {
      try {
        const stored = localStorage.getItem('yallalb_orders');
        if (stored) {
          setOrders(JSON.parse(stored));
        } else {
          setOrders([]);
        }
      } catch {
        setOrders([]);
      }
      return;
    }

    if (!firebaseUser) {
      setOrders([]);
      return;
    }

    let q;
    if (isAdminUser) {
      q = query(collection(db, 'orders'), orderBy('date', 'desc'), limit(500));
    } else if (isSellerUser && sellerId) {
      // Sellers cannot list all orders via a global collectionGroup due to strict security rules.
      // They only fetch their own customer orders here.
      q = query(collection(db, 'orders'), where('userId', '==', firebaseUser.uid), limit(100));
    } else {
      // Query solely by userId without composite index requirement, then sort in JS memory
      q = query(collection(db, 'orders'), where('userId', '==', firebaseUser.uid), limit(100));
    }

    const unsubscribe = onSnapshot(
      q,
      async (snapshot) => {
        if (!snapshot.empty) {
          const dbOrders: Order[] = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            dbOrders.push({
              id: data.orderId || docSnap.id,
              orderId: data.orderId,
              userId: '',
              status: data.status || 'pending',
              date: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate().toISOString() : new Date().toISOString()) : new Date().toISOString(),
              items: data.items || [],
              shipping: data.shipping || {},
              sellerIds: sellerId ? [sellerId] : [],
              subtotalUSD: 0,
              discountUSD: 0,
              deliveryFeeUSD: 0,
              totalUSD: 0,
              paymentMethod: 'cod_usd',
              currency: 'USD',
              totalLBP: 0,
              estimatedDelivery: '',
              trackingNumber: '',
              ...data
            } as unknown as Order);
          });
          // Sort newest first client-side
          dbOrders.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          
          dbMonitor.logSnapshotSync({
            path: 'orders/*',
            caller: 'ShopContext:onSnapshot(orders)',
            itemCount: dbOrders.length
          });

          setOrders(dbOrders);
        } else {
          setOrders([]);
        }
      },
      (error) => {
        dbMonitor.logOperationFailure('snap-orders-err', error, {
          metadata: { path: 'orders/*', operation: 'SNAPSHOT_SYNC' }
        });
        console.warn("[ShopContext] Non-blocking orders listener notice:", error);
        setOrders([]);
      }
    );

    return () => unsubscribe();
  }, [firebaseUser, isAdminUser]);

  // Auth & User / Cart / Wishlist synchronization
  useEffect(() => {
    if (!IS_FIREBASE_ENABLED) {
      // Offline/Local mode: Load profile, wishlist, and cart from localStorage
      try {
        const storedUser = localStorage.getItem('yallalb_user');
        if (storedUser) {
          setUser(JSON.parse(storedUser));
        }
        const storedWishlist = localStorage.getItem('yallalb_wishlist');
        if (storedWishlist) {
          setWishlist(JSON.parse(storedWishlist));
        }
        const storedCart = localStorage.getItem('yallalb_cart');
        if (storedCart) {
          setCart(JSON.parse(storedCart));
        }
      } catch {}
      return;
    }

    console.log("[ShopContext] Initializing Firebase Auth listener...");
    const unsubscribe = onIdTokenChanged(auth, async (userObj) => {
      console.log("[ShopContext] Auth state/token changed. User:", userObj ? userObj.uid : "None (Guest)");
      if (!userObj) {
        setFirebaseUser(null);
        setUser(INITIAL_USER);
        setIsAdminUser(false);
        setIsSellerUser(false);
        setSellerId(null);
        setIsLocalAdminUnlockedState(false);
        setIsLoadingAuth(false);
        setOrders([]);
        try {
          localStorage.removeItem('yallalb_orders');
        } catch {}
        // Preserve local guest cart and wishlist if available
        try {
          const storedCart = localStorage.getItem('yallalb_cart');
          if (storedCart) {
            const parsed = JSON.parse(storedCart);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setCart(parsed);
            }
          }
          const storedWishlist = localStorage.getItem('yallalb_wishlist');
          if (storedWishlist) {
            const parsed = JSON.parse(storedWishlist);
            if (Array.isArray(parsed)) {
              setWishlist(parsed);
            }
          }
        } catch {}
        return;
      }
      setFirebaseUser(userObj);
      const userKey = userObj.uid;

      // 1. Authoritatively resolve custom claims FIRST, guaranteeing state resolution even if Firestore errors out
      let hasAdminClaim = false;
      let hasSellerClaim = false;
      let claimSellerId: string | null = null;

      try {
        await userObj.getIdToken(true).catch(() => {});
        const tokenResult = await userObj.getIdTokenResult(true).catch(() => null);
        hasAdminClaim = tokenResult?.claims?.admin === true;
        hasSellerClaim = tokenResult?.claims?.seller === true;
        claimSellerId =
          typeof tokenResult?.claims?.sellerId === 'string'
            ? tokenResult.claims.sellerId
            : null;
      } catch (tokenErr) {
        console.warn("[ShopContext] Error resolving custom claims token result:", tokenErr);
      }

      setIsAdminUser(hasAdminClaim);
      setIsSellerUser(hasSellerClaim);
      setSellerId(claimSellerId);
      setIsEmailVerified(userObj.emailVerified);
      setIsLoadingAuth(false);

      // 2. Sync User Profile from Firestore safely without blocking auth claims
      try {
        const userDocRef = doc(db, 'users', userObj.uid);
        const userSnap = await safeGetDoc(userDocRef);
        
        // Helper to extract first/last name from display name or email
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

        const fallbackNames = deriveNames(userObj.displayName, userObj.email);

        // Check if local cache has shipping defaults
        let cachedShipping: Partial<UserProfile> = {};
        try {
          const rawCache = localStorage.getItem('yallalb_saved_checkout_data');
          if (rawCache) {
            cachedShipping = JSON.parse(rawCache);
          }
        } catch {}

        if (userSnap.exists()) {
          const data = (userSnap.data() || {}) as Record<string, any>;
          const safeProfile = mapSafeShopUserProfile(
            data,
            userObj,
            claimSellerId,
            cachedShipping,
            fallbackNames
          );

          setUser(safeProfile);
        } else {
          console.log("[ShopContext] User document does not exist, creating new user data.");
          let tempSignup: any = {};
          try {
            const rawTemp = localStorage.getItem('yallalb_signup_profile_temp');
            if (rawTemp) {
              tempSignup = JSON.parse(rawTemp);
              localStorage.removeItem('yallalb_signup_profile_temp');
            }
          } catch {}

          const newUserData: UserProfile = {
            uid: userKey,
            name: tempSignup.firstName && tempSignup.lastName 
              ? `${tempSignup.firstName} ${tempSignup.lastName}`.trim()
              : fallbackNames.name,
            firstName: tempSignup.firstName || cachedShipping.firstName || fallbackNames.firstName,
            lastName: tempSignup.lastName || cachedShipping.lastName || fallbackNames.lastName,
            email: userObj.email || INITIAL_USER.email,
            phone: tempSignup.phone || cachedShipping.phone || '',
            avatar: userObj.photoURL || INITIAL_USER.avatar,
            defaultGovernorate: INITIAL_USER.defaultGovernorate,
            defaultCity: tempSignup.defaultCity || cachedShipping.defaultCity || '',
            defaultAddress: tempSignup.defaultAddress || cachedShipping.defaultAddress || '',
            defaultBuilding: tempSignup.defaultBuilding || cachedShipping.defaultBuilding || '',
            defaultNotes: tempSignup.defaultNotes || cachedShipping.defaultNotes || '',
            emailVerified: userObj.emailVerified
          };
          try {
            await setDoc(userDocRef, sanitizeFirestorePayload({ uid: userObj.uid, ...newUserData }));
          } catch (createErr: any) {
            console.warn('[ShopContext] Non-blocking user profile document write notice:', createErr?.message || createErr);
          }
          
          // Register phone number in unique phone registry
          if (newUserData.phone) {
            const normPhone = normalizeLebanesePhone(newUserData.phone);
            if (normPhone.isValid && normPhone.registryKey) {
              try {
                await setDoc(doc(db, 'phone_registry', normPhone.registryKey), {
                  uid: userObj.uid,
                  phone: normPhone.formatted,
                  cleanDigits: normPhone.cleanDigits,
                  updatedAt: new Date().toISOString()
                });
              } catch (regErr) {
                console.warn("[ShopContext] Non-blocking phone_registry write:", regErr);
              }
            }
          }

          setUser(newUserData);
        }
      } catch (err: any) {
        const isOffline = err.code === 'unavailable' || err.message?.includes('offline') || err.message?.includes('Failed to get document');
        if (isOffline) {
          console.warn("[ShopContext] User profile sync notice: client is offline or serving cached copy.", err.message);
        } else {
          console.error("[ShopContext] Error syncing user profile from Firestore:", err);
        }
      }

      // Sync Wishlist from Firestore
      try {
        const wishlistRef = doc(db, 'wishlists', userKey);
        const wishlistSnap = await safeGetDoc(wishlistRef);
        if (wishlistSnap.exists()) {
          const wData = wishlistSnap.data();
          if (wData.productIds && Array.isArray(wData.productIds)) {
            setWishlist(wData.productIds);
          }
        }
      } catch (err: any) {
        const isOffline = err.code === 'unavailable' || err.message?.includes('offline') || err.message?.includes('Failed to get document');
        if (isOffline) {
          console.warn("[ShopContext] Wishlist sync notice: client is offline or serving cached copy.", err.message);
        } else {
          console.error("[ShopContext] Error syncing wishlist from Firestore:", err);
        }
      }

      // Sync Cart from Firestore
      try {
        const cartRef = doc(db, 'carts', userKey);
        const cartSnap = await safeGetDoc(cartRef);
        if (cartSnap.exists()) {
          const cData = cartSnap.data();
          if (cData.items && Array.isArray(cData.items)) {
            setCart(cData.items);
          }
        }
      } catch (err: any) {
        const isOffline = err.code === 'unavailable' || err.message?.includes('offline') || err.message?.includes('Failed to get document');
        if (isOffline) {
          console.warn("[ShopContext] Cart sync notice: client is offline or serving cached copy.", err.message);
        } else {
          console.error("[ShopContext] Error syncing cart from Firestore:", err);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  // Sync Cart to Firestore whenever cart changes (debounced by 1000ms)
  useEffect(() => {
    if (!IS_FIREBASE_ENABLED) return;
    if (!firebaseUser) return;
    const userKey = firebaseUser.uid;
    const cartDocRef = doc(db, 'carts', userKey);
    const sanitizedCartPayload = sanitizeFirestorePayload({
      userId: userKey,
      items: storedCart,
      updatedAt: new Date().toISOString()
    });

    const handler = setTimeout(() => {
      setDoc(cartDocRef, sanitizedCartPayload, { merge: true }).catch((err) => {
        console.warn("[ShopContext] Non-blocking cart sync notice:", err);
      });
    }, 1000);

    return () => clearTimeout(handler);
  }, [storedCart, firebaseUser]);

  // Sync Wishlist to Firestore whenever wishlist changes (debounced by 1000ms)
  useEffect(() => {
    if (!IS_FIREBASE_ENABLED) return;
    if (!firebaseUser) return;
    const userKey = firebaseUser.uid;
    const wishlistDocRef = doc(db, 'wishlists', userKey);
    const sanitizedWishlistPayload = sanitizeFirestorePayload({
      userId: userKey,
      productIds: wishlist,
      updatedAt: new Date().toISOString()
    });

    const handler = setTimeout(() => {
      setDoc(wishlistDocRef, sanitizedWishlistPayload, { merge: true }).catch((err) => {
        console.warn("[ShopContext] Non-blocking wishlist sync notice:", err);
      });
    }, 1000);

    return () => clearTimeout(handler);
  }, [wishlist, firebaseUser]);

  async function executeWithRetry<T>(fn: () => Promise<T>, retries = 2, delay = 1000): Promise<T> {
    try {
      return await fn();
    } catch (error: any) {
      if (error.code === 'auth/network-request-failed' && retries > 0) {
        console.warn(`[ShopContext] Auth network error, retrying... (${retries} attempts left)`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return executeWithRetry(fn, retries - 1, delay * 2);
      }
      throw error;
    }
  }

  const signInWithGoogle = async () => {
    try {
      if (!auth) {
        throw new Error("Firebase Authentication is not fully initialized in this environment.");
      }
      const provider = googleProvider || new GoogleAuthProvider();
      await executeWithRetry(() => signInWithPopup(auth, provider));
      showToast('Successfully signed in with Google!', 'success');
    } catch (error: any) {
      if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
        return;
      }
      let msg = '';
      if (error.code === 'auth/operation-not-allowed') {
        console.warn("Google Sign-In is not enabled in Firebase Authentication console.");
        msg = 'Google Sign-In is not enabled in Firebase Console. Please enable Google provider in Firebase Auth or use Email Sign-In.';
      } else if (error.code === 'auth/network-request-failed') {
        msg = 'Network connection error. Please check your internet connection and try again.';
      } else if (error.code === 'auth/popup-blocked') {
        msg = 'Sign-In popup was blocked by your browser settings. Please allow popups or open the app in a new browser tab.';
      } else if (error.code === 'auth/argument-error' || error.message?.includes('argument-error')) {
        msg = 'Google Sign-In requires third-party cookies or opening in a new tab. Alternatively, use email/password sign-in.';
      } else {
        console.error("Google Sign In Error:", error);
        msg = 'Failed to sign in with Google: ' + (error.message || 'Unknown error');
      }
      showToast(msg, 'warning');
    }
  };

  const signInWithApple = async () => {
    try {
      if (!auth) {
        throw new Error("Firebase Authentication is not fully initialized in this environment.");
      }
      const provider = appleProvider || new OAuthProvider('apple.com');
      await executeWithRetry(() => signInWithPopup(auth, provider));
      showToast('Successfully signed in with Apple!', 'success');
    } catch (error: any) {
      if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
        return;
      }
      let msg = '';
      if (error.code === 'auth/operation-not-allowed') {
        console.warn("Apple Sign-In is not enabled in Firebase Authentication console.");
        msg = 'Apple Sign-In is not enabled in Firebase Console. Please enable Apple provider in Firebase Auth or use Email Sign-In.';
      } else if (error.code === 'auth/network-request-failed') {
        msg = 'Network connection error. Please check your internet connection and try again.';
      } else if (error.code === 'auth/popup-blocked') {
        msg = 'Sign-In popup was blocked by your browser settings. Please allow popups or open the app in a new browser tab.';
      } else if (error.code === 'auth/argument-error' || error.message?.includes('argument-error')) {
        msg = 'Apple Sign-In requires third-party cookies or opening in a new tab. Alternatively, use email/password sign-in.';
      } else {
        console.error("Apple Sign In Error:", error);
        msg = 'Failed to sign in with Apple: ' + (error.message || 'Unknown error');
      }
      showToast(msg, 'warning');
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
      if (IS_FIREBASE_ENABLED) {
        await sendPasswordResetEmail(auth, cleanEmail);
      }
      const successMsg = language === 'ar'
        ? 'إذا كان البريد مسجلاً لدينا، فقد تم إرسال رابط إعادة تعيين كلمة المرور إلى صندوق الوارد.'
        : 'If an account exists for this email address, a password reset link has been sent.';
      showToast(successMsg, 'success');
    } catch (error: any) {
      if (error.code === 'auth/user-not-found') {
        // OWASP User Enumeration Prevention: generic response prevents email address discovery
        const successMsg = language === 'ar'
          ? 'إذا كان البريد مسجلاً لدينا، فقد تم إرسال رابط إعادة تعيين كلمة المرور إلى صندوق الوارد.'
          : 'If an account exists for this email address, a password reset link has been sent.';
        showToast(successMsg, 'success');
        return;
      }
      let msg = language === 'ar' ? 'فشل إرسال رابط إعادة التعيين: ' : 'Failed to send reset email: ';
      if (error.code === 'auth/network-request-failed') {
        msg = language === 'ar' ? 'خطأ في الاتصال بالشبكة. يرجى التحقق والتجربة مجدداً.' : 'Network connection error. Please check your connection and try again.';
      } else {
        msg += error.message || '';
      }
      showToast(msg, 'warning');
      throw error;
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
      const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
      if (userCredential.user) {
        await sendEmailVerification(userCredential.user);
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
      let msg = 'Sign up failed: ' + err.message;
      if (err.code === 'auth/email-already-in-use') {
        msg = 'This email is already in use. If you already have an account, please Sign In instead.';
      } else if (err.code === 'auth/network-request-failed') {
        msg = 'Network connection error. Please check your internet connection and try again.';
      } else if (err.code === 'auth/weak-password') {
        msg = 'Password is too weak. Please choose a stronger password.';
      } else if (err.code === 'auth/invalid-email') {
        msg = 'Invalid email address format.';
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

    const actionCodeSettings = {
      // URL to redirect back to. In preview / production, use current origin
      url: window.location.origin + '/account?emailSignIn=true',
      handleCodeInApp: true,
    };

    try {
      await sendSignInLinkToEmail(auth, cleanEmail, actionCodeSettings);
      // Save the email locally so you don't need to ask the user for it again
      // if they open the link on the same device.
      window.localStorage.setItem('emailForSignIn', cleanEmail);
      const successMsg = language === 'ar'
        ? `تم إرسال رابط الدخول الآمن إلى ${cleanEmail}! تحقق من صندوق بريدك الإلكتروني.`
        : `Secure sign-in link sent to ${cleanEmail}! Please check your email inbox.`;
      showToast(successMsg, 'success');
    } catch (err: any) {
      console.error("[ShopContext] sendSignInLinkToEmail error:", err);
      let msg = err.message || 'Failed to send sign-in link';
      if (err.code === 'auth/argument-error' || err.code === 'auth/invalid-email') {
        msg = language === 'ar' ? 'صيغة البريد الإلكتروني غير صالحة' : 'Invalid email address.';
      } else if (err.code === 'auth/unauthorized-continue-uri') {
        msg = language === 'ar' 
          ? 'نطاق التطبيق غير مصرح به في إعدادات Firebase Auth Console.'
          : 'Domain not authorized in Firebase Auth Console. Please add current domain to Authorized Domains.';
      }
      showToast(msg, 'warning');
      throw err;
    }
  };

  const completeEmailLinkSignIn = async (emailInput?: string, urlInput?: string) => {
    const currentUrl = urlInput || window.location.href;
    if (!isSignInWithEmailLink(auth, currentUrl)) {
      return;
    }

    let email = emailInput || window.localStorage.getItem('emailForSignIn');
    if (!email) {
      // Prompt user for their email if missing
      email = window.prompt(
        language === 'ar'
          ? 'يرجى تأكيد بريدك الإلكتروني لإتمام تسجيل الدخول:'
          : 'Please enter your email to complete sign-in:'
      ) || '';
    }

    if (!email) {
      showToast(language === 'ar' ? 'البريد الإلكتروني مطلوب لتأكيد تسجيل الدخول' : 'Email is required to complete sign-in', 'warning');
      return;
    }

    try {
      await signInWithEmailLink(auth, email.trim().toLowerCase(), currentUrl);
      window.localStorage.removeItem('emailForSignIn');
      // Clean query parameters from URL without reloading
      const url = new URL(currentUrl);
      url.searchParams.delete('apiKey');
      url.searchParams.delete('oobCode');
      url.searchParams.delete('mode');
      url.searchParams.delete('lang');
      url.searchParams.delete('emailSignIn');
      window.history.replaceState({}, document.title, url.pathname || '/');
      showToast(language === 'ar' ? 'تم تسجيل الدخول بنجاح عبر الرابط!' : 'Successfully signed in via email link!', 'success');
    } catch (error: any) {
      console.error("[ShopContext] signInWithEmailLink error:", error);
      let msg = error.message || 'Sign in link is invalid or has expired.';
      if (error.code === 'auth/invalid-action-code') {
        msg = language === 'ar' ? 'رابط الدخول غير صالح أو تم استخدامه مسبقاً.' : 'Sign-in link is invalid or has already been used.';
      } else if (error.code === 'auth/expired-action-code') {
        msg = language === 'ar' ? 'انتهت صلاحية رابط الدخول. يرجى طلب رابط جديد.' : 'Sign-in link has expired. Please request a new one.';
      }
      showToast(msg, 'warning');
      throw error;
    }
  };

  const signInWithEmail = async (email: string, pass: string) => {
    try {
      const cred = await executeWithRetry(() => signInWithEmailAndPassword(auth, email, pass));
      if (cred?.user) {
        await cred.user.getIdToken(true).catch(() => {});
      }
      showToast('Successfully signed in!', 'success');
    } catch (error: any) {
      console.error("Auth error:", error);
      let msg = 'Authentication failed: ' + error.message;
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
        msg = 'Incorrect email or password. If you forgot your password, please click "Forgot Password?".';
      } else if (error.code === 'auth/network-request-failed') {
        msg = 'Network connection error. Please check your internet connection and try again.';
      } else if (error.code === 'auth/invalid-email') {
        msg = 'Invalid email address format.';
      }
      showToast(msg, 'warning');
      throw error;
    }
  };

  const signOutUser = async () => {
    try {
      await signOut(auth);
      setOrders([]);
      try {
        localStorage.removeItem('yallalb_orders');
        localStorage.removeItem('yallalb_saved_checkout_data');
      } catch {}
      showToast('Signed out successfully', 'info');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'auth');
    }
  };

  const refreshUserProfile = async () => {
    if (!firebaseUser || !db) return;
    try {
      await firebaseUser.getIdToken(true);
      const [userSnap, tokenResult] = await Promise.all([
        safeGetDoc(doc(db, 'users', firebaseUser.uid)),
        firebaseUser.getIdTokenResult(true)
      ]);
      const hasAdminClaim = tokenResult.claims.admin === true;
      const hasSellerClaim = tokenResult.claims.seller === true;
      const claimSellerId = typeof tokenResult.claims.sellerId === 'string' ? tokenResult.claims.sellerId : null;

      setIsAdminUser(hasAdminClaim);
      setIsSellerUser(hasSellerClaim);
      setSellerId(claimSellerId);

      if (userSnap.exists()) {
        const data = (userSnap.data() || {}) as Record<string, any>;
        let cachedShipping: Partial<UserProfile> = {};
        try {
          const rawCache = localStorage.getItem('yallalb_saved_checkout_data');
          if (rawCache) cachedShipping = JSON.parse(rawCache);
        } catch {}
        const fallbackNames = { firstName: '', lastName: '', name: firebaseUser.displayName || '' };
        setUser(mapSafeShopUserProfile(data, firebaseUser, claimSellerId, cachedShipping, fallbackNames));
      }
    } catch {}
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
    if (!firebaseUser) return true;
    const userOrdersCount = orders.filter(o => o.userId === firebaseUser.uid).length;
    return userOrdersCount === 0;
  }, [firebaseUser, orders]);

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
      userId: firebaseUser?.uid || null,
      userEmail: firebaseUser?.email || user?.email || null,
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

    if (!IS_FIREBASE_ENABLED || !firebaseUser) return;
    try {
      const logDocRef = doc(collection(db, 'search_logs'));
      searchEntry.id = logDocRef.id;
      const payload = sanitizeFirestorePayload(searchEntry);
      await monitoredSetDoc(logDocRef, payload, {}, `ShopContext:logSearchQuery:${origin}`).catch((err) => {
        console.warn("[ShopContext] Non-blocking search log notice:", err);
      });
    } catch (error) {
      console.warn("[ShopContext] Failed to log search:", error);
    }
  }, [firebaseUser, user]);

  // Place Order - Order creation with graceful fallback for empty profiles
  const placeOrder = async (orderData: Omit<Order, 'id' | 'date' | 'trackingNumber' | 'status'>, customIdempotencyKey?: string): Promise<Order> => {
    const activeUserId = firebaseUser?.uid || auth?.currentUser?.uid || undefined;
    const idempotencyKey = (customIdempotencyKey || generateIdempotencyKey()).trim();

    if (cart.length > MAX_ORDER_LINE_ITEMS) {
      const errMsg = language === 'ar'
        ? `الحد الأقصى لعدد المنتجات المختلفة في الطلب الواحد هو ${MAX_ORDER_LINE_ITEMS}. يرجى تقسيم الطلب.`
        : `Orders are limited to a maximum of ${MAX_ORDER_LINE_ITEMS} distinct items per checkout. Please split your order.`;
      showToast(errMsg, 'warning');
      throw new Error(errMsg);
    }

    const orderDocRef = doc(collection(db, 'orders'));
    const orderId = orderDocRef.id;

    // L-3: Secure random tracker numbers using Web Crypto API
    let trackingSuffix: string;
    if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
      const array = new Uint8Array(6);
      window.crypto.getRandomValues(array);
      trackingSuffix = Array.from(array, b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    } else {
      trackingSuffix = secureRandomString(12).toUpperCase();
    }
    const dateStr = new Date().toISOString();
    const trackingNumberStr = `LB-EXP-${trackingSuffix}`;

    // If Firebase is disabled, block in production, allow local-only fallback in non-production
    if (!IS_FIREBASE_ENABLED) {
      if (import.meta.env.PROD) {
        throw new Error('Online checkout requires an active backend connection. Offline order placement is disabled in production.');
      }
      const newOrder: Order = {
        ...orderData,
        id: orderId,
        date: dateStr,
        trackingNumber: trackingNumberStr,
        status: 'pending',
        userId: activeUserId,
        sellerIds: Array.from(new Set((orderData.items || []).map(item => item.product.sellerId || '').filter(Boolean)))
      };
      setOrders(prev => {
        const next = [newOrder, ...prev];
        try {
          localStorage.setItem('yallalb_orders', JSON.stringify(next));
        } catch {}
        return next;
      });
      clearCart();
      showToast(`Mabrouk! Order #${newOrder.id} placed locally.`, 'success');
      return newOrder;
    }

    // Server-Authoritative Checkout: All checkout validation, stock decrement, pricing, and order creation
    // are executed securely inside the placeOrder Firebase callable Cloud Function.
    const { startTime } = dbLogger.logFirestoreWriteStart({
      operation: 'setDoc',
      targetPath: `orders/${orderId}`,
      sourceComponent: 'ShopContext',
      actionName: 'placeOrderCloudFunction',
      summary: `Submitting order to authoritative placeOrder Cloud Function (idempotency: ${idempotencyKey.slice(0, 8)}...)...`,
    });

    try {
      const placeOrderFn = httpsCallable<any, any>(functionsInstance, 'placeOrder');

      const rawShipping = orderData.shipping || {};
      const chosenSpeed = (orderData.shipping?.deliverySpeed || 'standard') as 'standard' | 'express_beirut' | 'diaspora_air' | 'diaspora_global';

      const payload = {
        items: (orderData.items || cart).map(it => ({
          productId: it.product.id,
          quantity: Math.max(1, Math.floor(it.quantity || 1)),
          ...(it.selectedOption ? { selectedOption: it.selectedOption } : {})
        })),
        shipping: {
          fullName: String(rawShipping.fullName || '').trim(),
          phone: String(rawShipping.phone || '').trim(),
          governorate: String(rawShipping.governorate || 'Beirut').trim(),
          city: String(rawShipping.city || '').trim(),
          street: String(rawShipping.street || (rawShipping as any)?.address || '').trim(),
          building: String(rawShipping.building || 'N/A').trim(),
          deliveryNotes: String(rawShipping.deliveryNotes || (rawShipping as any)?.notes || '').trim(),
          deliverySpeed: chosenSpeed
        },
        paymentMethod: orderData.paymentMethod || 'cod_usd',
        ...(appliedCouponCode ? { couponCode: appliedCouponCode } : {}),
        deliverySpeed: chosenSpeed,
        idempotencyKey: idempotencyKey,
      };

      const resp = await placeOrderFn(payload);
      const serverResult = resp.data;

      const serverOrderId = serverResult?.orderId || orderId;
      const serverTrackingNumber = serverResult?.trackingNumber || trackingNumberStr;
      const serverTotalUSD = typeof serverResult?.totalUSD === 'number' ? serverResult.totalUSD : orderData.totalUSD;
      const serverSubtotalUSD = typeof serverResult?.subtotalUSD === 'number' ? serverResult.subtotalUSD : orderData.subtotalUSD;
      const serverDiscountUSD = typeof serverResult?.discountUSD === 'number' ? serverResult.discountUSD : (orderData.discountUSD || 0);
      const serverDeliveryFeeUSD = typeof serverResult?.deliveryFeeUSD === 'number' ? serverResult.deliveryFeeUSD : (orderData.deliveryFeeUSD || 0);

      const placedOrder: Order = {
        ...orderData,
        id: serverOrderId,
        date: dateStr,
        trackingNumber: serverTrackingNumber,
        status: 'pending',
        userId: activeUserId,
        subtotalUSD: serverSubtotalUSD,
        deliveryFeeUSD: serverDeliveryFeeUSD,
        discountUSD: serverDiscountUSD,
        totalUSD: serverTotalUSD,
        totalLBP: Math.round(serverTotalUSD * LBP_USD_RATE),
        appliedCoupon: appliedCouponCode || undefined,
        productIds: Array.from(new Set((orderData.items || cart).map(item => item.product.id).filter(Boolean))),
        sellerIds: Array.from(new Set((orderData.items || cart).map(item => item.product.sellerId || '').filter(Boolean)))
      };

      // Optimistically update local catalog state so patron immediately sees decremented stock in session
      setProducts(prevProducts => {
        return prevProducts.map(p => {
          const item = orderData.items.find(i => i.product.id === p.id);
          if (item) {
            return {
              ...p,
              stock: Math.max(0, (p.stock || 0) - item.quantity)
            };
          }
          return p;
        });
      });

      dbLogger.logFirestoreWriteSuccess({
        operation: 'setDoc',
        targetPath: `orders/${serverOrderId}`,
        sourceComponent: 'ShopContext',
        actionName: 'placeOrderCloudFunction',
        summary: `Order #${serverOrderId} placed successfully via Cloud Function (tracking: ${serverTrackingNumber}${serverResult?.duplicate ? ' - idempotent duplicate confirmed' : ''}).`,
        startTime,
        payload: placedOrder
      });

      setOrders(prev => {
        const exists = prev.some(o => o.id === serverOrderId);
        return exists ? prev : [placedOrder, ...prev];
      });
      clearCart();
      showToast(
        serverResult?.duplicate
          ? `Order #${placedOrder.id} is already placed and confirmed by server.`
          : `Mabrouk! Order #${placedOrder.id} placed and confirmed by server.`,
        'success'
      );
      return placedOrder;
    } catch (error: any) {
      dbLogger.logFirestoreWriteError({
        operation: 'setDoc',
        targetPath: `orders/${orderId}`,
        sourceComponent: 'ShopContext',
        actionName: 'placeOrderCloudFunction',
        summary: `Failed to place order via Cloud Function: ${error.message}`,
        startTime,
        error
      });
      console.error('[ShopContext] placeOrder Cloud Function error:', error);
      const displayMsg = error?.message?.replace(/^FirebaseError:\s*/i, '') || 'Could not place order. Please try again.';
      showToast(displayMsg, 'warning');
      throw error;
    }
  };

  // Update Order Status - Saves update in Firestore database
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

    const { startTime } = dbLogger.logFirestoreWriteStart({
      operation: 'setDoc',
      targetPath: `orders/${orderId}`,
      sourceComponent: 'ShopContext',
      actionName: 'updateOrderStatus',
      summary: `Persisting status change for order #${orderId} to Firestore...`
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

    if (!IS_FIREBASE_ENABLED) {
      await logAdminActivity(
        'order_status',
        `Order #${orderId} status updated`,
        `Shifted fulfillment status to "${status.replace(/_/g, ' ')}".`
      );
      showToast(`Order status updated to ${status.replace('_', ' ')} locally`, 'info');
      return;
    }

    // Persist status change to Firestore
    try {
      const isSellerActive = isSellerUser && sellerId;
      const targetPath = isSellerActive ? `order_fulfillment/${orderId}/sellers/${sellerId}` : `orders/${orderId}`;
      await monitoredSetDoc(doc(db, targetPath), { status, updatedAt: serverTimestamp() }, { merge: true }, isSellerActive ? 'SellerDashboard:updateOrderStatus' : 'AdminView:updateOrderStatus');
      
      await logAdminActivity(
        'order_status',
        `Order #${orderId} status updated`,
        `Shifted fulfillment status to "${status.replace(/_/g, ' ')}".`
      );

      dbLogger.logFirestoreWriteSuccess({
        operation: 'setDoc',
        targetPath: `orders/${orderId}`,
        sourceComponent: 'ShopContext',
        actionName: 'updateOrderStatus',
        summary: `Order #${orderId} status successfully set to "${status}" in Firestore.`,
        startTime
      });
    } catch (error) {
      setOrders(previousOrders);
      try {
        localStorage.setItem('yallalb_orders', JSON.stringify(previousOrders));
      } catch {}
      dbLogger.logFirestoreWriteError({
        operation: 'setDoc',
        targetPath: `orders/${orderId}`,
        sourceComponent: 'ShopContext',
        actionName: 'updateOrderStatus',
        summary: `Failed to update order #${orderId} status in Firestore`,
        startTime,
        error
      });
      handleFirestoreError(error, OperationType.UPDATE, `orders/${orderId}`);
      showToast('Could not update order status. Please try again.', 'warning');
      throw error;
    }

    showToast(`Order status updated to ${status.replace('_', ' ')} in database`, 'info');
  };

  // Delete Order - Removes order from Firestore database
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

    const { startTime } = dbLogger.logFirestoreWriteStart({
      operation: 'deleteDoc',
      targetPath: `orders/${orderId}`,
      sourceComponent: 'ShopContext',
      actionName: 'deleteOrder',
      summary: `Deleting order document from Firestore (orders/${orderId})...`
    });

    setOrders(prev => {
      const next = prev.filter(o => o.id !== orderId);
      try {
        localStorage.setItem('yallalb_orders', JSON.stringify(next));
      } catch {}
      return next;
    });

    if (!IS_FIREBASE_ENABLED) {
      await logAdminActivity(
        'order_delete',
        `Order #${orderId} deleted`,
        `Permanently removed order #${orderId} from system.`
      );
      showToast('Order deleted locally!');
      return;
    }

    try {
      await monitoredDeleteDoc(doc(db, 'orders', orderId), 'AdminView:deleteOrder');
      
      await logAdminActivity(
        'order_delete',
        `Order #${orderId} deleted`,
        `Permanently removed order #${orderId} from system.`
      );

      dbLogger.logFirestoreWriteSuccess({
        operation: 'deleteDoc',
        targetPath: `orders/${orderId}`,
        sourceComponent: 'ShopContext',
        actionName: 'deleteOrder',
        summary: `Order #${orderId} permanently deleted from Firestore database.`,
        startTime
      });
    } catch (error) {
      dbLogger.logFirestoreWriteError({
        operation: 'deleteDoc',
        targetPath: `orders/${orderId}`,
        sourceComponent: 'ShopContext',
        actionName: 'deleteOrder',
        summary: `Failed to delete order #${orderId} from Firestore`,
        startTime,
        error
      });
      handleFirestoreError(error, OperationType.DELETE, `orders/${orderId}`);
      showToast('Error deleting order from database. You must be signed in as an admin.', 'error');
      throw error;
      return;
    }

    showToast('Order removed from database', 'warning');
  };

  // Add Product - Saves new item to Firestore database
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
    const id = newProdData.id || `prod-custom-${Date.now()}`;
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

    const { startTime } = dbLogger.logFirestoreWriteStart({
      operation: 'setDoc',
      targetPath: `products/${id}`,
      sourceComponent: 'ShopContext',
      actionName: 'addProduct',
      summary: `Writing new product document to Firestore (products/${id})...`,
      payload: sanitizedProduct
    });

    // Optimistically update state
    setProducts(prev => {
      const next = [newProduct, ...prev];
      try {
        localStorage.setItem('yallalb_products', JSON.stringify(next));
      } catch {}
      return next;
    });

    if (!IS_FIREBASE_ENABLED) {
      await logAdminActivity(
        'product_add',
        `Product "${newProduct.name}" created`,
        `Added new catalog item with ID: ${newProduct.id}, category: ${newProduct.category}, and price: $${newProduct.priceUSD} locally.`,
        newProduct.id,
        null,
        newProduct
      );
      showToast(`Product "${newProduct.name}" saved locally!`);
      return;
    }

    // Persist to Firestore
    try {
      await monitoredSetDoc(doc(db, 'products', id), sanitizedProduct, undefined, 'AdminView:addProduct');
      if (Object.keys(privatePayload).length > 3 || sellerItemCode || lowStockThreshold !== undefined || costPriceUSD !== undefined) {
        try {
          await monitoredSetDoc(doc(db, 'product_private', id), sanitizeDocumentData(privatePayload), { merge: true }, 'AdminView:addProductPrivate');
        } catch (privErr) {
          console.warn('[ShopContext] Error writing product_private:', privErr);
        }
      }
      
      await logAdminActivity(
        'product_add',
        `Product "${newProduct.name}" created`,
        `Added new catalog item with ID: ${newProduct.id}, category: ${newProduct.category}, and price: $${newProduct.priceUSD}.`,
        newProduct.id,
        null,
        newProduct
      );

      dbLogger.logFirestoreWriteSuccess({
        operation: 'setDoc',
        targetPath: `products/${id}`,
        sourceComponent: 'ShopContext',
        actionName: 'addProduct',
        summary: `Product "${newProduct.name}" successfully created in Firestore database.`,
        startTime,
        payload: sanitizedProduct
      });
      showToast(`Product "${newProduct.name}" saved to database!`);
    } catch (error) {
      setProducts(prev => {
        const next = prev.filter(p => p.id !== id);
        try {
          localStorage.setItem('yallalb_products', JSON.stringify(next));
        } catch {}
        return next;
      });
      dbLogger.logFirestoreWriteError({
        operation: 'setDoc',
        targetPath: `products/${id}`,
        sourceComponent: 'ShopContext',
        actionName: 'addProduct',
        summary: `Failed to create product "${newProduct.name}" in Firestore`,
        startTime,
        error
      });
      handleFirestoreError(error, OperationType.CREATE, `products/${id}`);
      showToast(`Error saving product "${newProduct.name}" to database.`, 'error');
      throw error;
    }
  };

  // Update Product - Updates item in Firestore database
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

    const { startTime } = dbLogger.logFirestoreWriteStart({
      operation: 'setDoc',
      targetPath: `products/${id}`,
      sourceComponent: 'ShopContext',
      actionName: 'updateProduct',
      summary: `Persisting product #${id} updates to Firestore...`,
      payload: sanitizedUpdates
    });

    setProducts(prev => {
      const next = prev.map(p => (p.id === id ? { ...p, ...mergedUpdates } : p));
      try {
        localStorage.setItem('yallalb_products', JSON.stringify(next));
      } catch {}
      return next;
    });

    if (!IS_FIREBASE_ENABLED) {
      await logAdminActivity(
        'product_update',
        `Product "${existing?.name || id}" updated`,
        `Modified attributes locally: ${Object.keys(updates).join(', ')}.`,
        id,
        existing,
        { ...existing, ...mergedUpdates }
      );
      showToast('Product updated locally!');
      return;
    }

    try {
      if (Object.keys(sanitizedUpdates).length > 1 || !sanitizedUpdates.updatedAt) {
        await monitoredSetDoc(doc(db, 'products', id), sanitizedUpdates, { merge: true }, 'AdminView:updateProduct');
      }
      if (hasPrivateUpdates) {
        try {
          await monitoredSetDoc(doc(db, 'product_private', id), sanitizeDocumentData(privateUpdates), { merge: true }, 'AdminView:updateProductPrivate');
        } catch (privErr) {
          console.warn('[ShopContext] Error updating product_private:', privErr);
        }
      }
      
      await logAdminActivity(
        'product_update',
        `Product "${existing?.name || id}" updated`,
        `Modified attributes: ${Object.keys(updates).join(', ')}.`,
        id,
        existing,
        { ...existing, ...mergedUpdates }
      );

      dbLogger.logFirestoreWriteSuccess({
        operation: 'setDoc',
        targetPath: `products/${id}`,
        sourceComponent: 'ShopContext',
        actionName: 'updateProduct',
        summary: `Product #${id} updates committed to Firestore database successfully.`,
        startTime,
        payload: sanitizedUpdates
      });
      showToast('Product updated in database successfully');
    } catch (error) {
      if (existing) {
        setProducts(prev => {
          const next = prev.map(p => (p.id === id ? existing : p));
          try {
            localStorage.setItem('yallalb_products', JSON.stringify(next));
          } catch {}
          return next;
        });
      }
      dbLogger.logFirestoreWriteError({
        operation: 'setDoc',
        targetPath: `products/${id}`,
        sourceComponent: 'ShopContext',
        actionName: 'updateProduct',
        summary: `Failed to update product #${id} in Firestore`,
        startTime,
        error
      });
      handleFirestoreError(error, OperationType.UPDATE, `products/${id}`);
      showToast('Error updating product in database.', 'error');
      throw error;
    }
  };

  // Delete Product - Removes item from Firestore database
  const deleteProduct = async (id: string) => {
    if (isAdminUser) {
      const authorized = await assertHighRiskAuthorization(firebaseUser?.uid);
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

    const { startTime } = dbLogger.logFirestoreWriteStart({
      operation: 'deleteDoc',
      targetPath: `products/${id}`,
      sourceComponent: 'ShopContext',
      actionName: 'deleteProduct',
      summary: `Deleting document from Firestore (products/${id})...`
    });

    setProducts(prev => {
      const next = prev.filter(p => p.id !== id);
      try {
        localStorage.setItem('yallalb_products', JSON.stringify(next));
      } catch {}
      return next;
    });

    if (!IS_FIREBASE_ENABLED) {
      await logAdminActivity(
        'product_delete',
        `Product "${target?.name || id}" deleted`,
        `Permanently removed product #${id} from catalog.`,
        id,
        target,
        null
      );
      showToast('Product deleted locally!');
      return;
    }

    try {
      await monitoredDeleteDoc(doc(db, 'products', id), 'AdminView:deleteProduct');
      try {
        await monitoredDeleteDoc(doc(db, 'product_private', id), 'AdminView:deleteProductPrivate');
      } catch {}
      
      await logAdminActivity(
        'product_delete',
        `Product "${target?.name || id}" deleted`,
        `Permanently removed product #${id} from catalog.`,
        id,
        target,
        null
      );

      dbLogger.logFirestoreWriteSuccess({
        operation: 'deleteDoc',
        targetPath: `products/${id}`,
        sourceComponent: 'ShopContext',
        actionName: 'deleteProduct',
        summary: `Product #${id} permanently deleted from Firestore database.`,
        startTime
      });
    } catch (error) {
      dbLogger.logFirestoreWriteError({
        operation: 'deleteDoc',
        targetPath: `products/${id}`,
        sourceComponent: 'ShopContext',
        actionName: 'deleteProduct',
        summary: `Failed to delete product #${id} from Firestore`,
        startTime,
        error
      });
      handleFirestoreError(error, OperationType.DELETE, `products/${id}`);
      showToast('Error deleting product from database. You must be signed in as an admin.', 'error');
      throw error;
      return;
    }

    showToast('Product removed from database', 'warning');
  };

  // Mass Delete Products - Removes multiple items from Firestore database
  const deleteMultipleProducts = async (ids: string[]) => {
    if (!ids || ids.length === 0) return;

    dbLogger.logFormInput({
      sourceComponent: 'AdminView',
      actionName: 'deleteMultipleProducts',
      targetPath: 'products/mass_delete',
      summary: `Admin bulk deleting ${ids.length} products`
    });

    const { startTime } = dbLogger.logFirestoreWriteStart({
      operation: 'deleteDoc', // or mass delete
      targetPath: `products/mass_delete`,
      sourceComponent: 'ShopContext',
      actionName: 'deleteMultipleProducts',
      summary: `Deleting ${ids.length} documents from Firestore...`
    });

    setProducts(prev => {
      const next = prev.filter(p => !ids.includes(p.id));
      try {
        localStorage.setItem('yallalb_products', JSON.stringify(next));
      } catch {}
      return next;
    });

    if (!IS_FIREBASE_ENABLED) {
      await logAdminActivity(
        'product_delete',
        `Bulk deleted ${ids.length} products`,
        `Permanently removed ${ids.length} products from catalog.`
      );
      showToast(`${ids.length} products deleted locally!`);
      return;
    }

    try {
      const results = await Promise.allSettled(ids.map(async id => {
        const res = await monitoredDeleteDoc(doc(db, 'products', id), 'AdminView:deleteMultipleProducts');
        try {
          await monitoredDeleteDoc(doc(db, 'product_private', id), 'AdminView:deleteMultipleProductsPrivate');
        } catch {}
        return res;
      }));
      const fulfilledCount = results.filter(r => r.status === 'fulfilled').length;
      const rejectedCount = results.filter(r => r.status === 'rejected').length;

      if (rejectedCount > 0) {
        showToast(`Deleted ${fulfilledCount} of ${ids.length} products (${rejectedCount} failed)`, 'warning');
        throw new Error(`Failed to delete ${rejectedCount} products from database`);
      }

      await logAdminActivity(
        'product_delete',
        `Bulk deleted ${ids.length} products`,
        `Permanently removed ${ids.length} products from catalog.`
      );

      dbLogger.logFirestoreWriteSuccess({
        operation: 'deleteDoc',
        targetPath: `products/mass_delete`,
        sourceComponent: 'ShopContext',
        actionName: 'deleteMultipleProducts',
        summary: `Successfully bulk deleted ${ids.length} products from Firestore database.`,
        startTime
      });
      
      showToast(`${ids.length} products removed from database`, 'warning');
    } catch (error) {
      dbLogger.logFirestoreWriteError({
        operation: 'deleteDoc',
        targetPath: `products/mass_delete`,
        sourceComponent: 'ShopContext',
        actionName: 'deleteMultipleProducts',
        summary: `Failed to mass delete products from Firestore`,
        startTime,
        error
      });
      throw error;
    }
  };

  // Sync All Initial Products directly to Firestore database
  const syncAllProductsToDatabase = async () => {
    const count = INITIAL_PRODUCTS.length;
    const confirmed = window.confirm(
      `Restore ${count} products from the bundled seed catalog?\n\n` +
      `This OVERWRITES prices, stock and descriptions for any of these products ` +
      `that you have edited in the admin portal. Edits will be lost.`
    );
    if (!confirmed) return;

    try {
      showToast(`Restoring ${count} seed products...`, 'info');
      
      const { startTime } = dbLogger.logFirestoreWriteStart({
        operation: 'writeBatch',
        targetPath: 'products/*',
        sourceComponent: 'AdminView',
        actionName: 'syncAllProductsToDatabase',
        summary: `Executing batch write of ${INITIAL_PRODUCTS.length} catalog items to Firestore...`
      });

      const batch = writeBatch(db);
      INITIAL_PRODUCTS.forEach((prod) => {
        const prodDocRef = doc(db, 'products', prod.id);
        const sanitizedProd = sanitizeDocumentData(ensureSellerItemCode(prod));
        batch.set(prodDocRef, sanitizedProd, { merge: true });
      });
      await monitoredBatchCommit(batch, INITIAL_PRODUCTS.length, 'products', 'AdminView:syncAllProductsToDatabase');

      dbLogger.logFirestoreWriteSuccess({
        operation: 'writeBatch',
        targetPath: 'products/*',
        sourceComponent: 'AdminView',
        actionName: 'syncAllProductsToDatabase',
        summary: `Batch write committed successfully: All ${INITIAL_PRODUCTS.length} products synchronized to Firestore database.`,
        startTime
      });

      console.log(`[ShopContext] Manually synchronized all ${INITIAL_PRODUCTS.length} products to Firestore.`);
      showToast(`Successfully saved and synced all ${INITIAL_PRODUCTS.length} products to database!`, 'success');
    } catch (err) {
      console.error("[ShopContext] Error syncing all products to Firestore:", err);
      showToast('Error syncing products to database', 'warning');
      throw err;
    }
  };

  // Check phone number uniqueness across Firestore registry and users
  const checkPhoneUniqueness = useCallback(async (phone: string, excludeUid?: string): Promise<{ available: boolean; reason?: string }> => {
    const norm = normalizeLebanesePhone(phone);
    if (!norm.isValid) {
      return {
        available: false,
        reason: language === 'ar'
          ? 'يجب أن يتألف رقم الهاتف اللبناني من 8 أرقام صحيحة (مثال: 70123456 أو 03123456).'
          : 'Lebanese phone number must be strictly 8 valid digits (e.g. 70123456 or 03123456).'
      };
    }

    if (IS_FIREBASE_ENABLED) {
      try {
        const checkFn = httpsCallable<{ phone: string; excludeUid?: string }, { available: boolean; reason?: string }>(
          functionsInstance,
          'checkPhoneAvailability'
        );
        const result = await checkFn({ phone: norm.formatted, excludeUid });
        if (!result.data || !result.data.available) {
          return {
            available: false,
            reason: result.data?.reason || (
              language === 'ar'
                ? 'رقم الهاتف هذا مسجل مسبقاً بحساب آخر. يرجى استخدام رقم آخر أو تسجيل الدخول.'
                : 'This phone number is already registered to another account. Please sign in or use a different phone number.'
            )
          };
        }
      } catch (err: any) {
        console.warn('[ShopContext] Phone uniqueness check failed (failing closed):', err);
        return {
          available: false,
          reason: language === 'ar'
            ? 'تعذر التحقق من توفر رقم الهاتف. يرجى المحاولة مرة أخرى لاحقاً.'
            : (err?.message || 'Unable to verify phone number availability. Please try again later.')
        };
      }
    }

    // 3. Fallback check for local storage
    try {
      const localUsersRaw = localStorage.getItem('yallalb_registered_users_cache');
      if (localUsersRaw) {
        const localList: Array<{ uid?: string; phone?: string }> = JSON.parse(localUsersRaw);
        if (Array.isArray(localList)) {
          for (const item of localList) {
            if (excludeUid && item.uid === excludeUid) continue;
            if (item.phone) {
              const itemNorm = normalizeLebanesePhone(item.phone);
              if (itemNorm.isValid && itemNorm.cleanDigits === norm.cleanDigits) {
                return {
                  available: false,
                  reason: language === 'ar'
                    ? 'رقم الهاتف هذا مسجل مسبقاً بحساب آخر.'
                    : 'This phone number is already registered to another account.'
                };
              }
            }
          }
        }
      }
    } catch {}

    return { available: true };
  }, [language]);

  // Update User Profile - Saves to Firestore database
  const updateUser = async (updates: Partial<UserProfile>) => {
    // If phone number is updated, check uniqueness and manage registry
    if (updates.phone !== undefined && updates.phone !== '') {
      const norm = normalizeLebanesePhone(updates.phone);
      if (norm.isValid) {
        const oldNorm = normalizeLebanesePhone(user.phone);
        const isChanging = !oldNorm.isValid || oldNorm.cleanDigits !== norm.cleanDigits;
        const userUid = firebaseUser?.uid || user.uid;

        if (isChanging) {
          const check = await checkPhoneUniqueness(norm.cleanDigits, userUid);
          if (!check.available) {
            showToast(check.reason || 'This phone number is already registered.', 'warning');
            throw new Error(check.reason || 'Phone number already registered.');
          }

          if (userUid && IS_FIREBASE_ENABLED && norm.registryKey) {
            try {
              await setDoc(doc(db, 'phone_registry', norm.registryKey), {
                uid: userUid,
                phone: norm.formatted,
                cleanDigits: norm.cleanDigits,
                updatedAt: new Date().toISOString()
              });
              if (oldNorm.isValid && oldNorm.registryKey && oldNorm.registryKey !== norm.registryKey) {
                await deleteDoc(doc(db, 'phone_registry', oldNorm.registryKey)).catch(() => {});
              }
            } catch (regErr) {
              console.warn('[ShopContext] Non-blocking phone_registry update:', regErr);
            }
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
      uid: firebaseUser ? firebaseUser.uid : user.uid,
      role: 'customer',
      sellerId: sellerId || undefined
    };
    const sanitizedUser = sanitizeDocumentData(updatedUser);
    setUser(updatedUser);

    if (!firebaseUser) {
      try {
        localStorage.setItem('yallalb_saved_checkout_data', JSON.stringify(sanitizedUser));
      } catch {}
      return;
    }

    const userKey = firebaseUser.uid;

    const { startTime } = dbLogger.logFirestoreWriteStart({
      operation: 'setDoc',
      targetPath: `users/${userKey}`,
      sourceComponent: 'ShopContext',
      actionName: 'updateUser',
      summary: `Persisting profile and delivery details for user (${userKey}) to Firestore...`,
      payload: sanitizedUser
    });

    try {
      await monitoredSetDoc(doc(db, 'users', userKey), {
        uid: userKey,
        ...sanitizedUser,
        updatedAt: new Date().toISOString()
      }, { merge: true }, 'ShopContext:updateUser');
      
      dbLogger.logFirestoreWriteSuccess({
        operation: 'setDoc',
        targetPath: `users/${userKey}`,
        sourceComponent: 'ShopContext',
        actionName: 'updateUser',
        summary: `User profile saved to Firestore database for user: ${userKey}`,
        startTime,
        payload: sanitizedUser
      });
    } catch (error) {
      dbLogger.logFirestoreWriteError({
        operation: 'setDoc',
        targetPath: `users/${userKey}`,
        sourceComponent: 'ShopContext',
        actionName: 'updateUser',
        summary: `Failed to save user profile to Firestore`,
        startTime,
        error
      });
      handleFirestoreError(error, OperationType.UPDATE, `users/${userKey}`);
      showToast('Could not save your profile. Please try again.', 'error');
      return;
    }

    showToast('Profile and delivery details saved to database');
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
    firebaseUser,
    isAdminUser,
    isSellerUser,
    sellerId,
    isEmailVerified,
    signInWithEmail,
    signUpWithEmail,
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
      : !firebaseUser
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
    firebaseUser,
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
