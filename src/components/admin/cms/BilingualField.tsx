import React, { useState, useRef, useEffect, useId } from 'react';
import { Check, Copy, Sparkles, ChevronDown } from 'lucide-react';

export interface SuggestionItem {
  en: string;
  ar: string;
  category?: string;
}

export interface BilingualFieldProps {
  label?: string;
  labelEn?: string;
  labelAr?: string;
  subLabel?: string;
  valueEn: string;
  valueAr: string;
  onChangeEn: (val: string) => void;
  onChangeAr: (val: string) => void;
  placeholderEn?: string;
  placeholderAr?: string;
  type?: 'text' | 'textarea';
  isTextarea?: boolean;
  rows?: number;
  suggestions?: SuggestionItem[];
  presetSuggestions?: SuggestionItem[];
  className?: string;
  id?: string;
}

export const LEBANESE_ARTISANAL_SUGGESTIONS: SuggestionItem[] = [
  {
    category: 'Crafts & Heritage',
    en: 'Authentic Lebanese Treasures, Handcrafted by Master Artisans',
    ar: 'كنوز لبنانية أصيلة، بأيدي أمهر الحرفيين والورش التقليدية'
  },
  {
    category: 'Mouneh & Pantry',
    en: 'Pure Village Mouneh, Extra Virgin Olive Oil & Cedar Honey',
    ar: 'مونة قروية بلدية 100%، زيت زيتون بكر ممتاز وعسل السدر النقي'
  },
  {
    category: 'Delivery & Express',
    en: 'Fast Reliable Delivery Across All Lebanese Regions & Worldwide Diaspora',
    ar: 'توصيل سريع وموثوق لكافة المناطق اللبنانية وللمغتربين حول العالم'
  },
  {
    category: 'Promotions & Discounts',
    en: 'Limited-Time Artisanal Harvest Offers & Exclusive Combo Sets',
    ar: 'عروض موسمية حصرية ومجموعات توفير خاصة من قلب الطبيعة اللبنانية'
  },
  {
    category: 'Call to Action',
    en: 'Explore Artisanal Collection →',
    ar: 'استكشف التشكيلة الحرفية ←'
  },
  {
    category: 'Call to Action',
    en: 'Shop Lebanese Pantry Essentials',
    ar: 'تسوق مستلزمات المونة اللبنانية'
  },
  {
    category: 'Back to School',
    en: 'Handmade Leather Study Gear & Healthy Artisan Snacks',
    ar: 'حقائب جلدية يدوية، قرطاسية تراثية، وسناكات صحية لطلاب المدارس'
  }
];

export const BilingualField: React.FC<BilingualFieldProps> = ({
  label,
  labelEn,
  labelAr,
  subLabel,
  valueEn,
  valueAr,
  onChangeEn,
  onChangeAr,
  placeholderEn = 'Enter English text...',
  placeholderAr = 'أدخل النص بالعربية...',
  type = 'text',
  isTextarea,
  rows = 3,
  suggestions,
  presetSuggestions,
  className = '',
  id
}) => {
  const [copiedField, setCopiedField] = useState<'en' | 'ar' | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const presetsTriggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const reactId = useId();
  const safeReactId = reactId.replace(/:/g, '_');
  const fieldId = id || `bilingual-${safeReactId}`;
  const enId = `${fieldId}-en`;
  const arId = `${fieldId}-ar`;
  const hintId = subLabel ? `${fieldId}-hint` : undefined;
  const presetsId = `${fieldId}-presets`;

  const isMultiLine = Boolean(isTextarea || type === 'textarea');
  const displayLabel = label || labelEn || 'Field';
  const availableSuggestions = presetSuggestions || suggestions;

  useEffect(() => {
    if (!showSuggestions) {
      setActiveIndex(-1);
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (!availableSuggestions || availableSuggestions.length === 0) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        setShowSuggestions(false);
        presetsTriggerRef.current?.focus();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex(prev => {
          const next = prev < availableSuggestions.length - 1 ? prev + 1 : 0;
          itemRefs.current[next]?.scrollIntoView({ block: 'nearest' });
          return next;
        });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex(prev => {
          const next = prev > 0 ? prev - 1 : availableSuggestions.length - 1;
          itemRefs.current[next]?.scrollIntoView({ block: 'nearest' });
          return next;
        });
      } else if (e.key === 'Home') {
        e.preventDefault();
        setActiveIndex(0);
        itemRefs.current[0]?.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'End') {
        e.preventDefault();
        const last = availableSuggestions.length - 1;
        setActiveIndex(last);
        itemRefs.current[last]?.scrollIntoView({ block: 'nearest' });
      } else if ((e.key === 'Enter' || e.key === ' ') && activeIndex >= 0 && activeIndex < availableSuggestions.length) {
        e.preventDefault();
        applySuggestion(availableSuggestions[activeIndex]);
      }
    };
    const onPointerDown = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        !presetsTriggerRef.current?.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [showSuggestions, activeIndex, availableSuggestions]);

  const handleCopy = (field: 'en' | 'ar', text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1500);
  };

  const applySuggestion = (item: SuggestionItem) => {
    onChangeEn(item.en);
    onChangeAr(item.ar);
    setShowSuggestions(false);
    presetsTriggerRef.current?.focus();
  };

  return (
    <div id={id} className={`space-y-2 relative ${className}`}>
      {/* Header with Title & Optional Presets Dropdown */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="block text-xs font-bold text-slate-200 uppercase tracking-wide">
            {displayLabel}
            {labelAr && <span className="ml-2 text-amber-400/80 font-normal normal-case font-arabic">({labelAr})</span>}
          </span>
          {subLabel && (
            <p id={hintId} className="text-[11px] text-slate-400 mt-0.5">{subLabel}</p>
          )}
        </div>

        {availableSuggestions && availableSuggestions.length > 0 && (
          <div className="relative">
            <button
              ref={presetsTriggerRef}
              type="button"
              id={`${presetsId}-trigger`}
              aria-haspopup="listbox"
              aria-expanded={showSuggestions}
              aria-controls={presetsId}
              onClick={() => setShowSuggestions(prev => !prev)}
              className="px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Sparkles className="w-3 h-3" aria-hidden="true" />
              <span>Presets</span>
              <ChevronDown className={`w-3 h-3 transition-transform ${showSuggestions ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>

            {showSuggestions && (
              <div
                ref={dropdownRef}
                id={presetsId}
                role="listbox"
                aria-labelledby={`${presetsId}-label`}
                aria-activedescendant={activeIndex >= 0 ? `${presetsId}-opt-${activeIndex}` : undefined}
                tabIndex={-1}
                className="absolute right-0 top-full mt-2 w-80 sm:w-96 z-50 bg-slate-900/98 backdrop-blur-md border border-amber-500/30 rounded-2xl shadow-2xl p-2 space-y-1.5 max-h-72 overflow-y-auto custom-scrollbar"
              >
                <div id={`${presetsId}-label`} className="px-3 py-1.5 text-[11px] font-bold text-amber-400 border-b border-white/10 uppercase tracking-wider flex items-center justify-between">
                  <span>Copy Presets</span>
                  <span className="text-[10px] text-slate-400">↑↓ to navigate • Enter to select • Esc</span>
                </div>
                {availableSuggestions.map((item, idx) => {
                  const isSelected = activeIndex === idx;
                  return (
                    <button
                      key={idx}
                      ref={(el) => { itemRefs.current[idx] = el; }}
                      id={`${presetsId}-opt-${idx}`}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => applySuggestion(item)}
                      onMouseEnter={() => setActiveIndex(idx)}
                      className={`w-full text-left p-2.5 rounded-xl border transition-all cursor-pointer group ${
                        isSelected
                          ? 'bg-amber-500/20 border-amber-500/40 text-amber-300 ring-1 ring-amber-400/30'
                          : 'border-transparent hover:bg-amber-500/15 hover:border-amber-500/30'
                      }`}
                    >
                      {item.category && (
                        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400/80 block mb-1">
                          {item.category}
                        </span>
                      )}
                      <p className={`text-xs font-medium line-clamp-1 ${isSelected ? 'text-amber-200 font-bold' : 'text-white group-hover:text-amber-300'}`}>
                        {item.en}
                      </p>
                      <p className="text-[11px] text-slate-400 font-arabic text-right line-clamp-1 mt-0.5" dir="rtl">
                        {item.ar}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Side-by-Side Dual-Language Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* English Column */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-400">
            <label htmlFor={enId} className="flex items-center gap-1 text-slate-300 cursor-pointer">
              <span className="text-xs" aria-hidden="true">🇺🇸</span> English (LTR)
            </label>
            <button
              type="button"
              onClick={() => handleCopy('en', valueEn)}
              className="text-slate-500 hover:text-slate-300 flex items-center gap-1 text-[10px] cursor-pointer"
              aria-label="Copy English text to clipboard"
            >
              {copiedField === 'en' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{copiedField === 'en' ? 'Copied' : 'Copy'}</span>
            </button>
          </div>

          {isMultiLine ? (
            <textarea
              id={enId}
              aria-describedby={hintId}
              value={valueEn || ''}
              onChange={(e) => onChangeEn(e.target.value)}
              placeholder={placeholderEn}
              rows={rows}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white placeholder-slate-500 focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30 focus:outline-none transition-all resize-y leading-relaxed"
            />
          ) : (
            <input
              id={enId}
              aria-describedby={hintId}
              type="text"
              value={valueEn || ''}
              onChange={(e) => onChangeEn(e.target.value)}
              placeholder={placeholderEn}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white placeholder-slate-500 focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30 focus:outline-none transition-all"
            />
          )}
        </div>

        {/* Arabic Column */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-400">
            <button
              type="button"
              onClick={() => handleCopy('ar', valueAr)}
              className="text-slate-500 hover:text-slate-300 flex items-center gap-1 text-[10px] cursor-pointer"
              aria-label="نسخ النص العربي للحافظة"
            >
              {copiedField === 'ar' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{copiedField === 'ar' ? 'تم النسخ' : 'نسخ'}</span>
            </button>
            <label htmlFor={arId} className="flex items-center gap-1 text-slate-300 cursor-pointer font-arabic">
              العربية (RTL) <span className="text-xs" aria-hidden="true">🇱🇧</span>
            </label>
          </div>

          {isMultiLine ? (
            <textarea
              id={arId}
              aria-describedby={hintId}
              value={valueAr || ''}
              onChange={(e) => onChangeAr(e.target.value)}
              placeholder={placeholderAr}
              dir="rtl"
              rows={rows}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white placeholder-slate-500 focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30 focus:outline-none transition-all resize-y text-right font-arabic leading-relaxed"
            />
          ) : (
            <input
              id={arId}
              aria-describedby={hintId}
              type="text"
              value={valueAr || ''}
              onChange={(e) => onChangeAr(e.target.value)}
              placeholder={placeholderAr}
              dir="rtl"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white placeholder-slate-500 focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30 focus:outline-none transition-all text-right font-arabic"
            />
          )}
        </div>
      </div>
    </div>
  );
};
