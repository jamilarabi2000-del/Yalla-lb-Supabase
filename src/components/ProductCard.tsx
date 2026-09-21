import React from 'react';
import { Product } from '../types';
import { useShop } from '../context/ShopContext';
import { Heart, ShoppingBag, Trash2, Eye } from 'lucide-react';

interface ProductCardProps {
  product: Product;
  showRemoveButton?: boolean;
  onRemove?: () => void;
  isFavoriteView?: boolean;
}

const ProductCardComponent: React.FC<ProductCardProps> = ({ product, showRemoveButton, onRemove }) => {
  const { openProductDetail, setSelectedProductForModal, addToCart, language, t, toggleWishlist, removeFromWishlist, isInWishlist } = useShop();
  const isLiked = isInWishlist(product.id);
  const instanceId = React.useId();
  const displayTitle = language === 'ar' ? (product.arabicName || product.name) : product.name;
  const currentPrice = Number(product.priceUSD || 0);
  const originalPrice = Number(product.originalPriceUSD || 0);
  const discountPercentage = Number(product.discountPercentage || (originalPrice > currentPrice ? Math.round((1 - currentPrice / originalPrice) * 100) : 0));
  const hasDiscount = originalPrice > currentPrice && discountPercentage > 0;

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (showRemoveButton && onRemove) onRemove();
    else if (showRemoveButton) removeFromWishlist(product.id);
    else toggleWishlist(product.id);
  };
  const handleRemoveClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onRemove) onRemove(); else removeFromWishlist(product.id);
  };
  const handleQuickAdd = (e: React.MouseEvent) => { e.stopPropagation(); addToCart(product, 1); };
  const handleQuickView = (e: React.MouseEvent) => { e.stopPropagation(); setSelectedProductForModal(product); };

  return (
    <div id={`product-card-${product.id}-${instanceId}`} onClick={() => openProductDetail(product)} className="group relative flex h-full w-full flex-col overflow-hidden rounded-xl border border-[#E5E5E5] bg-white shadow-2xs transition-all duration-300 hover:border-[#B89753]/60 hover:shadow-lg cursor-pointer">
      <div className="relative flex aspect-square w-full items-center justify-center overflow-hidden bg-[#F8F8F6] p-3">
        <img src={product.image} alt={displayTitle} className="h-full w-full object-contain object-center transition-transform duration-300 ease-out group-hover:scale-105" loading="lazy" />
        <div className="pointer-events-none absolute left-2.5 top-2.5 z-10 flex flex-col gap-1">
          {product.stock === 0 ? <span className="rounded-md bg-rose-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">{language === 'ar' ? 'غير متوفر' : 'Out of Stock'}</span> : product.stock <= (product.lowStockThreshold ?? 5) ? <span className="rounded-md bg-amber-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">{product.lowStockNotice || (product.stock === 1 ? (language === 'ar' ? 'القطعة الأخيرة' : 'Last piece') : (language === 'ar' ? 'كمية محدودة' : 'Limited Stock'))}</span> : null}
          {hasDiscount && <span className="rounded-md bg-[#C62828] px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">-{discountPercentage}%</span>}
          {product.isBestseller && !hasDiscount && product.stock > 0 && <span className="rounded-md bg-[#16803C] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">{t('bestseller')}</span>}
        </div>
        <button type="button" onClick={handleQuickView} aria-label={language === 'ar' ? 'نظرة سريعة' : 'Quick View'} className="absolute bottom-2.5 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-[#E5E5E5] bg-white/95 px-3 py-1.5 text-[11px] font-bold text-[#171717] opacity-0 shadow-md transition-all duration-200 group-hover:opacity-100 hover:text-[#8F7137]">
          <Eye className="h-3.5 w-3.5" /><span>{language === 'ar' ? 'نظرة سريعة' : 'Quick View'}</span>
        </button>
        <button type="button" onClick={showRemoveButton ? handleRemoveClick : handleFavoriteClick} aria-label={showRemoveButton ? (language === 'ar' ? 'إزالة من المفضلة' : 'Remove from favorites') : (isLiked ? 'Remove from favorites' : 'Add to favorites')} className={`absolute right-2.5 top-2.5 z-20 flex h-8 w-8 items-center justify-center rounded-full border transition-all duration-200 hover:scale-110 ${isLiked ? 'border-rose-200 bg-rose-50 text-rose-600' : 'border-[#E5E5E5] bg-white/95 text-slate-500 hover:bg-white hover:text-rose-600'}`}>
          {showRemoveButton ? <Trash2 className="h-3.5 w-3.5" /> : <Heart className={`h-3.5 w-3.5 ${isLiked ? 'fill-rose-600 text-rose-600' : ''}`} />}
        </button>
      </div>
      <div className="flex flex-1 flex-col justify-between space-y-2.5 bg-white p-3.5 sm:p-4">
        <div><span className="mb-0.5 block line-clamp-1 text-[10px] font-bold uppercase tracking-wider text-[#8F7137]">{product.category}</span><h3 className="line-clamp-2 text-xs font-bold leading-snug text-[#171717] transition-colors group-hover:text-[#8F7137] sm:text-sm">{displayTitle}</h3></div>
        <div className="mt-auto flex flex-col gap-2 border-t border-[#E5E5E5] pt-2">
          <div className="flex items-baseline gap-1.5"><span className="text-sm font-black tracking-tight text-[#171717] sm:text-base">${currentPrice.toFixed(2)}</span>{hasDiscount && <span className="text-xs font-medium text-slate-400 line-through">${originalPrice.toFixed(2)}</span>}</div>
          <div className="flex w-full items-center gap-1.5">
            {showRemoveButton && <button type="button" onClick={handleRemoveClick} aria-label={language === 'ar' ? 'إزالة' : 'Remove'} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#E5E5E5] bg-slate-100 text-slate-500 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>}
            <button type="button" onClick={handleQuickAdd} disabled={product.stock <= 0} aria-label={language === 'ar' ? 'أضف للسلة' : 'Add To Cart'} className="flex w-full flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#171717] px-3 py-2 text-center text-xs font-bold text-white transition-all hover:bg-[#8F7137] disabled:opacity-40"><ShoppingBag className="h-3.5 w-3.5 shrink-0" /><span className="whitespace-nowrap">{language === 'ar' ? 'أضف للسلة' : 'Add To Cart'}</span></button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const ProductCard = React.memo(ProductCardComponent);
