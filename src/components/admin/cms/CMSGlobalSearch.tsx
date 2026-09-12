import React, { useState, useEffect, useRef } from 'react';
import { Search, ArrowRight, CornerDownLeft, Sparkles, X } from 'lucide-react';
import { SiteContent } from '../../../types';

interface SearchResult {
  tabId: string;
  tabLabel: string;
  fieldId?: string;
  title: string;
  snippet?: string;
  matchType: 'title' | 'field' | 'value' | 'tag';
}

const DEFAULT_TABS = [
  { id: 'visibility', label: 'Section Visibility & Order' },
  { id: 'navbar', label: 'Navbar & Ticker' },
  { id: 'home', label: 'Home Page' },
  { id: 'productsPage', label: 'Catalog Page' },
  { id: 'productDetailPage', label: 'Product Detail' },
  { id: 'checkoutPage', label: 'Checkout & Success' },
  { id: 'accountPage', label: 'Account Page' },
  { id: 'newsSection', label: 'News & Stories' },
  { id: 'footer', label: 'Footer & Support' },
  { id: 'customBlocks', label: 'Custom Divs / Blocks' },
  { id: 'seo', label: 'SEO & SERP' },
  { id: 'theme', label: 'Theme & Design' }
];

interface CMSGlobalSearchProps {
  cmsForm?: Partial<SiteContent>;
  tabs?: Array<{ id: string; label: string; icon?: any }>;
  onSelectTab: (tabId: string, fieldId?: string) => void;
  className?: string;
}

export const CMSGlobalSearch: React.FC<CMSGlobalSearchProps> = ({
  cmsForm = {},
  tabs = DEFAULT_TABS,
  onSelectTab,
  className = ''
}) => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Global Ctrl+K / Cmd+K listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      } else if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Perform index & search
  const results: SearchResult[] = React.useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase().trim();
    const matches: SearchResult[] = [];

    // Search Tabs themselves
    for (const tab of tabs) {
      if (tab.label.toLowerCase().includes(q)) {
        matches.push({
          tabId: tab.id,
          tabLabel: tab.label,
          title: `Tab: ${tab.label}`,
          snippet: `Navigate to ${tab.label} CMS settings`,
          matchType: 'title'
        });
      }
    }

    // Index Fields in cmsForm
    const searchInObject = (obj: any, tabId: string, tabLabel: string, path = '') => {
      if (!obj) return;
      for (const [key, val] of Object.entries(obj)) {
        const curPath = path ? `${path}.${key}` : key;
        const readableKey = key.replace(/([A-Z])/g, ' $1').toLowerCase();

        if (typeof val === 'string' && val.trim()) {
          const valLower = val.toLowerCase();
          if (readableKey.includes(q) || valLower.includes(q)) {
            matches.push({
              tabId,
              tabLabel,
              fieldId: `field-${tabId}-${key}`,
              title: `${tabLabel} → ${key.replace(/([A-Z])/g, ' $1')}`,
              snippet: val.length > 80 ? val.substring(0, 80) + '...' : val,
              matchType: readableKey.includes(q) ? 'field' : 'value'
            });
          }
        } else if (typeof val === 'boolean') {
          if (readableKey.includes(q)) {
            matches.push({
              tabId: 'visibility',
              tabLabel: 'Section Visibility',
              fieldId: `field-visibility-${key}`,
              title: `Visibility: ${key.replace(/([A-Z])/g, ' $1')}`,
              snippet: `Currently ${val ? 'Enabled (Visible)' : 'Disabled (Hidden)'}`,
              matchType: 'field'
            });
          }
        } else if (Array.isArray(val)) {
          val.forEach((item, idx) => {
            if (typeof item === 'object') {
              searchInObject(item, tabId, tabLabel, `${curPath}[${idx}]`);
            }
          });
        } else if (typeof val === 'object' && val !== null) {
          searchInObject(val, tabId, tabLabel, curPath);
        }
      }
    };

    if (cmsForm.hero) searchInObject(cmsForm.hero, 'hero', 'Hero Banner');
    if (cmsForm.navbar) searchInObject(cmsForm.navbar, 'navbar', 'Navbar & Header');
    if (cmsForm.offers) searchInObject(cmsForm.offers, 'offers', 'Offers & Promos');
    if (cmsForm.home) searchInObject(cmsForm.home, 'home', 'Home Page Sections');
    if (cmsForm.productsPage) searchInObject(cmsForm.productsPage, 'productsPage', 'Products Page');
    if (cmsForm.productDetailPage) searchInObject(cmsForm.productDetailPage, 'productDetailPage', 'Product Detail');
    if (cmsForm.checkoutPage) searchInObject(cmsForm.checkoutPage, 'checkoutPage', 'Checkout Page');
    if (cmsForm.visibility) searchInObject(cmsForm.visibility, 'visibility', 'Visibility');
    if (cmsForm.seo) searchInObject(cmsForm.seo, 'seo', 'SEO & Meta');
    if (cmsForm.theme) searchInObject(cmsForm.theme, 'theme', 'Theme & Style');

    return matches.slice(0, 15);
  }, [query, cmsForm, tabs]);

  const handleSelect = (item: SearchResult) => {
    onSelectTab(item.tabId, item.fieldId);
    setIsOpen(false);
    setQuery('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % (results.length || 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + results.length) % (results.length || 1));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      e.preventDefault();
      handleSelect(results[selectedIndex]);
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className || ''}`}>
      {/* Search Input Button / Trigger */}
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setIsOpen(true);
            setTimeout(() => inputRef.current?.focus(), 50);
          }}
          className="w-full px-3.5 py-2 rounded-xl bg-slate-900/90 hover:bg-slate-900 border border-white/15 hover:border-amber-400/50 text-slate-400 hover:text-slate-200 text-xs flex items-center justify-between gap-2 transition-all cursor-pointer shadow-xs"
        >
          <div className="flex items-center gap-2 min-w-0 truncate">
            <Search className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="truncate">Search CMS fields, texts, tabs...</span>
          </div>
          <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-slate-800 border border-white/10 text-[10px] font-mono text-slate-400 shrink-0">
            <span>⌘</span>K
          </kbd>
        </button>
      </div>

      {/* Search Results Dropdown Overlay */}
      {isOpen && (
        <div className="absolute left-0 sm:left-0 sm:right-auto w-[calc(100vw-2rem)] sm:w-[460px] max-w-[90vw] top-full mt-2 rounded-2xl bg-slate-900 border border-amber-500/30 shadow-2xl z-50 overflow-hidden backdrop-blur-xl animate-fadeIn">
          {/* Top Search Bar */}
          <div className="p-3 border-b border-white/10 flex items-center gap-2.5 bg-slate-950/60">
            <Search className="w-4 h-4 text-amber-400 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedIndex(0);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Type field name, English/Arabic phrase, section..."
              className="flex-1 bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none"
              autoFocus
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="text-slate-400 hover:text-white text-xs cursor-pointer p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            <kbd className="text-[10px] font-mono text-slate-500">ESC to close</kbd>
          </div>

          {/* Results List */}
          <div className="max-h-80 overflow-y-auto p-2 space-y-1 custom-scrollbar">
            {query.trim() === '' ? (
              <div className="p-4 text-center text-slate-500 text-xs">
                <Sparkles className="w-5 h-5 text-amber-400/60 mx-auto mb-1.5" />
                <p className="font-semibold text-slate-400">Quick Global CMS Search</p>
                <p className="text-[11px] mt-0.5">Search across titles, banners, bilingual copy, buttons, or visibility switches.</p>
              </div>
            ) : results.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-xs">
                No matching CMS fields or copy found for "{query}".
              </div>
            ) : (
              results.map((item, idx) => {
                const isSelected = idx === selectedIndex;
                return (
                  <div
                    key={idx}
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`p-2.5 rounded-xl cursor-pointer transition-all flex items-center justify-between gap-3 text-start ${
                      isSelected
                        ? 'bg-amber-500/20 border border-amber-400/40 text-white'
                        : 'hover:bg-slate-800/60 border border-transparent text-slate-300'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md bg-slate-800 border border-white/10 text-[10px] font-bold text-amber-300 uppercase tracking-wider">
                          {item.tabLabel}
                        </span>
                        <span className="text-xs font-bold text-white truncate">
                          {item.title}
                        </span>
                      </div>
                      {item.snippet && (
                        <p className="text-[11px] text-slate-400 mt-1 truncate">
                          {item.snippet}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1 text-slate-400 flex-shrink-0">
                      <span className="text-[10px] font-semibold hidden sm:inline">Jump</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Results Footer */}
          <div className="p-2 bg-slate-950 border-t border-white/10 flex items-center justify-between text-[10px] text-slate-400 px-3">
            <span>Use ↑ ↓ keys to navigate, ↵ to select</span>
            <span>{results.length} results</span>
          </div>
        </div>
      )}
    </div>
  );
};
