import React from 'react';
import { useShop } from '../context/ShopContext';
import { ProductCard } from './ProductCard';
import { Heart, ArrowLeft, ArrowRight, ShoppingBag, Sparkles, Trash2, ShoppingCart } from 'lucide-react';

export const FavoritesView: React.FC = () => {
  const { wishlist, products, setActiveTab, clearWishlist, removeFromWishlist, addMultipleToCart, showToast, language } = useShop();

  const isArabic = language === 'ar';
  const BackIcon = isArabic ? ArrowRight : ArrowLeft;

  // Deduplicate and filter products matching wishlist IDs
  const uniqueWishlistIds = Array.from(new Set(wishlist));
  const favoriteProducts = products.filter(p => uniqueWishlistIds.includes(p.id));

  const handleClearFavorites = () => {
    if (wishlist.length === 0) return;
    clearWishlist();
    showToast(
      isArabic ? 'تم إفراغ قائمة المفضلة' : 'Wishlist cleared',
      'info'
    );
  };

  const handleAddAllToCart = () => {
    const inStockItems = favoriteProducts.filter(p => p.stock > 0);
    if (inStockItems.length === 0) {
      showToast(
        isArabic ? 'جميع المنتجات المفضلة غير متوفرة حالياً' : 'None of the favorited items are currently in stock.',
        'warning'
      );
      return;
    }

    addMultipleToCart(inStockItems.map(p => ({ product: p, quantity: 1 })));

    showToast(
      isArabic 
        ? `تمت إضافة ${inStockItems.length} منتج إلى حقيبة التسوق` 
        : `Added ${inStockItems.length} item${inStockItems.length > 1 ? 's' : ''} to your basket!`,
      'success'
    );
  };

  return (
    <div className="min-h-screen bg-[#F8F8F6] pb-20 pt-4 sm:pt-6">
      {/* Header Banner */}
      <div className="bg-white border-b border-[#E5E5E5]">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          
          {/* Breadcrumb / Back Link */}
          <button
            onClick={() => setActiveTab('products')}
            className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#737373] hover:text-[#171717] transition-colors mb-6 cursor-pointer"
          >
            <BackIcon className="w-4 h-4" />
            <span>{isArabic ? 'العودة إلى كل المنتجات' : 'Continue Shopping'}</span>
          </button>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-500 shadow-2xs">
                  <Heart className="w-6 h-6 fill-rose-500" />
                </div>
                <div>
                  <h1 className="text-2xl sm:text-3xl font-serif font-bold text-[#171717]">
                    {isArabic ? 'المفضلة والمحفوظات' : 'My Saved Favorites'}
                  </h1>
                  <p className="text-xs sm:text-sm text-[#737373] mt-1 font-medium">
                    {isArabic 
                      ? 'القطع الحرفية اللبنانية المختارة التي حفظتها للرجوع إليها لاحقاً' 
                      : 'Handcrafted Lebanese treasures and artisan pieces you have saved'}
                  </p>
                </div>
              </div>
            </div>

            {/* Quick Action Buttons if Favorites exist */}
            {favoriteProducts.length > 0 && (
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={handleClearFavorites}
                  className="px-4 py-2.5 rounded-lg border border-[#E5E5E5] bg-white hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 text-[#737373] text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer shadow-2xs"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{isArabic ? 'إفراغ المفضلة' : 'Clear All'}</span>
                </button>

                <button
                  onClick={handleAddAllToCart}
                  className="px-5 py-2.5 rounded-lg bg-[#171717] hover:bg-black text-white text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer shadow-sm hover:shadow-md"
                >
                  <ShoppingCart className="w-3.5 h-3.5 text-[#B89753]" />
                  <span>{isArabic ? 'إضافة الكل إلى الحقيبة' : 'Add All to Cart'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        {favoriteProducts.length === 0 ? (
          /* Empty Wishlist State */
          <div className="bg-white rounded-2xl p-10 sm:p-14 text-center border border-[#E5E5E5] shadow-sm max-w-lg mx-auto space-y-6 my-8">
            <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center mx-auto border border-rose-100">
              <Heart className="w-8 h-8" />
            </div>
            
            <div className="space-y-2">
              <h2 className="text-xl sm:text-2xl font-serif font-bold text-[#171717]">
                {isArabic ? 'قائمة المفضلة فارغة حالياً' : 'Your Favorites List is Empty'}
              </h2>
              <p className="text-xs sm:text-sm text-[#737373] leading-relaxed max-w-md mx-auto">
                {isArabic 
                  ? 'لم تقم بحفظ أي منتج بعد. تصفح مجموعتنا الحرفية من الصابون، زيت الزيتون، النحاسيات، والمونة اللبنانية وانقر على رمز القلب لحفظها هنا.'
                  : 'You have not saved any artisan creations yet. Explore our handcrafted olive oils, brassware, soaps, and pantry items to save your favorites.'}
              </p>
            </div>

            <div className="pt-2">
              <button
                onClick={() => setActiveTab('products')}
                className="inline-flex items-center gap-2 px-7 py-3 bg-[#171717] hover:bg-black text-white font-bold text-xs uppercase tracking-wider rounded-lg transition-all shadow-sm cursor-pointer hover:shadow-md"
              >
                <ShoppingBag className="w-4 h-4 text-[#B89753]" />
                <span>{isArabic ? 'تصفح السوق اللبناني' : 'Explore Lebanese Marketplace'}</span>
              </button>
            </div>

            <div className="pt-4 border-t border-[#E5E5E5] flex items-center justify-center gap-6 text-[11px] text-[#737373]">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#B89753]" />
                <span>{isArabic ? '100% حرفي وأصيل' : '100% Authentic Lebanese'}</span>
              </span>
              <span>•</span>
              <span>{isArabic ? 'توصيل لجميع المناطق' : 'All-Lebanon Delivery'}</span>
            </div>
          </div>
        ) : (
          /* Favorites Grid */
          <div className="space-y-6">
            <div className="flex items-center justify-between pb-2 border-b border-[#E5E5E5]">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[#171717]">
                {isArabic ? 'المنتجات المحفوظة' : 'Saved Items'} ({favoriteProducts.length})
              </h2>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4 md:gap-5">
              {favoriteProducts.map(product => (
                <ProductCard 
                  key={product.id} 
                  product={product} 
                  showRemoveButton={true}
                  isFavoriteView={true}
                  onRemove={() => removeFromWishlist(product.id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
