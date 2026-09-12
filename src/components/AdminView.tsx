import React, { useState, useEffect, useMemo, useRef } from 'react';
import { auth } from '../firebase';
import { secureRandomInt } from '../utils/uuid';
import { sanitizeRowForCsv } from '../utils/csvSafe';
import { useShop } from '../context/ShopContext';
import { useDialog } from '../hooks/useDialog';
import { Product, OrderStatus, Order, UserProfile } from '../types';
import { LBP_USD_RATE } from '../data/regions';
import { buildCustomerIndex } from '../lib/customerIndex';
import { AdminSidebar, AdminMenuTab } from './admin/AdminSidebar';
import { EcommerceOverview } from './admin/EcommerceOverview';
import { SalesAnalyticsView } from './admin/SalesAnalyticsView';
import { CategoriesDetailsView } from './admin/CategoriesDetailsView';
import { SellersView } from './admin/SellersView';
import { CustomersView } from './admin/CustomersView';
import { ActiveCartsView } from './admin/ActiveCartsView';
import { ReviewsManager } from './admin/ReviewsManager';
import { SearchAnalyticsView } from './admin/SearchAnalyticsView';
import { DiscountsManager } from './admin/DiscountsManager';
import { DatabaseActivityLogs } from './admin/DatabaseActivityLogs';
import { OrdersRoute } from './admin/routes/OrdersRoute';
import { PageCMSManager } from './PageCMSManager';
import { ProductOrderRankWidget } from './admin/ProductOrderRankWidget';
import { ProductsSequenceTableView } from './admin/ProductsSequenceTableView';
import { 
  downloadFullMasterReport,
  downloadSellerPerformanceReport,
  downloadStockInventoryReport,
  downloadOrdersReport
} from '../utils/exportMasterReport';
import { resolveSeller, resolveCategory, parsePrice, parseStock, isCsvRowEmpty } from '../utils/importerResolvers';
import { checkDuplicateProductNumber } from '../lib/productValidation';
import { 
  Lock, 
  Plus, 
  Package, 
  Search, 
  Trash2, 
  RefreshCw, 
  Eye, 
  EyeOff, 
  Edit3, 
  DollarSign, 
  Truck, 
  ArrowLeft,
  Menu,
  Check,
  CheckCircle2,
  ExternalLink,
  MessageSquare,
  FileText,
  Printer,
  AlertCircle,
  ShieldCheck,
  Store,
  Filter,
  X,
  SlidersHorizontal,
  Sparkles,
  Key,
  Save,
  Globe,
  Radio,
  UploadCloud,
  ChevronRight,
  ChevronDown,
  Compass,
  Layers,
  Download,
  XCircle,
  Phone,
  BarChart3,
  FileSpreadsheet,
  Video,
  Film,
  FileDiff,
  RotateCcw,
  History,
  Image as ImageIcon,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  ChevronsUp,
  ChevronsDown,
  Zap,
  Hash,
  Star,
  LayoutGrid,
  ListOrdered
} from 'lucide-react';
import { doc, getDocFromServer, collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { pingFirestore } from '../lib/firestore';

export const ADMIN_TAB_METAS: Record<AdminMenuTab, { path: string; title: string; section: string; desc: string; icon: string }> = {
  ecommerce: {
    path: 'ecommerce',
    title: 'eCommerce Analytics',
    section: 'Store Dashboard',
    desc: 'Real-time sales velocity, revenue breakdown, and store performance overview',
    icon: '📊'
  },
  sales: {
    path: 'sales',
    title: 'Sales Analytics & Commercial Reports',
    section: 'Store Dashboard',
    desc: 'Deep-dive sales by time period, product, seller, customer, and Lebanese regional logistics',
    icon: '📈'
  },
  orders: {
    path: 'Orders',
    title: 'Orders & Courier Dispatch',
    section: 'Store Operations',
    desc: 'Courier tracking, order invoices, and Lebanese regional dispatches',
    icon: '📦'
  },
  products: {
    path: 'Products',
    title: 'Products & Inventory Catalog',
    section: 'Store Operations',
    desc: 'Manage authentic Lebanese terroir products, prices, stock, and Arabic SEO',
    icon: '🏷️'
  },
  categories: {
    path: 'categories',
    title: 'Categories & Terroir Taxonomy',
    section: 'Store Operations',
    desc: 'Manage department classifications, Arabic naming, and regional terroir origins',
    icon: '📁'
  },
  sellers: {
    path: 'sellers',
    title: 'Sellers & CSV Bulk Import',
    section: 'Store Operations',
    desc: 'Manage verified suppliers and bulk CSV inventory operations',
    icon: '🏪'
  },
  discounts: {
    path: 'discounts',
    title: 'Discounts & Promo Codes',
    section: 'Store Operations',
    desc: 'Configure discount coupons, seasonal vouchers, and free shipping triggers',
    icon: '🏷️'
  },
  bundles: {
    path: 'bundles',
    title: 'Bundles & Combo Deals',
    section: 'Store Operations',
    desc: 'Create and manage multi-product gift sets, combo discounts, and promotional bundles',
    icon: '🎁'
  },
  customers: {
    path: 'customers',
    title: 'Customer Directory & Accounts',
    section: 'Store Operations',
    desc: 'Shopper profiles, phone contacts, and Lebanese shipping destinations',
    icon: '👥'
  },
  active_carts: {
    path: 'active-carts',
    title: 'Active Shopping Carts',
    section: 'Store Operations',
    desc: 'Live unpurchased carts and shopper checkout engagement tracking',
    icon: '🛒'
  },
  reviews: {
    path: 'reviews',
    title: 'Customer Reviews & Replies',
    section: 'Store Operations',
    desc: 'Manage customer product reviews and publish store responses',
    icon: '⭐'
  },
  search_analytics: {
    path: 'search-trends',
    title: 'Search Trends & Analytics',
    section: 'Store Operations',
    desc: 'Real-time monitoring of customer search queries and interest trends',
    icon: '🔍'
  },
  pages_cms: {
    path: 'cms',
    title: 'All Pages CMS Studio',
    section: 'Content Management',
    desc: 'Manage all visual modules, page layouts, and storefront components',
    icon: '🎛️'
  },
  page_home: {
    path: 'cms/home',
    title: 'Home Page CMS',
    section: 'Content Management',
    desc: 'Landing hero banner, featured artisans, and terroir showcases',
    icon: '🏠'
  },
  page_products: {
    path: 'cms/products',
    title: 'Products Catalog CMS',
    section: 'Content Management',
    desc: 'Catalog layout, search headings, and product filtering parameters',
    icon: '🛍️'
  },
  page_detail: {
    path: 'cms/product-detail',
    title: 'Product Detail CMS',
    section: 'Content Management',
    desc: 'Artisanal craft stories, trust badges, and terroir origin highlights',
    icon: '🔍'
  },
  page_checkout: {
    path: 'cms/checkout',
    title: 'Checkout & Delivery CMS',
    section: 'Content Management',
    desc: 'Cash-on-delivery instructions, courier delivery regions, and trust guarantees',
    icon: '💳'
  },
  page_account: {
    path: 'cms/account',
    title: 'Account Page CMS',
    section: 'Content Management',
    desc: 'Customer dashboard labels, saved addresses, and profile text',
    icon: '👤'
  },
  page_news: {
    path: 'cms/news',
    title: 'News & Terroir Stories CMS',
    section: 'Content Management',
    desc: 'Publish cultural articles, artisan spotlights, and Lebanese harvest updates',
    icon: '📰'
  },
  page_navbar: {
    path: 'cms/navbar',
    title: 'Navbar & Announcement CMS',
    section: 'Content Management',
    desc: 'Header navigation links, ticker messages, and currency switchers',
    icon: '🧭'
  },
  page_footer: {
    path: 'cms/footer',
    title: 'Footer & Support CMS',
    section: 'Content Management',
    desc: 'Lebanese contact details, WhatsApp support, and legal information',
    icon: '🦶'
  },
  page_custom_blocks: {
    path: 'cms/custom-blocks',
    title: 'Custom Divs & Banners CMS',
    section: 'Content Management',
    desc: 'Custom promotional blocks and dynamic marketing placements',
    icon: '🧱'
  },
  page_visibility: {
    path: 'cms/visibility',
    title: 'Section Visibility CMS',
    section: 'Content Management',
    desc: 'Toggle storefront modules and promotional components on or off',
    icon: '👁️'
  },
  page_seo: {
    path: 'cms/seo',
    title: 'Global SEO & Metadata',
    section: 'Content Management',
    desc: 'Search engine optimization, meta descriptions, and OpenGraph social cards',
    icon: '🔍'
  },
  db_logs: {
    path: 'database-logs',
    title: 'Database Sync Flow & Logs',
    section: 'System & Audits',
    desc: 'Firestore real-time sync metrics, operation latency, and security audit logs',
    icon: '⚡'
  }
};

const getInitialAdminTab = (): AdminMenuTab => {
  if (typeof window === 'undefined') return 'ecommerce';
  const path = window.location.pathname.replace(/^\/+/, '');
  const searchParams = new URLSearchParams(window.location.search);
  const tabParam = searchParams.get('tab') || searchParams.get('admin');

  if (tabParam && tabParam in ADMIN_TAB_METAS) {
    return tabParam as AdminMenuTab;
  }

  if (path.startsWith('admin/')) {
    const sub = path.replace(/^admin\//, '').replace(/\/+$/, '').toLowerCase();
    for (const [tabKey, meta] of Object.entries(ADMIN_TAB_METAS)) {
      if (meta.path.toLowerCase() === sub || tabKey.toLowerCase() === sub) {
        return tabKey as AdminMenuTab;
      }
    }
  }
  return 'ecommerce';
};

export const AdminView: React.FC = () => {
  const { 
    categories = [],
    sellers = [],
    products = [], 
    orders = [], 
    cart = [],
    formatPrice = (n: number) => `$${n}`, 
    updateOrderStatus = async () => {}, 
    deleteOrder = async () => {},
    addProduct = async () => {},
    updateProduct = async () => {},
    deleteProduct = async () => {},
    deleteMultipleProducts = async () => {},
    toggleProductPublish = async () => {},
    reorderProducts = async (orderedProducts: Product[]) => {},
    syncAllProductsToDatabase = async () => {},
    bulkImportProducts = async (csvText: string) => ({ created: 0, updated: 0, errors: [] }),
    showToast = () => {},
    goBack = () => {},
    t = (k: string) => k,
    language = 'en',
    isAdminUnlocked = false,
    setIsAdminUnlocked = () => {},
    isVisualEditMode = false,
    setIsVisualEditMode = () => {},
    user = null,
    firebaseUser = null,
    isAdminUser = false,
    isLoadingAuth = false,
    refreshUserProfile = async () => {},
    signInWithEmail = async (e: string, p: string) => {},
    signOutUser = async () => {},
    isDbSyncing = false, resetPassword = async (email: string) => {}
  } = useShop() || {};

  const [isVerifyingAuth, setIsVerifyingAuth] = useState(false);
  const [firestoreStatus, setFirestoreStatus] = useState<'checking' | 'connected' | 'error'>('connected');
  const [firestoreErrorDetails, setFirestoreErrorDetails] = useState<string | null>(null);
  const [isMasterExportMenuOpen, setIsMasterExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Close export dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setIsMasterExportMenuOpen(false);
      }
    };
    if (isMasterExportMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMasterExportMenuOpen]);

  useEffect(() => {
    let isMounted = true;
    pingFirestore()
      .then(() => {
        if (isMounted) setFirestoreStatus('connected');
      })
      .catch((err) => {
        if (isMounted) {
          console.warn('Background Firestore ping note:', err);
        }
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const [currentTab, setCurrentTab] = useState<AdminMenuTab>(getInitialAdminTab);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Navigate to admin tab as a distinct URL & page
  const navigateAdminTab = (tab: AdminMenuTab) => {
    setCurrentTab(tab);
    const meta = ADMIN_TAB_METAS[tab] || ADMIN_TAB_METAS.ecommerce;
    const targetUrl = tab === 'ecommerce' ? `/admin` : `/admin/${meta.path}`;
    if (typeof window !== 'undefined' && window.history && window.location.pathname !== targetUrl) {
      const currentDepth = (window.history.state && typeof window.history.state.depth === 'number')
        ? window.history.state.depth
        : 0;
      window.history.pushState({ appNav: true, adminTab: tab, depth: currentDepth + 1 }, '', targetUrl);
    }
    if (typeof document !== 'undefined') {
      document.title = `${meta.title} — Yalla.lb Merchant Admin`;
    }
  };

  // Listen to browser Back/Forward between admin subpages
  useEffect(() => {
    const handlePopState = () => {
      const tab = getInitialAdminTab();
      setCurrentTab(tab);
      const meta = ADMIN_TAB_METAS[tab];
      if (meta && typeof document !== 'undefined') {
        document.title = `${meta.title} — Yalla.lb Merchant Admin`;
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Update initial document title
  useEffect(() => {
    const meta = ADMIN_TAB_METAS[currentTab];
    if (meta && typeof document !== 'undefined') {
      document.title = `${meta.title} — Yalla.lb Merchant Admin`;
    }
  }, [currentTab]);

  // Products Catalog States
  const [adminProductSearch, setAdminProductSearch] = useState('');
  const [adminProductSeller, setAdminProductSeller] = useState('all');
  const [adminProductCategory, setAdminProductCategory] = useState('all');
  const [adminPublishFilter, setAdminPublishFilter] = useState<'all' | 'published' | 'hidden'>('all');
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editPriceUSD, setEditPriceUSD] = useState<number>(0);
  const [editStock, setEditStock] = useState<number>(0);
  const [isSyncingDb, setIsSyncingDb] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [fullEditProduct, setFullEditProduct] = useState<Product | null>(null);
  const [isPreviewEditModalOpen, setIsPreviewEditModalOpen] = useState(false);
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [editNewImageInput, setEditNewImageInput] = useState('');
  const [editNewVideoInput, setEditNewVideoInput] = useState('');

  // Product Ordering & Sequence State
  const [productViewMode, setProductViewMode] = useState<'grid' | 'order'>('grid');
  const [orderedCatalogList, setOrderedCatalogList] = useState<Product[]>([]);
  const [hasProductOrderChanges, setHasProductOrderChanges] = useState(false);
  const [lastMovedProductId, setLastMovedProductId] = useState<string | null>(null);
  const [isSavingProductOrder, setIsSavingProductOrder] = useState(false);

  const hasProductOrderChangesRef = useRef(false);
  hasProductOrderChangesRef.current = hasProductOrderChanges;

  // Synchronize orderedCatalogList with products state
  useEffect(() => {
    if (hasProductOrderChangesRef.current) return;
    const sorted = [...products].sort((a, b) => {
      const orderA = a.displayOrder ?? 9999;
      const orderB = b.displayOrder ?? 9999;
      return orderA - orderB;
    });
    setOrderedCatalogList(sorted);
    setHasProductOrderChanges(false);
  }, [products]);

  // Bulk Upload States
  const [isBulkUploadModalOpen, setIsBulkUploadModalOpen] = useState(false);
  const [bulkImportFile, setBulkImportFile] = useState<File | null>(null);
  const [bulkImportRawRows, setBulkImportRawRows] = useState<any[]>([]);
  const [bulkImportTargetSellerId, setBulkImportTargetSellerId] = useState<string>('auto');
  const [bulkImportFallbackCategoryId, setBulkImportFallbackCategoryId] = useState<string>('auto');
  const [bulkImportPreviewRows, setBulkImportPreviewRows] = useState<any[]>([]);
  const [isBulkImporting, setIsBulkImporting] = useState(false);
  const [bulkImportResult, setBulkImportResult] = useState<{ created: number; updated: number; errors: string[] } | null>(null);

  // Login Form States
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [showAdminOtpModal, setShowAdminOtpModal] = useState(false);

  // Clear credentials on mount / session start to prevent unwanted autofill/saving
  useEffect(() => {
    setAdminEmail('');
    setAdminPassword('');
    setLoginError(null);
  }, []);

  // Form State for new product
  const [newProduct, setNewProduct] = useState<{
    name: string;
    arabicName: string;
    category: string;
    artisan: string;
    seller: string;
    arabicSeller: string;
    origin: string;
    description: string;
    craftStory: string;
    priceUSD: number;
    originalPriceUSD: number | '';
    discountPercentage: number | '';
    stock: number;
    lowStockThreshold: number;
    lowStockNotice: string;
    image: string;
    additionalImages: string[];
    newAdditionalImageInput: string;
    videoUrl: string;
    videos: string[];
    newVideoInput: string;
    weightOrVolume: string;
    tags: string[];
    tagsInput: string;
    keywordsInput: string;
    arabicKeywords: string[];
    newArabicKeywordInput: string;
    sellerItemCode: string;
  }>({
    name: '',
    arabicName: '',
    category: 'grocery',
    artisan: '',
    seller: '',
    arabicSeller: '',
    origin: 'Koura, North Lebanon',
    description: '',
    craftStory: '',
    priceUSD: 15,
    originalPriceUSD: '',
    discountPercentage: '',
    stock: 25,
    lowStockThreshold: 5,
    lowStockNotice: '',
    image: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=600&q=80',
    additionalImages: [],
    newAdditionalImageInput: '',
    videoUrl: '',
    videos: [],
    newVideoInput: '',
    weightOrVolume: '',
    tags: ['Artisanal', 'Lebanese Terroir'],
    tagsInput: 'Artisanal, Lebanese Terroir, Handmade',
    keywordsInput: 'lebanese, artisanal, authentic, gourmet',
    arabicKeywords: ['مونة بلدية', 'منتجات لبنانية أصيلة'],
    newArabicKeywordInput: '',
    sellerItemCode: 'SIC-' + secureRandomInt(100000, 1000000)
  });

  const { containerRef: addProductModalRef } = useDialog({
    isOpen: isAddModalOpen,
    onClose: () => setIsAddModalOpen(false)
  });

  const { containerRef: editProductModalRef } = useDialog({
    isOpen: !!fullEditProduct,
    onClose: () => setFullEditProduct(null)
  });

  const addModalScrollRef = useRef(0);
  const editModalScrollRef = useRef(0);

  React.useLayoutEffect(() => {
    if (addProductModalRef.current) {
      addProductModalRef.current.scrollTop = addModalScrollRef.current;
    }
  });

  React.useLayoutEffect(() => {
    if (editProductModalRef.current) {
      editProductModalRef.current.scrollTop = editModalScrollRef.current;
    }
  });

  // Unified dynamic list of unique sellers (combining all registered sellers from Sellers collection & any artisan names on products)
  const sellerStats = useMemo(() => {
    const map = new Map<string, { id?: string; seller: string; arabicName?: string; count: number }>();

    // 1. Seed with all registered sellers from database
    sellers.forEach(s => {
      const name = (s.nameEn || (s as any).name || s.id || '').trim();
      if (name) {
        map.set(name.toLowerCase(), {
          id: s.id,
          seller: name,
          arabicName: s.nameAr || (s as any).arabicName,
          count: 0
        });
      }
    });

    // 2. Aggregate product counts & incorporate any unlinked artisans
    products.forEach(p => {
      const sName = (p.seller || p.artisan || '').trim();
      const sId = (p.sellerId || '').trim();

      let matchedKey: string | null = null;
      if (sName && map.has(sName.toLowerCase())) {
        matchedKey = sName.toLowerCase();
      } else if (sId) {
        for (const [key, val] of map.entries()) {
          if (val.id === sId) {
            matchedKey = key;
            break;
          }
        }
      }

      if (matchedKey) {
        const item = map.get(matchedKey)!;
        item.count += 1;
      } else if (sName) {
        map.set(sName.toLowerCase(), {
          id: p.sellerId || sName.toLowerCase().replace(/\s+/g, '-'),
          seller: sName,
          arabicName: p.arabicSeller,
          count: 1
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => a.seller.localeCompare(b.seller));
  }, [sellers, products]);

  const filteredCatalogProducts = useMemo(() => {
    const searchLower = adminProductSearch.toLowerCase().trim();
    const sourceList = orderedCatalogList.length > 0 ? orderedCatalogList : products;
    return sourceList.filter(p => {
      const productSeller = (p.artisan || p.seller || '').toLowerCase();
      const productName = (p.name || '').toLowerCase();
      const productArabic = (p.arabicName || '');
      const productOrigin = (p.origin || '').toLowerCase();
      const productCategory = (p.category || '').toLowerCase();
      const productId = (p.id || '').toLowerCase();
      const sellerCode = (p.sellerItemCode || '').toLowerCase();

      // Search matches product title, arabic title, seller/artisan, origin terroir, category, ID, seller code, tags, english & arabic SEO keywords
      const matchesSearch = !searchLower || 
        productName.includes(searchLower) ||
        productArabic.includes(adminProductSearch.trim()) ||
        productSeller.includes(searchLower) ||
        productOrigin.includes(searchLower) ||
        productCategory.includes(searchLower) ||
        productId.includes(searchLower) ||
        sellerCode.includes(searchLower) ||
        (p.tags && p.tags.some(t => t.toLowerCase().includes(searchLower))) ||
        (p.keywords && p.keywords.some(k => k.toLowerCase().includes(searchLower))) ||
        (p.arabicKeywords && p.arabicKeywords.some(k => k.includes(adminProductSearch.trim())));
      
      const matchesSeller = adminProductSeller === 'all' || 
        ((p.artisan && p.artisan.toLowerCase() === adminProductSeller.toLowerCase()) ||
         (p.seller && p.seller.toLowerCase() === adminProductSeller.toLowerCase()) ||
         (p.sellerId && p.sellerId.toLowerCase() === adminProductSeller.toLowerCase()) ||
         sellers.some(s => 
           (s.nameEn?.toLowerCase() === adminProductSeller.toLowerCase() || s.id?.toLowerCase() === adminProductSeller.toLowerCase()) &&
           (p.sellerId === s.id || 
            (p.seller && p.seller.toLowerCase() === s.nameEn.toLowerCase()) || 
            (p.artisan && p.artisan.toLowerCase() === s.nameEn.toLowerCase()))
         ));

      const matchesCategory = adminProductCategory === 'all' || p.category === adminProductCategory;
      
      const matchesPublish = adminPublishFilter === 'all' 
        ? true 
        : adminPublishFilter === 'published' 
          ? p.isPublished !== false 
          : p.isPublished === false;

      return matchesSearch && matchesSeller && matchesCategory && matchesPublish;
    });
  }, [orderedCatalogList, products, adminProductSearch, adminProductSeller, adminProductCategory, adminPublishFilter, sellers]);

  // Count selected products within current filtered view
  const selectedInFilteredCount = useMemo(() => {
    let count = 0;
    filteredCatalogProducts.forEach(p => {
      if (selectedProductIds.has(p.id)) count++;
    });
    return count;
  }, [filteredCatalogProducts, selectedProductIds]);

  const isAllFilteredSelected = filteredCatalogProducts.length > 0 && selectedInFilteredCount === filteredCatalogProducts.length;

  // Cleanup selectedProductIds if products are removed or deleted
  useEffect(() => {
    const existingIds = new Set(products.map(p => p.id));
    setSelectedProductIds(prev => {
      let changed = false;
      const next = new Set<string>();
      prev.forEach(id => {
        if (existingIds.has(id)) {
          next.add(id);
        } else {
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [products]);

  // Registered users and active carts from Firestore to keep counts synchronized
  const [dbUsers, setDbUsers] = useState<(UserProfile & { uid?: string })[]>([]);
  const [dbActiveCartsCount, setDbActiveCartsCount] = useState(0);

  useEffect(() => {
    if (!isAdminUser) return;
    let isMounted = true;
    const fetchUsersAndCarts = async () => {
      try {
        const [usersSnapshot, cartsSnapshot] = await Promise.all([
          getDocs(collection(db, 'users')),
          getDocs(collection(db, 'carts'))
        ]);
        if (!isMounted) return;
        const usersData: (UserProfile & { uid?: string })[] = [];
        usersSnapshot.forEach(doc => {
          usersData.push({ uid: doc.id, ...doc.data() } as UserProfile & { uid: string });
        });
        setDbUsers(usersData);

        // Count only carts that actually hold items, matching the Active Carts page.
        let carts = 0;
        cartsSnapshot.forEach(doc => {
          const data = doc.data() as { items?: unknown[] };
          if (Array.isArray(data.items) && data.items.length > 0) carts++;
        });
        setDbActiveCartsCount(carts);
      } catch (err: any) {
        console.error("[AdminView] Customer directory fetch failed:", err);
        showToast(`Could not load the customer directory: ${err?.message || 'permission denied'}. Counts may be incomplete.`, 'error');
      }
    };
    fetchUsersAndCarts();
    return () => {
      isMounted = false;
    };
  }, [isAdminUser, isAdminUnlocked]);

  // Calculate distinct counts for sidebar badges
  const categoriesCount = categories.length;
  
  // Calculate distinct customers using unified Customer Index
  const customerIndex = useMemo(() => buildCustomerIndex(dbUsers, orders), [dbUsers, orders]);
  const customersCount = customerIndex.size;

  // Active Carts count backed by database
  const activeCartsCount = dbActiveCartsCount;

  const handleSyncDatabaseProducts = async () => {
    setIsSyncingDb(true);
    await syncAllProductsToDatabase();
    setIsSyncingDb(false);
  };

  // Product Sequence Ordering Handlers
  const handleMoveProductInCatalog = (productId: string, direction: 'up' | 'down' | 'top' | 'bottom') => {
    const currentIndex = orderedCatalogList.findIndex(p => p.id === productId);
    if (currentIndex === -1) return;

    let targetIdx = currentIndex;
    if (direction === 'up') targetIdx = currentIndex - 1;
    if (direction === 'down') targetIdx = currentIndex + 1;
    if (direction === 'top') targetIdx = 0;
    if (direction === 'bottom') targetIdx = orderedCatalogList.length - 1;

    if (targetIdx < 0 || targetIdx >= orderedCatalogList.length || targetIdx === currentIndex) return;

    const nextList = [...orderedCatalogList];
    const [item] = nextList.splice(currentIndex, 1);
    nextList.splice(targetIdx, 0, item);

    setOrderedCatalogList(nextList);
    setHasProductOrderChanges(true);
    setLastMovedProductId(item.id);

    if (direction === 'top') {
      showToast(`⚡ Moved "${item.name}" directly to Rank #1! Click "Save Products Order" to apply.`, 'success');
    } else if (direction === 'bottom') {
      showToast(`Moved "${item.name}" to bottom (Rank #${nextList.length}).`, 'info');
    } else {
      showToast(`Moved "${item.name}" to Rank #${targetIdx + 1}.`, 'info');
    }
  };

  const handleSetProductRankInCatalog = (productId: string, newRankStr: string) => {
    const newRank = parseInt(newRankStr, 10);
    if (isNaN(newRank) || newRank < 1 || newRank > orderedCatalogList.length) {
      showToast(`Please enter a valid rank between 1 and ${orderedCatalogList.length}`, 'warning');
      return;
    }

    const currentIndex = orderedCatalogList.findIndex(p => p.id === productId);
    if (currentIndex === -1) return;

    const targetIdx = newRank - 1;
    if (targetIdx === currentIndex) return;

    const nextList = [...orderedCatalogList];
    const [item] = nextList.splice(currentIndex, 1);
    nextList.splice(targetIdx, 0, item);

    setOrderedCatalogList(nextList);
    setHasProductOrderChanges(true);
    setLastMovedProductId(item.id);
    showToast(`🎯 Moved "${item.name}" directly to Rank #${newRank}! Click "Save Products Order" to apply.`, 'success');
  };

  const handleSaveProductSequence = async () => {
    if (orderedCatalogList.length === 0) return;
    setIsSavingProductOrder(true);
    try {
      await reorderProducts(orderedCatalogList);
      setHasProductOrderChanges(false);
      showToast(`Saved sequence order for all ${orderedCatalogList.length} products to database!`, 'success');
    } catch (err: any) {
      showToast('Could not save product order. Please try again.', 'warning');
    } finally {
      setIsSavingProductOrder(false);
    }
  };

  const handleResetProductOrder = () => {
    const sorted = [...products].sort((a, b) => {
      const orderA = a.displayOrder ?? 9999;
      const orderB = b.displayOrder ?? 9999;
      return orderA - orderB;
    });
    setOrderedCatalogList(sorted);
    setHasProductOrderChanges(false);
    showToast('Reset product ordering to saved database state.', 'info');
  };

  const handleGlobalSaveDraft = async () => {
    if (hasProductOrderChanges && orderedCatalogList.length > 0) {
      try {
        await reorderProducts(orderedCatalogList);
        setHasProductOrderChanges(false);
      } catch (err: any) {
        // Never report success for a save that failed.
        console.error('Error saving product order in draft:', err);
        showToast(`Could not save product order: ${err?.message || 'the write was rejected.'}`, 'error');
        return;
      }
    }
    showToast('All administrative modifications and drafts saved.', 'success');
  };

  const handleGlobalPublishLive = async () => {
    setIsSyncingDb(true);
    try {
      if (hasProductOrderChanges && orderedCatalogList.length > 0) {
        await reorderProducts(orderedCatalogList);
        setHasProductOrderChanges(false);
      }
      await syncAllProductsToDatabase();
      showToast('🎉 Storefront and catalog successfully published live to Public!', 'success');
    } catch (err: any) {
      console.error('[AdminView] Publish failed:', err);
      showToast(`Publish failed: ${err?.message || 'the catalog could not be written to the database.'}`, 'error');
    } finally {
      setIsSyncingDb(false);
    }
  };

  const handleCreateProduct = async (e?: React.FormEvent, isPublic: boolean = true) => {
    if (e) e.preventDefault();
    if (!newProduct.name || !newProduct.seller || !newProduct.priceUSD) {
      showToast('Please provide a name, seller name, and price.', 'warning');
      return;
    }

    const stockValue = Number(newProduct.stock);
    if (!Number.isFinite(stockValue) || stockValue < 0 || !Number.isInteger(stockValue)) {
      showToast('Stock quantity must be a whole number of units (0 or more).', 'warning');
      return;
    }

    const lowStockThresholdValue = Number(newProduct.lowStockThreshold) >= 0 ? Number(newProduct.lowStockThreshold) : 5;

    // Duplicate Product Number & Seller Item Code validation
    if (newProduct.sellerItemCode) {
      const targetSellerName = newProduct.artisan || newProduct.seller;
      const dupCode = checkDuplicateProductNumber(newProduct.sellerItemCode, null, products, undefined, targetSellerName);
      if (dupCode.isDuplicate) {
        showToast(`Duplicate seller item code: "${newProduct.sellerItemCode}" is already in use by "${dupCode.conflictingProduct?.name}" for seller "${targetSellerName || 'this seller'}". Duplicate seller item codes from the same seller are not allowed.`, 'error');
        return;
      }
    }

    // Duplicate Description validation removed to allow flexible product descriptions (e.g. Test, standard templates)

    const keywordsArray = newProduct.keywordsInput 
      ? newProduct.keywordsInput.split(',').map(s => s.trim()).filter(Boolean) 
      : [];

    const matchedSeller = sellers.find(s => 
      (newProduct.seller && s.nameEn.toLowerCase() === newProduct.seller.toLowerCase()) ||
      (newProduct.artisan && s.nameEn.toLowerCase() === newProduct.artisan.toLowerCase()) ||
      s.id === (newProduct as any).sellerId
    );

    const created: Omit<Product, 'id'> = {
      name: newProduct.name,
      arabicName: newProduct.arabicName,
      category: newProduct.category,
      artisan: newProduct.seller || 'Independent Artisan',
      seller: newProduct.seller || 'Independent Artisan',
      sellerId: matchedSeller?.id || (newProduct as any).sellerId || undefined,
      arabicSeller: newProduct.arabicSeller || (matchedSeller?.nameAr || ''),
      origin: matchedSeller?.region || newProduct.origin?.trim() || 'Lebanon',
      description: newProduct.description || 'Authentic Lebanese artisanal product.',
      craftStory: newProduct.craftStory || 'Generational handcrafted masterpiece created in Lebanon.',
      priceUSD: Number(newProduct.priceUSD),
      originalPriceUSD: Number(newProduct.originalPriceUSD) > 0 ? Number(newProduct.originalPriceUSD) : undefined,
      discountPercentage: Number(newProduct.discountPercentage) > 0
        ? Number(newProduct.discountPercentage)
        : (Number(newProduct.originalPriceUSD) > Number(newProduct.priceUSD)
            ? Math.round(((Number(newProduct.originalPriceUSD) - Number(newProduct.priceUSD)) / Number(newProduct.originalPriceUSD)) * 100)
            : undefined),
      rating: 0,
      reviewsCount: 0,
      stock: stockValue,
      lowStockThreshold: lowStockThresholdValue,
      lowStockNotice: newProduct.lowStockNotice ? newProduct.lowStockNotice.trim() : undefined,
      image: newProduct.image || 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=600&q=80',
      additionalImages: (newProduct.additionalImages || []).filter(Boolean),
      videoUrl: newProduct.videoUrl?.trim() || undefined,
      videos: (newProduct.videos || []).filter(Boolean).length > 0
        ? (newProduct.videos || []).filter(Boolean)
        : (newProduct.videoUrl?.trim() ? [newProduct.videoUrl.trim()] : undefined),
      isNewArrival: true,
      isFeatured: false,
      isBestseller: false,
      isPublished: isPublic,
      weightOrVolume: newProduct.weightOrVolume ? newProduct.weightOrVolume.trim() : '',
      tags: (newProduct.tagsInput || '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      keywords: keywordsArray,
      arabicKeywords: newProduct.arabicKeywords.filter(Boolean),
      seoTitle: `${newProduct.name} | Authentic Lebanese Goods`,
      seoArabicTitle: `${newProduct.arabicName || newProduct.name} | يلا ع لبنان`,
      seoDescription: newProduct.description || 'Authentic Lebanese craft and mouneh delivered globally.',
      sellerItemCode: newProduct.sellerItemCode || ('SIC-' + secureRandomInt(100000, 1000000))
    };

    try {
      await addProduct(created);
      showToast(
        isPublic 
          ? `Product "${newProduct.name}" published live to Public Catalog!` 
          : `Product "${newProduct.name}" saved as Draft (Unpublished).`,
        'success'
      );
      // Reset Add Product form to clean values with a brand new auto-generated code
      setNewProduct({
        name: '',
        arabicName: '',
        category: 'grocery',
        artisan: '',
        seller: '',
        arabicSeller: '',
        origin: 'Koura, North Lebanon',
        description: '',
        craftStory: '',
        priceUSD: 15,
        originalPriceUSD: '',
        discountPercentage: '',
        stock: 25,
        lowStockThreshold: 5,
        lowStockNotice: '',
        image: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=600&q=80',
        additionalImages: [],
        newAdditionalImageInput: '',
        videoUrl: '',
        videos: [],
        newVideoInput: '',
        weightOrVolume: '',
        tags: ['Artisanal', 'Lebanese Terroir'],
        tagsInput: 'Artisanal, Lebanese Terroir, Handmade',
        keywordsInput: 'lebanese, artisanal, authentic, gourmet',
        arabicKeywords: ['مونة بلدية', 'منتجات لبنانية أصيلة'],
        newArabicKeywordInput: '',
        sellerItemCode: 'SIC-' + secureRandomInt(100000, 1000000)
      });
      setIsAddModalOpen(false);
    } catch {
      // Error handled by toast in addProduct or above
    }
  };

  const handleSaveFullProductEdit = async (e?: React.FormEvent, isPublic?: boolean) => {
    if (e) e.preventDefault();
    if (!fullEditProduct) return;

    // Duplicate Product Number & Seller Item Code validation
    if (fullEditProduct.sellerItemCode) {
      const targetSellerId = fullEditProduct.sellerId;
      const targetSellerName = fullEditProduct.artisan || fullEditProduct.seller;
      const dupCode = checkDuplicateProductNumber(fullEditProduct.sellerItemCode, fullEditProduct.id, products, targetSellerId, targetSellerName);
      if (dupCode.isDuplicate) {
        showToast(`Duplicate seller item code: "${fullEditProduct.sellerItemCode}" is already in use by "${dupCode.conflictingProduct?.name}" for seller "${targetSellerName || 'this seller'}". Duplicate seller item codes from the same seller are not allowed.`, 'error');
        return;
      }
    }

    // Duplicate Description validation removed to allow flexible product descriptions

    const keywordsArray = (fullEditProduct as any).keywordsInput !== undefined
      ? (fullEditProduct as any).keywordsInput.split(',').map((s: string) => s.trim()).filter(Boolean)
      : (fullEditProduct.keywords || []);

    const arabicKeywordsArray = (fullEditProduct as any).arabicKeywordsInput !== undefined
      ? (fullEditProduct as any).arabicKeywordsInput.split(',').map((s: string) => s.trim()).filter(Boolean)
      : (fullEditProduct.arabicKeywords || []);

    const targetPublish = isPublic !== undefined ? isPublic : (fullEditProduct.isPublished !== false);

    const stockValue = Number(fullEditProduct.stock);
    if (!Number.isFinite(stockValue) || stockValue < 0 || !Number.isInteger(stockValue)) {
      showToast('Stock quantity must be a whole number of units (0 or more).', 'warning');
      return;
    }

    const priceValue = Number(fullEditProduct.priceUSD);
    if (!Number.isFinite(priceValue) || priceValue <= 0) {
      showToast('Price must be greater than 0.', 'warning');
      return;
    }

    const matchedSeller = sellers.find(s => 
      (fullEditProduct.seller && s.nameEn.toLowerCase() === fullEditProduct.seller.toLowerCase()) ||
      (fullEditProduct.artisan && s.nameEn.toLowerCase() === fullEditProduct.artisan.toLowerCase()) ||
      s.id === fullEditProduct.sellerId
    );

    try {
      await updateProduct(fullEditProduct.id, {
        name: fullEditProduct.name,
        arabicName: fullEditProduct.arabicName,
        category: fullEditProduct.category,
        artisan: fullEditProduct.seller || 'Independent Artisan',
        seller: fullEditProduct.seller || 'Independent Artisan',
        sellerId: matchedSeller?.id || fullEditProduct.sellerId || undefined,
        arabicSeller: fullEditProduct.arabicSeller || (matchedSeller?.nameAr || ''),
        origin: matchedSeller?.region || fullEditProduct.origin || 'Lebanon',
        priceUSD: priceValue,
        originalPriceUSD: fullEditProduct.originalPriceUSD ? Number(fullEditProduct.originalPriceUSD) : undefined,
        discountPercentage: fullEditProduct.discountPercentage !== undefined && fullEditProduct.discountPercentage !== null && String(fullEditProduct.discountPercentage) !== ''
          ? Number(fullEditProduct.discountPercentage)
          : (fullEditProduct.originalPriceUSD && Number(fullEditProduct.originalPriceUSD) > Number(fullEditProduct.priceUSD)
              ? Math.round(((Number(fullEditProduct.originalPriceUSD) - Number(fullEditProduct.priceUSD)) / Number(fullEditProduct.originalPriceUSD)) * 100)
              : undefined),
        stock: stockValue,
        lowStockThreshold: fullEditProduct.lowStockThreshold !== undefined ? Number(fullEditProduct.lowStockThreshold) : 5,
        lowStockNotice: fullEditProduct.lowStockNotice !== undefined ? fullEditProduct.lowStockNotice.trim() : undefined,
        weightOrVolume: fullEditProduct.weightOrVolume !== undefined ? fullEditProduct.weightOrVolume.trim() : '',
        image: fullEditProduct.image,
        additionalImages: (fullEditProduct.additionalImages || []).filter(Boolean),
        videoUrl: fullEditProduct.videoUrl?.trim() || undefined,
        videos: (fullEditProduct.videos || []).filter(Boolean).length > 0
          ? (fullEditProduct.videos || []).filter(Boolean)
          : (fullEditProduct.videoUrl?.trim() ? [fullEditProduct.videoUrl.trim()] : undefined),
        description: fullEditProduct.description,
        craftStory: fullEditProduct.craftStory,
        isPublished: targetPublish,
        isFeatured: !!fullEditProduct.isFeatured,
        isBestseller: !!fullEditProduct.isBestseller,
        tags: Array.isArray(fullEditProduct.tags) && fullEditProduct.tags.length > 0
          ? fullEditProduct.tags
          : ['Authentic', 'Handmade', 'Lebanon'],
        keywords: keywordsArray,
        arabicKeywords: arabicKeywordsArray,
        seoTitle: fullEditProduct.seoTitle || `${fullEditProduct.name} | Lebanese Artisan`,
        seoArabicTitle: fullEditProduct.seoArabicTitle || `${fullEditProduct.arabicName || fullEditProduct.name} | مونة وحرف لبنانية`,
        seoDescription: fullEditProduct.seoDescription || fullEditProduct.description,
        sellerItemCode: fullEditProduct.sellerItemCode
      });

      showToast(
        targetPublish 
          ? `Product "${fullEditProduct.name}" updated & published to Public Store!` 
          : `Product "${fullEditProduct.name}" updated & saved as Draft.`,
        'success'
      );
      setFullEditProduct(null);
    } catch {
      // Error handled by toast in updateProduct or above
    }
  };


  const handleMassDelete = async () => {
    const idsToDelete = filteredCatalogProducts.map(p => p.id).filter(id => selectedProductIds.has(id));
    if (idsToDelete.length === 0) return;
    const confirmed = window.confirm(`Are you sure you want to delete ${idsToDelete.length} selected products? This cannot be undone.`);
    if (!confirmed) return;

    await deleteMultipleProducts(idsToDelete);
    const next = new Set(selectedProductIds);
    idsToDelete.forEach(id => next.delete(id));
    setSelectedProductIds(next);
  };

  const handleBulkPublish = async (targetState: boolean) => {
    const idsToUpdate = filteredCatalogProducts.map(p => p.id).filter(id => selectedProductIds.has(id));
    if (idsToUpdate.length === 0) return;

    const actionLabel = targetState ? 'unhide (publish)' : 'hide';
    const confirmed = window.confirm(`Are you sure you want to ${actionLabel} ${idsToUpdate.length} selected product(s)?`);
    if (!confirmed) return;

    // allSettled, not all: one rejection must not hide the outcome of the rest.
    const results = await Promise.allSettled(
      idsToUpdate.map(id => updateProduct(id, { isPublished: targetState }))
    );
    const failed = results.filter(r => r.status === 'rejected').length;
    const succeeded = results.length - failed;

    if (failed === 0) {
      showToast(`${succeeded} product(s) are now ${targetState ? 'Published' : 'Hidden'}`, 'success');
    } else {
      showToast(`${succeeded} of ${results.length} product(s) updated. ${failed} failed — reload to see the stored state.`, 'error');
    }
  };

  const toggleSelectAll = () => {
    const next = new Set(selectedProductIds);
    if (isAllFilteredSelected) {
      filteredCatalogProducts.forEach(p => next.delete(p.id));
    } else {
      filteredCatalogProducts.forEach(p => next.add(p.id));
    }
    setSelectedProductIds(next);
  };

  const handleDownloadOrdersReport = () => {
    downloadOrdersReport(orders);
    showToast('Orders report downloaded successfully', 'success');
  };

  const handleDownloadFullMasterReport = () => {
    downloadFullMasterReport(products, sellers, orders);
    showToast('Full Master Report downloaded successfully (Products, Sellers, Stock & Sales)', 'success');
  };

  const handleDownloadSellerSalesReport = () => {
    downloadSellerPerformanceReport(products, sellers, orders);
    showToast('Seller & Artisan Sales Performance Report downloaded successfully', 'success');
  };

  const handleDownloadStockInventoryReport = () => {
    downloadStockInventoryReport(products, sellers, orders);
    showToast('Stock & Replenishment Inventory Report downloaded successfully', 'success');
  };

  const formatProductForCSV = (p: Product) => {
    const matchedSeller = sellers.find(s => s.id === p.sellerId || (s.nameEn && s.nameEn.toLowerCase() === (p.seller || p.artisan || '').toLowerCase()));
    const effectiveSellerId = p.sellerId || matchedSeller?.id || sellers[0]?.id || 'terroir-du-liban';

    return {
      sku: p.id,
      name_en: p.name,
      name_ar: p.arabicName || '',
      seller_id: effectiveSellerId,
      seller_item_code: p.sellerItemCode || '',
      category: p.category,
      price_usd: p.priceUSD,
      original_price_usd: p.originalPriceUSD || '',
      stock: p.stock,
      image_url: p.image || '',
      additional_images: (p.additionalImages || []).join('|'),
      video_url: p.videoUrl || '',
      additional_videos: (p.videos || []).join('|'),
      description_en: p.description || '',
      description_ar: p.craftStory || '',
      tags: (p.tags || []).join('|'),
      is_published: p.isPublished === false ? 'false' : 'true',
      origin_terroir: p.origin || '',
      weight_or_volume: p.weightOrVolume || ''
    };
  };

  const handleDownloadProductsReport = () => {
    import('papaparse').then((Papa) => {
      const dataToExport = filteredCatalogProducts.map(formatProductForCSV);

      const csv = Papa.unparse(dataToExport.map(sanitizeRowForCsv));
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `yalla_products_report_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast('Products catalog report downloaded successfully', 'success');
    });
  };

  const handleDownloadSelectedProductsForUpdate = () => {
    if (selectedProductIds.size === 0) {
      showToast('Please select at least one product using checkboxes to download for bulk update.', 'error');
      return;
    }

    import('papaparse').then((Papa) => {
      const selectedProducts = products.filter(p => selectedProductIds.has(p.id));
      const dataToExport = selectedProducts.map(formatProductForCSV);

      const csv = Papa.unparse(dataToExport.map(sanitizeRowForCsv));
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `products_bulk_update_selected_${selectedProducts.length}_items.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast(`Downloaded CSV for ${selectedProducts.length} selected items for bulk update. Edit fields and re-upload in Bulk Upload CSV modal.`, 'success');
    });
  };

  const handleDownloadHeadersOnlyTemplate = () => {
    const headers = [
      'sku',
      'name_en',
      'name_ar',
      'seller_id',
      'seller_item_code',
      'category',
      'price_usd',
      'original_price_usd',
      'stock',
      'image_url',
      'additional_images',
      'video_url',
      'additional_videos',
      'description_en',
      'description_ar',
      'tags',
      'is_published',
      'origin_terroir',
      'weight_or_volume'
    ];
    const csvContent = headers.join(',');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `yalla_bulk_upload_template_headers_only.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Headers-only CSV template downloaded successfully', 'success');
  };

  const recomputeBulkPreview = (rows: any[], targetSellerId: string, fallbackCategoryId: string) => {
    const parsedPreview: any[] = [];

    rows.forEach((row, idx) => {
      if (isCsvRowEmpty(row)) return;
      const rowNum = idx + 2;
      const name = (row.name_en || row.name || row.title || '').toString().trim();
      const resolvedSeller = resolveSeller(row, sellers, targetSellerId);
      const resolvedCategory = resolveCategory(row, categories, fallbackCategoryId);
      const priceUSD = parsePrice(row.price_usd || row.price || row.unit_price);
      const stock = parseStock(row.stock !== undefined ? row.stock : row.qty);

      const rowIssues: string[] = [];
      if (!name) rowIssues.push('name_en is required');
      if (!resolvedSeller) {
        const rawSeller = row.seller_id || row.seller || row.seller_artisan || 'empty';
        rowIssues.push(`seller "${rawSeller}" unknown (Select a Target Seller above)`);
      }
      if (!resolvedCategory) {
        const rawCat = row.category || row.category_id || 'empty';
        rowIssues.push(`category "${rawCat}" unknown`);
      }
      if (priceUSD <= 0) rowIssues.push('price_usd must be > 0');
      if (isNaN(stock) || stock < 0) rowIssues.push('stock must be >= 0');

      const sku = (row.sku || row.product_id || '').toString().trim();
      const isUpdate = sku ? products.some(p => p.id === sku) : false;

      parsedPreview.push({
        rowNum,
        sku: sku || '(auto-generated)',
        name: name || 'Unnamed',
        sellerName: resolvedSeller?.sellerName || 'Unassigned',
        categoryName: resolvedCategory?.categoryName || 'Unassigned',
        action: isUpdate ? 'Update' : 'Create',
        issues: rowIssues
      });
    });

    setBulkImportPreviewRows(parsedPreview);
  };

  const handleBulkUploadFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBulkImportFile(file);
    setBulkImportResult(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      import('papaparse').then((Papa) => {
        Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
          transformHeader: (h) => h.trim().toLowerCase(),
          complete: (results) => {
            const rows = (results.data as any[]).filter(r => !isCsvRowEmpty(r));
            setBulkImportRawRows(rows);
            recomputeBulkPreview(rows, bulkImportTargetSellerId, bulkImportFallbackCategoryId);
          }
        });
      });
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handleTargetSellerChange = (newSellerId: string) => {
    setBulkImportTargetSellerId(newSellerId);
    if (bulkImportRawRows.length > 0) {
      recomputeBulkPreview(bulkImportRawRows, newSellerId, bulkImportFallbackCategoryId);
    }
  };

  const handleFallbackCategoryChange = (newCatId: string) => {
    setBulkImportFallbackCategoryId(newCatId);
    if (bulkImportRawRows.length > 0) {
      recomputeBulkPreview(bulkImportRawRows, bulkImportTargetSellerId, newCatId);
    }
  };

  const handleCommitBulkUpload = async () => {
    if (!bulkImportFile) return;
    setIsBulkImporting(true);
    setBulkImportResult(null);

    try {
      const reader = new FileReader();
      reader.onerror = () => {
        setBulkImportResult({ created: 0, updated: 0, errors: ['Could not read the selected file.'] });
        setIsBulkImporting(false);
        showToast('Could not read the selected file', 'error');
      };
      reader.onload = async (event) => {
        // This callback runs after the outer try/catch has already returned, so it
        // needs its own guard.
        try {
          const text = event.target?.result as string;
          if (!text) {
            setIsBulkImporting(false);
            return;
          }

          const res = await bulkImportProducts(text, {
            targetSellerId: bulkImportTargetSellerId,
            fallbackCategoryId: bulkImportFallbackCategoryId
          });
          setBulkImportResult(res);
          if (res.created > 0 || res.updated > 0) {
            showToast(`Successfully uploaded: ${res.created} created and ${res.updated} updated!`, 'success');
          } else if (res.errors.length > 0) {
            showToast(`Upload encountered errors: ${res.errors[0]}`, 'warning');
          }
        } catch (err: any) {
          showToast(`Import failed: ${err?.message || 'the catalog could not be written.'}`, 'error');
        } finally {
          setIsBulkImporting(false);
        }
      };
      reader.readAsText(bulkImportFile, 'UTF-8');
    } catch (err: any) {
      console.error(err);
      setBulkImportResult({ created: 0, updated: 0, errors: [err?.message || 'Upload failed'] });
      setIsBulkImporting(false);
      showToast('Error committing product catalog', 'warning');
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] flex text-slate-900 font-sans antialiased">
      
      {/* Exact PlainAdmin Sidebar */}
      <AdminSidebar
        currentTab={currentTab}
        onSelectTab={navigateAdminTab}
        ordersCount={orders.length}
        productsCount={products.length}
        categoriesCount={categoriesCount}
        customersCount={customersCount}
        activeCartsCount={activeCartsCount}
        isOpenMobile={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        
        {/* Top Navbar */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-3.5 sm:px-6 py-3 sm:py-3.5 flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsMobileSidebarOpen(true)}
              className="lg:hidden p-1.5 sm:p-2 rounded-xl text-slate-600 hover:bg-slate-100 cursor-pointer shrink-0"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 capitalize flex items-center gap-1.5 sm:gap-2 truncate">
                <span className="truncate">{currentTab.replace('_', ' ')}</span>
                <span className="hidden md:inline text-slate-300 font-light">/</span>
                <span className="hidden md:inline text-xs font-normal text-slate-500 truncate">Yalla.lb Admin</span>
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            {/* FULL MASTER EXPORT BUTTON & DROPDOWN */}
            <div className="relative" ref={exportMenuRef}>
              <button
                id="admin-master-export-btn"
                onClick={() => setIsMasterExportMenuOpen(!isMasterExportMenuOpen)}
                className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition-all cursor-pointer border border-indigo-200/80 shadow-2xs active:scale-95"
                title="Download Master Business & Store Reports (CSV)"
              >
                <Download className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span className="hidden sm:inline">Export</span>
                <ChevronDown className="w-3 h-3 text-indigo-500 shrink-0" />
              </button>

              {isMasterExportMenuOpen && (
                <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl border border-slate-200 shadow-xl py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="px-3.5 py-2 border-b border-slate-100">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Download Data Reports</span>
                    <p className="text-xs text-slate-600 font-semibold mt-0.5">Live store telemetry & CSV datasets</p>
                  </div>

                  <div className="py-1">
                    <button
                      onClick={(e) => { e.stopPropagation();
                        handleDownloadFullMasterReport();
                        setIsMasterExportMenuOpen(false);
                      }}
                      className="w-full px-3.5 py-2.5 text-left hover:bg-indigo-50/80 flex items-start gap-2.5 transition-colors cursor-pointer group"
                    >
                      <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-900 group-hover:text-indigo-700 flex items-center gap-1.5">
                          <span>Full Master Report</span>
                          <span className="px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-800 text-[9px] font-black">ALL DETAILS</span>
                        </div>
                        <p className="text-[10px] text-slate-500 leading-tight mt-0.5">Products, sellers, stock valuation, and sales metrics per SKU</p>
                      </div>
                    </button>

                    <button
                      onClick={(e) => { e.stopPropagation();
                        handleDownloadSellerSalesReport();
                        setIsMasterExportMenuOpen(false);
                      }}
                      className="w-full px-3.5 py-2.5 text-left hover:bg-slate-50 flex items-start gap-2.5 transition-colors cursor-pointer group"
                    >
                      <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                        <Store className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-900 group-hover:text-emerald-700">Sellers & Sales Performance</div>
                        <p className="text-[10px] text-slate-500 leading-tight mt-0.5">Artisan gross sales ($), stock units, and estimated payouts</p>
                      </div>
                    </button>

                    <button
                      onClick={(e) => { e.stopPropagation();
                        handleDownloadStockInventoryReport();
                        setIsMasterExportMenuOpen(false);
                      }}
                      className="w-full px-3.5 py-2.5 text-left hover:bg-slate-50 flex items-start gap-2.5 transition-colors cursor-pointer group"
                    >
                      <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                        <Package className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-900 group-hover:text-amber-700">Stock & Replenishment Alert</div>
                        <p className="text-[10px] text-slate-500 leading-tight mt-0.5">Low inventory alerts, valuation, and supplier reorder contacts</p>
                      </div>
                    </button>

                    <button
                      onClick={(e) => { e.stopPropagation();
                        handleDownloadOrdersReport();
                        setIsMasterExportMenuOpen(false);
                      }}
                      className="w-full px-3.5 py-2.5 text-left hover:bg-slate-50 flex items-start gap-2.5 transition-colors cursor-pointer group"
                    >
                      <div className="w-7 h-7 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-sky-600 group-hover:text-white transition-colors">
                        <Truck className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-900 group-hover:text-sky-700">Orders & Courier Dispatch</div>
                        <p className="text-[10px] text-slate-500 leading-tight mt-0.5">Lebanese delivery addresses, phones, and order line items</p>
                      </div>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* SAVE BUTTON (Admin Snapshot & Drafts) */}
            <button
              id="admin-global-save-btn"
              onClick={handleGlobalSaveDraft}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-all cursor-pointer border border-slate-300/80 shadow-2xs active:scale-95"
              title="Save administrative drafts & snapshot"
            >
              <Save className="w-3.5 h-3.5 text-slate-600" />
              <span className="hidden sm:inline">Save</span>
            </button>

            {/* PUBLIC BUTTON (Publish Live Storefront) */}
            <button
              id="admin-global-public-btn"
              onClick={handleGlobalPublishLive}
              disabled={isSyncingDb}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-teal-800 text-white text-xs font-black tracking-wide transition-all cursor-pointer shadow-xs active:scale-95 disabled:opacity-50"
              title="Publish and make all store updates Public live"
            >
              <Globe className={`w-3.5 h-3.5 text-white ${isSyncingDb ? 'animate-spin' : 'animate-pulse'}`} />
              <span>Public</span>
              <span className="w-1.5 h-1.5 rounded-full bg-white ml-0.5"></span>
            </button>

            <button
              onClick={() => navigateAdminTab('db_logs')}
              className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-[#4f46e5] text-xs font-bold transition-all cursor-pointer border border-indigo-100 shadow-2xs"
              title="Inspect Live Firestore Database Flow & Latency"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="hidden lg:inline">Database Flow:</span>
              <span className="font-semibold text-emerald-700">Firestore Live</span>
            </button>

            <button
              onClick={goBack}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Storefront</span>
            </button>

            <div className="w-8 h-8 rounded-full bg-indigo-100 text-[#4f46e5] font-black text-xs flex items-center justify-center border border-indigo-200">
              JA
            </div>
          </div>
        </header>

        {/* Tab Views */}
        <main className="flex-1 p-3.5 sm:p-6 lg:p-8 max-w-[1600px] w-full mx-auto space-y-6">
          
          {/* 1. eCommerce */}
          {currentTab === 'ecommerce' && (
            <EcommerceOverview onNavigateToTab={setCurrentTab} />
          )}

          {/* Sales Analytics */}
          {currentTab === 'sales' && (
            <SalesAnalyticsView />
          )}

          {/* 2. Orders */}
          {currentTab === 'orders' && (
            <OrdersRoute />
          )}

          {/* 3. Products Catalog */}
          {currentTab === 'products' && (
            <div className="space-y-6">
              
              {/* Header */}
              <div className="bg-white p-6 sm:p-7 rounded-3xl border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-indigo-50 border border-indigo-100/60 flex items-center justify-center text-indigo-600">
                      <Package className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                        Products & Catalog Management
                      </h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Publish, hide, inline edit stock & price, or add new artisanal products with cloud sync.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    onClick={handleDownloadFullMasterReport}
                    className="flex items-center gap-1.5 px-3.5 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold transition-all border border-indigo-200/80 shadow-2xs cursor-pointer active:scale-95"
                    title="Download Full Master CSV with Products, Sellers, Stock & Sales performance"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Download Full Master Report</span>
                  </button>

                  <button
                    onClick={handleDownloadProductsReport}
                    className="flex items-center gap-1.5 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all border border-slate-200 shadow-2xs cursor-pointer active:scale-95"
                    title="Download Products Catalog CSV Report"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-600" />
                    <span>Catalog CSV</span>
                  </button>

                  {selectedProductIds.size > 0 && (
                    <button
                      onClick={handleDownloadSelectedProductsForUpdate}
                      className="flex items-center gap-1.5 px-3.5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95 animate-pulse"
                      title="Download CSV containing selected products to edit and bulk update"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-white" />
                      <span>Download Selected CSV ({selectedProductIds.size})</span>
                    </button>
                  )}

                  <button
                    onClick={(e) => { e.stopPropagation();
                      setBulkImportFile(null);
                      setBulkImportPreviewRows([]);
                      setBulkImportResult(null);
                      setIsBulkUploadModalOpen(true);
                    }}
                    className="flex items-center gap-1.5 px-3.5 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl text-xs font-bold transition-all border border-emerald-200 shadow-2xs cursor-pointer active:scale-95"
                    title="Mass upload new products or update existing ones via CSV file"
                  >
                    <UploadCloud className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Bulk Upload CSV</span>
                  </button>

                  <button
                    onClick={handleGlobalSaveDraft}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-all border border-slate-300/80 shadow-2xs cursor-pointer active:scale-95"
                    title="Save current catalog state"
                  >
                    <Save className="w-3.5 h-3.5 text-slate-600" />
                    <span>Save Drafts</span>
                  </button>

                  <button
                    onClick={handleGlobalPublishLive}
                    disabled={isSyncingDb}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm hover:shadow-md cursor-pointer disabled:opacity-50 active:scale-95"
                    title="Publish all active products to the public storefront"
                  >
                    <Globe className={`w-3.5 h-3.5 ${isSyncingDb ? 'animate-spin' : ''}`} />
                    <span>{isSyncingDb ? 'Publishing...' : 'Public (Publish Live)'}</span>
                  </button>

                  <button
                    onClick={() => setIsAddModalOpen(true)}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-sm hover:shadow-md cursor-pointer active:scale-95"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Product</span>
                  </button>
                </div>
              </div>

              {/* Filters */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="relative flex-1 min-w-[260px]">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search by title, seller / artisan, origin, category, keywords..."
                      value={adminProductSearch}
                      onChange={(e) => setAdminProductSearch(e.target.value)}
                      className="w-full pl-10 pr-9 py-2.5 bg-white text-xs text-slate-900 placeholder-slate-400 rounded-2xl border border-slate-200 focus:outline-none focus:border-indigo-500 shadow-2xs transition-all"
                    />
                    {adminProductSearch && (
                      <button
                        type="button"
                        onClick={() => setAdminProductSearch('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
                        title="Clear search"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    {/* Seller / Artisan Filter */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-slate-500 font-bold flex items-center gap-1">
                        <Store className="w-3.5 h-3.5 text-indigo-500" />
                        <span>Seller:</span>
                      </span>
                      <select
                        value={adminProductSeller}
                        onChange={(e) => setAdminProductSeller(e.target.value)}
                        className="bg-white text-xs font-semibold text-slate-900 border border-slate-200 rounded-2xl px-3.5 py-2.5 focus:outline-none focus:border-indigo-500 shadow-2xs cursor-pointer max-w-[240px]"
                      >
                        <option value="all">All Sellers ({sellerStats.length} sellers)</option>
                        {sellerStats.map(({ id, seller, arabicName, count }) => (
                          <option key={id || seller} value={seller}>
                            {seller} {arabicName ? `(${arabicName})` : ''} ({count})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Status Filter */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-slate-500 font-bold">Status:</span>
                      <select
                        value={adminPublishFilter}
                        onChange={(e) => setAdminPublishFilter(e.target.value as any)}
                        className="bg-white text-xs font-semibold text-slate-900 border border-slate-200 rounded-2xl px-3.5 py-2.5 focus:outline-none focus:border-indigo-500 shadow-2xs cursor-pointer"
                      >
                        <option value="all">All ({products.length})</option>
                        <option value="published">Published ({products.filter(p => p.isPublished !== false).length})</option>
                        <option value="hidden">Hidden / Draft ({products.filter(p => p.isPublished === false).length})</option>
                      </select>
                    </div>

                    {/* Category Filter */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-slate-500 font-bold">Category:</span>
                      <select
                        value={adminProductCategory}
                        onChange={(e) => setAdminProductCategory(e.target.value)}
                        className="bg-white text-xs font-semibold text-slate-900 border border-slate-200 rounded-2xl px-3.5 py-2.5 focus:outline-none focus:border-indigo-500 shadow-2xs cursor-pointer"
                      >
                        <option value="all">All Categories</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nameEn} ({c.nameAr})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Active Filters Bar */}
                {(adminProductSearch || adminProductSeller !== 'all' || adminProductCategory !== 'all' || adminPublishFilter !== 'all') && (
                  <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 px-3.5 bg-indigo-50/50 border border-indigo-100 rounded-2xl text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-bold text-slate-600">
                        Active Filters ({filteredCatalogProducts.length} of {products.length} products):
                      </span>

                      {adminProductSeller !== 'all' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-white border border-indigo-200 text-indigo-700 font-bold text-[11px] shadow-2xs">
                          <Store className="w-3 h-3 text-indigo-500" />
                          <span>Seller: {adminProductSeller}</span>
                          <button
                            type="button"
                            onClick={() => setAdminProductSeller('all')}
                            className="hover:text-indigo-900 p-0.5 cursor-pointer"
                            title="Remove seller filter"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      )}

                      {adminProductCategory !== 'all' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-white border border-indigo-200 text-indigo-700 font-bold text-[11px] shadow-2xs">
                          <span>Category: {adminProductCategory}</span>
                          <button
                            type="button"
                            onClick={() => setAdminProductCategory('all')}
                            className="hover:text-indigo-900 p-0.5 cursor-pointer"
                            title="Remove category filter"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      )}

                      {adminPublishFilter !== 'all' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-white border border-indigo-200 text-indigo-700 font-bold text-[11px] shadow-2xs">
                          <span>Status: {adminPublishFilter}</span>
                          <button
                            type="button"
                            onClick={() => setAdminPublishFilter('all')}
                            className="hover:text-indigo-900 p-0.5 cursor-pointer"
                            title="Remove status filter"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      )}

                      {adminProductSearch && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-white border border-indigo-200 text-indigo-700 font-bold text-[11px] shadow-2xs">
                          <span>Search: "{adminProductSearch}"</span>
                          <button
                            type="button"
                            onClick={() => setAdminProductSearch('')}
                            className="hover:text-indigo-900 p-0.5 cursor-pointer"
                            title="Clear search query"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation();
                        setAdminProductSearch('');
                        setAdminProductSeller('all');
                        setAdminProductCategory('all');
                        setAdminPublishFilter('all');
                      }}
                      className="text-[11px] font-black text-indigo-600 hover:text-indigo-800 underline underline-offset-2 cursor-pointer"
                    >
                      Reset All Filters
                    </button>
                  </div>
                )}
              </div>

              {/* Selection Toolbar */}
              {filteredCatalogProducts.length > 0 && (
                <div className="flex items-center justify-between bg-white border border-slate-200 rounded-2xl p-3 shadow-xs">
                  <div className="flex items-center gap-3">
                    <input 
                      type="checkbox"
                      checked={isAllFilteredSelected}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 text-indigo-600 rounded-md border-slate-300 focus:ring-indigo-500 cursor-pointer"
                    />
                    <span className="text-sm font-bold text-slate-700">
                      {selectedInFilteredCount === 0 
                        ? `Select All (${filteredCatalogProducts.length})` 
                        : `${selectedInFilteredCount} of ${filteredCatalogProducts.length} Selected`}
                    </span>
                  </div>
                  
                  {selectedInFilteredCount > 0 && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={handleDownloadSelectedProductsForUpdate}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-[11px] transition-colors cursor-pointer shadow-xs active:scale-95"
                        title="Download CSV containing selected products to edit and bulk update"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5 text-white" />
                        <span>Download Selected CSV for Update ({selectedInFilteredCount})</span>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setBulkImportFile(null);
                          setBulkImportPreviewRows([]);
                          setBulkImportResult(null);
                          setIsBulkUploadModalOpen(true);
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-[11px] transition-colors cursor-pointer shadow-xs active:scale-95"
                        title="Upload CSV file to apply updates or create new products"
                      >
                        <UploadCloud className="w-3.5 h-3.5 text-white" />
                        <span>Upload & Apply CSV</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setSelectedProductIds(new Set())}
                        className="px-2.5 py-1 text-slate-500 hover:text-slate-800 text-xs font-semibold cursor-pointer"
                      >
                        Clear Selection
                      </button>

                      <button
                        type="button"
                        onClick={() => handleBulkPublish(false)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200/80 rounded-xl font-bold text-[11px] transition-colors cursor-pointer"
                        title="Hide selected products from storefront catalog"
                      >
                        <EyeOff className="w-3.5 h-3.5" />
                        Bulk Hide ({selectedInFilteredCount})
                      </button>

                      <button
                        type="button"
                        onClick={() => handleBulkPublish(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200/80 rounded-xl font-bold text-[11px] transition-colors cursor-pointer"
                        title="Publish / Unhide selected products on storefront catalog"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Bulk Unhide ({selectedInFilteredCount})
                      </button>

                      <button
                        type="button"
                        onClick={handleMassDelete}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200/80 rounded-xl font-bold text-[11px] transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Mass Delete ({selectedInFilteredCount})
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Product Sequence & Ordering Controls Toolbar */}
              <div className="bg-white border border-slate-200/80 rounded-3xl p-4 sm:p-5 shadow-xs space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                      <ListOrdered className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-black text-slate-900 tracking-tight">
                          Product Display Sequence & Ranking
                        </h3>
                        {hasProductOrderChanges && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300 animate-pulse">
                            ● Unsaved Changes
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">
                        Easily jump any product to #1, move positions, or sort with presets to control the exact storefront order.
                      </p>
                    </div>
                  </div>

                  {/* View Mode Switcher + Save Sequence Button */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* View Switcher */}
                    <div className="flex items-center p-1 bg-slate-100 rounded-2xl border border-slate-200">
                      <button
                        type="button"
                        onClick={() => setProductViewMode('grid')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          productViewMode === 'grid'
                            ? 'bg-white text-indigo-700 shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <LayoutGrid className="w-3.5 h-3.5" />
                        <span>Grid Cards</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setProductViewMode('order')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          productViewMode === 'order'
                            ? 'bg-white text-indigo-700 shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <ListOrdered className="w-3.5 h-3.5" />
                        <span>Organize Sequence</span>
                      </button>
                    </div>

                    {/* Reset Order Button if changes made */}
                    {hasProductOrderChanges && (
                      <button
                        type="button"
                        onClick={handleResetProductOrder}
                        className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer border border-slate-200"
                        title="Revert sequence back to currently saved database order"
                      >
                        Reset
                      </button>
                    )}

                    {/* Save Sequence Button */}
                    <button
                      type="button"
                      onClick={handleSaveProductSequence}
                      disabled={!hasProductOrderChanges || isSavingProductOrder}
                      className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        hasProductOrderChanges
                          ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-md hover:shadow-lg animate-pulse active:scale-95'
                          : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                      }`}
                    >
                      <Save className={`w-3.5 h-3.5 ${isSavingProductOrder ? 'animate-spin' : ''}`} />
                      <span>{isSavingProductOrder ? 'Saving Order...' : 'Save Products Order'}</span>
                    </button>
                  </div>
                </div>

              </div>

              {/* View Switch: Organize Sequence Table View OR Product Cards Grid */}
              {productViewMode === 'order' ? (
                <ProductsSequenceTableView
                  products={filteredCatalogProducts}
                  allProductsCount={orderedCatalogList.length || products.length}
                  selectedProductIds={selectedProductIds}
                  onToggleSelect={(id) => {
                    const next = new Set(selectedProductIds);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    setSelectedProductIds(next);
                  }}
                  onMoveProduct={handleMoveProductInCatalog}
                  onSetProductRank={handleSetProductRankInCatalog}
                  lastMovedProductId={lastMovedProductId}
                  onTogglePublish={toggleProductPublish}
                  onEditProduct={(p) => setFullEditProduct({ ...p, keywordsInput: p.keywords ? p.keywords.join(', ') : '' } as any)}
                  onQuickPriceStock={(p) => {
                    setEditingProductId(p.id);
                    setEditPriceUSD(p.priceUSD);
                    setEditStock(p.stock);
                    setProductViewMode('grid');
                  }}
                  onDeleteProduct={async (p) => {
                    if (confirm(`Delete "${p.name}"?`)) {
                      await deleteProduct(p.id);
                    }
                  }}
                  formatPrice={formatPrice}
                />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
                  {filteredCatalogProducts.map((prod, index) => {
                    const isPublished = prod.isPublished !== false;
                    const isEditing = editingProductId === prod.id;
                    const sellerName = prod.artisan || prod.seller || 'Artisanal Guild';
                    const currentRank = prod.displayOrder ?? (index + 1);

                    return (
                      <div 
                        key={prod.id} 
                        className={`bg-white p-4 rounded-3xl border shadow-xs space-y-3 flex flex-col justify-between transition-all hover:shadow-md relative cursor-pointer ${
                          isPublished ? 'border-slate-200/80' : 'border-rose-200 bg-rose-50/15'
                        } ${selectedProductIds.has(prod.id) ? 'ring-2 ring-indigo-500 bg-indigo-50/10' : ''}`}
                        onClick={(e) => {
                          if ((e.target as HTMLElement).tagName !== 'BUTTON' && (e.target as HTMLElement).tagName !== 'INPUT' && (e.target as HTMLElement).tagName !== 'A' && (e.target as HTMLElement).tagName !== 'TEXTAREA' && (e.target as HTMLElement).tagName !== 'SELECT') {
                            const next = new Set(selectedProductIds);
                            if (next.has(prod.id)) next.delete(prod.id);
                            else next.add(prod.id);
                            setSelectedProductIds(next);
                          }
                        }}
                      >
                        <div className="space-y-3">
                          {/* Top row: Checkbox and On-Card Product Order Rank Widget */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="pt-1">
                              <input
                                type="checkbox"
                                checked={selectedProductIds.has(prod.id)}
                                onChange={(e) => {
                                  const next = new Set(selectedProductIds);
                                  if (e.target.checked) next.add(prod.id);
                                  else next.delete(prod.id);
                                  setSelectedProductIds(next);
                                }}
                                className="w-5 h-5 text-indigo-600 bg-white/90 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer shadow-sm"
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <ProductOrderRankWidget
                                productId={prod.id}
                                productName={prod.name}
                                currentRank={currentRank}
                                totalProducts={orderedCatalogList.length || products.length}
                                onMove={handleMoveProductInCatalog}
                                onSetRank={handleSetProductRankInCatalog}
                                compact={true}
                                isRecentlyMoved={lastMovedProductId === prod.id}
                              />
                            </div>
                          </div>

                          <div className="aspect-4/3 rounded-2xl overflow-hidden bg-slate-50 border border-slate-200 relative group flex items-center justify-center p-2">
                            <img 
                              src={prod.image} 
                              alt={prod.name} 
                              className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300" 
                            />

                            <span className="absolute top-2.5 right-2.5 px-3 py-1 rounded-full text-xs font-black bg-slate-900/90 text-white shadow-sm backdrop-blur-xs">
                              {formatPrice(prod.priceUSD)}
                            </span>

                            {!isPublished && (
                              <span className="absolute bottom-2.5 left-2.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-600 text-white shadow-sm">
                                Hidden
                              </span>
                            )}
                          </div>

                          <div className="space-y-1.5">
                            <h4 className="text-xs font-black text-slate-900 line-clamp-1">{prod.name}</h4>
                            {prod.arabicName && (
                              <p className="text-[11px] text-[#c5a059] font-serif font-bold line-clamp-1">{prod.arabicName}</p>
                            )}
                            
                            {/* Seller / Artisan clickable pill */}
                            <div className="flex items-center justify-between gap-1 pt-1">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setAdminProductSeller(sellerName);
                                }}
                                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[10.5px] font-bold bg-indigo-50/80 hover:bg-indigo-100 text-indigo-700 transition-all cursor-pointer border border-indigo-100/60 max-w-[150px] truncate group"
                                title={`Filter catalog by seller: ${sellerName}`}
                              >
                                <Store className="w-3 h-3 text-indigo-500 shrink-0 group-hover:scale-110 transition-transform" />
                                <span className="truncate">{sellerName}</span>
                              </button>
                              
                              <span className="text-[10px] text-slate-400 font-medium truncate max-w-[90px]" title={prod.origin}>
                                {prod.origin}
                              </span>
                            </div>

                            {/* Arabic SEO Keywords indicator */}
                            {prod.arabicKeywords && prod.arabicKeywords.length > 0 && (
                              <div className="flex flex-wrap gap-1 pt-1">
                                {prod.arabicKeywords.slice(0, 3).map((kw, ki) => (
                                  <span key={ki} className="px-1.5 py-0.5 bg-amber-50 text-amber-800 border border-amber-200/60 rounded text-[9.5px] font-serif font-semibold">
                                    #{kw}
                                  </span>
                                ))}
                                {prod.arabicKeywords.length > 3 && (
                                  <span className="text-[9px] text-amber-700 font-bold self-center">
                                    +{prod.arabicKeywords.length - 3}
                                  </span>
                                )}
                              </div>
                            )}

                            {/* System ID & Seller Code Info */}
                            <div className="flex justify-between items-center bg-slate-50 border border-slate-100 p-1.5 rounded-xl text-[9.5px] font-mono text-slate-500 mt-2">
                              <span title={`Unique System ID: ${prod.id}`}>ID: <span className="text-slate-700 font-bold">{prod.id}</span></span>
                              <span title={`Seller Item Code: ${prod.sellerItemCode}`}>Code: <span className="text-indigo-600 font-bold">{prod.sellerItemCode || 'N/A'}</span></span>
                            </div>
                          </div>
                        </div>

                        {/* Stock & Price Controls */}
                        {isEditing ? (
                          <div className="pt-3 border-t border-slate-100 space-y-2 text-xs">
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[10px] font-bold text-slate-500">Price ($)</label>
                                <input
                                  type="number"
                                  min={1}
                                  value={editPriceUSD}
                                  onChange={(e) => setEditPriceUSD(Number(e.target.value))}
                                  className="w-full px-2.5 py-1.5 bg-slate-50 rounded-xl border border-slate-200 font-bold"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] font-bold text-slate-500">Stock</label>
                                <input
                                  type="number"
                                  min={0}
                                  value={editStock}
                                  onChange={(e) => setEditStock(Number(e.target.value))}
                                  className="w-full px-2.5 py-1.5 bg-slate-50 rounded-xl border border-slate-200 font-bold"
                                />
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={async (e) => { e.stopPropagation();
                                  if (!Number.isFinite(editStock) || editStock < 0 || !Number.isInteger(editStock)) {
                                    showToast('Stock quantity must be a whole number of units (0 or more).', 'warning');
                                    return;
                                  }
                                  if (!Number.isFinite(editPriceUSD) || editPriceUSD <= 0) {
                                    showToast('Price must be greater than 0.', 'warning');
                                    return;
                                  }
                                  await updateProduct(prod.id, { priceUSD: editPriceUSD, stock: editStock });
                                  setEditingProductId(null);
                                }}
                                className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-[10px] uppercase cursor-pointer transition-colors"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingProductId(null)}
                                className="flex-1 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-[10px] uppercase cursor-pointer transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="pt-3 border-t border-slate-100 flex flex-col gap-1.5 text-xs">
                            <div className="flex items-center justify-between flex-wrap gap-1">
                              <span className="text-slate-500 text-[11px] font-medium flex items-center gap-1.5 flex-wrap">
                                Stock: <strong className={prod.stock === 0 ? "text-rose-600 font-black" : prod.stock <= (prod.lowStockThreshold ?? 5) ? "text-amber-700 font-black" : "text-slate-900 font-black"}>{prod.stock}</strong>
                                {prod.stock <= (prod.lowStockThreshold ?? 5) && (
                                  <span className="px-1.5 py-0.2 bg-amber-100 text-amber-900 border border-amber-300 rounded text-[9.5px] font-bold">
                                    ⚠️ {prod.lowStockNotice || (prod.stock === 1 ? 'Last piece' : 'Limited')}
                                  </span>
                                )}
                              </span>

                              {prod.weightOrVolume && (
                                <span
                                  className="text-[10px] text-slate-400 font-medium truncate max-w-[150px]"
                                  title={`Package size / volume: ${prod.weightOrVolume}`}
                                >
                                  Size: {prod.weightOrVolume}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={async (e) => { e.stopPropagation();
                                  await toggleProductPublish(prod.id);
                                }}
                                className={`p-2 rounded-xl transition-all cursor-pointer ${
                                  isPublished 
                                    ? 'text-slate-400 hover:text-amber-600 hover:bg-amber-50' 
                                    : 'text-amber-600 bg-amber-50 hover:bg-amber-100'
                                }`}
                                title={isPublished ? "Hide from catalog" : "Unhide / Publish to catalog"}
                              >
                                {isPublished ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                              </button>

                              <button
                                onClick={(e) => { e.stopPropagation(); setFullEditProduct({ ...prod, keywordsInput: prod.keywords ? prod.keywords.join(', ') : '' } as any); }}
                                className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all cursor-pointer"
                                title="Full Edit"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>

                              <button
                                onClick={(e) => { e.stopPropagation();
                                  setEditingProductId(prod.id);
                                  setEditPriceUSD(prod.priceUSD);
                                  setEditStock(prod.stock);
                                }}
                                className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all cursor-pointer"
                                title="Quick Price & Stock"
                              >
                                <DollarSign className="w-3.5 h-3.5" />
                              </button>

                              <button
                                onClick={async (e) => { e.stopPropagation();
                                  if (confirm(`Delete "${prod.name}"?`)) {
                                    await deleteProduct(prod.id);
                                  }
                                }}
                                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all cursor-pointer"
                                title="Delete"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        )}

                      </div>
                    );
                  })}
                </div>
              )}

              {/* Empty state when no products match filters */}
              {filteredCatalogProducts.length === 0 && (
                <div className="p-12 text-center bg-white rounded-3xl border border-slate-200 shadow-2xs space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
                    <Store className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-black text-slate-900">No products found</h4>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    No products match your current search criteria
                    {adminProductSeller !== 'all' ? ` for seller "${adminProductSeller}"` : ''}
                    {adminProductSearch ? ` with keyword "${adminProductSearch}"` : ''}.
                  </p>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation();
                      setAdminProductSearch('');
                      setAdminProductSeller('all');
                      setAdminProductCategory('all');
                      setAdminPublishFilter('all');
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Clear all filters</span>
                  </button>
                </div>
              )}

              {/* Shared Datalist for Sellers/Artisans */}
              <datalist id="admin-existing-sellers">
                {sellerStats.map(({ seller }) => (
                  <option key={seller} value={seller} />
                ))}
              </datalist>

            </div>
          )}

          {/* 4. Categories & Details */}
          {currentTab === 'categories' && (
            <CategoriesDetailsView />
          )}

          {/* Sellers & Bulk Import */}
          {currentTab === 'sellers' && (
            <SellersView />
          )}

          {/* Discounts & Promos */}
          {currentTab === 'discounts' && (
            <DiscountsManager initialTab="rules" />
          )}

          {/* Bundles & Combo Deals */}
          {currentTab === 'bundles' && (
            <DiscountsManager initialTab="bundles" />
          )}

          {/* 5. Customers */}
          {currentTab === 'customers' && (
            <CustomersView dbUsers={dbUsers} />
          )}

          {/* 6. Active Carts */}
          {currentTab === 'active_carts' && (
            <ActiveCartsView />
          )}

          {currentTab === 'reviews' && (
            <ReviewsManager products={products} />
          )}

          {currentTab === 'search_analytics' && (
            <SearchAnalyticsView />
          )}

          {/* 7. Pages CMS & Individual Page Sections */}
          {currentTab === 'pages_cms' && (
            <div className="space-y-6">
              <PageCMSManager initialTab="home" />
            </div>
          )}

          {currentTab === 'page_home' && (
            <div className="space-y-6">
              <PageCMSManager initialTab="home" />
            </div>
          )}

          {currentTab === 'page_products' && (
            <div className="space-y-6">
              <PageCMSManager initialTab="productsPage" />
            </div>
          )}

          {currentTab === 'page_detail' && (
            <div className="space-y-6">
              <PageCMSManager initialTab="productDetailPage" />
            </div>
          )}

          {currentTab === 'page_checkout' && (
            <div className="space-y-6">
              <PageCMSManager initialTab="checkoutPage" />
            </div>
          )}

          {currentTab === 'page_account' && (
            <div className="space-y-6">
              <PageCMSManager initialTab="accountPage" />
            </div>
          )}

          {currentTab === 'page_news' && (
            <div className="space-y-6">
              <PageCMSManager initialTab="newsSection" />
            </div>
          )}

          {currentTab === 'page_navbar' && (
            <div className="space-y-6">
              <PageCMSManager initialTab="navbar" />
            </div>
          )}

          {currentTab === 'page_footer' && (
            <div className="space-y-6">
              <PageCMSManager initialTab="footer" />
            </div>
          )}

          {currentTab === 'page_custom_blocks' && (
            <div className="space-y-6">
              <PageCMSManager initialTab="customBlocks" />
            </div>
          )}

          {currentTab === 'page_visibility' && (
            <div className="space-y-6">
              <PageCMSManager initialTab="visibility" />
            </div>
          )}

          {currentTab === 'page_seo' && (
            <div className="space-y-6">
              <PageCMSManager initialTab="seo" />
            </div>
          )}

          {/* System & Audit: Database Sync & Logs */}
          {currentTab === 'db_logs' && (
            <DatabaseActivityLogs />
          )}

        </main>
      </div>

      {/* Add Product Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div 
            ref={addProductModalRef}
            onScroll={(e) => { addModalScrollRef.current = e.currentTarget.scrollTop; }}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            className="bg-white max-w-xl w-full p-6 sm:p-8 rounded-3xl shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto focus:outline-hidden"
          >
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-900">List New Lebanese Item</h3>
                <p className="text-xs text-slate-500">Catalog items from verified Lebanese artisans & cooperatives</p>
              </div>
              <button 
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 text-lg font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateProduct} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Product Title (English) *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Mountain Zaatar Blend"
                    value={newProduct.name}
                    onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 focus:outline-none focus:border-[#4f46e5]"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Product Title (Arabic)</label>
                  <input
                    type="text"
                    placeholder="e.g. خلطة الزعتر الجبلي"
                    value={newProduct.arabicName}
                    onChange={(e) => setNewProduct({ ...newProduct, arabicName: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 focus:outline-none focus:border-[#4f46e5] text-right font-serif"
                  />
                </div>
              </div>

              {/* Datalist for autocomplete */}
              <datalist id="admin-existing-sellers">
                {sellerStats.map((s) => (
                  <option key={s.id || s.seller} value={s.seller}>
                    {s.arabicName ? `${s.seller} (${s.arabicName})` : s.seller}
                  </option>
                ))}
              </datalist>

              {/* Registered Seller Selector */}
              <div className="p-3 bg-indigo-50/70 border border-indigo-100 rounded-2xl space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                    <Store className="w-4 h-4 text-indigo-600" />
                    <span>Select Registered Seller / Artisan:</span>
                  </label>
                  <span className="text-[10px] font-semibold text-indigo-600">
                    {sellers.length} registered in system
                  </span>
                </div>
                <select
                  value={(newProduct as any).sellerId || (sellers.find(s => s.nameEn.toLowerCase() === (newProduct.seller || newProduct.artisan || '').toLowerCase())?.id || '')}
                  onChange={(e) => {
                    const sId = e.target.value;
                    if (!sId) {
                      setNewProduct({
                        ...newProduct,
                        sellerId: undefined
                      } as any);
                    } else {
                      const found = sellers.find(s => s.id === sId);
                      if (found) {
                        setNewProduct({
                          ...newProduct,
                          seller: found.nameEn,
                          artisan: found.nameEn,
                          arabicSeller: found.nameAr || '',
                          origin: found.region || newProduct.origin,
                          sellerId: found.id
                        } as any);
                      }
                    }
                  }}
                  className="w-full px-3 py-2 bg-white rounded-xl border border-indigo-200 focus:outline-none focus:border-indigo-600 text-xs font-bold text-slate-800 shadow-2xs cursor-pointer"
                >
                  <option value="">-- Choose from Registered Sellers or type manually below --</option>
                  {sellers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nameEn} {s.nameAr ? `(${s.nameAr})` : ''} — {s.region || 'Lebanon'}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Category *</label>
                  <select
                    value={newProduct.category}
                    onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 focus:outline-none"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.icon} {c.nameEn} ({c.nameAr})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Seller Name (English) *</label>
                  <input
                    type="text"
                    required
                    list="admin-existing-sellers"
                    placeholder="e.g. Cedar Farms"
                    value={newProduct.seller}
                    onChange={(e) => setNewProduct({ ...newProduct, seller: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Seller Name (Arabic)</label>
                  <input
                    type="text"
                    placeholder="e.g. مزارع الأرز"
                    value={newProduct.arabicSeller}
                    onChange={(e) => setNewProduct({ ...newProduct, arabicSeller: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 focus:outline-none"
                    dir="rtl"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Price ($) *</label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={newProduct.priceUSD}
                    onChange={(e) => setNewProduct({ ...newProduct, priceUSD: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 focus:outline-none font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Stock Quantity *</label>
                  <input
                    type="number"
                    min={0}
                    value={newProduct.stock}
                    onChange={(e) => setNewProduct({ ...newProduct, stock: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 focus:outline-none font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Seller Item Code *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. SIC-12930"
                    value={newProduct.sellerItemCode}
                    onChange={(e) => setNewProduct({ ...newProduct, sellerItemCode: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 focus:outline-none font-mono"
                  />
                </div>
              </div>

              {/* Sale & Deal Pricing (Optional) */}
              <div className="p-3.5 bg-rose-50/50 rounded-2xl border border-rose-200/70 space-y-2 mt-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                    <span>🏷️ Sale / Deal Pricing & Badges (Optional)</span>
                  </span>
                  <span className="text-[10px] text-rose-800 font-medium">Shows struck-through price & "-X%" deal badge</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Original / Compare-at Price ($)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="e.g. 24.99 (Struck-through price)"
                      value={newProduct.originalPriceUSD}
                      onChange={(e) => {
                        const orig = e.target.value === '' ? '' : Number(e.target.value);
                        let autoDisc = newProduct.discountPercentage;
                        if (typeof orig === 'number' && orig > newProduct.priceUSD) {
                          autoDisc = Math.round(((orig - newProduct.priceUSD) / orig) * 100);
                        }
                        setNewProduct({ ...newProduct, originalPriceUSD: orig, discountPercentage: autoDisc });
                      }}
                      className="w-full px-3 py-1.5 bg-white rounded-xl border border-slate-200 focus:outline-none text-xs font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Discount Percentage (%)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={99}
                      placeholder="e.g. 20 (shows -20% badge & Today's Deals)"
                      value={newProduct.discountPercentage}
                      onChange={(e) => setNewProduct({ ...newProduct, discountPercentage: e.target.value === '' ? '' : Number(e.target.value) })}
                      className="w-full px-3 py-1.5 bg-white rounded-xl border border-slate-200 focus:outline-none text-xs font-semibold text-rose-600"
                    />
                  </div>
                </div>
              </div>

              {/* Product Tags */}
              <div className="mt-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-bold text-slate-700 text-xs">
                    Product Tags (Comma-separated)
                  </label>
                  <span className="text-[10px] text-slate-400">Used for search & filters</span>
                </div>
                <input
                  type="text"
                  placeholder="e.g. Artisanal, Terroir, Mouneh, Vegan, Organic"
                  value={newProduct.tagsInput}
                  onChange={(e) => setNewProduct({ ...newProduct, tagsInput: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 focus:outline-none text-xs"
                />
              </div>

              {/* Stock Threshold & Low-Stock Admin Comment Notice */}
              <div className="p-3.5 bg-amber-50/50 rounded-2xl border border-amber-200/70 space-y-2.5 mt-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                    <span>⚡ Stock Threshold & Scarcity Notice (Displayed to Shoppers)</span>
                  </span>
                  <span className="text-[10px] text-amber-800 font-medium">Alerts customers when inventory is scarce</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Low Stock Threshold (e.g. 5)
                    </label>
                    <input
                      type="number"
                      min={0}
                      placeholder="5"
                      value={newProduct.lowStockThreshold}
                      onChange={(e) => setNewProduct({ ...newProduct, lowStockThreshold: Number(e.target.value) })}
                      className="w-full px-3 py-1.5 bg-white rounded-xl border border-slate-200 focus:outline-none text-xs font-bold"
                    />
                    <span className="text-[10px] text-slate-400 mt-0.5 block">Notice shows when stock is ≤ this number</span>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Notice / Comment beside Quantity
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Limited Stock, Last piece, Few units left"
                      value={newProduct.lowStockNotice}
                      onChange={(e) => setNewProduct({ ...newProduct, lowStockNotice: e.target.value })}
                      className="w-full px-3 py-1.5 bg-white rounded-xl border border-slate-200 focus:outline-none text-xs"
                    />
                  </div>
                </div>

                {/* Quick Notice Suggestion Buttons */}
                <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                  <span className="text-[10px] font-bold text-slate-500">Quick suggestions:</span>
                  {['Limited Stock', 'Last piece', 'Few units left', 'Handmade batch ending', 'Order soon'].map((sug) => (
                    <button
                      key={sug}
                      type="button"
                      onClick={() => setNewProduct({ ...newProduct, lowStockNotice: sug })}
                      className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold border transition-all cursor-pointer ${
                        newProduct.lowStockNotice === sug
                          ? 'bg-amber-500 text-white border-amber-600'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-amber-50 hover:border-amber-300'
                      }`}
                    >
                      {sug}
                    </button>
                  ))}
                </div>
              </div>

              {/* Package Net Weight / Volume / Unit Size */}
              <div className="mt-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-bold text-slate-700 text-xs">
                    Package Net Weight / Volume / Unit Size (Optional)
                  </label>
                  <span className="text-[10px] text-slate-400">e.g. 500ml, 750g Glass Jar, 245 Pcs, Medium</span>
                </div>
                <input
                  type="text"
                  placeholder="e.g. 500ml Glass Bottle, 250g Jar, Sizes 38-44"
                  value={newProduct.weightOrVolume}
                  onChange={(e) => setNewProduct({ ...newProduct, weightOrVolume: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 focus:outline-none text-xs"
                />
              </div>

              {/* Primary & Multiple Media Section */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                {/* Main Primary Image */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-slate-700 flex items-center gap-1.5">
                      <ImageIcon className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Primary Image URL *</span>
                    </label>
                    <span className="text-[10px] text-slate-500 font-medium">Displayed on product cards & main gallery view</span>
                  </div>
                  <div className="flex gap-2 items-center">
                    <input
                      type="url"
                      required
                      placeholder="https://images.unsplash.com/... or direct image link"
                      value={newProduct.image}
                      onChange={(e) => setNewProduct({ ...newProduct, image: e.target.value })}
                      className="flex-1 px-3 py-2 bg-white rounded-xl border border-slate-200 focus:outline-none"
                    />
                    {newProduct.image && (
                      <div className="w-9 h-9 rounded-lg border border-slate-200 shadow-2xs shrink-0 bg-slate-50 flex items-center justify-center p-0.5 overflow-hidden">
                        <img
                          src={newProduct.image}
                          alt="Primary Preview"
                          className="w-full h-full object-contain"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    )}
                  </div>
                  {(newProduct.image && (newProduct.image.includes('.html') || (!newProduct.image.match(/\.(jpg|jpeg|png|webp|gif|svg)(\?.*)?$/i) && !newProduct.image.includes('unsplash.com') && !newProduct.image.includes('cloudinary') && !newProduct.image.includes('firebase')))) && (
                    <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900 space-y-1.5 mt-2">
                      <div className="flex items-center gap-1.5 font-bold">
                        <span>⚠️ Webpage Link Detected (Not a Direct Image File)</span>
                      </div>
                      <p className="text-slate-600">
                        The URL you entered (<span className="font-mono text-xs text-amber-950 underline">{newProduct.image}</span>) is a web page link (<code className="font-mono bg-amber-100 px-1 rounded">.html</code>). Direct image files are required for product previews.
                      </p>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setNewProduct({
                            ...newProduct,
                            image: 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=800&q=80'
                          });
                        }}
                        className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg cursor-pointer text-xs transition-all inline-flex items-center gap-1"
                      >
                        <span>⚡ Fix: Use Professional Car Charger / Electronic Product Photo</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Multiple Gallery Images */}
                <div className="space-y-2 pt-2 border-t border-slate-200">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-slate-700 flex items-center gap-1.5">
                      <ImageIcon className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Additional Gallery Images (Add Multiple)</span>
                    </label>
                    <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                      {newProduct.additionalImages.length} images
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      placeholder="Paste additional image URL and click Add"
                      value={newProduct.newAdditionalImageInput}
                      onChange={(e) => setNewProduct({ ...newProduct, newAdditionalImageInput: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (newProduct.newAdditionalImageInput.trim()) {
                            setNewProduct({
                              ...newProduct,
                              additionalImages: [...newProduct.additionalImages, newProduct.newAdditionalImageInput.trim()],
                              newAdditionalImageInput: ''
                            });
                          }
                        }
                      }}
                      className="flex-1 px-3 py-1.5 bg-white rounded-xl border border-slate-200 focus:outline-none text-xs"
                    />
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation();
                        if (newProduct.newAdditionalImageInput.trim()) {
                          setNewProduct({
                            ...newProduct,
                            additionalImages: [...newProduct.additionalImages, newProduct.newAdditionalImageInput.trim()],
                            newAdditionalImageInput: ''
                          });
                        }
                      }}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl cursor-pointer text-xs flex items-center gap-1 shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Image</span>
                    </button>
                  </div>

                  {newProduct.additionalImages.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {newProduct.additionalImages.map((imgUrl, iIdx) => (
                        <div key={iIdx} className="relative group w-14 h-14 rounded-xl overflow-hidden border border-slate-300 shadow-2xs bg-slate-50 flex items-center justify-center p-1">
                          <img src={imgUrl} alt={`Gallery ${iIdx + 1}`} className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                          <button
                            type="button"
                            onClick={() => setNewProduct({
                              ...newProduct,
                              additionalImages: newProduct.additionalImages.filter((_, idx) => idx !== iIdx)
                            })}
                            className="absolute top-1 right-1 p-1 bg-rose-600/90 hover:bg-rose-700 text-white rounded-full opacity-90 group-hover:opacity-100 transition-all cursor-pointer shadow-xs"
                            title="Remove image"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Product Videos (YouTube, Vimeo, MP4) */}
                <div className="space-y-2 pt-2 border-t border-slate-200">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-slate-700 flex items-center gap-1.5">
                      <Video className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Product Videos (YouTube / Vimeo / MP4)</span>
                    </label>
                    <span className="text-[10px] font-bold text-indigo-800 bg-indigo-100 px-2 py-0.5 rounded-full">
                      {(newProduct.videos || []).length + (newProduct.videoUrl && !newProduct.videos.includes(newProduct.videoUrl) ? 1 : 0)} videos
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      placeholder="https://www.youtube.com/watch?v=... or .mp4 link"
                      value={newProduct.newVideoInput}
                      onChange={(e) => setNewProduct({ ...newProduct, newVideoInput: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const val = newProduct.newVideoInput.trim();
                          if (val) {
                            const currentVideos = newProduct.videos || [];
                            setNewProduct({
                              ...newProduct,
                              videoUrl: newProduct.videoUrl || val,
                              videos: [...currentVideos, val],
                              newVideoInput: ''
                            });
                          }
                        }
                      }}
                      className="flex-1 px-3 py-1.5 bg-white rounded-xl border border-slate-200 focus:outline-none text-xs"
                    />
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation();
                        const val = newProduct.newVideoInput.trim();
                        if (val) {
                          const currentVideos = newProduct.videos || [];
                          setNewProduct({
                            ...newProduct,
                            videoUrl: newProduct.videoUrl || val,
                            videos: [...currentVideos, val],
                            newVideoInput: ''
                          });
                        }
                      }}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl cursor-pointer text-xs flex items-center gap-1 shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Video</span>
                    </button>
                  </div>

                  {(newProduct.videos || []).length > 0 && (
                    <div className="space-y-1 pt-1">
                      {newProduct.videos.map((vidUrl, vIdx) => (
                        <div key={vIdx} className="flex items-center justify-between gap-2 p-2 bg-white rounded-xl border border-slate-200 text-slate-700 text-[11px]">
                          <div className="flex items-center gap-1.5 truncate">
                            <Film className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                            <span className="font-mono truncate">{vidUrl}</span>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation();
                              const remaining = newProduct.videos.filter((_, idx) => idx !== vIdx);
                              setNewProduct({
                                ...newProduct,
                                videos: remaining,
                                videoUrl: remaining[0] || ''
                              });
                            }}
                            className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer shrink-0"
                            title="Remove video"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* ARABIC SEO KEYWORDS SECTION */}
              <div className="p-3.5 bg-amber-50/60 rounded-2xl border border-amber-200/80 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="block font-bold text-amber-950 text-xs flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-[#c5a059]" />
                    <span>الكلمات الدلالية لمحركات البحث بالعربية (Arabic SEO Keywords)</span>
                  </label>
                  <span className="text-[10px] font-black text-amber-900 bg-amber-100 px-2 py-0.5 rounded-full">
                    {newProduct.arabicKeywords.length} كلمات
                  </span>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="اكتب كلمة دلالية بالعربية واضغط Enter (مثال: زعتر جبلي بلدي)"
                    value={newProduct.newArabicKeywordInput}
                    onChange={(e) => setNewProduct({ ...newProduct, newArabicKeywordInput: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (newProduct.newArabicKeywordInput.trim()) {
                          setNewProduct({
                            ...newProduct,
                            arabicKeywords: [...newProduct.arabicKeywords, newProduct.newArabicKeywordInput.trim()],
                            newArabicKeywordInput: ''
                          });
                        }
                      }
                    }}
                    className="flex-1 px-3 py-1.5 bg-white text-xs rounded-xl border border-amber-200 focus:outline-none text-right font-serif"
                    dir="rtl"
                  />
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation();
                      if (newProduct.newArabicKeywordInput.trim()) {
                        setNewProduct({
                          ...newProduct,
                          arabicKeywords: [...newProduct.arabicKeywords, newProduct.newArabicKeywordInput.trim()],
                          newArabicKeywordInput: ''
                        });
                      }
                    }}
                    className="px-3 py-1.5 bg-[#c5a059] hover:bg-[#b08d46] text-white text-xs font-bold rounded-xl cursor-pointer font-serif"
                  >
                    إضافة
                  </button>
                </div>

                {/* Arabic quick tags */}
                <div className="flex flex-wrap gap-1">
                  {['مونة بلدية', 'زيت زيتون كورة', 'زعتر بلدي جبلي', 'عسل سدر', 'صناعة لبنانية', 'شحن مغتربين'].map((sug, sIdx) => {
                    const exists = newProduct.arabicKeywords.includes(sug);
                    return (
                      <button
                        key={sIdx}
                        type="button"
                        disabled={exists}
                        onClick={(e) => { e.stopPropagation();
                          if (!exists) {
                            setNewProduct({
                              ...newProduct,
                              arabicKeywords: [...newProduct.arabicKeywords, sug]
                            });
                          }
                        }}
                        className={`px-2 py-0.5 rounded-md text-[10.5px] font-serif transition-all ${
                          exists 
                            ? 'bg-amber-200/50 text-amber-700 opacity-60 cursor-not-allowed' 
                            : 'bg-white border border-amber-200 text-amber-900 hover:bg-amber-100 cursor-pointer'
                        }`}
                      >
                        + {sug}
                      </button>
                    );
                  })}
                </div>

                {/* Active Arabic Keyword Badges */}
                <div className="flex flex-wrap gap-1 pt-1">
                  {newProduct.arabicKeywords.map((kw, kIdx) => (
                    <span key={kIdx} className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-amber-300 text-amber-950 rounded-md text-[11px] font-serif font-bold shadow-2xs">
                      <span>#{kw}</span>
                      <button
                        type="button"
                        onClick={() => setNewProduct({
                          ...newProduct,
                          arabicKeywords: newProduct.arabicKeywords.filter((_, i) => i !== kIdx)
                        })}
                        className="text-amber-400 hover:text-rose-600 ml-1 font-bold cursor-pointer"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">English SEO Keywords (Comma Separated)</label>
                <input
                  type="text"
                  placeholder="e.g. zaatar, olive oil, lebanese spice, organic"
                  value={newProduct.keywordsInput}
                  onChange={(e) => setNewProduct({ ...newProduct, keywordsInput: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Description & Heritage Story</label>
                <textarea
                  rows={2}
                  value={newProduct.description}
                  onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 focus:outline-none"
                />
              </div>

              <div className="pt-3 flex flex-wrap items-center justify-between gap-2.5 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer transition-all"
                >
                  Cancel
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => handleCreateProduct(e, false)}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs cursor-pointer transition-all shadow-xs active:scale-95"
                    title="Save product as unpublished draft"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Save (Draft)</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleCreateProduct(e, true)}
                    className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#4f46e5] to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white font-bold text-xs cursor-pointer shadow-md active:scale-95 transition-all"
                    title="Publish product live to public store catalog"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    <span>Public (Publish Live)</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Product CSV Upload Modal */}
      {isBulkUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div 
            className="bg-white max-w-2xl w-full p-6 sm:p-8 rounded-3xl shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto focus:outline-hidden"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Bulk Product Management (Creation & Updates)</h3>
                <p className="text-xs text-slate-500">Create new items or update existing products in bulk using CSV spreadsheets</p>
              </div>
              <button 
                onClick={() => setIsBulkUploadModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 text-lg font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* CSV File Selection & Instructions */}
            <div className="space-y-4">
              {/* Selected Items Callout Banner if user has items checked */}
              {selectedProductIds.size > 0 && (
                <div className="p-3.5 bg-indigo-50 border border-indigo-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
                  <div>
                    <div className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                      <FileSpreadsheet className="w-4 h-4 text-indigo-600" />
                      <span>{selectedProductIds.size} Products Selected for Bulk Update</span>
                    </div>
                    <p className="text-[11px] text-indigo-700 mt-0.5">
                      Download the pre-populated CSV for these selected items, edit the values in Excel/Sheets, and re-upload below.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleDownloadSelectedProductsForUpdate}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition-all shadow-xs shrink-0 cursor-pointer flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Selected CSV ({selectedProductIds.size})</span>
                  </button>
                </div>
              )}

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pb-2 border-b border-slate-200/80">
                  <div className="bg-white p-3 rounded-xl border border-slate-200/80 space-y-2">
                    <h5 className="font-bold text-slate-800 flex items-center gap-1 text-xs">
                      <span className="text-indigo-600 font-extrabold">1.</span> Bulk Update Existing Items
                    </h5>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Select products on the catalog grid, click <strong>Download Selected CSV</strong>, modify details (prices, stock, names, item codes) in your spreadsheet, and upload it back. The system matches items using the <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[10px]">sku</code> column.
                    </p>
                    <button
                      onClick={selectedProductIds.size > 0 ? handleDownloadSelectedProductsForUpdate : handleDownloadProductsReport}
                      className="w-full inline-flex items-center justify-center gap-1.5 text-indigo-700 font-bold cursor-pointer bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1.5 rounded-lg border border-indigo-200 text-xs transition-colors"
                    >
                      <Download className="w-3.5 h-3.5 text-indigo-600" />
                      <span>{selectedProductIds.size > 0 ? `Download Selected (${selectedProductIds.size}) CSV` : 'Download All Products CSV'}</span>
                    </button>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-slate-200/80 space-y-2">
                    <h5 className="font-bold text-slate-800 flex items-center gap-1 text-xs">
                      <span className="text-emerald-600 font-extrabold">2.</span> Bulk Create New Products
                    </h5>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Download the empty header template, fill in your new product rows, and upload. Leave <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[10px]">sku</code> blank or provide custom unique IDs.
                    </p>
                    <button
                      onClick={handleDownloadHeadersOnlyTemplate}
                      className="w-full inline-flex items-center justify-center gap-1.5 text-emerald-700 font-bold cursor-pointer bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1.5 rounded-lg border border-emerald-200 text-xs transition-colors"
                    >
                      <Download className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Download Empty CSV Template</span>
                    </button>
                  </div>
                </div>

                <div>
                  <h4 className="font-bold text-slate-800 text-[11px]">Supported CSV Columns:</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 pt-1 font-mono text-[10px]">
                    <div><strong className="text-indigo-600">sku</strong> (for updates)</div>
                    <div><strong className="text-indigo-600">seller_item_code</strong></div>
                    <div><strong className="text-indigo-600">name_en</strong> (required)</div>
                    <div><strong className="text-indigo-600">name_ar</strong></div>
                    <div><strong className="text-indigo-600">category</strong></div>
                    <div><strong className="text-indigo-600">seller_id</strong></div>
                    <div><strong className="text-indigo-600">price_usd</strong> (&gt; 0)</div>
                    <div><strong className="text-indigo-600">stock</strong> (&gt;= 0)</div>
                    <div><strong className="text-indigo-600">image_url</strong></div>
                    <div><strong className="text-emerald-600">additional_images</strong></div>
                    <div><strong className="text-indigo-600">is_published</strong></div>
                    <div><strong className="text-emerald-600">description_en</strong></div>
                  </div>
                </div>
              </div>

              {/* Target Seller & Category Overrides / Fallbacks */}
              <div className="p-4 bg-indigo-50/60 border border-indigo-100 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                    <Store className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Quick Supplier Assignment & Fallbacks</span>
                  </span>
                  <span className="text-[10px] text-indigo-600 font-medium">Auto-resolves missing or unmapped columns</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Target Seller / Supplier:
                    </label>
                    <select
                      value={bulkImportTargetSellerId}
                      onChange={(e) => handleTargetSellerChange(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-2xs cursor-pointer"
                    >
                      <option value="auto">⚡ Auto-Detect from CSV (by ID, Name, or Slug)</option>
                      {sellers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.nameEn} ({s.id})
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-slate-500 mt-1">
                      Choose a seller to assign all imported rows to that supplier.
                    </p>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Default Fallback Category:
                    </label>
                    <select
                      value={bulkImportFallbackCategoryId}
                      onChange={(e) => handleFallbackCategoryChange(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-2xs cursor-pointer"
                    >
                      <option value="auto">⚡ Auto-Detect from CSV</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nameEn} ({c.id})
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-slate-500 mt-1">
                      Used if the category column is missing or unmapped in the CSV.
                    </p>
                  </div>
                </div>
              </div>

              {/* Upload Dropzone */}
              <div className="space-y-2">
                <label className="block font-bold text-slate-700 text-xs">Choose or Drop CSV File:</label>
                <div className="relative border-2 border-dashed border-slate-300 hover:border-indigo-500 rounded-2xl p-6 text-center transition-all bg-slate-50">
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleBulkUploadFileChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="flex flex-col items-center justify-center gap-2">
                    <UploadCloud className="w-8 h-8 text-slate-400" />
                    <div>
                      <p className="text-xs font-bold text-slate-700">
                        {bulkImportFile ? bulkImportFile.name : 'Click to upload or drag & drop CSV'}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        Only .csv files up to 10MB are supported
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Validation Result / Errors */}
              {bulkImportResult && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-1.5">
                  <h4 className="font-bold text-emerald-950 text-xs">Import Completed Successfully!</h4>
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div className="bg-white p-2.5 rounded-xl border border-emerald-100">
                      <div className="text-[10px] text-slate-400 uppercase font-bold">New Created</div>
                      <div className="text-lg font-black text-emerald-700">{bulkImportResult.created}</div>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-emerald-100">
                      <div className="text-[10px] text-slate-400 uppercase font-bold">Existing Updated</div>
                      <div className="text-lg font-black text-indigo-700">{bulkImportResult.updated}</div>
                    </div>
                  </div>
                  {bulkImportResult.errors.length > 0 && (
                    <div className="pt-2 text-[10px] text-rose-600 font-mono space-y-1 max-h-32 overflow-y-auto">
                      {bulkImportResult.errors.map((err, eIdx) => (
                        <div key={eIdx}>⚠️ {err}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Dry-Run Parser Preview */}
              {bulkImportFile && !bulkImportResult && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-xs text-slate-800">Dry-Run Preview:</h4>
                      <p className="text-[10px] text-slate-400">
                        {bulkImportPreviewRows.length} rows detected ({bulkImportPreviewRows.filter(r => r.issues.length === 0).length} valid, {bulkImportPreviewRows.filter(r => r.issues.length > 0).length} with issues)
                      </p>
                    </div>
                    <button
                      onClick={handleCommitBulkUpload}
                      disabled={isBulkImporting || bulkImportPreviewRows.filter(r => r.issues.length === 0).length === 0}
                      className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all inline-flex items-center gap-1.5 ${
                        bulkImportPreviewRows.filter(r => r.issues.length === 0).length === 0
                          ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                          : 'bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer shadow-sm active:scale-95'
                      }`}
                    >
                      {isBulkImporting ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Importing...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>
                            {bulkImportPreviewRows.filter(r => r.issues.length === 0).length > 0
                              ? `Commit ${bulkImportPreviewRows.filter(r => r.issues.length === 0).length} Valid ${bulkImportPreviewRows.filter(r => r.issues.length === 0).length === 1 ? 'Row' : 'Rows'}`
                              : 'No Valid Rows'}
                          </span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Preview Table */}
                  <div className="border border-slate-100 rounded-xl overflow-hidden text-xs max-h-48 overflow-y-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 text-[10px] uppercase font-bold">
                          <th className="p-2 pl-3">Row</th>
                          <th className="p-2">SKU/ID</th>
                          <th className="p-2">Title</th>
                          <th className="p-2">Assigned Seller</th>
                          <th className="p-2">Category</th>
                          <th className="p-2">Action</th>
                          <th className="p-2 pr-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 text-[11px]">
                        {bulkImportPreviewRows.map((pRow, pIdx) => (
                          <tr key={pIdx} className="hover:bg-slate-50">
                            <td className="p-2 pl-3 text-slate-400 font-mono">#{pRow.rowNum}</td>
                            <td className="p-2 font-mono text-slate-600 truncate max-w-[90px]" title={pRow.sku}>{pRow.sku}</td>
                            <td className="p-2 font-bold text-slate-800 truncate max-w-[130px]" title={pRow.name}>{pRow.name}</td>
                            <td className="p-2 text-indigo-700 font-medium truncate max-w-[110px]" title={pRow.sellerName}>
                              {pRow.sellerName}
                            </td>
                            <td className="p-2 text-slate-600 truncate max-w-[90px]" title={pRow.categoryName}>
                              {pRow.categoryName}
                            </td>
                            <td className="p-2">
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                pRow.action === 'Update' 
                                  ? 'bg-indigo-50 text-indigo-700' 
                                  : 'bg-emerald-50 text-emerald-700'
                              }`}>
                                {pRow.action}
                              </span>
                            </td>
                            <td className="p-2 pr-3">
                              {pRow.issues.length > 0 ? (
                                <span className="text-rose-600 font-mono text-[10px]" title={pRow.issues.join(', ')}>
                                  ❌ {pRow.issues[0]}
                                </span>
                              ) : (
                                <span className="text-emerald-600 font-bold">✅ Ready</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="pt-4 flex items-center justify-end border-t border-slate-100">
              <button
                onClick={() => setIsBulkUploadModalOpen(false)}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer transition-all"
              >
                Close Importer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full Edit Product Modal */}
      {fullEditProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div 
            ref={editProductModalRef}
            onScroll={(e) => { editModalScrollRef.current = e.currentTarget.scrollTop; }}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            className="bg-white max-w-2xl w-full p-6 sm:p-8 rounded-3xl shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto focus:outline-hidden"
          >
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Edit Product Details</h3>
                <p className="text-xs text-slate-500 font-mono">ID: {fullEditProduct.id}</p>
              </div>
              <button 
                onClick={(e) => { e.stopPropagation(); setFullEditProduct(null); }}
                className="text-slate-400 hover:text-slate-700 text-lg font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveFullProductEdit} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Product Title (English) *</label>
                  <input
                    type="text"
                    required
                    value={fullEditProduct.name}
                    onChange={(e) => setFullEditProduct({ ...fullEditProduct, name: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Product Title (Arabic)</label>
                  <input
                    type="text"
                    value={fullEditProduct.arabicName || ''}
                    onChange={(e) => setFullEditProduct({ ...fullEditProduct, arabicName: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 focus:outline-none text-right font-serif"
                  />
                </div>
              </div>

              {/* Registered Seller Selector */}
              <div className="p-3 bg-indigo-50/70 border border-indigo-100 rounded-2xl space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                    <Store className="w-4 h-4 text-indigo-600" />
                    <span>Select Registered Seller / Artisan:</span>
                  </label>
                  <span className="text-[10px] font-semibold text-indigo-600">
                    {sellers.length} registered in system
                  </span>
                </div>
                <select
                  value={fullEditProduct.sellerId || (sellers.find(s => s.nameEn.toLowerCase() === (fullEditProduct.seller || fullEditProduct.artisan || '').toLowerCase())?.id || '')}
                  onChange={(e) => {
                    const sId = e.target.value;
                    if (!sId) {
                      setFullEditProduct({
                        ...fullEditProduct,
                        sellerId: undefined
                      });
                    } else {
                      const found = sellers.find(s => s.id === sId);
                      if (found) {
                        setFullEditProduct({
                          ...fullEditProduct,
                          seller: found.nameEn,
                          artisan: found.nameEn,
                          arabicSeller: found.nameAr || '',
                          origin: found.region || fullEditProduct.origin,
                          sellerId: found.id
                        });
                      }
                    }
                  }}
                  className="w-full px-3 py-2 bg-white rounded-xl border border-indigo-200 focus:outline-none focus:border-indigo-600 text-xs font-bold text-slate-800 shadow-2xs cursor-pointer"
                >
                  <option value="">-- Choose from Registered Sellers or edit details manually below --</option>
                  {sellers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nameEn} {s.nameAr ? `(${s.nameAr})` : ''} — {s.region || 'Lebanon'}
                    </option>
                  ))}
                </select>
              </div>



              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Seller Name (English)</label>
                  <input
                    type="text"
                    placeholder="e.g. Cedar Farms"
                    value={fullEditProduct.seller || ''}
                    onChange={(e) => setFullEditProduct({ ...fullEditProduct, seller: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Seller Name (Arabic)</label>
                  <input
                    type="text"
                    placeholder="e.g. مزارع الأرز"
                    value={fullEditProduct.arabicSeller || ''}
                    onChange={(e) => setFullEditProduct({ ...fullEditProduct, arabicSeller: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 focus:outline-none"
                    dir="rtl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Category</label>
                  <select
                    value={fullEditProduct.category}
                    onChange={(e) => setFullEditProduct({ ...fullEditProduct, category: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 focus:outline-none"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.icon} {c.nameEn} ({c.nameAr})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Price ($)</label>
                  <input
                    type="number"
                    min={1}
                    value={fullEditProduct.priceUSD}
                    onChange={(e) => setFullEditProduct({ ...fullEditProduct, priceUSD: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 focus:outline-none font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Stock Quantity</label>
                  <input
                    type="number"
                    min={0}
                    value={fullEditProduct.stock}
                    onChange={(e) => setFullEditProduct({ ...fullEditProduct, stock: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 focus:outline-none font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Seller Item Code *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. SIC-12930"
                    value={fullEditProduct.sellerItemCode || ''}
                    onChange={(e) => setFullEditProduct({ ...fullEditProduct, sellerItemCode: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 focus:outline-none font-mono"
                  />
                </div>
              </div>

              {/* Edit Sale & Deal Pricing (Optional) */}
              <div className="p-3.5 bg-rose-50/50 rounded-2xl border border-rose-200/70 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                    <span>🏷️ Sale / Deal Pricing & Badges (Optional)</span>
                  </span>
                  <span className="text-[10px] text-rose-800 font-medium">Shows struck-through price & "-X%" deal badge</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Original / Compare-at Price ($)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="e.g. 24.99 (Struck-through price)"
                      value={fullEditProduct.originalPriceUSD !== undefined && fullEditProduct.originalPriceUSD !== null ? fullEditProduct.originalPriceUSD : ''}
                      onChange={(e) => {
                        const orig = e.target.value === '' ? undefined : Number(e.target.value);
                        let autoDisc = fullEditProduct.discountPercentage;
                        if (typeof orig === 'number' && orig > Number(fullEditProduct.priceUSD)) {
                          autoDisc = Math.round(((orig - Number(fullEditProduct.priceUSD)) / orig) * 100);
                        }
                        setFullEditProduct({ ...fullEditProduct, originalPriceUSD: orig, discountPercentage: autoDisc });
                      }}
                      className="w-full px-3 py-1.5 bg-white rounded-xl border border-slate-200 focus:outline-none text-xs font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Discount Percentage (%)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={99}
                      placeholder="e.g. 20 (shows -20% badge & Today's Deals)"
                      value={fullEditProduct.discountPercentage !== undefined && fullEditProduct.discountPercentage !== null ? fullEditProduct.discountPercentage : ''}
                      onChange={(e) => setFullEditProduct({ ...fullEditProduct, discountPercentage: e.target.value === '' ? undefined : Number(e.target.value) })}
                      className="w-full px-3 py-1.5 bg-white rounded-xl border border-slate-200 focus:outline-none text-xs font-semibold text-rose-600"
                    />
                  </div>
                </div>
              </div>

              {/* Edit Product Tags */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-bold text-slate-700 text-xs">
                    Product Tags (Comma-separated)
                  </label>
                  <span className="text-[10px] text-slate-400">Used for search & filters</span>
                </div>
                <input
                  type="text"
                  placeholder="e.g. Artisanal, Terroir, Mouneh, Vegan, Organic"
                  value={Array.isArray(fullEditProduct.tags) ? fullEditProduct.tags.join(', ') : ''}
                  onChange={(e) => {
                    const tagList = e.target.value.split(',').map((t) => t.trim()).filter(Boolean);
                    setFullEditProduct({ ...fullEditProduct, tags: tagList });
                  }}
                  className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 focus:outline-none text-xs"
                />
              </div>

              {/* Edit Stock Threshold & Scarcity Notice */}
              <div className="p-3.5 bg-amber-50/50 rounded-2xl border border-amber-200/70 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                    <span>⚡ Stock Threshold & Scarcity Notice (Displayed to Shoppers)</span>
                  </span>
                  <span className="text-[10px] text-amber-800 font-medium">Alerts customers when inventory is scarce</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Low Stock Threshold (e.g. 5)
                    </label>
                    <input
                      type="number"
                      min={0}
                      placeholder="5"
                      value={fullEditProduct.lowStockThreshold !== undefined ? fullEditProduct.lowStockThreshold : 5}
                      onChange={(e) => setFullEditProduct({ ...fullEditProduct, lowStockThreshold: Number(e.target.value) })}
                      className="w-full px-3 py-1.5 bg-white rounded-xl border border-slate-200 focus:outline-none text-xs font-bold"
                    />
                    <span className="text-[10px] text-slate-400 mt-0.5 block">Notice shows when stock is ≤ this number</span>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Notice / Comment beside Quantity
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Limited Stock, Last piece, Few units left"
                      value={fullEditProduct.lowStockNotice || ''}
                      onChange={(e) => setFullEditProduct({ ...fullEditProduct, lowStockNotice: e.target.value })}
                      className="w-full px-3 py-1.5 bg-white rounded-xl border border-slate-200 focus:outline-none text-xs"
                    />
                  </div>
                </div>

                {/* Quick Notice Suggestion Buttons */}
                <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                  <span className="text-[10px] font-bold text-slate-500">Quick suggestions:</span>
                  {['Limited Stock', 'Last piece', 'Few units left', 'Handmade batch ending', 'Order soon'].map((sug) => (
                    <button
                      key={sug}
                      type="button"
                      onClick={() => setFullEditProduct({ ...fullEditProduct, lowStockNotice: sug })}
                      className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold border transition-all cursor-pointer ${
                        fullEditProduct.lowStockNotice === sug
                          ? 'bg-amber-500 text-white border-amber-600'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-amber-50 hover:border-amber-300'
                      }`}
                    >
                      {sug}
                    </button>
                  ))}
                </div>
              </div>

              {/* Edit Package Net Weight / Volume / Unit Size */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-bold text-slate-700 text-xs">
                    Package Net Weight / Volume / Unit Size (Optional)
                  </label>
                  <span className="text-[10px] text-slate-400">e.g. 500ml, 750g Glass Jar, 245 Pcs, Medium</span>
                </div>
                <input
                  type="text"
                  placeholder="e.g. 500ml Glass Bottle, 250g Jar, Sizes 38-44"
                  value={fullEditProduct.weightOrVolume || ''}
                  onChange={(e) => setFullEditProduct({ ...fullEditProduct, weightOrVolume: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 focus:outline-none text-xs"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Publish / Live Status</label>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setFullEditProduct({ ...fullEditProduct, isPublished: fullEditProduct.isPublished === false ? true : false }); }}
                  className={`w-full py-2.5 rounded-xl font-bold uppercase text-xs flex items-center justify-center gap-2 cursor-pointer transition-all ${
                    fullEditProduct.isPublished !== false 
                      ? 'bg-emerald-600 text-white' 
                      : 'bg-rose-600 text-white'
                  }`}
                >
                  {fullEditProduct.isPublished !== false ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  <span>{fullEditProduct.isPublished !== false ? 'Published (Live on Website)' : 'Hidden (Draft Only)'}</span>
                </button>
              </div>

              {/* Primary & Multiple Media Section for Edit Modal */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                {/* Main Primary Image */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-slate-700 flex items-center gap-1.5">
                      <ImageIcon className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Primary Image URL *</span>
                    </label>
                    <span className="text-[10px] text-slate-500 font-medium">Main product showcase photo</span>
                  </div>
                  <div className="flex gap-2 items-center">
                    <input
                      type="url"
                      required
                      placeholder="https://images.unsplash.com/... or direct image link"
                      value={fullEditProduct.image}
                      onChange={(e) => setFullEditProduct({ ...fullEditProduct, image: e.target.value })}
                      className="flex-1 px-3 py-2 bg-white rounded-xl border border-slate-200 focus:outline-none"
                    />
                    {fullEditProduct.image && (
                      <div className="w-9 h-9 rounded-lg border border-slate-200 shadow-2xs shrink-0 bg-slate-50 flex items-center justify-center p-0.5 overflow-hidden">
                        <img
                          src={fullEditProduct.image}
                          alt="Primary Preview"
                          className="w-full h-full object-contain"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    )}
                  </div>
                  {(fullEditProduct.image && (fullEditProduct.image.includes('.html') || (!fullEditProduct.image.match(/\.(jpg|jpeg|png|webp|gif|svg)(\?.*)?$|unsplash\.com|cloudinary|firebase/i)))) && (
                    <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900 space-y-1.5 mt-2">
                      <div className="flex items-center gap-1.5 font-bold">
                        <span>⚠️ Webpage Link Detected (Not a Direct Image File)</span>
                      </div>
                      <p className="text-slate-600">
                        The URL you entered (<span className="font-mono text-xs text-amber-950 underline">{fullEditProduct.image}</span>) is a web page link (<code className="font-mono bg-amber-100 px-1 rounded">.html</code>). Direct image files are required for product previews.
                      </p>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setFullEditProduct({
                            ...fullEditProduct,
                            image: 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=800&q=80'
                          });
                        }}
                        className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg cursor-pointer text-xs transition-all inline-flex items-center gap-1"
                      >
                        <span>⚡ Fix: Use Professional Car Charger / Electronic Product Photo</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Additional Gallery Images */}
                <div className="space-y-2 pt-2 border-t border-slate-200">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-slate-700 flex items-center gap-1.5">
                      <ImageIcon className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Additional Gallery Images ({((fullEditProduct.additionalImages || []).length)} images)</span>
                    </label>
                    <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                      {(fullEditProduct.additionalImages || []).length} images
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      placeholder="Paste additional image URL and click Add"
                      value={editNewImageInput}
                      onChange={(e) => setEditNewImageInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (editNewImageInput.trim()) {
                            const current = fullEditProduct.additionalImages || [];
                            setFullEditProduct({
                              ...fullEditProduct,
                              additionalImages: [...current, editNewImageInput.trim()]
                            });
                            setEditNewImageInput('');
                          }
                        }
                      }}
                      className="flex-1 px-3 py-1.5 bg-white rounded-xl border border-slate-200 focus:outline-none text-xs"
                    />
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation();
                        if (editNewImageInput.trim()) {
                          const current = fullEditProduct.additionalImages || [];
                          setFullEditProduct({
                            ...fullEditProduct,
                            additionalImages: [...current, editNewImageInput.trim()]
                          });
                          setEditNewImageInput('');
                        }
                      }}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl cursor-pointer text-xs flex items-center gap-1 shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Image</span>
                    </button>
                  </div>

                  {(fullEditProduct.additionalImages || []).length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {(fullEditProduct.additionalImages || []).map((imgUrl, iIdx) => (
                        <div key={iIdx} className="relative group w-14 h-14 rounded-xl overflow-hidden border border-slate-300 shadow-2xs bg-slate-50 flex items-center justify-center p-1">
                          <img src={imgUrl} alt={`Gallery ${iIdx + 1}`} className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation();
                              const remaining = (fullEditProduct.additionalImages || []).filter((_, idx) => idx !== iIdx);
                              setFullEditProduct({
                                ...fullEditProduct,
                                additionalImages: remaining
                              });
                            }}
                            className="absolute top-1 right-1 p-1 bg-rose-600/90 hover:bg-rose-700 text-white rounded-full opacity-90 group-hover:opacity-100 transition-all cursor-pointer shadow-xs"
                            title="Remove image"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Product Videos (YouTube / Vimeo / MP4) */}
                <div className="space-y-2 pt-2 border-t border-slate-200">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-slate-700 flex items-center gap-1.5">
                      <Video className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Product Videos (YouTube / Vimeo / MP4)</span>
                    </label>
                    <span className="text-[10px] font-bold text-indigo-800 bg-indigo-100 px-2 py-0.5 rounded-full">
                      {(fullEditProduct.videos || (fullEditProduct.videoUrl ? [fullEditProduct.videoUrl] : [])).length} videos
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      placeholder="https://www.youtube.com/watch?v=... or .mp4 link"
                      value={editNewVideoInput}
                      onChange={(e) => setEditNewVideoInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const val = editNewVideoInput.trim();
                          if (val) {
                            const currentVideos = fullEditProduct.videos || (fullEditProduct.videoUrl ? [fullEditProduct.videoUrl] : []);
                            setFullEditProduct({
                              ...fullEditProduct,
                              videoUrl: fullEditProduct.videoUrl || val,
                              videos: [...currentVideos, val]
                            });
                            setEditNewVideoInput('');
                          }
                        }
                      }}
                      className="flex-1 px-3 py-1.5 bg-white rounded-xl border border-slate-200 focus:outline-none text-xs"
                    />
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation();
                        const val = editNewVideoInput.trim();
                        if (val) {
                          const currentVideos = fullEditProduct.videos || (fullEditProduct.videoUrl ? [fullEditProduct.videoUrl] : []);
                          setFullEditProduct({
                            ...fullEditProduct,
                            videoUrl: fullEditProduct.videoUrl || val,
                            videos: [...currentVideos, val]
                          });
                          setEditNewVideoInput('');
                        }
                      }}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl cursor-pointer text-xs flex items-center gap-1 shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Video</span>
                    </button>
                  </div>

                  {((fullEditProduct.videos && fullEditProduct.videos.length > 0) ? fullEditProduct.videos : (fullEditProduct.videoUrl ? [fullEditProduct.videoUrl] : [])).length > 0 && (
                    <div className="space-y-1 pt-1">
                      {((fullEditProduct.videos && fullEditProduct.videos.length > 0) ? fullEditProduct.videos : (fullEditProduct.videoUrl ? [fullEditProduct.videoUrl] : [])).map((vidUrl, vIdx) => (
                        <div key={vIdx} className="flex items-center justify-between gap-2 p-2 bg-white rounded-xl border border-slate-200 text-slate-700 text-[11px]">
                          <div className="flex items-center gap-1.5 truncate">
                            <Film className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                            <span className="font-mono truncate">{vidUrl}</span>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation();
                              const currentList = fullEditProduct.videos || (fullEditProduct.videoUrl ? [fullEditProduct.videoUrl] : []);
                              const remaining = currentList.filter((_, idx) => idx !== vIdx);
                              setFullEditProduct({
                                ...fullEditProduct,
                                videos: remaining,
                                videoUrl: remaining[0] || ''
                              });
                            }}
                            className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer shrink-0"
                            title="Remove video"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* ARABIC SEO KEYWORDS SECTION FOR EDIT MODAL */}
              <div className="p-3.5 bg-amber-50/60 rounded-2xl border border-amber-200/80 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="block font-bold text-amber-950 text-xs flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-[#c5a059]" />
                    <span>الكلمات الدلالية لمحركات البحث بالعربية (Arabic SEO Keywords)</span>
                  </label>
                  <span className="text-[10px] font-black text-amber-900 bg-amber-100 px-2 py-0.5 rounded-full font-serif">
                    {((fullEditProduct as any).arabicKeywords || []).length} كلمات
                  </span>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="اكتب كلمة دلالية بالعربية واضغط Enter (مثال: زعتر جبلي بلدي)"
                    value={(fullEditProduct as any).editArabicKeywordInput || ''}
                    onChange={(e) => setFullEditProduct({ ...fullEditProduct, editArabicKeywordInput: e.target.value } as any)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const inputVal = ((fullEditProduct as any).editArabicKeywordInput || '').trim();
                        if (inputVal) {
                          const currentKw = (fullEditProduct as any).arabicKeywords || [];
                          setFullEditProduct({
                            ...fullEditProduct,
                            arabicKeywords: [...currentKw, inputVal],
                            editArabicKeywordInput: ''
                          } as any);
                        }
                      }
                    }}
                    className="flex-1 px-3 py-1.5 bg-white text-xs rounded-xl border border-amber-200 focus:outline-none text-right font-serif"
                    dir="rtl"
                  />
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation();
                      const inputVal = ((fullEditProduct as any).editArabicKeywordInput || '').trim();
                      if (inputVal) {
                        const currentKw = (fullEditProduct as any).arabicKeywords || [];
                        setFullEditProduct({
                          ...fullEditProduct,
                          arabicKeywords: [...currentKw, inputVal],
                          editArabicKeywordInput: ''
                        } as any);
                      }
                    }}
                    className="px-3 py-1.5 bg-[#c5a059] hover:bg-[#b08d46] text-white text-xs font-bold rounded-xl cursor-pointer font-serif"
                  >
                    إضافة
                  </button>
                </div>

                {/* Quick Suggestion Pills */}
                <div className="flex flex-wrap gap-1">
                  {['مونة بلدية', 'زيت زيتون كورة', 'زعتر بلدي جبلي', 'عسل سدر', 'صناعة لبنانية', 'شحن مغتربين'].map((sug, sIdx) => {
                    const currentKw: string[] = (fullEditProduct as any).arabicKeywords || [];
                    const exists = currentKw.includes(sug);
                    return (
                      <button
                        key={sIdx}
                        type="button"
                        disabled={exists}
                        onClick={(e) => { e.stopPropagation();
                          if (!exists) {
                            setFullEditProduct({
                              ...fullEditProduct,
                              arabicKeywords: [...currentKw, sug]
                            } as any);
                          }
                        }}
                        className={`px-2 py-0.5 rounded-md text-[10.5px] font-serif transition-all ${
                          exists 
                            ? 'bg-amber-200/50 text-amber-700 opacity-60 cursor-not-allowed' 
                            : 'bg-white border border-amber-200 text-amber-900 hover:bg-amber-100 cursor-pointer'
                        }`}
                      >
                        + {sug}
                      </button>
                    );
                  })}
                </div>

                {/* Active Badges */}
                <div className="flex flex-wrap gap-1 pt-1">
                  {((fullEditProduct as any).arabicKeywords || []).map((kw: string, kIdx: number) => (
                    <span key={kIdx} className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-amber-300 text-amber-950 rounded-md text-[11px] font-serif font-bold shadow-2xs">
                      <span>#{kw}</span>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation();
                          const currentKw: string[] = (fullEditProduct as any).arabicKeywords || [];
                          setFullEditProduct({
                            ...fullEditProduct,
                            arabicKeywords: currentKw.filter((_, i) => i !== kIdx)
                          } as any);
                        }}
                        className="text-amber-400 hover:text-rose-600 ml-1 font-bold cursor-pointer"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">English SEO Keywords (Comma Separated)</label>
                <input
                  type="text"
                  placeholder="e.g. zaatar, olive oil, lebanese spice, organic"
                  value={(fullEditProduct as any).keywordsInput !== undefined ? (fullEditProduct as any).keywordsInput : (fullEditProduct.keywords || []).join(', ')}
                  onChange={(e) => setFullEditProduct({ ...fullEditProduct, keywordsInput: e.target.value } as any)}
                  className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={fullEditProduct.description}
                  onChange={(e) => setFullEditProduct({ ...fullEditProduct, description: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 focus:outline-none"
                />
              </div>

              <div className="pt-3 flex flex-wrap items-center justify-between gap-2.5 border-t border-slate-100">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setFullEditProduct(null); }}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer transition-all"
                >
                  Cancel
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsPreviewEditModalOpen(true)}
                    className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs cursor-pointer transition-all border border-indigo-200"
                    title="Preview changes and live storefront card before saving or publishing"
                  >
                    <Eye className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Preview Changes</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleSaveFullProductEdit(e, false)}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs cursor-pointer transition-all shadow-xs active:scale-95"
                    title="Save changes as private draft"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Save (Draft)</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleSaveFullProductEdit(e, true)}
                    className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#4f46e5] to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white font-bold text-xs cursor-pointer shadow-md active:scale-95 transition-all"
                    title="Save and publish live to public store catalog"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    <span>Public (Publish Live)</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Product Edit Preview Before Publish Modal */}
      {isPreviewEditModalOpen && fullEditProduct && (() => {
        const originalProduct = products.find(p => p.id === fullEditProduct.id);
        const changesList: { field: string; before: string; after: string }[] = [];

        if (originalProduct) {
          if (originalProduct.name !== fullEditProduct.name) {
            changesList.push({ field: 'Product Name', before: originalProduct.name, after: fullEditProduct.name });
          }
          if ((originalProduct.arabicName || '') !== (fullEditProduct.arabicName || '')) {
            changesList.push({ field: 'Arabic Name', before: originalProduct.arabicName || '(Empty)', after: fullEditProduct.arabicName || '(Empty)' });
          }
          if (Number(originalProduct.priceUSD) !== Number(fullEditProduct.priceUSD)) {
            changesList.push({ field: 'Price (USD)', before: `$${originalProduct.priceUSD}`, after: `$${fullEditProduct.priceUSD}` });
          }
          if (Number(originalProduct.stock) !== Number(fullEditProduct.stock)) {
            changesList.push({ field: 'Stock Level', before: `${originalProduct.stock} units`, after: `${fullEditProduct.stock} units` });
          }
          if (originalProduct.category !== fullEditProduct.category) {
            changesList.push({ field: 'Category', before: originalProduct.category, after: fullEditProduct.category });
          }
          if ((originalProduct.seller || originalProduct.artisan) !== (fullEditProduct.seller || fullEditProduct.artisan)) {
            changesList.push({ field: 'Seller/Artisan', before: originalProduct.seller || originalProduct.artisan || '', after: fullEditProduct.seller || fullEditProduct.artisan || '' });
          }
          if ((originalProduct.sellerItemCode || '') !== (fullEditProduct.sellerItemCode || '')) {
            changesList.push({ field: 'Seller Item Code', before: originalProduct.sellerItemCode || '(None)', after: fullEditProduct.sellerItemCode || '(None)' });
          }
          if (originalProduct.image !== fullEditProduct.image) {
            changesList.push({ field: 'Main Image URL', before: originalProduct.image, after: fullEditProduct.image });
          }
          if ((originalProduct.isPublished !== false) !== (fullEditProduct.isPublished !== false)) {
            changesList.push({
              field: 'Publish Status',
              before: originalProduct.isPublished !== false ? 'Public / Live' : 'Unpublished Draft',
              after: fullEditProduct.isPublished !== false ? 'Public / Live' : 'Unpublished Draft'
            });
          }
        }

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
            <div className="bg-white rounded-3xl max-w-3xl w-full p-6 space-y-5 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                    <FileDiff className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-slate-900 text-base">Preview Product Changes Before Publishing</h3>
                    <p className="text-xs text-slate-500">Review exact attribute diffs and live customer storefront presentation</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsPreviewEditModalOpen(false)}
                  className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Grid: Left - Diffs / Right - Storefront Card Mockup */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
                {/* Left Column: Changed Attributes Diff */}
                <div className="space-y-3">
                  <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    <span>Modified Field Attributes ({changesList.length})</span>
                  </h4>

                  {changesList.length === 0 ? (
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-center space-y-1">
                      <p className="font-semibold text-slate-600">No field changes detected yet.</p>
                      <p className="text-[11px] text-slate-400">Values match the currently saved product state in database.</p>
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                      {changesList.map((ch, idx) => (
                        <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-1">
                          <div className="font-bold text-slate-800 text-[11px]">{ch.field}</div>
                          <div className="grid grid-cols-2 gap-2 text-[10px]">
                            <div className="p-1.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 line-through truncate" title={ch.before}>
                              <span className="font-mono text-[9px] block text-rose-500 uppercase">Before:</span>
                              {ch.before}
                            </div>
                            <div className="p-1.5 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-900 font-bold truncate" title={ch.after}>
                              <span className="font-mono text-[9px] block text-emerald-600 uppercase">After:</span>
                              {ch.after}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Right Column: Customer Storefront Card Mockup */}
                <div className="space-y-3">
                  <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                    <Eye className="w-4 h-4 text-emerald-600" />
                    <span>Customer Storefront Preview</span>
                  </h4>

                  <div className="p-4 bg-slate-100/70 border border-slate-200 rounded-3xl flex justify-center">
                    <div className="w-full max-w-[260px] bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm space-y-2.5 pb-3">
                      {/* Product Image & Badges */}
                      <div className="relative aspect-4/3 w-full bg-slate-50 overflow-hidden flex items-center justify-center p-2">
                        <img 
                          src={fullEditProduct.image || 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=600&q=80'} 
                          alt={fullEditProduct.name}
                          className="w-full h-full object-contain"
                        />
                        <div className="absolute top-2 left-2 flex flex-col gap-1">
                          {fullEditProduct.isPublished === false ? (
                            <span className="px-2 py-0.5 rounded-full bg-amber-500 text-white font-extrabold text-[9px] shadow-xs">
                              DRAFT (HIDDEN)
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white font-extrabold text-[9px] shadow-xs">
                              LIVE PUBLIC
                            </span>
                          )}
                        </div>
                        <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-black/60 text-white text-[9px] font-bold rounded-md backdrop-blur-xs">
                          {fullEditProduct.category}
                        </div>
                      </div>

                      {/* Details */}
                      <div className="px-3 space-y-1">
                        <div className="text-[10px] text-indigo-600 font-bold truncate">
                          {fullEditProduct.seller || fullEditProduct.artisan || 'Lebanese Artisan'}
                        </div>
                        <h5 className="font-extrabold text-slate-900 text-xs line-clamp-1">
                          {fullEditProduct.name}
                        </h5>
                        {fullEditProduct.arabicName && (
                          <div className="text-[11px] font-bold text-slate-500 line-clamp-1 dir-rtl text-right">
                            {fullEditProduct.arabicName}
                          </div>
                        )}

                        <div className="pt-1.5 flex items-center justify-between border-t border-slate-100">
                          <div>
                            <span className="text-sm font-black text-slate-900">${fullEditProduct.priceUSD}</span>
                            <span className="text-[10px] text-slate-400 block font-semibold">
                              ≈ {(fullEditProduct.priceUSD * LBP_USD_RATE).toLocaleString()} LBP
                            </span>
                          </div>

                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${fullEditProduct.stock > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                            {fullEditProduct.stock > 0 ? `${fullEditProduct.stock} in stock` : 'Out of stock'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Modal Footer Actions */}
              <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setIsPreviewEditModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
                >
                  Back to Editing
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      setIsPreviewEditModalOpen(false);
                      handleSaveFullProductEdit(e, false);
                    }}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl cursor-pointer shadow-xs"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Save as Draft (Private)</span>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      setIsPreviewEditModalOpen(false);
                      handleSaveFullProductEdit(e, true);
                    }}
                    className="flex items-center gap-1.5 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white font-bold text-xs rounded-xl cursor-pointer shadow-md"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    <span>Confirm & Publish Live</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
};

export default AdminView;