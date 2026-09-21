import { CartItem, DiscountRule, Product, ProductBundle } from '../types';

export function getProductCurrentPrice(product: Pick<Product, 'regularPriceUSD' | 'promoPriceUSD'>): number {
  const regular = Number(product.regularPriceUSD || 0);
  const promo = product.promoPriceUSD == null ? null : Number(product.promoPriceUSD);
  return promo != null && Number.isFinite(promo) && promo > 0 && promo <= regular ? promo : regular;
}

export function getProductDiscountPercentage(product: Pick<Product, 'regularPriceUSD' | 'promoPriceUSD'>): number {
  const regular = Number(product.regularPriceUSD || 0);
  const current = getProductCurrentPrice(product);
  return regular > 0 && current < regular ? Math.round(((regular - current) / regular) * 100) : 0;
}

export function round2(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

export function computeDiscounts(params: {
  lines: Array<{ product: any; quantity: number; unitPriceUSD?: number }>;
  discounts: any[];
  bundles: any[];
  couponCode?: string;
  isNewCustomer?: boolean;
  subtotalUSD?: number;
}): { discountUSD: number; appliedCoupon?: string; finalSubtotalUSD: number; appliedRules: any[] } {
  const items: CartItem[] = params.lines.map(l => ({
    product: { ...l.product, regularPriceUSD: typeof l.unitPriceUSD === 'number' ? l.unitPriceUSD : l.product.regularPriceUSD, promoPriceUSD: undefined, priceUSD: typeof l.unitPriceUSD === 'number' ? l.unitPriceUSD : getProductCurrentPrice(l.product) },
    quantity: l.quantity
  }));
  const res = applyDiscounts(items, params.discounts, {
    couponCode: params.couponCode,
    isNewUser: params.isNewCustomer,
    productBundles: params.bundles
  });
  return { discountUSD: res.discountUSD, finalSubtotalUSD: res.finalSubtotalUSD, appliedCoupon: res.appliedCoupon, appliedRules: res.appliedRules };
}

export interface DiscountCalculationResult {
  subtotalUSD: number;
  discountUSD: number;
  finalSubtotalUSD: number;
  appliedRules: { rule: DiscountRule; savedUSD: number }[];
  appliedRuleIds: string[];
  appliedCoupon?: string;
}

export interface DiscountOptions {
  couponCode?: string;
  isNewUser?: boolean;
  currentDate?: Date;
  productBundles?: ProductBundle[];
}

export const MAX_TOTAL_DISCOUNT_PCT = 70;

// Mirrors private.checkout_create_order. The RPC remains authoritative at checkout.
function matchesTarget(product: Product, rule: DiscountRule): boolean {
  if (!rule.target || rule.target === 'checkout' || rule.target === 'all') return true;
  if (!rule.targetValue?.trim()) return false;
  const target = rule.targetValue.toLowerCase().trim();
  const productId = String(product.id || '').toLowerCase();
  const categoryId = String((product as any).categoryId || '').toLowerCase();
  const categoryName = String(product.category || '').toLowerCase();
  const sellerId = String((product as any).sellerId || '').toLowerCase();
  const sellerName = String((product as any).seller || '').toLowerCase();
  const artisan = String(product.artisan || '').toLowerCase();
  const origin = String(product.origin || '').toLowerCase();
  const name = String(product.name || '').toLowerCase();
  if (rule.target === 'product') return productId === target;
  if (rule.target === 'category') return categoryId === target || categoryName === target;
  if (rule.target === 'seller') return sellerId === target || sellerName === target;
  if (rule.target === 'brand') return artisan.includes(target) || origin.includes(target) || name.includes(target);
  return false;
}

function inWindow(rule: DiscountRule, now: Date): boolean {
  if (rule.startDate) { const d = new Date(rule.startDate); if (!isNaN(d.getTime()) && now < d) return false; }
  if (rule.endDate) { const d = new Date(rule.endDate); if (!isNaN(d.getTime()) && now > d) return false; }
  return true;
}

export function applyDiscounts(items: CartItem[], rules: DiscountRule[], options: DiscountOptions = {}): DiscountCalculationResult {
  const subtotal = round2(items.reduce((sum, item) => sum + getProductCurrentPrice(item.product) * item.quantity, 0));
  if (subtotal <= 0 || items.length === 0) return { subtotalUSD: 0, discountUSD: 0, finalSubtotalUSD: 0, appliedRules: [], appliedRuleIds: [] };

  let totalDiscount = 0;
  const appliedRules: { rule: DiscountRule; savedUSD: number }[] = [];
  const normalizedCoupon = options.couponCode?.trim().toUpperCase() || '';
  const now = options.currentDate || new Date();
  const isNewUser = options.isNewUser ?? false;

  // Match checkout_create_order: bundles are processed in display_order/id order and consume quantities.
  if (options.productBundles?.length) {
    const available: Record<string, number> = {};
    for (const item of items) available[item.product.id] = (available[item.product.id] || 0) + item.quantity;
    const bundles = options.productBundles.filter(b => b.isActive !== false).slice().sort((a: any, b: any) => (Number(a.displayOrder ?? 0) - Number(b.displayOrder ?? 0)) || String(a.id).localeCompare(String(b.id)));
    for (const bundle of bundles) {
      if (!bundle.productIds.length) continue;
      let completeSets = Number.MAX_SAFE_INTEGER;
      let originalSum = 0;
      for (const pid of bundle.productIds) {
        const qty = available[pid] || 0;
        completeSets = Math.min(completeSets, qty);
        const product = items.find(i => i.product.id === pid)?.product;
        if (!product) { completeSets = 0; break; }
        originalSum += Math.max(0, getProductCurrentPrice(product));
      }
      const savingsPerSet = Math.max(0, originalSum - Math.max(0, bundle.bundlePriceUSD));
      if (completeSets > 0 && completeSets !== Number.MAX_SAFE_INTEGER && savingsPerSet > 0) {
        const saved = round2(savingsPerSet * completeSets);
        totalDiscount += saved;
        for (const pid of bundle.productIds) available[pid] = Math.max(0, (available[pid] || 0) - completeSets);
        const virtualRule: DiscountRule = { id: `bundle-${bundle.id}`, name: `${bundle.name} (Combo Offer)`, nameAr: `${bundle.nameAr || bundle.name} (عرض كومبو)`, type: 'fixed', value: saved, target: 'checkout', isActive: true };
        appliedRules.push({ rule: virtualRule, savedUSD: saved });
      }
    }
  }

  for (const rule of rules) {
    if (!rule.isActive || !inWindow(rule, now)) continue;
    if (rule.isNewUserOnly && !isNewUser) continue;
    const ruleCoupon = (rule as any).couponCode;
    if (ruleCoupon?.trim() && ruleCoupon.trim().toUpperCase() !== normalizedCoupon) continue;
    if (rule.minPurchaseUSD && subtotal < rule.minPurchaseUSD) continue;

    const target = rule.target || 'all';
    const eligible = target === 'checkout' || target === 'all' ? items : items.filter(i => matchesTarget(i.product, rule));
    const base = round2(eligible.reduce((sum, item) => sum + getProductCurrentPrice(item.product) * item.quantity, 0));
    if (base <= 0) continue;

    let ruleDiscount = 0;
    if (rule.type === 'bogo') {
      const buyX = Math.max(1, rule.buyQty || 1);
      const getY = Math.max(1, rule.getQty || 1);
      const pct = Math.min(100, Math.max(1, rule.getDiscountPercent !== undefined ? rule.getDiscountPercent : (rule.value || 100)));
      const groupSize = buyX + getY;
      let groups = 0;
      for (const item of eligible) groups += Math.floor(item.quantity / groupSize);
      if (rule.target === 'product') {
        for (const item of eligible) ruleDiscount += Math.floor(item.quantity / groupSize) * getY * getProductCurrentPrice(item.product) * pct / 100;
      } else {
        for (const item of eligible) ruleDiscount += Math.min(item.quantity, groups * getY) * getProductCurrentPrice(item.product) * pct / 100;
      }
    } else if (rule.type === 'percentage') {
      ruleDiscount = base * Math.min(100, Math.max(0, rule.value)) / 100;
    } else {
      ruleDiscount = Math.min(base, Math.max(0, rule.value));
    }
    ruleDiscount = round2(ruleDiscount);
    if (ruleDiscount > 0) { totalDiscount += ruleDiscount; appliedRules.push({ rule, savedUSD: ruleDiscount }); }
  }

  // Coupon existence, usage limits and coupon-owned rule data are checked authoritatively by checkout_create_order.
  const maxAllowed = round2(subtotal * MAX_TOTAL_DISCOUNT_PCT / 100);
  totalDiscount = Math.min(round2(Math.max(0, totalDiscount)), maxAllowed);
  return {
    subtotalUSD: subtotal,
    discountUSD: totalDiscount,
    finalSubtotalUSD: Math.max(0, round2(subtotal - totalDiscount)),
    appliedRules,
    appliedRuleIds: appliedRules.map(a => a.rule.id),
    appliedCoupon: normalizedCoupon || undefined
  };
}
