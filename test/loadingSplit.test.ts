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

// Bundle 4d: the first download used to hold the catalogue, the product page, the
// favourites, the cart drawer, the quick view, two prompts, an admin modal, the
// rich-text cleaner and the CSV importer. Measured on a production build, the
// entry file went from 556.6 KB (166.2 KB gzip) to 399.3 KB (118.0 KB gzip).
const LAZY_PAGES = ['ProductsView', 'ProductDetailView', 'FavoritesView'];
const LAZY_OVERLAYS = ['ProductModal', 'CartDrawer', 'RequiredDetailsPrompt', 'NewPasswordPrompt', 'CustomBlockModal'];

describe('the first download holds only what the first page needs', () => {
  it('loads the pages, the cart, the quick view and the prompts on demand, by a named loader', () => {
    for (const name of [...LAZY_PAGES, ...LAZY_OVERLAYS]) {
      expect(app, name).not.toMatch(new RegExp(`^import \\{[^}]*\\b${name}\\b[^}]*\\} from './components/${name}';`, 'm'));
      expect(app, name).toContain(`const load${name} = () => import('./components/${name}').then(m => ({ default: m.${name} }));`);
      expect(app, name).toContain(`const ${name} = lazyWithRetry(load${name});`);
    }
  });

  it('draws each page behind a loading spinner', () => {
    for (const [tab, name] of [['products', 'ProductsView'], ['product_detail', 'ProductDetailView'], ['favorites', 'FavoritesView']]) {
      expect(app, name).toContain(`{activeTab === '${tab}' && <Suspense fallback={<PageLoading />}><${name} /></Suspense>}`);
    }
  });

  it('draws the cart, the quick view and the prompts only when something opens them', () => {
    expect(app).toContain('{selectedProductForModal && <Suspense fallback={null}><ProductModal /></Suspense>}');
    expect(app).toContain('{isCartOpen && <Suspense fallback={null}><CartDrawer /></Suspense>}');
    expect(app).toContain('{!adminOpen && authUser?.uid && <Suspense fallback={null}><RequiredDetailsPrompt /></Suspense>}');
    expect(app).toContain('{authUser?.uid && passwordRecoveryPending && <Suspense fallback={null}><NewPasswordPrompt /></Suspense>}');
    expect(app).toMatch(/\{isCustomBlockModalOpen && <Suspense fallback=\{null\}><CustomBlockModal isOpen=/);
  });

  it('fetches the cart, the quick view and the likely next pages once the page has loaded', () => {
    expect(app).toContain('warmChunksWhenIdle([loadCartDrawer, loadProductModal, loadProductDetailView, loadProductsView, loadFavoritesView])');
  });

  it('starts a shared link\'s page fetching at once, alongside the app starting', () => {
    expect(app).toContain('const page = pageForPath(window.location.pathname);');
    expect(app).toContain("if (page === 'product') void loadProductDetailView().catch(() => {});");
    expect(app).toContain("else if (page === 'products') void loadProductsView().catch(() => {});");
    expect(app).toContain("else if (page === 'favorites') void loadFavoritesView().catch(() => {});");
  });

  it('is not undone by another file importing them', () => {
    const walk = (dir: string): string[] => fs.readdirSync(path.resolve(process.cwd(), dir), { withFileTypes: true })
      .flatMap(e => e.isDirectory() ? walk(`${dir}/${e.name}`) : /\.tsx?$/.test(e.name) ? [`${dir}/${e.name}`] : []);
    for (const name of [...LAZY_PAGES, ...LAZY_OVERLAYS]) {
      const importers = walk('src').filter(f => new RegExp(`from '(\\./|\\.\\./(components/)?)${name}'`).test(read(f)));
      expect(importers, name).toEqual([]);
    }
  });

  it('keeps the bulk importer and its CSV reader out of the first download', () => {
    const ctx = read('src/context/ShopContext.tsx');
    expect(ctx).not.toMatch(/^import \{[^}]*importTemplateRows[^}]*\} from '\.\.\/lib\/productTemplate';/m);
    expect(ctx).toContain("const { importTemplateRows } = await import('../lib/productTemplate');");
  });
});

