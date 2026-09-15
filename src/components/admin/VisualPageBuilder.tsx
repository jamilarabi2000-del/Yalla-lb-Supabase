import React, { useMemo, useRef, useState } from 'react';
import {
  AlignCenter, AlignLeft, AlignRight, Bold, ChevronDown, ChevronUp,
  Copy, Eye, EyeOff, GripVertical, Heading1, Heading2, Image as ImageIcon,
  Italic, Link, Maximize2, Minimize2, MoveDown, MoveUp, Plus, Save,
  Sparkles, Strikethrough, Trash2, Type, Underline, X
} from 'lucide-react';
import { useShop } from '../../context/ShopContext';
import { CMSCustomBlock } from '../../types';

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
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={sync}
        dangerouslySetInnerHTML={{ __html: value || '<p>Start writing your content…</p>' }}
        className="min-h-[180px] p-4 outline-none prose prose-sm max-w-none"
      />
    </div>
  );
}

function PreviewBlock({ block }: { block: CMSCustomBlock }) {
  const bg = block.bgStyle === 'light' ? 'bg-white text-slate-900 border-slate-200'
    : block.bgStyle === 'glass' ? 'bg-slate-900/80 text-white border-white/10 backdrop-blur'
    : block.bgStyle === 'emerald_gradient' ? 'bg-gradient-to-r from-emerald-950 via-teal-950 to-slate-950 text-white border-emerald-500/20'
    : block.bgStyle === 'gold_gradient' ? 'bg-gradient-to-r from-amber-950 via-[#1f190e] to-slate-950 text-white border-amber-500/20'
    : 'bg-slate-950 text-white border-slate-800';

  return (
    <div className={`relative rounded-2xl border overflow-hidden p-6 ${bg}`} style={{ backgroundColor: block.customBgColor || undefined, color: block.customTextColor || undefined }}>
      {block.imageUrl && <img src={block.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-15 pointer-events-none" />}
      <div className="relative z-10">
        {block.badge && <div className="text-[10px] font-bold uppercase tracking-widest opacity-70 mb-2">{block.badge}</div>}
        <h3 className="text-xl font-black">{block.title || 'Untitled block'}</h3>
        {block.subtitle && <p className="mt-1 opacity-75 text-sm">{block.subtitle}</p>}
        {block.content && <div className="mt-4 text-sm leading-6 opacity-90" dangerouslySetInnerHTML={{ __html: block.content }} />}
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

  const visible = useMemo(() => draft
    .filter(b => b.targetPage === page && b.position === position)
    .sort((a, b) => (a.order || 0) - (b.order || 0)), [draft, page, position]);

  const selected = draft.find(b => b.id === selectedId) || null;

  const updateBlock = (id: string, patch: Partial<CMSCustomBlock>) => {
    setDraft(prev => prev.map(b => b.id === id ? { ...b, ...patch } : b));
  };

  const addBlock = () => {
    const block: CMSCustomBlock = {
      id: newId(),
      title: 'New Section',
      subtitle: 'Add a supporting headline',
      content: '<p>Click here to start writing rich content.</p>',
      badge: 'NEW SECTION',
      buttonText: '',
      buttonUrl: '',
      imageUrl: '',
      bgStyle: 'light',
      targetPage: page,
      position,
      isPublished: false,
      order: visible.length + 1,
    };
    setDraft(prev => [...prev, block]);
    setSelectedId(block.id);
    setCollapsed(prev => ({ ...prev, [block.id]: false }));
  };

  const duplicate = (block: CMSCustomBlock) => {
    const copy = { ...block, id: newId(), title: `${block.title} Copy`, isPublished: false, order: visible.length + 1 };
    setDraft(prev => [...prev, copy]);
    setSelectedId(copy.id);
  };

  const remove = (id: string) => {
    setDraft(prev => normalizeBlocks(prev.filter(b => b.id !== id)));
    if (selectedId === id) setSelectedId(null);
  };

  const move = (id: string, direction: -1 | 1) => {
    setDraft(prev => {
      const list = prev.filter(b => b.targetPage === page && b.position === position).sort((a, b) => (a.order || 0) - (b.order || 0));
      const index = list.findIndex(b => b.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= list.length) return prev;
      [list[index], list[target]] = [list[target], list[index]];
      const orders = new Map(list.map((b, i) => [b.id, i + 1]));
      return prev.map(b => orders.has(b.id) ? { ...b, order: orders.get(b.id)! } : b);
    });
  };

  const drop = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    setDraft(prev => {
      const list = prev.filter(b => b.targetPage === page && b.position === position).sort((a, b) => (a.order || 0) - (b.order || 0));
      const from = list.findIndex(b => b.id === dragId);
      const to = list.findIndex(b => b.id === targetId);
      if (from < 0 || to < 0) return prev;
      const [item] = list.splice(from, 1);
      list.splice(to, 0, item);
      const orders = new Map(list.map((b, i) => [b.id, i + 1]));
      return prev.map(b => orders.has(b.id) ? { ...b, order: orders.get(b.id)! } : b);
    });
    setDragId(null);
  };

  const save = async () => {
    setIsSaving(true);
    try {
      const normalized = normalizeBlocks([...draft]);
      await updateSiteContent({ ...siteContent, customBlocks: normalized });
      setDraft(normalized);
      showToast('Visual Builder changes saved to the storefront CMS.', 'success');
    } catch (error) {
      console.error('[VisualPageBuilder] save failed', error);
      showToast('Could not save the visual layout. Please try again.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="space-y-5">
      <div className="rounded-3xl bg-white border border-slate-200 p-5 shadow-sm">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500" />
              <h2 className="text-2xl font-black">Visual Storefront Builder</h2>
              <span className="px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-bold">LIVE PREVIEW</span>
            </div>
            <p className="text-sm text-slate-500 mt-1 max-w-3xl">A WordPress-style visual editor for Yalla sections. Drag sections, collapse them, edit copy like a document, preview before publishing, and keep the existing commerce components protected.</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setPreview(v => !v)} className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 ${preview ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}><Eye className="w-4 h-4" />{preview ? 'Preview On' : 'Preview Off'}</button>
            <button type="button" onClick={save} disabled={isSaving} className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-black flex items-center gap-2 disabled:opacity-50"><Save className="w-4 h-4" />{isSaving ? 'Saving…' : 'Save Changes'}</button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[260px_minmax(0,1fr)_360px] gap-5">
        <aside className="bg-slate-950 text-white rounded-3xl p-4 h-fit xl:sticky xl:top-24">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">Pages</div>
          <div className="space-y-1">{PAGES.map(item => <button key={item.id} type="button" onClick={() => setPage(item.id)} className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-bold ${page === item.id ? 'bg-white text-slate-950' : 'text-slate-300 hover:bg-white/10'}`}>{item.label}</button>)}</div>
          <div className="border-t border-white/10 my-4" />
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">Insertion Point</div>
          <div className="space-y-1">{POSITIONS.map(item => <button key={item.id} type="button" onClick={() => setPosition(item.id)} className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-bold ${position === item.id ? 'bg-amber-500 text-slate-950' : 'text-slate-300 hover:bg-white/10'}`}>{item.label}</button>)}</div>
          <button type="button" onClick={addBlock} className="w-full mt-5 px-3 py-3 rounded-xl bg-white text-slate-950 text-xs font-black flex items-center justify-center gap-2"><Plus className="w-4 h-4" />Add Section</button>
        </aside>

        <main className="space-y-3">
          <div className="flex items-center justify-between px-1"><div><div className="text-xs font-bold text-slate-400 uppercase tracking-widest">{PAGES.find(p => p.id === page)?.label} / {position}</div><div className="text-lg font-black">Section hierarchy</div></div><div className="text-xs text-slate-400">{visible.length} section{visible.length === 1 ? '' : 's'}</div></div>
          {visible.length === 0 && <div className="min-h-[300px] rounded-3xl border-2 border-dashed border-slate-200 bg-white flex flex-col items-center justify-center text-center p-8"><Layers className="w-10 h-10 text-slate-300 mb-3" /><h3 className="font-black text-slate-700">Empty insertion point</h3><p className="text-sm text-slate-400 max-w-sm mt-1">Add a section here. You can later drag it between other sections or move it to another page/position.</p><button type="button" onClick={addBlock} className="mt-4 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold"><Plus className="w-4 h-4 inline mr-1" />Add section</button></div>}
          {visible.map((block, index) => {
            const isCollapsed = collapsed[block.id] ?? false;
            return <div key={block.id} draggable onDragStart={() => setDragId(block.id)} onDragOver={e => e.preventDefault()} onDrop={() => drop(block.id)} className={`bg-white rounded-2xl border ${selectedId === block.id ? 'border-amber-400 ring-2 ring-amber-100' : 'border-slate-200'} shadow-sm`}>
              <div className="flex items-center gap-2 p-3 border-b border-slate-100">
                <span className="cursor-grab text-slate-400" title="Drag to reorder"><GripVertical className="w-5 h-5" /></span>
                <span className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-xs font-black">{index + 1}</span>
                <button type="button" onClick={() => { setSelectedId(block.id); setCollapsed(p => ({ ...p, [block.id]: !isCollapsed })); }} className="flex-1 text-left min-w-0"><div className="font-bold truncate">{block.title || 'Untitled section'}</div><div className="text-[10px] text-slate-400">{block.isPublished ? 'Published' : 'Draft'} · {block.targetPage} · {block.position}</div></button>
                <button type="button" onClick={() => updateBlock(block.id, { isPublished: !block.isPublished })} title={block.isPublished ? 'Hide' : 'Publish'} className="p-2 rounded-lg hover:bg-slate-100">{block.isPublished ? <Eye className="w-4 h-4 text-emerald-600" /> : <EyeOff className="w-4 h-4 text-slate-400" />}</button>
                <button type="button" onClick={() => move(block.id, -1)} className="p-2 rounded-lg hover:bg-slate-100"><MoveUp className="w-4 h-4" /></button>
                <button type="button" onClick={() => move(block.id, 1)} className="p-2 rounded-lg hover:bg-slate-100"><MoveDown className="w-4 h-4" /></button>
                <button type="button" onClick={() => setCollapsed(p => ({ ...p, [block.id]: !isCollapsed }))} className="p-2 rounded-lg hover:bg-slate-100">{isCollapsed ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}</button>
                <button type="button" onClick={() => duplicate(block)} className="p-2 rounded-lg hover:bg-slate-100"><Copy className="w-4 h-4" /></button>
                <button type="button" onClick={() => remove(block.id)} className="p-2 rounded-lg hover:bg-rose-50 text-rose-600"><Trash2 className="w-4 h-4" /></button>
              </div>
              {!isCollapsed && <div className="p-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="text-xs font-bold text-slate-500">Page<select value={block.targetPage} onChange={e => updateBlock(block.id, { targetPage: e.target.value as BuilderPage })} className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200"><option value="home">Home</option><option value="products">Catalog</option><option value="product_detail">Product Detail</option><option value="checkout">Checkout</option><option value="account">Account</option><option value="all">All Pages</option></select></label>
                  <label className="text-xs font-bold text-slate-500">Location<select value={block.position} onChange={e => updateBlock(block.id, { position: e.target.value as BuilderPosition })} className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200"><option value="top">Top</option><option value="middle">Middle</option><option value="bottom">Bottom</option></select></label>
                </div>
                <input value={block.badge || ''} onChange={e => updateBlock(block.id, { badge: e.target.value })} placeholder="Small label / badge" className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
                <input value={block.title} onChange={e => updateBlock(block.id, { title: e.target.value })} placeholder="Section heading" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-lg font-bold" />
                <input value={block.subtitle || ''} onChange={e => updateBlock(block.id, { subtitle: e.target.value })} placeholder="Supporting heading" className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
                <RichTextEditor value={block.content} onChange={value => updateBlock(block.id, { content: value })} />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input value={block.buttonText || ''} onChange={e => updateBlock(block.id, { buttonText: e.target.value })} placeholder="Button text" className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
                  <input value={block.buttonUrl || ''} onChange={e => updateBlock(block.id, { buttonUrl: e.target.value })} placeholder="Button URL" className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-mono" />
                  <input value={block.imageUrl || ''} onChange={e => updateBlock(block.id, { imageUrl: e.target.value })} placeholder="Background image URL" className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-mono md:col-span-2" />
                  <select value={block.bgStyle} onChange={e => updateBlock(block.id, { bgStyle: e.target.value as CMSCustomBlock['bgStyle'] })} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"><option value="light">Light</option><option value="dark">Dark</option><option value="gold_gradient">Gold Gradient</option><option value="emerald_gradient">Emerald Gradient</option><option value="glass">Glass</option><option value="custom_image">Image</option></select>
                  <input type="color" value={block.customBgColor || '#ffffff'} onChange={e => updateBlock(block.id, { customBgColor: e.target.value })} className="w-full h-10 rounded-xl border border-slate-200" title="Custom background color" />
                </div>
              </div>}
            </div>;
          })}
        </main>

        {preview && <aside className="bg-slate-100 rounded-3xl p-4 h-fit xl:sticky xl:top-24">
          <div className="flex items-center justify-between mb-3"><div><div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Storefront</div><div className="font-black">Live preview</div></div><MonitorIcon /></div>
          <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden shadow-sm">
            <div className="h-8 bg-slate-950 flex items-center gap-1 px-3"><span className="w-2 h-2 rounded-full bg-rose-400" /><span className="w-2 h-2 rounded-full bg-amber-400" /><span className="w-2 h-2 rounded-full bg-emerald-400" /><div className="ml-3 h-4 rounded bg-white/10 flex-1" /></div>
            <div className="p-3 space-y-3 max-h-[680px] overflow-y-auto">{visible.filter(b => b.isPublished || b.id === selectedId).map(block => <PreviewBlock key={block.id} block={block} />)}</div>
          </div>
          <p className="text-[10px] text-slate-400 mt-3">Preview reflects the selected page/location and current draft. Save publishes the builder state to the existing CMS.</p>
        </aside>}
      </div>
    </section>
  );
};

function MonitorIcon() {
  return <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-white border border-slate-200 text-slate-600"><Eye className="w-4 h-4" /></span>;
}
