import React from 'react';
import { Headphones, Mail, Phone, EyeOff } from 'lucide-react';
import { BrandIcon } from './ui/BrandIcon';
import { useShop } from '../context/ShopContext';
import { shownChannels } from '../lib/socialChannels';

/** CMS-owned support block for the Account page. */
export const AccountSupportCard: React.FC = () => {
  const { siteContent, language, isVisualEditMode } = useShop();
  const visible = siteContent?.visibility?.accountSupportCard !== false;
  const footer = siteContent?.footer;
  const social = siteContent?.socialLinks;

  if (!visible && !isVisualEditMode) return null;

  const phone = social?.phone || footer?.phone || '';
  const email = social?.email || footer?.email || '';
  // The same switches and order as the footer icons (CMS -> Footer).
  const contacts = shownChannels(
    { socialLinks: social, footer, socialDisplay: siteContent?.socialDisplay },
    { includeHidden: isVisualEditMode },
  ).filter(({ channel }) => channel === 'phone' || channel === 'email' || channel === 'whatsapp');

  return (
    <section className={`max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 mt-8 ${!visible && isVisualEditMode ? 'opacity-60' : ''}`}>
      {!visible && isVisualEditMode && (
        <div className="mb-2 inline-flex items-center gap-1 rounded bg-rose-600 px-2 py-1 text-[10px] font-bold text-white">
          <EyeOff className="w-3 h-3" /> Support Card Hidden
        </div>
      )}
      <div className="rounded-2xl border border-[#E5E5E5] bg-white p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#F8F8F6] border border-[#E5E5E5] flex items-center justify-center text-[#B89753]">
              <Headphones className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#171717]">{language === 'ar' ? 'الدعم والمساعدة' : 'Support & Concierge'}</h2>
              <p className="text-xs text-[#666666] mt-1">{language === 'ar' ? 'نحن هنا لمساعدتك في طلباتك واستفساراتك.' : 'We are here to help with your orders and questions.'}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {contacts.map(({ channel, href, hidden }) => {
              const dim = hidden ? { 'data-hidden': 'true', title: 'Hidden from visitors', style: { opacity: 0.4 } } : {};
              if (channel === 'phone') return <a key={channel} href={href} {...dim} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[#171717] text-white text-xs font-bold"><Phone className="w-3.5 h-3.5" />{phone}</a>;
              if (channel === 'email') return <a key={channel} href={href} {...dim} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[#E5E5E5] text-[#171717] text-xs font-bold"><Mail className="w-3.5 h-3.5" />{email}</a>;
              return <a key={channel} href={href} {...dim} target="_blank" rel="noopener noreferrer" data-brand="whatsapp" className="social-pill inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[#16803C] text-white text-xs font-bold"><BrandIcon brand="whatsapp" className="w-3.5 h-3.5" />WhatsApp</a>;
            })}
          </div>
        </div>
      </div>
    </section>
  );
};

export default AccountSupportCard;
