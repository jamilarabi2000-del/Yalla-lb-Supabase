import React, { useState } from 'react';
import { useShop } from '../context/ShopContext';
import { useDialog } from '../hooks/useDialog';
import { FREE_DELIVERY_THRESHOLD_USD } from '../lib/delivery';
import { 
   X, 
   Trash2, 
   Plus, 
   Minus, 
   ShoppingBag, 
   ArrowRight,
   ShieldCheck,
   Tag,
   Check,
   Percent
 } from 'lucide-react';

export const CartDrawer: React.FC = () => {
  const { 
    cart, 
    isCartOpen, 
    setIsCartOpen, 
    updateQuantity, 
    removeFromCart, 
    clearCart,
    cartTotalUSD, 
    discountUSD,
    appliedCouponCode,
    applyCoupon,
    removeCoupon,
    appliedDiscountRules,
    formatPrice, 
    setActiveTab,
    t,
    language
  } = useShop();

  const [couponInput, setCouponInput] = useState('');
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);

  const { containerRef } = useDialog({
    isOpen: isCartOpen,
    onClose: () => setIsCartOpen(false)
  });

  if (!isCartOpen) return null;

  const rawSubtotal = Math.round(cart.reduce((s, i) => s + i.product.priceUSD * i.quantity, 0) * 100) / 100;

  const handleApplyCoupon = (e: React.FormEvent) => {
    e.preventDefault();
    if (!couponInput.trim()) return;
    setIsApplyingCoupon(true);
    applyCoupon(couponInput);
    setIsApplyingCoupon(false);
    setCouponInput('');
  };

  return (
    <div 
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="cart-drawer-heading"
      className="fixed inset-0 z-50 overflow-hidden animate-fadeIn"
    >
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/75 transition-opacity cursor-pointer"
        onClick={() => setIsCartOpen(false)}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex">
        <div className="w-screen max-w-md bg-white border-l border-[#E5E5E5] shadow-2xl flex flex-col justify-between animate-slideInRight h-full">
          
          {/* Drawer Header */}
          <div className="p-4 sm:p-6 border-b border-[#E5E5E5] bg-[#F8F8F6]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-[#8F7137]">
                  <ShoppingBag className="w-4 h-4" />
                </div>
                <div>
                  <h2 id="cart-drawer-heading" className="text-sm sm:text-base font-bold uppercase tracking-wider text-[#171717]">
                    {t('yourBasket')} ({cart.reduce((s, i) => s + i.quantity, 0)})
                  </h2>
                  <p className="text-[10px] text-[#737373] font-medium">
                    {language === 'ar' ? 'منتجات لبنانية حرفية أصيلة' : 'Authentic Lebanese Artisan Handcrafted'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {cart.length > 0 && (
                  <button
                    id="clear-cart-btn"
                    onClick={clearCart}
                    className="flex items-center gap-1 text-[11px] font-bold text-[#C62828] hover:text-red-700 bg-red-50 hover:bg-red-100 px-2.5 py-1 rounded-lg border border-red-200 transition-colors cursor-pointer"
                    title={t('clearAll')}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{t('clearAll')}</span>
                  </button>
                )}
                <button
                  id="close-cart-btn"
                  onClick={() => setIsCartOpen(false)}
                  className="p-2 rounded-lg text-[#737373] hover:text-[#171717] hover:bg-neutral-200/60 transition-colors cursor-pointer"
                  aria-label="Close cart"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Free Delivery progress bar */}
            <div className="mt-4 pt-3 border-t border-[#E5E5E5] space-y-1.5">
              <div className="flex justify-between items-center text-[11px] font-medium text-[#171717]">
                <span className="truncate pr-2">
                  {rawSubtotal >= FREE_DELIVERY_THRESHOLD_USD 
                    ? (language === 'ar' ? '🎉 تم فتح التوصيل السريع المجاني!' : '🎉 Free Beirut Express Delivery Unlocked!') 
                    : (language === 'ar' 
                        ? `أضف ${formatPrice(FREE_DELIVERY_THRESHOLD_USD - rawSubtotal)} للحصول على توصيل مجاني`
                        : `Add ${formatPrice(FREE_DELIVERY_THRESHOLD_USD - rawSubtotal)} for Free Delivery`)}
                </span>
                <span className="text-[#8F7137] font-bold flex-shrink-0">
                  {Math.min(100, Math.round((rawSubtotal / FREE_DELIVERY_THRESHOLD_USD) * 100))}%
                </span>
              </div>
              <div className="h-1.5 w-full bg-[#E5E5E5] rounded-full overflow-hidden">
                <div 
                  className="h-full bg-[#B89753] transition-all duration-300 rounded-full"
                  style={{ width: `${Math.min(100, (rawSubtotal / FREE_DELIVERY_THRESHOLD_USD) * 100)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Cart Items List */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3 bg-[#F8F8F6]">
            {cart.length === 0 ? (
              <div className="py-20 text-center space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto text-[#8F7137]">
                  <ShoppingBag className="w-8 h-8" />
                </div>
                <h3 className="text-base font-bold text-[#171717]">{t('emptyBasket')}</h3>
                <p className="text-xs text-[#737373] max-w-xs mx-auto">
                  {t('emptyBasketSub')}
                </p>
                <button
                  onClick={() => { setIsCartOpen(false); setActiveTab('products'); }}
                  className="px-6 py-2.5 bg-[#171717] hover:bg-[#8F7137] text-white font-bold uppercase text-xs tracking-widest cursor-pointer rounded-lg transition-all shadow-2xs"
                >
                  {t('viewAllProducts')}
                </button>
              </div>
            ) : (
              <>
                {cart.map((item) => (
                  <div 
                    key={item.product.id}
                    className="flex gap-3 p-3 rounded-xl bg-white border border-[#E5E5E5] items-center justify-between shadow-2xs hover:border-[#B89753] transition-all"
                  >
                    <div className="w-16 h-16 rounded-lg bg-[#F8F8F6] border border-[#E5E5E5] flex-shrink-0 flex items-center justify-center p-1 overflow-hidden">
                      <img
                        src={item.product.image}
                        alt={item.product.name}
                        className="w-full h-full object-contain"
                      />
                    </div>

                    <div className="flex-1 min-w-0 pr-1">
                      <h4 className="text-xs font-bold text-[#171717] leading-snug line-clamp-2">
                        {language === 'ar' ? (item.product.arabicName || item.product.name) : item.product.name}
                      </h4>
                      <p className="text-[11px] text-[#8F7137] font-semibold mt-0.5">{item.product.origin}</p>
                      <div className="flex items-baseline gap-1 mt-1 flex-wrap">
                        <span className="text-xs font-bold text-[#171717]">
                          {formatPrice(item.product.priceUSD * item.quantity)}
                        </span>
                        {item.quantity > 1 && (
                          <span className="text-[10px] text-[#737373] font-normal">
                            ({formatPrice(item.product.priceUSD)} {t('each')})
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Quantity & Remove */}
                    <div className="flex flex-col items-end justify-between gap-2 flex-shrink-0">
                      <button
                        onClick={() => removeFromCart(item.product.id)}
                        className="text-[#737373] hover:text-[#C62828] p-1 cursor-pointer transition-colors"
                        title="Remove item"
                        aria-label="Remove item"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>

                      <div className="flex items-center gap-1 bg-[#F8F8F6] border border-[#E5E5E5] rounded-lg p-0.5">
                        <button
                          onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                          className="w-6 h-6 flex items-center justify-center text-[#737373] hover:text-[#171717] hover:bg-white rounded-md cursor-pointer transition-all"
                          aria-label="Decrease quantity"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="text-xs font-bold text-[#171717] px-1.5 min-w-[1.25rem] text-center">{item.quantity}</span>
                        <button
                          onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                          className="w-6 h-6 flex items-center justify-center text-[#737373] hover:text-[#171717] hover:bg-white rounded-md cursor-pointer transition-all"
                          aria-label="Increase quantity"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Coupon / Promo Code Field in Drawer */}
                <div className="p-3.5 rounded-xl bg-white border border-[#E5E5E5] shadow-2xs space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-[#171717] flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5 text-[#8F7137]" />
                      <span>{language === 'ar' ? 'كوبون الخصم أو كود العرض' : 'Promo / Coupon Code'}</span>
                    </span>
                    {appliedCouponCode && (
                      <span className="text-[11px] font-bold text-[#16803C] bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                        {appliedCouponCode}
                      </span>
                    )}
                  </div>

                  {appliedCouponCode ? (
                    <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-50/70 border border-emerald-200 text-xs">
                      <div className="flex items-center gap-1.5 text-emerald-800 font-medium">
                        <Check className="w-3.5 h-3.5 text-[#16803C]" />
                        <span>{language === 'ar' ? `كوبون فعال: وفرت ${formatPrice(discountUSD)}` : `Active Coupon: Saved ${formatPrice(discountUSD)}`}</span>
                      </div>
                      <button
                        type="button"
                        onClick={removeCoupon}
                        className="text-[11px] font-bold text-[#C62828] hover:text-red-700 bg-white px-2 py-1 rounded-md border border-red-200 cursor-pointer"
                      >
                        {language === 'ar' ? 'إلغاء' : 'Remove'}
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={handleApplyCoupon} className="flex gap-2">
                      <input
                        type="text"
                        value={couponInput}
                        onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                        placeholder={language === 'ar' ? 'مثال: KOURA15 أو WELCOME5' : 'e.g. KOURA15 or WELCOME5'}
                        className="flex-1 px-3 py-2 text-xs rounded-lg bg-[#F8F8F6] border border-[#E5E5E5] text-[#171717] placeholder:text-[#737373] font-mono uppercase focus:bg-white focus:outline-none focus:border-[#B89753]"
                      />
                      <button
                        type="submit"
                        disabled={isApplyingCoupon || !couponInput.trim()}
                        className="px-3.5 py-2 rounded-lg bg-[#171717] hover:bg-[#8F7137] disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer"
                      >
                        {language === 'ar' ? 'تطبيق' : 'Apply'}
                      </button>
                    </form>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Drawer Footer & Checkout Action */}
          {cart.length > 0 && (
            <div className="p-4 sm:p-6 border-t border-[#E5E5E5] bg-white space-y-4 shadow-xl">
              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center text-[#737373]">
                  <span className="font-medium">{t('subtotal')}</span>
                  <span className="font-bold text-[#171717] text-sm">{formatPrice(rawSubtotal)}</span>
                </div>

                {discountUSD > 0 && (
                  <div className="flex justify-between items-center text-[#16803C] font-bold">
                    <span className="flex items-center gap-1">
                      <Percent className="w-3.5 h-3.5" />
                      <span>{language === 'ar' ? 'خصم الكوبون والعروض' : 'Discounts & Promos'}</span>
                    </span>
                    <span>-{formatPrice(discountUSD)}</span>
                  </div>
                )}

                <div className="flex justify-between items-center text-[#737373]">
                  <span className="font-medium">{language === 'ar' ? 'توصيل سريع داخل لبنان' : 'Hyper-Local Beirut Dispatch'}</span>
                  <span className="font-bold text-[#16803C]">
                    {cartTotalUSD >= FREE_DELIVERY_THRESHOLD_USD 
                      ? (language === 'ar' ? 'مجاني' : 'FREE') 
                      : (language === 'ar' ? 'يُحتسب عند الدفع' : 'Calculated at checkout')}
                  </span>
                </div>
                <div className="pt-2.5 border-t border-[#E5E5E5] flex justify-between items-center text-[#171717] font-bold">
                  <span className="text-sm">{t('estimatedTotal')}</span>
                  <span className="text-xl font-bold text-[#171717]">{formatPrice(cartTotalUSD)}</span>
                </div>
              </div>

              <button
                id="cart-proceed-checkout-btn"
                onClick={() => {
                  setIsCartOpen(false);
                  setActiveTab('checkout');
                }}
                className="w-full py-3.5 sm:py-4 rounded-lg bg-[#171717] hover:bg-[#8F7137] text-white font-bold uppercase text-xs tracking-widest shadow-2xs hover:shadow-xs transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <span>{t('proceedToCheckout')}</span>
                <ArrowRight className={`w-4 h-4 text-white ${language === 'ar' ? 'rotate-180' : ''}`} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};


