import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, X, ListOrdered, Save, PackageOpen, Loader2 } from 'lucide-react';
import { useShop } from '../../context/ShopContext';
import { useDialog } from '../../hooks/useDialog';
import { checkDuplicateProductNumber } from '../../lib/productValidation';
import { normalizeAdminProductPayload, validateAdminProductInput, ADMIN_PRODUCT_DEFAULTS } from '../../lib/adminBehavior';
import { secureRandomInt } from '../../utils/uuid';
import { supabaseProductService } from '../../services/supabaseProductService';
import type { Product } from '../../types';

const PAGE_SIZE = 24;

const blank = () => ({
  name: '', arabicName: '', category: '', artisan: '', seller: '', arabicSeller: '', sellerId: '',
  brand: '', origin: String(ADMIN_PRODUCT_DEFAULTS.origin), priceUSD: '' as string | number, originalPriceUSD: '', discountPercentage: '',
  stock: ADMIN_PRODUCT_DEFAULTS.stock as string | number, lowStockThreshold: ADMIN_PRODUCT_DEFAULTS.lowStockThreshold as string | number,
  lowStockNotice: '', customStockLabel: '', costPriceUSD: '', image: '', additionalImages: [] as string[],
  videoUrl: '', weightOrVolume: '', tagsInput: '', keywordsInput: '',
  arabicKeywordsInput: '', sellerItemCode: 'SIC-' + secureRandomInt(100000, 1000000), description: '',
  craftStory: '', seoTitle: '', seoArabicTitle: '', seoDescription: '', seoArabicDescription: '',
  isNewArrival: true, isFeatured: false, isBestseller: false, isPublished: false, displayOrder: ''
});

type FormState = ReturnType<typeof blank>;

const csv = (value: unknown) => String(value ?? '').split(',').map(x => x.trim()).filter(Boolean);

/**
 * Field and Text are declared at module scope on purpose.
 *
 * They used to be defined inside the component body, so their function
 * identity changed on every render. React then treated each one as a different
 * component type, unmounting and remounting the <input> on every keystroke,
 * which dropped focus after each character typed.
 */
const Field: React.FC<{
  label: string; k: keyof FormState; value: any; onChange: (k: keyof FormState, v: any) => void;
  type?: string; optional?: boolean; required?: boolean;
}> = ({ label, k, value, onChange, type = 'text', optional = false, required = false }) => (
  <label className="space-y-1 text-sm">
    <span className="font-semibold">
      {label}
      {required && <span className="text-rose-600" aria-hidden="true"> *</span>}
      {optional ? ' (optional)' : ''}
    </span>
    <input
      type={type}
      value={value ?? ''}
      required={required}
      onChange={e => onChange(k, e.target.value)}
      className="w-full border rounded-xl px-3 py-2.5"
    />
  </label>
);

const Text: React.FC<{
  label: string; k: keyof FormState; value: any; onChange: (k: keyof FormState, v: any) => void; optional?: boolean;
}> = ({ label, k, value, onChange, optional = false }) => (
  <label className="space-y-1 text-sm">
    <span className="font-semibold">{label}{optional ? ' (optional)' : ''}</span>
    <textarea value={value ?? ''} onChange={e => onChange(k, e.target.value)} rows={3} className="w-full border rounded-xl px-3 py-2.5" />
  </label>
);

export default function AdminProductManager() {
  const s = useShop() as any;
  const products: Product[] = s.products ?? [];
  const sellers = s.sellers ?? [];
  const categories = s.categories ?? [];
  const catalogStatus: string = s.catalogStatus ?? 'ready';
  const toast = s.showToast ?? (() => {});
  const update = s.updateProduct ?? (async () => {});
  const remove = s.deleteProduct ?? (async () => {});
  const removeMany = s.deleteMultipleProducts ?? (async () => {});
  const reorder = s.reorderProducts ?? (async () => {});
  const reload = s.syncAllProductsToDatabase ?? (async () => {});

  const [form, setForm] = useState<FormState>(blank());
  const [editing, setEditing] = useState<Product | null>(null);
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState('');
  const [seller, setSeller] = useState('all');
  const [category, setCategory] = useState('all');
  const [state, setState] = useState('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [ordering, setOrdering] = useState(false);
  const [ordered, setOrdered] = useState<Product[]>([]);
  const [dirty, setDirty] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [busyBulk, setBusyBulk] = useState(false);
  const [page, setPage] = useState(1);

  const closeModal = () => setModal(false);
  const { containerRef } = useDialog({ isOpen: modal, onClose: closeModal });
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => setOrdered([...products].sort((a, b) => (a.displayOrder ?? 999999) - (b.displayOrder ?? 999999))), [products]);
  useEffect(() => { setPage(1); }, [q, seller, category, state]);

  const filtered = useMemo(() => products.filter(p => {
    const x = q.toLowerCase().trim();
    const hit = !x || [p.name, p.arabicName, p.seller, p.artisan, p.sellerItemCode, p.id, p.description, ...(p.keywords || []), ...(p.arabicKeywords || [])]
      .filter(Boolean).some(v => String(v).toLowerCase().includes(x));
    // Product.category holds the Supabase category UUID, so the filter must
    // compare against that and not against a display name.
    return hit && (seller === 'all' || p.sellerId === seller)
      && (category === 'all' || p.category === category)
      && (state === 'all' || (state === 'published' ? p.isPublished !== false : p.isPublished === false));
  }), [products, q, seller, category, state]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  );

  const set = (k: keyof FormState, v: any) => setForm((x: FormState) => ({ ...x, [k]: v }));

  const openNew = () => { setForm(blank()); setEditing(null); setModal(true); };

  /**
   * Builds the edit form from the product alone.
   *
   * This used to spread `{ ...blank(), ...p }`. blank() mints a fresh random
   * seller item code and carries defaults such as priceUSD and stock, so any
   * field missing on the product silently inherited a fabricated value and was
   * written back on save.
   */
  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({
      ...blank(),
      name: p.name ?? '',
      arabicName: p.arabicName ?? '',
      category: p.category ?? '',
      artisan: p.artisan ?? '',
      seller: p.seller ?? '',
      arabicSeller: p.arabicSeller ?? '',
      sellerId: p.sellerId ?? '',
      brand: (p as any).brand ?? '',
      origin: p.origin ?? '',
      priceUSD: (p.priceUSD ?? '') as any,
      originalPriceUSD: (p.originalPriceUSD ?? '') as any,
      discountPercentage: (p.discountPercentage ?? '') as any,
      stock: (p.stock ?? '') as any,
      lowStockThreshold: (p.lowStockThreshold ?? '') as any,
      lowStockNotice: p.lowStockNotice ?? '',
      customStockLabel: p.customStockLabel ?? '',
      costPriceUSD: (p.costPriceUSD ?? '') as any,
      image: p.image ?? '',
      additionalImages: p.additionalImages ?? [],
      videoUrl: p.videoUrl ?? '',
      weightOrVolume: p.weightOrVolume ?? '',
      sellerItemCode: p.sellerItemCode ?? '',
      description: p.description ?? '',
      craftStory: p.craftStory ?? '',
      seoTitle: p.seoTitle ?? '',
      seoArabicTitle: p.seoArabicTitle ?? '',
      seoDescription: p.seoDescription ?? '',
      seoArabicDescription: p.seoArabicDescription ?? '',
      isNewArrival: p.isNewArrival ?? false,
      isFeatured: p.isFeatured ?? false,
      isBestseller: p.isBestseller ?? false,
      isPublished: p.isPublished ?? false,
      displayOrder: (p.displayOrder ?? '') as any,
      tagsInput: (p.tags || []).join(', '),
      keywordsInput: (p.keywords || []).join(', '),
      arabicKeywordsInput: (p.arabicKeywords || []).join(', '),
    });
    setModal(true);
  };

  const save = async (published: boolean) => {
    const v = validateAdminProductInput(form as any);
    if (!v.valid) { toast(v.message, 'warning'); return; }
    if (form.sellerItemCode) {
      const d = checkDuplicateProductNumber(form.sellerItemCode, editing?.id || null, products, form.sellerId || undefined, form.seller || form.artisan);
      if (d.isDuplicate) { toast(`Duplicate seller item code: "${form.sellerItemCode}" is already in use by "${d.conflictingProduct?.name}".`, 'error'); return; }
    }
    setSaving(true);
    try {
      const normalized = normalizeAdminProductPayload({
        ...(form as any),
        tags: csv(form.tagsInput), keywords: csv(form.keywordsInput), arabicKeywords: csv(form.arabicKeywordsInput)
      }, published);

      if (editing) {
        await update(editing.id, normalized);
      } else {
        const productPayload: Record<string, unknown> = {
          name: normalized.name,
          arabic_name: normalized.arabicName,
          artisan: normalized.artisan,
          seller_id: normalized.sellerId || null,
          seller_item_code: normalized.sellerItemCode,
          origin: normalized.origin,
          // Product.category carries the Supabase category UUID. It used to be
          // sent as both `category` and `category_id` from a free-text input,
          // which the uuid cast in the RPC could never accept.
          category_id: form.category,
          price_usd: normalized.priceUSD,
          original_price_usd: normalized.originalPriceUSD,
          discount_percentage: normalized.discountPercentage,
          image: normalized.image,
          video_url: normalized.videoUrl,
          description: normalized.description,
          craft_story: normalized.craftStory,
          stock: normalized.stock,
          is_new_arrival: normalized.isNewArrival,
          is_featured: normalized.isFeatured,
          is_bestseller: normalized.isBestseller,
          is_published: published,
          display_order: normalized.displayOrder,
          low_stock_threshold: normalized.lowStockThreshold,
          low_stock_notice: normalized.lowStockNotice,
          custom_stock_label: normalized.customStockLabel,
          cost_price_usd: normalized.costPriceUSD,
          tags: normalized.tags,
          keywords: normalized.keywords,
          arabic_keywords: normalized.arabicKeywords,
          seo_title: normalized.seoTitle,
          seo_arabic_title: normalized.seoArabicTitle,
          seo_description: normalized.seoDescription,
          seo_arabic_description: normalized.seoArabicDescription,
          weight_or_volume: normalized.weightOrVolume,
          brand: (normalized as any).brand ?? '',
          publish_status: published ? 'published' : 'draft'
        };
        await supabaseProductService.createProduct({
          product: productPayload,
          privateData: {
            seller_id: normalized.sellerId || null,
            seller_item_code: normalized.sellerItemCode,
            low_stock_threshold: normalized.lowStockThreshold,
            low_stock_notice: normalized.lowStockNotice,
            custom_stock_label: normalized.customStockLabel,
            cost_price_usd: normalized.costPriceUSD
          },
          images: (normalized.additionalImages || []).map((url, i) => ({ url, media_type: 'image', display_order: i + 1 }))
        });
        await reload();
      }
      toast(editing
        ? (published ? `Product "${form.name}" updated & published to Public Store!` : `Product "${form.name}" updated & saved as Draft.`)
        : (published ? `Product "${form.name}" published live to Public Catalog!` : `Product "${form.name}" saved as Draft (Unpublished).`), 'success');
      setModal(false);
    } catch (e: any) {
      toast(e?.message || 'Unable to save product.', 'error');
    } finally { setSaving(false); }
  };

  /**
   * Bulk publish/hide.
   *
   * Promise.allSettled never rejects, so this previously reported success even
   * when every single write had failed. Results are now partitioned and the
   * failures reported, with the failed ids left selected for a retry.
   */
  const bulk = async (published: boolean) => {
    const ids = [...selected];
    if (!ids.length) return;
    setBusyBulk(true);
    try {
      const results = await Promise.allSettled(ids.map(id => update(id, { isPublished: published })));
      const failedIds = ids.filter((_, i) => results[i].status === 'rejected');
      const okCount = ids.length - failedIds.length;
      setSelected(new Set(failedIds));

      if (!failedIds.length) {
        toast(`${okCount} product(s) updated.`, 'success');
        return;
      }
      const firstError = results.find(r => r.status === 'rejected') as PromiseRejectedResult | undefined;
      toast(
        `${okCount} of ${ids.length} product(s) updated. ${failedIds.length} failed: ${firstError?.reason?.message || 'unknown error'}`,
        'error',
      );
    } finally { setBusyBulk(false); }
  };

  const bulkDelete = async () => {
    if (!selected.size) return;
    if (!window.confirm(`Are you sure you want to delete ${selected.size} selected products? This cannot be undone.`)) return;
    setBusyBulk(true);
    try {
      await removeMany([...selected]);
      setSelected(new Set());
    } catch (e: any) {
      toast(e?.message || 'Could not delete the selected products.', 'error');
    } finally { setBusyBulk(false); }
  };

  const deleteOne = async (p: Product) => {
    if (!window.confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
    try {
      await remove(p.id);
    } catch (e: any) {
      toast(e?.message || 'Could not delete the product.', 'error');
    }
  };

  const saveOrder = async () => {
    setSavingOrder(true);
    try {
      await reorder(ordered);
      setDirty(false);
      toast(`Saved sequence order for all ${ordered.length} products to database!`, 'success');
    } catch (e: any) {
      toast(e?.message || 'Could not save the product order.', 'error');
    } finally { setSavingOrder(false); }
  };

  const categoryName = (id?: string) => categories.find((c: any) => c.id === id)?.nameEn || '—';

  return <section className="space-y-5">
    <div className="flex justify-between gap-3 flex-wrap"><div><h2 className="text-2xl font-black">Products &amp; Inventory Catalog</h2><p className="text-sm text-slate-500">Manage products, prices, stock, media, SEO, publishing and seller ownership.</p></div><div className="flex gap-2"><button onClick={() => setOrdering(!ordering)} className="px-3 py-2 rounded-xl bg-slate-100 font-bold"><ListOrdered className="inline w-4 mr-1" />Product Order</button><button onClick={openNew} className="px-4 py-2.5 rounded-xl bg-blue-600 text-white font-bold"><Plus className="inline w-4 mr-1" />Add Product</button></div></div>

    {ordering && <div className="bg-white border rounded-2xl p-4"><div className="flex justify-between"><b>Product Sequence</b><button disabled={!dirty || savingOrder} onClick={saveOrder} className="px-3 py-2 rounded-xl bg-blue-600 text-white font-bold disabled:opacity-50">{savingOrder ? <Loader2 className="inline w-4 mr-1 animate-spin" /> : <Save className="inline w-4 mr-1" />}Save Products Order</button></div>{ordered.map((p, i) => <div key={p.id} className="flex gap-3 py-2 border-t mt-2 items-center"><b>#{i + 1}</b><span className="flex-1">{p.name}</span><button aria-label={`Move ${p.name} up`} disabled={!i} onClick={() => { const n = [...ordered]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; setOrdered(n); setDirty(true); }} className="px-2 py-1 rounded-lg bg-slate-100 disabled:opacity-40">↑</button><button aria-label={`Move ${p.name} down`} disabled={i === ordered.length - 1} onClick={() => { const n = [...ordered]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; setOrdered(n); setDirty(true); }} className="px-2 py-1 rounded-lg bg-slate-100 disabled:opacity-40">↓</button></div>)}</div>}

    <div className="grid lg:grid-cols-4 gap-3"><input value={q} onChange={e => setQ(e.target.value)} aria-label="Search products" placeholder="Search Arabic, English, SKU, seller, keywords..." className="lg:col-span-2 border rounded-2xl px-4 py-3" /><select value={seller} onChange={e => setSeller(e.target.value)} aria-label="Filter by seller" className="border rounded-2xl px-3 py-3"><option value="all">All Sellers</option>{sellers.map((x: any) => <option key={x.id} value={x.id}>{x.nameEn || x.name}</option>)}</select><select value={state} onChange={e => setState(e.target.value)} aria-label="Filter by publish state" className="border rounded-2xl px-3 py-3"><option value="all">All Publish States</option><option value="published">Published</option><option value="hidden">Hidden / Draft</option></select></div>

    <div className="flex gap-2 flex-wrap items-center"><select value={category} onChange={e => setCategory(e.target.value)} aria-label="Filter by category" className="border rounded-xl px-3 py-2"><option value="all">All Categories</option>{categories.map((x: any) => <option key={x.id} value={x.id}>{x.nameEn || x.name}</option>)}</select><button onClick={() => setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map(p => p.id)))} className="px-3 py-2 rounded-xl bg-slate-100 font-bold">{selected.size === filtered.length && filtered.length ? 'Clear Selection' : 'Select All'}</button>{selected.size > 0 && <><span className="text-xs text-slate-500">{selected.size} selected</span><button disabled={busyBulk} onClick={() => bulk(true)} className="px-3 py-2 rounded-xl bg-emerald-100 font-bold disabled:opacity-50">Publish Selected</button><button disabled={busyBulk} onClick={() => bulk(false)} className="px-3 py-2 rounded-xl bg-amber-100 font-bold disabled:opacity-50">Hide Selected</button><button disabled={busyBulk} onClick={bulkDelete} className="px-3 py-2 rounded-xl bg-rose-100 font-bold disabled:opacity-50">Delete Selected</button></>}</div>

    {catalogStatus === 'loading' && <div className="bg-white border rounded-2xl p-10 text-center text-slate-500 flex items-center justify-center gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Loading catalogue…</div>}

    {catalogStatus !== 'loading' && filtered.length === 0 && <div className="bg-white border rounded-2xl p-10 text-center"><PackageOpen className="w-10 h-10 mx-auto text-slate-300" /><h3 className="mt-3 font-bold text-slate-700">{products.length === 0 ? 'No products yet' : 'No products match these filters'}</h3><p className="text-sm text-slate-500 mt-1">{products.length === 0 ? 'Create your first product to populate the catalogue.' : 'Try clearing the search or filters.'}</p>{products.length === 0 && <button onClick={openNew} className="mt-4 px-4 py-2.5 rounded-xl bg-blue-600 text-white font-bold"><Plus className="inline w-4 mr-1" />Add Product</button>}</div>}

    <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{visible.map(p => <article key={p.id} className="bg-white border rounded-2xl p-4"><div className="flex gap-3"><input type="checkbox" aria-label={`Select ${p.name}`} checked={selected.has(p.id)} onChange={e => { const n = new Set(selected); e.target.checked ? n.add(p.id) : n.delete(p.id); setSelected(n); }} /><img src={p.image} alt={p.name} loading="lazy" onError={e => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }} className="w-20 h-20 object-contain rounded-xl bg-slate-50 shrink-0" /><div className="min-w-0"><b className="block truncate">{p.name}</b><span className="text-xs text-slate-500 block truncate">{p.seller || p.artisan || '—'}</span><span className="block text-xs text-slate-400 truncate">{categoryName(p.category)}</span><span className="block text-xs font-mono text-slate-400 truncate">{p.sellerItemCode || p.id}</span></div></div><div className="flex justify-between mt-3"><b>${Number(p.priceUSD || 0).toFixed(2)}</b><span className="text-xs">Stock: {p.stock}</span></div><div className="flex justify-end gap-2 mt-3"><button onClick={() => update(p.id, { isPublished: p.isPublished === false })} className="px-2 py-1 rounded-lg bg-slate-100">{p.isPublished === false ? 'Publish' : 'Hide'}</button><button onClick={() => openEdit(p)} className="px-2 py-1 rounded-lg bg-slate-100">Edit</button><button aria-label={`Delete ${p.name}`} onClick={() => deleteOne(p)} className="p-2 text-rose-600"><Trash2 className="w-4" /></button></div></article>)}</div>

    {pageCount > 1 && <div className="flex items-center justify-center gap-3 pt-2"><button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-2 rounded-xl bg-slate-100 font-bold disabled:opacity-40">Previous</button><span className="text-sm text-slate-500">Page {page} of {pageCount} · {filtered.length} product(s)</span><button disabled={page >= pageCount} onClick={() => setPage(p => p + 1)} className="px-3 py-2 rounded-xl bg-slate-100 font-bold disabled:opacity-40">Next</button></div>}

    {modal && <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={editing ? 'Edit product' : 'Add product'}>
      <div ref={containerRef} className="bg-white rounded-3xl w-full max-w-5xl max-h-[94vh] overflow-y-auto p-6">
        <div className="flex justify-between mb-5"><div><h3 className="text-2xl font-black">{editing ? 'Edit Product' : 'Add Product'}</h3><p className="text-sm text-slate-500">Only Product Name, Category and Price are required. All other fields are optional.</p></div><button onClick={closeModal} aria-label="Close"><X /></button></div>

        <div className="grid md:grid-cols-2 gap-4">
          <label className="space-y-1 text-sm"><span className="font-semibold">Product Name<span className="text-rose-600" aria-hidden="true"> *</span></span><input ref={firstFieldRef} value={form.name} onChange={e => set('name', e.target.value)} className="w-full border rounded-xl px-3 py-2.5" /></label>
          <Field label="Arabic Product Name" k="arabicName" value={form.arabicName} onChange={set} optional />

          <label className="space-y-1 text-sm"><span className="font-semibold">Category<span className="text-rose-600" aria-hidden="true"> *</span></span>
            <select value={form.category} onChange={e => set('category', e.target.value)} className="w-full border rounded-xl px-3 py-2.5 bg-white">
              <option value="">Select a category…</option>
              {categories.map((c: any) => <option key={c.id} value={c.id}>{c.nameEn || c.name}</option>)}
            </select>
            {categories.length === 0 && <span className="text-xs text-amber-700">No categories exist yet. Create one in Categories &amp; Details first.</span>}
          </label>

          <label className="space-y-1 text-sm"><span className="font-semibold">Seller / Workshop (optional)</span>
            <select value={form.sellerId} onChange={e => {
              const picked = sellers.find((x: any) => x.id === e.target.value);
              setForm(f => ({ ...f, sellerId: e.target.value, seller: picked?.nameEn || '', arabicSeller: picked?.nameAr || '' }));
            }} className="w-full border rounded-xl px-3 py-2.5 bg-white">
              <option value="">Unassigned</option>
              {sellers.map((x: any) => <option key={x.id} value={x.id}>{x.nameEn || x.name}</option>)}
            </select>
          </label>

          <Field label="Artisan" k="artisan" value={form.artisan} onChange={set} optional />
          <Field label="Brand" k="brand" value={form.brand} onChange={set} optional />
          <Field label="Origin" k="origin" value={form.origin} onChange={set} optional />
          <Field label="Seller Item Code" k="sellerItemCode" value={form.sellerItemCode} onChange={set} optional />
          <label className="space-y-1 text-sm"><span className="font-semibold">Price (USD)<span className="text-rose-600" aria-hidden="true"> *</span></span><input type="number" min="0" step="0.01" value={form.priceUSD} onChange={e => set('priceUSD', e.target.value)} className="w-full border rounded-xl px-3 py-2.5" /></label>
          <Field label="Original Price (USD)" k="originalPriceUSD" value={form.originalPriceUSD} onChange={set} type="number" optional />
          <Field label="Discount %" k="discountPercentage" value={form.discountPercentage} onChange={set} type="number" optional />
          <Field label="Stock" k="stock" value={form.stock} onChange={set} type="number" optional />
          <Field label="Low Stock Threshold" k="lowStockThreshold" value={form.lowStockThreshold} onChange={set} type="number" optional />
          <Field label="Low Stock Notice" k="lowStockNotice" value={form.lowStockNotice} onChange={set} optional />
          <Field label="Custom Stock Label" k="customStockLabel" value={form.customStockLabel} onChange={set} optional />
          <Field label="Cost Price (USD)" k="costPriceUSD" value={form.costPriceUSD} onChange={set} type="number" optional />
          <Field label="Weight / Volume" k="weightOrVolume" value={form.weightOrVolume} onChange={set} optional />
          <Field label="Display Order" k="displayOrder" value={form.displayOrder} onChange={set} type="number" optional />
          <Field label="Primary Image URL" k="image" value={form.image} onChange={set} optional />
          <Field label="Video URL" k="videoUrl" value={form.videoUrl} onChange={set} optional />
        </div>

        {/* Gallery editor. additionalImages was passed to the create RPC but had
            no UI at all, so every new product was created with an empty gallery. */}
        <fieldset className="mt-5 border rounded-2xl p-4">
          <legend className="px-2 text-sm font-semibold">Additional Images (optional)</legend>
          <div className="space-y-2">
            {form.additionalImages.map((url, i) => (
              <div key={i} className="flex gap-2">
                <input value={url} aria-label={`Additional image URL ${i + 1}`} onChange={e => setForm(f => { const next = [...f.additionalImages]; next[i] = e.target.value; return { ...f, additionalImages: next }; })} className="flex-1 border rounded-xl px-3 py-2" placeholder="https://…" />
                <button type="button" aria-label={`Remove additional image ${i + 1}`} onClick={() => setForm(f => ({ ...f, additionalImages: f.additionalImages.filter((_, j) => j !== i) }))} className="px-3 rounded-xl bg-rose-100 text-rose-700 font-bold">Remove</button>
              </div>
            ))}
            <button type="button" onClick={() => setForm(f => ({ ...f, additionalImages: [...f.additionalImages, ''] }))} className="px-3 py-2 rounded-xl bg-slate-100 font-bold text-sm"><Plus className="inline w-4 mr-1" />Add image URL</button>
          </div>
        </fieldset>

        <div className="grid md:grid-cols-2 gap-4 mt-4">
          <Text label="Description" k="description" value={form.description} onChange={set} optional />
          <Text label="Craft Story" k="craftStory" value={form.craftStory} onChange={set} optional />
          <Text label="SEO Title" k="seoTitle" value={form.seoTitle} onChange={set} optional />
          <Text label="Arabic SEO Title" k="seoArabicTitle" value={form.seoArabicTitle} onChange={set} optional />
          <Text label="SEO Description" k="seoDescription" value={form.seoDescription} onChange={set} optional />
          <Text label="Arabic SEO Description" k="seoArabicDescription" value={form.seoArabicDescription} onChange={set} optional />
          <Field label="Tags (comma separated)" k="tagsInput" value={form.tagsInput} onChange={set} optional />
          <Field label="Keywords (comma separated)" k="keywordsInput" value={form.keywordsInput} onChange={set} optional />
          <Field label="Arabic Keywords (comma separated)" k="arabicKeywordsInput" value={form.arabicKeywordsInput} onChange={set} optional />
        </div>

        <div className="flex gap-5 mt-4 flex-wrap">
          <label className="flex items-center gap-2"><input type="checkbox" checked={!!form.isNewArrival} onChange={e => set('isNewArrival', e.target.checked)} /> New Arrival</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={!!form.isFeatured} onChange={e => set('isFeatured', e.target.checked)} /> Featured</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={!!form.isBestseller} onChange={e => set('isBestseller', e.target.checked)} /> Bestseller</label>
        </div>

        <div className="flex justify-end gap-2 mt-6 border-t pt-4"><button onClick={closeModal} className="px-4 py-2 rounded-xl bg-slate-100 font-bold">Cancel</button><button disabled={saving} onClick={() => save(false)} className="px-4 py-2 rounded-xl bg-slate-700 text-white font-bold disabled:opacity-50">{saving ? 'Saving…' : 'Save as Draft'}</button><button disabled={saving} onClick={() => save(true)} className="px-4 py-2 rounded-xl bg-blue-600 text-white font-bold disabled:opacity-50">{saving ? 'Saving…' : editing ? 'Save & Publish' : 'Create Product'}</button></div>
      </div>
    </div>}
  </section>;
}
