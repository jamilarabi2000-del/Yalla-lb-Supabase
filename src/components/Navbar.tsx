import React, { useState, useEffect } from 'react';
import { useShop } from '../context/ShopContext';
import systemLogo from '../assets/images/system_logo_1786837577985.jpg';
import { 
  ShoppingBag, 
  Heart, 
  User, 
  ShieldCheck, 
  Search, 
  Globe2, 
  Menu, 
  X, 
  MapPin,
  Clock,
  ChevronDown,
  Store
} from 'lucide-react';

export const Navbar: React.FC = () => {
  const { 
    activeTab, 
    setActiveTab, 
    currency, 
    setCurrency, 
    cartCount, 
    setIsCartOpen,
    wishlist,
    searchQuery,
    setSearchQuery,
    logSearchQuery,
    setSelectedCategory,
    language,
    setLanguage,
    t,
    isAdminUnlocked,
    isAdminUser = false,
    firebaseUser,
    user,
    siteContent,
    categories = []
  } = useShop();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);

  const showAdminTab = isAdminUser;

  // Filter out any unpublished categories and sort by displayOrder
  const sortedActiveCategories = [...categories]
    .filter(cat => cat.isPublished !== false)
    .sort((a, b) => (a.displayOrder || 99) - (b.displayOrder || 99));

  const categoriesList = [
    { id: 'all', name: t('cat_all'), icon: '✨' },
    ...sortedActiveCategories.map(cat => ({
      id: cat.id,
      name: language === 'ar' ? cat.nameAr : cat.nameEn,
      icon: cat.icon || '📦'
    }))
  ];

  // Automatically capture search queries as users type in the header (debounced)
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (trimmed.length >= 2) {
      const timer = setTimeout(() => {
        logSearchQuery(trimmed, 'navbar');
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [searchQuery, logSearchQuery]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      logSearchQuery(searchQuery.trim(), 'navbar');
    }
    if (activeTab !== 'products') {
      setActiveTab('products');
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-white/95 backdrop-blur-md border-b border-[#E5E5E5] shadow-2xs">
      {/* Top Announcement Ticker Bar */}
      {siteContent?.visibility?.announcementTicker !== false && (siteContent?.navbar?.announcementTicker || siteContent?.navbar?.announcementTickerArabic) && (
        <div className="bg-[#171717] text-[#F8F8F6] text-[11px] sm:text-xs py-2 px-4 text-center font-bold tracking-wider flex items-center justify-center gap-2 overflow-hidden border-b border-[#8F7137]/30">
          <span className="inline-block text-[#B89753]">✨</span>
          <span className="truncate">
            {language === 'ar' ? (siteContent.navbar.announcementTickerArabic || siteContent.navbar.announcementTicker) : (siteContent.navbar.announcementTicker || siteContent.navbar.announcementTickerArabic)}
          </span>
          <span className="inline-block text-[#B89753]">✨</span>
        </div>
      )}

      {/* Main Navbar */}
      <div className="max-w-screen-2xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 sm:h-16 lg:h-18 gap-2 sm:gap-4">
          {/* Logo & Brand */}
          <div 
            className="flex items-center gap-2 sm:gap-3 cursor-pointer group py-1 flex-shrink-0 select-none" 
            onClick={() => { setActiveTab('home'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
          >
            <div className="relative flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#F8F8F6] overflow-hidden border border-[#E5E5E5] shadow-2xs group-hover:border-[#B89753] transition-all flex-shrink-0">
              <img 
                src={siteContent?.navbar?.logoUrl || systemLogo} 
                alt={siteContent?.navbar?.brandName || "Logo"} 
                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                referrerPolicy="no-referrer"
              />
              <span className="absolute -bottom-0.5 -right-0.5 sm:-bottom-1 sm:-right-1 flex h-2.5 w-2.5 sm:h-3 sm:w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 sm:h-3 sm:w-3 bg-emerald-500"></span>
              </span>
            </div>
            <div className="flex items-center">
              <span className="text-base sm:text-lg lg:text-xl font-bold tracking-tight text-[#171717] uppercase font-sans whitespace-nowrap leading-none">
                {siteContent.navbar?.brandName || 'Yalla'}
              </span>
            </div>
          </div>

          {/* Desktop Search Bar */}
          <form 
            onSubmit={handleSearchSubmit}
            className="hidden md:flex flex-1 max-w-md items-center relative group"
          >
            <Search className={`absolute ${language === 'ar' ? 'right-3.5' : 'left-3.5'} w-4 h-4 text-[#737373] group-focus-within:text-[#8F7137] transition-colors pointer-events-none`} />
            <input
              id="desktop-search-input"
              type="text"
              placeholder={
                language === 'ar'
                  ? (siteContent?.navbar?.searchPlaceholderArabic || siteContent?.navbar?.searchPlaceholder || t('searchPlaceholder'))
                  : (siteContent?.navbar?.searchPlaceholder || t('searchPlaceholder'))
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full ${language === 'ar' ? 'pr-10 pl-16 text-right' : 'pl-10 pr-16 text-left'} py-2.5 text-xs font-normal bg-[#F8F8F6] hover:bg-slate-100/90 text-[#171717] placeholder:text-[#737373] rounded-xl border border-[#E5E5E5] focus:border-[#8F7137] focus:bg-white focus:ring-2 focus:ring-[#8F7137]/15 focus:outline-none transition-all shadow-2xs`}
            />
            {searchQuery && (
              <button 
                type="button" 
                onClick={() => setSearchQuery('')}
                className={`absolute ${language === 'ar' ? 'left-2.5' : 'right-2.5'} px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#737373] hover:text-[#171717] bg-slate-200/70 hover:bg-slate-200 rounded-md transition-colors cursor-pointer`}
              >
                {t('clear')}
              </button>
            )}
          </form>

          {/* Nav Links & Actions */}
          <nav className="hidden lg:flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider">
            <button
              id="nav-home-btn"
              onClick={() => setActiveTab('home')}
              className={`px-3 py-2 rounded-lg transition-all cursor-pointer ${
                activeTab === 'home' 
                  ? 'text-[#171717] bg-[#F8F8F6] border border-[#E5E5E5]' 
                  : 'text-[#737373] hover:text-[#171717] hover:bg-[#F8F8F6]'
              }`}
            >
              {t('home')}
            </button>
            <div className="relative">
              <button
                id="nav-categories-dropdown-btn"
                onClick={() => setCategoryDropdownOpen(!categoryDropdownOpen)}
                className="px-3 py-2 rounded-lg transition-all cursor-pointer text-[#737373] hover:text-[#171717] hover:bg-[#F8F8F6] flex items-center gap-1.5"
              >
                <span>{t('categories')}</span>
                <ChevronDown className={`w-3.5 h-3.5 text-[#8F7137] transition-transform duration-200 ${categoryDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {categoryDropdownOpen && (
                <div className="absolute top-full left-0 mt-2 w-64 bg-white rounded-xl shadow-lg border border-[#E5E5E5] py-2 z-50 max-h-[70vh] overflow-y-auto animate-in fade-in slide-in-from-top-2">
                  <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[#737373] border-b border-[#E5E5E5] sticky top-0 bg-white z-10">
                    {t('categories')}
                  </div>
                  {categoriesList.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => {
                        setSelectedCategory(cat.id);
                        setActiveTab('products');
                        setCategoryDropdownOpen(false);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="w-full text-left px-4 py-2 text-xs font-semibold text-[#171717] hover:bg-[#F8F8F6] hover:text-[#8F7137] flex items-center gap-2.5 transition-colors cursor-pointer"
                    >
                      <span className="text-sm">{cat.icon}</span>
                      <span>{cat.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              id="nav-products-btn"
              onClick={() => setActiveTab('products')}
              className={`px-3 py-2 rounded-lg transition-all cursor-pointer ${
                activeTab === 'products' 
                  ? 'text-[#171717] bg-[#F8F8F6] border border-[#E5E5E5]' 
                  : 'text-[#737373] hover:text-[#171717] hover:bg-[#F8F8F6]'
              }`}
            >
              {t('products')}
            </button>
            <button
              id="nav-checkout-btn"
              onClick={() => setActiveTab('checkout')}
              className={`px-3 py-2 rounded-lg transition-all cursor-pointer ${
                activeTab === 'checkout' 
                  ? 'text-[#171717] bg-[#F8F8F6] border border-[#E5E5E5]' 
                  : 'text-[#737373] hover:text-[#171717] hover:bg-[#F8F8F6]'
              }`}
            >
              {t('checkout')}
            </button>

            <button
              id="nav-seller-btn"
              onClick={() => setActiveTab('seller')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all cursor-pointer ${
                activeTab === 'seller' 
                  ? 'text-[#8F7137] bg-amber-50 border border-amber-300 font-bold' 
                  : 'text-[#737373] hover:text-[#8F7137] hover:bg-[#F8F8F6]'
              }`}
            >
              <Store className="w-3.5 h-3.5 text-[#8F7137]" />
              <span>{language === 'ar' ? 'بوابة البائعين' : 'Seller Portal'}</span>
            </button>

            {showAdminTab && (
              <button
                id="nav-admin-btn"
                onClick={() => setActiveTab('admin')}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all cursor-pointer ${
                  activeTab === 'admin' 
                    ? 'text-emerald-700 bg-emerald-50 border border-emerald-200' 
                    : 'text-[#737373] hover:text-emerald-700 hover:bg-[#F8F8F6]'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>{t('admin')}</span>
              </button>
            )}
          </nav>

          {/* Quick Action Icons */}
          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            {/* Arabic / English Language Toggle */}
            <button
              id="global-language-switcher-btn"
              onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
              className="flex items-center gap-1 sm:gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#F8F8F6] hover:bg-slate-200 text-[#171717] border border-[#E5E5E5] font-bold text-xs transition-colors cursor-pointer flex-shrink-0"
              title="Switch System Language / تغيير لغة النظام"
            >
              <Globe2 className="w-3.5 h-3.5 text-[#8F7137] flex-shrink-0" />
              <span className="font-semibold text-xs leading-none">{language === 'en' ? 'العربية' : 'English'}</span>
            </button>

            {/* Search Toggle on Mobile */}
            <button
              id="mobile-search-toggle-btn"
              onClick={() => setSearchOpen(!searchOpen)}
              className="md:hidden p-2 rounded-lg text-[#737373] hover:text-[#171717] hover:bg-[#F8F8F6] transition-colors flex items-center justify-center flex-shrink-0 cursor-pointer border border-[#E5E5E5]"
              aria-label="Search"
            >
              <Search className="w-4 h-4 text-[#8F7137]" />
            </button>

            {/* Wishlist Shortcut */}
            <button
              id="wishlist-shortcut-btn"
              onClick={() => setActiveTab('favorites')}
              className={`relative p-2 rounded-lg transition-colors hidden sm:flex items-center justify-center flex-shrink-0 cursor-pointer border ${
                activeTab === 'favorites' ? 'text-rose-600 bg-rose-50 border-rose-200' : 'text-[#737373] hover:text-rose-600 hover:bg-[#F8F8F6] border-[#E5E5E5]'
              }`}
              title="Saved Artisan Wishlist"
            >
              <Heart className={`w-4.5 h-4.5 ${activeTab === 'favorites' ? 'fill-rose-600' : ''}`} />
              {wishlist.length > 0 && (
                <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[16px] h-4 px-1 text-[9px] font-bold bg-[#C62828] text-white rounded-full">
                  {wishlist.length}
                </span>
              )}
            </button>

            {/* Account Shortcut */}
            <button
              id="user-profile-shortcut-btn"
              onClick={() => setActiveTab('account')}
              className={`p-2 rounded-lg transition-colors hidden sm:flex items-center justify-center flex-shrink-0 cursor-pointer border ${
                activeTab === 'account' ? 'text-[#8F7137] bg-amber-50 border-amber-200' : 'text-[#737373] hover:text-[#8F7137] hover:bg-[#F8F8F6] border-[#E5E5E5]'
              }`}
              title={firebaseUser ? `Logged in as ${firebaseUser.displayName || user.name}` : "My Lebanese Account & Orders"}
            >
              {firebaseUser?.photoURL ? (
                <img 
                  src={firebaseUser.photoURL} 
                  alt={firebaseUser.displayName || user.name} 
                  className="w-5 h-5 sm:w-5 sm:h-5 rounded-full border border-[#8F7137] object-cover" 
                  referrerPolicy="no-referrer"
                />
              ) : (
                <User className="w-4.5 h-4.5" />
              )}
            </button>

            {/* Cart Button */}
            <button
              id="open-cart-btn"
              onClick={() => setIsCartOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#171717] hover:bg-[#8F7137] text-white font-bold text-xs tracking-wider shadow-2xs transition-all cursor-pointer flex-shrink-0"
            >
              <ShoppingBag className="w-4 h-4 text-white flex-shrink-0" />
              <span className="hidden md:inline uppercase text-[11px] font-bold">{t('cartBtn')}</span>
              <span className="flex items-center justify-center min-w-[18px] h-4 px-1 text-[10px] font-bold bg-[#B89753] text-white rounded-full shadow-2xs">
                {cartCount}
              </span>
            </button>

            {/* Mobile Menu Toggle */}
            <button
              id="mobile-menu-toggle-btn"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-lg text-[#171717] hover:bg-slate-200 bg-[#F8F8F6] border border-[#E5E5E5] transition-all flex items-center justify-center cursor-pointer flex-shrink-0"
              aria-label="Toggle Navigation"
              title="Toggle Navigation Menu"
            >
              {mobileMenuOpen ? (
                <X className="w-4.5 h-4.5 text-[#171717]" strokeWidth={2.25} />
              ) : (
                <Menu className="w-4.5 h-4.5 text-[#171717]" strokeWidth={2.25} />
              )}
            </button>
          </div>

        </div>

        {/* Mobile Search Bar Expand */}
        {searchOpen && (
          <div className="md:hidden pb-3 pt-1 px-2">
            <form onSubmit={handleSearchSubmit} className="relative">
              <Search className={`absolute ${language === 'ar' ? 'right-3.5 top-3' : 'left-3.5 top-3'} w-4 h-4 text-[#8F7137]`} />
              <input
                id="mobile-search-input"
                type="text"
                placeholder={
                  language === 'ar'
                    ? (siteContent?.navbar?.searchPlaceholderArabic || siteContent?.navbar?.searchPlaceholder || t('searchPlaceholder'))
                    : (siteContent?.navbar?.searchPlaceholder || t('searchPlaceholder'))
                }
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`w-full ${language === 'ar' ? 'pr-10 pl-16 text-right' : 'pl-10 pr-16 text-left'} py-2.5 text-xs bg-[#F8F8F6] text-[#171717] rounded-xl border border-[#E5E5E5] focus:border-[#8F7137] focus:bg-white focus:ring-2 focus:ring-[#8F7137]/20 focus:outline-none shadow-2xs`}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className={`absolute ${language === 'ar' ? 'left-2.5' : 'right-2.5'} top-2 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#737373] bg-slate-200 rounded-md cursor-pointer`}
                >
                  {t('clear')}
                </button>
              )}
            </form>
          </div>
        )}

        {/* Mobile Nav Menu Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden py-4 border-t border-[#E5E5E5] bg-white rounded-b-xl px-3 space-y-2 shadow-lg">
            {/* Wishlist in Mobile Menu */}
            <button
              onClick={() => { setActiveTab('favorites'); setMobileMenuOpen(false); }}
              className={`w-full text-left px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center justify-between transition-colors ${
                activeTab === 'favorites' ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'text-[#737373] hover:bg-[#F8F8F6]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Heart className={`w-4 h-4 text-[#C62828] ${activeTab === 'favorites' ? 'fill-rose-500' : ''}`} />
                <span>{t('wishlist')}</span>
              </div>
              {wishlist.length > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700">
                  {wishlist.length}
                </span>
              )}
            </button>

            {/* Account & Orders */}
            <button
              onClick={() => { setActiveTab('account'); setMobileMenuOpen(false); }}
              className={`w-full text-left px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2.5 ${
                activeTab === 'account' ? 'bg-amber-50 text-[#171717] border border-amber-200' : 'text-[#737373] hover:bg-[#F8F8F6]'
              }`}
            >
              <User className="w-4 h-4 text-[#8F7137]" />
              <span>{t('myAccountAndOrders')}</span>
            </button>

            <div className="py-2 px-3 text-[10px] font-bold uppercase tracking-widest text-[#737373] border-t border-[#E5E5E5] mt-2">
              {t('categories')}
            </div>
            <div className="grid grid-cols-2 gap-1.5 pb-2">
              {categoriesList.map(cat => (
                <button
                  key={`mobile-cat-${cat.id}`}
                  onClick={() => {
                    setSelectedCategory(cat.id);
                    setActiveTab('products');
                    setMobileMenuOpen(false);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="text-left px-3 py-2 rounded-lg text-xs font-medium text-[#171717] hover:bg-[#F8F8F6] hover:text-[#8F7137] flex items-center gap-2 transition-colors cursor-pointer bg-[#F8F8F6] border border-[#E5E5E5]"
                >
                  <span>{cat.icon}</span>
                  <span className="truncate">{cat.name}</span>
                </button>
              ))}
            </div>

            <button
              onClick={() => { setActiveTab('checkout'); setMobileMenuOpen(false); }}
              className={`w-full text-left px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2.5 ${
                activeTab === 'checkout' ? 'bg-amber-50 text-[#171717] border border-amber-200' : 'text-[#737373] hover:bg-[#F8F8F6]'
              }`}
            >
              <ShoppingBag className="w-4 h-4 text-[#8F7137]" />
              <span>{t('checkoutAndDelivery')}</span>
            </button>

            <button
              id="nav-mobile-seller-btn"
              onClick={() => { setActiveTab('seller'); setMobileMenuOpen(false); }}
              className={`w-full text-left px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-between ${
                activeTab === 'seller' ? 'bg-amber-50 text-[#8F7137] border border-amber-300' : 'text-[#8F7137] hover:bg-[#F8F8F6]'
              }`}
            >
              <span>{language === 'ar' ? 'بوابة البائعين والتجار' : 'Seller & Merchant Portal'}</span>
              <Store className="w-4 h-4 text-[#8F7137]" />
            </button>

            {showAdminTab && (
              <button
                onClick={() => { setActiveTab('admin'); setMobileMenuOpen(false); }}
                className={`w-full text-left px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-between ${
                  activeTab === 'admin' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'text-emerald-700 hover:bg-[#F8F8F6]'
                }`}
              >
                <span>{t('adminAndArtisanPortal')}</span>
                <ShieldCheck className="w-4 h-4" />
              </button>
            )}

            <div className="pt-3 border-t border-[#E5E5E5] flex items-center justify-between px-3 text-xs text-[#737373]">
              <span className="uppercase tracking-wider text-[10px]">{t('currencyLabel')}</span>
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#F8F8F6] border border-[#E5E5E5] text-[#171717] font-mono text-xs font-bold">
                <span>{t('freshUsdOnly')}</span>
              </div>
            </div>
          </div>
        )}

      </div>
    </header>
  );
};
