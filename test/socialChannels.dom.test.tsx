// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DEFAULT_SITE_CONTENT } from '../src/data/cmsContent';
import type { SocialDisplay } from '../src/types';

// Every social and concierge icon on the site is the admin's: its link, a
// switch that hides it without losing the link, its place in the order, and
// where the footer's panel sits. The shop context is large; these components
// read a few fields of it.
const shop: Record<string, unknown> = {};
vi.mock('../src/context/ShopContext', () => ({ useShop: () => shop }));

const { channelOrder, channelAlign, channelHref, shownChannels, SOCIAL_CHANNELS } = await import('../src/lib/socialChannels');
const { Footer } = await import('../src/components/Footer');
const { AccountSupportCard } = await import('../src/components/AccountSupportCard');
const { CMSFooterTab } = await import('../src/components/admin/cms/CMSFooterTab');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = '';
  for (const key of Object.keys(shop)) delete shop[key];
});

const links = { ...DEFAULT_SITE_CONTENT.socialLinks };
const footer = { ...DEFAULT_SITE_CONTENT.footer };

const renderSite = (ui: React.ReactElement, options: { display?: SocialDisplay; visibility?: Record<string, boolean>; editing?: boolean } = {}) => {
  Object.assign(shop, {
    language: 'en', isVisualEditMode: options.editing ?? false, setActiveTab: vi.fn(),
    siteContent: {
      ...DEFAULT_SITE_CONTENT,
      visibility: { ...DEFAULT_SITE_CONTENT.visibility, ...options.visibility },
      socialDisplay: options.display,
    },
  });
  act(() => root.render(ui));
};

// Each icon tile in the footer, by channel.
const footerIcons = () => Array.from(host.querySelectorAll<HTMLAnchorElement>('footer .social-container a.social-btn'))
  .map(a => a.dataset.brand ?? (a.dataset.contact === 'call' ? 'phone' : a.dataset.contact));

describe('the channel rules', () => {
  it('keeps the saved order, ignoring unknown or repeated entries, and adds the rest', () => {
    expect(channelOrder()).toEqual([...SOCIAL_CHANNELS]);
    expect(channelOrder({ order: ['phone', 'email', 'instagram'] }))
      .toEqual(['phone', 'email', 'instagram', 'whatsapp', 'facebook', 'tiktok', 'youtube', 'x']);
    expect(channelOrder({ order: ['phone', 'nope', 'phone'] as never })[0]).toBe('phone');
    expect(channelOrder({ order: ['phone', 'nope', 'phone'] as never })).toHaveLength(SOCIAL_CHANNELS.length);
  });

  it('centres the footer panel unless the admin chose a side', () => {
    expect(channelAlign()).toBe('center');
    expect(channelAlign({ align: 'start' })).toBe('start');
    expect(channelAlign({ align: 'sideways' as never })).toBe('center');
  });

  it('builds each link, falling back to the footer support contact for Email, Call and WhatsApp', () => {
    const content = (socialLinks: Record<string, string>, f: Record<string, string> = {}) => ({ socialLinks, footer: f });
    const greeting = 'text=Hello%20Yalla%2C%20I%20would%20like%20to%20inquire%20about%20my%20order';
    expect(channelHref('whatsapp', content({ whatsapp: '+961 70 889 234' }))).toBe(`https://wa.me/96170889234?${greeting}`);
    expect(channelHref('whatsapp', content({ whatsapp: 'https://wa.me/96170889234' }))).toBe(`https://wa.me/96170889234?${greeting}`);
    expect(channelHref('whatsapp', content({ whatsapp: 'https://chat.whatsapp.com/AbC123' }))).toBe('https://chat.whatsapp.com/AbC123');
    expect(channelHref('whatsapp', content({}, { phone: '+961 70 123 456' }))).toBe(`https://wa.me/96170123456?${greeting}`);
    expect(channelHref('whatsapp', content({}))).toBe('');
    expect(channelHref('email', content({ email: 'hello@yalla.lb' }))).toBe('mailto:hello@yalla.lb');
    expect(channelHref('email', content({}, { email: 'support@yalla.lb' }))).toBe('mailto:support@yalla.lb');
    expect(channelHref('phone', content({ phone: '+961 70 889 234' }))).toBe('tel:+96170889234');
    expect(channelHref('instagram', content({ instagram: 'instagram.com/yalla.lb' }))).toBe('https://instagram.com/yalla.lb');
    expect(channelHref('instagram', content({ instagram: 'javascript:alert(1)' }))).toBe('');
    expect(channelHref('youtube', content({}))).toBe('');
  });

  it('leaves a switched-off channel out, unless a preview asks for it', () => {
    const content = { socialLinks: links, footer, socialDisplay: { hidden: ['facebook'] } as SocialDisplay };
    expect(shownChannels(content).map(c => c.channel)).not.toContain('facebook');
    expect(shownChannels(content, { includeHidden: true }).find(c => c.channel === 'facebook')?.hidden).toBe(true);
  });
});

describe('the footer icons', () => {
  it('show every linked channel, in the usual order, centred, when nothing is set', () => {
    renderSite(<Footer />);
    expect(footerIcons()).toEqual(['instagram', 'whatsapp', 'facebook', 'email', 'phone']);
    const panel = host.querySelector('footer .social-container')!;
    expect(panel.getAttribute('data-social-align')).toBe('center');
    expect(panel.classList.contains('self-center')).toBe(true);
  });

  it('follow the admin: hidden channels go, the order and the side change', () => {
    renderSite(<Footer />, { display: { hidden: ['facebook', 'phone'], order: ['email', 'instagram'], align: 'end' } });
    expect(footerIcons()).toEqual(['email', 'instagram', 'whatsapp']);
    expect(host.querySelector('footer .social-container')!.classList.contains('self-end')).toBe(true);
  });

  it('hide Email and Call on their own, leaving the support contact details as they are', () => {
    renderSite(<Footer />, { display: { hidden: ['email', 'phone'] }, visibility: { footerContact: true } });
    expect(footerIcons()).toEqual(['instagram', 'whatsapp', 'facebook']);
    const contact = host.querySelector('footer')!.textContent!;
    expect(contact).toContain(footer.email);
    expect(contact).toContain(footer.phone);
  });

  it('no longer tie the Call icon to the footer support phone switch', () => {
    renderSite(<Footer />, { visibility: { phoneSupport: false, footerContact: true } });
    expect(footerIcons()).toContain('phone');
    expect(host.querySelector(`footer a[href="tel:${footer.phone}"]:not(.social-btn)`)).toBeNull();
  });

  it('leave no empty panel when every channel is off', () => {
    renderSite(<Footer />, { display: { hidden: [...SOCIAL_CHANNELS] } });
    expect(host.querySelector('footer .social-container')).toBeNull();
  });

  it('show switched-off icons dimmed to the admin in preview mode, and only then', () => {
    renderSite(<Footer />, { display: { hidden: ['instagram'] }, editing: true });
    const instagram = host.querySelector<HTMLAnchorElement>('footer a[data-brand="instagram"]')!;
    expect(instagram.dataset.hidden).toBe('true');
    expect(instagram.style.opacity).toBe('0.4');
    expect(host.querySelector('footer a[data-brand="whatsapp"]')!.hasAttribute('data-hidden')).toBe(false);
  });
});

describe('the Account page support card', () => {
  const buttons = () => Array.from(host.querySelectorAll<HTMLAnchorElement>('section a')).map(a => a.getAttribute('href')!.split(':')[0]);

  it('follows the same switches and order', () => {
    renderSite(<AccountSupportCard />);
    expect(buttons()).toEqual(['https', 'mailto', 'tel']);
    act(() => root.unmount());
    root = createRoot(host);
    renderSite(<AccountSupportCard />, { display: { hidden: ['whatsapp'], order: ['phone'] } });
    expect(buttons()).toEqual(['tel', 'mailto']);
    expect(host.querySelector('a[data-brand="whatsapp"]')).toBeNull();
  });
});

describe('CMS -> Footer -> Social Media & Concierge Links', () => {
  const renderTab = (display?: SocialDisplay) => {
    const onChangeSocialField = vi.fn();
    const onChangeSocialDisplay = vi.fn();
    act(() => root.render(
      <CMSFooterTab
        footerData={footer as never}
        socialLinks={links as never}
        socialDisplay={display}
        onChangeFooterField={vi.fn()}
        onChangeSocialField={onChangeSocialField}
        onChangeSocialDisplay={onChangeSocialDisplay}
      />,
    ));
    return { onChangeSocialField, onChangeSocialDisplay };
  };
  const rows = () => Array.from(host.querySelectorAll<HTMLLIElement>('#cms-social-links li[data-channel]')).map(li => li.dataset.channel);
  const click = (el: Element | null) => act(() => { (el as HTMLElement).click(); });

  it('lists every channel with its link, Email and Call included, in the saved order', () => {
    renderTab({ order: ['phone'] });
    expect(rows()).toEqual(['phone', 'instagram', 'whatsapp', 'facebook', 'tiktok', 'youtube', 'x', 'email']);
    expect(host.querySelector<HTMLInputElement>('#social-email')!.value).toBe(links.email);
    expect(host.querySelector<HTMLInputElement>('#social-phone')!.value).toBe(links.phone);
  });

  it('hides and shows an icon without touching its link', () => {
    const { onChangeSocialDisplay, onChangeSocialField } = renderTab({ hidden: ['x'] });
    const facebook = host.querySelector('[aria-label="Facebook icon visibility"]')!;
    expect(facebook.getAttribute('aria-checked')).toBe('true');
    click(facebook);
    expect(onChangeSocialDisplay).toHaveBeenLastCalledWith({ hidden: ['facebook', 'x'] });
    click(host.querySelector('[aria-label="X icon visibility"]'));
    expect(onChangeSocialDisplay).toHaveBeenLastCalledWith({ hidden: [] });
    expect(onChangeSocialField).not.toHaveBeenCalled();
  });

  it('moves an icon up or down, and not past either end', () => {
    const { onChangeSocialDisplay } = renderTab();
    expect(host.querySelector<HTMLButtonElement>('[aria-label="Move Instagram up"]')!.disabled).toBe(true);
    expect(host.querySelector<HTMLButtonElement>('[aria-label="Move Call down"]')!.disabled).toBe(true);
    click(host.querySelector('[aria-label="Move Call up"]'));
    expect(onChangeSocialDisplay).toHaveBeenLastCalledWith({
      order: ['instagram', 'whatsapp', 'facebook', 'tiktok', 'youtube', 'x', 'phone', 'email'],
    });
  });

  it('sets where the footer panel sits', () => {
    const { onChangeSocialDisplay } = renderTab();
    expect(host.querySelector('#social-align-center')!.getAttribute('aria-checked')).toBe('true');
    click(host.querySelector('#social-align-start'));
    expect(onChangeSocialDisplay).toHaveBeenLastCalledWith({ align: 'start' });
  });

  it('edits the Email and Call links', () => {
    const { onChangeSocialField } = renderTab();
    const input = host.querySelector<HTMLInputElement>('#social-email')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'hello@yalla.lb');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(onChangeSocialField).toHaveBeenCalledWith('email', 'hello@yalla.lb');
  });

  it('previews the footer, with switched-off icons dimmed', () => {
    renderTab({ hidden: ['whatsapp'], align: 'end' });
    const preview = host.querySelector('#cms-social-preview')!;
    expect(preview.classList.contains('self-end')).toBe(true);
    expect(preview.querySelector('a[data-brand="whatsapp"]')!.getAttribute('data-hidden')).toBe('true');
    expect(preview.closest('[inert]')).not.toBeNull();
  });
});
