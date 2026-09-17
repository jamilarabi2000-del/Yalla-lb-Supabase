import React, { useMemo, useRef, useState } from 'react';
import {
  AlignCenter, AlignLeft, AlignRight, Bold, ChevronDown, ChevronUp,
  Copy, Eye, EyeOff, GripVertical, Heading1, Heading2, Image as ImageIcon,
  Italic, Link, Maximize2, Minimize2, MoveDown, MoveUp, Plus, Save,
  Sparkles, Strikethrough, Trash2, Type, Underline, X
} from 'lucide-react';
import { useShop } from '../../context/ShopContext';
import { CMSCustomBlock } from '../../types';
import { sanitizeRichText } from '../../utils/sanitizeRichText';

 type BuilderPage = CMSCustomBlock['targetPage'];
 type BuilderPosition = CMSCustomBlock['position'];

const PAGES: Array<{ id: BuilderPage; label: string }> = [
  { id: 'home', label: 'Home' },
  { id: 'products', label: 'Catalog' },
  { id: 'product_detail', label: 'Product Detail' },
  { id: 'checkout', label: 'Checkout' },
  { id: 'account', label: 'Account' },
  { id: 'all', label: 'All Pages' },
];

const POSITIONS: Array<{ id: BuilderPosition; label: string }> = [
  { id: 'top', label: 'Top' },
  { id: 'middle', label: 'Middle' },
  { id: 'bottom', label: 'Bottom' },
];

function newId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `block-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeBlocks(blocks: CMSCustomBlock[]) {
  const groups = new Map<string, CMSCustomBlock[]>();
  for (const block of blocks) {
    const key = `${block.targetPage}:${block.position}`;
    const list = groups.get(key) || [];
    list.push(block);
    groups.set(key, list);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => (a.order || 0) - (b.order || 0));
    list.forEach((block, index) => { block.order = index + 1; });
  }
  return blocks;
}

function RichTextEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const command = (name: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(name, false, arg);
    onChange(ref.current?.innerHTML || '');
  };
  const sync = () => onChange(ref.current?.innerHTML || '');
  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex flex-wrap items-center gap-1 p-2 bg-slate-50 border-b border-slate-200">
        <button type="button" onClick={() => command('bold')} title="Bold" className="p-2 rounded-lg hover:bg-white"><Bold className="w-4 h-4" /></button>
        <button type="button" onClick={() => command('italic')} title="Italic" className="p-2 rounded-lg hover:bg-white"><Italic className="w-4 h-4" /></button>
        <button type="button" onClick={() => command('underline')} title="Underline" className="p-2 rounded-lg hover:bg-white"><Underline className="w-4 h-4" /></button>
        <button type="button" onClick={() => command('strikeThrough')} title="Strike" className="p-2 rounded-lg hover:bg-white"><Strikethrough className="w-4 h-4" /></button>
        <span className="w-px h-5 bg-slate-200 mx-1" />
        <button type="button" onClick={() => command('formatBlock', 'h1')} title="Heading 1" className="p-2 rounded-lg hover:bg-white"><Heading1 className="w-4 h-4" /></button>
        <button type="button" onClick={() => command('formatBlock', 'h2')} title="Heading 2" className="p-2 rounded-lg hover:bg-white"><Heading2 className="w-4 h-4" /></button>
        <button type="button" onClick={() => command('formatBlock', 'p')} title="Paragraph" className="p-2 rounded-lg hover:bg-white"><Type className="w-4 h-4" /></button>
        <span className="w-px h-5 bg-slate-200 mx-1" />
        <button type="button" onClick={() => command('justifyLeft')} title="Align left" className="p-2 rounded-lg hover:bg-white"><AlignLeft className="w-4 h-4" /></button>
        <button type="button" onClick={() => command('justifyCenter')} title="Center" className="p-2 rounded-lg hover:bg-white"><AlignCenter className="w-4 h-4" /></button>
        <button type="button" onClick={() => command('justifyRight')} title="Align right" className="p-2 rounded-lg hover:bg-white"><AlignRight className="w-4 h-4" /></button>
        <button type="button" onClick={() => command('insertUnorderedList')} title="Bullets" className="px-2 py-1 rounded-lg hover:bg-white text-xs font-bold">• List</button>
        <button type="button" onClick={() => command('insertOrderedList')} title="Numbered list" className="px-2 py-1 rounded-lg hover:bg-white text-xs font-bold">1. List</button>
        <button type="button" onClick={() => { const url = window.prompt('Link URL'); if (url) command('createLink', url); }} title="Link" className="p-2 rounded-lg hover:bg-white"><Link className="w-4 h-4" /></button>
      </div>
      <div ref={ref} contentEditable suppressContentEditableWarning onInput={sync}
        dangerouslySetInnerHTML={{ __html: sanitizeRichText(value || '<p>Start writing your content…</p>') }}
        className="min-h-[180px] p-4 outline-none prose prose-sm max-w-none" />
    </div>
  );
}

function PreviewBlock({ block }: { block: CMSCustomBlock }) {
  const bg = block.bgStyle === 'light' ? 'bg-white text-slate-900 border-slate-200'
    : block.bgStyle === 'glass' ? 'bg-slate-50 text-slate-900 border-slate-200 backdrop-blur'
    : block.bgStyle === 'emerald_gradient' ? 'bg-gradient-to-r from-emerald-950 via-teal-950 to-slate-950 text-slate-900 border-emerald-500/20'
    : block.bgStyle === 'gold_gradient' ? 'bg-gradient-to-r from-amber-950 via-[#1f190e] to-slate-950 text-slate-900 border-amber-500/20'
    : 'bg-slate-50 text-slate-900 border-slate-800';
  return (
    <div className={`relative rounded-2xl border overflow-hidden p-6 ${bg}`} style={{ backgroundColor: block.customBgColor || undefined, color: block.customTextColor || undefined }}>
      {block.imageUrl && <img src={block.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-15 pointer-events-none" />}
      <div className="relative z-10">
        {block.badge && <div className="text-[10px] font-bold uppercase tracking-widest opacity-70 mb-2">{block.badge}</div>}
        <h3 className="text-xl font-black">{block.title || 'Untitled block'}</h3>
        {block.subtitle && <p className="mt-1 opacity-75 text-sm">{block.subtitle}</p>}
        {block.content && <div className="mt-4 text-sm leading-6 opacity-90" dangerouslySetInnerHTML={{ __html: sanitizeRichText(block.content) }} />}
        {block.buttonText && <button type="button" className="mt-5 px-4 py-2 rounded-xl bg-white/15 border border-white/20 text-xs font-bold">{block.buttonText}</button>}
      </div>
    </div>
  );
}

export const VisualPageBuilder: React.FC = () => {
  const { siteContent, updateSiteContent, showToast } = useShop();
  const [page, setPage] = useState<BuilderPage>('home');
  const [position, setPosition] = useState<BuilderPosition>('top');
  const [draft, setDraft] = useState<CMSCustomBlock[]>([...(siteContent.customBlocks || [])]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [preview, setPreview] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const visible = useMemo(() => draft.filter(b => b.targetPage === page && b.position === position).sort((a, b) => (a.order || 0) - (b.order || 0)), [draft, page, position]);
  const selected = draft.find(b => b.id === selectedId) || null;
  const updateBlock = (id: string, patch: Partial<CMSCustomBlock>) => setDraft(prev => prev.map(b => b.id === id ? { ...b, ...patch } : b));
  const addBlock = () => {
    const block: CMSCustomBlock = { id: newId(), title: 'New Section', subtitle: 'Add a supporting headline', content: '<p>Click here to start writing rich content.</p>', badge: 'NEW SECTION', buttonText: '', buttonUrl: '', imageUrl: '', bgStyle: 'light', targetPage: page, position, isPublished: false, order: visible.length + 1 };
    setDraft(prev => [...prev, block]); setSelectedId(block.id); setCollapsed(prev => ({ ...prev, [block.id]: false }));
  };
  const duplicate = (block: CMSCustomBlock) => { const copy = { ...block, id: newId(), title: `${block.title} Copy`, isPublished: false, order: visible.length + 1 }; setDraft(prev => [...prev, copy]); setSelectedId(copy.id); };
  const remove = (id: string) => { setDraft(prev => normalizeBlocks(prev.filter(b => b.id !== id))); if (selectedId === id) setSelectedId(null); };
  const move = (id: string, direction: -1 | 1) => setDraft(prev => {
    const list = prev.filter(b => b.targetPage === page && b.position === position).sort((a, b) => (a.order || 0) - (b.order || 0));
    const index = list.findIndex(b => b.id === id); const target = index + direction;
    if (index < 0 || target < 0 || target >= list.length) return prev;
    [list[index], list[target]] = [list[target], list[index]];
    const orders = new Map(list.map((b, i) => [b.id, i + 1]));
    return prev.map(b => orders.has(b.id) ? { ...b, order: orders.get(b.id)! } : b);
  });
  const drop = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    setDraft(prev => {
      const list = prev.filter(b => b.targetPage === page && b.position === position).sort((a, b) => (a.order || 0) - (b.order || 0));
      const from = list.findIndex(b => b.id === dragId); const to = list.findIndex(b => b.id === targetId);
      if (from < 0 || to < 0) return prev;
      const [item] = list.splice(from, 1); list.splice(to, 0, item);
      const orders = new Map(list.map((b, i) => [b.id, i + 1]));
      return prev.map(b => orders.has(b.id) ? { ...b, order: orders.get(b.id)! } : b);
    }); setDragId(null);
  };
  const save = async () => {
    setIsSaving(true);
    try { const normalized = normalizeBlocks([...draft]); await updateSiteContent({ ...siteContent, customBlocks: normalized }); setDraft(normalized); showToast('Visual Builder changes saved to the storefront CMS.', 'success'); }
    catch (error) { console.error('[VisualPageBuilder] save failed', error); showToast('Could not save the visual layout. Please try again.', 'error'); }
    finally { setIsSaving(false); }
  };
  return (
    <section className="space-y-5">
      <div className="rounded-3xl bg-white border border-slate-200 p-5 shadow-sm"><div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4"><div><div className="flex items-center gap-2"><Sparkles className="w-5 h-5 text-amber-500" /><h2 className="text-2xl font-black">Visual Storefront Builder</h2><span className="px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-bold">LIVE PREVIEW</span></div><p className="text-sm text-slate-500 mt-1 max-w-3xl">A WordPress-style visual editor for Yalla sections. Drag sections, collapse them, edit copy like a document, preview before publishing, and keep the existing commerce components protected.</p></div><div className="flex items-center gap-2"><button type="button" onClick={() => setPreview(v => !v)} className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 ${preview ? 'bg-slate-50 text-slate-900' : 'bg-slate-100 text-slate-700'}`}><Eye className="w-4 h-4" />{preview ? 'Preview On' : 'Preview Off'}</button><button type="button" onClick={save} disabled={isSaving} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-black flex items-center gap-2 disabled:opacity-50"><Save className="w-4 h-4" />{isSaving ? 'Saving…' : 'Save Changes'}</button></div></div></div>
      <div className="grid grid-cols-1 xl:grid-cols-[260px_minmax(0,1fr)_360px] gap-5">
        <aside className="bg-slate-50 text-slate-900 rounded-3xl p-4 h-fit xl:sticky xl:top-24"><div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">Pages</div><div className="space-y-1">{PAGES.map(item => <button key={item.id} type="button" onClick={() => setPage(item.id)} className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-bold ${page === item.id ? 'bg-white text-slate-950' : 'text-slate-600 hover:bg-white/10'}`}>{item.label}</button>)}</div><div className="border-t border-slate-200 my-4" /><div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">Insertion Point</div><div className="space-y-1">{POSITIONS.map(item => <button key={item.id} type="button" onClick={() => setPosition(item.id)} className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-bold ${position === item.id ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-white/10'}`}>{item.label}</button>)}</div><button type="button" onClick={addBlock} className="w-full mt-5 px-3 py-3 rounded-xl bg-white text-slate-950 text-xs font-black flex items-center justify-center gap-2"><Plus className="w-4 h-4" />Add Section</button></aside>
        <main className="space-y-3"><div className="flex items-center justify-between px-1"><div><div className="text-xs font-bold text-slate-500 uppercase tracking-widest">{PAGES.find(p => p.id === page)?.label} / {position}</div><div className="text-lg font-black">Section hierarchy</div></div><div className="text-xs text-slate-500">{visible.length} section{visible.length === 1 ? '' : 's'}</div></div>{visible.length === 0 && <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500"><Sparkles className="w-8 h-8 mx-auto mb-3" /><p className="font-bold">No custom sections here yet.</p><p className="text-xs mt-1">Add a section to start building this location.</p></div>}{visible.map((block, index) => { const isCollapsed = !!collapsed[block.id]; return <article key={block.id} draggable onDragStart={() => setDragId(block.id)} onDragOver={event => event.preventDefault()} onDrop={() => drop(block.id)} onClick={() => setSelectedId(block.id)} className={`rounded-2xl border bg-white shadow-sm overflow-hidden ${selectedId === block.id ? 'border-amber-400 ring-2 ring-amber-100' : 'border-slate-200'}`}><div className="flex items-center gap-2 p-3 border-b border-slate-100"><GripVertical className="w-4 h-4 text-slate-600 cursor-grab" /><span className="w-6 h-6 rounded-lg bg-slate-100 text-[10px] font-black flex items-center justify-center">{index + 1}</span><div className="min-w-0 flex-1"><div className="font-black truncate">{block.title || 'Untitled block'}</div><div className="text-[10px] text-slate-500">{block.isPublished ? 'Published' : 'Draft'}</div></div><button type="button" onClick={event => { event.stopPropagation(); move(block.id, -1); }} disabled={index === 0} className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30"><MoveUp className="w-4 h-4" /></button><button type="button" onClick={event => { event.stopPropagation(); move(block.id, 1); }} disabled={index === visible.length - 1} className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30"><MoveDown className="w-4 h-4" /></button><button type="button" onClick={event => { event.stopPropagation(); setCollapsed(prev => ({ ...prev, [block.id]: !prev[block.id] })); }} className="p-1.5 rounded-lg hover:bg-slate-100">{isCollapsed ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}</button><button type="button" onClick={event => { event.stopPropagation(); duplicate(block); }} className="p-1.5 rounded-lg hover:bg-slate-100"><Copy className="w-4 h-4" /></button><button type="button" onClick={event => { event.stopPropagation(); updateBlock(block.id, { isPublished: !block.isPublished }); }} className="p-1.5 rounded-lg hover:bg-slate-100">{block.isPublished ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}</button><button type="button" onClick={event => { event.stopPropagation(); remove(block.id); }} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500"><Trash2 className="w-4 h-4" /></button></div>{!isCollapsed && <div className="p-4">{preview ? <PreviewBlock block={block} /> : <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Preview disabled</div>}</div>}</article>; })}</main>
        <aside className="bg-white rounded-3xl border border-slate-200 p-5 h-fit xl:sticky xl:top-24">{!selected ? <div className="text-center py-10 text-slate-500"><Type className="w-8 h-8 mx-auto mb-3" /><p className="font-bold">Select a section</p><p className="text-xs mt-1">Its properties will appear here.</p></div> : <div className="space-y-4"><div className="flex items-center justify-between"><div><div className="text-[10px] uppercase tracking-widest font-bold text-slate-500">Section editor</div><div className="font-black text-lg">{selected.title || 'Untitled'}</div></div><button type="button" onClick={() => setSelectedId(null)} className="p-2 rounded-lg hover:bg-slate-100"><X className="w-4 h-4" /></button></div><label className="block text-xs font-bold text-slate-500">Badge<input value={selected.badge || ''} onChange={e => updateBlock(selected.id, { badge: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" /></label><label className="block text-xs font-bold text-slate-500">Title<input value={selected.title || ''} onChange={e => updateBlock(selected.id, { title: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" /></label><label className="block text-xs font-bold text-slate-500">Subtitle<textarea value={selected.subtitle || ''} onChange={e => updateBlock(selected.id, { subtitle: e.target.value })} rows={3} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" /></label><div><div className="text-xs font-bold text-slate-500 mb-1">Rich content</div><RichTextEditor value={selected.content || ''} onChange={value => updateBlock(selected.id, { content: value })} /></div><label className="block text-xs font-bold text-slate-500">Button text<input value={selected.buttonText || ''} onChange={e => updateBlock(selected.id, { buttonText: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" /></label><label className="block text-xs font-bold text-slate-500">Button URL<input value={selected.buttonUrl || ''} onChange={e => updateBlock(selected.id, { buttonUrl: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" /></label><label className="block text-xs font-bold text-slate-500">Background image URL<input value={selected.imageUrl || ''} onChange={e => updateBlock(selected.id, { imageUrl: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" /></label><label className="block text-xs font-bold text-slate-500">Background style<select value={selected.bgStyle} onChange={e => updateBlock(selected.id, { bgStyle: e.target.value as CMSCustomBlock['bgStyle'] })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"><option value="light">Light</option><option value="dark">Dark</option><option value="glass">Glass</option><option value="emerald_gradient">Emerald Gradient</option><option value="gold_gradient">Gold Gradient</option><option value="custom_image">Image</option></select></label><label className="block text-xs font-bold text-slate-500">Custom background color<input type="color" value={selected.customBgColor || '#ffffff'} onChange={e => updateBlock(selected.id, { customBgColor: e.target.value })} className="mt-1 h-10 w-full rounded-xl border border-slate-200" /></label><label className="block text-xs font-bold text-slate-500">Custom text color<input type="color" value={selected.customTextColor || '#0f172a'} onChange={e => updateBlock(selected.id, { customTextColor: e.target.value })} className="mt-1 h-10 w-full rounded-xl border border-slate-200" /></label><div className="grid grid-cols-2 gap-2"><label className="text-xs font-bold text-slate-500">Page<select value={selected.targetPage} onChange={e => updateBlock(selected.id, { targetPage: e.target.value as BuilderPage })} className="mt-1 w-full rounded-xl border border-slate-200 px-2 py-2"><option value="home">Home</option><option value="products">Catalog</option><option value="product_detail">Product Detail</option><option value="checkout">Checkout</option><option value="account">Account</option><option value="all">All Pages</option></select></label><label className="text-xs font-bold text-slate-500">Position<select value={selected.position} onChange={e => updateBlock(selected.id, { position: e.target.value as BuilderPosition })} className="mt-1 w-full rounded-xl border border-slate-200 px-2 py-2"><option value="top">Top</option><option value="middle">Middle</option><option value="bottom">Bottom</option></select></label></div><button type="button" onClick={save} disabled={isSaving} className="w-full px-4 py-3 rounded-xl bg-slate-50 text-slate-900 text-xs font-black disabled:opacity-50">{isSaving ? 'Saving…' : 'Save Section Changes'}</button></div>}</aside>
      </div>
    </section>
  );
};
