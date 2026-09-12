import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useShop } from '../context/ShopContext';
import { 
  ArrowRight, 
  Sparkles, 
  ShoppingBag, 
  ExternalLink, 
  Plus, 
  Settings, 
  ChevronLeft, 
  ChevronRight,
  EyeOff
} from 'lucide-react';
import { CMSPromoSliderConfig, CMSPromoSlide } from '../types';

interface HomepagePromoSliderProps {
  bannerConfig?: CMSPromoSliderConfig;
  className?: string;
}

export const HomepagePromoSlider: React.FC<HomepagePromoSliderProps> = ({ 
  bannerConfig, 
  className = '' 
}) => {
  const { 
    siteContent, 
    language, 
    setActiveTab, 
    setSelectedCategory, 
    products = [],
    addToCart,
    openProductDetail,
    formatPrice,
    isVisualEditMode,
    showToast
  } = useShop();

  const isAr = language === 'ar';
  const config = bannerConfig || siteContent?.promoBanner;

  // Check if a slide is currently active within its optional schedule
  const isSlideScheduleActive = (slide: CMSPromoSlide | CMSPromoSliderConfig) => {
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
    return true;
  };

  // Check if slide contains actual content
  const hasSlideContent = (slide: CMSPromoSlide | CMSPromoSliderConfig) => {
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

  // Normalize and resolve valid active slides
  const resolveActiveSlides = (): CMSPromoSlide[] => {
    if (!config || config.enabled === false) return [];

    let rawSlides: CMSPromoSlide[] = [];
    if (Array.isArray(config.slides) && config.slides.length > 0) {
      rawSlides = [...config.slides].sort((a, b) => (a.order || 0) - (b.order || 0));
    } else if (hasSlideContent(config)) {
      // Fallback from legacy single slide format
      rawSlides = [{
        id: config.id || 'single-slide-legacy',
        isPublished: config.isPublished,
        type: config.type,
        badge: config.badge,
        badgeArabic: config.badgeArabic,
        title: config.title,
        titleArabic: config.titleArabic,
        description: config.description,
        descriptionArabic: config.descriptionArabic,
        imageUrl: config.imageUrl,
        imageFit: config.imageFit,
        bgStyle: config.bgStyle,
        customBgColor: config.customBgColor,
        customTextColor: config.customTextColor,
        showCta: config.showCta,
        ctaText: config.ctaText,
        ctaTextArabic: config.ctaTextArabic,
        ctaUrl: config.ctaUrl,
        ctaType: config.ctaType,
        targetCategory: config.targetCategory,
        selectedProductId: config.selectedProductId,
        selectedProductIds: config.selectedProductIds,
        contentAlignment: config.contentAlignment,
        scheduleActive: config.scheduleActive,
        startDate: config.startDate,
        endDate: config.endDate,
        order: 1
      }];
    }

    return rawSlides.filter(s => isSlideScheduleActive(s) && hasSlideContent(s));
  };

  const validSlides = resolveActiveSlides();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const touchStartXRef = useRef<number | null>(null);
  const touchEndXRef = useRef<number | null>(null);

  const slideCount = validSlides.length;

  // Ensure current index is within bounds if slides list changes
  useEffect(() => {
    if (currentIndex >= slideCount && slideCount > 0) {
      setCurrentIndex(0);
    }
  }, [slideCount, currentIndex]);

  // Autoplay handler
  useEffect(() => {
    if (slideCount <= 1 || isPaused || config?.autoplay === false) return;

    const intervalTime = config?.autoplayInterval && config.autoplayInterval >= 1500 
      ? config.autoplayInterval 
      : 5000;

    const timer = setInterval(() => {
      setCurrentIndex(prev => {
        if (config?.loop === false && prev >= slideCount - 1) {
          return prev;
        }
        return (prev + 1) % slideCount;
      });
    }, intervalTime);

    return () => clearInterval(timer);
  }, [slideCount, isPaused, config?.autoplay, config?.autoplayInterval, config?.loop]);

  const handlePrev = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (slideCount <= 1) return;
    setCurrentIndex(prev => (prev === 0 ? (config?.loop === false ? 0 : slideCount - 1) : prev - 1));
  }, [slideCount, config?.loop]);

  const handleNext = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (slideCount <= 1) return;
    setCurrentIndex(prev => {
      if (prev >= slideCount - 1 && config?.loop === false) return prev;
      return (prev + 1) % slideCount;
    });
  }, [slideCount, config?.loop]);

  // Touch Swipe Gesture Handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndXRef.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (touchStartXRef.current !== null && touchEndXRef.current !== null) {
      const diff = touchStartXRef.current - touchEndXRef.current;
      const minSwipeDistance = 40;
      if (Math.abs(diff) > minSwipeDistance) {
        if (diff > 0) {
          // Swiped left
          if (isAr) handlePrev();
          else handleNext();
        } else {
          // Swiped right
          if (isAr) handleNext();
          else handlePrev();
        }
      }
    }
    touchStartXRef.current = null;
    touchEndXRef.current = null;
  };

  // 0 VALID SLIDES CASE
  if (slideCount === 0) {
    if (isVisualEditMode) {
      return (
        <div 
          onClick={() => {
            setActiveTab('admin');
            showToast(isAr ? 'افتح إدارة المحتوى لضبط السلايدر الترويجي' : 'Opening CMS to configure Promotional Slider', 'info');
          }}
          className={`rounded-[20px] border-2 border-dashed border-[#B89753]/60 bg-[#B89753]/5 p-4 sm:p-6 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-[#B89753]/10 transition-colors h-[200px] sm:h-[260px] md:h-[260px] lg:h-[400px] xl:h-[420px] ${className}`}
        >
          <div className="w-10 h-10 rounded-full bg-[#B89753]/20 flex items-center justify-center text-[#8F7137] mb-2">
            <Settings className="w-5 h-5 animate-spin-slow" />
          </div>
          <p className="text-xs sm:text-sm font-bold text-[#8F7137]">
            {isAr ? 'السلايدر الترويجي معطّل أو لا توجد شرائح صالحة' : 'Promo Slider (0 Valid Slides / Disabled)'}
          </p>
          <p className="text-[11px] text-[#737373] mt-1 max-w-[240px]">
            {isAr ? 'انقر لإضافة شرائح في لوحة التحكم' : 'Click to add & manage slides in Admin CMS'}
          </p>
        </div>
      );
    }
    return null;
  }

  const currentSlide = validSlides[currentIndex] || validSlides[0];

  // Determine Background Style classes
  const getSlideBgClasses = (slide: CMSPromoSlide) => {
    switch (slide.bgStyle) {
      case 'dark':
        return 'bg-[#111111] text-white border border-[#262626]';
      case 'light':
        return 'bg-[#fafafa] text-[#111111] border border-[#E5E5E5]';
      case 'gold_gradient':
        return 'bg-gradient-to-br from-[#2a1c06] via-[#1a1204] to-[#0d0902] text-white border border-[#B89753]/40';
      case 'emerald_gradient':
        return 'bg-gradient-to-br from-[#06241a] via-[#041610] to-[#020b08] text-white border border-emerald-500/40';
      case 'custom_color':
        return 'border border-black/10';
      case 'default':
      default:
        return 'bg-[#ededed] text-[#111111] border border-[#E5E5E5]';
    }
  };

  const customStyle: React.CSSProperties = {};
  if (currentSlide.bgStyle === 'custom_color') {
    if (currentSlide.customBgColor) customStyle.backgroundColor = currentSlide.customBgColor;
    if (currentSlide.customTextColor) customStyle.color = currentSlide.customTextColor;
  }

  // Handle CTA Click Navigation
  const handleCtaClick = (slide: CMSPromoSlide, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    // 1. If product promotion
    if (slide.type === 'product_promotion' && slide.selectedProductId) {
      const prod = products.find(p => p.id === slide.selectedProductId);
      if (prod) {
        openProductDetail(prod);
        return;
      }
    }

    // 2. If category promotion
    if (slide.type === 'category_promotion' && slide.targetCategory) {
      setSelectedCategory(slide.targetCategory);
      setActiveTab('products');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const url = slide.ctaUrl || '/products';

    if (url.startsWith('http://') || url.startsWith('https://')) {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }

    if (url.startsWith('/products')) {
      const urlParams = new URLSearchParams(url.includes('?') ? url.split('?')[1] : '');
      const cat = urlParams.get('category');
      if (cat) {
        setSelectedCategory(cat);
      } else {
        setSelectedCategory('all');
      }
      setActiveTab('products');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (url.startsWith('/account')) {
      setActiveTab('account');
      return;
    }

    // Default fallback
    setActiveTab('products');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const isDarkBg = currentSlide.bgStyle === 'dark' || currentSlide.bgStyle === 'gold_gradient' || currentSlide.bgStyle === 'emerald_gradient';
  const badgeText = isAr ? (currentSlide.badgeArabic || currentSlide.badge) : (currentSlide.badge || currentSlide.badgeArabic);
  const titleText = isAr ? (currentSlide.titleArabic || currentSlide.title) : (currentSlide.title || currentSlide.titleArabic);
  const descriptionText = isAr ? (currentSlide.descriptionArabic || currentSlide.description) : (currentSlide.description || currentSlide.descriptionArabic);
  const ctaText = isAr ? (currentSlide.ctaTextArabic || currentSlide.ctaText) : (currentSlide.ctaText || currentSlide.ctaTextArabic);

  const selectedProduct = currentSlide.type === 'product_promotion' && currentSlide.selectedProductId
    ? products.find(p => p.id === currentSlide.selectedProductId)
    : null;

  const showNavigation = slideCount > 1 && config?.showArrows !== false;
  const showPagination = slideCount > 1 && config?.showDots !== false;
  const isTransitionFade = config?.transitionEffect === 'fade';

  // Render Inner Slide Content based on archetype
  const renderSlideContent = (slide: CMSPromoSlide) => {
    // 1. IMAGE ONLY
    if (slide.type === 'image_only' && slide.imageUrl) {
      return (
        <div 
          onClick={slide.ctaUrl ? () => handleCtaClick(slide) : undefined}
          className={`w-full h-full relative group overflow-hidden ${slide.ctaUrl ? 'cursor-pointer' : ''}`}
        >
          <img 
            src={slide.imageUrl} 
            alt={titleText || 'Promotional Slide'}
            referrerPolicy="no-referrer"
            className={`w-full h-full object-${slide.imageFit || 'cover'} transition-transform duration-700 group-hover:scale-105`}
          />
          {titleText && (
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent p-4 sm:p-5 flex flex-col justify-end">
              {badgeText && (
                <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-[#F3E5AB] mb-1">
                  {badgeText}
                </span>
              )}
              <h3 className="text-sm sm:text-base font-bold text-white line-clamp-2">
                {titleText}
              </h3>
            </div>
          )}
        </div>
      );
    }

    // 2. TEXT ONLY
    if (slide.type === 'text_only') {
      return (
        <div 
          onClick={slide.ctaUrl ? () => handleCtaClick(slide) : undefined}
          className={`w-full h-full p-4 sm:p-6 md:p-7 flex flex-col justify-between relative ${slide.ctaUrl ? 'cursor-pointer group' : ''}`}
        >
          {/* Top Badge */}
          {badgeText && (
            <div className="flex items-center gap-1.5 z-10">
              <span className={`text-[10px] sm:text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                isDarkBg ? 'bg-white/10 text-[#F3E5AB] border border-white/15' : 'bg-black/5 text-[#737373] border border-black/10'
              }`}>
                {badgeText}
              </span>
            </div>
          )}

          {/* Middle Typography */}
          <div className="my-auto py-2 z-10">
            {titleText && (
              <h3 className={`text-base sm:text-lg md:text-xl font-bold tracking-tight line-clamp-3 leading-snug ${
                isDarkBg ? 'text-white' : 'text-[#111111]'
              }`}>
                {titleText}
              </h3>
            )}
            {descriptionText && (
              <p className={`text-xs sm:text-sm mt-2 line-clamp-4 leading-relaxed ${
                isDarkBg ? 'text-white/70' : 'text-[#666666]'
              }`}>
                {descriptionText}
              </p>
            )}
          </div>

          {/* Bottom CTA */}
          {slide.showCta !== false && (ctaText || slide.ctaUrl) && (
            <div className="z-10 mt-auto pt-2 flex items-center justify-between">
              <button
                type="button"
                onClick={(e) => handleCtaClick(slide, e)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95 ${
                  isDarkBg 
                    ? 'bg-white text-black hover:bg-[#F3E5AB]' 
                    : 'bg-[#111111] text-white hover:bg-[#8F7137]'
                }`}
              >
                <span>{ctaText || (isAr ? 'اكتشف المزيد' : 'Learn More')}</span>
                <ArrowRight className={`w-3.5 h-3.5 ${isAr ? 'rotate-180' : ''}`} />
              </button>
            </div>
          )}
        </div>
      );
    }

    // 3. PRODUCT PROMOTION
    if (slide.type === 'product_promotion' && selectedProduct) {
      return (
        <div 
          onClick={() => openProductDetail(selectedProduct)}
          className="w-full h-full p-3.5 sm:p-5 md:p-6 flex flex-col justify-between relative cursor-pointer group"
        >
          {/* Top Badge & Colors */}
          <div className="flex items-center justify-between z-10">
            <div className="flex items-center gap-2 min-w-0">
              <div className={`text-[10px] sm:text-[11px] font-bold uppercase tracking-wider truncate ${
                isDarkBg ? 'text-[#F3E5AB]' : 'text-[#737373]'
              }`}>
                {badgeText || selectedProduct.category || (isAr ? 'منتج مميز' : 'Special Feature')}
              </div>
              {Array.isArray((selectedProduct as any).colors) && (selectedProduct as any).colors.length > 0 && (
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {((selectedProduct as any).colors as string[]).map((col, i) => (
                    <span
                      key={i}
                      className="w-3.5 h-3.5 sm:w-[18px] sm:h-[18px] rounded-full border border-black/15 shadow-2xs flex-shrink-0"
                      style={{ backgroundColor: col }}
                      title={col}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Product Image */}
          <div className="relative w-full h-[98px] min-[360px]:h-[104px] sm:h-[130px] lg:h-[200px] xl:h-[220px] my-auto py-1 sm:py-2 flex items-center justify-center overflow-hidden">
            <img
              src={slide.imageUrl || selectedProduct.image}
              alt={selectedProduct.name}
              referrerPolicy="no-referrer"
              onError={(e) => {
                e.currentTarget.src = 'https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&q=80&w=800';
              }}
              className={`max-h-full max-w-full object-${slide.imageFit || 'contain'} object-center transition-all duration-500 group-hover:scale-105`}
            />
          </div>

          {/* Product Info & Cart Action */}
          <div className="flex items-end justify-between gap-2 sm:gap-3 z-10 sm:pt-3 sm:mt-auto">
            <div className="min-w-0 flex-1">
              <h3 className={`text-[12px] min-[360px]:text-[13px] sm:text-[15px] font-bold line-clamp-2 leading-[1.25] sm:leading-snug ${
                isDarkBg ? 'text-white' : 'text-[#111111]'
              }`}>
                {titleText || (isAr ? (selectedProduct.arabicName || selectedProduct.name) : selectedProduct.name)}
              </h3>
              <p className={`text-[10px] sm:text-[12px] truncate mt-0.5 ${
                isDarkBg ? 'text-white/70' : 'text-[#666666]'
              }`}>
                {descriptionText || selectedProduct.artisan || selectedProduct.seller || (isAr ? 'حرفي لبناني' : 'Lebanese Artisan')}
              </p>
            </div>

            <button
              type="button"
              id={`promo-slider-add-${selectedProduct.id}`}
              onClick={(e) => {
                e.stopPropagation();
                addToCart(selectedProduct);
                showToast(isAr ? `تمت إضافة ${selectedProduct.arabicName || selectedProduct.name} إلى السلة` : `Added ${selectedProduct.name} to basket`, 'success');
              }}
              aria-label={isAr ? 'إضافة إلى السلة' : 'Add to cart'}
              className="flex items-center gap-1 min-[360px]:gap-1.5 sm:gap-2 px-2.5 min-[360px]:px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-full bg-[#111111] hover:bg-[#8F7137] text-white text-[10px] min-[360px]:text-[11px] sm:text-[12px] font-medium tracking-wide shadow-xs transition-colors cursor-pointer flex-shrink-0 active:scale-95"
            >
              <span className="whitespace-nowrap">{isAr ? 'إضافة' : 'Add'}</span>
              <span className="opacity-40">|</span>
              <span className="font-bold text-[#F3E5AB] font-mono whitespace-nowrap">
                {formatPrice(selectedProduct.priceUSD)}
              </span>
            </button>
          </div>
        </div>
      );
    }

    // 4. DEFAULT / CUSTOM / IMAGE + TEXT
    return (
      <div 
        onClick={slide.ctaUrl ? () => handleCtaClick(slide) : undefined}
        className={`w-full h-full p-3.5 sm:p-5 md:p-6 flex flex-col justify-between relative ${slide.ctaUrl ? 'cursor-pointer group' : ''}`}
      >
        {/* Top Header / Badge */}
        <div className="flex items-center justify-between z-10">
          {badgeText ? (
            <div className={`text-[10px] sm:text-[11px] font-bold uppercase tracking-wider truncate px-2.5 py-0.5 rounded-full ${
              isDarkBg ? 'bg-white/10 text-[#F3E5AB] border border-white/15' : 'bg-black/5 text-[#737373] border border-black/10'
            }`}>
              {badgeText}
            </div>
          ) : <div />}
          
          {slide.showCta !== false && slide.ctaUrl && (
            <div className={`text-xs opacity-70 group-hover:opacity-100 transition-opacity ${
              isDarkBg ? 'text-white' : 'text-[#737373]'
            }`}>
              <ArrowRight className={`w-3.5 h-3.5 ${isAr ? 'rotate-180' : ''}`} />
            </div>
          )}
        </div>

        {/* Center Image */}
        {slide.imageUrl ? (
          <div className="relative w-full h-[90px] min-[360px]:h-[100px] sm:h-[125px] lg:h-[190px] xl:h-[210px] my-auto py-1 sm:py-2 flex items-center justify-center overflow-hidden">
            <img
              src={slide.imageUrl}
              alt={titleText || 'Promotional Slide'}
              referrerPolicy="no-referrer"
              onError={(e) => {
                e.currentTarget.src = 'https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?auto=format&fit=crop&q=80&w=800';
              }}
              className={`max-h-full max-w-full object-${slide.imageFit || 'contain'} object-center transition-all duration-500 group-hover:scale-105`}
            />
          </div>
        ) : (
          <div className="my-auto" />
        )}

        {/* Bottom Content Info & CTA */}
        <div className="flex items-end justify-between gap-2 sm:gap-3 z-10 sm:pt-2 sm:mt-auto">
          <div className="min-w-0 flex-1">
            {titleText && (
              <h3 className={`text-[12px] min-[360px]:text-[13px] sm:text-[15px] font-bold line-clamp-2 leading-[1.25] sm:leading-snug ${
                isDarkBg ? 'text-white' : 'text-[#111111]'
              }`}>
                {titleText}
              </h3>
            )}
            {descriptionText && (
              <p className={`text-[10px] sm:text-[12px] truncate mt-0.5 ${
                isDarkBg ? 'text-white/70' : 'text-[#666666]'
              }`}>
                {descriptionText}
              </p>
            )}
          </div>

          {slide.showCta !== false && (ctaText || slide.ctaUrl) && (
            <button
              type="button"
              onClick={(e) => handleCtaClick(slide, e)}
              aria-label={ctaText || (isAr ? 'استكشف' : 'Explore')}
              className={`flex items-center gap-1 min-[360px]:gap-1.5 sm:gap-2 px-2.5 min-[360px]:px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-full text-[10px] min-[360px]:text-[11px] sm:text-[12px] font-medium tracking-wide shadow-xs transition-colors cursor-pointer flex-shrink-0 active:scale-95 ${
                isDarkBg 
                  ? 'bg-white text-black hover:bg-[#F3E5AB]' 
                  : 'bg-[#111111] hover:bg-[#8F7137] text-white'
              }`}
            >
              <span className="whitespace-nowrap">{ctaText || (isAr ? 'استكشف' : 'Explore')}</span>
              <ArrowRight className={`w-3 h-3 ${isAr ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div 
      id="homepage-content-slider"
      className={`relative rounded-[20px] overflow-hidden shadow-sm transition-all min-w-0 h-[200px] sm:h-[260px] md:h-[260px] lg:h-[400px] xl:h-[420px] ${getSlideBgClasses(currentSlide)} ${className}`}
      style={customStyle}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Dynamic Slide Presentation */}
      <div className="w-full h-full relative">
        {validSlides.map((slide, idx) => {
          const isActive = idx === currentIndex;
          
          if (isTransitionFade) {
            return (
              <div
                key={slide.id || idx}
                aria-hidden={!isActive}
                className={`absolute inset-0 w-full h-full transition-opacity duration-700 ease-in-out ${
                  isActive ? 'opacity-100 z-10 pointer-events-auto' : 'opacity-0 z-0 pointer-events-none'
                }`}
              >
                {renderSlideContent(slide)}
              </div>
            );
          }

          // Slide Transition
          const offset = idx - currentIndex;
          return (
            <div
              key={slide.id || idx}
              aria-hidden={!isActive}
              className={`absolute inset-0 w-full h-full transition-transform duration-500 ease-out ${
                isActive ? 'z-10 pointer-events-auto' : 'z-0 pointer-events-none'
              }`}
              style={{
                transform: `translateX(${offset * 100}%)`
              }}
            >
              {renderSlideContent(slide)}
            </div>
          );
        })}
      </div>

      {/* Navigation Arrows (Only rendered when 2+ slides exist & enabled in settings) */}
      {showNavigation && (
        <div className="absolute top-3 end-3 z-30 flex items-center gap-1">
          <button
            type="button"
            onClick={handlePrev}
            aria-label="Previous slide"
            className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-black/30 hover:bg-black/60 border border-white/20 text-white flex items-center justify-center transition-all cursor-pointer active:scale-95 shadow-xs backdrop-blur-xs"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleNext}
            aria-label="Next slide"
            className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-black/30 hover:bg-black/60 border border-white/20 text-white flex items-center justify-center transition-all cursor-pointer active:scale-95 shadow-xs backdrop-blur-xs"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Pagination Dots (Only rendered when 2+ slides exist & enabled in settings) */}
      {showPagination && (
        <div className="absolute bottom-2.5 start-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 px-2 py-1 rounded-full bg-black/25 backdrop-blur-xs border border-white/10">
          {validSlides.map((s, idx) => (
            <button
              key={s.id || idx}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setCurrentIndex(idx);
              }}
              aria-label={`Go to slide ${idx + 1}`}
              className={`transition-all rounded-full cursor-pointer ${
                idx === currentIndex
                  ? 'w-4 h-1.5 bg-[#F3E5AB]'
                  : 'w-1.5 h-1.5 bg-white/40 hover:bg-white/70'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// Aliases for seamless integration across architecture
export const HomepageContentSlider = HomepagePromoSlider;
export const HomePromoBanner = HomepagePromoSlider;
export default HomepagePromoSlider;
