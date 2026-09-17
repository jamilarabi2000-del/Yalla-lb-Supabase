import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, Box, ClipboardList, FileText, LayoutDashboard, Package, Search, Store, Users, Bell, Eye, EyeOff, Trash2, Plus, RefreshCw, PanelsTopLeft, FolderTree, ShoppingCart, Layers, Home, ShoppingBag, CreditCard, UserRound, Newspaper, Navigation, Blocks, Settings, Database, Video, X, Save, Download, ListOrdered, Menu } from 'lucide-react';
import { useShop } from '../context/ShopContext';
import { AdminSidebar, AdminMenuTab } from './admin/AdminSidebar';
import { supabase } from '../lib/supabase';
import { EcommerceOverview } from './admin/EcommerceOverview';
import { SalesAnalyticsView } from './admin/SalesAnalyticsView';
import { OrdersRoute } from './admin/routes/OrdersRoute';
import { SellersView } from './admin/SellersView';
import { CustomersView } from './admin/CustomersView';
import { ReviewsManager } from './admin/ReviewsManager';
import { SearchAnalyticsView } from './admin/SearchAnalyticsView';
import { DiscountsManager } from './admin/DiscountsManager';
import { ProductBundlesManager } from './admin/ProductBundlesManager';
import { ActiveCartsView } from './admin/ActiveCartsView';
import { CategoriesDetailsView } from './admin/CategoriesDetailsView';
import { PageCMSManager } from './PageCMSManager';
import { DatabaseActivityLogs } from './admin/DatabaseActivityLogs';
import { UnifiedVisualBuilder } from './admin/UnifiedVisualBuilder';
import { ProductsCatalogManagement } from './admin/ProductsCatalogManagement';
import { getInventoryLedger, hasPermission, recordInventoryChange } from '../services/platformService';
import { secureRandomInt } from '../utils/uuid';
import { checkDuplicateProductNumber } from '../lib/productValidation';
import type { Product } from '../types';

export type AdminTab = 'dashboard' | 'sales' | 'orders' | 'products' | 'categories' | 'sellers' | 'discounts' | 'bundles' | 'customers' | 'active_carts' | 'reviews' | 'search' | 'pages_cms' | 'page_home' | 'page_products' | 'page_detail' | 'page_checkout' | 'page_account' | 'page_news' | 'page_navbar' | 'page_footer' | 'page_custom_blocks' | 'page_visibility' | 'page_seo' | 'inventory' | 'builder' | 'analytics' | 'notifications' | 'security';
type AdminNavItem = { id: AdminTab; label: string; icon: React.ReactNode; section: string };

const tabs: AdminNavItem[] = [
  { id: 'dashboard', label: 'eCommerce Analytics', icon: <LayoutDashboard />, section: 'Store Dashboard' },
  { id: 'sales', label: 'Sales Analytics & Reports', icon: <BarChart3 />, section: 'Store Dashboard' },
  { id: 'orders', label: 'Orders & Courier Dispatch', icon: <ClipboardList />, section: 'Store Operations' },
  { id: 'products', label: 'Products & Inventory Catalog', icon: <Package />, section: 'Store Operations' },
  { id: 'categories', label: 'Categories & Details', icon: <FolderTree />, section: 'Store Operations' },
  { id: 'sellers', label: 'Sellers & Bulk Import', icon: <Store />, section: 'Store Operations' },
  { id: 'discounts', label: 'Discounts & Promo Codes', icon: <FileText />, section: 'Store Operations' },
  { id: 'bundles', label: 'Bundles & Combo Deals', icon: <Layers />, section: 'Store Operations' },
  { id: 'customers', label: 'Customer Directory & Accounts', icon: <Users />, section: 'Store Operations' },
  { id: 'active_carts', label: 'Active Shopping Carts', icon: <ShoppingCart />, section: 'Store Operations' },
  { id: 'reviews', label: 'Customer Reviews & Replies', icon: <Eye />, section: 'Store Operations' },
  { id: 'search', label: 'Search Trends & Analytics', icon: <Search />, section: 'Store Operations' },
  { id: 'pages_cms', label: 'All Pages CMS Studio', icon: <PanelsTopLeft />, section: 'Content Management' },
  { id: 'page_home', label: 'Home Page CMS', icon: <Home />, section: 'Content Management' },
  { id: 'page_products', label: 'Products Catalog CMS', icon: <ShoppingBag />, section: 'Content Management' },
  { id: 'page_detail', label: 'Product Detail CMS', icon: <Package />, section: 'Content Management' },
  { id: 'page_checkout', label: 'Checkout & Delivery CMS', icon: <CreditCard />, section: 'Content Management' },
  { id: 'page_account', label: 'Account Page CMS', icon: <UserRound />, section: 'Content Management' },
  { id: 'page_news', label: 'News & Stories CMS', icon: <Newspaper />, section: 'Content Management' },
  { id: 'page_navbar', label: 'Navbar & Announcement CMS', icon: <Navigation />, section: 'Content Management' },
  { id: 'page_footer', label: 'Footer & Support CMS', icon: <FileText />, section: 'Content Management' },
  { id: 'page_custom_blocks', label: 'Custom Divs & Banners CMS', icon: <Blocks />, section: 'Content Management' },
  { id: 'page_visibility', label: 'Section Visibility CMS', icon: <EyeOff />, section: 'Content Management' },
  { id: 'page_seo', label: 'Global SEO & Metadata', icon: <Settings />, section: 'Content Management' },
  { id: 'inventory', label: 'Inventory Ledger', icon: <Box />, section: 'System & Audits' },
  { id: 'builder', label: 'Visual Builder', icon: <PanelsTopLeft />, section: 'System & Audits' },
  { id: 'analytics', label: 'Analytics', icon: <BarChart3 />, section: 'System & Audits' },
  { id: 'notifications', label: 'Notifications', icon: <Bell />, section: 'System & Audits' },
  { id: 'security', label: 'Database Sync Flow & Logs', icon: <Database />, section: 'System & Audits' },
];
export const ADMIN_TAB_METAS = Object.fromEntries(tabs.map(t => [t.id, { path: t.id, title: t.label, section: t.section, desc: t.label, icon: t.id }])) as Record<AdminTab, { path: string; title: string; section: string; desc: string; icon: string }>;

const emptyProduct = () => ({
  name: '', arabicName: '', category: 'grocery', artisan: '', seller: '', arabicSeller: '', sellerId: '', origin: 'Lebanon',
  priceUSD: 15, originalPriceUSD: '', discountPercentage: '', stock: 25, lowStockThreshold: 5, lowStockNotice: '', customStockLabel: '', costPriceUSD: '',
  image: '', additionalImages: [] as string[], videoUrl: '', videos: [] as string[], weightOrVolume: '', tagsInput: 'Artisanal, Lebanese Terroir, Handmade', keywordsInput: 'lebanese, artisanal, authentic, gourmet', arabicKeywordsInput: 'مونة بلدية, منتجات لبنانية أصيلة', sellerItemCode: 'SIC-' + secureRandomInt(100000, 1000000),
  description: '', craftStory: '', seoTitle: '', seoArabicTitle: '', seoDescription: '', seoArabicDescription: '', isNewArrival: true, isFeatured: false, isBestseller: false, isPublished: false, displayOrder: ''
});

function ProductsManager() {
  const shop = useShop() as any;
  const products: Product[] = shop.products ?? [];
  const sellers = shop.sellers ?? [];
  const categories = shop.categories ?? [];
  const addProduct = shop.addProduct ?? (async () => {});
  const updateProduct = shop.updateProduct ?? (async () => {});
  const deleteProduct = shop.deleteProduct ?? (async () => {});
  const deleteMultipleProducts = shop.deleteMultipleProducts ?? (async () => {});
  const reorderProducts = shop.reorderProducts ?? (async () => {});
  const showToast = shop.showToast ?? (() => {});
  const [query, setQuery] = useState('');
  const [sellerFilter, setSellerFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [publishFilter, setPublishFilter] = useState<'all'|'published'|'hidden'>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<any>(emptyProduct());
  const [creating, setCreating] = useState(false);
  const [newImage, setNewImage] = useState('');
  const [newVideo, setNewVideo] = useState('');
  const [orderMode, setOrderMode] = useState(false);
  const [ordered, setOrdered] = useState<Product[]>([]);
  const [orderDirty, setOrderDirty] = useState(false);

  useEffect(() => { setOrdered([...products].sort((a,b) => (a.displayOrder ?? 999999) - (b.displayOrder ?? 999999))); }, [products]);
  const filtered = useMemo(() => products.filter(p => {
    const q = query.trim().toLowerCase();
    const hit = !q || [p.name,p.arabicName,p.brand,p.seller,p.artisan,p.sellerItemCode,p.id,p.description,...(p.keywords||[]),...(p.arabicKeywords||[])].filter(Boolean).some(v => String(v).toLowerCase().includes(q));
    return hit && (sellerFilter === 'all' || p.sellerId === sellerFilter || p.seller === sellerFilter || p.artisan === sellerFilter) && (categoryFilter === 'all' || p.category === categoryFilter) && (publishFilter === 'all' || (publishFilter === 'published' ? p.isPublished !== false : p.isPublished === false));
  }), [products,query,sellerFilter,categoryFilter,publishFilter]);

  const setField = (k: string, v: any) => setForm((x:any) => ({...x,[k]:v}));
  const openCreate = () => { setForm(emptyProduct()); setNewImage(''); setNewVideo(''); setShowAdd(true); };
  const openEdit = (p: Product) => setEditing(p);
  const addImage = () => { if (newImage.trim()) { setField('additionalImages',[...(form.additionalImages||[]),newImage.trim()]); setNewImage(''); } };
  const addVideo = () => { if (newVideo.trim()) { setField('videos',[...(form.videos||[]),newVideo.trim()]); setNewVideo(''); } };
  const validate = (f:any, id?:string) => {
    const stock = Number(f.stock), price = Number(f.priceUSD);
    if (!String(f.name||'').trim() || !String(f.category||'').trim() || !Number.isFinite(price) || price <= 0) { showToast('Product name, category, and a price greater than 0 are required.', 'warning'); return false; }
    if (!Number.isInteger(stock) || stock < 0) { showToast('Stock quantity must be a whole number of units (0 or more).', 'warning'); return false; }
    if (f.sellerItemCode) { const sellerName = f.seller || f.artisan; const dup = checkDuplicateProductNumber(f.sellerItemCode,id||null,products,f.sellerId||undefined,sellerName); if (dup.isDuplicate) { showToast(`Duplicate seller item code: "${f.sellerItemCode}" is already in use by "${dup.conflictingProduct?.name}".`, 'error'); return false; } }
    return true;
  };
  const payload = (f:any, published:boolean): Omit<Product,'id'> => ({
    name: String(f.name||'').trim(), arabicName: String(f.arabicName||'').trim() || undefined, category: f.category || 'grocery', artisan: String(f.artisan||f.seller||'Independent Artisan').trim(), seller: String(f.seller||f.artisan||'Independent Artisan').trim(), sellerId: f.sellerId || undefined, arabicSeller: String(f.arabicSeller||'').trim() || undefined,
    origin: String(f.origin||'Lebanon').trim() || 'Lebanon', priceUSD:Number(f.priceUSD), originalPriceUSD:Number(f.originalPriceUSD)>0?Number(f.originalPriceUSD):undefined, discountPercentage:String(f.discountPercentage)===''?undefined:Number(f.discountPercentage), rating:0, reviewsCount:0,
    image:String(f.image||'').trim() || 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=600&q=80', additionalImages:(f.additionalImages||[]).filter(Boolean), videoUrl:String(f.videoUrl||'').trim()||undefined, videos:(f.videos||[]).filter(Boolean), description:String(f.description||'').trim(), craftStory:String(f.craftStory||'').trim(), stock:Number(f.stock), lowStockThreshold:Number(f.lowStockThreshold)>=0?Number(f.lowStockThreshold):5, lowStockNotice:String(f.lowStockNotice||'').trim()||undefined, customStockLabel:String(f.customStockLabel||'').trim()||undefined, costPriceUSD:Number(f.costPriceUSD)>0?Number(f.costPriceUSD):undefined,
    isNewArrival:!!f.isNewArrival, isFeatured:!!f.isFeatured, isBestseller:!!f.isBestseller, isPublished:published, displayOrder:String(f.displayOrder)===''?undefined:Number(f.displayOrder), weightOrVolume:String(f.weightOrVolume||'').trim()||undefined, tags:String(f.tagsInput||'').split(',').map((x:string)=>x.trim()).filter(Boolean), keywords:String(f.keywordsInput||'').split(',').map((x:string)=>x.trim()).filter(Boolean), arabicKeywords:String(f.arabicKeywordsInput||'').split(',').map((x:string)=>x.trim()).filter(Boolean), sellerItemCode:String(f.sellerItemCode||'').trim()||undefined,
    seoTitle:String(f.seoTitle||'').trim()||undefined, seoArabicTitle:String(f.seoArabicTitle||'').trim()||undefined, seoDescription:String(f.seoDescription||'').trim()||undefined, seoArabicDescription:String(f.seoArabicDescription||'').trim()||undefined
  });
  const create = async (published:boolean) => { if(!validate(form)) return; setCreating(true); try { await addProduct(payload(form,published)); showToast(published?`Product "${form.name}" published live to Public Catalog!`:`Product "${form.name}" saved as Draft (Unpublished).`,'success'); setShowAdd(false); } catch(e:any) { showToast(e?.message||'Unable to save product.','error'); } finally { setCreating(false); } };
  const saveEdit = async (published:boolean) => { if(!editing) return; if(!validate(form,editing.id)) return; try { await updateProduct(editing.id,payload(form,published)); showToast(published?`Product "${form.name}" updated & published to Public Store!`:`Product "${form.name}" updated & saved as Draft.`,'success'); setEditing(null); } catch(e:any) { showToast(e?.message||'Unable to update product.','error'); } };
  useEffect(() => { if(editing) setForm({...emptyProduct(),...editing,keywordsInput:(editing.keywords||[]).join(', '),arabicKeywordsInput:(editing.arabicKeywords||[]).join(', '),tagsInput:(editing.tags||[]).join(', '),additionalImages:editing.additionalImages||[],videos:editing.videos||editing.additionalVideos||[]}); }, [editing]);
  const move = (index:number, dir:number) => { const next=[...ordered]; const to=index+dir; if(to<0||to>=next.length)return; [next[index],next[to]]=[next[to],next[index]]; setOrdered(next); setOrderDirty(true); };
  const saveOrder = async () => { try { await reorderProducts(ordered); setOrderDirty(false); showToast(`Saved sequence order for all ${ordered.length} products to database!`,'success'); } catch(e:any) { showToast(e?.message||'Could not save product order.','error'); } };
  const toggleAll = () => setSelected(selected.size===filtered.length?new Set():new Set(filtered.map(p=>p.id)));
  const bulkPublish = async (value:boolean) => { await Promise.allSettled([...selected].map(id=>updateProduct(id,{isPublished:value}))); showToast(`${selected.size} product(s) updated.`,'success'); };
  const bulkDelete = async () => { if(!selected.size)return; if(!window.confirm(`Are you sure you want to delete ${selected.size} selected products? This cannot be undone.`))return; await deleteMultipleProducts([...selected]); setSelected(new Set()); };

  const Field = ({label,k,type='text',placeholder,optional=false}:{label:string;k:string;type?:string;placeholder?:string;optional?:boolean}) => <label className="space-y-1 text-sm"><span className="font-semibold text-slate-700">{label}{optional && <span className="text-slate-400 font-normal"> (optional)</span>}</span><input type={type} value={form[k] ?? ''} onChange={e=>setField(k,type==='number'?Number(e.target.value):e.target.value)} placeholder={placeholder} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-white text-slate-900" /></label>;
  const Text = ({label,k,rows=3,optional=false}:{label:string;k:string;rows?:number;optional?:boolean}) => <label className="space-y-1 text-sm"><span className="font-semibold text-slate-700">{label}{optional && <span className="text-slate-400 font-normal"> (optional)</span>}</span><textarea value={form[k] ?? ''} onChange={e=>setField(k,e.target.value)} rows={rows} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-white text-slate-900" /></label>;
  const Modal = ({edit=false}:{edit?:boolean}) => <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"><div className="bg-white rounded-3xl w-full max-w-5xl max-h-[94vh] overflow-y-auto p-6 space-y-6 text-slate-900"><div className="flex items-center justify-between"><div><h3 className="text-2xl font-black">{edit ? 'Edit Product' : 'Add Product'}</h3><p className="text-sm text-slate-500">Fields marked optional may be left empty. The Firebase catalog only requires the core product identity/category/price to create a product.</p></div><button onClick={()=>edit?setEditing(null):setShowAdd(false)} className="p-2 rounded-xl hover:bg-slate-100"><X /></button></div><div className="grid md:grid-cols-2 gap-4"><Field label="Product Name" k="name"/><Field label="Arabic Product Name" k="arabicName" optional/><Field label="Category" k="category" optional/><Field label="Artisan / Seller" k="seller" optional/><Field label="Arabic Seller" k="arabicSeller" optional/><Field label="Origin" k="origin" optional/><Field label="Seller Item Code" k="sellerItemCode" optional/><Field label="Price (USD)" k="priceUSD" type="number"/><Field label="Original Price (USD)" k="originalPriceUSD" type="number" optional/><Field label="Discount %" k="discountPercentage" type="number" optional/><Field label="Stock" k="stock" type="number" optional/><Field label="Low Stock Threshold" k="lowStockThreshold" type="number" optional/><Field label="Low Stock Notice" k="lowStockNotice" optional/><Field label="Custom Stock Label" k="customStockLabel" optional/><Field label="Cost Price (USD)" k="costPriceUSD" type="number" optional/><Field label="Weight / Volume" k="weightOrVolume" optional/><Field label="Display Order" k="displayOrder" type="number" optional/><Field label="Primary Image URL" k="image" optional/></div><div className="grid md:grid-cols-2 gap-4"><Text label="Description" k="description"/><Text label="Craft Story" k="craftStory"/><Text label="SEO Title" k="seoTitle" optional/><Text label="Arabic SEO Title" k="seoArabicTitle" optional/><Text label="SEO Description" k="seoDescription" optional/><Text label="Arabic SEO Description" k="seoArabicDescription" optional/></div><div className="grid md:grid-cols-2 gap-4"><Field label="Tags (comma separated)" k="tagsInput" optional/><Field label="Keywords (comma separated)" k="keywordsInput" optional/><Field label="Arabic Keywords (comma separated)" k="arabicKeywordsInput" optional/><Field label="Video URL" k="videoUrl" optional/></div><div className="grid md:grid-cols-2 gap-4"><div className="border border-slate-200 rounded-2xl p-4 space-y-3"><b>Additional Images</b><div className="flex gap-2"><input value={newImage} onChange={e=>setNewImage(e.target.value)} className="flex-1 px-3 py-2 border rounded-xl" placeholder="Image URL"/><button onClick={addImage} className="px-3 rounded-xl bg-slate-900 text-white"><Plus /></button></div>{(form.additionalImages||[]).map((x:string,i:number)=><div key={i} className="text-xs flex justify-between"><span className="truncate">{x}</span><button onClick={()=>setField('additionalImages',(form.additionalImages||[]).filter((_:string,j:number)=>j!==i))}><Trash2 className="w-4 h-4 text-rose-500"/></button></div>)}</div><div className="border border-slate-200 rounded-2xl p-4 space-y-3"><b>Additional Videos</b><div className="flex gap-2"><input value={newVideo} onChange={e=>setNewVideo(e.target.value)} className="flex-1 px-3 py-2 border rounded-xl" placeholder="Video URL"/><button onClick={addVideo} className="px-3 rounded-xl bg-slate-900 text-white"><Plus /></button></div>{(form.videos||[]).map((x:string,i:number)=><div key={i} className="text-xs flex justify-between"><span className="truncate">{x}</span><button onClick={()=>setField('videos',(form.videos||[]).filter((_:string,j:number)=>j!==i))}><Trash2 className="w-4 h-4 text-rose-500"/></button></div>)}</div></div><div className="flex flex-wrap gap-4 border-t pt-4"><label><input type="checkbox" checked={!!form.isNewArrival} onChange={e=>setField('isNewArrival',e.target.checked)}/> <span className="ml-1">New Arrival</span></label><label><input type="checkbox" checked={!!form.isFeatured} onChange={e=>setField('isFeatured',e.target.checked)}/> <span className="ml-1">Featured</span></label><label><input type="checkbox" checked={!!form.isBestseller} onChange={e=>setField('isBestseller',e.target.checked)}/> <span className="ml-1">Bestseller</span></label><label><input type="checkbox" checked={!!form.isPublished} onChange={e=>setField('isPublished',e.target.checked)}/> <span className="ml-1">Published</span></label></div><div className="flex justify-end gap-2 border-t pt-4"><button onClick={()=>edit?setEditing(null):setShowAdd(false)} className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold">Cancel</button><button disabled={creating} onClick={()=>edit?saveEdit(false):create(false)} className="px-4 py-2.5 rounded-xl bg-slate-700 text-white font-bold">{creating?'Saving…':'Save as Draft'}</button><button disabled={creating} onClick={()=>edit?saveEdit(true):create(true)} className="px-4 py-2.5 rounded-xl bg-blue-600 text-white font-bold">{creating?'Saving…':edit?'Save & Publish':'Create Product'}</button></div></div></div>;

  return <section className="space-y-5 text-slate-900"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-2xl font-black">Products & Inventory Catalog</h2><p className="text-sm text-slate-500">Manage products, pricing, stock, media, SEO, publishing and seller ownership.</p></div><div className="flex gap-2"><button onClick={()=>setOrderMode(!orderMode)} className="px-3 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold flex gap-2 items-center"><ListOrdered className="w-4 h-4"/>Product Order</button><button onClick={openCreate} className="px-4 py-2.5 rounded-xl bg-blue-600 text-white font-bold flex gap-2 items-center"><Plus className="w-4 h-4"/>Add Product</button></div></div>{orderMode && <div className="bg-white border rounded-2xl p-4"><div className="flex justify-between items-center mb-3"><b>Product Sequence</b><button disabled={!orderDirty} onClick={saveOrder} className="px-3 py-2 rounded-xl bg-blue-600 text-white font-bold flex gap-2 items-center"><Save className="w-4 h-4"/>Save Products Order</button></div>{ordered.map((p,i)=><div key={p.id} className="flex items-center gap-3 py-2 border-t"><span className="w-8 font-black">#{i+1}</span><span className="flex-1 truncate">{p.name}</span><button disabled={i===0} onClick={()=>move(i,-1)} className="px-2 py-1 rounded bg-slate-100">↑</button><button disabled={i===ordered.length-1} onClick={()=>move(i,1)} className="px-2 py-1 rounded bg-slate-100">↓</button></div>)}</div>}<div className="grid lg:grid-cols-4 gap-3"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search Arabic, English, SKU, brand, seller, keywords..." className="lg:col-span-2 px-4 py-3 rounded-2xl border bg-white"/><select value={sellerFilter} onChange={e=>setSellerFilter(e.target.value)} className="px-3 py-3 rounded-2xl border bg-white"><option value="all">All Sellers</option>{sellers.map((s:any)=><option key={s.id} value={s.id}>{s.nameEn}</option>)}</select><select value={publishFilter} onChange={e=>setPublishFilter(e.target.value as any)} className="px-3 py-3 rounded-2xl border bg-white"><option value="all">All Publish States</option><option value="published">Published</option><option value="hidden">Hidden / Draft</option></select></div><div className="flex flex-wrap items-center gap-2"><select value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)} className="px-3 py-2 rounded-xl border bg-white"><option value="all">All Categories</option>{categories.map((c:any)=><option key={c.id} value={c.id}>{c.nameEn||c.name}</option>)}</select><button onClick={toggleAll} className="px-3 py-2 rounded-xl bg-slate-100 font-bold">{selected.size===filtered.length&&filtered.length?'Clear Selection':'Select All'}</button>{selected.size>0&&<><button onClick={()=>bulkPublish(true)} className="px-3 py-2 rounded-xl bg-emerald-100 text-emerald-700 font-bold">Publish Selected</button><button onClick={()=>bulkPublish(false)} className="px-3 py-2 rounded-xl bg-amber-100 text-amber-700 font-bold">Hide Selected</button><button onClick={bulkDelete} className="px-3 py-2 rounded-xl bg-rose-100 text-rose-700 font-bold">Delete Selected</button></>}</div><div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{filtered.map(p=><article key={p.id} className="bg-white rounded-2xl border p-4 space-y-3"><div className="flex gap-3"><input type="checkbox" checked={selected.has(p.id)} onChange={e=>{const n=new Set(selected);e.target.checked?n.add(p.id):n.delete(p.id);setSelected(n)}}/><div className="w-20 h-20 rounded-xl bg-slate-50 overflow-hidden"><img src={p.image} alt={p.name} className="w-full h-full object-contain"/></div><div className="min-w-0"><h3 className="font-bold truncate">{p.name}</h3><p className="text-xs text-slate-500 truncate">{p.arabicName}</p><p className="text-xs text-blue-600 truncate">{p.seller||p.artisan||'Independent Artisan'}</p><p className="text-[10px] text-slate-400 font-mono truncate">{p.sellerItemCode||p.id}</p></div></div><div className="flex items-center justify-between"><div><div className="font-black">${Number(p.priceUSD||0).toFixed(2)}</div><div className="text-xs text-slate-500">Stock: {p.stock} · {p.isPublished===false?'Draft / Hidden':'Published'}</div></div><div className="flex gap-1"><button title={p.isPublished===false?'Publish':'Unpublish'} onClick={()=>updateProduct(p.id,{isPublished:p.isPublished===false})} className="p-2 rounded-lg hover:bg-slate-100">{p.isPublished===false?<Eye/>:<EyeOff/>}</button><button onClick={()=>openEdit(p)} className="px-2 py-1 rounded-lg bg-slate-100 text-xs font-bold">Edit</button><button onClick={()=>deleteProduct(p.id)} className="p-2 rounded-lg text-rose-600 hover:bg-rose-50"><Trash2 className="w-4 h-4"/></button></div></div></article>)}</div>{showAdd&&<Modal/>}{editing&&<Modal edit/>}</section>;
}

function InventoryManager(){const shop=useShop() as any;const products=shop.products??[];const[ledger,setLedger]=useState<any[]>([]);const[productId,setProductId]=useState('');const[qty,setQty]=useState(0);const[reason,setReason]=useState('adjustment');const refresh=async()=>setLedger(await getInventoryLedger());useEffect(()=>{refresh().catch(console.error)},[]);const adjust=async()=>{if(!productId||!qty)return;await recordInventoryChange({productId,quantityChange:qty,reason});setQty(0);await refresh()};return <section className="space-y-5"><div><h2 className="text-2xl font-black">Inventory Ledger</h2><p className="text-sm text-slate-500">Opening stock + purchases + returns − sales − damage ± adjustments.</p></div><div className="bg-white border rounded-2xl p-4 grid md:grid-cols-4 gap-3"><select value={productId} onChange={e=>setProductId(e.target.value)} className="px-3 py-2 border rounded-xl md:col-span-2"><option value="">Select product</option>{products.map((p:any)=><option key={p.id} value={p.id}>{p.name} — {p.stock}</option>)}</select><input type="number" value={qty} onChange={e=>setQty(Number(e.target.value))} placeholder="Change" className="px-3 py-2 border rounded-xl"/><select value={reason} onChange={e=>setReason(e.target.value)} className="px-3 py-2 border rounded-xl"><option>adjustment</option><option>purchase</option><option>return</option><option>damage</option><option>sale</option><option>transfer</option></select><button onClick={adjust} className="md:col-span-4 px-4 py-2 rounded-xl bg-blue-600 text-white font-bold">Post inventory movement</button></div><div className="bg-white border rounded-2xl overflow-auto"><table className="w-full text-sm"><thead><tr className="text-left bg-slate-50"><th className="p-3">Time</th><th className="p-3">Product</th><th className="p-3">Change</th><th className="p-3">Reason</th></tr></thead><tbody>{ledger.map(r=><tr key={r.id} className="border-t"><td className="p-3">{new Date(r.created_at).toLocaleString()}</td><td className="p-3">{r.product_id}</td><td className="p-3 font-black">{r.quantity_change}</td><td className="p-3">{r.reason}</td></tr>)}</tbody></table></div></section>}
function NotificationsManager(){const[items,setItems]=useState<any[]>([]);const refresh=async()=>{const{data,error}=await supabase.from('notifications').select('*').order('created_at',{ascending:false}).limit(100);if(error)throw error;setItems(data||[])};useEffect(()=>{refresh().catch(console.error)},[]);return <section className="space-y-4"><h2 className="text-2xl font-black">Notifications</h2><div className="bg-white border rounded-2xl divide-y">{items.map(n=><div key={n.id} className="p-4"><b>{n.title}</b><p className="text-sm text-slate-600">{n.body}</p></div>)}{!items.length&&<div className="p-8 text-center text-slate-500">No notifications yet.</div>}</div></section>}

const cmsMap: Record<string,string>={pages_cms:'home',page_home:'home',page_products:'productsPage',page_detail:'productDetailPage',page_checkout:'checkoutPage',page_account:'accountPage',page_news:'newsSection',page_navbar:'navbar',page_footer:'footer',page_custom_blocks:'customBlocks',page_visibility:'visibility',page_seo:'seo'};
function CMSSection({tab}:{tab:AdminTab}){return <section className="space-y-4"><div className="bg-white border rounded-2xl p-5"><h2 className="text-2xl font-black">{tabs.find(t=>t.id===tab)?.label}</h2><p className="text-sm text-slate-500 mt-1">Firebase-compatible CMS editor backed by Supabase.</p></div><PageCMSManager initialTab={cmsMap[tab]||'home'}/></section>}

export const AdminView:React.FC=()=>{const shop=useShop() as any;const[tab,setTab]=useState<AdminTab>('dashboard');const[allowed,setAllowed]=useState(true);useEffect(()=>{hasPermission('security.view').then(v=>setAllowed(v||!!shop.isAdminUser)).catch(()=>setAllowed(!!shop.isAdminUser))},[shop.isAdminUser]);const counts={orders:(shop.orders||[]).length,products:(shop.products||[]).length,categories:(shop.categories||[]).length};const [isMobileSidebarOpen,setIsMobileSidebarOpen]=useState(false);const content=()=>{switch(tab){case'dashboard':return <EcommerceOverview onNavigateToTab={(t:any)=>setTab(t==='ecommerce'?'dashboard':t)}/>;case'sales':case'analytics':return <SalesAnalyticsView/>;case'orders':return <OrdersRoute/>;case'products':return <ProductsCatalogManagement/>;case'categories':return <CategoriesDetailsView/>;case'inventory':return <InventoryManager/>;case'customers':return <CustomersView dbUsers={shop.dbUsers||shop.userProfiles||[]}/>;case'sellers':return <SellersView/>;case'discounts':return <DiscountsManager initialTab="rules"/>;case'bundles':return <ProductBundlesManager/>;case'active_carts':return <ActiveCartsView/>;case'reviews':return <ReviewsManager products={shop.products||[]}/>;case'search':return <SearchAnalyticsView/>;case'pages_cms':case'page_home':case'page_products':case'page_detail':case'page_checkout':case'page_account':case'page_news':case'page_navbar':case'page_footer':case'page_custom_blocks':case'page_visibility':case'page_seo':return <CMSSection tab={tab}/>;case'builder':return <UnifiedVisualBuilder/>;case'notifications':return <NotificationsManager/>;case'security':return allowed?<DatabaseActivityLogs/>:<div className="p-8 bg-white rounded-2xl border text-center text-rose-600">Security logs require security.view permission.</div>}};const sidebarTab: AdminMenuTab =
  tab === 'dashboard' ? 'ecommerce' :
  tab === 'search' ? 'search_analytics' :
  tab === 'security' ? 'db_logs' :
  (tab as AdminMenuTab);

const handleSidebarSelect = (next: AdminMenuTab) => {
  const mapped: AdminTab =
    next === 'ecommerce' ? 'dashboard' :
    next === 'search_analytics' ? 'search' :
    next === 'db_logs' ? 'security' :
    (next as AdminTab);
  setTab(mapped);
  setIsMobileSidebarOpen(false);
};

return (
  <div className="min-h-screen bg-[#f8fafc] flex text-slate-900 font-sans antialiased">
    <AdminSidebar
      currentTab={sidebarTab}
      onSelectTab={handleSidebarSelect}
      ordersCount={counts.orders}
      productsCount={counts.products}
      categoriesCount={counts.categories}
      customersCount={(shop.dbUsers || shop.userProfiles || []).length}
      activeCartsCount={(shop.cart || []).length}
      isOpenMobile={isMobileSidebarOpen}
      onCloseMobile={() => setIsMobileSidebarOpen(false)}
    />

    <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-3.5 sm:px-6 py-3 sm:py-3.5 flex items-center justify-between gap-2 sm:gap-4">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            onClick={() => setIsMobileSidebarOpen(true)}
            className="lg:hidden p-1.5 sm:p-2 rounded-xl text-slate-600 hover:bg-slate-100 cursor-pointer shrink-0"
            aria-label="Open navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 capitalize flex items-center gap-1.5 sm:gap-2 truncate">
              <span className="truncate">{tabs.find(t => t.id === tab)?.label || tab.replace('_',' ')}</span>
              <span className="hidden md:inline text-slate-300 font-light">/</span>
              <span className="hidden md:inline text-xs font-normal text-slate-500 truncate">Yalla.lb Admin</span>
            </h2>
          </div>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 text-xs font-bold border border-indigo-100 shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Supabase Live</span>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="p-2 rounded-xl text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            title="Refresh dashboard"
            aria-label="Refresh dashboard"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={shop.goBack}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer"
          >
            Storefront
          </button>
          <div className="w-8 h-8 rounded-full bg-indigo-100 text-[#4f46e5] font-black text-xs flex items-center justify-center border border-indigo-200">JA</div>
        </div>
      </header>

      <main className="flex-1 p-3.5 sm:p-6 lg:p-8 max-w-[1600px] w-full mx-auto space-y-6">
        {content()}
      </main>
    </div>
  </div>
);

export default AdminView;