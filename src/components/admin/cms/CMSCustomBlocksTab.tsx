import React, { useState } from 'react';
import { CMSCustomBlock } from '../../../types';
import { 
  Blocks, 
  Plus, 
  Trash2, 
  Edit3, 
  Eye, 
  EyeOff, 
  LayoutTemplate, 
  Sparkles, 
  Check, 
  X,
  ExternalLink,
  Layers
} from 'lucide-react';

interface CMSCustomBlocksTabProps {
  customBlocks: CMSCustomBlock[];
  onChange: (blocks: CMSCustomBlock[]) => void;
}

export const CMSCustomBlocksTab: React.FC<CMSCustomBlocksTabProps> = ({
  customBlocks = [],
  onChange,
}) => {
  const [editingBlock, setEditingBlock] = useState<CMSCustomBlock | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const [formState, setFormState] = useState<CMSCustomBlock>({
    id: '',
    title: '',
    subtitle: '',
    content: '',
    badge: 'SPECIAL ANNOUNCEMENT',
    buttonText: 'Explore Now',
    buttonUrl: '/products',
    imageUrl: '',
    bgStyle: 'gold_gradient',
    targetPage: 'home',
    position: 'top',
    isPublished: true,
    order: 1
  });

  const handleStartCreate = () => {
    setFormState({
      id: `block-${Date.now()}`,
      title: '',
      subtitle: '',
      content: '',
      badge: 'FEATURED SPOTLIGHT',
      buttonText: 'Learn More',
      buttonUrl: '/products',
      imageUrl: '',
      bgStyle: 'gold_gradient',
      targetPage: 'home',
      position: 'middle',
      isPublished: true,
      order: customBlocks.length + 1
    });
    setIsCreating(true);
    setEditingBlock(null);
  };

  const handleStartEdit = (block: CMSCustomBlock) => {
    setFormState({ ...block });
    setEditingBlock(block);
    setIsCreating(false);
  };

  const handleSaveBlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formState.title.trim()) return;

    let updatedList: CMSCustomBlock[];
    if (editingBlock) {
      updatedList = customBlocks.map(b => b.id === editingBlock.id ? formState : b);
    } else {
      updatedList = [...customBlocks, formState];
    }

    onChange(updatedList);
    setEditingBlock(null);
    setIsCreating(false);
  };

  const handleDeleteBlock = (id: string) => {
    const updated = customBlocks.filter(b => b.id !== id);
    onChange(updated);
  };

  const handleTogglePublish = (id: string) => {
    const updated = customBlocks.map(b => 
      b.id === id ? { ...b, isPublished: !b.isPublished } : b
    );
    onChange(updated);
  };

  return (
    <div className="space-y-6">
      {/* Header & Overview */}
      <div className="bg-[#121222] border border-white/10 rounded-3xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Blocks className="w-5 h-5 text-amber-400" />
            <span>Storefront Custom Visual Blocks</span>
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Inject custom marketing banners, announcements, or promotional callouts dynamically across any storefront page.
          </p>
        </div>

        {!isCreating && !editingBlock && (
          <button
            type="button"
            onClick={handleStartCreate}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-900 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-md shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Add Custom Block</span>
          </button>
        )}
      </div>

      {/* Block Create / Edit Form */}
      {(isCreating || editingBlock) && (
        <form onSubmit={handleSaveBlock} className="bg-[#121222] border border-amber-500/50 rounded-3xl p-6 space-y-5">
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <h4 className="text-sm font-bold text-amber-400 flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              <span>{editingBlock ? 'Edit Custom Block' : 'Create New Custom Block'}</span>
            </h4>
            <button
              type="button"
              onClick={() => { setIsCreating(false); setEditingBlock(null); }}
              className="p-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Target Page</label>
              <select
                value={formState.targetPage}
                onChange={(e) => setFormState({ ...formState, targetPage: e.target.value as any })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
              >
                <option value="all">Everywhere (All Pages)</option>
                <option value="home">Home Page</option>
                <option value="products">Catalog Page</option>
                <option value="product_detail">Product Detail Page</option>
                <option value="checkout">Checkout Page</option>
                <option value="account">Account Page</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Page Position</label>
              <select
                value={formState.position}
                onChange={(e) => setFormState({ ...formState, position: e.target.value as any })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
              >
                <option value="top">Top (Above content)</option>
                <option value="middle">Middle (Embedded in feed)</option>
                <option value="bottom">Bottom (Before footer)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Visual Theme / Background</label>
              <select
                value={formState.bgStyle}
                onChange={(e) => setFormState({ ...formState, bgStyle: e.target.value as any })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
              >
                <option value="gold_gradient">Levantine Gold Gradient</option>
                <option value="emerald_gradient">Cedars Emerald Gradient</option>
                <option value="dark">Midnight Obsidian Dark</option>
                <option value="light">Warm Ivory Clean Light</option>
                <option value="glass">Frosted Translucent Glass</option>
                <option value="custom_image">Custom Background Image</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Block Title</label>
              <input
                type="text"
                required
                value={formState.title}
                onChange={(e) => setFormState({ ...formState, title: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
                placeholder="e.g. Free Olive Oil Tasting at our Byblos Atelier"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Eyebrow Badge</label>
              <input
                type="text"
                value={formState.badge || ''}
                onChange={(e) => setFormState({ ...formState, badge: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
                placeholder="e.g. LIMITED ATELIER EVENT"
              />
            </div>

            <div className="md:col-span-3">
              <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Subtitle / Supporting Lead</label>
              <input
                type="text"
                value={formState.subtitle || ''}
                onChange={(e) => setFormState({ ...formState, subtitle: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
                placeholder="Supporting description of the promotion or feature"
              />
            </div>

            <div className="md:col-span-3">
              <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Full Content / Narrative Text</label>
              <textarea
                rows={3}
                value={formState.content || ''}
                onChange={(e) => setFormState({ ...formState, content: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none leading-relaxed"
                placeholder="Rich details, terms, artisan workshop notes..."
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1">CTA Button Label (EN)</label>
                <input
                  type="text"
                  value={formState.buttonText || ''}
                  onChange={(e) => setFormState({ ...formState, buttonText: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
                  placeholder="e.g. Reserve Workshop Slot"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1">CTA Button Label (AR)</label>
                <input
                  type="text"
                  value={formState.buttonTextArabic || ''}
                  onChange={(e) => setFormState({ ...formState, buttonTextArabic: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
                  placeholder="مثال: احجز مكانك في الورشة"
                  dir="rtl"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase mb-1">CTA Button URL / Target</label>
              <input
                type="text"
                value={formState.buttonUrl || ''}
                onChange={(e) => setFormState({ ...formState, buttonUrl: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none font-mono"
                placeholder="/products or https://..."
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Image / Asset URL (Optional)</label>
              <input
                type="url"
                value={formState.imageUrl || ''}
                onChange={(e) => setFormState({ ...formState, imageUrl: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none font-mono"
                placeholder="https://images.unsplash.com/..."
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/10">
            <button
              type="button"
              onClick={() => { setIsCreating(false); setEditingBlock(null); }}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-bold transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-900 text-xs font-bold transition-all flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>Save Custom Block</span>
            </button>
          </div>
        </form>
      )}

      {/* Blocks List */}
      {customBlocks.length === 0 ? (
        <div className="bg-[#121222] border border-white/10 rounded-3xl p-12 text-center">
          <Blocks className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h4 className="text-sm font-bold text-slate-300">No Custom Blocks Created Yet</h4>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            Use custom blocks to highlight seasonal announcements, artisan partnerships, or promotional banners anywhere in your store.
          </p>
          <button
            type="button"
            onClick={handleStartCreate}
            className="mt-4 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-900 rounded-xl text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Create First Block</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {customBlocks.map((block) => (
            <div
              key={block.id}
              className={`bg-slate-900 border rounded-2xl p-5 flex flex-col justify-between transition-all ${
                block.isPublished ? 'border-white/10 hover:border-white/20' : 'border-white/5 opacity-60'
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      {block.targetPage}
                    </span>
                    <span className="text-[10px] text-slate-400 bg-slate-950 px-2 py-0.5 rounded-full">
                      {block.position} position
                    </span>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    block.isPublished ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'
                  }`}>
                    {block.isPublished ? 'Active' : 'Disabled'}
                  </span>
                </div>

                {block.badge && (
                  <p className="text-[10px] font-bold tracking-wider uppercase text-amber-400">{block.badge}</p>
                )}

                <h4 className="text-sm font-bold text-white">{block.title}</h4>
                {block.subtitle && <p className="text-xs text-slate-400">{block.subtitle}</p>}
                {block.content && <p className="text-xs text-slate-300/80 line-clamp-2 leading-relaxed">{block.content}</p>}

                {block.buttonText && (
                  <div className="pt-2 flex items-center gap-1.5 text-xs font-bold text-amber-300">
                    <span>{block.buttonText}</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </div>
                )}
              </div>

              <div className="pt-4 mt-4 border-t border-white/10 flex items-center justify-between">
                <span className="text-[10px] font-mono text-slate-500">Theme: {block.bgStyle}</span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleTogglePublish(block.id)}
                    className="p-1.5 rounded-lg bg-slate-850 hover:bg-slate-800 text-slate-300 transition-colors cursor-pointer"
                    title={block.isPublished ? 'Disable' : 'Enable'}
                  >
                    {block.isPublished ? <Eye className="w-3.5 h-3.5 text-emerald-400" /> : <EyeOff className="w-3.5 h-3.5 text-slate-500" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStartEdit(block)}
                    className="p-1.5 rounded-lg bg-slate-850 hover:bg-slate-800 text-amber-400 transition-colors cursor-pointer"
                    title="Edit block"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteBlock(block.id)}
                    className="p-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 transition-colors cursor-pointer"
                    title="Delete block"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
