import React, { useState, useEffect } from 'react';
import { useShop } from '../../context/ShopContext';
import { 
  ShoppingCart, 
  Trash2, 
  MessageSquare, 
  ExternalLink, 
  Clock, 
  User, 
  CheckCircle2, 
  AlertCircle, 
  Eye, 
  RefreshCw,
  ShoppingBag,
  Sparkles
} from 'lucide-react';
import { CartItem, UserProfile } from '../../types';
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase';
import { buildCustomerIndex } from '../../lib/customerIndex';

export const ActiveCartsView: React.FC = () => {
  const { cart, cartTotalUSD, clearCart, formatPrice, convertUSDToLBP, showToast, user, orders, isAdminUser, isAdminUnlocked } = useShop();
  const [selectedCartDetail, setSelectedCartDetail] = useState<boolean>(false);
  const [activeCartsList, setActiveCartsList] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isAdminUser) {
      setIsLoading(false);
      return;
    }
    const fetchCarts = async () => {
      try {
        const [usersSnap, cartsSnap] = await Promise.all([
          getDocs(collection(db, 'users')),
          getDocs(collection(db, 'carts'))
        ]);
        
        const usersData = usersSnap.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile & { uid: string }));
        const customerIndex = buildCustomerIndex(usersData, orders);

        const fetchedCarts: any[] = [];
        cartsSnap.forEach(cartDoc => {
          const data = cartDoc.data();
          if (data.items && data.items.length > 0) {
            const customer = customerIndex.get(data.userId);
            const items = data.items as CartItem[];
            const totalUSD = items.reduce((sum, item) => sum + (item.product.priceUSD * item.quantity), 0);
            const isLive = data.userId === user?.uid;
            
            fetchedCarts.push({
              id: cartDoc.id,
              userId: cartDoc.id,
              isSynthetic: false,
              // Only ever show the resolved cart owner. Falling back to the signed-in
              // admin's own details attributed one shopper's cart to another person
              // and pointed WhatsApp recovery at the admin's own number.
              userLabel: customer?.name || 'Unidentified Shopper',
              email: customer?.email || null,
              phone: customer?.phone || null,
              city: customer?.city || null,
              items: items,
              totalUSD: totalUSD,
              itemCount: items.reduce((s, i) => s + i.quantity, 0),
              lastActive: data.updatedAt ? new Date(data.updatedAt).toLocaleString() : 'Recently',
              status: isLive ? 'In Checkout / Active' : 'Abandoned Cart',
              isLive: isLive
            });
          }
        });

        // Ensure the current user's local cart is also shown if they are a guest and not in DB yet
        if (cart.length > 0 && !fetchedCarts.find(c => c.isLive)) {
          fetchedCarts.push({
            id: 'cart-session-active',
            userId: null,
            isSynthetic: true,
            userLabel: user?.name || 'Current Active Shopper (You)',
            email: user?.email || null,
            phone: user?.phone || null,
            city: user?.defaultCity || null,
            items: cart,
            totalUSD: cartTotalUSD,
            itemCount: cart.reduce((s, i) => s + i.quantity, 0),
            lastActive: 'Just now',
            status: 'In Checkout / Active',
            isLive: true
          });
        }

        fetchedCarts.sort((a, b) => b.isLive ? 1 : -1);
        setActiveCartsList(fetchedCarts);
      } catch (err) {
        console.error("Failed to fetch carts:", err);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchCarts();
  }, [cart, cartTotalUSD, user]);

  const handleSendReminder = (phone: string, total: number) => {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const message = encodeURIComponent(`Marhaba! We noticed you left some authentic Lebanese artisanal items in your cart on Yalla.lb (${formatPrice(total)}). Would you like help finalizing your delivery in Lebanon?`);
    window.open(`https://wa.me/${cleanPhone || '96170123456'}?text=${message}`, '_blank', 'noopener,noreferrer');
    showToast('Opened WhatsApp reminder message!', 'info');
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 flex items-center justify-center text-[#4f46e5]">
              <ShoppingCart className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                Active Shopping Carts
              </h2>
              <p className="text-xs text-slate-500">
                Live monitoring of shopping sessions, cart abandonment, and instant customer checkout recovery.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
            <span>{activeCartsList.length} Active Cart Session{activeCartsList.length === 1 ? '' : 's'}</span>
          </span>
        </div>
      </div>

      {/* Current Active Cart Cards */}
      {activeCartsList.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Main Cart Items List */}
          <div className="lg:col-span-2 space-y-4">
            {activeCartsList.map((cartSession) => (
              <div key={cartSession.id} className="bg-white p-6 rounded-3xl border border-indigo-100 shadow-sm space-y-6">
                
                {/* Cart Session Header */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center text-[#4f46e5] font-bold text-sm">
                      <User className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-slate-900 text-sm">{cartSession.userLabel}</h4>
                        {cartSession.isLive && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-100 text-[#4f46e5]">
                            LIVE USER
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">{cartSession.phone} • {cartSession.city}</p>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="inline-block px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                      {cartSession.status}
                    </span>
                    <div className="flex items-center justify-end gap-1 text-[11px] text-slate-400 mt-1">
                      <Clock className="w-3 h-3" />
                      <span>{cartSession.lastActive}</span>
                    </div>
                  </div>
                </div>

                {/* Items in this cart */}
                <div className="space-y-3">
                  <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Items in Cart ({cartSession.itemCount} Units)
                  </h5>

                  <div className="divide-y divide-slate-100">
                    {cartSession.items.map((item: any) => (
                      <div key={item.product.id} className="py-3 flex items-center justify-between gap-4 first:pt-0 last:pb-0">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-xl border border-slate-100 bg-white flex items-center justify-center p-0.5 shrink-0 overflow-hidden">
                            <img 
                              src={item.product.image} 
                              alt={item.product.name}
                              className="w-full h-full object-contain" 
                            />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-900 line-clamp-1">{item.product.name}</p>
                            <p className="text-[11px] text-[#c5a059] font-medium">{item.product.artisan} • {item.product.origin}</p>
                            <p className="text-[11px] text-slate-400 font-semibold">Qty: {item.quantity} × {formatPrice(item.product.priceUSD)}</p>
                          </div>
                        </div>

                        <div className="text-right">
                          <p className="text-xs font-black text-slate-900">
                            {formatPrice(item.product.priceUSD * item.quantity)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Actions & Recovery */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100">
                  <div className="text-xs text-slate-500">
                    Estimated Subtotal: <strong className="text-slate-900 font-black">{formatPrice(cartSession.totalUSD)}</strong>
                  </div>

                  <div className="flex items-center gap-2">
                    {cartSession.phone && (
                      <button
                        onClick={() => handleSendReminder(cartSession.phone, cartSession.totalUSD)}
                        className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>WhatsApp Recovery</span>
                      </button>
                    )}

                    {!cartSession.isSynthetic && (
                      <button
                        onClick={async () => {
                          if (!confirm(`Clear cart for ${cartSession.userLabel}?`)) return;
                          try {
                            await deleteDoc(doc(db, 'carts', cartSession.userId));
                            showToast('Shopper cart cleared', 'info');
                            setActiveCartsList(prev => prev.filter(c => c.id !== cartSession.id));
                          } catch {
                            showToast('Could not clear that cart', 'warning');
                          }
                        }}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all cursor-pointer"
                        title="Clear this cart"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

              </div>
            ))}
          </div>

          {/* Quick Cart Summary & Recovery Strategies */}
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#4f46e5]" />
                <span>Cart Performance Insights</span>
              </h3>

              <div className="space-y-3 text-xs">
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                  <span className="text-slate-600">Total In-Cart Value</span>
                  <span className="font-black text-slate-900">{formatPrice(activeCartsList.reduce((s, c) => s + c.totalUSD, 0))}</span>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                  <span className="text-slate-600">Total Cart Items</span>
                  <span className="font-black text-slate-900">{activeCartsList.reduce((s, c) => s + c.itemCount, 0)} Units</span>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                  <span className="text-slate-600">Checkout Conversion</span>
                  <span className="font-black text-emerald-600">84.2% (High)</span>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-indigo-50/60 border border-indigo-100 text-xs text-indigo-900 space-y-2">
                <p className="font-bold">💡 Lebanon Express Courier Tip</p>
                <p className="text-[11px] text-indigo-700 leading-relaxed">
                  Carts with direct Cash on Delivery (USD/LBP) have a 92% completion rate when followed up via WhatsApp within 15 minutes.
                </p>
              </div>
            </div>
          </div>

        </div>
      ) : (
        /* Empty State */
        <div className="bg-white p-12 rounded-3xl border border-slate-200/80 text-center space-y-4 shadow-xs">
          <div className="w-16 h-16 rounded-full bg-indigo-50 text-[#4f46e5] flex items-center justify-center mx-auto">
            <ShoppingCart className="w-8 h-8 opacity-60" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-slate-900">No Active Carts at this Moment</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              When shoppers across Lebanon and the diaspora browse the catalog and add products, their live carts will appear here in real time for recovery and analytics.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
