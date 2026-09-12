import React, { useState, useMemo } from 'react';
import { useShop } from '../../../context/ShopContext';
import { useDialog } from '../../../hooks/useDialog';
import { Order, OrderStatus } from '../../../types';
import { LBP_USD_RATE } from '../../../data/regions';
import { downloadOrdersReport } from '../../../utils/exportMasterReport';
import { 
  Truck, 
  Download, 
  Search, 
  Eye, 
  CheckCircle2, 
  Clock, 
  Phone, 
  ExternalLink, 
  FileText, 
  Printer, 
  X, 
  ChevronDown,
  AlertCircle,
  MapPin,
  Calendar,
  UserCheck
} from 'lucide-react';

export const OrdersRoute: React.FC = () => {
  const { 
    orders, 
    updateOrderStatus, 
    formatPrice, 
    convertUSDToLBP, 
    showToast,
    logAdminActivity
  } = useShop();

  const [orderSearchQuery, setOrderSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedInvoiceOrder, setSelectedInvoiceOrder] = useState<Order | null>(null);

  const { containerRef: invoiceModalRef } = useDialog({
    isOpen: !!selectedInvoiceOrder,
    onClose: () => setSelectedInvoiceOrder(null)
  });

  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const matchSearch = 
        o.id.toLowerCase().includes(orderSearchQuery.toLowerCase()) ||
        (o.shipping?.fullName && o.shipping.fullName.toLowerCase().includes(orderSearchQuery.toLowerCase())) ||
        (o.shipping?.phone && o.shipping.phone.includes(orderSearchQuery)) ||
        (o.shipping?.city && o.shipping.city.toLowerCase().includes(orderSearchQuery.toLowerCase())) ||
        (o.shipping?.governorate && o.shipping.governorate.toLowerCase().includes(orderSearchQuery.toLowerCase()));

      const matchStatus = filterStatus === 'all' || o.status === filterStatus;
      return matchSearch && matchStatus;
    });
  }, [orders, orderSearchQuery, filterStatus]);

  const handleDownloadOrdersReport = () => {
    try {
      downloadOrdersReport(filteredOrders);
      showToast('Orders report downloaded successfully', 'success');
      logAdminActivity('order_status', 'Downloaded Orders CSV', `Exported ${filteredOrders.length} order records.`);
    } catch (err) {
      showToast('Failed to export orders CSV report', 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 sm:p-7 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-indigo-50 border border-indigo-100/60 flex items-center justify-center text-indigo-600 shrink-0">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Orders & Courier Dispatch
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Manage customer orders, courier dispatch tracking, and delivery confirmations across Lebanon.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto justify-between sm:justify-end shrink-0">
          <button
            onClick={handleDownloadOrdersReport}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer border border-slate-200 shadow-2xs active:scale-95"
            title="Download Orders CSV Report"
          >
            <Download className="w-3.5 h-3.5 text-slate-600" />
            <span>Download Report</span>
          </button>
          <span className="px-3.5 py-2 rounded-full text-xs font-black bg-indigo-50 text-indigo-700 border border-indigo-200/60 shadow-2xs whitespace-nowrap">
            {orders.length} Total Orders
          </span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4">
        <div className="relative flex-1 min-w-0 sm:min-w-[280px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by order ID, customer name, phone, city..."
            value={orderSearchQuery}
            onChange={(e) => setOrderSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white text-xs text-slate-900 placeholder-slate-400 rounded-2xl border border-slate-200 focus:outline-none focus:border-indigo-500 shadow-2xs transition-all"
          />
        </div>

        <div className="flex items-center gap-2.5 shrink-0 justify-between sm:justify-start">
          <span className="text-xs text-slate-500 font-bold whitespace-nowrap">Status:</span>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-white text-xs font-semibold text-slate-900 border border-slate-200 rounded-2xl px-3.5 py-2.5 focus:outline-none focus:border-indigo-500 shadow-2xs cursor-pointer"
          >
            <option value="all">All Statuses ({orders.length})</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="crafting">Crafting</option>
            <option value="courier_assigned">Courier Assigned</option>
            <option value="in_transit">In Transit</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
        {filteredOrders.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mx-auto">
              <Truck className="w-6 h-6" />
            </div>
            <p className="text-sm font-bold text-slate-700">No orders found</p>
            <p className="text-xs text-slate-400">Try adjusting search query or status filters</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60 text-[11px] font-black uppercase tracking-wider text-slate-400">
                  <th className="py-3.5 px-4">Order ID & Date</th>
                  <th className="py-3.5 px-4">Customer & Phone</th>
                  <th className="py-3.5 px-4">Destination</th>
                  <th className="py-3.5 px-4">Items Count</th>
                  <th className="py-3.5 px-4">Total Amount</th>
                  <th className="py-3.5 px-4">Fulfillment Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                {filteredOrders.map(order => {
                  const itemCount = order.items?.reduce((acc, i) => acc + (i.quantity || 1), 0) || 0;
                  return (
                    <tr key={order.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-mono font-bold text-indigo-950 text-xs">#{order.id}</div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <Calendar className="w-3 h-3" />
                          <span>{order.date}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">{order.shipping?.fullName || 'Anonymous'}</div>
                        <div className="text-[11px] text-slate-500 font-mono mt-0.5 flex items-center gap-1">
                          <Phone className="w-3 h-3 text-slate-400" />
                          <span>{order.shipping?.phone || 'No phone'}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-slate-800">{order.shipping?.city || 'Lebanon'}</div>
                        <div className="text-[10px] text-slate-400">{order.shipping?.governorate || ''}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="px-2.5 py-1 rounded-full bg-slate-100 font-bold text-[11px] text-slate-700 border border-slate-200">
                          {itemCount} {itemCount === 1 ? 'item' : 'items'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-black text-slate-900">{formatPrice(order.totalUSD)}</div>
                        <div className="text-[10px] text-slate-400 font-medium">
                          ≈ {(order.totalUSD * LBP_USD_RATE).toLocaleString()} LBP
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <select
                          value={order.status}
                          onChange={async (e) => {
                            const newStatus = e.target.value as OrderStatus;
                            await updateOrderStatus(order.id, newStatus);
                            showToast(`Order #${order.id} updated to ${newStatus}`, 'success');
                          }}
                          className={`text-xs font-bold rounded-xl px-2.5 py-1 border cursor-pointer focus:outline-none ${
                            order.status === 'delivered'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : order.status === 'cancelled'
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : order.status === 'in_transit' || order.status === 'courier_assigned'
                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}
                        >
                          <option value="pending">Pending</option>
                          <option value="confirmed">Confirmed</option>
                          <option value="crafting">Crafting</option>
                          <option value="courier_assigned">Courier Assigned</option>
                          <option value="in_transit">In Transit</option>
                          <option value="delivered">Delivered</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => setSelectedInvoiceOrder(order)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-all cursor-pointer shadow-2xs"
                        >
                          <Eye className="w-3.5 h-3.5 text-slate-600" />
                          <span>Inspect</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Invoice & Order Details Inspector Modal */}
      {selectedInvoiceOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div 
            ref={invoiceModalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-order-modal-title"
            className="bg-white max-w-2xl w-full p-6 sm:p-8 rounded-3xl shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto focus:outline-none"
          >
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2">
                  <h3 id="admin-order-modal-title" className="text-lg font-black text-slate-900">Order Details & Invoice Inspector</h3>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                    selectedInvoiceOrder.status === 'delivered'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : selectedInvoiceOrder.status === 'cancelled'
                      ? 'bg-rose-50 text-rose-700 border border-rose-200'
                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}>
                    {selectedInvoiceOrder.status.replace(/_/g, ' ')}
                  </span>
                </div>
                <p className="text-xs text-indigo-600 font-mono font-bold mt-1">Order ID: #{selectedInvoiceOrder.id} • Placed on {selectedInvoiceOrder.date}</p>
              </div>
              <button 
                onClick={() => setSelectedInvoiceOrder(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800 font-bold cursor-pointer transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Status Control */}
            <div className="flex items-center justify-between p-4 rounded-2xl bg-indigo-50/50 border border-indigo-100 text-xs">
              <span className="font-bold text-indigo-950">Update Fulfillment Status:</span>
              <select
                value={selectedInvoiceOrder.status}
                onChange={async (e) => {
                  const newStatus = e.target.value as OrderStatus;
                  await updateOrderStatus(selectedInvoiceOrder.id, newStatus);
                  setSelectedInvoiceOrder({ ...selectedInvoiceOrder, status: newStatus });
                }}
                className="bg-white text-xs font-bold text-slate-800 border border-indigo-200 rounded-xl px-3 py-1.5 focus:outline-none focus:border-indigo-500 cursor-pointer shadow-2xs"
              >
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="crafting">Crafting / Preparing</option>
                <option value="courier_assigned">Courier Assigned</option>
                <option value="in_transit">In Transit</option>
                <option value="delivered">Delivered</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-2">
                <h4 className="font-bold uppercase text-[10px] tracking-wider text-slate-400 mb-1">Customer & Recipient</h4>
                <div className="flex justify-between">
                  <span className="text-slate-500">Name:</span>
                  <span className="font-bold text-slate-900">{selectedInvoiceOrder.shipping?.fullName || 'Anonymous Shopper'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Phone:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900">{selectedInvoiceOrder.shipping?.phone || 'N/A'}</span>
                    {selectedInvoiceOrder.shipping?.phone && (
                      <a
                        href={`https://wa.me/${selectedInvoiceOrder.shipping.phone.replace(/[^0-9]/g, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-emerald-600 hover:text-emerald-700 font-bold text-[11px]"
                      >
                        WhatsApp
                      </a>
                    )}
                  </div>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Email:</span>
                  <span className="font-bold text-slate-900">{selectedInvoiceOrder.shipping?.email || 'N/A'}</span>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-2">
                <h4 className="font-bold uppercase text-[10px] tracking-wider text-slate-400 mb-1">Shipping & Address</h4>
                <div className="flex justify-between">
                  <span className="text-slate-500">Governorate:</span>
                  <span className="font-bold text-slate-900">{selectedInvoiceOrder.shipping?.governorate || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">City / Town:</span>
                  <span className="font-bold text-slate-900">{selectedInvoiceOrder.shipping?.city || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Street / Bldg:</span>
                  <span className="font-bold text-slate-900">{selectedInvoiceOrder.shipping?.street || ''} {selectedInvoiceOrder.shipping?.building || ''}</span>
                </div>
              </div>
            </div>

            {/* Line items */}
            <div className="space-y-3">
              <h4 className="font-bold text-xs uppercase tracking-wider text-slate-400">Order Line Items ({selectedInvoiceOrder.items?.length || 0})</h4>
              <div className="divide-y divide-slate-100 border border-slate-100 rounded-2xl overflow-hidden">
                {selectedInvoiceOrder.items?.map((item, idx) => (
                  <div key={idx} className="p-3 flex items-center justify-between text-xs hover:bg-slate-50">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl border border-slate-200 bg-white flex items-center justify-center p-0.5 shrink-0 overflow-hidden">
                        <img 
                          src={item.product?.image || 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=100&q=80'} 
                          alt={item.product?.name || 'Product'} 
                          className="w-full h-full object-contain" 
                        />
                      </div>
                      <div>
                        <div className="font-bold text-slate-900">{item.product?.name || 'Product'}</div>
                        <div className="text-[11px] text-slate-500 font-mono">Qty: {item.quantity || 1} × ${item.product?.priceUSD?.toFixed(2) || '0.00'}</div>
                      </div>
                    </div>
                    <div className="font-black text-slate-900">
                      ${((item.quantity || 1) * (item.product?.priceUSD || 0)).toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Totals Summary */}
            <div className="p-4 rounded-2xl bg-slate-900 text-white space-y-2 text-xs">
              <div className="flex justify-between text-slate-300">
                <span>Subtotal:</span>
                <span className="font-bold">${selectedInvoiceOrder.subtotalUSD?.toFixed(2) || selectedInvoiceOrder.totalUSD.toFixed(2)}</span>
              </div>
              {selectedInvoiceOrder.discountUSD ? (
                <div className="flex justify-between text-emerald-400">
                  <span>Discounts Applied:</span>
                  <span className="font-bold">-${selectedInvoiceOrder.discountUSD.toFixed(2)}</span>
                </div>
              ) : null}
              <div className="flex justify-between text-slate-300">
                <span>Delivery Fee:</span>
                <span className="font-bold">${selectedInvoiceOrder.deliveryFeeUSD?.toFixed(2) || '0.00'}</span>
              </div>
              <div className="pt-2 border-t border-slate-800 flex justify-between items-center text-sm">
                <span className="font-black text-white">Grand Total:</span>
                <div className="text-right">
                  <div className="font-black text-amber-400 text-base">${selectedInvoiceOrder.totalUSD.toFixed(2)} USD</div>
                  <div className="text-[11px] text-slate-400">
                    ≈ {(selectedInvoiceOrder.totalUSD * LBP_USD_RATE).toLocaleString()} LBP
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => window.print()}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Print Invoice</span>
              </button>
              <button
                onClick={() => setSelectedInvoiceOrder(null)}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all cursor-pointer"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
