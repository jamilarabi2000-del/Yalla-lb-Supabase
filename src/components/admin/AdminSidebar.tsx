import React, { useRef, useEffect } from 'react';
import { useShop } from '../../context/ShopContext';
import { 
  ArrowLeft,
  Eye,
  LogOut,
  Sparkles,
  Database
} from 'lucide-react';

export type AdminMenuTab = 
  | 'ecommerce' 
  | 'sales'
  | 'orders' 
  | 'products' 
  | 'categories' 
  | 'sellers'
  | 'discounts'
  | 'bundles'
  | 'customers' 
  | 'active_carts' 
  | 'reviews'
  | 'search_analytics'
  | 'pages_cms'
  | 'page_home'
  | 'page_products'
  | 'page_detail'
  | 'page_checkout'
  | 'page_account'
  | 'page_news'
  | 'page_navbar'
  | 'page_footer'
  | 'page_custom_blocks'
  | 'page_visibility'
  | 'page_seo'
  | 'db_logs';

interface AdminSidebarProps {
  currentTab: AdminMenuTab;
  onSelectTab: (tab: AdminMenuTab) => void;
  ordersCount: number;
  productsCount: number;
  categoriesCount: number;
  customersCount: number;
  activeCartsCount: number;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({
  currentTab,
  onSelectTab,
  ordersCount,
  productsCount,
  categoriesCount,
  customersCount,
  activeCartsCount,
  isOpenMobile = false,
  onCloseMobile
}) => {
  const { goBack, isVisualEditMode, setIsVisualEditMode, setIsAdminUnlocked } = useShop();
  const navScrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll the active menu item into view when selected or changed
  useEffect(() => {
    if (navScrollRef.current) {
      const activeEl = navScrollRef.current.querySelector(`#admin-menu-${currentTab}`);
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [currentTab]);

  const storeOperationsItems: {
    id: AdminMenuTab;
    label: string;
    icon: string;
    badge?: number;
  }[] = [
    {
      id: 'ecommerce',
      label: 'eCommerce',
      icon: '📊',
    },
    {
      id: 'sales',
      label: 'Sales Analytics',
      icon: '📈',
    },
    {
      id: 'orders',
      label: 'Orders',
      icon: '📦',
      badge: ordersCount
    },
    {
      id: 'products',
      label: 'Products',
      icon: '🏷️',
      badge: productsCount
    },
    {
      id: 'categories',
      label: 'Categories & Details',
      icon: '📁',
      badge: categoriesCount
    },
    {
      id: 'sellers',
      label: 'Sellers & Bulk Import',
      icon: '🏪'
    },
    {
      id: 'discounts',
      label: 'Discounts & Promos',
      icon: '🏷️'
    },
    {
      id: 'bundles',
      label: 'Bundles & Combo Deals',
      icon: '🎁'
    },
    {
      id: 'customers',
      label: 'Customers',
      icon: '👥',
      badge: customersCount
    },
    {
      id: 'active_carts',
      label: 'Active Carts',
      icon: '🛒',
      badge: activeCartsCount
    },
    {
      id: 'reviews',
      label: 'Customer Reviews',
      icon: '⭐'
    },
    {
      id: 'search_analytics',
      label: 'Search Trends',
      icon: '🔍'
    }
  ];

  const pageContentItems: {
    id: AdminMenuTab;
    label: string;
    icon: string;
    tag?: string;
  }[] = [
    {
      id: 'pages_cms',
      label: 'All Pages CMS Studio',
      icon: '🎛️',
      tag: 'Studio'
    },
    {
      id: 'page_home',
      label: 'Home Page',
      icon: '🏠',
    },
    {
      id: 'page_products',
      label: 'Catalog Page',
      icon: '🛍️',
    },
    {
      id: 'page_detail',
      label: 'Product Details',
      icon: '🔍',
    },
    {
      id: 'page_checkout',
      label: 'Checkout Page',
      icon: '💳',
    },
    {
      id: 'page_account',
      label: 'Account Page',
      icon: '👤',
    },
    {
      id: 'page_news',
      label: 'News & Stories',
      icon: '📰',
    },
    {
      id: 'page_navbar',
      label: 'Navbar & Header',
      icon: '🧭',
    },
    {
      id: 'page_footer',
      label: 'Footer & Contact',
      icon: '🦶',
    },
    {
      id: 'page_custom_blocks',
      label: 'Custom Divs & Banners',
      icon: '🧱',
    },
    {
      id: 'page_visibility',
      label: 'Section Visibility',
      icon: '👁️',
    },
    {
      id: 'page_seo',
      label: 'Global SEO',
      icon: '🔍',
    }
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpenMobile && (
        <div 
          onClick={onCloseMobile}
          className="fixed inset-0 bg-slate-900/60 z-40 lg:hidden backdrop-blur-xs transition-opacity"
        />
      )}

      <aside className={`
        fixed top-0 bottom-0 left-0 z-50 w-72 h-screen max-h-screen bg-white border-r border-slate-200/80 flex flex-col justify-between py-4 px-3
        transition-transform duration-200 ease-in-out lg:translate-x-0 lg:sticky lg:top-0 lg:h-screen lg:shrink-0 shadow-sm
        ${isOpenMobile ? 'translate-x-0 shadow-2xl ring-1 ring-slate-900/10' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Top Header & Scrollable Navigation */}
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden space-y-3">
          <div className="flex items-center gap-3 px-2 pt-1 pb-1 flex-shrink-0">
            {/* PA Logo Squircle */}
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-700 to-indigo-500 flex items-center justify-center text-white font-black text-base tracking-wider shadow-md shadow-indigo-500/25 ring-2 ring-indigo-100">
              PA
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h1 className="text-base font-extrabold text-slate-900 tracking-tight leading-tight truncate">
                  PlainAdmin
                </h1>
                <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100/80">
                  PRO
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-[11px] font-bold text-emerald-600 tracking-tight">
                  Firestore Connected
                </span>
              </div>
            </div>
          </div>

          <hr className="border-slate-100 mx-1 flex-shrink-0" />

          {/* Navigation Sections with smooth independent scroll */}
          <div 
            ref={navScrollRef}
            className="flex-1 min-h-0 overflow-y-auto space-y-4.5 pr-1.5 -mr-1.5 overscroll-contain focus:outline-none scroll-smooth pb-4"
            style={{
              scrollbarWidth: 'thin',
              scrollbarColor: '#cbd5e1 transparent'
            }}
          >
            
            {/* Section 1: Store Operations */}
            <div className="space-y-1">
              <div className="px-3 pb-1 text-[10px] font-black tracking-widest text-slate-400 uppercase">
                Store Operations
              </div>

              <nav className="space-y-0.5">
                {storeOperationsItems.map((item) => {
                  const isActive = currentTab === item.id;

                  return (
                    <button
                      key={item.id}
                      id={`admin-menu-${item.id}`}
                      onClick={() => {
                        onSelectTab(item.id);
                        if (onCloseMobile) onCloseMobile();
                      }}
                      className={`
                        w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all cursor-pointer group text-left
                        ${isActive 
                          ? 'bg-indigo-50/90 text-indigo-700 font-bold shadow-xs border-l-3 border-indigo-600' 
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                        }
                      `}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-base select-none shrink-0">{item.icon}</span>
                        <span className={`truncate ${isActive ? 'text-indigo-900 font-bold' : 'text-slate-700 group-hover:text-slate-900'}`}>
                          {item.label}
                        </span>
                      </div>

                      {item.badge !== undefined && (
                        <span className={`
                          px-2 py-0.5 rounded-full text-[10px] font-black transition-colors shrink-0
                          ${isActive 
                            ? 'bg-indigo-600 text-white' 
                            : 'bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white'
                          }
                        `}>
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Section 2: Page Content & CMS */}
            <div className="space-y-1 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between px-3 pb-1">
                <span className="text-[10px] font-black tracking-widest text-slate-400 uppercase">
                  Page Content & CMS
                </span>
                <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 border border-indigo-100/60">
                  Live
                </span>
              </div>

              <nav className="space-y-0.5">
                {pageContentItems.map((item) => {
                  const isActive = currentTab === item.id;

                  return (
                    <button
                      key={item.id}
                      id={`admin-menu-${item.id}`}
                      onClick={() => {
                        onSelectTab(item.id);
                        if (onCloseMobile) onCloseMobile();
                      }}
                      className={`
                        w-full flex items-center justify-between px-3 py-2 rounded-xl text-[13px] font-medium transition-all cursor-pointer group text-left
                        ${isActive 
                          ? 'bg-indigo-50/90 text-indigo-700 font-bold shadow-xs border-l-3 border-indigo-600' 
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                        }
                      `}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-base select-none shrink-0">{item.icon}</span>
                        <span className={`truncate ${isActive ? 'text-indigo-900 font-bold' : 'text-slate-700 group-hover:text-slate-900'}`}>
                          {item.label}
                        </span>
                      </div>

                      {item.tag && (
                        <span className={`
                          px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider shrink-0
                          ${isActive ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}
                        `}>
                          {item.tag}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Section 3: System & Diagnostics */}
            <div className="space-y-1 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between px-3 pb-1">
                <span className="text-[10px] font-black tracking-widest text-slate-400 uppercase">
                  System & Diagnostics
                </span>
                <span className="flex items-center gap-1 text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100/60">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  Active
                </span>
              </div>

              <nav className="space-y-0.5">
                <button
                  id="admin-menu-db_logs"
                  onClick={() => {
                    onSelectTab('db_logs');
                    if (onCloseMobile) onCloseMobile();
                  }}
                  className={`
                    w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all cursor-pointer group text-left
                    ${currentTab === 'db_logs' 
                      ? 'bg-indigo-50/90 text-indigo-700 font-bold shadow-xs border-l-3 border-indigo-600' 
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }
                  `}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-base select-none shrink-0">⚡</span>
                    <span className={`truncate ${currentTab === 'db_logs' ? 'text-indigo-900 font-bold' : 'text-slate-700 group-hover:text-slate-900'}`}>
                      Database Sync & Logs
                    </span>
                  </div>

                  <span className={`
                    px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider shrink-0
                    ${currentTab === 'db_logs' 
                      ? 'bg-indigo-600 text-white' 
                      : 'bg-emerald-100 text-emerald-800 group-hover:bg-indigo-600 group-hover:text-white'
                    }
                  `}>
                    Stream
                  </span>
                </button>
              </nav>
            </div>

          </div>
        </div>

        {/* Bottom Storefront & Utilities Controls */}
        <div className="pt-3.5 border-t border-slate-100 space-y-2 flex-shrink-0">
          {/* Visual Edit Mode Toggle */}
          <button
            onClick={() => setIsVisualEditMode(!isVisualEditMode)}
            className={`
              w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs
              ${isVisualEditMode 
                ? 'bg-amber-500 text-slate-950 ring-2 ring-amber-400/80 shadow-amber-500/20' 
                : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200/60'
              }
            `}
          >
            <div className="flex items-center gap-2">
              <Eye className="w-3.5 h-3.5" />
              <span>Visual Edit Mode</span>
            </div>
            <span className={`text-[9px] px-1.5 py-0.5 rounded font-black tracking-wider uppercase ${isVisualEditMode ? 'bg-slate-950 text-amber-300' : 'bg-slate-200 text-slate-600'}`}>
              {isVisualEditMode ? 'ON' : 'OFF'}
            </span>
          </button>

          {/* Return to Storefront */}
          <button
            onClick={goBack}
            className="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold tracking-wide transition-all cursor-pointer shadow-xs"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Storefront</span>
          </button>

          {/* Lock / Exit Admin */}
          <button
            onClick={() => setIsAdminUnlocked(false)}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 text-[11px] font-semibold transition-colors cursor-pointer"
          >
            <LogOut className="w-3 h-3" />
            <span>Lock Admin Portal</span>
          </button>
        </div>
      </aside>
    </>
  );
};
