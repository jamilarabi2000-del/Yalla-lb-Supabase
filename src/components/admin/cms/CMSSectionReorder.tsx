import React, { useState } from 'react';
import { 
  ArrowUp, 
  ArrowDown, 
  Move, 
  Eye, 
  EyeOff, 
  RotateCcw, 
  Sparkles, 
  Layers,
  Grid,
  Star,
  Tag,
  Gift,
  Newspaper,
  Clock,
  Heart,
  MessageSquare,
  Mail
} from 'lucide-react';
import { SectionVisibilityConfig } from '../../../types';
import { CMSConfirmModal } from './CMSConfirmModal';

export const DEFAULT_HOME_SECTION_ORDER = [
  'homeHero',
  'homeCategories',
  'homeFeatured',
  'homeDeals',
  'homeBundles',
  'homeNews',
  'homeNewArrivals',
  'homeHeritage',
  'homeReviews',
  'homeNewsletter'
];

interface SectionMeta {
  id: string;
  label: string;
  labelAr: string;
  desc: string;
  visibilityKey?: keyof SectionVisibilityConfig;
}

const SECTION_REGISTRY: Record<string, SectionMeta> = {
  homeHero: {
    id: 'homeHero',
    label: 'Hero Banner & Promotions',
    labelAr: 'البانر الترحيبي وسلايدر العروض',
    desc: 'Main landing showcase, promo coupon slides & artisan metrics',
    visibilityKey: 'homeHero'
  },
  homeCategories: {
    id: 'homeCategories',
    label: 'Category Quick-Filter Grid',
    labelAr: 'شبكة تصفح الفئات والأقسام',
    desc: 'Category cards & quick discovery links',
    visibilityKey: 'homeCategories'
  },
  homeFeatured: {
    id: 'homeFeatured',
    label: 'Featured Artisan Treasures',
    labelAr: 'المنتجات الحرفية المميزة',
    desc: 'Curated handpicked artisanal products carousel',
    visibilityKey: 'homeFeatured'
  },
  homeDeals: {
    id: 'homeDeals',
    label: "Today's Flash Deals",
    labelAr: 'عروض اليوم والتخفيضات',
    desc: 'Limited-time discounted items',
    visibilityKey: 'homeDeals'
  },
  homeBundles: {
    id: 'homeBundles',
    label: 'Exclusive Combo & Gift Sets',
    labelAr: 'باقات الهدايا والتوفير اللبنانية',
    desc: 'Curated artisanal gift sets & bundle savings'
  },
  homeNews: {
    id: 'homeNews',
    label: 'Craft Press & Cultural Stories',
    labelAr: 'أخبار الحرفيين ومقالات التراث',
    desc: 'Press articles, workshops, and Phoenician cultural stories',
    visibilityKey: 'homeNews'
  },
  homeNewArrivals: {
    id: 'homeNewArrivals',
    label: 'New Workshop Arrivals',
    labelAr: 'وصل حديثاً من الورش الحرفية',
    desc: 'Latest craft workshop drops',
    visibilityKey: 'homeNewArrivals'
  },
  homeHeritage: {
    id: 'homeHeritage',
    label: 'Heritage Story Statement',
    labelAr: 'بيان التراث ودعم التعاونيات',
    desc: 'Cultural mission narrative & cooperative pledge',
    visibilityKey: 'homeHeritage'
  },
  homeReviews: {
    id: 'homeReviews',
    label: 'Verified Patron Reviews',
    labelAr: 'آراء وتقييمات الزبائن',
    desc: 'Customer testimonials & 5-star feedback',
    visibilityKey: 'homeReviews'
  },
  homeNewsletter: {
    id: 'homeNewsletter',
    label: 'Heritage Circle Newsletter',
    labelAr: 'النشرة البريدية التراثية',
    desc: 'Email subscription box & diaspora updates',
    visibilityKey: 'homeNewsletter'
  }
};

interface CMSSectionReorderProps {
  order?: string[];
  visibility?: SectionVisibilityConfig;
  onOrderChange: (newOrder: string[]) => void;
  onVisibilityToggle?: (key: keyof SectionVisibilityConfig, val: boolean) => void;
}

export const CMSSectionReorder: React.FC<CMSSectionReorderProps> = ({
  order,
  visibility = {} as SectionVisibilityConfig,
  onOrderChange,
  onVisibilityToggle
}) => {
  // Ensure all known sections exist in the order list
  const currentOrder = React.useMemo(() => {
    const raw = order && order.length > 0 ? order : DEFAULT_HOME_SECTION_ORDER;
    const missing = DEFAULT_HOME_SECTION_ORDER.filter(id => !raw.includes(id));
    return [...raw, ...missing];
  }, [order]);

  const [showResetModal, setShowResetModal] = useState(false);

  const moveSection = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= currentOrder.length) return;

    const updated = [...currentOrder];
    const temp = updated[index];
    updated[index] = updated[newIndex];
    updated[newIndex] = temp;
    onOrderChange(updated);
  };

  const handleConfirmReset = () => {
    onOrderChange(DEFAULT_HOME_SECTION_ORDER);
    setShowResetModal(false);
  };

  return (
    <div className="bg-[#121222] border border-white/10 rounded-3xl p-6 space-y-4">
      <CMSConfirmModal
        isOpen={showResetModal}
        title="Reset Homepage Section Order"
        message="Are you sure you want to reset homepage sections back to the default recommended layout arrangement?"
        confirmLabel="Reset Order"
        cancelLabel="Cancel"
        isDanger={false}
        onConfirm={handleConfirmReset}
        onCancel={() => setShowResetModal(false)}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-amber-400" />
            <span>Homepage Section Order & Visual Arrangement</span>
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Reorder the exact sequence in which sections appear on the homepage using the Up/Down controls.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowResetModal(true)}
          className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-white/10 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset Order</span>
        </button>
      </div>

      {/* Sections List */}
      <div className="space-y-2.5">
        {currentOrder.map((sectionId, idx) => {
          const meta = SECTION_REGISTRY[sectionId] || {
            id: sectionId,
            label: sectionId,
            labelAr: sectionId,
            desc: 'Custom Homepage Section'
          };
          const isVisible = meta.visibilityKey ? visibility[meta.visibilityKey] !== false : true;

          return (
            <div
              key={sectionId}
              className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all ${
                isVisible
                  ? 'bg-slate-900/80 border-white/10 hover:border-amber-400/40'
                  : 'bg-slate-950/60 border-white/5 opacity-50'
              }`}
            >
              {/* Left: Position Number & Info */}
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <span className="w-7 h-7 rounded-xl bg-slate-950 border border-white/10 text-amber-400 text-xs font-mono font-black flex items-center justify-center flex-shrink-0">
                  {idx + 1}
                </span>

                <div className="min-w-0 flex-1 pr-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white truncate">
                      {meta.label}
                    </span>
                    <span className="text-[11px] text-slate-400 font-arabic truncate hidden sm:inline" dir="rtl">
                      ({meta.labelAr})
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 truncate mt-0.5">
                    {meta.desc}
                  </p>
                </div>
              </div>

              {/* Right: Visibility Tag & Move Controls */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {meta.visibilityKey && onVisibilityToggle && (
                  <button
                    type="button"
                    onClick={() => onVisibilityToggle(meta.visibilityKey!, !isVisible)}
                    className={`p-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                      isVisible
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/30'
                        : 'bg-rose-500/20 text-rose-300 border-rose-500/30 hover:bg-rose-500/30'
                    }`}
                    title={isVisible ? 'Visible on storefront' : 'Hidden from storefront'}
                  >
                    {isVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    <span className="hidden md:inline text-[10px] uppercase">
                      {isVisible ? 'Visible' : 'Hidden'}
                    </span>
                  </button>
                )}

                {/* Up / Down Controls */}
                <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-white/10">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => moveSection(idx, 'up')}
                    className="p-1.5 rounded-lg text-slate-300 hover:text-amber-400 hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                    title="Move section up"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={idx === currentOrder.length - 1}
                    onClick={() => moveSection(idx, 'down')}
                    className="p-1.5 rounded-lg text-slate-300 hover:text-amber-400 hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                    title="Move section down"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
