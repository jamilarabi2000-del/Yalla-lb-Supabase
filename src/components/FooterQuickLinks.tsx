import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import { useShop } from '../context/ShopContext';

/**
 * Footer quick links are derived from the CMS-controlled navigation tabs.
 * This keeps the links editable by administrators without introducing a
 * second hard-coded navigation data source.
 */
export const FooterQuickLinks: React.FC = () => {
  const { siteContent, language, setActiveTab, isVisualEditMode } = useShop();
  const visibility = siteContent?.visibility;
  const links = (siteContent?.navbar?.navTabs || []).filter(tab => tab.isPublished !== false);

  if (visibility?.footerQuickLinks === false && !isVisualEditMode) return null;
  if (links.length === 0 && !isVisualEditMode) return null;

  const resolveTab = (id: string): 'home' | 'products' | 'favorites' | 'account' | 'checkout' | null => {
    const normalized = id.trim().toLowerCase();
    if (normalized === 'home') return 'home';
    if (normalized === 'products' || normalized === 'catalog') return 'products';
    if (normalized === 'favorites' || normalized === 'wishlist') return 'favorites';
    if (normalized === 'account' || normalized === 'profile') return 'account';
    if (normalized === 'checkout') return 'checkout';
    return null;
  };

  const title = language === 'ar'
    ? siteContent?.footer?.quickLinksTitleArabic || siteContent?.footer?.quickLinksTitle || 'روابط سريعة'
    : siteContent?.footer?.quickLinksTitle || 'Quick Links';

  return (
    <section className="bg-[#171717] text-neutral-300 border-t border-white/5 py-5 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto">
        <div className={`flex flex-col sm:flex-row sm:items-center gap-3 ${visibility?.footerQuickLinks === false && isVisualEditMode ? 'opacity-60 border border-dashed border-rose-500 rounded-xl p-3' : ''}`}>
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#B89753] shrink-0">{title}</div>
          <nav aria-label={title} className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {links.map(tab => {
              const target = resolveTab(tab.id);
              const label = language === 'ar' ? tab.arabicLabel || tab.label : tab.label;
              if (!target) return null;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(target)}
                  className="inline-flex items-center gap-1 text-[11px] text-neutral-300 hover:text-white transition-colors"
                >
                  <span>{label}</span>
                  <ArrowUpRight className="w-3 h-3" />
                </button>
              );
            })}
          </nav>
        </div>
      </div>
    </section>
  );
};

export default FooterQuickLinks;
