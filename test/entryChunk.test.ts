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
    // The early script is left out of a build that has no project address (nothing to start), so give it one.
    const previousEnv = { NODE_ENV: process.env.NODE_ENV, url: process.env.VITE_SUPABASE_URL, key: process.env.VITE_SUPABASE_PUBLISHABLE_KEY };
    process.env.NODE_ENV = 'production';
    process.env.VITE_SUPABASE_URL = 'https://example.supabase.co';
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_example';
    let result: Awaited<ReturnType<typeof build>>;
    try {
      result = await build({
        configFile: path.resolve(process.cwd(), 'vite.config.ts'),
        mode: 'production',
        logLevel: 'silent',
        build: { write: false, outDir: path.resolve(process.cwd(), 'node_modules/.cache/entry-chunk-test') },
      });
    } finally {
      process.env.NODE_ENV = previousEnv.NODE_ENV;
      for (const [name, value] of [['VITE_SUPABASE_URL', previousEnv.url], ['VITE_SUPABASE_PUBLISHABLE_KEY', previousEnv.key]] as const) {
        if (value === undefined) delete process.env[name]; else process.env[name] = value;
      }
    }
    const outputs = (Array.isArray(result) ? result : [result]).flatMap(r => ('output' in r ? r.output : []));
    const chunks = outputs.filter(o => o.type === 'chunk');
    const entry = chunks.find(c => c.isEntry && c.name === 'main')!;
    expect(entry, 'the app\'s entry chunk').toBeDefined();

    const modules = Object.keys(entry.modules);
    expect(modules.filter(m => /node_modules[\\/](dompurify|papaparse)[\\/]/.test(m)), 'libraries').toEqual([]);
    expect(modules.filter(m => /src[\\/]lib[\\/]productTemplate\./.test(m)), 'the bulk importer').toEqual([]);
    for (const name of LAZY) expect(modules.some(m => m.includes(`components/${name}.tsx`)), name).toBe(false);

    // The script that starts the first reads while the app downloads is a file of its own, tiny,
    // that imports only a small file it shares with the app (the list of reads and the picture-size
    // helper, free of libraries): two or three kilobytes between them, not a share of the 400 kB.
    // It is not folded into the app's file.
    const early = chunks.find(c => c.isEntry && c.name === 'early')!;
    expect(early, 'the early script\'s chunk').toBeDefined();
    expect(early.code.length).toBeLessThan(2_500);
    expect(early.imports.length, 'what the early script imports').toBeGreaterThan(0);
    expect(Object.keys(early.modules).filter(m => /node_modules/.test(m))).toEqual([]);
    expect(modules.some(m => m.endsWith('src/early.ts')), 'the early script inside the app file').toBe(false);
    for (const file of early.imports) {
      const shared = chunks.find(c => c.fileName === file)!;
      expect(shared.code.length, file).toBeLessThan(4_000);
      expect(Object.keys(shared.modules).filter(m => /node_modules/.test(m)), file).toEqual([]);
      expect(Object.keys(shared.modules).some(m => m.endsWith('src/lib/earlyRequests.ts')) || Object.keys(shared.modules).some(m => m.endsWith('src/lib/responsiveImage.ts')), file).toBe(true);
    }

    // Only the two long-lived vendor files, and the small files it shares with the early script, load with the app.
    expect(entry.imports.every(file => /react-vendor|supabase-vendor/.test(file) || early.imports.includes(file)), entry.imports.join(', ')).toBe(true);
    expect(entry.code.length).toBeLessThan(ENTRY_BUDGET_BYTES);

    // ...and each of them is a file of its own that is fetched when wanted.
    const lazyNames = chunks.filter(c => !c.isEntry).map(c => c.name);
    for (const name of ['ProductsView', 'ProductDetailView', 'FavoritesView', 'ProductModal', 'CartDrawer', 'RequiredDetailsPrompt', 'NewPasswordPrompt', 'CustomBlockModal', 'productTemplate', 'sanitizeRichText']) {
      expect(lazyNames, name).toContain(name);
    }
  }, 120_000);
});
