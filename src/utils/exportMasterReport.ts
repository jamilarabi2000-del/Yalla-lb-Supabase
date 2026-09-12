import Papa from 'papaparse';
import { Product, Seller, Order } from '../types';
import { LBP_USD_RATE } from '../data/regions';
import { sanitizeRowForCsv } from './csvSafe';

const isProductLinkedToSeller = (p: Product, seller: Seller) => {
  if (p.sellerId && seller.id && p.sellerId.toLowerCase() === seller.id.toLowerCase()) return true;
  const pSeller = (p.seller || p.artisan || '').trim().toLowerCase();
  const sName = seller.nameEn.trim().toLowerCase();
  if (pSeller && sName && pSeller === sName) return true;
  return false;
};

export interface MasterReportRow {
  // Product Details
  product_id: string;
  seller_item_code: string;
  product_name_en: string;
  product_name_ar: string;
  category: string;
  origin_terroir: string;
  weight_or_volume: string;
  unit_price_usd: string;
  unit_price_lbp: string;
  original_price_usd: string;
  discount_percentage: string;
  is_published: string;
  is_featured: string;
  rating: string;
  reviews_count: number;
  image_url: string;
  additional_images: string;
  video_url: string;
  additional_videos: string;
  tags: string;
  description_en: string;
  description_ar: string;
  craft_story: string;

  // Seller Details
  seller_code: string;
  seller_id: string;
  seller_name_en: string;
  seller_name_ar: string;
  seller_region: string;
  seller_phone: string;
  seller_email: string;
  seller_active_status: string;
  seller_commission_pct: string;

  // Stock & Inventory
  stock_quantity: number;
  stock_status: string;
  stock_asset_value_usd: string;

  // Sales Performance
  total_units_sold: number;
  delivered_units_sold: number;
  pending_units: number;
  cancelled_units: number;
  total_sales_revenue_usd: string;
  delivered_sales_revenue_usd: string;
  orders_count: number;
  last_sale_date: string;
  first_sale_date: string;
}

export interface SellerPerformanceRow {
  seller_code: string;
  seller_id: string;
  seller_name_en: string;
  seller_name_ar: string;
  region: string;
  contact_phone: string;
  contact_email: string;
  seller_status: string;
  total_products_count: number;
  published_products_count: number;
  total_stock_units: number;
  total_inventory_value_usd: string;
  total_units_sold: number;
  delivered_units_sold: number;
  gross_sales_usd: string;
  delivered_sales_usd: string;
  commission_rate_pct: string;
  estimated_seller_payout_usd: string;
  orders_count: number;
  last_active_date: string;
}

export interface StockInventoryRow {
  product_id: string;
  seller_item_code: string;
  product_name: string;
  arabic_name: string;
  seller_code: string;
  seller_name: string;
  seller_contact: string;
  category: string;
  origin_terroir: string;
  unit_price_usd: string;
  current_stock: number;
  stock_status: 'In Stock' | 'Low Stock (Alert)' | 'Out of Stock (Action Required)';
  total_inventory_value_usd: string;
  historical_units_sold: number;
  units_in_pending_orders: number;
  reorder_recommendation: string;
  is_published: string;
}

/**
 * Generates and downloads the Comprehensive Master Report CSV containing:
 * - All Product details
 * - All Seller details
 * - Real-time Stock levels & asset valuation
 * - Full Sales performance, units sold, and revenue analytics per SKU
 */
export function downloadFullMasterReport(
  products: Product[],
  sellers: Seller[],
  orders: Order[],
  filenamePrefix = 'yalla_full_master_report'
) {
  // Pre-calculate sales stats per product SKU
  const salesMap = new Map<string, {
    totalUnitsSold: number;
    deliveredUnitsSold: number;
    pendingUnits: number;
    cancelledUnits: number;
    totalRevenueUSD: number;
    deliveredRevenueUSD: number;
    orderIds: Set<string>;
    dates: string[];
  }>();

  orders.forEach(order => {
    const isDelivered = order.status === 'delivered';
    const isCancelled = order.status === 'cancelled' || order.status === 'returned';
    const isPending = !isDelivered && !isCancelled;

    order.items.forEach(item => {
      const pId = item.product.id;
      if (!salesMap.has(pId)) {
        salesMap.set(pId, {
          totalUnitsSold: 0,
          deliveredUnitsSold: 0,
          pendingUnits: 0,
          cancelledUnits: 0,
          totalRevenueUSD: 0,
          deliveredRevenueUSD: 0,
          orderIds: new Set<string>(),
          dates: []
        });
      }

      const entry = salesMap.get(pId)!;
      const qty = item.quantity || 1;
      const itemRevUSD = (item.product.priceUSD || 0) * qty;

      if (!isCancelled) {
        entry.totalUnitsSold += qty;
        entry.totalRevenueUSD += itemRevUSD;
        entry.orderIds.add(order.id);
        if (order.date) entry.dates.push(order.date);
      }

      if (isDelivered) {
        entry.deliveredUnitsSold += qty;
        entry.deliveredRevenueUSD += itemRevUSD;
      } else if (isPending) {
        entry.pendingUnits += qty;
      } else if (isCancelled) {
        entry.cancelledUnits += qty;
      }
    });
  });

  // Fast map of sellers by id or name
  const sellerLookup = new Map<string, Seller>();
  sellers.forEach(s => {
    sellerLookup.set(s.id.toLowerCase(), s);
    sellerLookup.set(s.nameEn.toLowerCase(), s);
  });

  const rows: MasterReportRow[] = products.map(product => {
    const sName = product.seller || product.artisan || '';
    const sId = product.sellerId || sName.toLowerCase().replace(/\s+/g, '-');
    const matchedSeller = sellerLookup.get(sId.toLowerCase()) || sellerLookup.get(sName.toLowerCase());

    const sales = salesMap.get(product.id) || {
      totalUnitsSold: 0,
      deliveredUnitsSold: 0,
      pendingUnits: 0,
      cancelledUnits: 0,
      totalRevenueUSD: 0,
      deliveredRevenueUSD: 0,
      orderIds: new Set<string>(),
      dates: []
    };

    // Sort dates to find first and last sale
    const sortedDates = [...sales.dates].sort();
    const firstSaleDate = sortedDates.length > 0 ? sortedDates[0] : 'No sales yet';
    const lastSaleDate = sortedDates.length > 0 ? sortedDates[sortedDates.length - 1] : 'No sales yet';

    // Stock Status
    let stockStatus = 'In Stock';
    if (product.stock <= 0) stockStatus = 'Out of Stock';
    else if (product.stock <= 5) stockStatus = 'Low Stock (<5 units)';

    const stockAssetValue = (product.stock * (product.priceUSD || 0)).toFixed(2);
    const unitPriceLBP = ((product.priceUSD || 0) * LBP_USD_RATE).toLocaleString('en-US');

    return {
      product_id: product.id,
      seller_item_code: product.sellerItemCode || '',
      product_name_en: product.name,
      product_name_ar: product.arabicName || '',
      category: product.category || 'General',
      origin_terroir: product.origin || 'Lebanon',
      weight_or_volume: product.weightOrVolume || '',
      unit_price_usd: (product.priceUSD || 0).toFixed(2),
      unit_price_lbp: `${unitPriceLBP} LBP`,
      original_price_usd: product.originalPriceUSD ? product.originalPriceUSD.toFixed(2) : (product.priceUSD || 0).toFixed(2),
      discount_percentage: product.discountPercentage ? `${product.discountPercentage}%` : '0%',
      is_published: product.isPublished === false ? 'Hidden / Draft' : 'Published Live',
      is_featured: product.isFeatured ? 'Yes' : 'No',
      rating: (product.rating || 5).toFixed(1),
      reviews_count: product.reviewsCount || 0,
      image_url: product.image || '',
      additional_images: (product.additionalImages || []).join('|'),
      video_url: product.videoUrl || '',
      additional_videos: (product.videos || []).join('|'),
      tags: (product.tags || []).join(', '),
      description_en: (product.description || '').replace(/[\r\n]+/g, ' '),
      description_ar: (product.craftStory || '').replace(/[\r\n]+/g, ' '),
      craft_story: (product.craftStory || '').replace(/[\r\n]+/g, ' '),

      // Seller
      seller_code: matchedSeller?.sellerCode || 'SLR-101',
      seller_id: matchedSeller?.id || sId,
      seller_name_en: matchedSeller?.nameEn || sName,
      seller_name_ar: matchedSeller?.nameAr || product.arabicSeller || '',
      seller_region: matchedSeller?.region || 'Lebanon',
      seller_phone: matchedSeller?.contactPhone || 'Not specified',
      seller_email: matchedSeller?.contactEmail || '',
      seller_active_status: matchedSeller ? (matchedSeller.isActive ? 'Active' : 'Inactive') : 'Active',
      seller_commission_pct: matchedSeller?.commissionPct ? `${matchedSeller.commissionPct}%` : '0%',

      // Stock
      stock_quantity: product.stock,
      stock_status: stockStatus,
      stock_asset_value_usd: stockAssetValue,

      // Sales
      total_units_sold: sales.totalUnitsSold,
      delivered_units_sold: sales.deliveredUnitsSold,
      pending_units: sales.pendingUnits,
      cancelled_units: sales.cancelledUnits,
      total_sales_revenue_usd: sales.totalRevenueUSD.toFixed(2),
      delivered_sales_revenue_usd: sales.deliveredRevenueUSD.toFixed(2),
      orders_count: sales.orderIds.size,
      last_sale_date: lastSaleDate,
      first_sale_date: firstSaleDate
    };
  });

  const csv = Papa.unparse(rows.map(sanitizeRowForCsv));
  triggerDownload(csv, `${filenamePrefix}_${new Date().toISOString().slice(0, 10)}.csv`);
}

/**
 * Downloads aggregated performance and sales by Seller / Artisan
 */
export function downloadSellerPerformanceReport(
  products: Product[],
  sellers: Seller[],
  orders: Order[],
  filenamePrefix = 'yalla_sellers_sales_report'
) {
  // Aggregate sales and products per seller
  const sellerMap = new Map<string, {
    seller: Seller;
    productsCount: number;
    publishedCount: number;
    totalStock: number;
    stockValueUSD: number;
    unitsSold: number;
    deliveredUnits: number;
    grossSalesUSD: number;
    deliveredSalesUSD: number;
    orderIds: Set<string>;
    dates: string[];
  }>();

  // Initialize with known sellers
  sellers.forEach(s => {
    sellerMap.set(s.nameEn.toLowerCase(), {
      seller: s,
      productsCount: 0,
      publishedCount: 0,
      totalStock: 0,
      stockValueUSD: 0,
      unitsSold: 0,
      deliveredUnits: 0,
      grossSalesUSD: 0,
      deliveredSalesUSD: 0,
      orderIds: new Set<string>(),
      dates: []
    });
  });

  // Attach product stats
  products.forEach(p => {
    const sName = (p.seller || p.artisan || 'Independent Artisan').trim();
    const key = sName.toLowerCase();
    if (!sellerMap.has(key)) {
      sellerMap.set(key, {
        seller: {
          id: key.replace(/\s+/g, '-'),
          nameEn: sName,
          nameAr: p.arabicSeller || '',
          isActive: p.sellerActive !== false,
          region: p.origin || 'Lebanon',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        productsCount: 0,
        publishedCount: 0,
        totalStock: 0,
        stockValueUSD: 0,
        unitsSold: 0,
        deliveredUnits: 0,
        grossSalesUSD: 0,
        deliveredSalesUSD: 0,
        orderIds: new Set<string>(),
        dates: []
      });
    }

    const entry = sellerMap.get(key)!;
    entry.productsCount += 1;
    if (p.isPublished !== false) entry.publishedCount += 1;
    entry.totalStock += (p.stock || 0);
    entry.stockValueUSD += (p.stock || 0) * (p.priceUSD || 0);
  });

  // Attach order sales
  orders.forEach(order => {
    const isDelivered = order.status === 'delivered';
    const isCancelled = order.status === 'cancelled' || order.status === 'returned';
    if (isCancelled) return;

    order.items.forEach(item => {
      const sName = (item.product.seller || item.product.artisan || 'Independent Artisan').trim();
      const key = sName.toLowerCase();
      const entry = sellerMap.get(key);
      if (entry) {
        const qty = item.quantity || 1;
        const rev = (item.product.priceUSD || 0) * qty;
        entry.unitsSold += qty;
        entry.grossSalesUSD += rev;
        entry.orderIds.add(order.id);
        if (order.date) entry.dates.push(order.date);

        if (isDelivered) {
          entry.deliveredUnits += qty;
          entry.deliveredSalesUSD += rev;
        }
      }
    });
  });

  const rows: SellerPerformanceRow[] = Array.from(sellerMap.values()).map(item => {
    const commPct = item.seller.commissionPct || 0;
    const payoutEst = (item.grossSalesUSD * (1 - commPct / 100)).toFixed(2);
    const sortedDates = [...item.dates].sort();
    const lastActive = sortedDates.length > 0 ? sortedDates[sortedDates.length - 1] : 'No orders recorded';

    return {
      seller_code: item.seller.sellerCode || 'SLR-101',
      seller_id: item.seller.id,
      seller_name_en: item.seller.nameEn,
      seller_name_ar: item.seller.nameAr || '',
      region: item.seller.region || 'Lebanon',
      contact_phone: item.seller.contactPhone || '',
      contact_email: item.seller.contactEmail || '',
      seller_status: item.seller.isActive ? 'Active' : 'Inactive',
      total_products_count: item.productsCount,
      published_products_count: item.publishedCount,
      total_stock_units: item.totalStock,
      total_inventory_value_usd: item.stockValueUSD.toFixed(2),
      total_units_sold: item.unitsSold,
      delivered_units_sold: item.deliveredUnits,
      gross_sales_usd: item.grossSalesUSD.toFixed(2),
      delivered_sales_usd: item.deliveredSalesUSD.toFixed(2),
      commission_rate_pct: `${commPct}%`,
      estimated_seller_payout_usd: payoutEst,
      orders_count: item.orderIds.size,
      last_active_date: lastActive
    };
  });

  const csv = Papa.unparse(rows.map(sanitizeRowForCsv));
  triggerDownload(csv, `${filenamePrefix}_${new Date().toISOString().slice(0, 10)}.csv`);
}

/**
 * Downloads targeted stock replenishment & inventory status report
 */
export function downloadStockInventoryReport(
  products: Product[],
  sellers: Seller[],
  orders: Order[],
  filenamePrefix = 'yalla_stock_inventory_report'
) {
  // Pre-calculate units in pending orders
  const pendingUnitsMap = new Map<string, number>();
  const totalSoldMap = new Map<string, number>();

  orders.forEach(order => {
    const isCancelled = order.status === 'cancelled' || order.status === 'returned';
    const isDelivered = order.status === 'delivered';
    if (isCancelled) return;

    order.items.forEach(item => {
      const pId = item.product.id;
      const qty = item.quantity || 1;
      totalSoldMap.set(pId, (totalSoldMap.get(pId) || 0) + qty);

      if (!isDelivered) {
        pendingUnitsMap.set(pId, (pendingUnitsMap.get(pId) || 0) + qty);
      }
    });
  });

  const sellerPhoneMap = new Map<string, string>();
  const sellerCodeMap = new Map<string, string>();
  sellers.forEach(s => {
    sellerPhoneMap.set(s.nameEn.toLowerCase(), s.contactPhone || '');
    if (s.sellerCode) sellerCodeMap.set(s.nameEn.toLowerCase(), s.sellerCode);
  });

  const rows: StockInventoryRow[] = products
    .slice()
    .sort((a, b) => (a.stock || 0) - (b.stock || 0))
    .map(p => {
      const stock = p.stock || 0;
      let status: StockInventoryRow['stock_status'] = 'In Stock';
      let recommendation = 'Stock healthy';

      if (stock <= 0) {
        status = 'Out of Stock (Action Required)';
        recommendation = 'Urgent: Contact artisan/seller to restock immediately';
      } else if (stock <= 5) {
        status = 'Low Stock (Alert)';
        recommendation = 'Prepare reorder with producer';
      }

      const matchedSeller = sellers.find(s => isProductLinkedToSeller(p, s));
      const sName = matchedSeller?.nameEn || p.seller || p.artisan || 'Local Producer';
      const sContact = matchedSeller?.contactPhone || sellerPhoneMap.get(sName.toLowerCase()) || '';
      const sCode = matchedSeller?.sellerCode || sellerCodeMap.get(sName.toLowerCase()) || 'SLR-101';

      return {
        product_id: p.id,
        seller_item_code: p.sellerItemCode || '',
        product_name: p.name,
        arabic_name: p.arabicName || '',
        seller_code: sCode,
        seller_name: sName,
        seller_contact: sContact,
        category: p.category,
        origin_terroir: p.origin || 'Lebanon',
        unit_price_usd: (p.priceUSD || 0).toFixed(2),
        current_stock: stock,
        stock_status: status,
        total_inventory_value_usd: (stock * (p.priceUSD || 0)).toFixed(2),
        historical_units_sold: totalSoldMap.get(p.id) || 0,
        units_in_pending_orders: pendingUnitsMap.get(p.id) || 0,
        reorder_recommendation: recommendation,
        is_published: p.isPublished === false ? 'Draft' : 'Published'
      };
    });

  const csv = Papa.unparse(rows.map(sanitizeRowForCsv));
  triggerDownload(csv, `${filenamePrefix}_${new Date().toISOString().slice(0, 10)}.csv`);
}

export function downloadOrdersReport(
  orders: Order[],
  filenamePrefix = 'yalla_lebanon_orders_dispatch_report'
) {
  const dataToExport = orders.map((ord) => ({
    'Order ID': ord.id,
    'Date Placed': ord.date,
    'Fulfillment Status': ord.status,
    'Customer Full Name': ord.shipping?.fullName || '',
    'Customer Phone': ord.shipping?.phone || '',
    'Customer Email': ord.shipping?.email || '',
    'Delivery Governorate': ord.shipping?.governorate || '',
    'Delivery City': ord.shipping?.city || '',
    'Street / Building': `${ord.shipping?.street || ''} ${ord.shipping?.building || ''}`.trim(),
    'Delivery Notes': ord.shipping?.deliveryNotes || '',
    'Payment Method': ord.paymentMethod,
    'Subtotal (USD)': ord.subtotalUSD?.toFixed(2) || '0.00',
    'Delivery Fee (USD)': ord.deliveryFeeUSD?.toFixed(2) || '0.00',
    'Discount (USD)': ord.discountUSD?.toFixed(2) || '0.00',
    'Total Amount (USD)': ord.totalUSD?.toFixed(2) || '0.00',
    'Total Items Count': ord.items.reduce((s, i) => s + i.quantity, 0),
    'Order Line Items': ord.items.map(i => `${i.quantity}x ${i.product.name} ($${i.product.priceUSD})`).join('; ')
  }));

  const csv = Papa.unparse(dataToExport.map(sanitizeRowForCsv));
  triggerDownload(csv, `${filenamePrefix}_${new Date().toISOString().slice(0, 10)}.csv`);
}

function triggerDownload(content: string, filename: string) {
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
