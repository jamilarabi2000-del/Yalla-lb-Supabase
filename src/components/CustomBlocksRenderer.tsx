import { safeExternalUrl } from '../lib/safeUrl';
import React from 'react';
import { useShop } from '../context/ShopContext';
import { CMSCustomBlock } from '../types';
import { Sparkles, ArrowRight, EyeOff, Edit3, Trash2 } from 'lucide-react';

interface CustomBlocksRendererProps {
  page: 'home' | 'products' | 'checkout' | 'account' | 'product_detail';
  position: 'top' | 'middle' | 'bottom';
  onEditBlock?: (block: CMSCustomBlock) => void;
}

export const CustomBlocksRenderer: React.FC<CustomBlocksRendererProps> = ({
  page,
  position,
  onEditBlock
}) => {
  const { siteContent, setActiveTab, setSelectedCategory, isAdminUnlocked, isVisualEditMode, deleteCustomBlock, toggleSectionVisibility, setCustomBlockToEdit, setIsCustomBlockModalOpen, language } = useShop();

  const blocks = (siteContent.customBlocks || [])
    .filter(block => {
      const matchPage = block.targetPage === 'all' || block.targetPage === page;
      const matchPos = block.position === position;
      return matchPage && matchPos;
    })
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  if (!blocks || blocks.length === 0) return null;

  const handleAction = (url?: string) => {
    if (!url) return;
    if (url === '/products' || url === 'products') {
      setSelectedCategory('all');
      setActiveTab('products');
    } else if (url === '/checkout' || url === 'checkout') {
      setActiveTab('checkout');
    } else if (url.startsWith('category:')) {
      const cat = url.replace('category:', '');
      setSelectedCategory(cat);
      setActiveTab('products');
    } else if (url.startsWith('http')) {
      const safe = safeExternalUrl(url);
      if (safe) window.open(safe, '_blank', 'noopener,noreferrer');
    } else {
      setSelectedCategory('all');
      setActiveTab('products');
    }
  };

  return (
    <div className="w-full space-y-6 max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
      {blocks.map((block) => {
        // If not published and admin is not in visual edit mode, hide completely
        if (!block.isPublished && !isVisualEditMode) return null;

        const isUnpublished = !block.isPublished;

        let bgClass = 'bg-slate-900 text-white border border-slate-800';
        if (block.bgStyle === 'gold_gradient') {
          bgClass = 'bg-gradient-to-r from-amber-950 via-[#1f190e] to-slate-950 text-white border border-amber-500/30';
        } else if (block.bgStyle === 'emerald_gradient') {
          bgClass = 'bg-gradient-to-r from-emerald-950 via-teal-950 to-slate-950 text-white border border-emerald-500/30';
        } else if (block.bgStyle === 'light') {
          bgClass = 'bg-white text-slate-900 border border-slate-200 shadow-sm';
        } else if (block.bgStyle === 'glass') {
          bgClass = 'bg-slate-900/80 backdrop-blur-md text-white border border-white/10 shadow-lg';
        } else if (block.bgStyle === 'custom_image' && block.imageUrl) {
          bgClass = 'relative bg-slate-900 text-white overflow-hidden border border-slate-700';
        }

        return (
          <div
            key={block.id}
            id={`custom-block-${block.id}`}
            className={`rounded-2xl p-6 sm:p-8 transition-all relative overflow-hidden ${bgClass} ${
              isUnpublished ? 'opacity-70 border-dashed border-rose-500/80 ring-2 ring-rose-500/30' : ''
            }`}
            style={{
              backgroundColor: block.customBgColor || undefined,
              color: block.customTextColor || undefined
            }}
          >
            {/* Background image overlay if style is custom_image */}
            {block.bgStyle === 'custom_image' && block.imageUrl && (
              <>
                <img
                  src={block.imageUrl}
                  alt={block.title}
                  className="absolute inset-0 w-full h-full object-cover opacity-20 pointer-events-none"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-slate-950/70 to-transparent pointer-events-none" />
              </>
            )}

            {/* Admin Controls on block */}
            {isAdminUnlocked && (
              <div className="absolute top-3 right-3 z-20 flex items-center gap-2 bg-slate-950/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 text-xs">
                {isUnpublished && (
                  <span className="flex items-center gap-1 text-rose-400 font-bold text-[10px] uppercase tracking-wider">
                    <EyeOff className="w-3 h-3" />
                    Hidden (Draft)
                  </span>
                )}
                {(Boolean(onEditBlock) || Boolean(setCustomBlockToEdit)) && (
                  <button
                    onClick={() => {
                      if (onEditBlock) {
                        onEditBlock(block);
                      } else {
                        setCustomBlockToEdit(block);
                        setIsCustomBlockModalOpen(true);
                      }
                    }}
                    className="text-amber-400 hover:text-amber-300 p-1 hover:bg-white/10 rounded cursor-pointer"
                    title="Edit Div / Block Content"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={() => deleteCustomBlock(block.id)}
                  className="text-rose-400 hover:text-rose-300 p-1 hover:bg-white/10 rounded cursor-pointer"
                  title="Delete Custom Block"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="space-y-3 max-w-2xl">
                {block.badge && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-[#b89753]/20 text-[#d4af37] border border-[#b89753]/30">
                    <Sparkles className="w-3 h-3" />
                    {block.badge}
                  </span>
                )}

                <h3 className="text-xl sm:text-2xl font-bold tracking-tight font-sans">
                  {block.title}
                </h3>

                {block.subtitle && (
                  <p className="text-sm font-medium text-slate-300">
                    {block.subtitle}
                  </p>
                )}

                {block.content && (
                  <p className="text-xs sm:text-sm text-slate-400 leading-relaxed font-light whitespace-pre-line">
                    {block.content}
                  </p>
                )}
              </div>

              {(block.buttonText || block.buttonTextArabic) && (
                <div className="flex-shrink-0">
                  <button
                    onClick={() => handleAction(block.buttonUrl)}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-[#b89753] to-[#8c6d2d] hover:from-[#c5a059] hover:to-[#9e7b34] text-white font-bold text-xs uppercase tracking-wider shadow-md hover:shadow-lg transition-all cursor-pointer transform hover:-translate-y-0.5 active:translate-y-0"
                  >
                    <span>{language === 'ar' ? (block.buttonTextArabic || block.buttonText) : (block.buttonText || block.buttonTextArabic)}</span>
                    <ArrowRight className={`w-4 h-4 ${language === 'ar' ? 'rotate-180' : ''}`} />
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
