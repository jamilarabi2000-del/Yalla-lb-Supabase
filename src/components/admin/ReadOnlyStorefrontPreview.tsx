import React from 'react';
import { Eye, Image as ImageIcon, ShoppingBag, Star, Truck, ShieldCheck, RotateCcw, Clock } from 'lucide-react';
import { useShop } from '../../context/ShopContext';
import type { SectionVisibilityConfig } from '../../types';

type Device = 'desktop' | 'tablet' | 'mobile';

interface Props {
  order: string[];
  visibility: SectionVisibilityConfig;
  device: Device;
}

const labels: Record<string, string> = {
  homeHero: 'Hero / Main Banner', homeCategories: 'Categories', homeFeatured: 'Featured Products', homeDeals: 'Deals',
  homeBundles: 'Bundles', homeNews: 'News', homeNewArrivals: 'New Arrivals', homeTrustBadges: 'Trust & Benefits',
  homeHeritage: 'Heritage / Story', homeReviews: 'Customer Reviews', homeNewsletter: 'Newsletter',
};

const widthClass: Record<Device, string> = { desktop: 'max-w-[1180px]', tablet: 'max-w-[768px]', mobile: 'max-w-[390px]' };

export const ReadOnlyStorefrontPreview: React.FC<Props> = ({ order, visibility, device }) => {
  const { siteContent, categories = [], products = [], productBundles = [], language } = useShop();
  const content = siteContent as any;
  const home = content?.home || {};
  const hero = content?.hero || {};
  const news = content?.newsSection || {};
  const isAr = language === 'ar';
  const media = (hero.bgMediaItems || []).filter((item: any) => item?.isPublished !== false);
  const heroImage = media[0]?.url || media[0]?.desktopImageUrl || hero.bgImageUrl || hero.desktopImageUrl;
  const heroMobileImage = media[0]?.mobileUrl || media[0]?.mobileImageUrl || hero.mobileImageUrl || heroImage;
  const heroTitle = isAr ? (media[0]?.customTitleArabic || hero.titleArabic || media[0]?.customTitle || hero.title) : (media[0]?.customTitle || hero.title);
  const heroSubtitle = isAr ? (media[0]?.customSubtitleArabic || hero.subtitleArabic || media[0]?.customSubtitle || hero.subtitle) : (media[0]?.customSubtitle || hero.subtitle);
  const heroButton = isAr ? (media[0]?.buttonTextArabic || hero.primaryBtnTextArabic || media[0]?.buttonText || hero.primaryBtnText) : (media[0]?.buttonText || hero.primaryBtnText);
  const publishedCategories = categories.filter((category: any) => category?.isPublished !== false).sort((a: any, b: any) => (a?.displayOrder ?? 999) - (b?.displayOrder ?? 999)).slice(0, 6);
  const liveProducts = products.filter((product: any) => product?.isPublished !== false).sort((a: any, b: any) => (a?.displayOrder ?? 999) - (b?.displayOrder ?? 999));
  const liveBundles = productBundles.filter((bundle: any) => bundle?.isActive !== false && bundle?.showInSlider !== false).slice(0, 6);
  const publishedNews = (news.articles || []).filter((article: any) => article?.isPublished !== false).slice(0, 3);

  const renderEmptyData = (title: string) => (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center">
      <ShoppingBag className="w-7 h-7 mx-auto text-slate-300" /><p className="mt-2 text-sm font-bold text-slate-600">{title}</p>
      <p className="mt-1 text-xs text-slate-400">No live data is available, so this preview does not fabricate content.</p>
    </div>
  );

  const renderProductCards = (items: any[]) => {
    if (!items.length) return renderEmptyData('No matching published products');
    return <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">{items.slice(0, 8).map((product: any) => {
      const name = isAr ? (product.arabicName || product.name) : product.name;
      const image = product.image || product.additionalImages?.[0];
      const price = Number(product.priceUSD), original = Number(product.originalPriceUSD);
      const hasDiscount = Number.isFinite(original) && original > price;
      return <article key={product.id} className="rounded-xl overflow-hidden border border-slate-200 bg-white">
        <div className="aspect-square bg-slate-100 flex items-center justify-center">{image ? <img src={image} alt={name || 'Product'} loading="lazy" className="w-full h-full object-contain" /> : <ImageIcon className="w-8 h-8 text-slate-300" />}</div>
        <div className="p-3"><div className="text-[11px] font-bold line-clamp-2 min-h-[2rem]">{name || 'Unnamed product'}</div><div className="mt-2 flex items-center gap-2"><span className="text-sm font-black">{Number.isFinite(price) ? `$${price.toFixed(2)}` : '—'}</span>{hasDiscount ? <span className="text-[10px] text-slate-400 line-through">${original.toFixed(2)}</span> : null}</div>{product.stock <= 0 ? <div className="mt-1 text-[9px] font-bold text-rose-500">Out of stock</div> : null}</div>
      </article>;
    })}</div>;
  };

  const renderSection = (id: string) => {
    if (visibility[id as keyof SectionVisibilityConfig] === false) return null;
    if (id === 'homeHero') return <section key={id} className="relative overflow-hidden bg-slate-950 min-h-[300px] sm:min-h-[390px] flex items-center">
      {heroImage ? <><picture className="absolute inset-0"><source media="(max-width: 640px)" srcSet={heroMobileImage || heroImage} /><img src={heroImage} alt="CMS hero" className="w-full h-full object-cover opacity-75" /></picture><div className="absolute inset-0 bg-black/35" /></> : <div className="absolute inset-0 bg-gradient-to-br from-slate-900 to-slate-700" />}
      <div className="relative z-10 p-7 sm:p-12 max-w-2xl text-white">{hero.badgeText || hero.badgeTextArabic ? <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-amber-200 mb-3">{isAr ? (hero.badgeTextArabic || hero.badgeText) : (hero.badgeText || hero.badgeTextArabic)}</div> : null}<h2 className="text-3xl sm:text-5xl font-black tracking-tight">{heroTitle || (isAr ? 'واجهة المتجر الرئيسية' : 'Your Storefront Hero')}</h2>{heroSubtitle ? <p className="mt-3 text-sm sm:text-base text-white/80 max-w-xl">{heroSubtitle}</p> : null}{heroButton ? <span className="inline-flex mt-6 px-5 py-2.5 rounded-xl bg-white text-slate-950 text-xs font-black">{heroButton}</span> : null}</div>
      <div className="absolute top-3 right-3 rounded-full bg-black/50 text-white px-2.5 py-1 text-[9px] font-bold flex items-center gap-1"><Eye className="w-3 h-3" /> READ-ONLY PREVIEW</div>
    </section>;
    if (id === 'homeCategories') return <section key={id} className="px-4 sm:px-6 py-7"><div className="mb-5"><div className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#8F7137]">{isAr ? (home.categoriesSubtitleArabic || 'تصفح الأقسام') : (home.categoriesSubtitle || 'Browse Departments')}</div><h2 className="text-2xl font-serif font-bold mt-1">{isAr ? (home.categoriesTitleArabic || 'تسوق حسب الفئات') : (home.categoriesTitle || 'Explore by Category')}</h2><p className="text-xs text-slate-500 mt-1">{isAr ? (home.regionsSubtitleArabic || '') : (home.regionsSubtitle || '')}</p></div>{publishedCategories.length ? <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{publishedCategories.map((category: any) => <div key={category.id} className="rounded-xl overflow-hidden border border-slate-200 bg-white"><div className="aspect-square bg-slate-100 flex items-center justify-center">{category.bannerUrl ? <img src={category.bannerUrl} alt={isAr ? category.nameAr : category.nameEn} className="w-full h-full object-contain" /> : <ImageIcon className="w-8 h-8 text-slate-300" />}</div><div className="p-3 text-xs font-bold">{isAr ? (category.nameAr || category.nameEn) : (category.nameEn || category.nameAr)}</div></div>)}</div> : renderEmptyData(isAr ? 'لا توجد فئات منشورة' : 'No published categories')}</section>;
    if (id === 'homeFeatured') return <section key={id} className="px-4 sm:px-6 py-7"><h2 className="text-xl font-black mb-4">{labels[id]}</h2>{renderProductCards(liveProducts.filter((p: any) => p.isFeatured || p.isBestseller || (p.displayOrder !== undefined && p.displayOrder <= 50)))}</section>;
    if (id === 'homeDeals') return <section key={id} className="px-4 sm:px-6 py-7"><h2 className="text-xl font-black mb-4">{labels[id]}</h2>{renderProductCards(liveProducts.filter((p: any) => Number(p.discountPercentage) > 0 || Number(p.originalPriceUSD) > Number(p.priceUSD)))}</section>;
    if (id === 'homeNewArrivals') return <section key={id} className="px-4 sm:px-6 py-7"><h2 className="text-xl font-black mb-4">{labels[id]}</h2>{renderProductCards([...liveProducts].sort((a: any, b: any) => { if (a.isNewArrival && !b.isNewArrival) return -1; if (!a.isNewArrival && b.isNewArrival) return 1; return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(); }))}</section>;
    if (id === 'homeBundles') return <section key={id} className="px-4 sm:px-6 py-7"><div className="mb-4"><div className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#8F7137]">{isAr ? (home.bundlesBadgeArabic || home.bundlesBadge || 'Special offer') : (home.bundlesBadge || 'Special offer')}</div><h2 className="text-xl font-black">{isAr ? (home.bundlesTitleArabic || home.bundlesTitle || labels[id]) : (home.bundlesTitle || labels[id])}</h2><p className="text-xs text-slate-500 mt-1">{isAr ? (home.bundlesSubtitleArabic || home.bundlesSubtitle || '') : (home.bundlesSubtitle || '')}</p></div>{liveBundles.length ? <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{liveBundles.map((bundle: any) => <article key={bundle.id} className="rounded-xl overflow-hidden border border-slate-200 bg-white">{bundle.imageUrl ? <img src={bundle.imageUrl} alt={isAr ? (bundle.nameAr || bundle.name) : bundle.name} className="w-full aspect-[16/9] object-cover" /> : null}<div className="p-4"><h3 className="text-sm font-black">{isAr ? (bundle.nameAr || bundle.name) : bundle.name}</h3>{bundle.description || bundle.descriptionAr ? <p className="text-xs text-slate-500 mt-1 line-clamp-3">{isAr ? (bundle.descriptionAr || bundle.description) : bundle.description}</p> : null}<div className="mt-3 text-sm font-black">${Number(bundle.bundlePriceUSD).toFixed(2)}</div></div></article>)}</div> : renderEmptyData('No published bundles')}</section>;
    if (id === 'homeNews') return <section key={id} className="px-4 sm:px-6 py-7"><div className="mb-4"><h2 className="text-xl font-black">{isAr ? (news.titleArabic || news.title || labels[id]) : (news.title || labels[id])}</h2>{news.subtitle || news.subtitleArabic ? <p className="text-xs text-slate-500 mt-1">{isAr ? (news.subtitleArabic || news.subtitle) : (news.subtitle || news.subtitleArabic)}</p> : null}</div>{publishedNews.length ? <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">{publishedNews.map((article: any) => <article key={article.id} className="rounded-xl overflow-hidden border border-slate-200 bg-white">{article.imageUrl ? <img src={article.imageUrl} alt={isAr ? (article.titleArabic || article.title) : article.title} className="w-full aspect-[16/9] object-cover" /> : null}<div className="p-4"><div className="text-[9px] uppercase tracking-wider font-bold text-[#8F7137]">{isAr ? (article.tagArabic || article.tag) : article.tag}</div><h3 className="text-sm font-black mt-1 line-clamp-2">{isAr ? (article.titleArabic || article.title) : article.title}</h3><p className="text-xs text-slate-500 mt-2 line-clamp-3">{isAr ? (article.excerptArabic || article.excerpt) : article.excerpt}</p></div></article>)}</div> : renderEmptyData('No published news articles')}</section>;
    if (id === 'homeHeritage') return <section key={id} className="px-4 sm:px-6 py-8"><div className="rounded-2xl bg-white border border-slate-200 p-6 sm:p-8"><div className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#8F7137]">Yalla.lb</div><h2 className="text-2xl font-serif font-bold mt-1">{isAr ? (home.heritageTitleArabic || home.heritageTitle || labels[id]) : (home.heritageTitle || labels[id])}</h2><p className="text-sm text-slate-600 leading-7 mt-3 whitespace-pre-line">{isAr ? (home.heritageTextArabic || home.heritageText || '') : (home.heritageText || home.heritageTextArabic || '')}</p></div></section>;
    if (id === 'homeReviews') return <section key={id} className="px-4 sm:px-6 py-7"><h2 className="text-xl font-black mb-2 flex items-center gap-2"><Star className="w-5 h-5" /> {isAr ? (home.reviewsTitleArabic || home.reviewsTitle || labels[id]) : (home.reviewsTitle || labels[id])}</h2>{home.reviewsSubtitle || home.reviewsSubtitleArabic ? <p className="text-xs text-slate-500 mb-4">{isAr ? (home.reviewsSubtitleArabic || home.reviewsSubtitle) : (home.reviewsSubtitle || home.reviewsSubtitleArabic)}</p> : null}{renderEmptyData('No published customer reviews')}</section>;
    if (id === 'homeNewsletter') return <section key={id} className="px-4 sm:px-6 py-8"><div className="rounded-2xl bg-slate-100 p-7 text-center"><h2 className="text-xl font-black">{isAr ? (home.newsletterTitleArabic || home.newsletterTitle || 'Stay in the loop') : (home.newsletterTitle || 'Stay in the loop')}</h2><p className="text-xs text-slate-500 mt-2">{isAr ? (home.newsletterSubtitleArabic || home.newsletterSubtitle || '') : (home.newsletterSubtitle || home.newsletterSubtitleArabic || '')}</p><div className="mt-4 inline-flex h-10 px-5 items-center rounded-xl bg-white border border-slate-200 text-xs font-bold">{isAr ? (home.newsletterButtonTextArabic || home.newsletterButtonText || 'Subscribe') : (home.newsletterButtonText || 'Subscribe')}</div></div></section>;
    if (id === 'homeTrustBadges') {
      const badges = [
        { icon: ShieldCheck, title: home.trustBadge1Title, titleAr: home.trustBadge1TitleArabic, text: home.trustBadge1Text, textAr: home.trustBadge1TextArabic },
        { icon: Truck, title: home.trustBadge2Title, titleAr: home.trustBadge2TitleArabic, text: home.trustBadge2Text, textAr: home.trustBadge2TextArabic },
        { icon: Clock, title: home.trustBadge3Title, titleAr: home.trustBadge3TitleArabic, text: home.trustBadge3Text, textAr: home.trustBadge3TextArabic },
        { icon: RotateCcw, title: home.trustBadge4Title, titleAr: home.trustBadge4TitleArabic, text: home.trustBadge4Text, textAr: home.trustBadge4TextArabic },
      ];
      const hasCmsBadges = badges.some(b => b.title || b.titleAr || b.text || b.textAr);
      return <section key={id} className="px-4 sm:px-6 py-7"><div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8">{home.trustBadgesTitle || home.trustBadgesTitleArabic ? <div className="text-center mb-6"><h2 className="text-lg font-black">{isAr ? (home.trustBadgesTitleArabic || home.trustBadgesTitle) : home.trustBadgesTitle}</h2>{home.trustBadgesSubtitle || home.trustBadgesSubtitleArabic ? <p className="text-xs text-slate-500 mt-1">{isAr ? (home.trustBadgesSubtitleArabic || home.trustBadgesSubtitle) : home.trustBadgesSubtitle}</p> : null}</div> : null}{hasCmsBadges ? <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{badges.map(({ icon: Icon, title, titleAr, text, textAr }, index) => <div key={index} className="flex items-start gap-3 rounded-xl border border-slate-100 p-4"><Icon className="w-5 h-5 shrink-0 text-[#8F7137]" /><div><h3 className="text-xs font-bold">{isAr ? (titleAr || title) : title}</h3>{text || textAr ? <p className="text-[11px] text-slate-500 mt-1">{isAr ? (textAr || text) : text}</p> : null}</div></div>)}</div> : renderEmptyData('No CMS trust-benefit content configured')}</div></section>;
    }
    return <section key={id} className="px-4 sm:px-6 py-7"><div className="rounded-2xl border border-slate-200 bg-white p-6"><div className="flex items-center gap-2"><Eye className="w-4 h-4 text-emerald-600" /><h2 className="text-lg font-black">{labels[id] || id}</h2></div><p className="text-xs text-slate-500 mt-2">This registered storefront section is enabled and will use its live CMS/data-driven renderer.</p></div></section>;
  };

  return <div className="rounded-2xl bg-slate-800/70 p-2 overflow-auto"><div className={`${widthClass[device]} mx-auto bg-[#F7F7F8] text-[#171717] rounded-xl overflow-hidden shadow-2xl transition-all duration-200`}><div className="h-9 bg-white border-b border-slate-200 flex items-center justify-between px-3"><span className="text-[9px] font-bold text-slate-400">YALLA · {device.toUpperCase()} PREVIEW</span><span className="text-[9px] text-slate-400">Unsaved draft</span></div>{order.map(renderSection)}<div className="border-t border-slate-200 px-4 py-5 text-[10px] text-slate-400 text-center">Read-only admin preview · actions are intentionally disabled · live Supabase data only</div></div></div>;
};

export default ReadOnlyStorefrontPreview;
