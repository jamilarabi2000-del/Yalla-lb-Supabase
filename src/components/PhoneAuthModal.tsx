import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheck, ArrowRight, RefreshCw, X, AlertCircle, Smartphone, CheckCircle2, Lock } from 'lucide-react';
import { auth, RecaptchaVerifier, signInWithPhoneNumber, ConfirmationResult } from '../firebase';
import { LebanonFlag } from './LebanonFlag';
import { normalizeLebanesePhone } from '../utils/phoneUtils';

interface PhoneAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (user: any) => Promise<void> | void;
  initialPhone?: string;
  language?: 'en' | 'ar';
}

declare global {
  interface Window {
    recaptchaVerifier?: RecaptchaVerifier;
  }
}

export const PhoneAuthModal: React.FC<PhoneAuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialPhone = '',
  language = 'en'
}) => {
  const isArabic = language === 'ar';
  
  // Step 1: 'phone' (input phone) -> Step 2: 'code' (input 6-digit SMS OTP)
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phoneDigits, setPhoneDigits] = useState<string>('');
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [isSending, setIsSending] = useState<boolean>(false);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [resendTimer, setResendTimer] = useState<number>(60);
  const [canResend, setCanResend] = useState<boolean>(false);
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const recaptchaContainerRef = useRef<HTMLDivElement | null>(null);

  // Initialize phone digits when modal opens
  useEffect(() => {
    if (isOpen) {
      const clean = initialPhone.replace(/\D/g, '');
      const lebanese = clean.startsWith('961') ? clean.slice(3) : clean;
      setPhoneDigits(lebanese.slice(0, 8));
      setStep('phone');
      setOtpDigits(['', '', '', '', '', '']);
      setErrorMsg('');
      setResendTimer(60);
      setCanResend(false);
      setConfirmationResult(null);
    }
  }, [isOpen, initialPhone]);

  // Clean up reCAPTCHA on unmount or close
  useEffect(() => {
    return () => {
      try {
        if (window.recaptchaVerifier) {
          window.recaptchaVerifier.clear();
          window.recaptchaVerifier = undefined;
        }
      } catch {}
    };
  }, []);

  // Resend Countdown Timer
  useEffect(() => {
    let timer: any;
    if (isOpen && step === 'code' && resendTimer > 0) {
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
  }, [isOpen, step, resendTimer]);

  // Setup reCAPTCHA verifier
  const setupRecaptcha = (): RecaptchaVerifier => {
    if (window.recaptchaVerifier) {
      try {
        window.recaptchaVerifier.clear();
      } catch {}
      window.recaptchaVerifier = undefined;
    }

    const verifier = new RecaptchaVerifier(auth, 'firebase-phone-recaptcha-container', {
      size: 'invisible',
      callback: () => {
        // reCAPTCHA solved
      },
      'expired-callback': () => {
        setErrorMsg(isArabic ? 'انتهت صلاحية التحقق الأمني، يرجى المحاولة مرة أخرى.' : 'Security verification expired. Please try again.');
      }
    });

    window.recaptchaVerifier = verifier;
    return verifier;
  };

  // Send Firebase Phone SMS OTP
  const handleSendCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMsg('');

    const norm = normalizeLebanesePhone(phoneDigits);
    if (!norm.isValid) {
      setErrorMsg(isArabic ? 'يرجى إدخال رقم هاتف لبناني صحيح من 8 أرقام' : 'Please enter a valid 8-digit Lebanese phone number');
      return;
    }

    // Format strictly for Firebase E.164: e.g. +96170123456
    const e164Phone = `+961${norm.cleanDigits}`;

    setIsSending(true);
    try {
      const verifier = setupRecaptcha();
      const confirmation = await signInWithPhoneNumber(auth, e164Phone, verifier);
      
      setConfirmationResult(confirmation);
      setStep('code');
      setResendTimer(60);
      setCanResend(false);
      setOtpDigits(['', '', '', '', '', '']);

      setTimeout(() => {
        if (inputRefs.current[0]) {
          inputRefs.current[0].focus();
        }
      }, 250);
    } catch (err: any) {
      console.error('[Firebase Phone Auth] Send SMS Error:', err);
      let msg = isArabic ? 'فشل إرسال رمز التحقق عبر الرسائل النصية.' : 'Failed to send SMS verification code.';
      
      if (err?.code === 'auth/invalid-phone-number') {
        msg = isArabic ? 'رقم الهاتف غير صالح. يرجى التأكد من كتابته بشكل صحيح.' : 'Invalid phone number format.';
      } else if (err?.code === 'auth/quota-exceeded' || err?.code === 'auth/too-many-requests') {
        msg = isArabic ? 'تم تجاوز الحد الأقصى للمحاولات، يرجى المحاولة لاحقاً.' : 'SMS quota exceeded or too many requests. Please try again later.';
      } else if (err?.code === 'auth/captcha-check-failed') {
        msg = isArabic ? 'فشل التحقق الأمني من reCAPTCHA. يرجى إعادة المحاولة.' : 'reCAPTCHA verification failed. Please try again.';
      } else if (err?.code === 'auth/operation-not-allowed') {
        msg = isArabic ? 'خدمة تسجيل الدخول برقم الهاتف غير مفعلة حالياً.' : 'Phone authentication is not enabled.';
      } else {
        msg = isArabic ? 'فشل إرسال رمز التحقق. يرجى المحاولة مرة أخرى لاحقاً.' : 'Failed to send SMS verification code. Please try again later.';
      }
      
      setErrorMsg(msg);
      // Reset reCAPTCHA on failure
      try {
        if (window.recaptchaVerifier) {
          window.recaptchaVerifier.clear();
          window.recaptchaVerifier = undefined;
        }
      } catch {}
    } finally {
      setIsSending(false);
    }
  };

  // Verify Firebase Phone SMS OTP
  const handleVerifyCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const enteredCode = otpDigits.join('');
    if (enteredCode.length < 6) {
      setErrorMsg(isArabic ? 'يرجى إدخال رمز التحقق المتكون من 6 أرقام كاملة' : 'Please enter the complete 6-digit verification code.');
      return;
    }

    if (!confirmationResult) {
      setErrorMsg(isArabic ? 'انتهت صلاحية الجلسة، يرجى إعادة طلب الرمز.' : 'Session expired. Please request a new verification code.');
      setStep('phone');
      return;
    }

    setIsVerifying(true);
    setErrorMsg('');

    try {
      const userCredential = await confirmationResult.confirm(enteredCode);
      const user = userCredential.user;

      // Close modal and call success callback
      onClose();
      if (onSuccess) {
        await onSuccess(user);
      }
    } catch (err: any) {
      console.error('[Firebase Phone Auth] Code Confirmation Error:', err);
      let msg = isArabic ? 'رمز التحقق غير صحيح أو منتهي الصلاحية.' : 'Invalid or expired verification code.';
      
      if (err?.code === 'auth/invalid-verification-code') {
        msg = isArabic ? 'رمز التحقق غير صحيح. يرجى التأكد وإعادة المحاولة.' : 'Invalid verification code. Please try again.';
      } else if (err?.code === 'auth/code-expired') {
        msg = isArabic ? 'انتهت صلاحية رمز التحقق. يرجى طلب رمز جديد.' : 'The verification code has expired. Please request a new one.';
      } else {
        msg = isArabic ? 'رمز التحقق غير صحيح أو منتهي الصلاحية.' : 'Invalid or expired verification code.';
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
      {/* Invisible container for Firebase reCAPTCHA */}
      <div id="firebase-phone-recaptcha-container" ref={recaptchaContainerRef}></div>

      <div 
        className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-[#E5E5E5] overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="phone-auth-modal-title"
      >
        {/* Header Ribbon */}
        <div className="bg-[#171717] px-6 py-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#B89753]/20 border border-[#B89753]/40 flex items-center justify-center text-[#B89753]">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h3 id="phone-auth-modal-title" className="font-serif font-bold text-base tracking-wide text-white">
                {isArabic ? 'تسجيل الدخول برقم الهاتف' : 'Firebase Phone Sign-In'}
              </h3>
              <p className="text-[11px] text-neutral-400">
                {isArabic ? 'توثيق رسمي آمن عبر الرسائل القصيرة SMS' : 'Official native SMS OTP authentication'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* STEP 1: ENTER PHONE NUMBER */}
          {step === 'phone' ? (
            <form onSubmit={handleSendCode} className="space-y-4">
              <div className="text-center space-y-1">
                <p className="text-xs text-[#737373] leading-relaxed">
                  {isArabic
                    ? 'أدخل رقم هاتفك اللبناني لتسجيل الدخول أو إنشاء حسابك فوراً عبر رمز التحقق (SMS).'
                    : 'Enter your Lebanese phone number to sign in or register instantly via SMS code.'}
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[#737373] mb-1.5">
                  {isArabic ? 'رقم الهاتف اللبناني (8 أرقام)' : 'Lebanese Phone Number (8 digits)'}
                </label>
                <div className="relative flex items-center">
                  <div className="absolute left-3 flex items-center gap-1.5 pointer-events-none text-[#737373] font-bold text-xs select-none">
                    <LebanonFlag className="w-4 h-3 rounded-xs" />
                    <span>+961</span>
                  </div>
                  <input
                    type="tel"
                    id="phone-auth-number-input"
                    autoFocus
                    placeholder="70 123456"
                    maxLength={8}
                    value={phoneDigits}
                    onChange={(e) => {
                      setErrorMsg('');
                      setPhoneDigits(e.target.value.replace(/\D/g, ''));
                    }}
                    className="w-full pl-20 pr-4 py-3 bg-[#F8F8F6] text-[#171717] font-mono text-sm rounded-xl border border-[#E5E5E5] focus:outline-none focus:border-[#B89753] focus:bg-white transition-all tracking-wider font-semibold"
                  />
                </div>
              </div>

              {/* Error Message */}
              {errorMsg && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-rose-700 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <button
                type="submit"
                id="phone-auth-send-code-btn"
                disabled={isSending || phoneDigits.length !== 8}
                className="w-full py-3.5 bg-[#171717] hover:bg-black text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-all shadow-sm cursor-pointer disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {isSending ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-[#B89753]" />
                    <span>{isArabic ? 'جاري إرسال الرمز...' : 'Sending SMS Code...'}</span>
                  </>
                ) : (
                  <>
                    <span>{isArabic ? 'إرسال رمز التحقق SMS' : 'Send SMS Code'}</span>
                    <ArrowRight className={`w-4 h-4 text-[#B89753] ${isArabic ? 'rotate-180' : ''}`} />
                  </>
                )}
              </button>

              <div className="pt-2 text-center">
                <p className="text-[10px] text-[#A3A3A3] flex items-center justify-center gap-1">
                  <Lock className="w-3 h-3 text-[#16803C]" />
                  <span>{isArabic ? 'محمي بواسطة Firebase Phone Auth & reCAPTCHA' : 'Secured by Firebase Phone Auth & reCAPTCHA'}</span>
                </p>
              </div>
            </form>
          ) : (
            /* STEP 2: ENTER 6-DIGIT CODE */
            <form onSubmit={handleVerifyCode} className="space-y-5">
              <div className="text-center space-y-1">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-[#16803C] border border-emerald-200 rounded-full text-[11px] font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>+961 {phoneDigits}</span>
                </div>
                <p className="text-xs text-[#737373] mt-2">
                  {isArabic
                    ? 'أدخل رمز التحقق المكون من 6 أرقام المرسل إلى هاتفك عبر SMS'
                    : 'Enter the 6-digit verification code sent to your phone via SMS'}
                </p>
              </div>

              {/* 6-Digit OTP Inputs */}
              <div className="flex justify-center gap-2.5" dir="ltr">
                {otpDigits.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => { inputRefs.current[idx] = el; }}
                    id={`firebase-phone-otp-input-${idx}`}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleDigitChange(idx, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(idx, e)}
                    className="w-11 h-13 text-center text-xl font-bold bg-[#F8F8F6] border-2 border-[#E5E5E5] focus:border-[#B89753] focus:bg-white rounded-xl focus:outline-none transition-all shadow-2xs"
                  />
                ))}
              </div>

              {/* Error Message */}
              {errorMsg && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-rose-700 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Verify Button */}
              <button
                type="submit"
                id="phone-auth-verify-code-btn"
                disabled={isVerifying || otpDigits.join('').length < 6}
                className="w-full py-3.5 bg-[#171717] hover:bg-black text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-all shadow-sm cursor-pointer disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {isVerifying ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-[#B89753]" />
                    <span>{isArabic ? 'جاري التحقق...' : 'Verifying Code...'}</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4 text-[#B89753]" />
                    <span>{isArabic ? 'تأكيد الرمز وتسجيل الدخول' : 'Confirm Code & Sign In'}</span>
                  </>
                )}
              </button>

              {/* Resend & Back controls */}
              <div className="flex items-center justify-between text-xs pt-1 border-t border-[#E5E5E5]">
                <button
                  type="button"
                  onClick={() => {
                    setStep('phone');
                    setErrorMsg('');
                  }}
                  className="text-[#737373] hover:text-[#171717] font-semibold transition-colors cursor-pointer"
                >
                  {isArabic ? 'تغيير رقم الهاتف' : 'Change Phone'}
                </button>

                <button
                  type="button"
                  onClick={() => handleSendCode()}
                  disabled={!canResend || isSending}
                  className="inline-flex items-center gap-1.5 font-bold text-[#8F7137] hover:text-[#B89753] disabled:text-[#A3A3A3] disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSending ? 'animate-spin' : ''}`} />
                  <span>
                    {canResend
                      ? (isArabic ? 'إعادة إرسال الرمز' : 'Resend SMS')
                      : `${isArabic ? 'إعادة الإرسال بعد' : 'Resend in'} ${resendTimer}s`}
                  </span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
