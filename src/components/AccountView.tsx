import React, { useState, useEffect } from 'react';
import { useShop } from '../context/ShopContext';
import { ProductCard } from './ProductCard';
import { OrderHistory } from './OrderHistory';
import { CustomBlocksRenderer } from './CustomBlocksRenderer';
import { LebanonFlag } from './LebanonFlag';
import { SellerDashboard } from './SellerDashboard';
import { ACCOUNT_SIGNIN_EVENT, takeAccountSignInRequest } from '../lib/accountSignIn';
import { EmailPasswordSignIn } from './EmailPasswordSignIn';
import { cityRegionProblem, emailProblem, phoneProblem, type SignupDetails } from '../lib/signupDetails';
import { 
  User, 
  Package, 
  Heart, 
  MapPin, 
  ArrowLeft,
  CheckCircle2,
  Sparkles,
  AlertTriangle,
  Mail,
  Save,
  Loader2,
  Store
} from 'lucide-react';

export const AccountView: React.FC = () => {
  const { 
    user, 
    orders, 
    wishlist, 
    products, 
    formatPrice, 
    setActiveTab,
    goBack,
    t,
    language,
    siteContent,
    updateUser,
    checkPhoneUniqueness,
    showToast,
    removeFromWishlist,
    firebaseUser,
    isSellerUser,
    signInWithGoogle,
    signInWithApple,
    signOutUser,
    resendEmailVerification
  } = useShop();

  const [activeAccountTab, setActiveAccountTab] = useState<'orders' | 'wishlist' | 'profile'>(
    () => (takeAccountSignInRequest() ? 'profile' : 'orders'));
  // The Seller Portal links open the sign-in form, which is on the profile tab.
  useEffect(() => {
    const openSignIn = () => { takeAccountSignInRequest(); setActiveAccountTab('profile'); };
    window.addEventListener(ACCOUNT_SIGNIN_EVENT, openSignIn);
    return () => window.removeEventListener(ACCOUNT_SIGNIN_EVENT, openSignIn);
  }, []);
  const authVisibility = siteContent?.accountPage || {};
  const showAppleAuth = authVisibility.showAppleAuth !== false;
  const showGoogleAuth = authVisibility.showGoogleAuth !== false;
  
  // User-isolated orders: Only display orders belonging to this authenticated user
  const userOrders = React.useMemo(() => {
    if (!firebaseUser) return [];
    const uid = firebaseUser.uid;
    const email = (firebaseUser.email || user?.email || '').trim().toLowerCase();

    return orders.filter(o => {
      // 1. Direct UID match
      if (o.userId && o.userId === uid) return true;
      // 2. Order matching user's confirmed email
      if (email && o.shipping?.email && o.shipping.email.trim().toLowerCase() === email) return true;
      return false;
    });
  }, [orders, firebaseUser, user]);
  
  // Profile form local state
  const [profileFirstName, setProfileFirstName] = useState('');
  const [profileLastName, setProfileLastName] = useState('');
  const [profileName, setProfileName] = useState(user.name);
  const [profileEmail, setProfileEmail] = useState(user.email);
  const [profilePhone, setProfilePhone] = useState(user.phone);
  const [profileCity, setProfileCity] = useState(user.defaultCity);
  const [profileAddress, setProfileAddress] = useState(user.defaultAddress);
  const [profileBuilding, setProfileBuilding] = useState(user.defaultBuilding || '');
  const [profileNotes, setProfileNotes] = useState(user.defaultNotes || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  // The email the sign-in form found no account for: sign-up starts with it.
  const [noAccountEmail, setNoAccountEmail] = useState('');
  // The email the sign-up form found an account for: sign-in starts with it.
  const [existingAccountEmail, setExistingAccountEmail] = useState('');
  const [isSendingVerification, setIsSendingVerification] = useState(false);
  // An account that signs in by email (password and code, Google or Apple)
  // keeps that address as its email; only one without, such as an old
  // phone-code account, types one in. The two never drift apart, so the
  // profile never shows an email the shopper cannot sign in with.
  const signInEmail = (firebaseUser?.email || '').trim();

  const handleResendVerification = async () => {
    if (!firebaseUser) return;
    setIsSendingVerification(true);
    try {
      if (resendEmailVerification) {
        await resendEmailVerification(firebaseUser.email || undefined);
      }
    } catch (err: any) {
    } finally {
      setIsSendingVerification(false);
    }
  };

  useEffect(() => {
    if (user) {
      let fName = user.firstName || (user.name ? user.name.split(' ')[0] : '');
      let lName = user.lastName || (user.name ? user.name.split(' ').slice(1).join(' ') : '');
      
      // Derive name from firebaseUser display name or email if empty
      if (!fName && !lName && firebaseUser) {
        if (firebaseUser.displayName) {
          const parts = firebaseUser.displayName.trim().split(/\s+/);
          fName = parts[0] || '';
          lName = parts.slice(1).join(' ') || '';
        } else if (firebaseUser.email && firebaseUser.email.includes('@')) {
          const raw = firebaseUser.email.split('@')[0].replace(/[0-9]+/g, ' ').trim();
          const parts = raw.split(/[\._\-\s]+/).filter(Boolean);
          if (parts.length >= 2) {
            fName = parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase();
            lName = parts[1].charAt(0).toUpperCase() + parts[1].slice(1).toLowerCase();
          } else if (parts.length === 1 && parts[0].length > 0) {
            fName = parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase();
          }
        }
      }

      // Add identical fallbacks as CheckoutView to ensure identical user experience and data representation
      fName = fName || '';
      lName = lName || '';

      const emailVal = (firebaseUser ? firebaseUser.email : '') || user.email || '';
      
      let phoneVal = user.phone || '';
      if (!phoneVal || phoneVal.trim() === '') {
        phoneVal = '';
      } else {
        phoneVal = phoneVal.replace('+961', '').replace(/\s+/g, '').trim();
      }

      const cityVal = user.defaultCity || '';
      const addressVal = user.defaultAddress || '';
      const buildingVal = user.defaultBuilding || '';
      const notesVal = user.defaultNotes || '';

      setProfileFirstName(fName);
      setProfileLastName(lName);
      setProfileName(user.name || `${fName} ${lName}`.trim());
      setProfileEmail(emailVal);
      setProfilePhone(phoneVal);
      setProfileCity(cityVal);
      setProfileAddress(addressVal);
      setProfileBuilding(buildingVal);
      setProfileNotes(notesVal);
    }
  }, [user, firebaseUser]);

  const handleGoogleSignIn = async () => {
    setIsAuthLoading(true);
    try {
      await signInWithGoogle();
    } catch (err) {} finally {
      setIsAuthLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    setIsAuthLoading(true);
    try {
      await signInWithApple();
    } catch (err) {} finally {
      setIsAuthLoading(false);
    }
  };

  /**
   * The sign-up form's details, checked, for the new account to carry; null
   * (with the reason shown) when something is missing. The password is
   * typed and checked in EmailPasswordSignIn below them, and the emailed code
   * proves the email.
   */
  const collectSignupDetails = async (): Promise<SignupDetails | null> => {
    const ar = language === 'ar';
    if (!profileFirstName.trim() || !profileLastName.trim()) {
      showToast(ar ? 'الاسم الأول واسم العائلة مطلوبان.' : 'First name and last name are required.', 'warning');
      return null;
    }
    if (!/^\d{8}$/.test(profilePhone)) {
      showToast(ar ? 'يجب أن يتألف رقم الهاتف اللبناني من 8 أرقام' : 'Lebanese phone number must be strictly 8 digits', 'warning');
      return null;
    }
    const cityProblem = cityRegionProblem(profileCity, language);
    if (cityProblem) {
      showToast(cityProblem, 'warning');
      return null;
    }
    if (!profileAddress.trim() || !profileBuilding.trim()) {
      showToast(ar ? 'الشارع والمبنى مطلوبان.' : 'Street and building are required.', 'warning');
      return null;
    }
    const phoneAvailability = await checkPhoneUniqueness(profilePhone);
    if (!phoneAvailability.available) {
      showToast(phoneAvailability.reason || (ar ? 'رقم الهاتف هذا مسجل مسبقاً بحساب آخر.' : 'This phone number is already registered to another account.'), 'warning');
      return null;
    }
    return {
      firstName: profileFirstName,
      lastName: profileLastName,
      phone: `+961 ${profilePhone}`,
      city: profileCity,
      address: profileAddress,
      building: profileBuilding,
      notes: profileNotes,
    };
  };

  const wishlistProducts = products.filter(p => wishlist.includes(p.id));

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileFirstName.trim() || !profileLastName.trim()) {
      showToast('First name and last name are required', 'warning');
      return;
    }
    const fullName = `${profileFirstName.trim()} ${profileLastName.trim()}`;
    // Email and phone are required on every account, and saved with it.
    const email = (signInEmail || profileEmail).trim();
    const emailIssue = emailProblem(email, language);
    if (emailIssue) {
      showToast(emailIssue, 'warning');
      return;
    }
    const cleanPhone = profilePhone.replace(/\D/g, '');
    const phoneIssue = phoneProblem(cleanPhone, language);
    if (phoneIssue) {
      showToast(phoneIssue, 'warning');
      return;
    }
    const formattedPhone = `+961 ${cleanPhone}`;
    const cityProblem = cityRegionProblem(profileCity, language);
    if (cityProblem) {
      showToast(cityProblem, 'warning');
      return;
    }
    if (!profileAddress.trim() || !profileBuilding.trim()) {
      showToast(language === 'ar' ? 'الشارع والمبنى مطلوبان.' : 'Street and building are required.', 'warning');
      return;
    }

    setIsSaving(true);
    try {
      const phoneCheck = await checkPhoneUniqueness(cleanPhone, firebaseUser?.uid || user.uid);
      if (!phoneCheck.available) {
        showToast(phoneCheck.reason || (language === 'ar' ? 'رقم الهاتف هذا مسجل مسبقاً بحساب آخر.' : 'This phone number is already registered to another account.'), 'warning');
        setIsSaving(false);
        return;
      }

      await updateUser({
        name: fullName,
        firstName: profileFirstName.trim(),
        lastName: profileLastName.trim(),
        email,
        phone: formattedPhone,
        defaultCity: profileCity.trim(),
        defaultAddress: profileAddress,
        defaultBuilding: profileBuilding,
        defaultNotes: profileNotes
      });
      showToast(language === 'ar' ? 'تم حفظ بيانات الملف الشخصي بنجاح!' : 'Profile details saved successfully!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Error saving profile changes', 'warning');
    } finally {
      setIsSaving(false);
    }
  };

  if (isSellerUser) {
    return (
    <div data-cms-element="account" className="min-h-screen bg-slate-50 pb-24">
        {/* Account Header with Sign Out */}
        <div className="bg-white border-b border-slate-200 py-4 px-4 sm:px-6 lg:px-8">
          <div className="max-w-screen-2xl mx-auto flex items-center justify-between">
            <button
              onClick={goBack}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold uppercase tracking-wider border border-slate-200 transition-colors cursor-pointer"
            >
              <ArrowLeft className={`w-3.5 h-3.5 ${language === 'ar' ? 'rotate-180' : ''}`} />
              <span>{t('back')}</span>
            </button>
            <div className="flex items-center gap-3">
              {firebaseUser && (
                <button
                  onClick={signOutUser}
                  className="px-4 py-2 bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 border border-slate-200 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2"
                >
                  <span>{language === 'ar' ? 'تسجيل الخروج' : 'Sign Out'} ({firebaseUser.email})</span>
                </button>
              )}
            </div>
          </div>
        </div>
        <SellerDashboard />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F8F6] pb-24 pt-4 sm:pt-6">
      
      {/* Top Banners */}
      <CustomBlocksRenderer page="account" position="top" />

      {/* Account Header */}
      <div className="bg-white border-b border-[#E5E5E5] pt-6 pb-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-screen-2xl mx-auto space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <button
              id="account-page-back-btn"
              onClick={goBack}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-[#F8F8F6] hover:bg-neutral-200 text-[#171717] text-xs font-bold uppercase tracking-wider border border-[#E5E5E5] transition-colors cursor-pointer"
            >
              <ArrowLeft className={`w-3.5 h-3.5 ${language === 'ar' ? 'rotate-180' : ''}`} />
              <span>{t('back')}</span>
            </button>

            {/* Account Status Badge */}
            <div className="flex items-center gap-3">
              {firebaseUser && (
                <button
                  id="firebase-signout-btn"
                  onClick={signOutUser}
                  className="px-4 py-2 bg-[#F8F8F6] hover:bg-rose-50 text-[#737373] hover:text-[#C62828] border border-[#E5E5E5] rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-2"
                >
                  <span>{language === 'ar' ? 'تسجيل الخروج' : 'Sign Out'} ({firebaseUser.displayName || firebaseUser.email})</span>
                </button>
              )}
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-[11px] text-[#16803C]">
                <span className="w-2 h-2 rounded-full bg-[#16803C]" />
                <span className="font-bold tracking-wide">
                  {firebaseUser ? (language === 'ar' ? 'مسجل وموثق' : 'VERIFIED MEMBER') : (language === 'ar' ? 'زائر' : 'GUEST')}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-6 pt-2">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-xl bg-[#F8F8F6] border border-[#E5E5E5] flex items-center justify-center text-[#171717] font-serif text-2xl shadow-2xs">
                {profileFirstName ? profileFirstName.charAt(0).toUpperCase() : (user.name ? user.name.charAt(0).toUpperCase() : 'G')}
              </div>
              
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-serif font-bold text-[#171717]">
                    {profileFirstName && profileLastName 
                      ? `${profileFirstName} ${profileLastName}` 
                      : (profileName || (language === 'ar' ? 'زائر جديد' : 'New Guest Patron'))}
                  </h1>
                </div>
                <p className="text-xs text-[#737373] mt-0.5">
                  {profileEmail || (language === 'ar' ? 'يرجى تحديث بريدك الإلكتروني ورقم هاتفك أدناه' : 'Please fill out your profile details below to complete sign up')} 
                  {profilePhone ? ` • +961 ${profilePhone.replace('+961', '').trim()}` : ''}
                </p>
                <p className="text-[11px] text-[#737373] flex items-center gap-1 mt-1 font-medium">
                  <MapPin className="w-3 h-3 text-[#B89753]" />
                  <span>
                    {profileAddress ? `${profileAddress}, ` : ''}{profileCity || 'Lebanon'}
                  </span>
                </p>
              </div>
            </div>

            {/* Quick stats pills */}
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-[#F8F8F6] border border-[#E5E5E5] text-center min-w-[90px]">
                <p className="text-[10px] uppercase font-bold text-[#737373]">{language === 'ar' ? 'إجمالي الطلبات' : 'Orders'}</p>
                <p className="text-xl font-bold text-[#171717]">{userOrders.length}</p>
              </div>
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-center min-w-[90px]">
                <p className="text-[10px] uppercase font-bold text-[#C62828]">{language === 'ar' ? 'المفضلة' : 'Favorites'}</p>
                <p className="text-xl font-bold text-[#C62828]">{wishlist.length}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Tabs Container */}
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        <div className="flex items-center gap-2 border-b border-[#E5E5E5] pb-4 overflow-x-auto">
          <button
            id="tab-orders"
            onClick={() => setActiveAccountTab('orders')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-xs uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
              activeAccountTab === 'orders'
                ? 'bg-[#171717] text-white shadow-sm'
                : 'bg-white text-[#737373] hover:text-[#171717] border border-[#E5E5E5]'
            }`}
          >
            <Package className="w-4 h-4" />
            <span>{language === 'ar' ? 'سجل الطلبات' : 'My Orders'}</span>
            <span className="ml-1 px-1.5 py-0.5 bg-white/20 rounded-md text-[10px]">{userOrders.length}</span>
          </button>

          <button
            id="tab-wishlist"
            onClick={() => setActiveAccountTab('wishlist')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-xs uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
              activeAccountTab === 'wishlist'
                ? 'bg-[#171717] text-white shadow-sm'
                : 'bg-white text-[#737373] hover:text-[#171717] border border-[#E5E5E5]'
            }`}
          >
            <Heart className="w-4 h-4" />
            <span>{language === 'ar' ? 'المفضلة والمحفوظات' : 'Saved Favorites'}</span>
            <span className="ml-1 px-1.5 py-0.5 bg-rose-100 text-[#C62828] rounded-md text-[10px] font-bold">{wishlist.length}</span>
          </button>

          <button
            id="tab-profile"
            onClick={() => setActiveAccountTab('profile')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-xs uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
              activeAccountTab === 'profile'
                ? 'bg-[#171717] text-white shadow-sm'
                : 'bg-white text-[#737373] hover:text-[#171717] border border-[#E5E5E5]'
            }`}
          >
            <User className="w-4 h-4" />
            <span>{language === 'ar' ? 'تفاصيل الحساب' : 'Profile'}</span>
          </button>
        </div>

        {/* Tab Content Areas */}
        <div className="mt-8">
          {/* Email Verification Alert Warning Banner */}
          {firebaseUser && !firebaseUser.emailVerified && (
            <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs animate-fadeIn">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-700 shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-[#171717] uppercase tracking-wider">
                    {language === 'ar' ? 'تأكيد البريد الإلكتروني مطلوب' : 'Email Verification Required'}
                  </h4>
                  <p className="text-xs text-[#737373] mt-0.5">
                    {language === 'ar' 
                      ? 'يرجى تأكيد بريدك الإلكتروني لتتمكن من إتمام طلباتك بنجاح.' 
                      : 'You must verify your email address to unlock checkout and complete orders.'}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {/*
                  A second button sat here labelled "Verify with OTP"
                  (تأكيد عبر رمز OTP). It called resendEmailVerification --
                  the same thing as the Resend Link button beside it -- so it
                  sent an email link, not a one-time code, and it carried
                  neither the disabled guard nor the sending state that button
                  has. It was a mislabelled duplicate of the better
                  implementation, and it promised a verification method this
                  screen does not offer. Removed rather than relabelled,
                  which would have left two identical resend buttons.
                */}
                <button
                  type="button"
                  disabled={isSendingVerification}
                  onClick={handleResendVerification}
                  className="px-4 py-2 bg-[#171717] hover:bg-black disabled:opacity-50 text-white text-xs font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer shadow-xs inline-flex items-center gap-1.5"
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>
                    {isSendingVerification 
                      ? (language === 'ar' ? 'جاري الإرسال...' : 'Sending...') 
                      : (language === 'ar' ? 'إعادة إرسال الرابط' : 'Resend Link')}
                  </span>
                </button>
              </div>
            </div>
          )}
          {/* Tab 1: Orders History */}
          {activeAccountTab === 'orders' && (
            <OrderHistory 
              orders={userOrders} 
              formatPrice={formatPrice} 
              onNavigateProducts={() => setActiveTab('products')} 
              language={language}
            />
          )}

          {/* Tab 2: Saved Favorites / Wishlist */}
          {activeAccountTab === 'wishlist' && (
            <div>
              {wishlistProducts.length === 0 ? (
                <div className="bg-white rounded-xl p-12 text-center border border-[#E5E5E5] max-w-lg mx-auto space-y-4">
                  <div className="w-14 h-14 bg-rose-50 text-[#C62828] rounded-full flex items-center justify-center mx-auto">
                    <Heart className="w-7 h-7" />
                  </div>
                  <h3 className="text-base font-bold text-[#171717]">
                    {language === 'ar' ? 'لا توجد منتجات محفوظة بعد' : 'Your Favorites List is Empty'}
                  </h3>
                  <p className="text-xs text-[#737373] leading-relaxed">
                    {language === 'ar' 
                      ? 'استكشف المنتجات الحرفية اللبنانية وانقر على رمز القلب لحفظها هنا للرجوع إليها لاحقاً.'
                      : 'Explore Lebanese artisanal products and click the heart icon on any product to save it here.'}
                  </p>
                  <button
                    onClick={() => setActiveTab('products')}
                    className="inline-block px-6 py-3 bg-[#171717] hover:bg-black text-white font-bold text-xs uppercase tracking-wider rounded-lg transition-colors cursor-pointer shadow-xs"
                  >
                    {language === 'ar' ? 'تصفح المنتجات' : 'Browse Products'}
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-bold text-[#171717]">
                      {language === 'ar' ? 'المنتجات المحفوظة' : 'Your Saved Items'} ({wishlistProducts.length})
                    </h2>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
                    {wishlistProducts.map(product => (
                      <ProductCard 
                        key={product.id} 
                        product={product} 
                        showRemoveButton={true}
                        onRemove={() => removeFromWishlist(product.id)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab 3: Profile Settings */}
          {activeAccountTab === 'profile' && (
            <div>
              {!firebaseUser ? (
                <div className="max-w-lg mx-auto bg-white p-6 sm:p-8 rounded-xl border border-[#E5E5E5] shadow-sm">
                  <div className="flex items-center justify-center gap-2 mb-6 bg-[#F8F8F6] p-1.5 rounded-lg">
                    <button
                      type="button"
                      onClick={() => setAuthMode('signin')}
                      className={`flex-1 py-2 rounded-lg font-bold text-xs uppercase tracking-wider transition-all cursor-pointer ${
                        authMode === 'signin' ? 'bg-white text-[#171717] shadow-xs' : 'text-[#737373] hover:text-[#171717]'
                      }`}
                    >
                      Sign In
                    </button>
                    <button
                      type="button"
                      onClick={() => setAuthMode('signup')}
                      className={`flex-1 py-2 rounded-lg font-bold text-xs uppercase tracking-wider transition-all cursor-pointer ${
                        authMode === 'signup' ? 'bg-white text-[#171717] shadow-xs' : 'text-[#737373] hover:text-[#171717]'
                      }`}
                    >
                      Sign Up
                    </button>
                  </div>

                  <div className="text-center mb-6">
                    <h2 className="text-xl font-serif font-bold text-[#171717]">{authMode === 'signin' ? 'Welcome Back' : 'Create Your Account'}</h2>
                    <p className="text-xs text-[#737373] mt-1">
                      {authMode === 'signin' ? 'Sign in with your email and password. We then email you a code.' : 'Fill in your details and choose a password. We will email you a code to confirm your address.'}
                    </p>
                  </div>

                  {/* Social & Phone Sign In Options */}
                  <div className="mb-6 space-y-2.5">
                    {showGoogleAuth && (
                    <button
                      type="button"
                      id="account-google-signin-btn"
                      onClick={handleGoogleSignIn}
                      disabled={isAuthLoading}
                      className="w-full py-2.5 px-4 rounded-lg bg-white hover:bg-neutral-50 text-[#171717] font-bold text-xs border border-[#E5E5E5] flex items-center justify-center gap-3 transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                      </svg>
                      <span>{language === 'ar' ? 'المتابعة باستخدام Google' : 'Continue with Google'}</span>
                    </button>
                    )}

                    {showAppleAuth && (
                    <button
                      type="button"
                      id="account-apple-signin-btn"
                      onClick={handleAppleSignIn}
                      disabled={isAuthLoading}
                      className="w-full py-2.5 px-4 rounded-lg bg-black hover:bg-[#171717] text-white font-bold text-xs border border-black flex items-center justify-center gap-3 transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M17.05 12.94c-.02-2.3 1.88-3.4 1.96-3.45-1.07-1.56-2.73-1.78-3.32-1.8-1.41-.14-2.76.83-3.48.83-.72 0-1.83-.81-3.01-.79-1.55.02-2.98.9-3.78 2.29-1.61 2.79-.41 6.92 1.15 9.18.76 1.11 1.67 2.35 2.86 2.31 1.15-.05 1.58-.74 2.97-.74 1.39 0 1.78.74 2.99.72 1.24-.02 2.02-1.13 2.78-2.24.88-1.28 1.24-2.53 1.26-2.6-.03-.01-2.41-.93-2.44-3.7zM14.8 5.6c.63-.77 1.06-1.83.94-2.9-.91.04-2.02.61-2.67 1.37-.58.68-1.09 1.77-.95 2.81 1.02.08 2.05-.52 2.68-1.28z" />
                      </svg>
                      <span>{language === 'ar' ? 'المتابعة باستخدام Apple' : 'Continue with Apple'}</span>
                    </button>
                    )}
                  </div>

                  <div className="relative flex py-2 items-center mb-6">
                    <div className="flex-grow border-t border-[#E5E5E5]"></div>
                    <span className="flex-shrink mx-4 text-[11px] font-bold uppercase tracking-wider text-[#737373]">
                      Or with email
                    </span>
                    <div className="flex-grow border-t border-[#E5E5E5]"></div>
                  </div>

                  {authMode === 'signin' ? (
                    <div className="space-y-4">
                      <EmailPasswordSignIn
                        idPrefix="account-signin"
                        purpose="signin"
                        onSignedIn={setProfileEmail}
                        onNoAccount={email => { setNoAccountEmail(email); setAuthMode('signup'); }}
                        existingAccountEmail={existingAccountEmail}
                      />

                      {/* Sellers sign in with this same form; their workspace opens here. */}
                      {siteContent?.visibility?.sellerPortal !== false && (
                        <div id="account-seller-signin-hint" className="pt-3 border-t border-[#E5E5E5] text-center">
                          <p className="inline-flex items-center gap-1.5 text-xs text-[#737373]">
                            <Store className="w-3.5 h-3.5 text-[#B89753] shrink-0" aria-hidden="true" />
                            <span>{language === 'ar' ? 'البائعون والتجار: سجّلوا الدخول هنا بالبريد الإلكتروني وكلمة المرور اللذين أعطتكم إياهما يلا، ثم نرسل إليكم رمزاً.' : 'Sellers and merchants: sign in here with the email and password Yalla gave you. We will then email you a code.'}</span>
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[11px] font-bold uppercase tracking-wider text-[#737373] mb-1">First Name (Required)</label>
                          <input 
                            type="text" 
                            value={profileFirstName} 
                            onChange={(e) => setProfileFirstName(e.target.value)} 
                            placeholder="John"
                            className="w-full px-4 py-2.5 bg-[#F8F8F6] text-[#171717] text-sm rounded-lg border border-[#E5E5E5] focus:outline-none focus:border-[#B89753] focus:bg-white" 
                            required 
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold uppercase tracking-wider text-[#737373] mb-1">Family Name (Required)</label>
                          <input 
                            type="text" 
                            value={profileLastName} 
                            onChange={(e) => setProfileLastName(e.target.value)} 
                            placeholder="Doe"
                            className="w-full px-4 py-2.5 bg-[#F8F8F6] text-[#171717] text-sm rounded-lg border border-[#E5E5E5] focus:outline-none focus:border-[#B89753] focus:bg-white" 
                            required 
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[11px] font-bold uppercase tracking-wider text-[#737373] mb-1">Phone (WhatsApp) *</label>
                          <div className="flex rounded-lg border border-[#E5E5E5] bg-[#F8F8F6] overflow-hidden focus-within:border-[#B89753] focus-within:bg-white">
                            <span className="flex items-center gap-1.5 px-3 bg-[#F8F8F6] text-[#171717] text-xs font-bold border-r border-[#E5E5E5] select-none whitespace-nowrap">
                              <LebanonFlag className="w-5 h-3.5" />
                              <span>+961</span>
                            </span>
                            <input 
                              type="text" 
                              inputMode="numeric"
                              maxLength={8}
                              placeholder="70123456"
                              value={profilePhone} 
                              onChange={(e) => {
                                const val = e.target.value.replace(/\D/g, '').slice(0, 8);
                                setProfilePhone(val);
                              }} 
                              className="w-full px-3 py-2.5 bg-transparent text-[#171717] text-sm focus:outline-none" 
                              required 
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold uppercase tracking-wider text-[#737373] mb-1">City / Region *</label>
                          <input 
                            type="text" 
                            value={profileCity} 
                            onChange={(e) => setProfileCity(e.target.value)} 
                            placeholder="e.g. Achrafieh, Beirut"
                            className="w-full px-4 py-2.5 bg-[#F8F8F6] text-[#171717] text-sm rounded-lg border border-[#E5E5E5] focus:outline-none focus:border-[#B89753] focus:bg-white" 
                            required 
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[11px] font-bold uppercase tracking-wider text-[#737373] mb-1">Street / Landmark *</label>
                          <input 
                            type="text" 
                            value={profileAddress} 
                            onChange={(e) => setProfileAddress(e.target.value)} 
                            placeholder="Gouraud Street, next to Paul Bakery"
                            className="w-full px-4 py-2.5 bg-[#F8F8F6] text-[#171717] text-sm rounded-lg border border-[#E5E5E5] focus:outline-none focus:border-[#B89753] focus:bg-white" 
                            required 
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold uppercase tracking-wider text-[#737373] mb-1">Building, Floor & Apt *</label>
                          <input 
                            type="text" 
                            value={profileBuilding} 
                            onChange={(e) => setProfileBuilding(e.target.value)} 
                            placeholder="Al-Nour Bldg, 4th Floor, Apt B"
                            className="w-full px-4 py-2.5 bg-[#F8F8F6] text-[#171717] text-sm rounded-lg border border-[#E5E5E5] focus:outline-none focus:border-[#B89753] focus:bg-white" 
                            required 
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-[#737373] mb-1">Delivery Notes & Courier Instructions (Optional)</label>
                        <input 
                          type="text" 
                          value={profileNotes} 
                          onChange={(e) => setProfileNotes(e.target.value)} 
                          placeholder="Call upon arrival, leave with building concierge if not present"
                          className="w-full px-4 py-2.5 bg-[#F8F8F6] text-[#171717] text-sm rounded-lg border border-[#E5E5E5] focus:outline-none focus:border-[#B89753] focus:bg-white" 
                        />
                      </div>
                      <EmailPasswordSignIn
                        idPrefix="account-signup"
                        purpose="signup"
                        noAccountEmail={noAccountEmail}
                        collectSignupDetails={collectSignupDetails}
                        onSignedIn={setProfileEmail}
                        onAccountExists={email => { setExistingAccountEmail(email); setAuthMode('signin'); }}
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div className="max-w-2xl bg-white p-6 sm:p-8 rounded-xl border border-[#E5E5E5] shadow-sm relative overflow-hidden transition-all hover:border-[#B89753]/40">
                  <div className="flex items-center gap-3 pb-5 mb-6 border-b border-[#E5E5E5]">
                    <div className="p-2.5 rounded-lg bg-[#B89753]/10 text-[#8F7137] shrink-0">
                      <User className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-base font-serif font-bold text-[#171717] tracking-tight">Personal Information</h2>
                      <p className="text-xs text-[#737373] font-normal">Manage your personal profile and default delivery details</p>
                    </div>
                  </div>

                  <form onSubmit={handleSaveProfile} className="space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-[#737373] mb-1.5">First Name (Required)</label>
                        <input 
                          type="text" 
                          value={profileFirstName} 
                          onChange={(e) => setProfileFirstName(e.target.value)} 
                          placeholder="John"
                          className="w-full px-4 py-2.5 bg-[#F8F8F6] text-[#171717] text-sm font-medium rounded-lg border border-[#E5E5E5] focus:outline-none focus:border-[#B89753] focus:bg-white transition-all" 
                          required 
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-[#737373] mb-1.5">Last / Family Name (Required)</label>
                        <input 
                          type="text" 
                          value={profileLastName} 
                          onChange={(e) => setProfileLastName(e.target.value)} 
                          placeholder="Doe"
                          className="w-full px-4 py-2.5 bg-[#F8F8F6] text-[#171717] text-sm font-medium rounded-lg border border-[#E5E5E5] focus:outline-none focus:border-[#B89753] focus:bg-white transition-all" 
                          required 
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div>
                        <label htmlFor="profile-email-input" className="block text-[11px] font-bold uppercase tracking-wider text-[#737373] mb-1.5">Email Address *</label>
                        <input 
                          id="profile-email-input"
                          type="email" 
                          autoComplete="email"
                          value={signInEmail || profileEmail} 
                          onChange={(e) => setProfileEmail(e.target.value)} 
                          readOnly={Boolean(signInEmail)}
                          aria-describedby={signInEmail ? 'profile-email-note' : undefined}
                          className={`w-full px-4 py-2.5 bg-[#F8F8F6] text-sm font-medium rounded-lg border border-[#E5E5E5] focus:outline-none focus:border-[#B89753] transition-all ${signInEmail ? 'cursor-default text-[#525252]' : 'text-[#171717] focus:bg-white'}`} 
                          required 
                        />
                        {signInEmail && (
                          <p id="profile-email-note" className="mt-1 text-[11px] text-[#737373]">
                            {language === 'ar' ? 'تسجّل الدخول بهذا البريد، لذا لا يمكن تغييره هنا.' : 'You sign in with this email, so it cannot be changed here.'}
                          </p>
                        )}
                      </div>
                      <div>
                        <label htmlFor="profile-phone-input" className="block text-[11px] font-bold uppercase tracking-wider text-[#737373] mb-1.5">Phone (WhatsApp) *</label>
                        <div className="flex rounded-lg border border-[#E5E5E5] bg-[#F8F8F6] overflow-hidden focus-within:border-[#B89753] focus-within:bg-white transition-all">
                          <span className="flex items-center gap-1.5 px-3 bg-[#F8F8F6] text-[#171717] text-xs font-bold border-r border-[#E5E5E5] select-none whitespace-nowrap shrink-0">
                            <LebanonFlag className="w-5 h-3.5" />
                            <span>+961</span>
                          </span>
                          <input 
                            id="profile-phone-input"
                            type="tel" 
                            inputMode="numeric"
                            autoComplete="tel-national"
                            maxLength={8}
                            placeholder="70123456"
                            value={profilePhone} 
                            onChange={(e) => {
                              const val = e.target.value.replace(/\D/g, '').slice(0, 8);
                              setProfilePhone(val);
                            }} 
                            className="w-full px-3.5 py-2.5 bg-transparent text-[#171717] text-sm font-medium focus:outline-none" 
                            required 
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-[#737373] mb-1.5">City / Region *</label>
                        <input 
                          type="text" 
                          value={profileCity} 
                          onChange={(e) => setProfileCity(e.target.value)} 
                          placeholder="e.g. Achrafieh, Beirut"
                          className="w-full px-4 py-2.5 bg-[#F8F8F6] text-[#171717] text-sm font-medium rounded-lg border border-[#E5E5E5] focus:outline-none focus:border-[#B89753] focus:bg-white transition-all" 
                          required 
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-[#737373] mb-1.5">Street / Landmark *</label>
                        <input 
                          type="text" 
                          value={profileAddress} 
                          onChange={(e) => setProfileAddress(e.target.value)} 
                          placeholder="Gouraud Street, next to Paul Bakery"
                          className="w-full px-4 py-2.5 bg-[#F8F8F6] text-[#171717] text-sm font-medium rounded-lg border border-[#E5E5E5] focus:outline-none focus:border-[#B89753] focus:bg-white transition-all" 
                          required 
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-[#737373] mb-1.5">Building, Floor & Apt *</label>
                        <input 
                          type="text" 
                          value={profileBuilding} 
                          onChange={(e) => setProfileBuilding(e.target.value)} 
                          placeholder="Al-Nour Bldg, 4th Floor, Apt B"
                          className="w-full px-4 py-2.5 bg-[#F8F8F6] text-[#171717] text-sm font-medium rounded-lg border border-[#E5E5E5] focus:outline-none focus:border-[#B89753] focus:bg-white transition-all" 
                          required 
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-[#737373] mb-1.5">Delivery Notes & Courier Instructions (Optional)</label>
                      <input 
                        type="text" 
                        value={profileNotes} 
                        onChange={(e) => setProfileNotes(e.target.value)} 
                        placeholder="Call upon arrival, leave with building concierge if not present"
                        className="w-full px-4 py-2.5 bg-[#F8F8F6] text-[#171717] text-sm font-medium rounded-lg border border-[#E5E5E5] focus:outline-none focus:border-[#B89753] focus:bg-white transition-all" 
                      />
                    </div>

                    <div className="pt-4 flex justify-end">
                      <button 
                        type="submit" 
                        disabled={isSaving} 
                        className="px-8 py-3 bg-[#171717] hover:bg-black disabled:bg-neutral-300 text-white font-bold rounded-lg text-xs uppercase tracking-wider transition-all shadow-sm cursor-pointer flex items-center gap-2"
                      >
                        {isSaving ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin text-[#B89753]" />
                            <span>Saving...</span>
                          </>
                        ) : (
                          <>
                            <Save className="w-4 h-4 text-[#B89753]" />
                            <span>Save Profile Details</span>
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/*
        Signing in takes the account's password and then a code emailed to it
        (EmailPasswordSignIn); the same email carries a link that signs in on
        the device where it is opened. Supabase enforces the pair: the sign-in
        hook refuses a password on its own, and a code unless the password
        step (or Forgot password) came just before. The phone-code sign-in
        that was here is gone: a phone code cannot be that second step. The
        OTPModal that was once mounted here could never open and was deleted;
        both are in git history.
      */}
    </div>
  );
};
