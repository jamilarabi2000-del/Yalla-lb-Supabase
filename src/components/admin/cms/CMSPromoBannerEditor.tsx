import React, { useState } from 'react';
import { useShop } from '../../../context/ShopContext';
import { CMSPromoSliderConfig, CMSPromoSlide } from '../../../types';
import { 
  Sparkles, 
  Eye, 
  EyeOff, 
  Image as ImageIcon, 
  Type, 
  ShoppingBag, 
  Tag, 
  Grid, 
  Calendar, 
  Clock, 
  Palette, 
  Link as LinkIcon, 
  RotateCcw, 
  Trash2, 
  ExternalLink, 
  Layers, 
  AlignLeft, 
  AlignCenter, 
  AlignRight, 
  Check,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Plus,
  Copy,
  ArrowUp,
  ArrowDown,
  Sliders,
  Play,
  Pause,
  Repeat,
  Tv
} from 'lucide-react';
import { BilingualField } from './BilingualField';
import { MediaAssetPicker } from './MediaAssetPicker';
import { HomepagePromoSlider } from '../../HomepagePromoSlider';

// Lebanese Craft / Cultural Preset Images for Quick Selection
const PROMO_IMAGE_PRESETS = [
  {
    name: 'Sarafand Hand-Blown Glass',
    url: 'https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?auto=format&fit=crop&q=80&w=800'
  },
  {
    name: 'Artisan Pottery & Clay',
    url: 'https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?auto=format&fit=crop&q=80&w=800'
  },
  {
    name: 'Koura Olive Harvest & Terroir',
    url: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&q=80&w=800'
  },
  {
    name: 'Cedar Wood & Heritage Crafting',
    url: 'https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&q=80&w=800'
  },
  {
    name: 'Tripoli Olive Laurel Soap',
    url: 'https://images.unsplash.com/photo-1607006483669-e0d0ca17013e?auto=format&fit=crop&q=80&w=800'
  },
  {
    name: 'Back to School & Essentials',
    url: 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&q=80&w=800'
  }
];

const TARGET_URL_PRESETS = [
  { label: 'All Products Catalog (/products)', url: '/products' },
  { label: 'Pantry & Mouneh (/products?category=Pantry)', url: '/products?category=Pantry' },
  { label: 'Home & Blown Glass (/products?category=Home & Art)', url: '/products?category=Home & Art' },
  { label: 'Fashion & Textiles (/products?category=Fashion)', url: '/products?category=Fashion' },
  { label: 'Beauty & Laurel Soaps (/products?category=Beauty)', url: '/products?category=Beauty' },
  { label: 'Special Offers & Deals (/products?category=all)', url: '/products' },
  { label: 'My Account (/account)', url: '/account' },
];

interface CMSPromoBannerEditorProps {
  promoBannerData?: CMSPromoSliderConfig;
  onChangePromoBanner: (updates: Partial<CMSPromoSliderConfig>) => void;
}

export const CMSPromoBannerEditor: React.FC<CMSPromoBannerEditorProps> = ({
  promoBannerData,
  onChangePromoBanner
}) => {
  const { products = [], categories = [], language } = useShop();
  const [productSearch, setProductSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'slides' | 'settings'>('slides');

  // Normalize initial slides
  const config: CMSPromoSliderConfig = promoBannerData || {
    enabled: true,
    autoplay: true,
    autoplayInterval: 5000,
    showArrows: true,
    showDots: true,
    loop: true,
    transitionEffect: 'slide',
    slides: []
  };

  const getSlides = (): CMSPromoSlide[] => {
    if (Array.isArray(config.slides) && config.slides.length > 0) {
      return config.slides;
    }
    // Fallback migration from single slide if present
    if (config.title || config.titleArabic || config.imageUrl) {
      return [{
        id: config.id || 'slide-1',
        isPublished: config.isPublished !== false,
        type: config.type || 'custom',
        badge: config.badge || 'Artisan Spotlight',
        badgeArabic: config.badgeArabic || 'تسليط الضوء الحرفي',
        title: config.title || 'Authentic Heritage Crafts & Mouneh',
        titleArabic: config.titleArabic || 'حرف ومونة تراثية أصيلة',
        description: config.description || 'Directly supporting independent Lebanese artisans & cooperatives.',
        descriptionArabic: config.descriptionArabic || 'دعم مباشر للحرفيين والتعاونيات والمشاغل اللبنانية الأصيلة.',
        imageUrl: config.imageUrl || PROMO_IMAGE_PRESETS[0].url,
        imageFit: config.imageFit || 'contain',
        bgStyle: config.bgStyle || 'default',
        customBgColor: config.customBgColor,
        customTextColor: config.customTextColor,
        showCta: config.showCta !== false,
        ctaText: config.ctaText || 'Explore Collection',
        ctaTextArabic: config.ctaTextArabic || 'تصفح التشكيلة',
        ctaUrl: config.ctaUrl || '/products',
        ctaType: config.ctaType || 'button',
        targetCategory: config.targetCategory,
        selectedProductId: config.selectedProductId,
        selectedProductIds: config.selectedProductIds,
        contentAlignment: config.contentAlignment || 'left',
        scheduleActive: config.scheduleActive || false,
        startDate: config.startDate,
        endDate: config.endDate,
        order: 1
      }];
    }
    return [
      {
        id: 'slide-1',
        isPublished: true,
        type: 'custom',
        badge: 'Artisan Spotlight',
        badgeArabic: 'تسليط الضوء الحرفي',
        title: 'Authentic Heritage Crafts & Mouneh',
        titleArabic: 'حرف ومونة تراثية أصيلة',
        description: 'Directly supporting independent Lebanese artisans, cooperatives, and traditional workshops.',
        descriptionArabic: 'دعم مباشر للحرفيين والتعاونيات والمشاغل اللبنانية الأصيلة في مختلف المناطق.',
        imageUrl: PROMO_IMAGE_PRESETS[0].url,
        imageFit: 'contain',
        bgStyle: 'default',
        showCta: true,
        ctaText: 'Explore Collection',
        ctaTextArabic: 'تصفح التشكيلة',
        ctaUrl: '/products',
        ctaType: 'button',
        order: 1
      }
    ];
  };

  const slides = getSlides();
  const [selectedSlideId, setSelectedSlideId] = useState<string>(() => slides[0]?.id || 'slide-1');

  // Ensure selected slide exists
  const currentSlideIndex = Math.max(0, slides.findIndex(s => s.id === selectedSlideId));
  const activeSlide: CMSPromoSlide = slides[currentSlideIndex] || slides[0] || {
    id: 'slide-1',
    isPublished: true,
    type: 'custom',
    title: 'New Slide',
    order: 1
  };

  // Helper to commit slide changes
  const handleUpdateCurrentSlide = (updates: Partial<CMSPromoSlide>) => {
    const updatedSlides = slides.map(s => {
      if (s.id === activeSlide.id) {
        return { ...s, ...updates };
      }
      return s;
    });
    onChangePromoBanner({ slides: updatedSlides });
  };

  // Slide CRUD Actions
  const handleAddSlide = () => {
    const newId = `slide-${Date.now()}`;
    const newSlide: CMSPromoSlide = {
      id: newId,
      isPublished: true,
      type: 'custom',
      badge: 'New Promotion',
      badgeArabic: 'عرض جديد',
      title: 'Lebanese Artisanal Special',
      titleArabic: 'عرض حرفي لبناني خاص',
      description: 'Discover handcrafted local products made with authentic passion.',
      descriptionArabic: 'اكتشف منتجات حرفية محلية صُنعت بكل حب وأصالة.',
      imageUrl: PROMO_IMAGE_PRESETS[Math.floor(Math.random() * PROMO_IMAGE_PRESETS.length)].url,
      imageFit: 'contain',
      bgStyle: 'default',
      showCta: true,
      ctaText: 'Explore',
      ctaTextArabic: 'استكشف',
      ctaUrl: '/products',
      order: slides.length + 1
    };

    const newSlides = [...slides, newSlide];
    onChangePromoBanner({ slides: newSlides });
    setSelectedSlideId(newId);
  };

  const handleDuplicateSlide = (slideId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const target = slides.find(s => s.id === slideId);
    if (!target) return;

    const duplicatedId = `slide-${Date.now()}`;
    const duplicatedSlide: CMSPromoSlide = {
      ...target,
      id: duplicatedId,
      title: `${target.title || 'Slide'} (Copy)`,
      titleArabic: target.titleArabic ? `${target.titleArabic} (نسخة)` : undefined,
      order: slides.length + 1
    };

    const newSlides = [...slides, duplicatedSlide];
    onChangePromoBanner({ slides: newSlides });
    setSelectedSlideId(duplicatedId);
  };

  const handleDeleteSlide = (slideId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (slides.length <= 1) {
      alert('You must have at least one slide in the configuration.');
      return;
    }
    const newSlides = slides.filter(s => s.id !== slideId);
    onChangePromoBanner({ slides: newSlides });
    if (selectedSlideId === slideId) {
      setSelectedSlideId(newSlides[0]?.id || '');
    }
  };

  const handleToggleSlidePublished = (slideId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const updatedSlides = slides.map(s => {
      if (s.id === slideId) {
        return { ...s, isPublished: s.isPublished === false ? true : false };
      }
      return s;
    });
    onChangePromoBanner({ slides: updatedSlides });
  };

  const handleMoveSlide = (index: number, direction: 'up' | 'down', e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= slides.length) return;

    const updated = [...slides];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;

    // Normalize orders
    const reordered = updated.map((s, idx) => ({ ...s, order: idx + 1 }));
    onChangePromoBanner({ slides: reordered });
  };

  // Check schedule badge status
  const getScheduleStatus = (slide: CMSPromoSlide) => {
    if (!slide.scheduleActive) return { label: 'Always Active', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    const now = new Date();
    if (slide.startDate) {
      const start = new Date(slide.startDate);
      if (!isNaN(start.getTime()) && now < start) {
        return { label: 'Scheduled (Future)', color: 'bg-amber-50 text-amber-700 border-amber-200' };
      }
    }
    if (slide.endDate) {
      const end = new Date(slide.endDate);
      if (!isNaN(end.getTime()) && now > end) {
        return { label: 'Expired', color: 'bg-rose-50 text-rose-700 border-rose-200' };
      }
    }
    return { label: 'Active Now', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  };

  // Filter products for product promotion picker
  const filteredProducts = products.filter(p => {
    if (!productSearch) return true;
    const q = productSearch.toLowerCase();
    return (
      p.name?.toLowerCase().includes(q) ||
      p.arabicName?.toLowerCase().includes(q) ||
      p.category?.toLowerCase().includes(q) ||
      p.artisan?.toLowerCase().includes(q)
    );
  }).slice(0, 15);

  return (
    <div className="space-y-6">
      {/* Top Banner Status & Mode Selector */}
      <div className="bg-white rounded-2xl p-5 border border-neutral-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-[#B89753]/10 text-[#8F7137]">
              <Tv className="w-4 h-4" />
            </span>
            <h3 className="text-base font-bold text-neutral-900">
              Homepage Promotional Content Slider & Carousel
            </h3>
          </div>
          <p className="text-xs text-neutral-500 mt-1 max-w-xl">
            Manage single or multi-slide responsive content blocks displayed alongside the main hero banner.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Main Visibility Toggle */}
          <button
            type="button"
            onClick={() => onChangePromoBanner({ enabled: config.enabled === false ? true : false })}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
              config.enabled !== false 
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100' 
                : 'bg-neutral-100 text-neutral-600 border-neutral-300 hover:bg-neutral-200'
            }`}
          >
            {config.enabled !== false ? <Eye className="w-3.5 h-3.5 text-emerald-600" /> : <EyeOff className="w-3.5 h-3.5 text-neutral-400" />}
            <span>{config.enabled !== false ? 'Slider Visible on Homepage' : 'Slider Hidden (Disabled)'}</span>
          </button>

          {/* Sub-tab switcher */}
          <div className="flex items-center bg-neutral-100 p-1 rounded-xl border border-neutral-200 text-xs font-medium">
            <button
              type="button"
              onClick={() => setActiveTab('slides')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'slides' ? 'bg-white text-neutral-900 shadow-xs font-bold' : 'text-neutral-500 hover:text-neutral-800'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Slides ({slides.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'settings' ? 'bg-white text-neutral-900 shadow-xs font-bold' : 'text-neutral-500 hover:text-neutral-800'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Slider Behavior</span>
            </button>
          </div>
        </div>
      </div>

      {/* Real-time Visual Preview */}
      <div className="bg-neutral-950 p-4 sm:p-6 rounded-2xl border border-neutral-800 text-white space-y-3 shadow-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-mono uppercase tracking-wider text-neutral-400">
              Live Responsive Preview ({slides.length} {slides.length === 1 ? 'Slide' : 'Slides'})
            </span>
          </div>
          <span className="text-[11px] text-neutral-400">
            Rendered exactly as buyers see it
          </span>
        </div>

        {/* Live Preview Container with exact aspect ratio */}
        <div className="max-w-[480px] mx-auto w-full">
          <HomepagePromoSlider bannerConfig={config} />
        </div>
      </div>

      {/* TAB 1: SLIDES MANAGEMENT & EDITING */}
      {activeTab === 'slides' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* LEFT: SLIDES LIST (4 cols) */}
          <div className="lg:col-span-4 bg-white rounded-2xl p-4 border border-neutral-200/80 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-neutral-100">
              <span className="text-xs font-bold text-neutral-900 uppercase tracking-wider">
                Slides ({slides.length})
              </span>
              <button
                type="button"
                onClick={handleAddSlide}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#111111] hover:bg-[#8F7137] text-white text-xs font-semibold cursor-pointer shadow-xs transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Slide</span>
              </button>
            </div>

            <div className="space-y-2 max-h-[580px] overflow-y-auto pr-1">
              {slides.map((slide, idx) => {
                const isSelected = slide.id === activeSlide.id;
                const sched = getScheduleStatus(slide);

                return (
                  <div
                    key={slide.id || idx}
                    onClick={() => setSelectedSlideId(slide.id)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col gap-2 ${
                      isSelected 
                        ? 'border-[#B89753] bg-[#B89753]/5 ring-2 ring-[#B89753]/20' 
                        : 'border-neutral-200 hover:border-neutral-300 bg-white'
                    }`}
                  >
                    {/* Slide Header */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-5 h-5 rounded-full bg-neutral-100 text-neutral-600 font-mono text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                          {idx + 1}
                        </span>
                        <span className="text-xs font-bold text-neutral-900 truncate">
                          {slide.title || slide.titleArabic || `Slide #${idx + 1}`}
                        </span>
                      </div>

                      {/* Controls: Move & Quick actions */}
                      <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={(e) => handleMoveSlide(idx, 'up', e)}
                          title="Move Up"
                          className="p-1 rounded text-neutral-400 hover:text-neutral-700 disabled:opacity-20 cursor-pointer"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === slides.length - 1}
                          onClick={(e) => handleMoveSlide(idx, 'down', e)}
                          title="Move Down"
                          className="p-1 rounded text-neutral-400 hover:text-neutral-700 disabled:opacity-20 cursor-pointer"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleToggleSlidePublished(slide.id, e)}
                          title={slide.isPublished !== false ? 'Disable Slide' : 'Enable Slide'}
                          className={`p-1 rounded cursor-pointer ${
                            slide.isPublished !== false ? 'text-emerald-600 hover:text-emerald-700' : 'text-neutral-300 hover:text-neutral-500'
                          }`}
                        >
                          {slide.isPublished !== false ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    {/* Thumbnail + Details */}
                    <div className="flex items-center gap-2.5 text-[11px] text-neutral-500">
                      {slide.imageUrl ? (
                        <img 
                          src={slide.imageUrl} 
                          alt="thumb" 
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            e.currentTarget.src = 'https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?auto=format&fit=crop&q=80&w=800';
                          }}
                          className="w-10 h-10 rounded-lg object-cover border border-neutral-200 flex-shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-neutral-100 flex items-center justify-center text-neutral-400 border border-neutral-200 flex-shrink-0 font-mono text-[9px]">
                          TEXT
                        </div>
                      )}

                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="capitalize px-1.5 py-0.2 rounded bg-neutral-100 text-[10px] text-neutral-700 font-medium">
                            {slide.type || 'custom'}
                          </span>
                          <span className={`text-[9px] px-1.5 py-0.2 rounded border ${sched.color}`}>
                            {sched.label}
                          </span>
                        </div>
                        <p className="truncate text-neutral-400 text-[10px]">
                          {slide.badge || slide.badgeArabic || 'No badge'}
                        </p>
                      </div>
                    </div>

                    {/* Slide Footer Actions: Duplicate & Delete */}
                    <div className="flex items-center justify-end gap-2 pt-1 border-t border-neutral-100 text-[11px]" onClick={e => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={(e) => handleDuplicateSlide(slide.id, e)}
                        className="text-neutral-500 hover:text-[#8F7137] flex items-center gap-1 cursor-pointer"
                      >
                        <Copy className="w-3 h-3" />
                        <span>Duplicate</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteSlide(slide.id, e)}
                        className="text-rose-500 hover:text-rose-700 flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* RIGHT: SELECTED SLIDE EDITOR (8 cols) */}
          <div className="lg:col-span-8 bg-white rounded-2xl p-6 border border-neutral-200/80 shadow-xs space-y-6">
            
            {/* Header of Active Slide Editor */}
            <div className="flex items-center justify-between pb-4 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[#B89753]/20 text-[#8F7137] font-mono text-xs font-bold flex items-center justify-center">
                  {currentSlideIndex + 1}
                </span>
                <h4 className="text-base font-bold text-neutral-900">
                  Editing Slide: {activeSlide.title || activeSlide.titleArabic || `Slide #${currentSlideIndex + 1}`}
                </h4>
              </div>

              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs font-medium text-neutral-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={activeSlide.isPublished !== false}
                    onChange={(e) => handleUpdateCurrentSlide({ isPublished: e.target.checked })}
                    className="w-4 h-4 rounded text-[#8F7137] focus:ring-[#8F7137]"
                  />
                  <span>Published & Active</span>
                </label>
              </div>
            </div>

            {/* Section 1: Slide Archetype */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-neutral-900 uppercase tracking-wider">
                Slide Archetype & Content Layout
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {[
                  { id: 'custom', label: 'Image + Text', icon: Layers, desc: 'Balanced visual banner' },
                  { id: 'product_promotion', label: 'Product Promo', icon: ShoppingBag, desc: 'Spotlight catalog item' },
                  { id: 'category_promotion', label: 'Category Link', icon: Tag, desc: 'Department callout' },
                  { id: 'image_only', label: 'Image Only', icon: ImageIcon, desc: 'Full image presentation' },
                  { id: 'text_only', label: 'Text Only', icon: Type, desc: 'Typographic message' },
                ].map(item => {
                  const Icon = item.icon;
                  const isSelected = (activeSlide.type || 'custom') === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleUpdateCurrentSlide({ type: item.id as any })}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-1.5 ${
                        isSelected 
                          ? 'border-[#B89753] bg-[#B89753]/10 text-[#8F7137] ring-1 ring-[#B89753]' 
                          : 'border-neutral-200 hover:border-neutral-300 text-neutral-600 bg-neutral-50/50'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <div>
                        <div className="text-xs font-bold">{item.label}</div>
                        <div className="text-[10px] text-neutral-400 line-clamp-1">{item.desc}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* If Product Promotion: Select Specific Product */}
            {activeSlide.type === 'product_promotion' && (
              <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-neutral-900 flex items-center gap-1.5">
                    <ShoppingBag className="w-4 h-4 text-[#8F7137]" />
                    <span>Associate Catalog Product</span>
                  </label>
                  {activeSlide.selectedProductId && (
                    <button
                      type="button"
                      onClick={() => handleUpdateCurrentSlide({ selectedProductId: undefined })}
                      className="text-[11px] text-neutral-500 hover:text-rose-600 cursor-pointer"
                    >
                      Clear Selection
                    </button>
                  )}
                </div>

                <input
                  type="text"
                  placeholder="Search products by title, category, or artisan..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-neutral-300 bg-white focus:outline-none focus:border-[#B89753]"
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                  {filteredProducts.map(p => {
                    const isSelected = activeSlide.selectedProductId === p.id;
                    return (
                      <div
                        key={p.id}
                        onClick={() => {
                          handleUpdateCurrentSlide({
                            selectedProductId: p.id,
                            title: activeSlide.title || p.name,
                            titleArabic: activeSlide.titleArabic || p.arabicName,
                            imageUrl: activeSlide.imageUrl || p.image,
                            badge: activeSlide.badge || p.category,
                            targetCategory: p.category
                          });
                        }}
                        className={`p-2 rounded-lg border flex items-center gap-2.5 cursor-pointer transition-all ${
                          isSelected 
                            ? 'border-[#B89753] bg-[#B89753]/15 text-neutral-900 font-bold' 
                            : 'border-neutral-200 bg-white hover:border-neutral-300 text-neutral-700'
                        }`}
                      >
                        <img 
                          src={p.image} 
                          alt={p.name} 
                          referrerPolicy="no-referrer"
                          className="w-8 h-8 rounded object-cover border border-neutral-200 flex-shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs truncate">{p.name}</p>
                          <p className="text-[10px] text-neutral-400 truncate">${p.priceUSD} • {p.category}</p>
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-[#8F7137] flex-shrink-0" />}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* If Category Promotion: Select Target Category */}
            {activeSlide.type === 'category_promotion' && (
              <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/20 space-y-2">
                <label className="text-xs font-bold text-neutral-900 flex items-center gap-1.5">
                  <Tag className="w-4 h-4 text-blue-600" />
                  <span>Target Category</span>
                </label>
                <select
                  value={activeSlide.targetCategory || ''}
                  onChange={(e) => handleUpdateCurrentSlide({ 
                    targetCategory: e.target.value,
                    ctaUrl: `/products?category=${encodeURIComponent(e.target.value)}`
                  })}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-neutral-300 bg-white focus:outline-none focus:border-[#B89753]"
                >
                  <option value="">Select a Category...</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.nameEn || cat.id}>
                      {cat.nameEn} ({cat.nameAr || cat.nameEn})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Section 2: Media & Image Settings (Except Text Only) */}
            {activeSlide.type !== 'text_only' && (
              <div className="space-y-4 pt-4 border-t border-neutral-100">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-neutral-900 uppercase tracking-wider flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4 text-[#8F7137]" />
                    <span>Slide Image & Media</span>
                  </label>
                  {activeSlide.imageUrl && (
                    <button
                      type="button"
                      onClick={() => handleUpdateCurrentSlide({ imageUrl: '' })}
                      className="text-[11px] text-rose-600 hover:underline cursor-pointer"
                    >
                      Remove Image
                    </button>
                  )}
                </div>

                <MediaAssetPicker
                  value={activeSlide.imageUrl || ''}
                  onChange={(url: string) => handleUpdateCurrentSlide({ imageUrl: url })}
                  label="Upload or Select Slide Image"
                />

                {/* Cultural Presets */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-medium text-neutral-500">Quick Artisanal Presets:</span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {PROMO_IMAGE_PRESETS.map((preset, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleUpdateCurrentSlide({ imageUrl: preset.url })}
                        className={`p-1.5 rounded-lg border text-left flex items-center gap-2 cursor-pointer transition-all ${
                          activeSlide.imageUrl === preset.url 
                            ? 'border-[#B89753] bg-[#B89753]/10 font-bold' 
                            : 'border-neutral-200 bg-neutral-50 hover:bg-neutral-100'
                        }`}
                      >
                        <img 
                          src={preset.url} 
                          alt={preset.name} 
                          referrerPolicy="no-referrer"
                          className="w-7 h-7 rounded object-cover flex-shrink-0"
                        />
                        <span className="text-[10px] text-neutral-700 truncate">{preset.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Image Fit */}
                <div className="flex items-center gap-4 text-xs">
                  <span className="font-medium text-neutral-700">Image Fit Mode:</span>
                  <div className="flex items-center gap-2">
                    {[
                      { id: 'contain', label: 'Contain (Product style)' },
                      { id: 'cover', label: 'Cover (Full-bleed)' },
                      { id: 'fill', label: 'Fill / Stretch' },
                    ].map(fit => (
                      <label key={fit.id} className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="radio"
                          name={`imageFit-${activeSlide.id}`}
                          value={fit.id}
                          checked={(activeSlide.imageFit || 'contain') === fit.id}
                          onChange={() => handleUpdateCurrentSlide({ imageFit: fit.id as any })}
                          className="text-[#8F7137] focus:ring-[#8F7137]"
                        />
                        <span className="text-[11px] text-neutral-600">{fit.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Section 3: Bilingual Text Content */}
            <div className="space-y-4 pt-4 border-t border-neutral-100">
              <label className="block text-xs font-bold text-neutral-900 uppercase tracking-wider">
                Bilingual Slide Text & Messaging
              </label>

              {/* Badge */}
              <BilingualField
                label="Header Badge / Pill Text (Optional)"
                valueEn={activeSlide.badge || ''}
                valueAr={activeSlide.badgeArabic || ''}
                onChangeEn={(val) => handleUpdateCurrentSlide({ badge: val })}
                onChangeAr={(val) => handleUpdateCurrentSlide({ badgeArabic: val })}
                placeholderEn="e.g., Artisan Spotlight, Flash Offer"
                placeholderAr="مثال: تسليط الضوء الحرفي، عرض مميز"
              />

              {/* Title */}
              <BilingualField
                label="Slide Title / Main Headline"
                valueEn={activeSlide.title || ''}
                valueAr={activeSlide.titleArabic || ''}
                onChangeEn={(val) => handleUpdateCurrentSlide({ title: val })}
                onChangeAr={(val) => handleUpdateCurrentSlide({ titleArabic: val })}
                placeholderEn="e.g., Authentic Heritage Crafts & Mouneh"
                placeholderAr="مثال: حرف ومونة تراثية أصيلة"
              />

              {/* Description (Optional) */}
              <BilingualField
                label="Description / Secondary Text (Optional)"
                valueEn={activeSlide.description || ''}
                valueAr={activeSlide.descriptionArabic || ''}
                onChangeEn={(val) => handleUpdateCurrentSlide({ description: val })}
                onChangeAr={(val) => handleUpdateCurrentSlide({ descriptionArabic: val })}
                placeholderEn="Short supporting text or provenance info..."
                placeholderAr="وصف قصير أو معلومات الأصالة..."
                isTextarea
              />
            </div>

            {/* Section 4: Call-to-Action (CTA) & Destination Link */}
            <div className="space-y-4 pt-4 border-t border-neutral-100">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-neutral-900 uppercase tracking-wider flex items-center gap-1.5">
                  <LinkIcon className="w-4 h-4 text-[#8F7137]" />
                  <span>CTA Button & Destination Link</span>
                </label>
                <label className="flex items-center gap-1.5 text-xs text-neutral-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={activeSlide.showCta !== false}
                    onChange={(e) => handleUpdateCurrentSlide({ showCta: e.target.checked })}
                    className="w-4 h-4 rounded text-[#8F7137] focus:ring-[#8F7137]"
                  />
                  <span>Show CTA Button</span>
                </label>
              </div>

              {activeSlide.showCta !== false && (
                <div className="space-y-3">
                  <BilingualField
                    label="Button Text"
                    valueEn={activeSlide.ctaText || ''}
                    valueAr={activeSlide.ctaTextArabic || ''}
                    onChangeEn={(val) => handleUpdateCurrentSlide({ ctaText: val })}
                    onChangeAr={(val) => handleUpdateCurrentSlide({ ctaTextArabic: val })}
                    placeholderEn="e.g., Explore Collection"
                    placeholderAr="مثال: تصفح التشكيلة"
                  />

                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1">
                      Destination Link / Target URL
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={activeSlide.ctaUrl || ''}
                        onChange={(e) => handleUpdateCurrentSlide({ ctaUrl: e.target.value })}
                        placeholder="/products or https://..."
                        className="flex-1 px-3 py-2 text-xs rounded-lg border border-neutral-300 bg-white focus:outline-none focus:border-[#B89753]"
                      />
                    </div>

                    {/* Quick Link Presets */}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {TARGET_URL_PRESETS.map((p, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => handleUpdateCurrentSlide({ ctaUrl: p.url })}
                          className={`text-[10px] px-2 py-1 rounded-md border transition-all cursor-pointer ${
                            activeSlide.ctaUrl === p.url
                              ? 'border-[#B89753] bg-[#B89753]/15 text-[#8F7137] font-bold'
                              : 'border-neutral-200 bg-neutral-50 hover:bg-neutral-100 text-neutral-600'
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Section 5: Background & Color Theme */}
            <div className="space-y-3 pt-4 border-t border-neutral-100">
              <label className="text-xs font-bold text-neutral-900 uppercase tracking-wider flex items-center gap-1.5">
                <Palette className="w-4 h-4 text-[#8F7137]" />
                <span>Background & Styling</span>
              </label>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  { id: 'default', label: 'Default Light Gray', desc: 'Soft neutral backdrop' },
                  { id: 'dark', label: 'Midnight Black', desc: 'Dark luxury backdrop' },
                  { id: 'light', label: 'Pure Canvas White', desc: 'Minimal clean white' },
                  { id: 'gold_gradient', label: 'Levantine Gold Gradient', desc: 'Deep warm heritage' },
                  { id: 'emerald_gradient', label: 'Cedar Forest Gradient', desc: 'Lush mountain green' },
                  { id: 'custom_color', label: 'Custom Palette', desc: 'Pick custom hex values' },
                ].map(style => {
                  const isSelected = (activeSlide.bgStyle || 'default') === style.id;
                  return (
                    <button
                      key={style.id}
                      type="button"
                      onClick={() => handleUpdateCurrentSlide({ bgStyle: style.id as any })}
                      className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                        isSelected 
                          ? 'border-[#B89753] bg-[#B89753]/10 text-[#8F7137] font-bold ring-1 ring-[#B89753]' 
                          : 'border-neutral-200 bg-neutral-50 hover:bg-neutral-100 text-neutral-700'
                      }`}
                    >
                      <div className="text-xs font-bold">{style.label}</div>
                      <div className="text-[10px] text-neutral-400 font-normal">{style.desc}</div>
                    </button>
                  );
                })}
              </div>

              {activeSlide.bgStyle === 'custom_color' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 rounded-xl bg-neutral-50 border border-neutral-200">
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1">Custom Background Color</label>
                    <div className="flex items-center gap-2">
                      <input 
                        type="color" 
                        value={activeSlide.customBgColor || '#1a1a1a'} 
                        onChange={(e) => handleUpdateCurrentSlide({ customBgColor: e.target.value })}
                        className="w-8 h-8 rounded border border-neutral-300 cursor-pointer"
                      />
                      <input 
                        type="text" 
                        value={activeSlide.customBgColor || '#1a1a1a'} 
                        onChange={(e) => handleUpdateCurrentSlide({ customBgColor: e.target.value })}
                        className="flex-1 px-2.5 py-1.5 text-xs rounded border border-neutral-300 font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1">Custom Text Color</label>
                    <div className="flex items-center gap-2">
                      <input 
                        type="color" 
                        value={activeSlide.customTextColor || '#ffffff'} 
                        onChange={(e) => handleUpdateCurrentSlide({ customTextColor: e.target.value })}
                        className="w-8 h-8 rounded border border-neutral-300 cursor-pointer"
                      />
                      <input 
                        type="text" 
                        value={activeSlide.customTextColor || '#ffffff'} 
                        onChange={(e) => handleUpdateCurrentSlide({ customTextColor: e.target.value })}
                        className="flex-1 px-2.5 py-1.5 text-xs rounded border border-neutral-300 font-mono"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Section 6: Scheduling Dates */}
            <div className="space-y-3 pt-4 border-t border-neutral-100">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-neutral-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-[#8F7137]" />
                  <span>Time-based Scheduling</span>
                </label>
                <label className="flex items-center gap-1.5 text-xs text-neutral-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={activeSlide.scheduleActive || false}
                    onChange={(e) => handleUpdateCurrentSlide({ scheduleActive: e.target.checked })}
                    className="w-4 h-4 rounded text-[#8F7137] focus:ring-[#8F7137]"
                  />
                  <span>Enable Schedule Dates</span>
                </label>
              </div>

              {activeSlide.scheduleActive && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 rounded-xl bg-neutral-50 border border-neutral-200">
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1">Start Date & Time</label>
                    <input
                      type="datetime-local"
                      value={activeSlide.startDate || ''}
                      onChange={(e) => handleUpdateCurrentSlide({ startDate: e.target.value })}
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-neutral-300 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1">End Date & Time</label>
                    <input
                      type="datetime-local"
                      value={activeSlide.endDate || ''}
                      onChange={(e) => handleUpdateCurrentSlide({ endDate: e.target.value })}
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-neutral-300 bg-white"
                    />
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* TAB 2: GLOBAL SLIDER SETTINGS */}
      {activeTab === 'settings' && (
        <div className="bg-white rounded-2xl p-6 border border-neutral-200/80 shadow-xs space-y-6">
          <div>
            <h4 className="text-base font-bold text-neutral-900">
              Slider & Carousel Behavior Controls
            </h4>
            <p className="text-xs text-neutral-500 mt-0.5">
              Control the rotation, timing, navigation arrows, and transitions when multiple slides are active.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Autoplay & Timing */}
            <div className="p-4 rounded-xl border border-neutral-200 bg-neutral-50/50 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Play className="w-4 h-4 text-[#8F7137]" />
                  <span className="text-xs font-bold text-neutral-900">Autoplay Slides</span>
                </div>
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.autoplay !== false}
                    onChange={(e) => onChangePromoBanner({ autoplay: e.target.checked })}
                    className="w-4 h-4 rounded text-[#8F7137] focus:ring-[#8F7137]"
                  />
                </label>
              </div>

              {config.autoplay !== false && (
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-neutral-700">
                    Rotation Interval ({((config.autoplayInterval || 5000) / 1000).toFixed(1)}s)
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={2000}
                      max={12000}
                      step={500}
                      value={config.autoplayInterval || 5000}
                      onChange={(e) => onChangePromoBanner({ autoplayInterval: Number(e.target.value) })}
                      className="flex-1 accent-[#8F7137]"
                    />
                    <span className="text-xs font-mono font-bold text-neutral-700 w-12 text-right">
                      {config.autoplayInterval || 5000}ms
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Loop Behavior */}
            <div className="p-4 rounded-xl border border-neutral-200 bg-neutral-50/50 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Repeat className="w-4 h-4 text-[#8F7137]" />
                  <span className="text-xs font-bold text-neutral-900">Continuous Loop</span>
                </div>
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.loop !== false}
                    onChange={(e) => onChangePromoBanner({ loop: e.target.checked })}
                    className="w-4 h-4 rounded text-[#8F7137] focus:ring-[#8F7137]"
                  />
                </label>
              </div>
              <p className="text-[11px] text-neutral-500">
                When enabled, reaching the last slide automatically cycles back to the first slide seamlessly.
              </p>
            </div>

            {/* Navigation Controls */}
            <div className="p-4 rounded-xl border border-neutral-200 bg-neutral-50/50 space-y-4">
              <span className="text-xs font-bold text-neutral-900 block">Navigation UI Controls</span>
              
              <div className="space-y-2">
                <label className="flex items-center justify-between text-xs text-neutral-700 cursor-pointer">
                  <span>Show Navigation Arrows (Prev / Next)</span>
                  <input
                    type="checkbox"
                    checked={config.showArrows !== false}
                    onChange={(e) => onChangePromoBanner({ showArrows: e.target.checked })}
                    className="w-4 h-4 rounded text-[#8F7137] focus:ring-[#8F7137]"
                  />
                </label>

                <label className="flex items-center justify-between text-xs text-neutral-700 cursor-pointer">
                  <span>Show Pagination Dots / Indicator</span>
                  <input
                    type="checkbox"
                    checked={config.showDots !== false}
                    onChange={(e) => onChangePromoBanner({ showDots: e.target.checked })}
                    className="w-4 h-4 rounded text-[#8F7137] focus:ring-[#8F7137]"
                  />
                </label>
              </div>
            </div>

            {/* Transition Effect */}
            <div className="p-4 rounded-xl border border-neutral-200 bg-neutral-50/50 space-y-4">
              <span className="text-xs font-bold text-neutral-900 block">Transition Effect</span>
              
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'slide', label: 'Slide / Horizontal Scroll' },
                  { id: 'fade', label: 'Smooth Cross-Fade' },
                ].map(effect => {
                  const isSelected = (config.transitionEffect || 'slide') === effect.id;
                  return (
                    <button
                      key={effect.id}
                      type="button"
                      onClick={() => onChangePromoBanner({ transitionEffect: effect.id as any })}
                      className={`p-2.5 rounded-xl border text-center cursor-pointer transition-all ${
                        isSelected 
                          ? 'border-[#B89753] bg-[#B89753]/15 text-[#8F7137] font-bold' 
                          : 'border-neutral-200 bg-white hover:bg-neutral-100 text-neutral-700'
                      }`}
                    >
                      <span className="text-xs">{effect.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};

export const CMSPromoSliderEditor = CMSPromoBannerEditor;
export default CMSPromoBannerEditor;
