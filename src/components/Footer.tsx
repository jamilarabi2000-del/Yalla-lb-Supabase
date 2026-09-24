import { safeHref } from '../lib/safeUrl';
import React from 'react';
import { useShop } from '../context/ShopContext';
import { requestAccountSignIn } from '../lib/accountSignIn';
import { Phone, EyeOff, Store } from 'lucide-react';
import { BrandIcon, FacebookLetterIcon, GmailIcon, SOCIAL_BRANDS } from './ui/BrandIcon';

export const Footer: React.FC = () => {
  const { language, siteContent, isVisualEditMode, setActiveTab } = useShop();
  const visibility = siteContent.visibility || { footerAbout: true, footerContact: true, footerSocial: true, footerCopyright: true };
  const showPhoneSupport = visibility.phoneSupport !== false;

  const footerData = siteContent?.footer || {
    aboutTitle: 'About Us',
    aboutText: 'Yalla is a premier digital marketplace bridging authentic Lebanese artisan workshops, cooperatives, and culinary masters with customers across Lebanon and the global diaspora.',
    phone: '+961 70 889 234', email: 'concierge@yalla.lb',
    address: 'Gournaud Street, Gemmayzeh, Beirut, Lebanon', addressArabic: 'شارع غورو، الجميزة، بيروت، لبنان',
    hours: 'Mon - Sat: 9:00 AM - 7:00 PM (EET)', hoursArabic: 'الإثنين - السبت: 9:00 ص - 7:00 م',
    copyrightText: '© 2026 Yalla. All Rights Reserved.'
  };

  return (
    <footer data-cms-element="footer" className="bg-[#171717] border-t border-[#B89753]/30 text-neutral-400 text-xs relative overflow-hidden select-none">
      <div className="absolute inset-0 bg-[radial-gradient(#B89753_1px,transparent_1px)] [background-size:32px_32px] opacity-[0.03] pointer-events-none" />
      <div className="absolute left-1/2 -top-24 -translate-x-1/2 w-96 h-48 bg-[#B89753]/10 rounded-full blur-3xl pointer-events-none" />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 text-center relative z-10 flex flex-col items-center">
        {(visibility.footerAbout || isVisualEditMode) && (
          <div className={`w-full relative mb-6 ${!visibility.footerAbout && isVisualEditMode ? 'opacity-70 border-2 border-dashed border-rose-500/80 rounded-2xl p-4' : ''}`}>
            {!visibility.footerAbout && isVisualEditMode && <div className="mb-2 bg-rose-600 text-white px-2 py-0.5 rounded text-[10px] font-bold inline-flex items-center gap-1"><EyeOff className="w-3 h-3" /><span>Footer About Hidden</span></div>}
            <div className="flex items-center justify-center gap-3 mb-3"><span className="h-[1px] w-6 sm:w-10 bg-gradient-to-r from-transparent to-[#B89753]/60" /><h3 className="text-sm sm:text-base font-bold tracking-wider uppercase text-[#B89753] font-sans">{footerData.aboutTitle || (language === 'ar' ? 'من نحن' : 'About Us')}</h3><span className="h-[1px] w-6 sm:w-10 bg-gradient-to-l from-transparent to-[#B89753]/60" /></div>
            <p className="text-xs text-neutral-300 leading-relaxed font-normal max-w-2xl mx-auto whitespace-pre-line">{footerData.aboutText || (language === 'ar' ? 'المنصة الرائدة للتجارة الحرفية اللبنانية، تجمع نخبة الحرفيين والمزارعين لتقديم أشهى منتجات المونة والتحف التراثية بأعلى معايير الجودة والأصالة.' : 'Lebanon’s premier artisan commerce ecosystem, connecting authentic heritage workshops and rural producers with local and diaspora patrons worldwide.')}</p>
          </div>
        )}

        {(visibility.footerContact || isVisualEditMode) && (footerData.phone || footerData.email || footerData.address || footerData.hours) && (
          <div className={`w-full mb-6 py-4 px-6 rounded-xl bg-white/[0.03] border border-white/10 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-center relative ${!visibility.footerContact && isVisualEditMode ? 'opacity-70 border-2 border-dashed border-rose-500/80' : ''}`}>
            {!visibility.footerContact && isVisualEditMode && <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-rose-600 text-white px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 z-10 whitespace-nowrap"><EyeOff className="w-3 h-3" /><span>Contact Block Hidden</span></div>}
            {showPhoneSupport && footerData.phone && <div className="flex flex-col items-center"><span className="text-[10px] font-bold uppercase tracking-wider text-[#B89753] mb-1">{language === 'ar' ? 'الهاتف' : 'Phone'}</span><a href={`tel:${footerData.phone}`} className="text-xs text-neutral-300 hover:text-white transition-colors">{footerData.phone}</a></div>}
            {footerData.email && <div className="flex flex-col items-center"><span className="text-[10px] font-bold uppercase tracking-wider text-[#B89753] mb-1">{language === 'ar' ? 'البريد الإلكتروني' : 'Email'}</span><a href={`mailto:${footerData.email}`} className="text-xs text-neutral-300 hover:text-white transition-colors">{footerData.email}</a></div>}
            {(footerData.address || footerData.addressArabic) && <div className="flex flex-col items-center"><span className="text-[10px] font-bold uppercase tracking-wider text-[#B89753] mb-1">{language === 'ar' ? 'العنوان' : 'Address'}</span><span className="text-xs text-neutral-300 whitespace-pre-line leading-relaxed">{language === 'ar' ? (footerData.addressArabic || footerData.address) : (footerData.address || footerData.addressArabic)}</span></div>}
            {(footerData.hours || footerData.hoursArabic) && <div className="flex flex-col items-center"><span className="text-[10px] font-bold uppercase tracking-wider text-[#B89753] mb-1">{language === 'ar' ? 'ساعات العمل' : 'Hours'}</span><span className="text-xs text-neutral-300 whitespace-pre-line leading-relaxed">{language === 'ar' ? (footerData.hoursArabic || footerData.hours) : (footerData.hours || footerData.hoursArabic)}</span></div>}
          </div>
        )}

        {(visibility.footerSocial || isVisualEditMode) && (
          <div className={`flex flex-wrap items-center justify-center gap-3 sm:gap-5 mb-6 relative ${!visibility.footerSocial && isVisualEditMode ? 'opacity-70 border-2 border-dashed border-rose-500/80 rounded-2xl p-2' : ''}`}>
            {(siteContent?.socialLinks?.instagram || isVisualEditMode) && <a href={safeHref(siteContent?.socialLinks?.instagram, 'https://instagram.com/yalla.lb')} target="_blank" rel="noopener noreferrer" aria-label="Instagram" data-brand="instagram" className="social-btn instagram"><BrandIcon brand="instagram" /></a>}
            {(siteContent?.socialLinks?.whatsapp || (showPhoneSupport && footerData.phone) || isVisualEditMode) && <a href={`https://wa.me/${(siteContent?.socialLinks?.whatsapp || footerData.phone || '96170889234').replace(/[^0-9]/g, '')}?text=Hello%20Yalla,%20I%20would%20like%20to%20inquire%20about%20my%20order`} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" data-brand="whatsapp" className="social-btn whatsapp"><BrandIcon brand="whatsapp" /></a>}
            {(siteContent?.socialLinks?.facebook || isVisualEditMode) && <a href={safeHref(siteContent?.socialLinks?.facebook, 'https://facebook.com/yallalb')} target="_blank" rel="noopener noreferrer" aria-label="Facebook" data-brand="facebook" className="social-btn facebook"><FacebookLetterIcon /></a>}
            {(['tiktok', 'youtube', 'x'] as const).map(brand => {
              // Optional channels: shown only once the admin adds a link.
              const href = safeHref(siteContent?.socialLinks?.[brand], '');
              return href && <a key={brand} href={href} target="_blank" rel="noopener noreferrer" aria-label={SOCIAL_BRANDS[brand].title} data-brand={brand} className={`social-btn ${brand}`}><BrandIcon brand={brand} /></a>;
            })}
            {(siteContent?.socialLinks?.email || footerData.email || isVisualEditMode) && <a href={`mailto:${siteContent?.socialLinks?.email || footerData.email || 'concierge@yalla.lb'}`} aria-label="Email" data-contact="email" className="social-btn gmail"><GmailIcon /></a>}
            {showPhoneSupport && (siteContent?.socialLinks?.phone || footerData.phone || isVisualEditMode) && <a href={`tel:${siteContent?.socialLinks?.phone || footerData.phone || '+96170889234'}`} aria-label="Call" data-contact="call" className="social-btn phone"><Phone fill="currentColor" strokeWidth={1.5} /></a>}
          </div>
        )}

        {(visibility.footerCopyright || isVisualEditMode) && <div className={`pt-4 border-t border-white/10 w-full flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-neutral-400 relative ${!visibility.footerCopyright && isVisualEditMode ? 'opacity-70 border-2 border-dashed border-rose-500/80 rounded-xl p-2' : ''}`}>
          <div className="flex items-center gap-2"><span className="whitespace-pre-line text-center sm:text-start leading-relaxed">{language === 'ar' ? (footerData.copyrightTextArabic || footerData.copyrightText || `© ${new Date().getFullYear()} يلا. جميع الحقوق محفوظة.`) : (footerData.copyrightText || `© ${new Date().getFullYear()} Yalla. All Rights Reserved.`)}</span></div>
          <div className="flex items-center gap-4 shrink-0">{visibility.sellerPortal !== false && <button type="button" id="footer-seller-portal-btn" onClick={() => { requestAccountSignIn(); setActiveTab('account'); }} className="inline-flex items-center gap-1.5 text-[#B89753] hover:text-white font-bold transition-colors cursor-pointer"><Store className="w-3.5 h-3.5" /><span>{language === 'ar' ? 'بوابة البائعين والتجار' : 'Seller & Merchant Portal'}</span></button>}</div>
        </div>}
      </div>
    </footer>
  );
};
