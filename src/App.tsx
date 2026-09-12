import React, { useEffect, useRef, Suspense, lazy } from 'react';
import { ShopProvider, useShop } from './context/ShopContext';
import { Navbar } from './components/Navbar';
import { HomeView } from './components/HomeView';
import { ProductsView } from './components/ProductsView';
import { AccountView } from './components/AccountView';
import { FavoritesView } from './components/FavoritesView';
import { AdminErrorBoundary } from './components/AdminErrorBoundary';
import { StorefrontErrorBoundary } from './components/StorefrontErrorBoundary';
import { AdminGuard } from './components/AdminGuard';
import { ProductDetailView } from './components/ProductDetailView';
import { ProductModal } from './components/ProductModal';
import { CartDrawer } from './components/CartDrawer';
import { Footer } from './components/Footer';
import { AdminQuickEditor } from './components/AdminQuickEditor';
import { CustomBlockModal } from './components/CustomBlockModal';
import { syncDomHead } from './utils/domHeadSync';
import { CheckCircle2, AlertCircle, Info, Sparkles, Loader2 } from 'lucide-react';

function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<any>
) {
  return lazy(async () => {
    let attempts = 3;
    while (attempts > 0) {
      try {
        const module = await factory();
        try {
          if (typeof window !== 'undefined' && window.sessionStorage) {
            sessionStorage.removeItem('chunk_reload_attempted');
          }
        } catch {}
        return { default: module.default || module.AdminView || module.CheckoutView || module.SellerLoginView || Object.values(module)[0] };
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
const SellerLoginView = lazyWithRetry(() => import('./components/SellerLoginView'));


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
    language,
    setLanguage,
    completeEmailLinkSignIn
  } = useShop();
  const isPopStateRef = useRef(false);

  // Dynamically update SEO metadata, Open Graph tags & Favicon Icon
  useEffect(() => {
    syncDomHead(siteContent, language);
  }, [siteContent, siteContent?.seo, siteContent?.navbar, language]);

  // Dynamically apply Theme CSS variables and classes
  useEffect(() => {
    if (siteContent?.theme) {
      const root = document.documentElement;
      
      if (siteContent.theme.primaryColor) {
        root.style.setProperty('--gold', siteContent.theme.primaryColor);
        // Approximate a slightly darker shade for borders/hover
        root.style.setProperty('--gold-dark', siteContent.theme.primaryColor + 'cc');
      }
      
      const fonts = ['plus_jakarta', 'playfair', 'inter', 'tajawal', 'cairo', 'amiri'];
      fonts.forEach(f => document.body.classList.remove(`font-${f}`));
      
      if (siteContent.theme.fontFamily) {
        // Fallback for fonts that might not be imported: we'll just set the style directly
        const fontMap: Record<string, string> = {
          'plus_jakarta': '"Plus Jakarta Sans", sans-serif',
          'playfair': '"Playfair Display", serif',
          'inter': '"Inter", sans-serif',
          'tajawal': '"Tajawal", sans-serif',
          'cairo': '"Cairo", sans-serif',
          'amiri': '"Amiri", serif'
        };
        document.body.style.fontFamily = fontMap[siteContent.theme.fontFamily] || '"Plus Jakarta Sans", sans-serif';
      }
    }
  }, [siteContent?.theme]);

  // On initial mount, ensure current history entry has depth and preserve query parameters (e.g. ?cmsPreview=1&lang=ar)
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
      if (urlLang === 'ar' || urlLang === 'en') {
        setLanguage(urlLang);
      }

      // Detect and handle incoming Firebase Auth email link sign-in
      if (searchParams.has('apiKey') && (searchParams.has('oobCode') || searchParams.has('emailSignIn'))) {
        completeEmailLinkSignIn().catch(err => {
          console.warn('[App] Automatic email link sign-in check notice:', err);
        });
      }
    } catch {}
  }, [setLanguage, completeEmailLinkSignIn]);

  const productsRef = useRef(products);
  productsRef.current = products;
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  // Sync route / path from URL on initial mount & browser back/forward buttons
  useEffect(() => {
    const syncRouteFromUrl = () => {
      isPopStateRef.current = true;
      const path = window.location.pathname.replace(/^\/+/, '');
      const searchParams = new URLSearchParams(window.location.search);

      const urlLang = searchParams.get('lang');
      if (urlLang === 'ar' || urlLang === 'en') {
        setLanguage(urlLang);
      }

      if (path === 'admin') {
        setSelectedProductDetail(null);
        setActiveTab('admin');
      } else if (path === 'seller') {
        setSelectedProductDetail(null);
        setActiveTab('seller');
      } else if (path.startsWith('product/')) {
        const prodId = path.replace('product/', '');
        const foundProduct = productsRef.current.find(p => p.id === prodId);
        if (foundProduct) {
          openProductDetail(foundProduct);
        }
      } else if (path.startsWith('products')) {
        setSelectedProductDetail(null);
        setActiveTab('products');
        const catMatch = path.match(/^products\/(.+)$/);
        if (catMatch) {
          setSelectedCategory(decodeURIComponent(catMatch[1]));
        } else {
          setSelectedCategory('all');
        }
      } else if (path === 'checkout' || path === 'account' || path === 'favorites' || path === 'home' || path === '') {
        const targetTab = (path === '' || path === 'home' ? 'home' : path) as any;
        if (activeTabRef.current !== targetTab) {
          setSelectedProductDetail(null);
          setActiveTab(targetTab);
        }
      } else {
        // Safe fallback for any fuzzed or non-existent path
        setSelectedProductDetail(null);
        setActiveTab('home');
      }
    };

    window.addEventListener('popstate', syncRouteFromUrl);
    return () => window.removeEventListener('popstate', syncRouteFromUrl);
  }, [openProductDetail, setActiveTab, setSelectedProductDetail, setSelectedCategory, setLanguage]);

  // Sync browser URL when activeTab or selectedProductDetail changes
  useEffect(() => {
    if (isPopStateRef.current) {
      isPopStateRef.current = false;
      return;
    }
    let targetPath = activeTab === 'home' ? '' : activeTab;
    if (activeTab === 'product_detail' && selectedProductDetail) {
      targetPath = `product/${selectedProductDetail.id}`;
    } else if (activeTab === 'products' && selectedCategory && selectedCategory !== 'all') {
      targetPath = `products/${encodeURIComponent(selectedCategory)}`;
    }
    const targetUrl = targetPath === '' || targetPath === 'home' ? '/' : `/${targetPath}`;
    const search = window.location.search || '';
    const fullTarget = search ? `${targetUrl}${search}` : targetUrl;

    try {
      if (typeof window !== 'undefined' && window.location.pathname !== targetUrl && window.history) {
        const currentDepth = (window.history.state && typeof window.history.state.depth === 'number')
          ? window.history.state.depth
          : 0;
        window.history.pushState({ appNav: true, depth: currentDepth + 1 }, '', fullTarget);
      }
    } catch {}
  }, [activeTab, selectedProductDetail, selectedCategory]);

  return (
    <div className="min-h-screen flex flex-col bg-[#1a1a2e] text-slate-100 selection:bg-[#c5a059] selection:text-[#1a1a2e] font-sans antialiased">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      
      {/* Hidden SEO Snapshot strictly preserving requested markup & links */}
      <div 
        data-seo-source="builder" 
        id="seo-snapshot" aria-hidden="true" 
        style={{
          position: 'absolute',
          width: '1px',
          height: '1px',
          padding: 0,
          margin: '-1px',
          overflow: 'hidden',
          clip: 'rect(0,0,0,0)',
          whiteSpace: 'nowrap',
          border: 0
        }}
      >
        <div>
          <header>
            <h1>Yalla.lb</h1>
            <p>
              A premium, high-velocity marketplace bridging Lebanese craftsmanship with modern digital commerce for a seamless, hyper-local shopping experience.
            </p>
          </header>
          <nav aria-label="Pages">
            <h2>Pages</h2>
            <ul>
              <li>
                <a href="/products">Products</a>
                — Products on Yalla.lb. A premium, high-velocity marketplace bridging Lebanese craftsmanship with modern.
              </li>
              <li>
                <a href="/checkout">Checkout</a>
                — Checkout on Yalla.lb. A premium, high-velocity marketplace bridging Lebanese craftsmanship with modern.
              </li>
              <li>
                <a href="/account">Account</a>
                — Account on Yalla.lb. A premium, high-velocity marketplace bridging Lebanese craftsmanship with modern.
              </li>
              <li>
                <a href="/seller">Artisan Portal</a>
                — Merchant and artisan login portal for authentic Lebanese workshops and producers.
              </li>
            </ul>
          </nav>
        </div>
      </div>

      {/* Main Top Navigation Header */}
      {activeTab !== 'admin' && activeTab !== 'seller' && <Navbar />}

      {/* Dynamic View Display */}
      <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">
        {activeTab === 'home' && <HomeView />}
        {activeTab === 'products' && <ProductsView />}
        {activeTab === 'product_detail' && <ProductDetailView />}
        {activeTab === 'checkout' && (
          <Suspense fallback={
            <div className="min-h-[60vh] flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-[#96783d]" />
            </div>
          }>
            <CheckoutView />
          </Suspense>
        )}
        {activeTab === 'account' && <AccountView />}
        {activeTab === 'favorites' && <FavoritesView />}
        {activeTab === 'seller' && (
          <Suspense fallback={
            <div className="min-h-[80vh] bg-slate-900 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
            </div>
          }>
            <SellerLoginView />
          </Suspense>
        )}
        {activeTab === 'admin' && (
          <AdminErrorBoundary>
            <Suspense fallback={
              <div className="min-h-screen bg-slate-900 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
              </div>
            }>
              <AdminGuard>
                <AdminView />
              </AdminGuard>
            </Suspense>
          </AdminErrorBoundary>
        )}
      </main>

      {/* Modals & Overlays */}
      <ProductModal />
      <CartDrawer />
      <AdminQuickEditor onOpenCustomBlockModal={(block) => {
        setCustomBlockToEdit(block || null);
        setIsCustomBlockModalOpen(true);
      }} />
      <CustomBlockModal
        isOpen={isCustomBlockModalOpen}
        onClose={() => setIsCustomBlockModalOpen(false)}
        blockToEdit={customBlockToEdit}
      />

      {/* Global Interactive Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-fadeIn">
          <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl border text-xs font-semibold ${
            toast.type === 'success'
              ? 'bg-[#1a2e24] border-emerald-500/40 text-emerald-200 shadow-emerald-950/50'
              : toast.type === 'warning'
              ? 'bg-[#2e241a] border-[#c5a059]/40 text-[#f1d592] shadow-amber-950/50'
              : 'bg-[#1a1a2e] border-[#c5a059]/30 text-slate-200 shadow-black/60'
          }`}>
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            ) : toast.type === 'warning' ? (
              <AlertCircle className="w-4 h-4 text-[#c5a059] flex-shrink-0" />
            ) : (
              <Info className="w-4 h-4 text-sky-400 flex-shrink-0" />
            )}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Lebanese Craftsmanship Footer */}
      {activeTab !== 'admin' && activeTab !== 'seller' && <Footer />}

    </div>
  );
};

export default function App() {
  return (
    <StorefrontErrorBoundary>
      <ShopProvider>
        <MainAppContent />
      </ShopProvider>
    </StorefrontErrorBoundary>
  );
}
