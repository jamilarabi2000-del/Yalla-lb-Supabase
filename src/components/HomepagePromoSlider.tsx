import React, { useState, useEffect, useRef, useCallback } from 'react';
import { responsiveImage } from '../lib/responsiveImage';
import { useMediaQuery } from '../hooks/useMediaQuery';
import {
  alignClass, buttonRender, colorStyle, isDarkSlide, itemsClass, justifyColClass, justifyRowClass, marginClass,
  onDarkBackground, overlayStyle, resolveDesign, safeColor, selfClass,
} from '../lib/promoSlideDesign';
// The photo the hero falls back to; the same file, so it costs nothing extra.
import fallbackPhoto from '../assets/images/raouche_rocks_sunset_1786799732002.webp';
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
  /** The element id; the CMS gives its second preview another one, as an id must be unique on a page. */
  elementId?: string;
  /**
   * 'auto' follows the screen: a slider from 1024px, a row of cards below.
   * The CMS preview forces one of them to show the other screen's layout.
   */
  layout?: 'auto' | 'slider' | 'cards';
}

export const HomepagePromoSlider: React.FC<HomepagePromoSliderProps> = ({ 
  bannerConfig, 
  className = '',
  elementId = 'homepage-content-slider',
  layout = 'auto'
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
  // From 1024px the banner is a slider beside the hero; below that it is a row
  // of cards under the hero (see the end of this component).
  const wideScreen = useMediaQuery('(min-width: 1024px)');
  const isWide = layout === 'slider' ? true : layout === 'cards' ? false : wideScreen;
  const touchStartXRef = useRef<number | null>(null);
  const touchEndXRef = useRef<number | null>(null);

  const slideCount = validSlides.length;

  // Ensure current index is within bounds if slides list changes
  useEffect(() => {
    if (currentIndex >= slideCount && slideCount > 0) {
      setCurrentIndex(0);
    }
  }, [slideCount, currentIndex]);

  // Autoplay handler (the slider only; the cards are swiped by hand)
  useEffect(() => {
    if (!isWide || slideCount <= 1 || isPaused || config?.autoplay === false) return;

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
  }, [isWide, slideCount, isPaused, config?.autoplay, config?.autoplayInterval, config?.loop]);

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
          <div className="w-10 h-10 rounded-full bg-[#B89753]/20 flex items-center justify-center text-[#7d6230] mb-2">
            <Settings className="w-5 h-5 animate-spin-slow" />
          </div>
          <p className="text-xs sm:text-sm font-bold text-[#7d6230]">
            {isAr ? 'السلايدر الترويجي معطّل أو لا توجد شرائح صالحة' : 'Promo Slider (0 Valid Slides / Disabled)'}
          </p>
          <p className="text-[11px] text-[#666666] mt-1 max-w-[240px]">
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

  const pickText = (en?: string, ar?: string) => (isAr ? (ar || en) : (en || ar));
  const productFor = (sl: CMSPromoSlide) => (sl.type === 'product_promotion' && sl.selectedProductId
    ? products.find(p => p.id === sl.selectedProductId) ?? null
    : null);

  const showNavigation = slideCount > 1 && config?.showArrows !== false;
  const showPagination = slideCount > 1 && config?.showDots !== false;
  const isTransitionFade = config?.transitionEffect === 'fade';

  // A photo the browser cannot load is swapped, once, for the bundled photo the
  // hero falls back to. Every promo photo uses this, so what the CMS promises
  // about a broken link is true for every slide type and both layouts.
  const showFallbackPhoto = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.dataset.fallback === '1') return;
    img.dataset.fallback = '1';
    img.removeAttribute('srcset');
    img.src = fallbackPhoto;
  };

  // Render Inner Slide Content based on archetype. Each slide has its own
  // text and design, so nothing here reads the slide on show.
  const renderSlideContent = (slide: CMSPromoSlide) => {
    const design = resolveDesign(slide);
    const isDarkBg = isDarkSlide(slide);
    const selectedProduct = productFor(slide);
    const badgeText = pickText(slide.badge, slide.badgeArabic);
    const titleText = pickText(slide.title, slide.titleArabic);
    const descriptionText = pickText(slide.description, slide.descriptionArabic);
    const ctaText = pickText(slide.ctaText, slide.ctaTextArabic);
    // The designed button, or null when the administrator left it as it was.
    const button = buttonRender(design, isDarkBg);
    // The arrows sit at the top end and the dots at the bottom centre. Text a
    // design puts there moves clear of them; a slide with no design is left as it was.
    const clearArrows = showNavigation && design.align === 'end';

    // 1. IMAGE ONLY
    if (slide.type === 'image_only' && slide.imageUrl) {
      const position = design.position ?? 'bottom';
      const scrim = position === 'top' ? 'bg-gradient-to-b from-black/80 via-black/20 to-transparent'
        : position === 'middle' ? 'bg-black/45'
        : 'bg-gradient-to-t from-black/80 via-black/20 to-transparent';
      return (
        <div 
          onClick={slide.ctaUrl ? () => handleCtaClick(slide) : undefined}
          className={`w-full h-full relative group overflow-hidden ${slide.ctaUrl ? 'cursor-pointer' : ''}`}
        >
          <img 
            key={slide.imageUrl}
            src={slide.imageUrl} 
            {...responsiveImage(slide.imageUrl, '(min-width: 1024px) 360px, 100vw')}
            decoding="async"
            alt={titleText || 'Promotional Slide'}
            referrerPolicy="no-referrer"
            onError={showFallbackPhoto}
            className={`w-full h-full object-${slide.imageFit || 'cover'} transition-transform duration-700 group-hover:scale-105`}
          />
          {design.overlay > 0 && (
            <span aria-hidden="true" className="absolute inset-0 pointer-events-none" style={overlayStyle(design.overlay)} />
          )}
          {titleText && (
            <div className={`absolute inset-0 ${scrim} p-4 sm:p-5 flex flex-col ${justifyColClass(position)} ${itemsClass(design.align)} ${alignClass(design.align)}`}>
              {design.position === 'top' && showNavigation && <span aria-hidden="true" className="h-7 shrink-0" />}
              {badgeText && (
                <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-[#F3E5AB] mb-1" style={colorStyle(design.badgeColor)}>
                  {badgeText}
                </span>
              )}
              <h3 className="text-sm sm:text-base font-bold text-white line-clamp-2" style={colorStyle(design.titleColor)}>
                {titleText}
              </h3>
              {design.position === 'bottom' && showPagination && <span aria-hidden="true" className="h-3 shrink-0" />}
            </div>
          )}
        </div>
      );
    }

    // 2. TEXT ONLY
    if (slide.type === 'text_only') {
      const ctaAlign = design.button.align ?? design.align;
      return (
        <div 
          onClick={slide.ctaUrl ? () => handleCtaClick(slide) : undefined}
          className={`w-full h-full p-4 sm:p-6 md:p-7 flex flex-col justify-between relative ${itemsClass(design.align)} ${alignClass(design.align)} ${slide.ctaUrl ? 'cursor-pointer group' : ''}`}
        >
          {/* Top Badge */}
          {badgeText && (
            <div className={`flex items-center gap-1.5 z-10 ${clearArrows ? 'mt-7' : ''}`}>
              <span className={`text-[10px] sm:text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                isDarkBg ? 'bg-white/10 text-[#F3E5AB] border border-white/15' : 'bg-black/5 text-[#595959] border border-black/10'
              }`} style={colorStyle(design.badgeColor)}>
                {badgeText}
              </span>
            </div>
          )}

          {/* Middle Typography */}
          <div className={`${marginClass(design.position) || 'my-auto'} py-2 z-10`}>
            {titleText && (
              <h3 className={`text-base sm:text-lg md:text-xl font-bold tracking-tight line-clamp-3 leading-snug ${
                isDarkBg ? 'text-white' : 'text-[#111111]'
              }`} style={colorStyle(design.titleColor)}>
                {titleText}
              </h3>
            )}
            {descriptionText && (
              <p className={`text-xs sm:text-sm mt-2 line-clamp-4 leading-relaxed ${
                isDarkBg ? 'text-white/70' : 'text-[#666666]'
              }`} style={colorStyle(design.descriptionColor)}>
                {descriptionText}
              </p>
            )}
          </div>

          {/* Bottom CTA */}
          {slide.showCta !== false && (ctaText || slide.ctaUrl) && (
            <div className={`z-10 mt-auto pt-2 w-full flex items-center ${justifyRowClass(ctaAlign) || 'justify-between'}`}>
              <button
                type="button"
                onClick={(e) => handleCtaClick(slide, e)}
                className={button
                  ? button.className
                  : `flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95 ${
                    isDarkBg 
                      ? 'bg-white text-black hover:bg-[#F3E5AB]' 
                      : 'bg-[#111111] text-white hover:bg-[#8F7137]'
                  }`}
                style={button?.style}
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
                isDarkBg ? 'text-[#F3E5AB]' : 'text-[#595959]'
              }`} style={colorStyle(design.badgeColor)}>
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
              key={slide.imageUrl || selectedProduct.image}
              src={slide.imageUrl || selectedProduct.image}
              {...responsiveImage(slide.imageUrl || selectedProduct.image, '240px')}
              decoding="async"
              alt={selectedProduct.name}
              referrerPolicy="no-referrer"
              onError={showFallbackPhoto}
              className={`max-h-full max-w-full object-${slide.imageFit || 'contain'} object-center transition-all duration-500 group-hover:scale-105`}
            />
          </div>

          {/* Product Info & Cart Action */}
          <div className="flex items-end justify-between gap-2 sm:gap-3 z-10 sm:pt-3 sm:mt-auto">
            <div className={`min-w-0 flex-1 ${alignClass(design.align)}`}>
              <h3 className={`text-[12px] min-[360px]:text-[13px] sm:text-[15px] font-bold line-clamp-2 leading-[1.25] sm:leading-snug ${
                isDarkBg ? 'text-white' : 'text-[#111111]'
              }`} style={colorStyle(design.titleColor)}>
                {titleText || (isAr ? (selectedProduct.arabicName || selectedProduct.name) : selectedProduct.name)}
              </h3>
              <p className={`text-[10px] sm:text-[12px] truncate mt-0.5 ${
                isDarkBg ? 'text-white/70' : 'text-[#666666]'
              }`} style={colorStyle(design.descriptionColor)}>
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
              className={button
                ? `${button.className} flex-shrink-0`
                : 'flex items-center gap-1 min-[360px]:gap-1.5 sm:gap-2 px-2.5 min-[360px]:px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-full bg-[#111111] hover:bg-[#8F7137] text-white text-[10px] min-[360px]:text-[11px] sm:text-[12px] font-medium tracking-wide shadow-xs transition-colors cursor-pointer flex-shrink-0 active:scale-95'}
              style={button?.style}
            >
              <span className="whitespace-nowrap">{isAr ? 'إضافة' : 'Add'}</span>
              <span className="opacity-40">|</span>
              <span className={`font-bold font-mono whitespace-nowrap ${button ? '' : 'text-[#F3E5AB]'}`}>
                {formatPrice(selectedProduct.priceUSD)}
              </span>
            </button>
          </div>
        </div>
      );
    }

    // 4. DEFAULT / CUSTOM / IMAGE + TEXT
    // With an alignment (or button alignment) chosen, the title and button stack
    // and follow it; otherwise they sit side by side as they always have.
    const stacked = Boolean(design.align || design.button.align);
    const textAlign = design.align ?? 'start';
    const ctaAlign = design.button.align ?? textAlign;
    return (
      <div 
        onClick={slide.ctaUrl ? () => handleCtaClick(slide) : undefined}
        className={`w-full h-full p-3.5 sm:p-5 md:p-6 flex flex-col justify-between relative ${slide.ctaUrl ? 'cursor-pointer group' : ''}`}
      >
        {/* Top Header / Badge */}
        <div className={`flex items-center z-10 ${design.align ? justifyRowClass(design.align) : 'justify-between'} ${clearArrows ? 'mt-7' : ''}`}>
          {badgeText ? (
            <div className={`text-[10px] sm:text-[11px] font-bold uppercase tracking-wider truncate px-2.5 py-0.5 rounded-full ${
              isDarkBg ? 'bg-white/10 text-[#F3E5AB] border border-white/15' : 'bg-black/5 text-[#595959] border border-black/10'
            }`} style={colorStyle(design.badgeColor)}>
              {badgeText}
            </div>
          ) : <div />}
          
          {!design.align && slide.showCta !== false && slide.ctaUrl && (
            <div className={`text-xs opacity-70 group-hover:opacity-100 transition-opacity ${
              isDarkBg ? 'text-white' : 'text-[#666666]'
            }`}>
              <ArrowRight className={`w-3.5 h-3.5 ${isAr ? 'rotate-180' : ''}`} />
            </div>
          )}
        </div>

        {/* Center Image */}
        {slide.imageUrl ? (
          <div className="relative w-full h-[90px] min-[360px]:h-[100px] sm:h-[125px] lg:h-[190px] xl:h-[210px] my-auto py-1 sm:py-2 flex items-center justify-center overflow-hidden">
            <img
              key={slide.imageUrl}
              src={slide.imageUrl}
              {...responsiveImage(slide.imageUrl, '240px')}
              decoding="async"
              alt={titleText || 'Promotional Slide'}
              referrerPolicy="no-referrer"
              onError={showFallbackPhoto}
              className={`max-h-full max-w-full object-${slide.imageFit || 'contain'} object-center transition-all duration-500 group-hover:scale-105`}
            />
          </div>
        ) : (
          <div className="my-auto" />
        )}

        {/* Bottom Content Info & CTA */}
        <div className={stacked
          ? `flex flex-col gap-2 z-10 sm:pt-2 sm:mt-auto ${itemsClass(textAlign)} ${alignClass(textAlign)}`
          : 'flex items-end justify-between gap-2 sm:gap-3 z-10 sm:pt-2 sm:mt-auto'}>
          <div className={stacked ? 'min-w-0 max-w-full' : 'min-w-0 flex-1'}>
            {titleText && (
              <h3 className={`text-[12px] min-[360px]:text-[13px] sm:text-[15px] font-bold line-clamp-2 leading-[1.25] sm:leading-snug ${
                isDarkBg ? 'text-white' : 'text-[#111111]'
              }`} style={colorStyle(design.titleColor)}>
                {titleText}
              </h3>
            )}
            {descriptionText && (
              <p className={`text-[10px] sm:text-[12px] truncate mt-0.5 ${
                isDarkBg ? 'text-white/70' : 'text-[#666666]'
              }`} style={colorStyle(design.descriptionColor)}>
                {descriptionText}
              </p>
            )}
          </div>

          {slide.showCta !== false && (ctaText || slide.ctaUrl) && (
            <button
              type="button"
              onClick={(e) => handleCtaClick(slide, e)}
              aria-label={ctaText || (isAr ? 'استكشف' : 'Explore')}
              className={`${button
                ? `${button.className} flex-shrink-0`
                : `flex items-center gap-1 min-[360px]:gap-1.5 sm:gap-2 px-2.5 min-[360px]:px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-full text-[10px] min-[360px]:text-[11px] sm:text-[12px] font-medium tracking-wide shadow-xs transition-colors cursor-pointer flex-shrink-0 active:scale-95 ${
                  isDarkBg 
                    ? 'bg-white text-black hover:bg-[#F3E5AB]' 
                    : 'bg-[#111111] hover:bg-[#8F7137] text-white'
                }`} ${stacked ? selfClass(ctaAlign) : ''}`}
              style={button?.style}
            >
              <span className="whitespace-nowrap">{ctaText || (isAr ? 'استكشف' : 'Explore')}</span>
              <ArrowRight className={`w-3 h-3 ${isAr ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>
      </div>
    );
  };

  // One card per slide: the photo with its badge, title and button over it. The
  // texts and the button are real elements (same tags as the desktop slider, so
  // Style Text rules match on both layouts). The whole card opens what the
  // slide's button or link would open, through the button's own stretched
  // click area, or an invisible button when the slide has none.
  // Phones show one card and the edge of the next; tablets two, and the edge of
  // a third when there is one, so the row reads as something to swipe.
  const renderCard = (slide: CMSPromoSlide, idx: number, width: string) => {
    const design = resolveDesign(slide);
    const product = productFor(slide);
    const badge = pickText(slide.badge, slide.badgeArabic) || '';
    const title = pickText(slide.title, slide.titleArabic)
      || (product ? (isAr ? (product.arabicName || product.name) : product.name) : '');
    const cta = pickText(slide.ctaText, slide.ctaTextArabic) || '';
    const image = slide.imageUrl || product?.image || '';
    const onDark = onDarkBackground(slide, 'cards', Boolean(image));
    const custom = slide.bgStyle === 'custom_color';
    const hasButton = !product && slide.type !== 'image_only' && slide.showCta !== false && Boolean(cta || slide.ctaUrl);
    const opens = Boolean(product) || Boolean(slide.ctaUrl) || hasButton;
    // Position applies to the slide types that have a free text block.
    const position = slide.type === 'image_only' || slide.type === 'text_only' ? design.position : undefined;
    const label = title || badge || cta || (isAr ? 'عرض' : 'Promotion');
    const open = () => (product ? openProductDetail(product) : handleCtaClick(slide));
    const BadgeTag = (slide.type === 'image_only' || slide.type === 'text_only' ? 'span' : 'div') as React.ElementType;
    const style: React.CSSProperties | undefined = custom
      ? { backgroundColor: safeColor(slide.customBgColor), color: safeColor(slide.customTextColor) }
      : undefined;
    const scrim = !image ? ''
      : position === 'top' ? 'bg-gradient-to-b from-black/80 via-black/25 to-transparent'
      : position === 'middle' ? 'bg-black/45'
      : 'bg-gradient-to-t from-black/85 via-black/25 to-transparent';
    const designed = buttonRender(design, onDark);
    const ctaAlign = design.button.align ?? design.align;
    // The stretched click area replaces the press-in effect: a button that
    // shrinks under the finger would cancel the tap that started on the card.
    const stretch = 'after:absolute after:inset-0';
    const ctaClass = designed
      ? `${designed.className.replace('active:scale-95', '')} ${stretch}`
      : `inline-flex items-center gap-1.5 min-h-6 px-3 py-1.5 rounded-full text-[11px] font-bold shadow-xs transition-colors cursor-pointer ${stretch} ${
        onDark ? 'bg-white text-black hover:bg-[#F3E5AB]' : 'bg-[#111111] text-white hover:bg-[#8F7137]'}`;
    const titleClass = custom && !image ? '' : onDark ? 'text-white' : 'text-[#111111]';
    const badgeClass = onDark ? 'text-[#F3E5AB]' : custom ? '' : 'text-[#595959]';
    return (
      <div key={slide.id || idx} role="listitem" className={`${width} shrink-0 snap-start`}>
        <article
          className={`relative block w-full h-[150px] sm:h-[180px] rounded-2xl overflow-hidden text-start shadow-sm ${getSlideBgClasses(slide)}`}
          style={style}
        >
          {image && (
            <img
              key={image}
              src={image}
              {...responsiveImage(image, width === 'w-full' ? '100vw' : '(min-width: 640px) 50vw, 72vw')}
              loading="lazy"
              decoding="async"
              alt=""
              referrerPolicy="no-referrer"
              onError={showFallbackPhoto}
              className={`absolute inset-0 w-full h-full object-${slide.imageFit || (product ? 'contain' : 'cover')}`}
            />
          )}
          {image && design.overlay > 0 && (
            <span aria-hidden="true" className="absolute inset-0 pointer-events-none" style={overlayStyle(design.overlay)} />
          )}
          <div className={`absolute inset-0 flex flex-col gap-1 p-3 ${scrim} ${justifyColClass(position) || 'justify-end'} ${itemsClass(design.align)} ${alignClass(design.align)}`}>
            {badge && (
              <BadgeTag className={`text-[10px] font-bold uppercase tracking-wider truncate max-w-full ${badgeClass}`} style={colorStyle(design.badgeColor)}>
                {badge}
              </BadgeTag>
            )}
            {title && (
              <h3 className={`text-[13px] sm:text-sm font-bold leading-snug ${image ? 'line-clamp-2' : 'line-clamp-3'} ${titleClass}`} style={colorStyle(design.titleColor)}>
                {title}
              </h3>
            )}
            {product && (
              <span className="text-xs font-bold font-mono text-[#F3E5AB]">{formatPrice(product.priceUSD)}</span>
            )}
            {hasButton && (
              <button
                type="button"
                onClick={open}
                className={`${ctaClass} mt-1 ${selfClass(ctaAlign)}`}
                style={designed?.style}
              >
                <span className="whitespace-nowrap">{cta || (isAr ? 'استكشف' : 'Explore')}</span>
                <ArrowRight className={`w-3 h-3 ${isAr ? 'rotate-180' : ''}`} />
              </button>
            )}
          </div>
          {opens && !hasButton && (
            <button type="button" onClick={open} aria-label={label} className="absolute inset-0 z-10 cursor-pointer" />
          )}
        </article>
      </div>
    );
  };

  // Below 1024px the banner sits under the hero, which keeps its height: every
  // slide becomes a card in a row the shopper swipes, instead of one slide at a
  // time. Only this row is rendered, so no hidden slider downloads its photos.
  if (!isWide) {
    const width = slideCount === 1 ? 'w-full' : slideCount === 2 ? 'w-[72%] sm:w-[calc(50%-6px)]' : 'w-[72%] sm:w-[46%]';
    return (
      <div data-cms-element="promo-slider" id={elementId} className={`min-w-0 ${className}`}>
        <div
          role="list"
          aria-label={isAr ? 'العروض' : 'Promotions'}
          className="flex gap-3 overflow-x-auto snap-x snap-mandatory scroll-smooth"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {validSlides.map((slide, idx) => renderCard(slide, idx, width))}
        </div>
      </div>
    );
  }

  return (
    <div data-cms-element="promo-slider"
      id={elementId}
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
        <div className="absolute bottom-2.5 start-1/2 -translate-x-1/2 z-30 flex items-center px-1 py-1 rounded-full bg-black/25 backdrop-blur-xs border border-white/10">
          {validSlides.map((s, idx) => (
            // A 24px target around the small dot; the negative margin keeps the
            // pill as tall as the dot.
            <button
              key={s.id || idx}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setCurrentIndex(idx);
              }}
              aria-label={`Go to slide ${idx + 1}`}
              className="group h-6 min-w-6 -my-[9px] flex items-center justify-center cursor-pointer"
            >
              <span aria-hidden className={`block transition-all rounded-full ${
                idx === currentIndex
                  ? 'w-4 h-1.5 bg-[#F3E5AB]'
                  : 'w-1.5 h-1.5 bg-white/40 group-hover:bg-white/70'
              }`} />
            </button>
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
