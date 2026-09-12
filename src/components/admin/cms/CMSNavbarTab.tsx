import React, { useState, useRef } from 'react';
import { CMSNavTab } from '../../../types';
import { 
  Navigation, 
  Plus, 
  Trash2, 
  Eye, 
  EyeOff, 
  Phone, 
  Search, 
  Sparkles, 
  Layers,
  Upload
} from 'lucide-react';
import { optimizeImageFile } from '../../../utils/imageOptimizer';

interface CMSNavbarTabProps {
  navbarData: {
    logoUrl?: string;
    faviconUrl?: string;
    announcementTicker: string;
    announcementTickerArabic?: string;
    brandName: string;
    brandNameArabic?: string;
    brandSubtitle: string;
    brandSubtitleArabic?: string;
    phoneSupport: string;
    searchPlaceholder: string;
    searchPlaceholderArabic?: string;
    navTabs: CMSNavTab[];
  };
  onChangeField: (field: string, value: any) => void;
}

export const CMSNavbarTab: React.FC<CMSNavbarTabProps> = ({
  navbarData = {
    announcementTicker: '',
    announcementTickerArabic: '',
    brandName: 'Yalla',
    brandNameArabic: 'يلا',
    brandSubtitle: 'Lebanese Artisanal Marketplace',
    brandSubtitleArabic: 'السوق اللبناني للحرف والمنتجات الأصيلة',
    phoneSupport: '+961 70 123 456',
    searchPlaceholder: 'Search zaatar, blown glass, cedar wood, olive soap...',
    searchPlaceholderArabic: 'ابحث عن زعتر، زجاج منفوخ، خشب أرز، صابون بلدي...',
    navTabs: []
  },
  onChangeField,
}) => {
  const [newTabId, setNewTabId] = useState('');
  const [newTabLabel, setNewTabLabel] = useState('');
  const [newTabLabelAr, setNewTabLabelAr] = useState('');
  const logoFileInputRef = useRef<HTMLInputElement>(null);
  const faviconFileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: 'logoUrl' | 'faviconUrl') => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file.');
      return;
    }

    try {
      const isFavicon = field === 'faviconUrl';
      const result = await optimizeImageFile(file, {
        maxWidth: isFavicon ? 256 : 800,
        maxHeight: isFavicon ? 256 : 400,
        quality: 0.85,
        maxSizeBytes: isFavicon ? 50 * 1024 : 120 * 1024
      });
      onChangeField(field, result.dataUrl);
    } catch (err) {
      console.warn('Image optimization failed, falling back to direct reader:', err);
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        if (result) {
          onChangeField(field, result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const navTabs = navbarData.navTabs || [];

  const handleUpdateTab = (index: number, updates: Partial<CMSNavTab>) => {
    const updated = [...navTabs];
    updated[index] = { ...updated[index], ...updates };
    onChangeField('navTabs', updated);
  };

  const handleAddTab = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTabLabel.trim()) return;
    const id = newTabId.trim() || newTabLabel.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const newTab: CMSNavTab = {
      id,
      label: newTabLabel.trim(),
      arabicLabel: newTabLabelAr.trim() || newTabLabel.trim(),
      isPublished: true,
    };
    onChangeField('navTabs', [...navTabs, newTab]);
    setNewTabId('');
    setNewTabLabel('');
    setNewTabLabelAr('');
  };

  const handleDeleteTab = (index: number) => {
    const updated = navTabs.filter((_, idx) => idx !== index);
    onChangeField('navTabs', updated);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Announcement Ticker */}
      <div className="bg-[#121222] border border-white/10 rounded-3xl p-6 space-y-5">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <Navigation className="w-5 h-5 text-amber-400" />
          <span>Top Announcement Ticker Bar</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="navbar-ticker-en" className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5 cursor-pointer">
              Announcement Message (English)
            </label>
            <input
              id="navbar-ticker-en"
              type="text"
              value={navbarData.announcementTicker || ''}
              onChange={(e) => onChangeField('announcementTicker', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
              placeholder="e.g. 🇱🇧 Express Delivery Across Lebanon • Live LBP Rate: 89,500 LBP/USD"
            />
          </div>
          <div>
            <label htmlFor="navbar-ticker-ar" className="block text-xs font-bold uppercase tracking-wider text-amber-400 mb-1.5 cursor-pointer" dir="rtl">
              رسالة شريط الإعلانات العلوي (عربي)
            </label>
            <input
              id="navbar-ticker-ar"
              type="text"
              dir="rtl"
              value={navbarData.announcementTickerArabic || ''}
              onChange={(e) => onChangeField('announcementTickerArabic', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
              placeholder="توصيل سريع لكافة المناطق • سعر الصرف: 89,500 ل.ل/دولار"
            />
          </div>
        </div>
      </div>

      {/* Brand Identity, Logo & Header Contacts */}
      <div className="bg-[#121222] border border-white/10 rounded-3xl p-6 space-y-5">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-amber-400" />
          <span>Store Logo, Favicon & Brand Identity</span>
        </h3>

        {/* Logo & Favicon Upload / URL Inputs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 p-4 bg-slate-950/70 border border-white/10 rounded-2xl">
          {/* Logo Field */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="navbar-logo-url" className="block text-xs font-bold uppercase tracking-wider text-amber-400 cursor-pointer">
                Header Logo Image URL
              </label>
              {navbarData.logoUrl && (
                <button
                  type="button"
                  onClick={() => onChangeField('logoUrl', '')}
                  className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Reset</span>
                </button>
              )}
            </div>
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-xl bg-slate-900 border border-white/10 overflow-hidden flex items-center justify-center shrink-0">
                {navbarData.logoUrl ? (
                  <img src={navbarData.logoUrl} alt="Store Logo Preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <span className="text-xs text-slate-500 font-bold">Default</span>
                )}
              </div>
              <div className="flex-1 space-y-1.5">
                <input
                  id="navbar-logo-url"
                  type="text"
                  value={navbarData.logoUrl || ''}
                  onChange={(e) => onChangeField('logoUrl', e.target.value)}
                  placeholder="https://example.com/logo.png (or upload below)"
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
                />
                <div className="flex items-center gap-2">
                  <input
                    ref={logoFileInputRef}
                    type="file"
                    accept="image/png, image/jpeg, image/svg+xml, image/webp"
                    className="hidden"
                    onChange={(e) => handleFileUpload(e, 'logoUrl')}
                  />
                  <button
                    type="button"
                    onClick={() => logoFileInputRef.current?.click()}
                    className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer"
                  >
                    <Upload className="w-3 h-3" />
                    <span>Upload Logo</span>
                  </button>
                </div>
              </div>
            </div>
            <p className="text-[11px] text-slate-400">Replaces the top left navbar icon across the entire store.</p>
          </div>

          {/* Favicon Field */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="navbar-favicon-url" className="block text-xs font-bold uppercase tracking-wider text-amber-400 cursor-pointer">
                Browser Favicon Icon URL (.ico / .png)
              </label>
              {navbarData.faviconUrl && (
                <button
                  type="button"
                  onClick={() => onChangeField('faviconUrl', '')}
                  className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Reset</span>
                </button>
              )}
            </div>
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-xl bg-slate-900 border border-white/10 overflow-hidden flex items-center justify-center shrink-0">
                {navbarData.faviconUrl ? (
                  <img src={navbarData.faviconUrl} alt="Favicon Preview" className="w-6 h-6 object-contain" referrerPolicy="no-referrer" />
                ) : (
                  <span className="text-[10px] text-slate-500 font-bold">Default</span>
                )}
              </div>
              <div className="flex-1 space-y-1.5">
                <input
                  id="navbar-favicon-url"
                  type="text"
                  value={navbarData.faviconUrl || ''}
                  onChange={(e) => onChangeField('faviconUrl', e.target.value)}
                  placeholder="https://example.com/favicon.ico (or upload below)"
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
                />
                <div className="flex items-center gap-2">
                  <input
                    ref={faviconFileInputRef}
                    type="file"
                    accept="image/png, image/jpeg, image/x-icon, image/svg+xml, image/webp"
                    className="hidden"
                    onChange={(e) => handleFileUpload(e, 'faviconUrl')}
                  />
                  <button
                    type="button"
                    onClick={() => faviconFileInputRef.current?.click()}
                    className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer"
                  >
                    <Upload className="w-3 h-3" />
                    <span>Upload Favicon</span>
                  </button>
                </div>
              </div>
            </div>
            <p className="text-[11px] text-slate-400">Updates the browser tab icon in your customers' browsers.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="navbar-brand-name-en" className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5 cursor-pointer">
              Brand Name (English)
            </label>
            <input
              id="navbar-brand-name-en"
              type="text"
              value={navbarData.brandName || ''}
              onChange={(e) => onChangeField('brandName', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="navbar-brand-name-ar" className="block text-xs font-bold uppercase tracking-wider text-amber-400 mb-1.5 cursor-pointer" dir="rtl">
              اسم المتجر (عربي)
            </label>
            <input
              id="navbar-brand-name-ar"
              type="text"
              dir="rtl"
              value={navbarData.brandNameArabic || ''}
              onChange={(e) => onChangeField('brandNameArabic', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="navbar-brand-sub-en" className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5 cursor-pointer">
              Brand Tagline / Subtitle (English)
            </label>
            <input
              id="navbar-brand-sub-en"
              type="text"
              value={navbarData.brandSubtitle || ''}
              onChange={(e) => onChangeField('brandSubtitle', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="navbar-brand-sub-ar" className="block text-xs font-bold uppercase tracking-wider text-amber-400 mb-1.5 cursor-pointer" dir="rtl">
              شعار المتجر الفرعي (عربي)
            </label>
            <input
              id="navbar-brand-sub-ar"
              type="text"
              dir="rtl"
              value={navbarData.brandSubtitleArabic || ''}
              onChange={(e) => onChangeField('brandSubtitleArabic', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="navbar-phone-support" className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5 flex items-center gap-1.5 cursor-pointer">
              <Phone className="w-3.5 h-3.5 text-emerald-400" />
              <span>Customer Support Phone / WhatsApp Hotline</span>
            </label>
            <input
              id="navbar-phone-support"
              type="text"
              value={navbarData.phoneSupport || ''}
              onChange={(e) => onChangeField('phoneSupport', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Global Search Placeholders */}
      <div className="bg-[#121222] border border-white/10 rounded-3xl p-6 space-y-5">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <Search className="w-5 h-5 text-blue-400" />
          <span>Live Search Box Placeholders</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="navbar-search-en" className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5 cursor-pointer">
              Search Input Placeholder (English)
            </label>
            <input
              id="navbar-search-en"
              type="text"
              value={navbarData.searchPlaceholder || ''}
              onChange={(e) => onChangeField('searchPlaceholder', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="navbar-search-ar" className="block text-xs font-bold uppercase tracking-wider text-amber-400 mb-1.5 cursor-pointer" dir="rtl">
              نص البحث التوضيحي (عربي)
            </label>
            <input
              id="navbar-search-ar"
              type="text"
              dir="rtl"
              value={navbarData.searchPlaceholderArabic || ''}
              onChange={(e) => onChangeField('searchPlaceholderArabic', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Navigation Menu Tabs Manager */}
      <div className="bg-[#121222] border border-white/10 rounded-3xl p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-amber-400" />
            <span>Storefront Navigation Menu Tabs</span>
          </h3>
          <span className="text-xs font-mono text-slate-400">{navTabs.length} items</span>
        </div>

        {/* Existing Tabs List */}
        <div className="space-y-3">
          {navTabs.map((tab, idx) => (
            <div 
              key={idx}
              className="bg-slate-900/90 border border-white/10 rounded-2xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3"
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1 w-full">
                <div>
                  <label htmlFor={`navtab-id-${idx}`} className="block text-[10px] font-bold text-slate-400 uppercase cursor-pointer">Tab Key / ID</label>
                  <input
                    id={`navtab-id-${idx}`}
                    type="text"
                    value={tab.id}
                    onChange={(e) => handleUpdateTab(idx, { id: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-white/10 text-xs text-slate-300 font-mono focus:border-amber-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor={`navtab-label-${idx}`} className="block text-[10px] font-bold text-slate-400 uppercase cursor-pointer">Label (EN)</label>
                  <input
                    id={`navtab-label-${idx}`}
                    type="text"
                    value={tab.label}
                    onChange={(e) => handleUpdateTab(idx, { label: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor={`navtab-label-ar-${idx}`} className="block text-[10px] font-bold text-amber-400 uppercase cursor-pointer" dir="rtl">الاسم (عربي)</label>
                  <input
                    id={`navtab-label-ar-${idx}`}
                    type="text"
                    dir="rtl"
                    value={tab.arabicLabel || ''}
                    onChange={(e) => handleUpdateTab(idx, { arabicLabel: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 self-end md:self-center">
                <button
                  type="button"
                  onClick={() => handleUpdateTab(idx, { isPublished: tab.isPublished === false ? true : false })}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                    tab.isPublished !== false
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-slate-800 text-slate-400 border border-white/5'
                  }`}
                >
                  {tab.isPublished !== false ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  <span>{tab.isPublished !== false ? 'Published' : 'Hidden'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteTab(idx)}
                  className="p-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 transition-colors cursor-pointer"
                  title="Delete tab"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Add New Navigation Tab */}
        <form onSubmit={handleAddTab} className="p-4 bg-slate-950/70 border border-dashed border-white/20 rounded-2xl space-y-3">
          <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" />
            <span>Add Navigation Menu Item</span>
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="new-navtab-id" className="sr-only">Tab ID</label>
              <input
                id="new-navtab-id"
                type="text"
                placeholder="Tab ID (e.g. workshops)"
                value={newTabId}
                onChange={(e) => setNewTabId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none font-mono"
              />
            </div>
            <div>
              <label htmlFor="new-navtab-label" className="sr-only">English Label</label>
              <input
                id="new-navtab-label"
                type="text"
                placeholder="English Label (e.g. Master Workshops)"
                value={newTabLabel}
                onChange={(e) => setNewTabLabel(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="new-navtab-label-ar" className="sr-only">Arabic Label</label>
              <input
                id="new-navtab-label-ar"
                type="text"
                dir="rtl"
                placeholder="الاسم بالعربي (مثال: ورش الحرفيين)"
                value={newTabLabelAr}
                onChange={(e) => setNewTabLabelAr(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={!newTabLabel.trim()}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-slate-900 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Add Tab to Navbar</span>
          </button>
        </form>
      </div>
    </div>
  );
};
