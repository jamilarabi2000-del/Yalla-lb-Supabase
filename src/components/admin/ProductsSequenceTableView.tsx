import React from 'react';
import { Product } from '../../types';
import { ProductOrderRankWidget } from './ProductOrderRankWidget';
import { Eye, EyeOff, Edit3, DollarSign, Trash2, Store, Star, Layers, ShieldCheck, ArrowUpDown } from 'lucide-react';

interface ProductsSequenceTableViewProps {
  products: Product[];
  allProductsCount: number;
  selectedProductIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onMoveProduct: (productId: string, direction: 'up' | 'down' | 'top' | 'bottom') => void;
  onSetProductRank: (productId: string, newRankStr: string) => void;
  lastMovedProductId: string | null;
  onTogglePublish: (id: string) => Promise<void>;
  onEditProduct: (product: Product) => void;
  onQuickPriceStock: (product: Product) => void;
  onDeleteProduct: (product: Product) => Promise<void>;
  formatPrice: (price: number) => string;
}

export const ProductsSequenceTableView: React.FC<ProductsSequenceTableViewProps> = ({
  products,
  allProductsCount,
  selectedProductIds,
  onToggleSelect,
  onMoveProduct,
  onSetProductRank,
  lastMovedProductId,
  onTogglePublish,
  onEditProduct,
  onQuickPriceStock,
  onDeleteProduct,
  formatPrice
}) => {
  return (
    <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              <th className="py-3.5 pl-5 pr-3 w-10">
                <span className="sr-only">Select</span>
              </th>
              <th className="py-3.5 px-3 min-w-[280px]">
                <div className="flex items-center gap-1.5 text-indigo-700">
                  <ArrowUpDown className="w-3.5 h-3.5" />
                  <span>Rank & Position Sequence</span>
                </div>
              </th>
              <th className="py-3.5 px-3 min-w-[240px]">Product Info</th>
              <th className="py-3.5 px-3">Seller / Artisan</th>
              <th className="py-3.5 px-3">Category</th>
              <th className="py-3.5 px-3 text-right">Price</th>
              <th className="py-3.5 px-3 text-center">Stock</th>
              <th className="py-3.5 px-3 text-center">Status</th>
              <th className="py-3.5 pr-5 pl-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs">
            {products.map((prod, index) => {
              const currentRank = prod.displayOrder ?? (index + 1);
              const isPublished = prod.isPublished !== false;
              const isSelected = selectedProductIds.has(prod.id);
              const isRecentlyMoved = lastMovedProductId === prod.id;
              const sellerName = prod.artisan || prod.seller || 'Artisanal Guild';

              return (
                <tr 
                  key={prod.id}
                  className={`transition-colors hover:bg-indigo-50/20 ${
                    isSelected ? 'bg-indigo-50/40' : ''
                  } ${isRecentlyMoved ? 'bg-amber-50/60 ring-1 ring-amber-300' : ''}`}
                >
                  {/* Select Checkbox */}
                  <td className="py-3 pl-5 pr-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleSelect(prod.id)}
                      className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                    />
                  </td>

                  {/* Rank & Reorder Controls */}
                  <td className="py-3 px-3">
                    <ProductOrderRankWidget
                      productId={prod.id}
                      productName={prod.name}
                      currentRank={currentRank}
                      totalProducts={allProductsCount}
                      onMove={onMoveProduct}
                      onSetRank={onSetProductRank}
                      isRecentlyMoved={isRecentlyMoved}
                    />
                  </td>

                  {/* Product Details */}
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-slate-50 overflow-hidden shrink-0 border border-slate-200 flex items-center justify-center p-0.5">
                        <img 
                          src={prod.image} 
                          alt={prod.name} 
                          className="w-full h-full object-contain" 
                        />
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-bold text-slate-900 line-clamp-1 text-xs">{prod.name}</h4>
                        {prod.arabicName && (
                          <p className="text-[11px] text-[#c5a059] font-serif font-bold line-clamp-1">{prod.arabicName}</p>
                        )}
                        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400 font-mono">
                          <span>ID: {prod.id}</span>
                          {prod.sellerItemCode && (
                            <span className="text-indigo-600 font-bold">Code: {prod.sellerItemCode}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Seller */}
                  <td className="py-3 px-3">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-100 text-slate-800 font-bold text-[11px]">
                      <Store className="w-3 h-3 text-indigo-500 shrink-0" />
                      <span className="truncate max-w-[140px]">{sellerName}</span>
                    </div>
                  </td>

                  {/* Category */}
                  <td className="py-3 px-3">
                    <span className="inline-block px-2.5 py-1 rounded-xl bg-indigo-50 text-indigo-700 font-bold text-[11px] border border-indigo-100/60">
                      {prod.category}
                    </span>
                  </td>

                  {/* Price */}
                  <td className="py-3 px-3 text-right">
                    <span className="font-black text-slate-900 text-xs">
                      {formatPrice(prod.priceUSD)}
                    </span>
                  </td>

                  {/* Stock */}
                  <td className="py-3 px-3 text-center">
                    <span className={`inline-block px-2.5 py-0.5 rounded-lg text-[11px] font-bold ${
                      prod.stock > 10 
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                        : prod.stock > 0 
                          ? 'bg-amber-50 text-amber-700 border border-amber-200' 
                          : 'bg-rose-50 text-rose-700 border border-rose-200'
                    }`}>
                      {prod.stock} in stock
                    </span>
                  </td>

                  {/* Status */}
                  <td className="py-3 px-3 text-center">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                      isPublished 
                        ? 'bg-emerald-100 text-emerald-800' 
                        : 'bg-rose-100 text-rose-800'
                    }`}>
                      {isPublished ? 'Live' : 'Hidden'}
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="py-3 pr-5 pl-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => onTogglePublish(prod.id)}
                        className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                          isPublished 
                            ? 'text-slate-400 hover:text-amber-600 hover:bg-amber-50' 
                            : 'text-amber-600 bg-amber-50 hover:bg-amber-100'
                        }`}
                        title={isPublished ? "Hide from catalog" : "Unhide product"}
                      >
                        {isPublished ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>

                      <button
                        type="button"
                        onClick={() => onEditProduct(prod)}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                        title="Full Edit"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => onQuickPriceStock(prod)}
                        className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                        title="Quick Price & Stock"
                      >
                        <DollarSign className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => onDeleteProduct(prod)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        title="Delete Product"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
