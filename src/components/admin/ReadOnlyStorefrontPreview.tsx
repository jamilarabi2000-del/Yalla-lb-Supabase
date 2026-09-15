import React from 'react';
import { Eye, Image as ImageIcon, ShoppingBag } from 'lucide-react';
import { useShop } from '../../context/ShopContext';
import type { SectionVisibilityConfig } from '../../types';

type Device = 'desktop' | 'tablet' | 'mobile';

interface Props {
  order: string[];
  visibility: SectionVisibilityConfig;
  device: Device;
}

const labels: Record<string, string> = {
  homeHero: 'Hero / Main Banner',
  homeCategories: 'Categories',
  homeFeatured: 'Featured Products',
  homeDeals: 'Deals',
  homeBundles: 'Bundles',
  homeNews: 'News',
  homeNewArrivals: 'New Arrivals',
  homeTrustBadges: 'Trust & Benefits',
  homeHeritage: 'Heritage / Story',
  homeReviews: 'Customer Reviews',
  homeNewsletter: 'Newsletter',
};

const widthClass: Record<Device, string> = {
  desktop: 'max-w-[1180px]',
  tablet: 'max-w-[768px]',
  mobile: 'max-w-[390px]',
};

export const ReadOnlyStorefrontPreview: React.FC<Props> = ({ order, visibility, device }) => {
  const { siteContent, categories = [], products = [], language } = useShop();
  const content = siteContent as any;
  const home = content?.home || {};
  const hero = content?.hero || {};
  const isAr = language === 'ar';

  const media = (hero.bgMediaItems || []).filter((item: any) => item?.isPublished !== false);
  const heroImage = media[0]?.url || media[0]?.desktopImageUrl || hero.bgImageUrl || hero.desktopImageUrl;
  const heroMobileImage = media[0]?.mobileUrl || media[0]?.mobileImageUrl || hero.mobileImageUrl || heroImage;
  const heroTitle = isAr ? (media[0]?.customTitleArabic || hero.titleArabic || media[0]?.customTitle || hero.title) : (media[0]?.customTitle || hero.title);
  const heroSubtitle = isAr ? (media[0]?.customSubtitleArabic || hero.subtitleArabic || media[0]?.customSubtitle || hero.subtitle) : (media[0]?.customSubtitle || hero.subtitle);
  const heroButton = isAr ? (media[0]?.buttonTextArabic || hero.primaryBtnTextArabic || media[0]?.buttonText || hero.primaryBtnText) : (media[0]?.buttonText || hero.primaryBtnText);

  const publishedCategories = categories
    .filter((category: any) => category?.isPublished !== false)
    .sort((a: any, b: any) => (a?.displayOrder ?? 999) - (b?.displayOrder ?? 999))
    .slice(0, 6);

  const liveProducts = products
    .filter((product: any) => product?.isPublished !== false)
    .sort((a: any, b: any) => (a?.displayOrder ?? 999) - (b?.displayOrder ?? 999));

  const productCount = liveProducts.length;

  const renderEmptyData = (title: string) => (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center">
      <ShoppingBag className="w-7 h-7 mx-auto text-slate-300" />
      <p className="mt-2 text-sm font-bold text-slate-600">{title}</p>
      <p className="mt-1 text-xs text-slate-400">No live product data is available, so this preview does not fabricate products.</p>
    </div>
  );

  const renderProductCards = (items: any[]) => {
    if (!items.length) return renderEmptyData('No matching published products');
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {items.slice(0, 8).map((product: any) => {
          const name = isAr ? (product.arabicName || product.name) : product.name;
          const image = product.image || product.additionalImages?.[0];
          const price = Number(product.priceUSD);
          const original = Number(product.originalPriceUSD);
          const hasDiscount = Number.isFinite(original) && original > price;
          return (
            <article key={product.id} className="rounded-xl overflow-hidden border border-slate-200 bg-white">
              <div className="aspect-square bg-slate-100 flex items-center justify-center">
                {image ? <img src={image} alt={name || 'Product'} loading="lazy" className="w-full h-full object-contain" /> : <ImageIcon className="w-8 h-8 text-slate-300" />}
              </div>
              <div className="p-3">
                <div className="text-[11px] font-bold line-clamp-2 min-h-[2rem]">{name || 'Unnamed product'}</div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-sm font-black">{Number.isFinite(price) ? `$${price.toFixed(2)}` : '—'}</span>
                  {hasDiscount ? <span className="text-[10px] text-slate-400 line-through">${original.toFixed(2)}</span> : null}
                </div>
                {product.stock <= 0 ? <div className="mt-1 text-[9px] font-bold text-rose-500">Out of stock</div> : null}
              </div>
            </article>
          );
        })}
      </div>
    );
  };

  const renderSection = (id: string) => {
    if (visibility[id as keyof SectionVisibilityConfig] === false) return null;

    if (id === 'homeHero') {
      return (
        <section key={id} className="relative overflow-hidden bg-slate-950 min-h-[300px] sm:min-h-[390px] flex items-center">
          {heroImage ? (
            <>
              <picture className="absolute inset-0">
                <source media="(max-width: 640px)" srcSet={heroMobileImage || heroImage} />
                <img src={heroImage} alt="CMS hero" className="w-full h-full object-cover opacity-75" />
              </picture>
              <div className="absolute inset-0 bg-black/35" />
            </>
          ) : <div className="absolute inset-0 bg-gradient-to-br from-slate-900 to-slate-700" />}
          <div className="relative z-10 p-7 sm:p-12 max-w-2xl text-white">
            {hero.badgeText || hero.badgeTextArabic ? <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-amber-200 mb-3">{isAr ? (hero.badgeTextArabic || hero.badgeText) : (hero.badgeText || hero.badgeTextArabic)}</div> : null}
            <h2 className="text-3xl sm:text-5xl font-black tracking-tight">{heroTitle || (isAr ? 'واجهة المتجر الرئيسية' : 'Your Storefront Hero')}</h2>
            {heroSubtitle ? <p className="mt-3 text-sm sm:text-base text-white/80 max-w-xl">{heroSubtitle}</p> : null}
            {heroButton ? <span className="inline-flex mt-6 px-5 py-2.5 rounded-xl bg-white text-slate-950 text-xs font-black">{heroButton}</span> : null}
          </div>
          <div className="absolute top-3 right-3 rounded-full bg-black/50 text-white px-2.5 py-1 text-[9px] font-bold flex items-center gap-1"><Eye className="w-3 h-3" /> READ-ONLY PREVIEW</div>
        </section>
      );
    }

    if (id === 'homeCategories') {
      return (
        <section key={id} className="px-4 sm:px-6 py-7">
          <div className="mb-5">
            <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#8F7137]">{isAr ? (home.categoriesSubtitleArabic || home.categoriesSubtitle || 'تصفح الأقسام') : (home.categoriesSubtitle || 'Browse Departments')}</div>
            <h2 className="text-2xl font-serif font-bold mt-1">{isAr ? (home.categoriesTitleArabic || 'تسوق حسب الفئات') : (home.categoriesTitle || 'Explore by Category')}</h2>
          </div>
          {publishedCategories.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {publishedCategories.map((category: any) => (
                <div key={category.id} className="rounded-xl overflow-hidden border border-slate-200 bg-white">
                  <div className="aspect-square bg-slate-100 flex items-center justify-center">
                    {category.bannerUrl ? <img src={category.bannerUrl} alt={isAr ? category.nameAr : category.nameEn} className="w-full h-full object-contain" /> : <ImageIcon className="w-8 h-8 text-slate-300" />}
                  </div>
                  <div className="p-3 text-xs font-bold">{isAr ? (category.nameAr || category.nameEn) : (category.nameEn || category.nameAr)}</div>
                </div>
              ))}
            </div>
          ) : renderEmptyData(isAr ? 'لا توجد فئات منشورة' : 'No published categories')}
        </section>
      );
    }

    if (id === 'homeFeatured') {
      return <section key={id} className="px-4 sm:px-6 py-7"><div className="mb-4"><h2 className="text-xl font-black">{labels[id]}</h2></div>{renderProductCards(liveProducts.filter((product: any) => product.isFeatured))}</section>;
    }

    if (id === 'homeDeals') {
      return <section key={id} className="px-4 sm:px-6 py-7"><div className="mb-4"><h2 className="text-xl font-black">{labels[id]}</h2></div>{renderProductCards(liveProducts.filter((product: any) => Number(product.discountPercentage) > 0 || Number(product.originalPriceUSD) > Number(product.priceUSD)))}</section>;
    }

    if (id === 'homeNewArrivals') {
      return <section key={id} className="px-4 sm:px-6 py-7"><div className="mb-4"><h2 className="text-xl font-black">{labels[id]}</h2></div>{renderProductCards(liveProducts.filter((product: any) => product.isNewArrival))}</section>;
    }

    if (id === 'homeBundles') {
      return <section key={id} className="px-4 sm:px-6 py-7"><div className="mb-4"><h2 className="text-xl font-black">{labels[id]}</h2></div>{renderEmptyData(`Bundles use live bundle data · ${productCount} live products available`)}</section>;
    }

    if (id === 'homeNewsletter') {
      return <section key={id} className="px-4 sm:px-6 py-8"><div className="rounded-2xl bg-slate-100 p-7 text-center"><h2 className="text-xl font-black">{home.newsletterTitle || 'Stay in the loop'}</h2><p className="text-xs text-slate-500 mt-2">{home.newsletterSubtitle || 'Newsletter content is controlled by the CMS.'}</p><div className="mt-4 h-10 rounded-xl bg-white border border-slate-200" /></div></section>;
    }

    if (id === 'homeTrustBadges') {
      return <section key={id} className="px-4 sm:px-6 py-7"><div className="grid grid-cols-2 gap-3">{['Verified', 'Delivery', 'Quality', 'Support'].map(item => <div key={item} className="rounded-xl border border-slate-200 bg-white p-4 text-center text-xs font-bold">{item}</div>)}</div></section>;
    }

    return <section key={id} className="px-4 sm:px-6 py-7"><div className="rounded-2xl border border-slate-200 bg-white p-6"><div className="flex items-center gap-2"><Eye className="w-4 h-4 text-emerald-600" /><h2 className="text-lg font-black">{labels[id] || id}</h2></div><p className="text-xs text-slate-500 mt-2">This registered storefront section is enabled and will use its live CMS/data-driven renderer.</p></div></section>;
  };

  return (
    <div className="rounded-2xl bg-slate-800/70 p-2 overflow-auto">
      <div className={`${widthClass[device]} mx-auto bg-[#F7F7F8] text-[#171717] rounded-xl overflow-hidden shadow-2xl transition-all duration-200`}>
        <div className="h-9 bg-white border-b border-slate-200 flex items-center justify-between px-3"><span className="text-[9px] font-bold text-slate-400">YALLA · {device.toUpperCase()} PREVIEW</span><span className="text-[9px] text-slate-400">Unsaved draft</span></div>
        {order.map(renderSection)}
        <div className="border-t border-slate-200 px-4 py-5 text-[10px] text-slate-400 text-center">Read-only admin preview · actions are intentionally disabled · live Supabase data only</div>
      </div>
    </div>
  );
};

export default ReadOnlyStorefrontPreview;
