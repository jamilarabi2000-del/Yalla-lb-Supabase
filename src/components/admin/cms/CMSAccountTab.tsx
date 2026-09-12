import React from 'react';
import { User, Package, BookmarkCheck, Sliders } from 'lucide-react';

interface CMSAccountTabProps {
  accountData: {
    title: string;
    titleArabic?: string;
    subtitle: string;
    subtitleArabic?: string;
    ordersTabLabel: string;
    ordersTabLabelArabic?: string;
    profileTabLabel: string;
    profileTabLabelArabic?: string;
    wishlistTabLabel: string;
    wishlistTabLabelArabic?: string;
  };
  onChangeField: (field: string, value: string) => void;
}

export const CMSAccountTab: React.FC<CMSAccountTabProps> = ({
  accountData = {
    title: 'Patron Account & Preferences',
    titleArabic: 'حسابي وتفضيلاتي',
    subtitle: 'Manage delivery addresses, track courier dispatches, and review saved wishlist items.',
    subtitleArabic: 'إدارة العناوين، تتبع الشحنات، ومراجعة قائمة المنتجات المفضلة لديك.',
    ordersTabLabel: 'Order History & Tracking',
    ordersTabLabelArabic: 'سجل الطلبات والتتبع',
    profileTabLabel: 'Profile & Delivery Details',
    profileTabLabelArabic: 'البيانات الشخصية وعنوان التوصيل',
    wishlistTabLabel: 'Saved Wishlist',
    wishlistTabLabelArabic: 'قائمة المفضلة'
  },
  onChangeField,
}) => {
  return (
    <div className="space-y-6">
      {/* Account Page Headings */}
      <div className="bg-[#121222] border border-white/10 rounded-3xl p-6 space-y-5">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <User className="w-5 h-5 text-amber-400" />
          <span>Patron Account Header & Introduction</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
              Account Main Heading (English)
            </label>
            <input
              type="text"
              value={accountData.title || ''}
              onChange={(e) => onChangeField('title', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-amber-400 mb-1.5" dir="rtl">
              عنوان صفحة الحساب (عربي)
            </label>
            <input
              type="text"
              dir="rtl"
              value={accountData.titleArabic || ''}
              onChange={(e) => onChangeField('titleArabic', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
              Account Subtitle (English)
            </label>
            <textarea
              rows={2}
              value={accountData.subtitle || ''}
              onChange={(e) => onChangeField('subtitle', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none leading-relaxed"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-amber-400 mb-1.5" dir="rtl">
              وصف صفحة الحساب (عربي)
            </label>
            <textarea
              rows={2}
              dir="rtl"
              value={accountData.subtitleArabic || ''}
              onChange={(e) => onChangeField('subtitleArabic', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none leading-relaxed"
            />
          </div>
        </div>
      </div>

      {/* Account Navigation Tabs */}
      <div className="bg-[#121222] border border-white/10 rounded-3xl p-6 space-y-5">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <Sliders className="w-5 h-5 text-purple-400" />
          <span>Account Sub-Navigation Tab Labels</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5 flex items-center gap-1">
              <Package className="w-3.5 h-3.5 text-blue-400" />
              <span>Orders Tab Label (English)</span>
            </label>
            <input
              type="text"
              value={accountData.ordersTabLabel || ''}
              onChange={(e) => onChangeField('ordersTabLabel', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-amber-400 mb-1.5" dir="rtl">
              تسمية تبويب الطلبات (عربي)
            </label>
            <input
              type="text"
              dir="rtl"
              value={accountData.ordersTabLabelArabic || ''}
              onChange={(e) => onChangeField('ordersTabLabelArabic', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5 flex items-center gap-1">
              <User className="w-3.5 h-3.5 text-emerald-400" />
              <span>Profile Tab Label (English)</span>
            </label>
            <input
              type="text"
              value={accountData.profileTabLabel || ''}
              onChange={(e) => onChangeField('profileTabLabel', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-amber-400 mb-1.5" dir="rtl">
              تسمية تبويب الملف الشخصي (عربي)
            </label>
            <input
              type="text"
              dir="rtl"
              value={accountData.profileTabLabelArabic || ''}
              onChange={(e) => onChangeField('profileTabLabelArabic', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5 flex items-center gap-1">
              <BookmarkCheck className="w-3.5 h-3.5 text-pink-400" />
              <span>Wishlist Tab Label (English)</span>
            </label>
            <input
              type="text"
              value={accountData.wishlistTabLabel || ''}
              onChange={(e) => onChangeField('wishlistTabLabel', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-amber-400 mb-1.5" dir="rtl">
              تسمية تبويب المفضلة (عربي)
            </label>
            <input
              type="text"
              dir="rtl"
              value={accountData.wishlistTabLabelArabic || ''}
              onChange={(e) => onChangeField('wishlistTabLabelArabic', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
