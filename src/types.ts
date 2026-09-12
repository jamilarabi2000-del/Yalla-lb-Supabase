export type Currency = 'USD' | 'LBP';

export interface Product {
  id: string;
  name: string;
  arabicName?: string;
  artisan: string;
  seller?: string;
  arabicSeller?: string;
  sellerId?: string;
  sellerActive?: boolean;
  origin: string; // e.g. "Beirut Central", "Tripoli", "Koura", "Batroun"
  category: string;
  priceUSD: number;
  originalPriceUSD?: number;
  discountPercentage?: number;
  rating: number;
  reviewsCount: number;
  image: string;
  additionalImages?: string[];
  videoUrl?: string;
  additionalVideos?: string[];
  videos?: string[];
  description: string;
  craftStory: string;
  stock: number;
  isNewArrival?: boolean;
  isFeatured?: boolean;
  isBestseller?: boolean;
  isPublished?: boolean; // Admin can publish/hide individual products
  displayOrder?: number; // Custom merchandising rank/order in category and store
  sellerItemCode?: string;
  lowStockThreshold?: number;
  lowStockNotice?: string;
  customStockLabel?: string;
  costPriceUSD?: number;
  tags: string[];
  keywords?: string[];
  arabicKeywords?: string[];
  seoTitle?: string;
  seoArabicTitle?: string;
  seoDescription?: string;
  seoArabicDescription?: string;
  weightOrVolume?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProductPrivate {
  productId: string;
  sellerId?: string | null;
  sellerItemCode?: string;
  lowStockThreshold?: number;
  lowStockNotice?: string;
  customStockLabel?: string;
  costPriceUSD?: number;
  updatedAt?: string;
  migratedAt?: string;
}

export interface Seller {
  id: string;                  // slug: 'chouf-eco-soap'
  sellerCode?: string;         // unique code e.g. 'SLR-001'
  nameEn: string;
  nameAr?: string;
  logoUrl?: string;
  bannerImage?: string;
  bioEn?: string;
  bioAr?: string;
  governorate?: string;        // e.g. 'mount_lebanon'
  district?: string;           // e.g. 'Chouf'
  village?: string;            // e.g. 'Deir El Qamar'
  exactAddress?: string;       // e.g. 'Main Street, Cooperatives Bldg 2nd Floor'
  region?: string;             // matches LEBANON_REGIONS ids
  contactPhone?: string;       // WhatsApp coordination
  contactEmail?: string;
  craftCategory?: string;
  commissionPct?: number;      // if you take a cut
  isActive: boolean;           // master switch — hides ALL their products
  hasAccount?: boolean;        // linked access credential flag
  accountEmail?: string;
  accountUid?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryItem {
  id: string;
  nameEn: string;
  nameAr: string;
  icon: string;
  description: string;
  descriptionAr?: string;
  subcategories: string[];
  bannerUrl: string;
  arabicKeywords?: string[];
  englishKeywords?: string[];
  isPublished?: boolean;
  displayOrder?: number;
}

export interface TerroirRegion {
  id: string;
  nameEn: string;
  nameAr: string;
  majorCities: string[];
  expressAvailable: boolean;
  baseDeliveryUSD: number;
  estimatedTimeEn?: string;
  estimatedTimeAr?: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
  selectedOption?: string;
}

export interface ShippingDetails {
  fullName: string;
  firstName?: string;
  lastName?: string;
  phone: string; // WhatsApp number
  email: string;
  governorate: string; // Beirut, Mount Lebanon, North, South, Bekaa, Nabatieh, International
  city: string;
  village?: string; // e.g. Deir El Qamar
  street: string;
  building: string;
  floorApartment?: string;
  deliveryNotes?: string;
  deliverySpeed: 'standard' | 'express_beirut' | 'diaspora_air';
}

export type PaymentMethod = 'cod_usd' | 'cod_lbp' | 'wish_omt' | 'credit_card';

export type OrderStatus = 'pending' | 'confirmed' | 'crafting' | 'courier_assigned' | 'in_transit' | 'delivered' | 'cancelled' | 'returned';

export interface Order {
  id: string;
  userId?: string;
  sellerIds?: string[]; // linked sellers for access control
  productIds?: string[]; // denormalized product identifiers for review authorization
  date: string;
  items: CartItem[];
  shipping: ShippingDetails;
  paymentMethod: PaymentMethod;
  currency: Currency;
  subtotalUSD: number;
  deliveryFeeUSD: number;
  totalUSD: number;
  totalLBP: number;
  status: OrderStatus;
  estimatedDelivery: string;
  trackingNumber: string;
  discountUSD?: number;
  appliedCoupon?: string;
  adminNotes?: { id: string; text: string; author: string; createdAt: string }[];
}

export interface UserProfile {
  uid?: string;
  name: string;
  firstName?: string;
  lastName?: string;
  email: string;
  phone: string;
  avatar: string;
  defaultGovernorate: string;
  defaultCity: string;
  defaultAddress: string;
  defaultBuilding?: string;
  defaultNotes?: string;
  emailVerified?: boolean;
  isOtpVerified?: boolean;
  role?: 'customer' | 'seller' | 'admin';
  sellerId?: string;
}

export interface CMSOfferSlide {
  id: string;
  badge: string;
  badgeArabic?: string;
  title: string;
  titleArabic?: string;
  subtitle: string;
  subtitleArabic?: string;
  buttonText: string;
  buttonTextArabic?: string;
  targetUrl?: string;
  discountBadge?: string;
  discountBadgeArabic?: string;
  bgGradient: string;
  imageUrl?: string;
  desktopImageUrl?: string;
  mobileImageUrl?: string;
  bgVideoUrl?: string;
  isCustomSchoolLayout?: boolean;
  isCustomCrayolaLayout?: boolean;
  isCustomGlobalLayout?: boolean;
  imageZoom?: number;
  desktopImageZoom?: number;
  mobileImageZoom?: number;
  objectPosition?: string;
  desktopObjectPosition?: string;
  mobileObjectPosition?: string;
  imageFit?: 'cover' | 'contain' | 'fill';
  desktopImageFit?: 'cover' | 'contain' | 'fill';
  mobileImageFit?: 'cover' | 'contain' | 'fill';
  desktopAspectRatio?: '16:9' | '21:9' | '4:3' | 'auto';
  mobileAspectRatio?: '16:9' | '9:16' | '3:4' | '1:1' | 'auto';
  isPublished?: boolean;
  scheduleActive?: boolean;
  startDate?: string;
  endDate?: string;
}

export interface CMSNewsArticle {
  id: string;
  title: string;
  titleArabic?: string;
  excerpt: string;
  excerptArabic?: string;
  source: string;
  sourceArabic?: string;
  date: string;
  dateArabic?: string;
  imageUrl: string;
  tag: string;
  tagArabic?: string;
  readTime: string;
  readTimeArabic?: string;
  isPublished?: boolean;
}

export interface CMSNavTab {
  id: string;
  label: string;
  arabicLabel?: string;
  isPublished?: boolean;
}

export interface CMSHeroMediaItem {
  id: string;
  url: string; // Desktop / Default media URL
  mobileUrl?: string; // Dedicated Mobile (Vertical / Portrait) media URL
  type: 'image' | 'video';
  mobileType?: 'image' | 'video';
  title?: string;
  customTitle?: string;
  customTitleArabic?: string;
  customSubtitle?: string;
  customSubtitleArabic?: string;
  
  // Desktop View Controls (Widescreen 16:9 / 21:9)
  imageZoom?: number;
  objectPosition?: string;
  imageFit?: 'cover' | 'contain' | 'fill';
  desktopAspectRatio?: '16:9' | '21:9' | '4:3' | 'auto';

  // Mobile View Controls (Vertical / Portrait 9:16 / 3:4)
  mobileImageZoom?: number;
  mobileObjectPosition?: string;
  mobileImageFit?: 'cover' | 'contain' | 'fill';
  mobileAspectRatio?: '16:9' | '9:16' | '3:4' | '1:1' | 'auto';

  isPublished?: boolean;
  scheduleActive?: boolean;
  startDate?: string;
  endDate?: string;
}

export interface CMSThemeConfig {
  primaryColor: string;
  accentColor: string;
  fontFamily: 'plus_jakarta' | 'playfair' | 'inter' | 'tajawal' | 'cairo' | 'amiri';
  borderRadius: 'sm' | 'md' | 'xl' | 'full';
  headerStyle: 'modern' | 'classic' | 'minimal';
}

export interface CMSHeroStat {
  label: string;
  labelArabic?: string;
  value: string;
  valueArabic?: string;
  isPublished?: boolean;
}

export interface CMSCustomBlock {
  id: string;
  title: string;
  subtitle?: string;
  content: string; // HTML, rich text or description
  badge?: string;
  buttonText?: string;
  buttonTextArabic?: string;
  buttonUrl?: string;
  imageUrl?: string;
  bgStyle: 'dark' | 'light' | 'gold_gradient' | 'emerald_gradient' | 'custom_image' | 'glass';
  customBgColor?: string;
  customTextColor?: string;
  targetPage: 'home' | 'products' | 'checkout' | 'account' | 'product_detail' | 'all';
  position: 'top' | 'middle' | 'bottom';
  isPublished: boolean;
  order: number;
}

export interface CMSPromoSlide {
  id: string;
  isPublished?: boolean;
  type?: 'custom' | 'product_promotion' | 'category_promotion' | 'image_only' | 'text_only';
  badge?: string;
  badgeArabic?: string;
  title?: string;
  titleArabic?: string;
  description?: string;
  descriptionArabic?: string;
  imageUrl?: string;
  imageFit?: 'cover' | 'contain' | 'fill';
  bgStyle?: 'default' | 'dark' | 'light' | 'gold_gradient' | 'emerald_gradient' | 'custom_color';
  customBgColor?: string;
  customTextColor?: string;
  showCta?: boolean;
  ctaText?: string;
  ctaTextArabic?: string;
  ctaUrl?: string;
  ctaType?: 'button' | 'link';
  targetCategory?: string;
  selectedProductId?: string;
  selectedProductIds?: string[];
  contentAlignment?: 'left' | 'center' | 'right';
  scheduleActive?: boolean;
  startDate?: string;
  endDate?: string;
  order?: number;
}

export interface CMSPromoSliderConfig {
  id?: string;
  enabled?: boolean;
  autoplay?: boolean;
  autoplayInterval?: number; // In milliseconds, default 5000
  showArrows?: boolean;
  showDots?: boolean;
  loop?: boolean;
  transitionEffect?: 'slide' | 'fade';
  slides?: CMSPromoSlide[];
  
  // Single slide backward-compatibility fields:
  type?: 'custom' | 'product_promotion' | 'category_promotion' | 'image_only' | 'text_only';
  badge?: string;
  badgeArabic?: string;
  title?: string;
  titleArabic?: string;
  description?: string;
  descriptionArabic?: string;
  imageUrl?: string;
  imageFit?: 'cover' | 'contain' | 'fill';
  bgStyle?: 'default' | 'dark' | 'light' | 'gold_gradient' | 'emerald_gradient' | 'custom_color';
  customBgColor?: string;
  customTextColor?: string;
  showCta?: boolean;
  ctaText?: string;
  ctaTextArabic?: string;
  ctaUrl?: string;
  ctaType?: 'button' | 'link';
  targetCategory?: string;
  selectedProductId?: string;
  selectedProductIds?: string[];
  contentAlignment?: 'left' | 'center' | 'right';
  isPublished?: boolean;
  scheduleActive?: boolean;
  startDate?: string;
  endDate?: string;
}

export type CMSPromoBannerConfig = CMSPromoSliderConfig;

export interface SectionVisibilityConfig {
  // Global & Navbar
  announcementTicker: boolean;
  phoneSupport: boolean;
  navbarSearch: boolean;
  currencySwitcher: boolean;
  languageSwitcher: boolean;
  
  // Home Page
  homeHero: boolean;
  homePromoBanner?: boolean;
  homeCategories: boolean;
  homeOffers: boolean;
  homeFeatured: boolean;
  homeTrustBadges: boolean;
  homeDeals: boolean;
  homeNewArrivals: boolean;
  homeHeritage: boolean;
  homeReviews: boolean;
  homeNewsletter: boolean;
  homeNews: boolean;
  
  // Products Page
  productsHeader: boolean;
  productsSearchFilter: boolean;
  productsCategoryTabs: boolean;
  productsSort: boolean;
  productsGrid: boolean;
  
  // Product Detail Page
  detailBreadcrumbs: boolean;
  detailGallery: boolean;
  detailPriceBox: boolean;
  detailArtisanBio: boolean;
  detailCraftStory: boolean;
  detailWhatsAppInquiry: boolean;
  detailCustomerReviews: boolean;
  detailRelatedProducts: boolean;
  
  // Checkout Page
  checkoutSteps: boolean;
  checkoutAddressForm: boolean;
  checkoutDeliverySpeed: boolean;
  checkoutPaymentMethod: boolean;
  checkoutOrderSummary: boolean;
  checkoutGuarantees: boolean;
  
  // Account Page
  accountOrders: boolean;
  accountProfile: boolean;
  accountWishlist: boolean;
  accountSupportCard: boolean;
  
  // Footer
  footerAbout: boolean;
  footerQuickLinks: boolean;
  footerContact: boolean;
  footerSocial: boolean;
  footerCopyright: boolean;
}

export interface SiteContent {
  theme?: CMSThemeConfig;
  seo?: {
    title: string;
    arabicTitle?: string;
    description: string;
    arabicDescription?: string;
    keywords?: string[];
    arabicKeywords?: string[];
    faviconUrl?: string;
    ogImageUrl?: string;
  };
  visibility: SectionVisibilityConfig;
  customBlocks: CMSCustomBlock[];
  navbar: {
    logoUrl?: string;
    faviconUrl?: string;
    announcementTicker: string;
    announcementTickerArabic?: string;
    brandName: string;
    brandNameArabic?: string;
    brandSubtitle: string;
    brandSubtitleArabic?: string;
    phoneSupport: string;
    searchPlaceholder: string;
    searchPlaceholderArabic?: string;
    navTabs: CMSNavTab[];
  };
  hero: {
    badgeText: string;
    badgeTextArabic?: string;
    title: string;
    titleArabic?: string;
    subtitle: string;
    subtitleArabic?: string;
    primaryBtnText: string;
    primaryBtnTextArabic?: string;
    secondaryBtnText: string;
    secondaryBtnTextArabic?: string;
    targetUrl?: string;
    bgImageUrl?: string;
    mobileBgImageUrl?: string;
    bgImageUrls?: string[];
    bgVideoUrl?: string;
    mobileBgVideoUrl?: string;
    bgVideoUrls?: string[];
    bgMediaItems?: CMSHeroMediaItem[];
    defaultImageFit?: 'contain' | 'cover' | 'fill';
    desktopAspectRatio?: '16:9' | '21:9' | '4:3' | 'auto';
    mobileAspectRatio?: '16:9' | '9:16' | '3:4' | '1:1' | 'auto';
    desktopHeroHeight?: string;
    mobileHeroHeight?: string;
    slideInterval?: number;
    overlayOpacity?: number;
    stats: CMSHeroStat[];
  };
  offers: {
    sectionTag?: string;
    sectionTagArabic?: string;
    sectionBadge?: string;
    sectionBadgeArabic?: string;
    sectionTitle: string;
    sectionTitleArabic?: string;
    sectionSubtitle: string;
    sectionSubtitleArabic?: string;
    slides: CMSOfferSlide[];
  };
  promoBanner?: CMSPromoBannerConfig;
  home: {
    featuredTitle: string;
    featuredTitleArabic?: string;
    featuredSubtitle: string;
    featuredSubtitleArabic?: string;
    featuredDescription?: string;
    featuredDescriptionArabic?: string;
    dealsTitle?: string;
    dealsTitleArabic?: string;
    dealsSubtitle?: string;
    dealsSubtitleArabic?: string;
    dealsDescription?: string;
    dealsDescriptionArabic?: string;
    newArrivalsTitle?: string;
    newArrivalsTitleArabic?: string;
    newArrivalsSubtitle?: string;
    newArrivalsSubtitleArabic?: string;
    categoriesTitle?: string;
    categoriesTitleArabic?: string;
    categoriesSubtitle?: string;
    categoriesSubtitleArabic?: string;
    regionsTitle: string;
    regionsTitleArabic?: string;
    regionsSubtitle: string;
    regionsSubtitleArabic?: string;
    artisansTitle: string;
    artisansTitleArabic?: string;
    artisansSubtitle: string;
    artisansSubtitleArabic?: string;
    heritageTitle: string;
    heritageTitleArabic?: string;
    heritageText: string;
    heritageTextArabic?: string;
    reviewsTitle: string;
    reviewsTitleArabic?: string;
    reviewsSubtitle: string;
    reviewsSubtitleArabic?: string;
    newsletterTitle: string;
    newsletterTitleArabic?: string;
    newsletterSubtitle: string;
    newsletterSubtitleArabic?: string;
    newsletterButtonText: string;
    newsletterButtonTextArabic?: string;
    bundlesTitle?: string;
    bundlesTitleArabic?: string;
    bundlesSubtitle?: string;
    bundlesSubtitleArabic?: string;
    bundlesBadge?: string;
    bundlesBadgeArabic?: string;
    bundlesDescription?: string;
    bundlesDescriptionArabic?: string;
    trustBadgesTitle?: string;
    trustBadgesTitleArabic?: string;
    trustBadgesSubtitle?: string;
    trustBadgesSubtitleArabic?: string;
    sectionOrder?: string[];
  };
  productsPage: {
    title: string;
    titleArabic?: string;
    subtitle: string;
    subtitleArabic?: string;
    searchPlaceholder: string;
    searchPlaceholderArabic?: string;
    filterAllLabel: string;
    filterAllLabelArabic?: string;
    noProductsText: string;
    noProductsTextArabic?: string;
  };
  productDetailPage: {
    inquiryWhatsAppNumber: string;
    inquiryText: string;
    inquiryTextArabic?: string;
    authenticityGuaranteeText: string;
    authenticityGuaranteeTextArabic?: string;
    freeDeliveryBadgeText: string;
    freeDeliveryBadgeTextArabic?: string;
    returnsPolicyText: string;
    returnsPolicyTextArabic?: string;
    craftStoryTitle: string;
    craftStoryTitleArabic?: string;
    relatedItemsTitle: string;
    relatedItemsTitleArabic?: string;
  };
  checkoutPage: {
    title: string;
    titleArabic?: string;
    subtitle: string;
    subtitleArabic?: string;
    shippingHeading: string;
    shippingHeadingArabic?: string;
    paymentHeading: string;
    paymentHeadingArabic?: string;
    summaryHeading: string;
    summaryHeadingArabic?: string;
    orderButtonText: string;
    orderButtonTextArabic?: string;
    guaranteeBadgeText: string;
    guaranteeBadgeTextArabic?: string;
  };
  checkoutSuccessPage?: {
    successBadge: string;
    successBadgeArabic?: string;
    successTitle: string;
    successTitleArabic?: string;
    nextStepsHeading: string;
    nextStepsHeadingArabic?: string;
    step1Text: string;
    step1TextArabic?: string;
    step2Text: string;
    step2TextArabic?: string;
    step3Text: string;
    step3TextArabic?: string;
    buttonTrackText: string;
    buttonTrackTextArabic?: string;
    buttonContinueText: string;
    buttonContinueTextArabic?: string;
  };
  accountPage: {
    title: string;
    titleArabic?: string;
    subtitle: string;
    subtitleArabic?: string;
    ordersTabLabel: string;
    ordersTabLabelArabic?: string;
    profileTabLabel: string;
    profileTabLabelArabic?: string;
    wishlistTabLabel: string;
    wishlistTabLabelArabic?: string;
  };
  newsSection: {
    title: string;
    titleArabic?: string;
    subtitle: string;
    subtitleArabic?: string;
    articles: CMSNewsArticle[];
  };
  socialLinks: {
    instagram: string;
    facebook: string;
    whatsapp: string;
    email: string;
    phone: string;
  };
  footer: {
    aboutTitle: string;
    aboutTitleArabic?: string;
    aboutText: string;
    aboutTextArabic?: string;
    quickLinksTitle: string;
    quickLinksTitleArabic?: string;
    contactTitle: string;
    contactTitleArabic?: string;
    phone: string;
    email: string;
    address: string;
    addressArabic?: string;
    hours: string;
    hoursArabic?: string;
    copyrightText: string;
    copyrightTextArabic?: string;
  };
}

export interface RecentActivity {
  id: string;
  timestamp: string; // ISO 8601 string
  actionType: 'product_add' | 'product_update' | 'product_delete' | 'order_status' | 'order_delete' | 'meta_change' | 'cms_update' | 'category_create' | 'category_update' | 'category_delete' | 'region_update' | 'product_bulk_update';
  summary: string;
  details: string;
  adminEmail: string;
  targetId?: string;
  snapshotBefore?: any;
  snapshotAfter?: any;
  isUndone?: boolean;
  undoneAt?: string;
}

export interface Review {
  id: string;
  productId: string;
  userId: string;
  userName: string;
  rating: number;
  comment: string;
  createdAt: string; // ISO timestamp string
  orderId?: string;
  adminReply?: string;
  adminReplyAt?: string;
}

export interface DiscountRule {
  id: string;
  name: string;
  nameAr?: string;
  type: 'percentage' | 'fixed' | 'bogo';
  value: number; // e.g. 15 for 15%, 5 for $5, or 100 for 100% free BOGO / 50 for 50% off second item
  target: 'all' | 'checkout' | 'product' | 'category' | 'seller' | 'brand';
  targetValue?: string; // specific product id, category id/name, artisan/seller name, or origin/brand name
  isActive: boolean;
  minPurchaseUSD?: number;
  startDate?: string; // ISO date-time string e.g. "2026-08-20T00:00"
  endDate?: string;   // ISO date-time string e.g. "2026-08-31T23:59"
  isNewUserOnly?: boolean; // True if rule applies only to new users
  // BOGO / Buy X Get Y specific parameters
  buyQty?: number; // e.g. 1 in Buy 1 Get 1, or 2 in Buy 2 Get 1
  getQty?: number; // e.g. 1 in Buy 1 Get 1 or Buy 2 Get 1
  getDiscountPercent?: number; // discount on the Y items (e.g. 100 for 100% Free, or 50 for 50% off)
}

export interface Coupon {
  id: string; // usually matches the discountId
  discountId: string;
  couponCode: string;
  maxTotalUses?: number;
  maxUsesPerUser?: number;
  usageCount: number;
  usedBy?: string[];
}

export interface SearchLog {
  id: string;
  query: string;
  timestamp: string;
  userId?: string | null;
  userEmail?: string | null;
  userName?: string | null;
  origin?: 'navbar' | 'products_page' | 'mobile_menu' | 'direct';
}

export interface ProductBundle {
  id: string;
  name: string;
  nameAr?: string;
  description?: string;
  descriptionAr?: string;
  badgeText?: string;
  badgeTextAr?: string;
  imageUrl?: string;
  productIds: string[];
  bundlePriceUSD: number;
  isActive: boolean;
  showInSlider?: boolean;
  showButtonInSlider?: boolean;
  sliderButtonText?: string;
  sliderButtonTextAr?: string;
  startDate?: string;
  endDate?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SellerApplication {
  id: string;
  sellerCompany: string;
  workshopName?: string; // backwards compatibility alias for sellerCompany
  workshopNameAr?: string;
  firstName: string;
  middleName: string;
  lastName: string;
  contactName?: string;
  phone: string;
  email: string;
  craftCategory?: string;
  governorate?: string;
  village?: string;
  bio?: string;
  socialLink?: string;
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
  submittedAt: string;
  approvedAt?: string;
  reviewedAt?: string;
  createdSellerId?: string;
}




