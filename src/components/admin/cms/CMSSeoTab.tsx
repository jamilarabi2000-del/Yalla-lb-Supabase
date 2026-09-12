import React, { useState, useRef } from 'react';
import { Type, Globe, Plus, X, Search, CheckCircle2, Upload, Trash2, Image, ExternalLink, Sparkles } from 'lucide-react';
import { optimizeImageFile } from '../../../utils/imageOptimizer';

interface CMSSeoTabProps {
  seoData?: {
    title: string;
    arabicTitle?: string;
    description: string;
    arabicDescription?: string;
    keywords?: string[];
    arabicKeywords?: string[];
    faviconUrl?: string;
    ogImageUrl?: string;
  };
  onChangeField: (field: string, value: any) => void;
}

export const CMSSeoTab: React.FC<CMSSeoTabProps> = ({
  seoData = {
    title: 'Yalla.lb - Authentic Lebanese Craftsmanship & Terroir Marketplace',
    arabicTitle: 'يلا لبنان - السوق الحرفي والمونة اللبنانية الأصيلة',
    description: 'Shop authentic Lebanese mouneh, artisan blown glass, cedar honey, Koura olive oil, and Levantine heritage crafts directly from Lebanese cooperatives with express worldwide shipping.',
    arabicDescription: 'اكتشف وتسوق أفضل منتجات المونة اللبنانية، زيت زيتون الكورة، عسل السدر، الزعتر البري، والحرف اليدوية الأصيلة من الحرفيين والتعاونيات اللبنانية مع توصيل سريع.',
    keywords: ['Lebanese artisanal', 'mouneh', 'olive oil lebanon', 'zaatar', 'beirut crafts', 'cedar honey', 'tripoli soap', 'diaspora lebanon'],
    arabicKeywords: ['مونة لبنانية', 'زيت زيتون كورة', 'زعتر بلدي', 'عسل سدر لبناني', 'صابون غار طرابلس', 'حرف يدوية لبنانية', 'شحن مغتربين', 'صناعة لبنانية أصيلة']
  },
  onChangeField,
}) => {
  const [newKeywordEn, setNewKeywordEn] = useState('');
  const [newKeywordAr, setNewKeywordAr] = useState('');
  const faviconFileInputRef = useRef<HTMLInputElement>(null);
  const ogImageFileInputRef = useRef<HTMLInputElement>(null);

  const keywordsEn = seoData.keywords || [];
  const keywordsAr = seoData.arabicKeywords || [];

  const handleAddKeywordEn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeywordEn.trim()) return;
    if (!keywordsEn.includes(newKeywordEn.trim())) {
      onChangeField('keywords', [...keywordsEn, newKeywordEn.trim()]);
    }
    setNewKeywordEn('');
  };

  const handleRemoveKeywordEn = (kw: string) => {
    onChangeField('keywords', keywordsEn.filter(k => k !== kw));
  };

  const handleAddKeywordAr = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeywordAr.trim()) return;
    if (!keywordsAr.includes(newKeywordAr.trim())) {
      onChangeField('arabicKeywords', [...keywordsAr, newKeywordAr.trim()]);
    }
    setNewKeywordAr('');
  };

  const handleRemoveKeywordAr = (kw: string) => {
    onChangeField('arabicKeywords', keywordsAr.filter(k => k !== kw));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: 'faviconUrl' | 'ogImageUrl') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file.');
      return;
    }

    try {
      const isFavicon = field === 'faviconUrl';
      const result = await optimizeImageFile(file, {
        maxWidth: isFavicon ? 256 : 1200,
        maxHeight: isFavicon ? 256 : 630,
        quality: 0.85,
        maxSizeBytes: isFavicon ? 50 * 1024 : 150 * 1024
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

  const enTitleLength = (seoData.title || '').length;
  const enDescLength = (seoData.description || '').length;
  const arTitleLength = (seoData.arabicTitle || '').length;
  const arDescLength = (seoData.arabicDescription || '').length;

  const activeFavicon = seoData.faviconUrl?.trim() || 'https://media.base44.com/images/public/69e94b285c1589e0f518bd6c/1851cd0ed_logo.png';

  return (
    <div className="space-y-6">
      {/* Live Google SERP Simulation & Browser Tab Previews */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 1. Google SERP Simulation */}
        <div className="bg-[#121222] border border-white/10 rounded-3xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Search className="w-4 h-4 text-blue-400" aria-hidden="true" />
              <span>Google SERP Search Preview</span>
            </h3>
            <span className="text-[11px] text-emerald-400 flex items-center gap-1 font-bold">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Live Sync</span>
            </span>
          </div>

          <div className="p-4 bg-white rounded-2xl shadow-inner text-left font-sans space-y-1.5 border border-slate-200">
            <div className="flex items-center gap-2 text-xs text-slate-700">
              <div className="w-4 h-4 rounded-full bg-slate-900 overflow-hidden flex items-center justify-center">
                <img src={activeFavicon} alt="" className="w-3.5 h-3.5 object-contain" referrerPolicy="no-referrer" />
              </div>
              <span className="text-xs text-slate-800 font-medium">Yalla Lebanon</span>
              <span className="text-slate-400">https://yalla.shop › lebanon</span>
            </div>

            <h4 className="text-sm text-[#1a0dab] hover:underline font-medium cursor-pointer leading-snug truncate">
              {seoData.title || 'Yalla.lb - Lebanese Craftsmanship Marketplace'}
            </h4>

            <p className="text-xs text-[#4d5156] leading-relaxed line-clamp-2">
              {seoData.description || 'Shop authentic Lebanese crafts, artisan goods, and mouneh specialties directly from regional cooperatives.'}
            </p>
          </div>
        </div>

        {/* 2. Live Browser Tab Mockup */}
        <div className="bg-[#121222] border border-white/10 rounded-3xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Globe className="w-4 h-4 text-amber-400" aria-hidden="true" />
              <span>Browser Tab Live Preview</span>
            </h3>
            <span className="text-[11px] text-slate-400">Real-time tab simulation</span>
          </div>

          <div className="space-y-2">
            {/* Dark Mode Tab Preview */}
            <div className="p-2.5 bg-slate-950 rounded-2xl border border-white/10 flex items-center gap-2">
              <div className="flex-1 max-w-[260px] bg-slate-900 border border-white/15 px-3 py-1.5 rounded-t-xl rounded-b-md flex items-center gap-2 shadow-xs">
                <img src={activeFavicon} alt="Favicon" className="w-4 h-4 object-contain shrink-0" referrerPolicy="no-referrer" />
                <span className="text-xs text-slate-200 font-medium truncate">
                  {seoData.title || 'Yalla — Lebanese Craftsmanship & Commerce'}
                </span>
                <X className="w-3 h-3 text-slate-500 shrink-0 ml-auto" />
              </div>
              <span className="text-[10px] text-slate-500 font-mono">Dark Tab</span>
            </div>

            {/* Light Mode Tab Preview */}
            <div className="p-2.5 bg-slate-200 rounded-2xl border border-slate-300 flex items-center gap-2">
              <div className="flex-1 max-w-[260px] bg-white border border-slate-300 px-3 py-1.5 rounded-t-xl rounded-b-md flex items-center gap-2 shadow-xs">
                <img src={activeFavicon} alt="Favicon" className="w-4 h-4 object-contain shrink-0" referrerPolicy="no-referrer" />
                <span className="text-xs text-slate-800 font-medium truncate">
                  {seoData.title || 'Yalla — Lebanese Craftsmanship & Commerce'}
                </span>
                <X className="w-3 h-3 text-slate-400 shrink-0 ml-auto" />
              </div>
              <span className="text-[10px] text-slate-600 font-mono">Light Tab</span>
            </div>
          </div>
        </div>
      </div>

      {/* Browser Favicon Icon & Social Image Section */}
      <div className="bg-[#121222] border border-white/10 rounded-3xl p-6 space-y-5">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <Globe className="w-5 h-5 text-amber-400" aria-hidden="true" />
          <span>Favicon Icon & Social Share Imagery</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Favicon Control */}
          <div className="p-5 bg-slate-950/70 border border-white/10 rounded-2xl space-y-4">
            <div className="flex items-center justify-between">
              <label htmlFor="seo-favicon" className="block text-xs font-bold uppercase tracking-wider text-amber-400 cursor-pointer">
                Browser Favicon Icon (.ico / .png / .svg / .webp)
              </label>
              {seoData.faviconUrl && (
                <button
                  type="button"
                  onClick={() => onChangeField('faviconUrl', '')}
                  className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Reset to default</span>
                </button>
              )}
            </div>

            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-white/15 p-2 flex items-center justify-center shrink-0 shadow-inner">
                {seoData.faviconUrl ? (
                  <img src={seoData.faviconUrl} alt="Favicon Preview" className="w-8 h-8 object-contain" referrerPolicy="no-referrer" />
                ) : (
                  <Globe className="w-6 h-6 text-amber-400/60" aria-hidden="true" />
                )}
              </div>

              <div className="flex-1 space-y-2">
                <input
                  id="seo-favicon"
                  type="text"
                  value={seoData.faviconUrl || ''}
                  onChange={(e) => onChangeField('faviconUrl', e.target.value)}
                  placeholder="https://example.com/favicon.png or upload image below"
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
                    className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload Favicon File</span>
                  </button>
                  <span className="text-[10px] text-slate-400">PNG, ICO, SVG, WEBP</span>
                </div>
              </div>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Displayed in browser tabs, bookmarks, and mobile home screen shortcuts. After saving, this updates live in the browser tab.
            </p>
          </div>

          {/* Social Share / OpenGraph Banner */}
          <div className="p-5 bg-slate-950/70 border border-white/10 rounded-2xl space-y-4">
            <div className="flex items-center justify-between">
              <label htmlFor="seo-og-image" className="block text-xs font-bold uppercase tracking-wider text-purple-400 cursor-pointer">
                Social Share Preview Image (OG / Twitter)
              </label>
              {seoData.ogImageUrl && (
                <button
                  type="button"
                  onClick={() => onChangeField('ogImageUrl', '')}
                  className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Remove</span>
                </button>
              )}
            </div>

            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-white/15 p-1 flex items-center justify-center shrink-0 overflow-hidden shadow-inner">
                {seoData.ogImageUrl ? (
                  <img src={seoData.ogImageUrl} alt="OG Preview" className="w-full h-full object-cover rounded-xl" referrerPolicy="no-referrer" />
                ) : (
                  <Image className="w-6 h-6 text-purple-400/60" aria-hidden="true" />
                )}
              </div>

              <div className="flex-1 space-y-2">
                <input
                  id="seo-og-image"
                  type="text"
                  value={seoData.ogImageUrl || ''}
                  onChange={(e) => onChangeField('ogImageUrl', e.target.value)}
                  placeholder="https://example.com/banner.jpg or upload"
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-purple-400 focus:outline-none"
                />

                <div className="flex items-center gap-2">
                  <input
                    ref={ogImageFileInputRef}
                    type="file"
                    accept="image/png, image/jpeg, image/webp"
                    className="hidden"
                    onChange={(e) => handleFileUpload(e, 'ogImageUrl')}
                  />
                  <button
                    type="button"
                    onClick={() => ogImageFileInputRef.current?.click()}
                    className="px-3 py-1.5 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 text-purple-300 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload Social Banner</span>
                  </button>
                  <span className="text-[10px] text-slate-400">1200x630px recommended</span>
                </div>
              </div>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Shown when sharing links on WhatsApp, Facebook, iMessage, and X/Twitter.
            </p>
          </div>
        </div>
      </div>

      {/* Meta Titles & Search Descriptions */}
      <div className="bg-[#121222] border border-white/10 rounded-3xl p-6 space-y-5">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <Type className="w-5 h-5 text-amber-400" aria-hidden="true" />
          <span>Meta Titles & Search Descriptions (Bilingual)</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* English Meta */}
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="seo-title-en" className="text-xs font-bold uppercase tracking-wider text-slate-300 cursor-pointer">
                  Global Meta Title (English)
                </label>
                <span className={`text-[11px] font-mono ${
                  enTitleLength >= 40 && enTitleLength <= 65 ? 'text-emerald-400' : 'text-amber-400'
                }`}>
                  {enTitleLength}/65 chars (Optimal: 50-60)
                </span>
              </div>
              <input
                id="seo-title-en"
                type="text"
                value={seoData.title || ''}
                onChange={(e) => onChangeField('title', e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="seo-desc-en" className="text-xs font-bold uppercase tracking-wider text-slate-300 cursor-pointer">
                  Global Meta Description (English)
                </label>
                <span className={`text-[11px] font-mono ${
                  enDescLength >= 120 && enDescLength <= 160 ? 'text-emerald-400' : 'text-amber-400'
                }`}>
                  {enDescLength}/160 chars (Optimal: 140-160)
                </span>
              </div>
              <textarea
                id="seo-desc-en"
                rows={4}
                value={seoData.description || ''}
                onChange={(e) => onChangeField('description', e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none leading-relaxed"
              />
            </div>
          </div>

          {/* Arabic Meta */}
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className={`text-[11px] font-mono font-arabic ${
                  arTitleLength >= 40 && arTitleLength <= 65 ? 'text-emerald-400' : 'text-amber-400'
                }`}>
                  {arTitleLength}/65 (الأمثل: 50-60)
                </span>
                <label htmlFor="seo-title-ar" className="text-xs font-bold uppercase tracking-wider text-amber-400 cursor-pointer font-arabic" dir="rtl">
                  عنوان المتجر لمحركات البحث (عربي)
                </label>
              </div>
              <input
                id="seo-title-ar"
                type="text"
                dir="rtl"
                value={seoData.arabicTitle || ''}
                onChange={(e) => onChangeField('arabicTitle', e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none text-right font-arabic"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className={`text-[11px] font-mono font-arabic ${
                  arDescLength >= 120 && arDescLength <= 160 ? 'text-emerald-400' : 'text-amber-400'
                }`}>
                  {arDescLength}/160 (الأمثل: 140-160)
                </span>
                <label htmlFor="seo-desc-ar" className="text-xs font-bold uppercase tracking-wider text-amber-400 cursor-pointer font-arabic" dir="rtl">
                  الوصف التعريفي لمحركات البحث (عربي)
                </label>
              </div>
              <textarea
                id="seo-desc-ar"
                rows={4}
                dir="rtl"
                value={seoData.arabicDescription || ''}
                onChange={(e) => onChangeField('arabicDescription', e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none leading-relaxed text-right font-arabic"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Meta Keywords Manager */}
      <div className="bg-[#121222] border border-white/10 rounded-3xl p-6 space-y-5">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <Globe className="w-5 h-5 text-purple-400" aria-hidden="true" />
          <span>SEO Keywords & Indexing Tags</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* English Keywords */}
          <div className="space-y-3">
            <label htmlFor="seo-keyword-en" className="block text-xs font-bold uppercase tracking-wider text-slate-300 cursor-pointer">
              Keywords (English)
            </label>
            <div className="flex flex-wrap gap-1.5 min-h-12 p-3 rounded-2xl bg-slate-900 border border-white/10">
              {keywordsEn.map((kw, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-800 text-xs text-slate-200 border border-white/10"
                >
                  <span>{kw}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveKeywordEn(kw)}
                    className="text-slate-400 hover:text-rose-400 cursor-pointer"
                    aria-label={`Remove keyword ${kw}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>

            <form onSubmit={handleAddKeywordEn} className="flex gap-2">
              <input
                id="seo-keyword-en"
                type="text"
                value={newKeywordEn}
                onChange={(e) => setNewKeywordEn(e.target.value)}
                placeholder="Add keyword (e.g. olive soap)"
                className="flex-1 px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!newKeywordEn.trim()}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-amber-400 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            </form>
          </div>

          {/* Arabic Keywords */}
          <div className="space-y-3">
            <label htmlFor="seo-keyword-ar" className="block text-xs font-bold uppercase tracking-wider text-amber-400 font-arabic text-right cursor-pointer" dir="rtl">
              الكلمات المفتاحية (عربي)
            </label>
            <div className="flex flex-wrap gap-1.5 min-h-12 p-3 rounded-2xl bg-slate-900 border border-white/10" dir="rtl">
              {keywordsAr.map((kw, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-800 text-xs text-amber-200 border border-white/10 font-arabic"
                >
                  <span>{kw}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveKeywordAr(kw)}
                    className="text-slate-400 hover:text-rose-400 cursor-pointer mr-1"
                    aria-label={`إزالة الكلمة المفتاحية ${kw}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>

            <form onSubmit={handleAddKeywordAr} className="flex gap-2" dir="rtl">
              <input
                id="seo-keyword-ar"
                type="text"
                dir="rtl"
                value={newKeywordAr}
                onChange={(e) => setNewKeywordAr(e.target.value)}
                placeholder="أضف كلمة مفتاحية (مثال: زعتر بلدي)"
                className="flex-1 px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none text-right font-arabic"
              />
              <button
                type="submit"
                disabled={!newKeywordAr.trim()}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-amber-400 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1 font-arabic"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إضافة</span>
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
