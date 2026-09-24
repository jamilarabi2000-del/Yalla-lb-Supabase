import React, { useEffect, useState } from 'react';
import { LogOut, MapPin } from 'lucide-react';
import { useShop } from '../context/ShopContext';
import { useDialog } from '../hooks/useDialog';
import { supabaseUserDataService } from '../services/supabaseUserDataService';
import { CITY_REGION_MAX_LENGTH, cityRegionProblem } from '../lib/signupDetails';

/**
 * City / Region is required on every shopper's account. Whoever signs in
 * without one saved -- by Google, a phone code, the sign-in tab's emailed
 * code, or an account from before the rule -- is asked for it here, and the
 * only ways on are saving it or signing out. The saved profile decides, not
 * the browser's cached checkout details. It stays off the checkout, which asks
 * for the city itself and saves it with the order, and never shows for the
 * administrator or a seller.
 */
export const CityRegionPrompt: React.FC = () => {
  const { authUser, isLoadingAuth, isAdminUser, isSellerUser, activeTab, user, updateUser, signOutUser, language, showToast } = useShop();
  const ar = language === 'ar';
  const [missing, setMissing] = useState(false);
  const [city, setCity] = useState('');
  const [saving, setSaving] = useState(false);
  const uid = authUser?.uid;
  const eligible = Boolean(uid) && !isLoadingAuth && !isAdminUser && !isSellerUser;

  useEffect(() => {
    if (!eligible || !uid) {
      setMissing(false);
      return;
    }
    let cancelled = false;
    supabaseUserDataService.fetchProfile(uid).then(
      profile => {
        if (cancelled) return;
        const saved = String(profile?.defaultCity ?? '').trim();
        setMissing(!saved);
        if (!saved) setCity(current => current || user.defaultCity || '');
      },
      () => {
        // No answer is not a missing city; ask again on the next change.
      },
    );
    return () => {
      cancelled = true;
    };
  }, [eligible, uid, user.defaultCity]);

  const open = missing && activeTab !== 'checkout';
  // Required: Escape does not dismiss it. Saving or signing out does.
  const { containerRef } = useDialog({ isOpen: open, onClose: () => {} });

  if (!open) return null;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = cityRegionProblem(city, language);
    if (problem) {
      showToast(problem, 'warning');
      return;
    }
    setSaving(true);
    try {
      await updateUser({ defaultCity: city.trim() });
      setMissing(false);
      showToast(ar ? 'تم حفظ المدينة / المنطقة.' : 'City / Region saved.', 'success');
    } catch {
      // updateUser has already said what went wrong.
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div
        ref={containerRef}
        id="city-region-prompt"
        role="dialog"
        aria-modal="true"
        aria-labelledby="city-region-prompt-title"
        aria-describedby="city-region-prompt-text"
        className="bg-white rounded-xl shadow-2xl border border-[#E5E5E5] max-w-md w-full p-6"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-[#B89753]/10 text-[#8F7137] flex items-center justify-center shrink-0">
            <MapPin className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <h2 id="city-region-prompt-title" className="font-serif font-bold text-[#171717] text-base">
              {ar ? 'أضف مدينتك / منطقتك' : 'Add your City / Region'}
            </h2>
            <p id="city-region-prompt-text" className="text-xs text-[#737373]">
              {ar ? 'نحتاجها لتوصيل طلباتك. يمكنك تغييرها لاحقاً من حسابك.' : 'We need it to deliver your orders. You can change it later in your account.'}
            </p>
          </div>
        </div>
        <form onSubmit={save} className="space-y-4">
          <div>
            <label htmlFor="city-region-prompt-input" className="block text-[11px] font-bold uppercase tracking-wider text-[#737373] mb-1">
              {ar ? 'المدينة / المنطقة *' : 'City / Region *'}
            </label>
            <input
              id="city-region-prompt-input"
              type="text"
              value={city}
              onChange={e => setCity(e.target.value)}
              placeholder="e.g. Achrafieh, Beirut"
              maxLength={CITY_REGION_MAX_LENGTH}
              autoComplete="address-level2"
              required
              className="w-full px-4 py-2.5 bg-[#F8F8F6] text-[#171717] text-sm rounded-lg border border-[#E5E5E5] focus:outline-none focus:border-[#B89753] focus:bg-white"
            />
          </div>
          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={() => { void signOutUser(); }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-[#737373] hover:text-[#171717] cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{ar ? 'تسجيل الخروج' : 'Sign out'}</span>
            </button>
            <button
              type="submit"
              id="city-region-prompt-save"
              disabled={saving}
              className="px-5 py-2 rounded-lg bg-[#171717] hover:bg-black text-white text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50"
            >
              {saving ? (ar ? 'جارٍ الحفظ…' : 'Saving…') : (ar ? 'حفظ' : 'Save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
