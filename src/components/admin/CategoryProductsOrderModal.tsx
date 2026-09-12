import React, { useState, useEffect } from 'react';
import { Product, CategoryItem } from '../../types';
import { useShop } from '../../context/ShopContext';
import { useDialog } from '../../hooks/useDialog';
import { 
  X, 
  ArrowUp, 
  ArrowDown, 
  ChevronsDown, 
  Sparkles, 
  Star,
  Eye, 
  EyeOff, 
  Save, 
  Search, 
  Check,
  Zap,
  Hash
} from 'lucide-react';

interface CategoryProductsOrderModalProps {
  category: CategoryItem;
  isOpen: boolean;
  onClose: () => void;
}

export const CategoryProductsOrderModal: React.FC<CategoryProductsOrderModalProps> = ({
  category,
  isOpen,
  onClose
}) => {
  const { products, reorderProducts, updateProduct, formatPrice, showToast } = useShop();
  
  const [orderedItems, setOrderedItems] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [lastMovedId, setLastMovedId] = useState<string | null>(null);

  const { containerRef: modalRef } = useDialog({
    isOpen,
    onClose
  });

  // Initialize and sort products for this category
  useEffect(() => {
    if (!isOpen || !category) return;

    const catProds = products.filter(p => p.category === category.id);
    
    // Sort by existing displayOrder if available, or maintain index
    const sorted = [...catProds].sort((a, b) => {
      const orderA = a.displayOrder ?? 9999;
      const orderB = b.displayOrder ?? 9999;
      return orderA - orderB;
    });

    setOrderedItems(sorted);
    setHasChanges(false);
    setSearchQuery('');
    setLastMovedId(null);
  }, [isOpen, category, products]);

  if (!isOpen) return null;

  // Move product up or down by step or to extreme
  const handleMove = (index: number, direction: 'up' | 'down' | 'top' | 'bottom') => {
    let targetIdx = index;
    if (direction === 'up') targetIdx = index - 1;
    if (direction === 'down') targetIdx = index + 1;
    if (direction === 'top') targetIdx = 0;
    if (direction === 'bottom') targetIdx = orderedItems.length - 1;

    if (targetIdx < 0 || targetIdx >= orderedItems.length || targetIdx === index) return;

    const newItems = [...orderedItems];
    const item = newItems.splice(index, 1)[0];
    newItems.splice(targetIdx, 0, item);

    setOrderedItems(newItems);
    setHasChanges(true);
    setLastMovedId(item.id);

    if (direction === 'top') {
      showToast(`⚡ Moved "${item.name}" directly to Rank #1 (Top of ${category.nameEn})! Click Save to apply.`, 'success');
    } else if (direction === 'bottom') {
      showToast(`Moved "${item.name}" to the end (Rank #${newItems.length})`, 'info');
    }
  };

  // Direct rank positioning (e.g. user enters "1" to move item from 1000 to rank 1 instantly)
  const handleSetRank = (currentIndex: number, newRankStr: string) => {
    const newRank = parseInt(newRankStr, 10);
    if (isNaN(newRank) || newRank < 1 || newRank > orderedItems.length) {
      showToast(`Please enter a valid rank between 1 and ${orderedItems.length}`, 'warning');
      return;
    }
    
    const targetIdx = newRank - 1;
    if (targetIdx === currentIndex) return;

    const newItems = [...orderedItems];
    const item = newItems.splice(currentIndex, 1)[0];
    newItems.splice(targetIdx, 0, item);

    setOrderedItems(newItems);
    setHasChanges(true);
    setLastMovedId(item.id);
    showToast(`🎯 Positioned "${item.name}" directly to Rank #${newRank}! Click Save to apply.`, 'success');
  };

  // Quick toggle featured status
  const handleToggleFeatured = async (product: Product, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await updateProduct(product.id, { isFeatured: !product.isFeatured });
      setOrderedItems(prev => prev.map(p => p.id === product.id ? { ...p, isFeatured: !p.isFeatured } : p));
      showToast(`Product "${product.name}" ${!product.isFeatured ? 'marked as Featured' : 'unmarked from Featured'}`);
    } catch {
      showToast('Could not update featured status', 'warning');
    }
  };

  // Quick toggle publish status
  const handleTogglePublish = async (product: Product, e: React.MouseEvent) => {
    e.stopPropagation();
    const nextState = product.isPublished === false;
    try {
      await updateProduct(product.id, { isPublished: nextState });
      setOrderedItems(prev => prev.map(p => p.id === product.id ? { ...p, isPublished: nextState } : p));
      showToast(`Product "${product.name}" ${nextState ? 'published to store' : 'hidden from store'}`);
    } catch {
      showToast('Could not update visibility', 'warning');
    }
  };

  // Save changes to database and local store
  const handleSaveOrder = async () => {
    if (orderedItems.length === 0) return;
    setIsSaving(true);
    try {
      await reorderProducts(orderedItems);
      setHasChanges(false);
      showToast(`Saved product order for "${category.nameEn}" successfully!`, 'success');
      onClose();
    } catch (err: any) {
      showToast('Could not save product order. Please try again.', 'warning');
    } finally {
      setIsSaving(false);
    }
  };

  // Filter items based on search query
  const displayedItems = searchQuery.trim()
    ? orderedItems.filter(p => 
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.arabicName && p.arabicName.includes(searchQuery)) ||
        (p.sellerItemCode && p.sellerItemCode.toLowerCase().includes(searchQuery.toLowerCase())) ||
        p.id.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : orderedItems;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="category-order-modal-title"
        className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-5xl h-[92vh] max-h-[850px] flex flex-col overflow-hidden"
      >
        
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-xs border border-white/15 text-2xl flex items-center justify-center shadow-xs">
              {category.icon || '📦'}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 id="category-order-modal-title" className="text-base sm:text-lg font-bold text-white">
                  Order Products: {category.nameEn}
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
                  {orderedItems.length} {orderedItems.length === 1 ? 'Product' : 'Products'}
                </span>
              </div>
              <p className="text-xs text-slate-300 font-serif truncate mt-0.5">
                {category.nameAr} • Click <span className="text-amber-300 font-bold font-sans">⚡ Make #1</span> or type any number into <span className="text-indigo-200 font-bold font-sans">Move to:</span> to instantly jump from order 1000 to 1 without step-by-step clicking.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all cursor-pointer shrink-0"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar: Search, Jump Solution & Quick Sort Presets */}
        <div className="p-3.5 bg-slate-50 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3 shrink-0">
          {/* Search to instantly find item */}
          <div className="relative min-w-[220px] flex-1 max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by name or code to jump..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-7 py-1.5 bg-white text-xs text-slate-900 placeholder-slate-400 rounded-xl border border-slate-200 focus:outline-none focus:border-[#4f46e5] shadow-2xs"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Product Items List (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-2.5 bg-slate-100/50">
          {displayedItems.length === 0 ? (
            <div className="bg-white p-12 rounded-2xl border border-slate-200/80 text-center space-y-3">
              <div className="w-14 h-14 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto text-xl">
                📦
              </div>
              <h4 className="text-sm font-bold text-slate-800">
                {orderedItems.length === 0 ? 'No products in this category yet' : 'No products match search'}
              </h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {orderedItems.length === 0 
                  ? 'Assign products to this category in the Products Catalog or create new items to organize them here.'
                  : `No items found matching "${searchQuery}". Clear your search to view all items.`}
              </p>
            </div>
          ) : (
            displayedItems.map((prod) => {
              // Find index in main ordered list
              const actualIndex = orderedItems.findIndex(p => p.id === prod.id);
              const rank = actualIndex + 1;
              const isFirst = actualIndex === 0;
              const isLast = actualIndex === orderedItems.length - 1;
              const isPublished = prod.isPublished !== false;
              const isJustMoved = lastMovedId === prod.id;

              return (
                <div
                  key={prod.id}
                  className={`bg-white rounded-2xl border p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs transition-all hover:shadow-xs ${
                    isJustMoved ? 'ring-2 ring-indigo-500 bg-indigo-50/20' : ''
                  } ${
                    !isPublished ? 'opacity-70 bg-slate-50/80 border-dashed border-slate-300' : 'border-slate-200/90'
                  }`}
                >
                  {/* Left: Position Rank & Fast Move Controls */}
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Rank Badge */}
                    <div className="flex flex-col items-center justify-center">
                      <div className={`w-9 h-9 rounded-xl font-mono font-black text-xs flex items-center justify-center shadow-xs ${
                        isFirst ? 'bg-amber-500 text-white ring-2 ring-amber-300' : 'bg-slate-900 text-white'
                      }`}>
                        #{rank}
                      </div>
                      <span className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">Rank</span>
                    </div>

                    {/* Step Controls (Up/Down) */}
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => handleMove(actualIndex, 'up')}
                        disabled={isFirst}
                        title="Move Up 1 spot"
                        className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-[#4f46e5] flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-all active:scale-95"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleMove(actualIndex, 'down')}
                        disabled={isLast}
                        title="Move Down 1 spot"
                        className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-[#4f46e5] flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-all active:scale-95"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* One-Click Instant Jump to #1 (Top) Button */}
                    <button
                      onClick={() => handleMove(actualIndex, 'top')}
                      disabled={isFirst}
                      title="Instantly jump this item to Rank #1 (Top of Category)"
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl font-black text-xs transition-all cursor-pointer shadow-xs ${
                        isFirst 
                          ? 'bg-amber-100 text-amber-800 opacity-60 cursor-default' 
                          : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white hover:scale-105 active:scale-95'
                      }`}
                    >
                      <Zap className="w-3.5 h-3.5 fill-current" />
                      <span>{isFirst ? 'Top #1' : 'Make #1'}</span>
                    </button>

                    {/* Jump to Bottom */}
                    <button
                      onClick={() => handleMove(actualIndex, 'bottom')}
                      disabled={isLast}
                      title="Jump to Bottom (Last item)"
                      className="hidden md:flex w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer transition-all"
                    >
                      <ChevronsDown className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Middle: Product Thumbnail & Details */}
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    <div className="w-14 h-14 rounded-xl overflow-hidden bg-slate-50 border border-slate-200 shrink-0 relative flex items-center justify-center p-0.5">
                      <img 
                        src={prod.image} 
                        alt={prod.name} 
                        className="w-full h-full object-contain"
                        referrerPolicy="no-referrer"
                      />
                      {prod.isFeatured && (
                        <div className="absolute top-1 left-1 w-4 h-4 rounded-full bg-amber-500 text-white flex items-center justify-center shadow-xs">
                          <Star className="w-2.5 h-2.5 fill-white" />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                          {prod.name}
                        </h4>
                        {prod.arabicName && (
                          <span className="text-xs text-[#c5a059] font-serif font-bold truncate">
                            {prod.arabicName}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-[11px] text-slate-500 flex-wrap">
                        <span className="font-semibold text-slate-700">{prod.artisan}</span>
                        <span>•</span>
                        <span className="font-bold text-slate-900">{formatPrice(prod.priceUSD)}</span>
                        <span>•</span>
                        <span className={`font-semibold ${prod.stock > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {prod.stock > 0 ? `${prod.stock} in stock` : 'Out of stock'}
                        </span>
                        {prod.sellerItemCode && (
                          <span className="font-mono text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                            {prod.sellerItemCode}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Direct Position Jump Box + Quick Actions */}
                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center flex-wrap">
                    {/* Move to specific rank input with Go button */}
                    <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200 text-xs">
                      <span className="text-[10px] text-slate-400 font-bold pl-1 flex items-center gap-0.5">
                        <Hash className="w-3 h-3 text-indigo-500" />
                        <span>Move to:</span>
                      </span>
                      <input
                        type="number"
                        min="1"
                        max={orderedItems.length}
                        defaultValue={rank}
                        key={rank}
                        id={`rank-input-${prod.id}`}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleSetRank(actualIndex, (e.target as HTMLInputElement).value);
                          }
                        }}
                        className="w-12 text-center font-mono font-bold bg-white border border-slate-300 rounded-lg px-1 py-1 text-xs focus:outline-none focus:border-indigo-500"
                        title={`Type target rank (1 to ${orderedItems.length}) and press Enter`}
                      />
                      <button
                        onClick={() => {
                          const input = document.getElementById(`rank-input-${prod.id}`) as HTMLInputElement;
                          if (input) handleSetRank(actualIndex, input.value);
                        }}
                        className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[10px] font-bold cursor-pointer transition-colors"
                        title="Apply target position immediately"
                      >
                        Go
                      </button>
                    </div>

                    {/* Featured Toggle */}
                    <button
                      onClick={(e) => handleToggleFeatured(prod, e)}
                      title={prod.isFeatured ? 'Featured Product (Click to unmark)' : 'Mark as Featured Product'}
                      className={`p-2 rounded-xl transition-all cursor-pointer ${
                        prod.isFeatured 
                          ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' 
                          : 'bg-slate-100 text-slate-400 hover:text-amber-600 hover:bg-amber-50'
                      }`}
                    >
                      <Star className={`w-4 h-4 ${prod.isFeatured ? 'fill-amber-500 text-amber-500' : ''}`} />
                    </button>

                    {/* Visibility Toggle */}
                    <button
                      onClick={(e) => handleTogglePublish(prod, e)}
                      title={isPublished ? 'Live in Store (Click to hide)' : 'Hidden from Store (Click to publish)'}
                      className={`p-2 rounded-xl transition-all cursor-pointer ${
                        isPublished 
                          ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' 
                          : 'bg-rose-50 text-rose-600 hover:bg-rose-100'
                      }`}
                    >
                      {isPublished ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-white border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            {hasChanges ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200 animate-pulse">
                <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                <span>Unsaved sequence changes</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium text-slate-500 bg-slate-100">
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>Current sequence in sync</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveOrder}
              disabled={isSaving || orderedItems.length === 0}
              className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-[#4f46e5] to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Saving Order...' : 'Save Product Order'}</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
