import React, { useState, useEffect } from 'react';
import { useShop } from '../context/ShopContext';
import { useDialog } from '../hooks/useDialog';
import { CMSCustomBlock } from '../types';
import { 
  X, 
  Sparkles, 
  Layers, 
  Eye, 
  EyeOff, 
  Palette, 
  Link as LinkIcon, 
  Image as ImageIcon,
  Check,
  Layout,
  Code
} from 'lucide-react';

interface CustomBlockModalProps {
  isOpen: boolean;
  onClose: () => void;
  blockToEdit: CMSCustomBlock | null;
}

export const CustomBlockModal: React.FC<CustomBlockModalProps> = ({
  isOpen,
  onClose,
  blockToEdit
}) => {
  const { addCustomBlock, updateCustomBlock, showToast } = useShop();

  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [content, setContent] = useState('');
  const [badge, setBadge] = useState('');
  const [buttonText, setButtonText] = useState('');
  const [buttonTextArabic, setButtonTextArabic] = useState('');
  const [buttonUrl, setButtonUrl] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [bgStyle, setBgStyle] = useState<'dark' | 'light' | 'gold_gradient' | 'emerald_gradient' | 'custom_image' | 'glass'>('gold_gradient');
  const [customBgColor, setCustomBgColor] = useState('');
  const [customTextColor, setCustomTextColor] = useState('');
  const [targetPage, setTargetPage] = useState<'home' | 'products' | 'checkout' | 'account' | 'product_detail' | 'all'>('home');
  const [position, setPosition] = useState<'top' | 'middle' | 'bottom'>('middle');
  const [isPublished, setIsPublished] = useState(true);
  const [order, setOrder] = useState(1);

  const { containerRef } = useDialog({
    isOpen,
    onClose
  });

  useEffect(() => {
    if (blockToEdit) {
      setTitle(blockToEdit.title || '');
      setSubtitle(blockToEdit.subtitle || '');
      setContent(blockToEdit.content || '');
      setBadge(blockToEdit.badge || '');
      setButtonText(blockToEdit.buttonText || '');
      setButtonTextArabic(blockToEdit.buttonTextArabic || '');
      setButtonUrl(blockToEdit.buttonUrl || '');
      setImageUrl(blockToEdit.imageUrl || '');
      setBgStyle(blockToEdit.bgStyle || 'gold_gradient');
      setCustomBgColor(blockToEdit.customBgColor || '');
      setCustomTextColor(blockToEdit.customTextColor || '');
      setTargetPage(blockToEdit.targetPage || 'home');
      setPosition(blockToEdit.position || 'middle');
      setIsPublished(blockToEdit.isPublished !== false);
      setOrder(blockToEdit.order || 1);
    } else {
      setTitle('Special Lebanese Heritage Spotlight');
      setSubtitle('Curated seasonal items direct from mountain cooperatives');
      setContent('Enjoy free delivery across Greater Beirut on all artisanal orders over $40.');
      setBadge('Artisan Exclusive ✨');
      setButtonText('Explore Special Collection');
      setButtonUrl('/products');
      setImageUrl('https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=1200&q=80');
      setBgStyle('gold_gradient');
      setCustomBgColor('');
      setCustomTextColor('');
      setTargetPage('home');
      setPosition('middle');
      setIsPublished(true);
      setOrder(1);
    }
  }, [blockToEdit, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      showToast('Please provide a title for this custom block', 'warning');
      return;
    }

    const payload: Omit<CMSCustomBlock, 'id'> = {
      title,
      subtitle,
      content,
      badge,
      buttonText,
      buttonTextArabic,
      buttonUrl,
      imageUrl,
      bgStyle,
      customBgColor,
      customTextColor,
      targetPage,
      position,
      isPublished,
      order: Number(order) || 1
    };

    if (blockToEdit && blockToEdit.id) {
      await updateCustomBlock(blockToEdit.id, payload);
    } else {
      await addCustomBlock(payload);
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm overflow-y-auto">
      <div 
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        id="custom-block-builder-modal"
        className="bg-slate-900 border border-slate-700 text-white rounded-3xl w-full max-w-3xl overflow-hidden shadow-2xl my-8 animate-in fade-in zoom-in-95 flex flex-col max-h-[90vh] focus:outline-hidden"
      >
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-[#b89753]">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-100">
                {blockToEdit?.id ? 'Edit Custom Div / Section' : 'Create New Custom Div / Section'}
              </h2>
              <p className="text-xs text-slate-400">
                Design custom banners, promotional divs, or custom announcements
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Target Page & Position & Visibility */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-950/60 p-4 rounded-2xl border border-slate-800">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                Target Page
              </label>
              <select
                value={targetPage}
                onChange={(e) => setTargetPage(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-400"
              >
                <option value="home">Home Page</option>
                <option value="products">Artisan Catalog Page</option>
                <option value="product_detail">Product Detail Page</option>
                <option value="checkout">Checkout Page</option>
                <option value="account">Account Page</option>
                <option value="all">All Pages (Global)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                Position on Page
              </label>
              <select
                value={position}
                onChange={(e) => setPosition(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-400"
              >
                <option value="top">Top (Below Header)</option>
                <option value="middle">Middle (Between Sections)</option>
                <option value="bottom">Bottom (Above Footer)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                Publish Status
              </label>
              <button
                type="button"
                onClick={() => setIsPublished(!isPublished)}
                className={`w-full py-2 px-3 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer border ${
                  isPublished
                    ? 'bg-emerald-600 text-white border-emerald-500'
                    : 'bg-rose-950/40 text-rose-300 border-rose-800'
                }`}
              >
                {isPublished ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                <span>{isPublished ? 'Published (Live)' : 'Draft (Hidden)'}</span>
              </button>
            </div>
          </div>

          {/* Title & Badge */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                Title / Headline *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Cedar Forest Honey Autumn Drop"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                Badge / Pill Text
              </label>
              <input
                type="text"
                value={badge}
                onChange={(e) => setBadge(e.target.value)}
                placeholder="e.g. LIMITED EDITION 🍯"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>

          {/* Subtitle */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
              Subtitle
            </label>
            <input
              type="text"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              placeholder="e.g. 100% Raw Wildflower Honey harvested from Mount Lebanon"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
            />
          </div>

          {/* Body Content / HTML */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5 flex items-center justify-between">
              <span>Body Content / Narrative (HTML or text)</span>
              <span className="text-[10px] text-slate-400">Supports &lt;p&gt;, &lt;strong&gt;, &lt;ul&gt;</span>
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={3}
              placeholder="Enter narrative, shipping info, or custom HTML for this div block..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 leading-relaxed font-sans"
            />
          </div>

          {/* Button CTA & Action Link */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                Action Button Label (EN)
              </label>
              <input
                type="text"
                value={buttonText}
                onChange={(e) => setButtonText(e.target.value)}
                placeholder="e.g. Shop Honey Collection →"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                Action Button Label (AR)
              </label>
              <input
                type="text"
                value={buttonTextArabic}
                onChange={(e) => setButtonTextArabic(e.target.value)}
                placeholder="مثال: تسوق التشكيلة ←"
                dir="rtl"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                Button Action / Destination
              </label>
              <input
                type="text"
                value={buttonUrl}
                onChange={(e) => setButtonUrl(e.target.value)}
                placeholder="e.g. /products, category:grocery, https://wa.me/..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>

          {/* Background Styling & Visual Appearance */}
          <div className="p-4 bg-slate-950/60 rounded-2xl border border-slate-800 space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5" />
              <span>Background & Appearance</span>
            </h4>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { id: 'gold_gradient', label: 'Gold Amber Gradient' },
                { id: 'emerald_gradient', label: 'Emerald Pine Gradient' },
                { id: 'dark', label: 'Solid Charcoal Dark' },
                { id: 'light', label: 'Clean Off-White Light' },
                { id: 'glass', label: 'Frosted Glassmorphism' },
                { id: 'custom_image', label: 'Custom Background Photo' }
              ].map((style) => (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => setBgStyle(style.id as any)}
                  className={`p-2.5 rounded-xl text-xs font-medium text-left border transition-all cursor-pointer ${
                    bgStyle === style.id
                      ? 'border-amber-400 bg-amber-400/15 text-white font-bold'
                      : 'border-slate-800 bg-slate-800/60 text-slate-400 hover:text-white'
                  }`}
                >
                  {style.label}
                </button>
              ))}
            </div>

            {bgStyle === 'custom_image' && (
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                  Background Image URL
                </label>
                <input
                  type="url"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://images.unsplash.com/..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                />
              </div>
            )}
          </div>

          {/* Live Preview Box */}
          <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-2">
              Live Preview
            </span>
            <div className={`p-5 rounded-2xl border ${
              bgStyle === 'gold_gradient' ? 'bg-gradient-to-r from-amber-950 via-[#1f190e] to-slate-950 border-amber-500/30' :
              bgStyle === 'emerald_gradient' ? 'bg-gradient-to-r from-emerald-950 via-teal-950 to-slate-950 border-emerald-500/30' :
              bgStyle === 'light' ? 'bg-white text-slate-900 border-slate-200' :
              bgStyle === 'glass' ? 'bg-slate-900/80 backdrop-blur-md border-white/10' :
              'bg-slate-900 border-slate-800'
            }`}>
              {badge && (
                <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#b89753]/20 text-[#d4af37] border border-[#b89753]/30 mb-2">
                  {badge}
                </span>
              )}
              <h4 className="text-base font-bold mb-1 text-slate-100">{title || 'Sample Title'}</h4>
              {subtitle && <p className="text-xs text-slate-300 mb-2">{subtitle}</p>}
              {content && <p className="text-xs text-slate-400 mb-3">{content}</p>}
              {buttonText && (
                <span className="inline-block px-4 py-2 rounded-xl bg-[#b89753] text-white text-xs font-bold">
                  {buttonText}
                </span>
              )}
            </div>
          </div>
        </form>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            className="px-6 py-2.5 rounded-xl bg-[#b89753] hover:bg-[#c5a059] text-slate-950 text-xs font-bold uppercase tracking-wider transition-all shadow-md cursor-pointer flex items-center gap-2"
          >
            <Check className="w-4 h-4" />
            <span>{blockToEdit?.id ? 'Save & Publish Changes' : 'Create & Publish Div'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
