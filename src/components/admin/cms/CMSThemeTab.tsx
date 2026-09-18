import React from 'react';
import { useShop } from '../../../context/ShopContext';
import { CMSTextStyleSlot } from '../../../types';
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

  const textSlots: { id: CMSTextStyleSlot; label: string }[] = [
    { id: 'body', label: 'Body / General Text' },
    { id: 'heading1', label: 'Heading 1' },
    { id: 'heading2', label: 'Heading 2' },
    { id: 'heading3', label: 'Heading 3' },
    { id: 'subtitle', label: 'Subtitle' },
    { id: 'small', label: 'Small / Caption' },
    { id: 'label', label: 'Labels' },
    { id: 'button', label: 'Buttons / CTAs' },
    { id: 'nav', label: 'Navigation' },
    { id: 'price', label: 'Prices' },
    { id: 'badge', label: 'Badges' },
    { id: 'input', label: 'Inputs / Placeholders' },
    { id: 'link', label: 'Links' },
  ];

  const textStyles = theme.textStyles || {};
  const updateTextStyle = (slot: CMSTextStyleSlot, key: string, value: any) => {
    handleUpdateTheme('textStyles', {
      ...textStyles,
      [slot]: { ...(textStyles[slot] || {}), [key]: value }
    });
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
      <div className="bg-slate-50/60 border border-slate-200 rounded-2xl p-6 space-y-6">
        <div className="flex items-center gap-2 border-b border-slate-200 pb-4">
          <Palette className="w-5 h-5 text-indigo-600" />
          <h3 className="text-base font-bold text-slate-900 tracking-wide">
            Global Design, Colors & Typography
          </h3>
        </div>

        <p className="text-xs text-slate-600 leading-relaxed">
          Customize the visual branding, color palettes, and typography of the entire Yalla Lebanon storefront and admin portal instantly.
        </p>

        {/* Color Presets */}
        <div className="space-y-3">
          <label className="block text-xs font-bold uppercase tracking-wider text-indigo-600">
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
                    ? 'bg-amber-500/20 border-amber-400 text-slate-900' 
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-white/30'
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
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Color Pickers */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-200">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
              Primary Brand Color (Hex)
            </label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={theme.primaryColor || '#c5a059'}
                onChange={(e) => handleUpdateTheme('primaryColor', e.target.value)}
                className="w-12 h-10 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer"
              />
              <input
                type="text"
                value={theme.primaryColor || '#c5a059'}
                onChange={(e) => handleUpdateTheme('primaryColor', e.target.value)}
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
              Accent / Secondary Color (Hex)
            </label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={theme.accentColor || '#059669'}
                onChange={(e) => handleUpdateTheme('accentColor', e.target.value)}
                className="w-12 h-10 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer"
              />
              <input
                type="text"
                value={theme.accentColor || '#059669'}
                onChange={(e) => handleUpdateTheme('accentColor', e.target.value)}
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 font-mono"
              />
            </div>
          </div>
        </div>

        {/* Typography */}
        <div className="space-y-3 pt-4 border-t border-slate-200">
          <div className="flex items-center gap-2">
            <Type className="w-4 h-4 text-indigo-600" />
            <label className="block text-xs font-bold uppercase tracking-wider text-indigo-600">
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
                    ? 'bg-amber-500/20 border-amber-400 text-slate-900 font-bold'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-white/30'
                }`}
              >
                <div className="text-xs">{font.name}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Admin-controlled text styling */}
        <div className="space-y-4 pt-4 border-t border-slate-200">
          <div className="flex items-center gap-2">
            <Type className="w-4 h-4 text-indigo-600" />
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-indigo-600">Text Style Studio</label>
              <p className="text-xs text-slate-500 mt-1">Control typography, color, alignment, wrapping, spacing and responsive sizing by text role.</p>
            </div>
          </div>
          <div className="space-y-3">
            {textSlots.map(slot => {
              const s = textStyles[slot.id] || {};
              return (
                <details key={slot.id} className="rounded-2xl border border-slate-200 bg-white" open={slot.id === 'body'}>
                  <summary className="cursor-pointer list-none px-4 py-3 flex items-center justify-between text-sm font-bold text-slate-900">
                    <span>{slot.label}</span><span className="text-[10px] text-slate-400 uppercase tracking-wider">Responsive</span>
                  </summary>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-4 border-t border-slate-100">
                    <label className="text-xs text-slate-600">Font family<input value={s.fontFamily || ''} onChange={e=>updateTextStyle(slot.id,'fontFamily',e.target.value)} placeholder="inherit / Inter" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"/></label>
                    <label className="text-xs text-slate-600">Desktop size<input value={s.fontSize || ''} onChange={e=>updateTextStyle(slot.id,'fontSize',e.target.value)} placeholder="16px / 1rem" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"/></label>
                    <label className="text-xs text-slate-600">Tablet size<input value={s.fontSizeTablet || ''} onChange={e=>updateTextStyle(slot.id,'fontSizeTablet',e.target.value)} placeholder="16px" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"/></label>
                    <label className="text-xs text-slate-600">Mobile size<input value={s.fontSizeMobile || ''} onChange={e=>updateTextStyle(slot.id,'fontSizeMobile',e.target.value)} placeholder="15px" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"/></label>
                    <label className="text-xs text-slate-600">Weight<input value={s.fontWeight || ''} onChange={e=>updateTextStyle(slot.id,'fontWeight',e.target.value)} placeholder="400 / 600 / 700" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"/></label>
                    <label className="text-xs text-slate-600">Color<input value={s.color || ''} onChange={e=>updateTextStyle(slot.id,'color',e.target.value)} placeholder="#111827" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"/></label>
                    <label className="text-xs text-slate-600">Line height<input value={s.lineHeight || ''} onChange={e=>updateTextStyle(slot.id,'lineHeight',e.target.value)} placeholder="1.5" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"/></label>
                    <label className="text-xs text-slate-600">Letter spacing<input value={s.letterSpacing || ''} onChange={e=>updateTextStyle(slot.id,'letterSpacing',e.target.value)} placeholder="0px" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"/></label>
                    <label className="text-xs text-slate-600">Alignment<select value={s.textAlign || 'start'} onChange={e=>updateTextStyle(slot.id,'textAlign',e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"><option value="start">Start</option><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option><option value="end">End</option></select></label>
                    <label className="text-xs text-slate-600">Max width<input value={s.maxWidth || ''} onChange={e=>updateTextStyle(slot.id,'maxWidth',e.target.value)} placeholder="100% / 40rem" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"/></label>
                    <label className="text-xs text-slate-600">Margin<input value={s.margin || ''} onChange={e=>updateTextStyle(slot.id,'margin',e.target.value)} placeholder="0 / 8px 0" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"/></label>
                    <label className="text-xs text-slate-600">Padding<input value={s.padding || ''} onChange={e=>updateTextStyle(slot.id,'padding',e.target.value)} placeholder="0 / 8px" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"/></label>
                    <label className="text-xs text-slate-600">Wrapping<select value={s.whiteSpace || 'normal'} onChange={e=>updateTextStyle(slot.id,'whiteSpace',e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"><option value="normal">Wrap</option><option value="nowrap">No wrap</option><option value="pre-wrap">Preserve + wrap</option></select></label>
                    <label className="text-xs text-slate-600">Overflow<select value={s.overflow || 'visible'} onChange={e=>updateTextStyle(slot.id,'overflow',e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"><option value="visible">Visible</option><option value="hidden">Hidden</option></select></label>
                    <label className="text-xs text-slate-600">Text overflow<select value={s.textOverflow || 'clip'} onChange={e=>updateTextStyle(slot.id,'textOverflow',e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"><option value="clip">Clip</option><option value="ellipsis">Ellipsis</option></select></label>
                    <label className="text-xs text-slate-600">Transform<select value={s.textTransform || 'none'} onChange={e=>updateTextStyle(slot.id,'textTransform',e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"><option value="none">None</option><option value="uppercase">UPPERCASE</option><option value="lowercase">lowercase</option><option value="capitalize">Capitalize</option></select></label>
                  </div>
                </details>
              );
            })}
          </div>
          <label className="block text-xs text-slate-600">Advanced storefront CSS overrides<textarea value={theme.customCss || ''} onChange={e=>handleUpdateTheme('customCss',e.target.value)} rows={5} placeholder=".my-text { ... }" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono"/></label>
        </div>

        {/* UI Component Radius */}
        <div className="space-y-3 pt-4 border-t border-slate-200">
          <label className="block text-xs font-bold uppercase tracking-wider text-indigo-600">
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
                    ? 'bg-amber-500/20 border-amber-400 text-slate-900'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-white/30'
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
