export type Currency = 'USD' | 'LBP';

export interface Product {
  id: string;
  name: string;
  arabicName?: string;
  brand?: string;
  artisan: string;
  seller?: string;
  arabicSeller?: string;
  sellerId?: string;
  sellerActive?: boolean;
  origin: string;
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
  isPublished?: boolean;
  displayOrder?: number;
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
  id: string;
  legacyId?: string;
  sellerCode?: string;
  nameEn: string;
  nameAr?: string;
  logoUrl?: string;
  bannerImage?: string;
  bioEn?: string;
  bioAr?: string;
  governorate?: string;
  district?: string;
  village?: string;
  exactAddress?: string;
  region?: string;
  contactPhone?: string;
  contactEmail?: string;
  craftCategory?: string;
  commissionPct?: number;
  isActive: boolean;
  hasAccount?: boolean;
  accountEmail?: string;
  accountUid?: string;
  createdAt?: string;
  updatedAt?: string;
}