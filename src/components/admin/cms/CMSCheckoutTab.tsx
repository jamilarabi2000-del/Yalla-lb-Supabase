import React from 'react';
import { CreditCard, CheckCircle2, Truck } from 'lucide-react';
import { CMSFieldGroup } from './CMSFieldGroup';

interface CMSCheckoutTabProps {
  checkoutData: {
    title: string;
    titleArabic?: string;
    subtitle: string;
    subtitleArabic?: string;
    shippingHeading: string;
    shippingHeadingArabic?: string;
    paymentHeading: string;
    paymentHeadingArabic?: string;
    summaryHeading: string;
    summaryHeadingArabic?: string;
    orderButtonText: string;
    orderButtonTextArabic?: string;
    guaranteeBadgeText: string;
    guaranteeBadgeTextArabic?: string;
  };
  checkoutSuccessData?: {
    successBadge: string;
    successBadgeArabic?: string;
    successTitle: string;
    successTitleArabic?: string;
    nextStepsHeading: string;
    nextStepsHeadingArabic?: string;
    step1Text: string;
    step1TextArabic?: string;
    step2Text: string;
    step2TextArabic?: string;
    step3Text: string;
    step3TextArabic?: string;
    buttonTrackText: string;
    buttonTrackTextArabic?: string;
    buttonContinueText: string;
    buttonContinueTextArabic?: string;
  };
  onChangeCheckoutField: (field: string, value: string) => void;
  onChangeSuccessField: (field: string, value: string) => void;
}

export const CMSCheckoutTab: React.FC<CMSCheckoutTabProps> = ({
  checkoutData = {
    title: 'Lebanon Express Checkout',
    titleArabic: 'إتمام الطلب السريع في لبنان',
    subtitle: 'Select delivery speed and payment method for fast dispatch across Lebanon or internationally.',
    subtitleArabic: 'اختر طريقة التوصيل والدفع المناسبة لإتمام شحن طلبك بسرعة وأمان.',
    shippingHeading: '1. Shipping & Delivery Address',
    shippingHeadingArabic: '1. عنوان الشحن والتوصيل',
    paymentHeading: '2. Payment Method (LBP / USD)',
    paymentHeadingArabic: '2. طريقة الدفع (ل.ل / دولار)',
    summaryHeading: 'Order Summary',
    summaryHeadingArabic: 'ملخص الطلب',
    orderButtonText: 'Confirm & Place Order',
    orderButtonTextArabic: 'تأكيد وإرسال الطلب',
    guaranteeBadgeText: '100% Authentic Lebanese Guarantee • Fast Courier Tracking',
    guaranteeBadgeTextArabic: 'ضمان الجودة والأصالة 100% • تتبع مباشر للشحنة'
  },
  checkoutSuccessData = {
    successBadge: 'Order Placed Successfully',
    successBadgeArabic: 'تم تأكيد الطلب بنجاح',
    successTitle: 'Shukran! Your Lebanese Order is',
    successTitleArabic: 'شكراً! تم استلام طلبك اللبناني',
    nextStepsHeading: 'Next Steps & Dispatch Logistics:',
    nextStepsHeadingArabic: 'الخطوات التالية واللوجستيات:',
    step1Text: 'Our Beirut central depot has routed your basket to the regional artisan guilds.',
    step1TextArabic: 'تم توجيه طلبك من المستودع الرئيسي في بيروت إلى الحرفيين المعنيين.',
    step2Text: 'You will receive a WhatsApp message from your dedicated courier to confirm exact GPS drop-off.',
    step2TextArabic: 'ستصلك رسالة عبر تطبيق واتساب من السائق المخصص لتأكيد موقع التسليم بدقة.',
    step3Text: 'Settlement is strictly cash upon handover or digital transfer.',
    step3TextArabic: 'الدفع نقداً عند الاستلام بقيمة الطلب أو بالليرة اللبنانية.',
    buttonTrackText: 'Track in My Account',
    buttonTrackTextArabic: 'متابعة الطلب في حسابي',
    buttonContinueText: 'Continue Shopping',
    buttonContinueTextArabic: 'متابعة التسوق'
  },
  onChangeCheckoutField,
  onChangeSuccessField,
}) => {
  return (
    <div className="space-y-6">
      {/* Checkout Screen Main Headings */}
      <CMSFieldGroup
        id="checkout-headings-group"
        title="Checkout Screen Headings & Subtitles"
        description="Configure the main hero heading and descriptive subtitle on the checkout view"
        icon={<CreditCard className="w-5 h-5 text-amber-400 shrink-0" aria-hidden="true" />}
        defaultExpanded={true}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="chk-title-en" className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5 cursor-pointer">
              Checkout Main Heading (English)
            </label>
            <input
              id="chk-title-en"
              type="text"
              value={checkoutData.title || ''}
              onChange={(e) => onChangeCheckoutField('title', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="chk-title-ar" className="block text-xs font-bold uppercase tracking-wider text-amber-400 mb-1.5 cursor-pointer font-arabic text-right" dir="rtl">
              عنوان صفحة إتمام الطلب (عربي)
            </label>
            <input
              id="chk-title-ar"
              type="text"
              dir="rtl"
              value={checkoutData.titleArabic || ''}
              onChange={(e) => onChangeCheckoutField('titleArabic', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none text-right font-arabic"
            />
          </div>

          <div>
            <label htmlFor="chk-sub-en" className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5 cursor-pointer">
              Checkout Subtitle (English)
            </label>
            <textarea
              id="chk-sub-en"
              rows={2}
              value={checkoutData.subtitle || ''}
              onChange={(e) => onChangeCheckoutField('subtitle', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none leading-relaxed"
            />
          </div>
          <div>
            <label htmlFor="chk-sub-ar" className="block text-xs font-bold uppercase tracking-wider text-amber-400 mb-1.5 cursor-pointer font-arabic text-right" dir="rtl">
              وصف صفحة إتمام الطلب (عربي)
            </label>
            <textarea
              id="chk-sub-ar"
              rows={2}
              dir="rtl"
              value={checkoutData.subtitleArabic || ''}
              onChange={(e) => onChangeCheckoutField('subtitleArabic', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none leading-relaxed text-right font-arabic"
            />
          </div>
        </div>
      </CMSFieldGroup>

      {/* Step Headings & CTA Labels */}
      <CMSFieldGroup
        id="checkout-steps-group"
        title="Checkout Steps & Action Buttons"
        description="Shipping address header, payment step header, and order placement button copy"
        icon={<Truck className="w-5 h-5 text-blue-400 shrink-0" aria-hidden="true" />}
        defaultExpanded={false}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="chk-ship-en" className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5 cursor-pointer">
              Step 1: Address Heading (English)
            </label>
            <input
              id="chk-ship-en"
              type="text"
              value={checkoutData.shippingHeading || ''}
              onChange={(e) => onChangeCheckoutField('shippingHeading', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="chk-ship-ar" className="block text-xs font-bold uppercase tracking-wider text-amber-400 mb-1.5 cursor-pointer font-arabic text-right" dir="rtl">
              الخطوة 1: عنوان التوصيل والشحن (عربي)
            </label>
            <input
              id="chk-ship-ar"
              type="text"
              dir="rtl"
              value={checkoutData.shippingHeadingArabic || ''}
              onChange={(e) => onChangeCheckoutField('shippingHeadingArabic', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none text-right font-arabic"
            />
          </div>

          <div>
            <label htmlFor="chk-pay-en" className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5 cursor-pointer">
              Step 2: Payment Heading (English)
            </label>
            <input
              id="chk-pay-en"
              type="text"
              value={checkoutData.paymentHeading || ''}
              onChange={(e) => onChangeCheckoutField('paymentHeading', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="chk-pay-ar" className="block text-xs font-bold uppercase tracking-wider text-amber-400 mb-1.5 cursor-pointer font-arabic text-right" dir="rtl">
              الخطوة 2: طريقة الدفع والتسوية (عربي)
            </label>
            <input
              id="chk-pay-ar"
              type="text"
              dir="rtl"
              value={checkoutData.paymentHeadingArabic || ''}
              onChange={(e) => onChangeCheckoutField('paymentHeadingArabic', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none text-right font-arabic"
            />
          </div>

          <div>
            <label htmlFor="chk-sum-en" className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5 cursor-pointer">
              Summary Card Heading (English)
            </label>
            <input
              id="chk-sum-en"
              type="text"
              value={checkoutData.summaryHeading || ''}
              onChange={(e) => onChangeCheckoutField('summaryHeading', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="chk-sum-ar" className="block text-xs font-bold uppercase tracking-wider text-amber-400 mb-1.5 cursor-pointer font-arabic text-right" dir="rtl">
              عنوان بطاقة ملخص السلة والطلب (عربي)
            </label>
            <input
              id="chk-sum-ar"
              type="text"
              dir="rtl"
              value={checkoutData.summaryHeadingArabic || ''}
              onChange={(e) => onChangeCheckoutField('summaryHeadingArabic', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none text-right font-arabic"
            />
          </div>

          <div>
            <label htmlFor="chk-btn-en" className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5 cursor-pointer">
              Place Order Button (English)
            </label>
            <input
              id="chk-btn-en"
              type="text"
              value={checkoutData.orderButtonText || ''}
              onChange={(e) => onChangeCheckoutField('orderButtonText', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="chk-btn-ar" className="block text-xs font-bold uppercase tracking-wider text-amber-400 mb-1.5 cursor-pointer font-arabic text-right" dir="rtl">
              نص زر تأكيد وإرسال الطلب (عربي)
            </label>
            <input
              id="chk-btn-ar"
              type="text"
              dir="rtl"
              value={checkoutData.orderButtonTextArabic || ''}
              onChange={(e) => onChangeCheckoutField('orderButtonTextArabic', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none text-right font-arabic"
            />
          </div>

          <div className="md:col-span-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="chk-badge-en" className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5 cursor-pointer">
                  Trust Badge Line (English)
                </label>
                <input
                  id="chk-badge-en"
                  type="text"
                  value={checkoutData.guaranteeBadgeText || ''}
                  onChange={(e) => onChangeCheckoutField('guaranteeBadgeText', e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="chk-badge-ar" className="block text-xs font-bold uppercase tracking-wider text-amber-400 mb-1.5 cursor-pointer font-arabic text-right" dir="rtl">
                  شارة الثقة والأمان (عربي)
                </label>
                <input
                  id="chk-badge-ar"
                  type="text"
                  dir="rtl"
                  value={checkoutData.guaranteeBadgeTextArabic || ''}
                  onChange={(e) => onChangeCheckoutField('guaranteeBadgeTextArabic', e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none text-right font-arabic"
                />
              </div>
            </div>
          </div>
        </div>
      </CMSFieldGroup>

      {/* Checkout Success Screen Customizer */}
      <CMSFieldGroup
        id="checkout-success-group"
        title="Order Confirmation & Success Screen"
        description="Manage the celebratory screen shown after payment is completed or placed"
        icon={<CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" aria-hidden="true" />}
        defaultExpanded={false}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="succ-badge-en" className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5 cursor-pointer">
              Success Badge (English)
            </label>
            <input
              id="succ-badge-en"
              type="text"
              value={checkoutSuccessData.successBadge || ''}
              onChange={(e) => onChangeSuccessField('successBadge', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="succ-badge-ar" className="block text-xs font-bold uppercase tracking-wider text-amber-400 mb-1.5 cursor-pointer font-arabic text-right" dir="rtl">
              شارة التأكيد الناجح (عربي)
            </label>
            <input
              id="succ-badge-ar"
              type="text"
              dir="rtl"
              value={checkoutSuccessData.successBadgeArabic || ''}
              onChange={(e) => onChangeSuccessField('successBadgeArabic', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none text-right font-arabic"
            />
          </div>

          <div>
            <label htmlFor="succ-title-en" className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5 cursor-pointer">
              Thank You Title Prefix (English)
            </label>
            <input
              id="succ-title-en"
              type="text"
              value={checkoutSuccessData.successTitle || ''}
              onChange={(e) => onChangeSuccessField('successTitle', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="succ-title-ar" className="block text-xs font-bold uppercase tracking-wider text-amber-400 mb-1.5 cursor-pointer font-arabic text-right" dir="rtl">
              عنوان الشكر الرئيسي (عربي)
            </label>
            <input
              id="succ-title-ar"
              type="text"
              dir="rtl"
              value={checkoutSuccessData.successTitleArabic || ''}
              onChange={(e) => onChangeSuccessField('successTitleArabic', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none text-right font-arabic"
            />
          </div>

          <div className="md:col-span-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="succ-steps-en" className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5 cursor-pointer">
                  Next Steps Section Heading (English)
                </label>
                <input
                  id="succ-steps-en"
                  type="text"
                  value={checkoutSuccessData.nextStepsHeading || ''}
                  onChange={(e) => onChangeSuccessField('nextStepsHeading', e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="succ-steps-ar" className="block text-xs font-bold uppercase tracking-wider text-amber-400 mb-1.5 cursor-pointer font-arabic text-right" dir="rtl">
                  عنوان خطوات ما بعد تأكيد الطلب (عربي)
                </label>
                <input
                  id="succ-steps-ar"
                  type="text"
                  dir="rtl"
                  value={checkoutSuccessData.nextStepsHeadingArabic || ''}
                  onChange={(e) => onChangeSuccessField('nextStepsHeadingArabic', e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none text-right font-arabic"
                />
              </div>
            </div>
          </div>

          <div>
            <label htmlFor="succ-s1-en" className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5 cursor-pointer">
              Step 1 Text (English)
            </label>
            <textarea
              id="succ-s1-en"
              rows={2}
              value={checkoutSuccessData.step1Text || ''}
              onChange={(e) => onChangeSuccessField('step1Text', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none leading-relaxed"
            />
          </div>
          <div>
            <label htmlFor="succ-s1-ar" className="block text-xs font-bold uppercase tracking-wider text-amber-400 mb-1.5 cursor-pointer font-arabic text-right" dir="rtl">
              الخطوة 1: توجيه الطلب للمستودع (عربي)
            </label>
            <textarea
              id="succ-s1-ar"
              rows={2}
              dir="rtl"
              value={checkoutSuccessData.step1TextArabic || ''}
              onChange={(e) => onChangeSuccessField('step1TextArabic', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none leading-relaxed text-right font-arabic"
            />
          </div>

          <div>
            <label htmlFor="succ-s2-en" className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5 cursor-pointer">
              Step 2 Text (English)
            </label>
            <textarea
              id="succ-s2-en"
              rows={2}
              value={checkoutSuccessData.step2Text || ''}
              onChange={(e) => onChangeSuccessField('step2Text', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none leading-relaxed"
            />
          </div>
          <div>
            <label htmlFor="succ-s2-ar" className="block text-xs font-bold uppercase tracking-wider text-amber-400 mb-1.5 cursor-pointer font-arabic text-right" dir="rtl">
              الخطوة 2: تواصل السائق عبر واتساب (عربي)
            </label>
            <textarea
              id="succ-s2-ar"
              rows={2}
              dir="rtl"
              value={checkoutSuccessData.step2TextArabic || ''}
              onChange={(e) => onChangeSuccessField('step2TextArabic', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none leading-relaxed text-right font-arabic"
            />
          </div>

          <div>
            <label htmlFor="succ-s3-en" className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5 cursor-pointer">
              Step 3 Text (English)
            </label>
            <textarea
              id="succ-s3-en"
              rows={2}
              value={checkoutSuccessData.step3Text || ''}
              onChange={(e) => onChangeSuccessField('step3Text', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none leading-relaxed"
            />
          </div>
          <div>
            <label htmlFor="succ-s3-ar" className="block text-xs font-bold uppercase tracking-wider text-amber-400 mb-1.5 cursor-pointer font-arabic text-right" dir="rtl">
              الخطوة 3: التسليم والدفع عند الاستلام (عربي)
            </label>
            <textarea
              id="succ-s3-ar"
              rows={2}
              dir="rtl"
              value={checkoutSuccessData.step3TextArabic || ''}
              onChange={(e) => onChangeSuccessField('step3TextArabic', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none leading-relaxed text-right font-arabic"
            />
          </div>

          <div>
            <label htmlFor="succ-btn-track-en" className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5 cursor-pointer">
              Track Order Button (English)
            </label>
            <input
              id="succ-btn-track-en"
              type="text"
              value={checkoutSuccessData.buttonTrackText || ''}
              onChange={(e) => onChangeSuccessField('buttonTrackText', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="succ-btn-track-ar" className="block text-xs font-bold uppercase tracking-wider text-amber-400 mb-1.5 cursor-pointer font-arabic text-right" dir="rtl">
              نص زر متابعة الطلب (عربي)
            </label>
            <input
              id="succ-btn-track-ar"
              type="text"
              dir="rtl"
              value={checkoutSuccessData.buttonTrackTextArabic || ''}
              onChange={(e) => onChangeSuccessField('buttonTrackTextArabic', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none text-right font-arabic"
            />
          </div>

          <div>
            <label htmlFor="succ-btn-cont-en" className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5 cursor-pointer">
              Continue Shopping Button (English)
            </label>
            <input
              id="succ-btn-cont-en"
              type="text"
              value={checkoutSuccessData.buttonContinueText || ''}
              onChange={(e) => onChangeSuccessField('buttonContinueText', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="succ-btn-cont-ar" className="block text-xs font-bold uppercase tracking-wider text-amber-400 mb-1.5 cursor-pointer font-arabic text-right" dir="rtl">
              نص زر مواصلة التسوق (عربي)
            </label>
            <input
              id="succ-btn-cont-ar"
              type="text"
              dir="rtl"
              value={checkoutSuccessData.buttonContinueTextArabic || ''}
              onChange={(e) => onChangeSuccessField('buttonContinueTextArabic', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none text-right font-arabic"
            />
          </div>
        </div>
      </CMSFieldGroup>
    </div>
  );
};
