import React from 'react';
import { 
  Layout, 
  Share2, 
  Phone, 
  Mail, 
  MapPin, 
  Clock, 
  FileText,
  ChevronUp,
  ChevronDown,
  AlignLeft,
  AlignCenter,
  AlignRight
} from 'lucide-react';
import { BrandIcon, GmailIcon } from '../../ui/BrandIcon';
import { SocialIconLinks } from '../../SocialIconLinks';
import type { SocialChannel, SocialDisplay } from '../../../types';
import {
  SOCIAL_CHANNELS,
  SOCIAL_CHANNEL_LABELS,
  channelAlign,
  channelOrder,
  isChannelHidden,
  shownChannels,
  type SocialAlign,
} from '../../../lib/socialChannels';

/** What each channel's field asks for. Email, Call and WhatsApp fall back to the support contact above. */
const CHANNEL_FIELDS: Record<SocialChannel, { label: string; placeholder: string; type: 'text' | 'email' | 'tel'; hint?: string }> = {
  instagram: { label: 'Instagram URL', placeholder: 'https://instagram.com/...', type: 'text' },
  whatsapp: { label: 'WhatsApp link or number', placeholder: 'https://wa.me/961... or +961 70 123 456', type: 'text', hint: 'Empty: uses the support phone number above.' },
  facebook: { label: 'Facebook Page URL', placeholder: 'https://facebook.com/...', type: 'text' },
  tiktok: { label: 'TikTok URL', placeholder: 'https://www.tiktok.com/@...', type: 'text' },
  youtube: { label: 'YouTube Channel URL', placeholder: 'https://www.youtube.com/@...', type: 'text' },
  x: { label: 'X (Twitter) URL', placeholder: 'https://x.com/...', type: 'text' },
  email: { label: 'Email address', placeholder: 'name@example.com', type: 'email', hint: 'Empty: uses the support email address above.' },
  phone: { label: 'Call number', placeholder: '+961 70 123 456', type: 'tel', hint: 'Empty: uses the support phone number above.' },
};

const MARK_TINT: Partial<Record<SocialChannel, string>> = {
  instagram: 'text-[#FF0069]', whatsapp: 'text-[#25D366]', facebook: 'text-[#0866FF]',
  tiktok: 'text-slate-900', youtube: 'text-[#FF0000]', x: 'text-slate-900',
};

const ChannelMark: React.FC<{ channel: SocialChannel }> = ({ channel }) => {
  if (channel === 'email') return <GmailIcon className="w-3.5 h-3.5 shrink-0" />;
  if (channel === 'phone') return <Phone className="w-3.5 h-3.5 shrink-0 text-emerald-500" aria-hidden="true" />;
  return <BrandIcon brand={channel} className={`w-3.5 h-3.5 shrink-0 ${MARK_TINT[channel] ?? ''}`} />;
};

const ALIGN_OPTIONS: { value: SocialAlign; label: string; Icon: typeof AlignLeft }[] = [
  { value: 'start', label: 'Left', Icon: AlignLeft },
  { value: 'center', label: 'Center', Icon: AlignCenter },
  { value: 'end', label: 'Right', Icon: AlignRight },
];

const ALIGN_SELF: Record<SocialAlign, string> = { start: 'self-start', center: 'self-center', end: 'self-end' };

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
    tiktok?: string;
    youtube?: string;
    x?: string;
  };
  /** Which icons show, their order and the footer panel's alignment. */
  socialDisplay?: SocialDisplay;
  onChangeFooterField: (field: string, value: string) => void;
  onChangeSocialField: (field: string, value: string) => void;
  onChangeSocialDisplay: (next: SocialDisplay) => void;
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
  socialDisplay,
  onChangeFooterField,
  onChangeSocialField,
  onChangeSocialDisplay,
}) => {
  const display: SocialDisplay = socialDisplay || {};
  const order = channelOrder(display);
  const align = channelAlign(display);
  const previewItems = shownChannels({ socialLinks, footer: footerData, socialDisplay: display }, { includeHidden: true });

  // Switching a channel off keeps its link; the list is stored in the default order.
  const toggleChannel = (channel: SocialChannel) => {
    const hidden = new Set(display.hidden || []);
    if (hidden.has(channel)) hidden.delete(channel);
    else hidden.add(channel);
    onChangeSocialDisplay({ ...display, hidden: SOCIAL_CHANNELS.filter(c => hidden.has(c)) });
  };

  const moveChannel = (index: number, step: -1 | 1) => {
    const target = index + step;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target], next[index]];
    onChangeSocialDisplay({ ...display, order: next });
  };

  return (
    <div className="space-y-6">
      {/* About Us Brand Narrative Block */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-5">
        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <FileText className="w-5 h-5 text-indigo-600" />
          <span>Footer About Us Narrative Block</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="footer-about-title-en" className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5 cursor-pointer">
              About Section Heading (English)
            </label>
            <input
              id="footer-about-title-en"
              type="text"
              value={footerData.aboutTitle || ''}
              onChange={(e) => onChangeFooterField('aboutTitle', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="footer-about-title-ar" className="block text-xs font-bold uppercase tracking-wider text-indigo-600 mb-1.5 cursor-pointer" dir="rtl">
              عنوان من نحن (عربي)
            </label>
            <input
              id="footer-about-title-ar"
              type="text"
              dir="rtl"
              value={footerData.aboutTitleArabic || ''}
              onChange={(e) => onChangeFooterField('aboutTitleArabic', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="footer-about-text-en" className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5 cursor-pointer">
              About Description / Brand Mission (English)
            </label>
            <textarea
              id="footer-about-text-en"
              rows={3}
              value={footerData.aboutText || ''}
              onChange={(e) => onChangeFooterField('aboutText', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none leading-relaxed"
            />
          </div>
          <div>
            <label htmlFor="footer-about-text-ar" className="block text-xs font-bold uppercase tracking-wider text-indigo-600 mb-1.5 cursor-pointer" dir="rtl">
              نص من نحن / رسالة المتجر (عربي)
            </label>
            <textarea
              id="footer-about-text-ar"
              rows={3}
              dir="rtl"
              value={footerData.aboutTextArabic || ''}
              onChange={(e) => onChangeFooterField('aboutTextArabic', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none leading-relaxed"
            />
          </div>
        </div>
      </div>

      {/* Contact Information & Physical Head Office */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-5">
        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <Phone className="w-5 h-5 text-emerald-400" />
          <span>Footer Contact & Support Coordinates</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="footer-contact-title-en" className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5 cursor-pointer">
              Contact Section Heading (English)
            </label>
            <input
              id="footer-contact-title-en"
              type="text"
              value={footerData.contactTitle || ''}
              onChange={(e) => onChangeFooterField('contactTitle', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="footer-contact-title-ar" className="block text-xs font-bold uppercase tracking-wider text-indigo-600 mb-1.5 cursor-pointer" dir="rtl">
              عنوان قسم الاتصال (عربي)
            </label>
            <input
              id="footer-contact-title-ar"
              type="text"
              dir="rtl"
              value={footerData.contactTitleArabic || ''}
              onChange={(e) => onChangeFooterField('contactTitleArabic', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="footer-phone" className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5 cursor-pointer">
              Support Phone Number
            </label>
            <input
              id="footer-phone"
              type="text"
              value={footerData.phone || ''}
              onChange={(e) => onChangeFooterField('phone', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="footer-email" className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5 cursor-pointer">
              Support Email Address
            </label>
            <input
              id="footer-email"
              type="email"
              value={footerData.email || ''}
              onChange={(e) => onChangeFooterField('email', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="footer-address-en" className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5 flex items-center gap-1 cursor-pointer">
              <MapPin className="w-3.5 h-3.5 text-indigo-600" />
              <span>Physical Address (English)</span>
            </label>
            <textarea
              id="footer-address-en"
              rows={2}
              value={footerData.address || ''}
              onChange={(e) => onChangeFooterField('address', e.target.value)}
              placeholder="e.g. Gournaud Street, Gemmayzeh&#10;Beirut, Lebanon"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none leading-relaxed"
            />
          </div>
          <div>
            <label htmlFor="footer-address-ar" className="block text-xs font-bold uppercase tracking-wider text-indigo-600 mb-1.5 cursor-pointer" dir="rtl">
              العنوان الفعلي (عربي)
            </label>
            <textarea
              id="footer-address-ar"
              rows={2}
              dir="rtl"
              value={footerData.addressArabic || ''}
              onChange={(e) => onChangeFooterField('addressArabic', e.target.value)}
              placeholder="مثال: شارع غورو، الجميزة&#10;بيروت، لبنان"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none leading-relaxed"
            />
          </div>

          <div>
            <label htmlFor="footer-hours-en" className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5 flex items-center gap-1 cursor-pointer">
              <Clock className="w-3.5 h-3.5 text-indigo-400" />
              <span>Operating Hours (English)</span>
            </label>
            <textarea
              id="footer-hours-en"
              rows={2}
              value={footerData.hours || ''}
              onChange={(e) => onChangeFooterField('hours', e.target.value)}
              placeholder="e.g. Mon - Fri: 9:00 AM - 7:00 PM&#10;Sat: 10:00 AM - 4:00 PM"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none leading-relaxed"
            />
          </div>
          <div>
            <label htmlFor="footer-hours-ar" className="block text-xs font-bold uppercase tracking-wider text-indigo-600 mb-1.5 cursor-pointer" dir="rtl">
              ساعات العمل (عربي)
            </label>
            <textarea
              id="footer-hours-ar"
              rows={2}
              dir="rtl"
              value={footerData.hoursArabic || ''}
              onChange={(e) => onChangeFooterField('hoursArabic', e.target.value)}
              placeholder="مثال: الإثنين - الجمعة: 9:00 ص - 7:00 م&#10;السبت: 10:00 ص - 4:00 م"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none leading-relaxed"
            />
          </div>
        </div>
      </div>

      {/* Social Media & Concierge Links: one list for every icon on the site */}
      <div id="cms-social-links" className="bg-white border border-slate-200 rounded-3xl p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Share2 className="w-5 h-5 text-blue-400" />
            <span>Social Media & Concierge Links</span>
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Footer icons</span>
            <div role="radiogroup" aria-label="Footer icon alignment" className="flex items-center gap-1 bg-white/70 p-1 rounded-xl border border-slate-200">
              {ALIGN_OPTIONS.map(({ value, label, Icon }) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={align === value}
                  id={`social-align-${value}`}
                  onClick={() => onChangeSocialDisplay({ ...display, align: value })}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition-all ${align === value ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-[#171717] px-4 py-5 flex flex-col items-center" aria-hidden="true" inert>
          {previewItems.length > 0 ? (
            <div id="cms-social-preview" className={`social-container ${ALIGN_SELF[align]}`}>
              <SocialIconLinks items={previewItems} />
            </div>
          ) : (
            <p className="text-xs text-neutral-400">No icon has a link yet.</p>
          )}
        </div>
        <p className="text-[11px] text-slate-500 -mt-2">Preview of the store footer. Dimmed icons are hidden from visitors. The same switches and order apply to the support card on the Account page; the Arabic site mirrors left and right.</p>

        <ol className="space-y-2">
          {order.map((channel, index) => {
            const field = CHANNEL_FIELDS[channel];
            const label = SOCIAL_CHANNEL_LABELS[channel];
            const shown = !isChannelHidden(display, channel);
            return (
              <li key={channel} data-channel={channel} className={`flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 rounded-2xl border border-slate-200 p-3 ${shown ? 'bg-white' : 'bg-slate-50'}`}>
                <div className="flex items-center gap-2 sm:w-64 shrink-0">
                  <div className="flex flex-col">
                    <button type="button" aria-label={`Move ${label} up`} disabled={index === 0} onClick={() => moveChannel(index, -1)} className="p-0.5 rounded text-slate-400 hover:text-slate-900 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">
                      <ChevronUp className="w-4 h-4" aria-hidden="true" />
                    </button>
                    <button type="button" aria-label={`Move ${label} down`} disabled={index === order.length - 1} onClick={() => moveChannel(index, 1)} className="p-0.5 rounded text-slate-400 hover:text-slate-900 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">
                      <ChevronDown className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                  <ChannelMark channel={channel} />
                  <label htmlFor={`social-${channel}`} className="text-xs font-bold uppercase tracking-wider text-slate-600 cursor-pointer">{field.label}</label>
                </div>
                <div className="flex-1 min-w-0">
                  <input
                    id={`social-${channel}`}
                    type={field.type}
                    value={socialLinks[channel] || ''}
                    onChange={(e) => onChangeSocialField(channel, e.target.value)}
                    placeholder={field.placeholder}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
                  />
                  {field.hint && <p className="text-[11px] text-slate-400 mt-1">{field.hint}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button type="button" role="switch" aria-checked={shown} aria-label={`${label} icon visibility`} onClick={() => toggleChannel(channel)} className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors cursor-pointer ${shown ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                    <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition ${shown ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                  <span className={`w-12 text-[10px] font-bold uppercase tracking-wider ${shown ? 'text-emerald-700' : 'text-slate-500'}`}>{shown ? 'Shown' : 'Hidden'}</span>
                </div>
              </li>
            );
          })}
        </ol>
        <p className="text-[11px] text-slate-500">
          An icon shows when it has a link and is switched on; switching it off keeps the link for later. The arrows set the order.
          To change the colour, font, size or alignment of any text on the store, open the store as admin and use <strong>Style Text</strong> in the admin bar.
        </p>
      </div>

      {/* Copyright Banner */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Layout className="w-5 h-5 text-indigo-600" />
            <span>Footer Copyright & Bottom Attribution Notice</span>
          </h3>
          <span className="text-[11px] text-indigo-600/80 font-medium">Supports Multi-line / Press Enter for new lines</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="footer-copyright-en" className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5 cursor-pointer">
              Copyright Text (English)
            </label>
            <textarea
              id="footer-copyright-en"
              rows={3}
              value={footerData.copyrightText || ''}
              onChange={(e) => onChangeFooterField('copyrightText', e.target.value)}
              placeholder="e.g.&#10;© 2026 Yalla. All rights reserved.&#10;Made With Love From Rachaya ❤️"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none leading-relaxed"
            />
            <p className="text-[11px] text-slate-500 mt-1">Press <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px] text-indigo-600">Enter</kbd> to split text into multiple lines in the store footer.</p>
          </div>
          <div>
            <label htmlFor="footer-copyright-ar" className="block text-xs font-bold uppercase tracking-wider text-indigo-600 mb-1.5 cursor-pointer" dir="rtl">
              نص حقوق النشر والرسالة الختامية (عربي)
            </label>
            <textarea
              id="footer-copyright-ar"
              rows={3}
              dir="rtl"
              value={footerData.copyrightTextArabic || ''}
              onChange={(e) => onChangeFooterField('copyrightTextArabic', e.target.value)}
              placeholder="مثال:&#10;© 2026 يلا. جميع الحقوق محفوظة.&#10;صُنع بكل فخر وحب من راشيا الوادي ❤️"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none leading-relaxed"
            />
            <p className="text-[11px] text-slate-500 mt-1" dir="rtl">اضغط <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px] text-indigo-600">Enter</kbd> لكتابة النص على عدة أسطر منفصلة.</p>
          </div>
        </div>
      </div>
    </div>
  );
};
