import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { build } from 'vite';

// The text-pattern checks in loadingSplit.test.ts say what App.tsx asks for; this one builds
// the app and looks at what really ended up in the first download, so an import added
// somewhere else cannot quietly put the weight back.
const LAZY = ['ProductsView', 'ProductDetailView', 'FavoritesView', 'ProductModal', 'CartDrawer', 'RequiredDetailsPrompt', 'NewPasswordPrompt', 'CustomBlockModal', 'ProductReviews'];
// Measured 399 KB (118 KB gzip) when this was written; the budget leaves room to grow
// a little, not to put the weight back (it was 557 KB).
const ENTRY_BUDGET_BYTES = 440_000;

describe('the first download', () => {
  it('holds none of the on-demand code, and stays inside its size budget', async () => {
    // The test runner sets NODE_ENV=test, which would leave development-only code in the
    // files; build exactly as the real build does.
    const previousEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    let result: Awaited<ReturnType<typeof build>>;
    try {
      result = await build({
        configFile: path.resolve(process.cwd(), 'vite.config.ts'),
        mode: 'production',
        logLevel: 'silent',
        build: { write: false, outDir: path.resolve(process.cwd(), 'node_modules/.cache/entry-chunk-test') },
      });
    } finally {
      process.env.NODE_ENV = previousEnv;
    }
    const outputs = (Array.isArray(result) ? result : [result]).flatMap(r => ('output' in r ? r.output : []));
    const chunks = outputs.filter(o => o.type === 'chunk');
    const entry = chunks.find(c => c.isEntry)!;
    expect(entry, 'an entry chunk').toBeDefined();

    const modules = Object.keys(entry.modules);
    expect(modules.filter(m => /node_modules[\\/](dompurify|papaparse)[\\/]/.test(m)), 'libraries').toEqual([]);
    expect(modules.filter(m => /src[\\/]lib[\\/]productTemplate\./.test(m)), 'the bulk importer').toEqual([]);
    for (const name of LAZY) expect(modules.some(m => m.includes(`components/${name}.tsx`)), name).toBe(false);

    // Only the two long-lived vendor files load with it.
    expect(entry.imports.every(file => /react-vendor|supabase-vendor/.test(file)), entry.imports.join(', ')).toBe(true);
    expect(entry.code.length).toBeLessThan(ENTRY_BUDGET_BYTES);

    // ...and each of them is a file of its own that is fetched when wanted.
    const lazyNames = chunks.filter(c => !c.isEntry).map(c => c.name);
    for (const name of ['ProductsView', 'ProductDetailView', 'FavoritesView', 'ProductModal', 'CartDrawer', 'RequiredDetailsPrompt', 'NewPasswordPrompt', 'CustomBlockModal', 'productTemplate', 'sanitizeRichText']) {
      expect(lazyNames, name).toContain(name);
    }
  }, 120_000);
});
