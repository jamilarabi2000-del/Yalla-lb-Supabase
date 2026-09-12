import React, { useState } from 'react';
import { useShop } from '../../context/ShopContext';
import { useDialog } from '../../hooks/useDialog';
import { ProductBundle, Product } from '../../types';
import { MediaAssetPicker } from './cms/MediaAssetPicker';
import { 
  PackageCheck, 
  Plus, 
  Trash2, 
  Edit3, 
  Check, 
  X, 
  DollarSign, 
  Sparkles, 
  Tag, 
  Layers, 
  ShoppingBag,
  Percent,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Image as ImageIcon,
  SlidersHorizontal
} from 'lucide-react';

export const ProductBundlesManager: React.FC = () => {
  const { 
    productBundles = [], 
    addProductBundle = async () => {}, 
    updateProductBundle = async () => {}, 
    deleteProductBundle = async () => {},
    products = [],
    showToast = () => {}
  } = useShop() || {};

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [bundleToDelete, setBundleToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const { containerRef: bundleModalRef } = useDialog({
    isOpen: isModalOpen,
    onClose: () => setIsModalOpen(false)
  });

  const { containerRef: deleteConfirmModalRef } = useDialog({
    isOpen: Boolean(bundleToDelete),
    onClose: () => setBundleToDelete(null)
  });

  const [form, setForm] = useState<{
    name: string;
    nameAr: string;
    description: string;
    descriptionAr: string;
    badgeText: string;
    badgeTextAr: string;
    imageUrl: string;
    productIds: string[];
    bundlePriceUSD: number;
    isActive: boolean;
    showInSlider: boolean;
    showButtonInSlider: boolean;
    sliderButtonText: string;
    sliderButtonTextAr: string;
  }>({
    name: '',
    nameAr: '',
    description: '',
    descriptionAr: '',
    badgeText: 'COMBO DEAL - SAVE 20%',
    badgeTextAr: 'صفقة كومبو - خصم ٢٠٪',
    imageUrl: '',
    productIds: [],
    bundlePriceUSD: 0,
    isActive: true,
    showInSlider: true,
    showButtonInSlider: true,
    sliderButtonText: 'Add Entire Combo to Cart',
    sliderButtonTextAr: 'إضافة الكومبو كاملاً للسلة'
  });

  const handleOpenCreate = () => {
    setEditingId(null);
    setForm({
      name: '',
      nameAr: '',
      description: '',
      descriptionAr: '',
      badgeText: 'COMBO DEAL',
      badgeTextAr: 'صفقة كومبو',
      imageUrl: '',
      productIds: [],
      bundlePriceUSD: 0,
      isActive: true,
      showInSlider: true,
      showButtonInSlider: true,
      sliderButtonText: 'Add Entire Combo to Cart',
      sliderButtonTextAr: 'إضافة الكومبو كاملاً للسلة'
    });
    setProductSearch('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (bundle: ProductBundle) => {
    setEditingId(bundle.id);
    setForm({
      name: bundle.name,
      nameAr: bundle.nameAr || '',
      description: bundle.description || '',
      descriptionAr: bundle.descriptionAr || '',
      badgeText: bundle.badgeText || '',
      badgeTextAr: bundle.badgeTextAr || '',
      imageUrl: bundle.imageUrl || '',
      productIds: bundle.productIds || [],
      bundlePriceUSD: bundle.bundlePriceUSD || 0,
      isActive: bundle.isActive,
      showInSlider: bundle.showInSlider !== false,
      showButtonInSlider: bundle.showButtonInSlider !== false,
      sliderButtonText: bundle.sliderButtonText || 'Add Entire Combo to Cart',
      sliderButtonTextAr: bundle.sliderButtonTextAr || 'إضافة الكومبو كاملاً للسلة'
    });
    setProductSearch('');
    setIsModalOpen(true);
  };

  const handleToggleActive = async (bundle: ProductBundle) => {
    await updateProductBundle(bundle.id, { isActive: !bundle.isActive });
    showToast(bundle.isActive ? 'Combo deal deactivated' : 'Combo deal published live!', 'info');
  };

  const handleToggleSlider = async (bundle: ProductBundle) => {
    const nextVal = !(bundle.showInSlider !== false);
    await updateProductBundle(bundle.id, { showInSlider: nextVal });
    showToast(nextVal ? 'Combo deal will appear in hero slider' : 'Combo deal hidden from hero slider', 'info');
  };

  const handleToggleProduct = (productId: string) => {
    setForm(prev => {
      const exists = prev.productIds.includes(productId);
      const updatedIds = exists 
        ? prev.productIds.filter(id => id !== productId)
        : [...prev.productIds, productId];

      // Auto calculate default bundle price if not set
      const selectedItems = products.filter(p => updatedIds.includes(p.id));
      const originalTotal = selectedItems.reduce((acc, curr) => acc + curr.priceUSD, 0);
      const defaultDiscounted = Math.round(originalTotal * 0.8 * 100) / 100; // 20% off by default

      return {
        ...prev,
        productIds: updatedIds,
        bundlePriceUSD: prev.bundlePriceUSD === 0 || prev.bundlePriceUSD >= originalTotal ? defaultDiscounted : prev.bundlePriceUSD
      };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      showToast('Please enter a name for the combo deal', 'warning');
      return;
    }
    if (form.productIds.length < 2) {
      showToast('Please select at least 2 products to create a combo bundle', 'warning');
      return;
    }
    if (form.bundlePriceUSD <= 0) {
      showToast('Please set a valid bundle price greater than $0', 'warning');
      return;
    }

    if (editingId) {
      await updateProductBundle(editingId, form);
      showToast('Combo deal updated successfully!', 'success');
    } else {
      await addProductBundle(form);
      showToast('New Combo Deal created!', 'success');
    }
    setIsModalOpen(false);
  };

  const handleDelete = (id: string, name: string) => {
    setBundleToDelete({ id, name });
  };

  const handleConfirmDelete = async () => {
    if (!bundleToDelete) return;
    setIsDeleting(true);
    try {
      await deleteProductBundle(bundleToDelete.id);
      showToast(`Combo deal "${bundleToDelete.name}" deleted`, 'info');
      setBundleToDelete(null);
    } catch {
      showToast('Failed to delete combo deal', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  // Selected products for form preview calculation
  const selectedFormProducts = products.filter(p => form.productIds.includes(p.id));
  const formOriginalSumUSD = selectedFormProducts.reduce((sum, p) => sum + p.priceUSD, 0);
  const formSavedUSD = Math.max(0, formOriginalSumUSD - form.bundlePriceUSD);
  const formSavedPercent = formOriginalSumUSD > 0 ? Math.round((formSavedUSD / formOriginalSumUSD) * 100) : 0;

  const filteredProductsForSelector = products.filter(p => 
    p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    (p.category && p.category.toLowerCase().includes(productSearch.toLowerCase())) ||
    (p.artisan && p.artisan.toLowerCase().includes(productSearch.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <PackageCheck className="w-5 h-5" />
            </span>
            <h2 className="text-xl font-bold text-white tracking-tight">Combo & Bundle Deals Creator</h2>
          </div>
          <p className="text-xs text-slate-400">
            Create professional product bundles, combo packages, and special multi-item discounts for your customers.
          </p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs uppercase tracking-wider rounded-xl shadow-lg transition-all transform hover:-translate-y-0.5"
        >
          <Plus className="w-4 h-4" />
          <span>Create New Combo</span>
        </button>
      </div>

      {/* Bundles Grid */}
      {productBundles.length === 0 ? (
        <div className="text-center py-12 bg-slate-900/50 border border-dashed border-slate-800 rounded-2xl">
          <Layers className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-300">No Combo Deals Created Yet</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Group complementary products together (e.g., Breakfast Set, School Kit) and offer exclusive bundle pricing.
          </p>
          <button
            onClick={handleOpenCreate}
            className="mt-4 px-4 py-2 bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded-xl text-xs font-bold hover:bg-amber-500/20 transition-all"
          >
            Create Your First Bundle
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {productBundles.map(bundle => {
            const bundledProducts = products.filter(p => bundle.productIds.includes(p.id));
            const originalSum = bundledProducts.reduce((sum, p) => sum + p.priceUSD, 0);
            const savedAmount = Math.max(0, originalSum - bundle.bundlePriceUSD);
            const savedPercentage = originalSum > 0 ? Math.round((savedAmount / originalSum) * 100) : 0;

            return (
              <div 
                key={bundle.id} 
                className={`bg-slate-900/90 border rounded-2xl p-5 shadow-lg relative flex flex-col justify-between transition-all ${
                  bundle.isActive ? 'border-amber-500/30' : 'border-slate-800 opacity-60'
                }`}
              >
                <div>
                  {/* Top Bar: Badge & Active Toggle */}
                  <div className="flex justify-between items-start gap-3 mb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      {bundle.badgeText && (
                        <span className="px-2.5 py-1 rounded-md text-[10px] font-extrabold uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/30">
                          {bundle.badgeText}
                        </span>
                      )}
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        bundle.isActive ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-400'
                      }`}>
                        {bundle.isActive ? 'Active' : 'Draft'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleToggleSlider(bundle)}
                        className={`p-1.5 rounded-lg text-xs font-medium border transition-colors ${
                          bundle.showInSlider !== false 
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20' 
                            : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                        }`}
                        title={bundle.showInSlider !== false ? 'Hide from hero slider' : 'Show in hero slider'}
                      >
                        {bundle.showInSlider !== false ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => handleToggleActive(bundle)}
                        className={`p-1.5 rounded-lg text-xs font-medium border transition-colors ${
                          bundle.isActive 
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20' 
                            : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                        }`}
                        title={bundle.isActive ? 'Deactivate' : 'Publish'}
                      >
                        {bundle.isActive ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => handleOpenEdit(bundle)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                        title="Edit Bundle"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(bundle.id, bundle.name)}
                        className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition-colors"
                        title="Delete Bundle"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Title & Description */}
                  <h3 className="text-lg font-bold text-white mb-1">{bundle.name}</h3>
                  {bundle.nameAr && <p className="text-xs text-amber-400/80 mb-2 font-arabic" dir="rtl">{bundle.nameAr}</p>}
                  {bundle.description && <p className="text-xs text-slate-400 mb-3 line-clamp-2">{bundle.description}</p>}

                  {/* Slider & Cover Status Pills */}
                  <div className="flex items-center gap-2 flex-wrap mb-3">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                      bundle.showInSlider !== false 
                        ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30' 
                        : 'bg-slate-800/80 text-slate-400 border border-slate-750'
                    }`}>
                      {bundle.showInSlider !== false ? <Eye className="w-3 h-3 text-amber-400" /> : <EyeOff className="w-3 h-3 text-slate-500" />}
                      <span>{bundle.showInSlider !== false ? 'Hero Slider: Visible' : 'Hero Slider: Hidden'}</span>
                    </span>

                    {bundle.imageUrl ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                        <ImageIcon className="w-3 h-3" />
                        <span>Custom Cover Image</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-slate-800 text-slate-400">
                        <span>Auto 1st Product Photo</span>
                      </span>
                    )}

                    {bundle.showButtonInSlider === false && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-rose-500/15 text-rose-300 border border-rose-500/30">
                        <span>Slide Button: Hidden</span>
                      </span>
                    )}
                  </div>

                  {/* Bundled Items Thumbnails */}
                  <div className="bg-slate-950/60 p-3 rounded-xl border border-white/5 mb-4">
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-2">
                      Included Items ({bundledProducts.length}):
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      {bundledProducts.map(prod => (
                        <div key={prod.id} className="flex items-center gap-2 bg-slate-900/80 p-1.5 rounded-lg border border-white/5">
                          <div className="w-8 h-8 rounded-md bg-slate-950 flex items-center justify-center p-0.5 shrink-0 overflow-hidden">
                            <img src={prod.image} alt={prod.name} className="w-full h-full object-contain" />
                          </div>
                          <div className="overflow-hidden min-w-0">
                            <p className="text-[11px] font-medium text-slate-200 truncate">{prod.name}</p>
                            <p className="text-[10px] text-slate-400 font-mono">${prod.priceUSD.toFixed(2)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Pricing & Customer Savings Bar */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-800">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold block">Combo Price</span>
                    <div className="flex items-baseline gap-2">
                      <span className="text-xl font-extrabold text-amber-400 font-mono">${bundle.bundlePriceUSD.toFixed(2)}</span>
                      {originalSum > bundle.bundlePriceUSD && (
                        <span className="text-xs text-slate-500 line-through font-mono">${originalSum.toFixed(2)}</span>
                      )}
                    </div>
                  </div>

                  {savedAmount > 0 && (
                    <div className="text-right">
                      <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold font-mono">
                        Customer Saves ${savedAmount.toFixed(2)} ({savedPercentage}%)
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal / Drawer for Create & Edit */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div 
            ref={bundleModalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="bundle-modal-title"
            className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl p-6 space-y-6"
          >
            
            <div className="flex justify-between items-center border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-400" />
                <h3 id="bundle-modal-title" className="text-lg font-bold text-white">
                  {editingId ? 'Edit Combo Deal' : 'Create New Combo Deal'}
                </h3>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              
              {/* Basic Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                    Combo Deal Name (English) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Gourmet Breakfast Set"
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:border-amber-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                    Combo Deal Name (Arabic)
                  </label>
                  <input
                    type="text"
                    dir="rtl"
                    placeholder="مثال: باقة الفطور اللبناني الفاخر"
                    value={form.nameAr}
                    onChange={e => setForm({ ...form, nameAr: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:border-amber-400 focus:outline-none font-arabic"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                    Badge Tag (English)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. COMBO DEAL - SAVE 20%"
                    value={form.badgeText}
                    onChange={e => setForm({ ...form, badgeText: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:border-amber-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                    Badge Tag (Arabic)
                  </label>
                  <input
                    type="text"
                    dir="rtl"
                    placeholder="مثال: صفقة كومبو - خصم ٢٠٪"
                    value={form.badgeTextAr}
                    onChange={e => setForm({ ...form, badgeTextAr: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:border-amber-400 focus:outline-none font-arabic"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                  Description / Offer Highlights
                </label>
                <textarea
                  rows={2}
                  placeholder="Describe what makes this combo special..."
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:border-amber-400 focus:outline-none"
                />
              </div>

              {/* Product Selector */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-xs font-bold uppercase text-amber-400">
                    Select Products Included in this Combo ({form.productIds.length} Selected) *
                  </label>
                  <input
                    type="text"
                    placeholder="Filter products..."
                    value={productSearch}
                    onChange={e => setProductSearch(e.target.value)}
                    className="px-2.5 py-1 text-[11px] bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div className="max-h-48 overflow-y-auto bg-slate-950 rounded-xl border border-slate-800 p-2 space-y-1">
                  {filteredProductsForSelector.map(p => {
                    const isSelected = form.productIds.includes(p.id);
                    return (
                      <div 
                        key={p.id}
                        onClick={() => handleToggleProduct(p.id)}
                        className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                          isSelected ? 'bg-amber-500/20 border border-amber-500/40 text-white' : 'hover:bg-slate-900 text-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2 overflow-hidden min-w-0">
                          <input 
                            type="checkbox" 
                            checked={isSelected}
                            onChange={() => {}} // handled by parent div
                            className="accent-amber-500"
                          />
                          <div className="w-7 h-7 rounded bg-slate-950 flex items-center justify-center p-0.5 shrink-0 overflow-hidden">
                            <img src={p.image} alt={p.name} className="w-full h-full object-contain" />
                          </div>
                          <span className="text-xs font-medium truncate">{p.name}</span>
                        </div>
                        <span className="text-xs font-mono text-amber-400 font-bold flex-shrink-0">${p.priceUSD.toFixed(2)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Pricing Calculation Summary */}
              {selectedFormProducts.length > 0 && (
                <div className="bg-slate-950 p-4 rounded-xl border border-amber-500/30 space-y-3">
                  <div className="flex justify-between text-xs text-slate-300">
                    <span>Original Combined Total:</span>
                    <span className="font-mono text-white font-bold">${formOriginalSumUSD.toFixed(2)}</span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-amber-400 mb-1">
                      Special Combo Price (USD) *
                    </label>
                    <div className="relative">
                      <DollarSign className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={form.bundlePriceUSD}
                        onChange={e => setForm({ ...form, bundlePriceUSD: parseFloat(e.target.value) || 0 })}
                        className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-amber-500/50 rounded-xl text-sm font-mono font-bold text-amber-400 focus:outline-none focus:border-amber-400"
                      />
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-2 border-t border-slate-800 text-xs">
                    <span className="text-emerald-400 font-bold">Total Customer Savings:</span>
                    <span className="font-mono text-emerald-400 font-extrabold text-sm">
                      ${formSavedUSD.toFixed(2)} ({formSavedPercent}% OFF)
                    </span>
                  </div>
                </div>
              )}

              {/* Homepage Slider & Presentation Settings */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <SlidersHorizontal className="w-4 h-4 text-amber-400" />
                    <div>
                      <h4 className="text-xs font-bold uppercase text-white">Homepage Slider Presentation</h4>
                      <p className="text-[11px] text-slate-400">Control if and how this combo deal appears in the hero carousel</p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox"
                      checked={form.showInSlider}
                      onChange={e => setForm({ ...form, showInSlider: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
                    <span className="ml-2 text-xs font-semibold text-slate-300">
                      {form.showInSlider ? 'Show in Slider' : 'Hidden from Slider'}
                    </span>
                  </label>
                </div>

                {form.showInSlider && (
                  <div className="space-y-4 pt-1">
                    {/* Custom Banner / Cover Image */}
                    <div>
                      <MediaAssetPicker
                        label="Custom Combo Banner / Cover Graphic (Optional)"
                        subLabel="Leave empty to use 1st product photo automatically, or select/upload your custom graphic design."
                        value={form.imageUrl}
                        onChange={(url: string) => setForm(prev => ({ ...prev, imageUrl: url }))}
                        recommendedRatio="16:9"
                        recommendedDimensions="1920×800px"
                      />
                    </div>

                    {/* Show Direct Add to Cart Button */}
                    <div className="p-3 bg-slate-900/90 rounded-xl border border-slate-800 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <label className="text-xs font-bold text-white block">
                            Show "Add Entire Combo to Cart" Button on Slide
                          </label>
                          <p className="text-[10px] text-slate-400">
                            When enabled, customers can instantly add all products in this bundle to their cart from the homepage hero slide.
                          </p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input 
                            type="checkbox"
                            checked={form.showButtonInSlider}
                            onChange={e => setForm({ ...form, showButtonInSlider: e.target.checked })}
                            className="sr-only peer"
                          />
                          <div className="w-8 h-4 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-500"></div>
                        </label>
                      </div>

                      {form.showButtonInSlider && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800/80">
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                              Slide Button Text (English)
                            </label>
                            <input
                              type="text"
                              placeholder="Add Entire Combo to Cart"
                              value={form.sliderButtonText}
                              onChange={e => setForm({ ...form, sliderButtonText: e.target.value })}
                              className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:border-amber-400 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                              Slide Button Text (Arabic)
                            </label>
                            <input
                              type="text"
                              dir="rtl"
                              placeholder="إضافة الكومبو كاملاً للسلة"
                              value={form.sliderButtonTextAr}
                              onChange={e => setForm({ ...form, sliderButtonTextAr: e.target.value })}
                              className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:border-amber-400 focus:outline-none font-arabic"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Submit Buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold uppercase tracking-wider shadow-lg"
                >
                  {editingId ? 'Save Changes' : 'Create Combo Deal'}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {bundleToDelete && (
        <div 
          id="modal-delete-bundle-confirm"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div 
            ref={deleteConfirmModalRef}
            className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative space-y-4"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 flex-shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Delete Combo Deal</h3>
                <p className="text-xs text-slate-400">This action cannot be undone</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/60 p-3 rounded-xl border border-white/5">
              Are you sure you want to permanently delete <strong className="text-white">"{bundleToDelete.name}"</strong>? This will immediately remove it from your store, promotions, and home slider.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setBundleToDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all shadow-lg cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? (
                  <span>Deleting...</span>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Delete Combo Deal</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
