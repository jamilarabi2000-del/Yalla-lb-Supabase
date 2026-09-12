import { safeHref } from '../../../lib/safeUrl';
import React, { useState, useEffect } from 'react';
import { Image as ImageIcon, Upload, Check, Sparkles, X, ExternalLink, RefreshCw, AlertCircle, Loader2 } from 'lucide-react';
import { optimizeImageFile, formatBytes } from '../../../utils/imageOptimizer';

export interface HeritageAssetPreset {
  id: string;
  category: 'crafts' | 'mouneh' | 'heritage' | 'banners' | 'textiles';
  title: string;
  titleAr: string;
  url: string;
  aspect: '16:9' | '1:1' | '4:3' | '21:9';
}

export const LEBANESE_HERITAGE_PRESETS: HeritageAssetPreset[] = [
  {
    id: 'hero-craft-workshop',
    category: 'banners',
    title: 'Master Artisan Workshop & Blown Glass',
    titleAr: 'ورشة الحرفي والزجاج المنفوخ التراثي',
    url: 'https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&q=80&w=2000',
    aspect: '16:9'
  },
  {
    id: 'hero-pottery-cedars',
    category: 'banners',
    title: 'Baalbek Ceramics & Lebanese Terracotta',
    titleAr: 'فخار بعلبك والخزف اللبناني التقليدي',
    url: 'https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?auto=format&fit=crop&q=80&w=2000',
    aspect: '16:9'
  },
  {
    id: 'hero-beirut-vintage',
    category: 'banners',
    title: 'Traditional Levantine Architecture & Tiles',
    titleAr: 'العمارة اللبنانية والبلاط التراثي المعتق',
    url: 'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?auto=format&fit=crop&q=80&w=2000',
    aspect: '16:9'
  },
  {
    id: 'mouneh-olive-oil',
    category: 'mouneh',
    title: 'Koura Olive Groves & Cold-Pressed Oil',
    titleAr: 'زيت زيتون الكورة البكر المعصور على البارد',
    url: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&q=80&w=1200',
    aspect: '4:3'
  },
  {
    id: 'mouneh-wild-honey',
    category: 'mouneh',
    title: 'Pure Cedar Mountain Wildflower Honey',
    titleAr: 'عسل السدر والزهور البرية من جبال الأرز',
    url: 'https://images.unsplash.com/photo-1587049352846-4a222e784d38?auto=format&fit=crop&q=80&w=1200',
    aspect: '4:3'
  },
  {
    id: 'mouneh-zaatar-spices',
    category: 'mouneh',
    title: 'Organic Mountain Wild Thyme & Sumac',
    titleAr: 'زعتر بري بلدي وسماق قروي معتق',
    url: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?auto=format&fit=crop&q=80&w=1200',
    aspect: '1:1'
  },
  {
    id: 'craft-tripoli-soap',
    category: 'crafts',
    title: 'Traditional Tripoli Olive & Laurel Soap',
    titleAr: 'صابون الغار وزيت الزيتون الطرابلسي الأصيل',
    url: 'https://images.unsplash.com/photo-1607006314152-32a2f901416e?auto=format&fit=crop&q=80&w=1200',
    aspect: '1:1'
  },
  {
    id: 'craft-jezzine-cutlery',
    category: 'crafts',
    title: 'Jezzine Inlaid Cutlery & Damascus Steel',
    titleAr: 'سكاكين وجزينات صيداوية مدموغة بالعظم والصدف',
    url: 'https://images.unsplash.com/photo-1593618998160-e34014e67546?auto=format&fit=crop&q=80&w=1200',
    aspect: '4:3'
  },
  {
    id: 'craft-sarafand-glass',
    category: 'crafts',
    title: 'Sarafand Hand-Blown Recycled Glass Pitcher',
    titleAr: 'أباريق الزجاج اليدوي المنفوخ من الصرفند',
    url: 'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?auto=format&fit=crop&q=80&w=1200',
    aspect: '1:1'
  },
  {
    id: 'craft-ceramic-pourover',
    category: 'crafts',
    title: 'Artisan Ceramic Coffee Server & Pour-Over Dripper',
    titleAr: 'طقم تحضير القهوة السيراميكي الفاخر المصنوع يدوياً',
    url: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=800&q=80',
    aspect: '4:3'
  },
  {
    id: 'heritage-cedars-forest',
    category: 'heritage',
    title: 'The Sacred Cedars of God & Mount Lebanon',
    titleAr: 'أرز الرب وجبال لبنان الشامخة',
    url: 'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&q=80&w=2000',
    aspect: '16:9'
  }
];

interface MediaAssetPickerProps {
  label: string;
  subLabel?: string;
  value: string;
  onChange: (url: string) => void;
  recommendedRatio?: '16:9' | '1:1' | '4:3' | '21:9';
  recommendedDimensions?: string;
  className?: string;
  id?: string;
}

export const MediaAssetPicker: React.FC<MediaAssetPickerProps> = ({
  label,
  subLabel,
  value,
  onChange,
  recommendedRatio = '16:9',
  recommendedDimensions = '1920×800px',
  className = '',
  id
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'banners' | 'mouneh' | 'crafts' | 'heritage'>('all');
  const [dragActive, setDragActive] = useState(false);
  const [tempUrl, setTempUrl] = useState(value || '');
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizeStats, setOptimizeStats] = useState<{ original: string; optimized: string; savings: number } | null>(null);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [value]);

  const filteredPresets = selectedCategory === 'all'
    ? LEBANESE_HERITAGE_PRESETS
    : LEBANESE_HERITAGE_PRESETS.filter(p => p.category === selectedCategory);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Please upload a valid image file (JPG, PNG, WebP, SVG).');
      return;
    }

    try {
      setIsOptimizing(true);
      setOptimizeStats(null);
      setImgError(false);

      const isBanner = recommendedRatio === '16:9' || recommendedRatio === '21:9';
      const result = await optimizeImageFile(file, {
        maxWidth: isBanner ? 1440 : 900,
        maxHeight: isBanner ? 810 : 900,
        quality: 0.78,
        maxSizeBytes: isBanner ? 85 * 1024 : 60 * 1024
      });

      onChange(result.dataUrl);
      setTempUrl(result.dataUrl);
      setOptimizeStats({
        original: formatBytes(result.originalSizeBytes),
        optimized: formatBytes(result.optimizedSizeBytes),
        savings: result.savingsPercent
      });
      setIsOpen(false);
    } catch (err) {
      console.warn('Canvas optimization failed, falling back to direct reader:', err);
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          const dataUrl = e.target.result as string;
          onChange(dataUrl);
          setTempUrl(dataUrl);
        }
      };
      reader.readAsDataURL(file);
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div id={id} className={`space-y-2 ${className}`}>
      {/* Header with Title & Recommended Specs */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <label className="block text-xs font-bold text-slate-200 uppercase tracking-wide">
            {label}
          </label>
          {subLabel && (
            <p className="text-[11px] text-slate-400 mt-0.5">{subLabel}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded-md bg-slate-800 border border-white/10 text-[10px] font-mono text-amber-300">
            {recommendedRatio} ({recommendedDimensions})
          </span>
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Asset Gallery</span>
          </button>
        </div>
      </div>

      {/* Main Input Row with Inline Thumbnail & Actions */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-3">
          {/* Live Thumbnail Preview */}
          <div className="w-16 h-12 rounded-xl bg-slate-900 border border-white/15 overflow-hidden flex-shrink-0 relative group flex items-center justify-center">
            {isOptimizing ? (
              <div className="flex flex-col items-center justify-center text-amber-400">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : value ? (
              <>
                {imgError ? (
                  <div className="w-full h-full bg-red-950/40 flex flex-col items-center justify-center text-red-400 p-1 text-center" title="Image failed to load. Please verify the URL or upload a new file.">
                    <AlertCircle className="w-4 h-4" />
                    <span className="text-[8px] mt-0.5 leading-tight">Broken</span>
                  </div>
                ) : (
                  <img
                    src={value}
                    alt="Preview"
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                    onError={() => setImgError(true)}
                  />
                )}
                <button
                  type="button"
                  onClick={() => {
                    onChange('');
                    setOptimizeStats(null);
                    setImgError(false);
                  }}
                  className="absolute inset-0 bg-black/70 text-rose-400 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer text-xs"
                  title="Remove image"
                >
                  <X className="w-4 h-4" />
                </button>
              </>
            ) : (
              <ImageIcon className="w-5 h-5 text-slate-600" />
            )}
          </div>

          {/* URL Input */}
          <div className="flex-1 relative">
            <input
              type="text"
              value={value || ''}
              onChange={(e) => {
                onChange(e.target.value);
                setImgError(false);
                setOptimizeStats(null);
              }}
              placeholder="Paste image URL (https://...) or upload file"
              className="w-full pl-3.5 pr-20 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none"
            />
            <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <label 
                className={`p-1.5 rounded-lg text-slate-300 hover:text-white cursor-pointer transition-colors ${
                  isOptimizing ? 'bg-amber-500/30 text-amber-300 animate-pulse' : 'bg-slate-800 hover:bg-slate-700'
                }`} 
                title="Upload & optimize local image file"
              >
                {isOptimizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                <input
                  type="file"
                  accept="image/*"
                  disabled={isOptimizing}
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleFile(e.target.files[0]);
                    }
                  }}
                />
              </label>
              {value && !imgError && (
                <a
                  href={safeHref(value)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white cursor-pointer transition-colors"
                  title="Open image in new tab"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Compression / Optimization Feedback */}
        {optimizeStats && (
          <div className="flex items-center gap-2 text-[11px] text-emerald-400 bg-emerald-950/30 border border-emerald-500/20 px-3 py-1 rounded-lg">
            <Check className="w-3 h-3 text-emerald-400 flex-shrink-0" />
            <span>
              Web-Optimized: <strong>{optimizeStats.optimized}</strong> ({optimizeStats.savings}% smaller than original {optimizeStats.original})
            </span>
          </div>
        )}

        {isOptimizing && (
          <div className="flex items-center gap-2 text-[11px] text-amber-300 bg-amber-950/30 border border-amber-500/20 px-3 py-1 rounded-lg animate-pulse">
            <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
            <span>Optimizing image resolution & compressing for web...</span>
          </div>
        )}

        {imgError && value && (
          <div className="flex items-center gap-2 text-[11px] text-rose-400 bg-rose-950/30 border border-rose-500/20 px-3 py-1 rounded-lg">
            <AlertCircle className="w-3 h-3 flex-shrink-0" />
            <span>Image URL failed to load. A high-quality fallback is shown on the storefront.</span>
          </div>
        )}
      </div>

      {/* Asset Gallery & Heritage Preset Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/15 rounded-3xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-fadeIn">
            {/* Modal Header */}
            <div className="p-5 border-b border-white/10 flex items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <ImageIcon className="w-5 h-5 text-amber-400" />
                  <span>Media Asset Library & Lebanese Presets</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Select a curated Lebanese artisanal asset or upload your own high-resolution photography.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-5 custom-scrollbar flex-1">
              {/* Drag & Drop Upload Zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer ${
                  dragActive 
                    ? 'border-amber-400 bg-amber-500/10' 
                    : 'border-white/15 bg-slate-950/50 hover:border-amber-400/50 hover:bg-slate-800/40'
                }`}
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = 'image/*';
                  input.onchange = (e: any) => {
                    if (e.target.files && e.target.files[0]) {
                      handleFile(e.target.files[0]);
                    }
                  };
                  input.click();
                }}
              >
                <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto mb-3">
                  <Upload className="w-6 h-6" />
                </div>
                <p className="text-sm font-bold text-white">
                  Drop image here or click to browse
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Supports JPG, PNG, WebP, SVG • Recommended: {recommendedRatio} ({recommendedDimensions})
                </p>
              </div>

              {/* Category Filter Pills */}
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-1">
                  Curated Presets:
                </span>
                {[
                  { id: 'all', label: 'All Lebanese Presets' },
                  { id: 'banners', label: 'Hero Banners (16:9)' },
                  { id: 'crafts', label: 'Artisan Crafts & Glass' },
                  { id: 'mouneh', label: 'Pantry & Terroir' },
                  { id: 'heritage', label: 'Cedars & Nature' }
                ].map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategory(cat.id as any)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      selectedCategory === cat.id
                        ? 'bg-amber-500 text-slate-950 shadow-sm'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* Presets Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {filteredPresets.map((preset) => {
                  const isSelected = value === preset.url;
                  return (
                    <div
                      key={preset.id}
                      onClick={() => {
                        onChange(preset.url);
                        setIsOpen(false);
                      }}
                      className={`group relative rounded-2xl overflow-hidden border bg-slate-950 cursor-pointer transition-all hover:scale-[1.02] ${
                        isSelected 
                          ? 'border-amber-400 ring-2 ring-amber-400/40 shadow-lg' 
                          : 'border-white/10 hover:border-amber-400/60'
                      }`}
                    >
                      <div className="aspect-video w-full overflow-hidden bg-slate-800 relative">
                        <img
                          src={preset.url}
                          alt={preset.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          loading="lazy"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute top-2 left-2">
                          <span className="px-2 py-0.5 rounded-md bg-black/75 backdrop-blur-xs text-[10px] font-mono text-amber-300 border border-white/10">
                            {preset.aspect}
                          </span>
                        </div>
                        {isSelected && (
                          <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center shadow-md">
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </div>
                        )}
                      </div>

                      <div className="p-3 bg-slate-900/95 space-y-1">
                        <p className="text-xs font-bold text-white truncate">
                          {preset.title}
                        </p>
                        <p className="text-[11px] text-slate-400 font-arabic truncate text-right" dir="rtl">
                          {preset.titleAr}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-950 border-t border-white/10 flex items-center justify-between">
              <span className="text-xs text-slate-400">
                Click any preset or drop a file to immediately apply to this field.
              </span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-colors cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
