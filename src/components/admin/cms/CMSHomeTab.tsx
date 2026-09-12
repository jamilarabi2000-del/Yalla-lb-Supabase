import React, { useState } from 'react';
import { CMSHeroStat, CMSOfferSlide, CMSHeroMediaItem, CMSPromoBannerConfig } from '../../../types';
import { 
  Sparkles, 
  Tag, 
  Plus, 
  Trash2, 
  Eye, 
  EyeOff, 
  BookOpen, 
  MessageSquare, 
  Mail,
  Edit3,
  Check,
  X,
  ChevronUp,
  ChevronDown,
  Compass,
  Star,
  Zap,
  Grid,
  Monitor,
  Smartphone,
  ShieldCheck,
  ShoppingBag,
  Copy,
  ArrowUp,
  ArrowDown,
  ExternalLink,
  Calendar,
  Clock,
  Maximize2,
  Layers
} from 'lucide-react';
import { BilingualField } from './BilingualField';
import { MediaAssetPicker } from './MediaAssetPicker';
import { CMSFieldGroup } from './CMSFieldGroup';
import { CMSPromoBannerEditor } from './CMSPromoBannerEditor';

// Helper to determine slide visibility and scheduling status
export const getSlideScheduleStatus = (item: { 
  isPublished?: boolean; 
  scheduleActive?: boolean; 
  startDate?: string; 
  endDate?: string; 
}) => {
  if (item.isPublished === false) {
    return {
      status: 'hidden' as const,
      badgeColor: 'bg-slate-800 text-slate-400 border-slate-700',
      label: 'Hidden / Draft',
      labelAr: 'مخفي / مسودة',
      isLive: false
    };
  }

  if (!item.scheduleActive) {
    return {
      status: 'live' as const,
      badgeColor: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      label: 'Live on Website',
      labelAr: 'نشط على الموقع',
      isLive: true
    };
  }

  const now = new Date();
  if (item.startDate) {
    const start = new Date(item.startDate);
    if (!isNaN(start.getTime()) && now < start) {
      return {
        status: 'scheduled' as const,
        badgeColor: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
        label: `Scheduled (${start.toLocaleDateString()})`,
        labelAr: `مجدول (${start.toLocaleDateString('ar')})`,
        isLive: false
      };
    }
  }

  if (item.endDate) {
    const end = new Date(item.endDate);
    if (!isNaN(end.getTime()) && now > end) {
      return {
        status: 'expired' as const,
        badgeColor: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
        label: `Expired (${end.toLocaleDateString()})`,
        labelAr: `منتهي (${end.toLocaleDateString('ar')})`,
        isLive: false
      };
    }
  }

  return {
    status: 'live' as const,
    badgeColor: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    label: item.endDate ? `Live (Until ${new Date(item.endDate).toLocaleDateString()})` : 'Live on Website',
    labelAr: item.endDate ? `نشط (حتى ${new Date(item.endDate).toLocaleDateString('ar')})` : 'نشط على الموقع',
    isLive: true
  };
};

interface CMSHomeTabProps {
  homeData: {
    featuredTitle: string;
    featuredTitleArabic?: string;
    featuredSubtitle: string;
    featuredSubtitleArabic?: string;
    featuredDescription?: string;
    featuredDescriptionArabic?: string;
    dealsTitle?: string;
    dealsTitleArabic?: string;
    dealsSubtitle?: string;
    dealsSubtitleArabic?: string;
    dealsDescription?: string;
    dealsDescriptionArabic?: string;
    newArrivalsTitle?: string;
    newArrivalsTitleArabic?: string;
    newArrivalsSubtitle?: string;
    newArrivalsSubtitleArabic?: string;
    categoriesTitle?: string;
    categoriesTitleArabic?: string;
    categoriesSubtitle?: string;
    categoriesSubtitleArabic?: string;
    regionsTitle: string;
    regionsTitleArabic?: string;
    regionsSubtitle: string;
    regionsSubtitleArabic?: string;
    artisansTitle: string;
    artisansTitleArabic?: string;
    artisansSubtitle: string;
    artisansSubtitleArabic?: string;
    heritageTitle: string;
    heritageTitleArabic?: string;
    heritageText: string;
    heritageTextArabic?: string;
    reviewsTitle: string;
    reviewsTitleArabic?: string;
    reviewsSubtitle: string;
    reviewsSubtitleArabic?: string;
    newsletterTitle: string;
    newsletterTitleArabic?: string;
    newsletterSubtitle?: string;
    newsletterSubtitleArabic?: string;
    newsletterButtonText: string;
    newsletterButtonTextArabic?: string;
    bundlesTitle?: string;
    bundlesTitleArabic?: string;
    bundlesSubtitle?: string;
    bundlesSubtitleArabic?: string;
    bundlesBadge?: string;
    bundlesBadgeArabic?: string;
    bundlesDescription?: string;
    bundlesDescriptionArabic?: string;
    trustBadgesTitle?: string;
    trustBadgesTitleArabic?: string;
    trustBadgesSubtitle?: string;
    trustBadgesSubtitleArabic?: string;
  };
  heroData: {
    badgeText: string;
    badgeTextArabic?: string;
    title: string;
    titleArabic?: string;
    subtitle: string;
    subtitleArabic?: string;
    primaryBtnText: string;
    primaryBtnTextArabic?: string;
    secondaryBtnText: string;
    secondaryBtnTextArabic?: string;
    targetUrl?: string;
    secondaryTargetUrl?: string;
    bgImageUrl: string;
    slideInterval?: number;
    overlayOpacity?: number;
    defaultImageFit?: 'contain' | 'cover' | 'fill';
    desktopAspectRatio?: '16:9' | '21:9' | '4:3' | 'auto';
    mobileAspectRatio?: '16:9' | '9:16' | '3:4' | '1:1' | 'auto';
    stats: CMSHeroStat[];
    bgMediaItems?: CMSHeroMediaItem[];
  };
  offersData: {
    sectionTag?: string;
    sectionTagArabic?: string;
    sectionBadge?: string;
    sectionBadgeArabic?: string;
    sectionTitle: string;
    sectionTitleArabic?: string;
    sectionSubtitle: string;
    sectionSubtitleArabic?: string;
    slides: CMSOfferSlide[];
  };
  promoBannerData?: CMSPromoBannerConfig;
  onChangeHomeField: (field: string, value: string) => void;
  onChangeHeroField: (field: string, value: any) => void;
  onChangeOffersField: (field: string, value: any) => void;
  onChangePromoBannerField?: (updates: Partial<CMSPromoBannerConfig>) => void;
}

export const CMSHomeTab: React.FC<CMSHomeTabProps> = ({
  homeData,
  heroData,
  offersData,
  promoBannerData,
  onChangeHomeField,
  onChangeHeroField,
  onChangeOffersField,
  onChangePromoBannerField,
}) => {
  const [editingSlide, setEditingSlide] = useState<CMSOfferSlide | null>(null);
  const [isCreatingSlide, setIsCreatingSlide] = useState(false);

  const [slideForm, setSlideForm] = useState<CMSOfferSlide>({
    id: '',
    badge: 'SPECIAL PROMOTION',
    badgeArabic: 'عرض خاص',
    title: '',
    titleArabic: '',
    subtitle: '',
    subtitleArabic: '',
    buttonText: 'Claim Offer',
    buttonTextArabic: 'احصل على العرض',
    targetUrl: '/products',
    discountBadge: '20% OFF',
    discountBadgeArabic: 'خصم 20%',
    bgGradient: 'from-amber-950 via-yellow-950 to-stone-900',
    imageUrl: 'https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=1200&q=80',
    isPublished: true
  });

  const heroStats = heroData?.stats || [];
  const slides = offersData?.slides || [];
  const heroMediaItems: CMSHeroMediaItem[] = heroData?.bgMediaItems || [];

  const handleUpdateStat = (index: number, updates: Partial<CMSHeroStat>) => {
    const updated = [...heroStats];
    updated[index] = { ...updated[index], ...updates };
    onChangeHeroField('stats', updated);
  };

  const handleAddStat = () => {
    const newStat: CMSHeroStat = {
      label: 'New Metric',
      labelArabic: 'مقياس جديد',
      value: '100+',
      valueArabic: '+100',
      isPublished: true
    };
    onChangeHeroField('stats', [...heroStats, newStat]);
  };

  const handleDeleteStat = (index: number) => {
    const updated = heroStats.filter((_, idx) => idx !== index);
    onChangeHeroField('stats', updated);
  };

  const handleUpdateMediaItem = (index: number, updates: Partial<CMSHeroMediaItem>) => {
    const updated = [...heroMediaItems];
    updated[index] = { ...updated[index], ...updates };
    onChangeHeroField('bgMediaItems', updated);
  };

  const handleAddMediaItem = () => {
    const newItem: CMSHeroMediaItem = {
      id: `media-${Date.now()}`,
      url: 'https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&q=80&w=2000',
      type: 'image',
      title: 'Artisan Workshop & Heritage',
      desktopAspectRatio: '16:9',
      mobileAspectRatio: 'auto',
      imageFit: 'contain',
      objectPosition: 'center',
      isPublished: true,
      scheduleActive: false,
      startDate: '',
      endDate: ''
    };
    onChangeHeroField('bgMediaItems', [...heroMediaItems, newItem]);
  };

  const handleDuplicateMediaItem = (item: CMSHeroMediaItem) => {
    const newItem: CMSHeroMediaItem = {
      ...item,
      id: `media-${Date.now()}`,
      title: item.title ? `${item.title} (Copy)` : 'Media Item (Copy)',
    };
    onChangeHeroField('bgMediaItems', [...heroMediaItems, newItem]);
  };

  const handleDeleteMediaItem = (index: number) => {
    const updated = heroMediaItems.filter((_, idx) => idx !== index);
    onChangeHeroField('bgMediaItems', updated);
  };

  const handleMoveMediaItem = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index > 0) {
      const updated = [...heroMediaItems];
      [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
      onChangeHeroField('bgMediaItems', updated);
    } else if (direction === 'down' && index < heroMediaItems.length - 1) {
      const updated = [...heroMediaItems];
      [updated[index + 1], updated[index]] = [updated[index], updated[index + 1]];
      onChangeHeroField('bgMediaItems', updated);
    }
  };

  const handleStartCreateSlide = () => {
    setSlideForm({
      id: `offer-${Date.now()}`,
      badge: 'SEASONAL HARVEST 🫒',
      badgeArabic: 'موسم القطاف 🫒',
      title: '',
      titleArabic: '',
      subtitle: '',
      subtitleArabic: '',
      buttonText: 'Shop Collection',
      buttonTextArabic: 'تسوق التشكيلة',
      targetUrl: '/products',
      discountBadge: 'EXCLUSIVE BUNDLE',
      discountBadgeArabic: 'باقة حصرية',
      bgGradient: 'from-emerald-900 via-teal-900 to-slate-900',
      imageUrl: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=1200&q=80',
      desktopImageUrl: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=1200&q=80',
      mobileImageUrl: '',
      imageFit: 'contain',
      desktopImageFit: 'contain',
      mobileImageFit: 'contain',
      imageZoom: 100,
      desktopImageZoom: 100,
      mobileImageZoom: 100,
      objectPosition: 'center',
      desktopObjectPosition: 'center',
      mobileObjectPosition: 'center',
      desktopAspectRatio: '16:9',
      mobileAspectRatio: 'auto',
      isPublished: true,
      scheduleActive: false,
      startDate: '',
      endDate: ''
    });
    setIsCreatingSlide(true);
    setEditingSlide(null);
  };

  const handleStartEditSlide = (slide: CMSOfferSlide) => {
    setSlideForm({
      ...slide,
      imageUrl: slide.imageUrl || slide.desktopImageUrl || '',
      desktopImageUrl: slide.desktopImageUrl || slide.imageUrl || '',
      mobileImageUrl: slide.mobileImageUrl || '',
      imageFit: slide.imageFit || 'contain',
      desktopImageFit: slide.desktopImageFit || slide.imageFit || 'contain',
      mobileImageFit: slide.mobileImageFit || slide.imageFit || 'contain',
      imageZoom: slide.imageZoom ?? slide.desktopImageZoom ?? 100,
      desktopImageZoom: slide.desktopImageZoom ?? slide.imageZoom ?? 100,
      mobileImageZoom: slide.mobileImageZoom ?? slide.imageZoom ?? 100,
      objectPosition: slide.objectPosition || slide.desktopObjectPosition || 'center',
      desktopObjectPosition: slide.desktopObjectPosition || slide.objectPosition || 'center',
      mobileObjectPosition: slide.mobileObjectPosition || slide.objectPosition || 'center',
      desktopAspectRatio: slide.desktopAspectRatio || '16:9',
      mobileAspectRatio: slide.mobileAspectRatio || 'auto',
    });
    setEditingSlide(slide);
    setIsCreatingSlide(false);
  };

  const handleSaveSlide = (e: React.FormEvent) => {
    e.preventDefault();
    if (!slideForm.title.trim()) return;

    const desktopUrl = slideForm.desktopImageUrl || slideForm.imageUrl || '';
    const cleanSlide: CMSOfferSlide = {
      ...slideForm,
      imageUrl: desktopUrl,
      desktopImageUrl: desktopUrl,
      imageFit: slideForm.desktopImageFit || slideForm.imageFit || 'contain',
      desktopImageFit: slideForm.desktopImageFit || slideForm.imageFit || 'contain',
      mobileImageFit: slideForm.mobileImageFit || 'contain',
      imageZoom: slideForm.desktopImageZoom ?? slideForm.imageZoom ?? 100,
      desktopImageZoom: slideForm.desktopImageZoom ?? slideForm.imageZoom ?? 100,
      mobileImageZoom: slideForm.mobileImageZoom ?? 100,
      objectPosition: slideForm.desktopObjectPosition || slideForm.objectPosition || 'center',
      desktopObjectPosition: slideForm.desktopObjectPosition || slideForm.objectPosition || 'center',
      mobileObjectPosition: slideForm.mobileObjectPosition || 'center',
      desktopAspectRatio: slideForm.desktopAspectRatio || '16:9',
      mobileAspectRatio: slideForm.mobileAspectRatio || 'auto',
    };

    let updatedList: CMSOfferSlide[];
    if (editingSlide) {
      updatedList = slides.map(s => s.id === editingSlide.id ? cleanSlide : s);
    } else {
      updatedList = [...slides, cleanSlide];
    }

    onChangeOffersField('slides', updatedList);
    setEditingSlide(null);
    setIsCreatingSlide(false);
  };

  const handleDuplicateSlide = (slide: CMSOfferSlide) => {
    const newSlide: CMSOfferSlide = {
      ...slide,
      id: `offer-${Date.now()}`,
      title: `${slide.title} (Copy)`,
      titleArabic: slide.titleArabic ? `${slide.titleArabic} (نسخة)` : undefined,
    };
    onChangeOffersField('slides', [...slides, newSlide]);
  };

  const handleDeleteSlide = (id: string) => {
    const updated = slides.filter(s => s.id !== id);
    onChangeOffersField('slides', updated);
  };

  const handleMoveSlide = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index > 0) {
      const updated = [...slides];
      [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
      onChangeOffersField('slides', updated);
    } else if (direction === 'down' && index < slides.length - 1) {
      const updated = [...slides];
      [updated[index + 1], updated[index]] = [updated[index], updated[index + 1]];
      onChangeOffersField('slides', updated);
    }
  };

  const handleTogglePublishSlide = (id: string) => {
    const updated = slides.map(s => 
      s.id === id ? { ...s, isPublished: s.isPublished === false ? true : false } : s
    );
    onChangeOffersField('slides', updated);
  };

  // Section collapse states (all expanded by default for full visibility)
  const [sectionExpansion, setSectionExpansion] = useState<Record<string, boolean>>({
    hero: true,
    promoBanner: true,
    offers: true,
    trust: true,
    categories: true,
    featured: true,
    deals: true,
    bundles: true,
    newArrivals: true,
    story: true,
    reviews: true,
    newsletter: true,
  });

  const toggleSection = (sectionId: string) => {
    setSectionExpansion(prev => ({ ...prev, [sectionId]: !prev[sectionId] }));
  };

  const handleToggleAll = (expand: boolean) => {
    const nextState: Record<string, boolean> = {};
    Object.keys(sectionExpansion).forEach(k => {
      nextState[k] = expand;
    });
    setSectionExpansion(nextState);
  };

  const isAllExpanded = Object.values(sectionExpansion).every(Boolean);

  const scrollToSection = (id: string) => {
    setSectionExpansion(prev => ({ ...prev, [id]: true }));
    setTimeout(() => {
      const el = document.getElementById(`sec-${id}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        el.classList.add('ring-2', 'ring-amber-400');
        setTimeout(() => {
          el.classList.remove('ring-2', 'ring-amber-400');
        }, 1500);
      }
    }, 50);
  };

  return (
    <div className="space-y-6">
      {/* Sticky Quick-Jump Navigation Strip */}
      <div className="sticky top-2 z-20 bg-[#121222]/95 backdrop-blur-md border border-white/10 rounded-2xl p-2.5 shadow-xl flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 no-scrollbar max-w-full">
          <span className="text-[11px] font-black uppercase tracking-wider text-amber-400 px-2 flex items-center gap-1 shrink-0">
            <Compass className="w-3.5 h-3.5" /> Jump:
          </span>
          <button
            type="button"
            onClick={() => scrollToSection('hero')}
            className="px-2.5 py-1 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-bold border border-white/5 transition-all flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <Sparkles className="w-3 h-3 text-amber-400" />
            <span>Hero & Media</span>
            {heroMediaItems.length > 0 && (
              <span className="text-[10px] px-1.5 rounded-full bg-amber-500/20 text-amber-400 font-mono">
                {heroMediaItems.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => scrollToSection('promo-banner')}
            className="px-2.5 py-1 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-bold border border-white/5 transition-all flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <Layers className="w-3 h-3 text-amber-400" />
            <span>Promo Banner</span>
          </button>
          <button
            type="button"
            onClick={() => scrollToSection('offers')}
            className="px-2.5 py-1 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-bold border border-white/5 transition-all flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <Tag className="w-3 h-3 text-emerald-400" />
            <span>Offers Carousel</span>
            {slides.length > 0 && (
              <span className="text-[10px] px-1.5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono">
                {slides.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => scrollToSection('trust')}
            className="px-2.5 py-1 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-bold border border-white/5 transition-all flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <ShieldCheck className="w-3 h-3 text-emerald-400" />
            <span>Trust Badges</span>
          </button>
          <button
            type="button"
            onClick={() => scrollToSection('categories')}
            className="px-2.5 py-1 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-bold border border-white/5 transition-all flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <Grid className="w-3 h-3 text-indigo-400" />
            <span>Categories</span>
          </button>
          <button
            type="button"
            onClick={() => scrollToSection('featured')}
            className="px-2.5 py-1 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-bold border border-white/5 transition-all flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <Star className="w-3 h-3 text-amber-400" />
            <span>Featured</span>
          </button>
          <button
            type="button"
            onClick={() => scrollToSection('deals')}
            className="px-2.5 py-1 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-bold border border-white/5 transition-all flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <Zap className="w-3 h-3 text-yellow-400" />
            <span>Flash Deals</span>
          </button>
          <button
            type="button"
            onClick={() => scrollToSection('bundles')}
            className="px-2.5 py-1 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-bold border border-white/5 transition-all flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <ShoppingBag className="w-3 h-3 text-rose-400" />
            <span>Combos & Packs</span>
          </button>
          <button
            type="button"
            onClick={() => scrollToSection('newArrivals')}
            className="px-2.5 py-1 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-bold border border-white/5 transition-all flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <Sparkles className="w-3 h-3 text-cyan-400" />
            <span>New Arrivals</span>
          </button>
          <button
            type="button"
            onClick={() => scrollToSection('story')}
            className="px-2.5 py-1 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-bold border border-white/5 transition-all flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <BookOpen className="w-3 h-3 text-orange-400" />
            <span>Story</span>
          </button>
          <button
            type="button"
            onClick={() => scrollToSection('reviews')}
            className="px-2.5 py-1 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-bold border border-white/5 transition-all flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <MessageSquare className="w-3 h-3 text-pink-400" />
            <span>Reviews</span>
          </button>
          <button
            type="button"
            onClick={() => scrollToSection('newsletter')}
            className="px-2.5 py-1 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-bold border border-white/5 transition-all flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <Mail className="w-3 h-3 text-purple-400" />
            <span>Newsletter</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleToggleAll(!isAllExpanded)}
            className="px-2.5 py-1 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-xs font-medium transition-all flex items-center gap-1 cursor-pointer"
          >
            {isAllExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            <span>{isAllExpanded ? 'Collapse All' : 'Expand All'}</span>
          </button>
        </div>
      </div>

      {/* 1. Hero Banner & Responsive Media Section */}
      <div id="sec-hero" className="bg-[#121222] border border-white/10 rounded-3xl p-6 space-y-5 transition-all duration-300">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-400" />
              <span>Hero Banner & Media (Desktop & Mobile Controls)</span>
            </h3>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 font-bold border border-amber-500/20">
              Dual Device Optimized
            </span>
          </div>
          <button
            type="button"
            onClick={() => toggleSection('hero')}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-all cursor-pointer"
            title={sectionExpansion['hero'] ? "Collapse section" : "Expand section"}
          >
            {sectionExpansion['hero'] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {sectionExpansion['hero'] && (
          <div className="space-y-5">
            {/* Bilingual Text Fields */}
            <div className="space-y-4">
              <BilingualField
                labelEn="Badge Pill Text"
                labelAr="نص الشارة العلوية"
                valueEn={heroData?.badgeText || ''}
                valueAr={heroData?.badgeTextArabic || ''}
                onChangeEn={(val) => onChangeHeroField('badgeText', val)}
                onChangeAr={(val) => onChangeHeroField('badgeTextArabic', val)}
                placeholderEn="Handcrafted with Love in Lebanon"
                placeholderAr="صُنع بحب وإتقان في لبنان"
                presetSuggestions={[
                  { en: 'Handcrafted with Love in Lebanon', ar: 'صُنع بحب وإتقان في لبنان' },
                  { en: '100% Authentic Mouneh & Crafts', ar: 'مونة وحرف لبنانية أصيلة 100%' },
                  { en: 'Direct from Rural Cooperatives', ar: 'مباشرة من التعاونيات القروية' },
                ]}
              />

              <BilingualField
                labelEn="Main Hero Headline"
                labelAr="العنوان الرئيسي للبانر"
                valueEn={heroData?.title || ''}
                valueAr={heroData?.titleArabic || ''}
                onChangeEn={(val) => onChangeHeroField('title', val)}
                onChangeAr={(val) => onChangeHeroField('titleArabic', val)}
                placeholderEn="Authentic Lebanese Treasures, Handcrafted by Master Artisans"
                placeholderAr="كنوز لبنانية أصيلة، بأيدي أمهر الحرفيين"
              />

              <BilingualField
                labelEn="Hero Subtitle Narrative"
                labelAr="الوصف الترويجي للبانر"
                valueEn={heroData?.subtitle || ''}
                valueAr={heroData?.subtitleArabic || ''}
                onChangeEn={(val) => onChangeHeroField('subtitle', val)}
                onChangeAr={(val) => onChangeHeroField('subtitleArabic', val)}
                placeholderEn="Connecting traditional craft workshops across Beirut, Tripoli, Sidon, and Mount Lebanon..."
                placeholderAr="نصلك مباشرة بأعرق ورش الحرفيين والمونة التراثية..."
                isTextarea
                rows={2}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <BilingualField
                  labelEn="Primary CTA Button Label"
                  labelAr="نص الزر الرئيسي"
                  valueEn={heroData?.primaryBtnText || ''}
                  valueAr={heroData?.primaryBtnTextArabic || ''}
                  onChangeEn={(val) => onChangeHeroField('primaryBtnText', val)}
                  onChangeAr={(val) => onChangeHeroField('primaryBtnTextArabic', val)}
                  placeholderEn="Explore Collection"
                  placeholderAr="استكشف المجموعة"
                  presetSuggestions={[
                    { en: 'Explore Collection', ar: 'استكشف التشكيلة' },
                    { en: 'Shop Artisan Mouneh', ar: 'تسوق المونة الريفية' },
                    { en: 'Discover Crafts', ar: 'اكتشف الحرف' },
                  ]}
                />

                <BilingualField
                  labelEn="Secondary CTA Button Label"
                  labelAr="نص الزر الثانوي"
                  valueEn={heroData?.secondaryBtnText || ''}
                  valueAr={heroData?.secondaryBtnTextArabic || ''}
                  onChangeEn={(val) => onChangeHeroField('secondaryBtnText', val)}
                  onChangeAr={(val) => onChangeHeroField('secondaryBtnTextArabic', val)}
                  placeholderEn="Diaspora Shipping"
                  placeholderAr="شحن للمغتربين"
                  presetSuggestions={[
                    { en: 'Meet the Artisans', ar: 'تعرف على الحرفيين' },
                    { en: 'Diaspora Shipping', ar: 'شحن للمغتربين' },
                    { en: 'View Special Offers', ar: 'شاهد العروض الخاصة' },
                  ]}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                <div>
                  <label htmlFor="hero-primary-target" className="block text-xs font-bold uppercase tracking-wider text-amber-400 mb-1.5 cursor-pointer">
                    Primary Button Redirect Target URL
                  </label>
                  <input
                    id="hero-primary-target"
                    type="text"
                    value={heroData?.targetUrl || ''}
                    onChange={(e) => onChangeHeroField('targetUrl', e.target.value)}
                    placeholder="e.g. /products, pantry, or crafts"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">Destination when clicking the primary button.</p>
                </div>

                <div>
                  <label htmlFor="hero-secondary-target" className="block text-xs font-bold uppercase tracking-wider text-amber-400 mb-1.5 cursor-pointer">
                    Secondary Button Redirect Target URL
                  </label>
                  <input
                    id="hero-secondary-target"
                    type="text"
                    value={heroData?.secondaryTargetUrl || ''}
                    onChange={(e) => onChangeHeroField('secondaryTargetUrl', e.target.value)}
                    placeholder="e.g. /products?category=Mouneh, or #sec-story"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">Destination when clicking the secondary button.</p>
                </div>
              </div>
            </div>

            {/* Global Screen Aspect Ratio & Smart Auto Height */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-white/10">
              <div className="p-4 rounded-2xl bg-sky-950/30 border border-sky-500/20 space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-sky-400 mb-1.5 flex items-center gap-1.5">
                  <Monitor className="w-4 h-4" />
                  <span>Desktop & Laptop Aspect Ratio / Height</span>
                </label>
                <select
                  value={heroData?.desktopAspectRatio || '16:9'}
                  onChange={(e) => onChangeHeroField('desktopAspectRatio', e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none font-medium"
                >
                  <option value="auto">⚡ Smart Auto Height & Width (Natural Aspect Scaling)</option>
                  <option value="16:9">🖥️ 16:9 Widescreen (Standard Laptops & Monitors)</option>
                  <option value="21:9">🎞️ 21:9 Ultrawide Cinematic Display</option>
                  <option value="4:3">📺 4:3 Classic Display</option>
                </select>
                <p className="text-[10px] text-slate-400">Smart Auto Height scales naturally without hard cropping on wide displays.</p>
              </div>

              <div className="p-4 rounded-2xl bg-emerald-950/30 border border-emerald-500/20 space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-emerald-400 mb-1.5 flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4" />
                  <span>Mobile Phone Aspect Ratio / Height</span>
                </label>
                <select
                  value={heroData?.mobileAspectRatio || 'auto'}
                  onChange={(e) => onChangeHeroField('mobileAspectRatio', e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none font-medium"
                >
                  <option value="auto">⚡ Smart Auto Height & Width (Natural Aspect Scaling)</option>
                  <option value="16:9">📺 16:9 Landscape (Show Full Horizontal Photo)</option>
                  <option value="9:16">📱 9:16 Smartphone Vertical (Full Portrait)</option>
                  <option value="3:4">📱 3:4 Mobile Tall</option>
                  <option value="1:1">⏹️ 1:1 Square</option>
                </select>
                <p className="text-[10px] text-slate-400">Smart Auto Height prevents awkward cropping on tall smartphone screens.</p>
              </div>

              <div className="p-4 rounded-2xl bg-sky-950/30 border border-sky-500/20 space-y-2 md:col-span-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-sky-400 mb-1.5 flex items-center gap-1.5">
                  <Maximize2 className="w-4 h-4" />
                  <span>Default Slide Image Fit Behavior</span>
                </label>
                <select
                  value={heroData?.defaultImageFit || 'contain'}
                  onChange={(e) => onChangeHeroField('defaultImageFit', e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none font-medium"
                >
                  <option value="contain">✅ Auto Full Fit (Show Entire Image Uncropped - Recommended Default)</option>
                  <option value="cover">Cover (Fill Frame & Crop Image Edges)</option>
                  <option value="fill">Stretch (Force Full Width & Height)</option>
                </select>
                <p className="text-[10px] text-slate-400">
                  Auto Full Fit automatically scales the image to fit 100% inside the slider without cutting off top/bottom or sides, filling any widescreen margins with an ambient blurred reflection.
                </p>
              </div>
            </div>

            {/* Slider Auto-Play Speed & Tint Controls */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                  Slider Auto-Play Speed (Seconds)
                </label>
                <select
                  value={heroData?.slideInterval ?? 5}
                  onChange={(e) => onChangeHeroField('slideInterval', parseInt(e.target.value, 10))}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none font-medium"
                >
                  <option value={0}>Pause Auto-Play (Manual Navigation Only)</option>
                  <option value={3}>3 Seconds (Fast)</option>
                  <option value={5}>5 Seconds (Recommended)</option>
                  <option value={8}>8 Seconds (Relaxed)</option>
                  <option value={10}>10 Seconds (Slow)</option>
                  <option value={15}>15 Seconds (Very Slow)</option>
                </select>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Background Dark Overlay Tint
                  </label>
                  <span className="text-xs font-mono text-amber-400 font-bold">{heroData?.overlayOpacity ?? 0}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="70"
                  step="5"
                  value={heroData?.overlayOpacity ?? 0}
                  onChange={(e) => onChangeHeroField('overlayOpacity', parseInt(e.target.value, 10))}
                  className="w-full accent-amber-500 cursor-pointer"
                />
                <p className="text-[10px] text-slate-400 mt-1">Set to 0% for 100% natural, un-tinted true image colors.</p>
              </div>
            </div>

            {/* Hero Background Media Manager */}
            <div className="pt-4 border-t border-white/10 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-amber-400">
                    Hero Background Media ({heroMediaItems.length} {heroMediaItems.length === 1 ? 'Slide' : 'Slides'})
                  </label>
                  <p className="text-[11px] text-slate-400">Configure dual Desktop and Mobile media assets, zoom, fit, and slide texts.</p>
                </div>
                <button
                  type="button"
                  onClick={handleAddMediaItem}
                  className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Media Slide</span>
                </button>
              </div>
              
              <div className="space-y-4">
                {heroMediaItems.map((item, idx) => {
                  const scheduleStatus = getSlideScheduleStatus(item);
                  return (
                  <div 
                    key={item.id || idx} 
                    className={`p-4 sm:p-5 rounded-2xl border transition-all ${
                      item.isPublished !== false ? 'bg-slate-900/90 border-white/10' : 'bg-slate-900/40 border-red-900/40 opacity-75'
                    } space-y-4`}
                  >
                    {/* Header bar of the slide card */}
                    <div className="flex items-center justify-between border-b border-white/10 pb-3 gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono font-bold text-amber-400 px-2 py-0.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                          Slide #{idx + 1}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${scheduleStatus.badgeColor}`}>
                          {scheduleStatus.status === 'live' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                          {scheduleStatus.status === 'scheduled' && <Clock className="w-3 h-3 text-sky-400" />}
                          {scheduleStatus.status === 'expired' && <Clock className="w-3 h-3 text-amber-400" />}
                          {scheduleStatus.status === 'hidden' && <EyeOff className="w-3 h-3 text-slate-400" />}
                          <span>{scheduleStatus.label}</span>
                        </span>
                        <input
                          type="text"
                          value={item.title || ''}
                          onChange={(e) => handleUpdateMediaItem(idx, { title: e.target.value })}
                          placeholder="Slide Title / Label (e.g. Cedar Forest Workshop)"
                          className="px-2.5 py-1 rounded-lg bg-slate-950 border border-white/10 text-xs text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none min-w-[200px]"
                        />
                        <select
                          value={item.type || 'image'}
                          onChange={(e) => handleUpdateMediaItem(idx, { type: e.target.value as 'image' | 'video' })}
                          className="px-2 py-1 rounded-lg bg-slate-950 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
                        >
                          <option value="image">🖼️ Image</option>
                          <option value="video">🎥 Video (MP4/WebM)</option>
                        </select>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleMoveMediaItem(idx, 'up')}
                          disabled={idx === 0}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 cursor-pointer"
                          title="Move slide up"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveMediaItem(idx, 'down')}
                          disabled={idx === heroMediaItems.length - 1}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 cursor-pointer"
                          title="Move slide down"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDuplicateMediaItem(item)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 cursor-pointer"
                          title="Duplicate slide"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleUpdateMediaItem(idx, { isPublished: item.isPublished === false ? true : false })}
                          className={`p-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1 ${
                            item.isPublished !== false 
                              ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30' 
                              : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                          }`}
                          title={item.isPublished !== false ? "Hide media slide from website" : "Unhide / Show media slide on website"}
                        >
                          {item.isPublished !== false ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                          <span className="text-[10px] font-bold hidden sm:inline">{item.isPublished !== false ? 'Live' : 'Hidden'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteMediaItem(idx)}
                          className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors cursor-pointer"
                          title="Delete slide"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Dual Device Asset Pickers and Configuration */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {/* Desktop Asset Card */}
                      <div className="p-3.5 rounded-xl bg-slate-950/80 border border-sky-500/30 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-sky-400 flex items-center gap-1.5 uppercase tracking-wider">
                            <Monitor className="w-3.5 h-3.5" />
                            <span>Desktop Media (Widescreen 16:9 / 21:9)</span>
                          </span>
                          {item.url && (
                            <span className="text-[10px] text-slate-400 font-mono">
                              Active
                            </span>
                          )}
                        </div>

                        <MediaAssetPicker
                          label="Desktop Media Source"
                          subLabel="Select from heritage library presets or upload custom 16:9 image"
                          value={item.url || ''}
                          onChange={(url) => handleUpdateMediaItem(idx, { url })}
                          recommendedRatio="16:9"
                          recommendedDimensions="1920×1080px (16:9)"
                        />

                        {/* Live Desktop Thumbnail Preview */}
                        {item.url && item.type !== 'video' && (
                          <div className="relative aspect-video w-full rounded-lg overflow-hidden border border-white/10 bg-black">
                            <img 
                              src={item.url} 
                              alt={item.title || 'Slide preview'} 
                              className="w-full h-full"
                              style={{
                                objectFit: item.imageFit || 'cover',
                                objectPosition: item.objectPosition || 'center',
                                transform: `scale(${(item.imageZoom || 100) / 100})`
                              }}
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/70 text-[9px] text-white font-mono">
                              Desktop Preview
                            </div>
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <div>
                            <div className="flex justify-between items-center mb-0.5">
                              <label className="text-[10px] uppercase text-slate-400 font-bold">Desktop Zoom</label>
                              <span className="text-[10px] font-mono text-sky-400">{item.imageZoom || 100}%</span>
                            </div>
                            <input
                              type="range"
                              min="80"
                              max="200"
                              step="5"
                              value={item.imageZoom || 100}
                              onChange={(e) => handleUpdateMediaItem(idx, { imageZoom: parseInt(e.target.value, 10) })}
                              className="w-full accent-sky-500 cursor-pointer"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] uppercase text-slate-400 font-bold mb-0.5">Desktop Focus</label>
                            <select
                              value={item.objectPosition || 'center'}
                              onChange={(e) => handleUpdateMediaItem(idx, { objectPosition: e.target.value })}
                              className="w-full px-2 py-1 rounded-lg bg-black border border-white/10 text-xs text-white"
                            >
                              <option value="center">Center</option>
                              <option value="top">Top Center</option>
                              <option value="bottom">Bottom Center</option>
                              <option value="left">Left Center</option>
                              <option value="right">Right Center</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-[10px] uppercase text-slate-400 font-bold mb-0.5">Desktop Aspect Ratio</label>
                            <select
                              value={item.desktopAspectRatio || '16:9'}
                              onChange={(e) => handleUpdateMediaItem(idx, { desktopAspectRatio: e.target.value as any })}
                              className="w-full px-2 py-1 rounded-lg bg-black border border-white/10 text-xs text-white"
                            >
                              <option value="auto">⚡ Smart Auto Height</option>
                              <option value="16:9">16:9 Widescreen</option>
                              <option value="21:9">21:9 Ultrawide</option>
                              <option value="4:3">4:3 Classic</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-[10px] uppercase text-slate-400 font-bold mb-0.5">Desktop Fit Mode</label>
                            <select
                              value={item.imageFit || 'contain'}
                              onChange={(e) => handleUpdateMediaItem(idx, { imageFit: e.target.value as any })}
                              className="w-full px-2 py-1 rounded-lg bg-black border border-white/10 text-xs text-white"
                            >
                              <option value="contain">✅ Full Fit (Auto Fit / No Crop - Default)</option>
                              <option value="cover">Cover (Fill Screen / Crop Edges)</option>
                              <option value="fill">Stretch (Full Frame)</option>
                            </select>
                          </div>
                        </div>
                      </div>

                      {/* Mobile Asset Card */}
                      <div className="p-3.5 rounded-xl bg-slate-950/80 border border-emerald-500/30 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 uppercase tracking-wider">
                            <Smartphone className="w-3.5 h-3.5" />
                            <span>Mobile Media (Vertical 9:16 / 3:4)</span>
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {item.mobileUrl ? 'Dedicated Mobile' : 'Using Desktop Image'}
                          </span>
                        </div>

                        <MediaAssetPicker
                          label="Mobile Media Source (Optional)"
                          subLabel="Select vertical portrait asset or leave blank to reuse desktop image"
                          value={item.mobileUrl || ''}
                          onChange={(url) => handleUpdateMediaItem(idx, { mobileUrl: url })}
                          recommendedRatio="4:3"
                          recommendedDimensions="1080×1920px (9:16)"
                        />

                        {/* ONE-CLICK DISPLAY MODE */}
                        <div className="space-y-1.5 pt-1">
                          <div className="flex items-center justify-between">
                            <label className="text-[10px] uppercase text-amber-400 font-extrabold flex items-center gap-1 tracking-wider">
                              <Sparkles className="w-3 h-3" />
                              <span>⚡ One-Click Display Mode:</span>
                            </label>
                            <span className="text-[10px] text-slate-400">Choose how photo fits on phones</span>
                          </div>
                          <div className="grid grid-cols-3 gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleUpdateMediaItem(idx, { mobileAspectRatio: '16:9', mobileImageFit: 'contain', mobileImageZoom: 100 })}
                              className={`px-2 py-1.5 rounded-lg text-[10px] font-bold border transition-all cursor-pointer flex items-center justify-center gap-1 ${
                                (item.mobileAspectRatio === '16:9' && (item.mobileImageFit || 'cover') === 'contain')
                                  ? 'bg-sky-500 text-slate-950 border-sky-300 font-black shadow-lg shadow-sky-500/20'
                                  : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-white/10'
                              }`}
                            >
                              <span>🖼️ Full Image (Uncropped)</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleUpdateMediaItem(idx, { mobileAspectRatio: '16:9', mobileImageFit: 'cover', mobileImageZoom: 100 })}
                              className={`px-2 py-1.5 rounded-lg text-[10px] font-bold border transition-all cursor-pointer flex items-center justify-center gap-1 ${
                                (item.mobileAspectRatio === '16:9' && (item.mobileImageFit || 'cover') !== 'contain')
                                  ? 'bg-sky-500 text-slate-950 border-sky-300 font-black shadow-lg shadow-sky-500/20'
                                  : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-white/10'
                              }`}
                            >
                              <span>📺 16:9 Landscape Phone</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleUpdateMediaItem(idx, { mobileAspectRatio: '9:16', mobileImageFit: 'cover', mobileImageZoom: 100 })}
                              className={`px-2 py-1.5 rounded-lg text-[10px] font-bold border transition-all cursor-pointer flex items-center justify-center gap-1 ${
                                item.mobileAspectRatio === '9:16'
                                  ? 'bg-sky-500 text-slate-950 border-sky-300 font-black shadow-lg shadow-sky-500/20'
                                  : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-white/10'
                              }`}
                            >
                              <span>📱 9:16 Portrait Crop</span>
                            </button>
                          </div>
                        </div>

                        {/* Live Mobile Thumbnail Preview */}
                        <div className="flex flex-col items-center justify-center pt-2">
                          <div className={`relative overflow-hidden rounded-xl border border-white/15 bg-black shadow-inner ${
                            item.mobileAspectRatio === '16:9' ? 'w-56 aspect-[16/9]' :
                            item.mobileAspectRatio === '3:4' ? 'w-36 aspect-[3/4]' :
                            item.mobileAspectRatio === '1:1' ? 'w-36 aspect-square' :
                            'w-32 aspect-[9/16]'
                          }`}>
                            {/* Ambient blurred backdrop if 16:9 or contain */}
                            {(item.mobileAspectRatio === '16:9' || item.mobileImageFit === 'contain') && (
                              <img
                                src={item.mobileUrl || item.url}
                                alt=""
                                className="absolute inset-0 w-full h-full object-cover blur-md opacity-40 scale-110 pointer-events-none"
                                referrerPolicy="no-referrer"
                              />
                            )}
                            <img 
                              src={item.mobileUrl || item.url} 
                              alt="Mobile Preview" 
                              className={`w-full h-full relative z-10 ${
                                item.mobileAspectRatio === '16:9' || item.mobileImageFit === 'contain' ? 'object-contain' : 'object-cover'
                              }`}
                              style={{
                                objectPosition: item.mobileObjectPosition || item.objectPosition || 'center',
                                transform: `scale(${((item.mobileImageZoom || item.imageZoom || 100)) / 100})`
                              }}
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute bottom-1 left-1 right-1 px-1.5 py-0.5 rounded bg-black/80 text-[9px] text-sky-400 text-center font-mono z-20 flex items-center justify-center gap-1 border border-white/10">
                              <span>{item.mobileAspectRatio === '16:9' ? '📺 Full 16:9 Landscape' : '📱 Mobile Screen'}</span>
                            </div>
                          </div>
                          {item.mobileAspectRatio === '16:9' && (
                            <p className="text-[11px] text-sky-400 font-medium text-center flex items-center justify-center gap-1 mt-1.5">
                              <span>✓</span> Horizontal 16:9 display on mobile — shows entire panoramic width.
                            </p>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <div>
                            <div className="flex justify-between items-center mb-0.5">
                              <label className="text-[10px] uppercase text-slate-400 font-bold">Mobile Zoom</label>
                              <span className="text-[10px] font-mono text-emerald-400">{item.mobileImageZoom || item.imageZoom || 100}%</span>
                            </div>
                            <input
                              type="range"
                              min="80"
                              max="200"
                              step="5"
                              value={item.mobileImageZoom || item.imageZoom || 100}
                              onChange={(e) => handleUpdateMediaItem(idx, { mobileImageZoom: parseInt(e.target.value, 10) })}
                              className="w-full accent-emerald-500 cursor-pointer"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] uppercase text-slate-400 font-bold mb-0.5">Mobile Focus</label>
                            <select
                              value={item.mobileObjectPosition || item.objectPosition || 'center'}
                              onChange={(e) => handleUpdateMediaItem(idx, { mobileObjectPosition: e.target.value })}
                              className="w-full px-2 py-1 rounded-lg bg-black border border-white/10 text-xs text-white"
                            >
                              <option value="center">Center</option>
                              <option value="top">Top Center</option>
                              <option value="bottom">Bottom Center</option>
                              <option value="left">Left Center</option>
                              <option value="right">Right Center</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-[10px] uppercase text-slate-400 font-bold mb-0.5">Mobile Aspect Ratio</label>
                            <select
                              value={item.mobileAspectRatio || 'auto'}
                              onChange={(e) => handleUpdateMediaItem(idx, { mobileAspectRatio: e.target.value as any })}
                              className="w-full px-2 py-1 rounded-lg bg-black border border-white/10 text-xs text-white"
                            >
                              <option value="16:9">📺 16:9 Landscape (Show Full Horizontal Photo)</option>
                              <option value="auto">⚡ Smart Auto Height</option>
                              <option value="9:16">📱 9:16 Portrait (Phone)</option>
                              <option value="3:4">📐 3:4 Vertical</option>
                              <option value="1:1">⬛ 1:1 Square</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-[10px] uppercase text-slate-400 font-bold mb-0.5">Mobile Fit Mode</label>
                            <select
                              value={item.mobileImageFit || item.imageFit || 'cover'}
                              onChange={(e) => handleUpdateMediaItem(idx, { mobileImageFit: e.target.value as any })}
                              className="w-full px-2 py-1 rounded-lg bg-black border border-white/10 text-xs text-white"
                            >
                              <option value="cover">Cover (Fill Screen & Crop Edges)</option>
                              <option value="contain">Contain (Full Uncropped)</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Custom Slide Overlay Text (English & Arabic) */}
                    <div className="p-3.5 rounded-xl bg-slate-950/60 border border-white/10 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">
                          Custom Slide Overlay Headings (Overrides Hero Main Title for this slide)
                        </span>
                        <span className="text-[10px] text-slate-500">Optional</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] uppercase text-slate-400 mb-1">Slide Title (English)</label>
                          <input
                            type="text"
                            value={item.customTitle || ''}
                            onChange={(e) => handleUpdateMediaItem(idx, { customTitle: e.target.value })}
                            placeholder="Leave blank to use default Hero Title"
                            className="w-full px-2.5 py-1.5 rounded-lg bg-black border border-white/10 text-xs text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] uppercase text-amber-400 mb-1" dir="rtl">عنوان الشريحة (عربي)</label>
                          <input
                            type="text"
                            value={item.customTitleArabic || ''}
                            onChange={(e) => handleUpdateMediaItem(idx, { customTitleArabic: e.target.value })}
                            placeholder="اتركه فارغاً لاستخدام العنوان الافتراضي"
                            className="w-full px-2.5 py-1.5 rounded-lg bg-black border border-white/10 text-xs text-white text-right"
                            dir="rtl"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] uppercase text-slate-400 mb-1">Slide Subtitle (English)</label>
                          <input
                            type="text"
                            value={item.customSubtitle || ''}
                            onChange={(e) => handleUpdateMediaItem(idx, { customSubtitle: e.target.value })}
                            placeholder="Leave blank to use default Hero Subtitle"
                            className="w-full px-2.5 py-1.5 rounded-lg bg-black border border-white/10 text-xs text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] uppercase text-amber-400 mb-1" dir="rtl">الوصف الترويجي للشريحة (عربي)</label>
                          <input
                            type="text"
                            value={item.customSubtitleArabic || ''}
                            onChange={(e) => handleUpdateMediaItem(idx, { customSubtitleArabic: e.target.value })}
                            placeholder="اتركه فارغاً لاستخدام الوصف الافتراضي"
                            className="w-full px-2.5 py-1.5 rounded-lg bg-black border border-white/10 text-xs text-white text-right"
                            dir="rtl"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Slide Scheduling & Auto-Publishing Window */}
                    <div className="p-3.5 rounded-xl bg-slate-950/70 border border-white/10 space-y-2.5">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <label className="text-xs font-bold text-slate-300 flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={item.scheduleActive || false}
                            onChange={(e) => handleUpdateMediaItem(idx, { scheduleActive: e.target.checked })}
                            className="w-4 h-4 rounded accent-amber-500 cursor-pointer"
                          />
                          <Calendar className="w-3.5 h-3.5 text-amber-400" />
                          <span>Automate Run Dates (Schedule Start & Expiration)</span>
                        </label>
                        {item.scheduleActive && (
                          <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${scheduleStatus.badgeColor}`}>
                            {scheduleStatus.label}
                          </span>
                        )}
                      </div>

                      {item.scheduleActive && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-white/5">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                              Start Date & Time (Go Live)
                            </label>
                            <input
                              type="datetime-local"
                              value={item.startDate || ''}
                              onChange={(e) => handleUpdateMediaItem(idx, { startDate: e.target.value })}
                              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
                            />
                            <p className="text-[10px] text-slate-500 mt-1">Leave empty to display immediately when published.</p>
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                              End Date & Time (Auto-Hide)
                            </label>
                            <input
                              type="datetime-local"
                              value={item.endDate || ''}
                              onChange={(e) => handleUpdateMediaItem(idx, { endDate: e.target.value })}
                              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
                            />
                            <p className="text-[10px] text-slate-500 mt-1">Slide will automatically expire and hide after this time.</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  );
                })}
                
                {heroMediaItems.length === 0 && (
                  <div className="text-center py-8 bg-slate-900/60 rounded-2xl border border-white/10 space-y-2">
                    <p className="text-sm text-slate-400">No background media slides added yet.</p>
                    <button
                      type="button"
                      onClick={handleAddMediaItem}
                      className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1.5"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add First Slide</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Hero Statistics & Trust Counters */}
            <div className="pt-4 border-t border-white/10 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400">
                    Hero Statistics & Trust Counters ({heroStats.length})
                  </h4>
                  <p className="text-[11px] text-slate-400">Key proof metrics shown beneath the hero call to action.</p>
                </div>
                <button
                  type="button"
                  onClick={handleAddStat}
                  className="px-3 py-1 bg-slate-900 hover:bg-slate-800 text-amber-400 rounded-xl text-xs font-bold transition-all border border-white/10 flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Metric</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {heroStats.map((stat, idx) => (
                  <div key={idx} className="p-3.5 bg-slate-900 rounded-2xl border border-white/10 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono text-slate-400">Metric #{idx + 1}</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleUpdateStat(idx, { isPublished: stat.isPublished === false ? true : false })}
                          className="text-slate-400 hover:text-white p-1"
                        >
                          {stat.isPublished !== false ? <Eye className="w-3.5 h-3.5 text-emerald-400" /> : <EyeOff className="w-3.5 h-3.5 text-slate-500" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteStat(idx)}
                          className="text-slate-400 hover:text-red-400 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[9px] uppercase text-slate-400 mb-0.5">Value (EN)</label>
                        <input
                          type="text"
                          value={stat.value}
                          onChange={(e) => handleUpdateStat(idx, { value: e.target.value })}
                          className="w-full px-2 py-1 rounded-lg bg-black border border-white/10 text-xs text-white font-bold"
                          placeholder="e.g. 120+"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] uppercase text-amber-400 mb-0.5" dir="rtl">القيمة (عربي)</label>
                        <input
                          type="text"
                          dir="rtl"
                          value={stat.valueArabic || ''}
                          onChange={(e) => handleUpdateStat(idx, { valueArabic: e.target.value })}
                          className="w-full px-2 py-1 rounded-lg bg-black border border-white/10 text-xs text-white font-bold text-right"
                          placeholder="+١٢٠"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[9px] uppercase text-slate-400 mb-0.5">Label (EN)</label>
                      <input
                        type="text"
                        value={stat.label}
                        onChange={(e) => handleUpdateStat(idx, { label: e.target.value })}
                        className="w-full px-2 py-1 rounded-lg bg-black border border-white/10 text-xs text-white"
                        placeholder="e.g. Master Artisans"
                      />
                    </div>

                    <div>
                      <label className="block text-[9px] uppercase text-amber-400 mb-0.5" dir="rtl">الوصف (عربي)</label>
                      <input
                        type="text"
                        dir="rtl"
                        value={stat.labelArabic || ''}
                        onChange={(e) => handleUpdateStat(idx, { labelArabic: e.target.value })}
                        className="w-full px-2 py-1 rounded-lg bg-black border border-white/10 text-xs text-white text-right"
                        placeholder="حرفي ماهر"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2. Generic Homepage Promotional Banner Section */}
      <div id="sec-promo-banner">
        <CMSFieldGroup
          id="sec-promo-banner-group"
          title="Homepage Promotional Content Slider & Carousel"
          description="Fully admin-controlled responsive slider/carousel positioned alongside the homepage hero (Multiple slides, autoplay, arrows, dots, loop, image/text/product/category promos)"
          icon={<Layers className="w-5 h-5 text-amber-400 shrink-0" aria-hidden="true" />}
          badge={
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 font-bold border border-amber-500/20">
              Responsive Slider Block
            </span>
          }
          isExpanded={sectionExpansion['promoBanner']}
          onToggle={() => toggleSection('promoBanner')}
        >
          <CMSPromoBannerEditor
            promoBannerData={promoBannerData}
            onChangePromoBanner={onChangePromoBannerField || (() => {})}
          />
        </CMSFieldGroup>
      </div>

      {/* 3. Promotional Offers & Carousel Slides */}
      <div id="sec-offers" className="bg-[#121222] border border-white/10 rounded-3xl p-6 space-y-5 transition-all duration-300">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Tag className="w-5 h-5 text-emerald-400" />
              <span>Promotional Offers & Carousel Slides</span>
            </h3>
            {slides.length > 0 && (
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold">
                {slides.length} {slides.length === 1 ? 'slide' : 'slides'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!isCreatingSlide && !editingSlide && (
              <button
                type="button"
                onClick={handleStartCreateSlide}
                className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-sm active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>Add Offer Slide</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => toggleSection('offers')}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-all cursor-pointer"
              title={sectionExpansion['offers'] ? "Collapse section" : "Expand section"}
            >
              {sectionExpansion['offers'] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {sectionExpansion['offers'] && (
          <div className="space-y-5">
            {/* Section Header Configuration */}
            <div className="p-5 bg-slate-950/70 border border-white/10 rounded-2xl space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400">
                Ads & Promotions Header Text & Labels
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">Section Category Tag (English)</label>
                  <input
                    type="text"
                    value={offersData?.sectionTag || ''}
                    onChange={(e) => onChangeOffersField('sectionTag', e.target.value)}
                    placeholder="Default: Ads & Promotions"
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-amber-400 uppercase mb-1" dir="rtl">فئة القسم (عربي)</label>
                  <input
                    type="text"
                    dir="rtl"
                    value={offersData?.sectionTagArabic || ''}
                    onChange={(e) => onChangeOffersField('sectionTagArabic', e.target.value)}
                    placeholder="الافتراضي: الإعلانات والعروض"
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">Sponsored Badge Pill (English)</label>
                  <input
                    type="text"
                    value={offersData?.sectionBadge || ''}
                    onChange={(e) => onChangeOffersField('sectionBadge', e.target.value)}
                    placeholder="Default: Sponsored • Special Deals"
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-amber-400 uppercase mb-1" dir="rtl">شارة الرعاية (عربي)</label>
                  <input
                    type="text"
                    dir="rtl"
                    value={offersData?.sectionBadgeArabic || ''}
                    onChange={(e) => onChangeOffersField('sectionBadgeArabic', e.target.value)}
                    placeholder="الافتراضي: برعاية • عروض خاصة"
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">Main Section Title (English)</label>
                  <input
                    type="text"
                    value={offersData?.sectionTitle || ''}
                    onChange={(e) => onChangeOffersField('sectionTitle', e.target.value)}
                    placeholder="Default: Exclusive Cultural Promotions & Offers"
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-amber-400 uppercase mb-1" dir="rtl">عنوان القسم الرئيسي (عربي)</label>
                  <input
                    type="text"
                    dir="rtl"
                    value={offersData?.sectionTitleArabic || ''}
                    onChange={(e) => onChangeOffersField('sectionTitleArabic', e.target.value)}
                    placeholder="الافتراضي: عروض وحملات إعلانية حصرية"
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">Section Subtitle / Description (English)</label>
                  <input
                    type="text"
                    value={offersData?.sectionSubtitle || ''}
                    onChange={(e) => onChangeOffersField('sectionSubtitle', e.target.value)}
                    placeholder="Default: Limited-time seasonal deals..."
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-amber-400 uppercase mb-1" dir="rtl">الوصف الفرعي للقسم (عربي)</label>
                  <input
                    type="text"
                    dir="rtl"
                    value={offersData?.sectionSubtitleArabic || ''}
                    onChange={(e) => onChangeOffersField('sectionSubtitleArabic', e.target.value)}
                    placeholder="الافتراضي: عروض موسمية لفترة محدودة..."
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Slide Edit / Create Form */}
            {(isCreatingSlide || editingSlide) && (
              <form onSubmit={handleSaveSlide} className="p-5 bg-slate-950 border border-emerald-500/40 rounded-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <h4 className="text-sm font-bold text-emerald-400 flex items-center gap-2">
                    <Edit3 className="w-4 h-4" />
                    <span>{editingSlide ? 'Edit Promotional Slide' : 'Add New Promotional Slide'}</span>
                  </h4>
                  <button
                    type="button"
                    onClick={() => { setIsCreatingSlide(false); setEditingSlide(null); }}
                    className="p-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">Slide Badge (English)</label>
                    <input
                      type="text"
                      value={slideForm.badge}
                      onChange={(e) => setSlideForm({ ...slideForm, badge: e.target.value })}
                      placeholder="e.g. SPECIAL PROMOTION"
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-amber-400 uppercase mb-1" dir="rtl">شارة العرض (عربي)</label>
                    <input
                      type="text"
                      dir="rtl"
                      value={slideForm.badgeArabic || ''}
                      onChange={(e) => setSlideForm({ ...slideForm, badgeArabic: e.target.value })}
                      placeholder="عرض خاص"
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">Slide Title (English)</label>
                    <input
                      type="text"
                      required
                      value={slideForm.title}
                      onChange={(e) => setSlideForm({ ...slideForm, title: e.target.value })}
                      placeholder="e.g. Koura Cold-Pressed Extra Virgin Olive Oil"
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-amber-400 uppercase mb-1" dir="rtl">عنوان العرض (عربي)</label>
                    <input
                      type="text"
                      dir="rtl"
                      value={slideForm.titleArabic || ''}
                      onChange={(e) => setSlideForm({ ...slideForm, titleArabic: e.target.value })}
                      placeholder="زيت زيتون الكورة البكر الممتاز"
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">Slide Subtitle (English)</label>
                    <input
                      type="text"
                      value={slideForm.subtitle}
                      onChange={(e) => setSlideForm({ ...slideForm, subtitle: e.target.value })}
                      placeholder="e.g. First cold extraction olive oil gift sets..."
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-amber-400 uppercase mb-1" dir="rtl">وصف العرض (عربي)</label>
                    <input
                      type="text"
                      dir="rtl"
                      value={slideForm.subtitleArabic || ''}
                      onChange={(e) => setSlideForm({ ...slideForm, subtitleArabic: e.target.value })}
                      placeholder="زيت بكر ممتاز من العصرة الأولى..."
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">Button Label (EN)</label>
                    <input
                      type="text"
                      value={slideForm.buttonText}
                      onChange={(e) => setSlideForm({ ...slideForm, buttonText: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1" dir="rtl">نص الزر (عربي)</label>
                    <input
                      type="text"
                      value={slideForm.buttonTextArabic || ''}
                      onChange={(e) => setSlideForm({ ...slideForm, buttonTextArabic: e.target.value })}
                      placeholder="تسوق العرض"
                      dir="rtl"
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">Target Redirect URL</label>
                    <input
                      type="text"
                      value={slideForm.targetUrl || ''}
                      onChange={(e) => setSlideForm({ ...slideForm, targetUrl: e.target.value })}
                      placeholder="/products?category=Pantry"
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">Discount Tag (e.g. 30% OFF)</label>
                    <input
                      type="text"
                      value={slideForm.discountBadge || ''}
                      onChange={(e) => setSlideForm({ ...slideForm, discountBadge: e.target.value })}
                      placeholder="BUNDLE & SAVE 20%"
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
                    />
                  </div>

                  {/* Dual Device Asset Pickers and Configuration - Matching Hero Background Media Studio */}
                  <div className="md:col-span-2 grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Desktop Asset Card */}
                    <div className="p-3.5 rounded-xl bg-slate-950/80 border border-sky-500/30 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-sky-400 flex items-center gap-1.5 uppercase tracking-wider">
                          <Monitor className="w-3.5 h-3.5" />
                          <span>Desktop Media (Widescreen 16:9 / 21:9)</span>
                        </span>
                        {(slideForm.desktopImageUrl || slideForm.imageUrl) && (
                          <span className="text-[10px] text-slate-400 font-mono">
                            Active
                          </span>
                        )}
                      </div>

                      <MediaAssetPicker
                        label="Desktop Media Source"
                        subLabel="Select from heritage library presets or upload custom 16:9 image"
                        value={slideForm.desktopImageUrl || slideForm.imageUrl || ''}
                        onChange={(url) => setSlideForm({ ...slideForm, desktopImageUrl: url, imageUrl: url })}
                        recommendedRatio="16:9"
                        recommendedDimensions="1920×1080px (16:9)"
                      />

                      {/* Live Desktop Thumbnail Preview */}
                      {(slideForm.desktopImageUrl || slideForm.imageUrl) && (
                        <div className="relative aspect-video w-full rounded-lg overflow-hidden border border-white/10 bg-black">
                          {/* Ambient blurred backdrop if fit mode is contain */}
                          {(slideForm.desktopImageFit || slideForm.imageFit || 'contain') === 'contain' && (
                            <img
                              src={slideForm.desktopImageUrl || slideForm.imageUrl}
                              alt=""
                              className="absolute inset-0 w-full h-full object-cover blur-md opacity-40 scale-110 pointer-events-none"
                              referrerPolicy="no-referrer"
                            />
                          )}
                          <img 
                            src={slideForm.desktopImageUrl || slideForm.imageUrl} 
                            alt={slideForm.title || 'Slide preview'} 
                            className="w-full h-full relative z-10"
                            style={{
                              objectFit: (slideForm.desktopImageFit || slideForm.imageFit || 'contain') as any,
                              objectPosition: slideForm.desktopObjectPosition || slideForm.objectPosition || 'center',
                              transform: `scale(${((slideForm.desktopImageZoom ?? slideForm.imageZoom ?? 100)) / 100})`
                            }}
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/70 text-[9px] text-white font-mono z-20">
                            Desktop Preview
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <div>
                          <div className="flex justify-between items-center mb-0.5">
                            <label className="text-[10px] uppercase text-slate-400 font-bold">Desktop Zoom</label>
                            <span className="text-[10px] font-mono text-sky-400">{slideForm.desktopImageZoom ?? slideForm.imageZoom ?? 100}%</span>
                          </div>
                          <input
                            type="range"
                            min="50"
                            max="200"
                            step="5"
                            value={slideForm.desktopImageZoom ?? slideForm.imageZoom ?? 100}
                            onChange={(e) => setSlideForm({ ...slideForm, desktopImageZoom: parseInt(e.target.value, 10), imageZoom: parseInt(e.target.value, 10) })}
                            className="w-full accent-sky-500 cursor-pointer"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] uppercase text-slate-400 font-bold mb-0.5">Desktop Focus</label>
                          <select
                            value={slideForm.desktopObjectPosition || slideForm.objectPosition || 'center'}
                            onChange={(e) => setSlideForm({ ...slideForm, desktopObjectPosition: e.target.value, objectPosition: e.target.value })}
                            className="w-full px-2 py-1 rounded-lg bg-black border border-white/10 text-xs text-white"
                          >
                            <option value="center">Center</option>
                            <option value="top">Top Center</option>
                            <option value="bottom">Bottom Center</option>
                            <option value="left">Left Center</option>
                            <option value="right">Right Center</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[10px] uppercase text-slate-400 font-bold mb-0.5">Desktop Aspect Ratio</label>
                          <select
                            value={slideForm.desktopAspectRatio || '16:9'}
                            onChange={(e) => setSlideForm({ ...slideForm, desktopAspectRatio: e.target.value as any })}
                            className="w-full px-2 py-1 rounded-lg bg-black border border-white/10 text-xs text-white"
                          >
                            <option value="auto">⚡ Smart Auto Height</option>
                            <option value="16:9">16:9 Widescreen</option>
                            <option value="21:9">21:9 Ultrawide</option>
                            <option value="4:3">4:3 Classic</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[10px] uppercase text-slate-400 font-bold mb-0.5">Desktop Fit Mode</label>
                          <select
                            value={slideForm.desktopImageFit || slideForm.imageFit || 'contain'}
                            onChange={(e) => setSlideForm({ ...slideForm, desktopImageFit: e.target.value as any, imageFit: e.target.value as any })}
                            className="w-full px-2 py-1 rounded-lg bg-black border border-white/10 text-xs text-white"
                          >
                            <option value="contain">✅ Full Fit (Auto Fit / No Crop - Default)</option>
                            <option value="cover">Cover (Fill Screen / Crop Edges)</option>
                            <option value="fill">Stretch (Full Frame)</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Mobile Asset Card */}
                    <div className="p-3.5 rounded-xl bg-slate-950/80 border border-emerald-500/30 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 uppercase tracking-wider">
                          <Smartphone className="w-3.5 h-3.5" />
                          <span>Mobile Media (Vertical 9:16 / 3:4)</span>
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {slideForm.mobileImageUrl ? 'Dedicated Mobile' : 'Using Desktop Image'}
                        </span>
                      </div>

                      <MediaAssetPicker
                        label="Mobile Media Source (Optional)"
                        subLabel="Select vertical portrait asset or leave blank to reuse desktop image"
                        value={slideForm.mobileImageUrl || ''}
                        onChange={(url) => setSlideForm({ ...slideForm, mobileImageUrl: url })}
                        recommendedRatio="4:3"
                        recommendedDimensions="1080×1920px (9:16)"
                      />

                      {/* ONE-CLICK DISPLAY MODE */}
                      <div className="space-y-1.5 pt-1">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] uppercase text-amber-400 font-extrabold flex items-center gap-1 tracking-wider">
                            <Sparkles className="w-3 h-3" />
                            <span>⚡ One-Click Display Mode:</span>
                          </label>
                          <span className="text-[10px] text-slate-400">Choose how photo fits on phones</span>
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSlideForm({ ...slideForm, mobileAspectRatio: '16:9', mobileImageFit: 'contain', mobileImageZoom: 100 })}
                            className={`px-2 py-1.5 rounded-lg text-[10px] font-bold border transition-all cursor-pointer flex items-center justify-center gap-1 ${
                              (slideForm.mobileAspectRatio === '16:9' && (slideForm.mobileImageFit || 'cover') === 'contain')
                                ? 'bg-sky-500 text-slate-950 border-sky-300 font-black shadow-lg shadow-sky-500/20'
                                : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-white/10'
                            }`}
                          >
                            <span>🖼️ Full Image (Uncropped)</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setSlideForm({ ...slideForm, mobileAspectRatio: '16:9', mobileImageFit: 'cover', mobileImageZoom: 100 })}
                            className={`px-2 py-1.5 rounded-lg text-[10px] font-bold border transition-all cursor-pointer flex items-center justify-center gap-1 ${
                              (slideForm.mobileAspectRatio === '16:9' && (slideForm.mobileImageFit || 'cover') !== 'contain')
                                ? 'bg-sky-500 text-slate-950 border-sky-300 font-black shadow-lg shadow-sky-500/20'
                                : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-white/10'
                            }`}
                          >
                            <span>📺 16:9 Landscape Phone</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setSlideForm({ ...slideForm, mobileAspectRatio: '9:16', mobileImageFit: 'cover', mobileImageZoom: 100 })}
                            className={`px-2 py-1.5 rounded-lg text-[10px] font-bold border transition-all cursor-pointer flex items-center justify-center gap-1 ${
                              slideForm.mobileAspectRatio === '9:16'
                                ? 'bg-sky-500 text-slate-950 border-sky-300 font-black shadow-lg shadow-sky-500/20'
                                : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-white/10'
                            }`}
                          >
                            <span>📱 9:16 Portrait Crop</span>
                          </button>
                        </div>
                      </div>

                      {/* Live Mobile Thumbnail Preview */}
                      <div className="flex flex-col items-center justify-center pt-2">
                        <div className={`relative overflow-hidden rounded-xl border border-white/15 bg-black shadow-inner ${
                          slideForm.mobileAspectRatio === '16:9' ? 'w-56 aspect-[16/9]' :
                          slideForm.mobileAspectRatio === '3:4' ? 'w-36 aspect-[3/4]' :
                          slideForm.mobileAspectRatio === '1:1' ? 'w-36 aspect-square' :
                          'w-32 aspect-[9/16]'
                        }`}>
                          {/* Ambient blurred backdrop if 16:9 or contain */}
                          {(slideForm.mobileAspectRatio === '16:9' || slideForm.mobileImageFit === 'contain') && (
                            <img
                              src={slideForm.mobileImageUrl || slideForm.desktopImageUrl || slideForm.imageUrl}
                              alt=""
                              className="absolute inset-0 w-full h-full object-cover blur-md opacity-40 scale-110 pointer-events-none"
                              referrerPolicy="no-referrer"
                            />
                          )}
                          <img 
                            src={slideForm.mobileImageUrl || slideForm.desktopImageUrl || slideForm.imageUrl} 
                            alt="Mobile Preview" 
                            className={`w-full h-full relative z-10 ${
                              slideForm.mobileAspectRatio === '16:9' || slideForm.mobileImageFit === 'contain' ? 'object-contain' : 'object-cover'
                            }`}
                            style={{
                              objectPosition: slideForm.mobileObjectPosition || slideForm.objectPosition || 'center',
                              transform: `scale(${((slideForm.mobileImageZoom ?? slideForm.imageZoom ?? 100)) / 100})`
                            }}
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute bottom-1 left-1 right-1 px-1.5 py-0.5 rounded bg-black/80 text-[9px] text-sky-400 text-center font-mono z-20 flex items-center justify-center gap-1 border border-white/10">
                            <span>{slideForm.mobileAspectRatio === '16:9' ? '📺 Full 16:9 Landscape' : '📱 Mobile Screen'}</span>
                          </div>
                        </div>
                        {slideForm.mobileAspectRatio === '16:9' && (
                          <p className="text-[11px] text-sky-400 font-medium text-center flex items-center justify-center gap-1 mt-1.5">
                            <span>✓</span> Horizontal 16:9 display on mobile — shows entire panoramic width.
                          </p>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <div>
                          <div className="flex justify-between items-center mb-0.5">
                            <label className="text-[10px] uppercase text-slate-400 font-bold">Mobile Zoom</label>
                            <span className="text-[10px] font-mono text-emerald-400">{slideForm.mobileImageZoom ?? slideForm.imageZoom ?? 100}%</span>
                          </div>
                          <input
                            type="range"
                            min="50"
                            max="200"
                            step="5"
                            value={slideForm.mobileImageZoom ?? slideForm.imageZoom ?? 100}
                            onChange={(e) => setSlideForm({ ...slideForm, mobileImageZoom: parseInt(e.target.value, 10) })}
                            className="w-full accent-emerald-500 cursor-pointer"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] uppercase text-slate-400 font-bold mb-0.5">Mobile Focus</label>
                          <select
                            value={slideForm.mobileObjectPosition || slideForm.objectPosition || 'center'}
                            onChange={(e) => setSlideForm({ ...slideForm, mobileObjectPosition: e.target.value })}
                            className="w-full px-2 py-1 rounded-lg bg-black border border-white/10 text-xs text-white"
                          >
                            <option value="center">Center</option>
                            <option value="top">Top Center</option>
                            <option value="bottom">Bottom Center</option>
                            <option value="left">Left Center</option>
                            <option value="right">Right Center</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[10px] uppercase text-slate-400 font-bold mb-0.5">Mobile Aspect Ratio</label>
                          <select
                            value={slideForm.mobileAspectRatio || 'auto'}
                            onChange={(e) => setSlideForm({ ...slideForm, mobileAspectRatio: e.target.value as any })}
                            className="w-full px-2 py-1 rounded-lg bg-black border border-white/10 text-xs text-white"
                          >
                            <option value="16:9">📺 16:9 Landscape (Show Full Horizontal Photo)</option>
                            <option value="auto">⚡ Smart Auto Height</option>
                            <option value="9:16">📱 9:16 Portrait (Phone)</option>
                            <option value="3:4">📐 3:4 Vertical</option>
                            <option value="1:1">⬛ 1:1 Square</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[10px] uppercase text-slate-400 font-bold mb-0.5">Mobile Fit Mode</label>
                          <select
                            value={slideForm.mobileImageFit || slideForm.imageFit || 'contain'}
                            onChange={(e) => setSlideForm({ ...slideForm, mobileImageFit: e.target.value as any })}
                            className="w-full px-2 py-1 rounded-lg bg-black border border-white/10 text-xs text-white"
                          >
                            <option value="contain">✅ Full Fit (Auto Fit / No Crop - Default)</option>
                            <option value="cover">Cover (Fill Screen & Crop Edges)</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Optional Background Video URL */}
                  <div className="md:col-span-2 p-3.5 rounded-xl bg-slate-950/60 border border-white/10 space-y-2">
                    <label className="block text-[11px] font-bold text-amber-400 uppercase">
                      Slide Background Video URL (Optional MP4/WebM)
                    </label>
                    <input
                      type="url"
                      value={slideForm.bgVideoUrl || ''}
                      onChange={(e) => setSlideForm({ ...slideForm, bgVideoUrl: e.target.value })}
                      placeholder="https://.../slide-video.mp4"
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none font-mono"
                    />
                  </div>
                </div>

                {/* Timed Campaign Scheduling & Run Window */}
                <div className="p-4 bg-slate-950/70 border border-white/10 rounded-xl space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <label className="text-xs font-bold text-amber-400 flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={slideForm.scheduleActive || false}
                        onChange={(e) => setSlideForm({ ...slideForm, scheduleActive: e.target.checked })}
                        className="w-4 h-4 rounded accent-amber-500 cursor-pointer"
                      />
                      <Calendar className="w-4 h-4" />
                      <span>Automate Run Dates (Schedule Start & Auto-Expiration)</span>
                    </label>
                    <label className="text-xs text-slate-300 flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={slideForm.isPublished !== false}
                        onChange={(e) => setSlideForm({ ...slideForm, isPublished: e.target.checked })}
                        className="w-3.5 h-3.5 rounded accent-emerald-500 cursor-pointer"
                      />
                      <span>Published & Active</span>
                    </label>
                  </div>

                  {slideForm.scheduleActive && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-white/10">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                          Start Date & Time (Go Live)
                        </label>
                        <input
                          type="datetime-local"
                          value={slideForm.startDate || ''}
                          onChange={(e) => setSlideForm({ ...slideForm, startDate: e.target.value })}
                          className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
                        />
                        <p className="text-[10px] text-slate-500 mt-1">Leave blank to display immediately upon publishing.</p>
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                          End Date & Time (Auto-Hide)
                        </label>
                        <input
                          type="datetime-local"
                          value={slideForm.endDate || ''}
                          onChange={(e) => setSlideForm({ ...slideForm, endDate: e.target.value })}
                          className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
                        />
                        <p className="text-[10px] text-slate-500 mt-1">Slide will automatically expire and disappear from website after this time.</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => { setIsCreatingSlide(false); setEditingSlide(null); }}
                    className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-bold transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    <Check className="w-4 h-4" />
                    <span>Save Slide</span>
                  </button>
                </div>
              </form>
            )}

            {/* Slides Grid with Reordering & Duplicate */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {slides.map((slide, sIdx) => {
                const scheduleStatus = getSlideScheduleStatus(slide);
                return (
                <div 
                  key={slide.id}
                  className={`bg-slate-900 border rounded-2xl overflow-hidden flex flex-col justify-between transition-all ${
                    slide.isPublished !== false ? 'border-white/10 hover:border-white/20' : 'border-white/5 opacity-60'
                  }`}
                >
                  <div className="relative h-36 bg-slate-950">
                    {slide.imageUrl && (
                      <img src={slide.imageUrl} alt={slide.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    )}
                    <div className="absolute top-2 left-2 right-2 flex items-center justify-between gap-1.5 flex-wrap">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500 text-slate-950 shadow-sm">
                          {slide.badge}
                        </span>
                        {slide.mobileImageUrl && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-500 text-white shadow-sm flex items-center gap-0.5">
                            <Smartphone className="w-2.5 h-2.5" /> Mobile
                          </span>
                        )}
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shadow-sm flex items-center gap-1 ${scheduleStatus.badgeColor}`}>
                        {scheduleStatus.status === 'live' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                        {scheduleStatus.status === 'scheduled' && <Clock className="w-2.5 h-2.5 text-sky-400" />}
                        {scheduleStatus.status === 'expired' && <Clock className="w-2.5 h-2.5 text-amber-400" />}
                        {scheduleStatus.status === 'hidden' && <EyeOff className="w-2.5 h-2.5 text-slate-400" />}
                        <span>{scheduleStatus.label}</span>
                      </span>
                    </div>
                  </div>

                  <div className="p-4 space-y-2">
                    <h4 className="text-xs font-bold text-white line-clamp-1">{slide.title}</h4>
                    {slide.titleArabic && (
                      <p className="text-[11px] text-amber-400/90 font-medium line-clamp-1 text-right" dir="rtl">{slide.titleArabic}</p>
                    )}
                    <p className="text-[11px] text-slate-400 line-clamp-2">{slide.subtitle}</p>

                    {slide.scheduleActive && (slide.startDate || slide.endDate) && (
                      <div className="text-[10px] font-mono text-sky-400 flex items-center gap-1 bg-sky-500/10 px-2 py-1 rounded-md border border-sky-500/20">
                        <Calendar className="w-3 h-3 text-sky-400 flex-shrink-0" />
                        <span>
                          {slide.startDate ? new Date(slide.startDate).toLocaleDateString() : 'Now'} → {slide.endDate ? new Date(slide.endDate).toLocaleDateString() : 'Ongoing'}
                        </span>
                      </div>
                    )}

                    <div className="pt-3 border-t border-white/10 flex items-center justify-between gap-1 flex-wrap">
                      <span className="text-[10px] font-bold text-amber-400">{slide.discountBadge}</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleMoveSlide(sIdx, 'up')}
                          disabled={sIdx === 0}
                          className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 cursor-pointer"
                          title="Move slide left / up"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveSlide(sIdx, 'down')}
                          disabled={sIdx === slides.length - 1}
                          className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 cursor-pointer"
                          title="Move slide right / down"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDuplicateSlide(slide)}
                          className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 cursor-pointer"
                          title="Duplicate slide"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleTogglePublishSlide(slide.id)}
                          className={`p-1 rounded-lg transition-colors cursor-pointer ${
                            slide.isPublished !== false 
                              ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30' 
                              : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                          }`}
                          title={slide.isPublished !== false ? "Hide promotional slide from website" : "Unhide / Show promotional slide on website"}
                        >
                          {slide.isPublished !== false ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStartEditSlide(slide)}
                          className="p-1 rounded-lg bg-slate-800 text-amber-400 hover:text-amber-300 cursor-pointer"
                          title="Edit slide"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteSlide(slide.id)}
                          className="p-1 rounded-lg bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 cursor-pointer"
                          title="Delete slide"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                );
              })}
            </div>

            {slides.length === 0 && (
              <div className="text-center py-6 bg-slate-900/60 rounded-xl border border-white/10">
                <p className="text-xs text-slate-400">No promotional offer slides configured yet.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3. Trust & Authenticity Badges Section */}
      <CMSFieldGroup
        id="sec-trust"
        title="Trust & Authenticity Guarantee Badges"
        description="Headlines for verified Lebanese terroir, direct cooperative support, and global express shipping"
        icon={<ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" aria-hidden="true" />}
        badge={
          <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/20">
            Trust & Quality
          </span>
        }
        isExpanded={sectionExpansion['trust']}
        onToggle={() => toggleSection('trust')}
      >
        <div className="space-y-4">
          <BilingualField
            labelEn="Trust Badges Header (Optional)"
            labelAr="عنوان قسم الثقة والضمان"
            valueEn={homeData?.trustBadgesTitle || ''}
            valueAr={homeData?.trustBadgesTitleArabic || ''}
            onChangeEn={(val) => onChangeHomeField('trustBadgesTitle', val)}
            onChangeAr={(val) => onChangeHomeField('trustBadgesTitleArabic', val)}
            placeholderEn="Why Choose Our Artisanal Platform"
            placeholderAr="لماذا تختار منصتنا الحرفية"
          />
          <BilingualField
            labelEn="Trust Badges Subtitle (Optional)"
            labelAr="الوصف الترويجي للثقة والضمان"
            valueEn={homeData?.trustBadgesSubtitle || ''}
            valueAr={homeData?.trustBadgesSubtitleArabic || ''}
            onChangeEn={(val) => onChangeHomeField('trustBadgesSubtitle', val)}
            onChangeAr={(val) => onChangeHomeField('trustBadgesSubtitleArabic', val)}
            placeholderEn="Direct cooperative support, small-batch purity, and reliable worldwide courier delivery."
            placeholderAr="دعم مباشر للتعاونيات، جودة نقية، وشحن موثوق لجميع أنحاء العالم."
          />
        </div>
      </CMSFieldGroup>

      {/* 4. Browse Categories & Lebanese Terroirs */}
      <CMSFieldGroup
        id="sec-categories"
        title="Browse Categories & Lebanese Terroirs"
        description="Department headers for olive oils, cedar honey, soaps, ceramics, and village pantry"
        icon={<Grid className="w-5 h-5 text-indigo-400 shrink-0" aria-hidden="true" />}
        badge={
          <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 font-bold border border-indigo-500/20">
            Department Discovery
          </span>
        }
        isExpanded={sectionExpansion['categories']}
        onToggle={() => toggleSection('categories')}
      >
        <div className="space-y-4">
          <BilingualField
            labelEn="Shop By Category Title"
            labelAr="عنوان تصفح الفئات"
            valueEn={homeData?.categoriesTitle || ''}
            valueAr={homeData?.categoriesTitleArabic || ''}
            onChangeEn={(val) => onChangeHomeField('categoriesTitle', val)}
            onChangeAr={(val) => onChangeHomeField('categoriesTitleArabic', val)}
            placeholderEn="Explore by Category"
            placeholderAr="تسوق حسب الفئات"
          />
          <BilingualField
            labelEn="Category Eyebrow Subtitle"
            labelAr="العنوان التمهيدي للفئات"
            valueEn={homeData?.categoriesSubtitle || ''}
            valueAr={homeData?.categoriesSubtitleArabic || ''}
            onChangeEn={(val) => onChangeHomeField('categoriesSubtitle', val)}
            onChangeAr={(val) => onChangeHomeField('categoriesSubtitleArabic', val)}
            placeholderEn="Browse Departments"
            placeholderAr="تصفح الأقسام"
          />
          <BilingualField
            labelEn="Department Narrative Context"
            labelAr="وصف وتوضيح الأقسام"
            valueEn={homeData?.regionsSubtitle || ''}
            valueAr={homeData?.regionsSubtitleArabic || ''}
            onChangeEn={(val) => onChangeHomeField('regionsSubtitle', val)}
            onChangeAr={(val) => onChangeHomeField('regionsSubtitleArabic', val)}
            placeholderEn="Discover authentic Lebanese crafts, pantry delicacies, electronics, and home essentials"
            placeholderAr="اكتشف الحرف اللبنانية، المؤونة، والأجهزة المنزلية بكل سهولة"
            isTextarea
            rows={2}
          />
        </div>
      </CMSFieldGroup>

      {/* 5. Featured Lebanese Treasures Showcase */}
      <CMSFieldGroup
        id="sec-featured"
        title="Featured Lebanese Treasures Section"
        description="Headlines, subheadings and context paragraph for the featured products showcase"
        icon={<Star className="w-5 h-5 text-amber-400 shrink-0" aria-hidden="true" />}
        badge={
          <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 font-bold border border-amber-500/20">
            Showcase Grid
          </span>
        }
        isExpanded={sectionExpansion['featured']}
        onToggle={() => toggleSection('featured')}
      >
        <div className="space-y-4">
          <BilingualField
            labelEn="Section Main Title"
            labelAr="عنوان قسم المنتجات المميزة"
            valueEn={homeData?.featuredTitle || ''}
            valueAr={homeData?.featuredTitleArabic || ''}
            onChangeEn={(val) => onChangeHomeField('featuredTitle', val)}
            onChangeAr={(val) => onChangeHomeField('featuredTitleArabic', val)}
            placeholderEn="Handcrafted Lebanese Treasures"
            placeholderAr="كنوز وحرف لبنانية مختارة"
          />
          <BilingualField
            labelEn="Section Subtitle"
            labelAr="العنوان الفرعي للمنتجات المميزة"
            valueEn={homeData?.featuredSubtitle || ''}
            valueAr={homeData?.featuredSubtitleArabic || ''}
            onChangeEn={(val) => onChangeHomeField('featuredSubtitle', val)}
            onChangeAr={(val) => onChangeHomeField('featuredSubtitleArabic', val)}
            placeholderEn="Authentic Artisan Mouneh"
            placeholderAr="مونة بيتية أصيلة من القرى"
          />
          <BilingualField
            labelEn="Section Description / Context"
            labelAr="وصف المنتجات المميزة"
            valueEn={homeData?.featuredDescription || ''}
            valueAr={homeData?.featuredDescriptionArabic || ''}
            onChangeEn={(val) => onChangeHomeField('featuredDescription', val)}
            onChangeAr={(val) => onChangeHomeField('featuredDescriptionArabic', val)}
            placeholderEn="Handpicked items celebrating timeless craftsmanship and Levantine gastronomy."
            placeholderAr="مختارات تعكس أصالة الحرف والطهي المشرقي."
            isTextarea
            rows={2}
          />
        </div>
      </CMSFieldGroup>

      {/* 6. Today's Flash Deals & Harvest Specials */}
      <CMSFieldGroup
        id="sec-deals"
        title="Today's Harvest Specials & Flash Deals"
        description="Seasonal harvest specials, discount banners and limited-time offer headlines"
        icon={<Zap className="w-5 h-5 text-yellow-400 shrink-0" aria-hidden="true" />}
        badge={
          <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 font-bold border border-yellow-500/20">
            Special Pricing
          </span>
        }
        isExpanded={sectionExpansion['deals']}
        onToggle={() => toggleSection('deals')}
      >
        <div className="space-y-4">
          <BilingualField
            labelEn="Deals Section Title"
            labelAr="عنوان عروض اليوم السريعة"
            valueEn={homeData?.dealsTitle || ''}
            valueAr={homeData?.dealsTitleArabic || ''}
            onChangeEn={(val) => onChangeHomeField('dealsTitle', val)}
            onChangeAr={(val) => onChangeHomeField('dealsTitleArabic', val)}
            placeholderEn="Today's Harvest Specials"
            placeholderAr="عروض موسم القطاف الحصرية"
          />
          <BilingualField
            labelEn="Deals Section Subtitle"
            labelAr="العنوان الفرعي لعروض اليوم"
            valueEn={homeData?.dealsSubtitle || ''}
            valueAr={homeData?.dealsSubtitleArabic || ''}
            onChangeEn={(val) => onChangeHomeField('dealsSubtitle', val)}
            onChangeAr={(val) => onChangeHomeField('dealsSubtitleArabic', val)}
            placeholderEn="Limited Seasonal Batches"
            placeholderAr="كميات محدودة وأسعار تشجيعية"
          />
          <BilingualField
            labelEn="Deals Section Description"
            labelAr="وصف عروض اليوم"
            valueEn={homeData?.dealsDescription || ''}
            valueAr={homeData?.dealsDescriptionArabic || ''}
            onChangeEn={(val) => onChangeHomeField('dealsDescription', val)}
            onChangeAr={(val) => onChangeHomeField('dealsDescriptionArabic', val)}
            placeholderEn="Limited time offers, grab them before they are gone!"
            placeholderAr="عروض لفترة محدودة، احصل عليها قبل نفاد الكمية!"
            isTextarea
            rows={2}
          />
        </div>
      </CMSFieldGroup>

      {/* 7. Exclusive Curated Packs & Combos (Bundles) */}
      <CMSFieldGroup
        id="sec-bundles"
        title="Exclusive Curated Packs & Combos Section"
        description="Headlines for curated artisan gift sets, mouneh bundles, and combo packs"
        icon={<ShoppingBag className="w-5 h-5 text-rose-400 shrink-0" aria-hidden="true" />}
        badge={
          <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 font-bold border border-rose-500/20">
            Combo Packs
          </span>
        }
        isExpanded={sectionExpansion['bundles']}
        onToggle={() => toggleSection('bundles')}
      >
        <div className="space-y-4">
          <BilingualField
            labelEn="Bundles Section Main Title"
            labelAr="عنوان باقات التوفير والكومبو"
            valueEn={homeData?.bundlesTitle || ''}
            valueAr={homeData?.bundlesTitleArabic || ''}
            onChangeEn={(val) => onChangeHomeField('bundlesTitle', val)}
            onChangeAr={(val) => onChangeHomeField('bundlesTitleArabic', val)}
            placeholderEn="Lebanese Combo & Gift Sets"
            placeholderAr="مجموعات الهدايا والكومبو المميزة"
          />
          <BilingualField
            labelEn="Bundles Eyebrow Badge"
            labelAr="شارة باقات التوفير"
            valueEn={homeData?.bundlesBadge || ''}
            valueAr={homeData?.bundlesBadgeArabic || ''}
            onChangeEn={(val) => onChangeHomeField('bundlesBadge', val)}
            onChangeAr={(val) => onChangeHomeField('bundlesBadgeArabic', val)}
            placeholderEn="Exclusive Curated Packs"
            placeholderAr="باقات توفير حصرية"
          />
          <BilingualField
            labelEn="Bundles Description"
            labelAr="وصف باقات التوفير"
            valueEn={homeData?.bundlesSubtitle || ''}
            valueAr={homeData?.bundlesSubtitleArabic || ''}
            onChangeEn={(val) => onChangeHomeField('bundlesSubtitle', val)}
            onChangeAr={(val) => onChangeHomeField('bundlesSubtitleArabic', val)}
            placeholderEn="Save more with our handpicked artisanal combinations and custom-packaged Lebanese treasures."
            placeholderAr="وفر أكثر مع هذه المجموعات المختارة بعناية من منتجاتنا التقليدية."
            isTextarea
            rows={2}
          />
        </div>
      </CMSFieldGroup>

      {/* 8. Fresh Village New Arrivals */}
      <CMSFieldGroup
        id="sec-newArrivals"
        title="Fresh Village New Arrivals"
        description="Header for recently crafted batches and newly added artisan creations"
        icon={<Sparkles className="w-5 h-5 text-cyan-400 shrink-0" aria-hidden="true" />}
        badge={
          <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 font-bold border border-cyan-500/20">
            Latest Batches
          </span>
        }
        isExpanded={sectionExpansion['newArrivals']}
        onToggle={() => toggleSection('newArrivals')}
      >
        <div className="space-y-4">
          <BilingualField
            labelEn="New Arrivals Section Title"
            labelAr="عنوان قسم وصل حديثاً"
            valueEn={homeData?.newArrivalsTitle || ''}
            valueAr={homeData?.newArrivalsTitleArabic || ''}
            onChangeEn={(val) => onChangeHomeField('newArrivalsTitle', val)}
            onChangeAr={(val) => onChangeHomeField('newArrivalsTitleArabic', val)}
            placeholderEn="Fresh From the Village"
            placeholderAr="وصل حديثاً من القرى والتعاونيات"
          />
          <BilingualField
            labelEn="New Arrivals Eyebrow Subtitle"
            labelAr="العنوان الفرعي لوصل حديثاً"
            valueEn={homeData?.newArrivalsSubtitle || ''}
            valueAr={homeData?.newArrivalsSubtitleArabic || ''}
            onChangeEn={(val) => onChangeHomeField('newArrivalsSubtitle', val)}
            onChangeAr={(val) => onChangeHomeField('newArrivalsSubtitleArabic', val)}
            placeholderEn="Freshly Stocked"
            placeholderAr="قطاف حديث"
          />
        </div>
      </CMSFieldGroup>

      {/* 9. Heritage Story Block */}
      <CMSFieldGroup
        id="sec-story"
        title="The Story of Cedar Roots & Mission"
        description="Narrative about rural producers, cooperatives, and ancestral craftsmanship"
        icon={<BookOpen className="w-5 h-5 text-orange-400 shrink-0" aria-hidden="true" />}
        badge={
          <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 font-bold border border-orange-500/20">
            Brand Narrative
          </span>
        }
        isExpanded={sectionExpansion['story']}
        onToggle={() => toggleSection('story')}
      >
        <div className="space-y-4">
          <BilingualField
            labelEn="Heritage Story Title"
            labelAr="عنوان قصة التراث والمونة"
            valueEn={homeData?.heritageTitle || ''}
            valueAr={homeData?.heritageTitleArabic || ''}
            onChangeEn={(val) => onChangeHomeField('heritageTitle', val)}
            onChangeAr={(val) => onChangeHomeField('heritageTitleArabic', val)}
            placeholderEn="The Story of Cedar Roots"
            placeholderAr="حكاية جذور الأرز والتراث الحي"
          />
          <BilingualField
            labelEn="Heritage Story Narrative Body"
            labelAr="سرد قصة التراث"
            valueEn={homeData?.heritageText || ''}
            valueAr={homeData?.heritageTextArabic || ''}
            onChangeEn={(val) => onChangeHomeField('heritageText', val)}
            onChangeAr={(val) => onChangeHomeField('heritageTextArabic', val)}
            placeholderEn="Describe your cooperative heritage and artisan traditions..."
            placeholderAr="كل طلب يدعم بشكل مباشر ورش الحرفيين المستقلين، التعاونيات المحلية، والعائلات اللبنانية الأصيلة..."
            isTextarea
            rows={3}
          />
        </div>
      </CMSFieldGroup>

      {/* 10. Customer Reviews & Community Voices */}
      <CMSFieldGroup
        id="sec-reviews"
        title="Customer Reviews & Community Voices"
        description="Headline and description for social proof and verified community feedback"
        icon={<MessageSquare className="w-5 h-5 text-pink-400 shrink-0" aria-hidden="true" />}
        badge={
          <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-pink-500/10 text-pink-400 font-bold border border-pink-500/20">
            Social Proof
          </span>
        }
        isExpanded={sectionExpansion['reviews']}
        onToggle={() => toggleSection('reviews')}
      >
        <div className="space-y-4">
          <BilingualField
            labelEn="Customer Reviews Section Title"
            labelAr="عنوان آراء وتجارب العملاء"
            valueEn={homeData?.reviewsTitle || ''}
            valueAr={homeData?.reviewsTitleArabic || ''}
            onChangeEn={(val) => onChangeHomeField('reviewsTitle', val)}
            onChangeAr={(val) => onChangeHomeField('reviewsTitleArabic', val)}
            placeholderEn="What Our Community Says"
            placeholderAr="ماذا يقول مجتمعنا وأحباؤنا"
          />
          <BilingualField
            labelEn="Customer Reviews Subtitle"
            labelAr="العنوان الفرعي لآراء العملاء"
            valueEn={homeData?.reviewsSubtitle || ''}
            valueAr={homeData?.reviewsSubtitleArabic || ''}
            onChangeEn={(val) => onChangeHomeField('reviewsSubtitle', val)}
            onChangeAr={(val) => onChangeHomeField('reviewsSubtitleArabic', val)}
            placeholderEn="Verified feedback from customers experiencing authentic Levantine craftsmanship."
            placeholderAr="تجارب وآراء حقيقية من زبائن عاشوا روعة المنتجات الحرفية اللبنانية."
          />
        </div>
      </CMSFieldGroup>

      {/* 11. Newsletter & Community Broadcast */}
      <CMSFieldGroup
        id="sec-newsletter"
        title="Newsletter & Community Broadcast"
        description="Email capture headlines, call to action, and subscribe button wording"
        icon={<Mail className="w-5 h-5 text-purple-400 shrink-0" aria-hidden="true" />}
        badge={
          <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 font-bold border border-purple-500/20">
            Email Capture
          </span>
        }
        isExpanded={sectionExpansion['newsletter']}
        onToggle={() => toggleSection('newsletter')}
      >
        <div className="space-y-4">
          <BilingualField
            labelEn="Newsletter Main Title"
            labelAr="عنوان النشرة البريدية"
            valueEn={homeData?.newsletterTitle || ''}
            valueAr={homeData?.newsletterTitleArabic || ''}
            onChangeEn={(val) => onChangeHomeField('newsletterTitle', val)}
            onChangeAr={(val) => onChangeHomeField('newsletterTitleArabic', val)}
            placeholderEn="Join the Yalla Heritage Circle"
            placeholderAr="انضم إلى عائلة يلا التراثية"
          />

          <BilingualField
            labelEn="Newsletter Subtitle Description"
            labelAr="الوصف الترويجي للنشرة البريدية"
            valueEn={homeData?.newsletterSubtitle || ''}
            valueAr={homeData?.newsletterSubtitleArabic || ''}
            onChangeEn={(val) => onChangeHomeField('newsletterSubtitle', val)}
            onChangeAr={(val) => onChangeHomeField('newsletterSubtitleArabic', val)}
            placeholderEn="Receive seasonal harvest updates, artisan stories, and exclusive subscriber promotions."
            placeholderAr="احصل على إشعارات موسم القطاف، قصص الحرفيين، وخصومات حصرية للمشتركين."
          />

          <BilingualField
            labelEn="Newsletter Button Label"
            labelAr="نص زر الاشتراك"
            valueEn={homeData?.newsletterButtonText || ''}
            valueAr={homeData?.newsletterButtonTextArabic || ''}
            onChangeEn={(val) => onChangeHomeField('newsletterButtonText', val)}
            onChangeAr={(val) => onChangeHomeField('newsletterButtonTextArabic', val)}
            placeholderEn="Subscribe"
            placeholderAr="اشترك"
            presetSuggestions={[
              { en: 'Subscribe', ar: 'اشتراك' },
              { en: 'Join Heritage Club', ar: 'انضم لمجتمع التراث' },
              { en: 'Get Updates', ar: 'احصل على الجديد' },
            ]}
          />
        </div>
      </CMSFieldGroup>
    </div>
  );
};
