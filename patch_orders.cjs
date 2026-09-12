const fs = require('fs');
let content = fs.readFileSync('src/context/ShopContext.tsx', 'utf8');

content = content.replace(
  "q = query(collectionGroup(db, 'sellers'), where('sellerId', '==', sellerId), limit(200));",
  "// Sellers cannot list all orders via a global collectionGroup due to strict security rules.\n      // They only fetch their own customer orders here.\n      q = query(collection(db, 'orders'), where('userId', '==', firebaseUser.uid), limit(100));"
);

fs.writeFileSync('src/context/ShopContext.tsx', content);
console.log('Patched orders query');
