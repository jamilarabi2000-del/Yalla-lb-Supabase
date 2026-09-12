import React, { useState, useMemo } from 'react';
import { useShop } from '../../context/ShopContext';
import { Order, Product, Seller } from '../../types';
import { LBP_USD_RATE } from '../../data/regions';
import {
  TrendingUp,
  Calendar,
  DollarSign,
  Package,
  Store,
  Users,
  Layers,
  Truck,
  Filter,
  Download,
  Search,
  ArrowUpRight,
  ArrowDownRight,
  ChevronDown,
  RefreshCw,
  Eye,
  CheckCircle2,
  Clock,
  XCircle,
  Phone,
  MessageSquare,
  FileSpreadsheet,
  BarChart3,
  PieChart,
  CalendarDays,
  Percent,
  Receipt
} from 'lucide-react';

type DateRangePreset = 
  | 'today' 
  | 'yesterday' 
  | 'last_7_days' 
  | 'last_30_days' 
  | 'this_month' 
  | 'last_month' 
  | 'this_year' 
  | 'all_time' 
  | 'custom';

type SalesTab = 
  | 'overview' 
  | 'products' 
  | 'sellers' 
  | 'customers' 
  | 'categories' 
  | 'orders';

export const SalesAnalyticsView: React.FC = () => {
  const { 
    orders = [], 
    products = [], 
    sellers = [], 
    categories = [],
    formatPrice,
    showToast = () => {}
  } = useShop();

  // Active sub-tab
  const [activeTab, setActiveTab] = useState<SalesTab>('overview');

  // Date Filter State
  const [datePreset, setDatePreset] = useState<DateRangePreset>('this_month');
  const [customStartDate, setCustomStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(1); // 1st of current month
    return d.toISOString().slice(0, 10);
  });
  const [customEndDate, setCustomEndDate] = useState<string>(() => {
    return new Date().toISOString().slice(0, 10);
  });

  // Dimension Specific Filters
  const [selectedProductId, setSelectedProductId] = useState<string>('all');
  const [selectedSeller, setSelectedSeller] = useState<string>('all');
  const [selectedCustomerSearch, setSelectedCustomerSearch] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedOrderStatus, setSelectedOrderStatus] = useState<string>('exclude_cancelled');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Selected Order for Quick Preview
  const [inspectingOrder, setInspectingOrder] = useState<Order | null>(null);

  // Compute Active Date Range Bounds
  const { startDate, endDate } = useMemo(() => {
    const now = new Date();
    const start = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    if (datePreset === 'today') {
      start.setHours(0, 0, 0, 0);
      return { startDate: start, endDate: end };
    }
    if (datePreset === 'yesterday') {
      start.setDate(now.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      const yesterdayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
      return { startDate: start, endDate: yesterdayEnd };
    }
    if (datePreset === 'last_7_days') {
      start.setDate(now.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      return { startDate: start, endDate: end };
    }
    if (datePreset === 'last_30_days') {
      start.setDate(now.getDate() - 29);
      start.setHours(0, 0, 0, 0);
      return { startDate: start, endDate: end };
    }
    if (datePreset === 'this_month') {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      return { startDate: start, endDate: end };
    }
    if (datePreset === 'last_month') {
      const firstDayPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      const lastDayPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { startDate: firstDayPrevMonth, endDate: lastDayPrevMonth };
    }
    if (datePreset === 'this_year') {
      const firstDayYear = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      return { startDate: firstDayYear, endDate: end };
    }
    if (datePreset === 'custom') {
      const s = customStartDate ? new Date(`${customStartDate}T00:00:00`) : new Date(0);
      const e = customEndDate ? new Date(`${customEndDate}T23:59:59.999`) : end;
      return { startDate: s, endDate: e };
    }

    // 'all_time' — genuinely all of it.
    return { startDate: new Date(0), endDate: end };
  }, [datePreset, customStartDate, customEndDate]);

  // Filter Orders by Date Range & Status & Payment & Customer
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      // 1. Date filter.
      // An unparseable date must exclude the order from a dated report, not slip
      // through it: every comparison against an Invalid Date is false, so such an
      // order previously counted inside every period at once.
      const orderDate = new Date(order.date);
      if (!Number.isFinite(orderDate.getTime())) {
        return false;
      }
      if (orderDate < startDate || orderDate > endDate) {
        return false;
      }

      // 2. Status filter
      if (selectedOrderStatus === 'exclude_cancelled') {
        if (order.status === 'cancelled' || order.status === 'returned') return false;
      } else if (selectedOrderStatus !== 'all') {
        if (order.status !== selectedOrderStatus) return false;
      }

      // 3. Payment Method filter
      if (selectedPaymentMethod !== 'all') {
        if (order.paymentMethod !== selectedPaymentMethod) return false;
      }

      // 4. Customer search filter
      if (selectedCustomerSearch.trim()) {
        const query = selectedCustomerSearch.toLowerCase();
        const customerName = (order.shipping?.fullName || '').toLowerCase();
        const customerPhone = (order.shipping?.phone || '').toLowerCase();
        const customerEmail = (order.shipping?.email || '').toLowerCase();
        const match = customerName.includes(query) || customerPhone.includes(query) || customerEmail.includes(query);
        if (!match) return false;
      }

      // 5. Product or Seller or Category filter on items
      if (selectedProductId !== 'all' || selectedSeller !== 'all' || selectedCategory !== 'all') {
        const hasMatchingItem = order.items.some(item => {
          if (selectedProductId !== 'all' && item.product.id !== selectedProductId) return false;
          
          if (selectedSeller !== 'all') {
            const sName = (item.product.seller || item.product.artisan || '').trim().toLowerCase();
            if (sName !== selectedSeller.toLowerCase()) return false;
          }

          if (selectedCategory !== 'all') {
            if (item.product.category !== selectedCategory) return false;
          }

          return true;
        });

        if (!hasMatchingItem) return false;
      }

      return true;
    });
  }, [
    orders,
    startDate,
    endDate,
    selectedOrderStatus,
    selectedPaymentMethod,
    selectedCustomerSearch,
    selectedProductId,
    selectedSeller,
    selectedCategory
  ]);

  // Aggregate Period KPIs
  const kpis = useMemo(() => {
    let grossRevenueUSD = 0;
    let deliveredRevenueUSD = 0;
    let totalUnitsSold = 0;
    let totalDeliveredUnits = 0;
    let totalDiscountUSD = 0;
    let totalDeliveryFeesUSD = 0;
    const buyerPhoneSet = new Set<string>();

    filteredOrders.forEach(order => {
      const isDelivered = order.status === 'delivered';
      const isCancelled = order.status === 'cancelled' || order.status === 'returned';

      if (isCancelled && selectedOrderStatus !== 'cancelled') {
        return;
      }

      if (order.shipping?.phone) {
        buyerPhoneSet.add(order.shipping.phone.replace(/[^0-9]/g, ''));
      }

      totalDiscountUSD += (order.discountUSD || 0);
      totalDeliveryFeesUSD += (order.deliveryFeeUSD || 0);

      // Sum revenue based on items matching the active filters
      order.items.forEach(item => {
        if (selectedProductId !== 'all' && item.product.id !== selectedProductId) return;
        if (selectedSeller !== 'all') {
          const sName = (item.product.seller || item.product.artisan || '').trim().toLowerCase();
          if (sName !== selectedSeller.toLowerCase()) return;
        }
        if (selectedCategory !== 'all' && item.product.category !== selectedCategory) return;

        const qty = item.quantity || 1;
        const lineRev = (item.product.priceUSD || 0) * qty;

        grossRevenueUSD += lineRev;
        totalUnitsSold += qty;

        if (isDelivered) {
          deliveredRevenueUSD += lineRev;
          totalDeliveredUnits += qty;
        }
      });
    });

    const ordersCount = filteredOrders.length;
    const avgOrderValue = ordersCount > 0 ? grossRevenueUSD / ordersCount : 0;

    return {
      grossRevenueUSD,
      deliveredRevenueUSD,
      totalUnitsSold,
      totalDeliveredUnits,
      ordersCount,
      avgOrderValue,
      uniqueBuyers: buyerPhoneSet.size,
      totalDiscountUSD,
      totalDeliveryFeesUSD
    };
  }, [filteredOrders, selectedProductId, selectedSeller, selectedCategory]);

  // 1. PRODUCT SALES BREAKDOWN IN FILTERED PERIOD
  const productSales = useMemo(() => {
    const map = new Map<string, {
      product: Product;
      unitsSold: number;
      deliveredUnits: number;
      revenueUSD: number;
      deliveredRevenueUSD: number;
      ordersCount: number;
      orderIds: Set<string>;
    }>();

    filteredOrders.forEach(order => {
      const isDelivered = order.status === 'delivered';
      order.items.forEach(item => {
        const p = item.product;
        if (selectedProductId !== 'all' && p.id !== selectedProductId) return;
        if (selectedSeller !== 'all') {
          const sName = (p.seller || p.artisan || '').trim().toLowerCase();
          if (sName !== selectedSeller.toLowerCase()) return;
        }
        if (selectedCategory !== 'all' && p.category !== selectedCategory) return;

        if (!map.has(p.id)) {
          // Find rich product definition from catalog if available
          const fullProduct = products.find(prod => prod.id === p.id) || p;
          map.set(p.id, {
            product: fullProduct,
            unitsSold: 0,
            deliveredUnits: 0,
            revenueUSD: 0,
            deliveredRevenueUSD: 0,
            ordersCount: 0,
            orderIds: new Set<string>()
          });
        }

        const entry = map.get(p.id)!;
        const qty = item.quantity || 1;
        const rev = (p.priceUSD || 0) * qty;

        entry.unitsSold += qty;
        entry.revenueUSD += rev;
        entry.orderIds.add(order.id);

        if (isDelivered) {
          entry.deliveredUnits += qty;
          entry.deliveredRevenueUSD += rev;
        }
      });
    });

    return Array.from(map.values())
      .map(entry => ({
        ...entry,
        ordersCount: entry.orderIds.size,
        revenueShare: kpis.grossRevenueUSD > 0 ? (entry.revenueUSD / kpis.grossRevenueUSD) * 100 : 0
      }))
      .sort((a, b) => b.revenueUSD - a.revenueUSD);
  }, [filteredOrders, products, selectedProductId, selectedSeller, selectedCategory, kpis.grossRevenueUSD]);

  // 2. SELLER SALES BREAKDOWN IN FILTERED PERIOD
  const sellerSales = useMemo(() => {
    const map = new Map<string, {
      sellerName: string;
      sellerObj?: Seller;
      unitsSold: number;
      deliveredUnits: number;
      grossRevenueUSD: number;
      deliveredRevenueUSD: number;
      ordersCount: number;
      orderIds: Set<string>;
      productsSoldMap: Set<string>;
    }>();

    filteredOrders.forEach(order => {
      const isDelivered = order.status === 'delivered';
      order.items.forEach(item => {
        const p = item.product;
        const sName = (p.seller || p.artisan || 'Local Producer').trim();
        if (selectedSeller !== 'all' && sName.toLowerCase() !== selectedSeller.toLowerCase()) return;
        if (selectedProductId !== 'all' && p.id !== selectedProductId) return;
        if (selectedCategory !== 'all' && p.category !== selectedCategory) return;

        const key = sName.toLowerCase();
        if (!map.has(key)) {
          const matchedSeller = sellers.find(s => s.nameEn.toLowerCase() === key || s.id.toLowerCase() === key);
          map.set(key, {
            sellerName: sName,
            sellerObj: matchedSeller,
            unitsSold: 0,
            deliveredUnits: 0,
            grossRevenueUSD: 0,
            deliveredRevenueUSD: 0,
            ordersCount: 0,
            orderIds: new Set<string>(),
            productsSoldMap: new Set<string>()
          });
        }

        const entry = map.get(key)!;
        const qty = item.quantity || 1;
        const rev = (p.priceUSD || 0) * qty;

        entry.unitsSold += qty;
        entry.grossRevenueUSD += rev;
        entry.orderIds.add(order.id);
        entry.productsSoldMap.add(p.id);

        if (isDelivered) {
          entry.deliveredUnits += qty;
          entry.deliveredRevenueUSD += rev;
        }
      });
    });

    return Array.from(map.values())
      .map(entry => {
        const commPct = entry.sellerObj?.commissionPct || 0;
        const estimatedPayout = entry.grossRevenueUSD * (1 - commPct / 100);
        return {
          ...entry,
          ordersCount: entry.orderIds.size,
          uniqueProductsCount: entry.productsSoldMap.size,
          commissionPct: commPct,
          estimatedPayoutUSD: estimatedPayout,
          revenueShare: kpis.grossRevenueUSD > 0 ? (entry.grossRevenueUSD / kpis.grossRevenueUSD) * 100 : 0
        };
      })
      .sort((a, b) => b.grossRevenueUSD - a.grossRevenueUSD);
  }, [filteredOrders, sellers, selectedSeller, selectedProductId, selectedCategory, kpis.grossRevenueUSD]);

  // 3. CUSTOMER SALES BREAKDOWN IN FILTERED PERIOD
  const customerSales = useMemo(() => {
    const map = new Map<string, {
      customerName: string;
      phone: string;
      email: string;
      governorate: string;
      city: string;
      ordersCount: number;
      totalSpentUSD: number;
      totalUnitsBought: number;
      lastOrderDate: string;
      orderIds: string[];
    }>();

    filteredOrders.forEach(order => {
      const phone = order.shipping?.phone || 'No phone';
      const key = phone.replace(/[^0-9]/g, '') || (order.shipping?.email || order.id);

      if (!map.has(key)) {
        map.set(key, {
          customerName: order.shipping?.fullName || 'Anonymous Customer',
          phone: order.shipping?.phone || '',
          email: order.shipping?.email || '',
          governorate: order.shipping?.governorate || '',
          city: order.shipping?.city || '',
          ordersCount: 0,
          totalSpentUSD: 0,
          totalUnitsBought: 0,
          lastOrderDate: order.date || '',
          orderIds: []
        });
      }

      const entry = map.get(key)!;
      entry.ordersCount += 1;
      entry.orderIds.push(order.id);
      
      // Calculate spent on filtered items
      let orderSpent = 0;
      let orderUnits = 0;
      order.items.forEach(item => {
        if (selectedProductId !== 'all' && item.product.id !== selectedProductId) return;
        if (selectedSeller !== 'all') {
          const sName = (item.product.seller || item.product.artisan || '').trim().toLowerCase();
          if (sName !== selectedSeller.toLowerCase()) return;
        }
        if (selectedCategory !== 'all' && item.product.category !== selectedCategory) return;

        const qty = item.quantity || 1;
        orderUnits += qty;
        orderSpent += (item.product.priceUSD || 0) * qty;
      });

      entry.totalSpentUSD += orderSpent;
      entry.totalUnitsBought += orderUnits;

      if (order.date && (!entry.lastOrderDate || new Date(order.date) > new Date(entry.lastOrderDate))) {
        entry.lastOrderDate = order.date;
      }
    });

    return Array.from(map.values())
      .filter(c => c.totalSpentUSD > 0)
      .map(entry => ({
        ...entry,
        avgBasketUSD: entry.ordersCount > 0 ? entry.totalSpentUSD / entry.ordersCount : 0
      }))
      .sort((a, b) => b.totalSpentUSD - a.totalSpentUSD);
  }, [filteredOrders, selectedProductId, selectedSeller, selectedCategory]);

  // 4. CATEGORY SALES BREAKDOWN IN FILTERED PERIOD
  const categorySales = useMemo(() => {
    const map = new Map<string, {
      category: string;
      unitsSold: number;
      revenueUSD: number;
      ordersCount: number;
      orderIds: Set<string>;
      productIds: Set<string>;
    }>();

    filteredOrders.forEach(order => {
      order.items.forEach(item => {
        const cat = item.product.category || 'General';
        if (selectedCategory !== 'all' && cat !== selectedCategory) return;
        if (selectedProductId !== 'all' && item.product.id !== selectedProductId) return;
        if (selectedSeller !== 'all') {
          const sName = (item.product.seller || item.product.artisan || '').trim().toLowerCase();
          if (sName !== selectedSeller.toLowerCase()) return;
        }

        if (!map.has(cat)) {
          map.set(cat, {
            category: cat,
            unitsSold: 0,
            revenueUSD: 0,
            ordersCount: 0,
            orderIds: new Set<string>(),
            productIds: new Set<string>()
          });
        }

        const entry = map.get(cat)!;
        const qty = item.quantity || 1;
        const rev = (item.product.priceUSD || 0) * qty;

        entry.unitsSold += qty;
        entry.revenueUSD += rev;
        entry.orderIds.add(order.id);
        entry.productIds.add(item.product.id);
      });
    });

    return Array.from(map.values())
      .map(entry => ({
        ...entry,
        ordersCount: entry.orderIds.size,
        uniqueProductsCount: entry.productIds.size,
        revenueShare: kpis.grossRevenueUSD > 0 ? (entry.revenueUSD / kpis.grossRevenueUSD) * 100 : 0
      }))
      .sort((a, b) => b.revenueUSD - a.revenueUSD);
  }, [filteredOrders, selectedCategory, selectedProductId, selectedSeller, kpis.grossRevenueUSD]);

  // 5. DAILY / TIMELINE AGGREGATION FOR CHART
  const dailyTimeline = useMemo(() => {
    const dateMap = new Map<string, { dateStr: string; label: string; revenueUSD: number; ordersCount: number; unitsSold: number }>();

    filteredOrders.forEach(order => {
      const rawDate = order.date ? new Date(order.date) : new Date();
      const key = rawDate.toISOString().slice(0, 10);
      const label = rawDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      if (!dateMap.has(key)) {
        dateMap.set(key, {
          dateStr: key,
          label,
          revenueUSD: 0,
          ordersCount: 0,
          unitsSold: 0
        });
      }

      const entry = dateMap.get(key)!;
      entry.ordersCount += 1;

      order.items.forEach(item => {
        if (selectedProductId !== 'all' && item.product.id !== selectedProductId) return;
        if (selectedSeller !== 'all') {
          const sName = (item.product.seller || item.product.artisan || '').trim().toLowerCase();
          if (sName !== selectedSeller.toLowerCase()) return;
        }
        if (selectedCategory !== 'all' && item.product.category !== selectedCategory) return;

        const qty = item.quantity || 1;
        entry.unitsSold += qty;
        entry.revenueUSD += (item.product.priceUSD || 0) * qty;
      });
    });

    return Array.from(dateMap.values()).sort((a, b) => a.dateStr.localeCompare(b.dateStr));
  }, [filteredOrders, selectedProductId, selectedSeller, selectedCategory]);

  // Clear all filters
  const handleResetFilters = () => {
    setDatePreset('this_month');
    setSelectedProductId('all');
    setSelectedSeller('all');
    setSelectedCustomerSearch('');
    setSelectedCategory('all');
    setSelectedOrderStatus('exclude_cancelled');
    setSelectedPaymentMethod('all');
    setSearchTerm('');
    showToast('Sales filters reset to default (Current Month)', 'info');
  };

  // CSV EXPORTERS FOR SALES
  const handleExportFilteredSalesCSV = () => {
    if (activeTab === 'products') {
      const data = productSales.map(p => ({
        product_id: p.product.id,
        seller_item_code: p.product.sellerItemCode || '',
        product_name: p.product.name,
        arabic_name: p.product.arabicName || '',
        category: p.product.category,
        seller_artisan: p.product.seller || p.product.artisan || 'Local Producer',
        unit_price_usd: (p.product.priceUSD || 0).toFixed(2),
        units_sold_in_period: p.unitsSold,
        delivered_units: p.deliveredUnits,
        period_revenue_usd: p.revenueUSD.toFixed(2),
        period_delivered_revenue_usd: p.deliveredRevenueUSD.toFixed(2),
        revenue_share_pct: `${p.revenueShare.toFixed(1)}%`,
        orders_count: p.ordersCount
      }));
      downloadCSV(data, `sales_by_products_${startDate.toISOString().slice(0, 10)}_to_${endDate.toISOString().slice(0, 10)}.csv`);
    } else if (activeTab === 'sellers') {
      const data = sellerSales.map(s => ({
        seller_name: s.sellerName,
        region: s.sellerObj?.region || 'Lebanon',
        contact_phone: s.sellerObj?.contactPhone || '',
        products_sold_count: s.uniqueProductsCount,
        units_sold_in_period: s.unitsSold,
        delivered_units: s.deliveredUnits,
        gross_sales_usd: s.grossRevenueUSD.toFixed(2),
        delivered_sales_usd: s.deliveredRevenueUSD.toFixed(2),
        commission_rate_pct: `${s.commissionPct}%`,
        estimated_payout_usd: s.estimatedPayoutUSD.toFixed(2),
        orders_count: s.ordersCount,
        revenue_share_pct: `${s.revenueShare.toFixed(1)}%`
      }));
      downloadCSV(data, `sales_by_sellers_${startDate.toISOString().slice(0, 10)}_to_${endDate.toISOString().slice(0, 10)}.csv`);
    } else if (activeTab === 'customers') {
      const data = customerSales.map(c => ({
        customer_name: c.customerName,
        phone: c.phone,
        email: c.email,
        governorate: c.governorate,
        city: c.city,
        orders_in_period: c.ordersCount,
        units_bought: c.totalUnitsBought,
        total_spent_usd: c.totalSpentUSD.toFixed(2),
        average_basket_usd: c.avgBasketUSD.toFixed(2),
        last_order_date: c.lastOrderDate
      }));
      downloadCSV(data, `sales_by_customers_${startDate.toISOString().slice(0, 10)}_to_${endDate.toISOString().slice(0, 10)}.csv`);
    } else if (activeTab === 'categories') {
      const data = categorySales.map(cat => ({
        category_name: cat.category,
        products_sold: cat.uniqueProductsCount,
        units_sold: cat.unitsSold,
        revenue_usd: cat.revenueUSD.toFixed(2),
        revenue_share_pct: `${cat.revenueShare.toFixed(1)}%`,
        orders_count: cat.ordersCount
      }));
      downloadCSV(data, `sales_by_categories_${startDate.toISOString().slice(0, 10)}_to_${endDate.toISOString().slice(0, 10)}.csv`);
    } else {
      // Default: Granular Orders Ledger in period
      const data = filteredOrders.map(ord => ({
        order_id: ord.id,
        date: ord.date,
        customer_name: ord.shipping?.fullName || 'Customer',
        phone: ord.shipping?.phone || '',
        email: ord.shipping?.email || '',
        governorate: ord.shipping?.governorate || '',
        city: ord.shipping?.city || '',
        items_summary: ord.items.map(i => `${i.quantity}x ${i.product.name}`).join('; '),
        total_items: ord.items.reduce((s, i) => s + i.quantity, 0),
        subtotal_usd: (ord.subtotalUSD || 0).toFixed(2),
        delivery_fee_usd: (ord.deliveryFeeUSD || 0).toFixed(2),
        discount_usd: (ord.discountUSD || 0).toFixed(2),
        total_order_usd: (ord.totalUSD || 0).toFixed(2),
        payment_method: ord.paymentMethod,
        fulfillment_status: ord.status
      }));
      downloadCSV(data, `sales_orders_period_ledger_${startDate.toISOString().slice(0, 10)}_to_${endDate.toISOString().slice(0, 10)}.csv`);
    }

    showToast('Sales Report CSV generated and downloaded successfully.', 'success');
  };

  const downloadCSV = async (data: any[], filename: string) => {
    const { default: Papa } = await import('papaparse');
    const { sanitizeRowForCsv } = await import('../../utils/csvSafe');
    const csv = Papa.unparse(data.map(sanitizeRowForCsv));
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      
      {/* 1. TOP HEADER & TITLE */}
      <div className="bg-white p-6 sm:p-7 rounded-3xl border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white flex items-center justify-center shadow-sm">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Sales Analytics & Commercial Insights
              </h2>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-black uppercase tracking-wider">
                Live Data
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Analyze sales performance across custom periods, products, artisans, customer accounts, and Lebanese regions.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleResetFilters}
            className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all border border-slate-200 shadow-2xs cursor-pointer flex items-center gap-1.5 active:scale-95"
            title="Reset all filters"
          >
            <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
            <span>Reset Filters</span>
          </button>

          <button
            onClick={handleExportFilteredSalesCSV}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black transition-all cursor-pointer shadow-xs hover:shadow-md active:scale-95"
            title="Export currently filtered dataset to CSV"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Sales CSV</span>
          </button>
        </div>
      </div>

      {/* 2. TIME PERIOD & SPECIFICATION CONTROL PANEL */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-5">
        
        {/* Date Range Presets */}
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-indigo-600" />
              <span>Select Sales Period:</span>
            </span>

            <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100">
              {startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              {' — '}
              {endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'today', label: 'Today' },
              { id: 'yesterday', label: 'Yesterday' },
              { id: 'last_7_days', label: 'Last 7 Days' },
              { id: 'last_30_days', label: 'Last 30 Days' },
              { id: 'this_month', label: 'This Month' },
              { id: 'last_month', label: 'Last Month' },
              { id: 'this_year', label: 'This Year' },
              { id: 'all_time', label: 'All Time' },
              { id: 'custom', label: 'Custom Range' },
            ].map((preset) => (
              <button
                key={preset.id}
                onClick={() => setDatePreset(preset.id as DateRangePreset)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  datePreset === preset.id
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Custom Date Pickers if 'custom' is active */}
          {datePreset === 'custom' && (
            <div className="mt-3.5 p-4 rounded-2xl bg-indigo-50/50 border border-indigo-100 flex flex-wrap items-center gap-4 animate-in fade-in duration-150">
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-slate-700">From Date:</label>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-slate-700">To Date:</label>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          )}
        </div>

        {/* Dimension & Entity Specifications (Product, Seller, Customer, Status, Category) */}
        <div className="pt-4 border-t border-slate-100">
          <div className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2.5 flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-indigo-600" />
            <span>Specify Breakdown & Filters:</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            
            {/* 1. Filter Product */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Product / SKU</label>
              <select
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-xs font-semibold rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500"
              >
                <option value="all">All Products ({products.length} items)</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} (${p.priceUSD})
                  </option>
                ))}
              </select>
            </div>

            {/* 2. Filter Seller / Artisan */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Seller / Producer</label>
              <select
                value={selectedSeller}
                onChange={(e) => setSelectedSeller(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-xs font-semibold rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500"
              >
                <option value="all">All Sellers / Artisans</option>
                {Array.from(new Set(products.map(p => (p.seller || p.artisan || '').trim()).filter(Boolean))).map(s => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            {/* 3. Filter Category */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Category</label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-xs font-semibold rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500"
              >
                <option value="all">All Categories</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.nameEn}
                  </option>
                ))}
              </select>
            </div>

            {/* 4. Filter Order Status */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Order Status</label>
              <select
                value={selectedOrderStatus}
                onChange={(e) => setSelectedOrderStatus(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-xs font-semibold rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500"
              >
                <option value="exclude_cancelled">Active & Completed (No cancelled)</option>
                <option value="delivered">Delivered Only (Cash Settled)</option>
                <option value="processing">Processing & In Transit</option>
                <option value="pending">Pending Confirmation</option>
                <option value="all">All Orders (Including Cancelled)</option>
                <option value="cancelled">Cancelled Orders Only</option>
              </select>
            </div>

            {/* 5. Filter Customer / Search */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Customer / Phone</label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter name or phone..."
                  value={selectedCustomerSearch}
                  onChange={(e) => setSelectedCustomerSearch(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-xs font-semibold rounded-xl pl-8 pr-3 py-2 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

          </div>
        </div>

      </div>

      {/* 3. EXECUTIVE KPI CARDS FOR SELECTED PERIOD */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 sm:gap-4">
        
        {/* Gross Sales */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">Gross Sales Revenue</span>
          <div className="text-xl sm:text-2xl font-black text-slate-900">{formatPrice(kpis.grossRevenueUSD)}</div>
          <span className="text-[10px] text-slate-400 font-semibold mt-0.5 block">
            {(kpis.grossRevenueUSD * LBP_USD_RATE).toLocaleString('en-US')} LBP
          </span>
        </div>

        {/* Delivered Sales */}
        <div className="p-4 sm:p-5 rounded-2xl bg-emerald-50/50 border border-emerald-100 shadow-xs">
          <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 block mb-1">Delivered (Settled)</span>
          <div className="text-xl sm:text-2xl font-black text-emerald-700">{formatPrice(kpis.deliveredRevenueUSD)}</div>
          <span className="text-[10px] text-emerald-600 font-bold mt-0.5 block">
            {kpis.totalDeliveredUnits} units delivered
          </span>
        </div>

        {/* Orders in Period */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">Orders in Period</span>
          <div className="text-xl sm:text-2xl font-black text-indigo-700">{kpis.ordersCount}</div>
          <span className="text-[10px] text-slate-400 font-semibold mt-0.5 block">
            {kpis.uniqueBuyers} active customer{kpis.uniqueBuyers === 1 ? '' : 's'}
          </span>
        </div>

        {/* Units Sold */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">Total Units Sold</span>
          <div className="text-xl sm:text-2xl font-black text-slate-900">{kpis.totalUnitsSold}</div>
          <span className="text-[10px] text-slate-400 font-semibold mt-0.5 block">
            Across {productSales.length} unique SKUs
          </span>
        </div>

        {/* Average Order Value (AOV) */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">Average Order Value</span>
          <div className="text-xl sm:text-2xl font-black text-slate-900">{formatPrice(kpis.avgOrderValue)}</div>
          <span className="text-[10px] text-slate-400 font-semibold mt-0.5 block">
            Per completed checkout
          </span>
        </div>

        {/* Total Discounts */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">Discounts Applied</span>
          <div className="text-xl sm:text-2xl font-black text-rose-600">-{formatPrice(kpis.totalDiscountUSD)}</div>
          <span className="text-[10px] text-slate-400 font-semibold mt-0.5 block">
            + {formatPrice(kpis.totalDeliveryFeesUSD)} shipping fees
          </span>
        </div>

      </div>

      {/* 4. SUB-NAVIGATION TABS FOR DEEP DRILLDOWN */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
        
        {/* Navigation Bar */}
        <div className="flex flex-wrap items-center justify-between border-b border-slate-200 px-4 sm:px-6 pt-3 gap-2 bg-slate-50/50">
          <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto pb-3">
            {[
              { id: 'overview', label: 'Timeline & Overview', icon: BarChart3 },
              { id: 'products', label: `Products (${productSales.length})`, icon: Package },
              { id: 'sellers', label: `Sellers / Artisans (${sellerSales.length})`, icon: Store },
              { id: 'customers', label: `Customers (${customerSales.length})`, icon: Users },
              { id: 'categories', label: `Categories (${categorySales.length})`, icon: Layers },
              { id: 'orders', label: `Orders Ledger (${filteredOrders.length})`, icon: Receipt },
            ].map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as SalesTab)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer whitespace-nowrap ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div className="pb-3">
            <button
              onClick={handleExportFilteredSalesCSV}
              className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer"
            >
              <Download className="w-3 h-3 text-indigo-600" />
              <span>Export {activeTab.toUpperCase()} CSV</span>
            </button>
          </div>
        </div>

        {/* Tab Content Panes */}
        <div className="p-4 sm:p-6">

          {/* TAB 1: OVERVIEW & TIMELINE TRENDS */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              
              {/* Daily Sales Bar Trend */}
              <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-extrabold text-sm text-slate-900">Daily Sales Progression</h3>
                    <p className="text-xs text-slate-500">Revenue and order volume distribution over this selected timeframe</p>
                  </div>
                  <span className="text-xs font-bold text-slate-600">
                    {dailyTimeline.length} active sales days recorded
                  </span>
                </div>

                {dailyTimeline.length > 0 ? (
                  <div className="space-y-3">
                    <div className="h-44 flex items-end gap-1.5 sm:gap-3 overflow-x-auto pt-6 pb-2">
                      {dailyTimeline.map((day) => {
                        const maxRev = Math.max(...dailyTimeline.map(d => d.revenueUSD), 10);
                        const heightPct = Math.max((day.revenueUSD / maxRev) * 100, 6);
                        return (
                          <div key={day.dateStr} className="flex-1 min-w-[36px] flex flex-col items-center gap-1.5 group">
                            <div className="text-[9px] font-bold text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">
                              ${day.revenueUSD.toFixed(0)}
                            </div>
                            <div className="w-full bg-slate-200 rounded-t-lg relative flex items-end h-32 overflow-hidden">
                              <div
                                style={{ height: `${heightPct}%` }}
                                className="w-full bg-indigo-600 group-hover:bg-indigo-500 transition-all rounded-t-lg"
                                title={`${day.label}: $${day.revenueUSD.toFixed(2)} (${day.ordersCount} orders, ${day.unitsSold} units)`}
                              />
                            </div>
                            <span className="text-[10px] font-semibold text-slate-500 truncate w-full text-center">
                              {day.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="py-12 text-center text-xs text-slate-400 font-semibold">
                    No sales recorded for the selected date range. Try broadening the period or resetting filters.
                  </div>
                )}
              </div>

              {/* Top Rankings Grid (Top Products, Top Sellers, Top Customers) */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                
                {/* Top 5 Products */}
                <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                      <Package className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Top Products by Revenue</span>
                    </span>
                    <button onClick={() => setActiveTab('products')} className="text-[10px] font-bold text-indigo-600 hover:underline">
                      View all
                    </button>
                  </div>

                  <div className="space-y-2.5">
                    {productSales.slice(0, 5).map((item, idx) => (
                      <div key={item.product.id} className="flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2 truncate">
                          <span className="w-4 h-4 rounded-full bg-slate-100 text-slate-700 text-[10px] font-black flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <span className="font-bold text-slate-800 truncate">{item.product.name}</span>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="font-black text-slate-900">{formatPrice(item.revenueUSD)}</span>
                          <span className="text-[10px] text-slate-400 block">{item.unitsSold} sold</span>
                        </div>
                      </div>
                    ))}
                    {productSales.length === 0 && (
                      <div className="text-xs text-slate-400 text-center py-4">No products sold in period</div>
                    )}
                  </div>
                </div>

                {/* Top 5 Sellers */}
                <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                      <Store className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Top Sellers by Sales</span>
                    </span>
                    <button onClick={() => setActiveTab('sellers')} className="text-[10px] font-bold text-emerald-600 hover:underline">
                      View all
                    </button>
                  </div>

                  <div className="space-y-2.5">
                    {sellerSales.slice(0, 5).map((item, idx) => (
                      <div key={item.sellerName} className="flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2 truncate">
                          <span className="w-4 h-4 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-black flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <span className="font-bold text-slate-800 truncate">{item.sellerName}</span>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="font-black text-emerald-700">{formatPrice(item.grossRevenueUSD)}</span>
                          <span className="text-[10px] text-slate-400 block">{item.unitsSold} units</span>
                        </div>
                      </div>
                    ))}
                    {sellerSales.length === 0 && (
                      <div className="text-xs text-slate-400 text-center py-4">No seller sales in period</div>
                    )}
                  </div>
                </div>

                {/* Top 5 Customers */}
                <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-sky-600" />
                      <span>Top Buyers in Period</span>
                    </span>
                    <button onClick={() => setActiveTab('customers')} className="text-[10px] font-bold text-sky-600 hover:underline">
                      View all
                    </button>
                  </div>

                  <div className="space-y-2.5">
                    {customerSales.slice(0, 5).map((item, idx) => (
                      <div key={item.phone || idx} className="flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2 truncate">
                          <span className="w-4 h-4 rounded-full bg-sky-50 text-sky-700 text-[10px] font-black flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <div className="truncate">
                            <span className="font-bold text-slate-800 truncate block">{item.customerName}</span>
                            <span className="text-[10px] text-slate-400 font-mono truncate">{item.phone || item.city}</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="font-black text-slate-900">{formatPrice(item.totalSpentUSD)}</span>
                          <span className="text-[10px] text-slate-400 block">{item.ordersCount} orders</span>
                        </div>
                      </div>
                    ))}
                    {customerSales.length === 0 && (
                      <div className="text-xs text-slate-400 text-center py-4">No customer orders in period</div>
                    )}
                  </div>
                </div>

              </div>

            </div>
          )}

          {/* TAB 2: PRODUCTS SALES BREAKDOWN */}
          {activeTab === 'products' && (
            <div className="space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] font-black uppercase text-slate-500 bg-slate-50/50">
                      <th className="py-3 px-3">Product Name & SKU</th>
                      <th className="py-3 px-3">Category</th>
                      <th className="py-3 px-3">Seller / Artisan</th>
                      <th className="py-3 px-3 text-center">Unit Price</th>
                      <th className="py-3 px-3 text-center">Units Sold</th>
                      <th className="py-3 px-3 text-right">Gross Sales ($)</th>
                      <th className="py-3 px-3 text-right">Revenue Share</th>
                      <th className="py-3 px-3 text-center">Orders</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {productSales.map((item) => (
                      <tr key={item.product.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-3">
                          <div className="font-bold text-slate-900">{item.product.name}</div>
                          <div className="text-[10px] text-slate-400 font-mono flex items-center gap-2">
                            <span>ID: {item.product.id}</span>
                            {item.product.sellerItemCode && (
                              <>
                                <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                                <span className="text-indigo-600 font-semibold">Code: {item.product.sellerItemCode}</span>
                              </>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-semibold">
                            {item.product.category}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <span className="font-semibold text-indigo-700">
                            {item.product.seller || item.product.artisan || 'Local Producer'}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center font-bold text-slate-700">
                          {formatPrice(item.product.priceUSD)}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-900 font-black">
                            {item.unitsSold}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-black text-slate-900">
                          {formatPrice(item.revenueUSD)}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <span className="text-xs font-bold text-indigo-600">
                            {item.revenueShare.toFixed(1)}%
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center font-bold text-slate-600">
                          {item.ordersCount}
                        </td>
                      </tr>
                    ))}
                    {productSales.length === 0 && (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-slate-400 font-semibold">
                          No product sales match your selected filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: SELLERS & ARTISANS PERFORMANCE */}
          {activeTab === 'sellers' && (
            <div className="space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] font-black uppercase text-slate-500 bg-slate-50/50">
                      <th className="py-3 px-3">Seller / Artisan</th>
                      <th className="py-3 px-3">Region</th>
                      <th className="py-3 px-3">Contact</th>
                      <th className="py-3 px-3 text-center">SKUs Sold</th>
                      <th className="py-3 px-3 text-center">Units Sold</th>
                      <th className="py-3 px-3 text-right">Gross Sales ($)</th>
                      <th className="py-3 px-3 text-right">Commission</th>
                      <th className="py-3 px-3 text-right">Est. Payout ($)</th>
                      <th className="py-3 px-3 text-center">Orders</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sellerSales.map((item) => (
                      <tr key={item.sellerName} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-3 font-bold text-slate-900">
                          <div className="flex items-center gap-2">
                            <Store className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>{item.sellerName}</span>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-slate-600">
                          {item.sellerObj?.region || 'Lebanon'}
                        </td>
                        <td className="py-3 px-3">
                          {item.sellerObj?.contactPhone ? (
                            <a
                              href={`https://wa.me/${item.sellerObj.contactPhone.replace(/[^0-9]/g, '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-emerald-700 font-mono font-bold hover:underline inline-flex items-center gap-1"
                            >
                              <Phone className="w-3 h-3" />
                              <span>{item.sellerObj.contactPhone}</span>
                            </a>
                          ) : (
                            <span className="text-slate-400 italic">No phone</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center font-bold text-slate-700">
                          {item.uniqueProductsCount}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 font-black">
                            {item.unitsSold}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-black text-slate-900">
                          {formatPrice(item.grossRevenueUSD)}
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-slate-500">
                          {item.commissionPct}%
                        </td>
                        <td className="py-3 px-3 text-right font-black text-emerald-700">
                          {formatPrice(item.estimatedPayoutUSD)}
                        </td>
                        <td className="py-3 px-3 text-center font-bold text-slate-600">
                          {item.ordersCount}
                        </td>
                      </tr>
                    ))}
                    {sellerSales.length === 0 && (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-slate-400 font-semibold">
                          No seller records found for this period.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: CUSTOMERS SALES BREAKDOWN */}
          {activeTab === 'customers' && (
            <div className="space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] font-black uppercase text-slate-500 bg-slate-50/50">
                      <th className="py-3 px-3">Customer Name</th>
                      <th className="py-3 px-3">Phone & WhatsApp</th>
                      <th className="py-3 px-3">Location</th>
                      <th className="py-3 px-3 text-center">Orders Count</th>
                      <th className="py-3 px-3 text-center">Units Bought</th>
                      <th className="py-3 px-3 text-right">Total Spent ($)</th>
                      <th className="py-3 px-3 text-right">Avg. Basket</th>
                      <th className="py-3 px-3 text-right">Last Purchase</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {customerSales.map((item, idx) => (
                      <tr key={item.phone || idx} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-3 font-bold text-slate-900">
                          {item.customerName}
                        </td>
                        <td className="py-3 px-3">
                          {item.phone ? (
                            <div className="flex items-center gap-2 font-mono">
                              <span className="font-bold text-slate-800">{item.phone}</span>
                              <a
                                href={`https://wa.me/${item.phone.replace(/[^0-9]/g, '')}`}
                                target="_blank"
                                rel="noreferrer"
                                className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold hover:bg-emerald-200"
                              >
                                WA
                              </a>
                            </div>
                          ) : (
                            <span className="text-slate-400">No phone</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-slate-600">
                          {item.governorate ? `${item.governorate} • ${item.city}` : (item.city || 'Lebanon')}
                        </td>
                        <td className="py-3 px-3 text-center font-bold text-slate-700">
                          {item.ordersCount}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-900 font-bold">
                            {item.totalUnitsBought}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-black text-slate-900">
                          {formatPrice(item.totalSpentUSD)}
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-slate-600">
                          {formatPrice(item.avgBasketUSD)}
                        </td>
                        <td className="py-3 px-3 text-right text-slate-500 font-mono text-[11px]">
                          {item.lastOrderDate ? new Date(item.lastOrderDate).toLocaleDateString('en-US') : 'N/A'}
                        </td>
                      </tr>
                    ))}
                    {customerSales.length === 0 && (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-slate-400 font-semibold">
                          No customer purchases recorded for this period.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 5: CATEGORIES BREAKDOWN */}
          {activeTab === 'categories' && (
            <div className="space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] font-black uppercase text-slate-500 bg-slate-50/50">
                      <th className="py-3 px-3">Category Name</th>
                      <th className="py-3 px-3 text-center">Products Sold</th>
                      <th className="py-3 px-3 text-center">Units Sold</th>
                      <th className="py-3 px-3 text-right">Revenue ($)</th>
                      <th className="py-3 px-3 text-right">Revenue Share</th>
                      <th className="py-3 px-3 text-center">Orders Count</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {categorySales.map((cat) => (
                      <tr key={cat.category} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-3 font-bold text-slate-900">
                          <div className="flex items-center gap-2">
                            <Layers className="w-3.5 h-3.5 text-indigo-600" />
                            <span>{cat.category}</span>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-center font-bold text-slate-700">
                          {cat.uniqueProductsCount}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className="px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-800 font-black">
                            {cat.unitsSold}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-black text-slate-900">
                          {formatPrice(cat.revenueUSD)}
                        </td>
                        <td className="py-3 px-3 text-right font-black text-indigo-600">
                          {cat.revenueShare.toFixed(1)}%
                        </td>
                        <td className="py-3 px-3 text-center font-bold text-slate-600">
                          {cat.ordersCount}
                        </td>
                      </tr>
                    ))}
                    {categorySales.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-400 font-semibold">
                          No category sales recorded for this period.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 6: ORDERS LEDGER IN PERIOD */}
          {activeTab === 'orders' && (
            <div className="space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] font-black uppercase text-slate-500 bg-slate-50/50">
                      <th className="py-3 px-3">Order ID & Date</th>
                      <th className="py-3 px-3">Customer</th>
                      <th className="py-3 px-3">Items Summary</th>
                      <th className="py-3 px-3">Payment</th>
                      <th className="py-3 px-3">Status</th>
                      <th className="py-3 px-3 text-right">Order Total</th>
                      <th className="py-3 px-3 text-center">Inspect</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredOrders.map((ord) => (
                      <tr key={ord.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-3">
                          <span className="font-mono font-bold text-slate-900">#{ord.id.slice(-6).toUpperCase()}</span>
                          <span className="text-[10px] text-slate-400 block">
                            {new Date(ord.date || Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-bold text-slate-900">{ord.shipping?.fullName || 'Customer'}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{ord.shipping?.phone || 'No phone'}</div>
                        </td>
                        <td className="py-3 px-3 max-w-xs">
                          <span className="text-slate-700 truncate block text-[11px]">
                            {ord.items.map(i => `${i.quantity}x ${i.product.name}`).join(', ')}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {ord.items.reduce((s, i) => s + i.quantity, 0)} total items
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-semibold uppercase">
                            {ord.paymentMethod || 'COD'}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                            ord.status === 'delivered' ? 'bg-emerald-100 text-emerald-800' :
                            ord.status === 'cancelled' ? 'bg-rose-100 text-rose-800' :
                            (ord.status === 'in_transit' || ord.status === 'courier_assigned') ? 'bg-indigo-100 text-indigo-800' :
                            'bg-amber-100 text-amber-800'
                          }`}>
                            {ord.status}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-black text-slate-900">
                          {formatPrice(ord.totalUSD || 0)}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <button
                            onClick={() => setInspectingOrder(ord)}
                            className="p-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg transition-colors cursor-pointer"
                            title="Inspect Order Details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filteredOrders.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-400 font-semibold">
                          No orders found matching the filter parameters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* INSPECT ORDER DETAILS MODAL */}
      {inspectingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white w-full max-w-lg rounded-3xl border border-slate-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-extrabold text-slate-900 text-base">
                  Order Details #{inspectingOrder.id.slice(-6).toUpperCase()}
                </h3>
                <span className="text-xs text-slate-400 font-mono">
                  {new Date(inspectingOrder.date || Date.now()).toLocaleString('en-US')}
                </span>
              </div>
              <button
                onClick={() => setInspectingOrder(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl space-y-1">
                <div className="font-bold text-slate-900">Customer & Shipping:</div>
                <div className="text-slate-600">{inspectingOrder.shipping?.fullName || 'Anonymous'}</div>
                <div className="text-slate-600 font-mono">{inspectingOrder.shipping?.phone || 'No phone'}</div>
                <div className="text-slate-600">
                  {inspectingOrder.shipping?.governorate}, {inspectingOrder.shipping?.city}
                </div>
              </div>

              <div className="space-y-1.5 pt-2">
                <div className="font-bold text-slate-900">Purchased Items:</div>
                {inspectingOrder.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center text-xs py-1 border-b border-slate-100">
                    <div>
                      <span className="font-bold text-slate-900">{item.product.name}</span>
                      <span className="text-slate-400 block text-[10px]">
                        Seller: {item.product.seller || item.product.artisan || 'Local Producer'} • Qty: {item.quantity}
                      </span>
                    </div>
                    <span className="font-black text-slate-900">
                      {formatPrice((item.product.priceUSD || 0) * (item.quantity || 1))}
                    </span>
                  </div>
                ))}
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-between font-black text-sm text-slate-900">
                <span>Total Amount:</span>
                <span>{formatPrice(inspectingOrder.totalUSD || 0)}</span>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setInspectingOrder(null)}
                className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
