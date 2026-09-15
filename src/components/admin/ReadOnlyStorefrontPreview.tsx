import React, { useEffect, useMemo, useState } from 'react';
import { Eye, Image as ImageIcon, ShoppingBag, Star, Truck, ShieldCheck, ChevronLeft, ChevronRight, Sparkles, Tag } from 'lucide-react';
import { useShop } from '../../context/ShopContext';
import type { SectionVisibilityConfig } from '../../types';

type Device = 'desktop' | 'tablet' | 'mobile';
interface Props { order: string[]; visibility: SectionVisibilityConfig; device: Device; }

const labels: Record<string, string> = {
  homeHero: 'Hero / Main Banner', homeCategories: 'Categories', homeFeatured: 'Featured Products', homeDeals: 'Deals', homeBundles: 'Bundles',
  homeNews: 'News', homeNewArrivals: 'New Arrivals', homeTrustBadges: 'Trust & Benefits', homeHeritage: 'Heritage / Story', homeReviews: 'Customer Reviews', homeNewsletter: 'Newsletter'
};
const widthClass: Record<Device, string> = { desktop: 'max-w-[1180px]', tablet: 'max-w-[768px]', mobile: 'max-w-[390px]' };

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
  const { siteContent, categories = [], products = [], productBundles = [], language } = useShop();
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
    const slides = media.length ? media.map((item: any, idx: number) => ({
      id: item.id || `hero-${idx}`,
      type: item.type || 'image',
      desktopUrl: item.url || item.desktopImageUrl || hero.bgImageUrl || hero.desktopImageUrl,
      mobileUrl: item.mobileUrl || item.mobileImageUrl || item.url || item.desktopImageUrl || hero.mobileImageUrl || hero.bgImageUrl,
      badge: isAr ? (item.badgeTextArabic || item.badgeText || hero.badgeTextArabic || hero.badgeText) : (item.badgeText || hero.badgeTextArabic || hero.badgeText),
      title: isAr ? (item.customTitleArabic || item.customTitle || hero.titleArabic || hero.title) : (item.customTitle || item.title || hero.title),
      subtitle: isAr ? (item.customSubtitleArabic || item.customSubtitle || hero.subtitleArabic || hero.subtitle) : (item.customSubtitle || hero.subtitle),
      button: isAr ? (item.buttonTextArabic || item.buttonText || hero.primaryBtnTextArabic || hero.primaryBtnText) : (item.buttonText || hero.primaryBtnText),
      secondary: isAr ? (item.secondaryBtnTextArabic || item.secondaryBtnText || hero.secondaryBtnTextArabic || hero.secondaryBtnText) : (item.secondaryBtnText || hero.secondaryBtnText),
      promoCode: item.promoCode,
      desktopFit: item.desktopImageFit || item.imageFit || hero.defaultImageFit || 'contain',
      mobileFit: item.mobileImageFit || item.imageFit || 'cover',
      desktopZoom: item.desktopImageZoom || item.imageZoom || 100,
      mobileZoom: item.mobileImageZoom || item.imageZoom || 100,
      desktopPosition: item.desktopObjectPosition || item.objectPosition || 'center',
      mobilePosition: item.mobileObjectPosition || item.objectPosition || 'center'
    })) : [{
      id: 'hero-primary', type: 'image', desktopUrl: hero.bgImageUrl || hero.desktopImageUrl, mobileUrl: hero.mobileImageUrl || hero.bgImageUrl || hero.desktopImageUrl,
      badge: isAr ? (hero.badgeTextArabic || hero.badgeText) : hero.badgeText,
      title: isAr ? (hero.titleArabic || hero.title) : hero.title,
      subtitle: isAr ? (hero.subtitleArabic || hero.subtitle) : hero.subtitle,
      button: isAr ? (hero.primaryBtnTextArabic || hero.primaryBtnText) : hero.primaryBtnText,
      secondary: isAr ? (hero.secondaryBtnTextArabic || hero.secondaryBtnText) : hero.secondaryBtnText,
      promoCode: undefined, desktopFit: hero.defaultImageFit || 'contain', mobileFit: 'cover', desktopZoom: 100, mobileZoom: 100, desktopPosition: 'center', mobilePosition: 'center'
    }];
    const bundles = productBundles.filter((b: any) => b.isActive !== false && b.showInSlider === true).map((b: any) => ({
      id: `bundle-${b.id}`, type: 'image', desktopUrl: b.imageUrl?.trim() || undefined, mobileUrl: b.imageUrl?.trim() || undefined,
      badge: isAr ? (b.badgeTextAr || b.badgeText) : b.badgeText, title: isAr ? (b.nameAr || b.name) : b.name,
      subtitle: isAr ? (b.descriptionAr || b.description) : b.description, button: isAr ? (b.sliderButtonTextAr || b.sliderButtonText) : b.sliderButtonText,
      secondary: undefined, promoCode: undefined, desktopFit: 'cover', mobileFit: 'cover', desktopZoom: 100, mobileZoom: 100, desktopPosition: 'center', mobilePosition: 'center', bundle: true
    }));
    return [...slides, ...bundles];
  }, [hero, productBundles, isAr]);

  useEffect(() => { if (heroIndex >= heroSlides.length) setHeroIndex(0); }, [heroSlides.length, heroIndex]);
  useEffect(() => {
    if (heroSlides.length <= 1 || hero.slideInterval === 0) return;
    const timer = window.setInterval(() => setHeroIndex(i => (i + 1) % heroSlides.length), Number(hero.slideInterval || 6) * 1000);
    return () => window.clearInterval(timer);
  }, [heroSlides.length, hero.slideInterval]);

  const promoSlides = useMemo(() => {
    if (promo.enabled === false) return [];
    const raw = Array.isArray(promo.slides) && promo.slides.length ? [...promo.slides].sort((a: any, b: any) => (a.order || 0) - (b.order || 0)) : [promo];
    return raw.filter((s: any) => isActive(s) && (s.title || s.titleArabic || s.imageUrl || s.description || s.descriptionArabic || s.badge || s.badgeArabic || s.selectedProductId || s.targetCategory || s.ctaUrl));
  }, [promo]);
  useEffect(() => { if (promoIndex >= promoSlides.length) setPromoIndex(0); }, [promoSlides.length, promoIndex]);
  useEffect(() => {
    if (promoSlides.length <= 1 || promo.autoplay === false) return;
    const timer = window.setInterval(() => setPromoIndex(i => (i + 1) % promoSlides.length), Math.max(1500, Number(promo.autoplayInterval || 5000)));
    return () => window.clearInterval(timer);
  }, [promoSlides.length, promo.autoplay, promo.autoplayInterval]);

  const publishedCategories = categories.filter((x: any) => x?.isPublished !== false).sort((a: any, b: any) => (a?.displayOrder ?? 999) - (b?.displayOrder ?? 999)).slice(0, 6);
  const liveProducts = products.filter((x: any) => x?.isPublished !== false).sort((a: any, b: any) => (a?.displayOrder ?? 999) - (b?.displayOrder ?? 999));
  const liveBundles = productBundles.filter((x: any) => x?.isActive !== false && x?.showInSlider !== false).slice(0, 6);
  const publishedNews = (news.articles || []).filter((x: any) => x?.isPublished !== false).slice(0, 3);

  const empty = (title: string) => <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center"><ShoppingBag className="w-7 h-7 mx-auto text-slate-300"/><p className="mt-2 text-sm font-bold text-slate-600">{title}</p><p className="mt-1 text-xs text-slate-400">No live data is available, so this preview does not fabricate content.</p></div>;
  const cards = (items: any[]) => !items.length ? empty('No matching published products') : <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">{items.slice(0, 8).map((p: any) => { const name = isAr ? (p.arabicName || p.name) : p.name; const image = p.image || p.additionalImages?.[0]; const price = Number(p.priceUSD); const original = Number(p.originalPriceUSD); const discount = Number(p.discountPercentage) > 0 || original > price; return <article key={p.id} className="rounded-xl overflow-hidden border border-slate-200 bg-white"><div className="aspect-square bg-slate-100 flex items-center justify-center">{image ? <img src={image} alt={name || 'Product'} loading="lazy" className="w-full h-full object-contain"/> : <ImageIcon className="w-8 h-8 text-slate-300"/>}</div><div className="p-3"><div className="text-[11px] font-bold line-clamp-2 min-h-[2rem]">{name || 'Unnamed product'}</div><div className="mt-2 flex items-center gap-2"><span className="text-sm font-black">{Number.isFinite(price) ? `$${price.toFixed(2)}` : '—'}</span>{discount && Number.isFinite(original) ? <span className="text-[10px] text-slate-400 line-through">${original.toFixed(2)}</span> : null}</div>{p.stock <= 0 ? <div className="mt-1 text-[9px] font-bold text-rose-500">Out of stock</div> : null}</div></article>; })}</div>;

  const hero = heroSlides[heroIndex] || heroSlides[0];
  const heroFit = device === 'mobile' ? hero?.mobileFit : hero?.desktopFit;
  const heroPosition = device === 'mobile' ? hero?.mobilePosition : hero?.desktopPosition;
  const heroZoom = device === 'mobile' ? hero?.mobileZoom : hero?.desktopZoom;
  const promoSlide = promoSlides[promoIndex] || promoSlides[0];
  const promoTitle = promoSlide ? (isAr ? (promoSlide.titleArabic || promoSlide.title) : (promoSlide.title || promoSlide.titleArabic)) : '';
  const promoDescription = promoSlide ? (isAr ? (promoSlide.descriptionArabic || promoSlide.description) : (promoSlide.description || promoSlide.descriptionArabic)) : '';
  const promoBadge = promoSlide ? (isAr ? (promoSlide.badgeArabic || promoSlide.badge) : (promoSlide.badge || promoSlide.badgeArabic)) : '';
  const promoCta = promoSlide ? (isAr ? (promoSlide.ctaTextArabic || promoSlide.ctaText) : (promoSlide.ctaText || promoSlide.ctaTextArabic)) : '';

  const renderHero = () => {
    if (!hero) return empty('No active CMS hero configured');
    const fitClass = heroFit === 'fill' ? 'object-fill' : heroFit === 'cover' ? 'object-cover' : 'object-contain';
    return <section className="relative overflow-hidden bg-[#111] text-white rounded-[20px] h-[220px] sm:h-[300px] md:h-[360px] lg:h-[420px]">
      {hero.desktopUrl ? <><img src={hero.desktopUrl} alt="" className="absolute inset-0 w-full h-full object-cover blur-2xl opacity-40 scale-110"/><img src={hero.mobileUrl || hero.desktopUrl} alt={hero.title || ''} className={`absolute inset-0 w-full h-full ${fitClass}`} style={{ objectPosition: heroPosition || 'center', transform: heroZoom !== 100 ? `scale(${heroZoom / 100})` : undefined }} /></> : <div className="absolute inset-0 bg-slate-800"/>}
      <div className="absolute inset-0 bg-black/25"/><div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent"/>
      <div className="relative z-10 h-full p-5 sm:p-8 flex flex-col justify-between"><div className="flex justify-between gap-3">{hero.badge ? <div className="flex items-center gap-2 text-xs font-bold"><Sparkles className="w-4 h-4 text-amber-200"/>{hero.badge}</div> : <span/>}{hero.promoCode ? <div className="text-[10px] font-mono px-2 py-1 rounded-full bg-black/50 border border-white/20 flex items-center gap-1"><Tag className="w-3 h-3"/>{hero.promoCode}</div> : null}</div><div><h2 className="text-2xl sm:text-4xl font-serif font-bold line-clamp-2">{hero.title || 'CMS Hero'}</h2>{hero.subtitle ? <p className="mt-2 text-xs sm:text-sm text-white/80 max-w-xl line-clamp-2">{hero.subtitle}</p> : null}</div><div className="flex items-center justify-between gap-3"><div>{hero.button ? <span className="inline-flex px-4 py-2 rounded-xl bg-[#B89753] text-white text-xs font-bold">{hero.button}</span> : null}{hero.secondary ? <span className="ml-2 inline-flex px-4 py-2 rounded-xl bg-white/20 border border-white/30 text-white text-xs font-bold">{hero.secondary}</span> : null}</div>{heroSlides.length > 1 ? <div className="flex items-center gap-2"><button type="button" onClick={() => setHeroIndex(i => (i - 1 + heroSlides.length) % heroSlides.length)} className="w-7 h-7 rounded-full bg-black/40 border border-white/20 flex items-center justify-center"><ChevronLeft className="w-4 h-4"/></button><span className="text-[10px]">{heroIndex + 1}/{heroSlides.length}</span><button type="button" onClick={() => setHeroIndex(i => (i + 1) % heroSlides.length)} className="w-7 h-7 rounded-full bg-black/40 border border-white/20 flex items-center justify-center"><ChevronRight className="w-4 h-4"/></button></div> : null}</div></div>
      <div className="absolute top-3 right-3 z-20 rounded-full bg-black/50 text-white px-2.5 py-1 text-[9px] font-bold flex items-center gap-1"><Eye className="w-3 h-3"/> READ-ONLY PREVIEW</div>
    </section>;
  };

  const renderPromo = () => {
    if (!promoSlides.length) return null;
    const bg = promoSlide.bgStyle === 'dark' ? 'bg-[#111] text-white' : promoSlide.bgStyle === 'light' ? 'bg-[#fafafa] text-[#111]' : promoSlide.bgStyle === 'gold_gradient' ? 'bg-gradient-to-br from-[#2a1c06] via-[#1a1204] to-[#0d0902] text-white' : promoSlide.bgStyle === 'emerald_gradient' ? 'bg-gradient-to-br from-[#06241a] via-[#041610] to-[#020b08] text-white' : 'bg-[#ededed] text-[#111]';
    const hasImage = !!promoSlide.imageUrl;
    return <aside className={`relative overflow-hidden rounded-[20px] min-h-[220px] sm:min-h-[300px] md:min-h-[360px] lg:min-h-[420px] border border-black/10 ${bg}`} style={promoSlide.bgStyle === 'custom_color' ? { backgroundColor: promoSlide.customBgColor, color: promoSlide.customTextColor } : undefined}>
      {hasImage ? <img src={promoSlide.imageUrl} alt={promoTitle || 'Promotion'} className={`absolute inset-0 w-full h-full object-${promoSlide.imageFit || 'cover'} opacity-80`} /> : null}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent"/>
      <div className={`relative z-10 h-full min-h-[220px] sm:min-h-[300px] md:min-h-[360px] lg:min-h-[420px] p-5 sm:p-6 flex flex-col justify-between ${hasImage ? 'text-white' : ''}`}>
        <div>{promoBadge ? <div className="text-[10px] uppercase tracking-wider font-bold">{promoBadge}</div> : null}</div>
        <div>{promoTitle ? <h3 className="text-lg sm:text-xl font-bold line-clamp-3">{promoTitle}</h3> : null}{promoDescription ? <p className="mt-2 text-xs opacity-80 line-clamp-4">{promoDescription}</p> : null}{promoCta ? <span className="mt-4 inline-flex px-4 py-2 rounded-xl bg-white/90 text-slate-900 text-xs font-bold">{promoCta}</span> : null}</div>
        {promoSlides.length > 1 ? <div className="flex items-center justify-between"><span className="text-[10px]">{promoIndex + 1}/{promoSlides.length}</span><div className="flex gap-1">{promoSlides.map((_: any, i: number) => <span key={i} className={`w-1.5 h-1.5 rounded-full ${i === promoIndex ? 'bg-current' : 'bg-current/30'}`}/>)}</div></div> : null}
      </div>
    </aside>;
  };

  const section = (id: string) => {
    if (visibility[id as keyof SectionVisibilityConfig] === false) return null;
    if (id === 'homeHero') return <React.Fragment key={id}><section className="px-0 py-0">{renderHero()}</section>{promoSlides.length ? <div className="mt-3">{renderPromo()}</div> : null}</React.Fragment>;
    if (id === 'homeCategories') return <section key={id} className="px-4 sm:px-6 py-7"><div className="mb-5"><div className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#8F7137]">{isAr ? (home.categoriesSubtitleArabic || 'تصفح الأقسام') : (home.categoriesSubtitle || 'Browse Departments')}</div><h2 className="text-2xl font-serif font-bold mt-1">{isAr ? (home.categoriesTitleArabic || 'تسوق حسب الفئات') : (home.categoriesTitle || 'Explore by Category')}</h2></div>{publishedCategories.length ? <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{publishedCategories.map((c: any) => <div key={c.id} className="rounded-xl overflow-hidden border border-slate-200 bg-white"><div className="aspect-square bg-slate-100 flex items-center justify-center">{c.bannerUrl ? <img src={c.bannerUrl} alt={isAr ? c.nameAr : c.nameEn} className="w-full h-full object-contain"/> : <ImageIcon className="w-8 h-8 text-slate-300"/>}</div><div className="p-3 text-xs font-bold">{isAr ? (c.nameAr || c.nameEn) : (c.nameEn || c.nameAr)}</div></div>)}</div> : empty(isAr ? 'لا توجد فئات منشورة' : 'No published categories')}</section>;
    if (id === 'homeFeatured') return <section key={id} className="px-4 sm:px-6 py-7"><h2 className="text-xl font-black mb-4">{labels[id]}</h2>{cards(liveProducts.filter((p: any) => p.isFeatured || p.isBestseller || (p.displayOrder !== undefined && p.displayOrder <= 50)))}</section>;
    if (id === 'homeDeals') return <section key={id} className="px-4 sm:px-6 py-7"><h2 className="text-xl font-black mb-4">{labels[id]}</h2>{cards(liveProducts.filter((p: any) => Number(p.discountPercentage) > 0 || Number(p.originalPriceUSD) > Number(p.priceUSD)))}</section>;
    if (id === 'homeNewArrivals') return <section key={id} className="px-4 sm:px-6 py-7"><h2 className="text-xl font-black mb-4">{labels[id]}</h2>{cards(liveProducts.filter((p: any) => p.isNewArrival === true).sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()))}</section>;
    if (id === 'homeBundles') return <section key={id} className="px-4 sm:px-6 py-7"><h2 className="text-xl font-black mb-4">{isAr ? (home.bundlesTitleArabic || home.bundlesTitle || labels[id]) : (home.bundlesTitle || labels[id])}</h2>{liveBundles.length ? <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{liveBundles.map((b: any) => <article key={b.id} className="rounded-xl overflow-hidden border border-slate-200 bg-white">{b.imageUrl ? <img src={b.imageUrl} alt={isAr ? (b.nameAr || b.name) : b.name} className="w-full aspect-[16/9] object-cover"/> : null}<div className="p-4"><h3 className="text-sm font-black">{isAr ? (b.nameAr || b.name) : b.name}</h3>{b.description || b.descriptionAr ? <p className="text-xs text-slate-500 mt-1 line-clamp-3">{isAr ? (b.descriptionAr || b.description) : b.description}</p> : null}<div className="mt-3 text-sm font-black">${Number(b.bundlePriceUSD).toFixed(2)}</div></div></article>)}</div> : empty('No published bundles')}</section>;
    if (id === 'homeNews') return <section key={id} className="px-4 sm:px-6 py-7"><h2 className="text-xl font-black">{isAr ? (news.titleArabic || news.title || labels[id]) : (news.title || labels[id])}</h2>{publishedNews.length ? <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">{publishedNews.map((a: any) => <article key={a.id} className="rounded-xl overflow-hidden border border-slate-200 bg-white">{a.imageUrl ? <img src={a.imageUrl} alt={isAr ? (a.titleArabic || a.title) : a.title} className="w-full aspect-[16/9] object-cover"/> : null}<div className="p-4"><div className="text-[9px] uppercase tracking-wider font-bold text-[#8F7137]">{isAr ? (a.tagArabic || a.tag) : a.tag}</div><h3 className="text-sm font-black mt-1 line-clamp-2">{isAr ? (a.titleArabic || a.title) : a.title}</h3><p className="text-xs text-slate-500 mt-2 line-clamp-3">{isAr ? (a.excerptArabic || a.excerpt) : a.excerpt}</p></div></article>)}</div> : empty('No published news articles')}</section>;
    if (id === 'homeHeritage') return <section key={id} className="px-4 sm:px-6 py-8"><div className="rounded-2xl bg-white border border-slate-200 p-6 sm:p-8"><h2 className="text-2xl font-serif font-bold">{isAr ? (home.heritageTitleArabic || home.heritageTitle || labels[id]) : (home.heritageTitle || labels[id])}</h2><p className="text-sm text-slate-600 leading-7 mt-3 whitespace-pre-line">{isAr ? (home.heritageTextArabic || home.heritageText || '') : (home.heritageText || home.heritageTextArabic || '')}</p></div></section>;
    if (id === 'homeReviews') return <section key={id} className="px-4 sm:px-6 py-7"><h2 className="text-xl font-black mb-2 flex items-center gap-2"><Star className="w-5 h-5"/>{isAr ? (home.reviewsTitleArabic || home.reviewsTitle || labels[id]) : (home.reviewsTitle || labels[id])}</h2>{empty('No published customer reviews')}</section>;
    if (id === 'homeNewsletter') return <section key={id} className="px-4 sm:px-6 py-8"><div className="rounded-2xl bg-slate-100 p-7 text-center"><h2 className="text-xl font-black">{isAr ? (home.newsletterTitleArabic || home.newsletterTitle || 'Stay in the loop') : (home.newsletterTitle || 'Stay in the loop')}</h2><p className="text-xs text-slate-500 mt-2">{isAr ? (home.newsletterSubtitleArabic || home.newsletterSubtitle || '') : (home.newsletterSubtitle || home.newsletterSubtitleArabic || '')}</p><span className="mt-4 inline-flex h-10 px-5 items-center rounded-xl bg-white border border-slate-200 text-xs font-bold">{isAr ? (home.newsletterButtonTextArabic || home.newsletterButtonText || 'Subscribe') : (home.newsletterButtonText || 'Subscribe')}</span></div></section>;
    if (id === 'homeTrustBadges') { const badges = [{ icon: ShieldCheck, title: home.trustBadge1Title, titleAr: home.trustBadge1TitleArabic, text: home.trustBadge1Text, textAr: home.trustBadge1TextArabic }, { icon: Truck, title: home.trustBadge2Title, titleAr: home.trustBadge2TitleArabic, text: home.trustBadge2Text, textAr: home.trustBadge2TextArabic }, { icon: ShieldCheck, title: home.trustBadge3Title, titleAr: home.trustBadge3TitleArabic, text: home.trustBadge3Text, textAr: home.trustBadge3TextArabic }, { icon: Truck, title: home.trustBadge4Title, titleAr: home.trustBadge4TitleArabic, text: home.trustBadge4Text, textAr: home.trustBadge4TextArabic }].filter((b: any) => b.title || b.titleAr || b.text || b.textAr); return <section key={id} className="px-4 sm:px-6 py-7"><h2 className="text-xl font-black mb-4">{labels[id]}</h2>{badges.length ? <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{badges.map((b: any, i: number) => { const Icon = b.icon; return <div key={i} className="rounded-xl border border-slate-200 bg-white p-4 flex gap-3"><Icon className="w-5 h-5 shrink-0"/><div><h3 className="text-sm font-bold">{isAr ? (b.titleAr || b.title) : (b.title || b.titleAr)}</h3><p className="text-xs text-slate-500 mt-1">{isAr ? (b.textAr || b.text) : (b.text || b.textAr)}</p></div></div>; })}</div> : empty('No CMS trust-benefit content configured')}</section>; }
    return <section key={id} className="px-4 sm:px-6 py-7">{empty(labels[id] || id)}</section>;
  };

  return <div className="mx-auto w-full bg-white text-slate-900 overflow-hidden rounded-2xl shadow-sm border border-slate-200"><div className={`mx-auto w-full ${widthClass[device]}`}>{order.map(section)}</div></div>;
};
