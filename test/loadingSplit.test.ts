import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Every visitor used to download one 1.1 MB file holding the whole storefront,
// the account page, the seller dashboard, the admin sign-in and the admin
// quick editor. Measured on a production build (gzip, phone): home and product
// pages went from 307 KB of JavaScript to 278 KB, split so React and Supabase
// (125 KB) stay cached across deploys; the account page, seller dashboard and
// admin code load only when used. These checks keep that split.
const read = (f: string) => fs.readFileSync(path.resolve(process.cwd(), f), 'utf8');
const app = read('src/App.tsx');

describe('shoppers download only what they use', () => {
  it('loads the account page, the admin sign-in and the admin quick editor on demand', () => {
    for (const name of ['AccountViewController', 'AdminGuard', 'AdminQuickEditor']) {
      expect(app, name).not.toMatch(new RegExp(`^import \\{[^}]*\\b${name}\\b[^}]*\\} from './components/${name}';`, 'm'));
      expect(app, name).toMatch(new RegExp(`const ${name} = lazyWithRetry\\(\\(\\) => import\\('./components/${name}'\\)`));
    }
    // The quick editor is only mounted for administrators.
    expect(app).toMatch(/\{isAdminUser && <Suspense fallback=\{null\}><AdminQuickEditor /);
    expect(app).toMatch(/\{activeTab === 'account' && <Suspense fallback=\{[\s\S]*?\}><AccountViewController \/><\/Suspense>\}/);
  });

  it('loads the seller dashboard only for sellers', () => {
    const account = read('src/components/AccountView.tsx');
    expect(account).not.toMatch(/^import \{ SellerDashboard \} from '\.\/SellerDashboard';/m);
    expect(account).toMatch(/const SellerDashboard = lazy\(\(\) => import\('\.\/SellerDashboard'\)/);
  });

  it('keeps React and the Supabase client in their own long-lived files', () => {
    const vite = read('vite.config.ts');
    expect(vite).toMatch(/return 'react-vendor';/);
    expect(vite).toMatch(/return 'supabase-vendor';/);
  });

  it('ships the logo and the fallback hero photos as WebP', () => {
    expect(read('src/components/Navbar.tsx')).toContain("import systemLogo from '../assets/images/system_logo_1786837577985.webp';");
    const top = read('src/components/HomeTopContainer.tsx');
    expect(top).toContain("rachaya_mountain_perfect_1786799009637.webp'");
    expect(top).toContain("raouche_rocks_sunset_1786799732002.webp'");
    expect(top).not.toMatch(/assets\/images\/[^']+\.jpg'/);
  });
});
