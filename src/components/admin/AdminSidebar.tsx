import React, { useRef, useEffect } from 'react';
import { ArrowLeft, Eye, LogOut, Zap, PanelsTopLeft, Box, BarChart3, Bell, Database } from 'lucide-react';
import { useShop } from '../../context/ShopContext';

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
  | 'db_logs'
  | 'inventory'
  | 'builder'
  | 'analytics'
  | 'notifications'
  | 'security';

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

  useEffect(() => {
    if (navScrollRef.current) {
      const activeEl = navScrollRef.current.querySelector(`#admin-menu-${currentTab}`);
      if (activeEl) activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [currentTab]);

  const storeOperationsItems = [
    { id: 'ecommerce' as AdminMenuTab, label: 'eCommerce', icon: '📊' },
    { id: 'sales' as AdminMenuTab, label: 'Sales Analytics', icon: '📈' },
    { id: 'orders' as AdminMenuTab, label: 'Orders', icon: '📦', badge: ordersCount },
    { id: 'products' as AdminMenuTab, label: 'Products', icon: '🏷️', badge: productsCount },
    { id: 'categories' as AdminMenuTab, label: 'Categories & Details', icon: '📁', badge: categoriesCount },
    { id: 'sellers' as AdminMenuTab, label: 'Sellers & Bulk Import', icon: '🏪' },
    { id: 'discounts' as AdminMenuTab, label: 'Discounts & Promos', icon: '🏷️' },
    { id: 'bundles' as AdminMenuTab, label: 'Bundles & Combo Deals', icon: '🎁' },
    { id: 'customers' as AdminMenuTab, label: 'Customers', icon: '👥', badge: customersCount },
    { id: 'active_carts' as AdminMenuTab, label: 'Active Carts', icon: '🛒', badge: activeCartsCount },
    { id: 'reviews' as AdminMenuTab, label: 'Customer Reviews', icon: '⭐' },
    { id: 'search_analytics' as AdminMenuTab, label: 'Search Trends', icon: '🔍' }
  ];

  const pageContentItems = [
    { id: 'pages_cms' as AdminMenuTab, label: 'All Pages CMS Studio', icon: '🎛️', tag: 'Studio' },
    { id: 'page_home' as AdminMenuTab, label: 'Home Page', icon: '🏠' },
    { id: 'page_products' as AdminMenuTab, label: 'Catalog Page', icon: '🛍️' },
    { id: 'page_detail' as AdminMenuTab, label: 'Product Details', icon: '🔍' },
    { id: 'page_checkout' as AdminMenuTab, label: 'Checkout Page', icon: '💳' },
    { id: 'page_account' as AdminMenuTab, label: 'Account Page', icon: '👤' },
    { id: 'page_news' as AdminMenuTab, label: 'News & Stories', icon: '📰' },
    { id: 'page_navbar' as AdminMenuTab, label: 'Navbar & Header', icon: '🧭' },
    { id: 'page_footer' as AdminMenuTab, label: 'Footer & Contact', icon: '🦶' },
    { id: 'page_custom_blocks' as AdminMenuTab, label: 'Custom Divs & Banners', icon: '🧱' },
    { id: 'page_visibility' as AdminMenuTab, label: 'Section Visibility', icon: '👁️' },
    { id: 'page_seo' as AdminMenuTab, label: 'Global SEO', icon: '🔍' }
  ];

  const renderItem = (item: { id: AdminMenuTab; label: string; icon: string; badge?: number; tag?: string }, compact = false) => {
    const isActive = currentTab === item.id;
    return (
      <button key={item.id} id={`admin-menu-${item.id}`} onClick={() => { onSelectTab(item.id); onCloseMobile?.(); }} className={`w-full flex items-center justify-between px-3 ${compact ? 'py-2' : 'py-2.5'} rounded-xl text-[13px] font-medium transition-all cursor-pointer group text-left ${isActive ? 'bg-indigo-50/90 text-indigo-700 font-bold shadow-xs border-l-3 border-indigo-600' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'}`}>
        <div className="flex items-center gap-2.5 min-w-0"><span className="text-base select-none shrink-0">{item.icon}</span><span className={`truncate ${isActive ? 'text-indigo-900 font-bold' : 'text-slate-700 group-hover:text-slate-900'}`}>{item.label}</span></div>
        {item.badge !== undefined && <span className={`px-2 py-0.5 rounded-full text-[10px] font-black shrink-0 ${isActive ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white'}`}>{item.badge}</span>}
        {item.tag && <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider shrink-0 ${isActive ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{item.tag}</span>}
      </button>
    );
  };

  return (
    <>
      {isOpenMobile && <div onClick={onCloseMobile} className="fixed inset-0 bg-slate-900/60 z-40 lg:hidden backdrop-blur-xs transition-opacity" />}
      <aside className={`fixed top-0 bottom-0 left-0 z-50 w-72 h-screen max-h-screen bg-white border-r border-slate-200/80 flex flex-col justify-between py-4 px-3 transition-transform duration-200 ease-in-out lg:translate-x-0 lg:sticky lg:top-0 lg:h-screen lg:shrink-0 shadow-sm ${isOpenMobile ? 'translate-x-0 shadow-2xl ring-1 ring-slate-900/10' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden space-y-3">
          <div className="flex items-center gap-3 px-2 pt-1 pb-1 flex-shrink-0"><div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-700 to-indigo-500 flex items-center justify-center text-white font-black text-base tracking-wider shadow-md shadow-indigo-500/25 ring-2 ring-indigo-100">PA</div><div className="min-w-0 flex-1"><div className="flex items-center gap-1.5"><h1 className="text-base font-extrabold text-slate-900 tracking-tight leading-tight truncate">PlainAdmin</h1><span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100/80">PRO</span></div><div className="flex items-center gap-1.5 mt-0.5"><span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" /></span><span className="text-[11px] font-bold text-emerald-600 tracking-tight">Supabase Connected</span></div></div></div>
          <hr className="border-slate-100 mx-1 flex-shrink-0" />
          <div ref={navScrollRef} id="admin-sidebar-nav" className="flex-1 min-h-0 overflow-y-scroll space-y-4.5 pr-3 -mr-3 overscroll-contain focus:outline-none scroll-smooth pb-4" style={{ scrollbarWidth: 'thin', scrollbarColor: '#64748b #f1f5f9' }}>
            <style>{`#admin-sidebar-nav { scrollbar-gutter: stable; } #admin-sidebar-nav::-webkit-scrollbar { width: 12px; } #admin-sidebar-nav::-webkit-scrollbar-track { background: #f1f5f9; border-radius: 9999px; } #admin-sidebar-nav::-webkit-scrollbar-thumb { background: #64748b; border-radius: 9999px; border: 2px solid #f1f5f9; background-clip: padding-box; } #admin-sidebar-nav::-webkit-scrollbar-thumb:hover { background: #475569; }`}</style>
            <div className="space-y-1"><div className="px-3 pb-1 text-[10px] font-black tracking-widest text-slate-400 uppercase">Store Operations</div><nav className="space-y-0.5">{storeOperationsItems.map(item => renderItem(item))}</nav></div>
            <div className="space-y-1 pt-2 border-t border-slate-100"><div className="flex items-center justify-between px-3 pb-1"><span className="text-[10px] font-black tracking-widest text-slate-400 uppercase">Page Content & CMS</span><span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 border border-indigo-100/60">Live</span></div><nav className="space-y-0.5">{pageContentItems.map(item => renderItem(item, true))}</nav></div>
            <div className="space-y-1 pt-2 border-t border-slate-100"><div className="flex items-center justify-between px-3 pb-1"><span className="text-[10px] font-black tracking-widest text-slate-400 uppercase">System & Diagnostics</span><span className="flex items-center gap-1 text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100/60"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Active</span></div><nav className="space-y-0.5">{[{ id: 'db_logs' as AdminMenuTab, label: 'Database Sync & Logs', icon: '⚡', tag: 'Live' }, { id: 'inventory' as AdminMenuTab, label: 'Inventory Ledger', icon: '📦' }, { id: 'builder' as AdminMenuTab, label: 'Visual Builder', icon: '🖼️' }, { id: 'analytics' as AdminMenuTab, label: 'Analytics', icon: '📊' }, { id: 'notifications' as AdminMenuTab, label: 'Notifications', icon: '🔔' }, { id: 'security' as AdminMenuTab, label: 'Security & Audits', icon: '🛡️' }].map(item => renderItem(item, true))}</nav></div>
          </div>
        </div>
        <div className="pt-3.5 border-t border-slate-100 space-y-2 flex-shrink-0"><button onClick={() => setIsVisualEditMode(!isVisualEditMode)} className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs ${isVisualEditMode ? 'bg-amber-500 text-slate-950 ring-2 ring-amber-400/80 shadow-amber-500/20' : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200/60'}`}><div className="flex items-center gap-2"><Eye className="w-3.5 h-3.5" /><span>Visual Edit Mode</span></div><span className={`text-[9px] px-1.5 py-0.5 rounded font-black tracking-wider uppercase ${isVisualEditMode ? 'bg-slate-950 text-amber-300' : 'bg-slate-200 text-slate-600'}`}>{isVisualEditMode ? 'ON' : 'OFF'}</span></button><button onClick={goBack} className="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold tracking-wide transition-all cursor-pointer shadow-xs"><ArrowLeft className="w-3.5 h-3.5" /><span>Storefront</span></button><button onClick={() => setIsAdminUnlocked(false)} className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 text-[11px] font-semibold transition-colors cursor-pointer"><LogOut className="w-3 h-3" /><span>Lock Admin Portal</span></button></div>
      </aside>
    </>
  );
};
