import React, { useState } from 'react';
import { sanitizeRowForCsv } from '../../utils/csvSafe';
import { useShop } from '../../context/ShopContext';
import { 
  TrendingUp, 
  DollarSign, 
  Package, 
  ShoppingCart, 
  Sparkles, 
  RefreshCw, 
  Eye, 
  ArrowUpRight, 
  Layers, 
  Truck,
  CheckCircle2,
  Calendar,
  Globe,
  FileText,
  Home,
  ShoppingBag,
  Search,
  CreditCard,
  User,
  Newspaper,
  Megaphone,
  Sliders,
  Download,
  FileSpreadsheet,
  Store,
  BarChart3,
  ShieldCheck
} from 'lucide-react';
import { AdminMenuTab } from './AdminSidebar';
import { RecentActivityWidget } from './RecentActivityWidget';
import { 
  downloadFullMasterReport,
  downloadSellerPerformanceReport,
  downloadStockInventoryReport
} from '../../utils/exportMasterReport';

interface EcommerceOverviewProps {
  onNavigateToTab: (tab: AdminMenuTab) => void;
}

export const EcommerceOverview: React.FC<EcommerceOverviewProps> = ({ onNavigateToTab }) => {
  const { 
    products, 
    sellers = [],
    orders, 
    cart, 
    cartTotalUSD, 
    formatPrice, 
    syncAllProductsToDatabase, 
    isVisualEditMode, 
    setIsVisualEditMode,
    showToast = () => {}
  } = useShop();

  const [isSyncingDb, setIsSyncingDb] = useState(false);

  // One definition of a completed sale, shared by every tile.
  const deliveredOrders = orders.filter(o => o.status === 'delivered');

  // Guarded so a single malformed order document cannot turn the revenue tile into
  // NaN, or crash the page outright on a missing items array.
  const totalRevenueUSD = deliveredOrders.reduce(
    (sum, o) => sum + (Number.isFinite(Number(o.totalUSD)) ? Number(o.totalUSD) : 0),
    0
  );
  const totalItemsSold = deliveredOrders.reduce(
    (sum, o) => sum + (Array.isArray(o.items)
      ? o.items.reduce((s, i) => s + (Number(i.quantity) || 0), 0)
      : 0),
    0
  );
  const activeOrdersCount = orders.filter(o => o.status !== 'delivered' && o.status !== 'cancelled' && o.status !== 'returned').length;
  const publishedProductsCount = products.filter(p => p.isPublished !== false).length;

  const handleSyncDatabase = async () => {
    setIsSyncingDb(true);
    await syncAllProductsToDatabase();
    setIsSyncingDb(false);
  };

  const handleExportMaster = () => {
    downloadFullMasterReport(products, sellers, orders);
    showToast('Master Report downloaded! Includes full Product, Seller, Stock, and Sales telemetry.', 'success');
  };

  const handleExportSellers = () => {
    downloadSellerPerformanceReport(products, sellers, orders);
    showToast('Seller Performance & Sales report downloaded successfully.', 'success');
  };

  const handleExportStock = () => {
    downloadStockInventoryReport(products, sellers, orders);
    showToast('Stock & Inventory Valuation report downloaded successfully.', 'success');
  };

  const handleExportOrders = () => {
    import('papaparse').then((Papa) => {
      const dataToExport = orders.map(ord => ({
        order_id: ord.id,
        date: ord.date,
        customer_name: ord.shipping?.fullName || 'Customer',
        phone: ord.shipping?.phone || '',
        email: ord.shipping?.email || '',
        governorate: ord.shipping?.governorate || '',
        city: ord.shipping?.city || '',
        street_address: ord.shipping?.street || '',
        building: ord.shipping?.building || '',
        delivery_notes: ord.shipping?.deliveryNotes || '',
        items_count: ord.items.reduce((s, i) => s + i.quantity, 0),
        items_summary: ord.items.map(i => `${i.quantity}x ${i.product.name}`).join('; '),
        subtotal_usd: (ord.subtotalUSD || 0).toFixed(2),
        delivery_fee_usd: (ord.deliveryFeeUSD || 0).toFixed(2),
        discount_usd: (ord.discountUSD || 0).toFixed(2),
        total_usd: (ord.totalUSD || 0).toFixed(2),
        payment_method: ord.paymentMethod,
        status: ord.status
      }));

      const csv = Papa.unparse(dataToExport.map(sanitizeRowForCsv));
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `yalla_orders_ledger_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast('Orders & Courier ledger downloaded successfully.', 'success');
    });
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner */}
      <div className="bg-white p-5 sm:p-7 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-5 relative overflow-hidden">
        <div className="relative z-10 space-y-1">
          <div className="flex items-center gap-2 text-indigo-600 text-xs font-extrabold uppercase tracking-wider">
            <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse"></span>
            <span>Operations Central</span>
          </div>
          <h2 className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-900 tracking-tight">
            <span>Yalla.lb</span> <span className="text-indigo-600">Merchant Hub</span>
          </h2>
          <p className="text-xs text-slate-500 max-w-xl">
            Real-time telemetry, courier dispatch operations, artisan catalog synchronization, and live storefront CMS management.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 sm:gap-2.5 relative z-10 w-full md:w-auto">
          <button
            onClick={() => onNavigateToTab('sales')}
            className="flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white rounded-xl text-xs font-bold tracking-wide transition-all shadow-xs hover:shadow-md cursor-pointer active:scale-95 text-center"
            title="Open dedicated Sales Analytics dashboard with period & entity filters"
          >
            <TrendingUp className="w-3.5 h-3.5 text-white shrink-0" />
            <span className="whitespace-nowrap">Sales Analytics</span>
          </button>

          <button
            id="overview-master-download-btn"
            onClick={handleExportMaster}
            className="flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold tracking-wide transition-all shadow-2xs border border-indigo-200 cursor-pointer active:scale-95 text-center"
            title="Download full 360° master dataset covering Products, Sellers, Stock, and Sales"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
            <span className="whitespace-nowrap">Master CSV</span>
          </button>

          <button
            onClick={handleSyncDatabase}
            disabled={isSyncingDb}
            className="flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-xs hover:shadow-md cursor-pointer disabled:opacity-50 active:scale-95 text-center"
            title="Save and synchronize all products & custom sections to Firestore database"
          >
            <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${isSyncingDb ? 'animate-spin' : ''}`} />
            <span className="whitespace-nowrap">{isSyncingDb ? 'Syncing...' : 'Sync Firestore'}</span>
          </button>

          <button
            onClick={() => setIsVisualEditMode(!isVisualEditMode)}
            className={`flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs active:scale-95 text-center ${
              isVisualEditMode 
                ? 'bg-amber-500 text-slate-950 ring-2 ring-amber-400 font-black' 
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
            }`}
          >
            <Eye className="w-3.5 h-3.5 shrink-0" />
            <span className="whitespace-nowrap">{isVisualEditMode ? 'Visual: ON' : 'Visual Mode'}</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Revenue */}
        <div 
          onClick={() => onNavigateToTab('sales')}
          className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-3 hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">Gross Revenue</span>
            <div className="w-9 h-9 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100/60 group-hover:scale-105 transition-transform">
              <DollarSign className="w-4.5 h-4.5" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">{formatPrice(totalRevenueUSD)}</p>
          <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-100">
            <div className="flex items-center gap-1 text-emerald-600 font-bold truncate">
              <TrendingUp className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">View Sales Analytics</span>
            </div>
            <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600 transition-colors shrink-0" />
          </div>
        </div>

        {/* Orders */}
        <div 
          onClick={() => onNavigateToTab('orders')}
          className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-3 hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">Live Orders</span>
            <div className="w-9 h-9 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100/60 group-hover:scale-105 transition-transform">
              <Package className="w-4.5 h-4.5" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">{orders.length}</p>
          <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-100">
            <span className="text-amber-600 font-bold truncate">{activeOrdersCount} In Dispatch Queue</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600 transition-colors shrink-0" />
          </div>
        </div>

        {/* Catalog Items */}
        <div 
          onClick={() => onNavigateToTab('products')}
          className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-3 hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">Catalog Items</span>
            <div className="w-9 h-9 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100/60 group-hover:scale-105 transition-transform">
              <Sparkles className="w-4.5 h-4.5" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">{products.length}</p>
          <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-100">
            <span className="text-emerald-600 font-bold truncate">{publishedProductsCount} Live in Storefront</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600 transition-colors shrink-0" />
          </div>
        </div>

        {/* Active Carts */}
        <div 
          onClick={() => onNavigateToTab('active_carts')}
          className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-3 hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">Active Carts</span>
            <div className="w-9 h-9 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-100/60 group-hover:scale-105 transition-transform">
              <ShoppingCart className="w-4.5 h-4.5" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">{cart.length > 0 ? 1 : 0}</p>
          <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-100">
            <span className="text-purple-600 font-bold truncate">{formatPrice(cartTotalUSD)} Potential Cart Value</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600 transition-colors shrink-0" />
          </div>
        </div>

      </div>

      {/* Two Column Layout: Recent Orders & Quick CMS Switch */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Recent Orders Overview */}
        <div className="lg:col-span-2 bg-white p-6 sm:p-7 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
            <div>
              <h3 className="font-extrabold text-slate-900 text-sm">Recent Store Dispatches</h3>
              <p className="text-xs text-slate-500">Latest courier orders across Beirut and Lebanese governorates</p>
            </div>
            <button
              onClick={() => onNavigateToTab('orders')}
              className="text-xs font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer flex items-center gap-1 transition-colors"
            >
              <span>View All ({orders.length})</span>
              <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {orders.slice(0, 4).map((ord) => (
              <div key={ord.id} className="py-3.5 flex items-center justify-between gap-4 first:pt-1 last:pb-1 hover:bg-slate-50/60 px-2 rounded-xl transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-xs shrink-0 border border-indigo-100/50">
                    <Truck className="w-4.5 h-4.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                      <span className="font-mono text-indigo-600 font-black">#{ord.id}</span>
                      <span className="text-slate-300">•</span>
                      <span className="truncate">{ord.shipping.fullName}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">
                      {ord.shipping.city}, {ord.shipping.governorate} • {ord.items.length} items
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="font-black text-slate-900 text-xs">{formatPrice(ord.totalUSD)}</div>
                  <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider mt-0.5 ${
                    ord.status === 'delivered' 
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                      : ord.status === 'in_transit' || ord.status === 'courier_assigned'
                      ? 'bg-sky-50 text-sky-700 border border-sky-200'
                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}>
                    {ord.status.replace(/_/g, ' ')}
                  </span>
                </div>
              </div>
            ))}

            {orders.length === 0 && (
              <div className="text-center py-8 text-slate-400 text-xs">
                No orders recorded yet. As customers checkout, deliveries will stream live here.
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions & Store Health */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
            <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
              <Globe className="w-4 h-4 text-indigo-600" />
              <span>Lebanon Operations</span>
            </h3>

            <div className="space-y-2.5 text-xs">
              <div className="p-3 bg-slate-50 rounded-2xl flex items-center justify-between border border-slate-100">
                <span className="text-slate-600 font-medium">Exchange Rate</span>
                <span className="font-mono font-bold text-slate-900">89,500 LBP / USD</span>
              </div>

              <div className="p-3 bg-slate-50 rounded-2xl flex items-center justify-between border border-slate-100">
                <span className="text-slate-600 font-medium">Beirut Same-Day Express</span>
                <span className="font-bold text-emerald-600 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  Active (3-6h)
                </span>
              </div>

              <div className="p-3 bg-slate-50 rounded-2xl flex items-center justify-between border border-slate-100">
                <span className="text-slate-600 font-medium">Payment Modes</span>
                <span className="font-bold text-slate-800">COD (USD/LBP) + Wish/OMT</span>
              </div>
            </div>
          </div>

          <RecentActivityWidget />
        </div>

      </div>

      {/* Data Intelligence & Master Business CSV Exports Hub */}
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200/80 shadow-xs space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2 text-indigo-600 text-xs font-black uppercase tracking-wider mb-1">
              <FileSpreadsheet className="w-4 h-4" />
              <span>Data Intelligence & Master Business Reports</span>
            </div>
            <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Export Complete Store Data & Telemetry
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              1-click download comprehensive CSV reports covering all product catalog details, registered suppliers, live stock valuations, and order sales.
            </p>
          </div>

          <button
            onClick={handleExportMaster}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-700 hover:from-indigo-700 hover:to-violet-800 text-white rounded-xl text-xs font-black transition-all cursor-pointer shadow-sm hover:shadow-md active:scale-95"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download Full Master CSV</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Card 1: Full Master Report */}
          <div 
            onClick={handleExportMaster}
            className="p-5 rounded-2xl border border-indigo-100 bg-indigo-50/40 hover:bg-indigo-50/80 hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-bold shadow-xs group-hover:scale-105 transition-transform">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-[10px] font-black uppercase tracking-wide">
                  Master 360°
                </span>
              </div>
              <h4 className="font-extrabold text-slate-900 text-sm group-hover:text-indigo-700">Full Master Dataset</h4>
              <p className="text-xs text-slate-500 mt-1 line-clamp-3 leading-relaxed">
                Aggregates all products, registered sellers, real-time stock, inventory valuation ($), and lifetime sales (units, revenue, order frequency).
              </p>
            </div>
            <div className="pt-3 mt-3 border-t border-indigo-100/80 flex items-center justify-between text-[11px] font-bold text-indigo-600">
              <span>{products.length} Products • {sellers.length} Sellers</span>
              <Download className="w-3.5 h-3.5 group-hover:translate-y-0.5 transition-transform" />
            </div>
          </div>

          {/* Card 2: Seller & Artisan Ledger */}
          <div 
            onClick={handleExportSellers}
            className="p-5 rounded-2xl border border-emerald-100 bg-emerald-50/30 hover:bg-emerald-50/70 hover:border-emerald-300 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-bold shadow-xs group-hover:scale-105 transition-transform">
                  <Store className="w-5 h-5" />
                </div>
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase tracking-wide">
                  Artisans
                </span>
              </div>
              <h4 className="font-extrabold text-slate-900 text-sm group-hover:text-emerald-700">Seller & Artisan Performance</h4>
              <p className="text-xs text-slate-500 mt-1 line-clamp-3 leading-relaxed">
                Artisan directory with phone numbers, linked products, total inventory units, gross sales revenue ($), and estimated payouts.
              </p>
            </div>
            <div className="pt-3 mt-3 border-t border-emerald-100/80 flex items-center justify-between text-[11px] font-bold text-emerald-700">
              <span>{sellers.length} Registered Artisans</span>
              <Download className="w-3.5 h-3.5 group-hover:translate-y-0.5 transition-transform" />
            </div>
          </div>

          {/* Card 3: Stock Inventory & Replenishment */}
          <div 
            onClick={handleExportStock}
            className="p-5 rounded-2xl border border-amber-100 bg-amber-50/30 hover:bg-amber-50/70 hover:border-amber-300 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-600 text-white flex items-center justify-center font-bold shadow-xs group-hover:scale-105 transition-transform">
                  <Package className="w-5 h-5" />
                </div>
                <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-black uppercase tracking-wide">
                  Stock Alert
                </span>
              </div>
              <h4 className="font-extrabold text-slate-900 text-sm group-hover:text-amber-700">Inventory & Replenishment</h4>
              <p className="text-xs text-slate-500 mt-1 line-clamp-3 leading-relaxed">
                Stock health status (Out of Stock, Low Stock, Healthy), inventory USD valuation, stock threshold warnings, and reordering phone numbers.
              </p>
            </div>
            <div className="pt-3 mt-3 border-t border-amber-100/80 flex items-center justify-between text-[11px] font-bold text-amber-700">
              <span>{products.filter(p => (p.stock || 0) < 5).length} Low Stock SKUs</span>
              <Download className="w-3.5 h-3.5 group-hover:translate-y-0.5 transition-transform" />
            </div>
          </div>

          {/* Card 4: Orders & Courier Dispatch */}
          <div 
            onClick={handleExportOrders}
            className="p-5 rounded-2xl border border-sky-100 bg-sky-50/30 hover:bg-sky-50/70 hover:border-sky-300 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-2xl bg-sky-600 text-white flex items-center justify-center font-bold shadow-xs group-hover:scale-105 transition-transform">
                  <Truck className="w-5 h-5" />
                </div>
                <span className="px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 text-[10px] font-black uppercase tracking-wide">
                  Logistics
                </span>
              </div>
              <h4 className="font-extrabold text-slate-900 text-sm group-hover:text-sky-700">Courier Orders Ledger</h4>
              <p className="text-xs text-slate-500 mt-1 line-clamp-3 leading-relaxed">
                Fulfillment ledger with Lebanese delivery addresses, customer phone numbers, item line breakdowns, delivery fees, and order status.
              </p>
            </div>
            <div className="pt-3 mt-3 border-t border-sky-100/80 flex items-center justify-between text-[11px] font-bold text-sky-700">
              <span>{orders.length} Total Orders Recorded</span>
              <Download className="w-3.5 h-3.5 group-hover:translate-y-0.5 transition-transform" />
            </div>
          </div>

        </div>
      </div>

      {/* Page Content & CMS Quick Management Grid */}
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200/80 shadow-xs space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2 text-indigo-600 text-xs font-black uppercase tracking-wider mb-1">
              <Layers className="w-4 h-4" />
              <span>Direct Page Content Management</span>
            </div>
            <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Manage Content for Each Storefront Page
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Click any page below to instantly customize headlines, banners, guarantees, and visibility.
            </p>
          </div>

          <button
            onClick={() => onNavigateToTab('pages_cms')}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-black transition-all cursor-pointer shadow-xs border border-indigo-100/60 active:scale-95"
          >
            <span>Open Full CMS Studio</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          
          {/* Home Page */}
          <div 
            onClick={() => onNavigateToTab('page_home')}
            className="p-5 rounded-2xl border border-slate-200/80 hover:border-indigo-400 hover:shadow-md transition-all cursor-pointer group bg-slate-50/40 hover:bg-white flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-lg border border-amber-100/80 group-hover:scale-105 transition-transform">
                  🏠
                </div>
                <span className="text-[11px] font-extrabold text-indigo-600 group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                  Edit Page <ArrowUpRight className="w-3 h-3" />
                </span>
              </div>
              <h4 className="font-extrabold text-slate-900 text-sm">Home Page</h4>
              <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                Hero title, subtitle, CTA buttons, metrics stats, deals slides, and newsletter copy.
              </p>
            </div>
          </div>

          {/* Catalog Page */}
          <div 
            onClick={() => onNavigateToTab('page_products')}
            className="p-5 rounded-2xl border border-slate-200/80 hover:border-indigo-400 hover:shadow-md transition-all cursor-pointer group bg-slate-50/40 hover:bg-white flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-lg border border-indigo-100/80 group-hover:scale-105 transition-transform">
                  🛍️
                </div>
                <span className="text-[11px] font-extrabold text-indigo-600 group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                  Edit Page <ArrowUpRight className="w-3 h-3" />
                </span>
              </div>
              <h4 className="font-extrabold text-slate-900 text-sm">Products Catalog Page</h4>
              <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                Catalog banner title, search placeholder text, filters bar, and subtitle.
              </p>
            </div>
          </div>

          {/* Product Detail Page */}
          <div 
            onClick={() => onNavigateToTab('page_detail')}
            className="p-5 rounded-2xl border border-slate-200/80 hover:border-indigo-400 hover:shadow-md transition-all cursor-pointer group bg-slate-50/40 hover:bg-white flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold text-lg border border-purple-100/80 group-hover:scale-105 transition-transform">
                  🔍
                </div>
                <span className="text-[11px] font-extrabold text-indigo-600 group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                  Edit Page <ArrowUpRight className="w-3 h-3" />
                </span>
              </div>
              <h4 className="font-extrabold text-slate-900 text-sm">Product Detail View</h4>
              <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                WhatsApp inquiry button & phone, authenticity guarantee, delivery speed, and return policy.
              </p>
            </div>
          </div>

          {/* Checkout Page */}
          <div 
            onClick={() => onNavigateToTab('page_checkout')}
            className="p-5 rounded-2xl border border-slate-200/80 hover:border-indigo-400 hover:shadow-md transition-all cursor-pointer group bg-slate-50/40 hover:bg-white flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-lg border border-emerald-100/80 group-hover:scale-105 transition-transform">
                  💳
                </div>
                <span className="text-[11px] font-extrabold text-indigo-600 group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                  Edit Page <ArrowUpRight className="w-3 h-3" />
                </span>
              </div>
              <h4 className="font-extrabold text-slate-900 text-sm">Checkout Page</h4>
              <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                Order submission button label, guarantee badges, payment methods copy, and courier terms.
              </p>
            </div>
          </div>

          {/* Account Page */}
          <div 
            onClick={() => onNavigateToTab('page_account')}
            className="p-5 rounded-2xl border border-slate-200/80 hover:border-indigo-400 hover:shadow-md transition-all cursor-pointer group bg-slate-50/40 hover:bg-white flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-lg border border-blue-100/80 group-hover:scale-105 transition-transform">
                  👤
                </div>
                <span className="text-[11px] font-extrabold text-indigo-600 group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                  Edit Page <ArrowUpRight className="w-3 h-3" />
                </span>
              </div>
              <h4 className="font-extrabold text-slate-900 text-sm">Account & Profile</h4>
              <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                Account portal title, orders history tab text, and patron support links.
              </p>
            </div>
          </div>

          {/* News & Stories */}
          <div 
            onClick={() => onNavigateToTab('page_news')}
            className="p-5 rounded-2xl border border-slate-200/80 hover:border-indigo-400 hover:shadow-md transition-all cursor-pointer group bg-slate-50/40 hover:bg-white flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold text-lg border border-rose-100/80 group-hover:scale-105 transition-transform">
                  📰
                </div>
                <span className="text-[11px] font-extrabold text-indigo-600 group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                  Edit Page <ArrowUpRight className="w-3 h-3" />
                </span>
              </div>
              <h4 className="font-extrabold text-slate-900 text-sm">News & Artisan Stories</h4>
              <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                Lebanese craft articles, titles, dates, excerpts, and reading times.
              </p>
            </div>
          </div>

          {/* Navbar & Header */}
          <div 
            onClick={() => onNavigateToTab('page_navbar')}
            className="p-5 rounded-2xl border border-slate-200/80 hover:border-indigo-400 hover:shadow-md transition-all cursor-pointer group bg-slate-50/40 hover:bg-white flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center font-bold text-lg border border-teal-100/80 group-hover:scale-105 transition-transform">
                  🧭
                </div>
                <span className="text-[11px] font-extrabold text-indigo-600 group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                  Edit Page <ArrowUpRight className="w-3 h-3" />
                </span>
              </div>
              <h4 className="font-extrabold text-slate-900 text-sm">Navbar & Header</h4>
              <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                Top announcement ticker text, brand name & slogan, phone support hotline.
              </p>
            </div>
          </div>

          {/* Footer & Contact */}
          <div 
            onClick={() => onNavigateToTab('page_footer')}
            className="p-5 rounded-2xl border border-slate-200/80 hover:border-indigo-400 hover:shadow-md transition-all cursor-pointer group bg-slate-50/40 hover:bg-white flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-2xl bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-lg border border-slate-200/80 group-hover:scale-105 transition-transform">
                  🦶
                </div>
                <span className="text-[11px] font-extrabold text-indigo-600 group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                  Edit Page <ArrowUpRight className="w-3 h-3" />
                </span>
              </div>
              <h4 className="font-extrabold text-slate-900 text-sm">Footer & Contact Info</h4>
              <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                About terroir story, support email, phone numbers, and copyright disclaimer.
              </p>
            </div>
          </div>

          {/* Custom Divs & Visibility */}
          <div 
            onClick={() => onNavigateToTab('page_custom_blocks')}
            className="p-5 rounded-2xl border border-slate-200/80 hover:border-indigo-400 hover:shadow-md transition-all cursor-pointer group bg-slate-50/40 hover:bg-white flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-2xl bg-cyan-50 text-cyan-600 flex items-center justify-center font-bold text-lg border border-cyan-100/80 group-hover:scale-105 transition-transform">
                  🧱
                </div>
                <span className="text-[11px] font-extrabold text-indigo-600 group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                  Edit Blocks <ArrowUpRight className="w-3 h-3" />
                </span>
              </div>
              <h4 className="font-extrabold text-slate-900 text-sm">Custom Divs & Banners</h4>
              <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                Create and place bespoke promotional blocks, badges, banners, and CTA buttons on any page.
              </p>
            </div>
          </div>

        </div>
      </div>

    </div>
  );
};
