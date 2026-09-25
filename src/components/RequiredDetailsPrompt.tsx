import React, { useEffect, useState } from 'react';
import { LogOut, UserCheck } from 'lucide-react';
import { useShop } from '../context/ShopContext';
import { useDialog } from '../hooks/useDialog';
import { supabaseUserDataService } from '../services/supabaseUserDataService';
import { normalizeLebanesePhone } from '../utils/phoneUtils';
import { LebanonFlag } from './LebanonFlag';
import { CITY_REGION_MAX_LENGTH, cityRegionProblem, emailProblem, phoneProblem } from '../lib/signupDetails';
import type { UserProfile } from '../types';

export type RequiredDetail = 'name' | 'phone' | 'email' | 'city' | 'address' | 'building';

const filled = (value: unknown) => typeof value === 'string' && value.trim() !== '';

/**
 * What a saved profile still lacks of the details the sign-up form requires.
 * An email counts when the profile has one or the account signs in with one.
 */
export function missingRequiredDetails(profile: Partial<UserProfile> | null, signInEmail: string): RequiredDetail[] {
  const missing: RequiredDetail[] = [];
  if (!filled(profile?.firstName) || !filled(profile?.lastName)) missing.push('name');
  if (!normalizeLebanesePhone(profile?.phone).isValid) missing.push('phone');
  if (!filled(profile?.email) && !filled(signInEmail)) missing.push('email');
  if (!filled(profile?.defaultCity)) missing.push('city');
  if (!filled(profile?.defaultAddress)) missing.push('address');
  if (!filled(profile?.defaultBuilding)) missing.push('building');
  return missing;
}

/**
 * Every shopper's account carries what the sign-up form requires: name,
 * phone, email, City / Region, street and building. Whoever signs in without
 * all of it saved -- by Google, a sign-up code opened on another device, or
 * an account from before the rule -- is asked here for what is missing, and
 * the only ways on are saving it or signing out. The saved profile decides,
 * not the browser's cached checkout details. It waits while a sign-up is
 * still saving its details and while a Forgot password sign-in is choosing
 * its new password (NewPasswordPrompt), stays off the checkout, which asks
 * for these itself and saves them with the order, and never shows for the
 * administrator or a seller.
 */
export const RequiredDetailsPrompt: React.FC = () => {
  const {
    authUser, isLoadingAuth, isAdminUser, isSellerUser, isCompletingSignup, passwordRecoveryPending, activeTab, user,
    updateUser, checkPhoneUniqueness, signOutUser, language, showToast,
  } = useShop();
  const ar = language === 'ar';
  const [missing, setMissing] = useState<RequiredDetail[]>([]);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [building, setBuilding] = useState('');
  const [saving, setSaving] = useState(false);
  const uid = authUser?.uid;
  const signInEmail = String(authUser?.email ?? '').trim();
  const eligible = Boolean(uid) && !isLoadingAuth && !isAdminUser && !isSellerUser && !isCompletingSignup && !passwordRecoveryPending;

  useEffect(() => {
    if (!eligible || !uid) {
      setMissing([]);
      return;
    }
    let cancelled = false;
    supabaseUserDataService.fetchProfile(uid).then(
      profile => {
        if (cancelled) return;
        setMissing(missingRequiredDetails(profile, signInEmail));
        // Start from what this browser knows; only saving counts.
        const cachedPhone = normalizeLebanesePhone(user.phone);
        setFirstName(current => current || user.firstName || '');
        setLastName(current => current || user.lastName || '');
        setPhone(current => current || (cachedPhone.isValid ? cachedPhone.cleanDigits : ''));
        setEmail(current => current || user.email || '');
        setCity(current => current || user.defaultCity || '');
        setAddress(current => current || user.defaultAddress || '');
        setBuilding(current => current || user.defaultBuilding || '');
      },
      () => {
        // No answer is not a missing detail; ask again on the next change.
      },
    );
    return () => {
      cancelled = true;
    };
  }, [eligible, uid, signInEmail, user.firstName, user.lastName, user.phone, user.email, user.defaultCity, user.defaultAddress, user.defaultBuilding]);

  const open = missing.length > 0 && activeTab !== 'checkout';
  // Required: Escape does not dismiss it. Saving or signing out does.
  const { containerRef } = useDialog({ isOpen: open, onClose: () => {} });

  if (!open) return null;

  const asks = (detail: RequiredDetail) => missing.includes(detail);

  const problem = (): string | null => {
    if (asks('name') && (!firstName.trim() || !lastName.trim())) {
      return ar ? 'الاسم الأول واسم العائلة مطلوبان.' : 'First name and last name are required.';
    }
    if (asks('phone')) {
      const issue = phoneProblem(phone, language);
      if (issue) return issue;
    }
    if (asks('email')) {
      const issue = emailProblem(email, language);
      if (issue) return issue;
    }
    if (asks('city')) {
      const issue = cityRegionProblem(city, language);
      if (issue) return issue;
    }
    if ((asks('address') && !address.trim()) || (asks('building') && !building.trim())) {
      return ar ? 'الشارع والمبنى مطلوبان.' : 'Street and building are required.';
    }
    return null;
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const issue = problem();
    if (issue) {
      showToast(issue, 'warning');
      return;
    }
    setSaving(true);
    try {
      const updates: Partial<UserProfile> = {};
      if (asks('name')) {
        updates.firstName = firstName.trim();
        updates.lastName = lastName.trim();
        updates.name = `${firstName.trim()} ${lastName.trim()}`;
      }
      if (asks('phone')) {
        const availability = await checkPhoneUniqueness(phone);
        if (!availability.available) {
          showToast(availability.reason || (ar ? 'رقم الهاتف هذا مسجل مسبقاً بحساب آخر.' : 'This phone number is already registered to another account.'), 'warning');
          return;
        }
        updates.phone = `+961 ${phone}`;
      }
      if (asks('email')) updates.email = email.trim();
      if (asks('city')) updates.defaultCity = city.trim();
      if (asks('address')) updates.defaultAddress = address.trim();
      if (asks('building')) updates.defaultBuilding = building.trim();
      await updateUser(updates);
      setMissing([]);
      showToast(ar ? 'تم حفظ بياناتك.' : 'Your details are saved.', 'success');
    } catch {
      // updateUser has already said what went wrong.
    } finally {
      setSaving(false);
    }
  };

  const label = 'block text-[11px] font-bold uppercase tracking-wider text-[#737373] mb-1';
  const input = 'w-full px-4 py-2.5 bg-[#F8F8F6] text-[#171717] text-sm rounded-lg border border-[#E5E5E5] focus:outline-none focus:border-[#B89753] focus:bg-white';

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div
        ref={containerRef}
        id="required-details-prompt"
        role="dialog"
        aria-modal="true"
        aria-labelledby="required-details-prompt-title"
        aria-describedby="required-details-prompt-text"
        className="bg-white rounded-xl shadow-2xl border border-[#E5E5E5] max-w-lg w-full max-h-[90vh] overflow-y-auto p-6"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-[#B89753]/10 text-[#8F7137] flex items-center justify-center shrink-0">
            <UserCheck className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <h2 id="required-details-prompt-title" className="font-serif font-bold text-[#171717] text-base">
              {ar ? 'أكمل بيانات حسابك' : 'Complete your account'}
            </h2>
            <p id="required-details-prompt-text" className="text-xs text-[#737373]">
              {ar ? 'نحتاج إليها لتوصيل طلباتك والتواصل معك. يمكنك تغييرها لاحقاً من حسابك.' : 'We need these to deliver your orders and reach you. You can change them later in your account.'}
            </p>
          </div>
        </div>
        <form onSubmit={save} className="space-y-4">
          {asks('name') && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="required-details-first-name" className={label}>{ar ? 'الاسم الأول *' : 'First Name *'}</label>
                <input id="required-details-first-name" type="text" value={firstName} onChange={e => setFirstName(e.target.value)} autoComplete="given-name" maxLength={100} required className={input} />
              </div>
              <div>
                <label htmlFor="required-details-last-name" className={label}>{ar ? 'اسم العائلة *' : 'Last Name *'}</label>
                <input id="required-details-last-name" type="text" value={lastName} onChange={e => setLastName(e.target.value)} autoComplete="family-name" maxLength={100} required className={input} />
              </div>
            </div>
          )}
          {asks('phone') && (
            <div>
              <label htmlFor="required-details-phone" className={label}>{ar ? 'الهاتف (واتساب) *' : 'Phone (WhatsApp) *'}</label>
              <div className="flex rounded-lg border border-[#E5E5E5] bg-[#F8F8F6] overflow-hidden focus-within:border-[#B89753] focus-within:bg-white">
                <span className="flex items-center gap-1.5 px-3 text-[#171717] text-xs font-bold border-r border-[#E5E5E5] select-none whitespace-nowrap shrink-0">
                  <LebanonFlag className="w-5 h-3.5" />
                  <span>+961</span>
                </span>
                <input
                  id="required-details-phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  maxLength={8}
                  placeholder="70123456"
                  value={phone}
                  onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  required
                  className="w-full px-3 py-2.5 bg-transparent text-[#171717] text-sm focus:outline-none"
                />
              </div>
            </div>
          )}
          {asks('email') && (
            <div>
              <label htmlFor="required-details-email" className={label}>{ar ? 'البريد الإلكتروني *' : 'Email Address *'}</label>
              <input id="required-details-email" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" placeholder="name@example.com" required className={input} />
            </div>
          )}
          {asks('city') && (
            <div>
              <label htmlFor="required-details-city" className={label}>{ar ? 'المدينة / المنطقة *' : 'City / Region *'}</label>
              <input
                id="required-details-city"
                type="text"
                value={city}
                onChange={e => setCity(e.target.value)}
                placeholder="e.g. Achrafieh, Beirut"
                maxLength={CITY_REGION_MAX_LENGTH}
                autoComplete="address-level2"
                required
                className={input}
              />
            </div>
          )}
          {(asks('address') || asks('building')) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {asks('address') && (
                <div>
                  <label htmlFor="required-details-address" className={label}>{ar ? 'الشارع / معلم قريب *' : 'Street / Landmark *'}</label>
                  <input id="required-details-address" type="text" value={address} onChange={e => setAddress(e.target.value)} placeholder="Gouraud Street, next to Paul Bakery" autoComplete="address-line1" maxLength={200} required className={input} />
                </div>
              )}
              {asks('building') && (
                <div>
                  <label htmlFor="required-details-building" className={label}>{ar ? 'المبنى والطابق والشقة *' : 'Building, Floor & Apt *'}</label>
                  <input id="required-details-building" type="text" value={building} onChange={e => setBuilding(e.target.value)} placeholder="Al-Nour Bldg, 4th Floor, Apt B" autoComplete="address-line2" maxLength={200} required className={input} />
                </div>
              )}
            </div>
          )}
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
              id="required-details-save"
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
