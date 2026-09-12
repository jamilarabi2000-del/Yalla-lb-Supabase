import { safeHref } from '../lib/safeUrl';
import React from 'react';
import { useShop } from '../context/ShopContext';
import { 
  PhoneCall, 
  Mail, 
  Instagram, 
  Facebook, 
  EyeOff,
  Store
} from 'lucide-react';

export const Footer: React.FC = () => {
  const { language, siteContent, isVisualEditMode, setActiveTab } = useShop();

  const visibility = siteContent.visibility || {
    footerAbout: true,
    footerContact: true,
    footerSocial: true,
    footerCopyright: true
  };

  const footerData = siteContent?.footer || {
    aboutTitle: 'About Us',
    aboutText: 'Yalla is a premier digital marketplace bridging authentic Lebanese artisan workshops, cooperatives, and culinary masters with customers across Lebanon and the global diaspora.',
    phone: '+961 70 889 234',
    email: 'concierge@yalla.lb',
    address: 'Gournaud Street, Gemmayzeh, Beirut, Lebanon',
    addressArabic: 'شارع غورو، الجميزة، بيروت، لبنان',
    hours: 'Mon - Sat: 9:00 AM - 7:00 PM (EET)',
    hoursArabic: 'الإثنين - السبت: 9:00 ص - 7:00 م',
    copyrightText: '© 2026 Yalla. All Rights Reserved.'
  };

  return (
    <footer className="bg-[#171717] border-t border-[#B89753]/30 text-neutral-400 text-xs relative overflow-hidden select-none">
      
      {/* Background Decorative Ambient Radial Pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(#B89753_1px,transparent_1px)] [background-size:32px_32px] opacity-[0.03] pointer-events-none" />
      <div className="absolute left-1/2 -top-24 -translate-x-1/2 w-96 h-48 bg-[#B89753]/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main Footer Central Content (About Us) */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 text-center relative z-10 flex flex-col items-center">
        
        {/* Section Title & About Narrative */}
        {(visibility.footerAbout || isVisualEditMode) && (
          <div className={`w-full relative mb-6 ${!visibility.footerAbout && isVisualEditMode ? 'opacity-70 border-2 border-dashed border-rose-500/80 rounded-2xl p-4' : ''}`}>
            {!visibility.footerAbout && isVisualEditMode && (
              <div className="mb-2 bg-rose-600 text-white px-2 py-0.5 rounded text-[10px] font-bold inline-flex items-center gap-1">
                <EyeOff className="w-3 h-3" />
                <span>Footer About Hidden</span>
              </div>
            )}
            <div className="flex items-center justify-center gap-3 mb-3">
              <span className="h-[1px] w-6 sm:w-10 bg-gradient-to-r from-transparent to-[#B89753]/60" />
              <h3 className="text-sm sm:text-base font-bold tracking-wider uppercase text-[#B89753] font-sans">
                {footerData.aboutTitle || (language === 'ar' ? 'من نحن' : 'About Us')}
              </h3>
              <span className="h-[1px] w-6 sm:w-10 bg-gradient-to-l from-transparent to-[#B89753]/60" />
            </div>

            <p className="text-xs text-neutral-300 leading-relaxed font-normal max-w-2xl mx-auto whitespace-pre-line">
              {footerData.aboutText || (
                language === 'ar'
                  ? 'المنصة الرائدة للتجارة الحرفية اللبنانية، تجمع نخبة الحرفيين والمزارعين لتقديم أشهى منتجات المونة والتحف التراثية بأعلى معايير الجودة والأصالة.'
                  : 'Lebanon’s premier artisan commerce ecosystem, connecting authentic heritage workshops and rural producers with local and diaspora patrons worldwide.'
              )}
            </p>
          </div>
        )}

        {/* Footer Contact & Support Coordinates */}
        {(visibility.footerContact || isVisualEditMode) && (footerData.phone || footerData.email || footerData.address || footerData.hours) && (
          <div className={`w-full mb-6 py-4 px-6 rounded-xl bg-white/[0.03] border border-white/10 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-center relative ${!visibility.footerContact && isVisualEditMode ? 'opacity-70 border-2 border-dashed border-rose-500/80' : ''}`}>
            {!visibility.footerContact && isVisualEditMode && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-rose-600 text-white px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 z-10 whitespace-nowrap">
                <EyeOff className="w-3 h-3" />
                <span>Contact Block Hidden</span>
              </div>
            )}
            {footerData.phone && (
              <div className="flex flex-col items-center">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#B89753] mb-1">
                  {language === 'ar' ? 'الهاتف' : 'Phone'}
                </span>
                <a href={`tel:${footerData.phone}`} className="text-xs text-neutral-300 hover:text-white transition-colors">
                  {footerData.phone}
                </a>
              </div>
            )}
            {footerData.email && (
              <div className="flex flex-col items-center">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#B89753] mb-1">
                  {language === 'ar' ? 'البريد الإلكتروني' : 'Email'}
                </span>
                <a href={`mailto:${footerData.email}`} className="text-xs text-neutral-300 hover:text-white transition-colors">
                  {footerData.email}
                </a>
              </div>
            )}
            {(footerData.address || footerData.addressArabic) && (
              <div className="flex flex-col items-center">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#B89753] mb-1">
                  {language === 'ar' ? 'العنوان' : 'Address'}
                </span>
                <span className="text-xs text-neutral-300 whitespace-pre-line leading-relaxed">
                  {language === 'ar' ? (footerData.addressArabic || footerData.address) : (footerData.address || footerData.addressArabic)}
                </span>
              </div>
            )}
            {(footerData.hours || footerData.hoursArabic) && (
              <div className="flex flex-col items-center">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#B89753] mb-1">
                  {language === 'ar' ? 'ساعات العمل' : 'Hours'}
                </span>
                <span className="text-xs text-neutral-300 whitespace-pre-line leading-relaxed">
                  {language === 'ar' ? (footerData.hoursArabic || footerData.hours) : (footerData.hours || footerData.hoursArabic)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Social Media & Direct Contact Channels */}
        {(visibility.footerSocial || isVisualEditMode) && (
          <div className={`flex items-center justify-center gap-3 mb-6 relative ${!visibility.footerSocial && isVisualEditMode ? 'opacity-70 border-2 border-dashed border-rose-500/80 rounded-2xl p-2' : ''}`}>
            {/* Instagram */}
            {(siteContent?.socialLinks?.instagram || isVisualEditMode) && (
              <a
                href={safeHref(siteContent?.socialLinks?.instagram, "https://instagram.com/yalla.lb")}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram"
                className="w-9 h-9 rounded-lg bg-white/[0.04] hover:bg-[#B89753] border border-white/10 hover:border-[#B89753] text-neutral-300 hover:text-black flex items-center justify-center transition-all duration-200 shadow-2xs cursor-pointer group"
              >
                <Instagram className="w-4 h-4 group-hover:scale-110 transition-transform" />
              </a>
            )}

            {/* WhatsApp */}
            {(siteContent?.socialLinks?.whatsapp || footerData.phone || isVisualEditMode) && (
              <a
                href={`https://wa.me/${(siteContent?.socialLinks?.whatsapp || footerData.phone || '96170889234').replace(/[^0-9]/g, '')}?text=Hello%20Yalla,%20I%20would%20like%20to%20inquire%20about%20my%20order`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="WhatsApp"
                className="w-9 h-9 rounded-lg bg-white/[0.04] hover:bg-[#16803C] border border-white/10 hover:border-[#16803C] text-neutral-300 hover:text-white flex items-center justify-center transition-all duration-200 shadow-2xs cursor-pointer group"
              >
                <svg 
                  className="w-4 h-4 group-hover:scale-110 transition-transform fill-current" 
                  viewBox="0 0 24 24" 
                  aria-hidden="true"
                >
                  <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.03 14.69 2 12.04 2ZM12.04 20.15C10.56 20.15 9.11 19.76 7.85 19.01L7.55 18.83L4.43 19.65L5.26 16.61L5.06 16.29C4.24 14.99 3.81 13.47 3.81 11.91C3.81 7.37 7.5 3.68 12.04 3.68C14.25 3.68 16.31 4.54 17.87 6.1C19.42 7.66 20.28 9.72 20.28 11.92C20.28 16.46 16.58 20.15 12.04 20.15ZM16.56 14.39C16.31 14.27 15.09 13.67 14.86 13.58C14.63 13.5 14.47 13.46 14.3 13.7C14.14 13.95 13.67 14.5 13.53 14.67C13.38 14.83 13.24 14.85 12.99 14.73C12.75 14.61 11.96 14.35 11.02 13.51C10.29 12.86 9.79 12.05 9.65 11.81C9.51 11.56 9.63 11.43 9.75 11.31C9.86 11.2 10.00 11.02 10.12 10.88C10.24 10.74 10.28 10.63 10.37 10.47C10.45 10.3 10.41 10.16 10.35 10.04C10.29 9.92 9.79 8.7 9.59 8.2C9.39 7.72 9.18 7.78 9.03 7.78L8.55 7.77C8.39 7.77 8.12 7.83 7.89 8.08C7.67 8.32 7.03 8.92 7.03 10.14C7.03 11.36 7.92 12.54 8.04 12.7C8.16 12.87 9.79 15.38 12.28 16.46C12.87 16.72 13.33 16.87 13.69 16.99C14.29 17.18 14.83 17.15 15.26 17.09C15.74 17.02 16.73 16.49 16.93 15.92C17.14 15.35 17.14 14.86 17.08 14.75C17.02 14.65 16.81 14.52 16.56 14.39Z" />
                </svg>
              </a>
            )}

            {/* Facebook */}
            {(siteContent?.socialLinks?.facebook || isVisualEditMode) && (
              <a
                href={safeHref(siteContent?.socialLinks?.facebook, "https://facebook.com/yallalb")}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Facebook"
                className="w-9 h-9 rounded-lg bg-white/[0.04] hover:bg-[#1877F2] border border-white/10 hover:border-transparent text-neutral-300 hover:text-white flex items-center justify-center transition-all duration-200 shadow-2xs cursor-pointer group"
              >
                <Facebook className="w-4 h-4 group-hover:scale-110 transition-transform" />
              </a>
            )}

            {/* Email Direct */}
            {(siteContent?.socialLinks?.email || footerData.email || isVisualEditMode) && (
              <a
                href={`mailto:${siteContent?.socialLinks?.email || footerData.email || 'concierge@yalla.lb'}`}
                aria-label="Email"
                className="w-9 h-9 rounded-lg bg-white/[0.04] hover:bg-[#B89753] border border-white/10 hover:border-[#B89753] text-neutral-300 hover:text-black flex items-center justify-center transition-all duration-200 shadow-2xs cursor-pointer group"
              >
                <Mail className="w-4 h-4 group-hover:scale-110 transition-transform" />
              </a>
            )}

            {/* Phone Call */}
            {(siteContent?.socialLinks?.phone || footerData.phone || isVisualEditMode) && (
              <a
                href={`tel:${siteContent?.socialLinks?.phone || footerData.phone || '+96170889234'}`}
                aria-label="Call"
                className="w-9 h-9 rounded-lg bg-white/[0.04] hover:bg-[#16803C] border border-white/10 hover:border-[#16803C] text-neutral-300 hover:text-white flex items-center justify-center transition-all duration-200 shadow-2xs cursor-pointer group"
              >
                <PhoneCall className="w-4 h-4 group-hover:scale-110 transition-transform" />
              </a>
            )}
          </div>
        )}

        {/* Copyright & Lebanese Heritage Attribution */}
        {(visibility.footerCopyright || isVisualEditMode) && (
          <div className={`pt-4 border-t border-white/10 w-full flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-neutral-400 relative ${!visibility.footerCopyright && isVisualEditMode ? 'opacity-70 border-2 border-dashed border-rose-500/80 rounded-xl p-2' : ''}`}>
            <div className="flex items-center gap-2">
              <span className="whitespace-pre-line text-center sm:text-start leading-relaxed">
                {language === 'ar'
                  ? (footerData.copyrightTextArabic || footerData.copyrightText || `© ${new Date().getFullYear()} يلا. جميع الحقوق محفوظة.`)
                  : (footerData.copyrightText || `© ${new Date().getFullYear()} Yalla. All Rights Reserved.`)}
              </span>
            </div>

            <div className="flex items-center gap-4 shrink-0">
              <button
                type="button"
                id="footer-seller-portal-btn"
                onClick={() => setActiveTab('seller')}
                className="inline-flex items-center gap-1.5 text-[#B89753] hover:text-white font-bold transition-colors cursor-pointer"
              >
                <Store className="w-3.5 h-3.5" />
                <span>{language === 'ar' ? 'بوابة البائعين والتجار' : 'Seller & Merchant Portal'}</span>
              </button>
            </div>
          </div>
        )}

      </div>

    </footer>
  );
};
