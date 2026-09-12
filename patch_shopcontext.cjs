const fs = require('fs');
let content = fs.readFileSync('src/context/ShopContext.tsx', 'utf8');

// 1. Add `or` to firestore imports
content = content.replace(/startAfter,\n  runTransaction,\n  serverTimestamp/g, "startAfter,\n  runTransaction,\n  serverTimestamp,\n  or");

// 2. Fix discounts
content = content.replace(
  "const discountsColRef = collection(db, 'discounts');\n    const unsubscribe = onSnapshot(\n      discountsColRef,",
  "const discountsColRef = collection(db, 'discounts');\n    const q = isAdminUser ? discountsColRef : query(discountsColRef, where('isActive', '==', true));\n    const unsubscribe = onSnapshot(\n      q,"
);

// 3. Fix product_bundles
content = content.replace(
  "const bundlesColRef = collection(db, 'product_bundles');\n    const unsubscribe = onSnapshot(\n      bundlesColRef,",
  "const bundlesColRef = collection(db, 'product_bundles');\n    const q = isAdminUser ? bundlesColRef : query(bundlesColRef, where('isActive', '==', true));\n    const unsubscribe = onSnapshot(\n      q,"
);

// 4. Fix sellers
content = content.replace(
  "const sellersColRef = collection(db, 'sellers');\n    const unsubscribe = onSnapshot(\n      sellersColRef,",
  "const sellersColRef = collection(db, 'sellers');\n    const q = isAdminUser ? sellersColRef : query(sellersColRef, where('isActive', '==', true));\n    const unsubscribe = onSnapshot(\n      q,"
);

// 5. Fix products sync
content = content.replace(
  "const productsColRef = collection(db, 'products');\n    const unsubscribe = onSnapshot(\n      productsColRef,",
  "const productsColRef = collection(db, 'products');\n    const q = isAdminUser ? productsColRef : (isSellerUser && sellerId) ? query(productsColRef, or(where('isPublished', '==', true), where('sellerId', '==', sellerId))) : query(productsColRef, where('isPublished', '==', true));\n    const unsubscribe = onSnapshot(\n      q,"
);

// 6. Fix loadMoreProducts (if it has the same issue, though it's wrapped in a query already)
content = content.replace(
  "const productsColRef = collection(db, 'products');\n      const q = query(\n        productsColRef,\n        orderBy('id'),\n        startAfter(lastVisibleDocRef.current),\n        limit(24)\n      );",
  "const productsColRef = collection(db, 'products');\n      let constraints: any[] = [orderBy('id'), startAfter(lastVisibleDocRef.current), limit(24)];\n      if (!isAdminUser) {\n        if (isSellerUser && sellerId) {\n          constraints.unshift(or(where('isPublished', '==', true), where('sellerId', '==', sellerId)));\n        } else {\n          constraints.unshift(where('isPublished', '==', true));\n        }\n      }\n      const q = query(productsColRef, ...constraints);"
);

fs.writeFileSync('src/context/ShopContext.tsx', content);
console.log('Patched ShopContext.tsx');
