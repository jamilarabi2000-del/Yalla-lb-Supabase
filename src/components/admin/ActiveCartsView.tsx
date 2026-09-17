import React, { useEffect, useState } from 'react';
import { useShop } from '../../context/ShopContext';
import { ShoppingCart, Trash2, MessageSquare, Clock, User, Sparkles } from 'lucide-react';
import { CartItem } from '../../types';
import { supabase } from '../../lib/supabase';
import { buildCustomerIndex } from '../../lib/customerIndex';

interface ActiveCartSession {
  id: string;
  userId: string | null;
  isSynthetic: boolean;
  userLabel: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  items: CartItem[];
  totalUSD: number;
  itemCount: number;
  lastActive: string;
  status: string;
  isLive: boolean;
}

export const ActiveCartsView: React.FC = () => {
  const { cart, cartTotalUSD, formatPrice, showToast, user, orders = [], isAdminUser } = useShop();
  const [activeCartsList, setActiveCartsList] = useState<ActiveCartSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isAdminUser) {
      setIsLoading(false);
      return;
    }

    let mounted = true;
    const fetchCarts = async () => {
      setIsLoading(true);
      try {
        const [{ data: carts, error: cartsError }, { data: profiles, error: profilesError }] = await Promise.all([
          supabase.from('carts').select('user_id, items, updated_at').limit(500),
          supabase.from('profiles').select('id, name, email, phone, default_city, default_governorate').limit(1000)
        ]);
        if (cartsError) throw cartsError;
        if (profilesError) throw profilesError;

        const users = (profiles || []).map((p: any) => ({
          uid: p.id,
          name: p.name || '',
          email: p.email || '',
          phone: p.phone || '',
          avatar: '',
          defaultGovernorate: p.default_governorate || '',
          defaultCity: p.default_city || '',
          defaultAddress: ''
        }));
        const customerIndex = buildCustomerIndex(users as any, orders);

        const fetched: ActiveCartSession[] = [];
        for (const row of carts || []) {
          const items = Array.isArray(row.items) ? row.items as CartItem[] : [];
          if (!items.length) continue;
          const customer = row.user_id ? customerIndex.get(row.user_id) : undefined;
          const totalUSD = items.reduce((sum, item) => sum + ((item?.product?.priceUSD || 0) * (item?.quantity || 0)), 0);
          const isLive = row.user_id === user?.uid;
          fetched.push({
            id: String(row.user_id || `cart-${fetched.length}`),
            userId: row.user_id || null,
            isSynthetic: false,
            userLabel: customer?.name || 'Unidentified Shopper',
            email: customer?.email || null,
            phone: customer?.phone || null,
            city: customer?.city || null,
            items,
            totalUSD,
            itemCount: items.reduce((s, i) => s + (i?.quantity || 0), 0),
            lastActive: row.updated_at ? new Date(row.updated_at).toLocaleString() : 'Recently',
            status: isLive ? 'In Checkout / Active' : 'Abandoned Cart',
            isLive
          });
        }

        if (cart.length > 0 && !fetched.some(c => c.isLive)) {
          fetched.push({
            id: 'cart-session-active',
            userId: user?.uid || null,
            isSynthetic: true,
            userLabel: user?.name || 'Current Active Shopper (You)',
            email: user?.email || null,
            phone: user?.phone || null,
            city: (user as any)?.defaultCity || null,
            items: cart,
            totalUSD: cartTotalUSD,
            itemCount: cart.reduce((s, i) => s + i.quantity, 0),
            lastActive: 'Just now',
            status: 'In Checkout / Active',
            isLive: true
          });
        }

        fetched.sort((a, b) => Number(b.isLive) - Number(a.isLive));
        if (mounted) setActiveCartsList(fetched);
      } catch (err) {
        console.error('Failed to fetch carts:', err);
        if (mounted) showToast('Failed to load active carts', 'warning');
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    fetchCarts();
    return () => { mounted = false; };
  }, [cart, cartTotalUSD, user, orders, isAdminUser, showToast]);

  const handleSendReminder = (phone: string, total: number) => {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const message = encodeURIComponent(`Marhaba! We noticed you left some authentic Lebanese artisanal items in your cart on Yalla.lb (${formatPrice(total)}). Would you like help finalizing your delivery in Lebanon?`);
    window.open(`https://wa.me/${cleanPhone || '96170123456'}?text=${message}`, '_blank', 'noopener,noreferrer');
    showToast('Opened WhatsApp reminder message!', 'info');
  };

  const handleClearCart = async (session: ActiveCartSession) => {
    if (!session.userId || !window.confirm(`Clear cart for ${session.userLabel}?`)) return;
    try {
      const { error } = await supabase.from('carts').delete().eq('user_id', session.userId);
      if (error) throw error;
      setActiveCartsList(prev => prev.filter(c => c.id !== session.id));
      showToast('Shopper cart cleared', 'info');
    } catch (err) {
      console.error('Failed to clear cart:', err);
      showToast('Could not clear that cart', 'warning');
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-indigo-50 flex items-center justify-center text-[#4f46e5]"><ShoppingCart className="w-5 h-5" /></div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Active Shopping Carts</h2>
            <p className="text-xs text-slate-500">Live monitoring of shopping sessions, cart abandonment, and instant customer checkout recovery.</p>
          </div>
        </div>
        <span className="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
          {activeCartsList.length} Active Cart Session{activeCartsList.length === 1 ? '' : 's'}
        </span>
      </div>

      {isLoading ? (
        <div className="bg-white p-12 rounded-3xl border border-slate-200/80 text-center text-sm text-slate-500">Loading active carts…</div>
      ) : activeCartsList.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            {activeCartsList.map((cartSession) => (
              <div key={cartSession.id} className="bg-white p-6 rounded-3xl border border-indigo-100 shadow-sm space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center text-[#4f46e5]"><User className="w-5 h-5" /></div>
                    <div>
                      <div className="flex items-center gap-2"><h4 className="font-bold text-slate-900 text-sm">{cartSession.userLabel}</h4>{cartSession.isLive && <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-100 text-[#4f46e5]">LIVE USER</span>}</div>
                      <p className="text-xs text-slate-500">{cartSession.phone || 'No phone'} • {cartSession.city || 'No city'}</p>
                    </div>
                  </div>
                  <div className="text-right"><span className="inline-block px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">{cartSession.status}</span><div className="flex items-center justify-end gap-1 text-[11px] text-slate-400 mt-1"><Clock className="w-3 h-3" />{cartSession.lastActive}</div></div>
                </div>
                <div className="space-y-3">
                  <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400">Items in Cart ({cartSession.itemCount} Units)</h5>
                  <div className="divide-y divide-slate-100">
                    {cartSession.items.map((item: any, index) => <div key={`${item?.product?.id || 'item'}-${index}`} className="py-3 flex items-center justify-between gap-4 first:pt-0 last:pb-0">
                      <div className="flex items-center gap-3"><div className="w-12 h-12 rounded-xl border border-slate-100 bg-white flex items-center justify-center p-0.5 shrink-0 overflow-hidden"><img src={item?.product?.image} alt={item?.product?.name || 'Product'} className="w-full h-full object-contain" /></div><div><p className="text-xs font-bold text-slate-900 line-clamp-1">{item?.product?.name || 'Product'}</p><p className="text-[11px] text-[#c5a059] font-medium">{item?.product?.artisan || item?.product?.seller || ''} • {item?.product?.origin || ''}</p><p className="text-[11px] text-slate-400 font-semibold">Qty: {item?.quantity || 0} × {formatPrice(item?.product?.priceUSD || 0)}</p></div></div>
                      <p className="text-xs font-black text-slate-900">{formatPrice((item?.product?.priceUSD || 0) * (item?.quantity || 0))}</p>
                    </div>)}
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100">
                  <div className="text-xs text-slate-500">Estimated Subtotal: <strong className="text-slate-900 font-black">{formatPrice(cartSession.totalUSD)}</strong></div>
                  <div className="flex items-center gap-2">
                    {cartSession.phone && <button onClick={() => handleSendReminder(cartSession.phone!, cartSession.totalUSD)} className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"><MessageSquare className="w-3.5 h-3.5" />WhatsApp Recovery</button>}
                    {!cartSession.isSynthetic && <button onClick={() => handleClearCart(cartSession)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all cursor-pointer" title="Clear this cart"><Trash2 className="w-4 h-4" /></button>}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-6"><div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4"><h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><Sparkles className="w-4 h-4 text-[#4f46e5]" />Cart Performance Insights</h3><div className="space-y-3 text-xs"><div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between"><span className="text-slate-600">Total In-Cart Value</span><span className="font-black text-slate-900">{formatPrice(activeCartsList.reduce((s, c) => s + c.totalUSD, 0))}</span></div><div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between"><span className="text-slate-600">Total Cart Items</span><span className="font-black text-slate-900">{activeCartsList.reduce((s, c) => s + c.itemCount, 0)} Units</span></div></div><div className="p-4 rounded-2xl bg-indigo-50/60 border border-indigo-100 text-xs text-indigo-900 space-y-2"><p className="font-bold">💡 Lebanon Express Courier Tip</p><p className="text-[11px] text-indigo-700 leading-relaxed">Carts with direct Cash on Delivery (USD/LBP) can be followed up via WhatsApp for checkout recovery.</p></div></div></div>
        </div>
      ) : (
        <div className="bg-white p-12 rounded-3xl border border-slate-200/80 text-center space-y-4 shadow-xs"><div className="w-16 h-16 rounded-full bg-indigo-50 text-[#4f46e5] flex items-center justify-center mx-auto"><ShoppingCart className="w-8 h-8 opacity-60" /></div><h3 className="text-lg font-bold text-slate-900">No Active Carts at this Moment</h3><p className="text-xs text-slate-500 max-w-md mx-auto">When shoppers browse the catalog and add products, their live carts will appear here for recovery and analytics.</p></div>
      )}
    </div>
  );
};

export default ActiveCartsView;
