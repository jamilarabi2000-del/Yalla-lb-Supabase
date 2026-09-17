import React, { useMemo, useRef, useState } from 'react';
import { Download, FileSpreadsheet, Upload, Save, Plus, Search, Eye, EyeOff, Trash2, Pencil, ArrowUp, ArrowDown, Crown, GripVertical, X, Package, CheckCircle2, AlertTriangle } from 'lucide-react';
import Papa from 'papaparse';
import { useShop } from '../../context/ShopContext';
import { downloadFullMasterReport } from '../../utils/exportMasterReport';
import { checkDuplicateProductNumber } from '../../lib/productValidation';
import { secureRandomInt } from '../../utils/uuid';
import { supabaseProductService } from '../../services/supabaseProductService';
import type { Product } from '../../types';

type ViewMode = 'grid' | 'sequence';

const emptyProduct = () => ({
  name: '', arabicName: '', category: '', brand: '', artisan: '', seller: '', arabicSeller: '', sellerId: '', origin: 'Lebanon',
  priceUSD: 15, originalPriceUSD: '', discountPercentage: '', stock: 25, lowStockThreshold: 5, lowStockNotice: '', customStockLabel: '', costPriceUSD: '',
  image: '', additionalImages: [] as string[], videoUrl: '', videos: [] as string[], weightOrVolume: '', tagsInput: 'Artisanal, Lebanese Terroir, Handmade', keywordsInput: 'lebanese, artisanal, authentic, gourmet', arabicKeywordsInput: 'مونة بلدية, منتجات لبنانية أصيلة', sellerItemCode: 'SIC-' + secureRandomInt(100000, 1000000),
  description: '', craftStory: '', seoTitle: '', seoArabicTitle: '', seoDescription: '', seoArabicDescription: '', isNewArrival: true, isFeatured: false, isBestseller: false, isPublished: false, displayOrder: ''
});

const csvDownload = (rows: any[], filename: string) => {
  const csv = Papa.unparse(rows);
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

export const ProductsCatalogManagement: React.FC = () => {
  const shop = useShop() as any;
  const products: Product[] = shop.products ?? [];
  const sellers = shop.sellers ?? [];
  const categories = shop.categories ?? [];
  const orders = shop.orders ?? [];
  const updateProduct = shop.updateProduct ?? (async () => {});
  const deleteProduct = shop.deleteProduct ?? (async () => {});
  const deleteMultipleProducts = shop.deleteMultipleProducts ?? (async () => {});
  const reorderProducts = shop.reorderProducts ?? (async () => {});
  const showToast = shop.showToast ?? (() => {});
  const fileRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
  const [sellerFilter, setSellerFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sequence, setSequence] = useState<Product[]>([]);
  const [orderDirty, setOrderDirty] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<any>(emptyProduct());
  const [saving, setSaving] = useState(false);
  const [quickValues, setQuickValues] = useState<Record<string, { price: string; stock: string }>>({});

  const filtered = useMemo(() => products.filter(p => {
    const q = query.trim().toLowerCase();
    const haystack = [p.name, p.arabicName, p.brand, p.seller, p.artisan, p.origin, p.category, p.sellerItemCode, p.id, p.description, ...(p.keywords || []), ...(p.arabicKeywords || [])].filter(Boolean).join(' ').toLowerCase();
    const matchesQuery = !q || haystack.includes(q);
    const matchesSeller = sellerFilter === 'all' || p.sellerId === sellerFilter || p.seller === sellerFilter || p.artisan === sellerFilter;
    const matchesCategory = categoryFilter === 'all' || p.category === categoryFilter;
    const matchesStatus = statusFilter === 'all' || (statusFilter === 'published' ? p.isPublished !== false : p.isPublished === false);
    return matchesQuery && matchesSeller && matchesCategory && matchesStatus;
  }), [products, query, sellerFilter, categoryFilter, statusFilter]);

  React.useEffect(() => {
    setSequence([...filtered].sort((a, b) => (a.displayOrder ?? 999999) - (b.displayOrder ?? 999999)));
  }, [filtered]);

  const allSelected = filtered.length > 0 && selected.size === filtered.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(filtered.map(p => p.id)));
  const toggle = (id: string) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const openEdit = (p: Product) => setEditing(p);
  React.useEffect(() => {
    if (!editing) return;
    setForm({ ...emptyProduct(), ...editing,
      keywordsInput: (editing.keywords || []).join(', '),
      arabicKeywordsInput: (editing.arabicKeywords || []).join(', '),
      tagsInput: (editing.tags || []).join(', '),
      additionalImages: editing.additionalImages || [],
      videos: editing.videos || editing.additionalVideos || []
    });
  }, [editing]);

  const saveProduct = async (published: boolean) => {
    const stock = Number(form.stock);
    const price = Number(form.priceUSD);
    if (!String(form.name || '').trim() || !String(form.category || '').trim() || !Number.isFinite(price) || price <= 0) return showToast('Product name, category and a price greater than 0 are required.', 'warning');
    if (!Number.isInteger(stock) || stock < 0) return showToast('Stock quantity must be a whole number of units (0 or more).', 'warning');
    const dup = form.sellerItemCode ? checkDuplicateProductNumber(form.sellerItemCode, editing?.id || null, products, form.sellerId || undefined, form.seller || form.artisan) : { isDuplicate: false };
    if (dup.isDuplicate) return showToast(`Duplicate seller item code: ${form.sellerItemCode}`, 'error');
    if (!String(form.brand || '').trim()) return showToast('Brand is required for product creation.', 'warning');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(form.category || ''))) return showToast('Select a valid catalog category.', 'warning');
    const payload: any = {
      name: String(form.name).trim(), arabicName: String(form.arabicName || '').trim() || undefined, category: form.category, brand: String(form.brand || '').trim(),
      artisan: String(form.artisan || form.seller || 'Independent Artisan').trim(), seller: String(form.seller || form.artisan || 'Independent Artisan').trim(), sellerId: form.sellerId || undefined,
      arabicSeller: String(form.arabicSeller || '').trim() || undefined, origin: String(form.origin || 'Lebanon').trim() || 'Lebanon', priceUSD: price,
      originalPriceUSD: Number(form.originalPriceUSD) > 0 ? Number(form.originalPriceUSD) : undefined, discountPercentage: String(form.discountPercentage) === '' ? undefined : Number(form.discountPercentage),
      stock, lowStockThreshold: Number(form.lowStockThreshold) >= 0 ? Number(form.lowStockThreshold) : 5, lowStockNotice: String(form.lowStockNotice || '').trim() || undefined,
      customStockLabel: String(form.customStockLabel || '').trim() || undefined, costPriceUSD: Number(form.costPriceUSD) > 0 ? Number(form.costPriceUSD) : undefined,
      image: String(form.image || '').trim() || 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=900&q=80',
      additionalImages: form.additionalImages || [], videoUrl: String(form.videoUrl || '').trim() || undefined, videos: form.videos || [], description: String(form.description || '').trim(), craftStory: String(form.craftStory || '').trim(),
      isNewArrival: !!form.isNewArrival, isFeatured: !!form.isFeatured, isBestseller: !!form.isBestseller, isPublished: published,
      displayOrder: String(form.displayOrder) === '' ? undefined : Number(form.displayOrder), weightOrVolume: String(form.weightOrVolume || '').trim() || undefined,
      tags: String(form.tagsInput || '').split(',').map((x: string) => x.trim()).filter(Boolean), keywords: String(form.keywordsInput || '').split(',').map((x: string) => x.trim()).filter(Boolean),
      arabicKeywords: String(form.arabicKeywordsInput || '').split(',').map((x: string) => x.trim()).filter(Boolean), sellerItemCode: String(form.sellerItemCode || '').trim() || undefined,
      seoTitle: String(form.seoTitle || '').trim() || undefined, seoArabicTitle: String(form.seoArabicTitle || '').trim() || undefined, seoDescription: String(form.seoDescription || '').trim() || undefined, seoArabicDescription: String(form.seoArabicDescription || '').trim() || undefined
    };
    setSaving(true);
    try {
      if (editing) {
        await updateProduct(editing.id, payload);
      } else {
        await supabaseProductService.createProduct({
          product: {
            name: payload.name, arabic_name: payload.arabicName, artisan: payload.artisan, origin: payload.origin,
            brand: payload.brand, description: payload.description, craft_story: payload.craftStory, image: payload.image,
            price_usd: payload.priceUSD, stock: payload.stock, category_id: payload.category, seller_id: payload.sellerId,
            original_price_usd: payload.originalPriceUSD, discount_percentage: payload.discountPercentage,
            video_url: payload.videoUrl, is_new_arrival: payload.isNewArrival, is_featured: payload.isFeatured,
            is_bestseller: payload.isBestseller, is_published: published, display_order: payload.displayOrder,
            seller_item_code: payload.sellerItemCode, low_stock_threshold: payload.lowStockThreshold,
            low_stock_notice: payload.lowStockNotice, custom_stock_label: payload.customStockLabel,
            cost_price_usd: payload.costPriceUSD, tags: payload.tags, keywords: payload.keywords,
            arabic_keywords: payload.arabicKeywords, seo_title: payload.seoTitle, seo_arabic_title: payload.seoArabicTitle,
            seo_description: payload.seoDescription, seo_arabic_description: payload.seoArabicDescription,
            weight_or_volume: payload.weightOrVolume, publish_status: published ? 'published' : 'draft'
          },
          privateData: {
            seller_item_code: payload.sellerItemCode, low_stock_threshold: payload.lowStockThreshold,
            low_stock_notice: payload.lowStockNotice, custom_stock_label: payload.customStockLabel,
            cost_price_usd: payload.costPriceUSD, seller_id: payload.sellerId
          },
          images: (payload.additionalImages || []).map((url: string, index: number) => ({ url, media_type: 'image', display_order: index + 1 }))
        });
      }
      showToast(editing ? 'Product updated successfully.' : 'Product created successfully.', 'success');
      setEditing(null);
    } catch (e: any) { showToast(e?.message || 'Unable to save product.', 'error'); }
    finally { setSaving(false); }
  };

  const bulkPublish = async (published: boolean) => {
    if (!selected.size) return;
    await Promise.allSettled([...selected].map(id => updateProduct(id, { isPublished: published })));
    showToast(`${selected.size} product(s) ${published ? 'published live' : 'saved as drafts'}.`, 'success');
  };
  const bulkDelete = async () => {
    if (!selected.size || !window.confirm(`Delete ${selected.size} selected product(s)? This cannot be undone.`)) return;
    await deleteMultipleProducts([...selected]);
    setSelected(new Set());
  };

  const move = (index: number, direction: -1 | 1) => {
    const next = [...sequence]; const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setSequence(next); setOrderDirty(true);
  };
  const makeFirst = (index: number) => {
    if (index <= 0) return;
    const next = [...sequence]; const [item] = next.splice(index, 1); next.unshift(item);
    setSequence(next); setOrderDirty(true);
  };
  const saveOrder = async () => {
    await reorderProducts(sequence); setOrderDirty(false); showToast(`Saved storefront sequence for ${sequence.length} products.`, 'success');
  };
  const goToRank = (index: number, value: string) => {
    const rank = Number(value);
    if (!Number.isInteger(rank) || rank < 1 || rank > sequence.length) return;
    const next = [...sequence]; const [item] = next.splice(index, 1); next.splice(rank - 1, 0, item);
    setSequence(next); setOrderDirty(true);
  };

  const saveQuick = async (p: Product) => {
    const q = quickValues[p.id] || { price: String(p.priceUSD), stock: String(p.stock) };
    const price = Number(q.price), stock = Number(q.stock);
    if (!Number.isFinite(price) || price <= 0 || !Number.isInteger(stock) || stock < 0) return showToast('Enter a valid price and whole-number stock.', 'warning');
    await updateProduct(p.id, { priceUSD: price, stock });
    showToast(`${p.name} price/stock updated.`, 'success');
  };

  const downloadCatalog = () => csvDownload(filtered.map(p => ({
    id: p.id, seller_item_code: p.sellerItemCode || '', name_en: p.name, name_ar: p.arabicName || '', seller: p.seller || p.artisan || '', category: p.category || '', price_usd: p.priceUSD || 0, stock: p.stock || 0, status: p.isPublished === false ? 'Draft' : 'Published', image: p.image || ''
  })), `yalla_catalog_${new Date().toISOString().slice(0, 10)}.csv`);

  const downloadMaster = () => downloadFullMasterReport(products, sellers, orders, 'yalla_full_master_report');

  const handleBulkUpload = (file?: File) => {
    if (!file) return;
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: async (result: any) => {
        const rows = result.data || [];
        let created = 0;
        for (const row of rows) {
          const name = String(row.name_en || row.name || row.product_name_en || '').trim();
          if (!name) continue;
          const price = Number(row.price_usd ?? row.priceUSD ?? row.price ?? 0);
          const stock = Number(row.stock ?? row.stock_quantity ?? 0);
          if (!Number.isFinite(price) || price <= 0 || !Number.isInteger(stock) || stock < 0) continue;
          try {
            await addProduct({ name, arabicName: row.name_ar || row.product_name_ar || undefined, category: row.category || 'grocery', seller: row.seller || row.seller_name_en || 'Independent Artisan', artisan: row.artisan || row.seller || 'Independent Artisan', origin: row.origin || 'Lebanon', priceUSD: price, stock, image: row.image || row.image_url || '', sellerItemCode: row.seller_item_code || undefined, isPublished: String(row.status || '').toLowerCase() === 'published' });
            created++;
          } catch { /* keep valid rows importing */ }
        }
        showToast(`Bulk upload complete: ${created} product(s) imported.`, created ? 'success' : 'warning');
      }, error: () => showToast('Could not read the CSV file.', 'error')
    });
  };

  const setQuick = (p: Product, key: 'price' | 'stock', value: string) => setQuickValues(v => ({ ...v, [p.id]: { ...(v[p.id] || { price: String(p.priceUSD), stock: String(p.stock) }), [key]: value } }));

  const ProductCard = ({ p, index }: { p: Product; index: number }) => {
    const q = quickValues[p.id] || { price: String(p.priceUSD ?? 0), stock: String(p.stock ?? 0) };
    const published = p.isPublished !== false;
    const stockState = Number(p.stock) <= 0 ? 'out' : Number(p.stock) <= 5 ? 'low' : 'ok';
    return <article className="bg-white border border-slate-200 rounded-2xl p-3 shadow-sm hover:shadow-md transition-shadow">
      <div className={`rounded-xl border ${index === 0 && viewMode === 'sequence' ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200'} p-2 mb-2`}>
        <div className="flex items-center gap-2 text-[11px] font-bold">
          <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} className="w-4 h-4 rounded border-slate-300 text-indigo-600" />
          <span className="px-2 py-0.5 rounded-full bg-slate-50 text-slate-900">#{index + 1}</span>
          {index === 0 ? <button onClick={() => makeFirst(index)} className="ml-auto px-2 py-1 rounded-full bg-amber-400 text-slate-900 text-[10px] font-black"><Crown className="inline w-3 h-3 mr-1"/>#1</button> : <button onClick={() => makeFirst(index)} className="ml-auto px-2 py-1 rounded-full bg-amber-400/90 text-slate-900 text-[10px] font-black">Make #1</button>}
          <button onClick={() => move(index, -1)} className="p-1 text-slate-500 hover:text-indigo-600" title="Move up"><ArrowUp className="w-3.5 h-3.5"/></button>
          <button onClick={() => move(index, 1)} className="p-1 text-slate-500 hover:text-indigo-600" title="Move down"><ArrowDown className="w-3.5 h-3.5"/></button>
        </div>
        <div className="flex items-center gap-1.5 mt-1.5 pl-6 text-[9px] text-slate-500">
          <span className="font-semibold">Move to:</span>
          <input aria-label={`Move ${p.name}`} defaultValue={index + 1} onKeyDown={e => { if (e.key === 'Enter') goToRank(index, (e.target as HTMLInputElement).value); }} className="w-16 h-5 px-2 rounded-full border border-slate-200 text-center text-[9px]" />
          <button onClick={e => goToRank(index, (e.currentTarget.previousElementSibling as HTMLInputElement).value)} className="px-2 h-5 rounded-full bg-indigo-100 text-indigo-600 font-black">Go</button>
        </div>
      </div>
      <div className="relative rounded-xl bg-slate-50 border border-slate-200 overflow-hidden aspect-[1.18/1] flex items-center justify-center">
        <img src={p.image} alt={p.name} className="w-full h-full object-contain" />
        <span className="absolute top-2 right-2 px-2 py-1 rounded-full bg-slate-50 text-slate-900 text-[11px] font-black shadow">${Number(p.priceUSD || 0).toFixed(2)}</span>
        {!published && <span className="absolute top-2 left-2 px-2 py-1 rounded-full bg-amber-100 text-amber-700 text-[10px] font-black">DRAFT</span>}
      </div>
      <div className="pt-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0"><h3 className="font-black text-sm text-slate-900 truncate">{p.name}</h3><p className="text-[11px] text-slate-500 truncate">{p.seller || p.artisan || 'Independent Artisan'}</p></div>
          <span className={`shrink-0 px-2 py-0.5 rounded-full text-[9px] font-black ${published ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{published ? 'LIVE' : 'HIDDEN'}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <label className="text-[9px] font-bold text-slate-500">PRICE<input value={q.price} onChange={e => setQuick(p, 'price', e.target.value)} type="number" step="0.01" className="mt-1 w-full px-2 py-1.5 rounded-lg border border-slate-200 font-bold text-xs text-slate-900" /></label>
          <label className="text-[9px] font-bold text-slate-500">STOCK<input value={q.stock} onChange={e => setQuick(p, 'stock', e.target.value)} type="number" className="mt-1 w-full px-2 py-1.5 rounded-lg border border-slate-200 font-bold text-xs text-slate-900" /></label>
        </div>
        <div className="flex items-center justify-between mt-2 text-[10px]">
          <span className={`font-bold ${stockState === 'out' ? 'text-rose-600' : stockState === 'low' ? 'text-amber-600' : 'text-emerald-600'}`}>{stockState === 'out' ? 'Out of stock' : stockState === 'low' ? 'Low stock' : `${p.stock} in stock`}</span>
          <span className="text-slate-500 truncate max-w-[120px]">{p.category}</span>
        </div>
        <div className="flex gap-1.5 mt-3 pt-2 border-t border-slate-100">
          <button onClick={() => saveQuick(p)} className="flex-1 px-2 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-[10px] font-black">Save Price/Stock</button>
          <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600" title="Edit"><Pencil className="w-3.5 h-3.5"/></button>
          <button onClick={() => updateProduct(p.id, { isPublished: !published })} className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600" title={published ? 'Hide' : 'Publish'}>{published ? <EyeOff className="w-3.5 h-3.5"/> : <Eye className="w-3.5 h-3.5"/>}</button>
          <button onClick={() => deleteProduct(p.id)} className="p-1.5 rounded-lg bg-rose-50 text-rose-600" title="Delete"><Trash2 className="w-3.5 h-3.5"/></button>
        </div>
      </div>
    </article>;
  };

  const Modal = () => <div className="fixed inset-0 z-[70] bg-slate-50/50 backdrop-blur-sm flex items-center justify-center p-4"><div className="bg-white rounded-3xl w-full max-w-5xl max-h-[94vh] overflow-y-auto p-6 shadow-2xl"><div className="flex items-center justify-between mb-5"><div><h3 className="text-2xl font-black">{editing ? 'Edit Product' : 'Add Product'}</h3><p className="text-xs text-slate-500 mt-1">All product data remains managed through the Supabase catalog.</p></div><button onClick={() => setEditing(null)} className="p-2 rounded-xl hover:bg-slate-100"><X/></button></div><div className="grid md:grid-cols-2 gap-4">{['name','arabicName','category','seller','arabicSeller','origin','sellerItemCode','priceUSD','originalPriceUSD','discountPercentage','stock','lowStockThreshold','lowStockNotice','customStockLabel','costPriceUSD','weightOrVolume','displayOrder','image'].map((k) => <label key={k} className="text-sm font-bold text-slate-700">{k}<input value={form[k] ?? ''} onChange={e => setForm((v:any) => ({...v, [k]: ['priceUSD','originalPriceUSD','discountPercentage','stock','lowStockThreshold','costPriceUSD','displayOrder'].includes(k) ? Number(e.target.value) : e.target.value}))} className="mt-1 w-full px-3 py-2.5 rounded-xl border border-slate-200" /></label>)}</div><div className="grid md:grid-cols-2 gap-4 mt-4">{['description','craftStory','seoTitle','seoArabicTitle','seoDescription','seoArabicDescription'].map(k => <label key={k} className="text-sm font-bold text-slate-700">{k}<textarea value={form[k] ?? ''} onChange={e => setForm((v:any) => ({...v,[k]:e.target.value}))} rows={3} className="mt-1 w-full px-3 py-2.5 rounded-xl border border-slate-200"/></label>)}</div><div className="flex flex-wrap gap-4 mt-4 text-sm font-semibold">{[['isNewArrival','New Arrival'],['isFeatured','Featured'],['isBestseller','Bestseller']].map(([k,l]) => <label key={k}><input type="checkbox" checked={!!form[k]} onChange={e=>setForm((v:any)=>({...v,[k]:e.target.checked}))}/> <span className="ml-1">{l}</span></label>)}</div><div className="flex justify-end gap-2 mt-6 pt-4 border-t"><button onClick={()=>setEditing(null)} className="px-4 py-2.5 rounded-xl bg-slate-100 font-bold">Cancel</button><button disabled={saving} onClick={()=>saveProduct(false)} className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-900 font-bold">Save Draft</button><button disabled={saving} onClick={()=>saveProduct(true)} className="px-4 py-2.5 rounded-xl bg-indigo-600 text-slate-900 font-bold">{saving ? 'Saving…' : 'Save & Publish'}</button></div></div></div>;

  return <section className="space-y-4 text-slate-900">
    <div className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm">
      <div className="flex items-start gap-3"><div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center"><Package className="w-5 h-5"/></div><div><h2 className="text-2xl font-black tracking-tight">Products &amp; Catalog Management</h2><p className="text-xs text-slate-500 mt-0.5">Publish, hide, inline edit stock &amp; price, or add new artisanal products with cloud sync.</p></div></div>
      <div className="flex flex-wrap gap-2 mt-5">
        <button onClick={downloadMaster} className="px-3 py-2 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 text-[11px] font-black flex items-center gap-1.5"><Download className="w-3.5 h-3.5"/>Download Full Master Report</button>
        <button onClick={downloadCatalog} className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 text-[11px] font-black flex items-center gap-1.5"><FileSpreadsheet className="w-3.5 h-3.5"/>Catalog CSV</button>
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={e=>{handleBulkUpload(e.target.files?.[0]);e.currentTarget.value='';}}/>
        <button onClick={()=>fileRef.current?.click()} className="px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 text-[11px] font-black flex items-center gap-1.5"><Upload className="w-3.5 h-3.5"/>Bulk Upload CSV</button>
        <button onClick={()=>bulkPublish(false)} disabled={!selected.size} className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 text-[11px] font-black flex items-center gap-1.5 disabled:opacity-50"><Save className="w-3.5 h-3.5"/>Save Drafts</button>
        <button onClick={()=>bulkPublish(true)} disabled={!selected.size} className="px-3 py-2 rounded-xl bg-emerald-600 text-slate-900 text-[11px] font-black flex items-center gap-1.5 disabled:opacity-50"><CheckCircle2 className="w-3.5 h-3.5"/>Public Publish Live</button>
        <button onClick={()=>{setForm(emptyProduct());setEditing({} as Product);}} className="px-4 py-2 rounded-xl bg-indigo-600 text-slate-900 text-[11px] font-black flex items-center gap-1.5"><Plus className="w-3.5 h-3.5"/>ADD PRODUCT</button>
      </div>
    </div>

    <div className="bg-white border border-slate-200 rounded-2xl p-2.5 shadow-sm flex flex-col xl:flex-row gap-2.5">
      <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search by title, seller / artisan, origin, category, keywords..." className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-xs outline-none focus:border-indigo-400"/></div>
      <label className="flex items-center gap-2 text-[10px] font-black text-slate-500">SELLER<select value={sellerFilter} onChange={e=>setSellerFilter(e.target.value)} className="min-w-[170px] px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700"><option value="all">All Sellers ({sellers.length})</option>{sellers.map((s:any)=><option key={s.id} value={s.id}>{s.nameEn}</option>)}</select></label>
      <label className="flex items-center gap-2 text-[10px] font-black text-slate-500">STATUS<select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} className="min-w-[130px] px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700"><option value="all">All ({products.length})</option><option value="published">Published</option><option value="hidden">Hidden / Draft</option></select></label>
      <label className="flex items-center gap-2 text-[10px] font-black text-slate-500">CATEGORY<select value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)} className="min-w-[180px] px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700"><option value="all">All Categories</option>{categories.map((c:any)=><option key={c.id} value={c.id}>{c.nameEn || c.name}</option>)}</select></label>
    </div>

    <div className="bg-white border border-slate-200 rounded-2xl px-3 py-2.5 shadow-sm flex items-center justify-between gap-3"><button onClick={toggleAll} className="flex items-center gap-2 text-xs font-bold text-slate-700"><input type="checkbox" readOnly checked={allSelected} className="w-4 h-4 rounded border-slate-300 text-indigo-600"/>{allSelected ? 'Clear Selection' : `Select All (${filtered.length})`}</button><div className="flex gap-1.5">{selected.size>0 && <><button onClick={()=>bulkPublish(true)} className="px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-[10px] font-black">Publish {selected.size}</button><button onClick={()=>bulkPublish(false)} className="px-2.5 py-1.5 rounded-lg bg-amber-50 text-amber-700 text-[10px] font-black">Draft {selected.size}</button><button onClick={bulkDelete} className="px-2.5 py-1.5 rounded-lg bg-rose-50 text-rose-700 text-[10px] font-black">Delete</button></>}</div></div>

    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center"><GripVertical className="w-4 h-4"/></div><div><h3 className="font-black text-sm">Product Display Sequence &amp; Ranking</h3><p className="text-[10px] text-slate-500">Easily jump any product to #1, move positions, or sort with presets to control the exact storefront order.</p></div></div><div className="flex items-center rounded-xl border border-slate-200 p-0.5 bg-slate-50"><button onClick={()=>setViewMode('grid')} className={`px-3 py-1.5 rounded-lg text-[10px] font-black ${viewMode==='grid'?'bg-white text-indigo-600 shadow-sm':'text-slate-500'}`}>▦ Grid Cards</button><button onClick={()=>setViewMode('sequence')} className={`px-3 py-1.5 rounded-lg text-[10px] font-black ${viewMode==='sequence'?'bg-white text-indigo-600 shadow-sm':'text-slate-500'}`}>☷ Organize Sequence</button><button onClick={saveOrder} disabled={!orderDirty} className="ml-1 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-500 text-[10px] font-black disabled:opacity-50">Save Products Order</button></div></div></div>

    {viewMode === 'sequence' && <div className="bg-indigo-50/60 border border-indigo-100 rounded-2xl p-3 text-[10px] text-indigo-800 font-semibold">Sequence mode uses the filtered products above. Reorder with arrows, Make #1, or type an exact rank and press Go. Save Products Order writes the sequence to the catalog.</div>}
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">{sequence.map((p,i)=><ProductCard key={p.id} p={p} index={i}/>)}</div>
    {!sequence.length && <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-12 text-center"><AlertTriangle className="w-7 h-7 mx-auto text-slate-600"/><p className="mt-2 text-sm font-bold text-slate-500">No products match the current filters.</p></div>}
    {editing && <Modal/>}
  </section>;
};

export default ProductsCatalogManagement;
