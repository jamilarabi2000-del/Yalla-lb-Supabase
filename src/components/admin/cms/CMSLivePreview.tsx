import React, { useState, useEffect, useRef } from 'react';
import { 
  Smartphone, 
  Tablet, 
  Monitor, 
  RotateCcw, 
  ExternalLink,
  Minus,
  Plus
} from 'lucide-react';
import { SiteContent } from '../../../types';

interface CMSLivePreviewProps {
  content?: SiteContent;
  cmsForm?: SiteContent;
  activeTab?: string;
  onClose?: () => void;
  isSplitView?: boolean;
}

const ZOOM_LEVELS = [25, 33, 50, 67, 75, 80, 90, 100, 110, 125, 150];

export const CMSLivePreview: React.FC<CMSLivePreviewProps> = ({
  content,
  cmsForm: propCmsForm,
  activeTab,
  onClose,
  isSplitView = true
}) => {
  const formContent = content || propCmsForm || ({} as SiteContent);
  const [device, setDevice] = useState<'mobile' | 'tablet' | 'desktop'>('desktop');
  const [previewLang, setPreviewLang] = useState<'en' | 'ar'>('en');
  const [previewPage, setPreviewPage] = useState<'home' | 'products' | 'checkout'>('home');
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [iframeKey, setIframeKey] = useState<number>(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Automatically select the page based on the active CMS tab
  useEffect(() => {
    if (!activeTab) return;
    if (activeTab === 'home' || activeTab === 'hero' || activeTab === 'visibility' || activeTab === 'navbar' || activeTab === 'footer') {
      setPreviewPage('home');
    } else if (activeTab === 'productsPage' || activeTab === 'productDetailPage') {
      setPreviewPage('products');
    } else if (activeTab === 'checkoutPage') {
      setPreviewPage('checkout');
    }
  }, [activeTab]);

  const getPagePath = () => {
    switch (previewPage) {
      case 'home': return '';
      case 'products': return 'products';
      case 'checkout': return 'checkout';
      default: return '';
    }
  };

  const pagePath = getPagePath();
  const previewUrl = `/${pagePath}?cmsPreview=1&lang=${previewLang}`;

  // Send real-time draft updates to the iframe
  useEffect(() => {
    if (iframeRef.current && iframeRef.current.contentWindow) {
      try {
        iframeRef.current.contentWindow.postMessage(
          { type: 'CMS_DRAFT_UPDATE', payload: formContent },
          '*'
        );
      } catch (err) {
        console.warn('[CMSLivePreview] postMessage error:', err);
      }
    }
  }, [formContent]);

  // Send real-time language updates to the iframe
  useEffect(() => {
    if (iframeRef.current && iframeRef.current.contentWindow) {
      try {
        iframeRef.current.contentWindow.postMessage(
          { type: 'CMS_LANG_UPDATE', payload: previewLang },
          '*'
        );
      } catch (err) {
        console.warn('[CMSLivePreview] postMessage error:', err);
      }
    }
  }, [previewLang]);

  const handleIframeLoad = () => {
    if (iframeRef.current && iframeRef.current.contentWindow) {
      try {
        iframeRef.current.contentWindow.postMessage(
          { type: 'CMS_DRAFT_UPDATE', payload: formContent },
          '*'
        );
        iframeRef.current.contentWindow.postMessage(
          { type: 'CMS_LANG_UPDATE', payload: previewLang },
          '*'
        );
      } catch (err) {
        console.warn('[CMSLivePreview] onLoad postMessage error:', err);
      }
    }
  };

  const handleZoomIn = () => {
    const next = ZOOM_LEVELS.find(z => z > zoomLevel);
    if (next) setZoomLevel(next);
    else if (zoomLevel < 150) setZoomLevel(150);
  };

  const handleZoomOut = () => {
    const prev = [...ZOOM_LEVELS].reverse().find(z => z < zoomLevel);
    if (prev) setZoomLevel(prev);
    else if (zoomLevel > 25) setZoomLevel(25);
  };

  const getContainerDimensions = () => {
    switch (device) {
      case 'mobile':
        return {
          wrapperClass: 'w-[390px] max-w-[390px] h-[780px]',
          containerClass: 'rounded-[40px] border-[10px] border-slate-800 shadow-2xl overflow-hidden ring-1 ring-white/10'
        };
      case 'tablet':
        return {
          wrapperClass: 'w-[768px] max-w-[768px] h-[860px]',
          containerClass: 'rounded-[28px] border-[8px] border-slate-800 shadow-2xl overflow-hidden ring-1 ring-white/10'
        };
      case 'desktop':
        return {
          wrapperClass: zoomLevel < 100 ? 'w-[1024px] max-w-[1024px] h-[820px]' : 'w-full h-[820px]',
          containerClass: 'rounded-2xl border border-white/20 shadow-2xl overflow-hidden'
        };
    }
  };

  const { wrapperClass, containerClass } = getContainerDimensions();

  return (
    <div className="flex flex-col h-full bg-slate-950 border-l border-white/15 overflow-hidden rounded-2xl">
      {/* Live Preview Toolbar */}
      <div className="p-3 bg-slate-900 border-b border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Left: Device Viewport Switches */}
        <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-white/10">
          <button
            type="button"
            onClick={() => setDevice('mobile')}
            className={`p-1.5 rounded-lg flex items-center gap-1 font-bold transition-all cursor-pointer ${
              device === 'mobile' ? 'bg-amber-500 text-slate-950 shadow-xs' : 'text-slate-400 hover:text-white'
            }`}
            title="Mobile Viewport (390px)"
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span className="hidden xl:inline text-[10px]">Mobile</span>
          </button>
          <button
            type="button"
            onClick={() => setDevice('tablet')}
            className={`p-1.5 rounded-lg flex items-center gap-1 font-bold transition-all cursor-pointer ${
              device === 'tablet' ? 'bg-amber-500 text-slate-950 shadow-xs' : 'text-slate-400 hover:text-white'
            }`}
            title="Tablet Viewport (768px)"
          >
            <Tablet className="w-3.5 h-3.5" />
            <span className="hidden xl:inline text-[10px]">Tablet</span>
          </button>
          <button
            type="button"
            onClick={() => setDevice('desktop')}
            className={`p-1.5 rounded-lg flex items-center gap-1 font-bold transition-all cursor-pointer ${
              device === 'desktop' ? 'bg-amber-500 text-slate-950 shadow-xs' : 'text-slate-400 hover:text-white'
            }`}
            title="Desktop Fluid Viewport"
          >
            <Monitor className="w-3.5 h-3.5" />
            <span className="hidden xl:inline text-[10px]">Desktop</span>
          </button>
        </div>

        {/* Center: Language & Page Selectors */}
        <div className="flex items-center gap-2">
          {/* Language Switch */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-white/10">
            <button
              type="button"
              onClick={() => setPreviewLang('en')}
              className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                previewLang === 'en' ? 'bg-slate-800 text-amber-300' : 'text-slate-400 hover:text-white'
              }`}
            >
              🇺🇸 EN
            </button>
            <button
              type="button"
              onClick={() => setPreviewLang('ar')}
              className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                previewLang === 'ar' ? 'bg-slate-800 text-amber-300' : 'text-slate-400 hover:text-white'
              }`}
            >
              🇱🇧 العربية
            </button>
          </div>

          {/* Page Picker */}
          <select
            value={previewPage}
            onChange={(e) => setPreviewPage(e.target.value as any)}
            className="px-2.5 py-1.5 rounded-xl bg-slate-950 border border-white/10 text-[11px] font-semibold text-white focus:outline-none focus:border-amber-400 cursor-pointer"
          >
            <option value="home">🏠 Home Page</option>
            <option value="products">🛍️ Catalog Page</option>
            <option value="checkout">💳 Checkout Page</option>
          </select>
        </div>

        {/* Right: Zoom Controls, Reload & Status */}
        <div className="flex items-center gap-2">
          {/* Zoom Controls */}
          <div className="flex items-center bg-slate-950 p-0.5 rounded-xl border border-white/10 text-[10px] font-mono">
            <button
              type="button"
              onClick={handleZoomOut}
              disabled={zoomLevel <= 25}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all disabled:opacity-30 cursor-pointer"
              title="Zoom out"
            >
              <Minus className="w-3 h-3" />
            </button>
            
            <select
              value={zoomLevel}
              onChange={(e) => setZoomLevel(Number(e.target.value))}
              className="bg-transparent text-amber-400 font-bold px-1.5 py-1 text-[10px] focus:outline-none cursor-pointer appearance-none text-center"
              title="Select zoom percentage"
            >
              {ZOOM_LEVELS.map(lvl => (
                <option key={lvl} value={lvl} className="bg-slate-900 text-white">{lvl}%</option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleZoomIn}
              disabled={zoomLevel >= 150}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all disabled:opacity-30 cursor-pointer"
              title="Zoom in"
            >
              <Plus className="w-3 h-3" />
            </button>

            {zoomLevel !== 100 && (
              <button
                type="button"
                onClick={() => setZoomLevel(100)}
                className="px-1.5 py-0.5 ml-1 mr-0.5 rounded bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 text-[9px] font-sans font-bold transition-all cursor-pointer"
                title="Reset zoom to 100%"
              >
                100%
              </button>
            )}
          </div>

          {/* Reload Iframe */}
          <button
            type="button"
            onClick={() => setIframeKey(k => k + 1)}
            className="p-1.5 rounded-xl bg-slate-950 border border-white/10 text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
            title="Reload Preview Frame"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {/* Open in New Tab */}
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 rounded-xl bg-slate-950 border border-white/10 text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition-all cursor-pointer flex items-center gap-1"
            title="Open Live Preview in New Window"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>

          <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold border border-emerald-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Live Sync</span>
          </div>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-white text-xs p-1 cursor-pointer ml-1"
              title="Close Preview Panel"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Main Preview Container Viewport */}
      <div className="flex-1 bg-slate-950/80 overflow-auto p-4 flex justify-center custom-scrollbar">
        <div 
          style={{
            transform: `scale(${zoomLevel / 100})`,
            transformOrigin: 'top center',
            transition: 'transform 0.15s ease-out'
          }}
          className={`${wrapperClass} shrink-0 transition-all duration-300 flex flex-col self-start`}
        >
          <div className={`${containerClass} flex flex-col h-full bg-[#1a1a2e]`}>
            {/* Simulated Browser URL Bar */}
            <div className="bg-slate-900 px-3.5 py-2 border-b border-white/10 flex items-center justify-between text-[11px] text-slate-400 select-none shrink-0">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
              </div>
              <div className="px-3 py-0.5 rounded-md bg-slate-950 text-[10px] font-mono text-slate-300 border border-white/5 truncate max-w-[200px] sm:max-w-xs flex items-center gap-1.5">
                <span className="text-emerald-400">🔒</span>
                <span>https://yalla.lb/{pagePath}</span>
              </div>
              <div className="text-[10px] font-bold text-amber-400">
                Storefront (Draft)
              </div>
            </div>

            {/* Same-Origin App Iframe */}
            <iframe
              key={iframeKey}
              ref={iframeRef}
              src={previewUrl}
              onLoad={handleIframeLoad}
              title="Storefront Live Preview"
              className="w-full flex-1 border-0 bg-[#1a1a2e]"
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
