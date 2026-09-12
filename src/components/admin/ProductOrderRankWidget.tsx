import React, { useState, useEffect } from 'react';
import { ArrowUp, ArrowDown, Zap, Hash, ChevronsUp, ChevronsDown, Star } from 'lucide-react';

interface ProductOrderRankWidgetProps {
  productId: string;
  productName: string;
  currentRank: number;
  totalProducts: number;
  onMove: (productId: string, direction: 'up' | 'down' | 'top' | 'bottom') => void;
  onSetRank: (productId: string, targetRank: string) => void;
  compact?: boolean;
  isRecentlyMoved?: boolean;
}

export const ProductOrderRankWidget: React.FC<ProductOrderRankWidgetProps> = ({
  productId,
  productName,
  currentRank,
  totalProducts,
  onMove,
  onSetRank,
  compact = false,
  isRecentlyMoved = false
}) => {
  const [targetRankInput, setTargetRankInput] = useState<string>('');
  const [isEditingRank, setIsEditingRank] = useState(false);

  useEffect(() => {
    if (!isEditingRank) {
      setTargetRankInput('');
    }
  }, [currentRank, isEditingRank]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!targetRankInput.trim()) return;
    onSetRank(productId, targetRankInput.trim());
    setIsEditingRank(false);
    setTargetRankInput('');
  };

  const isTop = currentRank === 1;
  const isBottom = currentRank === totalProducts;

  if (compact) {
    // Compact widget designed for Product Card in Grid View
    return (
      <div 
        className={`flex flex-col gap-1.5 p-2 rounded-2xl border transition-all ${
          isRecentlyMoved
            ? 'bg-amber-50/80 border-amber-300 ring-2 ring-amber-400 shadow-sm'
            : isTop 
              ? 'bg-gradient-to-r from-amber-50/90 to-yellow-50/90 border-amber-300/80' 
              : 'bg-slate-50/90 border-slate-200/80'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-1">
          {/* Rank Badge */}
          <div className="flex items-center gap-1">
            <span 
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-black tracking-tight ${
                isTop 
                  ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-white shadow-xs' 
                  : 'bg-slate-800 text-white'
              }`}
              title={`Current Rank Sequence: #${currentRank} of ${totalProducts}`}
            >
              {isTop && <Star className="w-3 h-3 fill-white text-white" />}
              <span>#{currentRank}</span>
            </span>
          </div>

          {/* Quick 1-Click "Make #1" Action */}
          {!isTop && (
            <button
              type="button"
              onClick={() => onMove(productId, 'top')}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[10.5px] font-black shadow-2xs transition-all cursor-pointer active:scale-95 animate-pulse"
              title={`Jump "${productName}" directly to Rank #1`}
            >
              <Zap className="w-3 h-3 fill-white" />
              <span>Make #1</span>
            </button>
          )}

          {/* Step Up / Down Controls */}
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              disabled={isTop}
              onClick={() => onMove(productId, 'up')}
              className="p-1 rounded-md text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer disabled:cursor-not-allowed transition-colors"
              title="Move Up 1 Position"
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              disabled={isBottom}
              onClick={() => onMove(productId, 'down')}
              className="p-1 rounded-md text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer disabled:cursor-not-allowed transition-colors"
              title="Move Down 1 Position"
            >
              <ArrowDown className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Direct Rank Jump Input Form */}
        <form onSubmit={handleSubmit} className="flex items-center gap-1.5 pt-1 border-t border-slate-200/60">
          <span className="text-[10px] font-bold text-slate-500 whitespace-nowrap">Move to:</span>
          <div className="relative flex-1">
            <input
              type="number"
              min={1}
              max={totalProducts}
              placeholder={`# (1-${totalProducts})`}
              value={targetRankInput}
              onFocus={() => setIsEditingRank(true)}
              onChange={(e) => setTargetRankInput(e.target.value)}
              className="w-full pl-2 pr-2 py-0.5 text-xs font-mono font-bold text-slate-900 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <button
            type="submit"
            disabled={!targetRankInput.trim()}
            className="px-2 py-0.5 text-[10px] font-bold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed transition-colors"
          >
            Go
          </button>
        </form>
      </div>
    );
  }

  // Full Row Widget for Organize Sequence List View
  return (
    <div 
      className="flex items-center gap-2"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Rank Badge */}
      <span 
        className={`inline-flex items-center justify-center min-w-[48px] px-2.5 py-1 rounded-xl text-xs font-black tracking-tight ${
          isTop 
            ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-white shadow-xs ring-2 ring-amber-300' 
            : 'bg-slate-900 text-white'
        }`}
      >
        {isTop && <Star className="w-3 h-3 fill-white mr-1 shrink-0" />}
        #{currentRank}
      </span>

      {/* 1-Click "Make #1" Action */}
      {!isTop ? (
        <button
          type="button"
          onClick={() => onMove(productId, 'top')}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-black shadow-xs transition-all cursor-pointer active:scale-95 whitespace-nowrap"
          title={`Jump "${productName}" directly to Rank #1`}
        >
          <Zap className="w-3.5 h-3.5 fill-white" />
          <span>Make #1</span>
        </button>
      ) : (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-100 text-amber-800 text-[11px] font-black border border-amber-200 whitespace-nowrap">
          <Star className="w-3 h-3 fill-amber-600 text-amber-600" />
          <span>Top #1</span>
        </span>
      )}

      {/* Step Buttons */}
      <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-xl border border-slate-200">
        <button
          type="button"
          disabled={isTop}
          onClick={() => onMove(productId, 'top')}
          className="p-1 rounded-lg text-slate-600 hover:text-indigo-700 hover:bg-white disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed transition-all"
          title="Jump to very Top (#1)"
        >
          <ChevronsUp className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          disabled={isTop}
          onClick={() => onMove(productId, 'up')}
          className="p-1 rounded-lg text-slate-600 hover:text-indigo-700 hover:bg-white disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed transition-all"
          title="Move Up 1 Position"
        >
          <ArrowUp className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          disabled={isBottom}
          onClick={() => onMove(productId, 'down')}
          className="p-1 rounded-lg text-slate-600 hover:text-indigo-700 hover:bg-white disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed transition-all"
          title="Move Down 1 Position"
        >
          <ArrowDown className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          disabled={isBottom}
          onClick={() => onMove(productId, 'bottom')}
          className="p-1 rounded-lg text-slate-600 hover:text-indigo-700 hover:bg-white disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed transition-all"
          title={`Jump to very Bottom (#${totalProducts})`}
        >
          <ChevronsDown className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Direct Numeric Rank Jump Input */}
      <form onSubmit={handleSubmit} className="flex items-center gap-1">
        <div className="relative">
          <input
            type="number"
            min={1}
            max={totalProducts}
            placeholder="#"
            value={targetRankInput}
            onFocus={() => setIsEditingRank(true)}
            onChange={(e) => setTargetRankInput(e.target.value)}
            className="w-14 px-2 py-1 text-xs font-mono font-bold text-center text-slate-900 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            title={`Type target rank 1-${totalProducts} and click Move`}
          />
        </div>
        <button
          type="submit"
          disabled={!targetRankInput.trim()}
          className="px-2.5 py-1 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed transition-colors whitespace-nowrap"
        >
          Move
        </button>
      </form>
    </div>
  );
};
