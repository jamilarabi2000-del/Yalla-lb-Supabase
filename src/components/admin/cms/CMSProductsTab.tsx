import React from 'react';
import { ShoppingBag, Search, Filter } from 'lucide-react';

interface CMSProductsTabProps {
  productsData: {
    title: string;
    titleArabic?: string;
    subtitle: string;
    subtitleArabic?: string;
    searchPlaceholder: string;
    searchPlaceholderArabic?: string;
    filterAllLabel: string;
    filterAllLabelArabic?: string;
    noProductsText: string;
    noProductsTextArabic?: string;
  };
  onChangeField: (field: string, value: string) => void;
}

export const CMSProductsTab: React.FC<CMSProductsTabProps> = ({
  productsData = {
    title: 'Artisanal Catalog',
    titleArabic: 'دليل المنتجات والحرف',
    subtitle: 'Browse authentic handcrafted goods, Levantine pantry delicacies, traditional copperware, organic olive soap, and heritage textiles.',
    subtitleArabic: 'تصفح أروع المنتجات الحرفية، المونة البلدية، النحاسيات التراثية، صابون الغار، والمستلزمات اليومية.',
    searchPlaceholder: 'Search products, artisans, or origins...',
    searchPlaceholderArabic: 'ابحث عن منتجات، حرفيين، أو بلدات...',
    filterAllLabel: 'All Treasures',
    filterAllLabelArabic: 'جميع المنتجات',
    noProductsText: 'No artisan products found matching your search filters.',
    noProductsTextArabic: 'لم يتم العثور على أي منتج يطابق معايير البحث الخاصة بك.'
  },
  onChangeField,
}) => {
  return (
    <div className="space-y-6">
      {/* Catalog Header & Intro */}
      <div className="bg-[#121222] border border-white/10 rounded-3xl p-6 space-y-5">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <ShoppingBag className="w-5 h-5 text-amber-400" />
          <span>Catalog Page Header & Introduction</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
              Catalog Main Title (English)
            </label>
            <input
              type="text"
              value={productsData.title || ''}
              onChange={(e) => onChangeField('title', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-amber-400 mb-1.5" dir="rtl">
              عنوان صفحة المنتجات (عربي)
            </label>
            <input
              type="text"
              dir="rtl"
              value={productsData.titleArabic || ''}
              onChange={(e) => onChangeField('titleArabic', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
              Catalog Subtitle / Description (English)
            </label>
            <textarea
              rows={3}
              value={productsData.subtitle || ''}
              onChange={(e) => onChangeField('subtitle', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none leading-relaxed"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-amber-400 mb-1.5" dir="rtl">
              وصف دليل المنتجات (عربي)
            </label>
            <textarea
              rows={3}
              dir="rtl"
              value={productsData.subtitleArabic || ''}
              onChange={(e) => onChangeField('subtitleArabic', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none leading-relaxed"
            />
          </div>
        </div>
      </div>

      {/* Catalog Search & Filtering Labels */}
      <div className="bg-[#121222] border border-white/10 rounded-3xl p-6 space-y-5">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <Filter className="w-5 h-5 text-blue-400" />
          <span>Search & Filter Placeholders</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
              Catalog Search Bar Placeholder (English)
            </label>
            <input
              type="text"
              value={productsData.searchPlaceholder || ''}
              onChange={(e) => onChangeField('searchPlaceholder', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-amber-400 mb-1.5" dir="rtl">
              نص البحث التوضيحي للكتالوج (عربي)
            </label>
            <input
              type="text"
              dir="rtl"
              value={productsData.searchPlaceholderArabic || ''}
              onChange={(e) => onChangeField('searchPlaceholderArabic', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
              "All Categories" Filter Tab Label (English)
            </label>
            <input
              type="text"
              value={productsData.filterAllLabel || ''}
              onChange={(e) => onChangeField('filterAllLabel', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-amber-400 mb-1.5" dir="rtl">
              تسمية تبويب "جميع المنتجات" (عربي)
            </label>
            <input
              type="text"
              dir="rtl"
              value={productsData.filterAllLabelArabic || ''}
              onChange={(e) => onChangeField('filterAllLabelArabic', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Empty State / No Products Found Message */}
      <div className="bg-[#121222] border border-white/10 rounded-3xl p-6 space-y-5">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <Search className="w-5 h-5 text-rose-400" />
          <span>Empty Search State Feedback Message</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
              "No Products Found" Message (English)
            </label>
            <textarea
              rows={2}
              value={productsData.noProductsText || ''}
              onChange={(e) => onChangeField('noProductsText', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none leading-relaxed"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-amber-400 mb-1.5" dir="rtl">
              رسالة عدم العثور على نتائج (عربي)
            </label>
            <textarea
              rows={2}
              dir="rtl"
              value={productsData.noProductsTextArabic || ''}
              onChange={(e) => onChangeField('noProductsTextArabic', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none leading-relaxed"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
