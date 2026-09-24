// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRoot, type Root } from 'react-dom/client';
import { DEFAULT_SITE_CONTENT } from '../src/data/cmsContent';

// Social links carry each brand's own mark and light up in the brand's own
// colour on hover. The shop context is large; these components read a few
// fields of it.
const shop: Record<string, unknown> = {};
vi.mock('../src/context/ShopContext', () => ({ useShop: () => shop }));

const { SOCIAL_BRANDS, INSTAGRAM_GRADIENT } = await import('../src/components/ui/BrandIcon');
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
  const links = () => Array.from(host.querySelectorAll<HTMLAnchorElement>('a.social-link'));

  it('uses the brand marks, not generic icons', () => {
    render({}, <Footer />);
    expect(links().map(a => a.dataset.brand)).toEqual(['instagram', 'whatsapp', 'facebook']);
    for (const a of links()) {
      expect(a.querySelector(`svg[data-brand-icon="${a.dataset.brand}"]`), a.dataset.brand).not.toBeNull();
      expect(a.getAttribute('aria-label')).toBe(SOCIAL_BRANDS[a.dataset.brand as keyof typeof SOCIAL_BRANDS].title);
    }
    expect(host.querySelector('.lucide-instagram, .lucide-facebook, .lucide-message-circle')).toBeNull();
  });

  it('shows TikTok, YouTube and X only once the admin adds their links', () => {
    render({ tiktok: 'https://www.tiktok.com/@yalla.lb', youtube: '', x: 'javascript:alert(1)' }, <Footer />);
    expect(links().map(a => a.dataset.brand)).toEqual(['instagram', 'whatsapp', 'facebook', 'tiktok']);
    expect(host.querySelector<HTMLAnchorElement>('a[data-brand="tiktok"]')!.href).toBe('https://www.tiktok.com/@yalla.lb');
  });
});

describe('the Instagram icon', () => {
  const css = fs.readFileSync(path.resolve(process.cwd(), 'src/index.css'), 'utf8');
  const gradient = 'radial-gradient(circle at 30% 107%, #fdf497 0%, #fdf497 5%, #fd5949 45%, #d6249f 60%, #285AEB 90%)';

  it('rests as the Instagram gradient tile with a white glyph', () => {
    expect(css).toContain(`.social-link.instagram { background:${gradient}; color:#fff; border-color:transparent; border-radius:20%; }`);
    render({}, <Footer />);
    const link = host.querySelector<HTMLAnchorElement>('a[data-brand="instagram"]')!;
    expect(link.classList.contains('instagram')).toBe(true);
  });

  it('on hover clears the tile, fills the glyph with the same gradient and grows it', () => {
    expect(css).toMatch(/\.social-link\.instagram:hover, \.social-link\.instagram:focus-visible \{ background:transparent;[^}]*transform:scale\(1\.5\); \}/);
    expect(css).toMatch(/\.social-link\.instagram:hover \[data-glyph="gradient"\][^{]*\{ opacity:1; \}/);
    expect(css).toMatch(/\.social-link\.instagram:hover \[data-glyph="solid"\][^{]*\{ opacity:0; \}/);

    render({}, <Footer />);
    const svg = host.querySelector('a[data-brand="instagram"] svg')!;
    const def = svg.querySelector('radialGradient')!;
    expect(def.getAttribute('cx')).toBe('0.3');
    expect(def.getAttribute('cy')).toBe('1.07');
    expect([...def.querySelectorAll('stop')].map(s => [Number(s.getAttribute('offset')), s.getAttribute('stop-color')]))
      .toEqual(INSTAGRAM_GRADIENT.map(([o, c]) => [o, c]));
    // The same stops as the CSS tile, so hovering moves the colours, not changes them.
    for (const [offset, color] of INSTAGRAM_GRADIENT) expect(gradient).toContain(`${color} ${offset * 100}%`);
    const glyph = svg.querySelector('[data-glyph="gradient"]')!;
    expect(glyph.getAttribute('fill')).toBe(`url(#${def.id})`);
    expect(glyph.getAttribute('opacity')).toBe('0'); // until hovered
    expect(svg.querySelector('[data-glyph="solid"]')).not.toBeNull();
  });

  it('keeps still for reduced motion', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*\.social-link\.instagram:hover, \.social-link\.instagram:focus-visible \{ transform:none; \}/);
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

describe('the hover highlight', () => {
  const css = fs.readFileSync(path.resolve(process.cwd(), 'src/index.css'), 'utf8');

  it('fills each icon link with its brand colour on hover and keyboard focus', () => {
    expect(css).toMatch(/\.social-link:hover, \.social-link:focus-visible \{[^}]*background:var\(--brand-fill, var\(--brand\)\)/);
    for (const brand of Object.keys(SOCIAL_BRANDS)) {
      expect(css, brand).toMatch(new RegExp(`\\.social-link\\[data-brand="${brand}"\\] \\{ --brand:`));
    }
  });

  it('keeps the highlight off disabled buttons and still for reduced motion', () => {
    expect(css).toMatch(/\.social-pill:not\(:disabled\):hover/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*\.social-pill:not\(:disabled\):hover[\s\S]*transform:none/);
  });
});
