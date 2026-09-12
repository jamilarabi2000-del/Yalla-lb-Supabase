export interface CartLine {
  productId: string;
  quantity: number;
  selectedOption?: string;
}

export function round2(num: number): number {
  if (typeof num !== 'number' || !Number.isFinite(num)) return 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

export const MAX_TOTAL_DISCOUNT_PCT = 70;

function matchesTarget(product: any, rule: any): boolean {
  if (!rule || typeof rule !== 'object') return false;
  if (!rule.target || rule.target === 'checkout' || rule.target === 'all') return true;
  const targetVal = String(rule.targetValue || '').toLowerCase().trim();
  if (!targetVal) return false; // FAIL CLOSED: empty target value must NOT match all items
  if (rule.target === 'product') {
    return String(product.id || '').toLowerCase() === targetVal;
  }
  if (rule.target === 'category') {
    return String(product.category || '').toLowerCase() === targetVal;
  }
  if (rule.target === 'seller') {
    return (
      (product.sellerId && String(product.sellerId).toLowerCase() === targetVal) ||
      (product.seller && String(product.seller).toLowerCase() === targetVal) ||
      (product.artisan && String(product.artisan).toLowerCase().includes(targetVal)) ||
      (product.origin && String(product.origin).toLowerCase().includes(targetVal))
    );
  }
  if (rule.target === 'brand') {
    return (
      (product.artisan && String(product.artisan).toLowerCase().includes(targetVal)) ||
      (product.origin && String(product.origin).toLowerCase().includes(targetVal)) ||
      (product.name && String(product.name).toLowerCase().includes(targetVal))
    );
  }
  return false;
}

export function computeDiscounts(params: {
  lines: Array<{ product: any; quantity: number; unitPriceUSD: number }>;
  discounts: any[];
  bundles: any[];
  couponCode?: string;
  isNewCustomer?: boolean;
  subtotalUSD: number;
}): { discountUSD: number; appliedCoupon?: string } {
  const { lines, discounts = [], bundles = [], couponCode, isNewCustomer = false, subtotalUSD } = params;
  if (typeof subtotalUSD !== 'number' || !Number.isFinite(subtotalUSD) || subtotalUSD <= 0 || !Array.isArray(lines) || lines.length === 0) {
    return { discountUSD: 0 };
  }

  let totalDiscount = 0;
  let matchedCouponCode: string | undefined = undefined;
  const normalizedCoupon = couponCode && typeof couponCode === 'string' ? couponCode.trim().toUpperCase() : '';
  const now = new Date();

  // 1. Combo & Product Bundle automatic discounts
  if (Array.isArray(bundles) && bundles.length > 0) {
    const availableQuantities: { [key: string]: number } = {};
    for (const line of lines) {
      if (!line || !line.product) continue;
      const pid = String(line.product.id || '');
      const qty = typeof line.quantity === 'number' && Number.isFinite(line.quantity) ? Math.max(0, line.quantity) : 0;
      availableQuantities[pid] = (availableQuantities[pid] || 0) + qty;
    }

    const activeBundles = bundles.filter(b => b && b.isActive !== false);
    const bundlesWithSavings = activeBundles.map(bundle => {
      const bundleProductIds = Array.isArray(bundle.productIds) ? bundle.productIds.map((id: any) => String(id)) : [];
      const bundleProducts = lines
        .map(l => l.product)
        .filter(p => p && bundleProductIds.includes(String(p.id)))
        .filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);
      
      const originalSum = bundleProducts.reduce((sum, p) => {
        const pPrice = typeof p.priceUSD === 'number' && Number.isFinite(p.priceUSD) ? Math.max(0, p.priceUSD) : 0;
        return sum + pPrice;
      }, 0);
      const bundlePrice = typeof bundle.bundlePriceUSD === 'number' && Number.isFinite(bundle.bundlePriceUSD) ? Math.max(0, bundle.bundlePriceUSD) : 0;
      const savingsPerSet = Math.max(0, originalSum - bundlePrice);
      return { bundle, savingsPerSet, bundleProductIds };
    }).sort((a, b) => b.savingsPerSet - a.savingsPerSet);

    for (const { bundle, savingsPerSet, bundleProductIds } of bundlesWithSavings) {
      if (savingsPerSet <= 0 || bundleProductIds.length === 0) continue;

      if (bundle.startDate) {
        const bStart = new Date(bundle.startDate);
        if (!isNaN(bStart.getTime()) && now < bStart) continue;
      }
      if (bundle.endDate) {
        const bEnd = new Date(bundle.endDate);
        if (!isNaN(bEnd.getTime()) && now > bEnd) continue;
      }

      let completeSets = Infinity;
      for (const pid of bundleProductIds) {
        const qty = availableQuantities[pid] || 0;
        if (qty < completeSets) completeSets = qty;
      }

      if (completeSets > 0 && completeSets !== Infinity) {
        for (const pid of bundleProductIds) {
          availableQuantities[pid] -= completeSets;
        }
        const totalSaved = round2(savingsPerSet * completeSets);
        if (totalSaved > 0 && Number.isFinite(totalSaved)) {
          totalDiscount += totalSaved;
        }
      }
    }
  }

  // 2. Active discount rules
  if (Array.isArray(discounts)) {
    for (const rule of discounts) {
      if (!rule || rule.isActive === false) continue;
      if (rule.startDate) {
        const rStart = new Date(rule.startDate);
        if (!isNaN(rStart.getTime()) && now < rStart) continue;
      }
      if (rule.endDate) {
        const rEnd = new Date(rule.endDate);
        if (!isNaN(rEnd.getTime()) && now > rEnd) continue;
      }
      if (rule.isNewUserOnly && !isNewCustomer) continue;

      const ruleHasCoupon = typeof rule.couponCode === 'string' && rule.couponCode.trim() !== '';
      if (ruleHasCoupon) {
        if (rule.couponCode.trim().toUpperCase() !== normalizedCoupon) continue;
      }

      if (typeof rule.minPurchaseUSD === 'number' && Number.isFinite(rule.minPurchaseUSD) && subtotalUSD < rule.minPurchaseUSD) {
        continue;
      }

      let baseAmount = subtotalUSD;
      if (rule.target && rule.target !== 'checkout' && rule.target !== 'all') {
        const eligible = lines.filter(l => l && l.product && matchesTarget(l.product, rule));
        baseAmount = eligible.reduce((s, l) => {
          const uPrice = typeof l.unitPriceUSD === 'number' && Number.isFinite(l.unitPriceUSD) ? Math.max(0, l.unitPriceUSD) : 0;
          const qty = typeof l.quantity === 'number' && Number.isFinite(l.quantity) ? Math.max(0, l.quantity) : 0;
          return s + uPrice * qty;
        }, 0);
      }

      if (baseAmount <= 0) continue;

      let ruleDiscount = 0;
      if (rule.type === 'bogo') {
        const buyX = Math.max(1, typeof rule.buyQty === 'number' && Number.isFinite(rule.buyQty) ? rule.buyQty : 1);
        const getY = Math.max(1, typeof rule.getQty === 'number' && Number.isFinite(rule.getQty) ? rule.getQty : 1);
        const rawPct = typeof rule.getDiscountPercent === 'number' && Number.isFinite(rule.getDiscountPercent)
          ? rule.getDiscountPercent
          : (typeof rule.value === 'number' && Number.isFinite(rule.value) ? rule.value : 100);
        const discountPct = Math.min(100, Math.max(1, rawPct));
        const groupSize = buyX + getY;

        const eligibleLines = rule.target === 'checkout' || rule.target === 'all'
          ? lines
          : lines.filter(l => l && l.product && matchesTarget(l.product, rule));

        if (rule.target === 'product') {
          for (const item of eligibleLines) {
            if (item.quantity >= groupSize) {
              const fullGroups = Math.floor(item.quantity / groupSize);
              const freeUnits = fullGroups * getY;
              const unitPrice = typeof item.unitPriceUSD === 'number' && Number.isFinite(item.unitPriceUSD) ? item.unitPriceUSD : 0;
              ruleDiscount += freeUnits * unitPrice * (discountPct / 100);
            }
          }
        } else {
          const unitPrices: number[] = [];
          for (const item of eligibleLines) {
            const unitPrice = typeof item.unitPriceUSD === 'number' && Number.isFinite(item.unitPriceUSD) ? item.unitPriceUSD : 0;
            for (let i = 0; i < item.quantity; i++) {
              unitPrices.push(unitPrice);
            }
          }
          if (unitPrices.length >= groupSize) {
            unitPrices.sort((a, b) => a - b);
            const fullGroups = Math.floor(unitPrices.length / groupSize);
            const totalDiscountedUnits = fullGroups * getY;
            for (let i = 0; i < totalDiscountedUnits && i < unitPrices.length; i++) {
              ruleDiscount += unitPrices[i] * (discountPct / 100);
            }
          }
        }
      } else if (rule.type === 'percentage') {
        const rawVal = typeof rule.value === 'number' && Number.isFinite(rule.value) ? rule.value : 0;
        const pct = Math.min(100, Math.max(0, rawVal));
        ruleDiscount = baseAmount * (pct / 100);
      } else {
        const rawVal = typeof rule.value === 'number' && Number.isFinite(rule.value) ? rule.value : 0;
        const fixedVal = Math.max(0, rawVal);
        ruleDiscount = Math.min(fixedVal, baseAmount);
      }

      ruleDiscount = round2(ruleDiscount);
      if (ruleDiscount > 0 && Number.isFinite(ruleDiscount)) {
        totalDiscount += ruleDiscount;
        if (ruleHasCoupon) {
          matchedCouponCode = normalizedCoupon;
        }
      }
    }
  }

  const maxAllowedDiscount = round2(subtotalUSD * (MAX_TOTAL_DISCOUNT_PCT / 100));
  const boundedDiscount = Math.max(0, Math.min(round2(totalDiscount), maxAllowedDiscount));
  return {
    discountUSD: boundedDiscount,
    appliedCoupon: matchedCouponCode
  };
}
