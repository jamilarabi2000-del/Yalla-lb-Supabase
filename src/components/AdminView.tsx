import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, Box, ClipboardList, FileText, LayoutDashboard, Package, Search, ShieldCheck, Store, Users, Bell, Save, Eye, EyeOff, Trash2, Plus, RefreshCw, PanelsTopLeft } from 'lucide-react';
import { useShop } from '../context/ShopContext';
import { supabase } from '../lib/supabase';
import { EcommerceOverview } from './admin/EcommerceOverview';
import { SalesAnalyticsView } from './admin/SalesAnalyticsView';
import { OrdersRoute } from './admin/routes/OrdersRoute';
import { SellersView } from './admin/SellersView';
import { CustomersView } from './admin/CustomersView';
import { ReviewsManager } from './admin/ReviewsManager';
import { SearchAnalyticsView } from './admin/SearchAnalyticsView';
import { DiscountsManager } from './admin/DiscountsManager';
import { PageCMSManager } from './PageCMSManager';
import { DatabaseActivityLogs } from './admin/DatabaseActivityLogs';
import { UnifiedVisualBuilder } from './admin/UnifiedVisualBuilder';
import { getInventoryLedger, hasPermission, recordInventoryChange } from '../services/platformService';

export type AdminTab = 'dashboard'|'sales'|'products'|'inventory'|'orders'|'customers'|'sellers'|'discounts'|'reviews'|'search'|'cms'|'builder'|'analytics'|'notifications'|'security';

const tabs: { id: AdminTab; label: string; icon: React.ReactNode }[] = [
  {id:'dashboard',label:'Dashboard',icon:<LayoutDashboard/>},{id:'sales',label:'Sales',icon:<BarChart3/>},
  {id:'products',label:'Products',icon:<Package/>},{id:'inventory',label:'Inventory',icon:<Box/>},
  {id:'orders',label:'Orders',icon:<ClipboardList/>},{id:'customers',label:'Customers',icon:<Users/>},
  {id:'sellers',label:'Sellers',icon:<Store/>},{id:'discounts',label:'Coupons & Promos',icon:<FileText/>},
  {id:'reviews',label:'Reviews',icon:<Eye/>},{id:'search',label:'Search',icon:<Search/>},
  {id:'cms',label:'Storefront CMS',icon:<Save/>},{id:'builder',label:'Visual Builder',icon:<PanelsTopLeft/>},{id:'analytics',label:'Analytics',icon:<BarChart3/>},
  {id:'notifications',label:'Notifications',icon:<Bell/>},{id:'security',label:'Security & Audit',icon:<ShieldCheck/>}
];

export const ADMIN_TAB_METAS = Object.fromEntries(tabs.map(t => [t.id,{path:t.id,title:t.label,section:'Admin',desc:t.label,icon:t.id}])) as Record<AdminTab,{path:string;title:string;section:string;desc:string;icon:string}>;

function ProductsManager() {
  const shop = useShop() as any;
  const products = shop.products ?? [];
  const updateProduct = shop.updateProduct ?? (async()=>{});
  const deleteProduct = shop.deleteProduct ?? (async()=>{});
  const addProduct = shop.addProduct ?? (async()=>{});
  const showToast = shop.showToast ?? (()=>{});
  const [query,setQuery] = useState('');
  const [editing,setEditing] = useState<string|null>(null);
  const [price,setPrice] = useState(0);
  const [stock,setStock] = useState(0);
  const [showAdd,setShowAdd] = useState(false);
  const [name,setName] = useState('');
  const [newPrice,setNewPrice] = useState(1);
  const [newStock,setNewStock] = useState(0);
  const [newImage,setNewImage] = useState('');

  const filtered = useMemo(()=>products.filter((p:any)=>{
    const q=query.trim().toLowerCase();
    return !q || [p.name,p.arabicName,p.brand,p.seller,p.artisan,p.sellerItemCode,p.id,...(p.keywords||[]),...(p.arabicKeywords||[])].filter(Boolean).some((v:any)=>String(v).toLowerCase().includes(q));
  }),[products,query]);

  const save = async (id:string) => { if(price<=0 || stock<0 || !Number.isInteger(stock)){showToast('Enter a valid price and whole-number stock.','error');return;} await updateProduct(id,{priceUSD:price,stock}); setEditing(null); };
  const create = async () => { if(!name.trim() || newPrice<=0 || newStock<0){showToast('Product name, price and stock are required.','error');return;} await addProduct({name:name.trim(),arabicName:'',category:'general',artisan:'',seller:'',priceUSD:newPrice,stock:newStock,rating:0,reviewsCount:0,image:newImage||'',description:'',craftStory:'',isNewArrival:true,isFeatured:false,isBestseller:false,isPublished:false,tags:[],keywords:[],arabicKeywords:[],seoTitle:name.trim(),seoDescription:'',sellerItemCode:''}); setShowAdd(false); setName(''); setNewImage(''); };

  return <section className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-2xl font-black">Products</h2><p className="text-sm text-slate-500">Catalog, pricing, publishing, SEO and seller ownership.</p></div><button onClick={()=>setShowAdd(true)} className="px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-bold flex gap-2 items-center"><Plus className="w-4 h-4"/>Add product</button></div>
    <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search Arabic, English, SKU, barcode, brand, seller, keywords..." className="w-full pl-10 pr-4 py-3 rounded-2xl border border-slate-200 bg-white"/></div>
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{filtered.map((p:any)=><article key={p.id} className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3"><div className="flex gap-3"><div className="w-20 h-20 rounded-xl bg-slate-50 overflow-hidden shrink-0">{p.image&&<img src={p.image} alt={p.name} className="w-full h-full object-contain"/>}</div><div className="min-w-0"><h3 className="font-bold truncate">{p.name}</h3><p className="text-xs text-slate-500 truncate">{p.arabicName}</p><p className="text-xs text-indigo-600 truncate">{p.brand||p.seller||p.artisan||'Unassigned seller'}</p><p className="text-[10px] text-slate-400 font-mono truncate">{p.sellerItemCode||p.id}</p></div></div>
      {editing===p.id?<div className="grid grid-cols-2 gap-2"><input type="number" min="0.01" value={price} onChange={e=>setPrice(Number(e.target.value))} className="px-2 py-2 border rounded-lg"/><input type="number" min="0" value={stock} onChange={e=>setStock(Number(e.target.value))} className="px-2 py-2 border rounded-lg"/><button onClick={()=>save(p.id)} className="px-2 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold">Save</button><button onClick={()=>setEditing(null)} className="px-2 py-2 rounded-lg bg-slate-100 text-xs font-bold">Cancel</button></div>:<div className="flex items-center justify-between"><div><div className="font-black">${Number(p.priceUSD||0).toFixed(2)}</div><div className="text-xs text-slate-500">Stock: {p.stock}</div></div><div className="flex gap-1"><button title={p.isPublished===false?'Publish':'Unpublish'} onClick={()=>updateProduct(p.id,{isPublished:p.isPublished===false})} className="p-2 rounded-lg hover:bg-slate-100">{p.isPublished===false?<Eye className="w-4 h-4"/>:<EyeOff className="w-4 h-4"/>}</button><button onClick={()=>{setEditing(p.id);setPrice(Number(p.priceUSD||0));setStock(Number(p.stock||0));}} className="px-2 py-1 rounded-lg bg-slate-100 text-xs font-bold">Edit</button><button onClick={()=>deleteProduct(p.id)} className="p-2 rounded-lg text-rose-600 hover:bg-rose-50"><Trash2 className="w-4 h-4"/></button></div></div>}</article>)}</div>
    {showAdd&&<div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"><div className="bg-white rounded-3xl p-6 w-full max-w-lg space-y-4"><h3 className="text-xl font-black">Create product draft</h3><input value={name} onChange={e=>setName(e.target.value)} placeholder="Product name" className="w-full px-3 py-2 border rounded-xl"/><div className="grid grid-cols-2 gap-2"><input type="number" min="0.01" value={newPrice} onChange={e=>setNewPrice(Number(e.target.value))} className="px-3 py-2 border rounded-xl"/><input type="number" min="0" value={newStock} onChange={e=>setNewStock(Number(e.target.value))} className="px-3 py-2 border rounded-xl"/></div><input value={newImage} onChange={e=>setNewImage(e.target.value)} placeholder="Primary image URL" className="w-full px-3 py-2 border rounded-xl"/><div className="flex justify-end gap-2"><button onClick={()=>setShowAdd(false)} className="px-4 py-2 rounded-xl bg-slate-100">Cancel</button><button onClick={create} className="px-4 py-2 rounded-xl bg-slate-900 text-white font-bold">Create draft</button></div></div></div>}
  </section>;
}

function InventoryManager(){
 const shop=useShop() as any; const products=shop.products??[]; const [ledger,setLedger]=useState<any[]>([]); const [productId,setProductId]=useState(''); const [qty,setQty]=useState(0); const [reason,setReason]=useState('adjustment');
 const refresh=async()=>setLedger(await getInventoryLedger()); useEffect(()=>{refresh().catch(console.error)},[]);
 const adjust=async()=>{if(!productId||!qty)return; await recordInventoryChange({productId,quantityChange:qty,reason}); setQty(0); await refresh();};
 return <section className="space-y-5"><div><h2 className="text-2xl font-black">Inventory Ledger</h2><p className="text-sm text-slate-500">Opening stock + purchases + returns − sales − damage ± adjustments.</p></div><div className="bg-white border rounded-2xl p-4 grid md:grid-cols-4 gap-3"><select value={productId} onChange={e=>setProductId(e.target.value)} className="px-3 py-2 border rounded-xl md:col-span-2"><option value="">Select product</option>{products.map((p:any)=><option key={p.id} value={p.id}>{p.name} — {p.stock}</option>)}</select><input type="number" value={qty} onChange={e=>setQty(Number(e.target.value))} placeholder="Change" className="px-3 py-2 border rounded-xl"/><select value={reason} onChange={e=>setReason(e.target.value)} className="px-3 py-2 border rounded-xl"><option>adjustment</option><option>purchase</option><option>return</option><option>damage</option><option>sale</option><option>transfer</option></select><button onClick={adjust} className="md:col-span-4 px-4 py-2 rounded-xl bg-slate-900 text-white font-bold">Post inventory movement</button></div><div className="bg-white border rounded-2xl overflow-auto"><table className="w-full text-sm"><thead><tr className="text-left bg-slate-50"><th className="p-3">Time</th><th className="p-3">Product</th><th className="p-3">Change</th><th className="p-3">Reason</th><th className="p-3">Reference</th></tr></thead><tbody>{ledger.map(r=><tr key={r.id} className="border-t"><td className="p-3">{new Date(r.created_at).toLocaleString()}</td><td className="p-3 font-mono text-xs">{r.product_id}</td><td className={`p-3 font-black ${r.quantity_change>0?'text-emerald-600':'text-rose-600'}`}>{r.quantity_change>0?'+':''}{r.quantity_change}</td><td className="p-3">{r.reason}</td><td className="p-3 text-xs text-slate-500">{r.reference_type||'—'}</td></tr>)}</tbody></table></div></section>
}

function NotificationsManager(){ const [items,setItems]=useState<any[]>([]); const refresh=async()=>{const {data,error}=await supabase.from('notifications').select('*').order('created_at',{ascending:false}).limit(100);if(error)throw error;setItems(data||[])}; useEffect(()=>{refresh().catch(console.error)},[]); return <section className="space-y-4"><div><h2 className="text-2xl font-black">Notifications</h2><p className="text-sm text-slate-500">Central customer, seller and system notification stream.</p></div><div className="bg-white border rounded-2xl divide-y">{items.map(n=><div key={n.id} className="p-4"><div className="flex justify-between gap-3"><div><b>{n.title}</b><p className="text-sm text-slate-600">{n.body}</p></div><span className="text-xs text-slate-400">{new Date(n.created_at).toLocaleString()}</span></div></div>)}{items.length===0&&<div className="p-8 text-center text-slate-500">No notifications yet.</div>}</div></section> }

export const AdminView: React.FC = () => {
 const shop=useShop() as any; const [tab,setTab]=useState<AdminTab>('dashboard'); const [allowed,setAllowed]=useState(true);
 useEffect(()=>{hasPermission('security.view').then(v=>setAllowed(v||!!shop.isAdminUser)).catch(()=>setAllowed(!!shop.isAdminUser))},[shop.isAdminUser]);
 const counts={orders:(shop.orders||[]).length,products:(shop.products||[]).length,customers:(shop.userProfiles||[]).length,sellers:(shop.sellers||[]).length};
 const content=()=>{switch(tab){
  case 'dashboard':return <EcommerceOverview onNavigateToTab={(t:any)=>setTab(t==='ecommerce'?'dashboard':t)}/>;
  case 'sales':return <SalesAnalyticsView/>;
  case 'products':return <ProductsManager/>;
  case 'inventory':return <InventoryManager/>;
  case 'orders':return <OrdersRoute/>;
  case 'customers':return <CustomersView dbUsers={shop.dbUsers||shop.userProfiles||[]}/>;
  case 'sellers':return <SellersView/>;
  case 'discounts':return <DiscountsManager initialTab="rules"/>;
  case 'reviews':return <ReviewsManager products={shop.products||[]}/>;
  case 'search':return <SearchAnalyticsView/>;
  case 'cms':return <PageCMSManager initialTab="home"/>;
  case 'builder':return <UnifiedVisualBuilder/>;
  case 'analytics':return <SalesAnalyticsView/>;
  case 'notifications':return <NotificationsManager/>;
  case 'security':return allowed?<DatabaseActivityLogs/>:<div className="p-8 bg-white rounded-2xl border text-center text-rose-600">Security logs require security.view permission.</div>;
 }};
 return <div className="min-h-screen bg-slate-50 text-slate-900 flex"><aside className="w-64 shrink-0 bg-slate-950 text-white hidden lg:flex flex-col sticky top-0 h-screen"><div className="p-5 border-b border-white/10"><div className="font-black text-xl">Yalla</div><div className="text-xs text-slate-400">Marketplace Control Center</div></div><nav className="p-3 space-y-1 overflow-y-auto">{tabs.map(t=><button key={t.id} onClick={()=>setTab(t.id)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-left ${tab===t.id?'bg-white text-slate-950':'text-slate-300 hover:bg-white/10'}`}><span className="w-4 h-4">{t.icon}</span><span>{t.label}</span>{t.id==='orders'&&<span className="ml-auto text-[10px] opacity-70">{counts.orders}</span>}{t.id==='products'&&<span className="ml-auto text-[10px] opacity-70">{counts.products}</span>}</button>)}</nav><button onClick={shop.goBack} className="m-3 mt-auto px-3 py-2 rounded-xl bg-white/10 text-sm font-bold">Back to Storefront</button></aside><div className="flex-1 min-w-0"><header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b px-4 sm:px-6 py-3 flex items-center gap-3"><div className="lg:hidden flex gap-1 overflow-x-auto">{tabs.slice(0,8).map(t=><button key={t.id} onClick={()=>setTab(t.id)} className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap ${tab===t.id?'bg-slate-900 text-white':'bg-slate-100'}`}>{t.label}</button>)}</div><div className="ml-auto flex items-center gap-2"><span className="hidden sm:inline text-xs text-slate-500">Supabase Control Plane</span><button onClick={()=>window.location.reload()} className="p-2 rounded-xl hover:bg-slate-100" title="Refresh"><RefreshCw className="w-4 h-4"/></button></div></header><main className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto">{content()}</main></div></div>;
};

export default AdminView;
