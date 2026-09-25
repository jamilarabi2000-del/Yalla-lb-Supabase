import React, { useEffect, useMemo, useState } from 'react';
import { Eye, Image as ImageIcon, ShoppingBag, Star, Truck, ShieldCheck, RotateCcw, ChevronLeft, ChevronRight, Sparkles, Tag } from 'lucide-react';
import { useShop } from '../../context/ShopContext';
import { isProductVisibleOnStorefront, getFeaturedStorefrontProducts } from '../../lib/storefrontVisibility';
import type { SectionVisibilityConfig } from '../../types';

type Device = 'desktop' | 'tablet' | 'mobile';
interface Props { order: string[]; visibility: SectionVisibilityConfig; device: Device; }

const labels: Record<string, string> = {
  homeHero: 'Hero / Main Banner', homeCategories: 'Categories', homeFeatured: 'Featured Products', homeDeals: 'Deals', homeBundles: 'Bundles',
  homeNews: 'News', homeNewArrivals: 'New Arrivals', homeTrustBadges: 'Trust & Benefits', homeHeritage: 'Heritage / Story', homeReviews: 'Customer Reviews', homeNewsletter: 'Newsletter'
};

const widthClass: Record<Device, string> = { desktop: 'max-w-[1100px]', tablet: 'max-w-[768px]', mobile: 'max-w-[390px]' };
const imageFitClass = (fit?: string) => fit === 'fill' ? 'object-fill' : fit === 'cover' ? 'object-cover' : 'object-contain';
const isActive = (item: any) => {
  if (!item || item.isPublished === false) return false;
  if (item.scheduleActive) {
    const now = new Date();
    if (item.startDate) { const start = new Date(item.startDate); if (!isNaN(start.getTime()) && now < start) return false; }
    if (item.endDate) { const end = new Date(item.endDate); if (!isNaN(end.getTime()) && now > end) return false; }
  }
  return true;
};

export const ReadOnlyStorefrontPreview: React.FC<Props> = ({ order, visibility, device }) => {
  const { siteContent, categories = [], products = [], sellers = [], productBundles = [], language, formatPrice, isVisualEditMode = false } = useShop();
  const content: any = siteContent || {};
  const home: any = content.home || {};
  const hero: any = content.hero || {};
  const news: any = content.newsSection || {};
  const promo: any = content.promoBanner || {};
  const isAr = language === 'ar';

  const [heroIndex, setHeroIndex] = useState(0);
  const [promoIndex, setPromoIndex] = useState(0);

  const heroSlides = useMemo(() => {
    const media = Array.isArray(hero.bgMediaItems) ? hero.bgMediaItems.filter(isActive) : [];
    const base = media.length ? media.map((item: any, idx: number) => ({
      id: item.id || `hero-${idx}`,
      desktopUrl: item.url || item.desktopImageUrl || hero.bgImageUrl || hero.desktopImageUrl,
      mobileUrl: item.mobileUrl || item.mobileImageUrl || item.url || item.desktopImageUrl || hero.mobileImageUrl || hero.bgImageUrl,
      badge: isAr ? (item.badgeTextArabic || item.badgeText || hero.badgeTextArabic || hero.badgeText) : (item.badgeText || hero.badgeTextArabic || hero.badgeText),
      title: isAr ? (item.customTitleArabic || item.customTitle || hero.titleArabic || hero.title) : (item.customTitle || item.title || hero.title),
      subtitle: isAr ? (item.customSubtitleArabic || item.customSubtitle || hero.subtitleArabic || hero.subtitle) : (item.customSubtitle || hero.subtitle),
      button: isAr ? (item.buttonTextArabic || item.buttonText || hero.primaryBtnTextArabic || hero.primaryBtnText) : (item.buttonText || hero.primaryBtnText),
      secondary: isAr ? (item.secondaryBtnTextArabic || item.secondaryBtnText || hero.secondaryBtnTextArabic || hero.secondaryBtnText) : (item.secondaryBtnText || hero.secondaryBtnText),
      promoCode: item.promoCode,
      desktopFit: item.desktopImageFit || item.imageFit || hero.defaultImageFit || 'contain', mobileFit: item.mobileImageFit || item.imageFit || 'cover',
      desktopZoom: Number(item.desktopImageZoom || item.imageZoom || 100), mobileZoom: Number(item.mobileImageZoom || item.imageZoom || 100),
      desktopPosition: item.desktopObjectPosition || item.objectPosition || 'center', mobilePosition: item.mobileObjectPosition || item.objectPosition || 'center'
    })) : [{
      id: 'hero-primary', desktopUrl: hero.bgImageUrl || hero.desktopImageUrl, mobileUrl: hero.mobileImageUrl || hero.bgImageUrl || hero.desktopImageUrl,
      badge: isAr ? (hero.badgeTextArabic || hero.badgeText) : hero.badgeText, title: isAr ? (hero.titleArabic || hero.title) : hero.title,
      subtitle: isAr ? (hero.subtitleArabic || hero.subtitle) : hero.subtitle, button: isAr ? (hero.primaryBtnTextArabic || hero.primaryBtnText) : hero.primaryBtnText,
      secondary: isAr ? (hero.secondaryBtnTextArabic || hero.secondaryBtnText) : (hero.secondaryBtnTextArabic || hero.secondaryBtnText), promoCode: undefined,
      desktopFit: hero.defaultImageFit || 'contain', mobileFit: 'cover', desktopZoom: 100, mobileZoom: 100, desktopPosition: 'center', mobilePosition: 'center'
    }];
    const bundles = productBundles.filter((b: any) => b.isActive !== false && b.showInSlider === true).map((b: any) => ({
      id: `bundle-${b.id}`, desktopUrl: b.imageUrl?.trim() || undefined, mobileUrl: b.imageUrl?.trim() || undefined,
      badge: isAr ? (b.badgeTextAr || b.badgeText) : b.badgeText, title: isAr ? (b.nameAr || b.name) : b.name,
      subtitle: isAr ? (b.descriptionAr || b.description) : b.description, button: isAr ? (b.sliderButtonTextAr || b.sliderButtonText) : b.sliderButtonText,
      secondary: undefined, promoCode: undefined, desktopFit: 'cover', mobileFit: 'cover', desktopZoom: 100, mobileZoom: 100, desktopPosition: 'center', mobilePosition: 'center'
    }));
    return [...base, ...bundles];
  }, [hero, productBundles, isAr]);

  const promoSlides = useMemo(() => {
    if (promo.enabled === false) return [];
    const raw = Array.isArray(promo.slides) && promo.slides.length ? [...promo.slides].sort((a: any, b: any) => (a.order || 0) - (b.order || 0)) : [promo];
    return raw.filter((s: any) => isActive(s) && (s.title || s.titleArabic || s.imageUrl || s.description || s.descriptionArabic || s.badge || s.badgeArabic || s.selectedProductId || s.targetCategory || s.ctaUrl));
  }, [promo]);

  useEffect(() => { if (heroIndex >= heroSlides.length) setHeroIndex(0); }, [heroSlides.length, heroIndex]);
  useEffect(() => { if (promoIndex >= promoSlides.length) setPromoIndex(0); }, [promoSlides.length, promoIndex]);
  useEffect(() => {
    if (heroSlides.length <= 1 || hero.slideInterval === 0) return;
    const timer = window.setInterval(() => setHeroIndex(i => (i + 1) % heroSlides.length), Number(hero.slideInterval || 6) * 1000);
    return () => window.clearInterval(timer);
  }, [heroSlides.length, hero.slideInterval]);
  useEffect(() => {
    if (promoSlides.length <= 1 || promo.autoplay === false) return;
    const timer = window.setInterval(() => setPromoIndex(i => {
      if (promo.loop === false && i >= promoSlides.length - 1) return i;
      return (i + 1) % promoSlides.length;
    }), Math.max(1500, Number(promo.autoplayInterval || 5000)));
    return () => window.clearInterval(timer);
  }, [promoSlides.length, promo.autoplay, promo.autoplayInterval, promo.loop]);

  const publishedCategories = categories.filter((x: any) => x?.isPublished !== false).sort((a: any, b: any) => (a?.displayOrder ?? 999) - (b?.displayOrder ?? 999)).slice(0, 6);
  const visibleProducts = products.filter((x: any) => isProductVisibleOnStorefront(x, sellers, isVisualEditMode));
  const liveProducts = visibleProducts.slice().sort((a: any, b: any) => (a?.displayOrder ?? 99999) - (b?.displayOrder ?? 99999));
  const featuredProducts = getFeaturedStorefrontProducts(products, sellers, isVisualEditMode).slice(0, 12);
  const todaysDeals = liveProducts.filter((p: any) => p.discountPercentage && p.discountPercentage > 0).slice(0, 12);
  const newArrivals = liveProducts.slice().sort((a: any, b: any) => {
    if (a.isNewArrival && !b.isNewArrival) return -1;
    if (!a.isNewArrival && b.isNewArrival) return 1;
    if (a.createdAt && b.createdAt) return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (a.createdAt) return -1;
    if (b.createdAt) return 1;
    return 0;
  }).slice(0, 12);
  const liveBundles = productBundles.filter((x: any) => x?.isActive !== false && x?.showInSlider !== false).slice(0, 6);
  const publishedNews = (news.articles || []).filter((x: any) => x?.isPublished !== false).slice(0, 3);

  const empty = (title: string) => <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center"><ShoppingBag className="w-7 h-7 mx-auto text-slate-600"/><p className="mt-2 text-sm font-bold text-slate-600">{title}</p><p className="mt-1 text-xs text-slate-500">No live data is available, so this preview does not fabricate content.</p></div>;
  const cards = (items: any[]) => !items.length ? empty('No matching published products') : <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">{items.slice(0, 8).map((p: any) => { const name = isAr ? (p.arabicName || p.name) : p.name; const image = p.image || p.additionalImages?.[0]; const price = Number(p.priceUSD); const original = Number(p.originalPriceUSD); const discounted = Number.isFinite(price) && Number.isFinite(original) && original > price; return <article key={p.id} className="group relative flex flex-col h-full w-full rounded-xl bg-white border border-[#E5E5E5] hover:border-[#B89753]/60 shadow-2xs hover:shadow-lg transition-all duration-300 overflow-hidden"><div className="relative aspect-square w-full overflow-hidden bg-[#F8F8F6] flex items-center justify-center p-3"><div className="absolute top-2.5 left-2.5 flex flex-col gap-1 z-10 pointer-events-none">{p.stock === 0 ? <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-rose-600 text-white rounded-md shadow-xs">{isAr ? 'غير متوفر' : 'Out of Stock'}</span> : p.stock <= (p.lowStockThreshold ?? 5) ? <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-amber-600 text-slate-900 rounded-md shadow-xs">{p.lowStockNotice || (p.stock === 1 ? (isAr ? 'القطعة الأخيرة' : 'Last piece') : (isAr ? 'كمية محدودة' : 'Limited Stock'))}</span> : null}{p.discountPercentage ? <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-[#C62828] text-white rounded-md shadow-xs">-{p.discountPercentage}%</span> : null}{p.isBestseller && !p.discountPercentage && p.stock > 0 ? <span className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-[#16803C] text-white rounded-md shadow-xs">{isAr ? 'الأكثر مبيعاً' : 'Bestseller'}</span> : null}</div>{image ? <img src={image} alt={name || 'Product'} loading="lazy" className="h-full w-full object-contain object-center group-hover:scale-105 transition-transform duration-300 ease-out"/> : <ImageIcon className="w-8 h-8 text-slate-600"/>}</div><div className="flex flex-1 flex-col p-3.5 sm:p-4 justify-between space-y-2.5 bg-white"><div><span className="text-[10px] font-bold uppercase tracking-wider text-[#8F7137] line-clamp-1 block mb-0.5">{p.category}</span><div className="text-xs sm:text-sm font-bold text-[#171717] group-hover:text-[#8F7137] transition-colors line-clamp-2 leading-snug">{name || 'Unnamed product'}</div></div><div className="pt-2 border-t border-[#E5E5E5] mt-auto"><div className="flex items-baseline justify-between gap-1.5"><div className="flex items-baseline gap-1.5 flex-wrap"><span className="text-sm sm:text-base font-black text-[#171717] tracking-tight">{Number.isFinite(price) ? formatPrice(price) : '—'}</span>{discounted ? <span className="text-xs text-slate-500 line-through font-medium">{formatPrice(original)}</span> : null}</div></div><div className="mt-2 w-full"><span className="flex w-full py-2 px-3 rounded-lg bg-[#171717] text-white items-center justify-center gap-1.5 text-xs font-bold text-center"><ShoppingBag className="w-3.5 h-3.5 shrink-0"/><span>{isAr ? 'أضف للسلة' : 'Add To Cart'}</span></span></div></div></div></article>; })}</div>;

  const currentHero = heroSlides[heroIndex] || heroSlides[0];
  const heroFit = device === 'mobile' ? currentHero?.mobileFit : currentHero?.desktopFit;
  const heroPosition = device === 'mobile' ? currentHero?.mobilePosition : currentHero?.desktopPosition;
  const heroZoom = device === 'mobile' ? currentHero?.mobileZoom : currentHero?.desktopZoom;
  const promoSlide = promoSlides[promoIndex] || promoSlides[0];
  const promoTitle = promoSlide ? (isAr ? (promoSlide.titleArabic || promoSlide.title) : (promoSlide.title || promoSlide.titleArabic)) : '';
  const promoDescription = promoSlide ? (isAr ? (promoSlide.descriptionArabic || promoSlide.description) : (promoSlide.description || promoSlide.descriptionArabic)) : '';
  const promoBadge = promoSlide ? (isAr ? (promoSlide.badgeArabic || promoSlide.badge) : (promoSlide.badge || promoSlide.badgeArabic)) : '';
  const promoCta = promoSlide ? (isAr ? (promoSlide.ctaTextArabic || promoSlide.ctaText) : (promoSlide.ctaText || promoSlide.ctaTextArabic)) : '';
  const selectedPromoProduct = promoSlide?.selectedProductId ? products.find((p: any) => p.id === promoSlide.selectedProductId && p.isPublished !== false) : null;
  const promoCategory = promoSlide?.targetCategory ? categories.find((c: any) => c.id === promoSlide.targetCategory || c.nameEn === promoSlide.targetCategory || c.nameAr === promoSlide.targetCategory) : null;

  const promoBg = (slide: any) => {
    switch (slide?.bgStyle) {
      case 'dark': return 'bg-[#111111] text-white border-[#262626]';
      case 'light': return 'bg-[#fafafa] text-[#111111] border-[#E5E5E5]';
      case 'gold_gradient': return 'bg-gradient-to-br from-[#2a1c06] via-[#1a1204] to-[#0d0902] text-white border-[#B89753]/40';
      case 'emerald_gradient': return 'bg-gradient-to-br from-[#06241a] via-[#041610] to-[#020b08] text-white border-emerald-500/40';
      default: return 'bg-[#ededed] text-[#111111] border-[#E5E5E5]';
    }
  };
  const darkPromo = ['dark','gold_gradient','emerald_gradient'].includes(promoSlide?.bgStyle);

  const renderHero = () => {
    if (!currentHero) return empty('No active CMS hero configured');
    return <section className="relative overflow-hidden bg-[#000] text-white rounded-[20px] h-[200px] sm:h-[260px] md:h-[260px] lg:h-[400px] xl:h-[420px]">
      {currentHero.desktopUrl ? <><img src={currentHero.desktopUrl} alt="" className="absolute inset-0 w-full h-full object-cover blur-2xl opacity-40 scale-110"/><img src={currentHero.mobileUrl || currentHero.desktopUrl} alt={currentHero.title || ''} className={`absolute inset-0 w-full h-full ${imageFitClass(heroFit)}`} style={{ objectPosition: heroPosition || 'center', transform: heroZoom !== 100 ? `scale(${heroZoom / 100})` : undefined }} /></> : <div className="absolute inset-0 bg-slate-100"/>}
      <div className="absolute inset-0 bg-black/25"/><div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"/>
      <div className="relative z-10 h-full p-4 sm:p-7 flex flex-col justify-between"><div className="flex justify-between gap-3">{currentHero.badge ? <div className="flex items-center gap-2 text-[10px] sm:text-xs font-bold"><Sparkles className="w-4 h-4 text-amber-200"/>{currentHero.badge}</div> : <span/>}{currentHero.promoCode ? <div className="text-[9px] font-mono px-2 py-1 rounded-full bg-black/50 border border-white/20 flex items-center gap-1"><Tag className="w-3 h-3"/>{currentHero.promoCode}</div> : null}</div><div><h2 className="text-xl sm:text-3xl lg:text-4xl font-serif font-bold line-clamp-2">{currentHero.title || 'CMS Hero'}</h2>{currentHero.subtitle ? <p className="mt-2 text-[10px] sm:text-sm text-white/80 max-w-xl line-clamp-2">{currentHero.subtitle}</p> : null}</div><div className="flex items-center justify-between gap-3"><div>{currentHero.button ? <span className="inline-flex px-3 sm:px-4 py-2 rounded-xl bg-[#B89753] text-slate-900 text-[10px] sm:text-xs font-bold">{currentHero.button}</span> : null}{currentHero.secondary ? <span className="ml-2 inline-flex px-3 sm:px-4 py-2 rounded-xl bg-white/20 border border-white/30 text-white text-[10px] sm:text-xs font-bold">{currentHero.secondary}</span> : null}</div>{heroSlides.length > 1 ? <div className="flex items-center gap-2"><button type="button" aria-label="Previous hero" onClick={() => setHeroIndex(i => (i - 1 + heroSlides.length) % heroSlides.length)} className="w-7 h-7 rounded-full bg-black/40 border border-white/20 flex items-center justify-center"><ChevronLeft className="w-4 h-4"/></button><span className="text-[9px]">{heroIndex + 1}/{heroSlides.length}</span><button type="button" aria-label="Next hero" onClick={() => setHeroIndex(i => (i + 1) % heroSlides.length)} className="w-7 h-7 rounded-full bg-black/40 border border-white/20 flex items-center justify-center"><ChevronRight className="w-4 h-4"/></button></div> : null}</div></div>
      <div className="absolute top-3 right-3 z-20 rounded-full bg-black/50 text-white px-2.5 py-1 text-[8px] font-bold flex items-center gap-1"><Eye className="w-3 h-3"/> READ-ONLY PREVIEW</div>
    </section>;
  };

  const renderPromo = () => {
    if (!promoSlide) return null;
    const hasImage = !!promoSlide.imageUrl;
    const fit = imageFitClass(promoSlide.imageFit);
    const isImageOnly = promoSlide.type === 'image_only' && hasImage;
    const isTextOnly = promoSlide.type === 'text_only';
    const isProduct = promoSlide.type === 'product_promotion';
    const isCategory = promoSlide.type === 'category_promotion';
    const textColor = darkPromo ? 'text-white' : 'text-[#111111]';
    return <aside className={`relative overflow-hidden rounded-[20px] min-h-[200px] sm:min-h-[260px] md:min-h-[260px] lg:min-h-[400px] xl:min-h-[420px] border ${promoBg(promoSlide)}`} style={promoSlide.bgStyle === 'custom_color' ? { backgroundColor: promoSlide.customBgColor, color: promoSlide.customTextColor } : undefined} onTouchStart={(e) => { (e.currentTarget as any).__x = e.touches[0]?.clientX; }} onTouchEnd={(e) => { const start = (e.currentTarget as any).__x; const end = e.changedTouches[0]?.clientX; if (typeof start !== 'number' || typeof end !== 'number' || promoSlides.length < 2) return; const diff = start - end; if (Math.abs(diff) < 40) return; setPromoIndex(i => diff > 0 ? (i + 1) % promoSlides.length : (i - 1 + promoSlides.length) % promoSlides.length); }}>
      {isImageOnly ? <div className="absolute inset-0"><img src={promoSlide.imageUrl} alt={promoTitle || 'Promotional slide'} className={`w-full h-full ${fit}`}/>{promoTitle ? <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent p-4 flex flex-col justify-end"><div className="text-[9px] font-bold uppercase tracking-wider text-[#F3E5AB]">{promoBadge}</div><div className="text-sm font-bold text-slate-900 line-clamp-2">{promoTitle}</div></div> : null}</div> : <div className="relative z-10 h-full min-h-[inherit] p-4 sm:p-5 flex flex-col justify-between">
        {hasImage && !isTextOnly ? <div className="absolute inset-0"><img src={promoSlide.imageUrl} alt="" className={`w-full h-full ${fit} opacity-25`}/><div className="absolute inset-0 bg-gradient-to-t from-black/35 to-transparent"/></div> : null}
        <div className="relative z-10">{promoBadge ? <span className={`inline-flex text-[9px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${darkPromo ? 'bg-white/10 text-[#F3E5AB] border border-white/15' : 'bg-black/5 text-[#595959] border border-black/10'}`}>{promoBadge}</span> : null}</div>
        <div className="relative z-10 my-auto py-3">{promoTitle ? <h3 className={`text-lg sm:text-xl font-bold leading-snug line-clamp-3 ${textColor}`}>{promoTitle}</h3> : null}{promoDescription ? <p className={`text-xs mt-2 leading-relaxed line-clamp-4 ${darkPromo ? 'text-white/70' : 'text-[#666]'}`}>{promoDescription}</p> : null}
          {isProduct && selectedPromoProduct ? <div className="mt-3 rounded-xl bg-black/5 border border-black/10 p-2.5 flex gap-2 items-center"><div className="w-12 h-12 rounded-lg bg-white/70 overflow-hidden">{selectedPromoProduct.image ? <img src={selectedPromoProduct.image} alt="" className="w-full h-full object-contain"/> : null}</div><div className="min-w-0"><div className={`text-[10px] font-bold line-clamp-2 ${textColor}`}>{isAr ? (selectedPromoProduct.arabicName || selectedPromoProduct.name) : selectedPromoProduct.name}</div><div className={`text-[10px] font-black mt-1 ${textColor}`}>{Number.isFinite(Number(selectedPromoProduct.priceUSD)) ? formatPrice(Number(selectedPromoProduct.priceUSD)) : '—'}</div></div></div> : null}
          {isCategory && promoCategory ? <div className={`mt-3 text-xs font-bold ${textColor}`}>{isAr ? promoCategory.nameAr : promoCategory.nameEn}</div> : null}
        </div>
        <div className="relative z-10 flex items-center justify-between gap-2">{promoSlide.showCta !== false && (promoCta || promoSlide.ctaUrl || selectedPromoProduct || promoCategory) ? <span className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-bold ${darkPromo ? 'bg-white text-black' : 'bg-[#111] text-white'}`}>{promoCta || 'Explore'}<ChevronRight className="w-3 h-3"/></span> : <span/>}{promoSlides.length > 1 ? <div className="flex items-center gap-1.5">{promoSlides.map((_: any, i: number) => <span key={i} className={`h-1.5 rounded-full transition-all ${i === promoIndex ? 'w-5 bg-[#B89753]' : 'w-1.5 bg-current opacity-30'}`}/>)}</div> : null}</div>
      </div>}
      {promoSlides.length > 1 && promo.type !== 'image_only' && <><button type="button" aria-label="Previous promotion" onClick={() => setPromoIndex(i => (i - 1 + promoSlides.length) % promoSlides.length)} className="absolute left-2 top-1/2 -translate-y-1/2 z-20 w-7 h-7 rounded-full bg-black/35 text-slate-900 flex items-center justify-center"><ChevronLeft className="w-4 h-4"/></button><button type="button" aria-label="Next promotion" onClick={() => setPromoIndex(i => (i + 1) % promoSlides.length)} className="absolute right-2 top-1/2 -translate-y-1/2 z-20 w-7 h-7 rounded-full bg-black/35 text-slate-900 flex items-center justify-center"><ChevronRight className="w-4 h-4"/></button></>}
      <div className="absolute top-3 left-3 z-20 rounded-full bg-black/60 text-white px-2 py-1 text-[8px] font-bold flex items-center gap-1"><Eye className="w-3 h-3"/> PREVIEW</div>
    </aside>;
  };

  const sectionTitle = (title: string, subtitle?: string, onDark = false) => <div className="mb-4"><h3 className={`text-xl font-serif font-bold ${onDark ? 'text-white' : 'text-[#111]'}`}>{title}</h3>{subtitle ? <p className={`text-xs mt-1 ${onDark ? 'text-slate-300' : 'text-slate-600'}`}>{subtitle}</p> : null}</div>;

  const renderSection = (key: string) => {
    if (visibility && (visibility as any)[key] === false) return null;
    switch (key) {
      case 'homeHero': return <div key={key} className="mb-5">{promoSlides.length > 0 && device === 'desktop' ? <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 sm:gap-5">{renderHero()}{renderPromo()}</div> : <>{renderHero()}{promoSlides.length > 0 ? <div className="mt-3 lg:hidden">{renderPromo()}</div> : null}</>}</div>;
      case 'homeCategories': return <section key={key} className="mb-8">{sectionTitle(isAr ? (home.categoriesTitleArabic || home.categoriesTitle || 'التصنيفات') : (home.categoriesTitle || 'Categories'), isAr ? home.categoriesSubtitleArabic : home.categoriesSubtitle)}{publishedCategories.length ? <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">{publishedCategories.map((c: any) => <div key={c.id} className="rounded-xl border border-slate-200 bg-white p-4 text-center"><div className="w-12 h-12 mx-auto rounded-full bg-slate-100 flex items-center justify-center">{c.bannerUrl ? <img src={c.bannerUrl} alt="" className="w-full h-full rounded-full object-cover"/> : <ImageIcon className="w-5 h-5 text-slate-600"/>}</div><div className="mt-2 text-[11px] font-bold line-clamp-2">{isAr ? c.nameAr : c.nameEn}</div></div>)}</div> : empty('No published categories')}</section>;
      case 'homeFeatured': return <section key={key} className="mb-8">{sectionTitle(isAr ? (home.featuredTitleArabic || home.featuredTitle || 'منتجات مميزة') : (home.featuredTitle || 'Featured Products'), isAr ? home.featuredSubtitleArabic : home.featuredSubtitle)}{cards(featuredProducts)}</section>;
      case 'homeDeals': return <section key={key} className="mb-8">{sectionTitle(isAr ? (home.dealsTitleArabic || home.dealsTitle || 'العروض') : (home.dealsTitle || 'Deals'), isAr ? home.dealsSubtitleArabic : home.dealsSubtitle)}{cards(todaysDeals)}</section>;
      case 'homeNewArrivals': return <section key={key} className="mb-8">{sectionTitle(isAr ? (home.newArrivalsTitleArabic || home.newArrivalsTitle || 'وصل حديثاً') : (home.newArrivalsTitle || 'New Arrivals'), isAr ? home.newArrivalsSubtitleArabic : home.newArrivalsSubtitle)}{cards(newArrivals)}</section>;
      case 'homeBundles': return <section key={key} className="mb-8">{sectionTitle(isAr ? (home.bundlesTitleArabic || home.bundlesTitle || 'الباقات') : (home.bundlesTitle || 'Bundles'), isAr ? home.bundlesSubtitleArabic : home.bundlesSubtitle)}{liveBundles.length ? <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{liveBundles.map((b: any) => <article key={b.id} className="rounded-xl overflow-hidden border border-slate-200 bg-white"><div className="aspect-[16/9] bg-slate-100">{b.imageUrl ? <img src={b.imageUrl} alt="" className="w-full h-full object-cover"/> : null}</div><div className="p-3"><div className="text-sm font-bold line-clamp-2">{isAr ? (b.nameAr || b.name) : b.name}</div>{b.description || b.descriptionAr ? <p className="mt-1 text-xs text-slate-500 line-clamp-2">{isAr ? (b.descriptionAr || b.description) : b.description}</p> : null}</div></article>)}</div> : empty('No published bundles')}</section>;
      case 'homeNews': return <section key={key} className="mb-8">{sectionTitle(isAr ? (news.titleArabic || news.title || 'الأخبار') : (news.title || 'News'), isAr ? news.subtitleArabic : news.subtitle)}{publishedNews.length ? <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">{publishedNews.map((n: any) => <article key={n.id || n.title} className="rounded-xl border border-slate-200 bg-white overflow-hidden"><div className="aspect-[16/9] bg-slate-100">{n.imageUrl ? <img src={n.imageUrl} alt="" className="w-full h-full object-cover"/> : null}</div><div className="p-3"><h4 className="text-sm font-bold line-clamp-2">{isAr ? (n.titleArabic || n.title) : n.title}</h4>{n.excerpt || n.description ? <p className="mt-1 text-xs text-slate-500 line-clamp-3">{isAr ? (n.excerptArabic || n.excerpt || n.description) : (n.excerpt || n.description)}</p> : null}</div></article>)}</div> : empty('No published news articles')}</section>;
      case 'homeHeritage': return <section key={key} className="mb-8 rounded-2xl bg-slate-50 border border-slate-200 p-6">{sectionTitle(isAr ? (home.heritageTitleArabic || home.heritageTitle || 'قصتنا') : (home.heritageTitle || 'Our Story'), isAr ? home.heritageSubtitleArabic : home.heritageSubtitle)}<p className="text-sm text-slate-600 whitespace-pre-line">{isAr ? (home.heritageTextArabic || home.heritageText || '') : (home.heritageText || '') || 'No CMS heritage content configured.'}</p></section>;
      case 'homeReviews': return <section key={key} className="mb-8">{sectionTitle(isAr ? (home.reviewsTitleArabic || home.reviewsTitle || 'آراء العملاء') : (home.reviewsTitle || 'Customer Reviews'), isAr ? home.reviewsSubtitleArabic : home.reviewsSubtitle)}{empty('No published customer reviews')}</section>;
      case 'homeTrustBadges': return <section key={key} className="mb-8">{sectionTitle(isAr ? (home.trustBadgesTitleArabic || home.trustBadgesTitle || 'مزايا التسوق') : (home.trustBadgesTitle || 'Shopping Benefits'), isAr ? home.trustBadgesSubtitleArabic : home.trustBadgesSubtitle)}{home.trustBadge1Title || home.trustBadge2Title || home.trustBadge3Title || home.trustBadge4Title ? <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[1,2,3,4].map(i => { const title = isAr ? (home[`trustBadge${i}TitleArabic`] || home[`trustBadge${i}Title`]) : home[`trustBadge${i}Title`]; const text = isAr ? (home[`trustBadge${i}TextArabic`] || home[`trustBadge${i}Text`]) : home[`trustBadge${i}Text`]; return title ? <div key={i} className="rounded-xl border border-slate-200 bg-white p-4"><div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"><ShieldCheck className="w-4 h-4 text-slate-600"/></div><div className="mt-2 text-xs font-bold">{title}</div><div className="mt-1 text-[10px] text-slate-500">{text}</div></div> : null; })}</div> : empty('No CMS trust-benefit content configured')}</section>;
      case 'homeNewsletter': return <section key={key} className="mb-4 rounded-2xl bg-[#111] text-white p-6">{sectionTitle(isAr ? (home.newsletterTitleArabic || home.newsletterTitle || 'النشرة البريدية') : (home.newsletterTitle || 'Newsletter'), isAr ? home.newsletterSubtitleArabic : home.newsletterSubtitle, true)}<span className="inline-flex px-4 py-2 rounded-xl bg-[#B89753] text-slate-900 text-xs font-bold">{isAr ? (home.newsletterButtonTextArabic || home.newsletterButtonText || 'اشترك') : (home.newsletterButtonText || 'Subscribe')}</span></section>;
      default: return null;
    }
  };

  return <div className={`mx-auto w-full ${widthClass[device]} bg-white rounded-[20px] border border-slate-200 shadow-sm p-3 sm:p-4 ${isAr ? 'direction-rtl' : ''}`} dir={isAr ? 'rtl' : 'ltr'}>
    <div className="mb-3 flex items-center justify-between gap-2"><div className="flex items-center gap-2 text-xs font-bold text-slate-500"><Eye className="w-4 h-4"/> Read-only storefront preview</div><div className="text-[9px] text-slate-500">{device.toUpperCase()} • CMS + Supabase live data</div></div>
    {order.map(key => renderSection(key))}
  </div>;
};
