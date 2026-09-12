import React, { useState, useEffect } from 'react';
import { useShop } from '../context/ShopContext';
import { useDialog } from '../hooks/useDialog';
import { PaymentMethod } from '../types';
import { LEBANON_REGIONS, GovernorateOption, LBP_USD_RATE } from '../data/regions';
import { calcDeliveryFeeUSD } from '../lib/delivery';
import { CustomBlocksRenderer } from './CustomBlocksRenderer';
import { LebanonFlag } from './LebanonFlag';
import { OTPModal } from './OTPModal';
import { PhoneAuthModal } from './PhoneAuthModal';
import { generateIdempotencyKey } from '../utils/uuid';
import { 
  ShieldCheck, 
  Truck, 
  CreditCard, 
  Banknote, 
  CheckCircle2, 
  Clock, 
  Building2, 
  Lock,
  MapPin,
  Sparkles,
  PhoneCall,
  Smartphone,
  ArrowLeft,
  LogIn,
  UserPlus,
  LogOut,
  UserCheck,
  AlertCircle,
  Mail,
  Check,
  Tag,
  Percent,
  EyeOff,
  Eye,
  KeyRound
} from 'lucide-react';

export const CheckoutView: React.FC = () => {
  const { 
    cart, 
    cartTotalUSD, 
    discountUSD,
    appliedCouponCode,
    applyCoupon,
    removeCoupon,
    appliedDiscountRules,
    formatPrice, 
    currency, 
    setActiveTab, 
    placeOrder,
    showToast,
    goBack,
    t,
    language,
    firebaseUser,
    isEmailVerified,
    user,
    updateUser,
    checkPhoneUniqueness,
    signInWithEmail,
    signUpWithEmail,
    sendEmailSignInLink,
    resetPassword,
    signInWithGoogle,
    signInWithApple,
    signOutUser,
    siteContent,
    isVisualEditMode
  } = useShop();

  const visibility = siteContent?.visibility || {
    checkoutSteps: true,
    checkoutAddressForm: true,
    checkoutDeliverySpeed: true,
    checkoutPaymentMethod: true,
    checkoutOrderSummary: true,
    checkoutGuarantees: true,
  };

  const isArabic = language === 'ar';
  const [checkoutCouponInput, setCheckoutCouponInput] = useState('');
  const [isApplyingCheckoutCoupon, setIsApplyingCheckoutCoupon] = useState(false);

  const [deliverySpeed, setDeliverySpeed] = useState<'express_beirut' | 'standard' | 'diaspora_air'>('express_beirut');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cod_usd');
  const [checkoutIdempotencyKey, setCheckoutIdempotencyKey] = useState<string | null>(null);

  // Password visibility and reset modal states
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
      showToast(isArabic ? 'الرجاء إدخال البريد الإلكتروني لإعادة تعيين كلمة المرور' : 'Please enter your email address to reset password', 'warning');
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
  
  // Checkout form recipient data
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    city: 'Achrafieh, Beirut',
    street: '',
    building: '',
    notes: ''
  });

  // Save recipient fields to local cache as the user types to prevent loss and enable seamless checkout-profile sync on login
  useEffect(() => {
    const hasTypedData = 
      (formData.firstName && formData.firstName.trim() !== '') ||
      (formData.lastName && formData.lastName.trim() !== '') ||
      (formData.phone && formData.phone.trim() !== '') ||
      (formData.street && formData.street.trim() !== '') ||
      (formData.building && formData.building.trim() !== '') ||
      (formData.notes && formData.notes.trim() !== '');

    if (hasTypedData) {
      try {
        localStorage.setItem('yallalb_saved_checkout_data', JSON.stringify({
          firstName: formData.firstName.trim(),
          lastName: formData.lastName.trim(),
          phone: formData.phone,
          defaultCity: formData.city,
          defaultAddress: formData.street,
          defaultBuilding: formData.building,
          defaultNotes: formData.notes
        }));
      } catch {}
    }
  }, [formData]);

  // Auth Card Local State (when unauthenticated)
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authConfirmPassword, setAuthConfirmPassword] = useState('');
  const [signupFirstName, setSignupFirstName] = useState('');
  const [signupLastName, setSignupLastName] = useState('');
  const [signupPhone, setSignupPhone] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  const [orderComplete, setOrderComplete] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync recipient fields from logged-in user profile
  useEffect(() => {
    if (firebaseUser) {
      // Name parsing & smart deduction
      const nameCandidate = user?.name || firebaseUser.displayName || '';
      let fName = user?.firstName || '';
      let lName = user?.lastName || '';

      if (!fName || !lName) {
        if (nameCandidate.trim()) {
          const parts = nameCandidate.trim().split(/\s+/);
          fName = fName || parts[0];
          lName = lName || (parts.length > 1 ? parts.slice(1).join(' ') : '');
        }
      }

      if (!fName || !lName) {
        const emailToParse = firebaseUser?.email || user?.email || '';
        if (emailToParse.includes('@')) {
          const raw = emailToParse.split('@')[0].replace(/[0-9]+/g, ' ').trim();
          const parts = raw.split(/[\._\-\s]+/).filter(Boolean);
          if (parts.length >= 2) {
            fName = fName || (parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase());
            lName = lName || (parts[1].charAt(0).toUpperCase() + parts[1].slice(1).toLowerCase());
          } else if (parts.length === 1 && parts[0].length > 0) {
            fName = fName || (parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase());
            lName = lName || '';
          }
        }
      }

      fName = fName || '';
      lName = lName || '';

      // Phone formatting & fallback
      let phoneVal = user?.phone || '';
      if (!phoneVal || phoneVal.trim() === '') {
        phoneVal = '';
      } else if (!phoneVal.startsWith('+961')) {
        const clean = phoneVal.replace(/\D/g, '');
        phoneVal = clean ? `+961 ${clean}` : '';
      }

      // Address & Notes defaults
      const emailVal = firebaseUser?.email || user?.email || '';
      const cityVal = user?.defaultCity || '';
      const streetVal = user?.defaultAddress || '';
      const buildingVal = user?.defaultBuilding || '';
      const notesVal = user?.defaultNotes || '';

      setFormData(prev => ({
        firstName: prev.firstName || fName,
        lastName: prev.lastName || lName,
        phone: prev.phone || phoneVal,
        email: prev.email || emailVal,
        city: prev.city || cityVal,
        street: prev.street || streetVal,
        building: prev.building || buildingVal,
        notes: prev.notes || notesVal
      }));
    } else {
      // Guest mode: clear personal data
      setFormData({
        firstName: '',
        lastName: '',
        phone: '',
        email: '',
        city: 'Achrafieh, Beirut',
        street: '',
        building: '',
        notes: ''
      });
    }
  }, [firebaseUser, user]);

  // Sync guest-entered checkout details to user profile immediately upon logging in or signing up
  useEffect(() => {
    if (firebaseUser && user) {
      const hasGuestFirstName = formData.firstName && formData.firstName.trim() !== '';
      const hasGuestLastName = formData.lastName && formData.lastName.trim() !== '';
      const hasGuestPhone = formData.phone && formData.phone.trim() !== '';
      const hasGuestAddress = formData.street && formData.street.trim() !== '';

      if (hasGuestFirstName || hasGuestLastName || hasGuestPhone || hasGuestAddress) {
        const isProfileDifferent = 
          user.firstName !== formData.firstName || 
          user.lastName !== formData.lastName || 
          user.phone !== formData.phone ||
          user.defaultCity !== formData.city ||
          user.defaultAddress !== formData.street;

        if (isProfileDifferent) {
          const fullName = `${formData.firstName.trim()} ${formData.lastName.trim()}`.trim();
          updateUser({
            name: fullName || user.name,
            firstName: formData.firstName.trim() || user.firstName,
            lastName: formData.lastName.trim() || user.lastName,
            phone: formData.phone || user.phone,
            defaultCity: formData.city || user.defaultCity,
            defaultAddress: formData.street || user.defaultAddress,
            defaultBuilding: formData.building || user.defaultBuilding,
            defaultNotes: formData.notes || user.defaultNotes
          }).catch((err) => {
            console.error("[CheckoutView] Error syncing guest data to user profile:", err);
          });
        }
      }
    }
  }, [firebaseUser, firebaseUser?.uid]);

  const quickCities = [
    'Achrafieh, Beirut',
    'Hamra, Beirut',
    'Badaro, Beirut',
    'Mar Mikhael, Beirut',
    'Tripoli (Mina)',
    'Byblos (Jbeil)',
    'Batroun Coast',
    'Zahlé, Bekaa',
    'Saida, South'
  ];

  // Region & Delivery fee calculation
  const matchedRegion = LEBANON_REGIONS.find(r => 
    r.id === user?.defaultGovernorate ||
    r.majorCities.some(c => (formData.city || '').toLowerCase().includes(c.toLowerCase().split(' ')[0]))
  ) || LEBANON_REGIONS[0];

  const deliveryFeeUSD = calcDeliveryFeeUSD({
    speed: deliverySpeed,
    regionId: matchedRegion?.id,
    matchedRegion,
    subtotalUSD: cartTotalUSD
  });

  const finalTotalUSD = cartTotalUSD + (cart.length > 0 ? deliveryFeeUSD : 0);

  const [showOtpModal, setShowOtpModal] = useState<boolean>(false);
  const [showPhoneAuthModal, setShowPhoneAuthModal] = useState<boolean>(false);
  const [otpTargetContact, setOtpTargetContact] = useState<string>('');
  const [otpActionType, setOtpActionType] = useState<'login' | 'signup'>('login');
  const [pendingAuthAction, setPendingAuthAction] = useState<(() => Promise<void>) | null>(null);

  // Sign In Handler from Checkout
  const handleCheckoutSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmail || !authPassword) {
      showToast(isArabic ? 'يرجى إدخال البريد الإلكتروني وكلمة المرور' : 'Please enter both email and password', 'warning');
      return;
    }
    
    setIsAuthLoading(true);
    try {
      await signInWithEmail(authEmail, authPassword);
      showToast(isArabic ? 'تم تسجيل الدخول بنجاح! يمكنك الآن إتمام الطلب.' : 'Logged in successfully! You can now complete your order.', 'success');
    } catch {
      // Error handled with toast in context
    } finally {
      setIsAuthLoading(false);
    }
  };

  // Sign Up Handler from Checkout
  const handleCheckoutSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signupFirstName.trim() || !signupLastName.trim()) {
      showToast(isArabic ? 'الاسم الأول واسم العائلة مطلوبان' : 'First name and last name are required', 'warning');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(authEmail)) {
      showToast(isArabic ? 'صيغة البريد الإلكتروني غير صحيحة' : 'A valid email format is required', 'warning');
      return;
    }
    if (!authPassword || authPassword.length < 6) {
      showToast(isArabic ? 'يجب أن تتكون كلمة المرور من 6 أحرف على الأقل' : 'Password must be at least 6 characters', 'warning');
      return;
    }
    if (authPassword !== authConfirmPassword) {
      showToast(isArabic ? 'كلمات المرور غير متطابقة' : 'Passwords do not match', 'warning');
      return;
    }
    const cleanPhone = signupPhone.replace(/\D/g, '');
    if (cleanPhone.length !== 8) {
      showToast(isArabic ? 'يجب أن يتألف رقم الهاتف اللبناني من 8 أرقام' : 'Lebanese phone number must be strictly 8 digits', 'warning');
      return;
    }

    setIsAuthLoading(true);
    // Strict uniqueness check before registering user from checkout
    const phoneAvailability = await checkPhoneUniqueness(cleanPhone);
    if (!phoneAvailability.available) {
      showToast(phoneAvailability.reason || (isArabic ? 'رقم الهاتف هذا مسجل مسبقاً بحساب آخر.' : 'This phone number is already registered to another account.'), 'warning');
      setIsAuthLoading(false);
      return;
    }

    const fullName = `${signupFirstName.trim()} ${signupLastName.trim()}`;
    const formattedPhone = `+961 ${cleanPhone}`;

    try {
      try {
        localStorage.setItem('yallalb_signup_profile_temp', JSON.stringify({
          firstName: signupFirstName.trim(),
          lastName: signupLastName.trim(),
          phone: formattedPhone,
          defaultCity: formData.city || 'Achrafieh, Beirut',
          defaultAddress: formData.street || '',
          defaultBuilding: formData.building || '',
          defaultNotes: formData.notes || ''
        }));
      } catch {}
      await signUpWithEmail(authEmail, authPassword, cleanPhone);
      await updateUser({
        name: fullName,
        firstName: signupFirstName.trim(),
        lastName: signupLastName.trim(),
        email: authEmail,
        phone: formattedPhone,
        defaultCity: formData.city || 'Achrafieh, Beirut',
        defaultAddress: formData.street || '',
        defaultBuilding: formData.building || '',
        defaultNotes: formData.notes || ''
      });
      // Auto fill form data
      setFormData(prev => ({
        ...prev,
        firstName: signupFirstName.trim(),
        lastName: signupLastName.trim(),
        phone: formattedPhone,
        email: authEmail
      }));
      showToast(isArabic ? 'تم إنشاء الحساب وتسجيل الدخول بنجاح!' : 'Account created and signed in successfully!', 'success');
    } catch {
      // Error handled with toast in context
    } finally {
      setIsAuthLoading(false);
    }
  };

  // Google Sign In Handler
  const handleCheckoutGoogle = async () => {
    setIsAuthLoading(true);
    try {
      await signInWithGoogle();
      showToast(isArabic ? 'تم تسجيل الدخول بواسطة Google!' : 'Signed in with Google!', 'success');
    } catch {
      // Handled in context
    } finally {
      setIsAuthLoading(false);
    }
  };

  // Apple Sign In Handler
  const handleCheckoutApple = async () => {
    setIsAuthLoading(true);
    try {
      await signInWithApple();
      showToast(isArabic ? 'تم تسجيل الدخول بواسطة Apple!' : 'Signed in with Apple!', 'success');
    } catch {
      // Handled in context
    } finally {
      setIsAuthLoading(false);
    }
  };

  // Submit Final Order
  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!firebaseUser) {
      showToast(isArabic ? 'يرجى تسجيل الدخول أولاً' : 'Please sign in to place an order.', 'warning');
      return;
    }

    if (!isEmailVerified) {
      showToast(
        isArabic
          ? 'يرجى تأكيد بريدك الإلكتروني عبر الرابط المرسل إليك قبل إتمام الطلب.'
          : 'Please verify your email — check your inbox for the link — before placing an order.',
        'warning'
      );
      return;
    }

    if (cart.length === 0) {
      showToast(isArabic ? 'حقيبة التسوق فارغة' : 'Your cart is empty. Add products before placing an order.', 'warning');
      return;
    }

    // Fall back to the saved profile, but never to an invented value. A placeholder
    // name, phone or address produces an order that looks complete to the admin and
    // cannot actually be delivered.
    const fName = formData.firstName.trim() || user?.firstName || (user?.name ? user.name.split(' ')[0] : '');
    const lName = formData.lastName.trim() || user?.lastName || (user?.name ? user.name.split(' ').slice(1).join(' ') : '');
    const finalPhone = formData.phone.trim() || user?.phone || '';
    const finalStreet = formData.street.trim() || user?.defaultAddress || '';
    const finalEmail = formData.email.trim() || firebaseUser?.email || user?.email || '';
    const finalCity = formData.city.trim() || user?.defaultCity || '';

    const missingDetails: string[] = [];
    if (!fName) missingDetails.push(isArabic ? 'الاسم الأول' : 'first name');
    if (!finalPhone) missingDetails.push(isArabic ? 'رقم الهاتف' : 'phone number');
    if (!finalStreet) missingDetails.push(isArabic ? 'العنوان' : 'street address');
    if (!finalCity) missingDetails.push(isArabic ? 'المدينة' : 'city');
    if (!finalEmail) missingDetails.push(isArabic ? 'البريد الإلكتروني' : 'email address');

    if (missingDetails.length > 0) {
      showToast(
        isArabic
          ? `يرجى إكمال بيانات التوصيل: ${missingDetails.join('، ')}`
          : `Please complete your delivery details: ${missingDetails.join(', ')}.`,
        'warning'
      );
      return;
    }

    const fullName = `${fName} ${lName}`.trim();
    const idempotencyKey = checkoutIdempotencyKey || generateIdempotencyKey();
    if (!checkoutIdempotencyKey) {
      setCheckoutIdempotencyKey(idempotencyKey);
    }

    setIsSubmitting(true);
    try {
      const newOrder = await placeOrder({
        items: [...cart],
        shipping: {
          fullName: fullName,
          firstName: fName,
          lastName: lName,
          phone: finalPhone,
          email: finalEmail,
          governorate: matchedRegion?.nameEn || 'Beirut',
          city: finalCity,
          street: finalStreet,
          building: formData.building.trim() || 'N/A',
          deliveryNotes: formData.notes.trim() || '',
          deliverySpeed: deliverySpeed
        },
        paymentMethod: paymentMethod,
        currency: currency,
        subtotalUSD: Math.round(cart.reduce((s, i) => s + i.product.priceUSD * i.quantity, 0) * 100) / 100,
        deliveryFeeUSD: deliveryFeeUSD,
        totalUSD: finalTotalUSD,
        totalLBP: Math.round(finalTotalUSD * LBP_USD_RATE),
        discountUSD: discountUSD,
        appliedCoupon: appliedCouponCode || undefined,
        estimatedDelivery: deliverySpeed === 'express_beirut' 
          ? 'Within 2 Hours (Beirut Express)' 
          : deliverySpeed === 'standard' 
          ? '24-48 Hours (All Lebanon)' 
          : '3-5 Business Days (DHL Diaspora Air)'
      }, idempotencyKey);

      setCheckoutIdempotencyKey(null);

      // Persist user shipping details for subsequent visits
      updateUser({
        name: fullName,
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        phone: formData.phone,
        defaultCity: formData.city,
        defaultAddress: formData.street,
        defaultBuilding: formData.building,
        defaultNotes: formData.notes
      }).catch(() => {});
      try {
        localStorage.setItem('yallalb_saved_checkout_data', JSON.stringify({
          firstName: formData.firstName.trim(),
          lastName: formData.lastName.trim(),
          phone: formData.phone,
          defaultCity: formData.city,
          defaultAddress: formData.street,
          defaultBuilding: formData.building,
          defaultNotes: formData.notes
        }));
      } catch {}

      setOrderComplete(newOrder.id);
    } catch {
      showToast('An error occurred while placing your order. Please try again.', 'warning');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (orderComplete) {
    const successBadge = isArabic 
      ? (siteContent?.checkoutSuccessPage?.successBadgeArabic ?? 'تم تأكيد الطلب بنجاح')
      : (siteContent?.checkoutSuccessPage?.successBadge ?? 'Order Placed Successfully');

    const successTitle = isArabic
      ? (siteContent?.checkoutSuccessPage?.successTitleArabic ?? 'شكراً! تم استلام طلبك اللبناني')
      : (siteContent?.checkoutSuccessPage?.successTitle ?? 'Shukran! Your Lebanese Order is');

    const nextStepsHeading = isArabic
      ? (siteContent?.checkoutSuccessPage?.nextStepsHeadingArabic ?? 'الخطوات التالية واللوجستيات:')
      : (siteContent?.checkoutSuccessPage?.nextStepsHeading ?? 'Next Steps & Dispatch Logistics:');

    const step1 = isArabic
      ? (siteContent?.checkoutSuccessPage?.step1TextArabic ?? 'تم توجيه طلبك من المستودع الرئيسي في بيروت إلى الحرفيين المعنيين.')
      : (siteContent?.checkoutSuccessPage?.step1Text ?? 'Our Beirut central depot has routed your basket to the regional artisan guilds.');

    const step2 = isArabic
      ? (siteContent?.checkoutSuccessPage?.step2TextArabic ?? 'ستصلك رسالة عبر تطبيق واتساب من السائق المخصص لتأكيد موقع التسليم بدقة.')
      : (siteContent?.checkoutSuccessPage?.step2Text ?? 'You will receive a WhatsApp message from your dedicated courier to confirm exact GPS drop-off.');

    const step3 = isArabic
      ? (siteContent?.checkoutSuccessPage?.step3TextArabic ?? `الدفع نقداً عند الاستلام بقيمة ($${finalTotalUSD.toFixed(2)}) أو بالليرة اللبنانية.`)
      : (siteContent?.checkoutSuccessPage?.step3Text ?? `Settlement is strictly ($${finalTotalUSD.toFixed(2)}) upon handover or digital transfer.`);

    // Support dynamic price insertion in CMS
    const step3Replaced = step3.replace('{price}', `$${finalTotalUSD.toFixed(2)}`);

    const btnTrack = isArabic
      ? (siteContent?.checkoutSuccessPage?.buttonTrackTextArabic ?? 'متابعة الطلب في حسابي')
      : (siteContent?.checkoutSuccessPage?.buttonTrackText ?? 'Track in My Account');

    const btnContinue = isArabic
      ? (siteContent?.checkoutSuccessPage?.buttonContinueTextArabic ?? 'متابعة التسوق')
      : (siteContent?.checkoutSuccessPage?.buttonContinueText ?? 'Continue Shopping');

    return (
      <div className="min-h-[75vh] flex items-center justify-center px-4 py-16 bg-[#F8F8F6]">
        <div className="max-w-xl w-full p-8 sm:p-12 rounded-xl bg-white border border-[#E5E5E5] text-center space-y-6 shadow-sm animate-fade-in">
          <div className="w-16 h-16 rounded-full bg-[#16803C]/10 border border-[#16803C]/20 flex items-center justify-center mx-auto text-[#16803C]">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[#8F7137]">
              {successBadge}
            </span>
            <h2 className="text-2xl sm:text-3xl font-serif font-bold text-[#171717] leading-tight">
              {successTitle} <span className="italic text-[#8F7137]">{isArabic ? 'بنجاح' : 'Confirmed'}</span>
            </h2>
            <p className="text-xs text-[#737373]">
              {isArabic ? 'رمز التتبع المرجعي:' : 'Reference code:'} <span className="font-mono font-bold text-[#8F7137] bg-[#B89753]/10 px-3 py-1 rounded-lg border border-[#B89753]/20 inline-block mt-1">#{orderComplete}</span>
            </p>
          </div>

          <div className="p-5 rounded-lg bg-[#F8F8F6] border border-[#E5E5E5] text-left text-xs space-y-2.5 text-[#171717]">
            <div className="flex items-center gap-2 text-[#16803C] font-bold">
              <Clock className="w-4 h-4" />
              <span>{nextStepsHeading}</span>
            </div>
            <p className="flex items-start gap-2 text-[#737373]">
              <span className="text-[#8F7137] font-bold">1.</span>
              <span className="text-[#171717]">{step1}</span>
            </p>
            <p className="flex items-start gap-2 text-[#737373]">
              <span className="text-[#8F7137] font-bold">2.</span>
              <span className="text-[#171717]">{step2}</span>
            </p>
            <p className="flex items-start gap-2 text-[#737373]">
              <span className="text-[#8F7137] font-bold">3.</span>
              <span className="text-[#171717]">{step3Replaced}</span>
            </p>
          </div>

          <div className="pt-4 flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => setActiveTab('account')}
              className="px-8 py-3 bg-[#171717] hover:bg-black text-white font-bold text-xs uppercase tracking-wider transition-all cursor-pointer rounded-lg shadow-xs"
            >
              {btnTrack}
            </button>
            <button
              onClick={() => { setOrderComplete(null); setActiveTab('products'); }}
              className="px-8 py-3 border border-[#B89753] text-[#8F7137] hover:bg-[#B89753]/10 font-bold text-xs uppercase tracking-wider transition-all cursor-pointer rounded-lg"
            >
              {btnContinue}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F8F6] pb-24 pt-4 sm:pt-6">
      
      {/* Top Custom Divs / Banners */}
      <CustomBlocksRenderer page="checkout" position="top" />

      {/* Checkout Header */}
      <div className="bg-white border-b border-[#E5E5E5] pt-6 pb-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-screen-2xl mx-auto space-y-3">
          <button
            id="checkout-page-back-btn"
            onClick={goBack}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-white hover:bg-neutral-50 text-[#171717] text-xs font-bold uppercase tracking-wider border border-[#E5E5E5] transition-colors cursor-pointer mb-1 shadow-xs"
          >
            <ArrowLeft className={`w-3.5 h-3.5 ${isArabic ? 'rotate-180' : ''}`} />
            <span>{t('back')}</span>
          </button>
          <h1 className="text-2xl sm:text-3xl font-serif font-bold text-[#171717] tracking-tight">
            {siteContent?.checkoutPage?.title ? (
              <span>{siteContent.checkoutPage.title}</span>
            ) : isArabic ? (
              <>التوصيل و <span className="italic text-[#8F7137]">إتمام التسوية والطلب</span></>
            ) : (
              <>Delivery & <span className="italic text-[#8F7137]">Payment Settlement</span></>
            )}
          </h1>
          <p className="text-xs text-[#737373] max-w-2xl leading-relaxed">
            {siteContent?.checkoutPage?.subtitle ? (
              siteContent.checkoutPage.subtitle
            ) : isArabic ? (
              'اختر سرعة التوصيل وطريقة التسوية لشحن وتجهيز طلبك اللبناني بأمان.'
            ) : (
              'Select delivery speed and payment method for fast dispatch across Lebanon or internationally.'
            )}
          </p>
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        
        {cart.length === 0 ? (
          <div className="py-20 text-center space-y-4 max-w-md mx-auto">
            <div className="w-16 h-16 rounded-full bg-[#B89753]/10 border border-[#B89753]/20 flex items-center justify-center mx-auto text-[#8F7137]">
              <Truck className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-serif font-bold text-[#171717]">{t('emptyBasket')}</h2>
            <p className="text-xs text-[#737373]">
              {t('emptyBasketSub')}
            </p>
            <button
              onClick={() => setActiveTab('products')}
              className="px-8 py-3 bg-[#171717] hover:bg-black text-white font-bold text-xs uppercase tracking-wider cursor-pointer transition-colors shadow-xs rounded-lg"
            >
              {t('viewAllProducts')}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmitOrder} className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* Left Column: Auth Gate, Delivery & Payment Details */}
            <div className="lg:col-span-7 space-y-6">

              {/* Checkout Steps Indicator */}
              {(visibility.checkoutSteps || isVisualEditMode) && (
                <div className={`p-4 rounded-xl bg-white border border-[#E5E5E5] shadow-xs relative ${!visibility.checkoutSteps && isVisualEditMode ? 'opacity-70 border-2 border-dashed border-rose-500/80' : ''}`}>
                  {!visibility.checkoutSteps && isVisualEditMode && (
                    <div className="absolute top-1 right-2 z-40 bg-rose-600 text-white px-2 py-0.5 rounded-full text-[9px] font-bold flex items-center gap-1">
                      <EyeOff className="w-2.5 h-2.5" />
                      <span>Steps Hidden</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-6 h-6 rounded-lg text-[11px] font-bold flex items-center justify-center ${
                        firebaseUser 
                          ? 'bg-[#16803C] text-white' 
                          : 'bg-[#B89753] text-white animate-pulse'
                      }`}>
                        {firebaseUser ? '✓' : '1'}
                      </div>
                      <span className={`text-xs font-bold ${firebaseUser ? 'text-[#737373]' : 'text-[#171717]'}`}>
                        {isArabic ? 'حساب المستفيد' : 'Patron Account'}
                      </span>
                    </div>

                    <div className="h-px bg-[#E5E5E5] flex-1 mx-4" />

                    <div className="flex items-center gap-2">
                      <div className={`w-6 h-6 rounded-lg text-[11px] font-bold flex items-center justify-center ${
                        firebaseUser 
                          ? 'bg-[#B89753] text-white animate-pulse' 
                          : 'bg-neutral-100 text-[#737373]'
                      }`}>
                        2
                      </div>
                      <span className={`text-xs font-bold ${firebaseUser ? 'text-[#171717]' : 'text-[#737373]'}`}>
                        {isArabic ? 'بيانات الشحن' : 'Delivery Address'}
                      </span>
                    </div>

                    <div className="h-px bg-[#E5E5E5] flex-1 mx-4" />

                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-neutral-100 text-[#737373] text-[11px] font-bold flex items-center justify-center">
                        3
                      </div>
                      <span className="text-xs font-bold text-[#737373]">
                        {isArabic ? 'التسوية والطلب' : 'Settlement'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* 🔒 AUTHENTICATION GATE CARD IF NOT LOGGED IN */}
              {!firebaseUser ? (
                <div id="checkout-auth-required-card" className="p-6 sm:p-8 rounded-xl bg-white border border-[#B89753]/30 shadow-sm space-y-6 relative overflow-hidden animate-fade-in">
                  <div className="absolute top-0 right-0 left-0 h-1 bg-[#B89753]" />
                  
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E5E5E5]">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-[#B89753]/10 text-[#8F7137] flex items-center justify-center flex-shrink-0">
                        <Lock className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#B89753]/10 text-[#8F7137] text-[10px] font-bold uppercase tracking-wider mb-1">
                          <AlertCircle className="w-3 h-3 text-[#8F7137]" />
                          <span>{isArabic ? 'تسجيل الدخول مطلوب' : 'Login Required to Proceed'}</span>
                        </div>
                        <h3 className="text-base font-serif font-bold text-[#171717]">
                          {isArabic ? 'يرجى تسجيل الدخول لإتمام طلبك' : 'Sign in to Complete Your Order'}
                        </h3>
                      </div>
                    </div>

                    {/* Auth Mode Toggle Tabs */}
                    <div className="flex bg-[#F8F8F6] p-1 rounded-lg border border-[#E5E5E5] self-start sm:self-auto">
                      <button
                        type="button"
                        id="checkout-switch-signin-btn"
                        onClick={() => setAuthMode('signin')}
                        className={`px-3.5 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                          authMode === 'signin' 
                            ? 'bg-white text-[#171717] shadow-xs' 
                            : 'text-[#737373] hover:text-[#171717]'
                        }`}
                      >
                        {isArabic ? 'تسجيل دخول' : 'Sign In'}
                      </button>
                      <button
                        type="button"
                        id="checkout-switch-signup-btn"
                        onClick={() => setAuthMode('signup')}
                        className={`px-3.5 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                          authMode === 'signup' 
                            ? 'bg-white text-[#171717] shadow-xs' 
                            : 'text-[#737373] hover:text-[#171717]'
                        }`}
                      >
                        {isArabic ? 'حساب جديد' : 'New Account'}
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-[#737373] leading-relaxed">
                    {isArabic 
                      ? 'لضمان أمان طلبك وتوفير تتبع الطلبات عبر واتساب وحفظ عنوانك، يرجى تسجيل الدخول أو إنشاء حساب لبناني جديد.'
                      : 'To track courier dispatch, receive WhatsApp notifications, and auto-fill your delivery coordinates, please sign in or register below.'}
                  </p>

                  {/* Social & Phone Instant Sign In */}
                  <div className="space-y-2.5">
                    <button
                      type="button"
                      id="checkout-phone-signin-btn"
                      onClick={() => setShowPhoneAuthModal(true)}
                      disabled={isAuthLoading}
                      className="w-full py-2.5 px-4 rounded-lg bg-[#171717] hover:bg-black text-white font-bold text-xs flex items-center justify-center gap-3 transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
                    >
                      <Smartphone className="w-4 h-4 text-[#B89753]" />
                      <span>{isArabic ? 'تسجيل الدخول برقم الهاتف اللبناني (SMS)' : 'Sign In with Lebanese Phone (SMS)'}</span>
                    </button>

                    <button
                      type="button"
                      id="checkout-google-signin-btn"
                      onClick={handleCheckoutGoogle}
                      disabled={isAuthLoading}
                      className="w-full py-2.5 px-4 rounded-lg bg-white hover:bg-neutral-50 text-[#171717] font-bold text-xs border border-[#E5E5E5] flex items-center justify-center gap-3 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                      </svg>
                      <span>{isArabic ? 'المتابعة السريعة باستخدام حساب Google' : 'Continue with Google Account'}</span>
                    </button>
                  </div>

                  <div className="relative flex py-1 items-center">
                    <div className="flex-grow border-t border-[#E5E5E5]"></div>
                    <span className="flex-shrink mx-4 text-[11px] font-bold uppercase tracking-wider text-[#737373]">
                      {isArabic ? 'أو عبر البريد الإلكتروني' : 'Or with email & password'}
                    </span>
                    <div className="flex-grow border-t border-[#E5E5E5]"></div>
                  </div>

                  {/* Sign In Form */}
                  {authMode === 'signin' ? (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-[#737373] mb-1">
                          {isArabic ? 'البريد الإلكتروني *' : 'Email Address *'}
                        </label>
                        <input
                          type="email"
                          id="checkout-auth-email-input"
                          placeholder="name@example.com"
                          value={authEmail}
                          onChange={(e) => setAuthEmail(e.target.value)}
                          className="w-full px-3.5 py-2.5 bg-[#F8F8F6] text-xs text-[#171717] rounded-lg border border-[#E5E5E5] focus:bg-white focus:border-[#B89753] focus:outline-none transition-all"
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-[11px] font-bold uppercase tracking-wider text-[#737373]">
                            {isArabic ? 'كلمة المرور *' : 'Password *'}
                          </label>
                          <button
                            type="button"
                            id="checkout-forgot-password-btn"
                            onClick={() => {
                              setForgotEmail(authEmail);
                              setShowForgotPasswordModal(true);
                            }}
                            className="text-[11px] font-bold text-[#8F7137] hover:underline transition-colors cursor-pointer"
                          >
                            {isArabic ? 'نسيت كلمة المرور؟' : 'Forgot Password?'}
                          </button>
                        </div>
                        <div className="relative flex items-center">
                          <input
                            type={showPassword ? 'text' : 'password'}
                            id="checkout-auth-password-input"
                            placeholder="••••••••"
                            value={authPassword}
                            onChange={(e) => setAuthPassword(e.target.value)}
                            className="w-full pl-3.5 pr-10 py-2.5 bg-[#F8F8F6] text-xs text-[#171717] rounded-lg border border-[#E5E5E5] focus:bg-white focus:border-[#B89753] focus:outline-none transition-all"
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
                        type="button"
                        id="checkout-submit-signin-btn"
                        onClick={handleCheckoutSignIn}
                        disabled={isAuthLoading}
                        className="w-full py-3 rounded-lg bg-[#171717] hover:bg-black text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer disabled:opacity-50"
                      >
                        <LogIn className="w-4 h-4 text-[#B89753]" />
                        <span>{isAuthLoading ? (isArabic ? 'جاري التحقق...' : 'Signing in...') : (isArabic ? 'تسجيل الدخول ومتابعة الطلب' : 'Sign In & Continue Checkout')}</span>
                      </button>

                      <div className="relative flex py-1 items-center">
                        <div className="flex-grow border-t border-[#E5E5E5]"></div>
                        <span className="flex-shrink mx-3 text-[10px] font-bold uppercase tracking-wider text-[#A3A3A3]">
                          {isArabic ? 'أو بدون كلمة مرور' : 'Or Passwordless'}
                        </span>
                        <div className="flex-grow border-t border-[#E5E5E5]"></div>
                      </div>

                      <button
                        type="button"
                        id="checkout-email-link-btn"
                        disabled={isAuthLoading || !authEmail}
                        onClick={async () => {
                          if (!authEmail) {
                            showToast(isArabic ? 'يرجى إدخال البريد الإلكتروني أولاً' : 'Please enter your email address first', 'warning');
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
                        <span>{isArabic ? 'إرسال رابط تسجيل دخول مباشر إلى البريد' : 'Send Direct Email Sign-In Link'}</span>
                      </button>
                    </div>
                  ) : (
                    /* Sign Up Form */
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[11px] font-bold uppercase tracking-wider text-[#737373] mb-1">
                            {isArabic ? 'الاسم الأول *' : 'First Name *'}
                          </label>
                          <input
                            type="text"
                            id="checkout-signup-firstname-input"
                            placeholder="e.g. Walid"
                            value={signupFirstName}
                            onChange={(e) => setSignupFirstName(e.target.value)}
                            className="w-full px-3.5 py-2.5 bg-[#F8F8F6] text-xs text-[#171717] rounded-lg border border-[#E5E5E5] focus:bg-white focus:border-[#B89753] focus:outline-none transition-all"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold uppercase tracking-wider text-[#737373] mb-1">
                            {isArabic ? 'اسم العائلة *' : 'Last Name *'}
                          </label>
                          <input
                            type="text"
                            id="checkout-signup-lastname-input"
                            placeholder="e.g. Ghattas"
                            value={signupLastName}
                            onChange={(e) => setSignupLastName(e.target.value)}
                            className="w-full px-3.5 py-2.5 bg-[#F8F8F6] text-xs text-[#171717] rounded-lg border border-[#E5E5E5] focus:bg-white focus:border-[#B89753] focus:outline-none transition-all"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[11px] font-bold uppercase tracking-wider text-[#737373] mb-1">
                            {isArabic ? 'رقم الواتساب اللبناني *' : 'Lebanese WhatsApp Phone *'}
                          </label>
                          <div className="relative flex items-center">
                            <div className="absolute left-3 flex items-center gap-1.5 pointer-events-none text-[#737373] font-bold text-xs select-none">
                              <LebanonFlag className="w-4 h-3 rounded-xs" />
                              <span>+961</span>
                            </div>
                            <input
                              type="tel"
                              id="checkout-signup-phone-input"
                              placeholder="70 123456"
                              maxLength={8}
                              value={signupPhone}
                              onChange={(e) => setSignupPhone(e.target.value.replace(/\D/g, ''))}
                              className="w-full pl-20 pr-3.5 py-2.5 bg-[#F8F8F6] text-xs text-[#171717] rounded-lg border border-[#E5E5E5] focus:bg-white focus:border-[#B89753] focus:outline-none font-mono transition-all"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold uppercase tracking-wider text-[#737373] mb-1">
                            {isArabic ? 'البريد الإلكتروني *' : 'Email Address *'}
                          </label>
                          <input
                            type="email"
                            id="checkout-signup-email-input"
                            placeholder="name@example.com"
                            value={authEmail}
                            onChange={(e) => setAuthEmail(e.target.value)}
                            className="w-full px-3.5 py-2.5 bg-[#F8F8F6] text-xs text-[#171717] rounded-lg border border-[#E5E5E5] focus:bg-white focus:border-[#B89753] focus:outline-none transition-all"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[11px] font-bold uppercase tracking-wider text-[#737373] mb-1">
                            {isArabic ? 'كلمة المرور *' : 'Password *'}
                          </label>
                          <div className="relative flex items-center">
                            <input
                              type={showPassword ? 'text' : 'password'}
                              id="checkout-signup-password-input"
                              placeholder="Minimum 6 characters"
                              value={authPassword}
                              onChange={(e) => setAuthPassword(e.target.value)}
                              className="w-full pl-3.5 pr-10 py-2.5 bg-[#F8F8F6] text-xs text-[#171717] rounded-lg border border-[#E5E5E5] focus:bg-white focus:border-[#B89753] focus:outline-none transition-all"
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
                          <label className="block text-[11px] font-bold uppercase tracking-wider text-[#737373] mb-1">
                            {isArabic ? 'تأكيد كلمة المرور *' : 'Confirm Password *'}
                          </label>
                          <div className="relative flex items-center">
                            <input
                              type={showPassword ? 'text' : 'password'}
                              id="checkout-signup-confirm-password-input"
                              placeholder="Repeat password"
                              value={authConfirmPassword}
                              onChange={(e) => setAuthConfirmPassword(e.target.value)}
                              className="w-full pl-3.5 pr-10 py-2.5 bg-[#F8F8F6] text-xs text-[#171717] rounded-lg border border-[#E5E5E5] focus:bg-white focus:border-[#B89753] focus:outline-none transition-all"
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
                      </div>

                      <button
                        type="button"
                        id="checkout-submit-signup-btn"
                        onClick={handleCheckoutSignUp}
                        disabled={isAuthLoading}
                        className="w-full py-3 rounded-lg bg-[#171717] hover:bg-black text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer disabled:opacity-50"
                      >
                        <UserPlus className="w-4 h-4 text-[#B89753]" />
                        <span>{isAuthLoading ? (isArabic ? 'جاري الإنشاء...' : 'Creating Account...') : (isArabic ? 'إنشاء حساب ومتابعة الطلب' : 'Create Account & Continue Checkout')}</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                /* ✅ LOGGED IN USER BANNER */
                <div className="p-4 sm:p-5 rounded-xl bg-white border border-[#E5E5E5] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[#16803C]/10 text-[#16803C] flex items-center justify-center flex-shrink-0">
                      <UserCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[#171717]">
                          {user.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : user.name || 'Lebanese Patron'}
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-[#16803C]/10 text-[#16803C] text-[10px] font-bold uppercase">
                          {isArabic ? 'تم تسجيل الدخول' : 'Verified Account'}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#737373]">
                        {firebaseUser.email || user.email}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={async () => {
                      await signOutUser();
                      showToast(isArabic ? 'تم تسجيل الخروج' : 'Signed out', 'info');
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-[#737373] hover:text-[#C62828] hover:bg-neutral-50 border border-[#E5E5E5] transition-colors cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>{isArabic ? 'تبديل الحساب' : 'Switch Account'}</span>
                  </button>
                </div>
              )}
              
              {/* Recipient Details & Address */}
              {firebaseUser && (visibility.checkoutAddressForm || isVisualEditMode) && (
                <div className={`p-6 rounded-xl bg-white border border-[#E5E5E5] space-y-5 transition-opacity relative shadow-xs ${!visibility.checkoutAddressForm && isVisualEditMode ? 'opacity-70 border-2 border-dashed border-rose-500/80' : ''}`}>
                  {!visibility.checkoutAddressForm && isVisualEditMode && (
                    <div className="absolute top-2 right-4 z-40 bg-rose-600 text-white px-2.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 shadow-xs">
                      <EyeOff className="w-3 h-3" />
                      <span>Address Form Hidden (Draft)</span>
                    </div>
                  )}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#E5E5E5]">
                    <h3 className="text-base font-serif font-bold text-[#171717] flex items-center gap-2">
                      <MapPin className="w-5 h-5 text-[#8F7137]" />
                      <span>{siteContent?.checkoutPage?.shippingHeading || (isArabic ? 'بيانات المستلم والعنوان في لبنان' : 'Recipient & Delivery Address')}</span>
                    </h3>
                    <span className="text-[11px] text-[#16803C] font-semibold flex items-center gap-1 bg-[#16803C]/10 px-2.5 py-0.5 rounded-md border border-[#16803C]/20">
                      <Check className="w-3.5 h-3.5" />
                      {isArabic ? 'معبأ تلقائياً من ملفك الشخصي' : 'Auto-filled from profile'}
                    </span>
                  </div>

                  <div className="p-3 bg-[#F8F8F6] border border-[#E5E5E5] rounded-lg flex items-center justify-between text-xs text-[#737373]">
                    <span className="font-medium pr-2">
                      {isArabic 
                        ? 'تُملأ بيانات التوصيل تلقائياً من حسابك وتعديلها يتم فقط من خلال ملفك الشخصي.' 
                        : 'Your details are auto-filled and can only be updated from your profile tab.'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveTab('account')}
                      className="px-2.5 py-1.5 bg-white hover:bg-neutral-50 text-[#171717] border border-[#E5E5E5] rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer whitespace-nowrap"
                    >
                      {isArabic ? 'تحديث الملف' : 'Update Profile'}
                    </button>
                  </div>

                  {/* 🌟 SEPARATE FIRST NAME AND LAST NAME */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-[#737373] mb-1">
                        {isArabic ? 'الاسم الأول *' : 'First Name *'}
                      </label>
                      <input
                        type="text"
                        id="checkout-first-name-input"
                        placeholder="e.g. Walid"
                        value={formData.firstName}
                        onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                        className="w-full px-3.5 py-2.5 bg-[#F8F8F6] text-xs text-[#171717] rounded-lg border border-[#E5E5E5] focus:bg-white focus:border-[#B89753] focus:outline-none font-medium"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-[#737373] mb-1">
                        {isArabic ? 'اسم العائلة *' : 'Last Name *'}
                      </label>
                      <input
                        type="text"
                        id="checkout-last-name-input"
                        placeholder="e.g. Ghattas"
                        value={formData.lastName}
                        onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                        className="w-full px-3.5 py-2.5 bg-[#F8F8F6] text-xs text-[#171717] rounded-lg border border-[#E5E5E5] focus:bg-white focus:border-[#B89753] focus:outline-none font-medium"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-[#737373] mb-1">
                        {isArabic ? 'رقم الهاتف اللبناني / واتساب *' : 'Lebanese Mobile Phone / WhatsApp *'}
                      </label>
                      <div className="relative flex items-center">
                        <div className="absolute left-3 flex items-center gap-1 pointer-events-none text-[#737373] font-bold text-xs select-none">
                          <LebanonFlag className="w-4 h-3 rounded-xs" />
                        </div>
                        <input
                          type="tel"
                          id="checkout-phone-input"
                          placeholder="+961 70 123 456"
                          value={formData.phone}
                          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                          className="w-full pl-10 pr-3.5 py-2.5 bg-[#F8F8F6] text-xs text-[#171717] rounded-lg border border-[#E5E5E5] focus:bg-white focus:border-[#B89753] focus:outline-none font-mono"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-[#737373] mb-1">
                        {isArabic ? 'البريد الإلكتروني للإشعار *' : 'Email for Dispatch & Invoice *'}
                      </label>
                      <input
                        type="email"
                        id="checkout-email-input"
                        placeholder="name@example.com"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="w-full px-3.5 py-2.5 bg-[#F8F8F6] text-xs text-[#171717] rounded-lg border border-[#E5E5E5] focus:bg-white focus:border-[#B89753] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-[#737373] mb-1">
                      {isArabic ? 'المدينة / المنطقة / المحافظة *' : 'City / Governorate *'}
                    </label>
                    <input
                      type="text"
                      id="checkout-city-input"
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      placeholder="e.g. Achrafieh, Beirut"
                      className="w-full px-3.5 py-2.5 bg-[#F8F8F6] text-xs text-[#171717] rounded-lg border border-[#E5E5E5] focus:bg-white focus:border-[#B89753] focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-[#737373] mb-1">
                        {isArabic ? 'الشارع / نقطة علام معروفة *' : 'Street / Landmark *'}
                      </label>
                      <input
                        type="text"
                        id="checkout-street-input"
                        placeholder="e.g. Gouraud Street, next to Paul Bakery"
                        value={formData.street}
                        onChange={(e) => setFormData({ ...formData, street: e.target.value })}
                        className="w-full px-3.5 py-2.5 bg-[#F8F8F6] text-xs text-[#171717] rounded-lg border border-[#E5E5E5] focus:bg-white focus:border-[#B89753] focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-[#737373] mb-1">
                        {isArabic ? 'المبنى، الطابق، رقم الشقة' : 'Building, Floor & Apt'}
                      </label>
                      <input
                        type="text"
                        id="checkout-building-input"
                        placeholder="e.g. Al-Nour Bldg, 4th Floor, Apt B"
                        value={formData.building}
                        onChange={(e) => setFormData({ ...formData, building: e.target.value })}
                        className="w-full px-3.5 py-2.5 bg-[#F8F8F6] text-xs text-[#171717] rounded-lg border border-[#E5E5E5] focus:bg-white focus:border-[#B89753] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-[#737373] mb-1">
                      {isArabic ? 'ملاحظات إضافية للتوصيل (اختياري)' : 'Delivery Notes & Courier Instructions (Optional)'}
                    </label>
                    <input
                      type="text"
                      id="checkout-notes-input"
                      placeholder="e.g. Call upon arrival, leave with building concierge if not present"
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-[#F8F8F6] text-xs text-[#171717] rounded-lg border border-[#E5E5E5] focus:bg-white focus:border-[#B89753] focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {/* Delivery Speed Selection */}
              {firebaseUser && (visibility.checkoutDeliverySpeed || isVisualEditMode) && (
                <div className={`p-6 rounded-xl bg-white border border-[#E5E5E5] space-y-4 shadow-xs relative ${!visibility.checkoutDeliverySpeed && isVisualEditMode ? 'opacity-70 border-2 border-dashed border-rose-500/80' : ''}`}>
                  {!visibility.checkoutDeliverySpeed && isVisualEditMode && (
                    <div className="absolute top-2 right-4 z-40 bg-rose-600 text-white px-2.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 shadow-xs">
                      <EyeOff className="w-3 h-3" />
                      <span>Speed Hidden</span>
                    </div>
                  )}
                  <h3 className="text-base font-serif font-bold text-[#171717] flex items-center gap-2 pb-3 border-b border-[#E5E5E5]">
                    <Truck className="w-5 h-5 text-[#8F7137]" />
                    <span>{isArabic ? 'سرعة التوصيل والشحن' : 'Delivery Speed & Schedule'}</span>
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <button
                      type="button"
                      onClick={() => setDeliverySpeed('express_beirut')}
                      className={`p-3.5 rounded-lg border text-left transition-all cursor-pointer ${
                        deliverySpeed === 'express_beirut'
                          ? 'border-[#B89753] bg-[#B89753]/5 shadow-xs'
                          : 'border-[#E5E5E5] bg-[#F8F8F6] hover:bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-[#171717]">
                          {isArabic ? 'بيروت السريع' : 'Beirut Express'}
                        </span>
                        <span className="text-[11px] font-bold text-[#8F7137]">$3.00</span>
                      </div>
                      <p className="text-[11px] text-[#737373]">
                        {isArabic ? 'خلال ساعتين في بيروت' : 'Within 2 Hours in Beirut'}
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setDeliverySpeed('standard')}
                      className={`p-3.5 rounded-lg border text-left transition-all cursor-pointer ${
                        deliverySpeed === 'standard'
                          ? 'border-[#B89753] bg-[#B89753]/5 shadow-xs'
                          : 'border-[#E5E5E5] bg-[#F8F8F6] hover:bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-[#171717]">
                          {isArabic ? 'كافة المناطق' : 'Standard All Lebanon'}
                        </span>
                        <span className="text-[11px] font-bold text-[#8F7137]">$2.00</span>
                      </div>
                      <p className="text-[11px] text-[#737373]">
                        {isArabic ? '24 - 48 ساعة لكافة المناطق' : '24 - 48 Hours Nationwide'}
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setDeliverySpeed('diaspora_air')}
                      className={`p-3.5 rounded-lg border text-left transition-all cursor-pointer ${
                        deliverySpeed === 'diaspora_air'
                          ? 'border-[#B89753] bg-[#B89753]/5 shadow-xs'
                          : 'border-[#E5E5E5] bg-[#F8F8F6] hover:bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-[#171717]">
                          {isArabic ? 'شحن الاغتراب' : 'Diaspora Air Express'}
                        </span>
                        <span className="text-[11px] font-bold text-[#8F7137]">$28.00</span>
                      </div>
                      <p className="text-[11px] text-[#737373]">
                        {isArabic ? '3 - 5 أيام عمل دولياً' : '3 - 5 Business Days DHL'}
                      </p>
                    </button>
                  </div>
                </div>
              )}

              {/* Payment Method Selection */}
              {firebaseUser && (visibility.checkoutPaymentMethod || isVisualEditMode) && (
                <div className={`p-6 rounded-xl bg-white border border-[#E5E5E5] space-y-4 shadow-xs relative ${!visibility.checkoutPaymentMethod && isVisualEditMode ? 'opacity-70 border-2 border-dashed border-rose-500/80' : ''}`}>
                  {!visibility.checkoutPaymentMethod && isVisualEditMode && (
                    <div className="absolute top-2 right-4 z-40 bg-rose-600 text-white px-2.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 shadow-xs">
                      <EyeOff className="w-3 h-3" />
                      <span>Payment Hidden</span>
                    </div>
                  )}
                  <h3 className="text-base font-serif font-bold text-[#171717] flex items-center gap-2 pb-3 border-b border-[#E5E5E5]">
                    <CreditCard className="w-5 h-5 text-[#8F7137]" />
                    <span>{isArabic ? 'طريقة الدفع والتسوية' : 'Payment Method & Settlement'}</span>
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('cod_usd')}
                      className={`p-3.5 rounded-lg border text-left transition-all cursor-pointer flex items-center gap-3 ${
                        paymentMethod === 'cod_usd'
                          ? 'border-[#B89753] bg-[#B89753]/5 shadow-xs'
                          : 'border-[#E5E5E5] bg-[#F8F8F6] hover:bg-white'
                      }`}
                    >
                      <div className="w-9 h-9 rounded-lg bg-white border border-[#E5E5E5] flex items-center justify-center text-[#8F7137] shrink-0">
                        <Banknote className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-[#171717]">
                          {isArabic ? 'الدفع نقداً بالدولار (COD)' : 'Cash on Delivery ($ USD)'}
                        </div>
                        <div className="text-[11px] text-[#737373]">
                          {isArabic ? 'تسليم نقدي عند الاستلام' : 'Pay in cash upon arrival'}
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPaymentMethod('cod_lbp')}
                      className={`p-3.5 rounded-lg border text-left transition-all cursor-pointer flex items-center gap-3 ${
                        paymentMethod === 'cod_lbp'
                          ? 'border-[#B89753] bg-[#B89753]/5 shadow-xs'
                          : 'border-[#E5E5E5] bg-[#F8F8F6] hover:bg-white'
                      }`}
                    >
                      <div className="w-9 h-9 rounded-lg bg-white border border-[#E5E5E5] flex items-center justify-center text-[#8F7137] shrink-0">
                        <Banknote className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-[#171717]">
                          {isArabic ? 'الدفع بالليرة اللبنانية (LBP)' : 'Cash on Delivery (LBP)'}
                        </div>
                        <div className="text-[11px] text-[#737373]">
                          {isArabic ? 'حسب سعر الصرف الرسمي' : 'Official market rate'}
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPaymentMethod('wish_omt')}
                      className={`p-3.5 rounded-lg border text-left transition-all cursor-pointer flex items-center gap-3 ${
                        paymentMethod === 'wish_omt'
                          ? 'border-[#B89753] bg-[#B89753]/5 shadow-xs'
                          : 'border-[#E5E5E5] bg-[#F8F8F6] hover:bg-white'
                      }`}
                    >
                      <div className="w-9 h-9 rounded-lg bg-white border border-[#E5E5E5] flex items-center justify-center text-[#8F7137] shrink-0">
                        <Sparkles className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-[#171717]">
                          {isArabic ? 'Whish Money / OMT' : 'Whish Money / OMT'}
                        </div>
                        <div className="text-[11px] text-[#737373]">
                          {isArabic ? 'تحويل إلكتروني فوري' : 'Instant local e-transfer'}
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPaymentMethod('credit_card')}
                      className={`p-3.5 rounded-lg border text-left transition-all cursor-pointer flex items-center gap-3 ${
                        paymentMethod === 'credit_card'
                          ? 'border-[#B89753] bg-[#B89753]/5 shadow-xs'
                          : 'border-[#E5E5E5] bg-[#F8F8F6] hover:bg-white'
                      }`}
                    >
                      <div className="w-9 h-9 rounded-lg bg-white border border-[#E5E5E5] flex items-center justify-center text-[#8F7137] shrink-0">
                        <CreditCard className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-[#171717]">
                          {isArabic ? 'بطاقة مصرفية / ائتمان' : 'Credit / Debit Card'}
                        </div>
                        <div className="text-[11px] text-[#737373]">
                          {isArabic ? 'دفع آمن ومشفر' : 'Secure online gateway'}
                        </div>
                      </div>
                    </button>
                  </div>
                </div>
              )}

            </div>

            {/* Right Column: Order Summary Card */}
            <div className="lg:col-span-5 space-y-6">
              
              {(visibility.checkoutOrderSummary || isVisualEditMode) && (
                <div className={`p-6 rounded-xl bg-white border border-[#E5E5E5] space-y-6 sticky top-28 relative shadow-xs ${!visibility.checkoutOrderSummary && isVisualEditMode ? 'opacity-70 border-2 border-dashed border-rose-500/80' : ''}`}>
                  {!visibility.checkoutOrderSummary && isVisualEditMode && (
                    <div className="absolute top-2 right-4 z-40 bg-rose-600 text-white px-2.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 shadow-xs">
                      <EyeOff className="w-3 h-3" />
                      <span>Summary Box Hidden</span>
                    </div>
                  )}
                  <h3 className="text-base font-serif font-bold text-[#171717] pb-3 border-b border-[#E5E5E5] flex items-center justify-between">
                    <span>{siteContent?.checkoutPage?.summaryHeading || (isArabic ? 'ملخص الطلب' : 'Order Summary')}</span>
                    <span className="text-xs text-[#8F7137] font-bold bg-[#B89753]/10 px-2.5 py-0.5 rounded-full border border-[#B89753]/20">{cart.length} {isArabic ? 'منتجات' : 'Items'}</span>
                  </h3>

                {/* Items preview */}
                <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                  {cart.map((item) => (
                    <div key={item.product.id} className="flex items-center gap-3 text-xs">
                      <div className="w-12 h-12 rounded-lg bg-[#F8F8F6] border border-[#E5E5E5] flex-shrink-0 flex items-center justify-center p-0.5 overflow-hidden">
                        <img
                          src={item.product.image}
                          alt={item.product.name}
                          className="w-full h-full object-contain"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-[#171717] truncate">{item.product.name}</h4>
                        <p className="text-[11px] text-[#737373]">Qty: {item.quantity} × {formatPrice(item.product.priceUSD)}</p>
                      </div>
                      <span className="font-bold text-[#8F7137]">
                        {formatPrice(item.product.priceUSD * item.quantity)}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Coupon Code Section in Checkout */}
                <div className="pt-3 border-t border-[#E5E5E5] space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-[#171717]">
                    <span className="flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5 text-[#8F7137]" />
                      <span>{isArabic ? 'كوبون الخصم' : 'Discount Coupon'}</span>
                    </span>
                    {appliedCouponCode && (
                      <span className="text-[10px] font-bold text-[#16803C] bg-[#16803C]/10 px-2 py-0.5 rounded-md border border-[#16803C]/20">
                        {appliedCouponCode}
                      </span>
                    )}
                  </div>

                  {appliedCouponCode ? (
                    <div className="flex items-center justify-between p-2 rounded-lg bg-[#16803C]/10 border border-[#16803C]/20 text-xs">
                      <div className="flex items-center gap-1.5 text-[#16803C] font-medium text-[11px]">
                        <Check className="w-3.5 h-3.5 text-[#16803C]" />
                        <span>{isArabic ? `تم توفير ${formatPrice(discountUSD)}` : `Saved ${formatPrice(discountUSD)}`}</span>
                      </div>
                      <button
                        type="button"
                        onClick={removeCoupon}
                        className="text-[10px] font-bold text-[#C62828] hover:underline bg-white px-2 py-0.5 rounded-md border border-[#E5E5E5] cursor-pointer"
                      >
                        {isArabic ? 'إلغاء' : 'Remove'}
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={checkoutCouponInput}
                        onChange={(e) => setCheckoutCouponInput(e.target.value.toUpperCase())}
                        placeholder={isArabic ? 'مثال: KOURA15' : 'e.g. KOURA15'}
                        className="flex-1 px-3 py-2 text-xs rounded-lg bg-[#F8F8F6] border border-[#E5E5E5] text-[#171717] placeholder:text-[#737373] font-mono uppercase focus:bg-white focus:border-[#B89753] focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (checkoutCouponInput.trim()) {
                            setIsApplyingCheckoutCoupon(true);
                            applyCoupon(checkoutCouponInput);
                            setIsApplyingCheckoutCoupon(false);
                            setCheckoutCouponInput('');
                          }
                        }}
                        disabled={isApplyingCheckoutCoupon || !checkoutCouponInput.trim()}
                        className="px-3 py-2 rounded-lg bg-[#171717] hover:bg-[#8F7137] disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer"
                      >
                        {isArabic ? 'تطبيق' : 'Apply'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Totals Calculation */}
                <div className="pt-3 border-t border-[#E5E5E5] space-y-2 text-xs">
                  <div className="flex justify-between text-[#737373]">
                    <span>{isArabic ? 'مجموع المنتجات' : 'Products Subtotal'}</span>
                    <span className="font-bold text-[#171717]">{formatPrice(Math.round(cart.reduce((s, i) => s + i.product.priceUSD * i.quantity, 0) * 100) / 100)}</span>
                  </div>

                  {discountUSD > 0 && (
                    <div className="flex justify-between text-[#16803C] font-bold">
                      <span className="flex items-center gap-1">
                        <Percent className="w-3.5 h-3.5" />
                        <span>{isArabic ? 'الخصم المطبق' : 'Applied Discount'}</span>
                      </span>
                      <span>-{formatPrice(discountUSD)}</span>
                    </div>
                  )}

                  <div className="flex justify-between text-[#737373]">
                    <span>{isArabic ? 'أجور التوصيل والشحن' : 'Delivery Courier Fee'}</span>
                    <span className="font-bold text-[#8F7137]">+{formatPrice(deliveryFeeUSD)}</span>
                  </div>

                  <div className="pt-3 border-t border-[#E5E5E5] flex items-baseline justify-between">
                    <span className="text-sm font-bold text-[#171717]">{isArabic ? 'المبلغ الإجمالي المستحق' : 'Total Amount Due'}</span>
                    <div className="text-right">
                      <span className="text-2xl font-bold text-[#8F7137]">
                        {formatPrice(finalTotalUSD)}
                      </span>
                      <div className="text-[10px] text-[#737373] font-mono">
                        ≈ {(finalTotalUSD * LBP_USD_RATE).toLocaleString()} LBP
                      </div>
                    </div>
                  </div>
                </div>

                {/* Submit Order Button */}
                <button
                  type="submit"
                  id="place-order-btn"
                  disabled={isSubmitting}
                  className="w-full py-3.5 rounded-lg bg-[#171717] hover:bg-[#8F7137] text-white font-bold uppercase text-xs tracking-wider shadow-xs transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <ShieldCheck className="w-4 h-4 text-[#16803C]" />
                  <span>
                    {isSubmitting 
                      ? (isArabic ? 'جاري المعالجة...' : 'Processing Order...') 
                      : siteContent?.checkoutPage?.orderButtonText
                        ? `${siteContent.checkoutPage.orderButtonText} ($${finalTotalUSD.toFixed(2)})`
                        : (isArabic 
                          ? `تأكيد الطلب اللبناني ($${finalTotalUSD.toFixed(2)})` 
                          : `Confirm Lebanese Order ($${finalTotalUSD.toFixed(2)})`)}
                  </span>
                </button>

                {!firebaseUser && (
                  <p className="text-[11px] text-[#8F7137] bg-[#B89753]/10 p-2.5 rounded-lg border border-[#B89753]/20 text-center font-medium flex items-center justify-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 shrink-0" />
                    <span>{isArabic ? 'يرجى تسجيل الدخول أعلاه لإكمال الطلب' : 'Please sign in or register above to complete order'}</span>
                  </p>
                )}

                {/* Guarantee Badges */}
                {(visibility.checkoutGuarantees || isVisualEditMode) && (
                  <div className={`pt-2 border-t border-[#E5E5E5] text-[11px] text-[#737373] space-y-1.5 relative ${!visibility.checkoutGuarantees && isVisualEditMode ? 'opacity-70 border-2 border-dashed border-rose-500/80 p-1.5 rounded-lg' : ''}`}>
                    {!visibility.checkoutGuarantees && isVisualEditMode && (
                      <div className="absolute top-0 right-0 bg-rose-600 text-white px-1.5 py-0.5 rounded text-[8px] font-bold">Hidden</div>
                    )}
                    <div className="flex items-center gap-2">
                      <LebanonFlag className="w-3.5 h-2.5 rounded-xs" />
                      <span>{siteContent?.checkoutPage?.guaranteeBadgeText || '100% Authentic Lebanese Artisan Guilds'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <PhoneCall className="w-3.5 h-3.5 text-[#16803C]" />
                      <span>Dedicated courier WhatsApp confirmation before drop-off</span>
                    </div>
                  </div>
                )}

              </div>
              )}

            </div>

          </form>
        )}

      </div>

      {/* Bottom Custom Divs / Banners */}
      <CustomBlocksRenderer page="checkout" position="bottom" />

      {/* Forgot Password Modal */}
      {showForgotPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fade-in">
          <div 
            ref={forgotPasswordModalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-password-modal-title"
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
                <h3 id="reset-password-modal-title" className="font-serif font-bold text-[#171717] text-base">
                  {isArabic ? 'إعادة تعيين كلمة المرور' : 'Reset Your Password'}
                </h3>
                <p className="text-xs text-[#737373]">
                  {isArabic ? 'أدخل بريدك الإلكتروني وسيتم إرسال رابط إعادة التعيين.' : 'Enter your registered email address to receive a reset link.'}
                </p>
              </div>
            </div>

            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[#737373] mb-1">
                  {isArabic ? 'البريد الإلكتروني *' : 'Email Address *'}
                </label>
                <div className="relative flex items-center">
                  <Mail className="w-4 h-4 absolute left-3.5 text-[#737373]" />
                  <input
                    type="email"
                    required
                    id="checkout-forgot-email-input"
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
                  {isArabic ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  id="checkout-send-reset-btn"
                  disabled={isSendingReset}
                  className="px-5 py-2 rounded-lg bg-[#171717] hover:bg-black text-white text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-2"
                >
                  {isSendingReset ? (
                    <span>{isArabic ? 'جاري الإرسال...' : 'Sending Link...'}</span>
                  ) : (
                    <span>{isArabic ? 'إرسال رابط التعيين' : 'Send Reset Link'}</span>
                  )}
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
        language={isArabic ? 'ar' : 'en'}
        initialPhone={formData.phone}
      />

      {/* Security OTP Modal */}
      <OTPModal
        isOpen={showOtpModal}
        onClose={() => setShowOtpModal(false)}
        targetContact={otpTargetContact}
        actionType={otpActionType}
        language={isArabic ? 'ar' : 'en'}
        onVerifySuccess={async () => {
          if (pendingAuthAction) {
            await pendingAuthAction();
          }
        }}
      />
    </div>
  );
};
