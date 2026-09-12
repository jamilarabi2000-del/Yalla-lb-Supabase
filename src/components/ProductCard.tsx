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

const ProductCardComponent: React.FC<ProductCardProps> = ({ product, showRemoveButton, onRemove, isFavoriteView }) => {
  const { 
    formatPrice, 
    openProductDetail,
    setSelectedProductForModal,
    addToCart,
    language,
    t,
    toggleWishlist,
    removeFromWishlist,
    isInWishlist
  } = useShop();

  const isLiked = isInWishlist(product.id);
  const instanceId = React.useId();

  // One language only in grid card
  const displayTitle = language === 'ar' ? (product.arabicName || product.name) : product.name;

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (showRemoveButton && onRemove) {
      onRemove();
    } else if (showRemoveButton) {
      removeFromWishlist(product.id);
    } else {
      toggleWishlist(product.id);
    }
  };

  const handleRemoveClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onRemove) {
      onRemove();
    } else {
      removeFromWishlist(product.id);
    }
  };

  const handleQuickAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    addToCart(product, 1);
  };

  const handleQuickView = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedProductForModal(product);
  };

  return (
    <div 
      id={`product-card-${product.id}-${instanceId}`}
      onClick={() => openProductDetail(product)}
      className="group relative flex flex-col h-full w-full rounded-xl bg-white border border-[#E5E5E5] hover:border-[#B89753]/60 shadow-2xs hover:shadow-lg transition-all duration-300 overflow-hidden cursor-pointer"
    >
      {/* Image Container */}
      <div 
        className="relative aspect-square w-full overflow-hidden bg-[#F8F8F6] flex items-center justify-center p-3"
      >
        <img
          src={product.image}
          alt={displayTitle}
          className="h-full w-full object-contain object-center group-hover:scale-105 transition-transform duration-300 ease-out"
          loading="lazy"
        />

        {/* Top Left Badges */}
        <div className="absolute top-2.5 left-2.5 flex flex-col gap-1 z-10 pointer-events-none">
          {product.stock === 0 ? (
            <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-rose-600 text-white rounded-md shadow-xs">
              {language === 'ar' ? 'غير متوفر' : 'Out of Stock'}
            </span>
          ) : product.stock <= (product.lowStockThreshold ?? 5) ? (
            <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-amber-600 text-white rounded-md shadow-xs">
              {product.lowStockNotice || (product.stock === 1 ? (language === 'ar' ? 'القطعة الأخيرة' : 'Last piece') : (language === 'ar' ? 'كمية محدودة' : 'Limited Stock'))}
            </span>
          ) : null}
          {product.discountPercentage && (
            <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-[#C62828] text-white rounded-md shadow-xs">
              -{product.discountPercentage}%
            </span>
          )}
          {product.isBestseller && !product.discountPercentage && product.stock > 0 && (
            <span className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-[#16803C] text-white rounded-md shadow-xs">
              {t('bestseller')}
            </span>
          )}
        </div>

        {/* Quick View Button on Hover */}
        <button
          type="button"
          onClick={handleQuickView}
          aria-label={language === 'ar' ? "نظرة سريعة" : "Quick View"}
          title={language === 'ar' ? "نظرة سريعة" : "Quick View"}
          className="absolute bottom-2.5 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-all duration-200 z-20 py-1.5 px-3 rounded-lg bg-white/95 backdrop-blur-xs text-[#171717] hover:text-[#8F7137] text-[11px] font-bold shadow-md border border-[#E5E5E5] flex items-center gap-1 cursor-pointer whitespace-nowrap"
        >
          <Eye className="w-3.5 h-3.5" />
          <span>{language === 'ar' ? 'نظرة سريعة' : 'Quick View'}</span>
        </button>

        {/* Favorite / Wishlist or Remove Button */}
        {showRemoveButton ? (
          <button
            type="button"
            id={`remove-favorite-btn-${product.id}-${instanceId}`}
            onClick={handleRemoveClick}
            aria-label={language === 'ar' ? "إزالة من المفضلة" : "Remove from favorites"}
            title={language === 'ar' ? "إزالة من المفضلة" : "Remove from favorites"}
            className="absolute top-2.5 right-2.5 z-20 w-8 h-8 rounded-full bg-white/95 backdrop-blur-xs text-slate-500 hover:text-rose-600 hover:bg-rose-50 border border-[#E5E5E5] flex items-center justify-center transition-all duration-200 shadow-2xs cursor-pointer hover:scale-110 hover:border-rose-200"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        ) : (
          <button
            type="button"
            id={`favorite-btn-${product.id}-${instanceId}`}
            onClick={handleFavoriteClick}
            aria-label={isLiked ? "Remove from favorites" : "Add to favorites"}
            title={isLiked ? "Remove from favorites" : "Add to favorites"}
            className={`absolute top-2.5 right-2.5 z-20 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 shadow-2xs cursor-pointer ${
              isLiked 
                ? 'bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100 hover:scale-110' 
                : 'bg-white/90 backdrop-blur-xs text-slate-500 hover:text-rose-600 hover:bg-white hover:scale-110 border border-[#E5E5E5]'
            }`}
          >
            <Heart className={`w-3.5 h-3.5 transition-transform duration-200 ${isLiked ? 'fill-rose-600 text-rose-600 scale-110' : ''}`} />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col p-3.5 sm:p-4 justify-between space-y-2.5 bg-white">
        <div>
          {/* Subtle Category or Origin */}
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#8F7137] line-clamp-1 block mb-0.5">
            {product.category}
          </span>
          {/* Title - ONE LANGUAGE ONLY */}
          <h3 
            className="text-xs sm:text-sm font-bold text-[#171717] group-hover:text-[#8F7137] transition-colors line-clamp-2 leading-snug"
          >
            {displayTitle}
          </h3>
        </div>

        {/* Price Row & Quick Add / Remove Action */}
        <div className="pt-2 border-t border-[#E5E5E5] mt-auto flex flex-col gap-2">
          {/* Price */}
          <div className="flex items-baseline justify-between gap-1.5">
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <span className="text-sm sm:text-base font-black text-[#171717] tracking-tight">
                {formatPrice(product.priceUSD)}
              </span>
              {product.originalPriceUSD && (
                <span className="text-xs text-slate-400 line-through font-medium">
                  {formatPrice(product.originalPriceUSD)}
                </span>
              )}
            </div>
          </div>

          {/* Add To Cart Action */}
          <div className="flex items-center gap-1.5 w-full">
            {showRemoveButton && (
              <button
                type="button"
                id={`remove-action-btn-${product.id}-${instanceId}`}
                onClick={handleRemoveClick}
                aria-label={language === 'ar' ? 'إزالة' : 'Remove'}
                title={language === 'ar' ? 'إزالة من المفضلة' : 'Remove from favorites'}
                className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-rose-50 text-slate-500 hover:text-rose-600 flex items-center justify-center transition-colors cursor-pointer border border-[#E5E5E5] shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              type="button"
              id={`quick-add-btn-${product.id}-${instanceId}`}
              onClick={handleQuickAdd}
              disabled={product.stock <= 0}
              aria-label={language === 'ar' ? 'أضف للسلة' : 'Add To Cart'}
              title={language === 'ar' ? 'أضف للسلة' : 'Add To Cart'}
              className="flex-1 w-full py-2 px-3 rounded-lg bg-[#171717] hover:bg-[#8F7137] disabled:opacity-40 text-white flex items-center justify-center gap-1.5 transition-all duration-200 cursor-pointer shadow-2xs active:scale-[0.98] text-xs font-bold text-center"
            >
              <ShoppingBag className="w-3.5 h-3.5 shrink-0" />
              <span className="whitespace-nowrap">{language === 'ar' ? 'أضف للسلة' : 'Add To Cart'}</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export const ProductCard = React.memo(ProductCardComponent);


