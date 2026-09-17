import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, Box, ClipboardList, FileText, LayoutDashboard, Package, Search, ShieldCheck, Store, Users, Bell, Save, Eye, EyeOff, Trash2, Plus, RefreshCw, PanelsTopLeft, FolderTree } from 'lucide-react';
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
import { CategoriesDetailsView } from './admin/CategoriesDetailsView';
import { PageCMSManager } from './PageCMSManager';
import { DatabaseActivityLogs } from './admin/DatabaseActivityLogs';
import { UnifiedVisualBuilder } from './admin/UnifiedVisualBuilder';
import { getInventoryLedger, hasPermission, recordInventoryChange } from '../services/platformService';
import { supabaseProductService } from '../services/supabaseProductService';

export type AdminTab = 'dashboard'|'sales'|'products'|'inventory'|'orders'|'customers'|'sellers'|'categories'|'discounts'|'reviews'|'search'|'cms'|'builder'|'analytics'|'notifications'|'security';

const tabs: { id: AdminTab; label: string; icon: React.ReactNode }[] = [
  {id:'dashboard',label:'Dashboard',icon:<LayoutDashboard/>},{id:'sales',label:'Sales',icon:<BarChart3/>},
  {id:'products',label:'Products',icon:<Package/>},{id:'categories',label:'Categories',icon:<FolderTree/>},{id:'inventory',label:'Inventory',icon:<Box/>},
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
  const showToast = shop.showToast ?? (()=>{});
  const syncProducts = shop.syncAllProductsToDatabase ?? (async()=>{});
  const [query,setQuery] = useState('');
  const [editing,setEditing] = useState<string|null>(null);
  const [price,setPrice] = useState(0);
  const [stock,setStock] = useState(0);
  const [showAdd,setShowAdd] = useState(false);
  const [creating,setCreating] = useState(false);
  const [name,setName] = useState('');
  const [artisan,setArtisan] = useState('');
  const [origin,setOrigin] = useState('Lebanon');
  const [brand,setBrand] = useState('');
  const [description,setDescription] = useState('');
  const [craftStory,setCraftStory] = useState('');
  const [newPrice,setNewPrice] = useState(1);
  const [newStock,setNewStock] = useState(0);
  const [newImage,setNewImage] = useState('');

  const filtered = useMemo(()=>products.filter((p:any)=>{
    const q=query.trim().toLowerCase();
    return !q || [p.name,p.arabicName,p.brand,p.seller,p.artisan,p.sellerItemCode,p.id,...(p.keywords||[]),...(p.arabicKeywords||[])].filter(Boolean).some((v:any)=>String(v).toLowerCase().includes(q));
  }),[products,query]);

  const save = async (id:string) => {
    if(price<=0 || stock<0 || !Number.isInteger(stock)){showToast('Enter a valid price and whole-number stock.','error');return;}
    try { await updateProduct(id,{priceUSD:price,stock}); setEditing(null); } catch { showToast('Unable to update the product.','error'); }
  };

  const resetCreateForm = () => {
    setName(''); setArtisan(''); setOrigin('Lebanon'); setBrand(''); setDescription(''); setCraftStory(''); setNewPrice(1); setNewStock(0); setNewImage('');
  };

  const create = async () => {
    if(!name.trim() || !artisan.trim() || !origin.trim() || !brand.trim() || !description.trim() || !craftStory.trim() || !newImage.trim() || newPrice<0 || newStock<0 || !Number.isInteger(newStock)){
      showToast('Name, artisan, origin, brand, description, craft story, image, price and whole-number stock are required.','error');
      return;
    }
    setCreating(true);
    try {
      await supabaseProductService.createProduct({
        product: {
          name: name.trim(), arabic_name: '', artisan: artisan.trim(), origin: origin.trim(), brand: brand.trim(), description: description.trim(), craft_story: craftStory.trim(), image: newImage.trim(), price_usd: newPrice, stock: newStock,
          rating: 0, reviews_count: 0, is_new_arrival: true, is_featured: false, is_bestseller: false, is_published: false, publish_status: 'draft', tags: [], keywords: [], arabic_keywords: [], seo_title: name.trim(), seo_description: description.trim(),
        },
        privateData: {}, images: [{ url: newImage.trim(), media_type: 'image', display_order: 0 }],
      });
      await syncProducts(); showToast('Product draft created successfully.','success'); setShowAdd(false); resetCreateForm();
    } catch (error) { showToast(error instanceof Error ? error.message : 'Unable to create the product. No product changes were saved.','error'); }
    finally { setCreating(false); }
  };

  return <section className="space-y-5 text-slate-900">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-2xl font-black text-slate-900">Products</h2><p className="text-sm text-slate-500">Catalog, pricing, publishing, SEO and seller ownership.</p></div><button onClick={()=>setShowAdd(true)} className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold flex gap-2 items-center"><Plus className="w-4 h-4"/>Add product</button></div>
    <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search Arabic, English, SKU, barcode, brand, seller, keywords..." className="w-full pl-10 pr-4 py-3 rounded-2xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-200"/></div>
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{filtered.map((p:any)=><article key={p.id} className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3 text-slate-900"><div className="flex gap-3"><div className="w-20 h-20 rounded-xl bg-slate-50 overflow-hidden shrink-0">{p.image&&<img src={p.image} alt={p.name} className="w-full h-full object-contain"/>}</div><div className="min-w-0"><h3 className="font-bold truncate text-slate-900">{p.name}</h3><p className="text-xs text-slate-500 truncate">{p.arabicName}</p><p className="text-xs text-blue-600 truncate">{p.brand||p.seller||p.artisan||'Unassigned seller'}</p><p className="text-[10px] text-slate-400 font-mono truncate">{p.sellerItemCode||p.id}</p></div></div>
      {editing===p.id?<div className="grid grid-cols-2 gap-2"><input type="number" min="0.01" value={price} onChange={e=>setPrice(Number(e.target.value))} className="px-2 py-2 border border-slate-200 rounded-lg bg-white text-slate-900"/><input type="number" min="0" value={stock} onChange={e=>setStock(Number(e.target.value))} className="px-2 py-2 border border-slate-200 rounded-lg bg-white text-slate-900"/><button onClick={()=>save(p.id)} className="px-2 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold">Save</button><button onClick={()=>setEditing(null)} className="px-2 py-2 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold">Cancel</button></div>:<div className="flex items-center justify-between"><div><div className="font-black text-slate-900">${Number(p.priceUSD||0).toFixed(2)}</div><div className="text-xs text-slate-500">Stock: {p.stock}</div></div><div className="flex gap-1"><button title={p.isPublished===false?'Publish':'Unpublish'} onClick={()=>updateProduct(p.id,{isPublished:p.isPublished===false})} className="p-2 rounded-lg text-slate-700 hover:bg-slate-100">{p.isPublished===false?<Eye className="w-4 h-4"/>:<EyeOff className="w-4 h-4"/>}</button><button onClick={()=>{setEditing(p.id);setPrice(Number(p.priceUSD||0));setStock(Number(p.stock||0));}} className="px-2 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold">Edit</button><button onClick={()=>deleteProduct(p.id)} className="p-2 rounded-lg text-rose-600 hover:bg-rose-50"><Trash2 className="w-4 h-4"/></button></div></div>}</article>)}</div>
    {showAdd&&<div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4"><div className="bg-white text-slate-900 rounded-3xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto space-y-4"><h3 className="text-xl font-black">Create product draft</h3><div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><input value={name} onChange={e=>setName(e.target.value)} placeholder="Product name *" className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white text-slate-900"/><input value={artisan} onChange={e=>setArtisan(e.target.value)} placeholder="Artisan / workshop *" className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white text-slate-900"/><input value={origin} onChange={e=>setOrigin(e.target.value)} placeholder="Origin *" className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white text-slate-900"/><input value={brand} onChange={e=>setBrand(e.target.value)} placeholder="Brand *" className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white text-slate-900"/><input type="number" min="0" value={newPrice} onChange={e=>setNewPrice(Number(e.target.value))} placeholder="Price USD *" className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white text-slate-900"/><input type="number" min="0" value={newStock} onChange={e=>setNewStock(Number(e.target.value))} placeholder="Stock *" className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white text-slate-900"/></div><input value={newImage} onChange={e=>setNewImage(e.target.value)} placeholder="Primary image URL *" className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white text-slate-900"/><textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="Product description *" rows={3} className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white text-slate-900"/><textarea value={craftStory} onChange={e=>setCraftStory(e.target.value)} placeholder="Craft story *" rows={3} className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white text-slate-900"/><div className="flex justify-end gap-2"><button disabled={creating} onClick={()=>{setShowAdd(false);resetCreateForm();}} className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 disabled:opacity-50">Cancel</button><button disabled={creating} onClick={create} className="px-4 py-2 rounded-xl bg-blue-600 text-white font-bold disabled:opacity-50">{creating?'Creating…':'Create draft'}</button></div></div></div>}
  </section>;
}

function InventoryManager(){
 const shop=useShop() as any; const products=shop.products??[]; const [ledger,setLedger]=useState<any[]>([]); const [productId,setProductId]=useState(''); const [qty,setQty]=useState(0); const [reason,setReason]=useState('adjustment');
 const refresh=async()=>setLedger(await getInventoryLedger()); useEffect(()=>{refresh().catch(console.error)},[]);
 const adjust=async()=>{if(!productId||!qty)return; await recordInventoryChange({productId,quantityChange:qty,reason}); setQty(0); await refresh();};
 return <section className="space-y-5 text-slate-900"><div><h2 className="text-2xl font-black text-slate-900">Inventory Ledger</h2><p className="text-sm text-slate-500">Opening stock + purchases + returns − sales − damage ± adjustments.</p></div><div className="bg-white border border-slate-200 rounded-2xl p-4 grid md:grid-cols-4 gap-3"><select value={productId} onChange={e=>setProductId(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-xl bg-white text-slate-900 md:col-span-2"><option value="">Select product</option>{products.map((p:any)=><option key={p.id} value={p.id}>{p.name} — {p.stock}</option>)}</select><input type="number" value={qty} onChange={e=>setQty(Number(e.target.value))} placeholder="Change" className="px-3 py-2 border border-slate-200 rounded-xl bg-white text-slate-900"/><select value={reason} onChange={e=>setReason(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-xl bg-white text-slate-900"><option>adjustment</option><option>purchase</option><option>return</option><option>damage</option><option>sale</option><option>transfer</option></select><button onClick={adjust} className="md:col-span-4 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold">Post inventory movement</button></div><div className="bg-white border border-slate-200 rounded-2xl overflow-auto"><table className="w-full text-sm"><thead><tr className="text-left bg-slate-50"><th className="p-3 text-slate-700">Time</th><th className="p-3 text-slate-700">Product</th><th className="p-3 text-slate-700">Change</th><th className="p-3 text-slate-700">Reason</th><th className="p-3 text-slate-700">Reference</th></tr></thead><tbody>{ledger.map(r=><tr key={r.id} className="border-t border-slate-100"><td className="p-3 text-slate-700">{new Date(r.created_at).toLocaleString()}</td><td className="p-3 font-mono text-xs text-slate-700">{r.product_id}</td><td className={`p-3 font-black ${r.quantity_change>0?'text-emerald-600':'text-rose-600'}`}>{r.quantity_change>0?'+':''}{r.quantity_change}</td><td className="p-3 text-slate-700">{r.reason}</td><td className="p-3 text-xs text-slate-500">{r.reference_type||'—'}</td></tr>)}</tbody></table></div></section>
}

function NotificationsManager(){ const [items,setItems]=useState<any[]>([]); const refresh=async()=>{const {data,error}=await supabase.from('notifications').select('*').order('created_at',{ascending:false}).limit(100);if(error)throw error;setItems(data||[])}; useEffect(()=>{refresh().catch(console.error)},[]); return <section className="space-y-4 text-slate-900"><div><h2 className="text-2xl font-black text-slate-900">Notifications</h2><p className="text-sm text-slate-500">Central customer, seller and system notification stream.</p></div><div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100">{items.map(n=><div key={n.id} className="p-4"><div className="flex justify-between gap-3"><div><b className="text-slate-900">{n.title}</b><p className="text-sm text-slate-600">{n.body}</p></div><span className="text-xs text-slate-400">{new Date(n.created_at).toLocaleString()}</span></div></div>)}{items.length===0&&<div className="p-8 text-center text-slate-500">No notifications yet.</div>}</div></section> }

export const AdminView: React.FC = () => {
 const shop=useShop() as any; const [tab,setTab]=useState<AdminTab>('dashboard'); const [allowed,setAllowed]=useState(true);
 useEffect(()=>{hasPermission('security.view').then(v=>setAllowed(v||!!shop.isAdminUser)).catch(()=>setAllowed(!!shop.isAdminUser))},[shop.isAdminUser]);
 const counts={orders:(shop.orders||[]).length,products:(shop.products||[]).length,customers:(shop.userProfiles||[]).length,sellers:(shop.sellers||[]).length,categories:(shop.categories||[]).length};
 const content=()=>{switch(tab){
  case 'dashboard':return <EcommerceOverview onNavigateToTab={(t:any)=>setTab(t==='ecommerce'?'dashboard':t)}/>;
  case 'sales':return <SalesAnalyticsView/>;
  case 'products':return <ProductsManager/>;
  case 'categories':return <div className="text-slate-900"><CategoriesDetailsView/></div>;
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
  case 'security':return allowed?<DatabaseActivityLogs/>:<div className="p-8 bg-white rounded-2xl border border-slate-200 text-center text-rose-600">Security logs require security.view permission.</div>;
 }};
 return <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex"><aside className="w-64 shrink-0 bg-white text-slate-900 border-r border-slate-200 hidden lg:flex flex-col sticky top-0 h-screen"><div className="p-5 border-b border-slate-200"><div className="font-black text-xl text-slate-900">Yalla</div><div className="text-xs text-slate-500">Marketplace Control Center</div></div><nav className="p-3 space-y-1 overflow-y-auto">{tabs.map(t=><button key={t.id} onClick={()=>setTab(t.id)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-left transition-colors ${tab===t.id?'bg-blue-50 text-blue-800 ring-1 ring-blue-100':'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}><span className="w-4 h-4 text-current">{t.icon}</span><span>{t.label}</span>{t.id==='orders'&&<span className="ml-auto text-[10px] font-bold text-slate-500">{counts.orders}</span>}{t.id==='products'&&<span className="ml-auto text-[10px] font-bold text-slate-500">{counts.products}</span>}{t.id==='categories'&&<span className="ml-auto text-[10px] font-bold text-slate-500">{counts.categories}</span>}</button>)}</nav><button onClick={shop.goBack} className="m-3 mt-auto px-3 py-2 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 text-sm font-bold">Back to Storefront</button></aside><div className="flex-1 min-w-0 bg-[#F8FAFC]"><header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center gap-3"><div className="lg:hidden flex gap-1 overflow-x-auto">{tabs.slice(0,9).map(t=><button key={t.id} onClick={()=>setTab(t.id)} className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap ${tab===t.id?'bg-blue-600 text-white':'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>{t.label}</button>)}</div><div className="ml-auto flex items-center gap-2"><span className="hidden sm:inline text-xs text-slate-500">Supabase Control Plane</span><button onClick={()=>window.location.reload()} className="p-2 rounded-xl text-slate-600 hover:bg-slate-100" title="Refresh"><RefreshCw className="w-4 h-4"/></button></div></header><main className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto">{content()}</main></div></div>;
};

export default AdminView;
