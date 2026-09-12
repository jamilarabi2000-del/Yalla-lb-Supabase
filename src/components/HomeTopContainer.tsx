import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useShop } from '../context/ShopContext';
import { 
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Copy,
  Check,
  Tag
} from 'lucide-react';
import { HomepagePromoSlider } from './HomepagePromoSlider';

import lebaneseMountainTownImg from '../assets/images/rachaya_mountain_perfect_1786799009637.jpg';
import raoucheSunsetImg from '../assets/images/raouche_rocks_sunset_1786799732002.jpg';

interface ConsolidatedSlide {
  id: string;
  type?: 'image' | 'video';
  url: string;
  mobileUrl?: string;
  badgeEn?: string;
  badgeAr?: string;
  titleEn?: string;
  titleAr?: string;
  subtitleEn?: string;
  subtitleAr?: string;
  discountBadgeEn?: string;
  discountBadgeAr?: string;
  promoCode?: string;
  buttonTextEn?: string;
  buttonTextAr?: string;
  secondaryBtnTextEn?: string;
  secondaryBtnTextAr?: string;
  targetCategory?: string;
  targetUrl?: string;
  secondaryTargetUrl?: string;
  bundleId?: string;
  showButton?: boolean;
  imageFit?: 'cover' | 'contain' | 'fill';
  desktopImageFit?: 'cover' | 'contain' | 'fill';
  mobileImageFit?: 'cover' | 'contain' | 'fill';
  imageZoom?: number;
  desktopImageZoom?: number;
  mobileImageZoom?: number;
  objectPosition?: string;
  desktopObjectPosition?: string;
  mobileObjectPosition?: string;
}

export const HomeTopContainer: React.FC = () => {
  const { 
    setActiveTab, 
    setSelectedCategory, 
    showToast, 
    language, 
    siteContent,
    productBundles = [],
    isVisualEditMode,
    addBundleToCart
  } = useShop();

  const isAr = language === 'ar';

  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const heroData = siteContent?.hero || {};

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

  // Build Hero slides directly and exclusively from the CMS Hero configuration
  const cmsMediaItems = ((heroData as any)?.bgMediaItems || []).filter((item: any) => isSlideActive(item));

  const heroSlides: ConsolidatedSlide[] = [];

  if (cmsMediaItems.length > 0) {
    cmsMediaItems.forEach((item: any, idx: number) => {
      const desktopUrl = item.url || item.desktopImageUrl || (heroData as any).bgImageUrl || raoucheSunsetImg;
      const mobileUrl = item.mobileUrl || item.mobileImageUrl || desktopUrl;

      heroSlides.push({
        id: item.id || `hero-media-${idx}`,
        type: item.type || 'image',
        url: desktopUrl,
        mobileUrl: mobileUrl,
        badgeEn: item.badgeText || (heroData as any).badgeText,
        badgeAr: item.badgeTextArabic || (heroData as any).badgeTextArabic,
        titleEn: item.customTitle || item.title || (heroData as any).title,
        titleAr: item.customTitleArabic || (heroData as any).titleArabic || item.titleArabic,
        subtitleEn: item.customSubtitle || (heroData as any).subtitle,
        subtitleAr: item.customSubtitleArabic || (heroData as any).subtitleArabic,
        buttonTextEn: item.buttonText || (heroData as any).primaryBtnText,
        buttonTextAr: item.buttonTextArabic || (heroData as any).primaryBtnTextArabic,
        targetUrl: item.targetUrl || (heroData as any).targetUrl || '/products',
        secondaryBtnTextEn: item.secondaryBtnText || (heroData as any).secondaryBtnText,
        secondaryBtnTextAr: item.secondaryBtnTextArabic || (heroData as any).secondaryBtnTextArabic,
        secondaryTargetUrl: item.secondaryTargetUrl || (heroData as any).secondaryTargetUrl,
        imageFit: item.imageFit || (heroData as any).defaultImageFit || 'contain',
        desktopImageFit: item.desktopImageFit || item.imageFit || (heroData as any).defaultImageFit || 'contain',
        mobileImageFit: item.mobileImageFit || item.imageFit || 'cover',
        imageZoom: item.imageZoom || 100,
        desktopImageZoom: item.desktopImageZoom || item.imageZoom || 100,
        mobileImageZoom: item.mobileImageZoom || item.imageZoom || 100,
        objectPosition: item.objectPosition || 'center',
        desktopObjectPosition: item.desktopObjectPosition || item.objectPosition || 'center',
        mobileObjectPosition: item.mobileObjectPosition || item.objectPosition || 'center',
      });
    });
  } else {
    // Default / Single Hero Slide when no multi-slides are configured
    const primaryImg = (heroData as any).bgImageUrl || (heroData as any).desktopImageUrl || raoucheSunsetImg;
    heroSlides.push({
      id: 'slide_hero_primary',
      type: 'image',
      url: primaryImg,
      mobileUrl: (heroData as any).mobileImageUrl || primaryImg,
      badgeEn: (heroData as any).badgeText,
      badgeAr: (heroData as any).badgeTextArabic,
      titleEn: (heroData as any).title,
      titleAr: (heroData as any).titleArabic,
      subtitleEn: (heroData as any).subtitle,
      subtitleAr: (heroData as any).subtitleArabic,
      buttonTextEn: (heroData as any).primaryBtnText,
      buttonTextAr: (heroData as any).primaryBtnTextArabic,
      targetUrl: (heroData as any).targetUrl || '/products',
      secondaryBtnTextEn: (heroData as any).secondaryBtnText,
      secondaryBtnTextAr: (heroData as any).secondaryBtnTextArabic,
      secondaryTargetUrl: (heroData as any).secondaryTargetUrl,
      imageFit: (heroData as any).defaultImageFit || 'contain',
      desktopImageFit: (heroData as any).defaultImageFit || 'contain',
      mobileImageFit: 'cover',
      imageZoom: 100,
      desktopImageZoom: 100,
      mobileImageZoom: 100,
      objectPosition: 'center',
      desktopObjectPosition: 'center',
      mobileObjectPosition: 'center',
    });
  }

  // Active bundles only appended at the end of the hero slider if explicitly marked by admin
  const activeBundles = productBundles.filter((b: any) => b.isActive !== false && b.showInSlider === true);
  const bundleSlides: ConsolidatedSlide[] = activeBundles.map((bundle: any) => ({
    id: `bundle-${bundle.id}`,
    type: 'image',
    url: bundle.imageUrl?.trim() || lebaneseMountainTownImg,
    badgeEn: bundle.badgeText,
    badgeAr: bundle.badgeTextAr || bundle.badgeText,
    titleEn: bundle.name,
    titleAr: bundle.nameAr || bundle.name,
    subtitleEn: bundle.description || '',
    subtitleAr: bundle.descriptionAr || bundle.description || '',
    buttonTextEn: bundle.sliderButtonText,
    buttonTextAr: bundle.sliderButtonTextAr,
    bundleId: bundle.id
  }));

  const slides: ConsolidatedSlide[] = [...heroSlides, ...bundleSlides];
  const currentSlide = slides[currentSlideIndex] || slides[0] || heroSlides[0];

  const slideIntervalSec = (heroData as any)?.slideInterval ?? 6;

  const resetAutoplay = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (slides.length <= 1 || slideIntervalSec === 0) return;
    timerRef.current = setInterval(() => {
      setCurrentSlideIndex((prev) => (prev + 1) % slides.length);
    }, slideIntervalSec * 1000);
  }, [slides.length, slideIntervalSec]);

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

  const handleCopyCode = (e: React.MouseEvent, code: string) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(code);
    setCopiedCode(code);
    showToast(isAr ? `تم نسخ كود الخصم: ${code}` : `Promo code copied: ${code}`, 'success');
    setTimeout(() => setCopiedCode(null), 2500);
  };

  const handleNavUrl = (targetUrl?: string) => {
    if (!targetUrl) {
      setActiveTab('products');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (targetUrl.startsWith('http://') || targetUrl.startsWith('https://')) {
      window.open(targetUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    if (targetUrl.startsWith('#')) {
      const el = document.querySelector(targetUrl);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
        return;
      }
    }

    if (targetUrl.startsWith('/products')) {
      const urlParams = new URLSearchParams(targetUrl.includes('?') ? targetUrl.split('?')[1] : '');
      const cat = urlParams.get('category');
      setSelectedCategory(cat || 'all');
      setActiveTab('products');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (targetUrl.startsWith('/account')) {
      setActiveTab('account');
      return;
    }

    if (targetUrl.startsWith('/admin')) {
      setActiveTab('admin');
      return;
    }

    // Direct category name check
    const lower = targetUrl.toLowerCase().trim();
    if (lower === 'all' || lower === 'pantry' || lower === 'crafts' || lower === 'mouneh' || lower === 'fashion' || lower === 'home & art' || lower === 'jewelry') {
      setSelectedCategory(targetUrl);
      setActiveTab('products');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setActiveTab('products');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleHeroPrimaryAction = () => {
    if (currentSlide.bundleId) {
      addBundleToCart(currentSlide.bundleId);
      return;
    }
    handleNavUrl(currentSlide.targetUrl);
  };

  const handleHeroSecondaryAction = () => {
    handleNavUrl(currentSlide.secondaryTargetUrl);
  };

  const promoConfig = siteContent?.promoBanner;
  const hasValidPromoSlide = () => {
    if (!promoConfig || promoConfig.enabled === false) return false;
    
    const isSlideValid = (slide: any) => {
      if (!slide) return false;
      if (slide.isPublished === false) return false;
      if (slide.scheduleActive) {
        const now = new Date();
        if (slide.startDate) {
          const start = new Date(slide.startDate);
          if (!isNaN(start.getTime()) && now < start) return false;
        }
        if (slide.endDate) {
          const end = new Date(slide.endDate);
          if (!isNaN(end.getTime()) && now > end) return false;
        }
      }
      return Boolean(
        slide.title || 
        slide.titleArabic || 
        slide.imageUrl || 
        slide.description || 
        slide.descriptionArabic || 
        slide.badge || 
        slide.badgeArabic ||
        slide.selectedProductId ||
        slide.targetCategory ||
        slide.ctaUrl
      );
    };

    if (Array.isArray(promoConfig.slides) && promoConfig.slides.length > 0) {
      return promoConfig.slides.some(isSlideValid);
    }
    return isSlideValid(promoConfig);
  };

  const showPromoBanner = hasValidPromoSlide() || isVisualEditMode;

  useEffect(() => {
    resetAutoplay();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [resetAutoplay]);

  const activeBadge = isAr ? (currentSlide.badgeAr || currentSlide.badgeEn) : currentSlide.badgeEn;
  const activeTitle = isAr ? (currentSlide.titleAr || currentSlide.titleEn) : currentSlide.titleEn;
  const activeSubtitle = isAr ? (currentSlide.subtitleAr || currentSlide.subtitleEn) : currentSlide.subtitleEn;

  return (
    <div className="w-full max-w-[1100px] mx-auto px-4 sm:px-6 mb-3 sm:mb-4">
      {/* Top Layout: Hero Banner + Generic Promotional Content Banner */}
      <div className={`items-stretch ${
        showPromoBanner 
          ? 'grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 sm:gap-[20px]' 
          : 'w-full'
      }`}>
        
        {/* LEFT / MAIN: Hero Banner */}
        <div 
          className="relative rounded-[20px] overflow-hidden bg-[#111111] text-white flex flex-col justify-between p-3.5 sm:p-5 md:p-6 shadow-sm group min-w-0 h-[200px] sm:h-[260px] md:h-[260px] lg:h-[400px] xl:h-[420px]"
        >
          {/* Slide Background: Dual Device (Mobile vs Desktop) with Fit Modes */}
          <div className="absolute inset-0 z-0 overflow-hidden">
            {currentSlide.type === 'video' ? (
              <video
                src={currentSlide.url}
                autoPlay
                loop
                muted
                playsInline
                className="w-full h-full object-cover"
              />
            ) : (
              <>
                {/* Mobile View Image (Portrait) */}
                <div className="w-full h-full block md:hidden relative">
                  {(currentSlide.mobileImageFit === 'contain' || (heroData as any)?.defaultImageFit === 'contain') && (
                    <img
                      src={currentSlide.mobileUrl || currentSlide.url || raoucheSunsetImg}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="absolute inset-0 w-full h-full object-cover blur-2xl opacity-40 scale-110 pointer-events-none"
                    />
                  )}
                  <img
                    src={currentSlide.mobileUrl || currentSlide.url || raoucheSunsetImg}
                    alt={activeTitle || ''}
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      if (e.currentTarget.src !== raoucheSunsetImg) {
                        e.currentTarget.src = raoucheSunsetImg;
                      }
                    }}
                    className={`w-full h-full relative z-10 transition-transform duration-700 ease-out ${
                      currentSlide.mobileImageFit === 'contain' ? 'object-contain' :
                      currentSlide.mobileImageFit === 'fill' ? 'object-fill' : 'object-cover'
                    }`}
                    style={{
                      objectPosition: currentSlide.mobileObjectPosition || currentSlide.objectPosition || 'center',
                      transform: (currentSlide.mobileImageZoom || currentSlide.imageZoom || 100) !== 100 
                        ? `scale(${(currentSlide.mobileImageZoom || currentSlide.imageZoom || 100) / 100})` 
                        : undefined
                    }}
                  />
                </div>

                {/* Desktop View Image (Landscape & Tablet+) */}
                <div className="w-full h-full hidden md:block relative">
                  {(currentSlide.desktopImageFit === 'contain' || (heroData as any)?.defaultImageFit === 'contain') && (
                    <img
                      src={currentSlide.url || raoucheSunsetImg}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="absolute inset-0 w-full h-full object-cover blur-2xl opacity-40 scale-105 pointer-events-none"
                    />
                  )}
                  <img
                    src={currentSlide.url || raoucheSunsetImg}
                    alt={activeTitle || ''}
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      if (e.currentTarget.src !== raoucheSunsetImg) {
                        e.currentTarget.src = raoucheSunsetImg;
                      }
                    }}
                    className={`w-full h-full relative z-10 transition-transform duration-700 ease-out ${
                      currentSlide.desktopImageFit === 'contain' ? 'object-contain' :
                      currentSlide.desktopImageFit === 'fill' ? 'object-fill' : 'object-cover'
                    }`}
                    style={{
                      objectPosition: currentSlide.desktopObjectPosition || currentSlide.objectPosition || 'center',
                      transform: (currentSlide.desktopImageZoom || currentSlide.imageZoom || 100) !== 100 
                        ? `scale(${(currentSlide.desktopImageZoom || currentSlide.imageZoom || 100) / 100})` 
                        : undefined
                    }}
                  />
                </div>
              </>
            )}

            {/* Admin-configured Dark Overlay Tint (0% to 70%) */}
            {((heroData as any)?.overlayOpacity ?? 0) > 0 && (
              <div 
                className="absolute inset-0 bg-black pointer-events-none z-10 transition-opacity duration-300" 
                style={{ opacity: ((heroData as any)?.overlayOpacity ?? 0) / 100 }}
              />
            )}

            {/* Subtle bottom gradient overlay: ensures bottom controls and text are readable directly over images */}
            <div 
              className="absolute inset-0 pointer-events-none z-10"
              style={{
                background: 'linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.28) 45%, rgba(0,0,0,0.12) 100%)'
              }}
            />
          </div>

          {/* Top-Left Compact Header with Glass Icon Container & Title */}
          <div className="relative z-20 flex items-start justify-between gap-2 sm:gap-4">
            {activeBadge ? (
              <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
                <div className="w-[20px] h-[20px] sm:w-[28px] sm:h-[28px] rounded-[6px] sm:rounded-[8px] bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center text-white flex-shrink-0 shadow-xs">
                  <Sparkles className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 text-[#F3E5AB]" />
                </div>
                <span className="text-[11px] sm:text-[14px] font-medium text-white max-w-[200px] sm:max-w-xs leading-[1.3] drop-shadow-sm line-clamp-1">
                  {activeBadge}
                </span>
              </div>
            ) : (
              <div />
            )}

            {currentSlide.promoCode && (
              <button
                onClick={(e) => handleCopyCode(e, currentSlide.promoCode!)}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/50 backdrop-blur-md border border-[#B89753]/50 text-xs font-mono text-[#F3E5AB] hover:bg-black/70 transition-colors cursor-pointer flex-shrink-0"
              >
                <Tag className="w-3 h-3" />
                <span>{currentSlide.promoCode}</span>
                {copiedCode === currentSlide.promoCode ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              </button>
            )}
          </div>

          {/* Center Main Content */}
          <div className="relative z-20 my-auto py-1 sm:py-4 space-y-0.5 sm:space-y-2 min-w-0">
            <h2 className="text-[17px] min-[360px]:text-[18px] sm:text-2xl md:text-3xl font-serif font-bold text-white tracking-tight leading-[1.2] sm:leading-[1.15] drop-shadow-md line-clamp-2 max-w-xl">
              {activeTitle}
            </h2>
            {activeSubtitle && (
              <p className="text-[11px] sm:text-sm text-neutral-200 line-clamp-1 sm:line-clamp-2 max-w-lg font-normal drop-shadow-sm">
                {activeSubtitle}
              </p>
            )}
          </div>

          {/* Bottom Controls: Direct over image across all breakpoints */}
          <div className="relative z-20 mt-auto min-w-0">
            <div 
              className="flex items-center justify-between w-full min-w-0"
            >
              {/* Left Side: CTA Button(s) */}
              <div className="min-w-0 flex items-center gap-2 pe-2 sm:pr-4 flex-wrap">
                <button
                  onClick={handleHeroPrimaryAction}
                  className="px-3 sm:px-5 py-1.5 sm:py-2 rounded-lg sm:rounded-xl bg-[#B89753] hover:bg-[#8F7137] border border-[#B89753] text-white text-[11px] min-[360px]:text-[12px] sm:text-[13px] font-bold uppercase tracking-wider transition-all cursor-pointer truncate max-w-full shadow-xs active:scale-[0.98] drop-shadow-sm"
                >
                  {isAr 
                    ? (currentSlide.buttonTextAr || currentSlide.buttonTextEn || 'استكشف التشكيلة') 
                    : (currentSlide.buttonTextEn || 'Explore Collection')
                  }
                </button>

                {(currentSlide.secondaryBtnTextEn || currentSlide.secondaryBtnTextAr) && (
                  <button
                    onClick={handleHeroSecondaryAction}
                    className="hidden sm:inline-flex px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl bg-white/20 hover:bg-white/30 border border-white/30 text-white text-[11px] sm:text-[12px] font-bold uppercase tracking-wider transition-all cursor-pointer truncate max-w-full shadow-xs active:scale-[0.98] backdrop-blur-xs"
                  >
                    {isAr 
                      ? (currentSlide.secondaryBtnTextAr || currentSlide.secondaryBtnTextEn) 
                      : (currentSlide.secondaryBtnTextEn || currentSlide.secondaryBtnTextAr)
                    }
                  </button>
                )}
              </div>

              {/* Right Side: Slider Controls & Counter */}
              <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                <button
                  onClick={handlePrev}
                  aria-label="Previous slide"
                  className="w-[24px] h-[24px] sm:w-[28px] sm:h-[28px] rounded-full bg-black/40 hover:bg-black/60 border border-white/25 text-white flex items-center justify-center transition-all cursor-pointer shadow-xs active:scale-95 drop-shadow-sm"
                >
                  <ChevronLeft className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                </button>

                <span className="text-[10px] sm:text-xs font-mono font-medium text-white/95 px-0.5 sm:px-1 drop-shadow-sm">
                  {currentSlideIndex + 1}/{slides.length}
                </span>

                <button
                  onClick={handleNext}
                  aria-label="Next slide"
                  className="w-[24px] h-[24px] sm:w-[28px] sm:h-[28px] rounded-full bg-black/40 hover:bg-black/60 border border-white/25 text-white flex items-center justify-center transition-all cursor-pointer shadow-xs active:scale-95 drop-shadow-sm"
                >
                  <ChevronRight className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT: Generic Admin-Controlled Homepage Promotional Content Slider */}
        {showPromoBanner && (
          <HomepagePromoSlider />
        )}

      </div>
    </div>
  );
};
