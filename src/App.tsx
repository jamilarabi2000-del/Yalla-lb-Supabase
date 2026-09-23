import React, { useEffect, useRef, useState, Suspense, lazy } from 'react';
import { ShopProvider, useShop } from './context/ShopContext';
import { Navbar } from './components/Navbar';
import { HomeView } from './components/HomeView';
import { ProductsView } from './components/ProductsView';
import { AccountViewController } from './components/AccountViewController';
import { FavoritesView } from './components/FavoritesView';
import { AdminErrorBoundary } from './components/AdminErrorBoundary';
import { StorefrontErrorBoundary } from './components/StorefrontErrorBoundary';
import { AdminGuard } from './components/AdminGuard';
import { AdminSessionGate } from './components/AdminSessionGate';
import { ProductDetailView } from './components/ProductDetailView';
import { ProductModal } from './components/ProductModal';
import { CartDrawer } from './components/CartDrawer';
import { Footer } from './components/Footer';
import { FooterQuickLinks } from './components/FooterQuickLinks';
import { AdminQuickEditor } from './components/AdminQuickEditor';
import { TextStyleLayer } from './components/TextStyleLayer';
import { CustomBlockModal } from './components/CustomBlockModal';
import { syncDomHead } from './utils/domHeadSync';
import { currentDesignSelector } from './lib/designSelectors';
import { isAdminEntryPath, rememberAdminEntry, rememberedAdminEntry } from './lib/adminEntry';
import { CheckCircle2, AlertCircle, Info, Loader2 } from 'lucide-react';

function lazyWithRetry<T extends React.ComponentType<any>>(factory: () => Promise<any>) {
  return lazy(async () => {
    let attempts = 3;
    while (attempts > 0) {
      try {
        const module = await factory();
        try {
          if (typeof window !== 'undefined' && window.sessionStorage) sessionStorage.removeItem('chunk_reload_attempted');
        } catch {}
        return { default: module.default || module.AdminView || module.CheckoutView || Object.values(module)[0] };
      } catch (error) {
        attempts--;
        console.warn(`Dynamic module import failed (${attempts} attempts left), retrying...`, error);
        if (attempts === 0) {
          try {
            if (typeof window !== 'undefined' && window.sessionStorage && !sessionStorage.getItem('chunk_reload_attempted')) {
              sessionStorage.setItem('chunk_reload_attempted', '1');
              window.location.reload();
            }
          } catch {}
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
    }
    throw new Error('Failed to load module');
  });
}

const CheckoutView = lazyWithRetry(() => import('./components/CheckoutView'));
const AdminView = lazyWithRetry(() => import('./components/AdminView'));

const MainAppContent: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    selectedProductDetail,
    openProductDetail,
    setSelectedProductDetail,
    products,
    toast,
    siteContent,
    selectedCategory,
    setSelectedCategory,
    isCustomBlockModalOpen,
    setIsCustomBlockModalOpen,
    customBlockToEdit,
    setCustomBlockToEdit,
    user,
    isSellerUser,
    isAdminUser,
    language,
    setLanguage,
    searchQuery,
    setSearchQuery,
    completeEmailLinkSignIn
  } = useShop();
  const isPopStateRef = useRef(false);
  const [notFoundPath, setNotFoundPath] = useState<string | null>(null);
  // Set once this visit arrives at the private console address. The console
  // (and its sign-in form) renders only then, or for a signed-in admin.
  const [adminEntryOpen, setAdminEntryOpen] = useState(false);
  const adminOpen = activeTab === 'admin' && (adminEntryOpen || isAdminUser);
  // An admin screen nobody opened properly is just another missing page.
  const showNotFound = Boolean(notFoundPath) || (activeTab === 'admin' && !adminOpen);

  // The console and missing pages stay out of search results. Every address
  // returns this same app, so a crawler cannot tell a missing page by status.
  useEffect(() => {
    if (!adminOpen && !showNotFound) return;
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, [adminOpen, showNotFound]);

  useEffect(() => {
    syncDomHead(siteContent, language);
  }, [siteContent, siteContent?.seo, siteContent?.navbar, language]);

  useEffect(() => {
    if (!siteContent?.theme) return;
    const root = document.documentElement;
    if (siteContent.theme.primaryColor) {
      root.style.setProperty('--gold', siteContent.theme.primaryColor);
      root.style.setProperty('--gold-dark', siteContent.theme.primaryColor + 'cc');
    }
    if (siteContent.theme.accentColor) root.style.setProperty('--yalla-accent', siteContent.theme.accentColor);

    const fontMap: Record<string, string> = {
      plus_jakarta: '"Plus Jakarta Sans", sans-serif', playfair: '"Playfair Display", serif',
      inter: '"Inter", sans-serif', tajawal: '"Tajawal", sans-serif', cairo: '"Cairo", sans-serif',
      amiri: '"Amiri", serif'
    };
    document.body.style.fontFamily = fontMap[siteContent.theme.fontFamily] || '"Plus Jakarta Sans", sans-serif';

    const styles = siteContent.theme.textStyles || {};
    const esc = (v: any) => typeof v === 'string' ? v.replace(/[;{}]/g, '') : '';
    const cssFor = (slot: any, selectors: string) => {
      const s = (styles as Record<string, any>)[slot] || {};
      const rules = [
        ['font-family', s.fontFamily], ['font-size', s.fontSize], ['font-weight', s.fontWeight],
        ['font-style', s.fontStyle], ['color', s.color], ['text-align', s.textAlign],
        ['line-height', s.lineHeight], ['letter-spacing', s.letterSpacing], ['word-spacing', s.wordSpacing],
        ['max-width', s.maxWidth], ['margin', s.margin], ['padding', s.padding],
        ['text-transform', s.textTransform], ['white-space', s.whiteSpace],
        ['overflow', s.overflow], ['text-overflow', s.textOverflow]
      ].filter(([,v]) => v !== undefined && v !== '').map(([k,v]) => `${k}:${esc(v)} !important`).join(';');
      return rules ? `${selectors}{${rules}}` : '';
    };
    const css = [
      cssFor('body', ':root #main-content p, :root #main-content li, :root #main-content dd'),
      cssFor('heading1', ':root #main-content h1'),
      cssFor('heading2', ':root #main-content h2'),
      cssFor('heading3', ':root #main-content h3'),
      cssFor('subtitle', ':root #main-content .yalla-text-subtitle'),
      cssFor('small', ':root #main-content small, :root #main-content .yalla-text-small'),
      cssFor('label', ':root #main-content label, :root #main-content .yalla-text-label'),
      // Dropdowns are buttons too (role="combobox"); button styling is not for them.
      cssFor('button', ':root #main-content button:not([role="combobox"]), :root #main-content [role="button"]'),
      cssFor('nav', ':root nav a, :root nav button:not([role="combobox"])'),
      cssFor('price', ':root #main-content .yalla-text-price'),
      cssFor('badge', ':root #main-content .yalla-text-badge'),
      cssFor('input', ':root #main-content input::placeholder, :root #main-content textarea::placeholder'),
      cssFor('link', ':root #main-content a')
    ].join('');
    const selectorFor = (slot: string) =>
      slot === 'heading1' ? '#main-content h1' :
      slot === 'heading2' ? '#main-content h2' :
      slot === 'heading3' ? '#main-content h3' :
      slot === 'body' ? '#main-content p,#main-content li,#main-content dd' :
      slot === 'small' ? '#main-content small,#main-content .yalla-text-small' :
      slot === 'label' ? '#main-content label,#main-content .yalla-text-label' :
      slot === 'button' ? '#main-content button:not([role="combobox"]),#main-content [role="button"]' :
      slot === 'nav' ? 'nav a,nav button:not([role="combobox"])' :
      slot === 'link' ? '#main-content a' :
      slot === 'input' ? '#main-content input::placeholder,#main-content textarea::placeholder' :
      slot === 'price' ? '#main-content .yalla-text-price' :
      slot === 'badge' ? '#main-content .yalla-text-badge' :
      '#main-content .yalla-text-' + slot;
    const responsive = Object.entries(styles).map(([slot, s]: any) => {
      const selector = selectorFor(slot);
      const tablet = s?.fontSizeTablet ? `@media (min-width:768px) and (max-width:1279px){${selector}{font-size:${esc(s.fontSizeTablet)} !important}}` : '';
      const mobile = s?.fontSizeMobile ? `@media (max-width:767px){${selector}{font-size:${esc(s.fontSizeMobile)} !important}}` : '';
      return tablet + mobile;
    }).join('');
    let style = document.getElementById('yalla-admin-text-styles') as HTMLStyleElement | null;
    if (!style) { style = document.createElement('style'); style.id = 'yalla-admin-text-styles'; document.head.appendChild(style); }
    const designRules = (siteContent.theme as any).designRules || {};
    const cssSafe = (v: any) => typeof v === 'string' ? v.replace(/[{};]/g, '') : '';
    const buildDecl = (rules: Record<string,string> | undefined) => Object.entries(rules || {})
      .filter(([k,v]) => k && typeof v === 'string' && v !== '')
      .map(([k,v]) => `${k}:${cssSafe(v)} !important`).join(';');
    const designCss = Object.values(designRules).map((rule: any) => {
      const selector = typeof rule?.selector === 'string' ? currentDesignSelector(rule.selector.replace(/[{}]/g, '')) : '';
      if (!selector) return '';
      const base = buildDecl(rule.desktop);
      const tablet = rule.tablet ? '@media (min-width:768px) and (max-width:1279px){' + selector + '{' + buildDecl(rule.tablet) + '}}' : '';
      const mobile = rule.mobile ? '@media (max-width:767px){' + selector + '{' + buildDecl(rule.mobile) + '}}' : '';
      const hover = rule.hover ? selector + ':hover{' + buildDecl(rule.hover) + '}' : '';
      const hidden = rule.enabled === false ? 'display:none !important;' : '';
      return selector + '{' + hidden + base + '}' + hover + tablet + mobile;
    }).join('');
    // Storefront styling stays on the storefront. The admin panel renders
    // inside the same #main-content, so these rules restyled it too -- and
    // hiding "All storefront buttons" hid the admin's own controls, including
    // the one that would undo it.
    const onStorefront = activeTab !== 'admin';
    style.textContent = onStorefront ? css + responsive + designCss + (siteContent.theme.customCss || '') : '';
  }, [siteContent?.theme, activeTab]);

  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.history && (!window.history.state || typeof window.history.state.depth !== 'number')) {
        const fullPath = window.location.pathname + (window.location.search || '');
        window.history.replaceState({ appNav: true, depth: 0 }, '', fullPath);
      }
    } catch {}
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const urlLang = searchParams.get('lang');
      if (urlLang === 'ar' || urlLang === 'en') setLanguage(urlLang);
      if (searchParams.has('apiKey') && (searchParams.has('oobCode') || searchParams.has('emailSignIn'))) {
        completeEmailLinkSignIn().catch(err => console.warn('[App] Automatic email link sign-in check notice:', err));
      }
    } catch {}
  }, [setLanguage, completeEmailLinkSignIn]);

  const productsRef = useRef(products);
  productsRef.current = products;
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  // syncRouteFromUrl runs on mount and on popstate with an empty dependency
  // array, so a plain `searchQuery` read inside it is frozen at its initial
  // '' forever and every comparison against it is meaningless. Same ref
  // pattern as activeTab and products above.
  const searchQueryRef = useRef(searchQuery);
  searchQueryRef.current = searchQuery;

  useEffect(() => {
    const syncRouteFromUrl = () => {
      isPopStateRef.current = true;
      const rawPath = window.location.pathname.replace(/^\/+|\/+$/g, '');
      const searchParams = new URLSearchParams(window.location.search);
      const urlLang = searchParams.get('lang');
      const urlSearch = searchParams.get('search');

      if (urlLang === 'ar' || urlLang === 'en') setLanguage(urlLang);
      if (urlSearch !== null && urlSearch !== searchQueryRef.current) setSearchQuery(urlSearch);
      setNotFoundPath(null);

      if (rawPath === '' || rawPath === 'home') {
        setSelectedProductDetail(null);
        if (activeTabRef.current !== 'home') setActiveTab('home');
        return;
      }

      const productMatch = rawPath.match(/^product\/([^/]+)$/);
      if (productMatch) {
        const prodId = decodeURIComponent(productMatch[1]);
        const foundProduct = productsRef.current.find(p => p.id === prodId);
        setActiveTab('product_detail');
        if (foundProduct) openProductDetail(foundProduct);
        else setSelectedProductDetail(null);
        return;
      }

      if (rawPath === 'products' || rawPath.startsWith('products/')) {
        setSelectedProductDetail(null);
        setActiveTab('products');
        const categoryPath = rawPath.slice('products/'.length);
        setSelectedCategory(categoryPath ? decodeURIComponent(categoryPath) : 'all');
        return;
      }

      if (rawPath === 'checkout' || rawPath === 'account' || rawPath === 'favorites') {
        setSelectedProductDetail(null);
        setActiveTab(rawPath as any);
        return;
      }

      setSelectedProductDetail(null);
      // /admin and /seller land here like any unknown page. The only address
      // that opens the console is the private one, recognised by its hash.
      const checkedPath = window.location.pathname;
      const notFound = () => setNotFoundPath('/' + rawPath);
      isAdminEntryPath(rawPath).then(isEntry => {
        if (window.location.pathname !== checkedPath) return; // navigated away meanwhile
        if (!isEntry) return notFound();
        rememberAdminEntry(rawPath);
        setAdminEntryOpen(true);
        isPopStateRef.current = true;
        setActiveTab('admin');
      }, notFound);
    };

    syncRouteFromUrl();
    window.addEventListener('popstate', syncRouteFromUrl);
    return () => window.removeEventListener('popstate', syncRouteFromUrl);
  }, []);

  // Resolve a direct product deep link after the Supabase catalogue finishes hydrating.
  useEffect(() => {
    if (notFoundPath || !window.location.pathname.match(/^\/product\/[^/]+$/)) return;
    const prodId = decodeURIComponent(window.location.pathname.slice('/product/'.length));
    const foundProduct = productsRef.current.find(p => p.id === prodId);
    if (foundProduct && selectedProductDetail?.id !== foundProduct.id) {
      isPopStateRef.current = true;
      setActiveTab('product_detail');
      openProductDetail(foundProduct);
    }
  }, [products, notFoundPath, selectedProductDetail, openProductDetail, setActiveTab]);

  useEffect(() => {
    if (isPopStateRef.current) {
      isPopStateRef.current = false;
      return;
    }
    let targetPath = activeTab === 'home' ? '' : activeTab;
    if (activeTab === 'product_detail' && selectedProductDetail) targetPath = `product/${selectedProductDetail.id}`;
    else if (activeTab === 'products' && selectedCategory && selectedCategory !== 'all') targetPath = `products/${encodeURIComponent(selectedCategory)}`;
    if (notFoundPath) return;
    if (activeTab === 'admin') {
      // The console's address is private: show it only if this tab opened it,
      // and never write /admin.
      const entry = rememberedAdminEntry();
      try {
        if (entry && window.location.pathname !== entry && window.history) {
          const currentDepth = (window.history.state && typeof window.history.state.depth === 'number') ? window.history.state.depth : 0;
          window.history.pushState({ appNav: true, depth: currentDepth + 1 }, '', entry);
        }
      } catch {}
      return;
    }
    const targetUrl = targetPath === '' || targetPath === 'home' ? '/' : `/${targetPath}`;
    const currentParams = new URLSearchParams(window.location.search);
    if (activeTab !== 'products') currentParams.delete('search');
    else if (searchQuery.trim()) currentParams.set('search', searchQuery.trim());
    else currentParams.delete('search');
    const serializedSearch = currentParams.toString();
    const fullTarget = serializedSearch ? `${targetUrl}?${serializedSearch}` : targetUrl;
    try {
      if (typeof window !== 'undefined' && (window.location.pathname !== targetUrl || window.location.search !== (serializedSearch ? `?${serializedSearch}` : '')) && window.history) {
        const currentDepth = (window.history.state && typeof window.history.state.depth === 'number') ? window.history.state.depth : 0;
        window.history.pushState({ appNav: true, depth: currentDepth + 1 }, '', fullTarget);
      }
    } catch {}
  }, [activeTab, selectedProductDetail, selectedCategory, searchQuery, notFoundPath]);

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F7F8] text-[#111111] selection:bg-[#F3E5AB] selection:text-[#111111] font-sans antialiased">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <div data-seo-source="builder" id="seo-snapshot" aria-hidden="true" style={{ position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}>
        <div><header><h1>Yalla.lb</h1><p>A premium, high-velocity marketplace bridging Lebanese craftsmanship with modern digital commerce for a seamless, hyper-local shopping experience.</p></header><nav aria-label="Pages"><h2>Pages</h2><ul><li><a href="/products">Products</a> — Products on Yalla.lb. A premium, high-velocity marketplace bridging Lebanese craftsmanship with modern.</li><li><a href="/checkout">Checkout</a> — Checkout on Yalla.lb. A premium, high-velocity marketplace bridging Lebanese craftsmanship with modern.</li><li><a href="/account">Account</a> — Account on Yalla.lb. A premium, high-velocity marketplace bridging Lebanese craftsmanship with modern.</li></ul></nav></div>
      </div>
      {!adminOpen && <Navbar />}
      <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">
        {showNotFound ? (
          <section className="min-h-[60vh] flex items-center justify-center px-4 py-16">
            <div className="max-w-md w-full rounded-3xl border border-[#E5E5E5] bg-white p-8 text-center shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#8F7137] mb-3">404</p>
              <h1 className="text-2xl font-serif font-semibold text-[#171717] mb-3">Page not found</h1>
              <p className="text-sm leading-6 text-[#737373] mb-6">The requested Yalla page does not exist.</p>
              <button type="button" onClick={() => { setNotFoundPath(null); setActiveTab('home'); }} className="gold-btn rounded-xl px-5 py-3 text-sm font-black">Back to Home</button>
            </div>
          </section>
        ) : (
          <>
            {activeTab === 'home' && <HomeView />}
            {activeTab === 'products' && <ProductsView />}
            {activeTab === 'product_detail' && <ProductDetailView />}
            {activeTab === 'checkout' && <Suspense fallback={<div className="min-h-[60vh] flex items-center justify-center bg-[#F7F7F8]"><Loader2 className="w-8 h-8 animate-spin text-[#B89753]" /></div>}><CheckoutView /></Suspense>}
            {activeTab === 'account' && <AccountViewController />}
            {activeTab === 'favorites' && <FavoritesView />}
            {adminOpen && <AdminErrorBoundary><AdminSessionGate><Suspense fallback={<div className="min-h-screen bg-[#F7F7F8] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-[#B89753]" /></div>}><AdminGuard><AdminView /></AdminGuard></Suspense></AdminSessionGate></AdminErrorBoundary>}
          </>
        )}
      </main>
      <ProductModal />
      <CartDrawer />
      <TextStyleLayer page={activeTab} enabled={!adminOpen} />
      <AdminQuickEditor onOpenCustomBlockModal={(block) => { setCustomBlockToEdit(block || null); setIsCustomBlockModalOpen(true); }} />
      <CustomBlockModal isOpen={isCustomBlockModalOpen} onClose={() => setIsCustomBlockModalOpen(false)} blockToEdit={customBlockToEdit} />
      {toast && <div className="fixed bottom-6 right-6 z-50 animate-fadeIn"><div className={`flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl border text-xs font-semibold ${toast.type === 'success' ? 'bg-white border-[#16803C]/30 text-[#16803C]' : toast.type === 'warning' ? 'bg-white border-[#B89753]/40 text-[#8F7137]' : 'bg-white border-[#E5E5E5] text-[#111111]'}`}>{toast.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-[#16803C] flex-shrink-0" /> : toast.type === 'warning' ? <AlertCircle className="w-4 h-4 text-[#B89753] flex-shrink-0" /> : <Info className="w-4 h-4 text-[#666666] flex-shrink-0" />}<span>{toast.message}</span></div></div>}
      {!adminOpen && <><FooterQuickLinks /><Footer /></>}
    </div>
  );
};

export default function App() {
  return <StorefrontErrorBoundary><ShopProvider><MainAppContent /></ShopProvider></StorefrontErrorBoundary>;
}
