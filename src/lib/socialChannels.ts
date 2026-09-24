import type { SiteContent, SocialChannel, SocialDisplay } from '../types';
import { safeHref } from './safeUrl';

/**
 * The shop's social and concierge channels. Each has its link (CMS -> Footer),
 * a switch that hides it everywhere without losing the link, and a place in
 * one order; the footer panel's alignment is set beside them. Nothing saved
 * yet means every linked channel shows, in this order, centred.
 */
export const SOCIAL_CHANNELS: readonly SocialChannel[] = ['instagram', 'whatsapp', 'facebook', 'tiktok', 'youtube', 'x', 'email', 'phone'];

export const SOCIAL_CHANNEL_LABELS: Record<SocialChannel, string> = {
  instagram: 'Instagram',
  whatsapp: 'WhatsApp',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  x: 'X',
  email: 'Email',
  phone: 'Call',
};

export type SocialAlign = NonNullable<SocialDisplay['align']>;

type ChannelContent = {
  socialLinks?: Partial<SiteContent['socialLinks']> | null;
  footer?: Partial<SiteContent['footer']> | null;
  socialDisplay?: SocialDisplay | null;
};

const isChannel = (value: unknown): value is SocialChannel =>
  typeof value === 'string' && (SOCIAL_CHANNELS as readonly string[]).includes(value);

/** The saved order first (known channels, once each), then any not placed yet. */
export function channelOrder(display?: SocialDisplay | null): SocialChannel[] {
  const saved = [...new Set((Array.isArray(display?.order) ? display.order : []).filter(isChannel))];
  return [...saved, ...SOCIAL_CHANNELS.filter(channel => !saved.includes(channel))];
}

export function isChannelHidden(display: SocialDisplay | null | undefined, channel: SocialChannel): boolean {
  return Array.isArray(display?.hidden) && display.hidden.includes(channel);
}

export function channelAlign(display?: SocialDisplay | null): SocialAlign {
  return display?.align === 'start' || display?.align === 'end' ? display.align : 'center';
}

const WHATSAPP_GREETING = 'Hello Yalla, I would like to inquire about my order';
/** A bare wa.me number link, which gets the greeting as a plain number does. */
const BARE_WA_ME = /^https?:\/\/(?:api\.)?wa\.me\/\+?\d+\/?$/i;

/** "instagram.com/yalla" as typed becomes an address, not a page of this site. */
function withScheme(raw: string): string {
  return /^[a-z][a-z\d+.-]*:/i.test(raw) || /^[/#.\\]/.test(raw) ? raw : `https://${raw}`;
}

/**
 * Where a channel's icon leads, or '' when it has nothing to lead to. Email
 * and Call fall back to the footer's support email and phone, and WhatsApp to
 * that phone. Only http(s), mailto and tel links are ever produced.
 */
export function channelHref(channel: SocialChannel, content: ChannelContent): string {
  const links = content.socialLinks || {};
  const footer = content.footer || {};
  switch (channel) {
    case 'whatsapp': {
      const raw = String(links.whatsapp || footer.phone || '').trim();
      if (/^https?:\/\//i.test(raw) && !BARE_WA_ME.test(raw)) return safeHref(raw, '');
      const digits = raw.replace(/\D/g, '');
      return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(WHATSAPP_GREETING)}` : '';
    }
    case 'email': {
      const address = String(links.email || footer.email || '').trim();
      return address ? safeHref(`mailto:${address}`, '') : '';
    }
    case 'phone': {
      const number = String(links.phone || footer.phone || '').replace(/[^\d+]/g, '');
      return number ? `tel:${number}` : '';
    }
    default: {
      const raw = String(links[channel] || '').trim();
      return raw ? safeHref(withScheme(raw), '') : '';
    }
  }
}

export interface ShownChannel {
  channel: SocialChannel;
  href: string;
  /** Switched off: only admin previews include it, dimmed. */
  hidden: boolean;
}

/** The channels to show, in order, each with its link; hidden ones only when asked for. */
export function shownChannels(content: ChannelContent, options: { includeHidden?: boolean } = {}): ShownChannel[] {
  const display = content.socialDisplay;
  return channelOrder(display)
    .map(channel => ({ channel, href: channelHref(channel, content), hidden: isChannelHidden(display, channel) }))
    .filter(item => item.href && (options.includeHidden || !item.hidden));
}
