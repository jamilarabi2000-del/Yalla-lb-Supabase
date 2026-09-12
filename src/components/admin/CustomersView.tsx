import React, { useState, useEffect } from 'react';
import { sanitizeRowForCsv } from '../../utils/csvSafe';
import { useShop } from '../../context/ShopContext';
import { useDialog } from '../../hooks/useDialog';
import { 
  Users, 
  Search, 
  MessageSquare, 
  Phone, 
  Mail, 
  MapPin, 
  ShoppingBag, 
  DollarSign, 
  Calendar,
  ExternalLink,
  ChevronRight,
  Sparkles,
  CheckCircle2,
  Download
} from 'lucide-react';
import { Order, UserProfile } from '../../types';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../../firebase';
import { buildCustomerIndex, CustomerRecord } from '../../lib/customerIndex';

interface CustomersViewProps {
  dbUsers?: (UserProfile & { uid?: string })[];
}

export const CustomersView: React.FC<CustomersViewProps> = ({ dbUsers: propDbUsers }) => {
  const { orders, formatPrice, convertUSDToLBP, showToast, isAdminUser, isAdminUnlocked } = useShop();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRecord | null>(null);
  const [localDbUsers, setLocalDbUsers] = useState<(UserProfile & { uid?: string })[]>([]);
  const [isLoading, setIsLoading] = useState(!propDbUsers);

  const { containerRef: customerModalRef } = useDialog({
    isOpen: !!selectedCustomer,
    onClose: () => setSelectedCustomer(null)
  });

  useEffect(() => {
    if (!isAdminUser) {
      setIsLoading(false);
      return;
    }

    if (propDbUsers !== undefined) {
      setLocalDbUsers(propDbUsers);
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    const fetchUsers = async () => {
      try {
        const usersRef = collection(db, 'users');
        const snapshot = await getDocs(usersRef);
        if (!isMounted) return;
        const usersData: (UserProfile & { uid?: string })[] = [];
        snapshot.forEach(doc => {
          usersData.push({ uid: doc.id, ...doc.data() } as UserProfile & { uid: string });
        });
        setLocalDbUsers(usersData);
      } catch (err) {
        console.error("Failed to fetch users:", err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    fetchUsers();
    return () => {
      isMounted = false;
    };
  }, [propDbUsers]);

  const activeUsers = propDbUsers ?? localDbUsers;
  const customersMap = React.useMemo(() => buildCustomerIndex(activeUsers, orders), [activeUsers, orders]);
  const customersList = React.useMemo(() => Array.from(customersMap.values()), [customersMap]);

  const filteredCustomers = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return customersList;
    return customersList.filter(c => 
      c.name.toLowerCase().includes(q) ||
      (c.phone && c.phone.includes(q)) ||
      (c.email && c.email.toLowerCase().includes(q)) ||
      (c.city && c.city.toLowerCase().includes(q))
    );
  }, [customersList, searchQuery]);

  const handleWhatsAppContact = (phone: string | null, name: string) => {
    if (!phone) {
      showToast('No phone number on file', 'warning');
      return;
    }
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const message = encodeURIComponent(`Marhaba ${name}! This is Yalla.lb Merchant Support regarding your Lebanese artisanal orders. How can we assist you today?`);
    window.open(`https://wa.me/${cleanPhone}?text=${message}`, '_blank', 'noopener,noreferrer');
    showToast(`Opening WhatsApp chat for ${name}`, 'info');
  };

  const handleDownloadCustomersReport = () => {
    import('papaparse').then((Papa) => {
      const dataToExport = filteredCustomers.map(c => ({
        customer_id: c.id,
        name: c.name,
        email: c.email || '',
        phone: c.phone || '',
        governorate: c.governorate || '',
        city: c.city || '',
        street_address: c.street || '',
        orders_count: c.ordersCount,
        total_spent_usd: c.totalSpentUSD.toFixed(2),
        last_order_date: c.lastOrderDate || 'No orders yet'
      }));

      const csv = Papa.unparse(dataToExport.map(sanitizeRowForCsv));
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `yalla_customers_report_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast('Customers report downloaded successfully', 'success');
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 flex items-center justify-center text-[#4f46e5]">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                Customers Directory
              </h2>
              <p className="text-xs text-slate-500">
                Manage verified buyers, lifetime spent, direct WhatsApp courier communications, and order histories.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleDownloadCustomersReport}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer border border-slate-200 shadow-2xs active:scale-95"
            title="Download Customers CSV Report"
          >
            <Download className="w-3.5 h-3.5 text-slate-600" />
            <span>Download Report</span>
          </button>
          <span className="px-3.5 py-1.5 rounded-full text-xs font-black bg-indigo-50 text-indigo-700 border border-indigo-100">
            {customersList.length} Customer{customersList.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="relative flex-1 min-w-[280px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by customer name, phone number, email, or city..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white text-xs text-slate-900 placeholder-slate-400 rounded-2xl border border-slate-200 focus:outline-none focus:border-indigo-600"
          />
        </div>
      </div>

      {/* Customers Table / Grid */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50/80 text-[11px] uppercase font-bold text-slate-500 tracking-wider border-b border-slate-100">
              <tr>
                <th className="p-4">Customer</th>
                <th className="p-4">Contact Info</th>
                <th className="p-4">Location (Lebanon)</th>
                <th className="p-4">Total Orders</th>
                <th className="p-4">Lifetime Spend</th>
                <th className="p-4">Last Activity</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredCustomers.map((customer) => (
                <tr key={customer.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 font-black flex items-center justify-center text-xs">
                        {customer.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-bold text-slate-900">{customer.name}</div>
                        <div className="text-[11px] text-slate-400">{customer.email || '—'}</div>
                      </div>
                    </div>
                  </td>

                  <td className="p-4">
                    {customer.phone ? (
                      <>
                        <div className="font-mono text-slate-800 font-semibold">{customer.phone}</div>
                        <div className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> WhatsApp Enabled
                        </div>
                      </>
                    ) : (
                      <div className="text-xs text-slate-400 italic">No contact on file</div>
                    )}
                  </td>

                  <td className="p-4">
                    <div className="font-medium text-slate-800">{customer.city || '—'}</div>
                    <div className="text-[11px] text-slate-400">{customer.governorate || '—'}</div>
                  </td>

                  <td className="p-4">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-800">
                      {customer.ordersCount} {customer.ordersCount === 1 ? 'order' : 'orders'}
                    </span>
                  </td>

                  <td className="p-4">
                    <div className="font-black text-slate-900 text-sm">
                      {formatPrice(customer.totalSpentUSD)}
                    </div>
                  </td>

                  <td className="p-4 text-slate-500 text-[11px]">
                    {customer.lastOrderDate || '—'}
                  </td>

                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleWhatsAppContact(customer.phone, customer.name)}
                        className="p-2 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white transition-all cursor-pointer"
                        title="Chat via WhatsApp"
                      >
                        <MessageSquare className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => setSelectedCustomer(customer)}
                        className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer"
                      >
                        View Orders
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredCustomers.length === 0 && (
          <div className="text-center py-16 px-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-500 flex items-center justify-center mx-auto mb-3">
              <Users className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-slate-800 mb-1">
              {searchQuery ? 'No matching customers found' : 'No customers recorded yet'}
            </h4>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              {searchQuery 
                ? `No buyers or registered profiles matched "${searchQuery}". Try a different name, phone, or email.`
                : 'Customer profiles and buyer history will automatically appear here as accounts register and orders are placed.'
              }
            </p>
          </div>
        )}
      </div>

      {/* Customer Orders History Modal */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div 
            ref={customerModalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="customer-orders-modal-title"
            className="bg-white max-w-2xl w-full p-6 sm:p-8 rounded-3xl shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h3 id="customer-orders-modal-title" className="text-lg font-bold text-slate-900">{selectedCustomer.name}</h3>
                <p className="text-xs text-slate-500">{selectedCustomer.phone} • {selectedCustomer.city}, {selectedCustomer.governorate}</p>
              </div>
              <button 
                onClick={() => setSelectedCustomer(null)}
                className="text-slate-400 hover:text-slate-700 text-lg font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Total Orders</span>
                <span className="text-lg font-black text-slate-900">{selectedCustomer.ordersCount}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Lifetime Value</span>
                <span className="text-lg font-black text-emerald-600">{formatPrice(selectedCustomer.totalSpentUSD)}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Primary Location</span>
                <span className="text-xs font-bold text-slate-900 truncate block">{selectedCustomer.city}</span>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Order History</h4>
              
              {selectedCustomer.recentOrders.length > 0 ? (
                <div className="space-y-2">
                  {selectedCustomer.recentOrders.map((ord) => (
                    <div key={ord.id} className="p-4 rounded-2xl border border-slate-100 bg-slate-50/50 space-y-2">
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span className="text-indigo-600 font-mono">#{ord.id}</span>
                        <span className="text-slate-900">{formatPrice(ord.totalUSD)}</span>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {ord.items.map(i => `${i.quantity}x ${i.product.name}`).join(', ')}
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1">
                        <span>Date: {ord.date}</span>
                        <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-800 font-semibold uppercase">{ord.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 py-4 text-center">No completed orders yet for this profile.</p>
              )}
            </div>

            <div className="pt-3 flex justify-end gap-2">
              <button
                onClick={() => handleWhatsAppContact(selectedCustomer.phone, selectedCustomer.name)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-md"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Message on WhatsApp</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
