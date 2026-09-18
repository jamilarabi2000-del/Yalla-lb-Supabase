import React,{useMemo,useState} from 'react';
import {Store,Search,Eye,EyeOff,Trash2} from 'lucide-react';
import {useShop} from '../../context/ShopContext';

export const SellersView:React.FC=()=>{
  const shop=useShop() as any;
  const sellers=shop.sellers||[];
  const products=shop.products||[];
  const updateSeller=shop.updateSeller|| (async()=>{});
  const toggleSellerActive=shop.toggleSellerActive|| (async()=>{});
  const deleteSeller=shop.deleteSeller|| (async()=>{});
  const showToast=shop.showToast||(()=>{});
  const[q,setQ]=useState('');
  const[selected,setSelected]=useState<Set<string>>(new Set());
  const rows=useMemo(()=>sellers.filter((s:any)=>!q||[s.nameEn,s.nameAr,s.id,s.sellerCode,s.region].filter(Boolean).some(v=>String(v).toLowerCase().includes(q.toLowerCase()))),[sellers,q]);
  const allSelected=rows.length>0&&rows.every((s:any)=>selected.has(s.id));
  const toggle=(id:string)=>setSelected(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n});
  const toggleAll=()=>setSelected(allSelected?new Set():new Set(rows.map((s:any)=>s.id)));
  const bulkActive=async(isActive:boolean)=>{
    if(!selected.size)return;
    await Promise.all([...selected].map(id=>toggleSellerActive(id,isActive)));
    showToast(`${selected.size} seller(s) ${isActive?'unhidden/activated':'hidden/deactivated'} successfully.`,'success');
    setSelected(new Set());
  };
  const bulkDelete=async()=>{
    if(!selected.size)return;
    const rowsToDelete=sellers.filter((s:any)=>selected.has(s.id));
    const dependent=rowsToDelete.filter((s:any)=>products.some((p:any)=>p.sellerId===s.id));
    if(dependent.length){
      showToast(`Cannot delete ${dependent.length} selected seller(s) because products are still linked to them. Deactivate/hide them or reassign the products first.`,'warning');
      return;
    }
    if(!window.confirm(`Delete ${rowsToDelete.length} selected seller(s)? This cannot be undone.`))return;
    await Promise.all(rowsToDelete.map((s:any)=>deleteSeller(s.id)));
    setSelected(new Set());
    showToast(`${rowsToDelete.length} seller(s) deleted.`,'success');
  };
  return <section className="space-y-5">
    <div><h2 className="text-2xl font-black">Sellers</h2><p className="text-sm text-slate-500">Seller identity, ownership and catalog performance.</p></div>
    <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search seller" className="w-full pl-10 pr-4 py-3 rounded-2xl border"/></div>
    <div className="bg-white border rounded-2xl px-3 py-2.5 flex flex-wrap items-center gap-2">
      <button onClick={toggleAll} className="px-3 py-2 rounded-xl bg-slate-100 text-xs font-black">{allSelected?'Clear Selection':`Select All (${rows.length})`}</button>
      {selected.size>0&&<>
        <button onClick={()=>bulkActive(true)} className="px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-black">Unhide / Activate {selected.size}</button>
        <button onClick={()=>bulkActive(false)} className="px-3 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-black">Hide / Deactivate {selected.size}</button>
        <button onClick={bulkDelete} className="px-3 py-2 rounded-xl bg-rose-50 text-rose-700 text-xs font-black">Delete {selected.size}</button>
      </>}
    </div>
    <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{rows.map((s:any)=><article key={s.id} className={`bg-white border rounded-2xl p-5 ${s.isActive===false?'opacity-70':''}`}>
      <div className="flex items-center gap-3"><input type="checkbox" checked={selected.has(s.id)} onChange={()=>toggle(s.id)} className="w-4 h-4 accent-indigo-600"/><div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center"><Store className="w-5 h-5"/></div><div><h3 className="font-black">{s.nameEn}</h3><p className="text-xs text-slate-500">{s.nameAr}</p></div></div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-xs"><div>Region<br/><b>{s.region||'—'}</b></div><div>Products<br/><b>{products.filter((p:any)=>p.sellerId===s.id).length}</b></div><div>Code<br/><b>{s.sellerCode||s.id}</b></div><div>Status<br/><b>{s.isActive===false?'Hidden / Inactive':'Published / Active'}</b></div></div>
      <div className="mt-4 flex justify-end gap-1"><button title={s.isActive===false?'Unhide / Activate':'Hide / Deactivate'} onClick={()=>toggleSellerActive(s.id,s.isActive===false)} className="p-2 rounded-lg hover:bg-slate-100">{s.isActive===false?<Eye/>:<EyeOff/>}</button><button title="Delete seller" onClick={()=>{if(products.some((p:any)=>p.sellerId===s.id)){showToast('This seller has linked products. Reassign them before deleting.','warning');return;} if(window.confirm(`Delete seller "${s.nameEn}"?`))deleteSeller(s.id)}} className="p-2 rounded-lg text-rose-600 hover:bg-rose-50"><Trash2 className="w-4 h-4"/></button></div>
    </article>)}</div>
  </section>
};
export default SellersView;