import React, { useState, useEffect } from 'react';
import { useShop } from '../context/ShopContext';
import { useDialog } from '../hooks/useDialog';
import { ProductCard } from './ProductCard';
import { OrderHistory } from './OrderHistory';
import { CustomBlocksRenderer } from './CustomBlocksRenderer';
import { LebanonFlag } from './LebanonFlag';
import { SellerDashboard } from './SellerDashboard';
import { sendEmailVerification } from '../firebase';
import { validatePassword } from '../lib/passwordPolicy';
import { OTPModal } from './OTPModal';
import { PhoneAuthModal } from './PhoneAuthModal';
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
  Smartphone,
  Eye,
  EyeOff,
  KeyRound,
  ShieldCheck,
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
    updateUser,
    checkPhoneUniqueness,
    showToast,
    removeFromWishlist,
    firebaseUser,
    isSellerUser,
    signInWithGoogle,
    signInWithApple,
    signOutUser,
    signInWithEmail,
    signUpWithEmail,
    sendEmailSignInLink,
    resetPassword
  } = useShop();

  const [activeAccountTab, setActiveAccountTab] = useState<'orders' | 'wishlist' | 'profile'>('orders');
  
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
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authConfirmPassword, setAuthConfirmPassword] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [isSendingVerification, setIsSendingVerification] = useState(false);

  // Password visibility and reset password state
  const [showPassword, setShowPassword] = useState(false);
  const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [isSendingReset, setIsSendingReset] = useState(false);

  const { containerRef: forgotPasswordModalRef } = useDialog({
    isOpen: showForgotPasswordModal,
    onClose: () => setShowForgotPasswordModal(false)
  });

  const handleResetPassword = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const targetEmail = (forgotEmail || authEmail).trim();
    if (!targetEmail) {
      showToast('Please enter your email address to reset password', 'warning');
      return;
    }
    setIsSendingReset(true);
    try {
      await resetPassword(targetEmail);
      setShowForgotPasswordModal(false);
    } catch (err: any) {
    } finally {
      setIsSendingReset(false);
    }
  };

  const handleResendVerification = async () => {
    if (!firebaseUser) return;
    setIsSendingVerification(true);
    try {
      await sendEmailVerification(firebaseUser);
      showToast(
        language === 'ar'
          ? 'تم إرسال بريد التحقق بنجاح! يرجى مراجعة صندوق الوارد.'
          : 'Verification email sent successfully! Please check your inbox.',
        'success'
      );
    } catch (err: any) {
      showToast(err.message || 'Failed to send verification email.', 'warning');
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

      const emailVal = user.email || (firebaseUser ? firebaseUser.email : '') || '';
      
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

  const [showOtpModal, setShowOtpModal] = useState<boolean>(false);
  const [showPhoneAuthModal, setShowPhoneAuthModal] = useState<boolean>(false);
  const [otpTargetContact, setOtpTargetContact] = useState<string>('');
  const [otpActionType, setOtpActionType] = useState<'login' | 'signup'>('login');
  const [pendingAuthAction, setPendingAuthAction] = useState<(() => Promise<void>) | null>(null);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmail || !authPassword) {
      showToast('Please enter both email and password', 'warning');
      return;
    }
    
    setIsAuthLoading(true);
    try {
      await signInWithEmail(authEmail, authPassword);
      setProfileEmail(authEmail);
    } catch (err) {
      // Error is already handled with friendly toast in context
    } finally {
      setIsAuthLoading(false);
    }
  };

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

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileFirstName || !profileFirstName.trim() || !profileLastName || !profileLastName.trim()) {
      showToast('First name and last name are required', 'warning');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(authEmail)) {
      showToast('A valid email format is required', 'warning');
      return;
    }
    const passwordCheck = validatePassword(authPassword);
    if (!passwordCheck.isValid) {
      showToast(passwordCheck.message || 'Password must be at least 8 characters and include numbers and letters', 'warning');
      return;
    }
    if (authPassword !== authConfirmPassword) {
      showToast('Passwords do not match', 'warning');
      return;
    }
    if (!/^\d{8}$/.test(profilePhone)) {
      showToast(language === 'ar' ? 'يجب أن يتألف رقم الهاتف اللبناني من 8 أرقام' : 'Lebanese phone number must be strictly 8 digits', 'warning');
      return;
    }

    setIsAuthLoading(true);
    // Strict uniqueness check before registering user
    const phoneAvailability = await checkPhoneUniqueness(profilePhone);
    if (!phoneAvailability.available) {
      showToast(phoneAvailability.reason || (language === 'ar' ? 'رقم الهاتف هذا مسجل مسبقاً بحساب آخر.' : 'This phone number is already registered to another account.'), 'warning');
      setIsAuthLoading(false);
      return;
    }
    setIsAuthLoading(false);

    const fullName = `${profileFirstName.trim()} ${profileLastName.trim()}`;
    const formattedPhone = `+961 ${profilePhone}`;

    setIsAuthLoading(true);
    try {
      try {
        localStorage.setItem('yallalb_signup_profile_temp', JSON.stringify({
          firstName: profileFirstName.trim(),
          lastName: profileLastName.trim(),
          phone: formattedPhone,
          defaultCity: profileCity,
          defaultAddress: profileAddress,
          defaultBuilding: profileBuilding,
          defaultNotes: profileNotes
        }));
      } catch {}
      await signUpWithEmail(authEmail, authPassword, profilePhone);
      await updateUser({
        name: fullName,
        firstName: profileFirstName.trim(),
        lastName: profileLastName.trim(),
        email: authEmail,
        phone: formattedPhone,
        defaultCity: profileCity,
        defaultAddress: profileAddress,
        defaultBuilding: profileBuilding,
        defaultNotes: profileNotes
      });
      showToast(language === 'ar' ? 'تم إنشاء الحساب بنجاح!' : 'Account registered successfully!', 'success');
    } catch (err) {
      // Error handled with toast in context
    } finally {
      setIsAuthLoading(false);
    }
  };

  const wishlistProducts = products.filter(p => wishlist.includes(p.id));

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileFirstName.trim() || !profileLastName.trim()) {
      showToast('First name and last name are required', 'warning');
      return;
    }
    const fullName = `${profileFirstName.trim()} ${profileLastName.trim()}`;
    const cleanPhone = profilePhone.replace(/\D/g, '');
    const formattedPhone = cleanPhone ? `+961 ${cleanPhone}` : '';
    
    if (cleanPhone && cleanPhone.length !== 8) {
      showToast(language === 'ar' ? 'يجب أن يتألف رقم الهاتف اللبناني من 8 أرقام' : 'Lebanese phone number must be strictly 8 digits', 'warning');
      return;
    }

    setIsSaving(true);
    try {
      if (cleanPhone) {
        const phoneCheck = await checkPhoneUniqueness(cleanPhone, firebaseUser?.uid || user.uid);
        if (!phoneCheck.available) {
          showToast(phoneCheck.reason || (language === 'ar' ? 'رقم الهاتف هذا مسجل مسبقاً بحساب آخر.' : 'This phone number is already registered to another account.'), 'warning');
          setIsSaving(false);
          return;
        }
      }

      await updateUser({
        name: fullName,
        firstName: profileFirstName.trim(),
        lastName: profileLastName.trim(),
        email: profileEmail,
        phone: formattedPhone,
        defaultCity: profileCity,
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
      <div className="min-h-screen bg-slate-50 pb-24">
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
                <button
                  type="button"
                  onClick={async () => {
                    const targetEmail = firebaseUser?.email || user?.email;
                    if (targetEmail && firebaseUser) {
                      try {
                        await sendEmailVerification(firebaseUser);
                        showToast(
                          language === 'ar'
                            ? 'تم إرسال رابط التفعيل! يرجى التحقق من بريدك الإلكتروني.'
                            : 'Verification link sent! Please check your inbox.',
                          'success'
                        );
                      } catch (err: any) {
                        showToast(`Failed to send verification: ${err.message}`, 'warning');
                      }
                    }
                  }}
                  className="px-4 py-2 bg-[#8F7137] hover:bg-[#B89753] text-white text-xs font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer shadow-xs inline-flex items-center gap-1.5"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>{language === 'ar' ? 'تأكيد عبر رمز OTP' : 'Verify with OTP'}</span>
                </button>
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
                      {authMode === 'signin' ? 'Sign in to access your orders and saved details.' : 'Fill in your personal details and set a secure password.'}
                    </p>
                  </div>

                  {/* Social & Phone Sign In Options */}
                  <div className="mb-6 space-y-2.5">
                    <button
                      type="button"
                      id="account-phone-signin-btn"
                      onClick={() => setShowPhoneAuthModal(true)}
                      disabled={isAuthLoading}
                      className="w-full py-2.5 px-4 rounded-lg bg-[#171717] hover:bg-black text-white font-bold text-xs flex items-center justify-center gap-3 transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
                    >
                      <Smartphone className="w-4 h-4 text-[#B89753]" />
                      <span>{language === 'ar' ? 'تسجيل الدخول برقم الهاتف اللبناني (SMS)' : 'Sign In with Lebanese Phone (SMS)'}</span>
                    </button>

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
                  </div>

                  <div className="relative flex py-2 items-center mb-6">
                    <div className="flex-grow border-t border-[#E5E5E5]"></div>
                    <span className="flex-shrink mx-4 text-[11px] font-bold uppercase tracking-wider text-[#737373]">
                      Or with email
                    </span>
                    <div className="flex-grow border-t border-[#E5E5E5]"></div>
                  </div>

                  {authMode === 'signin' ? (
                    <form onSubmit={handleSignIn} className="space-y-4">
                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-[#737373] mb-1">Email Address</label>
                        <input 
                          type="email" 
                          value={authEmail} 
                          onChange={(e) => setAuthEmail(e.target.value)} 
                          className="w-full px-4 py-2.5 bg-[#F8F8F6] text-[#171717] text-sm rounded-lg border border-[#E5E5E5] focus:outline-none focus:border-[#B89753] focus:bg-white" 
                          required 
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-[11px] font-bold uppercase tracking-wider text-[#737373]">Password (Required)</label>
                          <button
                            type="button"
                            onClick={() => {
                              setForgotEmail(authEmail);
                              setShowForgotPasswordModal(true);
                            }}
                            className="text-[11px] font-bold text-[#8F7137] hover:text-[#B89753] hover:underline transition-colors cursor-pointer"
                          >
                            Forgot Password?
                          </button>
                        </div>
                        <div className="relative flex items-center">
                          <input 
                            type={showPassword ? 'text' : 'password'} 
                            value={authPassword} 
                            onChange={(e) => setAuthPassword(e.target.value)} 
                            className="w-full pl-4 pr-10 py-2.5 bg-[#F8F8F6] text-[#171717] text-sm rounded-lg border border-[#E5E5E5] focus:outline-none focus:border-[#B89753] focus:bg-white" 
                            minLength={6}
                            required 
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 p-1 text-[#737373] hover:text-[#171717] transition-colors focus:outline-none cursor-pointer"
                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                            title={showPassword ? 'Hide password' : 'Show password'}
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                      <button 
                        type="submit" 
                        disabled={isAuthLoading}
                        className="w-full py-3 bg-[#171717] hover:bg-black text-white font-bold rounded-lg text-xs uppercase tracking-wider transition-all shadow-sm cursor-pointer disabled:bg-neutral-300"
                      >
                        {isAuthLoading ? 'Signing In...' : 'Sign In'}
                      </button>

                      <div className="relative flex py-1 items-center">
                        <div className="flex-grow border-t border-[#E5E5E5]"></div>
                        <span className="flex-shrink mx-3 text-[10px] font-bold uppercase tracking-wider text-[#A3A3A3]">
                          {language === 'ar' ? 'أو بدون كلمة مرور' : 'Or Passwordless'}
                        </span>
                        <div className="flex-grow border-t border-[#E5E5E5]"></div>
                      </div>

                      <button
                        type="button"
                        disabled={isAuthLoading || !authEmail}
                        onClick={async () => {
                          if (!authEmail) {
                            showToast(language === 'ar' ? 'يرجى إدخال البريد الإلكتروني أولاً' : 'Please enter your email address first', 'warning');
                            return;
                          }
                          setIsAuthLoading(true);
                          try {
                            await sendEmailSignInLink(authEmail);
                          } catch {
                            // Error toast is handled in sendEmailSignInLink
                          } finally {
                            setIsAuthLoading(false);
                          }
                        }}
                        className="w-full py-2.5 bg-[#8F7137]/10 hover:bg-[#8F7137]/20 text-[#8F7137] border border-[#8F7137]/30 font-bold rounded-lg text-xs uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        <Mail className="w-3.5 h-3.5" />
                        <span>{language === 'ar' ? 'إرسال رابط تسجيل دخول مباشر' : 'Send Direct Email Sign-In Link'}</span>
                      </button>

                      {/* Seller Login Shortcut */}
                      <div className="pt-3 border-t border-[#E5E5E5] text-center">
                        <p className="text-xs text-[#737373] mb-1.5">
                          {language === 'ar' ? 'هل أنت بائع أو مورد معتمد في المنصة؟' : 'Are you a verified Lebanese seller or merchant?'}
                        </p>
                        <button
                          type="button"
                          id="account-to-seller-portal-btn"
                          onClick={() => setActiveTab('seller')}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#B89753]/10 hover:bg-[#B89753]/20 text-[#8F7137] border border-[#B89753]/30 text-xs font-bold transition-all cursor-pointer"
                        >
                          <Store className="w-3.5 h-3.5 text-[#B89753]" />
                          <span>{language === 'ar' ? 'دخول بوابة البائعين والتجار' : 'Access Seller & Merchant Portal'}</span>
                        </button>
                      </div>
                    </form>
                  ) : (
                    <form onSubmit={handleSignUp} className="space-y-4">
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
                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-[#737373] mb-1">Email Address</label>
                        <input 
                          type="email" 
                          value={authEmail} 
                          onChange={(e) => setAuthEmail(e.target.value)} 
                          className="w-full px-4 py-2.5 bg-[#F8F8F6] text-[#171717] text-sm rounded-lg border border-[#E5E5E5] focus:outline-none focus:border-[#B89753] focus:bg-white" 
                          required 
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-[#737373] mb-1">Password (Required)</label>
                        <div className="relative flex items-center">
                          <input 
                            type={showPassword ? 'text' : 'password'} 
                            value={authPassword} 
                            onChange={(e) => setAuthPassword(e.target.value)} 
                            className="w-full pl-4 pr-10 py-2.5 bg-[#F8F8F6] text-[#171717] text-sm rounded-lg border border-[#E5E5E5] focus:outline-none focus:border-[#B89753] focus:bg-white" 
                            minLength={6}
                            required 
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 p-1 text-[#737373] hover:text-[#171717] transition-colors focus:outline-none cursor-pointer"
                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                            title={showPassword ? 'Hide password' : 'Show password'}
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-[#737373] mb-1">Confirm Password</label>
                        <div className="relative flex items-center">
                          <input 
                            type={showPassword ? 'text' : 'password'} 
                            value={authConfirmPassword} 
                            onChange={(e) => setAuthConfirmPassword(e.target.value)} 
                            className="w-full pl-4 pr-10 py-2.5 bg-[#F8F8F6] text-[#171717] text-sm rounded-lg border border-[#E5E5E5] focus:outline-none focus:border-[#B89753] focus:bg-white" 
                            minLength={6}
                            required 
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 p-1 text-[#737373] hover:text-[#171717] transition-colors focus:outline-none cursor-pointer"
                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                            title={showPassword ? 'Hide password' : 'Show password'}
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[11px] font-bold uppercase tracking-wider text-[#737373] mb-1">Phone (WhatsApp)</label>
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
                          <label className="block text-[11px] font-bold uppercase tracking-wider text-[#737373] mb-1">City / Region</label>
                          <input 
                            type="text" 
                            value={profileCity} 
                            onChange={(e) => setProfileCity(e.target.value)} 
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
                      <button 
                        type="submit" 
                        disabled={isAuthLoading}
                        className="w-full py-3 bg-[#171717] hover:bg-black text-white font-bold rounded-lg text-xs uppercase tracking-wider transition-all shadow-sm cursor-pointer disabled:bg-neutral-300 mt-2"
                      >
                        {isAuthLoading ? 'Creating Account...' : 'Create Account & Sign Up'}
                      </button>
                    </form>
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
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-[#737373] mb-1.5">Email Address</label>
                        <input 
                          type="email" 
                          value={profileEmail} 
                          onChange={(e) => setProfileEmail(e.target.value)} 
                          className="w-full px-4 py-2.5 bg-[#F8F8F6] text-[#171717] text-sm font-medium rounded-lg border border-[#E5E5E5] focus:outline-none focus:border-[#B89753] focus:bg-white transition-all" 
                          required 
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-[#737373] mb-1.5">Phone (WhatsApp)</label>
                        <div className="flex rounded-lg border border-[#E5E5E5] bg-[#F8F8F6] overflow-hidden focus-within:border-[#B89753] focus-within:bg-white transition-all">
                          <span className="flex items-center gap-1.5 px-3 bg-[#F8F8F6] text-[#171717] text-xs font-bold border-r border-[#E5E5E5] select-none whitespace-nowrap shrink-0">
                            <LebanonFlag className="w-5 h-3.5" />
                            <span>+961</span>
                          </span>
                          <input 
                            type="tel" 
                            inputMode="numeric"
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
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-[#737373] mb-1.5">City / Region</label>
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

      {/* Forgot Password Modal */}
      {showForgotPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fade-in">
          <div 
            ref={forgotPasswordModalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-reset-password-title"
            className="bg-white rounded-xl shadow-2xl border border-[#E5E5E5] max-w-md w-full p-6 relative"
          >
            <button
              type="button"
              onClick={() => setShowForgotPasswordModal(false)}
              className="absolute top-4 right-4 text-[#737373] hover:text-[#171717] text-lg font-bold w-8 h-8 rounded-full flex items-center justify-center hover:bg-neutral-100 transition-colors cursor-pointer"
            >
              ✕
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-[#B89753]/10 text-[#8F7137] flex items-center justify-center shrink-0">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h3 id="account-reset-password-title" className="font-serif font-bold text-[#171717] text-base">Reset Your Password</h3>
                <p className="text-xs text-[#737373]">Enter your registered email address to receive a password reset link.</p>
              </div>
            </div>

            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[#737373] mb-1">
                  Email Address *
                </label>
                <div className="relative flex items-center">
                  <Mail className="w-4 h-4 absolute left-3.5 text-[#737373]" />
                  <input
                    type="email"
                    required
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full pl-10 pr-3.5 py-2.5 bg-[#F8F8F6] text-xs text-[#171717] rounded-lg border border-[#E5E5E5] focus:bg-white focus:border-[#B89753] focus:outline-none transition-all"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForgotPasswordModal(false)}
                  className="px-4 py-2 rounded-lg border border-[#E5E5E5] text-[#171717] text-xs font-bold hover:bg-neutral-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSendingReset}
                  className="px-5 py-2 rounded-lg bg-[#171717] hover:bg-black text-white text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-2"
                >
                  {isSendingReset ? 'Sending Link...' : 'Send Reset Link'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Native Firebase Phone Auth Modal */}
      <PhoneAuthModal
        isOpen={showPhoneAuthModal}
        onClose={() => setShowPhoneAuthModal(false)}
        language={language}
        initialPhone={profilePhone}
      />

      {/* Security OTP Modal */}
      <OTPModal
        isOpen={showOtpModal}
        onClose={() => setShowOtpModal(false)}
        targetContact={otpTargetContact}
        actionType={otpActionType}
        language={language}
        onVerifySuccess={async () => {
          if (pendingAuthAction) {
            await pendingAuthAction();
          }
        }}
      />
    </div>
  );
};
