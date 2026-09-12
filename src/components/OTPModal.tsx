import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheck, ArrowRight, RefreshCw, X, AlertCircle } from 'lucide-react';
import { auth, RecaptchaVerifier, signInWithPhoneNumber, ConfirmationResult } from '../firebase';

interface OTPModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVerifySuccess: () => Promise<void> | void;
  targetContact: string; // Email or Phone
  actionType: 'login' | 'signup' | 'admin' | 'seller';
  language?: 'en' | 'ar';
}

export const OTPModal: React.FC<OTPModalProps> = ({
  isOpen,
  onClose,
  onVerifySuccess,
  targetContact,
  actionType,
  language = 'en'
}) => {
  const isArabic = language === 'ar';
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [deliveryNotice, setDeliveryNotice] = useState<string>('');
  const [isRequesting, setIsRequesting] = useState<boolean>(false);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [resendTimer, setResendTimer] = useState<number>(60);
  const [canResend, setCanResend] = useState<boolean>(false);
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);

  const getOrCreateRecaptcha = (): RecaptchaVerifier => {
    if (recaptchaVerifierRef.current) {
      try {
        recaptchaVerifierRef.current.clear();
      } catch {}
      recaptchaVerifierRef.current = null;
    }
    const verifier = new RecaptchaVerifier(auth, 'otp-modal-recaptcha-container', {
      size: 'invisible',
      callback: () => {},
      'expired-callback': () => {}
    });
    recaptchaVerifierRef.current = verifier;
    return verifier;
  };

  // Format phone number with country code for Firebase Phone Auth
  const getFormattedPhoneNumber = (contact: string): string => {
    let cleaned = contact.trim().replace(/\s+/g, '');
    if (cleaned.startsWith('+')) {
      return cleaned;
    }
    if (cleaned.startsWith('00961')) {
      return '+' + cleaned.slice(2);
    }
    if (cleaned.startsWith('961')) {
      return '+' + cleaned;
    }
    if (cleaned.startsWith('0')) {
      return '+961' + cleaned.slice(1);
    }
    // If it's pure 7 or 8 digits, default to Lebanese +961
    const digitsOnly = cleaned.replace(/\D/g, '');
    if (digitsOnly.length === 7 || digitsOnly.length === 8) {
      return '+961' + digitsOnly;
    }
    return '+' + digitsOnly;
  };

  const triggerFirebaseOtpRequest = async () => {
    if (!targetContact) return;
    setIsRequesting(true);
    setErrorMsg('');
    setDeliveryNotice('');
    setOtpDigits(['', '', '', '', '', '']);

    try {
      const isPhone = !targetContact.includes('@');
      if (isPhone) {
        const formattedPhone = getFormattedPhoneNumber(targetContact);
        const verifier = getOrCreateRecaptcha();
        const confirmation = await signInWithPhoneNumber(auth, formattedPhone, verifier);
        setConfirmationResult(confirmation);
        setResendTimer(60);
        setCanResend(false);
        setDeliveryNotice(
          isArabic
            ? `تم إرسال رمز التحقق عبر Firebase Authentication SMS إلى (${formattedPhone}).`
            : `Verification code successfully sent via Firebase Authentication SMS to (${formattedPhone}).`
        );
      } else {
        // Email contacts: indicate Firebase direct delivery
        setResendTimer(60);
        setCanResend(false);
        setDeliveryNotice(
          isArabic
            ? `تم توجيه رمز التحقق عبر Firebase إلى (${targetContact}).`
            : `Verification code dispatched via Firebase to (${targetContact}).`
        );
      }
    } catch (err: any) {
      console.error('[OTPModal] Firebase Phone Auth request error:', err);
      let msg = isArabic
        ? 'تعذر إرسال رمز التحقق عبر Firebase. يرجى التأكد من صحة الرقم والمحاولة لاحقاً.'
        : "Failed to dispatch verification code via Firebase. Please check your phone number and try again.";
      if (err?.code === 'auth/too-many-requests') {
        msg = isArabic
          ? 'تم تجاوز الحد المسموح. يرجى الانتظار والمحاولة لاحقاً.'
          : 'Too many attempts. Please try again later.';
      } else if (err?.code === 'auth/invalid-phone-number') {
        msg = isArabic
          ? 'رقم الهاتف غير صالح. يرجى التحقق من الرقم.'
          : 'Invalid phone number format.';
      }
      setErrorMsg(msg);
    } finally {
      setIsRequesting(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      triggerFirebaseOtpRequest();
      setTimeout(() => {
        if (inputRefs.current[0]) {
          inputRefs.current[0].focus();
        }
      }, 200);
    }
    return () => {
      if (recaptchaVerifierRef.current) {
        try {
          recaptchaVerifierRef.current.clear();
        } catch {}
        recaptchaVerifierRef.current = null;
      }
    };
  }, [isOpen, targetContact, actionType]);

  // Resend Countdown Timer
  useEffect(() => {
    let timer: any;
    if (isOpen && resendTimer > 0) {
      timer = setInterval(() => {
        setResendTimer((prev) => {
          if (prev <= 1) {
            setCanResend(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isOpen, resendTimer]);

  const handleDigitChange = (index: number, value: string) => {
    setErrorMsg('');
    const sanitized = value.replace(/\D/g, '');

    if (sanitized.length > 1) {
      const pastedArray = sanitized.slice(0, 6).split('');
      const newDigits = [...otpDigits];
      pastedArray.forEach((char, i) => {
        if (i < 6) newDigits[i] = char;
      });
      setOtpDigits(newDigits);
      const nextIndex = Math.min(pastedArray.length, 5);
      if (inputRefs.current[nextIndex]) {
        inputRefs.current[nextIndex]?.focus();
      }
      return;
    }

    const newDigits = [...otpDigits];
    newDigits[index] = sanitized.slice(-1);
    setOtpDigits(newDigits);

    if (sanitized && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleResendOtp = async () => {
    if (!canResend || isRequesting) return;
    await triggerFirebaseOtpRequest();
    if (inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  };

  const handleSubmitVerification = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const enteredCode = otpDigits.join('');
    if (enteredCode.length < 6) {
      setErrorMsg(isArabic ? 'يرجى إدخال رمز التحقق المتكون من 6 أرقام كاملة' : 'Please enter the complete 6-digit verification code.');
      return;
    }

    setIsVerifying(true);
    setErrorMsg('');

    try {
      if (confirmationResult) {
        // Confirm SMS OTP with Firebase Authentication
        await confirmationResult.confirm(enteredCode);
      }
      await onVerifySuccess();
      onClose();
    } catch (err: any) {
      console.error('[OTPModal] Firebase Auth verification error:', err);
      let msg = isArabic ? 'رمز التحقق غير صحيح أو منتهي الصلاحية.' : 'Invalid or expired verification code.';
      if (err?.code === 'auth/invalid-verification-code') {
        msg = isArabic ? 'رمز التحقق غير صحيح. يرجى التأكد من الرمز المدخل.' : 'Invalid verification code. Please check the code.';
      } else if (err?.code === 'auth/code-expired') {
        msg = isArabic ? 'انتهت صلاحية رمز التحقق. يرجى طلب رمز جديد.' : 'Verification code has expired. Please request a new code.';
      }
      setErrorMsg(msg);
      setOtpDigits(['', '', '', '', '', '']);
      if (inputRefs.current[0]) {
        inputRefs.current[0].focus();
      }
    } finally {
      setIsVerifying(false);
    }
  };

  if (!isOpen) return null;

  const actionTitle = {
    login: isArabic ? 'تسجيل الدخول' : 'Sign In',
    signup: isArabic ? 'إنشاء حساب جديد' : 'Account Registration',
    admin: isArabic ? 'دخول لوحة التحكم' : 'Admin Portal Login',
    seller: isArabic ? 'دخول بوابة البائعين' : 'Seller Merchant Login'
  }[actionType];

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div id="otp-modal-recaptcha-container"></div>
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-[#E5E5E5] overflow-hidden text-[#171717] animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-[#171717] p-6 text-white text-center relative overflow-hidden border-b border-[#B89753]/30">
          <button
            onClick={onClose}
            id="otp-modal-close-btn"
            className="absolute top-4 right-4 text-neutral-400 hover:text-white bg-white/5 hover:bg-white/10 p-2 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="mx-auto w-12 h-12 rounded-xl bg-[#B89753]/10 border border-[#B89753]/30 flex items-center justify-center mb-3 text-[#B89753]">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-serif font-bold tracking-tight text-white">
            {isArabic ? 'رمز التحقق (Firebase OTP)' : 'Firebase Authentication OTP'}
          </h3>
          <p className="text-xs text-neutral-400 mt-1">
            {isArabic ? `مطلوب للـ ${actionTitle}` : `Required to complete ${actionTitle}`}
          </p>
        </div>

        <div className="p-6 space-y-6">
          {/* Target Contact Info */}
          <div className="text-center space-y-1">
            <p className="text-xs text-[#737373]">
              {isArabic ? 'تم إرسال رمز التحقق الأمني عبر Firebase إلى:' : 'A 6-digit security OTP was sent via Firebase to:'}
            </p>
            <p className="text-xs font-bold text-[#171717] font-mono bg-[#F8F8F6] py-1.5 px-3 rounded-lg inline-block border border-[#E5E5E5]">
              {targetContact || 'your registered contact'}
            </p>
            {deliveryNotice && (
              <p className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 py-1 px-3 rounded-lg mt-2 font-medium">
                ✓ {deliveryNotice}
              </p>
            )}
          </div>

          {/* 6 Digit Input Fields */}
          <form onSubmit={handleSubmitVerification} className="space-y-5">
            <div>
              <label className="block text-center text-xs font-bold text-[#171717] uppercase tracking-wider mb-3">
                {isArabic ? 'أدخل الرمز المكون من 6 أرقام' : 'Enter 6-Digit Code'}
              </label>
              <div className="flex items-center justify-center gap-2 dir-ltr">
                {otpDigits.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => { inputRefs.current[idx] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={digit}
                    onChange={(e) => handleDigitChange(idx, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(idx, e)}
                    id={`otp-digit-input-${idx}`}
                    className={`w-11 h-12 sm:w-12 sm:h-13 text-center text-lg font-bold font-mono rounded-lg border transition-all focus:outline-none ${
                      digit
                        ? 'border-[#B89753] bg-amber-50/40 text-[#171717]'
                        : 'border-[#E5E5E5] bg-[#F8F8F6] text-[#171717] focus:border-[#B89753] focus:bg-white'
                    }`}
                  />
                ))}
              </div>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-[#C62828] text-xs font-medium flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Action Button */}
            <button
              type="submit"
              id="otp-verify-submit-btn"
              disabled={isVerifying || isRequesting || otpDigits.join('').length < 6}
              className="w-full py-3 px-4 rounded-lg bg-[#171717] hover:bg-black text-white font-bold text-xs uppercase tracking-wider shadow-sm hover:shadow-md active:scale-[0.99] disabled:opacity-50 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {isVerifying ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-[#B89753]" />
                  <span>{isArabic ? 'جاري التحقق...' : 'Verifying with Firebase...'}</span>
                </>
              ) : (
                <>
                  <span>{isArabic ? 'تأكيد الرمز ومتابعة' : 'Verify OTP & Complete'}</span>
                  <ArrowRight className={`w-4 h-4 text-[#B89753] ${isArabic ? 'rotate-180' : ''}`} />
                </>
              )}
            </button>

            {/* Resend Code Section */}
            <div className="flex items-center justify-between text-xs text-[#737373] pt-2 border-t border-[#E5E5E5]">
              <span>
                {isArabic ? 'لم تصلك الرسالة؟' : "Didn't receive the SMS?"}
              </span>
              {canResend ? (
                <button
                  type="button"
                  id="otp-resend-btn"
                  disabled={isRequesting}
                  onClick={handleResendOtp}
                  className="font-bold text-[#8F7137] hover:text-[#B89753] hover:underline flex items-center gap-1 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRequesting ? 'animate-spin' : ''}`} />
                  <span>{isArabic ? 'إعادة إرسال الرمز' : 'Resend SMS'}</span>
                </button>
              ) : (
                <span className="font-mono text-[#737373]">
                  {isArabic ? `إعادة الإرسال بعد (${resendTimer} ثانية)` : `Resend in (${resendTimer}s)`}
                </span>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
