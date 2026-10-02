import React, { useMemo, useState } from 'react';
import { Package, Truck, CheckCircle2, Search } from 'lucide-react';
import { Order, OrderStatus } from '../types';
import { SearchableSelect } from './ui/SearchableSelect';
import { Ltr } from './ui/Ltr';
import { LEBANON_REGIONS } from '../data/regions';
import { itemsLabel } from '../lib/plural';

interface OrderHistoryProps {
  orders: Order[];
  formatPrice: (price: number) => string;
  onNavigateProducts: () => void;
  language: string;
}

/**
 * What a shopper sees for each status. The filter used to offer "Preparing"
 * and "Shipped", values no order ever has, so choosing either listed nothing;
 * and each order showed its raw status ("courier_assigned"). The Orders screen
 * knows eight statuses.
 */
export const STATUS_TEXT: Record<OrderStatus, { en: string; ar: string }> = {
  pending: { en: 'Pending', ar: 'قيد الانتظار' },
  confirmed: { en: 'Confirmed', ar: 'تم التأكيد' },
  crafting: { en: 'Preparing', ar: 'قيد التحضير' },
  courier_assigned: { en: 'Courier assigned', ar: 'تم تعيين مندوب' },
  in_transit: { en: 'Shipped', ar: 'تم الشحن' },
  delivered: { en: 'Delivered', ar: 'تم التسليم' },
  cancelled: { en: 'Cancelled', ar: 'ملغي' },
  returned: { en: 'Returned', ar: 'مُرتجع' },
};

const STATUS_ORDER = Object.keys(STATUS_TEXT) as OrderStatus[];

export const OrderHistory: React.FC<OrderHistoryProps> = ({ orders, formatPrice, onNavigateProducts, language }) => {
  const ar = language === 'ar';
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');

  const list = useMemo(
    () => orders.filter(o => (filter === 'all' || o.status === filter) && (!query || o.id.toLowerCase().includes(query.toLowerCase()))),
    [orders, query, filter],
  );

  const statusLabel = (status: string) => {
    const text = STATUS_TEXT[status as OrderStatus];
    return text ? (ar ? text.ar : text.en) : status;
  };
  const regionName = (id?: string) => {
    const region = LEBANON_REGIONS.find(r => r.id === id);
    return region ? (ar ? region.nameAr : region.nameEn) : (id || '—');
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={ar ? 'ابحث برقم الطلب' : 'Search order ID'}
            aria-label={ar ? 'ابحث برقم الطلب' : 'Search order ID'}
            dir="auto"
            className="w-full ps-9 pe-3 py-2.5 rounded-xl border"
          />
        </div>
        <SearchableSelect value={filter} onChange={e => setFilter(e.target.value)} className="px-3 rounded-xl border">
          <option value="all">{ar ? 'كل الحالات' : 'All statuses'}</option>
          {STATUS_ORDER.map(status => <option key={status} value={status}>{statusLabel(status)}</option>)}
        </SearchableSelect>
      </div>

      {list.length === 0 ? (
        <div className="p-8 bg-white border rounded-2xl text-center text-slate-500">
          {ar ? 'لا توجد طلبات.' : 'No orders found.'}
          <button onClick={onNavigateProducts} className="block mx-auto mt-3 text-indigo-600 font-bold">
            {ar ? 'تصفح المنتجات' : 'Browse products'}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map(o => (
            <article key={o.id} className="bg-white border rounded-2xl p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                    <Package className="w-5 h-5" aria-hidden="true" />
                  </div>
                  <div>
                    <div className="font-bold">{ar ? 'طلب' : 'Order'} <Ltr>#{o.id}</Ltr></div>
                    <div className="text-xs text-slate-500">{o.date}</div>
                  </div>
                </div>
                <div className="text-end">
                  <div className="font-black">{formatPrice(o.totalUSD)}</div>
                  <div className="text-xs text-slate-500 flex items-center gap-1 justify-end">
                    <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                    {statusLabel(o.status)}
                  </div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-600">
                <div>{itemsLabel(o.items?.length || 0, ar ? 'ar' : 'en')}</div>
                <div>{regionName(o.shipping?.governorate)}</div>
                <div className="text-end">
                  {o.trackingNumber
                    ? <><Truck className="inline w-3 h-3" aria-hidden="true" /> <Ltr>{o.trackingNumber}</Ltr></>
                    : (ar ? 'لا يوجد رقم تتبع' : 'No tracking')}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
};
