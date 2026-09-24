// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRoot, type Root } from 'react-dom/client';
import { DEFAULT_SITE_CONTENT } from '../src/data/cmsContent';

// Social links carry each brand's own mark on a tile in the brand's own colour
// and glow in it on hover. The shop context is large; these components read a
// few fields of it.
const shop: Record<string, unknown> = {};
vi.mock('../src/context/ShopContext', () => ({ useShop: () => shop }));

const { SOCIAL_BRANDS, FACEBOOK_LETTER, GMAIL_LOGO } = await import('../src/components/ui/BrandIcon');
const { Footer } = await import('../src/components/Footer');
const { AccountSupportCard } = await import('../src/components/AccountSupportCard');

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
});

const render = (socialLinks: Record<string, string>, ui: React.ReactElement) => {
  Object.assign(shop, {
    language: 'en', isVisualEditMode: false, setActiveTab: vi.fn(),
    siteContent: { ...DEFAULT_SITE_CONTENT, socialLinks: { ...DEFAULT_SITE_CONTENT.socialLinks, ...socialLinks } },
  });
  act(() => root.render(ui));
};

describe('the brand marks', () => {
  // SHA-256 of each path as published by Simple Icons v16.32.0 (CC0). A
  // change here means the mark is no longer the brand's own.
  const upstream: Record<string, [string, string]> = {
    whatsapp: ['#25D366', '8bbe960a5a29b570'],
    instagram: ['#FF0069', 'acf15f9fb76fd2bd'],
    facebook: ['#0866FF', '910dcaa575f731d3'],
    tiktok: ['#000000', '4ad895b5783ca940'],
    youtube: ['#FF0000', '8142fbc0e697bc1b'],
    x: ['#000000', 'a0a8e4521f2dc70e'],
  };

  it.each(Object.keys(upstream))('%s is the official glyph in the official colour', brand => {
    const mark = SOCIAL_BRANDS[brand as keyof typeof SOCIAL_BRANDS];
    const [color, sha] = upstream[brand];
    expect(mark.color).toBe(color);
    expect(createHash('sha256').update(mark.path).digest('hex').slice(0, 16)).toBe(sha);
  });
});

describe('the footer', () => {
  const links = () => Array.from(host.querySelectorAll<HTMLAnchorElement>('a.social-btn[data-brand]'));

  it('uses the brand marks, not generic icons', () => {
    render({}, <Footer />);
    expect(links().map(a => a.dataset.brand)).toEqual(['instagram', 'whatsapp', 'facebook']);
    for (const a of links()) {
      expect(a.classList.contains(a.dataset.brand!), a.dataset.brand).toBe(true);
      expect(a.querySelector(`svg[data-brand-icon="${a.dataset.brand}"]`), a.dataset.brand).not.toBeNull();
      expect(a.getAttribute('aria-label')).toBe(SOCIAL_BRANDS[a.dataset.brand as keyof typeof SOCIAL_BRANDS].title);
    }
    expect(host.querySelector('.lucide-instagram, .lucide-facebook, .lucide-message-circle')).toBeNull();
  });

  it('shows TikTok, YouTube and X only once the admin adds their links', () => {
    render({ tiktok: 'https://www.tiktok.com/@yalla.lb', youtube: '', x: 'javascript:alert(1)' }, <Footer />);
    expect(links().map(a => a.dataset.brand)).toEqual(['instagram', 'whatsapp', 'facebook', 'tiktok']);
    expect(host.querySelector<HTMLAnchorElement>('a[data-brand="tiktok"]')!.href).toBe('https://www.tiktok.com/@yalla.lb');
    expect(host.querySelector('a[data-brand="tiktok"]')!.classList.contains('social-btn')).toBe(true);
  });

  it('draws Email as the Gmail logo and Call as a filled phone, each on its own tile', () => {
    render({}, <Footer />);
    const email = host.querySelector<HTMLAnchorElement>('footer a[aria-label="Email"]')!;
    expect(email.getAttribute('href')).toMatch(/^mailto:/);
    expect([...email.classList]).toEqual(['social-btn', 'gmail']);
    expect([...email.querySelectorAll('svg[data-brand-icon="gmail"] path')].map(p => p.getAttribute('fill')))
      .toEqual(['#4285f4', '#34a853', '#fbbc04', '#ea4335', '#c5221f']);
    const call = host.querySelector<HTMLAnchorElement>('footer a[aria-label="Call"]')!;
    expect(call.getAttribute('href')).toMatch(/^tel:/);
    expect([...call.classList]).toEqual(['social-btn', 'phone']);
    const phone = call.querySelector('svg.lucide-phone')!;
    expect(phone.getAttribute('fill')).toBe('currentColor');
  });
});

describe('the glowing tiles', () => {
  const css = fs.readFileSync(path.resolve(process.cwd(), 'src/index.css'), 'utf8');
  const lift = 'transform:translateY(-5px) scale(1.05);';

  it('are 56px squircles with a white mark', () => {
    expect(css).toMatch(/\.social-btn \{[^}]*width:56px; height:56px; border-radius:16px;[^}]*color:#ffffff;[^}]*transition:all \.3s cubic-bezier\(0\.4, 0, 0\.2, 1\);/);
  });

  it("rest in each brand's own colours, as specified", () => {
    expect(css).toContain('.social-btn.instagram { background:radial-gradient(circle at 30% 107%, #fdf497 0%, #fdf497 5%, #fd5949 45%, #d6249f 60%, #285AEB 90%);');
    expect(css).toContain('.social-btn.whatsapp { background-color:#25D366;');
    expect(css).toContain('.social-btn.facebook { background-color:#1877F2;');
    expect(css).toContain('.social-btn.gmail { background-color:#ffffff; border:none; }');
    expect(css).toContain('.social-btn.phone { background:linear-gradient(135deg, #32d74b 0%, #28cd41 100%);');
  });

  it('lift and glow in their own colours on hover and keyboard focus', () => {
    const glow: Record<string, string> = {
      instagram: 'inset 0 0 0 1px rgba(255, 255, 255, 0.3), 0 0 20px rgba(214, 36, 159, 0.8), 0 0 35px rgba(253, 89, 73, 0.6)',
      whatsapp: '0 0 20px rgba(37, 211, 102, 0.8), 0 0 35px rgba(37, 211, 102, 0.5)',
      facebook: '0 0 20px rgba(24, 119, 242, 0.8), 0 0 35px rgba(24, 119, 242, 0.5)',
      gmail: '0 0 20px rgba(234, 67, 53, 0.6), 0 0 35px rgba(66, 133, 244, 0.4)',
      phone: 'inset 0 0 0 1px rgba(255, 255, 255, 0.3), 0 0 20px rgba(50, 215, 75, 0.8), 0 0 35px rgba(40, 205, 65, 0.5)',
    };
    for (const [name, shadow] of Object.entries(glow)) {
      expect(css, name).toContain(`.social-btn.${name}:hover, .social-btn.${name}:focus-visible { ${lift} box-shadow:${shadow}; }`);
    }
    for (const name of ['tiktok', 'youtube', 'x']) {
      expect(css, name).toContain(`.social-btn.${name}:hover, .social-btn.${name}:focus-visible { ${lift}`);
    }
  });

  it('keep still for reduced motion', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*\.social-btn:hover, \.social-btn:focus-visible \{ transform:none !important; \}/);
  });

  it('use the letter of the official Facebook mark and the Gmail logo', () => {
    // The "f" is the official mark's own outline, closed along its baseline.
    const cut = FACEBOOK_LETTER.path.lastIndexOf('v7.98z');
    expect(SOCIAL_BRANDS.facebook.path.startsWith(FACEBOOK_LETTER.path.slice(0, cut))).toBe(true);
    expect(GMAIL_LOGO.parts.map(([color]) => color)).toEqual(['#4285f4', '#34a853', '#fbbc04', '#ea4335', '#c5221f']);
  });
});

describe('WhatsApp buttons', () => {
  it('the support card uses the WhatsApp mark', () => {
    render({ whatsapp: 'https://wa.me/96170889234' }, <AccountSupportCard />);
    const button = host.querySelector<HTMLAnchorElement>('a[data-brand="whatsapp"]')!;
    expect(button.classList.contains('social-pill')).toBe(true);
    expect(button.querySelector('svg[data-brand-icon="whatsapp"]')).not.toBeNull();
    expect(host.querySelector('.lucide-message-circle')).toBeNull();
  });

  it('no WhatsApp button or label anywhere keeps a generic chat icon', () => {
    const files = [
      'src/components/AccountSupportCard.tsx', 'src/components/ProductDetailView.tsx', 'src/components/Footer.tsx',
      'src/components/admin/CustomersView.tsx', 'src/components/admin/ActiveCartsView.tsx', 'src/components/admin/SellersView.tsx',
      'src/components/admin/cms/CMSFooterTab.tsx', 'src/components/admin/cms/CMSProductDetailTab.tsx',
    ];
    for (const file of files) {
      const text = fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');
      expect(text, file).not.toMatch(/<(MessageCircle|Instagram|Facebook)\b/);
    }
  });
});

describe('the labelled WhatsApp button', () => {
  const css = fs.readFileSync(path.resolve(process.cwd(), 'src/index.css'), 'utf8');

  it('keeps its readable colours and gains a brand ring on hover, never when disabled', () => {
    expect(css).toMatch(/\.social-pill:not\(:disabled\):hover/);
    expect(css).toContain('.social-pill[data-brand="whatsapp"] { --brand:#25D366; }');
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*\.social-pill:not\(:disabled\):hover[\s\S]*transform:none/);
  });

  it('no footer rule is left from the old hover treatments', () => {
    expect(css).not.toContain('.social-link');
    expect(css).not.toContain('data-glyph');
  });
});
