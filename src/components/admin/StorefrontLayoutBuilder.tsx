import React, { useMemo, useState } from 'react';
import { Eye, EyeOff, GripVertical, Save, RotateCcw, Monitor, Smartphone, Tablet } from 'lucide-react';
import { useShop } from '../../context/ShopContext';
import type { SectionVisibilityConfig } from '../../types';
import { ReadOnlyStorefrontPreview } from './ReadOnlyStorefrontPreview';

const HOME_SECTIONS = [
  ['homeHero', 'Hero / Main Banner'], ['homeCategories', 'Categories'], ['homeFeatured', 'Featured Products'],
  ['homeDeals', 'Deals'], ['homeBundles', 'Bundles'], ['homeNews', 'News'], ['homeNewArrivals', 'New Arrivals'],
  ['homeTrustBadges', 'Trust Badges'], ['homeHeritage', 'Heritage / Story'], ['homeReviews', 'Customer Reviews'], ['homeNewsletter', 'Newsletter'],
] as const;

const GLOBAL_CONTROLS = [
  ['announcementTicker', 'Announcement Bar'], ['phoneSupport', 'Phone Support'], ['navbarSearch', 'Navbar Search'],
  ['currencySwitcher', 'Currency Switcher'], ['languageSwitcher', 'Language Switcher'],
  ['sellerPortal', 'Seller Portal Link'],
] as const;

const PAGE_SECTIONS = [
  ['products', 'Catalog', [['productsHeader', 'Header'], ['productsSearchFilter', 'Search & Filters'], ['productsCategoryTabs', 'Category Tabs'], ['productsSort', 'Sort'], ['productsGrid', 'Product Grid']]],
  ['product_detail', 'Product Detail', [['detailBreadcrumbs', 'Breadcrumbs'], ['detailGallery', 'Product Gallery'], ['detailPriceBox', 'Price Box'], ['detailArtisanBio', 'Seller / Artisan'], ['detailCraftStory', 'Craft Story'], ['detailWhatsAppInquiry', 'WhatsApp Inquiry'], ['detailCustomerReviews', 'Reviews'], ['detailRelatedProducts', 'Related Products']]],
  ['checkout', 'Checkout', [['checkoutSteps', 'Checkout Steps'], ['checkoutAddressForm', 'Address Form'], ['checkoutDeliverySpeed', 'Delivery Speed'], ['checkoutPaymentMethod', 'Payment Method'], ['checkoutOrderSummary', 'Order Summary'], ['checkoutGuarantees', 'Guarantees']]],
  ['account', 'Account', [['accountOrders', 'Orders'], ['accountProfile', 'Profile'], ['accountWishlist', 'Wishlist'], ['accountSupportCard', 'Support Card']]],
  ['footer', 'Footer', [['footerAbout', 'About'], ['footerQuickLinks', 'Quick Links'], ['footerContact', 'Contact'], ['footerSocial', 'Social Links'], ['footerCopyright', 'Copyright']]],
] as const;

type SectionKey = keyof SectionVisibilityConfig;
const VISIBILITY_CONTROLLED = new Set<string>([
  'homeHero', 'homeCategories', 'homeFeatured', 'homeDeals', 'homeNews', 'homeNewArrivals',
  'homeTrustBadges', 'homeHeritage', 'homeReviews', 'homeNewsletter',
]);

export const StorefrontLayoutBuilder: React.FC = () => {
  const { siteContent, updateSiteContent, showToast } = useShop();
  const [saving, setSaving] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [draftOrder, setDraftOrder] = useState<string[]>(() => Array.from(new Set([...(siteContent.home?.sectionOrder || []), ...HOME_SECTIONS.map(([id]) => id)])));
  const [visibility, setVisibility] = useState<SectionVisibilityConfig>({ ...siteContent.visibility });
  const homeItems = useMemo(() => draftOrder.map(id => HOME_SECTIONS.find(([key]) => key === id)).filter(Boolean) as Array<[string, string]>, [draftOrder]);

  const toggle = (key: SectionKey) => setVisibility(prev => ({ ...prev, [key]: !prev[key] }));
  const dropHome = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    setDraftOrder(prev => {
      const next = [...prev]; const from = next.indexOf(dragId); const to = next.indexOf(targetId);
      if (from < 0 || to < 0) return prev; const [item] = next.splice(from, 1); next.splice(to, 0, item); return next;
    });
    setDragId(null);
  };
  const reset = () => {
    setDraftOrder(HOME_SECTIONS.map(([id]) => id));
    setVisibility({ ...siteContent.visibility });
  };
  const save = async () => {
    setSaving(true);
    try {
      await updateSiteContent({ ...siteContent, visibility, home: { ...siteContent.home, sectionOrder: draftOrder } });
      showToast('Storefront layout saved.', 'success');
    } catch (error) {
      console.error('[StorefrontLayoutBuilder] save failed', error);
      showToast('Could not save the storefront layout.', 'error');
    } finally { setSaving(false); }
  };

  return <section className="space-y-5">
    <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div><h2 className="text-xl font-black">Storefront Structure</h2><p className="text-sm text-slate-500 mt-1">Control the registered Yalla storefront sections. Drag Home sections to change their live order, toggle supported visibility controls, and preview the resulting storefront before publishing.</p></div>
        <div className="flex flex-wrap gap-2"><div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1"><button type="button" onClick={() => setPreviewDevice('desktop')} className={`p-2 rounded-lg ${previewDevice === 'desktop' ? 'bg-white shadow-sm' : ''}`} title="Desktop preview"><Monitor className="w-4 h-4"/></button><button type="button" onClick={() => setPreviewDevice('tablet')} className={`p-2 rounded-lg ${previewDevice === 'tablet' ? 'bg-white shadow-sm' : ''}`} title="Tablet preview"><Tablet className="w-4 h-4"/></button><button type="button" onClick={() => setPreviewDevice('mobile')} className={`p-2 rounded-lg ${previewDevice === 'mobile' ? 'bg-white shadow-sm' : ''}`} title="Mobile preview"><Smartphone className="w-4 h-4"/></button></div><button onClick={reset} type="button" className="px-3 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold flex items-center gap-2"><RotateCcw className="w-4 h-4"/>Reset draft</button><button onClick={save} disabled={saving} type="button" className="px-4 py-2 rounded-xl bg-slate-50 text-slate-900 text-xs font-black flex items-center gap-2 disabled:opacity-50"><Save className="w-4 h-4"/>{saving ? 'Saving…' : 'Save layout'}</button></div>
      </div>
    </div>

    <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.85fr)] gap-5 items-start">
      <div className="space-y-5">
        <div className="bg-white rounded-3xl border border-slate-200 p-5">
          <div className="mb-4"><div className="text-[10px] uppercase tracking-widest font-bold text-slate-500">Global / Navbar</div><h3 className="text-lg font-black">Global storefront controls</h3><p className="text-xs text-slate-500 mt-1">These controls are stored in the same CMS visibility model and govern the corresponding live storefront elements.</p></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{GLOBAL_CONTROLS.map(([key, label]) => { const visible = visibility[key as SectionKey] !== false; return <button key={key} type="button" onClick={() => toggle(key as SectionKey)} className={`flex items-center gap-3 text-left p-3 rounded-xl border ${visible ? 'border-slate-200 bg-slate-50' : 'border-dashed border-rose-300 bg-rose-50/50'}`}><span>{visible ? <Eye className="w-4 h-4 text-emerald-600"/> : <EyeOff className="w-4 h-4 text-rose-500"/>}</span><span><span className="block text-sm font-bold">{label}</span><span className="block text-[10px] font-mono text-slate-500">{key}</span></span></button>; })}</div>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4"><div><div className="text-[10px] uppercase tracking-widest font-bold text-slate-500">Home</div><h3 className="text-lg font-black">Live section hierarchy</h3></div><span className="text-[10px] font-bold text-emerald-600">DRAG TO REORDER</span></div>
          <div className="space-y-2">{homeItems.map(([id, label]) => { const visible = visibility[id as SectionKey] !== false; const canToggle = VISIBILITY_CONTROLLED.has(id); return <div key={id} draggable onDragStart={() => setDragId(id)} onDragOver={e => e.preventDefault()} onDrop={() => dropHome(id)} className={`flex items-center gap-3 p-3 rounded-2xl border ${visible ? 'border-slate-200 bg-slate-50' : 'border-dashed border-rose-300 bg-rose-50/50'}`}><GripVertical className="w-4 h-4 text-slate-500 shrink-0 cursor-grab"/><div className="min-w-0 flex-1"><div className="font-bold text-sm">{label}</div><div className="text-[10px] font-mono text-slate-500">{id}{!canToggle && ' · data-driven visibility'}</div></div>{canToggle ? <button type="button" onClick={() => toggle(id as SectionKey)} className="p-2 rounded-lg hover:bg-white" title={visible ? 'Hide section' : 'Show section'}>{visible ? <Eye className="w-4 h-4 text-emerald-600"/> : <EyeOff className="w-4 h-4 text-rose-500"/>}</button> : <span title="Visibility is controlled by available storefront data" className="p-2 text-slate-600"><Eye className="w-4 h-4"/></span>}</div>; })}</div>
        </div>
        <div className="space-y-5">{PAGE_SECTIONS.map(([pageId, pageLabel, sections]) => <div key={pageId} className="bg-white rounded-3xl border border-slate-200 p-5"><div className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-1">{pageId}</div><h3 className="text-lg font-black mb-3">{pageLabel} sections</h3><div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{sections.map(([key, label]) => { const visible = visibility[key as SectionKey] !== false; return <button key={key} type="button" onClick={() => toggle(key as SectionKey)} className={`flex items-center gap-3 text-left p-3 rounded-xl border ${visible ? 'border-slate-200 bg-slate-50' : 'border-dashed border-rose-300 bg-rose-50/50'}`}><span>{visible ? <Eye className="w-4 h-4 text-emerald-600"/> : <EyeOff className="w-4 h-4 text-rose-500"/>}</span><span><span className="block text-sm font-bold">{label}</span><span className="block text-[10px] font-mono text-slate-500">{key}</span></span></button>; })}</div></div>)}</div>
      </div>

      <div className="bg-slate-50 rounded-3xl p-4 sm:p-5 text-slate-900 sticky top-4">
        <div className="flex items-center justify-between gap-3 mb-4"><div><div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Preview</div><h3 className="text-lg font-black">Read-only storefront preview</h3><p className="text-[10px] text-slate-500 mt-1">Uses current CMS content, current database data and your unsaved layout draft. Buttons do not navigate or mutate cart state.</p></div><span className="text-[10px] font-bold text-emerald-400">DRAFT</span></div>
        <ReadOnlyStorefrontPreview order={draftOrder} visibility={visibility} device={previewDevice} />
      </div>
    </div>
  </section>;
};