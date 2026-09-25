import React from 'react';
import { User, Package, BookmarkCheck, Sliders, Apple, Chrome } from 'lucide-react';

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
    showAppleAuth?: boolean;
    showGoogleAuth?: boolean;
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
      <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-5">
        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <User className="w-5 h-5 text-indigo-600" />
          <span>Patron Account Header & Introduction</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
              Account Main Heading (English)
            </label>
            <input
              type="text"
              value={accountData.title || ''}
              onChange={(e) => onChangeField('title', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-indigo-600 mb-1.5" dir="rtl">
              عنوان صفحة الحساب (عربي)
            </label>
            <input
              type="text"
              dir="rtl"
              value={accountData.titleArabic || ''}
              onChange={(e) => onChangeField('titleArabic', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
              Account Subtitle (English)
            </label>
            <textarea
              rows={2}
              value={accountData.subtitle || ''}
              onChange={(e) => onChangeField('subtitle', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none leading-relaxed"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-indigo-600 mb-1.5" dir="rtl">
              وصف صفحة الحساب (عربي)
            </label>
            <textarea
              rows={2}
              dir="rtl"
              value={accountData.subtitleArabic || ''}
              onChange={(e) => onChangeField('subtitleArabic', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none leading-relaxed"
            />
          </div>
        </div>
      </div>

      {/* Account Navigation Tabs */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-5">
        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <Sliders className="w-5 h-5 text-purple-400" />
          <span>Account Sub-Navigation Tab Labels</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5 flex items-center gap-1">
              <Package className="w-3.5 h-3.5 text-blue-400" />
              <span>Orders Tab Label (English)</span>
            </label>
            <input
              type="text"
              value={accountData.ordersTabLabel || ''}
              onChange={(e) => onChangeField('ordersTabLabel', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-indigo-600 mb-1.5" dir="rtl">
              تسمية تبويب الطلبات (عربي)
            </label>
            <input
              type="text"
              dir="rtl"
              value={accountData.ordersTabLabelArabic || ''}
              onChange={(e) => onChangeField('ordersTabLabelArabic', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5 flex items-center gap-1">
              <User className="w-3.5 h-3.5 text-emerald-400" />
              <span>Profile Tab Label (English)</span>
            </label>
            <input
              type="text"
              value={accountData.profileTabLabel || ''}
              onChange={(e) => onChangeField('profileTabLabel', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-indigo-600 mb-1.5" dir="rtl">
              تسمية تبويب الملف الشخصي (عربي)
            </label>
            <input
              type="text"
              dir="rtl"
              value={accountData.profileTabLabelArabic || ''}
              onChange={(e) => onChangeField('profileTabLabelArabic', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5 flex items-center gap-1">
              <BookmarkCheck className="w-3.5 h-3.5 text-pink-400" />
              <span>Wishlist Tab Label (English)</span>
            </label>
            <input
              type="text"
              value={accountData.wishlistTabLabel || ''}
              onChange={(e) => onChangeField('wishlistTabLabel', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-indigo-600 mb-1.5" dir="rtl">
              تسمية تبويب المفضلة (عربي)
            </label>
            <input
              type="text"
              dir="rtl"
              value={accountData.wishlistTabLabelArabic || ''}
              onChange={(e) => onChangeField('wishlistTabLabelArabic', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-5">
        <div>
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Sliders className="w-5 h-5 text-indigo-600" />
            <span>Login / Sign-Up Authentication Methods</span>
          </h3>
          <p className="text-xs text-slate-500 mt-1">Customers and sellers always sign in with their password and then a code emailed to them; Forgot password emails a code to choose a new one. Choose which other ways they can see: Google and Apple sign in without the password and code.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            { key: 'showAppleAuth', label: 'Apple', icon: Apple, description: 'Continue with Apple', needs: 'Also switch Apple on in Supabase → Authentication → Providers.' },
            { key: 'showGoogleAuth', label: 'Google', icon: Chrome, description: 'Continue with Google', needs: 'Also switch Google on in Supabase → Authentication → Providers, or the button fails.' },
          ].map(({ key, label, icon: Icon, description, needs }) => {
            const enabled = accountData[key as 'showAppleAuth' | 'showGoogleAuth'] !== false;
            return (
              <div key={key} className={`rounded-2xl border p-4 ${enabled ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-slate-50 opacity-75'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div><div className="flex items-center gap-2"><Icon className="w-4 h-4 text-slate-700" /><span className="text-sm font-bold text-slate-900">{label}</span></div><p className="text-[11px] text-slate-500 mt-1">{description}</p></div>
                  <button type="button" role="switch" aria-checked={enabled} aria-label={`${label} authentication visibility`} onClick={() => onChangeField(key, !enabled as any)} className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors cursor-pointer ${enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                    <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition ${enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>
                <p className="text-[10px] text-slate-500 mt-2">{needs}</p>
                <div className={`mt-3 text-[10px] font-bold uppercase tracking-wider ${enabled ? 'text-emerald-700' : 'text-slate-500'}`}>{enabled ? 'Visible to customers' : 'Hidden from customers'}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
