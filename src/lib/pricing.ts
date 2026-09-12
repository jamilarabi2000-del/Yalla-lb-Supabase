import { CartItem, DiscountRule, Product, ProductBundle } from '../types';

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
    product: {
      ...l.product,
      priceUSD: typeof l.unitPriceUSD === 'number' ? l.unitPriceUSD : l.product.priceUSD
    },
    quantity: l.quantity
  }));

  const res = applyDiscounts(items, params.discounts, {
    couponCode: params.couponCode,
    isNewUser: params.isNewCustomer,
    productBundles: params.bundles
  });

  return {
    discountUSD: res.discountUSD,
    finalSubtotalUSD: res.finalSubtotalUSD,
    appliedCoupon: params.couponCode || undefined,
    appliedRules: res.appliedRules
  };
}

export interface DiscountCalculationResult {
  subtotalUSD: number;
  discountUSD: number;
  finalSubtotalUSD: number;
  appliedRules: {
    rule: DiscountRule;
    savedUSD: number;
  }[];
  appliedRuleIds: string[];
}

export interface DiscountOptions {
  couponCode?: string;
  isNewUser?: boolean;
  currentDate?: Date;
  productBundles?: ProductBundle[];
}

export const MAX_TOTAL_DISCOUNT_PCT = 70;

function matchesTarget(product: Product, rule: DiscountRule): boolean {
  if (!rule.target || rule.target === 'checkout' || rule.target === 'all') return true;
  if (!rule.targetValue || rule.targetValue.trim() === '') return false; // FAIL CLOSED

  const targetVal = rule.targetValue.toLowerCase().trim();

  if (rule.target === 'product') {
    return product.id.toLowerCase() === targetVal;
  }
  if (rule.target === 'category') {
    return product.category.toLowerCase() === targetVal;
  }
  if (rule.target === 'seller') {
    return (
      (product.artisan?.toLowerCase().includes(targetVal) ?? false) ||
      (product.origin?.toLowerCase().includes(targetVal) ?? false)
    );
  }
  if (rule.target === 'brand') {
    return (
      (product.artisan?.toLowerCase().includes(targetVal) ?? false) ||
      (product.origin?.toLowerCase().includes(targetVal) ?? false) ||
      (product.name?.toLowerCase().includes(targetVal) ?? false)
    );
  }
  return false;
}

/**
 * Calculates cart discounts accurately based on active rules, promotion periods, audience filters, and optional entered coupon code.
 */
export function applyDiscounts(
  items: CartItem[],
  rules: DiscountRule[],
  options: DiscountOptions = {}
): DiscountCalculationResult {
  const subtotal = items.reduce((sum, item) => sum + item.product.priceUSD * item.quantity, 0);
  if (subtotal <= 0 || items.length === 0) {
    return {
      subtotalUSD: 0,
      discountUSD: 0,
      finalSubtotalUSD: 0,
      appliedRules: [],
      appliedRuleIds: []
    };
  }

  let totalDiscount = 0;
  const appliedRules: { rule: DiscountRule; savedUSD: number }[] = [];
  const normalizedCoupon = options.couponCode ? options.couponCode.trim().toUpperCase() : '';
  const now = options.currentDate || new Date();
  const isNewUser = options.isNewUser ?? false;

  // 1. Calculate Combo & Product Bundle automatic discounts first
  if (options.productBundles && options.productBundles.length > 0) {
    const availableQuantities: { [key: string]: number } = {};
    for (const item of items) {
      const pid = item.product.id;
      availableQuantities[pid] = (availableQuantities[pid] || 0) + item.quantity;
    }

    const activeBundles = options.productBundles.filter(b => b.isActive !== false);
    
    // Sort bundles by unit savings descending to prioritize the best deal for the user
    const bundlesWithSavings = activeBundles.map(bundle => {
      // Find matching products in current items to calculate original prices
      const bundleProducts = items
        .map(item => item.product)
        .filter(p => bundle.productIds.includes(p.id))
        .filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);
      
      const originalSum = bundleProducts.reduce((sum, p) => sum + p.priceUSD, 0);
      const savingsPerSet = Math.max(0, originalSum - bundle.bundlePriceUSD);
      return { bundle, savingsPerSet };
    }).sort((a, b) => b.savingsPerSet - a.savingsPerSet);

    for (const { bundle, savingsPerSet } of bundlesWithSavings) {
      if (savingsPerSet <= 0 || bundle.productIds.length === 0) continue;

      // Exclude if promotion periods don't match
      if (bundle.startDate) {
        const bStart = new Date(bundle.startDate);
        if (!isNaN(bStart.getTime()) && now < bStart) continue;
      }
      if (bundle.endDate) {
        const bEnd = new Date(bundle.endDate);
        if (!isNaN(bEnd.getTime()) && now > bEnd) continue;
      }

      // Calculate complete sets we can form with the remaining items
      let completeSets = Infinity;
      for (const pid of bundle.productIds) {
        const qty = availableQuantities[pid] || 0;
        if (qty < completeSets) {
          completeSets = qty;
        }
      }

      if (completeSets > 0 && completeSets !== Infinity) {
        // Consume items
        for (const pid of bundle.productIds) {
          availableQuantities[pid] -= completeSets;
        }

        const totalSaved = Math.round(savingsPerSet * completeSets * 100) / 100;
        if (totalSaved > 0) {
          totalDiscount += totalSaved;
          const virtualRule: DiscountRule = {
            id: `bundle-${bundle.id}`,
            name: `${bundle.name} (Combo Offer)`,
            nameAr: `${bundle.nameAr || bundle.name} (عرض كومبو)`,
            type: 'fixed',
            value: totalSaved,
            target: 'checkout',
            isActive: true
          };
          appliedRules.push({ rule: virtualRule, savedUSD: totalSaved });
        }
      }
    }
  }

  for (const rule of rules) {
    if (!rule.isActive) continue;

    // Promotion period validation
    if (rule.startDate) {
      const start = new Date(rule.startDate);
      if (!isNaN(start.getTime()) && now < start) {
        continue; // Promotion hasn't started yet
      }
    }
    if (rule.endDate) {
      const end = new Date(rule.endDate);
      if (!isNaN(end.getTime()) && now > end) {
        continue; // Promotion has expired
      }
    }

    // New user exclusivity validation
    if (rule.isNewUserOnly && !isNewUser) {
      continue; // Exclude if rule is for new users only and customer is existing
    }

    // If rule has an associated coupon code, it must match the entered coupon
    const ruleCoupon = (rule as any).couponCode;
    if (ruleCoupon && typeof ruleCoupon === 'string' && ruleCoupon.trim() !== '') {
      if (ruleCoupon.trim().toUpperCase() !== normalizedCoupon) {
        continue;
      }
    }

    // Minimum purchase condition
    if (rule.minPurchaseUSD && subtotal < rule.minPurchaseUSD) {
      continue;
    }

    // Target calculation
    let baseApplicableAmount = 0;
    if (!rule.target || rule.target === 'checkout' || rule.target === 'all') {
      baseApplicableAmount = subtotal;
    } else {
      const eligibleItems = items.filter(item => matchesTarget(item.product, rule));
      baseApplicableAmount = eligibleItems.reduce((s, item) => s + item.product.priceUSD * item.quantity, 0);
    }

    if (baseApplicableAmount <= 0) continue;

    let ruleDiscount = 0;
    if (rule.type === 'bogo') {
      const buyX = Math.max(1, rule.buyQty || 1);
      const getY = Math.max(1, rule.getQty || 1);
      const discountPct = Math.min(100, Math.max(1, rule.getDiscountPercent !== undefined ? rule.getDiscountPercent : (rule.value || 100)));
      const groupSize = buyX + getY;

      // Group eligible items into individual unit price list
      const eligibleItems = !rule.target || rule.target === 'checkout' || rule.target === 'all'
        ? items
        : items.filter(item => matchesTarget(item.product, rule));

      if (rule.target === 'product') {
        // Single product BOGO: calculate units per product
        for (const item of eligibleItems) {
          if (item.quantity >= groupSize) {
            const fullGroups = Math.floor(item.quantity / groupSize);
            const freeUnits = fullGroups * getY;
            const savings = freeUnits * item.product.priceUSD * (discountPct / 100);
            ruleDiscount += savings;
          }
        }
      } else {
        // Multi-product / Category / Brand / Storewide BOGO:
        // Expand eligible items into individual price units, sort ascending (discount the cheapest eligible items in the set)
        const unitPrices: number[] = [];
        for (const item of eligibleItems) {
          for (let i = 0; i < item.quantity; i++) {
            unitPrices.push(item.product.priceUSD);
          }
        }
        
        if (unitPrices.length >= groupSize) {
          unitPrices.sort((a, b) => a - b); // Ascending order
          const fullGroups = Math.floor(unitPrices.length / groupSize);
          const totalDiscountedUnits = fullGroups * getY;
          // Discount the cheapest units
          for (let i = 0; i < totalDiscountedUnits && i < unitPrices.length; i++) {
            ruleDiscount += unitPrices[i] * (discountPct / 100);
          }
        }
      }
    } else if (rule.type === 'percentage') {
      ruleDiscount = baseApplicableAmount * (Math.min(100, Math.max(0, rule.value)) / 100);
    } else {
      // Fixed discount cannot exceed eligible amount and cannot be negative
      ruleDiscount = Math.max(0, Math.min(rule.value, baseApplicableAmount));
    }

    ruleDiscount = Math.round(ruleDiscount * 100) / 100;
    if (ruleDiscount > 0) {
      totalDiscount += ruleDiscount;
      appliedRules.push({ rule, savedUSD: ruleDiscount });
    }
  }

  // Enforce global maximum discount cap
  const maxAllowedDiscount = Math.round(subtotal * (MAX_TOTAL_DISCOUNT_PCT / 100) * 100) / 100;
  totalDiscount = Math.min(Math.round(totalDiscount * 100) / 100, maxAllowedDiscount);
  const finalSubtotal = Math.max(0, Math.round((subtotal - totalDiscount) * 100) / 100);

  return {
    subtotalUSD: subtotal,
    discountUSD: totalDiscount,
    finalSubtotalUSD: finalSubtotal,
    appliedRules,
    appliedRuleIds: appliedRules.map(a => a.rule.id)
  };
}
