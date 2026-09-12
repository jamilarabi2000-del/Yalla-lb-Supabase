import React, { useState } from 'react';
import { useShop } from '../context/ShopContext';
import { useDialog } from '../hooks/useDialog';
import { SectionVisibilityConfig, CMSCustomBlock } from '../types';
import { 
  ShieldCheck, 
  Eye, 
  EyeOff, 
  Plus, 
  Edit3, 
  Layers, 
  Settings, 
  X, 
  Check, 
  Sparkles, 
  LayoutTemplate,
  Sliders,
  Maximize2
} from 'lucide-react';

interface AdminQuickEditorProps {
  onOpenCustomBlockModal?: (block?: CMSCustomBlock) => void;
}

export const AdminQuickEditor: React.FC<AdminQuickEditorProps> = ({
  onOpenCustomBlockModal
}) => {
  const { 
    isAdminUnlocked, 
    activeTab, 
    setActiveTab, 
    siteContent, 
    updateSiteContent, 
    toggleSectionVisibility,
    isVisualEditMode,
    setIsVisualEditMode,
    showToast
  } = useShop();

  const [isOpenDrawer, setIsOpenDrawer] = useState(false);
  const [drawerTab, setDrawerTab] = useState<'visibility' | 'quick_text' | 'add_block'>('visibility');

  const { containerRef: drawerPanelRef } = useDialog({
    isOpen: isOpenDrawer,
    onClose: () => setIsOpenDrawer(false)
  });

  // If admin is not unlocked, do not render floating editor
  if (!isAdminUnlocked) return null;

  const visibility = siteContent.visibility || {
    announcementTicker: true,
    phoneSupport: true,
    navbarSearch: true,
    currencySwitcher: true,
    languageSwitcher: true,
    homeHero: true,
    homeCategories: true,
    homeOffers: true,
    homeFeatured: true,
    homeTrustBadges: true,
    homeDeals: true,
    homeNewArrivals: true,
    homeHeritage: true,
    homeReviews: true,
    homeNewsletter: true,
    homeNews: true,
    productsHeader: true,
    productsSearchFilter: true,
    productsCategoryTabs: true,
    productsSort: true,
    productsGrid: true,
    detailBreadcrumbs: true,
    detailGallery: true,
    detailPriceBox: true,
    detailArtisanBio: true,
    detailCraftStory: true,
    detailWhatsAppInquiry: true,
    detailCustomerReviews: true,
    detailRelatedProducts: true,
    checkoutSteps: true,
    checkoutAddressForm: true,
    checkoutDeliverySpeed: true,
    checkoutPaymentMethod: true,
    checkoutOrderSummary: true,
    checkoutGuarantees: true,
    accountOrders: true,
    accountProfile: true,
    accountWishlist: true,
    accountSupportCard: true,
    footerAbout: true,
    footerQuickLinks: true,
    footerContact: true,
    footerSocial: true,
    footerCopyright: true,
  };

  // Get active page sections
  const getPageSections = (): { key: keyof SectionVisibilityConfig; label: string; desc: string }[] => {
    switch (activeTab) {
      case 'home':
        return [
          { key: 'homeHero', label: 'Hero Banner & Stats', desc: 'Main headline, artisan badges, statistics bar' },
          { key: 'homeCategories', label: 'Category Explorer Grid', desc: 'Quick browse icons for Lebanon craft categories' },
          { key: 'homeOffers', label: 'Promotional Offers Slider', desc: 'Back to School, Olive Harvest, Phoenician Glass slides' },
          { key: 'homeFeatured', label: 'Featured Artisan Treasures', desc: 'Curated carousel of handcrafted products' },
          { key: 'homeTrustBadges', label: 'Heritage Trust Badges', desc: 'Authenticity, Local Cooperatives, Secure Fresh USD' },
          { key: 'homeDeals', label: 'Limited Time Artisan Deals', desc: 'Discounted products with countdown timer' },
          { key: 'homeNewArrivals', label: 'New Workshop Arrivals', desc: 'Recently crafted items from Lebanese villages' },
          { key: 'homeHeritage', label: 'Cultural Heritage Story', desc: 'Preservation narrative & master artisan bio' },
          { key: 'homeReviews', label: 'Patron Testimonials', desc: 'Customer reviews & 5-star ratings' },
          { key: 'homeNewsletter', label: 'Newsletter Subscription', desc: 'Artisan heritage circle email signup' },
          { key: 'homeNews', label: 'Cultural Press & News', desc: 'Latest articles and media features' }
        ];
      case 'products':
        return [
          { key: 'productsHeader', label: 'Catalog Header Banner', desc: 'Top title and subtitle' },
          { key: 'productsSearchFilter', label: 'Search & Keyword Filter', desc: 'Search bar & quick filters' },
          { key: 'productsCategoryTabs', label: 'Category Filter Pills', desc: 'Horizontal category selector tabs' },
          { key: 'productsSort', label: 'Sorting Bar', desc: 'Price and rating sort dropdowns' },
          { key: 'productsGrid', label: 'Artisan Products Grid', desc: 'The main list of product cards' }
        ];
      case 'product_detail':
        return [
          { key: 'detailBreadcrumbs', label: 'Breadcrumbs & Navigation', desc: 'Category and product name path' },
          { key: 'detailGallery', label: 'Image Gallery & Zoom', desc: 'Main photo and thumbnail selector' },
          { key: 'detailPriceBox', label: 'Price & Add to Cart Box', desc: 'Fresh USD price, quantity and CTA' },
          { key: 'detailArtisanBio', label: 'Artisan Workshop & Provenance', desc: 'Master artisan info, village of origin' },
          { key: 'detailCraftStory', label: 'Heritage Craft Story', desc: 'Historical crafting technique narrative' },
          { key: 'detailWhatsAppInquiry', label: 'WhatsApp Concierge Inquiry', desc: 'Direct chat button with artisan' },
          { key: 'detailRelatedProducts', label: 'Related Heritage Treasures', desc: 'Matching items from same collection' }
        ];
      case 'checkout':
        return [
          { key: 'checkoutSteps', label: 'Checkout Steps Indicator', desc: 'Step 1 & Step 2 breadcrumbs' },
          { key: 'checkoutAddressForm', label: 'Shipping Address Form', desc: 'Governorate, city, street, WhatsApp phone' },
          { key: 'checkoutDeliverySpeed', label: 'Delivery Speed Selector', desc: 'Standard, Express Beirut, Diaspora Air' },
          { key: 'checkoutPaymentMethod', label: 'Payment Method Selector', desc: 'Cash USD, Cash LBP, Wish/OMT, Card' },
          { key: 'checkoutOrderSummary', label: 'Order Summary Box', desc: 'Subtotal, delivery fee, total breakdown' },
          { key: 'checkoutGuarantees', label: 'Security & Heritage Badges', desc: 'Authenticity & satisfaction guarantees' }
        ];
      case 'account':
        return [
          { key: 'accountOrders', label: 'Orders & Tracking Tab', desc: 'Courier dispatch tracker and history' },
          { key: 'accountProfile', label: 'Patron Profile & Address Tab', desc: 'Default address and contact details' },
          { key: 'accountWishlist', label: 'Saved Wishlist Tab', desc: 'Favorite artisan items' },
          { key: 'accountSupportCard', label: 'Artisan Concierge Support Card', desc: 'Direct WhatsApp and email help' }
        ];
      default:
        return [
          { key: 'announcementTicker', label: 'Top Announcement Ticker', desc: 'Header banner with delivery & exchange rate' },
          { key: 'navbarSearch', label: 'Header Search Bar', desc: 'Top search input in navigation' },
          { key: 'phoneSupport', label: 'Header Support Phone', desc: 'WhatsApp / Phone contact in header' },
          { key: 'footerAbout', label: 'Footer About Section', desc: 'Platform narrative and social links' },
          { key: 'footerSocial', label: 'Footer Social Channels', desc: 'Instagram, WhatsApp, Facebook buttons' }
        ];
    }
  };

  const pageSections = getPageSections();

  return (
    <>
      {/* Floating Bottom Admin Bar */}
      <div 
        id="admin-quick-editor-bar" 
        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-slate-950/95 text-white border border-[#b89753]/40 rounded-full px-4 py-2.5 shadow-2xl backdrop-blur-md flex items-center gap-3 select-none transition-all hover:border-[#b89753]"
      >
        <div className="flex items-center gap-2 pl-1 pr-2 border-r border-slate-800">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-bold tracking-wider uppercase text-[#b89753]">
            CMS Live Mode
          </span>
        </div>

        {/* Quick Drawer Opener */}
        <button
          onClick={() => setIsOpenDrawer(true)}
          className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#b89753]/20 hover:bg-[#b89753]/30 text-[#d4af37] text-xs font-semibold transition-colors cursor-pointer border border-[#b89753]/30"
          title="Edit Page Sections & Visibility"
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>Edit Page Divs ({activeTab})</span>
        </button>

        {/* Add Div / Custom Block */}
        <button
          onClick={() => onOpenCustomBlockModal ? onOpenCustomBlockModal() : setActiveTab('admin')}
          className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors cursor-pointer border border-slate-700"
          title="Add Custom Banner or Section"
        >
          <Plus className="w-3.5 h-3.5 text-amber-400" />
          <span>+ Add Div</span>
        </button>

        {/* Toggle Visual Edit Mode */}
        <button
          onClick={() => {
            setIsVisualEditMode(!isVisualEditMode);
            showToast(isVisualEditMode ? 'Disabled draft preview mode' : 'Enabled draft preview mode (showing hidden elements)', 'info');
          }}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer border ${
            isVisualEditMode 
              ? 'bg-purple-900/60 text-purple-200 border-purple-500/50' 
              : 'bg-slate-800 hover:bg-slate-700 text-slate-400 border-slate-700'
          }`}
          title="Show / Highlight Hidden Divs"
        >
          {isVisualEditMode ? <Eye className="w-3.5 h-3.5 text-purple-300" /> : <EyeOff className="w-3.5 h-3.5" />}
          <span>{isVisualEditMode ? 'Drafts Visible' : 'Drafts Hidden'}</span>
        </button>

        {/* Full Admin Portal Link */}
        <button
          onClick={() => setActiveTab('admin')}
          className="flex items-center gap-1 px-3 py-1 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors cursor-pointer border border-slate-700"
          title="Go to full Artisan & Admin Portal"
        >
          <Settings className="w-3.5 h-3.5" />
          <span>Full Dashboard</span>
        </button>

        <button
          onClick={() => setIsOpenDrawer(!isOpenDrawer)}
          className="p-1 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Side Quick Drawer */}
      {isOpenDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in">
          <div 
            ref={drawerPanelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-quick-drawer-title"
            id="admin-quick-drawer-panel"
            className="w-full max-w-md bg-slate-900 text-white h-full shadow-2xl border-l border-slate-800 flex flex-col overflow-hidden"
          >
            {/* Drawer Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-[#b89753]">
                  <Sliders className="w-4 h-4" />
                </div>
                <div>
                  <h3 id="admin-quick-drawer-title" className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                    <span>Page Divs & Visibility</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      {activeTab}
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400">Publish, hide, or unhide any section in real-time</p>
                </div>
              </div>
              <button
                onClick={() => setIsOpenDrawer(false)}
                className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Actions Tabs */}
            <div className="flex border-b border-slate-800 bg-slate-950/60 px-4 pt-2 gap-2 text-xs">
              <button
                onClick={() => setDrawerTab('visibility')}
                className={`pb-2 px-3 font-semibold transition-all border-b-2 cursor-pointer ${
                  drawerTab === 'visibility'
                    ? 'border-amber-400 text-amber-300'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Section Visibility ({pageSections.length})
              </button>
              <button
                onClick={() => {
                  setIsOpenDrawer(false);
                  setActiveTab('admin');
                }}
                className="pb-2 px-3 font-semibold transition-all border-b-2 border-transparent text-slate-400 hover:text-slate-200 cursor-pointer flex items-center gap-1"
              >
                <span>Edit All Content Text</span>
                <Edit3 className="w-3 h-3 text-amber-400" />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {drawerTab === 'visibility' && (
                <div className="space-y-3">
                  <div className="p-3 bg-amber-950/30 border border-amber-500/20 rounded-xl text-xs text-amber-200/90 leading-relaxed">
                    💡 <strong>Instant Database Sync:</strong> Changes you toggle here are saved to Firestore and immediately reflect on the live website.
                  </div>

                  <div className="space-y-2">
                    {pageSections.map((sec) => {
                      const isVisible = visibility[sec.key] ?? true;
                      return (
                        <div
                          key={sec.key}
                          className={`p-3.5 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                            isVisible 
                              ? 'bg-slate-800/80 border-slate-700/80 hover:border-slate-600' 
                              : 'bg-rose-950/20 border-rose-900/40 opacity-75'
                          }`}
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-slate-200">{sec.label}</span>
                              <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-wider ${
                                isVisible 
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                                  : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                              }`}>
                                {isVisible ? 'Published' : 'Hidden'}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400">{sec.desc}</p>
                          </div>

                          <button
                            onClick={() => toggleSectionVisibility(sec.key)}
                            className={`p-2 rounded-xl transition-all cursor-pointer flex-shrink-0 ${
                              isVisible
                                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm'
                                : 'bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700'
                            }`}
                            title={isVisible ? 'Click to Hide Section' : 'Click to Publish Section'}
                          >
                            {isVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {/* Quick Custom Blocks on this Page */}
                  <div className="pt-4 border-t border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        Custom Divs on this page
                      </span>
                      <button
                        onClick={() => {
                          setIsOpenDrawer(false);
                          if (onOpenCustomBlockModal) {
                            onOpenCustomBlockModal({
                              id: '',
                              title: 'New Announcement Banner',
                              subtitle: 'Custom promotional message',
                              content: 'Add your custom HTML or text here',
                              bgStyle: 'gold_gradient',
                              targetPage: activeTab as any,
                              position: 'middle',
                              isPublished: true,
                              order: 1
                            });
                          }
                        }}
                        className="text-xs text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add New Div</span>
                      </button>
                    </div>

                    {((siteContent.customBlocks || []).filter(b => b.targetPage === 'all' || b.targetPage === activeTab)).length === 0 ? (
                      <p className="text-xs text-slate-500 italic py-2">No custom divs added to this page yet.</p>
                    ) : (
                      (siteContent.customBlocks || [])
                        .filter(b => b.targetPage === 'all' || b.targetPage === activeTab)
                        .map(b => (
                          <div key={b.id} className="p-3 bg-slate-800 rounded-xl border border-slate-700 flex items-center justify-between text-xs">
                            <div>
                              <p className="font-bold text-slate-200">{b.title}</p>
                              <p className="text-[10px] text-slate-400">Position: {b.position} • {b.isPublished ? 'Live' : 'Draft'}</p>
                            </div>
                            <button
                              onClick={() => {
                                setIsOpenDrawer(false);
                                if (onOpenCustomBlockModal) onOpenCustomBlockModal(b);
                              }}
                              className="px-2.5 py-1 rounded bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 font-bold cursor-pointer"
                            >
                              Edit
                            </button>
                          </div>
                        ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Drawer Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-950 flex items-center justify-between">
              <button
                onClick={() => {
                  setIsOpenDrawer(false);
                  setActiveTab('admin');
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-[#b89753] hover:bg-[#c5a059] text-slate-950 font-bold text-xs uppercase tracking-wider text-center transition-colors cursor-pointer shadow-md"
              >
                Open Full CMS & Media Studio →
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
