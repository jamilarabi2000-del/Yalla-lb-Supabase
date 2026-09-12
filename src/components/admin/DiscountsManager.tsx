import React, { useState } from 'react';
import { useShop } from '../../context/ShopContext';
import { useDialog } from '../../hooks/useDialog';
import { DiscountRule } from '../../types';
import { ProductBundlesManager } from './ProductBundlesManager';
import { 
  Tag, 
  Plus, 
  Trash2, 
  Edit3, 
  Check, 
  X, 
  Percent, 
  DollarSign, 
  Gift, 
  ShieldCheck,
  Calendar,
  Clock,
  UserCheck,
  Users,
  Store,
  Layers,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  ToggleLeft,
  ToggleRight,
  PackageCheck
} from 'lucide-react';

interface DiscountsManagerProps {
  initialTab?: 'rules' | 'bundles';
}

export const DiscountsManager: React.FC<DiscountsManagerProps> = ({ initialTab = 'rules' }) => {
  const [activeTab, setActiveTab] = useState<'rules' | 'bundles'>(initialTab);

  React.useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const { 
    discountRules = [], 
    addDiscountRule = async () => {}, 
    updateDiscountRule = async () => {}, 
    deleteDiscountRule = async () => {},
    products = [],
    showToast = () => {}
  } = useShop() || {};

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { containerRef: discountModalRef } = useDialog({
    isOpen: isModalOpen,
    onClose: () => setIsModalOpen(false)
  });

  const [form, setForm] = useState<{
    name: string;
    type: 'percentage' | 'fixed' | 'bogo';
    value: number;
    target: 'all' | 'checkout' | 'product' | 'category' | 'seller' | 'brand';
    targetValue: string;
    couponCode: string;
    maxTotalUses: number | '';
    maxUsesPerUser: number | '';
    isActive: boolean;
    minPurchaseUSD: number;
    startDate: string;
    endDate: string;
    isNewUserOnly: boolean;
    buyQty: number;
    getQty: number;
    getDiscountPercent: number;
  }>({
    name: '',
    type: 'percentage',
    value: 10,
    target: 'all',
    targetValue: '',
    couponCode: '',
    maxTotalUses: '',
    maxUsesPerUser: '',
    isActive: true,
    minPurchaseUSD: 0,
    startDate: '',
    endDate: '',
    isNewUserOnly: false,
    buyQty: 1,
    getQty: 1,
    getDiscountPercent: 100
  });

  // Extract unique categories, artisans, and origins/brands from products for quick selectors
  const categories = Array.from(new Set(products.map(p => p.category))).filter(Boolean);
  const artisans = Array.from(new Set(products.map(p => p.artisan))).filter(Boolean);
  const brands = Array.from(new Set(products.map(p => p.origin))).filter(Boolean);

  const handleOpenCreate = () => {
    setEditingId(null);
    setForm({
      name: '',
      type: 'percentage',
      value: 10,
      target: 'all',
      targetValue: '',
      couponCode: '',
      maxTotalUses: '',
      maxUsesPerUser: '',
      isActive: true,
      minPurchaseUSD: 0,
      startDate: '',
      endDate: '',
      isNewUserOnly: false,
      buyQty: 1,
      getQty: 1,
      getDiscountPercent: 100
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (rule: DiscountRule) => {
    setEditingId(rule.id);
    const ruleWithCoupon = rule as DiscountRule & { couponCode?: string; maxTotalUses?: number; maxUsesPerUser?: number };
    setForm({
      name: rule.name,
      type: rule.type,
      value: rule.value,
      target: rule.target || 'all',
      targetValue: rule.targetValue || '',
      couponCode: ruleWithCoupon.couponCode || '',
      maxTotalUses: ruleWithCoupon.maxTotalUses !== undefined && ruleWithCoupon.maxTotalUses !== null ? ruleWithCoupon.maxTotalUses : '',
      maxUsesPerUser: ruleWithCoupon.maxUsesPerUser !== undefined && ruleWithCoupon.maxUsesPerUser !== null ? ruleWithCoupon.maxUsesPerUser : '',
      isActive: rule.isActive,
      minPurchaseUSD: rule.minPurchaseUSD || 0,
      startDate: rule.startDate || '',
      endDate: rule.endDate || '',
      isNewUserOnly: rule.isNewUserOnly || false,
      buyQty: rule.buyQty || 1,
      getQty: rule.getQty || 1,
      getDiscountPercent: rule.getDiscountPercent !== undefined ? rule.getDiscountPercent : (rule.type === 'bogo' ? rule.value || 100 : 100)
    });
    setIsModalOpen(true);
  };

  const handleToggleActive = async (rule: DiscountRule) => {
    try {
      await updateDiscountRule(rule.id, { isActive: !rule.isActive });
      showToast(`Discount rule "${rule.name}" ${!rule.isActive ? 'activated' : 'deactivated'}`, 'info');
    } catch (err: any) {
      showToast(`Failed to update status: ${err.message || err}`, 'warning');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      showToast('Please enter a discount rule name', 'warning');
      return;
    }
    if (form.type !== 'bogo' && form.value <= 0) {
      showToast('Discount value must be greater than 0', 'warning');
      return;
    }

    // The pricing engine clamps percentages at 100, so anything above that would be
    // displayed in the rules list but never actually applied at checkout.
    if (form.type === 'percentage' && form.value > 100) {
      showToast('A percentage discount cannot exceed 100%', 'warning');
      return;
    }

    if (form.type === 'bogo') {
      if (!form.buyQty || form.buyQty < 1) {
        showToast('Please specify a valid buy quantity (at least 1)', 'warning');
        return;
      }
      if (!form.getQty || form.getQty < 1) {
        showToast('Please specify a valid free/discounted quantity (at least 1)', 'warning');
        return;
      }
    }

    // Validate start date < end date if both provided
    if (form.startDate && form.endDate) {
      if (new Date(form.startDate) >= new Date(form.endDate)) {
        showToast('Promotion end date must be after the start date', 'warning');
        return;
      }
    }

    try {
      const rawPayload = {
        name: form.name.trim(),
        type: form.type,
        value: form.type === 'bogo' ? (form.getDiscountPercent || 100) : Number(form.value),
        target: form.target,
        targetValue: (form.target !== 'checkout' && form.target !== 'all') ? form.targetValue.trim() : undefined,
        isActive: form.isActive,
        minPurchaseUSD: Number(form.minPurchaseUSD) || 0,
        startDate: form.startDate ? form.startDate : undefined,
        endDate: form.endDate ? form.endDate : undefined,
        isNewUserOnly: form.isNewUserOnly,
        buyQty: form.type === 'bogo' ? Number(form.buyQty) : undefined,
        getQty: form.type === 'bogo' ? Number(form.getQty) : undefined,
        getDiscountPercent: form.type === 'bogo' ? Number(form.getDiscountPercent) : undefined
      };

      const couponCode = form.couponCode?.trim() ? form.couponCode.trim().toUpperCase() : undefined;
      const maxTotalUses = form.maxTotalUses !== '' && form.maxTotalUses !== undefined ? Number(form.maxTotalUses) : undefined;
      const maxUsesPerUser = form.maxUsesPerUser !== '' && form.maxUsesPerUser !== undefined ? Number(form.maxUsesPerUser) : undefined;

      const payload: Omit<DiscountRule, 'id'> = rawPayload;

      if (editingId) {
        await updateDiscountRule(editingId, payload, couponCode, maxTotalUses, maxUsesPerUser);
        showToast('Discount rule updated successfully!', 'success');
      } else {
        await addDiscountRule(payload, couponCode, maxTotalUses, maxUsesPerUser);
        showToast('Discount rule created successfully!', 'success');
      }
      setIsModalOpen(false);
    } catch (err: any) {
      showToast(`Error saving discount: ${err.message || err}`, 'warning');
    }
  };

  // Helper to get promotion status (Active, Scheduled, Expired, Inactive)
  const getRuleStatus = (rule: DiscountRule) => {
    if (!rule.isActive) return { label: 'Inactive', color: 'bg-slate-100 text-slate-600 border-slate-200' };
    const now = new Date();
    if (rule.startDate && new Date(rule.startDate) > now) {
      return { label: 'Scheduled', color: 'bg-amber-100 text-amber-800 border-amber-300' };
    }
    if (rule.endDate && new Date(rule.endDate) < now) {
      return { label: 'Expired', color: 'bg-rose-100 text-rose-800 border-rose-300' };
    }
    return { label: 'Active', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' };
  };

  const getTargetBadgeColor = (target: string) => {
    switch(target) {
      case 'all':
      case 'checkout': return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'brand': return 'bg-rose-100 text-rose-700 border-rose-200';
      case 'seller': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'category': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'product': return 'bg-blue-100 text-blue-700 border-blue-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const getTargetLabel = (rule: DiscountRule) => {
    switch(rule.target) {
      case 'all': return 'All Items (Storewide)';
      case 'checkout': return 'Checkout Total';
      case 'brand': return `Brand: ${rule.targetValue || 'Any'}`;
      case 'seller': return `Seller: ${rule.targetValue || 'Any'}`;
      case 'category': return `Category: ${rule.targetValue || 'Any'}`;
      case 'product': return `Product ID: ${rule.targetValue || 'Selected'}`;
      default: return 'Storewide';
    }
  };

  // Analytics stats
  const totalRules = discountRules.length;
  const activeRules = discountRules.filter(r => r.isActive).length;
  const newUserRules = discountRules.filter(r => r.isNewUserOnly).length;
  const timedCampaigns = discountRules.filter(r => r.startDate || r.endDate).length;

  return (
    <div className="space-y-6">
      
      {/* Top Tab Selector */}
      <div className="flex border-b border-slate-200 gap-4">
        <button
          onClick={() => setActiveTab('rules')}
          className={`pb-3 px-4 font-bold text-xs uppercase tracking-wider flex items-center gap-2 border-b-2 transition-all ${
            activeTab === 'rules'
              ? 'border-[#b89753] text-[#b89753]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Tag className="w-4 h-4" />
          <span>Discount Rules & Coupons</span>
        </button>

        <button
          onClick={() => setActiveTab('bundles')}
          className={`pb-3 px-4 font-bold text-xs uppercase tracking-wider flex items-center gap-2 border-b-2 transition-all ${
            activeTab === 'bundles'
              ? 'border-[#b89753] text-[#b89753]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <PackageCheck className="w-4 h-4" />
          <span>Combo & Bundle Deals Creator</span>
        </button>
      </div>

      {activeTab === 'bundles' ? (
        <ProductBundlesManager />
      ) : (
        <>
          {/* Header Banner */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl -z-1" />
            <div>
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#b89753] mb-1">
                <Tag className="w-4 h-4" />
                <span>Promotions & Discount Engine</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Admin Discounts & Campaigns</h1>
              <p className="text-xs text-slate-500 mt-1 max-w-xl">
                Create discount rules across all items, specific brands, sellers, or categories. Configure timed promotion periods and exclusive new user discounts.
              </p>
            </div>
            <button
              onClick={handleOpenCreate}
              className="px-6 py-3.5 rounded-2xl bg-gradient-to-r from-[#b89753] to-[#96783d] text-white font-extrabold text-xs tracking-wider uppercase shadow-md shadow-amber-500/20 hover:brightness-105 transition-all flex items-center justify-center gap-2 cursor-pointer shrink-0 hover:-translate-y-0.5 active:translate-y-0"
            >
              <Plus className="w-4 h-4" />
              <span>Create New Discount</span>
            </button>
          </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Total & Active Rules */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-purple-50 text-purple-700 rounded-2xl ring-1 ring-purple-500/10">
            <Tag className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900">{activeRules} / {totalRules}</div>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Active Rules</div>
          </div>
        </div>

        {/* New Users Only */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-blue-50 text-blue-700 rounded-2xl ring-1 ring-blue-500/10">
            <UserCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900">{newUserRules}</div>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">New User Specials</div>
          </div>
        </div>

        {/* Timed Campaigns */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-amber-50 text-amber-700 rounded-2xl ring-1 ring-amber-500/10">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900">{timedCampaigns}</div>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Timed Promotions</div>
          </div>
        </div>

        {/* Storewide & Targeted */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-emerald-50 text-emerald-700 rounded-2xl ring-1 ring-emerald-500/10">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900">
              {discountRules.filter(r => r.target === 'all' || r.target === 'checkout').length}
            </div>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Storewide Deals</div>
          </div>
        </div>

      </div>

      {/* Rules Grid */}
      {discountRules.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center space-y-4 shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 text-[#b89753] flex items-center justify-center mx-auto">
            <Gift className="w-8 h-8" />
          </div>
          <div className="space-y-1 max-w-md mx-auto">
            <h3 className="font-bold text-slate-900 text-lg">No Discount Rules Configured</h3>
            <p className="text-xs text-slate-500">
              Create your first discount rule to offer storewide sales, brand specials, artisan discounts, or new user promotions.
            </p>
          </div>
          <button
            onClick={handleOpenCreate}
            className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors inline-flex items-center gap-2 cursor-pointer shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Add Discount Rule</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {discountRules.map((rule) => {
            const isPercentage = rule.type === 'percentage';
            const status = getRuleStatus(rule);
            return (
              <div 
                key={rule.id}
                className={`bg-white border rounded-3xl p-6 shadow-sm flex flex-col justify-between transition-all relative overflow-hidden ${
                  rule.isActive ? 'border-slate-200/90 hover:border-amber-400 hover:shadow-md' : 'border-slate-200/60 opacity-65 bg-slate-50/50'
                }`}
              >
                {/* Top status bar */}
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider border ${getTargetBadgeColor(rule.target)}`}>
                      {rule.target.toUpperCase()}
                    </span>

                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${status.color}`}>
                      {status.label}
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between gap-2 pt-1">
                    <h3 className="font-extrabold text-slate-900 text-base leading-snug">{rule.name}</h3>
                    <span className="text-xl font-black text-emerald-600 bg-emerald-50 px-3 py-1 rounded-xl border border-emerald-200/60 shrink-0">
                      {rule.type === 'bogo' 
                        ? `Buy ${rule.buyQty || 1} Get ${rule.getQty || 1} ${(rule.getDiscountPercent || 100) === 100 ? 'FREE' : `${rule.getDiscountPercent}% OFF`}`
                        : (isPercentage ? `${rule.value}% OFF` : `$${rule.value} OFF`)}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 font-semibold bg-slate-50 px-3 py-2 rounded-xl border border-slate-100 flex items-center gap-2">
                    <Store className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>{getTargetLabel(rule)}</span>
                  </p>

                  {/* Promotion Period & New User Badges */}
                  <div className="space-y-2 pt-1">
                    
                    {/* New user restriction badge */}
                    {rule.isNewUserOnly && (
                      <div className="bg-blue-50 border border-blue-200 text-blue-800 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2">
                        <UserCheck className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        <span>Exclusive for New Users (1st Order)</span>
                      </div>
                    )}

                    {/* Promotion Period Badge */}
                    {(rule.startDate || rule.endDate) && (
                      <div className="bg-amber-50/80 border border-amber-200/80 text-amber-900 px-3 py-1.5 rounded-xl text-[11px] font-medium flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                        <div className="truncate">
                          {rule.startDate && <span>From: {new Date(rule.startDate).toLocaleDateString()} </span>}
                          {rule.endDate && <span>Until: {new Date(rule.endDate).toLocaleDateString()}</span>}
                        </div>
                      </div>
                    )}

                    {/* Coupon Code & Minimum Purchase */}
                    <div className="flex flex-wrap gap-2 pt-1">
                      {(rule as any).couponCode && (
                        <div className="bg-purple-50 border border-purple-200 text-purple-800 px-2.5 py-1 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5">
                          <Tag className="w-3 h-3 text-purple-600" />
                          <span>Code: {(rule as any).couponCode}</span>
                        </div>
                      )}
                      {rule.minPurchaseUSD ? (
                        <div className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg text-xs font-bold border border-slate-200">
                          Min: ${rule.minPurchaseUSD}
                        </div>
                      ) : null}
                    </div>

                  </div>
                </div>

                {/* Footer Controls */}
                <div className="flex items-center justify-between pt-5 mt-5 border-t border-slate-100">
                  <button
                    onClick={() => handleToggleActive(rule)}
                    className={`flex items-center gap-1.5 text-xs font-bold cursor-pointer transition-colors ${
                      rule.isActive ? 'text-emerald-600 hover:text-emerald-700' : 'text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    {rule.isActive ? (
                      <>
                        <ToggleRight className="w-5 h-5 text-emerald-600" />
                        <span>Enabled</span>
                      </>
                    ) : (
                      <>
                        <ToggleLeft className="w-5 h-5 text-slate-400" />
                        <span>Disabled</span>
                      </>
                    )}
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleOpenEdit(rule)}
                      className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors cursor-pointer"
                      title="Edit Rule"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Are you sure you want to delete "${rule.name}"?`)) {
                          deleteDiscountRule(rule.id);
                        }
                      }}
                      className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                      title="Delete Rule"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div 
            ref={discountModalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="discount-modal-title"
            className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl space-y-6 max-h-[92vh] overflow-y-auto"
          >
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h2 id="discount-modal-title" className="text-xl font-extrabold text-slate-900">
                  {editingId ? 'Edit Discount Rule' : 'Create New Discount Rule'}
                </h2>
                <p className="text-xs text-slate-500 font-medium">Configure storewide, brand, seller, promotion period, or new user discounts</p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              
              {/* Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Rule Name / Campaign Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 15% Off All Brands or Welcome New User Promo"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-50 rounded-xl border border-slate-200 text-sm font-medium focus:outline-none focus:border-amber-500 focus:bg-white"
                />
              </div>

              {/* Target & Type */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Discount Target / Scope</label>
                  <select
                    value={form.target}
                    onChange={(e) => setForm({ ...form, target: e.target.value as any, targetValue: '' })}
                    className="w-full px-4 py-2.5 bg-slate-50 rounded-xl border border-slate-200 text-sm font-bold focus:outline-none focus:border-amber-500 focus:bg-white"
                  >
                    <option value="all">All Items (Storewide)</option>
                    <option value="brand">Specific Brand / Origin</option>
                    <option value="seller">Specific Seller / Artisan</option>
                    <option value="category">Specific Category</option>
                    <option value="product">Specific Product</option>
                    <option value="checkout">Checkout Subtotal</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Discount Type</label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value as any })}
                    className="w-full px-4 py-2.5 bg-slate-50 rounded-xl border border-slate-200 text-sm font-bold focus:outline-none focus:border-amber-500 focus:bg-white"
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed Amount ($)</option>
                    <option value="bogo">Buy X Get Y (BOGO / Quantity Deal)</option>
                  </select>
                </div>
              </div>

              {/* BOGO Quantity Parameters */}
              {form.type === 'bogo' && (
                <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200/90 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-900 uppercase tracking-wider">
                    <Sparkles className="w-4 h-4 text-emerald-600" />
                    <span>Buy X Get Y (BOGO) Deal Settings</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold uppercase text-emerald-950 mb-1">
                        Buy Quantity (X)
                      </label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        required
                        value={form.buyQty}
                        onChange={(e) => setForm({ ...form, buyQty: Math.max(1, parseInt(e.target.value) || 1) })}
                        className="w-full px-3 py-2 bg-white rounded-xl border border-emerald-300 text-sm font-extrabold text-slate-900 focus:outline-none focus:border-emerald-500"
                        placeholder="e.g. 1 or 2"
                      />
                      <span className="text-[10px] text-emerald-700">e.g. <strong>2</strong> in Buy 2</span>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold uppercase text-emerald-950 mb-1">
                        Get Quantity (Y)
                      </label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        required
                        value={form.getQty}
                        onChange={(e) => setForm({ ...form, getQty: Math.max(1, parseInt(e.target.value) || 1) })}
                        className="w-full px-3 py-2 bg-white rounded-xl border border-emerald-300 text-sm font-extrabold text-slate-900 focus:outline-none focus:border-emerald-500"
                        placeholder="e.g. 1"
                      />
                      <span className="text-[10px] text-emerald-700">e.g. <strong>1</strong> in Get 1</span>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold uppercase text-emerald-950 mb-1">
                        Discount on Y (%)
                      </label>
                      <select
                        value={form.getDiscountPercent}
                        onChange={(e) => setForm({ ...form, getDiscountPercent: Number(e.target.value) })}
                        className="w-full px-3 py-2 bg-white rounded-xl border border-emerald-300 text-sm font-extrabold text-slate-900 focus:outline-none focus:border-emerald-500"
                      >
                        <option value="100">100% (Free Item)</option>
                        <option value="50">50% Off</option>
                        <option value="25">25% Off</option>
                        <option value="75">75% Off</option>
                      </select>
                      <span className="text-[10px] text-emerald-700">
                        {form.getDiscountPercent === 100 ? 'Item Y is 100% Free' : `${form.getDiscountPercent}% discount on Y`}
                      </span>
                    </div>
                  </div>

                  <div className="bg-white/80 p-3 rounded-xl border border-emerald-200 text-xs text-emerald-800 font-medium">
                    🎯 <strong>Rule Formula:</strong> For every <strong>{form.buyQty + form.getQty}</strong> eligible items added to the cart, the customer pays for <strong>{form.buyQty}</strong> and gets <strong>{form.getQty}</strong> at {form.getDiscountPercent === 100 ? '100% Free' : `${form.getDiscountPercent}% off`}.
                  </div>
                </div>
              )}

              {/* Conditional Target Value Selection */}
              {form.target === 'category' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Select or Enter Category</label>
                  <div className="space-y-2">
                    <select
                      value={categories.includes(form.targetValue) ? form.targetValue : ''}
                      onChange={(e) => setForm({ ...form, targetValue: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-50 rounded-xl border border-slate-200 text-sm font-medium focus:outline-none focus:border-amber-500"
                    >
                      <option value="">-- Select from Existing Categories --</option>
                      {categories.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      placeholder="Or type custom category name..."
                      value={form.targetValue}
                      onChange={(e) => setForm({ ...form, targetValue: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-medium focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
              )}

              {form.target === 'seller' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Select or Enter Seller / Artisan</label>
                  <div className="space-y-2">
                    <select
                      value={artisans.includes(form.targetValue) ? form.targetValue : ''}
                      onChange={(e) => setForm({ ...form, targetValue: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-50 rounded-xl border border-slate-200 text-sm font-medium focus:outline-none focus:border-amber-500"
                    >
                      <option value="">-- Select from Existing Artisans / Sellers --</option>
                      {artisans.map((art) => (
                        <option key={art} value={art}>{art}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      placeholder="Or type seller/artisan name..."
                      value={form.targetValue}
                      onChange={(e) => setForm({ ...form, targetValue: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-medium focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
              )}

              {form.target === 'brand' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Select or Enter Brand / Origin</label>
                  <div className="space-y-2">
                    <select
                      value={brands.includes(form.targetValue) ? form.targetValue : ''}
                      onChange={(e) => setForm({ ...form, targetValue: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-50 rounded-xl border border-slate-200 text-sm font-medium focus:outline-none focus:border-amber-500"
                    >
                      <option value="">-- Select from Existing Brands / Origins --</option>
                      {brands.map((brand) => (
                        <option key={brand} value={brand}>{brand}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      placeholder="Or type brand or origin name (e.g. Koura, North Lebanon)..."
                      value={form.targetValue}
                      onChange={(e) => setForm({ ...form, targetValue: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-medium focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
              )}

              {form.target === 'product' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Select Product</label>
                  <select
                    value={form.targetValue}
                    onChange={(e) => setForm({ ...form, targetValue: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 rounded-xl border border-slate-200 text-sm font-medium focus:outline-none focus:border-amber-500"
                  >
                    <option value="">-- Choose Product --</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} [{p.sellerItemCode || 'No Code'}] (${p.priceUSD})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Value & Min Purchase (Only show for standard fixed or percentage discounts) */}
              {form.type !== 'bogo' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Discount Amount ({form.type === 'percentage' ? '%' : '$'})
                    </label>
                    <input
                      type="number"
                      min="0.1"
                      max={form.type === 'percentage' ? 100 : undefined}
                      step="0.1"
                      required
                      value={form.value}
                      onChange={(e) => setForm({ ...form, value: Number(e.target.value) })}
                      className="w-full px-4 py-2.5 bg-slate-50 rounded-xl border border-slate-200 text-sm font-extrabold focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Min Purchase ($)</label>
                    <input
                      type="number"
                      min="0"
                      value={form.minPurchaseUSD}
                      onChange={(e) => setForm({ ...form, minPurchaseUSD: Number(e.target.value) })}
                      className="w-full px-4 py-2.5 bg-slate-50 rounded-xl border border-slate-200 text-sm font-medium focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
              )}

              {/* Promotion Period (Start Date & End Date) */}
              <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200/80 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-900 uppercase tracking-wider">
                  <Calendar className="w-4 h-4 text-amber-700" />
                  <span>Promotion Period (Optional)</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">Start Date & Time</label>
                    <input
                      type="datetime-local"
                      value={form.startDate}
                      onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                      className="w-full px-3 py-2 bg-white rounded-xl border border-slate-200 text-xs font-medium focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">End Date & Time</label>
                    <input
                      type="datetime-local"
                      value={form.endDate}
                      onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                      className="w-full px-3 py-2 bg-white rounded-xl border border-slate-200 text-xs font-medium focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-amber-800">
                  Leave start and end dates blank for an ongoing promotion with no time expiration.
                </p>
              </div>

              {/* Target User Audience (New Users Only) */}
              <div className="p-4 rounded-2xl bg-blue-50/60 border border-blue-200/80 space-y-2">
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={form.isNewUserOnly}
                    onChange={(e) => setForm({ ...form, isNewUserOnly: e.target.checked })}
                    className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                  />
                  <div>
                    <span className="text-xs font-bold text-blue-900 block">Allow Discount for New Users Only</span>
                    <span className="text-[11px] text-blue-700 font-medium block">
                      Applies exclusively to first-time shoppers who have not placed previous orders.
                    </span>
                  </div>
                </label>
              </div>

              {/* Coupon Code */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Coupon Code (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. WELCOME20 (leave blank for auto discount)"
                  value={form.couponCode}
                  onChange={(e) => setForm({ ...form, couponCode: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-50 rounded-xl border border-slate-200 text-sm uppercase font-mono font-bold focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Active Toggle */}
              <div className="flex items-center gap-3 pt-1">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  className="w-4 h-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500"
                />
                <label htmlFor="isActive" className="text-xs font-bold text-slate-800 cursor-pointer">
                  Activate & Enable immediately on store
                </label>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#b89753] to-[#96783d] text-white font-bold text-xs shadow-md shadow-amber-500/20 hover:brightness-105 transition-all cursor-pointer"
                >
                  {editingId ? 'Save Changes' : 'Create Discount Rule'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}
        </>
      )}

    </div>
  );
};
