import React from 'react';
import { useShop } from '../../../context/ShopContext';
import { Sparkles, Palette, Type, Layout, ShieldCheck } from 'lucide-react';

export const CMSThemeTab: React.FC = () => {
  const { siteContent, updateSiteContent, showToast } = useShop();
  const theme = siteContent?.theme || {
    primaryColor: '#c5a059',
    accentColor: '#059669',
    fontFamily: 'plus_jakarta',
    borderRadius: 'xl',
    headerStyle: 'modern'
  };

  const handleUpdateTheme = (key: string, value: any) => {
    const updated = {
      ...siteContent,
      theme: {
        ...theme,
        [key]: value
      }
    };
    updateSiteContent(updated);
  };

  const colorPresets = [
    { name: 'Levantine Gold / Amber (Default)', primary: '#c5a059', accent: '#059669' },
    { name: 'Cedars Emerald Green', primary: '#059669', accent: '#d97706' },
    { name: 'Royal Sapphire Blue', primary: '#2563eb', accent: '#f59e0b' },
    { name: 'Phoenician Ruby Red', primary: '#dc2626', accent: '#10b981' },
    { name: 'Beirut Slate Dark', primary: '#0f172a', accent: '#38bdf8' },
  ];

  const fontOptions = [
    { id: 'plus_jakarta', name: 'Plus Jakarta Sans (Modern Clean UI)' },
    { id: 'playfair', name: 'Playfair Display (Luxury Serif)' },
    { id: 'inter', name: 'Inter (Universal Standard)' },
    { id: 'tajawal', name: 'Tajawal / Arabic Professional' },
    { id: 'cairo', name: 'Cairo / Modern Arabic' },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-6 space-y-6">
        <div className="flex items-center gap-2 border-b border-white/10 pb-4">
          <Palette className="w-5 h-5 text-amber-400" />
          <h3 className="text-base font-bold text-white tracking-wide">
            Global Design, Colors & Typography
          </h3>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed">
          Customize the visual branding, color palettes, and typography of the entire Yalla Lebanon storefront and admin portal instantly.
        </p>

        {/* Color Presets */}
        <div className="space-y-3">
          <label className="block text-xs font-bold uppercase tracking-wider text-amber-400">
            Quick Brand Color Presets
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {colorPresets.map((preset, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  handleUpdateTheme('primaryColor', preset.primary);
                  handleUpdateTheme('accentColor', preset.accent);
                  showToast(`Applied ${preset.name}`, 'success');
                }}
                className={`p-3 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                  theme.primaryColor === preset.primary 
                    ? 'bg-amber-500/20 border-amber-400 text-white' 
                    : 'bg-slate-900 border-white/10 text-slate-300 hover:border-white/30'
                }`}
              >
                <div>
                  <div className="text-xs font-bold">{preset.name}</div>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <span className="w-4 h-4 rounded-full border border-white/20 inline-block" style={{ backgroundColor: preset.primary }} />
                    <span className="w-4 h-4 rounded-full border border-white/20 inline-block" style={{ backgroundColor: preset.accent }} />
                  </div>
                </div>
                {theme.primaryColor === preset.primary && (
                  <Sparkles className="w-4 h-4 text-amber-400" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Color Pickers */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-white/10">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
              Primary Brand Color (Hex)
            </label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={theme.primaryColor || '#c5a059'}
                onChange={(e) => handleUpdateTheme('primaryColor', e.target.value)}
                className="w-12 h-10 rounded-xl bg-slate-900 border border-white/10 cursor-pointer"
              />
              <input
                type="text"
                value={theme.primaryColor || '#c5a059'}
                onChange={(e) => handleUpdateTheme('primaryColor', e.target.value)}
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
              Accent / Secondary Color (Hex)
            </label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={theme.accentColor || '#059669'}
                onChange={(e) => handleUpdateTheme('accentColor', e.target.value)}
                className="w-12 h-10 rounded-xl bg-slate-900 border border-white/10 cursor-pointer"
              />
              <input
                type="text"
                value={theme.accentColor || '#059669'}
                onChange={(e) => handleUpdateTheme('accentColor', e.target.value)}
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white font-mono"
              />
            </div>
          </div>
        </div>

        {/* Typography */}
        <div className="space-y-3 pt-4 border-t border-white/10">
          <div className="flex items-center gap-2">
            <Type className="w-4 h-4 text-amber-400" />
            <label className="block text-xs font-bold uppercase tracking-wider text-amber-400">
              System Typography / Font Family
            </label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {fontOptions.map((font) => (
              <button
                key={font.id}
                type="button"
                onClick={() => handleUpdateTheme('fontFamily', font.id)}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  theme.fontFamily === font.id
                    ? 'bg-amber-500/20 border-amber-400 text-white font-bold'
                    : 'bg-slate-900 border-white/10 text-slate-300 hover:border-white/30'
                }`}
              >
                <div className="text-xs">{font.name}</div>
              </button>
            ))}
          </div>
        </div>

        {/* UI Component Radius */}
        <div className="space-y-3 pt-4 border-t border-white/10">
          <label className="block text-xs font-bold uppercase tracking-wider text-amber-400">
            Card & Button Corner Roundness
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { id: 'sm', label: 'Subtle (8px)' },
              { id: 'md', label: 'Standard (12px)' },
              { id: 'xl', label: 'Rounded (16px)' },
              { id: 'full', label: 'Pill / Full' }
            ].map((rad) => (
              <button
                key={rad.id}
                type="button"
                onClick={() => handleUpdateTheme('borderRadius', rad.id)}
                className={`p-3 rounded-xl border text-center transition-all cursor-pointer text-xs font-bold ${
                  theme.borderRadius === rad.id
                    ? 'bg-amber-500/20 border-amber-400 text-white'
                    : 'bg-slate-900 border-white/10 text-slate-300 hover:border-white/30'
                }`}
              >
                {rad.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
