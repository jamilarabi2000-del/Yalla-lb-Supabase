import React, { useState } from 'react';
import { Eye, EyeOff, Palette, RotateCcw, Save, Smartphone, Tablet, Monitor, Plus, Trash2 } from 'lucide-react';
import { useShop } from '../../../context/ShopContext';
import type { CMSDesignRule } from '../../../types';
import { DESIGN_PRESET_SELECTORS } from '../../../lib/designSelectors';

const TARGETS=[
 {id:'page',label:'Main page content',selector:'#main-content'},
 {id:'header',label:'Header / Navbar',selector:'header'},
 {id:'headerButtons',label:'Header buttons',selector:DESIGN_PRESET_SELECTORS.headerButtons},
 {id:'hero',label:'Hero banner',selector:'[class*="hero"]'},
 {id:'promo',label:'Promo slider',selector:'#homepage-content-slider'},
 {id:'productGrid',label:'Product grid',selector:'#products-grid-section'},
 {id:'productCards',label:'Product cards',selector:'#products-grid-section > *'},
 {id:'productImages',label:'Product images',selector:'#products-grid-section img'},
 {id:'buttons',label:'All storefront buttons',selector:DESIGN_PRESET_SELECTORS.buttons},
 {id:'links',label:'All storefront links',selector:'#main-content a'},
 {id:'inputs',label:'Inputs / selects / textareas',selector:DESIGN_PRESET_SELECTORS.inputs},
 {id:'cart',label:'Cart drawer',selector:'[role="dialog"]'},
 {id:'checkout',label:'Checkout',selector:'#main-content form'},
 {id:'account',label:'Account',selector:'#main-content'},
 {id:'footer',label:'Footer',selector:'footer'},
 {id:'custom',label:'Custom selector',selector:''}
] as const;
const PROPS=[['display','Display'],['position','Position'],['inset','Top / right / bottom / left'],['width','Width'],['max-width','Max width'],['min-width','Min width'],['height','Height'],['min-height','Min height'],['margin','Margin'],['padding','Padding'],['gap','Gap'],['background','Background'],['color','Text color'],['border','Border'],['border-radius','Border radius'],['box-shadow','Shadow'],['opacity','Opacity'],['z-index','Layer / z-index'],['text-align','Text alignment'],['align-items','Align items'],['justify-content','Justify content'],['flex-direction','Flex direction'],['grid-template-columns','Grid columns'],['transform','Transform'],['overflow','Overflow'],['object-fit','Image fit'],['object-position','Image position'],['font-family','Font family'],['font-size','Font size'],['font-weight','Font weight'],['line-height','Line height'],['letter-spacing','Letter spacing'],['text-transform','Text transform']] as const;
const sanitize=(v:string)=>v.replace(/[{};]/g,'');

export const CMSDesignControls:React.FC=()=>{
 const {siteContent,updateSiteContent,showToast}=useShop();
 const theme=siteContent.theme as any;
 const [target,setTarget]=useState('page'); const [device,setDevice]=useState<'desktop'|'tablet'|'mobile'>('desktop');
 const [rules,setRules]=useState<Record<string,CMSDesignRule>>({...((theme?.designRules)||{})});
 const current=rules[target]||{selector:TARGETS.find(x=>x.id===target)?.selector||''};
 const setRule=(patch:Partial<CMSDesignRule>)=>setRules(prev=>({...prev,[target]:{...current,...patch}}));
 const setProp=(name:string,value:string)=>{const next={...(current[device]||{})}; if(value)next[name]=value; else delete next[name]; setRule({[device]:next} as any);};
 const save=async()=>{try{await updateSiteContent({...siteContent,theme:{...theme,designRules:rules}});showToast('Design controls saved.','success')}catch(e){console.error(e);showToast('Could not save design controls.','error')}};
 const reset=()=>setRules(prev=>{const n={...prev};delete n[target];return n;});
 const addCustom=()=>{const id='custom-'+Date.now();setRules(prev=>({...prev,[id]:{selector:'.your-selector'}}));setTarget(id);};
 const remove=()=>{setRules(prev=>{const n={...prev};delete n[target];return n;});setTarget('page');};
 const props=(current[device]||{});
 return <section className='space-y-5 mt-6 pt-6 border-t border-slate-200'>
  <div className='bg-white border border-slate-200 rounded-2xl p-5'><div className='flex flex-col lg:flex-row lg:items-center justify-between gap-4'><div><div className='flex items-center gap-2'><Palette className='w-5 h-5 text-indigo-600'/><h3 className='text-base font-bold text-slate-900'>Universal Design & Element Controls</h3></div><p className='text-xs text-slate-500 mt-1 max-w-4xl'>Admin controls for layout, spacing, sizing, position, colors, typography, visibility and responsive behavior. The selector option lets you control any customer-facing element without changing React code.</p></div><div className='flex items-center gap-2'><button type='button' onClick={()=>setDevice('desktop')} className={'p-2 rounded-lg '+(device==='desktop'?'bg-slate-900 text-white':'bg-slate-100')}><Monitor className='w-4 h-4'/></button><button type='button' onClick={()=>setDevice('tablet')} className={'p-2 rounded-lg '+(device==='tablet'?'bg-slate-900 text-white':'bg-slate-100')}><Tablet className='w-4 h-4'/></button><button type='button' onClick={()=>setDevice('mobile')} className={'p-2 rounded-lg '+(device==='mobile'?'bg-slate-900 text-white':'bg-slate-100')}><Smartphone className='w-4 h-4'/></button><button type='button' onClick={save} className='px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-black flex items-center gap-2'><Save className='w-4 h-4'/>Save</button></div></div></div>
  <div className='grid grid-cols-1 xl:grid-cols-[260px_minmax(0,1fr)] gap-5'>
   <aside className='bg-white border border-slate-200 rounded-2xl p-3 h-fit'>{TARGETS.map(t=><button key={t.id} type='button' onClick={()=>setTarget(t.id)} className={'w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 '+(target===t.id?'bg-indigo-50 text-indigo-700':'hover:bg-slate-50 text-slate-700')}><span className={'w-1.5 h-1.5 rounded-full '+(rules[t.id]?.enabled===false?'bg-rose-500':'bg-emerald-500')}/>{t.label}</button>)}{Object.keys(rules).filter(k=>!TARGETS.some(t=>t.id===k)).map(k=><button key={k} type='button' onClick={()=>setTarget(k)} className={'w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 '+(target===k?'bg-indigo-50 text-indigo-700':'hover:bg-slate-50 text-slate-700')}><span className='w-1.5 h-1.5 rounded-full bg-emerald-500'/>{k}</button>)}<button type='button' onClick={addCustom} className='w-full mt-3 px-3 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold flex items-center justify-center gap-2'><Plus className='w-4 h-4'/>Custom element</button></aside>
   <main className='bg-white border border-slate-200 rounded-2xl p-5'><div className='flex items-start justify-between gap-3 border-b border-slate-100 pb-4'><div><div className='text-[10px] uppercase tracking-widest font-bold text-slate-400'>Selected element</div><h4 className='text-lg font-black'>{TARGETS.find(x=>x.id===target)?.label||target}</h4></div><div className='flex gap-2'><button type='button' onClick={()=>setRule({enabled:current.enabled===false})} className={'px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 '+(current.enabled===false?'bg-rose-50 text-rose-700':'bg-emerald-50 text-emerald-700')}>{current.enabled===false?<EyeOff className='w-4 h-4'/>:<Eye className='w-4 h-4'/>}{current.enabled===false?'Hidden':'Visible'}</button><button type='button' onClick={reset} className='px-3 py-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-bold flex items-center gap-2'><RotateCcw className='w-4 h-4'/>Reset</button></div></div>
    <label className='block text-xs font-bold text-slate-600 mt-4'>Element selector<input value={current.selector||''} onChange={e=>setRule({selector:e.target.value})} placeholder='#element-id or .class or [data-cms-element="x"]' className='mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono'/></label>
    <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-4'>{PROPS.map(([name,label])=><label key={name} className='text-xs font-bold text-slate-600'>{label}<input value={props[name]||''} onChange={e=>setProp(name,sanitize(e.target.value))} placeholder='inherit / auto / value' className='mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-normal'/></label>)}</div>
    <div className='mt-5 pt-4 border-t border-slate-100'><h5 className='text-sm font-black mb-3'>Hover / interaction</h5><div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3'>{[['background','Hover background'],['color','Hover text color'],['border','Hover border'],['transform','Hover transform'],['box-shadow','Hover shadow']].map(([name,label])=><label key={name} className='text-xs font-bold text-slate-600'>{label}<input value={(current.hover||{})[name]||''} onChange={e=>setRule({hover:{...(current.hover||{}),[name]:sanitize(e.target.value)}})} className='mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-normal'/></label>)}</div></div>
    <div className='mt-5 pt-4 border-t border-slate-100'><h5 className='text-sm font-black mb-3'>Advanced</h5><textarea value={theme?.customCss||''} readOnly rows={3} className='w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-500 bg-slate-50' /><p className='text-[11px] text-slate-500 mt-2'>The existing Advanced storefront CSS field remains available above. Use this panel for normal visual controls; use custom CSS only when a one-off selector is required.</p></div>
   </main>
  </div>
 </section>;
};
export default CMSDesignControls;