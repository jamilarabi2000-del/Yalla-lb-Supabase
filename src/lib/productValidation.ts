import { Product } from '../types';

/**
 * Normalizes seller resolution across artisan, seller, sellerId, and arabicSeller fields.
 */
export function resolveProductSeller(product: Partial<Product>): {
  sellerName: string;
  sellerId?: string;
  arabicSeller?: string;
} {
  const sellerName = (product.seller || product.artisan || '').trim();
  return {
    sellerName,
    sellerId: product.sellerId?.trim(),
    arabicSeller: product.arabicSeller?.trim()
  };
}

/**
 * Checks if a candidate seller item code is already used by another product from the SAME seller.
 */
export function checkDuplicateSellerItemCode(
  candidateCode: string | undefined | null,
  currentProductId: string | undefined | null,
  sellerId: string | undefined | null,
  sellerName: string | undefined | null,
  productsList: Product[]
): { isDuplicate: boolean; conflictingProduct?: Product } {
  if (!candidateCode || !candidateCode.trim()) {
    return { isDuplicate: false };
  }

  const normCode = candidateCode.trim().toLowerCase();
  const normSellerId = (sellerId || '').trim().toLowerCase();
  const normSellerName = (sellerName || '').trim().toLowerCase();

  const conflict = productsList.find(p => {
    // Exclude the product being edited
    if (currentProductId && p.id === currentProductId) {
      return false;
    }

    const existingCode = (p.sellerItemCode || '').trim().toLowerCase();
    if (existingCode !== normCode) {
      return false;
    }

    // Check if it belongs to the same seller using normalized resolution
    const resolved = resolveProductSeller(p);
    const existingSellerId = (resolved.sellerId || '').toLowerCase();
    const existingSellerName = resolved.sellerName.toLowerCase();

    if (normSellerId && existingSellerId && normSellerId === existingSellerId) {
      return true;
    }
    if (normSellerName && existingSellerName && normSellerName === existingSellerName) {
      return true;
    }
    if (normSellerId && existingSellerName && normSellerId === existingSellerName) {
      return true;
    }
    if (normSellerName && existingSellerId && normSellerName === existingSellerId) {
      return true;
    }

    // If neither side has seller info specified, treat as same general pool
    if (!normSellerId && !normSellerName && !existingSellerId && !existingSellerName) {
      return true;
    }

    return false;
  });

  return {
    isDuplicate: Boolean(conflict),
    conflictingProduct: conflict
  };
}

/**
 * Checks if a candidate product number (sellerItemCode or product ID/SKU)
 * already exists in the product catalog.
 */
export function checkDuplicateProductNumber(
  candidateNumber: string | undefined | null,
  currentProductId: string | undefined | null,
  productsList: Product[],
  sellerId?: string | undefined | null,
  sellerName?: string | undefined | null
): { isDuplicate: boolean; conflictingProduct?: Product } {
  if (!candidateNumber || !candidateNumber.trim()) {
    return { isDuplicate: false };
  }

  const normalizedCandidate = candidateNumber.trim().toLowerCase();

  // 1. Direct SKU / Product ID match (must be globally unique)
  const idConflict = productsList.find(p => {
    if (currentProductId && p.id === currentProductId) return false;
    return (p.id || '').trim().toLowerCase() === normalizedCandidate;
  });

  if (idConflict) {
    return { isDuplicate: true, conflictingProduct: idConflict };
  }

  // 2. Seller Item Code match (must be unique per seller)
  return checkDuplicateSellerItemCode(candidateNumber, currentProductId, sellerId, sellerName, productsList);
}

/**
 * Checks if a candidate description (English or Arabic craft story)
 * is already used by another product in the catalog.
 */
export function checkDuplicateDescription(
  candidateDescription: string | undefined | null,
  currentProductId: string | undefined | null,
  productsList: Product[]
): { isDuplicate: boolean; conflictingProduct?: Product } {
  if (!candidateDescription || !candidateDescription.trim()) {
    return { isDuplicate: false };
  }

  const cleanCandidate = candidateDescription.trim().toLowerCase().replace(/\s+/g, ' ');

  // Ignore short generic placeholders under 10 characters
  if (cleanCandidate.length < 10) {
    return { isDuplicate: false };
  }

  const conflict = productsList.find(p => {
    // Exclude the product being edited
    if (currentProductId && p.id === currentProductId) {
      return false;
    }

    const existingDesc = (p.description || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const existingCraft = (p.craftStory || '').trim().toLowerCase().replace(/\s+/g, ' ');

    return (
      (existingDesc && existingDesc.length >= 10 && existingDesc === cleanCandidate) ||
      (existingCraft && existingCraft.length >= 10 && existingCraft === cleanCandidate)
    );
  });

  return {
    isDuplicate: Boolean(conflict),
    conflictingProduct: conflict
  };
}
