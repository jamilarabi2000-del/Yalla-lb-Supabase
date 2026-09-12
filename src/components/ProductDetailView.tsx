import React, { useState, useEffect } from 'react';
import { useShop } from '../context/ShopContext';
import { ProductCard } from './ProductCard';
import { CustomBlocksRenderer } from './CustomBlocksRenderer';
import { Review } from '../types';
import { db, IS_FIREBASE_ENABLED } from '../firebase';
import { collection, query, where, getDocs, doc, setDoc, onSnapshot } from 'firebase/firestore';
import { 
  ArrowLeft, 
  ShoppingBag, 
  Heart, 
  MapPin, 
  Check, 
  Sparkles, 
  ShieldCheck, 
  Truck, 
  RotateCcw,
  Minus,
  Plus,
  Share2,
  MessageCircle,
  EyeOff,
  Play,
  Video
} from 'lucide-react';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null, userId?: string | null) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errInfo = {
    error: errorMessage,
    authInfo: {
      userId,
      email: null,
      emailVerified: null,
      isAnonymous: null,
      tenantId: null,
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(`Database error during ${operationType} on ${path || 'unknown'}: ${errorMessage}`);
}

export const ProductDetailView: React.FC = () => {
  const { 
    selectedProductDetail, 
    setSelectedProductDetail,
    formatPrice, 
    addToCart, 
    toggleWishlist, 
    isInWishlist,
    products,
    goBack,
    t,
    language,
    siteContent,
    isVisualEditMode,
    firebaseUser,
    user,
    setActiveTab,
    setSearchQuery,
    setSelectedCategory,
    orders
  } = useShop();

  const [quantity, setQuantity] = useState(1);
  const [justAdded, setJustAdded] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [activeMediaType, setActiveMediaType] = useState<'image' | 'video'>('image');
  const [activeVideoUrl, setActiveVideoUrl] = useState<string | null>(null);

  const [reviews, setReviews] = useState<Review[]>([]);
  const [isLoadingReviews, setIsLoadingReviews] = useState(false);
  const [ratingInput, setRatingInput] = useState(5);
  const [commentInput, setCommentInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const [copiedLink, setCopiedLink] = useState(false);

  const visibility = siteContent.visibility || {
    detailBreadcrumbs: true,
    detailGallery: true,
    detailPriceBox: true,
    detailArtisanBio: true,
    detailCraftStory: true,
    detailWhatsAppInquiry: true,
    detailCustomerReviews: true,
    detailRelatedProducts: true
  };

  // Resolve the live product record by ID from the products state to prevent stale snapshots
  const liveProduct = products.find(p => p.id === selectedProductDetail?.id) || selectedProductDetail;
  const product = liveProduct;

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    setSelectedImage(null);
    setQuantity(1);
  }, [selectedProductDetail?.id]);

  if (!product) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-8 bg-[#F8F8F6] text-[#171717] space-y-4">
        <h2 className="text-xl font-bold">Product Not Found</h2>
        <button
          onClick={goBack}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#171717] hover:bg-[#8F7137] text-white rounded-lg text-xs font-bold uppercase tracking-wider cursor-pointer transition-colors shadow-2xs"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t('backToProducts')}</span>
        </button>
      </div>
    );
  }

  // Load reviews in realtime from Firestore
  useEffect(() => {
    setIsLoadingReviews(true);
    setSubmitError(null);
    setSubmitSuccess(false);

    if (!IS_FIREBASE_ENABLED) {
      setReviews([]);
      setIsLoadingReviews(false);
      return;
    }

    const q = query(collection(db, 'reviews'), where('productId', '==', product.id));
    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const fbReviews: Review[] = [];
        querySnapshot.forEach((docSnap) => {
          const data = docSnap.data();
          fbReviews.push({
            id: docSnap.id,
            productId: data.productId,
            userId: data.userId,
            userName: data.userName,
            rating: Number(data.rating) || 0,
            comment: data.comment,
            createdAt: data.createdAt,
            orderId: data.orderId,
            adminReply: data.adminReply || data.reply,
            adminReplyAt: data.adminReplyAt
          });
        });

        // Sort newest first
        fbReviews.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        setReviews(fbReviews);
        setIsLoadingReviews(false);
      },
      (err) => {
        console.warn("[ProductDetailView] Failed to listen to reviews in realtime:", err.message);
        setReviews([]);
        setIsLoadingReviews(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [product.id, language]);

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    const comment = commentInput.trim();
    if (!comment) return;

    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(false);

    // M-1: Protect user privacy, do not split/disclose unverified email addresses as usernames
    const userName = user?.firstName && user?.lastName
      ? `${user.firstName} ${user.lastName}`
      : (user?.name && !user.name.includes('@')
         ? user.name
         : (language === 'ar' ? 'مشتري موثق' : 'Verified Buyer'));

    if (IS_FIREBASE_ENABLED && !firebaseUser) {
      setSubmitError(
        language === 'ar'
          ? 'يجب تسجيل الدخول لتقديم مراجعة.'
          : 'You must be signed in to submit a review.'
      );
      setIsSubmitting(false);
      return;
    }

    // M-1: Bind reviews to fulfilled delivered orders and to one per customer per product
    const matchedOrder = orders.find(o => 
      o.status === 'delivered' &&
      o.items.some(item => item.product.id === product.id)
    );

    if (IS_FIREBASE_ENABLED && !matchedOrder) {
      setSubmitError(
        language === 'ar'
          ? 'عذراً، يمكنك فقط تقييم المنتجات بعد استلام الطلب وتوصيله بنجاح.'
          : 'You can only review products from orders that have been successfully delivered.'
      );
      setIsSubmitting(false);
      return;
    }

    const newReviewId = firebaseUser ? `${firebaseUser.uid}_${product.id}` : `rev-${Date.now()}`;
    const nowIso = new Date().toISOString();
    const orderIdToUse = matchedOrder?.id || '';

    if (!IS_FIREBASE_ENABLED) {
      const newReview: Review = {
        id: newReviewId,
        productId: product.id,
        userId: firebaseUser?.uid || 'guest-uid',
        userName,
        rating: ratingInput,
        comment,
        createdAt: nowIso,
        orderId: orderIdToUse
      };
      setReviews(prev => [newReview, ...prev.filter(r => r.id !== newReviewId)]);
      setCommentInput('');
      setRatingInput(5);
      setSubmitSuccess(true);
      setIsSubmitting(false);
      return;
    }

    try {
      // Step 1: Write to review_private first (contains userId and orderId required by rules)
      const privateData = {
        id: newReviewId,
        reviewId: newReviewId,
        userId: firebaseUser!.uid,
        orderId: orderIdToUse,
        productId: product.id,
        createdAt: nowIso,
        updatedAt: nowIso
      };
      await setDoc(doc(db, 'review_private', newReviewId), privateData);

      // Step 2: Write public review document WITHOUT userId or orderId
      const publicData = {
        id: newReviewId,
        productId: product.id,
        userName,
        rating: ratingInput,
        comment,
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        createdAt: nowIso,
        updatedAt: nowIso
      };
      await setDoc(doc(db, 'reviews', newReviewId), publicData);

      const newReview: Review = {
        id: newReviewId,
        productId: product.id,
        userId: firebaseUser!.uid,
        userName,
        rating: ratingInput,
        comment,
        createdAt: nowIso,
        orderId: orderIdToUse
      };

      setReviews(prev => [newReview, ...prev.filter(r => r.id !== newReviewId)]);
      setCommentInput('');
      setRatingInput(5);
      setSubmitSuccess(true);
    } catch (err: any) {
      console.error("[ProductDetailView] Error posting review:", err);
      try {
        handleFirestoreError(err, OperationType.WRITE, `reviews/${newReviewId}`, firebaseUser?.uid);
      } catch (logErr: any) {
        setSubmitError(logErr.message || (language === 'ar' ? 'فشل حفظ التقييم.' : 'Failed to submit review.'));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalReviewsCount = reviews.length;
  const userReviews = reviews.filter(r => !r.id.startsWith('mock-'));
  const hasReviews = reviews.length > 0;
  const averageRating = hasReviews 
    ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
    : '0.0';

  const stockQty = typeof product.stock === 'number' ? product.stock : 0;
  const lowThreshold = typeof product.lowStockThreshold === 'number' ? product.lowStockThreshold : 5;
  const isLowStock = stockQty > 0 && stockQty <= lowThreshold;
  const isOutOfStock = stockQty <= 0;

  const isLiked = isInWishlist(product.id);
  const currentImage = selectedImage || product.image;

  // All image options
  const allImages = [product.image, ...(product.additionalImages || [])].filter(Boolean);
  const allVideos = (product.videos && product.videos.length > 0)
    ? product.videos.filter(Boolean)
    : (product.videoUrl ? [product.videoUrl] : []).filter(Boolean);

  const getVideoEmbedInfo = (url?: string) => {
    if (!url) return null;
    const trimmed = url.trim();
    const ytMatch = trimmed.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
    if (ytMatch && ytMatch[1]) {
      return { type: 'youtube' as const, embedUrl: `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1&rel=0` };
    }
    const vimeoMatch = trimmed.match(/vimeo\.com\/(?:channels\/(?:\w+\/)?|groups\/([^\/]*)\/videos\/|album\/(\d+)\/video\/|)(\d+)/i);
    if (vimeoMatch && vimeoMatch[3]) {
      return { type: 'vimeo' as const, embedUrl: `https://player.vimeo.com/video/${vimeoMatch[3]}?autoplay=1` };
    }
    if (trimmed.startsWith('https://') || trimmed.startsWith('http://') || trimmed.startsWith('/')) {
      return { type: 'direct' as const, embedUrl: trimmed };
    }
    return null;
  };

  const currentVideoUrl = activeVideoUrl || allVideos[0] || null;
  const currentVideoEmbed = getVideoEmbedInfo(currentVideoUrl || undefined);

  // Related products from same category or random
  const relatedProducts = products
    .filter(p => p.id !== product.id && (p.category === product.category || p.origin === product.origin) && p.isPublished !== false)
    .slice(0, 4);

  const handleAddToCart = () => {
    addToCart(product, quantity);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1600);
  };

  const displayTitle = language === 'ar' ? (product.arabicName || product.name) : product.name;

  const handleWhatsAppInquiry = () => {
    const phone = siteContent.productDetailPage?.inquiryWhatsAppNumber ?? '96170889234';
    const text = encodeURIComponent(
      `Hello Yalla-lb! I am interested in inquiring about "${displayTitle}" (ID: ${product.id}) priced at $${product.priceUSD}. Can you please assist me?`
    );
    window.open(`https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=${text}`, '_blank', 'noopener,noreferrer');
  };

  const discoverSellerProducts = (artisan: string) => {
    setSearchQuery(artisan);
    setSelectedCategory('all');
    setSelectedProductDetail(null);
    setActiveTab('products');
  };

  return (
    <div className="min-h-screen bg-[#F8F8F6] text-[#171717] pb-20 pt-4 sm:pt-6">
      
      {/* Top Custom Divs / Banners */}
      <CustomBlocksRenderer page="product_detail" position="top" />

      {/* Top Header Navigation Bar with Prominent Back Button */}
      {(visibility.detailBreadcrumbs || isVisualEditMode) && (
        <div className="bg-white/90 backdrop-blur-md border-b border-[#E5E5E5] sticky top-[72px] z-30 shadow-2xs">
          <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between gap-4">
            <button
              id="product-detail-back-btn"
              onClick={goBack}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-[#F8F8F6] hover:bg-slate-200 text-[#171717] text-xs font-bold transition-all cursor-pointer border border-[#E5E5E5]"
            >
              <ArrowLeft className={`w-3.5 h-3.5 ${language === 'ar' ? 'rotate-180' : ''}`} />
              <span>{t('back')}</span>
            </button>

            <div className="flex items-center gap-2 text-xs font-medium text-[#737373] truncate max-w-md">
              <span className="hover:text-[#8F7137] cursor-pointer" onClick={goBack}>{t(product.category === 'all' ? 'cat_all' : (`cat_${product.category}` as any))}</span>
              <span>/</span>
              <span className="font-bold text-[#171717] truncate">{displayTitle}</span>
            </div>

            <button
              onClick={() => {
                if (navigator.share) {
                  navigator.share({ title: displayTitle, url: window.location.href }).catch(() => {});
                } else {
                  navigator.clipboard.writeText(window.location.href);
                  setCopiedLink(true);
                  setTimeout(() => setCopiedLink(false), 2000);
                }
              }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#737373] hover:text-[#171717] hover:bg-[#F8F8F6] transition-colors cursor-pointer border border-[#E5E5E5]"
              title="Share product"
            >
              {copiedLink ? (
                <>
                  <Check className="w-3.5 h-3.5 text-[#16803C]" />
                  <span className="text-[#16803C] text-[11px] font-bold">{language === 'ar' ? 'تم النسخ' : 'Copied!'}</span>
                </>
              ) : (
                <>
                  <Share2 className="w-3.5 h-3.5" />
                  <span className="text-[11px]">{language === 'ar' ? 'مشاركة' : 'Share'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Main Product Details Section */}
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
          
          {/* Left Column: Image & Video Media Gallery */}
          {(visibility.detailGallery || isVisualEditMode) && (
            <div className="lg:col-span-6 space-y-4">
              <div className="relative aspect-square w-full rounded-2xl overflow-hidden bg-[#F8F8F6] border border-[#E5E5E5] shadow-xs flex items-center justify-center p-6">
                {activeMediaType === 'video' && currentVideoEmbed ? (
                  currentVideoEmbed.type === 'youtube' || currentVideoEmbed.type === 'vimeo' ? (
                    <iframe
                      src={currentVideoEmbed.embedUrl}
                      title={`${displayTitle} Video`}
                      className="w-full h-full border-0 rounded-xl"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                    />
                  ) : (
                    <video
                      src={currentVideoEmbed.embedUrl}
                      controls
                      autoPlay
                      className="w-full h-full object-contain rounded-xl bg-black"
                    />
                  )
                ) : (
                  <img
                    src={currentImage}
                    alt={displayTitle}
                    className="w-full h-full object-contain object-center transition-all duration-300 drop-shadow-xs"
                    referrerPolicy="no-referrer"
                  />
                )}

                {/* Wishlist Floating Button */}
                <button
                  onClick={() => toggleWishlist(product.id)}
                  className={`absolute top-4 right-4 p-3 rounded-full transition-all z-10 cursor-pointer shadow-md ${
                    isLiked 
                      ? 'bg-rose-50 text-rose-600 border border-rose-200' 
                      : 'bg-white text-slate-700 hover:text-rose-600 hover:bg-white border border-[#E5E5E5]'
                  }`}
                >
                  <Heart className={`w-5 h-5 ${isLiked ? 'fill-current text-rose-600' : ''}`} />
                </button>

                {/* Badges */}
                <div className="absolute top-4 left-4 flex flex-col gap-1.5 z-10 pointer-events-none">
                  {product.discountPercentage && (
                    <span className="px-2.5 py-1 text-xs font-black uppercase tracking-wider bg-[#C62828] text-white rounded-md shadow-xs">
                      -{product.discountPercentage}%
                    </span>
                  )}
                  {product.isBestseller && (
                    <span className="px-2.5 py-1 text-xs font-bold uppercase tracking-wider bg-[#16803C] text-white rounded-md shadow-xs">
                      {t('bestseller')}
                    </span>
                  )}
                  {allVideos.length > 0 && activeMediaType === 'image' && (
                    <span className="px-2.5 py-1 text-xs font-bold uppercase tracking-wider bg-slate-900 text-white rounded-md shadow-xs flex items-center gap-1">
                      <Video className="w-3 h-3" />
                      Video Available
                    </span>
                  )}
                </div>
              </div>

              {/* Multimedia Thumbnail Selector (Images + Videos) */}
              {(allImages.length > 1 || allVideos.length > 0) && (
                <div className="flex items-center gap-3 overflow-x-auto pb-2">
                  {allImages.map((img, index) => (
                    <button
                      key={`img-${index}`}
                      onClick={() => {
                        setSelectedImage(img);
                        setActiveMediaType('image');
                      }}
                      className={`relative w-20 h-20 rounded-xl overflow-hidden border-2 flex-shrink-0 cursor-pointer transition-all ${
                        activeMediaType === 'image' && currentImage === img 
                          ? 'border-[#B89753] shadow-xs scale-102 ring-2 ring-[#B89753]/20' 
                          : 'border-[#E5E5E5] bg-[#F8F8F6] opacity-75 hover:opacity-100'
                      }`}
                    >
                      <img src={img} alt={`Thumbnail ${index + 1}`} className="w-full h-full object-contain p-1" referrerPolicy="no-referrer" />
                    </button>
                  ))}

                  {allVideos.map((vid, index) => (
                    <button
                      key={`vid-${index}`}
                      onClick={() => {
                        setActiveVideoUrl(vid);
                        setActiveMediaType('video');
                      }}
                      className={`relative w-20 h-20 rounded-xl overflow-hidden border-2 flex-shrink-0 cursor-pointer transition-all bg-slate-900 flex flex-col items-center justify-center text-white ${
                        activeMediaType === 'video' && currentVideoUrl === vid 
                          ? 'border-[#B89753] shadow-xs scale-102 ring-2 ring-[#B89753]/30' 
                          : 'border-slate-300 opacity-80 hover:opacity-100'
                      }`}
                      title={`Play Video ${index + 1}`}
                    >
                      <div className="w-7 h-7 rounded-full bg-[#B89753] flex items-center justify-center shadow-xs">
                        <Play className="w-3.5 h-3.5 text-white fill-current ml-0.5" />
                      </div>
                      <span className="text-[9px] font-bold uppercase tracking-wider mt-1 text-slate-200">Video</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Right Column: Product Meta, Price & Action */}
          <div className="lg:col-span-6 space-y-6">
            
            <div className="space-y-3 pb-6 border-b border-[#E5E5E5]">
              {/* Main Product Title */}
              <h1 className="text-2xl sm:text-3xl font-extrabold text-[#171717] leading-tight">
                {displayTitle}
              </h1>

              {/* Dynamic Average Star Rating Summary */}
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {hasReviews ? (
                  <>
                    <div className="flex items-center text-amber-500 gap-0.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <svg
                          key={star}
                          className={`w-4 h-4 fill-current ${
                            star <= Math.round(Number(averageRating)) ? 'text-amber-500' : 'text-slate-200'
                          }`}
                          viewBox="0 0 20 20"
                        >
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      ))}
                    </div>
                    <span className="text-xs font-bold text-[#8F7137] bg-amber-50 border border-amber-200/70 px-2 py-0.5 rounded-lg">
                      {averageRating} / 5.0
                    </span>
                    <span className="text-xs text-[#737373]">
                      ({totalReviewsCount} {language === 'ar' ? 'تقييم' : 'reviews'})
                    </span>
                  </>
                ) : (
                  <>
                    <div className="flex items-center text-slate-200 gap-0.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <svg
                          key={star}
                          className="w-4 h-4 fill-current text-slate-200"
                          viewBox="0 0 20 20"
                        >
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      ))}
                    </div>
                    <span className="text-xs font-medium text-[#737373] bg-[#F8F8F6] border border-[#E5E5E5] px-2 py-0.5 rounded-lg">
                      {language === 'ar' ? 'لا توجد تقييمات بعد' : 'No reviews yet'}
                    </span>
                    <span className="text-xs text-slate-400">
                      (0 {language === 'ar' ? 'تقييم' : 'reviews'})
                    </span>
                  </>
                )}
              </div>

              {/* Artisan Name */}
              {(visibility.detailArtisanBio || isVisualEditMode) && (
                <div className="text-xs sm:text-sm text-[#737373] flex items-center gap-1.5 flex-wrap">
                  <span>{language === 'ar' ? 'البائع:' : 'Seller:'}</span>
                  <button
                    onClick={() => discoverSellerProducts(product.artisan)}
                    className="text-[#8F7137] hover:text-[#B89753] font-bold hover:underline transition-all cursor-pointer text-left focus:outline-none"
                    title={language === 'ar' ? 'اكتشف المزيد من منتجات هذا البائع' : 'Discover more products from this seller'}
                  >
                    {language === 'ar' && product.arabicSeller ? product.arabicSeller : (product.artisan.startsWith('Seller:') ? product.artisan.replace('Seller:', '').trim() : product.artisan)}
                  </button>
                </div>
              )}
            </div>

            {/* Pricing & Stock Inventory Section */}
            {(visibility.detailPriceBox || isVisualEditMode) && (
              <div className="space-y-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-3xl sm:text-4xl font-extrabold text-[#171717] tracking-tight">
                    {formatPrice(product.priceUSD)}
                  </span>
                  {product.originalPriceUSD && (
                    <span className="text-lg text-slate-400 line-through font-medium">
                      {formatPrice(product.originalPriceUSD)}
                    </span>
                  )}
                </div>

                {/* Real Inventory Stock Quantity & Admin Low-Stock Notice */}
                <div className="flex items-center gap-2 flex-wrap text-xs pt-0.5">
                  <span className="font-semibold text-[#737373]">
                    {language === 'ar' ? 'المخزون المتوفر:' : 'Stock Quantity:'}
                  </span>
                  {stockQty > 0 ? (
                    <span className="font-bold text-[#16803C] bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                      {stockQty} {language === 'ar' ? 'متوفر' : 'in stock'}
                    </span>
                  ) : (
                    <span className="font-bold text-[#C62828] bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                      {language === 'ar' ? 'نفد المخزون' : 'Out of stock'}
                    </span>
                  )}

                  {isLowStock && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-bold bg-amber-50 text-amber-900 border border-amber-300">
                      ⚠️ {product.lowStockNotice || (stockQty === 1 ? (language === 'ar' ? 'القطعة الأخيرة' : 'Last piece') : (language === 'ar' ? 'كمية محدودة' : 'Limited Stock'))}
                    </span>
                  )}

                  {!isLowStock && !isOutOfStock && product.lowStockNotice && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-medium bg-[#F8F8F6] text-[#737373] border border-[#E5E5E5]">
                      {product.lowStockNotice}
                    </span>
                  )}
                </div>

                {/* Package Net Weight or Volume or Size (if specified by Admin) */}
                {product.weightOrVolume && (
                  <p className="text-xs text-[#737373] font-medium">
                    <span className="font-semibold text-[#171717]">{language === 'ar' ? 'الحجم / الوزن:' : 'Size / Volume:'}</span>{' '}
                    {product.weightOrVolume}
                  </p>
                )}
                {product.sellerItemCode && (
                  <p className="text-xs text-[#737373] font-medium font-mono">
                    {language === 'ar' ? 'رمز البائع: ' : 'Seller Code: '} {product.sellerItemCode}
                  </p>
                )}
              </div>
            )}

            {/* Description & Craft Story */}
            <div className="space-y-4 text-xs sm:text-sm text-[#737373] leading-relaxed font-normal">
              <p className="whitespace-pre-line text-[#171717] leading-relaxed">{product.description}</p>
              {product.craftStory && (
                <div className="mt-4 p-4 rounded-xl bg-[#F8F8F6] border border-[#E5E5E5] text-[#171717] space-y-1.5">
                  <h4 className="font-bold text-xs uppercase tracking-wider text-[#8F7137]">
                    {siteContent.productDetailPage?.craftStoryTitle ?? 'Artisan Workshop & Provenance'}
                  </h4>
                  <p className="text-xs leading-relaxed italic whitespace-pre-line text-[#737373]">{product.craftStory}</p>
                </div>
              )}
            </div>

            {/* Quantity Selector & Add to Cart Action */}
            {(visibility.detailPriceBox || isVisualEditMode) && (
              <div className="pt-4 border-t border-[#E5E5E5] space-y-4">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-1 bg-[#F8F8F6] border border-[#E5E5E5] rounded-xl p-1">
                    <button
                      onClick={() => setQuantity(Math.max(1, quantity - 1))}
                      className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-700 hover:text-black hover:bg-white cursor-pointer transition-all"
                      aria-label="Decrease quantity"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="text-sm font-bold text-[#171717] px-3 min-w-[32px] text-center">
                      {quantity}
                    </span>
                    <button
                      onClick={() => setQuantity(quantity + 1)}
                      className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-700 hover:text-black hover:bg-white cursor-pointer transition-all"
                      aria-label="Increase quantity"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>

                  <button
                    id="detail-favorite-btn"
                    onClick={() => toggleWishlist(product.id)}
                    aria-label={isLiked ? "Remove from favorites" : "Add to favorites"}
                    title={isLiked ? "Remove from favorites" : "Add to favorites"}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer shadow-2xs flex items-center justify-center ${
                      isLiked 
                        ? 'bg-rose-50 border-rose-300 text-rose-600 hover:bg-rose-100' 
                        : 'bg-[#F8F8F6] border-[#E5E5E5] text-slate-600 hover:text-rose-600 hover:bg-white'
                    }`}
                  >
                    <Heart className={`w-5 h-5 transition-transform duration-200 ${isLiked ? 'fill-rose-600 text-rose-600 scale-110' : ''}`} />
                  </button>

                  <button
                    id="detail-add-to-cart-btn"
                    onClick={handleAddToCart}
                    className={`flex-1 py-3.5 px-6 rounded-xl font-bold uppercase text-xs tracking-wider transition-all cursor-pointer shadow-xs flex items-center justify-center gap-2 active:scale-98 ${
                      justAdded 
                        ? 'bg-[#16803C] text-white' 
                        : 'bg-[#171717] hover:bg-[#8F7137] text-white'
                    }`}
                  >
                    {justAdded ? (
                      <>
                        <Check className="w-4 h-4" />
                        <span>{t('added')}!</span>
                      </>
                    ) : (
                      <>
                        <ShoppingBag className="w-4 h-4" />
                        <span>{t('addToCart')} {quantity > 1 ? `(${quantity})` : ''}</span>
                      </>
                    )}
                  </button>
                </div>

                {/* WhatsApp Concierge Inquiry Button */}
                {((visibility.detailWhatsAppInquiry && siteContent.productDetailPage?.inquiryWhatsAppNumber) || isVisualEditMode) && (
                  <button
                    onClick={handleWhatsAppInquiry}
                    className="w-full py-3 px-4 rounded-xl font-bold text-xs uppercase tracking-wider bg-[#16803C] hover:bg-emerald-700 text-white transition-all shadow-2xs flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>{siteContent.productDetailPage?.inquiryText ?? 'Inquire on WhatsApp with Master Artisan'}</span>
                  </button>
                )}

                {/* Trust Badges Section */}
                <div className="pt-4 border-t border-[#E5E5E5] space-y-3">
                  {siteContent.productDetailPage?.authenticityGuaranteeText && (
                    <div className="flex items-start gap-2.5 text-xs text-[#737373]">
                      <div className="p-1.5 rounded-lg bg-amber-50 text-[#8F7137] border border-amber-200/60 flex-shrink-0 mt-0.5">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                      </div>
                      <div className="leading-tight">
                        <span className="font-bold text-[#171717] block">{language === 'ar' ? 'ضمان الأصالة' : 'Authenticity Guarantee'}</span>
                        <p className="text-[11px] text-[#737373] mt-0.5">{siteContent.productDetailPage.authenticityGuaranteeText}</p>
                      </div>
                    </div>
                  )}

                  {siteContent.productDetailPage?.freeDeliveryBadgeText && (
                    <div className="flex items-start gap-2.5 text-xs text-[#737373]">
                      <div className="p-1.5 rounded-lg bg-emerald-50 text-[#16803C] border border-emerald-200 flex-shrink-0 mt-0.5">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <div className="leading-tight">
                        <span className="font-bold text-[#171717] block">{language === 'ar' ? 'التسليم والشحن' : 'Delivery & Dispatch'}</span>
                        <p className="text-[11px] text-[#737373] mt-0.5">{siteContent.productDetailPage.freeDeliveryBadgeText}</p>
                      </div>
                    </div>
                  )}

                  {siteContent.productDetailPage?.returnsPolicyText && (
                    <div className="flex items-start gap-2.5 text-xs text-[#737373]">
                      <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600 border border-blue-200 flex-shrink-0 mt-0.5">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H18.21" />
                        </svg>
                      </div>
                      <div className="leading-tight">
                        <span className="font-bold text-[#171717] block">{language === 'ar' ? 'سياسة الإرجاع' : 'Returns Policy'}</span>
                        <p className="text-[11px] text-[#737373] mt-0.5">{siteContent.productDetailPage.returnsPolicyText}</p>
                      </div>
                    </div>
                  )}
                </div>


              </div>
            )}

          </div>

        </div>

        {/* Middle Custom Divs / Banners */}
        <CustomBlocksRenderer page="product_detail" position="middle" />

        {/* Customer Reviews Section */}
        {(visibility.detailCustomerReviews || isVisualEditMode) && (
          <div className="pt-12 border-t border-[#E5E5E5] space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold text-[#171717]">
                  {language === 'ar' ? 'آراء وتقييمات العملاء' : 'Customer Reviews & Feedback'}
                </h3>
                <p className="text-xs text-[#737373] mt-1">
                  {language === 'ar' 
                    ? 'اكتشف تجارب المشترين للمنتجات الحرفية اللبنانية الأصيلة.' 
                    : 'Discover authentic reviews from collectors of Lebanese craftsmanship.'}
                </p>
              </div>

              {/* Aggregated Average Stars Rating Badge */}
              <div className="flex items-center gap-3 bg-white p-4 rounded-xl border border-[#E5E5E5] shadow-2xs self-start sm:self-auto">
                <div className="text-center px-1">
                  <p className="text-2xl font-black text-[#171717]">
                    {hasReviews ? averageRating : '—'}
                  </p>
                  <p className="text-[10px] text-[#737373] font-bold uppercase tracking-wider">
                    {hasReviews ? (language === 'ar' ? 'من 5 نجوم' : 'out of 5') : (language === 'ar' ? 'غير مقيّم' : 'Unrated')}
                  </p>
                </div>
                <div className="h-8 w-px bg-[#E5E5E5]"></div>
                <div>
                  <div className="flex items-center text-amber-500 gap-0.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <svg
                        key={star}
                        className={`w-4 h-4 fill-current ${
                          hasReviews && star <= Math.round(Number(averageRating)) ? 'text-amber-500' : 'text-slate-200'
                        }`}
                        viewBox="0 0 20 20"
                      >
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    ))}
                  </div>
                  <p className="text-xs text-[#737373] mt-0.5 font-medium">
                    {hasReviews
                      ? `${totalReviewsCount} ${language === 'ar' ? 'تقييمات موثقة' : 'verified ratings'}`
                      : (language === 'ar' ? 'كن أول من يكتب تقييماً' : '0 reviews (Be the first to review!)')}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              
              {/* Left Column: Post a Review Form */}
              <div className="lg:col-span-5 bg-white p-6 rounded-2xl border border-[#E5E5E5] shadow-2xs space-y-4">
                <div>
                  <h4 className="text-sm font-bold text-[#171717]">
                    {language === 'ar' ? 'أضف تقييمك للمنتج' : 'Share Your Experience'}
                  </h4>
                  <p className="text-xs text-[#737373] mt-0.5">
                    {language === 'ar' 
                      ? 'ملاحظاتك تساعد مجتمع الحرفيين اللبنانيين على النمو.' 
                      : 'Your feedback helps the Lebanese artisan community grow.'}
                  </p>
                </div>

                {firebaseUser ? (
                  <form onSubmit={handleSubmitReview} className="space-y-4">
                    {/* Star Rating Selector */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700">
                        {language === 'ar' ? 'التقييم بالنجوم:' : 'Your Rating:'}
                      </label>
                      <div className="flex items-center gap-1.5">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            type="button"
                            onClick={() => setRatingInput(star)}
                            className="p-1 hover:scale-110 transition-transform cursor-pointer"
                            title={`${star} Star${star > 1 ? 's' : ''}`}
                          >
                            <svg
                              className={`w-7 h-7 fill-current ${
                                star <= ratingInput ? 'text-amber-400' : 'text-slate-200'
                              }`}
                              viewBox="0 0 20 20"
                            >
                              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                            </svg>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Comment Field */}
                    <div className="space-y-1.5">
                      <label htmlFor="review-comment" className="text-xs font-bold text-slate-700">
                        {language === 'ar' ? 'التعليق:' : 'Comment:'}
                      </label>
                      <textarea
                        id="review-comment"
                        required
                        rows={4}
                        maxLength={1000}
                        placeholder={
                          language === 'ar' 
                            ? 'ما رأيك في جودة الصنع، التغليف، وتجربتك الإجمالية؟...' 
                            : 'What did you think of the craft, packaging, and overall experience?...'
                        }
                        value={commentInput}
                        onChange={(e) => setCommentInput(e.target.value)}
                        className="w-full px-4 py-3 bg-[#F8F8F6] text-[#171717] text-xs rounded-xl border border-[#E5E5E5] focus:outline-none focus:border-[#8F7137] focus:bg-white transition-all resize-none"
                      />
                    </div>

                    {submitError && (
                      <p className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-2 rounded-xl">
                        {submitError}
                      </p>
                    )}

                    {submitSuccess && (
                      <p className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-3 py-2 rounded-xl">
                        {language === 'ar' ? 'تم تقديم تقييمك بنجاح! شكرًا لك.' : 'Your review was submitted successfully! Thank you.'}
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full py-3 bg-[#171717] hover:bg-[#8F7137] disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 shadow-2xs"
                    >
                      {isSubmitting ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                          <span>{language === 'ar' ? 'جاري الإرسال...' : 'Submitting...'}</span>
                        </>
                      ) : (
                        <span>{language === 'ar' ? 'إرسال التقييم' : 'Submit Review'}</span>
                      )}
                    </button>
                  </form>
                ) : (
                  <div className="p-4 rounded-xl bg-amber-50/50 border border-amber-200/60 text-center space-y-3">
                    <p className="text-xs text-slate-700 leading-relaxed font-medium">
                      {language === 'ar' 
                        ? 'يجب عليك تسجيل الدخول في حسابك لتتمكن من كتابة تقييم ومشاركة تجربتك.' 
                        : 'You must be signed in to your account to leave a star rating and comment.'}
                    </p>
                    <button
                      onClick={() => setActiveTab('account')}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#8F7137] hover:bg-[#B89753] text-white text-xs font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer shadow-2xs"
                    >
                      <span>{language === 'ar' ? 'تسجيل الدخول الآن' : 'Sign In Now'}</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Right Column: List of Reviews */}
              <div className="lg:col-span-7 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#737373]">
                    {language === 'ar' ? 'التعليقات المنشورة' : 'Recent Reviews'}
                  </h4>
                  <span className="text-xs text-[#737373] font-medium">
                    {reviews.length} {language === 'ar' ? 'تعليقات' : 'reviews'}
                  </span>
                </div>

                {isLoadingReviews ? (
                  <div className="py-12 flex justify-center items-center">
                    <div className="w-8 h-8 border-3 border-[#B89753]/20 border-t-[#B89753] rounded-full animate-spin"></div>
                  </div>
                ) : reviews.length === 0 ? (
                  <div className="text-center py-12 bg-white rounded-2xl border border-[#E5E5E5]">
                    <p className="text-xs text-[#737373]">
                      {language === 'ar' ? 'لا توجد تقييمات لهذا المنتج بعد. كن أول من يكتب تقييمًا!' : 'No reviews for this product yet. Be the first to leave one!'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
                    {reviews.map((review) => (
                      <div key={review.id} className="bg-white p-5 rounded-xl border border-[#E5E5E5] shadow-2xs space-y-3">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-[#F8F8F6] border border-[#E5E5E5] flex items-center justify-center text-xs font-bold text-[#171717]">
                              {review.userName.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-xs font-bold text-[#171717]">{review.userName}</p>
                              <p className="text-[10px] text-[#737373] font-medium">
                                {new Date(review.createdAt).toLocaleDateString(language === 'ar' ? 'ar-EG' : 'en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric'
                                })}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center text-amber-400 gap-0.5">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <svg
                                key={star}
                                className={`w-3.5 h-3.5 fill-current ${
                                  star <= review.rating ? 'text-amber-400' : 'text-slate-200'
                                }`}
                                viewBox="0 0 20 20"
                              >
                                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                              </svg>
                            ))}
                          </div>
                        </div>

                        <p className="text-xs text-slate-700 leading-relaxed font-normal">
                          {review.comment}
                        </p>

                        {review.adminReply && (
                          <div className="mt-3 pl-3.5 border-l-2 border-[#8F7137] bg-amber-50/70 p-3 rounded-xl space-y-1">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-[#8F7137]">
                              <span>Store Admin Response</span>
                              {review.adminReplyAt && (
                                <span className="text-[10px] font-normal text-[#737373]">
                                  ({new Date(review.adminReplyAt).toLocaleDateString()})
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-[#171717] leading-relaxed font-medium">
                              {review.adminReply}
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

        {/* Related Products Section */}
        {(visibility.detailRelatedProducts || isVisualEditMode) && relatedProducts.length > 0 && (
          <div className="pt-12 border-t border-[#E5E5E5] space-y-6">
            <h3 className="text-xl font-bold text-[#171717]">
              {siteContent.productDetailPage?.relatedItemsTitle ?? t('relatedProducts')}
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4 md:gap-5">
              {relatedProducts.map(p => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </div>
        )}

        {/* Bottom Custom Divs / Banners */}
        <CustomBlocksRenderer page="product_detail" position="bottom" />

      </div>
    </div>
  );
};
