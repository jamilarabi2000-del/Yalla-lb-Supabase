import React from 'react';
import { Phone } from 'lucide-react';
import { BrandIcon, FacebookLetterIcon, GmailIcon } from './ui/BrandIcon';
import { SOCIAL_CHANNEL_LABELS, type ShownChannel } from '../lib/socialChannels';

/**
 * The glowing icon tiles, placed straight into the .social-container that
 * holds them. A channel the admin switched off appears only in previews,
 * dimmed.
 */
export const SocialIconLinks: React.FC<{ items: ShownChannel[] }> = ({ items }) => (
  <>
    {items.map(({ channel, href, hidden }) => {
      const label = SOCIAL_CHANNEL_LABELS[channel];
      const external = !/^(mailto|tel):/.test(href);
      const shared = {
        href,
        'aria-label': label,
        ...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {}),
        ...(hidden ? { 'data-hidden': 'true', title: `${label}: hidden from visitors`, style: { opacity: 0.4 } } : {}),
      };
      if (channel === 'email') return <a key={channel} {...shared} data-contact="email" className="social-btn gmail"><GmailIcon /></a>;
      if (channel === 'phone') return <a key={channel} {...shared} data-contact="call" className="social-btn phone"><Phone fill="currentColor" strokeWidth={1.5} /></a>;
      return (
        <a key={channel} {...shared} data-brand={channel} className={`social-btn ${channel}`}>
          {channel === 'facebook' ? <FacebookLetterIcon /> : <BrandIcon brand={channel} />}
        </a>
      );
    })}
  </>
);
