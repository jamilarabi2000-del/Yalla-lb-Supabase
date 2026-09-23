import React, { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, ShoppingBag, Heart, Truck, Minus, Plus, ShieldCheck, PackageCheck, Share2, Sparkles } from 'lucide-react';
import { useShop } from '../context/ShopContext';
import { ProductCard } from './ProductCard';
import { ProductReviews } from './ProductReviews';

export const ProductDetailView: React.FC = () => {
  const shop = useShop() as any;
  const p = shop.selectedProductDetail as any;
  const [qty, setQty] = useState(1);
  const [activeImage, setActiveImage] = useState(0);

  const visibility = shop.siteContent?.visibility || {
    detailBreadcrumbs: true, detailGallery: true, detailPriceBox: true, detailArtisanBio: true,
    detailCraftStory: true, detailWhatsAppInquiry: true, detailCustomerReviews: true, detailRelatedProducts: true,
  };
  const isVisualEditMode = !!shop.isVisualEditMode;
  const language = shop.language === 'ar' ? 'ar' : 'en';
  const isRTL = language === 'ar';

  const images = useMemo(() => {
    if (!p) return [];
    const source = Array.isArray(p.images) ? p.images : [];
    return Array.from(new Set([p.image, ...source].filter(Boolean)));
  }, [p]);

  const related = useMemo(() => ((shop.products || []) as any[])
    .filter((x) => x.id !== p?.id && x.category === p?.category && x.isPublished !== false)
    .slice(0, 8), [shop.products, p]);

  if (!p) {
    return <section className="min-h-[60vh] flex items-center justify-center px-4"><div className="rounded-3xl border border-[#E5E5E5] bg-white px-8 py-12 text-center shadow-sm"><p className="font-bold text-[#171717]">{isRTL ? 'المنتج غير موجود' : 'Product not found.'}</p></div></section>;
  }

  const show = (key: string) => visibility[key] || isVisualEditMode;
  const displayName = isRTL ? p.arabicName || p.name : p.name;
  const price = shop.formatPrice?.(p.priceUSD) || '$' + p.priceUSD;
  const originalPrice = p.originalPriceUSD ? (shop.formatPrice?.(p.originalPriceUSD) || '$' + p.originalPriceUSD) : null;
  const inStock = Number(p.stock || 0) > 0;
  const maxQty = Math.max(1, Number(p.stock || 1));
  const discount = p.discountPercentage || (p.originalPriceUSD && p.priceUSD < p.originalPriceUSD ? Math.round((1 - p.priceUSD / p.originalPriceUSD) * 100) : 0);

  const add = () => {
    if (!inStock) return;
    if (typeof shop.addToCart === 'function') shop.addToCart(p, qty);
    else if (typeof shop.addToCartItem === 'function') shop.addToCartItem({ product: p, quantity: qty });
    shop.showToast?.(isRTL ? 'تمت الإضافة إلى السلة' : 'Added to cart', 'success');
  };

  const toggleWishlist = () => {
    if (typeof shop.toggleWishlist === 'function') shop.toggleWishlist(p.id);
  };

  return (
    <main data-cms-element="product-detail" dir={isRTL ? 'rtl' : 'ltr'} className="bg-[#F7F7F8]">
      <section className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-8">
        {show('detailBreadcrumbs') && (
          <div className="flex items-center justify-between gap-3 mb-6">
            <button type="button" onClick={() => shop.goBack?.()} className="inline-flex items-center gap-2 rounded-full border border-[#E5E5E5] bg-white/80 backdrop-blur px-3.5 py-2 text-xs sm:text-sm font-bold text-[#171717] hover:text-[#8F7137] hover:border-[#B89753]/50 shadow-sm transition-all cursor-pointer">
              {isRTL ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
              {isRTL ? 'العودة' : 'Back'}
            </button>
            <div className="hidden sm:flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] font-bold text-[#8F7137]"><Sparkles className="w-3.5 h-3.5" />{isRTL ? 'تفاصيل المنتج' : 'Product Details'}</div>
          </div>
        )}

        <div className="grid lg:grid-cols-[minmax(0,1.08fr)_minmax(380px,0.92fr)] gap-6 lg:gap-10 xl:gap-14 items-start">
          {show('detailGallery') && (
            <div className={`relative rounded-[28px] border border-white/80 bg-white/70 backdrop-blur-xl p-2 sm:p-3 shadow-[0_20px_60px_rgba(23,23,23,0.07)] ${!visibility.detailGallery && isVisualEditMode ? 'ring-2 ring-dashed ring-rose-500' : ''}`}>
              <div className="relative aspect-square rounded-[22px] overflow-hidden bg-[#F8F8F6] flex items-center justify-center">
                {images[activeImage] ? <img src={images[activeImage]} alt={displayName} className="h-full w-full object-contain p-5 sm:p-8 transition-opacity duration-300" /> : <div className="text-sm text-[#737373]">{isRTL ? 'لا توجد صورة' : 'No image'}</div>}
                <div className="absolute top-4 left-4 flex flex-col gap-1.5">
                  {discount > 0 && <span className="rounded-full bg-[#C62828] px-3 py-1 text-[10px] font-black text-white shadow-sm">-{discount}%</span>}
                  {p.isBestseller && !discount && inStock && <span className="rounded-full bg-[#171717] px-3 py-1 text-[10px] font-bold text-white shadow-sm">{isRTL ? 'الأكثر مبيعاً' : 'Bestseller'}</span>}
                </div>
                <button type="button" onClick={toggleWishlist} aria-label={isRTL ? 'إضافة للمفضلة' : 'Add to wishlist'} className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/90 backdrop-blur border border-[#E5E5E5] flex items-center justify-center text-slate-500 hover:text-rose-600 hover:scale-105 transition-all shadow-sm cursor-pointer"><Heart className="w-5 h-5" /></button>
              </div>
              {images.length > 1 && (
                <div className="mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                  {images.map((src: string, index: number) => <button type="button" key={src + '-' + index} onClick={() => setActiveImage(index)} className={`h-16 w-16 sm:h-20 sm:w-20 shrink-0 rounded-xl overflow-hidden border bg-white transition-all cursor-pointer ${activeImage === index ? 'border-[#B89753] ring-2 ring-[#B89753]/20' : 'border-[#E5E5E5] hover:border-[#B89753]/50'}`} aria-label={'View image ' + (index + 1)}><img src={src} alt="" className="h-full w-full object-contain p-1.5" loading="lazy" /></button>)}
                </div>
              )}
            </div>
          )}

          {show('detailPriceBox') && (
            <div className={`lg:sticky lg:top-24 ${!visibility.detailPriceBox && isVisualEditMode ? 'ring-2 ring-dashed ring-rose-500 rounded-[28px] p-4' : ''}`}>
              <div className="rounded-[28px] border border-[#E5E5E5] bg-white p-5 sm:p-7 shadow-[0_16px_45px_rgba(23,23,23,0.06)]">
                {(p.brand || p.seller || p.artisan) && <p className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.2em] text-[#8F7137] mb-2">{p.brand || p.seller || p.artisan}</p>}
                <h1 className="text-2xl sm:text-3xl xl:text-4xl font-serif font-semibold tracking-tight text-[#171717] leading-tight">{displayName}</h1>
                {!isRTL && p.arabicName && <p className="mt-1 text-sm text-[#737373]" dir="rtl">{p.arabicName}</p>}
                {p.description && <p className="text-sm leading-7 text-[#666666] mt-5">{p.description}</p>}

                {show('detailCraftStory') && p.craftStory && (
                  <div className={`mt-5 rounded-2xl border border-[#E5E5E5] bg-[#F8F8F6] p-4 ${!visibility.detailCraftStory && isVisualEditMode ? 'ring-2 ring-dashed ring-rose-500' : ''}`}>
                    <div className="flex items-center gap-2 mb-1.5"><span className="h-7 w-7 rounded-lg bg-amber-50 border border-amber-200/60 text-[#8F7137] flex items-center justify-center"><Sparkles className="w-3.5 h-3.5" /></span><b className="text-xs uppercase tracking-wider text-[#171717]">{isRTL ? 'القصة' : 'The Story'}</b></div>
                    <p className="text-xs sm:text-sm leading-6 text-[#666666]">{p.craftStory}</p>
                  </div>
                )}

                <div className="flex flex-wrap items-end gap-3 mt-6">
                  <span className="text-3xl sm:text-4xl font-black tracking-tight text-[#171717]">{price}</span>
                  {originalPrice && <span className="text-sm sm:text-base text-[#999999] line-through pb-1">{originalPrice}</span>}
                  {discount > 0 && <span className="rounded-full bg-rose-50 border border-rose-100 px-2.5 py-1 text-[10px] font-black text-[#C62828]">{isRTL ? 'خصم ' + discount + '%' : discount + '% OFF'}</span>}
                </div>

                <div className="flex items-center gap-2 mt-3 mb-6">
                  <span className={`status-dot ${!inStock ? 'opacity-40' : ''}`} />
                  <span className="text-xs font-bold text-[#171717]">{inStock ? (isRTL ? 'متوفر • ' + p.stock + ' قطعة' : 'In stock • ' + p.stock + ' available') : (isRTL ? 'غير متوفر حالياً' : 'Currently unavailable')}</span>
                </div>

                <div className="flex gap-2.5 mb-5">
                  <div className="h-12 flex items-center rounded-xl border border-[#E5E5E5] bg-[#F8F8F6] overflow-hidden shrink-0">
                    <button type="button" onClick={() => setQty(v => Math.max(1, v - 1))} className="w-11 h-full flex items-center justify-center hover:bg-white cursor-pointer"><Minus className="w-4 h-4" /></button>
                    <span className="w-9 text-center text-sm font-black">{qty}</span>
                    <button type="button" onClick={() => setQty(v => Math.min(maxQty, v + 1))} className="w-11 h-full flex items-center justify-center hover:bg-white cursor-pointer"><Plus className="w-4 h-4" /></button>
                  </div>
                  <button type="button" disabled={!inStock} onClick={add} className="gold-btn flex-1 min-w-0 h-12 rounded-xl flex items-center justify-center gap-2 px-4 text-sm font-black shadow-sm disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"><ShoppingBag className="w-5 h-5" />{isRTL ? 'أضف إلى السلة' : 'Add to Cart'}</button>
                  <button type="button" onClick={toggleWishlist} aria-label={isRTL ? 'المفضلة' : 'Wishlist'} className="h-12 w-12 shrink-0 rounded-xl border border-[#E5E5E5] bg-white flex items-center justify-center text-slate-600 hover:text-rose-600 hover:border-rose-200 transition-all cursor-pointer"><Heart className="w-5 h-5" /></button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-5 border-t border-[#E5E5E5]">
                  <div className="rounded-xl bg-[#F8F8F6] border border-[#E5E5E5] p-3"><ShieldCheck className="w-4 h-4 text-[#8F7137] mb-2" /><p className="text-[10px] font-bold text-[#171717]">{isRTL ? 'دفع آمن' : 'Secure checkout'}</p></div>
                  <div className="rounded-xl bg-[#F8F8F6] border border-[#E5E5E5] p-3"><Truck className="w-4 h-4 text-[#8F7137] mb-2" /><p className="text-[10px] font-bold text-[#171717]">{isRTL ? 'توصيل موثوق' : 'Tracked delivery'}</p></div>
                  <div className="rounded-xl bg-[#F8F8F6] border border-[#E5E5E5] p-3"><PackageCheck className="w-4 h-4 text-[#8F7137] mb-2" /><p className="text-[10px] font-bold text-[#171717]">{p.sellerItemCode || p.id}</p></div>
                </div>

                {show('detailWhatsAppInquiry') && (
                  <button type="button" onClick={() => { const text = encodeURIComponent(isRTL ? 'مرحباً، أنا مهتم بـ ' + displayName : 'Hello, I\'m interested in ' + displayName); if (p.whatsappNumber) window.open('https://wa.me/' + String(p.whatsappNumber).replace(/\D/g, '') + '?text=' + text, '_blank', 'noopener,noreferrer'); }} className={`mt-3 w-full h-11 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-black flex items-center justify-center gap-2 hover:bg-emerald-100 transition-colors ${!p.whatsappNumber ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`} disabled={!p.whatsappNumber}><Share2 className="w-4 h-4" />{isRTL ? 'استفسر عبر واتساب' : 'Inquire on WhatsApp'}</button>
                )}
              </div>
            </div>
          )}
        </div>

        {show('detailArtisanBio') && (p.artisan || p.artisanBio) && (
          <section className={`mt-8 rounded-[24px] border border-[#E5E5E5] bg-white p-5 sm:p-7 shadow-sm ${!visibility.detailArtisanBio && isVisualEditMode ? 'ring-2 ring-dashed ring-rose-500' : ''}`}>
            <div className="flex items-center gap-3 mb-3"><div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200/60 text-[#8F7137] flex items-center justify-center"><Sparkles className="w-5 h-5" /></div><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#8F7137]">{isRTL ? 'من الصانع' : 'From the Maker'}</p><h2 className="text-lg sm:text-xl font-serif font-semibold text-[#171717]">{p.artisan || p.seller}</h2></div></div>
            {p.artisanBio && <p className="text-sm leading-7 text-[#666666]">{p.artisanBio}</p>}
          </section>
        )}

        {show('detailCustomerReviews') && (
          <ProductReviews
            productId={p.id}
            rating={Number(p.rating || 0)}
            reviewsCount={Number(p.reviewsCount || 0)}
            isRTL={isRTL}
            outlined={!visibility.detailCustomerReviews && isVisualEditMode}
          />
        )}

        {show('detailRelatedProducts') && related.length > 0 && (
          <section className={`mt-12 ${!visibility.detailRelatedProducts && isVisualEditMode ? 'ring-2 ring-dashed ring-rose-500 rounded-2xl p-4' : ''}`}>
            <div className="flex items-end justify-between gap-4 mb-5 sm:mb-7">
              <div><p className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.2em] text-[#8F7137]">{isRTL ? 'قد يعجبك أيضاً' : 'You may also like'}</p><h2 className="text-2xl sm:text-3xl font-serif text-[#171717]">{isRTL ? 'منتجات ذات صلة' : 'Related Products'}</h2></div>
              <div className="hidden sm:flex items-center gap-2 text-[10px] font-bold text-[#737373]">{isRTL ? 'استكشف المزيد' : 'Explore more'}<ArrowLeft className="w-3.5 h-3.5" /></div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4 md:gap-5">{related.map((item) => <ProductCard key={item.id} product={item} />)}</div>
          </section>
        )}
      </section>
    </main>
  );
};

export default ProductDetailView;
