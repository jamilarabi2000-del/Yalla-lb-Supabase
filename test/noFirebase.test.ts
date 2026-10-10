import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// The database and sign-in are Supabase only. Firebase was the first backend and is retired: nothing may depend on it
// again, in the packages, in the code the browser runs, in the scripts, or in the security headers. (The old
// "firebaseUser" variable name in a few components is a leftover label for a Supabase user; it calls nothing.)
const root = process.cwd();
const read = (f: string) => fs.readFileSync(path.resolve(root, f), 'utf8');
const skipped = new Set(['node_modules', '.git', 'dist']);
const walk = (dir: string): string[] => fs.readdirSync(path.resolve(root, dir), { withFileTypes: true })
  .flatMap(d => d.isDirectory() ? (skipped.has(d.name) ? [] : walk(path.join(dir, d.name))) : [path.join(dir, d.name)]);

describe('no Firebase dependency', () => {
  it('is in no package', () => {
    const pkg = JSON.parse(read('package.json')) as Record<string, Record<string, string> | undefined>;
    const names = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {}), ...Object.keys(pkg.optionalDependencies ?? {})];
    expect(names.filter(n => /firebase/i.test(n))).toEqual([]);
    expect(Object.keys(JSON.parse(read('package-lock.json')).packages ?? {}).filter(n => /node_modules\/(@?firebase|firebase-admin)/i.test(n))).toEqual([]);
  });

  it('is imported by no source file and no script', () => {
    const files = [...walk('src'), ...walk('scripts'), ...walk('supabase/functions')].filter(f => /\.(m?[jt]sx?|cjs)$/.test(f));
    expect(files.length).toBeGreaterThan(50);
    const importing = files.filter(f => /(from\s+|import\s*\(\s*|require\s*\(\s*)['"](@?firebase|firebase-admin)[/'"]/.test(read(f)));
    expect(importing).toEqual([]);
  });

  it('is not allowed or called by the page, its security headers or the build settings', () => {
    const configs = ['index.html', 'vercel.json', 'netlify.toml', 'public/.htaccess', 'vite.config.ts', '.env.example'];
    for (const f of configs) {
      expect(read(f), f).not.toMatch(/firebaseio\.com|firebaseapp\.com|firestore\.googleapis|identitytoolkit|securetoken\.googleapis|gstatic\.com\/firebasejs|VITE_FIREBASE/i);
    }
  });

  it('has no Firebase service-account or client configuration file in the repository', () => {
    expect(walk('.').filter(f => /(^|\/)(firebase-applet-config\.json|firebase\.json|\.firebaserc|firestore\.rules|serviceAccount[^/]*\.json)$/i.test(f))).toEqual([]);
  });
});
