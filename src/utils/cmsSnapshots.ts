import {SiteContent} from '../types';
import {secureRandomString} from './uuid';
export interface CmsSnapshot{id:string;timestamp:string;author:string;note?:string;changesCount:number;data:SiteContent;isRemote?:boolean}
export interface CmsDiffItem{tab:string;tabLabel:string;path:string;label:string;before:any;after:any;type:'modified'|'added'|'removed'}
const KEY='yalla_cms_history_snapshots_v2';
export const getCmsSnapshots=():CmsSnapshot[]=>{try{const v=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(v)?v:[]}catch{return[]}};
export const saveCmsSnapshot=(data:SiteContent,author='Admin',note?:string,changesCount=1)=>{const s:CmsSnapshot={id:`snap_${Date.now()}_${secureRandomString(5)}`,timestamp:new Date().toISOString(),author,note:note||'CMS update',changesCount,data:JSON.parse(JSON.stringify(data))};try{localStorage.setItem(KEY,JSON.stringify([s,...getCmsSnapshots()].slice(0,20)))}catch{}return s};
export const saveCmsSnapshotRemote=async(_s:CmsSnapshot)=>false;
export const getCmsSnapshotsRemote=async()=>null;
export const pruneCmsSnapshotsRemote=async()=>{};
export const deleteCmsSnapshot=(id:string)=>{const next=getCmsSnapshots().filter(s=>s.id!==id);try{localStorage.setItem(KEY,JSON.stringify(next))}catch{}return next};
export const clearAllCmsSnapshots=()=>{try{localStorage.removeItem(KEY)}catch{}};
const labels:Record<string,string>={visibility:'Section Visibility',navbar:'Navbar & Header',home:'Home Page',productsPage:'Catalog Page',productDetailPage:'Product Detail',checkoutPage:'Checkout',accountPage:'Account',newsSection:'News',footer:'Footer',customBlocks:'Custom Blocks',seo:'SEO',theme:'Theme'};
export const computeCmsDiff=(original:Partial<SiteContent>={},current:Partial<SiteContent>={}):CmsDiffItem[]=>{const out:CmsDiffItem[]=[];const walk=(a:any,b:any,tab:string,path='')=>{for(const k of new Set([...Object.keys(a||{}),...Object.keys(b||{})])){const av=a?.[k],bv=b?.[k],p=path?`${path}.${k}`:k;if(av&&bv&&typeof av==='object'&&typeof bv==='object'&&!Array.isArray(av)&&!Array.isArray(bv))walk(av,bv,tab,p);else if(JSON.stringify(av)!==JSON.stringify(bv))out.push({tab,tabLabel:labels[tab]||tab,path:p,label:k,before:av,after:bv,type:av===undefined?'added':bv===undefined?'removed':'modified'});}};for(const k of new Set([...Object.keys(original),...Object.keys(current)]))walk((original as any)[k],(current as any)[k],k);return out};
export const computeCmsDiffs=computeCmsDiff;
