import React, { useState } from 'react';
import { Eye, EyeOff, Palette, RotateCcw, Save, Smartphone, Tablet, Monitor } from 'lucide-react';
import { useShop } from '../../../context/ShopContext';
import type { CMSDesignElementConfig } from '../../../types';

type Device = 'desktop' | 'tablet' | 'mobile';
const ELEMENTS = [
 {id:'page',label:'Page / Main Content',selector:'#main-content',group:'Global'},
 {id:'announcement',label:'Announcement Bar',selector:'[data-cms-element="announcement"]',group:'Header'},
 {id:'navbar',label:'Header / Navbar',selector:'[data-cms-element="navbar"]',group:'Header'},
 {id:'navbarSearch',label:'Navbar Search',selector:'[data-cms-element="navbar-search"]',group:'Header'},
 {id:'hero',label:'Hero / Main Banner',selector:'[data-cms-element="hero"]',group:'Home'},
 {id:'promo',label:'Promo Banner / Slider',selector:'[data-cms-element="promo-slider"]',group:'Home'},
 {id:'categories',label:'Categories Section',selector:'[data-cms-element="categories"]',group:'Home'},
 {id:'featured',label:'Featured Products Section',selector:'[data-cms-element="featured-products"]',group:'Home'},
 {id:'deals',label:'Deals Section',selector:'[data-cms-element="deals"]',group:'Home'},
 {id:'newArrivals',label:'New Arrivals Section',selector:'[data-cms-element="new-arrivals"]',group:'Home'},
 {id:'trust',label:'Trust Badges',selector:'[data-cms-element="trust-badges"]',group:'Home'},
 {id:'heritage',label:'Heritage / Story',selector:'[data-cms-element="heritage"]',group:'Home'},
 {id:'reviews',label:'Reviews Section',selector:'[data-cms-element="reviews"]',group:'Home'},
 {id:'newsletter',label:'Newsletter Section',selector:'[data-cms-element="newsletter"]',group:'Home'},
 {id:'news',label:'News Section',selector:'[data-cms-element="news"]',group:'Home'},
 {id:'productsHeader',label:'Catalog Header',selector:'[data-cms-element="products-header"]',group:'Catalog'},
 {id:'productsFilters',label:'Catalog Search / Filters',selector:'[data-cms-element="products-filters"]',group:'Catalog'},
 {id:'productsGrid',label:'Product Grid',selector:'#products-grid-section',group:'Catalog'},
 {id:'productCard',label:'Product Card',selector:'[data-cms-element="product-card"]',group:'Products'},
 {id:'productDetail',label:'Product Detail',selector:'[data-cms-element="product-detail"]',group:'Products'},
 {id:'productGallery',label:'Product Gallery',selector:'[data-cms-element="product-gallery"]',group:'Products'},
 {id:'productPrice',label:'Product Price Box',selector:'[data-cms-element="product-price"]',group:'Products'},
 {id:'cart',label:'Cart Drawer',selector:'[data-cms-element="cart"]',group:'Commerce'},
 {id:'checkout',label:'Checkout Page',selector:'[data-cms-element="checkout"]',group:'Commerce'},
 {id:'checkoutPayment',label:'Checkout Payment',selector:'[data-cms-element="checkout-payment"]',group:'Commerce'},
 {id:'checkoutSummary',label:'Checkout Order Summary',selector:'[data-cms-element="checkout-summary"]',group:'Commerce'},
 {id:'account',label:'Customer Account',selector:'[data-cms-element="account"]',group:'Customer'},
 {id:'favorites',label:'Favorites / Wishlist',selector:'[data-cms-element="favorites"]',group:'Customer'},
 {id:'footer',label:'Footer',selector:'[data-cms-element="footer"]',group:'Footer'},
 {id:'buttons',label:'All Storefront Buttons',selector:'#main-content button,[data-cms-element="navbar"] button',group:'Global'},
 {id:'inputs',label:'All Storefront Inputs',selector:'#main-content input,#main-content select,#main-content textarea',group:'Global'}
] as const;

const FIELDS: Array<[keyof CMSDesignElementConfig,string,string]> = [
 ['display','Display','block / flex / grid / none'],['position','Position','static / relative / absolute / sticky'],['inset','Inset','top right bottom left'],['width','Width','100% / auto / 320px'],['maxWidth','Max width','1200px / 100%'],['minWidth','Min width','0 / 280px'],['height','Height','auto / 420px'],['minHeight','Min height','0 / 300px'],['maxHeight','Max height','none / 700px'],['margin','Margin','0 / 16px auto'],['padding','Padding','0 / 24px'],['gap','Gap','0 / 12px'],['background','Background','color / gradient / image'],['color','Text color','#111827'],['border','Border','1px solid #ddd'],['borderRadius','Radius','0 / 16px / 9999px'],['boxShadow','Shadow','none / 0 8px 30px rgba(0,0,0,.1)'],['opacity','Opacity','1 / .8'],['zIndex','Z-index','1 / 10'],['textAlign','Text alignment','left / center / right'],['alignItems','Align items','start / center / end'],['justifyContent','Justify content','start / center / space-between'],['flexDirection','Flex direction','row / column'],['gridTemplateColumns','Grid columns','repeat(4,minmax(0,1fr))'],['transform','Transform','translateY(-2px) / scale(1.02)'],['overflow','Overflow','visible / hidden / auto'],['objectFit','Image fit','cover / contain / fill'],['objectPosition','Image position','center / 50% 30%'],['fontFamily','Font family','inherit / Inter / Cairo'],['fontSize','Font size','16px / 1rem'],['fontWeight','Font weight','400 / 600 / 700'],['lineHeight','Line height','1.5'],['letterSpacing','Letter spacing','0 / .02em'],['textTransform','Text transform','none / uppercase']
];
const esc=(v:string)=>v.replace(/[\\{};]/g,'');
const cssDecl=(cfg:Partial<CMSDesignElementConfig>)=>{
 const map:Record<string,string>={display:'display',position:'position',inset:'inset',width:'width',maxWidth:'max-width',minWidth:'min-width',height:'height',minHeight:'min-height',maxHeight:'max-height',margin:'margin',padding:'padding',gap:'gap',background:'background',color:'color',border:'border',borderRadius:'border-radius',boxShadow:'box-shadow',opacity:'opacity',zIndex:'z-index',textAlign:'text-align',alignItems:'align-items',justifyContent:'justify-content',flexDirection:'flex-direction',gridTemplateColumns:'grid-template-columns',transform:'transform',overflow:'overflow',objectFit:'object-fit',objectPosition:'object-position',fontFamily:'font-family',fontSize:'font-size',fontWeight:'font-weight',lineHeight:'line-height',letterSpacing:'letter-spacing',textTransform:'text-transform'};
 return Object.entries(map).filter(([k])=>{const v=cfg[k as keyof CMSDesignElementConfig];return v!==undefined&&v!==''}).map(([k,p])=>p+':'+esc(String(cfg[k as keyof CMSDesignElementConfig]))+' !important').join(';');
};

export const CMSDesignControls:React.FC=()=>{
 const {siteContent,updateSiteContent,showToast}=useShop();
 const theme=siteContent.theme||({primaryColor:'#c5a059',accentColor:'#059669',fontFamily:'plus_jakarta',borderRadius:'xl',headerStyle:'modern'} as any);
 const [selected,setSelected]=useState<string>(ELEMENTS[0].id); const [device,setDevice]=useState<Device>('desktop');
 const [selector,setSelector]=useState(''); const [draft,setDraft]=useState<Record<string,CMSDesignElementConfig>>({...((theme as any).designElements||{})});
 const cfg=draft[selected]||{}; const deviceCfg:any=device==='desktop'?cfg:(cfg as any)[device]||{};
 const setField=(key:keyof CMSDesignElementConfig,value:string|boolean)=>setDraft(prev=>({...prev,[selected]:{...(prev[selected]||{}),[key]:value}}));
 const setDeviceField=(key:keyof CMSDesignElementConfig,value:string)=>{if(device==='desktop')setField(key,value);else setDraft(prev=>({...prev,[selected]:{...(prev[selected]||{}),[device]:{...((prev[selected] as any)?.[device]||{}),[key]:value}}}));};
 const reset=()=>setDraft(prev=>{const n={...prev};delete n[selected];return n;});
 const save=async()=>{try{await updateSiteContent({...siteContent,theme:{...theme,designElements:draft}});showToast('Universal design controls saved.','success')}catch(e){console.error(e);showToast('Could not save design controls.','error')}};
 const groups=Array.from(new Set(ELEMENTS.map(e=>e.group)));
 return <section className='space-y-5'>
  <div className='rounded-3xl bg-white border border-slate-200 p-5 shadow-sm'><div className='flex flex-col lg:flex-row lg:items-center justify-between gap-4'><div><div className='flex items-center gap-2'><Palette className='w-5 h-5 text-indigo-600'/><h2 className='text-xl font-black'>Universal Design & Element Control</h2></div><p className='text-sm text-slate-500 mt-1 max-w-4xl'>Control layout, spacing, sizing, colors, typography, positioning, visibility and interaction states for every registered storefront area. Desktop, tablet and mobile settings are independent.</p></div><div className='flex items-center gap-2'><button type='button' onClick={()=>setDevice('desktop')} className={'p-2 rounded-lg '+(device==='desktop'?'bg-slate-900 text-white':'bg-slate-100')}><Monitor className='w-4 h-4'/></button><button type='button' onClick={()=>setDevice('tablet')} className={'p-2 rounded-lg '+(device==='tablet'?'bg-slate-900 text-white':'bg-slate-100')}><Tablet className='w-4 h-4'/></button><button type='button' onClick={()=>setDevice('mobile')} className={'p-2 rounded-lg '+(device==='mobile'?'bg-slate-900 text-white':'bg-slate-100')}><Smartphone className='w-4 h-4'/></button><button type='button' onClick={save} className='px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-black flex items-center gap-2'><Save className='w-4 h-4'/>Save</button></div></div></div>
  <div className='grid grid-cols-1 xl:grid-cols-[260px_minmax(0,1fr)] gap-5'><aside className='rounded-3xl bg-white border border-slate-200 p-3 h-fit xl:sticky xl:top-24'>{groups.map(g=><div key={g} className='mb-4'><div className='px-2 py-1 text-[10px] uppercase tracking-widest font-bold text-slate-400'>{g}</div>{ELEMENTS.filter(e=>e.group===g).map(e=>{const on=draft[e.id]?.enabled!==false;return <button key={e.id} type='button' onClick={()=>{setSelected(e.id);setSelector(draft[e.id]?.selector||e.selector)}} className={'w-full text-left px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 '+(selected===e.id?'bg-indigo-50 text-indigo-700':'hover:bg-slate-50 text-slate-700')}><span className={'w-1.5 h-1.5 rounded-full '+(on?'bg-emerald-500':'bg-rose-500')}/>{e.label}</button>})}</div>)}</aside>
   <main className='rounded-3xl bg-white border border-slate-200 p-5'><div className='flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-4'><div><div className='text-[10px] uppercase tracking-widest font-bold text-slate-400'>Element</div><h3 className='text-lg font-black'>{ELEMENTS.find(e=>e.id===selected)?.label}</h3><p className='text-[11px] font-mono text-slate-400 mt-1'>{cfg.selector||ELEMENTS.find(e=>e.id===selected)?.selector}</p></div><div className='flex gap-2'><button type='button' onClick={()=>setField('enabled',!(cfg.enabled!==false))} className={'px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 '+(cfg.enabled!==false?'bg-emerald-50 text-emerald-700':'bg-rose-50 text-rose-700')}>{cfg.enabled!==false?<Eye className='w-4 h-4'/>:<EyeOff className='w-4 h-4'/>}{cfg.enabled!==false?'Visible':'Hidden'}</button><button type='button' onClick={reset} className='px-3 py-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-bold flex items-center gap-2'><RotateCcw className='w-4 h-4'/>Reset</button></div></div>
    <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-4'>{FIELDS.map(([key,label,placeholder])=><label key={String(key)} className='text-xs font-bold text-slate-600'>{label}<input value={String(deviceCfg[key]??'')} onChange={e=>setDeviceField(key,e.target.value)} placeholder={placeholder} className='mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-normal'/></label>)}</div>
    <div className='mt-5 pt-4 border-t border-slate-100'><h4 className='text-sm font-black mb-3'>Hover / interaction design</h4><div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3'>{([['hoverBackground','Hover background'],['hoverColor','Hover text color'],['hoverBorder','Hover border'],['hoverTransform','Hover transform'],['hoverBoxShadow','Hover shadow']] as const).map(([k,l])=><label key={k} className='text-xs font-bold text-slate-600'>{l}<input value={String(deviceCfg[k]??'')} onChange={e=>setDeviceField(k,e.target.value)} className='mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-normal'/></label>)}</div></div>
    <details className='mt-5 pt-4 border-t border-slate-100'><summary className='cursor-pointer text-sm font-black'>Advanced selector / any storefront element</summary><div className='mt-3 space-y-3'><p className='text-xs text-slate-500'>Target an existing ID, class or data attribute when you need a more specific element. This remains inside the storefront and supports the same responsive controls.</p><input value={selector} onChange={e=>setSelector(e.target.value)} onBlur={()=>setField('selector',selector)} placeholder='CSS selector' className='w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono'/></div></details>
   </main></div>
 </section>;
};
export default CMSDesignControls;