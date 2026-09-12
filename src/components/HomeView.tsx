import React from 'react';
import { isProductVisibleOnStorefront } from '../lib/storefrontVisibility';
import { HomeTopContainer } from './HomeTopContainer';
import { ProductCard } from './ProductCard';
import { ProductCarousel } from './ProductCarousel';
import { NewsSection } from './NewsSection';
import { CustomBlocksRenderer } from './CustomBlocksRenderer';
import { useShop } from '../context/ShopContext';
import { 
  Truck, 
  ShieldCheck, 
  RotateCcw, 
  Clock,
  Sparkles,
  EyeOff,
  Star,
  Quote,
  ArrowRight,
  Mail,
  ShoppingBag
} from 'lucide-react';

export const HomeView: React.FC = () => {
  const { 
    products, 
    setActiveTab, 
    setSelectedCategory, 
    t, 
    language, 
    siteContent, 
    isVisualEditMode, 
    showToast, 
    categories = [],
    sellers = [],
    productBundles = [],
    addBundleToCart,
    formatPrice
  } = useShop();

  const [email, setEmail] = React.useState('');
  const [subscribed, setSubscribed] = React.useState(false);
  const [homeCategoryFilter, setHomeCategoryFilter] = React.useState('all');

  const visibility = siteContent.visibility || {
    homeHero: true,
    homeCategories: true,
    homeOffers: true,
    homeFeatured: true,
    homeTrustBadges: true,
    homeDeals: true,
    homeNewArrivals: true,
    homeHeritage: true,
    homeReviews: true,
    homeNewsletter: true,
    homeNews: true
  };

  // Filter and sort categories based on database/active state
  const sortedCategories = [...categories]
    .filter(cat => cat.isPublished !== false)
    .sort((a, b) => (a.displayOrder || 99) - (b.displayOrder || 99));

  const categoriesGrid = sortedCategories.map(cat => ({
    id: cat.id,
    name: language === 'ar' ? cat.nameAr : cat.nameEn,
    subtitle: language === 'ar' ? (cat.descriptionAr || '') : (cat.description || ''),
    image: cat.bannerUrl || 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=600&q=80'
  }));

  // Filter products: Published check + seller active check + featured / deals
  const publishedProducts = products.filter(p => isProductVisibleOnStorefront(p, sellers, isVisualEditMode));
  const featuredProducts = publishedProducts
    .filter(p => p.isFeatured || p.isBestseller || (p.displayOrder !== undefined && p.displayOrder <= 50))
    .sort((a, b) => {
      const orderA = a.displayOrder ?? 99999;
      const orderB = b.displayOrder ?? 99999;
      if (orderA !== orderB) return orderA - orderB;
      if (a.isFeatured && !b.isFeatured) return -1;
      if (!a.isFeatured && b.isFeatured) return 1;
      return 0;
    })
    .slice(0, 12);
  const todaysDeals = publishedProducts.filter(p => p.discountPercentage && p.discountPercentage > 0).slice(0, 12);
  const newArrivals = [...publishedProducts].sort((a, b) => {
    if (a.isNewArrival && !b.isNewArrival) return -1;
    if (!a.isNewArrival && b.isNewArrival) return 1;
    if (a.createdAt && b.createdAt) {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
    if (a.createdAt) return -1;
    if (b.createdAt) return 1;
    return 0;
  }).slice(0, 12);

  const handleCategoryClick = (catId: string) => {
    setSelectedCategory(catId);
    setActiveTab('products');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleViewAllProducts = () => {
    setSelectedCategory('all');
    setActiveTab('products');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const defaultOrder = [
    'homeHero',
    'homeCategories',
    'homeFeatured',
    'homeDeals',
    'homeBundles',
    'homeNews',
    'homeNewArrivals',
    'homeHeritage',
    'homeReviews',
    'homeNewsletter'
  ];

  const activeSectionOrder = siteContent.home?.sectionOrder && siteContent.home.sectionOrder.length > 0
    ? Array.from(new Set([...siteContent.home.sectionOrder, ...defaultOrder]))
    : defaultOrder;

  const renderSectionItem = (sectionId: string) => {
    switch (sectionId) {
      case 'homeHero':
        return (visibility.homeHero || isVisualEditMode) ? (
          <div key="homeHero" className={`w-full max-w-full relative ${!visibility.homeHero && isVisualEditMode ? 'opacity-70 border-4 border-dashed border-rose-500/80 p-2' : ''}`}>
            {!visibility.homeHero && isVisualEditMode && (
              <div className="absolute top-2 right-4 z-40 bg-rose-600 text-white px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 shadow-lg">
                <EyeOff className="w-3.5 h-3.5" />
                <span>Section Hidden (Draft Preview)</span>
              </div>
            )}
            <HomeTopContainer />
          </div>
        ) : null;

      case 'homeTrustBadges':
        return (visibility.homeTrustBadges || isVisualEditMode) ? (
          <section key="homeTrustBadges" className={`max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 relative ${!visibility.homeTrustBadges && isVisualEditMode ? 'opacity-70 border-2 border-dashed border-rose-500/80 rounded-2xl p-4' : ''}`}>
            {!visibility.homeTrustBadges && isVisualEditMode && (
              <div className="absolute top-2 right-4 z-40 bg-rose-600 text-white px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 shadow-lg">
                <EyeOff className="w-3.5 h-3.5" />
                <span>Section Hidden (Draft Preview)</span>
              </div>
            )}
            <div className="bg-white rounded-2xl border border-[#E5E5E5] shadow-2xs p-6 sm:p-8">
              {(siteContent.home?.trustBadgesTitle || siteContent.home?.trustBadgesTitleArabic) && (
                <div className="text-center mb-6">
                  <h3 className="text-base sm:text-lg font-bold text-[#171717]">
                    {language === 'ar' 
                      ? (siteContent.home?.trustBadgesTitleArabic || siteContent.home?.trustBadgesTitle) 
                      : (siteContent.home?.trustBadgesTitle || siteContent.home?.trustBadgesTitleArabic)}
                  </h3>
                  {(siteContent.home?.trustBadgesSubtitle || siteContent.home?.trustBadgesSubtitleArabic) && (
                    <p className="text-xs text-[#737373] mt-1">
                      {language === 'ar' 
                        ? (siteContent.home?.trustBadgesSubtitleArabic || siteContent.home?.trustBadgesSubtitle) 
                        : (siteContent.home?.trustBadgesSubtitle || siteContent.home?.trustBadgesSubtitleArabic)}
                    </p>
                  )}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="flex items-start gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200/60 text-[#8F7137] flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold text-[#171717]">
                      {language === 'ar' ? 'أصالة لبنانية موثقة 100%' : '100% Verified Lebanese'}
                    </h4>
                    <p className="text-[11px] text-[#737373] mt-0.5 leading-relaxed">
                      {language === 'ar' ? 'منتجات أصلية من ورش الحرفيين والتعاونيات القروية' : 'Authentic artisan creations from village cooperatives'}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200/60 text-emerald-700 flex items-center justify-center shrink-0">
                    <Truck className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold text-[#171717]">
                      {language === 'ar' ? 'توصيل محلي وشحن دولي' : 'Domestic & Global Courier'}
                    </h4>
                    <p className="text-[11px] text-[#737373] mt-0.5 leading-relaxed">
                      {language === 'ar' ? 'شحن سريع لجميع الأراضي اللبنانية وأكثر من 40 دولة' : 'Express door-to-door delivery across Lebanon & diaspora'}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200/60 text-blue-700 flex items-center justify-center shrink-0">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold text-[#171717]">
                      {language === 'ar' ? 'مونة طازجة وحرفية نقية' : 'Fresh Batches & Mouneh'}
                    </h4>
                    <p className="text-[11px] text-[#737373] mt-0.5 leading-relaxed">
                      {language === 'ar' ? 'محضرة من موسم القطاف بأعلى معايير النظافة والجودة' : 'Small seasonal batches packed at the height of freshness'}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-200/60 text-purple-700 flex items-center justify-center shrink-0">
                    <RotateCcw className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold text-[#171717]">
                      {language === 'ar' ? 'دعم الحرفيين المباشر' : 'Direct Artisan Support'}
                    </h4>
                    <p className="text-[11px] text-[#737373] mt-0.5 leading-relaxed">
                      {language === 'ar' ? 'عوائد الشراء تدعم مباشرة استمرار الحرف اليدوية' : 'Empowering independent rural workshops & families'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        ) : null;

      case 'homeCategories':
        return (visibility.homeCategories || isVisualEditMode) ? (
          <section key="homeCategories" className={`max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 relative ${!visibility.homeCategories && isVisualEditMode ? 'opacity-70 border-2 border-dashed border-rose-500/80 rounded-2xl p-4' : ''}`}>
            {!visibility.homeCategories && isVisualEditMode && (
              <div className="absolute top-2 right-4 z-40 bg-rose-600 text-white px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 shadow-lg">
                <EyeOff className="w-3.5 h-3.5" />
                <span>Section Hidden (Draft Preview)</span>
              </div>
            )}
            <div className="flex flex-wrap items-end justify-between gap-4 mb-6 sm:mb-8">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#8F7137] mb-1">
                  {language === 'ar' ? (
                    siteContent.home?.categoriesSubtitleArabic || 'تصفح الأقسام'
                  ) : (
                    siteContent.home?.categoriesSubtitle || 'Browse Departments'
                  )}
                </div>
                <h2 className="text-2xl sm:text-3xl font-serif text-[#171717] tracking-tight">
                  {language === 'ar' ? (
                    siteContent.home?.categoriesTitleArabic ? (
                      <span>{siteContent.home.categoriesTitleArabic}</span>
                    ) : (
                      <>تسوق حسب <span className="text-[#8F7137] italic">الفئات</span></>
                    )
                  ) : (
                    siteContent.home?.categoriesTitle ? (
                      <span>{siteContent.home.categoriesTitle}</span>
                    ) : (
                      <>Explore by <span className="text-[#8F7137] italic">Category</span></>
                    )
                  )}
                </h2>
                <p className="text-xs text-[#737373] mt-1">
                  {language === 'ar' ? (
                    siteContent.home?.regionsSubtitleArabic || 'اكتشف الحرف اللبنانية، المؤونة، والأجهزة المنزلية بكل سهولة'
                  ) : (
                    siteContent.home?.regionsSubtitle || 'Discover authentic Lebanese crafts, pantry delicacies, electronics, and home essentials'
                  )}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4 md:gap-5">
              {categoriesGrid.map((cat) => {
                const productCount = products.filter(p => p.category === cat.id && p.isPublished !== false).length;
                return (
                  <div
                    key={cat.id}
                    id={`category-card-${cat.id}`}
                    onClick={() => handleCategoryClick(cat.id)}
                    className="group relative flex flex-col rounded-xl bg-white border border-[#E5E5E5] hover:border-[#B89753] shadow-2xs hover:shadow-md transition-all duration-300 overflow-hidden cursor-pointer text-start"
                  >
                    <div className="relative aspect-square w-full overflow-hidden bg-[#F8F8F6] flex items-center justify-center p-2">
                      <img
                        src={cat.image}
                        alt={cat.name}
                        className="h-full w-full object-contain object-center group-hover:scale-105 transition-transform duration-500 ease-out"
                        loading="lazy"
                      />
                      <div className="absolute top-2.5 left-2.5 flex flex-col gap-1 z-10 pointer-events-none">
                        <span className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-[#171717]/85 backdrop-blur-xs text-[#B89753] rounded-md shadow-2xs border border-[#8F7137]/30">
                          {productCount > 0 
                            ? `${productCount} ${language === 'ar' ? 'منتجات' : 'items'}` 
                            : (language === 'ar' ? 'قسم' : 'Category')}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-1 flex-col p-3 sm:p-4 justify-between space-y-2.5 sm:space-y-3 bg-white">
                      <div>
                        <h3 className="text-xs sm:text-sm font-bold text-[#171717] group-hover:text-[#8F7137] transition-colors line-clamp-1 leading-snug">
                          {cat.name}
                        </h3>
                        <p className="text-[11px] text-[#737373] mt-1 line-clamp-1">
                          {cat.subtitle}
                        </p>
                      </div>

                      <div className="pt-2 sm:pt-2.5 border-t border-[#E5E5E5] flex items-center justify-between gap-1.5 sm:gap-2 mt-auto">
                        <span className="text-[11px] sm:text-xs font-bold text-[#171717] group-hover:text-[#8F7137] transition-colors truncate">
                          {language === 'ar' ? 'استكشف القسم' : 'Explore Category'}
                        </span>
                        <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-[#171717] group-hover:bg-[#8F7137] text-white flex items-center justify-center transition-colors cursor-pointer shadow-2xs flex-shrink-0">
                          <ArrowRight className={`w-3 h-3 sm:w-3.5 sm:h-3.5 transition-transform group-hover:translate-x-0.5 ${language === 'ar' ? 'rotate-180 group-hover:-translate-x-0.5' : ''}`} />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null;

      case 'homeFeatured':
        const filteredFeaturedProducts = homeCategoryFilter === 'all'
          ? featuredProducts
          : featuredProducts.filter(p => p.category === homeCategoryFilter);

        return (visibility.homeFeatured || isVisualEditMode) ? (
          <section key="homeFeatured" className={`max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 relative ${!visibility.homeFeatured && isVisualEditMode ? 'opacity-70 border-2 border-dashed border-rose-500/80 rounded-2xl p-4' : ''}`}>
            <div className="flex flex-wrap items-end justify-between gap-4 mb-6 sm:mb-8">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#8F7137] mb-1">
                  {language === 'ar' ? (
                    siteContent.home?.featuredSubtitleArabic || t('topPicks')
                  ) : (
                    siteContent.home?.featuredSubtitle || t('topPicks')
                  )}
                </div>
                <h2 className="text-2xl sm:text-3xl font-serif text-[#171717] tracking-tight">
                  {language === 'ar' ? (
                    siteContent.home?.featuredTitleArabic ? (
                      <span>{siteContent.home.featuredTitleArabic}</span>
                    ) : (
                      <>المنتجات <span className="text-[#8F7137] italic">المميزة</span></>
                    )
                  ) : (
                    siteContent.home?.featuredTitle ? (
                      <span>{siteContent.home.featuredTitle}</span>
                    ) : (
                      <>Featured <span className="text-[#8F7137] italic">Products</span></>
                    )
                  )}
                </h2>
                {language === 'ar' ? (
                  siteContent.home?.featuredDescriptionArabic ? (
                    <p className="text-xs text-[#737373] mt-1">{siteContent.home.featuredDescriptionArabic}</p>
                  ) : (
                    <p className="text-xs text-[#737373] mt-1">مختارات مميزة تحتفي بالحرفية الأصيلة والمونة اللبنانية العريقة</p>
                  )
                ) : (
                  siteContent.home?.featuredDescription ? (
                    <p className="text-xs text-[#737373] mt-1">{siteContent.home.featuredDescription}</p>
                  ) : (
                    <p className="text-xs text-[#737373] mt-1">Handpicked items celebrating timeless craftsmanship and Levantine gastronomy.</p>
                  )
                )}
              </div>
              <div className="flex-none">
                <button 
                  onClick={handleViewAllProducts}
                  className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-[#171717] hover:text-[#8F7137] transition-colors bg-white px-3.5 py-2 rounded-lg border border-[#E5E5E5] shadow-2xs hover:shadow-xs cursor-pointer"
                >
                  {t('viewAllProducts')}
                  <ArrowRight className={`w-3.5 h-3.5 ${language === 'ar' ? 'rotate-180' : ''}`} />
                </button>
              </div>
            </div>

            <ProductCarousel products={filteredFeaturedProducts} idPrefix="featured" />
          </section>
        ) : null;

      case 'homeDeals':
        return ((visibility.homeDeals || isVisualEditMode) && todaysDeals.length > 0) ? (
          <section key="homeDeals" className={`max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 relative ${!visibility.homeDeals && isVisualEditMode ? 'opacity-70 border-2 border-dashed border-rose-500/80 rounded-2xl p-4' : ''}`}>
            <div className="flex flex-wrap items-end justify-between gap-4 mb-6 sm:mb-8">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#C62828] mb-1 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>
                    {language === 'ar' ? (
                      siteContent.home?.dealsSubtitleArabic || t('flashDiscounts')
                    ) : (
                      siteContent.home?.dealsSubtitle || t('flashDiscounts')
                    )}
                  </span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-serif text-[#171717] tracking-tight">
                  {language === 'ar' ? (
                    siteContent.home?.dealsTitleArabic ? (
                      <span>{siteContent.home.dealsTitleArabic}</span>
                    ) : (
                      <>عروض <span className="text-[#8F7137] italic">اليوم</span></>
                    )
                  ) : (
                    siteContent.home?.dealsTitle ? (
                      <span>{siteContent.home.dealsTitle}</span>
                    ) : (
                      <>Today's <span className="text-[#8F7137] italic">Deals</span></>
                    )
                  )}
                </h2>
                <p className="text-xs text-[#737373] mt-1">
                  {language === 'ar' ? (
                    siteContent.home?.dealsDescriptionArabic || t('limitedTimeOffers')
                  ) : (
                    siteContent.home?.dealsDescription || t('limitedTimeOffers')
                  )}
                </p>
              </div>
              <div className="flex-none">
                <button 
                  onClick={handleViewAllProducts}
                  className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-[#171717] hover:text-[#8F7137] transition-colors bg-white px-3.5 py-2 rounded-lg border border-[#E5E5E5] shadow-2xs hover:shadow-xs cursor-pointer"
                >
                  {t('viewAllProducts')}
                  <ArrowRight className={`w-3.5 h-3.5 ${language === 'ar' ? 'rotate-180' : ''}`} />
                </button>
              </div>
            </div>
            <ProductCarousel products={todaysDeals} idPrefix="deals" />
          </section>
        ) : null;

      case 'homeBundles':
        return ((productBundles || []).filter(b => b.isActive !== false).length > 0) ? (
          <section key="homeBundles" className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-wrap items-end justify-between gap-4 mb-6 sm:mb-8">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#8F7137] mb-1">
                  {language === 'ar' 
                    ? (siteContent.home?.bundlesBadgeArabic || 'باقات توفير حصرية') 
                    : (siteContent.home?.bundlesBadge || 'Exclusive Curated Packs')}
                </div>
                <h2 className="text-2xl sm:text-3xl font-serif text-[#171717] tracking-tight">
                  {language === 'ar' ? (
                    siteContent.home?.bundlesTitleArabic ? (
                      <span>{siteContent.home.bundlesTitleArabic}</span>
                    ) : (
                      <>مجموعات <span className="text-[#8F7137] italic">الهدايا والكومبو</span> المميزة</>
                    )
                  ) : (
                    siteContent.home?.bundlesTitle ? (
                      <span>{siteContent.home.bundlesTitle}</span>
                    ) : (
                      <>Lebanese <span className="text-[#8F7137] italic">Combo & Gift Sets</span></>
                    )
                  )}
                </h2>
                <p className="text-xs text-[#737373] mt-1">
                  {language === 'ar' 
                    ? (siteContent.home?.bundlesSubtitleArabic || 'وفر أكثر مع هذه المجموعات المختارة بعناية من منتجاتنا التقليدية') 
                    : (siteContent.home?.bundlesSubtitle || 'Save more with our handpicked artisanal combinations and custom-packaged Lebanese treasures.')}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
              {productBundles
                .filter(b => b.isActive !== false)
                .map((bundle) => {
                  const bundleProds = (products || []).filter(p => bundle.productIds.includes(p.id) && p.isPublished !== false);
                  const originalTotal = bundleProds.reduce((sum, p) => sum + (p.priceUSD || 0), 0);
                  const discountAmount = originalTotal - bundle.bundlePriceUSD;
                  
                  return (
                    <div
                      key={bundle.id}
                      className="flex flex-col rounded-xl bg-white border border-[#E5E5E5] hover:border-[#B89753] shadow-2xs hover:shadow-md transition-all duration-300 overflow-hidden text-start p-5 sm:p-6"
                    >
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <span className="px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-amber-50 text-[#8F7137] rounded-md border border-amber-200">
                          {language === 'ar' ? (bundle.badgeTextAr || 'مجموعة توفير') : (bundle.badgeText || 'SPECIAL COMBO')}
                        </span>
                        {discountAmount > 0 && (
                          <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-[#16803C] text-white rounded-md shadow-2xs">
                            {language === 'ar' ? `وفر ${formatPrice(discountAmount)}` : `Save ${formatPrice(discountAmount)}`}
                          </span>
                        )}
                      </div>

                      <h3 className="text-lg font-bold text-[#171717] mb-1 leading-snug">
                        {language === 'ar' ? (bundle.nameAr || bundle.name) : bundle.name}
                      </h3>

                      {bundle.description && (
                        <p className="text-xs text-[#737373] line-clamp-2 mb-4 leading-relaxed">
                          {language === 'ar' ? (bundle.descriptionAr || bundle.description) : bundle.description}
                        </p>
                      )}

                      <div className="space-y-2.5 mb-6 border-y border-[#E5E5E5] py-4 flex-1">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[#737373] mb-1">
                          {language === 'ar' ? 'المنتجات المشمولة:' : 'Includes:'}
                        </p>
                        {bundleProds.map(prod => (
                          <div key={prod.id} className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg border border-[#E5E5E5] bg-[#F8F8F6] flex items-center justify-center p-0.5 shrink-0 overflow-hidden">
                              <img
                                src={prod.image}
                                alt={prod.name}
                                className="w-full h-full object-contain"
                                referrerPolicy="no-referrer"
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-[#171717] truncate">
                                {language === 'ar' ? (prod.arabicName || prod.name) : prod.name}
                              </p>
                            </div>
                            <span className="text-xs text-[#737373] font-medium">
                              {formatPrice(prod.priceUSD)}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center justify-between gap-4 mt-auto">
                        <div className="flex flex-col">
                          {originalTotal > bundle.bundlePriceUSD && (
                            <span className="text-xs text-[#737373] line-through">
                              {formatPrice(originalTotal)}
                            </span>
                          )}
                          <span className="text-xl font-bold text-[#171717] leading-none">
                            {formatPrice(bundle.bundlePriceUSD)}
                          </span>
                        </div>

                        <button
                          onClick={() => {
                            addBundleToCart(bundle.id);
                            showToast(
                              language === 'ar' 
                                ? 'تمت إضافة المجموعة الحصرية بنجاح إلى السلة!' 
                                : 'Exclusive bundle added successfully to your cart!', 
                              'success'
                            );
                          }}
                          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#171717] hover:bg-[#8F7137] text-white font-bold text-xs uppercase tracking-wider shadow-2xs transition-colors cursor-pointer"
                        >
                          <ShoppingBag className="w-4 h-4" />
                          <span>{language === 'ar' ? 'أضف المجموعة' : 'Add Pack'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          </section>
        ) : null;

      case 'homeNews':
        return (visibility.homeNews || isVisualEditMode) ? (
          <div key="homeNews" className={`relative ${!visibility.homeNews && isVisualEditMode ? 'opacity-70 border-2 border-dashed border-rose-500/80 rounded-2xl' : ''}`}>
            <NewsSection />
          </div>
        ) : null;

      case 'homeNewArrivals':
        return (visibility.homeNewArrivals || isVisualEditMode) ? (
          <section key="homeNewArrivals" className={`max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 relative ${!visibility.homeNewArrivals && isVisualEditMode ? 'opacity-70 border-2 border-dashed border-rose-500/80 rounded-2xl p-4' : ''}`}>
            <div className="flex flex-wrap items-end justify-between gap-4 mb-6 sm:mb-8">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#8F7137] mb-1">
                  {language === 'ar' ? (
                    siteContent.home?.newArrivalsSubtitleArabic || t('freshlyStocked')
                  ) : (
                    siteContent.home?.newArrivalsSubtitle || t('freshlyStocked')
                  )}
                </div>
                <h2 className="text-2xl sm:text-3xl font-serif text-[#171717] tracking-tight">
                  {language === 'ar' ? (
                    siteContent.home?.newArrivalsTitleArabic ? (
                      <span>{siteContent.home.newArrivalsTitleArabic}</span>
                    ) : (
                      <>وصل حديثاً <span className="text-[#8F7137] italic">إلينا</span></>
                    )
                  ) : (
                    siteContent.home?.newArrivalsTitle ? (
                      <span>{siteContent.home.newArrivalsTitle}</span>
                    ) : (
                      <>New <span className="text-[#8F7137] italic">Arrivals</span></>
                    )
                  )}
                </h2>
              </div>
              <div className="flex-none">
                <button 
                  onClick={handleViewAllProducts}
                  className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-[#171717] hover:text-[#8F7137] transition-colors bg-white px-3.5 py-2 rounded-lg border border-[#E5E5E5] shadow-2xs hover:shadow-xs cursor-pointer"
                >
                  {t('viewAllProducts')}
                  <ArrowRight className={`w-3.5 h-3.5 ${language === 'ar' ? 'rotate-180' : ''}`} />
                </button>
              </div>
            </div>
            <ProductCarousel products={newArrivals.slice(0, 12)} idPrefix="new" />
          </section>
        ) : null;

      case 'homeHeritage':
        return (visibility.homeHeritage || isVisualEditMode) ? (
          <section key="homeHeritage" className={`max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 relative ${!visibility.homeHeritage && isVisualEditMode ? 'opacity-70 border-2 border-dashed border-rose-500/80 rounded-2xl p-4' : ''}`}>
            <div className="bg-white border border-[#E5E5E5] rounded-2xl p-8 sm:p-12 text-center max-w-4xl mx-auto shadow-2xs">
              <h2 className="text-2xl sm:text-3xl font-serif text-[#171717] tracking-tight mb-4">
                {language === 'ar' ? (siteContent.home?.heritageTitleArabic || siteContent.home?.heritageTitle || 'تراثنا') : (siteContent.home?.heritageTitle || 'Our Heritage')}
              </h2>
              <p className="text-sm sm:text-base text-[#737373] leading-relaxed mx-auto max-w-2xl">
                {language === 'ar' ? (siteContent.home?.heritageTextArabic || siteContent.home?.heritageText || '') : (siteContent.home?.heritageText || '')}
              </p>
            </div>
          </section>
        ) : null;

      case 'homeReviews':
        return (visibility.homeReviews || isVisualEditMode) ? (
          <section key="homeReviews" className={`max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 relative ${!visibility.homeReviews && isVisualEditMode ? 'opacity-70 border-2 border-dashed border-rose-500/80 rounded-2xl p-4' : ''}`}>
            <div className="text-center mb-8">
              <h2 className="text-2xl sm:text-3xl font-serif text-[#171717] tracking-tight">
                {language === 'ar' ? (siteContent.home?.reviewsTitleArabic || siteContent.home?.reviewsTitle || 'آراء الزبائن') : (siteContent.home?.reviewsTitle || 'Customer Reviews')}
              </h2>
              <p className="text-sm text-[#737373] mt-2 max-w-2xl mx-auto">
                {language === 'ar' ? (siteContent.home?.reviewsSubtitleArabic || siteContent.home?.reviewsSubtitle || '') : (siteContent.home?.reviewsSubtitle || '')}
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-xl border border-[#E5E5E5] shadow-2xs">
                <div className="flex gap-1 text-amber-400 mb-3">
                  {[1,2,3,4,5].map(i => <Star key={i} className="w-4 h-4 fill-current" />)}
                </div>
                <p className="text-sm text-[#171717] italic mb-4 leading-relaxed">"Absolutely authentic and beautiful craftsmanship. Reminds me of home."</p>
                <div className="font-bold text-xs text-[#8F7137]">- Sarah K., Paris</div>
              </div>
              <div className="bg-white p-6 rounded-xl border border-[#E5E5E5] shadow-2xs">
                <div className="flex gap-1 text-amber-400 mb-3">
                  {[1,2,3,4,5].map(i => <Star key={i} className="w-4 h-4 fill-current" />)}
                </div>
                <p className="text-sm text-[#171717] italic mb-4 leading-relaxed">"The mouneh products are exactly how my grandmother used to make them!"</p>
                <div className="font-bold text-xs text-[#8F7137]">- Elie M., Beirut</div>
              </div>
              <div className="bg-white p-6 rounded-xl border border-[#E5E5E5] shadow-2xs">
                <div className="flex gap-1 text-amber-400 mb-3">
                  {[1,2,3,4,5].map(i => <Star key={i} className="w-4 h-4 fill-current" />)}
                </div>
                <p className="text-sm text-[#171717] italic mb-4 leading-relaxed">"Quick delivery to Dubai and the packaging was excellent. Highly recommended."</p>
                <div className="font-bold text-xs text-[#8F7137]">- Noor A., Dubai</div>
              </div>
            </div>
          </section>
        ) : null;

      case 'homeNewsletter':
        return (visibility.homeNewsletter || isVisualEditMode) ? (
          <section key="homeNewsletter" className={`max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 relative ${!visibility.homeNewsletter && isVisualEditMode ? 'opacity-70 border-2 border-dashed border-rose-500/80 rounded-2xl p-4' : ''}`}>
            <div className="bg-[#171717] rounded-2xl p-8 sm:p-12 text-center max-w-4xl mx-auto flex flex-col items-center border border-[#8F7137]/30 shadow-md">
              <h2 className="text-xl sm:text-2xl font-serif text-white tracking-tight mb-2">
                {language === 'ar' ? (siteContent.home?.newsletterTitleArabic || siteContent.home?.newsletterTitle || 'النشرة البريدية') : (siteContent.home?.newsletterTitle || 'Join our Newsletter')}
              </h2>
              {(siteContent.home?.newsletterSubtitle || siteContent.home?.newsletterSubtitleArabic) && (
                <p className="text-xs sm:text-sm text-neutral-300 mb-6 max-w-md">
                  {language === 'ar' 
                    ? (siteContent.home?.newsletterSubtitleArabic || siteContent.home?.newsletterSubtitle) 
                    : (siteContent.home?.newsletterSubtitle || siteContent.home?.newsletterSubtitleArabic)}
                </p>
              )}
              <div className="flex flex-col sm:flex-row w-full max-w-md gap-3 mt-2">
                <input 
                  type="email" 
                  placeholder={language === 'ar' ? 'البريد الإلكتروني' : 'Email Address'} 
                  className="flex-1 px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder-neutral-400 focus:outline-none focus:border-[#B89753] text-sm"
                />
                <button className="px-6 py-3 bg-[#B89753] hover:bg-[#8F7137] text-white font-bold text-xs uppercase tracking-wider rounded-lg transition-colors whitespace-nowrap cursor-pointer shadow-2xs">
                  {language === 'ar' ? (siteContent.home?.newsletterButtonTextArabic || siteContent.home?.newsletterButtonText || 'اشترك') : (siteContent.home?.newsletterButtonText || 'Subscribe')}
                </button>
              </div>
            </div>
          </section>
        ) : null;

      default:
        return null;
    }
  };

  return (
    <div className="pb-12 bg-[#F7F6F1] pt-4 sm:pt-6">
      
      {/* Top Custom Divs / Banners */}
      <CustomBlocksRenderer page="home" position="top" />

      {/* Middle Custom Divs / Banners */}
      <CustomBlocksRenderer page="home" position="middle" />

      <div className="space-y-8 sm:space-y-12">
        {/* Dynamic Ordered Homepage Sections */}
        {activeSectionOrder.map(sectionId => renderSectionItem(sectionId))}
      </div>

      {/* Bottom Custom Divs / Banners */}
      <div className="mt-8 sm:mt-12">
        <CustomBlocksRenderer page="home" position="bottom" />
      </div>

    </div>
  );
};
