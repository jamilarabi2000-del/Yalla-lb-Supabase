import React, { useState } from 'react';
import { useShop } from '../context/ShopContext';
import { SellerDashboard } from './SellerDashboard';
import { OTPModal } from './OTPModal';
import { 
  Store, 
  ShieldCheck, 
  Mail, 
  Lock, 
  Eye, 
  EyeOff, 
  ArrowLeft, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles, 
  Building2, 
  Phone, 
  User, 
  Send, 
  ArrowRight,
  LogOut,
  HelpCircle,
  ExternalLink,
  ChevronRight,
  Loader2,
  Smartphone,
  BadgeCheck
} from 'lucide-react';
import { LebanonFlag } from './LebanonFlag';
import { doc, getDoc } from 'firebase/firestore';
import { db, auth, signInWithEmailAndPassword, signOut, functionsInstance, httpsCallable } from '../firebase';
import { normalizeLebanesePhone, isValidLebanesePhone } from '../utils/phoneUtils';
import { clearAdminMfaSession } from '../utils/adminMfa';

export const SellerLoginView: React.FC = () => {
  const { 
    user, 
    firebaseUser, 
    isAdminUser, 
    isSellerUser,
    sellerId,
    signOutUser, 
    resetPassword, 
    showToast, 
    setActiveTab, 
    goBack, 
    language, 
    t,
    sellers,
    updateUser
  } = useShop();

  const isArabic = language === 'ar';

  // Login form state - 3 required seller credentials: Email/Gmail, Mobile Phone, and Password
  const [authEmail, setAuthEmail] = useState('');
  const [authPhone, setAuthPhone] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Tab mode: 'login' | 'apply'
  const [activePortalTab, setActivePortalTab] = useState<'login' | 'apply'>('login');

  // Forgot password modal
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [isSendingReset, setIsSendingReset] = useState(false);

  // Admin preview selector state
  const [adminSelectedSellerId, setAdminSelectedSellerId] = useState<string>('');

  // Seller Signup Application Form State - STRICTLY the 6 required fields:
  const [showSellerOtpModal, setShowSellerOtpModal] = useState(false);
  // 1. Seller Company
  // 2. First Name
  // 3. Middle Name
  // 4. Last Name
  // 5. Email
  // 6. Mobile Number
  const [appSellerCompany, setAppSellerCompany] = useState('');
  const [appFirstName, setAppFirstName] = useState('');
  const [appMiddleName, setAppMiddleName] = useState('');
  const [appLastName, setAppLastName] = useState('');
  const [appEmail, setAppEmail] = useState('');
  const [appPhone, setAppPhone] = useState('');
  const [isSubmittingApp, setIsSubmittingApp] = useState(false);
  const [appSubmittedSuccess, setAppSubmittedSuccess] = useState(false);

  const [pendingSellerLoginAction, setPendingSellerLoginAction] = useState<(() => Promise<void>) | null>(null);

  const handleSellerSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    
    const email = authEmail.trim();
    const phone = authPhone.trim();
    const password = authPassword;

    // 1. Validate inputs (Email and Password required; phone is only required for non-admin sellers)
    if (!email) {
      setErrorMessage(isArabic ? 'يرجى إدخال البريد الإلكتروني.' : 'Please enter your email address.');
      return;
    }

    if (!password || password.length < 6) {
      setErrorMessage(isArabic ? 'يرجى إدخال كلمة المرور (6 أحرف على الأقل).' : 'Please enter your password (minimum 6 characters).');
      return;
    }

    setIsLoading(true);
    try {
      // 2. Authenticate against Firebase Auth with Email and Password
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const uid = userCredential.user.uid;

      // 3. Verify custom claims authoritatively from Firebase Auth
      const tokenResult = await userCredential.user.getIdTokenResult(true);
      const hasAdminClaim = Boolean(tokenResult.claims.admin === true);
      const hasSellerClaim = Boolean(tokenResult.claims.seller === true);
      const claimSellerId = typeof tokenResult.claims.sellerId === 'string' ? tokenResult.claims.sellerId : null;

      // 4. IF ADMIN: Route admin through the two-step verification step-up flow
      if (hasAdminClaim) {
        clearAdminMfaSession(uid);
        showToast(
          isArabic ? 'مرحباً بك، مشرف النظام! يرجى إكمال التحقق بخطوتين.' : 'Welcome, Administrator! Please complete two-step verification.',
          'success'
        );
        setActiveTab('admin');
        setIsLoading(false);
        return;
      }

      // 5. IF NOT ADMIN: Proceed with Seller Merchant Portal checks (require phone, seller claim, matched seller, phone verification, email verification)
      if (!phone) {
        await signOut(auth);
        const phoneReqMsg = isArabic ? 'يرجى إدخال رقم الهاتف المحمول المعتمد للبائع.' : 'Please enter your registered seller mobile phone number.';
        setErrorMessage(phoneReqMsg);
        setIsLoading(false);
        return;
      }

      const normPhone = normalizeLebanesePhone(phone);
      if (!normPhone.isValid) {
        await signOut(auth);
        const invalidPhoneMsg = isArabic 
          ? 'يرجى إدخال رقم هاتف محمول لبناني صحيح من 8 أرقام (مثال: 70 123 456).'
          : 'Please enter a valid 8-digit Lebanese mobile phone number (e.g. 70 123 456).';
        setErrorMessage(invalidPhoneMsg);
        setIsLoading(false);
        return;
      }

      if (!hasSellerClaim) {
        await signOut(auth);
        const deniedMsg = isArabic
          ? 'عذراً، هذا الحساب ليس لديه صلاحيات البائع المعتمد. يرجى تسجيل الدخول بحساب بائع معتمد.'
          : 'Access Denied: This account is not provisioned with authorized seller privileges.';
        setErrorMessage(deniedMsg);
        showToast(deniedMsg, 'error');
        setIsLoading(false);
        return;
      }

      // Email verification enforcement (OWASP / Enterprise Standard)
      if (!userCredential.user.emailVerified) {
        await signOut(auth);
        const unverifiedMsg = isArabic
          ? 'يرجى تأكيد بريدك الإلكتروني عبر الرابط المرسل إلى بريدك قبل تسجيل الدخول إلى بوابة البائعين.'
          : 'Please verify your email address via the link sent to your inbox before accessing the Seller Merchant Portal.';
        setErrorMessage(unverifiedMsg);
        showToast(unverifiedMsg, 'warning');
        setIsLoading(false);
        return;
      }

      // Fetch User Profile from Firestore
      const userDocRef = doc(db, 'users', uid);
      const userSnap = await getDoc(userDocRef);
      const userData = userSnap.exists() ? userSnap.data() : null;

      // Find matching Seller exclusively via secure provisioned credentials
      const matchedSeller = sellers.find(s => 
        (claimSellerId && s.id === claimSellerId) ||
        s.accountUid === uid ||
        (s.accountEmail && s.accountEmail.toLowerCase() === email.toLowerCase())
      );

      if (!matchedSeller) {
        await signOut(auth);
        const noSellerMsg = isArabic
          ? 'لم يتم العثور على شركة أو حساب بائع معتمد مرتبط بهذا البريد الإلكتروني. يرجى التواصل مع إدارة منصة يلا.'
          : 'No authorized seller company account found matching this email. Please contact Yalla marketplace administration.';
        setErrorMessage(noSellerMsg);
        showToast(noSellerMsg, 'error');
        setIsLoading(false);
        return;
      }

      // Gather registered candidate phone numbers for identity verification
      const registeredPhones: string[] = [
        userData?.phone,
        matchedSeller?.contactPhone,
        userCredential.user.phoneNumber
      ].filter(Boolean) as string[];

      // Security Check: Mobile Phone Number Match
      if (registeredPhones.length > 0) {
        const isPhoneMatched = registeredPhones.some(p => {
          const normReg = normalizeLebanesePhone(p);
          return normReg.cleanDigits === normPhone.cleanDigits;
        });

        if (!isPhoneMatched) {
          await signOut(auth);
          const failMsg = isArabic 
            ? `فشل التحقق الأمني: رقم الهاتف المحمول (${normPhone.formatted}) لا يطابق رقم هاتف البائع المسجل لهذا الحساب.`
            : `Security Verification Failed: The mobile phone number entered (${normPhone.formatted}) does not match the registered seller phone on file for this account.`;
          setErrorMessage(failMsg);
          showToast(failMsg, 'error');
          setIsLoading(false);
          return;
        }
      }

      showToast(
        isArabic 
          ? `مرحباً بك في بوابة البائعين، ${matchedSeller?.nameAr || matchedSeller?.nameEn || userData?.name || 'أيها البائع'}!` 
          : `Welcome to your Seller Merchant Portal, ${matchedSeller?.nameEn || userData?.name || 'Seller'}!`, 
        'success'
      );
    } catch (err: any) {
      console.error('[SellerLoginView] Sign-in error:', err);
      const code = err?.code || '';
      let msg = isArabic ? 'تعذر تسجيل الدخول. يرجى التحقق من بياناتك.' : 'Failed to sign in. Please verify your credentials.';
      if (code === 'auth/user-not-found' || code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
        msg = isArabic ? 'البريد الإلكتروني (Gmail) أو كلمة المرور غير صحيحة.' : 'Invalid Gmail address or password. Please verify your credentials.';
      } else if (code === 'auth/too-many-requests') {
        msg = isArabic ? 'محاولات كثيرة خاطئة. يرجى الانتظار قليلاً أو إعادة تعيين كلمة المرور.' : 'Too many failed attempts. Please wait a moment or reset your password.';
      } else if (code === 'auth/invalid-email') {
        msg = isArabic ? 'صيغة البريد الإلكتروني غير صحيحة.' : 'Invalid email format.';
      }
      setErrorMessage(msg);
      showToast(msg, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = (forgotEmail || authEmail).trim().toLowerCase();
    if (!target) {
      showToast(isArabic ? 'يرجى إدخال البريد الإلكتروني' : 'Please enter your email address', 'warning');
      return;
    }
    setIsSendingReset(true);
    try {
      // 1. Verify if target belongs to a recognized approved seller merchant account
      const isAuthorizedSeller = sellers.some(s => 
        (s.accountEmail && s.accountEmail.toLowerCase() === target) ||
        ((s as any).email && (s as any).email.toLowerCase() === target)
      );

      if (!isAuthorizedSeller) {
        const errorMsg = isArabic 
          ? `عذراً، البريد الإلكتروني (${target}) غير مسجل كبائع معتمد في النظام. يرجى تقديم طلب انتساب كبائع.`
          : `Access Denied: The email "${target}" is not registered as an authorized seller in our database. Please submit a seller signup request.`;
        showToast(errorMsg, 'error');
        return;
      }

      await resetPassword(target);
      setShowForgotModal(false);
    } catch (err: any) {
      showToast(err.message || 'Error sending password reset email', 'warning');
    } finally {
      setIsSendingReset(false);
    }
  };

  const handleApplicationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const company = appSellerCompany.trim();
    const fName = appFirstName.trim();
    const mName = appMiddleName.trim();
    const lName = appLastName.trim();
    const email = appEmail.trim().toLowerCase();
    const phone = appPhone.trim();

    if (!company) {
      showToast(isArabic ? 'يرجى إدخال اسم شركة أو متجر البائع.' : 'Please enter the seller company name.', 'warning');
      return;
    }
    if (!fName) {
      showToast(isArabic ? 'يرجى إدخال الاسم الأول.' : 'Please enter your first name.', 'warning');
      return;
    }
    if (!mName) {
      showToast(isArabic ? 'يرجى إدخال اسم الأب (الاسم الأوسط).' : 'Please enter your middle name.', 'warning');
      return;
    }
    if (!lName) {
      showToast(isArabic ? 'يرجى إدخال الشهرة (اسم العائلة).' : 'Please enter your last name.', 'warning');
      return;
    }
    if (!email) {
      showToast(isArabic ? 'يرجى إدخال البريد الإلكتروني.' : 'Please enter your email address.', 'warning');
      return;
    }
    if (!phone) {
      showToast(isArabic ? 'يرجى إدخال رقم الهاتف المحمول.' : 'Please enter your mobile phone number.', 'warning');
      return;
    }

    const normPhone = normalizeLebanesePhone(phone);
    if (!normPhone.isValid) {
      showToast(
        isArabic 
          ? 'يرجى إدخال رقم هاتف محمول لبناني صحيح من 8 أرقام (مثال: 70 123 456 أو 03 123 456).'
          : 'Please enter a valid 8-digit Lebanese mobile phone number (e.g. 70 123 456 or 03 123 456).',
        'warning'
      );
      return;
    }

    const fullName = `${fName} ${mName} ${lName}`.trim();

    setIsSubmittingApp(true);
    try {
      if (functionsInstance) {
        const submitSellerAppFn = httpsCallable<any, { success: boolean; applicationId: string }>(
          functionsInstance,
          'submitSellerApplication'
        );
        await submitSellerAppFn({
          sellerCompany: company,
          workshopName: company,
          firstName: fName,
          middleName: mName || undefined,
          lastName: lName,
          contactName: fullName,
          phone: normPhone.formatted,
          email: email.trim().toLowerCase(),
        });
      } else {
        throw new Error('Firebase Functions service unavailable. Please check your internet connection.');
      }

      setAppSubmittedSuccess(true);
      showToast(
        isArabic 
          ? 'Mabrouk! تم استلام طلب تسجيل البائع بنجاح وسيتواصل معك فريق يالا قريباً.' 
          : 'Mabrouk! Your seller signup application was submitted successfully.', 
        'success'
      );
    } catch (err: any) {
      console.error('[SellerLoginView] Application error:', err);
      showToast(err.message || 'Failed to submit application. Please try again.', 'warning');
    } finally {
      setIsSubmittingApp(false);
    }
  };

  // If user is logged in as a seller, render the complete Seller Dashboard
  if (isSellerUser) {
    return (
      <div className="min-h-screen bg-slate-50 pb-24">
        {/* Seller Portal Top Header */}
        <div className="bg-slate-900 text-white border-b border-slate-800 py-3.5 px-4 sm:px-6 lg:px-8 sticky top-0 z-40 shadow-md">
          <div className="max-w-screen-2xl mx-auto flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setActiveTab('home')}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer border border-slate-700"
              >
                <ArrowLeft className={`w-3.5 h-3.5 ${isArabic ? 'rotate-180' : ''}`} />
                <span>{isArabic ? 'المتجر العام' : 'Public Store'}</span>
              </button>
              <div className="flex items-center gap-2 px-3 py-1 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold">
                <Store className="w-3.5 h-3.5 text-amber-400" />
                <span>{user.name || 'Seller Store'}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-200 font-mono uppercase">
                  {sellerId || 'Seller Portal'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-bold text-slate-200">{firebaseUser?.email}</p>
                <p className="text-[10px] text-emerald-400 flex items-center justify-end gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>{isArabic ? 'حساب بائع موثق' : 'Verified Seller Session'}</span>
                </p>
              </div>

              <button
                onClick={signOutUser}
                className="px-3.5 py-1.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/50 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>{isArabic ? 'تسجيل الخروج' : 'Sign Out'}</span>
              </button>
            </div>
          </div>
        </div>

        <SellerDashboard />
      </div>
    );
  }

  return (
    <div className="min-h-[88vh] bg-gradient-to-b from-slate-900 via-[#121624] to-slate-950 text-slate-100 flex flex-col justify-between py-8 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      
      {/* Background Decorative Ambient Lebanese Gold & Cedar Patterns */}
      <div className="absolute inset-0 bg-[radial-gradient(#c5a059_1px,transparent_1px)] [background-size:32px_32px] opacity-10 pointer-events-none" />
      <div className="absolute top-10 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Header Navigation */}
      <div className="max-w-5xl w-full mx-auto flex items-center justify-between z-10 mb-8">
        <button
          onClick={() => setActiveTab('home')}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer backdrop-blur-md"
        >
          <ArrowLeft className={`w-3.5 h-3.5 ${isArabic ? 'rotate-180' : ''}`} />
          <span>{isArabic ? 'العودة للمتجر الرئيسي' : 'Back to Marketplace'}</span>
        </button>

        <div className="flex items-center gap-2">
          <LebanonFlag className="w-5 h-3.5" />
          <span className="text-[11px] font-bold text-amber-400/90 tracking-widest uppercase">
            Yalla.lb Seller Collective
          </span>
        </div>
      </div>

      {/* Main Authentication & Application Card */}
      <div className="max-w-xl w-full mx-auto z-10">
        
        {/* Admin Superuser Alert Banner */}
        {isAdminUser && (
          <div className="mb-6 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 backdrop-blur-md space-y-3 animate-fadeIn">
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-black text-amber-300 uppercase tracking-wider">
                  {isArabic ? 'جلسة المشرف العام (Super Admin)' : 'Super Administrator Session Detected'}
                </h4>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                  {isArabic 
                    ? 'أنت مسجل حالياً بحساب المشرف. يمكنك الدخول مباشرة للوحة تحكم أي بائع مسجل لمعاينة متجره، أو الانتقال للوحة الإدارة العامة.'
                    : 'You are signed in with Marketplace Administrator privileges. You can preview the merchant dashboard of any registered seller below or jump to the main Admin Console.'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-amber-500/20">
              <button
                onClick={() => setActiveTab('admin')}
                className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold uppercase tracking-wider rounded-xl transition-all shadow-md cursor-pointer"
              >
                {isArabic ? 'فتح لوحة الإدارة الكاملة' : 'Open Admin Panel'}
              </button>

              {sellers.length > 0 && (
                <div className="flex items-center gap-2">
                  <select
                    value={adminSelectedSellerId}
                    onChange={(e) => {
                      const selId = e.target.value;
                      setAdminSelectedSellerId(selId);
                      if (selId) {
                        const target = sellers.find(s => s.id === selId);
                        if (target) {
                          updateUser({
                            role: 'seller',
                            sellerId: target.id,
                            name: target.nameEn
                          });
                          showToast(`Emulating seller portal for "${target.nameEn}"`, 'info');
                        }
                      }
                    }}
                    className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-hidden focus:border-amber-400 cursor-pointer"
                  >
                    <option value="">⚡ {isArabic ? 'معاينة لوحة بائع محدد...' : 'Preview specific seller portal...'}</option>
                    {sellers.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.nameEn} ({s.id})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Customer Account Notice (if logged in as normal customer) */}
        {!isAdminUser && firebaseUser && !isSellerUser && (
          <div className="mb-6 p-4 rounded-2xl bg-indigo-950/50 border border-indigo-500/30 backdrop-blur-md flex items-center justify-between gap-4 animate-fadeIn">
            <div>
              <p className="text-xs font-bold text-indigo-200">
                {isArabic ? 'أنت مسجل حالياً بحساب زبون:' : 'Currently signed in with customer account:'}
              </p>
              <p className="text-xs text-indigo-300/80 font-mono mt-0.5 truncate max-w-[280px]">
                {firebaseUser.email}
              </p>
            </div>
            <button
              onClick={signOutUser}
              className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap shadow-sm"
            >
              {isArabic ? 'تبديل الحساب' : 'Switch Account'}
            </button>
          </div>
        )}

        {/* Main Card */}
        <div className="bg-slate-900/90 border border-amber-500/20 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl space-y-6">
          
          {/* Card Header Branding */}
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-600/30 via-amber-500/20 to-transparent border border-amber-500/40 text-amber-400 shadow-inner mb-1">
              <Store className="w-7 h-7" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white font-serif">
              {isArabic ? 'بوابة البائعين والتجار' : 'Seller Merchant Portal'}
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto leading-relaxed">
              {isArabic
                ? 'إدارة مخزون متجر البائع، تحديث المنتجات والأسعار، ومتابعة تجهيز الطلبات والشحن في لبنان.'
                : 'Manage your seller company inventory, publish authentic products, and track fulfillment dispatches across Lebanon.'}
            </p>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-slate-950/80 border border-slate-800">
            <button
              type="button"
              id="seller-portal-tab-login"
              onClick={() => { setActivePortalTab('login'); setErrorMessage(''); }}
              className={`flex-1 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-2 ${
                activePortalTab === 'login'
                  ? 'bg-gradient-to-r from-amber-600 to-amber-500 text-slate-950 shadow-md font-black'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              <span>{isArabic ? 'تسجيل دخول البائع' : 'Seller Sign In'}</span>
            </button>
            <button
              type="button"
              id="seller-portal-tab-apply"
              onClick={() => { setActivePortalTab('apply'); setErrorMessage(''); }}
              className={`flex-1 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-2 ${
                activePortalTab === 'apply'
                  ? 'bg-gradient-to-r from-amber-600 to-amber-500 text-slate-950 shadow-md font-black'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isArabic ? 'تسجيل حساب بائع جديد' : 'Seller Sign Up'}</span>
            </button>
          </div>

          {/* TAB 1: SELLER LOGIN FORM (GMAIL/EMAIL + MOBILE + PASSWORD) */}
          {activePortalTab === 'login' && (
            <form onSubmit={handleSellerSignIn} className="space-y-4 pt-2">
              
              {errorMessage && (
                <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5 animate-fadeIn">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{errorMessage}</span>
                </div>
              )}

              {/* Requirement Summary Note */}
              <div className="p-3 rounded-2xl bg-amber-500/5 border border-amber-500/20 text-slate-300 text-xs flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="text-[11px] text-amber-200/90 font-medium">
                  {isArabic 
                    ? 'تسجيل الدخول يتطلب: بريد Gmail/الإيميل للبائع، رقم الهاتف المحمول اللبناني المعتمد، وكلمة المرور.' 
                    : 'Seller login requires: Your registered Gmail / Email, Lebanese mobile phone number, and password.'}
                </span>
              </div>

              {/* 1. Seller Gmail / Email Address */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    {isArabic ? '1. بريد Gmail أو البريد الإلكتروني للبائع *' : '1. Seller Gmail / Email Address *'}
                  </label>
                  <span className="text-[10px] text-amber-400/80 font-mono font-bold">Gmail / Email</span>
                </div>
                <div className="relative flex items-center">
                  <Mail className="absolute left-3.5 w-4 h-4 text-slate-500 pointer-events-none" />
                  <input
                    type="email"
                    id="seller-login-email"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    placeholder="seller@gmail.com"
                    required
                    className="w-full pl-10 pr-4 py-3 bg-slate-950/60 text-white placeholder-slate-600 text-sm rounded-xl border border-slate-800 focus:outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 transition-all font-mono"
                  />
                </div>
              </div>

              {/* 2. Seller Mobile Phone Number */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    {isArabic ? '2. رقم الهاتف المحمول المعتمد للبائع *' : '2. Seller Mobile Phone Number *'}
                  </label>
                  <span className="text-[10px] text-emerald-400 font-mono font-bold">+961 Lebanon</span>
                </div>
                <div className="relative flex items-center">
                  <div className="absolute left-3 flex items-center gap-1.5 text-xs text-slate-400 font-bold font-mono pointer-events-none border-r border-slate-800 pr-2.5">
                    <LebanonFlag className="w-4 h-3 rounded-xs shadow-xs" />
                    <span>+961</span>
                  </div>
                  <input
                    type="tel"
                    id="seller-login-phone"
                    value={authPhone}
                    onChange={(e) => setAuthPhone(e.target.value)}
                    placeholder="70 123 456 or 03 123 456"
                    className="w-full pl-22 pr-4 py-3 bg-slate-950/60 text-white placeholder-slate-600 text-sm rounded-xl border border-slate-800 focus:outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 transition-all font-mono tracking-wider"
                  />
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  {isArabic ? 'أدخل رقمك اللبناني المكون من 8 أرقام (مثال: 70 123 456)' : 'Enter your registered 8-digit Lebanese mobile number (e.g. 70 123 456)'}
                </p>
              </div>

              {/* 3. Password */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    {isArabic ? '3. كلمة المرور *' : '3. Password *'}
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setForgotEmail(authEmail);
                      setShowForgotModal(true);
                    }}
                    className="text-[11px] font-bold text-amber-400 hover:text-amber-300 transition-colors cursor-pointer"
                  >
                    {isArabic ? 'نسيت كلمة المرور؟' : 'Forgot Password?'}
                  </button>
                </div>
                <div className="relative flex items-center">
                  <Lock className="absolute left-3.5 w-4 h-4 text-slate-500 pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="seller-login-password"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={6}
                    className="w-full pl-10 pr-10 py-3 bg-slate-950/60 text-white placeholder-slate-600 text-sm rounded-xl border border-slate-800 focus:outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 transition-all font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 p-1 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Primary Sign In Action Button */}
              <button
                type="submit"
                id="seller-login-submit-btn"
                disabled={isLoading}
                className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black text-xs uppercase tracking-wider transition-all duration-300 shadow-lg shadow-amber-500/20 hover:shadow-amber-500/30 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed mt-3"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                    <span>{isArabic ? 'جاري التحقق من بيانات البائع...' : 'Authenticating Seller Credentials...'}</span>
                  </>
                ) : (
                  <>
                    <span>{isArabic ? 'تسجيل الدخول لبوابة البائع' : 'Sign In to Seller Portal'}</span>
                    <ArrowRight className={`w-4 h-4 ${isArabic ? 'rotate-180' : ''}`} />
                  </>
                )}
              </button>

              {/* Strict Seller Access Policy Notice */}
              <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 text-[11px] text-slate-400 space-y-1.5 mt-2">
                <div className="flex items-center gap-2 text-amber-400 font-bold">
                  <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>{isArabic ? 'سياسة اعتماد حسابات البائعين' : 'Seller Account Policy'}</span>
                </div>
                <p className="leading-relaxed text-slate-300">
                  {isArabic 
                    ? 'تسجيل الدخول متاح حصرياً للشركات والبائعين المعتمدين والمُنشأة حساباتهم من قبل إدارة المنصة. إذا كنت بائعاً جديداً، يرجى تقديم طلبك عبر تبويب "تسجيل حساب بائع جديد" بالأعلى ليتم مراجعته وتزويدك ببيانات الدخول.'
                    : 'Access is strictly limited to verified sellers approved or created by Yalla Lebanon administration. If you are a new seller, please submit a signup request under "Seller Sign Up" to receive your credentials upon review.'}
                </p>
              </div>

              {/* Support & Notice Footer */}
              <div className="pt-4 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
                <div className="flex items-center gap-1.5 text-[11px]">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>{isArabic ? 'بوابة البائعين الرسمية المشفرة' : 'Encrypted Seller Workspace'}</span>
                </div>
                <a
                  href="https://wa.me/96170889234?text=Hello%20Yalla%20Support,%20I%20need%20help%20with%20my%20Seller%20Account"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] font-bold text-amber-400 hover:text-amber-300 inline-flex items-center gap-1 transition-colors"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>{isArabic ? 'المساعدة عبر واتساب' : 'Need Login Assistance?'}</span>
                </a>
              </div>
            </form>
          )}

          {/* TAB 2: SELLER SIGN UP FORM (EXCLUSIVELY 6 REQUIRED FIELDS) */}
          {activePortalTab === 'apply' && (
            <div className="space-y-4 pt-2">
              {appSubmittedSuccess ? (
                <div className="p-6 rounded-2xl bg-emerald-950/40 border border-emerald-500/40 text-center space-y-4 animate-fadeIn">
                  <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-7 h-7" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-emerald-200">
                      {isArabic ? 'ألف مبروك! تم استلام طلب تسجيل البائع' : 'Mabrouk! Your Seller Application is Received'}
                    </h3>
                    <p className="text-xs text-emerald-300/80 mt-1.5 leading-relaxed max-w-md mx-auto">
                      {isArabic
                        ? 'شكراً لتسجيلك كبائع على منصة يالا. سيقوم فريق الإدارة بمراجعة طلبك وإرسال بيانات تسجيل الدخول الخاصة بحسابك عبر واتساب والبريد الإلكتروني.'
                        : 'Thank you for signing up to sell on Yalla Lebanon. Our administration will review your details and dispatch your portal login credentials via WhatsApp and Email.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setAppSubmittedSuccess(false);
                      setActivePortalTab('login');
                    }}
                    className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-md"
                  >
                    {isArabic ? 'العودة لصفحة الدخول' : 'Return to Seller Sign In'}
                  </button>
                </div>
              ) : (
                <form onSubmit={handleApplicationSubmit} className="space-y-4">
                  
                  {/* Simplified Requirement Card */}
                  <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-slate-300 text-xs space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-amber-300">
                      <Sparkles className="w-4 h-4 text-amber-400" />
                      <span>{isArabic ? 'تسجيل حساب بائع جديد مبسط' : 'Simplified Seller Sign Up'}</span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-slate-300">
                      {isArabic
                        ? 'فقط اسم الشركة، الاسم الأول، اسم الأب، اسم العائلة، البريد الإلكتروني ورقم الهاتف مطلوبة للتسجيل.'
                        : 'Only seller company, first name, middle name, last name, email, and mobile phone number are required.'}
                    </p>
                  </div>

                  {/* 1. Seller Company (Required) */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300">
                        {isArabic ? '1. اسم شركة / متجر البائع *' : '1. Seller Company Name *'}
                      </label>
                      <span className="text-[10px] text-amber-400 font-bold uppercase">Required</span>
                    </div>
                    <div className="relative flex items-center">
                      <Building2 className="absolute left-3.5 w-4 h-4 text-slate-500 pointer-events-none" />
                      <input
                        type="text"
                        id="seller-signup-company"
                        value={appSellerCompany}
                        onChange={(e) => setAppSellerCompany(e.target.value)}
                        placeholder="e.g. Cedar Peak Trading SAL / Al-Koura Organics"
                        required
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-950/60 text-white placeholder-slate-600 text-xs sm:text-sm rounded-xl border border-slate-800 focus:outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 transition-all font-medium"
                      />
                    </div>
                  </div>

                  {/* 2, 3, 4: First Name, Middle Name, Last Name */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* First Name */}
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                        {isArabic ? '2. الاسم الأول *' : '2. First Name *'}
                      </label>
                      <div className="relative flex items-center">
                        <User className="absolute left-3 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
                        <input
                          type="text"
                          id="seller-signup-firstname"
                          value={appFirstName}
                          onChange={(e) => setAppFirstName(e.target.value)}
                          placeholder="e.g. Jamil"
                          required
                          className="w-full pl-9 pr-3 py-2.5 bg-slate-950/60 text-white placeholder-slate-600 text-xs rounded-xl border border-slate-800 focus:outline-hidden focus:border-amber-500 font-medium"
                        />
                      </div>
                    </div>

                    {/* Middle Name */}
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                        {isArabic ? '3. اسم الأب (الأوسط) *' : '3. Middle Name *'}
                      </label>
                      <div className="relative flex items-center">
                        <User className="absolute left-3 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
                        <input
                          type="text"
                          id="seller-signup-middlename"
                          value={appMiddleName}
                          onChange={(e) => setAppMiddleName(e.target.value)}
                          placeholder="e.g. Kamal"
                          required
                          className="w-full pl-9 pr-3 py-2.5 bg-slate-950/60 text-white placeholder-slate-600 text-xs rounded-xl border border-slate-800 focus:outline-hidden focus:border-amber-500 font-medium"
                        />
                      </div>
                    </div>

                    {/* Last Name */}
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                        {isArabic ? '4. الشهرة (العائلة) *' : '4. Last Name *'}
                      </label>
                      <div className="relative flex items-center">
                        <User className="absolute left-3 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
                        <input
                          type="text"
                          id="seller-signup-lastname"
                          value={appLastName}
                          onChange={(e) => setAppLastName(e.target.value)}
                          placeholder="e.g. Arabi"
                          required
                          className="w-full pl-9 pr-3 py-2.5 bg-slate-950/60 text-white placeholder-slate-600 text-xs rounded-xl border border-slate-800 focus:outline-hidden focus:border-amber-500 font-medium"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 5 & 6: Email & Mobile Number */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Email */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300">
                          {isArabic ? '5. البريد الإلكتروني *' : '5. Email Address *'}
                        </label>
                      </div>
                      <div className="relative flex items-center">
                        <Mail className="absolute left-3 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
                        <input
                          type="email"
                          id="seller-signup-email"
                          value={appEmail}
                          onChange={(e) => setAppEmail(e.target.value)}
                          placeholder="seller@gmail.com"
                          required
                          className="w-full pl-9 pr-3 py-2.5 bg-slate-950/60 text-white placeholder-slate-600 text-xs rounded-xl border border-slate-800 focus:outline-hidden focus:border-amber-500 font-mono"
                        />
                      </div>
                    </div>

                    {/* Mobile Phone Number */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300">
                          {isArabic ? '6. رقم الهاتف المحمول *' : '6. Mobile Number *'}
                        </label>
                        <span className="text-[10px] text-emerald-400 font-mono font-bold">+961</span>
                      </div>
                      <div className="relative flex items-center">
                        <div className="absolute left-2.5 flex items-center gap-1 text-[11px] text-slate-400 font-bold font-mono pointer-events-none border-r border-slate-800 pr-2">
                          <LebanonFlag className="w-3.5 h-2.5 rounded-xs" />
                          <span>+961</span>
                        </div>
                        <input
                          type="tel"
                          id="seller-signup-phone"
                          value={appPhone}
                          onChange={(e) => setAppPhone(e.target.value)}
                          placeholder="70 123 456"
                          required
                          className="w-full pl-20 pr-3 py-2.5 bg-slate-950/60 text-white placeholder-slate-600 text-xs rounded-xl border border-slate-800 focus:outline-hidden focus:border-amber-500 font-mono tracking-wide"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Submission Action */}
                  <button
                    type="submit"
                    id="seller-apply-submit-btn"
                    disabled={isSubmittingApp}
                    className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black text-xs uppercase tracking-wider transition-all duration-300 shadow-lg shadow-amber-500/20 hover:shadow-amber-500/30 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-3"
                  >
                    {isSubmittingApp ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                        <span>{isArabic ? 'جاري إرسال طلب البائع...' : 'Submitting Seller Application...'}</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>{isArabic ? 'إرسال طلب تسجيل البائع' : 'Submit Seller Application'}</span>
                      </>
                    )}
                  </button>

                  <div className="text-center pt-2">
                    <p className="text-[11px] text-slate-500">
                      {isArabic
                        ? 'هل تملك حساب بائع معتمد بالفعل؟'
                        : 'Already have an approved seller account?'}{' '}
                      <button
                        type="button"
                        onClick={() => setActivePortalTab('login')}
                        className="text-amber-400 font-bold hover:underline cursor-pointer"
                      >
                        {isArabic ? 'تسجيل الدخول' : 'Sign In'}
                      </button>
                    </p>
                  </div>
                </form>
              )}
            </div>
          )}

        </div>

      </div>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-400" />
                <span>{isArabic ? 'استعادة كلمة مرور البائع' : 'Reset Seller Password'}</span>
              </h3>
              <button
                onClick={() => setShowForgotModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              {isArabic
                ? 'أدخل البريد الإلكتروني المسجل لحساب البائع وسنرسل لك رابطاً آمناً لإعادة تعيين كلمة المرور فوراً.'
                : 'Enter your registered seller account email. We will send an official, secure password reset link.'}
            </p>

            <form onSubmit={handlePasswordResetSubmit} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  {isArabic ? 'البريد الإلكتروني' : 'Email Address'}
                </label>
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="seller@yalla.lb"
                  required
                  className="w-full px-4 py-2.5 bg-slate-950 text-white text-sm rounded-xl border border-slate-800 focus:outline-hidden focus:border-amber-500 font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForgotModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors cursor-pointer"
                >
                  {isArabic ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={isSendingReset}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold uppercase tracking-wider transition-all shadow-md cursor-pointer disabled:opacity-50"
                >
                  {isSendingReset ? (isArabic ? 'جاري الإرسال...' : 'Sending...') : (isArabic ? 'إرسال الرابط' : 'Send Reset Link')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bottom Footer Note */}
      <div className="max-w-5xl w-full mx-auto text-center z-10 text-[11px] text-slate-500 pt-6">
        <span>© {new Date().getFullYear()} Yalla.lb • Lebanese Seller Merchant Network & Terroir Collective</span>
      </div>

      {/* Security OTP Modal */}
      <OTPModal
        isOpen={showSellerOtpModal}
        onClose={() => setShowSellerOtpModal(false)}
        targetContact={authPhone ? `+961 ${authPhone}` : authEmail}
        actionType="seller"
        language={isArabic ? 'ar' : 'en'}
        onVerifySuccess={async () => {
          if (pendingSellerLoginAction) {
            await pendingSellerLoginAction();
          }
        }}
      />
    </div>
  );
};
