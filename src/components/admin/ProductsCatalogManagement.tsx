import React, { useMemo, useRef, useState } from 'react';
import { Download, FileSpreadsheet, Upload, Save, Plus, Search, Eye, EyeOff, Trash2, Pencil, ArrowUp, ArrowDown, Crown, GripVertical, X, Package, CheckCircle2, AlertTriangle } from 'lucide-react';
import Papa from 'papaparse';
import { useShop } from '../../context/ShopContext';
import { downloadFullMasterReport } from '../../utils/exportMasterReport';
import { checkDuplicateProductNumber } from '../../lib/productValidation';
import { supabaseProductService } from '../../services/supabaseProductService';
import { supabase } from '../../lib/supabase';
import type { Product } from '../../types';
import { ProductsSequenceTableView } from './ProductsSequenceTableView';

type ViewMode = 'grid' | 'sequence';

const emptyProduct = () => ({
  yallaItemCode: '',
  name: '', arabicName: '', category: '', brand: '', artisan: '', seller: '', arabicSeller: '', sellerId: '', origin: '',
  priceUSD: '', originalPriceUSD: '', discountPercentage: '', stock: '', lowStockThreshold: '', lowStockNotice: '', customStockLabel: '', costPriceUSD: '',
  image: '', additionalImages: [] as string[], videoUrl: '', videos: [] as string[], weightOrVolume: '', tagsInput: '', keywordsInput: '', arabicKeywordsInput: '', sellerItemCode: '',
  description: '', craftStory: '', seoTitle: '', seoArabicTitle: '', seoDescription: '', seoArabicDescription: '', isNewArrival: true, isFeatured: false, isBestseller: false, isPublished: false, displayOrder: '',
  promotionScheduleEnabled: false, promotionStartAt: '', promotionEndAt: ''
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
  const [lastMovedProductId, setLastMovedProductId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<any>(emptyProduct());
  const [saving, setSaving] = useState(false);
  const [quickValues, setQuickValues] = useState<Record<string, { price: string; stock: string }>>({});
  const [imageDraft, setImageDraft] = useState('');
  const [videoDraft, setVideoDraft] = useState('');
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [validationModalOpen, setValidationModalOpen] = useState(false);
  const [loadedPromotionStartAt, setLoadedPromotionStartAt] = useState('');
  const addImageRef = useRef<HTMLInputElement>(null);
  const addVideoRef = useRef<HTMLInputElement>(null);

  const categoryNameById = useMemo(() => new Map((categories as any[]).map((cat: any) => [cat.id, cat.nameEn || cat.name || ''])), [categories]);
  const categoryLabel = (p: Product) => categoryNameById.get(p.category) || '—';

  const filtered = useMemo(() => products.filter(p => {
    const q = query.trim().toLowerCase();
    const haystack = [p.name, p.arabicName, p.brand, p.seller, p.artisan, p.origin, categoryNameById.get(p.category), p.sellerItemCode, p.id, p.description, ...(p.keywords || []), ...(p.arabicKeywords || [])].filter(Boolean).join(' ').toLowerCase();
    const matchesQuery = !q || haystack.includes(q);
    const matchesSeller = sellerFilter === 'all' || p.sellerId === sellerFilter || p.seller === sellerFilter || p.artisan === sellerFilter;
    const matchesCategory = categoryFilter === 'all' || p.category === categoryFilter;
    const matchesStatus = statusFilter === 'all' || (statusFilter === 'published' ? p.isPublished !== false : p.isPublished === false);
    return matchesQuery && matchesSeller && matchesCategory && matchesStatus;
  }), [products, query, sellerFilter, categoryFilter, statusFilter, categoryNameById]);

  React.useEffect(() => {
    setSelected(prev => {
      const visibleIds = new Set(filtered.map(p => p.id));
      const next = new Set([...prev].filter(id => visibleIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [filtered]);

  React.useEffect(() => {
    if (orderDirty) {
      setSequence(prev => {
        const byId = new Map(filtered.map(p => [p.id, p]));
        const kept = prev.filter(p => byId.has(p.id)).map(p => byId.get(p.id)!);
        const added = filtered.filter(p => !prev.some(q => q.id === p.id));
        return [...kept, ...added];
      });
      return;
    }
    setSequence([...filtered].sort((a, b) => (a.displayOrder ?? 999999) - (b.displayOrder ?? 999999)));
  }, [filtered, orderDirty]);

  const visibleSelected = useMemo(() => filtered.filter(p => selected.has(p.id)).map(p => p.id), [filtered, selected]);
  const allSelected = filtered.length > 0 && visibleSelected.length === filtered.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(filtered.map(p => p.id)));
  const toggle = (id: string) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const openEdit = async (p: Product) => {
    setEditing(p);
    setLoadedPromotionStartAt('');
    setModalOpen(true);
    try {
      const { data } = await supabase
        .from('discount_rules')
        .select('rule')
        .contains('rule', { target: 'product', targetValue: p.id })
        .limit(1);
      const rule = data?.[0]?.rule;
      if (rule?.startDate || rule?.endDate) {
        setForm((v: any) => ({
          ...v,
          promotionScheduleEnabled: true,
          promotionStartAt: rule.startDate ? String(rule.startDate).slice(0,16) : '',
          promotionEndAt: rule.endDate ? String(rule.endDate).slice(0,16) : ''
        }));
        setLoadedPromotionStartAt(rule.startDate ? String(rule.startDate).slice(0,16) : '');
      }
    } catch (err) {
      console.error('[ProductsCatalogManagement] Failed to load product promotion schedule:', err);
    }
  };
  React.useEffect(() => {
    if (!editing) return;
    const linkedSeller: any = (sellers as any[]).find((s: any) => s.id === (editing as any).sellerId);
    setForm({
      ...emptyProduct(),
      ...editing,
      sellerId: (editing as any).sellerId || linkedSeller?.id || '',
      seller: (editing as any).seller || linkedSeller?.nameEn || ((editing as any).artisan && (editing as any).artisan !== 'Independent Artisan' ? (editing as any).artisan : ''),
      arabicSeller: (editing as any).arabicSeller || linkedSeller?.nameAr || '',
      artisan: (editing as any).artisan || linkedSeller?.nameEn || '',
      origin: (editing as any).origin || linkedSeller?.region || '',
      isNewArrival: (editing as any).isNewArrival ?? false,
      keywordsInput: (editing.keywords || []).join(', '),
      arabicKeywordsInput: (editing.arabicKeywords || []).join(', '),
      tagsInput: (editing.tags || []).join(', '),
      additionalImages: editing.additionalImages || [],
      videos: editing.videos || editing.additionalVideos || []
    });
  }, [editing?.id]);

  React.useEffect(() => {
    if (!editing?.sellerId) return;
    const linkedSeller: any = (sellers as any[]).find((s: any) => s.id === (editing as any).sellerId);
    if (linkedSeller?.nameEn) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('sellers')
        .select('id,name_en,name_ar,region,district,governorate')
        .eq('id', editing.sellerId)
        .maybeSingle();
      if (cancelled || error || !data) return;
      setForm((v: any) => ({
        ...v,
        sellerId: data.id,
        seller: v.seller || data.name_en || '',
        arabicSeller: v.arabicSeller || data.name_ar || '',
        artisan: v.artisan || data.name_en || '',
        origin: v.origin || data.region || data.district || data.governorate || ''
      }));
    })();
    return () => { cancelled = true; };
  }, [editing?.sellerId, sellers]);

  const saveProduct = async (published: boolean) => {
    const stock = Number(form.stock);
    const price = Number(form.priceUSD);
    const errors: Record<string, string> = {};
    if (!String(form.name || '').trim()) errors.name = 'Product title (English) is required.';
    if (!String(form.category || '').trim()) errors.category = 'Category is required.';
    if (!Number.isFinite(price) || price < 1) errors.priceUSD = 'Price must be at least $1.00.';
    if (!Number.isInteger(stock) || stock < 0) errors.stock = 'Stock quantity must be a whole number (0 or more).';
    if (!String(form.seller || '').trim()) errors.seller = 'Seller Name (English) is required.';
    if (!String(form.sellerItemCode || '').trim()) errors.sellerItemCode = 'Seller Product Code is required.';
    if (!editing?.id && !String(form.yallaItemCode || '').trim()) errors.yallaItemCode = 'Yalla Item Code could not be generated. Close and reopen the form.';
    if (!String(form.image || '').trim()) errors.image = 'Primary Image URL is required.';
    if (String(form.image || '').trim() && imageLooksLikeWebPage(String(form.image || ''))) errors.image = 'Use a direct image URL, not an .html webpage.';
    if (form.promotionScheduleEnabled) {
      const now = new Date();
      const startAt = form.promotionStartAt ? new Date(form.promotionStartAt) : null;
      const endAt = form.promotionEndAt ? new Date(form.promotionEndAt) : null;
      if (!String(form.promotionStartAt || '').trim()) {
        errors.promotionStartAt = 'Promotion start date and time are required when scheduling is enabled.';
      } else if (startAt && startAt <= now && String(form.promotionStartAt || '') !== String(loadedPromotionStartAt || '')) {
        errors.promotionStartAt = 'A new promotion cannot start in the past.';
      }
      if (!String(form.promotionEndAt || '').trim()) {
        errors.promotionEndAt = 'Promotion end date and time are required when scheduling is enabled.';
      } else if (endAt && endAt <= now) {
        errors.promotionEndAt = 'Promotion end must be in the future.';
      }
      if (startAt && endAt && endAt <= startAt) {
        errors.promotionEndAt = 'Promotion end must be later than the promotion start.';
      }
    }
    if (String(form.category || '').trim() && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(form.category || ''))) errors.category = 'Select a valid catalog category.';
    const dup = form.sellerItemCode ? checkDuplicateProductNumber(form.sellerItemCode, editing?.id || null, products, form.sellerId || undefined, form.seller || form.artisan) : { isDuplicate: false };
    if (dup.isDuplicate) errors.sellerItemCode = `Duplicate seller item code: ${form.sellerItemCode}`;
    setValidationErrors(errors);
    if (Object.keys(errors).length) {
      setValidationModalOpen(true);
      return;
    }
    const payload: any = {
      name: String(form.name).trim(), arabicName: String(form.arabicName || '').trim() || undefined, category: form.category, brand: String(form.brand || form.seller || 'Lebanese Artisan').trim(),
      artisan: String(form.artisan || form.seller || 'Independent Artisan').trim(), seller: String(form.seller || form.artisan || 'Independent Artisan').trim(), sellerId: form.sellerId || undefined,
      arabicSeller: String(form.arabicSeller || '').trim() || undefined, origin: String(form.origin || '').trim() || undefined,
      // Admin form: Price is regular/original; Promo Price is the lower selling price.
      // Storefront/database convention: priceUSD is the amount charged; originalPriceUSD is the struck-through regular price.
      priceUSD: (() => { const promo = Number(form.originalPriceUSD || 0); return promo > 0 && promo < price ? promo : price; })(),
      originalPriceUSD: (() => { const promo = Number(form.originalPriceUSD || 0); return promo > 0 && promo < price ? price : null; })(),
      discountPercentage: (() => { const promo = Number(form.originalPriceUSD || 0); const enteredDiscount = Number(form.discountPercentage || 0); return promo > 0 && promo < price ? discountFromPrices(price, promo) : (enteredDiscount > 0 && enteredDiscount < 100 ? Math.round(enteredDiscount) : null); })(),
      stock, lowStockThreshold: Number(form.lowStockThreshold) >= 0 ? Number(form.lowStockThreshold) : null, lowStockNotice: String(form.lowStockNotice || '').trim() || null,
      customStockLabel: String(form.customStockLabel || '').trim() || null, costPriceUSD: Number(form.costPriceUSD) > 0 ? Number(form.costPriceUSD) : null,
      image: String(form.image || '').trim(),
      additionalImages: form.additionalImages || [], videoUrl: String(form.videoUrl || '').trim() || undefined, videos: form.videos || [], description: String(form.description || '').trim(), craftStory: String(form.craftStory || '').trim(),
      isNewArrival: !!form.isNewArrival, isFeatured: !!form.isFeatured, isBestseller: !!form.isBestseller, isPublished: published,
      displayOrder: String(form.displayOrder) === '' ? undefined : Number(form.displayOrder), weightOrVolume: String(form.weightOrVolume || '').trim() || undefined,
      tags: String(form.tagsInput || '').split(',').map((x: string) => x.trim()).filter(Boolean), keywords: String(form.keywordsInput || '').split(',').map((x: string) => x.trim()).filter(Boolean),
      arabicKeywords: String(form.arabicKeywordsInput || '').split(',').map((x: string) => x.trim()).filter(Boolean), sellerItemCode: String(form.sellerItemCode || '').trim() || undefined,
      seoTitle: String(form.seoTitle || '').trim() || null, seoArabicTitle: String(form.seoArabicTitle || '').trim() || null, seoDescription: String(form.seoDescription || '').trim() || null, seoArabicDescription: String(form.seoArabicDescription || '').trim() || null
    };
    setSaving(true);
    try {
      let savedProductId = editing?.id || '';
      if (editing?.id) {
        await updateProduct(editing.id, payload);
      } else {
        const createdProductId = await supabaseProductService.createProduct({
          product: {
            yalla_item_code: String(form.yallaItemCode || '').trim(),
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
          images: [
            ...(payload.additionalImages || []).map((url: string, index: number) => ({ url, media_type: 'image', display_order: index + 1 })),
            ...(payload.videos || []).map((url: string, index: number) => ({ url, media_type: 'video', display_order: (payload.additionalImages || []).length + index + 1 }))
          ]
        });
        // Notify ShopContext immediately; Supabase Realtime also refreshes the catalogue.
        savedProductId = createdProductId;
        window.dispatchEvent(new CustomEvent('yalla-products-changed', { detail: { id: createdProductId } }));
      }
      // Persist product-level scheduled promotion atomically. The database function
      // is admin-only and scopes replacement to rules owned by this product form.
      const scheduledDiscount = Number(payload.discountPercentage || 0);
      const promotionRule = form.promotionScheduleEnabled && scheduledDiscount > 0 && form.promotionStartAt && form.promotionEndAt
        ? {
            name: 'Product Promotion — ' + payload.name,
            description: 'Scheduled product promotion for ' + payload.name,
            rule: {
              type: 'percentage',
              value: scheduledDiscount,
              target: 'product',
              targetValue: savedProductId,
              isActive: true,
              startDate: String(form.promotionStartAt),
              endDate: String(form.promotionEndAt),
              source: 'product_form'
            }
          }
        : null;
      const { error: promotionSaveError } = await supabase.rpc('admin_set_product_promotion', {
        p_product_id: savedProductId,
        p_rule: promotionRule
      });
      if (promotionSaveError) throw promotionSaveError;

      setValidationErrors({});
      showToast(editing?.id ? 'Product updated successfully.' : published ? 'Product published successfully.' : 'Product saved as draft successfully.', 'success');
      setEditing(null);
      setModalOpen(false);
    } catch (e: any) {
      const message = e?.message || 'Unable to save product.';
      showToast(message, 'error');
      console.error('[ProductsCatalogManagement] saveProduct failed:', e);
    }
    finally { setSaving(false); }
  };

  const bulkPublish = async (published: boolean) => {
    if (!visibleSelected.length) return;
    const results = await Promise.allSettled(visibleSelected.map(id => updateProduct(id, { isPublished: published })));
    const ok = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.length - ok;
    showToast(failed ? ok + ' product(s) updated, ' + failed + ' failed.' : ok + ' product(s) ' + (published ? 'published live' : 'saved as drafts') + '.', failed ? 'warning' : 'success');
  };
  const bulkDelete = async () => {
    if (!visibleSelected.length || !window.confirm('Delete ' + visibleSelected.length + ' visible selected product(s)? This cannot be undone.')) return;
    try {
      await deleteMultipleProducts(visibleSelected);
      setSelected(prev => { const n = new Set(prev); visibleSelected.forEach(id => n.delete(id)); return n; });
      showToast(visibleSelected.length + ' product(s) deleted.', 'success');
    } catch (e: any) {
      showToast(e?.message || 'Some products could not be deleted.', 'error');
    }
  };

  const move = (index: number, direction: -1 | 1) => {
    const next = [...sequence]; const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setSequence(next); setOrderDirty(true); setLastMovedProductId(next[target]?.id ?? null);
  };
  const makeFirst = (index: number) => {
    if (index <= 0) return;
    const next = [...sequence]; const [item] = next.splice(index, 1); next.unshift(item);
    setSequence(next); setOrderDirty(true); setLastMovedProductId(item.id);
  };
  const saveOrder = async () => {
    if (!orderDirty) return;
    try {
      await reorderProducts(sequence);
      setOrderDirty(false);
      showToast(`Saved storefront sequence for ${sequence.length} products.`, 'success');
    } catch (e: any) {
      showToast(e?.message || 'Unable to save storefront sequence.', 'error');
    }
  };

  const resetOrder = () => {
    setSequence([...filtered].sort((a, b) => (a.displayOrder ?? 999999) - (b.displayOrder ?? 999999)));
    setOrderDirty(false);
    setLastMovedProductId(null);
    showToast('Sequence changes reset to the saved database order.', 'success');
  };

  const moveSequenceProduct = (productId: string, direction: 'up' | 'down' | 'top' | 'bottom') => {
    const index = sequence.findIndex(p => p.id === productId);
    if (index < 0) return;
    if (direction === 'top') return makeFirst(index);
    if (direction === 'bottom') {
      if (index === sequence.length - 1) return;
      const next = [...sequence];
      const [item] = next.splice(index, 1);
      next.push(item);
      setSequence(next);
      setOrderDirty(true);
      setLastMovedProductId(item.id);
      return;
    }
    move(index, direction === 'up' ? -1 : 1);
  };

  const setSequenceRank = (productId: string, rank: string) => {
    const index = sequence.findIndex(p => p.id === productId);
    if (index >= 0) goToRank(index, rank);
  };
  const goToRank = (index: number, value: string) => {
    const rank = Number(value);
    if (!Number.isInteger(rank) || rank < 1 || rank > sequence.length) return;
    const next = [...sequence]; const [item] = next.splice(index, 1); next.splice(rank - 1, 0, item);
    setSequence(next); setOrderDirty(true); setLastMovedProductId(item.id);
  };

  const saveQuick = async (p: Product) => {
    const q = quickValues[p.id] || { price: String(p.priceUSD), stock: String(p.stock) };
    const price = Number(q.price), stock = Number(q.stock);
    if (!Number.isFinite(price) || price <= 0 || !Number.isInteger(stock) || stock < 0) return showToast('Enter a valid price and whole-number stock.', 'warning');
    try {
      await updateProduct(p.id, { priceUSD: price, stock });
      showToast(p.name + ' price/stock updated.', 'success');
    } catch (e: any) {
      showToast(e?.message || 'Could not update price/stock.', 'error');
    }
  };

  const downloadCatalog = () => csvDownload(filtered.map(p => ({
    id: p.id, seller_item_code: p.sellerItemCode || '', name_en: p.name, name_ar: p.arabicName || '', seller: p.seller || p.artisan || '', category: categoryLabel(p), price_usd: p.priceUSD || 0, stock: p.stock || 0, status: p.isPublished === false ? 'Draft' : 'Published', image: p.image || ''
  })), `yalla_catalog_${new Date().toISOString().slice(0, 10)}.csv`);

  const downloadMaster = () => downloadFullMasterReport(products, sellers, orders, 'yalla_full_master_report');

  const handleBulkUpload = (file?: File) => {
    if (!file) return;
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: async (result: any) => {
        const rows = result.data || [];
        let created = 0;
        const skipped: { row: number; reason: string }[] = [];
        const failed: { row: number; reason: string }[] = [];
        for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
          const row = rows[rowIndex];
          const line = rowIndex + 2;
          const name = String(row.name_en || row.name || row.product_name_en || '').trim();
          if (!name) { skipped.push({ row: line, reason: 'Missing English product name' }); continue; }
          const price = Number(row.price_usd ?? row.priceUSD ?? row.price ?? 0);
          const stock = Number(row.stock ?? row.stock_quantity ?? 0);
          if (!Number.isFinite(price) || price <= 0 || !Number.isInteger(stock) || stock < 0) { skipped.push({ row: line, reason: 'Invalid price or stock' }); continue; }
          const categoryId = String(row.category_id || row.category || '').trim();
          const brand = String(row.brand || '').trim();
          const sellerItemCode = String(row.seller_item_code || '').trim();
          if (!categoryId || !brand) { skipped.push({ row: line, reason: 'Category and brand are required' }); continue; }
          if (sellerItemCode && checkDuplicateProductNumber(sellerItemCode, null, products, row.seller_id || undefined, row.seller || row.artisan).isDuplicate) {
            skipped.push({ row: line, reason: 'Duplicate seller product code: ' + sellerItemCode }); continue;
          }
          try {
            await supabaseProductService.createProduct({
              product: {
                name, arabic_name: row.name_ar || row.product_name_ar || undefined, artisan: row.artisan || row.seller || 'Independent Artisan',
                origin: row.origin || 'Lebanon', brand, description: row.description || 'Imported product', craft_story: row.craft_story || 'Imported product',
                image: row.image || row.image_url || '', price_usd: price, stock, category_id: categoryId,
                seller_id: row.seller_id || undefined, seller_item_code: sellerItemCode || undefined,
                is_published: String(row.status || '').toLowerCase() === 'published', publish_status: String(row.status || '').toLowerCase() === 'published' ? 'published' : 'draft'
              },
              privateData: { seller_id: row.seller_id || undefined, seller_item_code: sellerItemCode || undefined }
            });
            created++;
          } catch (e: any) {
            failed.push({ row: line, reason: e?.message || 'Create failed' });
          }
        }
        const totalProblems = skipped.length + failed.length;
        if (totalProblems) {
          csvDownload([...skipped.map(x => ({ row: x.row, status: 'skipped', reason: x.reason })), ...failed.map(x => ({ row: x.row, status: 'failed', reason: x.reason }))], 'yalla_import_errors.csv');
        }
        showToast('Imported ' + created + ' of ' + rows.length + '. ' + skipped.length + ' skipped, ' + failed.length + ' failed.', totalProblems ? 'warning' : 'success');
      }, error: () => showToast('Could not read the CSV file.', 'error')
    });
  };

  const setQuick = (p: Product, key: 'price' | 'stock', value: string) => setQuickValues(v => ({ ...v, [p.id]: { ...(v[p.id] || { price: String(p.priceUSD), stock: String(p.stock) }), [key]: value } }));

  const localDateTimeMin = useMemo(() => {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    return new Date(now.getTime() - offset * 60 * 1000).toISOString().slice(0, 16);
  }, []);
  const fieldClass = (field: string, base = 'mt-1.5 w-full px-3 py-2.5 rounded-xl border') => `${base} ${validationErrors[field] ? 'border-rose-500 bg-rose-50/40 ring-2 ring-rose-100' : 'border-slate-200'}`;
  const RequiredBadge = ({ field }: { field: string }) => validationErrors[field] ? <span className="ml-2 px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[9px] font-black">REQUIRED</span> : <span className="ml-2 text-[9px] text-slate-400 font-bold">Required</span>;

  const ProductCard = ({ p, index }: { p: Product; index: number }) => {
    const q = quickValues[p.id] || { price: String(p.priceUSD ?? 0), stock: String(p.stock ?? 0) };
    const published = p.isPublished !== false;
    const threshold = Number(p.lowStockThreshold ?? 5);
    const stockState = Number(p.stock) <= 0 ? 'out' : Number(p.stock) <= threshold ? 'low' : 'ok';
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
          <span className="text-slate-500 truncate max-w-[120px]">{categoryLabel(p)}</span>
        </div>
        <div className="flex gap-1.5 mt-3 pt-2 border-t border-slate-100">
          <button onClick={() => saveQuick(p)} className="flex-1 px-2 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-[10px] font-black">Save Price/Stock</button>
          <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600" title="Edit"><Pencil className="w-3.5 h-3.5"/></button>
          <button onClick={async () => { try { await updateProduct(p.id, { isPublished: !published }); } catch (e: any) { showToast(e?.message || 'Could not change publication status.', 'error'); } }} className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600" title={published ? 'Hide' : 'Publish'}>{published ? <EyeOff className="w-3.5 h-3.5"/> : <Eye className="w-3.5 h-3.5"/>}</button>
          <button onClick={() => { if (window.confirm('Delete this product? This cannot be undone.')) void deleteProduct(p.id); }} className="p-1.5 rounded-lg bg-rose-50 text-rose-600" title="Delete"><Trash2 className="w-3.5 h-3.5"/></button>
        </div>
      </div>
    </article>;
  };

  const setField = (key: string, value: any) => setForm((v: any) => ({ ...v, [key]: value }));
  const addMediaUrl = (key: 'additionalImages' | 'videos', value: string) => {
    const url = value.trim();
    if (!url) return;
    setForm((v: any) => ({ ...v, [key]: [...(v[key] || []), url] }));
  };
  const removeMediaUrl = (key: 'additionalImages' | 'videos', index: number) => setForm((v: any) => ({ ...v, [key]: (v[key] || []).filter((_: string, i: number) => i !== index) }));
  // Pricing model: Price (USD) = regular/regular price; Promo Price = temporary selling price.
  const discountFromPrices = (regularPrice: number, promoPrice: number) =>
    regularPrice > promoPrice && regularPrice > 0
      ? Math.round(((regularPrice - promoPrice) / regularPrice) * 100)
      : 0;
  const promoPriceFromDiscount = (regularPrice: number, discount: number) =>
    regularPrice > 0 && discount >= 0 && discount <= 100
      ? Math.round((regularPrice * (1 - discount / 100)) * 100) / 100
      : 0;
  const imageLooksLikeWebPage = (url: string) => /\.html?(?:[?#]|$)/i.test(url.trim());
  const normalizeSeller = (seller: any) => seller ? { nameEn: seller.nameEn || '', nameAr: seller.nameAr || '', region: seller.region || seller.district || seller.governorate || 'Lebanon' } : null;

  const Modal = () => {
    const selectedSeller = normalizeSeller(sellers.find((s: any) => s.id === form.sellerId));
    const selectedCategory = categories.find((cat: any) => cat.id === form.category);
    const regularPrice = Number(form.priceUSD || 0);
    const promoPrice = Number(form.originalPriceUSD || 0);
    const enteredDiscount = Number(form.discountPercentage || 0);
    const calculatedDiscount = discountFromPrices(regularPrice, promoPrice) || (enteredDiscount > 0 ? Math.round(enteredDiscount) : 0);
    const arabicQuickKeywords = ['مونة بلدية', 'زيت زيتون كورة', 'زعتر بلدي جبلي', 'عسل سدر', 'صناعة لبنانية', 'شحن مغتربين'];
    const addArabicKeyword = (keyword: string) => {
      const current = String(form.arabicKeywordsInput || '').split(',').map((x: string) => x.trim()).filter(Boolean);
      if (!current.includes(keyword)) setField('arabicKeywordsInput', [...current, keyword].join(', '));
    };
    const removeArabicKeyword = (keyword: string) => setField('arabicKeywordsInput', String(form.arabicKeywordsInput || '').split(',').map((x: string) => x.trim()).filter((x: string) => x && x !== keyword).join(', '));
    const arabicKeywords = String(form.arabicKeywordsInput || '').split(',').map((x: string) => x.trim()).filter(Boolean);
    const setSeller = (id: string) => {
      const seller: any = sellers.find((s: any) => s.id === id);
      const normalized = normalizeSeller(seller);
      setForm((v: any) => ({ ...v, sellerId: id, seller: normalized?.nameEn || '', arabicSeller: normalized?.nameAr || '', artisan: normalized?.nameEn || '', origin: normalized?.region || v.origin || 'Lebanon' }));
    };
    const setPrice = (value: string) => {
      const regular = Number(value);
      const promo = Number(form.originalPriceUSD || 0);
      const discount = discountFromPrices(regular, promo);
      setForm((v: any) => ({
        ...v,
        priceUSD: value === '' ? '' : (Number.isFinite(regular) ? regular : 0),
        discountPercentage: discount || ''
      }));
    };
    const setPromoPrice = (value: string) => {
      const promo = Number(value);
      const regular = Number(form.priceUSD || 0);
      if (value === '') {
        setForm((v: any) => ({ ...v, originalPriceUSD: '', discountPercentage: '' }));
        return;
      }
      const validPromo = Number.isFinite(promo) ? promo : 0;
      // Regular Price is always the source price. Entering Promo Price calculates the discount;
      // it must never change the Regular Price.
      const discount = discountFromPrices(regular, validPromo);
      setForm((v: any) => ({
        ...v,
        originalPriceUSD: validPromo,
        discountPercentage: discount || ''
      }));
    };
    const setDiscount = (value: string) => {
      if (value === '') {
        setForm((v: any) => ({ ...v, discountPercentage: '', originalPriceUSD: '' }));
        return;
      }
      const discount = Math.min(99, Math.max(0, Number.isFinite(Number(value)) ? Number(value) : 0));
      const regular = Number(form.priceUSD || 0);
      // Discount is calculated FROM the Regular Price. Entering 50% on $10 means Promo Price = $5.
      const derivedPromo = promoPriceFromDiscount(regular, discount);
      setForm((v: any) => ({
        ...v,
        discountPercentage: discount,
        originalPriceUSD: derivedPromo || ''
      }));
    };
    const close = () => { setModalOpen(false); setEditing(null); setValidationModalOpen(false); };
    return <div className="fixed inset-0 z-[70] bg-slate-900/30 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5">
      <div className="bg-white rounded-3xl w-full max-w-6xl max-h-[96vh] overflow-hidden shadow-2xl border border-slate-200 flex flex-col min-h-0">
        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-slate-200 px-5 py-4 sm:px-7">
          <div className="flex items-start justify-between gap-4">
            <div><div className="flex items-center gap-2"><span className="px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-black uppercase tracking-wide">Lebanese Catalog</span><span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-black">Supabase</span></div><h3 className="text-2xl font-black tracking-tight mt-2">{editing?.id ? 'Edit Lebanese Item' : 'List New Lebanese Item'}</h3><p className="text-xs text-slate-500 mt-1">Catalog authentic Lebanese artisanal goods, mouneh and local crafts with bilingual merchandising and live storefront controls.</p></div>
            <button onClick={close} className="p-2.5 rounded-xl hover:bg-slate-100 text-slate-500"><X className="w-5 h-5"/></button>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-5 sm:p-7 space-y-7" style={{ WebkitOverflowScrolling: "touch" }}>
          <section><div className="flex items-center gap-2 mb-3"><span className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs font-black">1</span><div><h4 className="font-black text-slate-900">Bilingual Product Identity</h4><p className="text-[11px] text-slate-500">The commercial identity used across the international and Arabic catalog.</p></div></div>
            <div className="grid md:grid-cols-2 gap-4">
              <label id="product-field-name" className="text-xs font-black text-slate-600">Product Title (English) *<RequiredBadge field="name"/><input value={form.name || ''} onChange={e=>{setField('name',e.target.value);if(e.target.value.trim())setValidationErrors(v=>({...v,name:''}));}} placeholder="Mountain Wild Zaatar Blend" className={fieldClass('name')}/>{validationErrors.name && <span className="block mt-1 text-[10px] text-rose-600 font-bold">{validationErrors.name}</span>}</label>
              <label dir="rtl" className="text-xs font-black text-slate-600">Product Title (Arabic)<input value={form.arabicName || ''} onChange={e=>setField('arabicName',e.target.value)} placeholder="خلطة الزعتر الجبلي البلدي" className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-slate-200 text-right font-sans"/></label>
              <label className="text-xs font-black text-slate-600 md:col-span-2">Category Selection *<select value={form.category || ''} onChange={e=>{setField('category',e.target.value);if(e.target.value.trim())setValidationErrors(v=>({...v,category:''}));}} className={fieldClass('category','mt-1.5 w-full px-3 py-2.5 rounded-xl border bg-white')}>{!form.category && <option value="">Select a bilingual catalog category…</option>}{categories.map((cat:any)=><option key={cat.id} value={cat.id}>{cat.icon ? cat.icon+' ' : ''}{cat.nameEn} {cat.nameAr ? '— '+cat.nameAr : ''}</option>)}</select>{selectedCategory && <span className="block mt-1.5 text-[10px] text-indigo-600 font-bold">{selectedCategory.icon} {selectedCategory.nameEn} · {selectedCategory.nameAr}</span>}</label>
            </div>
          </section>

          <section><div className="flex items-center gap-2 mb-3"><span className="w-7 h-7 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center text-xs font-black">2</span><div><h4 className="font-black">Artisan &amp; Terroir Origin Linkage</h4><p className="text-[11px] text-slate-500">Select a registered Lebanese seller to automatically link producer identity and terroir.</p></div></div>
            <div className="grid md:grid-cols-2 gap-4">
              <label className="text-xs font-black text-slate-600 md:col-span-2">Registered Seller / Artisan<select value={form.sellerId || ''} onChange={e=>setSeller(e.target.value)} className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white"><option value="">Independent / select later</option>{sellers.filter((s:any)=>s.isActive !== false).map((s:any)=><option key={s.id} value={s.id}>{s.nameEn}{s.nameAr ? ' — '+s.nameAr : ''}{s.region ? ' · '+s.region : ''}</option>)}</select>{selectedSeller && <div className="mt-2 flex flex-wrap gap-1.5"><span className="px-2 py-1 rounded-full bg-amber-50 text-amber-700 text-[10px] font-black">{selectedSeller.nameEn}</span><span dir="rtl" className="px-2 py-1 rounded-full bg-slate-100 text-slate-700 text-[10px]">{selectedSeller.nameAr || 'Arabic name not registered'}</span><span className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[10px]">Terroir: {selectedSeller.region}</span></div>}</label>
              <label id="product-field-seller" className="text-xs font-black text-slate-600">Seller Name (English) *<RequiredBadge field="seller"/><input list="yalla-seller-names" value={form.seller || ''} onChange={e=>{setField('seller',e.target.value);if(e.target.value.trim())setValidationErrors(v=>({...v,seller:''}));}} placeholder="Registered producer / cooperative" className={fieldClass('seller')}/>{validationErrors.seller && <span className="block mt-1 text-[10px] text-rose-600 font-bold">{validationErrors.seller}</span>}<datalist id="yalla-seller-names">{sellers.map((s:any)=><option key={s.id} value={s.nameEn}/>)}</datalist></label>
              <label dir="rtl" className="text-xs font-black text-slate-600">Seller Name (Arabic)<input value={form.arabicSeller || ''} onChange={e=>setField('arabicSeller',e.target.value)} placeholder="اسم المنتج بالعربية" className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-slate-200 text-right"/></label>
              <label className="text-xs font-black text-slate-600">Terroir / Origin<input value={form.origin || 'Lebanon'} onChange={e=>setField('origin',e.target.value)} placeholder="Koura, Chouf, Bekaa, Jezzine, Beirut" className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-slate-200"/></label>
            </div>
          </section>

          <section><div className="flex items-center gap-2 mb-3"><span className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center text-xs font-black">3</span><div><h4 className="font-black">Pricing, Inventory &amp; SKU Tracking</h4><p className="text-[11px] text-slate-500">Price (USD) is always the regular/original price. Promo Price is the temporary selling price; LBP display is handled by the storefront exchange-rate layer.</p></div></div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <label id="product-field-priceUSD" className="text-xs font-black text-slate-600">Price (USD) — Regular / Original *<RequiredBadge field="priceUSD"/><input min="1" step="0.01" type="number" value={form.priceUSD ?? ''} onChange={e=>{setPrice(e.target.value);setValidationErrors(v=>({...v,priceUSD:''}));}} className={fieldClass('priceUSD')}/>{validationErrors.priceUSD && <span className="block mt-1 text-[10px] text-rose-600 font-bold">{validationErrors.priceUSD}</span>}</label>
              <label id="product-field-stock" className="text-xs font-black text-slate-600">Stock Quantity *<RequiredBadge field="stock"/><input min="0" step="1" type="number" value={form.stock ?? ''} onChange={e=>{setField('stock',e.target.value === '' ? '' : Number(e.target.value));setValidationErrors(v=>({...v,stock:''}));}} className={fieldClass('stock')}/>{validationErrors.stock && <span className="block mt-1 text-[10px] text-rose-600 font-bold">{validationErrors.stock}</span>}</label>
              <label id="product-field-sellerItemCode" className="text-xs font-black text-slate-600">Seller Product Code *<RequiredBadge field="sellerItemCode"/><input value={form.sellerItemCode || ''} onChange={e=>{setField('sellerItemCode',e.target.value);if(e.target.value.trim())setValidationErrors(v=>({...v,sellerItemCode:''}));}} placeholder="Enter seller's product code" className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-slate-200 font-mono"/></label>
              <label id="product-field-yallaItemCode" className="text-xs font-black text-slate-600">Yalla Item Code <span className="ml-2 px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[9px] font-black">SYSTEM GENERATED · READ ONLY</span><input value={form.yallaItemCode || ''} readOnly aria-readonly="true" className={fieldClass('yallaItemCode','mt-1.5 w-full px-3 py-2.5 rounded-xl border bg-indigo-50/60 text-indigo-700 font-mono font-black cursor-not-allowed')}/>{validationErrors.yallaItemCode && <span className="block mt-1 text-[10px] text-rose-600 font-bold">{validationErrors.yallaItemCode}</span>}</label>
              <label className="text-xs font-black text-slate-600">Package / Unit Size<input value={form.weightOrVolume || ''} onChange={e=>setField('weightOrVolume',e.target.value)} placeholder="500ml Glass Bottle / Set of 6 / Medium 38–44" className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-slate-200"/></label>
            </div>
          </section>

          <section><div className="flex items-center gap-2 mb-3"><span className="w-7 h-7 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center text-xs font-black">4</span><div><h4 className="font-black">Promotional &amp; Deal Badges</h4><p className="text-[11px] text-slate-500">Price (USD) is always the regular/original price. Promo Price is the discounted selling price. Changing Promo Price or Discount % recalculates the promo price/discount; the Regular Price never changes automatically.</p></div></div>
            <div className="grid sm:grid-cols-3 gap-4">
              <label className="text-xs font-black text-slate-600">Promo Price (USD)<input min="0" step="0.01" type="number" value={form.originalPriceUSD ?? ''} onChange={e=>setPromoPrice(e.target.value)} placeholder="25.00" className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-slate-200"/></label>
              <label className="text-xs font-black text-slate-600">Discount Percentage (%)<input min="0" max="100" step="1" type="number" value={form.discountPercentage ?? calculatedDiscount ?? ''} onChange={e=>setDiscount(e.target.value)} placeholder="50" className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700"/></label>
              <div className="rounded-2xl bg-rose-50 border border-rose-100 p-4 flex items-center justify-between"><div><p className="text-[10px] font-black text-rose-600 uppercase">Today's Deals badge</p><p className="text-xs text-slate-600 mt-1">{calculatedDiscount > 0 ? 'Calculated from Promo Price and Regular Price / Discount %' : 'Enter a Promo Price or Discount %'}</p></div>{calculatedDiscount > 0 && <span className="px-2.5 py-1 rounded-full bg-rose-600 text-white text-sm font-black">-{calculatedDiscount}% OFF</span>}</div>
            </div>
          </section>

          <section>
            <div className="flex items-center gap-2 mb-3"><span className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center text-xs font-black">5</span><div><h4 className="font-black">Promotion Scheduling</h4><p className="text-[11px] text-slate-500">Schedule this product discount from the current date/time forward. Past dates and times cannot be selected. The checkout engine uses the exact start/end date and time.</p></div></div>
            <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4 space-y-4">
              <label className="inline-flex items-center gap-2 text-xs font-black text-slate-800">
                <input type="checkbox" checked={!!form.promotionScheduleEnabled} onChange={e=>setField('promotionScheduleEnabled',e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-indigo-600"/>
                Enable scheduled promotion
              </label>
              {form.promotionScheduleEnabled && <div className="grid sm:grid-cols-2 gap-4">
                <label id="product-field-promotionStartAt" className="text-xs font-black text-slate-600">Start Date &amp; Time *<input type="datetime-local" min={localDateTimeMin} value={form.promotionStartAt || ''} onChange={e=>setField('promotionStartAt',e.target.value)} className={fieldClass('promotionStartAt')}/><span className="block mt-1 text-[10px] text-slate-500">Must be now or a future date/time. Past dates and times are not allowed.</span>{validationErrors.promotionStartAt && <span className="block mt-1 text-[10px] text-rose-600 font-bold">{validationErrors.promotionStartAt}</span>}</label>
                <label id="product-field-promotionEndAt" className="text-xs font-black text-slate-600">End Date &amp; Time *<input type="datetime-local" min={localDateTimeMin} value={form.promotionEndAt || ''} onChange={e=>setField('promotionEndAt',e.target.value)} className={fieldClass('promotionEndAt')}/><span className="block mt-1 text-[10px] text-slate-500">Must be in the future and later than the start time.</span>{validationErrors.promotionEndAt && <span className="block mt-1 text-[10px] text-rose-600 font-bold">{validationErrors.promotionEndAt}</span>}</label>
              </div>}
              <p className="text-[10px] text-indigo-700 font-semibold">The scheduled rule is saved in Supabase and is evaluated by the server at checkout. Your Regular Price, Promo Price and Discount % remain the source for the promotion amount.</p>
            </div>
          </section>
          <section><div className="flex items-center gap-2 mb-3"><span className="w-7 h-7 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center text-xs font-black">6</span><div><h4 className="font-black">Scarcity Alert &amp; Low-Stock Notices</h4><p className="text-[11px] text-slate-500">Control when and how urgency messaging appears to shoppers.</p></div></div>
            <div className="grid sm:grid-cols-2 gap-4"><label className="text-xs font-black text-slate-600">Low Stock Threshold<input min="0" step="1" type="number" value={form.lowStockThreshold ?? 5} onChange={e=>setField('lowStockThreshold',Number(e.target.value))} className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-slate-200"/></label><label className="text-xs font-black text-slate-600">Shopper Notice / Urgency Label<input value={form.lowStockNotice || ''} onChange={e=>setField('lowStockNotice',e.target.value)} placeholder="Limited Stock" className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-slate-200"/><div className="flex flex-wrap gap-1.5 mt-2">{['Limited Stock','Last piece','Few units left','Handmade batch ending','Order soon'].map(v=><button type="button" key={v} onClick={()=>setField('lowStockNotice',v)} className="px-2 py-1 rounded-full bg-amber-50 text-amber-700 text-[9px] font-bold">{v}</button>)}</div></label><label className="text-xs font-black text-slate-600 sm:col-span-2">Custom Stock Label<input value={form.customStockLabel || ''} onChange={e=>setField('customStockLabel',e.target.value)} placeholder="Optional label shown beside the quantity selector" className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-slate-200"/></label></div>
          </section>

          <section><div className="flex items-center gap-2 mb-3"><span className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center text-xs font-black">7</span><div><h4 className="font-black">Packaging &amp; Specifications</h4><p className="text-[11px] text-slate-500">Use tags for storefront filters and search chips.</p></div></div><label className="text-xs font-black text-slate-600">Search &amp; Filter Tags<textarea rows={2} value={form.tagsInput || ''} onChange={e=>setField('tagsInput',e.target.value)} placeholder="Artisanal, Mouneh, Cold Pressed, Organic, Vegan, Cedar Terroir" className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-slate-200"/></label></section>

          <section><div className="flex items-center gap-2 mb-3"><span className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs font-black">8</span><div><h4 className="font-black">Multi-Asset Media Gallery</h4><p className="text-[11px] text-slate-500">Add product photos and YouTube, Vimeo or direct MP4 videos.</p></div></div>
            <div className="grid lg:grid-cols-[1.1fr_.9fr] gap-5"><div><label id="product-field-image" className="text-xs font-black text-slate-600">Primary Image URL *<RequiredBadge field="image"/><input value={form.image || ''} onChange={e=>{setField('image',e.target.value);if(e.target.value.trim())setValidationErrors(v=>({...v,image:''}));}} placeholder="https://…" className={fieldClass('image')}/></label>{form.image && <div className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 p-2"><img src={form.image} alt="Primary product preview" className="w-full h-48 object-contain rounded-xl" onError={e=>{(e.currentTarget as HTMLImageElement).style.display='none';}}/>{imageLooksLikeWebPage(form.image) && <p className="text-[10px] text-rose-600 font-bold mt-2">This looks like an .html webpage URL, not a direct image file. Use a direct image URL.</p>}</div>}
              <div className="mt-3 flex gap-2"><input ref={addImageRef} value={imageDraft} onChange={e=>setImageDraft(e.target.value)} placeholder="Additional image URL" className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-xs"/><button type="button" onClick={()=>{addMediaUrl('additionalImages',imageDraft);setImageDraft('');}} className="px-3 rounded-xl bg-indigo-50 text-indigo-700 text-xs font-black">Add Photo</button></div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">{(form.additionalImages || []).map((url:string,i:number)=><div key={url+i} className="relative rounded-xl border border-slate-200 overflow-hidden bg-slate-50"><img src={url} alt={`Gallery ${i+1}`} className="w-full h-24 object-contain"/><button type="button" onClick={()=>removeMediaUrl('additionalImages',i)} className="absolute top-1 right-1 p-1 rounded-full bg-white shadow text-rose-600"><X className="w-3 h-3"/></button></div>)}</div></div>
              <div><label className="text-xs font-black text-slate-600">Product Video Integration<input value={form.videoUrl || ''} onChange={e=>setField('videoUrl',e.target.value)} placeholder="https://youtube.com/... / Vimeo / .mp4" className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-slate-200"/></label><div className="mt-3 flex gap-2"><input ref={addVideoRef} value={videoDraft} onChange={e=>setVideoDraft(e.target.value)} placeholder="Additional video URL" className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-xs"/><button type="button" onClick={()=>{addMediaUrl('videos',videoDraft);setVideoDraft('');}} className="px-3 rounded-xl bg-indigo-50 text-indigo-700 text-xs font-black">Add Video</button></div><div className="mt-3 space-y-2">{(form.videos || []).map((url:string,i:number)=><div key={url+i} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs"><span className="px-2 py-1 rounded-full bg-slate-100 font-black">VIDEO {i+1}</span><span className="truncate flex-1">{url}</span><button type="button" onClick={()=>removeMediaUrl('videos',i)} className="text-rose-600"><X className="w-4 h-4"/></button></div>)}</div></div></div>
          </section>

          <section><div className="flex items-center gap-2 mb-3"><span className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center text-xs font-black">9</span><div><h4 className="font-black">Bilingual Search Engine Optimization (SEO)</h4><p className="text-[11px] text-slate-500">Keywords support Google metadata and storefront search indexing.</p></div></div>
            <div className="grid lg:grid-cols-2 gap-4"><div><label className="text-xs font-black text-slate-600">Arabic SEO Keywords (الكلمات الدلالية لمحركات البحث)</label><div className="mt-1.5 min-h-12 rounded-xl border border-slate-200 p-2 flex flex-wrap gap-1.5">{arabicKeywords.map(k=><span dir="rtl" key={k} className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold">{k}<button type="button" onClick={()=>removeArabicKeyword(k)} className="ml-1 text-emerald-600">×</button></span>)}<input dir="rtl" onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();const v=e.currentTarget.value.trim();if(v)addArabicKeyword(v);e.currentTarget.value='';}}} placeholder="اكتب كلمة واضغط Enter" className="flex-1 min-w-36 outline-none text-xs text-right"/></div><div className="flex flex-wrap gap-1.5 mt-2">{arabicQuickKeywords.map(k=><button type="button" key={k} onClick={()=>addArabicKeyword(k)} className="px-2 py-1 rounded-full bg-slate-50 text-slate-600 text-[9px] font-bold">{k}</button>)}</div></div><label className="text-xs font-black text-slate-600">English SEO Keywords<textarea rows={3} value={form.keywordsInput || ''} onChange={e=>setField('keywordsInput',e.target.value)} placeholder="lebanese zaatar, mouneh, cold pressed olive oil, handmade" className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-slate-200"/></label></div>
            <div className="grid lg:grid-cols-2 gap-4 mt-4"><label className="text-xs font-black text-slate-600">SEO Title<input value={form.seoTitle || ''} onChange={e=>setField('seoTitle',e.target.value)} className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-slate-200"/></label><label dir="rtl" className="text-xs font-black text-slate-600">SEO Arabic Title<input value={form.seoArabicTitle || ''} onChange={e=>setField('seoArabicTitle',e.target.value)} className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-slate-200 text-right"/></label></div>
            <div className="grid lg:grid-cols-2 gap-4 mt-4"><label className="text-xs font-black text-slate-600">Description &amp; Heritage Story<textarea rows={5} value={form.description || ''} onChange={e=>setField('description',e.target.value)} placeholder="Describe the artisan history, regional origin, traditional Lebanese production methods and ingredients…" className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-slate-200"/></label><label className="text-xs font-black text-slate-600">Craft / Heritage Story<textarea rows={5} value={form.craftStory || ''} onChange={e=>setField('craftStory',e.target.value)} placeholder="Extended heritage narrative…" className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-slate-200"/></label></div>
            <div className="grid lg:grid-cols-2 gap-4 mt-4"><label className="text-xs font-black text-slate-600">SEO Description<textarea rows={3} value={form.seoDescription || ''} onChange={e=>setField('seoDescription',e.target.value)} className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-slate-200"/></label><label dir="rtl" className="text-xs font-black text-slate-600">SEO Arabic Description<textarea rows={3} value={form.seoArabicDescription || ''} onChange={e=>setField('seoArabicDescription',e.target.value)} className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-slate-200 text-right"/></label></div>
          </section>

          <section><div className="flex items-center gap-2 mb-3"><span className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center text-xs font-black">10</span><div><h4 className="font-black">Publishing Controls</h4><p className="text-[11px] text-slate-500">Draft remains hidden; Publish Live makes the item available to the storefront.</p></div></div><div className="flex flex-wrap gap-2"><label className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold"><input type="checkbox" checked={!!form.isNewArrival} onChange={e=>setField('isNewArrival',e.target.checked)} className="mr-2"/>New Arrival</label><label className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold"><input type="checkbox" checked={!!form.isFeatured} onChange={e=>setField('isFeatured',e.target.checked)} className="mr-2"/>Featured</label><label className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold"><input type="checkbox" checked={!!form.isBestseller} onChange={e=>setField('isBestseller',e.target.checked)} className="mr-2"/>Bestseller</label></div></section>
        </div>
        <div className="border-t border-slate-200 bg-white px-5 py-4 sm:px-7 flex flex-wrap justify-end gap-2"><button onClick={close} className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold">Cancel</button><button disabled={saving} onClick={()=>saveProduct(false)} className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-900 font-black border border-slate-200">Save (Draft)</button><button disabled={saving} onClick={()=>saveProduct(true)} className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-black shadow-sm">{saving ? 'Saving…' : 'Public (Publish Live)'}</button></div>
      </div>
    </div>;
  };

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
        <button onClick={async ()=>{
          setSaving(true);
          try {
            const { data, error } = await supabase.rpc('next_yalla_item_code');
            if (error || !data) throw error || new Error('Unable to generate Yalla item code.');
            setForm({ ...emptyProduct(), yallaItemCode: String(data) });
            setValidationErrors({});
            setValidationModalOpen(false);
            setEditing(null);
            setModalOpen(true);
          } catch (e: any) {
            showToast(e?.message || 'Unable to generate Yalla item code.', 'error');
          } finally {
            setSaving(false);
          }
        }} className="px-4 py-2 rounded-xl bg-indigo-600 text-slate-900 text-[11px] font-black flex items-center gap-1.5"><Plus className="w-3.5 h-3.5"/>ADD PRODUCT</button>
      </div>
    </div>

    <div className="bg-white border border-slate-200 rounded-2xl p-2.5 shadow-sm flex flex-col xl:flex-row gap-2.5">
      <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search by title, seller / artisan, origin, category, keywords..." className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-xs outline-none focus:border-indigo-400"/></div>
      <label className="flex items-center gap-2 text-[10px] font-black text-slate-500">SELLER<select value={sellerFilter} onChange={e=>setSellerFilter(e.target.value)} className="min-w-[170px] px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700"><option value="all">All Sellers ({sellers.length})</option>{sellers.map((s:any)=><option key={s.id} value={s.id}>{s.nameEn}</option>)}</select></label>
      <label className="flex items-center gap-2 text-[10px] font-black text-slate-500">STATUS<select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} className="min-w-[130px] px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700"><option value="all">All ({products.length})</option><option value="published">Published</option><option value="hidden">Hidden / Draft</option></select></label>
      <label className="flex items-center gap-2 text-[10px] font-black text-slate-500">CATEGORY<select value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)} className="min-w-[180px] px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700"><option value="all">All Categories</option>{categories.map((c:any)=><option key={c.id} value={c.id}>{c.nameEn || c.name}</option>)}</select></label>
    </div>

    <div className="bg-white border border-slate-200 rounded-2xl px-3 py-2.5 shadow-sm flex items-center justify-between gap-3"><button onClick={toggleAll} className="flex items-center gap-2 text-xs font-bold text-slate-700"><input type="checkbox" readOnly checked={allSelected} className="w-4 h-4 rounded border-slate-300 text-indigo-600"/>{allSelected ? 'Clear Selection' : `Select All (${filtered.length})`}</button><div className="flex gap-1.5">{selected.size>0 && <><button onClick={()=>bulkPublish(true)} className="px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-[10px] font-black">Publish {selected.size}</button><button onClick={()=>bulkPublish(false)} className="px-2.5 py-1.5 rounded-lg bg-amber-50 text-amber-700 text-[10px] font-black">Draft {selected.size}</button><button onClick={bulkDelete} className="px-2.5 py-1.5 rounded-lg bg-rose-50 text-rose-700 text-[10px] font-black">Delete</button></>}</div></div>

    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center"><GripVertical className="w-4 h-4"/></div><div><h3 className="font-black text-sm">Product Display Sequence &amp; Ranking</h3><p className="text-[10px] text-slate-500">Easily jump any product to #1, move positions, or sort with presets to control the exact storefront order.</p></div></div><div className="flex items-center rounded-xl border border-slate-200 p-0.5 bg-slate-50"><button onClick={()=>setViewMode('grid')} className={`px-3 py-1.5 rounded-lg text-[10px] font-black ${viewMode==='grid'?'bg-white text-indigo-600 shadow-sm':'text-slate-500'}`}>▦ Grid Cards</button><button onClick={()=>setViewMode('sequence')} className={`px-3 py-1.5 rounded-lg text-[10px] font-black ${viewMode==='sequence'?'bg-white text-indigo-600 shadow-sm':'text-slate-500'}`}>☷ Organize Sequence</button><button onClick={saveOrder} disabled={!orderDirty} className={`ml-1 px-3 py-1.5 rounded-lg text-[10px] font-black transition-all ${orderDirty ? 'bg-amber-500 text-slate-900 shadow-sm animate-pulse' : 'bg-slate-100 text-slate-400 disabled:opacity-50'}`}>Save Products Order{orderDirty ? ` (${sequence.length} pending)` : ''}</button>{orderDirty && <button onClick={resetOrder} className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 text-[10px] font-black hover:bg-slate-50">Reset</button>}</div></div></div>

    {viewMode === 'sequence' && <div className="bg-indigo-50/60 border border-indigo-100 rounded-2xl p-3 text-[10px] text-indigo-800 font-semibold">Sequence mode uses the filtered products above. Reorder with arrows, Make #1, or type an exact rank and press Move. Save commits the complete visible sequence to the database; Reset discards unsaved changes.</div>}
    {viewMode === 'sequence' ? (
      <ProductsSequenceTableView
        products={sequence}
        allProductsCount={sequence.length}
        selectedProductIds={selected}
        onToggleSelect={toggle}
        onMoveProduct={moveSequenceProduct}
        onSetProductRank={setSequenceRank}
        lastMovedProductId={lastMovedProductId}
        onTogglePublish={async (id) => { await updateProduct(id, { isPublished: !(products.find(p => p.id === id)?.isPublished !== false) }); }}
        onEditProduct={openEdit}
        onQuickPriceStock={saveQuick}
        onDeleteProduct={async (p) => { if (window.confirm(`Delete "${p.name}"? This cannot be undone.`)) await deleteProduct(p.id); }}
        formatPrice={(price) => `${Number(price || 0).toFixed(2)}`}
      />
    ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">{sequence.map((p,i)=><React.Fragment key={p.id}>{ProductCard({ p, index: i })}</React.Fragment>)}</div>
    )}
    {!sequence.length && <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-12 text-center"><AlertTriangle className="w-7 h-7 mx-auto text-slate-600"/><p className="mt-2 text-sm font-bold text-slate-500">No products match the current filters.</p></div>}
    {validationModalOpen && <div className="fixed inset-0 z-[90] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-3xl bg-white border border-rose-200 shadow-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-rose-100 bg-rose-50 flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0"><AlertTriangle className="w-5 h-5"/></div>
          <div className="min-w-0"><h3 className="text-lg font-black text-slate-900">Required information is missing</h3><p className="text-xs text-slate-600 mt-1">Complete all highlighted fields before saving or publishing this product.</p></div>
        </div>
        <div className="p-6">
          <div className="space-y-2">
            {Object.entries(validationErrors).map(([field, message]) => <button key={field} type="button" onClick={() => { setValidationModalOpen(false); window.setTimeout(() => document.getElementById(`product-field-${field}`)?.scrollIntoView({behavior:'smooth', block:'center'}), 50); }} className="w-full text-left px-3 py-2.5 rounded-xl bg-rose-50 border border-rose-100 text-xs text-rose-700 font-bold hover:bg-rose-100">
              {message}
            </button>)}
          </div>
          <div className="flex justify-end gap-2 mt-5">
            <button type="button" onClick={() => { setValidationModalOpen(false); window.setTimeout(() => document.getElementById(`product-field-${Object.keys(validationErrors)[0] || ''}`)?.scrollIntoView({behavior:'smooth', block:'center'}), 50); }} className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-black">Fix Required Fields</button>
          </div>
        </div>
      </div>
    </div>}
    {modalOpen && Modal()}
  </section>;
};

export default ProductsCatalogManagement;