import { FirestoreDataConverter, QueryDocumentSnapshot, SnapshotOptions } from 'firebase/firestore';
import { Product, Seller, CategoryItem, Order, DiscountRule, ProductBundle } from '../types';

export const productConverter: FirestoreDataConverter<Product> = {
  toFirestore: (p: Product) => {
    const data: Record<string, any> = { ...p };
    delete data.id;
    return data;
  },
  fromFirestore: (snapshot: QueryDocumentSnapshot, options?: SnapshotOptions): Product => {
    const data = snapshot.data(options);
    return {
      id: snapshot.id,
      name: data.name || '',
      arabicName: data.arabicName,
      artisan: data.artisan || '',
      seller: data.seller,
      arabicSeller: data.arabicSeller,
      sellerId: data.sellerId,
      sellerActive: data.sellerActive,
      origin: data.origin || 'Lebanon',
      category: data.category || 'Pantry',
      priceUSD: typeof data.priceUSD === 'number' ? data.priceUSD : 0,
      originalPriceUSD: data.originalPriceUSD,
      discountPercentage: data.discountPercentage,
      rating: typeof data.rating === 'number' ? data.rating : 5,
      reviewsCount: typeof data.reviewsCount === 'number' ? data.reviewsCount : 0,
      image: data.image || '',
      additionalImages: Array.isArray(data.additionalImages) ? data.additionalImages : [],
      videoUrl: data.videoUrl,
      additionalVideos: Array.isArray(data.additionalVideos) ? data.additionalVideos : [],
      videos: Array.isArray(data.videos) ? data.videos : [],
      description: data.description || '',
      craftStory: data.craftStory || '',
      stock: typeof data.stock === 'number' ? data.stock : 0,
      isNewArrival: data.isNewArrival,
      isFeatured: data.isFeatured,
      isBestseller: data.isBestseller,
      isPublished: data.isPublished !== false,
      displayOrder: typeof data.displayOrder === 'number' ? data.displayOrder : 0,
      tags: Array.isArray(data.tags) ? data.tags : [],
      keywords: Array.isArray(data.keywords) ? data.keywords : [],
      arabicKeywords: Array.isArray(data.arabicKeywords) ? data.arabicKeywords : [],
      seoTitle: data.seoTitle,
      seoArabicTitle: data.seoArabicTitle,
      seoDescription: data.seoDescription,
      seoArabicDescription: data.seoArabicDescription,
      weightOrVolume: data.weightOrVolume,
      sellerItemCode: data.sellerItemCode,
      lowStockThreshold: data.lowStockThreshold,
      lowStockNotice: data.lowStockNotice,
      customStockLabel: data.customStockLabel,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt
    };
  }
};

export const sellerConverter: FirestoreDataConverter<Seller> = {
  toFirestore: (s: Seller) => {
    const data: Record<string, any> = { ...s };
    delete data.id;
    return data;
  },
  fromFirestore: (snapshot: QueryDocumentSnapshot, options?: SnapshotOptions): Seller => {
    const data = snapshot.data(options);
    return {
      id: snapshot.id,
      sellerCode: data.sellerCode,
      nameEn: data.nameEn || '',
      nameAr: data.nameAr,
      logoUrl: data.logoUrl,
      bannerImage: data.bannerImage,
      bioEn: data.bioEn,
      bioAr: data.bioAr,
      governorate: data.governorate,
      district: data.district,
      village: data.village,
      exactAddress: data.exactAddress,
      region: data.region,
      contactPhone: data.contactPhone,
      contactEmail: data.contactEmail,
      craftCategory: data.craftCategory,
      commissionPct: data.commissionPct,
      isActive: data.isActive !== false,
      hasAccount: data.hasAccount,
      accountEmail: data.accountEmail,
      accountUid: data.accountUid,
      createdAt: data.createdAt || new Date().toISOString(),
      updatedAt: data.updatedAt || new Date().toISOString()
    };
  }
};

export const categoryConverter: FirestoreDataConverter<CategoryItem> = {
  toFirestore: (c: CategoryItem) => {
    const data: Record<string, any> = { ...c };
    delete data.id;
    return data;
  },
  fromFirestore: (snapshot: QueryDocumentSnapshot, options?: SnapshotOptions): CategoryItem => {
    const data = snapshot.data(options);
    return {
      id: snapshot.id,
      nameEn: data.nameEn || '',
      nameAr: data.nameAr || '',
      icon: data.icon || 'Sparkles',
      description: data.description || '',
      descriptionAr: data.descriptionAr,
      subcategories: Array.isArray(data.subcategories) ? data.subcategories : [],
      bannerUrl: data.bannerUrl || '',
      arabicKeywords: Array.isArray(data.arabicKeywords) ? data.arabicKeywords : [],
      englishKeywords: Array.isArray(data.englishKeywords) ? data.englishKeywords : [],
      isPublished: data.isPublished !== false,
      displayOrder: typeof data.displayOrder === 'number' ? data.displayOrder : 0
    };
  }
};

export const orderConverter: FirestoreDataConverter<Order> = {
  toFirestore: (o: Order) => {
    const data: Record<string, any> = { ...o };
    delete data.id;
    return data;
  },
  fromFirestore: (snapshot: QueryDocumentSnapshot, options?: SnapshotOptions): Order => {
    const data = snapshot.data(options);
    return {
      id: snapshot.id,
      userId: data.userId,
      date: data.date || '',
      items: Array.isArray(data.items) ? data.items : [],
      shipping: data.shipping || { fullName: '', phone: '', address: '', governorate: '', city: '', deliverySpeed: 'standard' },
      paymentMethod: data.paymentMethod || 'cod_usd',
      currency: data.currency || 'USD',
      subtotalUSD: typeof data.subtotalUSD === 'number' ? data.subtotalUSD : 0,
      deliveryFeeUSD: typeof data.deliveryFeeUSD === 'number' ? data.deliveryFeeUSD : 0,
      discountUSD: data.discountUSD,
      totalUSD: typeof data.totalUSD === 'number' ? data.totalUSD : 0,
      totalLBP: typeof data.totalLBP === 'number' ? data.totalLBP : 0,
      status: data.status || 'pending',
      estimatedDelivery: data.estimatedDelivery || '',
      trackingNumber: data.trackingNumber || '',
      appliedCoupon: data.appliedCoupon,
      sellerIds: Array.isArray(data.sellerIds) ? data.sellerIds : [],
      productIds: Array.isArray(data.productIds) ? data.productIds : [],
      adminNotes: Array.isArray(data.adminNotes) ? data.adminNotes : []
    };
  }
};

export const discountConverter: FirestoreDataConverter<DiscountRule> = {
  toFirestore: (r: DiscountRule) => {
    const data: Record<string, any> = { ...r };
    delete data.id;
    return data;
  },
  fromFirestore: (snapshot: QueryDocumentSnapshot, options?: SnapshotOptions): DiscountRule => {
    const data = snapshot.data(options);
    return {
      id: snapshot.id,
      name: data.name || '',
      nameAr: data.nameAr,
      type: data.type || 'percentage',
      value: typeof data.value === 'number' ? data.value : 0,
      target: data.target || 'checkout',
      targetValue: data.targetValue,
      minPurchaseUSD: data.minPurchaseUSD,
      startDate: data.startDate,
      endDate: data.endDate,
      isActive: data.isActive !== false,
      isNewUserOnly: data.isNewUserOnly,
      buyQty: data.buyQty,
      getQty: data.getQty,
      getDiscountPercent: data.getDiscountPercent
    };
  }
};

export const bundleConverter: FirestoreDataConverter<ProductBundle> = {
  toFirestore: (b: ProductBundle) => {
    const data: Record<string, any> = { ...b };
    delete data.id;
    return data;
  },
  fromFirestore: (snapshot: QueryDocumentSnapshot, options?: SnapshotOptions): ProductBundle => {
    const data = snapshot.data(options);
    return {
      id: snapshot.id,
      name: data.name || '',
      nameAr: data.nameAr,
      description: data.description,
      descriptionAr: data.descriptionAr,
      productIds: Array.isArray(data.productIds) ? data.productIds : [],
      bundlePriceUSD: typeof data.bundlePriceUSD === 'number' ? data.bundlePriceUSD : 0,
      isActive: data.isActive !== false,
      badgeText: data.badgeText,
      badgeTextAr: data.badgeTextAr,
      startDate: data.startDate,
      endDate: data.endDate
    };
  }
};
