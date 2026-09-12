import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useShop } from '../context/ShopContext';
import { isSafeUrl } from '../lib/safeUrl';
import { 
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Copy,
  Check,
  ShoppingBag,
  Award,
  Tag,
  Gift
} from 'lucide-react';

import mountainTownImg from '../assets/images/mountain_town_1786766825066.jpg';
import cobblestoneStreetImg from '../assets/images/cobblestone_street_1786766842879.jpg';
import lebaneseMountainTownImg from '../assets/images/rachaya_mountain_perfect_1786799009637.jpg';
import raoucheSunsetImg from '../assets/images/raouche_rocks_sunset_1786799732002.jpg';
import schoolBannerImg from '../assets/images/school_banner_1786797167259.jpg';

interface ConsolidatedSlide {
  id: string;
  type?: 'image' | 'video';
  url: string;
  desktopImageUrl?: string;
  mobileImageUrl?: string;
  badgeEn?: string;
  badgeAr?: string;
  titleEn: string;
  titleAr?: string;
  subtitleEn?: string;
  subtitleAr?: string;
  discountBadgeEn?: string;
  discountBadgeAr?: string;
  promoCode?: string;
  buttonTextEn?: string;
  buttonTextAr?: string;
  targetCategory?: string;
  targetUrl?: string;
  imageZoom?: number;
  desktopImageZoom?: number;
  mobileImageZoom?: number;
  objectPosition?: string;
  desktopObjectPosition?: string;
  mobileObjectPosition?: string;
  imageFit?: 'cover' | 'contain' | 'fill';
  desktopImageFit?: 'cover' | 'contain' | 'fill';
  mobileImageFit?: 'cover' | 'contain' | 'fill';
  desktopAspectRatio?: string;
  mobileAspectRatio?: string;
  isCustomSchoolLayout?: boolean;
  bundleId?: string;
  showButton?: boolean;
}

export const HeroBanner: React.FC = () => {
  const { 
    setActiveTab, 
    setSelectedCategory, 
    setSearchQuery, 
    showToast, 
    t, 
    language, 
    siteContent,
    productBundles = [],
    products = [],
    addBundleToCart
  } = useShop();
  
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const heroData = siteContent?.hero || {
    badgeText: 'Handcrafted with Love in Lebanon',
    title: 'Authentic Lebanese Treasures, Handcrafted by Master Artisans',
    subtitle: 'Connecting traditional craft workshops across Beirut, Tripoli, Sidon, and Mount Lebanon directly to lovers of authentic Levantine heritage worldwide.',
    primaryBtnText: 'Explore Collection',
    targetUrl: '/products',
    stats: [
      { label: 'Master Artisans', value: '120+' },
      { label: 'Lebanese Villages', value: '45+' },
      { label: 'Orders Delivered', value: '15,000+' },
      { label: 'Customer Rating', value: '4.9 ★' },
    ]
  };

  // Extract custom slides from CMS
  const cmsMediaItems = (siteContent?.hero as any)?.bgMediaItems?.filter((item: any) => item.isPublished !== false) || [];
  const cmsOfferSlides = (siteContent?.offers as any)?.slides?.filter((item: any) => item.isPublished !== false) || [];

  // Build unified consolidated slides list
  const defaultConsolidatedSlides: ConsolidatedSlide[] = [
    {
      id: 'slide_hero_1',
      type: 'image',
      url: raoucheSunsetImg,
      badgeEn: (heroData as any).badgeText || 'Handcrafted in Lebanon',
      badgeAr: (heroData as any).badgeTextArabic || 'صُنع بحب في لبنان',
      titleEn: (heroData as any).title || 'Authentic Lebanese Treasures, Handcrafted by Master Artisans',
      titleAr: (heroData as any).titleArabic || 'كنوز لبنانية أصيلة، صُنعت بأيدي ماهرين',
      subtitleEn: (heroData as any).subtitle || 'Connecting traditional craft workshops across Beirut, Tripoli, Sidon, and Mount Lebanon directly to lovers of Levantine heritage.',
      subtitleAr: (heroData as any).subtitleArabic || 'نربط ورش الحرف التقليدية في بيروت وطرابلس وصيدا وجبل لبنان بمحبي التراث المشرقي الأصيل.',
      buttonTextEn: (heroData as any).primaryBtnText || 'Explore Collection',
      buttonTextAr: (heroData as any).primaryBtnTextArabic || 'تصفح التشكيلة',
      targetCategory: 'all'
    },
    {
      id: 'slide_school_promo',
      type: 'image',
      url: schoolBannerImg,
      badgeEn: 'School Essentials',
      badgeAr: 'مستلزمات المدرسة',
      titleEn: 'YOUR SCHOOL ESSENTIALS ALL IN ONE PLACE',
      titleAr: 'مستلزمات المدرسة كلها في مكان واحد',
      subtitleEn: 'OFFER IS VALID UNTIL 9 SEPTEMBER 2026 • ON SELECTED PRODUCTS',
      subtitleAr: 'العرض سارٍ حتى ٩ سبتمبر ٢٠٢٦ • على منتجات مختارة',
      discountBadgeEn: '50% OFF',
      discountBadgeAr: 'خصم ٥٠٪',
      promoCode: 'SCHOOL50',
      buttonTextEn: 'Shop Essentials',
      buttonTextAr: 'تسوق المستلزمات',
      targetCategory: 'crafts',
      isCustomSchoolLayout: true
    },
    {
      id: 'slide_hero_2',
      type: 'image',
      url: lebaneseMountainTownImg,
      badgeEn: 'Artisanal Mouneh & Pantry',
      badgeAr: 'المونة اللبنانية الأصيلة',
      titleEn: 'Fresh Harvest Mouneh & Levantine Pantry Delicacies',
      titleAr: 'خيرات الطبيعة اللبنانية والمونة العريقة',
      subtitleEn: 'Sustainably harvested za’atar, cold-pressed extra virgin olive oil, wild orange blossom water, and sun-dried figs from mountain orchards.',
      subtitleAr: 'زعتر جبلي، زيت زيتون معصور على البارد، ماء زهر بلدي، وتين مجفف تحت أشعة الشمس.',
      buttonTextEn: 'Shop Pantry',
      buttonTextAr: 'تسوق المونة',
      targetCategory: 'pantry'
    },
    {
      id: 'slide_crayola_promo',
      type: 'image',
      url: 'https://images.unsplash.com/photo-1513364776144-60967b0f800f?auto=format&fit=crop&w=1920&q=80',
      badgeEn: 'Crayola Creative',
      badgeAr: 'إبداع كرايولا',
      titleEn: 'EXPAND YOUR CRAYOLA COLLECTION',
      titleAr: 'وسّع مجموعتك من ألوان كرايولا المميزة',
      subtitleEn: 'Special creative promotion on art supplies, markers, and sketchbooks.',
      subtitleAr: 'عرض خاص على أدوات الرسم والتلوين والأوراق الإبداعية.',
      discountBadgeEn: 'BUY 2 GET 3RD FREE',
      discountBadgeAr: 'اشترِ ٢ واحصل على ٣ مجاناً',
      promoCode: 'CRAYOLA3',
      buttonTextEn: 'Shop Crayola',
      buttonTextAr: 'تسوق كرايولا',
      targetCategory: 'crafts'
    },
    {
      id: 'slide_global_promo',
      type: 'image',
      url: 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1920&q=80',
      badgeEn: 'Yalla-Global Collection',
      badgeAr: 'مجموعة يلا غلوبال العالمية',
      titleEn: 'PREMIUM INTERNATIONAL BRANDS & HANDPICKED LUXURY',
      titleAr: 'ماركات عالمية متميزة وفخامة منتقاة بعناية',
      subtitleEn: 'Swiss chocolates, Amalfi ceramics, and French lavender directly imported with international safety standards.',
      subtitleAr: 'شوكولاتة سويسرية، سيراميك إيطالي، ولافندر فرنسي مستورد بمقاييس عالمية.',
      discountBadgeEn: '20% OFF',
      discountBadgeAr: 'خصم ٢٠٪',
      promoCode: 'GLOBAL20',
      buttonTextEn: 'Shop Global',
      buttonTextAr: 'تسوق عالمياً',
      targetCategory: 'yalla-global'
    }
  ];

  // Helper to check if a slide is currently visible based on published status and optional schedule
  const isSlideActive = (item: { isPublished?: boolean; scheduleActive?: boolean; startDate?: string; endDate?: string }) => {
    if (item.isPublished === false) return false;
    if (item.scheduleActive) {
      const now = new Date();
      if (item.startDate) {
        const start = new Date(item.startDate);
        if (!isNaN(start.getTime()) && now < start) return false;
      }
      if (item.endDate) {
        const end = new Date(item.endDate);
        if (!isNaN(end.getTime()) && now > end) return false;
      }
    }
    return true;
  };

  // Map CMS custom offers and hero items into consolidated list if configured
  const cmsConsolidatedSlides: ConsolidatedSlide[] = [];
  
  if (cmsOfferSlides.length > 0) {
    cmsOfferSlides
      .filter((slide: any) => isSlideActive(slide))
      .forEach((slide: any, idx: number) => {
      cmsConsolidatedSlides.push({
        id: slide.id || `offer-${idx}`,
        type: slide.bgVideoUrl ? 'video' : 'image',
        url: slide.imageUrl || slide.desktopImageUrl || slide.bgVideoUrl || raoucheSunsetImg,
        desktopImageUrl: slide.desktopImageUrl || slide.imageUrl,
        mobileImageUrl: slide.mobileImageUrl,
        badgeEn: slide.badge || 'SPECIAL OFFER',
        badgeAr: slide.badgeArabic || slide.badge || 'عرض خاص',
        titleEn: slide.title,
        titleAr: slide.titleArabic || slide.title,
        subtitleEn: slide.subtitle,
        subtitleAr: slide.subtitleArabic || slide.subtitle,
        discountBadgeEn: slide.discountBadge || 'DISCOUNT',
        discountBadgeAr: slide.discountBadgeArabic || slide.discountBadge || 'خصم',
        promoCode: slide.discountBadge?.includes('CODE:') ? slide.discountBadge.split('CODE:')[1]?.trim() : 'YALLA2026',
        buttonTextEn: slide.buttonText || 'Shop Offer',
        buttonTextAr: slide.buttonTextArabic || slide.buttonText || 'تسوق العرض',
        targetCategory: slide.targetUrl || 'all',
        imageZoom: slide.imageZoom,
        desktopImageZoom: slide.desktopImageZoom,
        mobileImageZoom: slide.mobileImageZoom,
        objectPosition: slide.objectPosition,
        desktopObjectPosition: slide.desktopObjectPosition,
        mobileObjectPosition: slide.mobileObjectPosition,
        imageFit: slide.imageFit,
        desktopImageFit: slide.desktopImageFit,
        mobileImageFit: slide.mobileImageFit,
        desktopAspectRatio: slide.desktopAspectRatio,
        mobileAspectRatio: slide.mobileAspectRatio,
        isCustomSchoolLayout: slide.isCustomSchoolLayout
      });
    });
  }

  if (cmsMediaItems.length > 0) {
    cmsMediaItems
      .filter((item: any) => isSlideActive(item))
      .forEach((item: any, idx: number) => {
      cmsConsolidatedSlides.push({
        id: item.id || `media-${idx}`,
        type: item.type || 'image',
        url: item.url,
        desktopImageUrl: item.url,
        mobileImageUrl: item.mobileUrl || item.url,
        badgeEn: item.badgeText || (heroData as any).badgeText,
        badgeAr: item.badgeTextArabic || (heroData as any).badgeTextArabic,
        titleEn: item.customTitle || item.title || (heroData as any).title,
        titleAr: item.customTitleArabic || (heroData as any).titleArabic,
        subtitleEn: item.customSubtitle || (heroData as any).subtitle,
        subtitleAr: item.customSubtitleArabic || (heroData as any).subtitleArabic,
        buttonTextEn: (heroData as any).primaryBtnText || 'Explore Collection',
        buttonTextAr: (heroData as any).primaryBtnTextArabic || 'تصفح التشكيلة',
        imageZoom: item.imageZoom,
        desktopImageZoom: item.imageZoom,
        mobileImageZoom: item.mobileImageZoom || item.imageZoom,
        objectPosition: item.objectPosition,
        desktopObjectPosition: item.objectPosition,
        mobileObjectPosition: item.mobileObjectPosition || item.objectPosition,
        imageFit: item.imageFit,
        desktopImageFit: item.imageFit,
        mobileImageFit: item.mobileImageFit || item.imageFit,
        desktopAspectRatio: item.desktopAspectRatio,
        mobileAspectRatio: item.mobileAspectRatio,
        targetCategory: 'all'
      });
    });
  }
  
  // Map active product bundles into slide formats
  const activeBundles = productBundles.filter((b: any) => b.isActive !== false && b.showInSlider !== false);
  const bundleSlides: ConsolidatedSlide[] = activeBundles.map((bundle: any) => {
    const bundledProducts = products.filter((p: any) => bundle.productIds.includes(p.id));
    const originalSum = bundledProducts.reduce((sum: number, p: any) => sum + p.priceUSD, 0);
    const savedUSD = Math.max(0, originalSum - bundle.bundlePriceUSD);
    const savedPercent = originalSum > 0 ? Math.round((savedUSD / originalSum) * 100) : 0;
    
    // Use custom bundle banner image if provided, otherwise first product's image or fallback
    const bgUrl = bundle.imageUrl?.trim() || bundledProducts[0]?.image || 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1920&q=80';

    // Build lists of products
    const itemsEn = bundledProducts.map((p: any) => p.name).join(', ');
    const itemsAr = bundledProducts.map((p: any) => p.nameAr || p.name).join('، ');

    const bundleDescEn = bundle.description || '';
    const bundleDescAr = bundle.descriptionAr || bundle.description || '';

    const showButton = bundle.showButtonInSlider !== false;

    return {
      id: `bundle-${bundle.id}`,
      type: 'image',
      url: bgUrl,
      desktopImageUrl: bgUrl,
      mobileImageUrl: bgUrl,
      badgeEn: bundle.badgeText || 'SPECIAL BUNDLE DEAL',
      badgeAr: bundle.badgeTextAr || bundle.badgeText || 'صفقة حزمة خاصة',
      titleEn: bundle.name,
      titleAr: bundle.nameAr || bundle.name,
      subtitleEn: `${bundleDescEn}${bundleDescEn ? ' • ' : ''}Includes: ${itemsEn}`,
      subtitleAr: `${bundleDescAr}${bundleDescAr ? ' • ' : ''}يشمل: ${itemsAr}`,
      discountBadgeEn: savedUSD > 0 ? `SAVE $${savedUSD.toFixed(2)} (${savedPercent}% OFF)` : 'BUNDLE DEAL',
      discountBadgeAr: savedUSD > 0 ? `وفر $${savedUSD.toFixed(2)} (خصم ${savedPercent}٪)` : 'صفقة حزمة',
      buttonTextEn: showButton ? (bundle.sliderButtonText || 'Add Entire Combo to Cart') : '',
      buttonTextAr: showButton ? (bundle.sliderButtonTextAr || bundle.sliderButtonText || 'إضافة الكومبو كاملاً للسلة') : '',
      showButton: showButton,
      imageFit: 'cover' as const,
      bundleId: bundle.id
    };
  });

  const baseSlides = cmsConsolidatedSlides.length > 0 ? cmsConsolidatedSlides : defaultConsolidatedSlides;
  const slides: ConsolidatedSlide[] = [...baseSlides, ...bundleSlides];

  const currentSlide = slides[currentSlideIndex] || slides[0];

  // Auto-slide effect driven by CMS slideInterval
  const slideIntervalSec = (heroData as any)?.slideInterval ?? 5;

  const resetAutoplay = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (slides.length <= 1 || slideIntervalSec === 0) return;
    timerRef.current = setInterval(() => {
      setCurrentSlideIndex((prev) => (prev + 1) % slides.length);
    }, slideIntervalSec * 1000);
  }, [slides.length, slideIntervalSec]);

  useEffect(() => {
    resetAutoplay();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [resetAutoplay]);

  const handleCopyCode = (e: React.MouseEvent, code: string) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(code);
    setCopiedCode(code);
    showToast(
      language === 'ar' ? `تم نسخ كود الخصم ${code} بنجاح!` : `Promo code ${code} copied to clipboard!`,
      'success'
    );
    setTimeout(() => setCopiedCode(null), 2500);
  };

  const handleActionClick = (targetOverride?: string) => {
    if (currentSlide.bundleId) {
      addBundleToCart(currentSlide.bundleId);
      return;
    }
    const customTarget = targetOverride || (heroData as any)?.targetUrl || currentSlide.targetCategory || 'all';
    
    if (customTarget.startsWith('/') && !customTarget.startsWith('//')) {
      if (customTarget === '/checkout') {
        setActiveTab('checkout');
      } else if (customTarget === '/account') {
        setActiveTab('account');
      } else if (customTarget === '/products') {
        setActiveTab('products');
        setSelectedCategory('all');
      } else if (isSafeUrl(customTarget)) {
        window.location.href = customTarget;
        return;
      }
    } else {
      setSelectedCategory(customTarget);
      setSearchQuery('');
      setActiveTab('products');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSecondaryActionClick = () => {
    const secondaryTarget = (heroData as any)?.secondaryTargetUrl || 'artisans';
    if (secondaryTarget.startsWith('/') || secondaryTarget.startsWith('http://') || secondaryTarget.startsWith('https://')) {
      if (secondaryTarget.startsWith('/') && !secondaryTarget.startsWith('//')) {
        window.location.href = secondaryTarget;
        return;
      } else if (isSafeUrl(secondaryTarget)) {
        window.location.href = secondaryTarget;
        return;
      }
    }
    setSelectedCategory(secondaryTarget);
    setSearchQuery('');
    setActiveTab('products');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentSlideIndex((prev) => (prev - 1 + slides.length) % slides.length);
    resetAutoplay();
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentSlideIndex((prev) => (prev + 1) % slides.length);
    resetAutoplay();
  };

  // Touch Swipe Gesture Support for Mobile
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const minSwipeDistance = 50;

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;
    if (isLeftSwipe) {
      setCurrentSlideIndex((prev) => (prev + 1) % slides.length);
      resetAutoplay();
    } else if (isRightSwipe) {
      setCurrentSlideIndex((prev) => (prev - 1 + slides.length) % slides.length);
      resetAutoplay();
    }
  };

  const activeBadge = language === 'ar' ? (currentSlide.badgeAr || currentSlide.badgeEn) : currentSlide.badgeEn;
  const activeTitle = language === 'ar' ? (currentSlide.titleAr || currentSlide.titleEn) : currentSlide.titleEn;
  const activeSubtitle = language === 'ar' ? (currentSlide.subtitleAr || currentSlide.subtitleEn) : currentSlide.subtitleEn;
  const activeDiscount = language === 'ar' ? (currentSlide.discountBadgeAr || currentSlide.discountBadgeEn) : currentSlide.discountBadgeEn;
  const activeBtnText = language === 'ar' ? (currentSlide.buttonTextAr || currentSlide.buttonTextEn) : currentSlide.buttonTextEn;

  // Stable Global Banner Height locked to global CMS settings (never changes between slides)
  const desktopRatio = (heroData as any)?.desktopAspectRatio || '16:9';
  const mobileRatio = (heroData as any)?.mobileAspectRatio || 'standard';

  // Base container classes: strict locked dimensions across all slides regardless of slide contents
  let containerHeightClass = 'w-full relative overflow-hidden bg-slate-950 border-b md:border-b-0 border-slate-200 md:border md:border-slate-800/80 md:rounded-2xl lg:rounded-3xl md:shadow-2xl md:ring-1 md:ring-white/10 group/hero flex flex-col justify-between py-4 sm:py-6 md:py-8 ';
  
  if (mobileRatio === '16:9') {
    containerHeightClass += 'portrait:aspect-[16/9] portrait:min-h-[380px] portrait:max-h-[460px] ';
  } else if (mobileRatio === '9:16') {
    containerHeightClass += 'portrait:aspect-[9/16] portrait:min-h-[500px] portrait:max-h-[640px] ';
  } else if (mobileRatio === '3:4') {
    containerHeightClass += 'portrait:aspect-[3/4] portrait:min-h-[480px] portrait:max-h-[600px] ';
  } else if (mobileRatio === '1:1') {
    containerHeightClass += 'portrait:aspect-square portrait:min-h-[420px] portrait:max-h-[520px] ';
  } else {
    // Standard stable mobile portrait height
    containerHeightClass += 'portrait:h-[520px] sm:portrait:h-[560px] ';
  }

  // Mobile Landscape: when a phone is rotated horizontally
  containerHeightClass += 'landscape:h-[350px] sm:landscape:h-[380px] ';

  // Desktop & Tablets (min-width: 768px): Strictly locked height
  if (desktopRatio === '21:9') {
    containerHeightClass += 'md:w-full md:aspect-[21/9] md:min-h-[440px] md:max-h-[680px] ';
  } else if (desktopRatio === '4:3') {
    containerHeightClass += 'md:w-full md:aspect-[4/3] md:min-h-[550px] md:max-h-[750px] ';
  } else if (desktopRatio === 'auto' || desktopRatio === 'fixed') {
    containerHeightClass += 'md:w-full md:h-[580px] lg:h-[620px] ';
  } else {
    // Standard 16:9 desktop ratio with reliable min/fixed height
    containerHeightClass += 'md:w-full md:h-[580px] lg:h-[620px] ';
  }

  return (
    <div className="w-full max-w-full md:max-w-screen-2xl md:mx-auto md:px-4 sm:md:px-6 lg:px-8 md:pt-4 md:pb-2">
      <div 
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className={containerHeightClass}
        style={{ width: '100%' }}
      >
      
      {/* Background Images / Videos with Smooth Fades & Dual Orientation Support */}
      {slides.map((slide, idx) => {
        const globalDefaultFit = (heroData as any)?.defaultImageFit || 'contain';
        const desktopFitMode = slide.desktopImageFit || slide.imageFit || globalDefaultFit;
        const mobileFitMode = slide.mobileImageFit || slide.imageFit || globalDefaultFit;
        const fitMode = slide.imageFit || globalDefaultFit;
        const isActive = idx === currentSlideIndex;

        return slide.type === 'video' ? (
          <video
            key={slide.id}
            src={slide.url}
            autoPlay
            loop
            muted
            playsInline
            className={`absolute inset-0 w-full h-full z-0 transition-opacity duration-1000 ease-in-out ${
              fitMode === 'contain' ? 'object-contain' : fitMode === 'fill' ? 'object-fill' : 'object-cover'
            } ${
              isActive ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
            style={{
              objectPosition: slide.objectPosition || 'center',
              transform: slide.imageZoom && slide.imageZoom !== 100 ? `scale(${ slide.imageZoom / 100 })` : undefined,
              transition: 'opacity 1s ease-in-out, transform 0.5s ease-out'
            }}
          />
        ) : (
          <React.Fragment key={slide.id}>
            {/* Mobile Portrait View Image (Active in Portrait orientation on mobile/tablet screens) */}
            <div className={`absolute inset-0 w-full h-full z-0 portrait:block landscape:hidden md:portrait:hidden transition-opacity duration-1000 ease-in-out ${
              isActive ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}>
              {/* Blurred Ambient Backdrop if Mobile Fit Mode is contain OR slide is set to 16:9 Landscape on mobile */}
              {(mobileFitMode === 'contain' || slide.mobileAspectRatio === '16:9') && (
                <img
                  src={slide.mobileImageUrl || slide.desktopImageUrl || slide.url || raoucheSunsetImg}
                  alt=""
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    if (e.currentTarget.src !== raoucheSunsetImg) {
                      e.currentTarget.src = raoucheSunsetImg;
                    }
                  }}
                  className="absolute inset-0 w-full h-full object-cover z-0 blur-2xl opacity-50 pointer-events-none transition-opacity duration-1000 scale-110"
                />
              )}
              <img
                src={slide.mobileImageUrl || slide.desktopImageUrl || slide.url || raoucheSunsetImg}
                alt={slide.titleEn}
                referrerPolicy="no-referrer"
                onError={(e) => {
                  if (e.currentTarget.src !== raoucheSunsetImg) {
                    e.currentTarget.src = raoucheSunsetImg;
                  }
                }}
                className={`w-full h-full relative z-10 ${
                  slide.mobileAspectRatio === '16:9' ? 'object-contain' :
                  mobileFitMode === 'contain' ? 'object-contain' : 
                  mobileFitMode === 'fill' ? 'object-fill' : 'object-cover'
                }`}
                style={{
                  objectPosition: slide.mobileObjectPosition || slide.objectPosition || 'center',
                  transform: (slide.mobileImageZoom ?? slide.imageZoom ?? 100) !== 100 ? `scale(${ (slide.mobileImageZoom ?? slide.imageZoom ?? 100) / 100 })` : undefined,
                  transition: 'opacity 1s ease-in-out, transform 0.5s ease-out'
                }}
              />
            </div>

            {/* Landscape & Desktop View Image (Active when rotated to Landscape OR on Desktop/Laptop screens) */}
            <div className={`absolute inset-0 w-full h-full z-0 hidden landscape:block md:portrait:block md:landscape:block transition-opacity duration-1000 ease-in-out ${
              isActive ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}>
              {/* Blurred Ambient Backdrop if Desktop Fit Mode is contain (Auto-Fit uncropped) */}
              {desktopFitMode === 'contain' && (
                <img
                  src={slide.desktopImageUrl || slide.url || raoucheSunsetImg}
                  alt=""
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    if (e.currentTarget.src !== raoucheSunsetImg) {
                      e.currentTarget.src = raoucheSunsetImg;
                    }
                  }}
                  className="absolute inset-0 w-full h-full object-cover z-0 blur-2xl opacity-40 pointer-events-none transition-opacity duration-1000 scale-105"
                />
              )}
              <img
                src={slide.desktopImageUrl || slide.url || raoucheSunsetImg}
                alt={slide.titleEn}
                referrerPolicy="no-referrer"
                onError={(e) => {
                  if (e.currentTarget.src !== raoucheSunsetImg) {
                    e.currentTarget.src = raoucheSunsetImg;
                  }
                }}
                className={`w-full h-full relative z-10 ${
                  desktopFitMode === 'contain' ? 'object-contain' : 
                  desktopFitMode === 'fill' ? 'object-fill' : 'object-cover'
                }`}
                style={{
                  objectPosition: slide.desktopObjectPosition || slide.objectPosition || 'center',
                  transform: (slide.desktopImageZoom ?? slide.imageZoom ?? 100) !== 100 ? `scale(${ (slide.desktopImageZoom ?? slide.imageZoom ?? 100) / 100 })` : undefined,
                  transition: 'opacity 1s ease-in-out, transform 0.5s ease-out'
                }}
              />
            </div>
          </React.Fragment>
        );
      })}

      {/* Optional Dark Overlay Tint controlled by Admin (0% = 100% true natural image colors) */}
      {((heroData as any)?.overlayOpacity ?? 0) > 0 && (
        <div 
          className="absolute inset-0 bg-black pointer-events-none z-10 transition-opacity duration-300" 
          style={{ opacity: ((heroData as any)?.overlayOpacity ?? 0) / 100 }}
        />
      )}

      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 relative z-20 w-full h-full min-h-0 flex-1 flex flex-col justify-between">
        
        {/* Centered Content Container with strict min-h-0 to guarantee locked container height */}
        <div className="max-w-3xl mx-auto text-center space-y-1.5 sm:space-y-2.5 landscape:space-y-1 md:landscape:space-y-2 p-1 sm:p-2 flex-1 min-h-0 flex flex-col justify-center items-center">
          
          {/* Top Eyebrow Badge & Promo Discount Pill */}
          <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 py-0.5 flex-shrink-0">
            {activeBadge && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] sm:text-xs font-bold uppercase tracking-wider bg-black/60 text-[#B89753] border border-[#B89753]/40 backdrop-blur-md shadow-sm">
                <Sparkles className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#B89753]" />
                <span className="truncate max-w-[240px] sm:max-w-none">{activeBadge}</span>
              </span>
            )}

            {activeDiscount && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-bold uppercase tracking-wider bg-[#C62828] text-white shadow-md border border-rose-400">
                <Award className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                <span className="truncate max-w-[180px] sm:max-w-none">{activeDiscount}</span>
              </span>
            )}
          </div>

          {/* Headline Title */}
          <div className="py-0.5 flex items-center justify-center w-full flex-shrink-0">
            <h1 className="text-xl sm:text-3xl lg:text-4xl xl:text-5xl landscape:text-lg sm:landscape:text-xl md:landscape:text-3xl font-serif font-bold text-white tracking-tight leading-[1.15] drop-shadow-[0_2px_12px_rgba(0,0,0,0.95)] transition-all duration-500 line-clamp-2">
              {activeTitle}
            </h1>
          </div>

          {/* Subtitle / Description */}
          {activeSubtitle && (
            <div className="py-0.5 flex items-center justify-center w-full flex-shrink-0">
              <p className="text-xs sm:text-sm landscape:text-[11px] sm:landscape:text-xs md:landscape:text-sm text-neutral-200 max-w-2xl mx-auto leading-relaxed drop-shadow-[0_1px_8px_rgba(0,0,0,0.95)] font-normal line-clamp-2 landscape:line-clamp-1 md:landscape:line-clamp-2">
                {activeSubtitle}
              </p>
            </div>
          )}

          {/* Optional Promo Code Box with One-Click Copy */}
          {currentSlide.promoCode && (
            <div className="py-0.5 flex items-center justify-center flex-shrink-0">
              <div className="inline-flex items-center bg-black/80 border border-[#B89753]/40 rounded-lg p-1 shadow-md backdrop-blur-md">
                <span className="px-2 sm:px-3 py-0.5 text-[9px] sm:text-xs font-bold uppercase text-[#B89753] tracking-wider">
                  {language === 'ar' ? 'كود الخصم:' : 'PROMO CODE:'}
                </span>
                <span className="px-2 sm:px-3 font-mono font-bold text-[11px] sm:text-sm text-white tracking-widest select-all">
                  {currentSlide.promoCode}
                </span>
                <button
                  onClick={(e) => handleCopyCode(e, currentSlide.promoCode!)}
                  className="flex items-center gap-1 px-2.5 sm:px-3 py-1 sm:py-1.5 bg-[#B89753] hover:bg-[#8F7137] text-white font-bold rounded-md text-[10px] sm:text-xs transition-colors cursor-pointer shadow-sm"
                >
                  {copiedCode === currentSlide.promoCode ? (
                    <>
                      <Check className="w-3 h-3 sm:w-3.5 sm:h-3.5 stroke-[3]" />
                      <span>{language === 'ar' ? 'تم النسخ!' : 'Copied!'}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      <span>{language === 'ar' ? 'نسخ' : 'Copy'}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

        </div>

        {/* Bottom Hero Controls: Action Button & Pagination Dots */}
        <div className="max-w-2xl mx-auto w-full space-y-2 sm:space-y-3 pt-1 pb-1 relative z-30">
          
          <div className="flex flex-wrap justify-center items-center gap-2 sm:gap-3 pt-0.5">
            {currentSlide.showButton !== false && activeBtnText && (
              <button
                onClick={() => handleActionClick()}
                className="w-full sm:w-auto px-6 sm:px-9 landscape:px-6 py-2.5 sm:py-3.5 landscape:py-2 md:landscape:py-3.5 bg-[#B89753] hover:bg-[#8F7137] text-white font-bold text-xs sm:text-sm uppercase tracking-wider rounded-lg shadow-lg transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer border border-[#B89753]"
              >
                <ShoppingBag className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                <span>{activeBtnText}</span>
              </button>
            )}

            {((heroData as any)?.secondaryBtnText || (heroData as any)?.secondaryBtnTextArabic) && (
              <button
                onClick={() => handleSecondaryActionClick()}
                className="w-full sm:w-auto px-6 sm:px-9 py-2.5 sm:py-3.5 bg-black/60 hover:bg-black/80 text-white font-bold text-xs sm:text-sm uppercase tracking-wider rounded-lg shadow-md transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer border border-white/20 backdrop-blur-sm"
              >
                <span>{language === 'ar' ? ((heroData as any).secondaryBtnTextArabic || (heroData as any).secondaryBtnText) : ((heroData as any).secondaryBtnText || (heroData as any).secondaryBtnTextArabic)}</span>
              </button>
            )}
          </div>

          {/* Carousel Indicators & Controls */}
          {slides.length > 1 && (
            <div className="flex justify-center items-center gap-2 pt-2">
              {slides.map((_, i) => (
                <button
                  key={i}
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrentSlideIndex(i);
                    resetAutoplay();
                  }}
                  className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer shadow-sm ${
                    i === currentSlideIndex ? 'w-6 bg-[#B89753]' : 'w-2 bg-white/50 hover:bg-white'
                  }`}
                  aria-label={`Go to slide ${i + 1}`}
                />
              ))}
            </div>
          )}

        </div>

        {/* Hero Statistics & Artisan Trust Counters */}
        {heroData?.stats && heroData.stats.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mt-4 max-w-4xl mx-auto relative z-20">
            {heroData.stats.filter((s: any) => s.isPublished !== false).map((stat: any, idx: number) => (
              <div key={idx} className="bg-black/50 backdrop-blur-md border border-white/10 rounded-lg p-2.5 text-center shadow-md">
                <div className="text-base sm:text-lg font-bold text-[#B89753] font-mono">
                  {language === 'ar' ? (stat.valueArabic || stat.value) : stat.value}
                </div>
                <div className="text-[10px] sm:text-[11px] font-medium uppercase tracking-wider text-neutral-300 truncate">
                  {language === 'ar' ? (stat.labelArabic || stat.label) : stat.label}
                </div>
              </div>
            ))}
          </div>
        )}

      </div>

      {/* Floating Prev Arrow Button */}
      {slides.length > 1 && (
        <button
          onClick={handlePrev}
          aria-label={language === 'ar' ? 'الشريحة السابقة' : 'Previous Slide'}
          className="absolute left-4 top-1/2 -translate-y-1/2 z-30 w-10 h-10 rounded-full bg-white text-[#171717] shadow-md border border-[#E5E5E5] hidden md:flex items-center justify-center transition-all duration-200 hover:text-[#8F7137] hover:border-[#B89753] hover:scale-105 active:scale-95 cursor-pointer opacity-0 group-hover/hero:opacity-100"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      )}

      {/* Floating Next Arrow Button */}
      {slides.length > 1 && (
        <button
          onClick={handleNext}
          aria-label={language === 'ar' ? 'الشريحة التالية' : 'Next Slide'}
          className="absolute right-4 top-1/2 -translate-y-1/2 z-30 w-10 h-10 rounded-full bg-white text-[#171717] shadow-md border border-[#E5E5E5] hidden md:flex items-center justify-center transition-all duration-200 hover:text-[#8F7137] hover:border-[#B89753] hover:scale-105 active:scale-95 cursor-pointer opacity-0 group-hover/hero:opacity-100"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      )}

      </div>
    </div>
  );
};


