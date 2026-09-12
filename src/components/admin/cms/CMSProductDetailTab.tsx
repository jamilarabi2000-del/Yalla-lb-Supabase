import React from 'react';
import { Search, ShieldCheck, Truck, RotateCcw, MessageCircle, BookOpen, Layers } from 'lucide-react';

interface CMSProductDetailTabProps {
  detailData: {
    inquiryWhatsAppNumber: string;
    inquiryText: string;
    inquiryTextArabic?: string;
    authenticityGuaranteeText: string;
    authenticityGuaranteeTextArabic?: string;
    freeDeliveryBadgeText: string;
    freeDeliveryBadgeTextArabic?: string;
    returnsPolicyText: string;
    returnsPolicyTextArabic?: string;
    craftStoryTitle: string;
    craftStoryTitleArabic?: string;
    relatedItemsTitle: string;
    relatedItemsTitleArabic?: string;
  };
  onChangeField: (field: string, value: string) => void;
}

export const CMSProductDetailTab: React.FC<CMSProductDetailTabProps> = ({
  detailData = {
    inquiryWhatsAppNumber: '96170889234',
    inquiryText: 'Inquire on WhatsApp with Master Artisan',
    inquiryTextArabic: 'تواصل عبر واتساب للاستفسار والطلب',
    authenticityGuaranteeText: '100% Guaranteed Authentic Lebanese Terroir & Workshop Handcrafted',
    authenticityGuaranteeTextArabic: 'ضمان 100% للأصالة والحرفية اللبنانية',
    freeDeliveryBadgeText: 'Fast Courier Dispatched from Lebanon',
    freeDeliveryBadgeTextArabic: 'توصيل سريع وموثوق في جميع أنحاء لبنان',
    returnsPolicyText: 'Hassle-free 7-day inspection return guarantee for artisanal crafts.',
    returnsPolicyTextArabic: 'ضمان الاستبدال أو الإرجاع خلال 7 أيام بكل سهولة',
    craftStoryTitle: 'Artisan Workshop & Provenance',
    craftStoryTitleArabic: 'قصة الحرفة ومصدر الإنتاج',
    relatedItemsTitle: 'More from this Heritage Collection',
    relatedItemsTitleArabic: 'منتجات ذات صلة من هذه التشكيلة'
  },
  onChangeField,
}) => {
  return (
    <div className="space-y-6">
      {/* WhatsApp Inquiry Direct Concierge */}
      <div className="bg-[#121222] border border-white/10 rounded-3xl p-6 space-y-5">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-emerald-400" />
          <span>Direct Master Artisan WhatsApp Inquiries</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
              WhatsApp Contact Number (digits with country code)
            </label>
            <input
              type="text"
              value={detailData.inquiryWhatsAppNumber || ''}
              onChange={(e) => onChangeField('inquiryWhatsAppNumber', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none font-mono"
              placeholder="e.g. 96170889234"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
              Inquiry CTA Button Text (English)
            </label>
            <input
              type="text"
              value={detailData.inquiryText || ''}
              onChange={(e) => onChangeField('inquiryText', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-amber-400 mb-1.5" dir="rtl">
              نص زر التواصل عبر واتساب (عربي)
            </label>
            <input
              type="text"
              dir="rtl"
              value={detailData.inquiryTextArabic || ''}
              onChange={(e) => onChangeField('inquiryTextArabic', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Trust & Guarantee Badges */}
      <div className="bg-[#121222] border border-white/10 rounded-3xl p-6 space-y-5">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-amber-400" />
          <span>Authenticity & Logistics Assurance Badges</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
              <span>Authenticity Guarantee Text (English)</span>
            </label>
            <input
              type="text"
              value={detailData.authenticityGuaranteeText || ''}
              onChange={(e) => onChangeField('authenticityGuaranteeText', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-amber-400 mb-1.5" dir="rtl">
              نص ضمان الأصالة (عربي)
            </label>
            <input
              type="text"
              dir="rtl"
              value={detailData.authenticityGuaranteeTextArabic || ''}
              onChange={(e) => onChangeField('authenticityGuaranteeTextArabic', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5 flex items-center gap-1">
              <Truck className="w-3.5 h-3.5 text-blue-400" />
              <span>Courier Delivery Badge Text (English)</span>
            </label>
            <input
              type="text"
              value={detailData.freeDeliveryBadgeText || ''}
              onChange={(e) => onChangeField('freeDeliveryBadgeText', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-amber-400 mb-1.5" dir="rtl">
              نص شارة التوصيل والشحن (عربي)
            </label>
            <input
              type="text"
              dir="rtl"
              value={detailData.freeDeliveryBadgeTextArabic || ''}
              onChange={(e) => onChangeField('freeDeliveryBadgeTextArabic', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5 flex items-center gap-1">
              <RotateCcw className="w-3.5 h-3.5 text-purple-400" />
              <span>Inspection & Returns Guarantee Text (English)</span>
            </label>
            <input
              type="text"
              value={detailData.returnsPolicyText || ''}
              onChange={(e) => onChangeField('returnsPolicyText', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-amber-400 mb-1.5" dir="rtl">
              نص سياسة الفحص والاسترجاع (عربي)
            </label>
            <input
              type="text"
              dir="rtl"
              value={detailData.returnsPolicyTextArabic || ''}
              onChange={(e) => onChangeField('returnsPolicyTextArabic', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Narrative & Related Headings */}
      <div className="bg-[#121222] border border-white/10 rounded-3xl p-6 space-y-5">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-indigo-400" />
          <span>Product Narrative & Related Headings</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
              Craftsmanship Story Heading (English)
            </label>
            <input
              type="text"
              value={detailData.craftStoryTitle || ''}
              onChange={(e) => onChangeField('craftStoryTitle', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-amber-400 mb-1.5" dir="rtl">
              عنوان قصة الحرفة والمصدر (عربي)
            </label>
            <input
              type="text"
              dir="rtl"
              value={detailData.craftStoryTitleArabic || ''}
              onChange={(e) => onChangeField('craftStoryTitleArabic', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-pink-400" />
              <span>Related Products Section Title (English)</span>
            </label>
            <input
              type="text"
              value={detailData.relatedItemsTitle || ''}
              onChange={(e) => onChangeField('relatedItemsTitle', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-amber-400 mb-1.5" dir="rtl">
              عنوان المنتجات ذات الصلة (عربي)
            </label>
            <input
              type="text"
              dir="rtl"
              value={detailData.relatedItemsTitleArabic || ''}
              onChange={(e) => onChangeField('relatedItemsTitleArabic', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
