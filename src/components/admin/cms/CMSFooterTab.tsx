import React from 'react';
import { 
  Layout, 
  Share2, 
  Phone, 
  Mail, 
  MapPin, 
  Clock, 
  Instagram, 
  Facebook, 
  MessageCircle,
  FileText
} from 'lucide-react';

interface CMSFooterTabProps {
  footerData: {
    aboutTitle: string;
    aboutTitleArabic?: string;
    aboutText: string;
    aboutTextArabic?: string;
    quickLinksTitle: string;
    quickLinksTitleArabic?: string;
    contactTitle: string;
    contactTitleArabic?: string;
    phone: string;
    email: string;
    address: string;
    addressArabic?: string;
    hours: string;
    hoursArabic?: string;
    copyrightText: string;
    copyrightTextArabic?: string;
  };
  socialLinks: {
    instagram: string;
    facebook: string;
    whatsapp: string;
    email: string;
    phone: string;
  };
  onChangeFooterField: (field: string, value: string) => void;
  onChangeSocialField: (field: string, value: string) => void;
}

export const CMSFooterTab: React.FC<CMSFooterTabProps> = ({
  footerData = {
    aboutTitle: 'About Yalla',
    aboutTitleArabic: 'عن منصة يلا',
    aboutText: '',
    aboutTextArabic: '',
    quickLinksTitle: 'Quick Links',
    quickLinksTitleArabic: 'روابط سريعة',
    contactTitle: 'Contact & Support',
    contactTitleArabic: 'الاتصال والدعم الفني',
    phone: '+961 70 123 456',
    email: 'support@yalla.shop',
    address: 'Gournaud Street, Gemmayzeh, Beirut, Lebanon',
    addressArabic: 'شارع غورو، الجميزة، بيروت، لبنان',
    hours: 'Mon - Sat: 9:00 AM - 7:00 PM (EET)',
    hoursArabic: 'الإثنين - السبت: 9:00 ص - 7:00 م',
    copyrightText: '© 2026 Yalla. All rights reserved.',
    copyrightTextArabic: '© 2026 يلا. جميع الحقوق محفوظة.'
  },
  socialLinks = {
    instagram: 'https://instagram.com/yalla.lb',
    facebook: 'https://facebook.com/yallalb',
    whatsapp: 'https://wa.me/96170889234',
    email: 'concierge@yalla.lb',
    phone: '+961 70 889 234'
  },
  onChangeFooterField,
  onChangeSocialField,
}) => {
  return (
    <div className="space-y-6">
      {/* About Us Brand Narrative Block */}
      <div className="bg-[#121222] border border-white/10 rounded-3xl p-6 space-y-5">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <FileText className="w-5 h-5 text-amber-400" />
          <span>Footer About Us Narrative Block</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="footer-about-title-en" className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5 cursor-pointer">
              About Section Heading (English)
            </label>
            <input
              id="footer-about-title-en"
              type="text"
              value={footerData.aboutTitle || ''}
              onChange={(e) => onChangeFooterField('aboutTitle', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="footer-about-title-ar" className="block text-xs font-bold uppercase tracking-wider text-amber-400 mb-1.5 cursor-pointer" dir="rtl">
              عنوان من نحن (عربي)
            </label>
            <input
              id="footer-about-title-ar"
              type="text"
              dir="rtl"
              value={footerData.aboutTitleArabic || ''}
              onChange={(e) => onChangeFooterField('aboutTitleArabic', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="footer-about-text-en" className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5 cursor-pointer">
              About Description / Brand Mission (English)
            </label>
            <textarea
              id="footer-about-text-en"
              rows={3}
              value={footerData.aboutText || ''}
              onChange={(e) => onChangeFooterField('aboutText', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none leading-relaxed"
            />
          </div>
          <div>
            <label htmlFor="footer-about-text-ar" className="block text-xs font-bold uppercase tracking-wider text-amber-400 mb-1.5 cursor-pointer" dir="rtl">
              نص من نحن / رسالة المتجر (عربي)
            </label>
            <textarea
              id="footer-about-text-ar"
              rows={3}
              dir="rtl"
              value={footerData.aboutTextArabic || ''}
              onChange={(e) => onChangeFooterField('aboutTextArabic', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none leading-relaxed"
            />
          </div>
        </div>
      </div>

      {/* Contact Information & Physical Head Office */}
      <div className="bg-[#121222] border border-white/10 rounded-3xl p-6 space-y-5">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <Phone className="w-5 h-5 text-emerald-400" />
          <span>Footer Contact & Support Coordinates</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="footer-contact-title-en" className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5 cursor-pointer">
              Contact Section Heading (English)
            </label>
            <input
              id="footer-contact-title-en"
              type="text"
              value={footerData.contactTitle || ''}
              onChange={(e) => onChangeFooterField('contactTitle', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="footer-contact-title-ar" className="block text-xs font-bold uppercase tracking-wider text-amber-400 mb-1.5 cursor-pointer" dir="rtl">
              عنوان قسم الاتصال (عربي)
            </label>
            <input
              id="footer-contact-title-ar"
              type="text"
              dir="rtl"
              value={footerData.contactTitleArabic || ''}
              onChange={(e) => onChangeFooterField('contactTitleArabic', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="footer-phone" className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5 cursor-pointer">
              Support Phone Number
            </label>
            <input
              id="footer-phone"
              type="text"
              value={footerData.phone || ''}
              onChange={(e) => onChangeFooterField('phone', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="footer-email" className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5 cursor-pointer">
              Support Email Address
            </label>
            <input
              id="footer-email"
              type="email"
              value={footerData.email || ''}
              onChange={(e) => onChangeFooterField('email', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="footer-address-en" className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5 flex items-center gap-1 cursor-pointer">
              <MapPin className="w-3.5 h-3.5 text-amber-400" />
              <span>Physical Address (English)</span>
            </label>
            <textarea
              id="footer-address-en"
              rows={2}
              value={footerData.address || ''}
              onChange={(e) => onChangeFooterField('address', e.target.value)}
              placeholder="e.g. Gournaud Street, Gemmayzeh&#10;Beirut, Lebanon"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none leading-relaxed"
            />
          </div>
          <div>
            <label htmlFor="footer-address-ar" className="block text-xs font-bold uppercase tracking-wider text-amber-400 mb-1.5 cursor-pointer" dir="rtl">
              العنوان الفعلي (عربي)
            </label>
            <textarea
              id="footer-address-ar"
              rows={2}
              dir="rtl"
              value={footerData.addressArabic || ''}
              onChange={(e) => onChangeFooterField('addressArabic', e.target.value)}
              placeholder="مثال: شارع غورو، الجميزة&#10;بيروت، لبنان"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none leading-relaxed"
            />
          </div>

          <div>
            <label htmlFor="footer-hours-en" className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5 flex items-center gap-1 cursor-pointer">
              <Clock className="w-3.5 h-3.5 text-indigo-400" />
              <span>Operating Hours (English)</span>
            </label>
            <textarea
              id="footer-hours-en"
              rows={2}
              value={footerData.hours || ''}
              onChange={(e) => onChangeFooterField('hours', e.target.value)}
              placeholder="e.g. Mon - Fri: 9:00 AM - 7:00 PM&#10;Sat: 10:00 AM - 4:00 PM"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none leading-relaxed"
            />
          </div>
          <div>
            <label htmlFor="footer-hours-ar" className="block text-xs font-bold uppercase tracking-wider text-amber-400 mb-1.5 cursor-pointer" dir="rtl">
              ساعات العمل (عربي)
            </label>
            <textarea
              id="footer-hours-ar"
              rows={2}
              dir="rtl"
              value={footerData.hoursArabic || ''}
              onChange={(e) => onChangeFooterField('hoursArabic', e.target.value)}
              placeholder="مثال: الإثنين - الجمعة: 9:00 ص - 7:00 م&#10;السبت: 10:00 ص - 4:00 م"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none leading-relaxed"
            />
          </div>
        </div>
      </div>

      {/* Social Media Channels */}
      <div className="bg-[#121222] border border-white/10 rounded-3xl p-6 space-y-5">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <Share2 className="w-5 h-5 text-blue-400" />
          <span>Social Media & Concierge Links</span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <label htmlFor="social-instagram" className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5 flex items-center gap-1.5 cursor-pointer">
              <Instagram className="w-3.5 h-3.5 text-pink-400" />
              <span>Instagram URL</span>
            </label>
            <input
              id="social-instagram"
              type="text"
              value={socialLinks.instagram || ''}
              onChange={(e) => onChangeSocialField('instagram', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
              placeholder="https://instagram.com/..."
            />
          </div>

          <div>
            <label htmlFor="social-facebook" className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5 flex items-center gap-1.5 cursor-pointer">
              <Facebook className="w-3.5 h-3.5 text-blue-500" />
              <span>Facebook Page URL</span>
            </label>
            <input
              id="social-facebook"
              type="text"
              value={socialLinks.facebook || ''}
              onChange={(e) => onChangeSocialField('facebook', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
              placeholder="https://facebook.com/..."
            />
          </div>

          <div>
            <label htmlFor="social-whatsapp" className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5 flex items-center gap-1.5 cursor-pointer">
              <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
              <span>WhatsApp Direct Link</span>
            </label>
            <input
              id="social-whatsapp"
              type="text"
              value={socialLinks.whatsapp || ''}
              onChange={(e) => onChangeSocialField('whatsapp', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
              placeholder="https://wa.me/961..."
            />
          </div>
        </div>
      </div>

      {/* Copyright Banner */}
      <div className="bg-[#121222] border border-white/10 rounded-3xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Layout className="w-5 h-5 text-amber-400" />
            <span>Footer Copyright & Bottom Attribution Notice</span>
          </h3>
          <span className="text-[11px] text-amber-400/80 font-medium">Supports Multi-line / Press Enter for new lines</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="footer-copyright-en" className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5 cursor-pointer">
              Copyright Text (English)
            </label>
            <textarea
              id="footer-copyright-en"
              rows={3}
              value={footerData.copyrightText || ''}
              onChange={(e) => onChangeFooterField('copyrightText', e.target.value)}
              placeholder="e.g.&#10;© 2026 Yalla. All rights reserved.&#10;Made With Love From Rachaya ❤️"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none leading-relaxed"
            />
            <p className="text-[11px] text-slate-400 mt-1">Press <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-white/10 text-[10px] text-amber-300">Enter</kbd> to split text into multiple lines in the store footer.</p>
          </div>
          <div>
            <label htmlFor="footer-copyright-ar" className="block text-xs font-bold uppercase tracking-wider text-amber-400 mb-1.5 cursor-pointer" dir="rtl">
              نص حقوق النشر والرسالة الختامية (عربي)
            </label>
            <textarea
              id="footer-copyright-ar"
              rows={3}
              dir="rtl"
              value={footerData.copyrightTextArabic || ''}
              onChange={(e) => onChangeFooterField('copyrightTextArabic', e.target.value)}
              placeholder="مثال:&#10;© 2026 يلا. جميع الحقوق محفوظة.&#10;صُنع بكل فخر وحب من راشيا الوادي ❤️"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none leading-relaxed"
            />
            <p className="text-[11px] text-slate-400 mt-1" dir="rtl">اضغط <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-white/10 text-[10px] text-amber-300">Enter</kbd> لكتابة النص على عدة أسطر منفصلة.</p>
          </div>
        </div>
      </div>
    </div>
  );
};
