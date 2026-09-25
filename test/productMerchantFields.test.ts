import { describe, it, expect } from 'vitest';
import { mapSupabaseProduct } from '../src/services/supabaseCatalogService';

// Admin and seller reads embed product_private for the merchant fields; the
// products copy of them is not readable by the authenticated role.
const base = { id: '33333333-cccc-4ccc-8ccc-000000000001', name: 'Wild Zaatar', regular_price: 12.5, stock: 3 };

describe('merchant fields come from product_private', () => {
  it('reads them from the embedded row', () => {
    const p = mapSupabaseProduct({ ...base, product_private: {
      seller_item_code: 'ZT-500', low_stock_threshold: 4, low_stock_notice: 'Few left', custom_stock_label: 'Small batch', cost_price_usd: '3.25',
    } });
    expect(p.sellerItemCode).toBe('ZT-500');
    expect(p.lowStockThreshold).toBe(4);
    expect(p.lowStockNotice).toBe('Few left');
    expect(p.customStockLabel).toBe('Small batch');
    expect(p.costPriceUSD).toBe(3.25);
  });

  it('accepts the embed as a one-element array too', () => {
    expect(mapSupabaseProduct({ ...base, product_private: [{ seller_item_code: 'ZT-501' }] }).sellerItemCode).toBe('ZT-501');
  });

  it('leaves them empty for a shopper row, which carries neither the embed nor the columns', () => {
    const p = mapSupabaseProduct({ ...base });
    expect(p.sellerItemCode).toBeUndefined();
    expect(p.costPriceUSD).toBeUndefined();
  });
});
