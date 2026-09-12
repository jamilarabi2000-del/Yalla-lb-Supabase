import React, { useState } from 'react';
import { useShop } from '../context/ShopContext';
import { useDialog } from '../hooks/useDialog';
import { 
  X, 
  Heart, 
  ShoppingBag, 
  MapPin, 
  ShieldCheck, 
  Check,
  Plus,
  Minus,
  ArrowRight,
  ExternalLink
} from 'lucide-react';

export const ProductModal: React.FC = () => {
  const { 
    selectedProductForModal, 
    setSelectedProductForModal, 
    openProductDetail,
    formatPrice, 
    addToCart, 
    toggleWishlist, 
    isInWishlist,
    showToast,
    language,
    t
  } = useShop();

  const [quantity, setQuantity] = useState(1);

  const { containerRef } = useDialog({
    isOpen: !!selectedProductForModal,
    onClose: () => setSelectedProductForModal(null)
  });

  if (!selectedProductForModal) return null;

  const product = selectedProductForModal;
  const isLiked = isInWishlist(product.id);
  const displayTitle = language === 'ar' ? (product.arabicName || product.name) : product.name;

  const handleAddMultipleToCart = () => {
    addToCart(product, quantity);
    setSelectedProductForModal(null);
    showToast(
      language === 'ar' ? `تمت إضافة ${quantity} إلى سلتك!` : `Added ${quantity} to your basket!`,
      'success'
    );
  };

  const handleViewFullPage = () => {
    setSelectedProductForModal(null);
    openProductDetail(product);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-fadeIn">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity cursor-pointer"
        onClick={() => setSelectedProductForModal(null)}
      />

      {/* Modal Dialog Content */}
      <div 
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className="relative w-full max-w-2xl rounded-2xl bg-white border border-[#E5E5E5] overflow-hidden shadow-2xl z-10 my-8 focus:outline-hidden"
      >
        {/* Close Button */}
        <button
          id="close-product-modal-btn"
          onClick={() => setSelectedProductForModal(null)}
          className="absolute top-3.5 right-3.5 z-20 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer flex items-center justify-center"
          aria-label="Close modal"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="grid grid-cols-1 md:grid-cols-12">
          {/* Left: Product Image */}
          <div className="md:col-span-5 relative bg-[#F8F8F6] min-h-[240px] md:min-h-full flex items-center justify-center p-6 border-b md:border-b-0 md:border-r border-[#E5E5E5]">
            <img
              src={product.image}
              alt={displayTitle}
              className="w-full h-full object-contain max-h-[260px] drop-shadow-xs"
              loading="lazy"
            />
            {product.origin && (
              <div className="absolute bottom-3 left-3 right-3 py-1.5 px-2.5 rounded-lg bg-white/90 backdrop-blur-xs border border-[#E5E5E5] text-center flex items-center justify-center gap-1 text-[11px] font-semibold text-slate-700">
                <MapPin className="w-3 h-3 text-[#B89753] shrink-0" />
                <span className="truncate">{product.origin}</span>
              </div>
            )}
          </div>

          {/* Right: Quick Overview, Price, Actions */}
          <div className="md:col-span-7 p-6 flex flex-col justify-between space-y-4">
            <div className="space-y-2.5">
              <div className="pr-8">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#8F7137] block mb-0.5">
                  {product.category}
                </span>
                <h2 className="text-base sm:text-lg font-bold text-[#171717] leading-snug line-clamp-2">
                  {displayTitle}
                </h2>
                <p className="text-xs text-[#737373] mt-0.5">
                  <span>{language === 'ar' ? 'البائع:' : 'Seller:'}</span>{' '}
                  <span className="font-semibold text-slate-800">
                    {product.artisan.startsWith('Seller:') ? product.artisan.replace('Seller:', '').trim() : product.artisan}
                  </span>
                </p>
              </div>

              {/* Price & Stock */}
              <div className="flex items-baseline gap-2 flex-wrap pt-1">
                <span className="text-xl font-black text-[#171717]">
                  {formatPrice(product.priceUSD * quantity)}
                </span>
                {product.originalPriceUSD && (
                  <span className="text-xs text-slate-400 line-through font-medium">
                    {formatPrice(product.originalPriceUSD * quantity)}
                  </span>
                )}
                {product.stock > 0 ? (
                  <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                    {language === 'ar' ? 'متوفر' : 'In Stock'}
                  </span>
                ) : (
                  <span className="text-[11px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                    {language === 'ar' ? 'نفد المخزون' : 'Out of stock'}
                  </span>
                )}
              </div>

              {/* Short Description */}
              <p className="text-xs text-[#737373] leading-relaxed line-clamp-3">
                {product.description}
              </p>

              {/* View Full Product Page Link */}
              <button
                type="button"
                onClick={handleViewFullPage}
                className="inline-flex items-center gap-1 text-xs font-bold text-[#8F7137] hover:text-[#B89753] hover:underline cursor-pointer transition-colors"
              >
                <span>{language === 'ar' ? 'عرض تفاصيل المنتج كاملة' : 'View full product details'}</span>
                <ArrowRight className={`w-3.5 h-3.5 ${language === 'ar' ? 'rotate-180' : ''}`} />
              </button>
            </div>

            {/* Actions: Quantity + Add to Cart + Wishlist */}
            <div className="pt-3 border-t border-[#E5E5E5] space-y-3">
              <div className="flex items-center gap-3">
                {/* Quantity Controls */}
                <div className="flex items-center gap-1.5 bg-[#F8F8F6] border border-[#E5E5E5] rounded-lg p-1">
                  <button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="w-7 h-7 flex items-center justify-center rounded-md text-slate-700 hover:text-black hover:bg-white cursor-pointer transition-all"
                    aria-label="Decrease quantity"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-xs font-bold text-slate-900 px-2 min-w-[20px] text-center">
                    {quantity}
                  </span>
                  <button
                    onClick={() => setQuantity(quantity + 1)}
                    className="w-7 h-7 flex items-center justify-center rounded-md text-slate-700 hover:text-black hover:bg-white cursor-pointer transition-all"
                    aria-label="Increase quantity"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Wishlist Button */}
                <button
                  onClick={() => toggleWishlist(product.id)}
                  className={`p-2.5 rounded-lg border transition-all cursor-pointer ${
                    isLiked 
                      ? 'bg-rose-50 border-rose-200 text-rose-600' 
                      : 'border-[#E5E5E5] text-slate-600 hover:text-rose-600 hover:bg-white'
                  }`}
                  title={isLiked ? 'Remove from wishlist' : 'Save to wishlist'}
                >
                  <Heart className={`w-4 h-4 ${isLiked ? 'fill-current' : ''}`} />
                </button>

                {/* Add to Cart CTA */}
                <button
                  id="modal-add-to-cart-btn"
                  onClick={handleAddMultipleToCart}
                  disabled={product.stock <= 0}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-[#171717] hover:bg-[#8F7137] disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-xs active:scale-[0.98]"
                >
                  <ShoppingBag className="w-3.5 h-3.5" />
                  <span>{t('addToCart')}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

