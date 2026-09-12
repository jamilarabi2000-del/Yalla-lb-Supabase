import React, { useState, useMemo, useEffect } from 'react';
import { useShop } from '../context/ShopContext';
import { isProductVisibleOnStorefront } from '../lib/storefrontVisibility';
import { ProductCard } from './ProductCard';
import { CustomBlocksRenderer } from './CustomBlocksRenderer';
import { 
  Filter, 
  SlidersHorizontal, 
  Search, 
  Sparkles, 
  MapPin, 
  RotateCcw,
  Check,
  ArrowLeft,
  EyeOff,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Grid
} from 'lucide-react';

export const ProductsView: React.FC = () => {
  const { 
    products, 
    searchQuery, 
    setSearchQuery, 
    logSearchQuery,
    selectedCategory, 
    setSelectedCategory,
    goBack,
    t,
    language,
    siteContent,
    isVisualEditMode,
    sellers = [],
    categories: contextCategories
  } = useShop();

  // Debounced search logging when visitors search on products catalog page
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (trimmed.length >= 2) {
      const timer = setTimeout(() => {
        logSearchQuery(trimmed, 'products_page');
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [searchQuery, logSearchQuery]);

  const [sortBy, setSortBy] = useState<'featured' | 'price_low' | 'price_high' | 'rating'>('featured');
  const [onlyInStock, setOnlyInStock] = useState<boolean>(false);

  const visibility = siteContent.visibility || {
    productsHeader: true,
    productsSearchFilter: true,
    productsCategoryTabs: true,
    productsSort: true,
    productsGrid: true
  };

  const activeCategoryObj = contextCategories?.find(c => c.id === selectedCategory);
  
  const currentTitle = selectedCategory === 'all' || !selectedCategory
    ? (siteContent?.productsPage?.title ?? (
        language === 'ar' ? (
          <>كتالوج المنتجات الحرفية <span className="text-amber-400 font-serif italic">اللبنانية</span></>
        ) : (
          <>Lebanese Artisan <span className="text-amber-400 font-serif italic">Catalog</span></>
        )
      ))
    : (activeCategoryObj 
        ? (language === 'ar' ? activeCategoryObj.nameAr : activeCategoryObj.nameEn)
        : ((t as any)('cat_' + selectedCategory) !== `cat_${selectedCategory}` ? (t as any)('cat_' + selectedCategory) : selectedCategory));

  const currentSubtitle = selectedCategory === 'all' || !selectedCategory
    ? (siteContent?.productsPage?.subtitle ?? (
        language === 'ar' 
          ? 'اكتشف المؤونة الغذائية، والحرف اليدوية التراثية، وزيت الزيتون العضوي، والمنتجات المحلية المباشرة من جميع المناطق اللبنانية.'
          : 'Discover culinary treasures, heirloom handcrafts, organic olive oils, and artisanal creations directly sourced across Lebanon.'
      ))
    : (activeCategoryObj?.descriptionAr && language === 'ar' 
        ? activeCategoryObj.descriptionAr 
        : (activeCategoryObj?.description || (language === 'ar' ? `تصفح تشكيلة ${currentTitle} الفاخرة والمختارة بعناية.` : `Browse our curated collection of items.`)));

  // Live categories from admin / database with fallback
  const sortedActiveCategories = useMemo(() => {
    if (!contextCategories || contextCategories.length === 0) return [];
    return [...contextCategories]
      .filter(cat => cat.isPublished !== false || isVisualEditMode)
      .sort((a, b) => (a.displayOrder || 99) - (b.displayOrder || 99));
  }, [contextCategories, isVisualEditMode]);

  const categories = useMemo(() => {
    if (sortedActiveCategories.length > 0) {
      return [
        { id: 'all', name: t('cat_all'), icon: '✨' },
        ...sortedActiveCategories.map(cat => ({
          id: cat.id,
          name: language === 'ar' ? cat.nameAr : cat.nameEn,
          icon: cat.icon || '📦'
        }))
      ];
    }
    return [
      { id: 'all', name: t('cat_all'), icon: '✨' },
      { id: 'electronics', name: t('cat_electronics'), icon: '⚡' },
      { id: 'fashion', name: t('cat_fashion'), icon: '👔' },
      { id: 'home', name: t('cat_home'), icon: '🛋️' },
      { id: 'beauty', name: t('cat_beauty'), icon: '💄' },
      { id: 'sports', name: t('cat_sports'), icon: '⚽' },
      { id: 'books', name: t('cat_books'), icon: '📚' },
      { id: 'toys', name: t('cat_toys'), icon: '🧸' },
      { id: 'grocery', name: t('cat_grocery'), icon: '🛒' },
      { id: 'yalla-global', name: t('cat_yalla_global'), icon: '🌐' },
      { id: 'stationery', name: t('cat_stationery'), icon: '📝' },
      { id: 'tools-hardware', name: t('cat_tools_hardware'), icon: '🛠️' },
      { id: 'plumbing', name: t('cat_plumbing'), icon: '🚰' },
      { id: 'beauty-personal-care', name: t('cat_beauty_personal_care'), icon: '🧴' },
      { id: 'linen-bath', name: t('cat_linen_bath'), icon: '🛌' },
      { id: 'houseware', name: t('cat_houseware'), icon: '🍳' },
      { id: 'digital', name: t('cat_digital'), icon: '📱' },
      { id: 'indoor-furniture', name: t('cat_indoor_furniture'), icon: '🪑' },
      { id: 'outdoor-furniture', name: t('cat_outdoor_furniture'), icon: '🪴' },
      { id: 'lawn-garden', name: t('cat_lawn_garden'), icon: '🌿' },
      { id: 'decor', name: t('cat_decor'), icon: '🖼️' },
      { id: 'lighting', name: t('cat_lighting'), icon: '💡' },
      { id: 'electrical', name: t('cat_electrical'), icon: '🔌' },
      { id: 'cleaning', name: t('cat_cleaning'), icon: '🧼' },
      { id: 'consumable', name: t('cat_consumable'), icon: '🍯' }
    ];
  }, [sortedActiveCategories, language, t]);

  // Filtered & Sorted products
  const filteredProducts = useMemo(() => {
    return products.filter(product => {
      // Check seller active status + product published status
      if (!isProductVisibleOnStorefront(product, sellers, isVisualEditMode)) {
        return false;
      }

      // Category filter
      const isAllCategory = !selectedCategory || selectedCategory.toLowerCase() === 'all';
      if (!isAllCategory && product.category !== selectedCategory) {
        return false;
      }

      // Stock filter
      if (onlyInStock && product.stock <= 0) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesName = product.name.toLowerCase().includes(query);
        const matchesAr = product.arabicName ? product.arabicName.toLowerCase().includes(query) : false;
        const matchesArtisan = product.artisan.toLowerCase().includes(query);
        const matchesOrigin = product.origin.toLowerCase().includes(query);
        const matchesTags = product.tags.some(t => t.toLowerCase().includes(query));
        const matchesKeywords = product.keywords ? product.keywords.some(k => k.toLowerCase().includes(query)) : false;
        const matchesDesc = product.description.toLowerCase().includes(query);
        if (!matchesName && !matchesAr && !matchesArtisan && !matchesOrigin && !matchesTags && !matchesKeywords && !matchesDesc) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => {
      if (sortBy === 'price_low') return a.priceUSD - b.priceUSD;
      if (sortBy === 'price_high') return b.priceUSD - a.priceUSD;
      if (sortBy === 'rating') return b.rating - a.rating;
      // Default: manual display order first (if set), then featured, then rating
      const orderA = a.displayOrder ?? 99999;
      const orderB = b.displayOrder ?? 99999;
      if (orderA !== orderB) return orderA - orderB;
      if (a.isFeatured && !b.isFeatured) return -1;
      if (!a.isFeatured && b.isFeatured) return 1;
      return b.rating - a.rating;
    });
  }, [products, selectedCategory, onlyInStock, searchQuery, sortBy, isVisualEditMode]);

  // Pagination state
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(12);

  // Reset page to 1 whenever filters or page size change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedCategory, searchQuery, onlyInStock, sortBy, itemsPerPage]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / itemsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedProducts = useMemo(() => {
    const start = (safeCurrentPage - 1) * itemsPerPage;
    return filteredProducts.slice(start, start + itemsPerPage);
  }, [filteredProducts, safeCurrentPage, itemsPerPage]);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
      const gridElement = document.getElementById('products-grid-section');
      if (gridElement) {
        gridElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        window.scrollTo({ top: 300, behavior: 'smooth' });
      }
    }
  };

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (safeCurrentPage > 3) {
        pages.push('...');
      }
      const start = Math.max(2, safeCurrentPage - 1);
      const end = Math.min(totalPages - 1, safeCurrentPage + 1);
      for (let i = start; i <= end; i++) {
        if (!pages.includes(i)) pages.push(i);
      }
      if (safeCurrentPage < totalPages - 2) {
        pages.push('...');
      }
      if (!pages.includes(totalPages)) {
        pages.push(totalPages);
      }
    }
    return pages;
  };

  const resetFilters = () => {
    setSortBy('featured');
    setOnlyInStock(false);
    setSearchQuery('');
    setCurrentPage(1);
  };

  return (
    <div className="min-h-screen bg-[#F8F8F6] pb-20 pt-4 sm:pt-6">
      
      {/* Top Custom Divs / Banners */}
      <CustomBlocksRenderer page="products" position="top" />

      {/* Header Banner */}
      {(visibility.productsHeader || isVisualEditMode) && (
        <div className={`bg-[#171717] border-b border-[#262626] pt-6 pb-12 px-4 sm:px-6 lg:px-8 relative ${!visibility.productsHeader && isVisualEditMode ? 'opacity-70 border-4 border-dashed border-rose-500/80' : ''}`}>
          {!visibility.productsHeader && isVisualEditMode && (
            <div className="absolute top-3 right-4 bg-rose-600 text-white px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1">
              <EyeOff className="w-3.5 h-3.5" />
              <span>Catalog Header Hidden (Draft Mode)</span>
            </div>
          )}
          <div className="max-w-screen-2xl mx-auto space-y-4">
            <button
              id="products-page-back-btn"
              onClick={goBack}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold uppercase tracking-wider border border-white/15 transition-colors cursor-pointer mb-2"
            >
              <ArrowLeft className={`w-3.5 h-3.5 ${language === 'ar' ? 'rotate-180' : ''}`} />
              <span>{t('back')}</span>
            </button>

            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-[#B89753] text-xs font-bold uppercase tracking-widest mb-1">
                  <span className="w-2 h-2 rounded-full bg-[#16803C] animate-pulse" />
                  <span>{t('verifiedProvenance')}</span>
                </div>
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-serif text-white tracking-tight">
                  {currentTitle}
                </h1>
                <p className="text-xs sm:text-sm text-neutral-300 max-w-2xl mt-1.5 leading-relaxed">
                  {currentSubtitle}
                </p>
              </div>

              {/* Quick stats badge */}
              <div className="flex items-center gap-3 bg-white/5 px-4 py-2.5 rounded-xl border border-white/10">
                <div>
                  <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">{language === 'ar' ? 'متوفر' : 'Available'}</p>
                  <p className="text-lg font-bold text-[#B89753]">{filteredProducts.length} {language === 'ar' ? 'منتج' : 'Items'}</p>
                </div>
              </div>
            </div>

            {/* Search bar inside header */}
            {(visibility.productsSearchFilter || isVisualEditMode) && (
              <div className="pt-3 relative max-w-2xl group">
                <Search className={`absolute ${language === 'ar' ? 'right-4' : 'left-4'} top-[26px] w-4 h-4 text-[#737373] group-focus-within:text-[#B89753] transition-colors pointer-events-none`} />
                <input
                  type="text"
                  id="products-search-input"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={siteContent?.productsPage?.searchPlaceholder ?? t('searchPlaceholder')}
                  className={`w-full ${language === 'ar' ? 'pr-11 pl-20' : 'pl-11 pr-20'} py-3 bg-white text-xs text-[#171717] placeholder:text-[#737373] rounded-lg border border-[#E5E5E5] focus:border-[#B89753] focus:outline-none transition-all shadow-2xs font-medium`}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3.5 top-3 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#737373] hover:text-[#171717] bg-neutral-100 hover:bg-neutral-200 border border-[#E5E5E5] rounded-md transition-all cursor-pointer"
                  >
                    {t('clear')}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Middle Custom Divs / Banners */}
      <CustomBlocksRenderer page="products" position="middle" />

      {/* Main Content Layout */}
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        
        {/* Category Filter Chips Bar */}
        {(visibility.productsCategoryTabs || isVisualEditMode) && (
          <div className="flex items-center gap-2 overflow-x-auto pb-3">
            {categories.map(cat => (
              <button
                key={cat.id}
                id={`filter-cat-${cat.id}`}
                onClick={() => setSelectedCategory(cat.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all cursor-pointer ${
                  selectedCategory === cat.id
                    ? 'bg-[#171717] text-white shadow-2xs'
                    : 'bg-white hover:bg-neutral-50 text-[#171717] border border-[#E5E5E5]'
                }`}
              >
                <span>{cat.icon}</span>
                <span>{cat.name}</span>
              </button>
            ))}
          </div>
        )}

        {/* Secondary Controls: Sort Options, Items Per Page & Filters */}
        {(visibility.productsSort || isVisualEditMode) && (
          <div className="mt-3 p-3 sm:p-4 rounded-xl bg-white border border-[#E5E5E5] shadow-2xs flex flex-wrap items-center justify-between gap-4">
            
            <div className="text-xs font-semibold text-[#737373] flex items-center gap-2">
              <Grid className="w-4 h-4 text-[#8F7137]" />
              <span>
                {language === 'ar'
                  ? `عرض ${filteredProducts.length > 0 ? (safeCurrentPage - 1) * itemsPerPage + 1 : 0}–${Math.min(safeCurrentPage * itemsPerPage, filteredProducts.length)} من إجمالي ${filteredProducts.length} منتج`
                  : `Showing ${filteredProducts.length > 0 ? (safeCurrentPage - 1) * itemsPerPage + 1 : 0}–${Math.min(safeCurrentPage * itemsPerPage, filteredProducts.length)} of ${filteredProducts.length} items`}
              </span>
            </div>

            {/* Sort & Page Size & Stock Toggles */}
            <div className="flex flex-wrap items-center gap-3">
              
              {/* Sort selector */}
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-3.5 h-3.5 text-[#8F7137]" />
                <span className="text-[#737373] uppercase tracking-wider text-[10px] font-bold">{language === 'ar' ? 'الترتيب:' : 'Sort:'}</span>
                <select
                  id="sort-by-select"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="bg-[#F8F8F6] text-xs font-bold text-[#171717] border border-[#E5E5E5] rounded-lg px-3 py-1.5 focus:border-[#B89753] focus:outline-none"
                >
                  <option value="featured">{language === 'ar' ? 'المنتجات المميزة' : 'Featured Items'}</option>
                  <option value="price_low">{language === 'ar' ? 'السعر: من الأقل للأعلى' : 'Price: Low to High'}</option>
                  <option value="price_high">{language === 'ar' ? 'السعر: من الأعلى للأقل' : 'Price: High to Low'}</option>
                </select>
              </div>

              {/* Items Per Page dropdown */}
              <div className="flex items-center gap-2 border-l border-[#E5E5E5] pl-3 dir-ltr:border-l dir-rtl:border-r dir-rtl:pr-3">
                <span className="text-[#737373] uppercase tracking-wider text-[10px] font-bold">{language === 'ar' ? 'في الصفحة:' : 'Per Page:'}</span>
                <select
                  id="items-per-page-select"
                  value={itemsPerPage}
                  onChange={(e) => setItemsPerPage(Number(e.target.value))}
                  className="bg-[#F8F8F6] text-xs font-bold text-[#171717] border border-[#E5E5E5] rounded-lg px-2.5 py-1.5 focus:border-[#B89753] focus:outline-none"
                >
                  <option value={8}>8</option>
                  <option value={12}>12</option>
                  <option value={16}>16</option>
                  <option value={24}>24</option>
                  <option value={36}>36</option>
                  <option value={48}>48</option>
                </select>
              </div>

              {/* In stock only toggle */}
              <label className="flex items-center gap-2 cursor-pointer text-xs text-[#171717] font-medium select-none border-l border-[#E5E5E5] pl-3">
                <input
                  type="checkbox"
                  id="in-stock-only-checkbox"
                  checked={onlyInStock}
                  onChange={(e) => setOnlyInStock(e.target.checked)}
                  className="rounded border-[#E5E5E5] text-[#8F7137] focus:ring-[#B89753]"
                />
                <span className="text-xs">{language === 'ar' ? 'المتوفر فقط' : 'In Stock Only'}</span>
              </label>

              {/* Reset Filters */}
              {(searchQuery || onlyInStock || sortBy !== 'featured') && (
                <button
                  id="reset-filters-btn"
                  onClick={resetFilters}
                  className="flex items-center gap-1 text-xs text-[#8F7137] hover:text-[#171717] font-bold px-2 py-1 rounded-md bg-amber-50 border border-amber-200 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>{language === 'ar' ? 'إعادة ضبط' : 'Reset'}</span>
                </button>
              )}

            </div>

          </div>
        )}

        {/* Products Grid */}
        {(visibility.productsGrid || isVisualEditMode) && (
          <div id="products-grid-section" className="mt-6 scroll-mt-6">
            {filteredProducts.length > 0 ? (
              <div className="space-y-10">
                
                {/* Product Items */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4 md:gap-5">
                  {paginatedProducts.map(product => (
                    <ProductCard key={product.id} product={product} />
                  ))}
                </div>

                {/* Pagination Controls Bar */}
                {totalPages > 1 && (
                  <div className="pt-6 border-t border-[#E5E5E5] flex flex-col sm:flex-row items-center justify-between gap-4">
                    
                    {/* Page counter summary */}
                    <div className="text-xs font-semibold text-[#737373]">
                      {language === 'ar'
                        ? `الصفحة ${safeCurrentPage} من ${totalPages}`
                        : `Page ${safeCurrentPage} of ${totalPages}`}
                    </div>

                    {/* Page Navigation Buttons */}
                    <div className="flex items-center gap-1.5">
                      
                      {/* First Page */}
                      <button
                        onClick={() => handlePageChange(1)}
                        disabled={safeCurrentPage === 1}
                        title={language === 'ar' ? 'الصفحة الأولى' : 'First Page'}
                        className="p-2 rounded-lg border border-[#E5E5E5] bg-white text-[#171717] hover:bg-neutral-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-2xs"
                      >
                        <ChevronsLeft className={`w-4 h-4 ${language === 'ar' ? 'rotate-180' : ''}`} />
                      </button>

                      {/* Previous Page */}
                      <button
                        onClick={() => handlePageChange(safeCurrentPage - 1)}
                        disabled={safeCurrentPage === 1}
                        title={language === 'ar' ? 'الصفحة السابقة' : 'Previous Page'}
                        className="p-2 rounded-lg border border-[#E5E5E5] bg-white text-[#171717] hover:bg-neutral-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-2xs"
                      >
                        <ChevronLeft className={`w-4 h-4 ${language === 'ar' ? 'rotate-180' : ''}`} />
                      </button>

                      {/* Page Numbers */}
                      <div className="flex items-center gap-1 mx-1">
                        {getPageNumbers().map((pageNum, idx) => {
                          if (pageNum === '...') {
                            return (
                              <span key={`dots-${idx}`} className="px-2 py-1 text-[#737373] text-xs font-bold">
                                ...
                              </span>
                            );
                          }
                          const page = pageNum as number;
                          const isActive = page === safeCurrentPage;
                          return (
                            <button
                              key={`page-${page}`}
                              onClick={() => handlePageChange(page)}
                              className={`w-9 h-9 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-2xs ${
                                isActive
                                  ? 'bg-[#171717] text-white shadow-xs scale-105'
                                  : 'bg-white hover:bg-neutral-100 text-[#171717] border border-[#E5E5E5]'
                              }`}
                            >
                              {page}
                            </button>
                          );
                        })}
                      </div>

                      {/* Next Page */}
                      <button
                        onClick={() => handlePageChange(safeCurrentPage + 1)}
                        disabled={safeCurrentPage === totalPages}
                        title={language === 'ar' ? 'الصفحة التالية' : 'Next Page'}
                        className="p-2 rounded-lg border border-[#E5E5E5] bg-white text-[#171717] hover:bg-neutral-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-2xs"
                      >
                        <ChevronRight className={`w-4 h-4 ${language === 'ar' ? 'rotate-180' : ''}`} />
                      </button>

                      {/* Last Page */}
                      <button
                        onClick={() => handlePageChange(totalPages)}
                        disabled={safeCurrentPage === totalPages}
                        title={language === 'ar' ? 'الصفحة الأخيرة' : 'Last Page'}
                        className="p-2 rounded-lg border border-[#E5E5E5] bg-white text-[#171717] hover:bg-neutral-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-2xs"
                      >
                        <ChevronsRight className={`w-4 h-4 ${language === 'ar' ? 'rotate-180' : ''}`} />
                      </button>

                    </div>

                    {/* Page Size Fast Select */}
                    <div className="flex items-center gap-2 text-xs font-medium text-[#737373]">
                      <span>{language === 'ar' ? 'منتجات في الصفحة:' : 'Items per page:'}</span>
                      <select
                        value={itemsPerPage}
                        onChange={(e) => setItemsPerPage(Number(e.target.value))}
                        className="bg-white border border-[#E5E5E5] rounded-lg px-2 py-1 text-xs font-bold text-[#171717]"
                      >
                        <option value={8}>8</option>
                        <option value={12}>12</option>
                        <option value={16}>16</option>
                        <option value={24}>24</option>
                        <option value={36}>36</option>
                        <option value={48}>48</option>
                      </select>
                    </div>

                  </div>
                )}
              </div>
            ) : (
              <div className="py-20 text-center space-y-4 max-w-md mx-auto">
                <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto text-[#8F7137]">
                  <Search className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-bold text-[#171717]">
                  {language === 'ar' ? 'لم يتم العثور على نتائج مطابقة لجميع الفلاتر' : 'No Lebanese creations matched your search'}
                </h3>
                <p className="text-xs text-[#737373]">
                  {language === 'ar' ? 'جرب البحث عن كلمة أخرى أو تصفح الأقسام المختلفة.' : 'Try clearing your search keyword or switching territory/category filters.'}
                </p>
                <button
                  onClick={() => {
                    setSelectedCategory('all');
                    resetFilters();
                  }}
                  className="px-6 py-2.5 bg-[#171717] hover:bg-[#8F7137] text-white font-bold uppercase text-xs tracking-widest cursor-pointer rounded-lg transition-colors"
                >
                  {language === 'ar' ? 'عرض جميع المنتجات اللبنانية' : 'Show All Lebanese Products'}
                </button>
              </div>
            )}
          </div>
        )}

      </div>

      {/* Bottom Custom Divs / Banners */}
      <CustomBlocksRenderer page="products" position="bottom" />

    </div>
  );
};
