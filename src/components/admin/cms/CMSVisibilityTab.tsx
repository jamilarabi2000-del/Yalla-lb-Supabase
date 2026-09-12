import React from 'react';
import { SectionVisibilityConfig } from '../../../types';
import { 
  Eye, 
  EyeOff, 
  CheckCircle2, 
  Layers, 
  Home, 
  ShoppingBag, 
  Search, 
  CreditCard, 
  User, 
  Layout, 
  Navigation,
  Sparkles
} from 'lucide-react';

import { CMSSectionReorder } from './CMSSectionReorder';

interface CMSVisibilityTabProps {
  visibility: SectionVisibilityConfig;
  onChange: (key: keyof SectionVisibilityConfig, value: boolean) => void;
  onSetAll: (value: boolean) => void;
  sectionOrder?: string[];
  onOrderChange?: (newOrder: string[]) => void;
}

export const CMSVisibilityTab: React.FC<CMSVisibilityTabProps> = ({
  visibility = {} as SectionVisibilityConfig,
  onChange,
  onSetAll,
  sectionOrder,
  onOrderChange,
}) => {
  const sections = [
    {
      title: 'Global & Navigation Bar',
      icon: Navigation,
      color: 'text-amber-400',
      items: [
        { key: 'announcementTicker' as const, label: 'Top Announcement Ticker', desc: 'Displays live LBP rate & express delivery updates' },
        { key: 'phoneSupport' as const, label: 'Phone Support Header Contact', desc: 'Displays WhatsApp concierge hotline in header' },
        { key: 'navbarSearch' as const, label: 'Navbar Live Search Bar', desc: 'Global artisan & keyword search box' },
        { key: 'currencySwitcher' as const, label: 'Currency Switcher (USD / LBP)', desc: 'Dual currency toggle with real-time exchange rates' },
        { key: 'languageSwitcher' as const, label: 'Language Switcher (EN / AR)', desc: 'Arabic & English bilingual layout toggle' },
      ]
    },
    {
      title: 'Home Page Sections',
      icon: Home,
      color: 'text-emerald-400',
      items: [
        { key: 'homeHero' as const, label: 'Consolidated Hero & Promotional Slider', desc: 'Main landing showcase, promo coupon slides & artisan metrics' },
        { key: 'homeCategories' as const, label: 'Category Quick-Filter Icons', desc: 'Terroir & category icons bar' },
        { key: 'homeOffers' as const, label: 'Promotional Offers Carousel', desc: 'Cultural & seasonal promotion slides' },
        { key: 'homeFeatured' as const, label: 'Featured Artisan Products', desc: 'Curated collection of top handcrafted items' },
        { key: 'homeTrustBadges' as const, label: 'Trust & Authenticity Badges', desc: 'Lebanese heritage & direct cooperative guarantee' },
        { key: 'homeDeals' as const, label: 'Limited-Time Deals Section', desc: 'Flash discounts and special seasonal pricing' },
        { key: 'homeNewArrivals' as const, label: 'New Artisan Arrivals', desc: 'Recently cataloged workshop treasures' },
        { key: 'homeHeritage' as const, label: 'Heritage Story Narrative Block', desc: 'Cultural storytelling & cooperative support statement' },
        { key: 'homeReviews' as const, label: 'Customer Reviews & Testimonials', desc: 'Verified customer feedback & ratings' },
        { key: 'homeNewsletter' as const, label: 'Heritage Circle Newsletter', desc: 'Email subscription box' },
        { key: 'homeNews' as const, label: 'Craft Press & News Articles', desc: 'Cultural headlines & artisan blog posts' },
      ]
    },
    {
      title: 'Artisan Catalog & Products Page',
      icon: ShoppingBag,
      color: 'text-blue-400',
      items: [
        { key: 'productsHeader' as const, label: 'Catalog Header & Subtitle', desc: 'Catalog title and introduction banner' },
        { key: 'productsSearchFilter' as const, label: 'Catalog Search & Filter Bar', desc: 'Instant search & quick origin filters' },
        { key: 'productsCategoryTabs' as const, label: 'Category Selection Tabs', desc: 'Filter products by artisanal category' },
        { key: 'productsSort' as const, label: 'Price & Rating Sort Controls', desc: 'Sort dropdown (price, ratings, newest)' },
        { key: 'productsGrid' as const, label: 'Product Card Grid', desc: 'Primary product display listing' },
      ]
    },
    {
      title: 'Product Details Page',
      icon: Search,
      color: 'text-purple-400',
      items: [
        { key: 'detailBreadcrumbs' as const, label: 'Navigation Breadcrumbs', desc: 'Breadcrumb links back to categories' },
        { key: 'detailGallery' as const, label: 'Multi-Angle Image Gallery', desc: 'High-res product photography & zoom' },
        { key: 'detailPriceBox' as const, label: 'Price Box & Add-to-Cart', desc: 'Currency breakdown, quantity selector & cart CTA' },
        { key: 'detailArtisanBio' as const, label: 'Master Artisan Profile & Village', desc: 'Maker name, workshop origin & history' },
        { key: 'detailCraftStory' as const, label: 'Traditional Craftsmanship Story', desc: 'Detailed narrative of materials & heritage methods' },
        { key: 'detailWhatsAppInquiry' as const, label: 'WhatsApp Inquiry Button', desc: 'Direct WhatsApp link to discuss custom orders' },
        { key: 'detailCustomerReviews' as const, label: 'Customer Reviews & Ratings', desc: 'Patron review list and submission form' },
        { key: 'detailRelatedProducts' as const, label: 'Related Heritage Items', desc: 'Carousel of related artisan crafts' },
      ]
    },
    {
      title: 'Checkout Flow',
      icon: CreditCard,
      color: 'text-amber-300',
      items: [
        { key: 'checkoutSteps' as const, label: 'Checkout Progress Indicator', desc: 'Step indicator (Shipping → Payment → Review)' },
        { key: 'checkoutAddressForm' as const, label: 'Lebanese Shipping Address Form', desc: 'Governorate, city, street, and WhatsApp inputs' },
        { key: 'checkoutDeliverySpeed' as const, label: 'Delivery Speed Selector', desc: 'Standard, Beirut Same-Day, or Diaspora Express' },
        { key: 'checkoutPaymentMethod' as const, label: 'Payment Method Selector', desc: 'Cash on Delivery (USD/LBP), OMT/Whish, Credit Card' },
        { key: 'checkoutOrderSummary' as const, label: 'Order Summary & Coupon Box', desc: 'Itemized totals, delivery fees & coupon discounts' },
        { key: 'checkoutGuarantees' as const, label: 'Authenticity Guarantee Badges', desc: 'Safe delivery and authenticity assurance' },
      ]
    },
    {
      title: 'Patron Account Page',
      icon: User,
      color: 'text-pink-400',
      items: [
        { key: 'accountOrders' as const, label: 'Order History & Live Courier Tracking', desc: 'Past orders with live status timelines' },
        { key: 'accountProfile' as const, label: 'Profile & Saved Delivery Info', desc: 'Default address & contact preferences' },
        { key: 'accountWishlist' as const, label: 'Saved Wishlist Items', desc: 'Saved artisan products list' },
        { key: 'accountSupportCard' as const, label: 'Concierge Support Card', desc: 'Direct contact card for order help' },
      ]
    },
    {
      title: 'Storefront Footer',
      icon: Layout,
      color: 'text-cyan-400',
      items: [
        { key: 'footerAbout' as const, label: 'About Yalla Mission Narrative', desc: 'Brand story and cooperative support mission' },
        { key: 'footerQuickLinks' as const, label: 'Quick Navigation Links', desc: 'Category and legal policy links' },
        { key: 'footerContact' as const, label: 'Contact Information Block', desc: 'Phone, email, address, and operating hours' },
        { key: 'footerSocial' as const, label: 'Social Media Links', desc: 'Instagram, Facebook, and WhatsApp icons' },
        { key: 'footerCopyright' as const, label: 'Copyright & Rights Notice', desc: 'Bottom legal copyright banner' },
      ]
    },
  ];

  // Count active vs total
  const allKeys = sections.flatMap(s => s.items.map(i => i.key));
  const activeCount = allKeys.filter(k => visibility[k] !== false).length;

  return (
    <div className="space-y-6">
      {/* Overview & Quick Actions */}
      <div className="bg-[#121222] border border-white/10 rounded-3xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-amber-400" />
            <span>Storefront Section Visibility Master Controls</span>
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Toggle any storefront module on or off in real-time. Disabled sections are instantly hidden from customers.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-3.5 py-1.5 rounded-xl bg-slate-900 border border-white/10 text-xs font-bold text-slate-300">
            <span className="text-emerald-400">{activeCount}</span> of {allKeys.length} Visible
          </div>
          <button
            type="button"
            onClick={() => onSetAll(true)}
            className="px-3.5 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Show All</span>
          </button>
          <button
            type="button"
            onClick={() => onSetAll(false)}
            className="px-3.5 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
          >
            <EyeOff className="w-3.5 h-3.5" />
            <span>Hide All</span>
          </button>
        </div>
      </div>
      
      {/* Homepage Section Arrangement & Sequence */}
      {onOrderChange && (
        <CMSSectionReorder
          order={sectionOrder}
          visibility={visibility}
          onOrderChange={onOrderChange}
          onVisibilityToggle={(key, val) => onChange(key as keyof SectionVisibilityConfig, val)}
        />
      )}

      {/* Sections Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {sections.map((section, sIdx) => (
          <div 
            key={sIdx}
            className="bg-[#121222] border border-white/10 rounded-3xl p-5 space-y-4 flex flex-col justify-between"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-slate-900 border border-white/10 flex items-center justify-center">
                    <section.icon className={`w-4 h-4 ${section.color}`} />
                  </div>
                  <h4 className="text-sm font-bold text-white">{section.title}</h4>
                </div>
                <span className="text-[11px] font-mono text-slate-400">
                  {section.items.filter(i => visibility[i.key] !== false).length}/{section.items.length} Active
                </span>
              </div>

              <div className="space-y-2.5">
                {section.items.map((item) => {
                  const isVisible = visibility[item.key] !== false;
                  return (
                    <div 
                      key={item.key}
                      className={`flex items-center justify-between p-3 rounded-2xl transition-all border ${
                        isVisible 
                          ? 'bg-slate-900/80 border-white/10 hover:border-white/20' 
                          : 'bg-slate-950/60 border-white/5 opacity-60'
                      }`}
                    >
                      <div className="pr-3 flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold ${isVisible ? 'text-white' : 'text-slate-400'}`}>
                            {item.label}
                          </span>
                          <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold uppercase tracking-wider ${
                            isVisible ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'
                          }`}>
                            {isVisible ? 'On' : 'Off'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 truncate mt-0.5">{item.desc}</p>
                      </div>

                      <button
                        type="button"
                        onClick={() => onChange(item.key, !isVisible)}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          isVisible ? 'bg-emerald-500' : 'bg-slate-800'
                        }`}
                        role="switch"
                        aria-checked={isVisible}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                            isVisible ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
