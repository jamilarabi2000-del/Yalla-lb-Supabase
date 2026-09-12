const fs = require('fs');
const content = fs.readFileSync('src/context/ShopContext.tsx', 'utf8');
const lines = content.split('\n');
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('onSnapshot(')) {
    console.log(`\n--- onSnapshot at line ${i+1} ---`);
    for (let j = Math.max(0, i - 15); j < Math.min(lines.length, i + 5); j++) {
      console.log(`${j+1}: ${lines[j]}`);
    }
  }
}
