import React,{useEffect,useState}from'react';
import{BarChart3,Box,ClipboardList,FileText,LayoutDashboard,Package,Search,Store,Users,Bell,Eye,EyeOff,PanelsTopLeft,FolderTree,ShoppingCart,Layers,Home,ShoppingBag,CreditCard,UserRound,Newspaper,Navigation,Blocks,Settings,Database}from'lucide-react';
import{useShop}from'../context/ShopContext';
import{EcommerceOverview}from'./admin/EcommerceOverview';
import{SalesAnalyticsView}from'./admin/SalesAnalyticsView';
import{OrdersRoute}from'./admin/routes/OrdersRoute';
import{SellersView}from'./admin/SellersView';
import{CustomersView}from'./admin/CustomersView';
import{ReviewsManager}from'./admin/ReviewsManager';
import{SearchAnalyticsView}from'./admin/SearchAnalyticsView';
import{DiscountsManager}from'./admin/DiscountsManager';
import{ProductBundlesManager}from'./admin/ProductBundlesManager';
import{ActiveCartsView}from'./admin/ActiveCartsView';
import{CategoriesDetailsView}from'./admin/CategoriesDetailsView';
import{PageCMSManager}from'./PageCMSManager';
import{DatabaseActivityLogs}from'./admin/DatabaseActivityLogs';
import{UnifiedVisualBuilder}from'./admin/UnifiedVisualBuilder';
import{InventoryLedgerView}from'./admin/InventoryLedgerView';
import{NotificationsView}from'./admin/NotificationsView';
import{hasPermission}from'../services/platformService';
import AdminProductManager from'./admin/AdminProductManager';
export type AdminTab='dashboard'|'sales'|'orders'|'products'|'categories'|'sellers'|'discounts'|'bundles'|'customers'|'active_carts'|'reviews'|'search'|'pages_cms'|'page_home'|'page_products'|'page_detail'|'page_checkout'|'page_account'|'page_news'|'page_navbar'|'page_footer'|'page_custom_blocks'|'page_visibility'|'page_seo'|'inventory'|'builder'|'analytics'|'notifications'|'security';
type Nav={id:AdminTab;label:string;icon:React.ReactNode;section:string};
const tabs:Nav[]=[
{id:'dashboard',label:'eCommerce Analytics',icon:<LayoutDashboard/>,section:'Store Dashboard'},
{id:'sales',label:'Sales Analytics & Reports',icon:<BarChart3/>,section:'Store Dashboard'},
{id:'orders',label:'Orders & Courier Dispatch',icon:<ClipboardList/>,section:'Store Operations'},
{id:'products',label:'Products & Inventory Catalog',icon:<Package/>,section:'Store Operations'},
{id:'categories',label:'Categories & Details',icon:<FolderTree/>,section:'Store Operations'},
{id:'sellers',label:'Sellers & Bulk Import',icon:<Store/>,section:'Store Operations'},
{id:'discounts',label:'Discounts & Promo Codes',icon:<FileText/>,section:'Store Operations'},
{id:'bundles',label:'Bundles & Combo Deals',icon:<Layers/>,section:'Store Operations'},
{id:'customers',label:'Customer Directory & Accounts',icon:<Users/>,section:'Store Operations'},
{id:'active_carts',label:'Active Shopping Carts',icon:<ShoppingCart/>,section:'Store Operations'},
{id:'reviews',label:'Customer Reviews & Replies',icon:<Eye/>,section:'Store Operations'},
{id:'search',label:'Search Trends & Analytics',icon:<Search/>,section:'Store Operations'},
{id:'pages_cms',label:'All Pages CMS Studio',icon:<PanelsTopLeft/>,section:'Content Management'},
{id:'page_home',label:'Home Page CMS',icon:<Home/>,section:'Content Management'},
{id:'page_products',label:'Products Catalog CMS',icon:<ShoppingBag/>,section:'Content Management'},
{id:'page_detail',label:'Product Detail CMS',icon:<Package/>,section:'Content Management'},
{id:'page_checkout',label:'Checkout & Delivery CMS',icon:<CreditCard/>,section:'Content Management'},
{id:'page_account',label:'Account Page CMS',icon:<UserRound/>,section:'Content Management'},
{id:'page_news',label:'News & Stories CMS',icon:<Newspaper/>,section:'Content Management'},
{id:'page_navbar',label:'Navbar & Announcement CMS',icon:<Navigation/>,section:'Content Management'},
{id:'page_footer',label:'Footer & Support CMS',icon:<FileText/>,section:'Content Management'},
{id:'page_custom_blocks',label:'Custom Divs & Banners CMS',icon:<Blocks/>,section:'Content Management'},
{id:'page_visibility',label:'Section Visibility CMS',icon:<EyeOff/>,section:'Content Management'},
{id:'page_seo',label:'Global SEO & Metadata',icon:<Settings/>,section:'Content Management'},
{id:'inventory',label:'Inventory Ledger',icon:<Box/>,section:'System & Audits'},
{id:'builder',label:'Visual Builder',icon:<PanelsTopLeft/>,section:'System & Audits'},
{id:'analytics',label:'Analytics',icon:<BarChart3/>,section:'System & Audits'},
{id:'notifications',label:'Notifications',icon:<Bell/>,section:'System & Audits'},
{id:'security',label:'Database Sync Flow & Logs',icon:<Database/>,section:'System & Audits'}];
export const ADMIN_TAB_METAS=Object.fromEntries(tabs.map(t=>[t.id,{path:t.id,title:t.label,section:t.section,desc:t.label,icon:t.id}])) as Record<AdminTab,{path:string;title:string;section:string;desc:string;icon:string}>;
const cms:Record<string,string>={pages_cms:'home',page_home:'home',page_products:'productsPage',page_detail:'productDetailPage',page_checkout:'checkoutPage',page_account:'accountPage',page_news:'newsSection',page_navbar:'navbar',page_footer:'footer',page_custom_blocks:'customBlocks',page_visibility:'visibility',page_seo:'seo'};
export const AdminView:React.FC=()=>{const shop=useShop()as any;const[tab,setTab]=useState<AdminTab>('dashboard');const[security,setSecurity]=useState(false);useEffect(()=>{hasPermission('security.view').then(v=>setSecurity(v||!!shop.isAdminUser)).catch(()=>setSecurity(!!shop.isAdminUser))},[shop.isAdminUser]);const content=()=>{switch(tab){case'dashboard':return <EcommerceOverview onNavigateToTab={(t:any)=>setTab(t==='ecommerce'?'dashboard':t)}/>;case'sales':case'analytics':return <SalesAnalyticsView/>;case'orders':return <OrdersRoute/>;case'products':return <AdminProductManager/>;case'categories':return <CategoriesDetailsView/>;case'sellers':return <SellersView/>;case'discounts':return <DiscountsManager initialTab="rules"/>;case'bundles':return <ProductBundlesManager/>;case'customers':return <CustomersView dbUsers={shop.dbUsers||shop.userProfiles||[]}/>;case'active_carts':return <ActiveCartsView/>;case'reviews':return <ReviewsManager products={shop.products||[]}/>;case'search':return <SearchAnalyticsView/>;case'builder':return <UnifiedVisualBuilder/>;case'inventory':return <InventoryLedgerView/>;case'notifications':return <NotificationsView/>;case'security':return security?<DatabaseActivityLogs/>:<div className="p-8 bg-white rounded-2xl border text-center text-rose-600">Security logs require security.view permission.</div>;case'pages_cms':case'page_home':case'page_products':case'page_detail':case'page_checkout':case'page_account':case'page_news':case'page_navbar':case'page_footer':case'page_custom_blocks':case'page_visibility':case'page_seo':return <PageCMSManager initialTab={cms[tab]||'home'}/>;default:return <div className="bg-white border rounded-2xl p-8"><h2 className="text-2xl font-black">{tabs.find(x=>x.id===tab)?.label}</h2><p className="text-slate-500 mt-2">Supabase-backed administration module.</p></div>}};const sections=[...new Set(tabs.map(t=>t.section))];return <div className="min-h-screen bg-slate-50 flex text-slate-900"><aside className="hidden lg:flex w-72 shrink-0 bg-white border-r sticky top-0 h-screen flex-col"><div className="p-5 border-b"><div className="text-xl font-black">Yalla</div><div className="text-xs text-slate-500">Marketplace Control Center · Supabase</div></div><nav className="p-3 overflow-y-auto space-y-5">{sections.map(section=><div key={section}><div className="px-3 mb-1 text-[10px] font-black uppercase tracking-wider text-slate-400">{section}</div>{tabs.filter(t=>t.section===section).map(t=><button key={t.id} onClick={()=>setTab(t.id)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-left ${tab===t.id?'bg-blue-50 text-blue-800':'text-slate-600 hover:bg-slate-50'}`}><span className="w-4">{t.icon}</span><span>{t.label}</span></button>)}</div>)}</nav><button onClick={shop.goBack} className="m-3 mt-auto px-3 py-2 rounded-xl bg-slate-100 font-bold">Back to Storefront</button></aside><main className="flex-1 min-w-0"><header className="sticky top-0 z-30 bg-white border-b p-3"><div className="lg:hidden flex gap-1 overflow-x-auto">{tabs.map(t=><button key={t.id} onClick={()=>setTab(t.id)} className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap ${tab===t.id?'bg-blue-600 text-white':'bg-slate-100'}`}>{t.label}</button>)}</div></header><div className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto">{content()}</div></main></div>};
export default AdminView;
