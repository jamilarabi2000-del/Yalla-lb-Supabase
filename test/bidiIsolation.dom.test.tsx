// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import fs from 'node:fs';
import path from 'node:path';

// In Arabic pages the browser reorders what it cannot place: "+961 70 889 234"
// showed as "889 234 70 961+", "-19%" as "19%-". Seen in Chromium on the
// footer, the support card and the product badges. Phone numbers, email
// addresses and signed percentages are now isolated left to right.
const shop: Record<string, any> = {};
vi.mock('../src/context/ShopContext', () => ({ useShop: () => shop }));

const { Footer } = await import('../src/components/Footer');
const { AccountSupportCard } = await import('../src/components/AccountSupportCard');
const { Ltr } = await import('../src/components/ui/Ltr');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PHONE = '+961 70 889 234';
const EMAIL = 'concierge@yalla.lb';
let host: HTMLDivElement;
let root: Root;
const show = (node: React.ReactElement) => act(() => { root.render(node); });
const isolated = (text: string) => [...host.querySelectorAll('bdi[dir="ltr"]')].filter(el => el.textContent === text);

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  for (const key of Object.keys(shop)) delete shop[key];
  Object.assign(shop, {
    language: 'ar',
    isVisualEditMode: false,
    siteContent: {
      visibility: { footerAbout: true, footerContact: true, footerSocial: true, footerCopyright: true, phoneSupport: true, accountSupportCard: true },
      footer: { phone: PHONE, email: EMAIL, address: 'Gournaud Street, Beirut', addressArabic: 'شارع غورو، بيروت', hours: 'Mon - Sat: 9:00 - 19:00', hoursArabic: 'الإثنين - السبت: 9:00 - 19:00' },
      socialLinks: {},
    },
  });
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = '';
});

describe('the footer in Arabic', () => {
  it('shows the phone number and the email address as isolated left-to-right text', () => {
    show(<Footer />);
    expect(isolated(PHONE)).toHaveLength(1);
    expect(isolated(EMAIL)).toHaveLength(1);
    // inside the links, so tapping still dials and writes
    expect(isolated(PHONE)[0].closest('a')?.getAttribute('href')).toBe(`tel:${PHONE}`);
    expect(isolated(EMAIL)[0].closest('a')?.getAttribute('href')).toBe(`mailto:${EMAIL}`);
  });

  it('lets the address and the hours take the direction of their own text', () => {
    show(<Footer />);
    const free = [...host.querySelectorAll('span[dir="auto"]')].map(el => el.textContent);
    expect(free).toEqual(['شارع غورو، بيروت', 'الإثنين - السبت: 9:00 - 19:00']);
  });

  it('is the same in English', () => {
    shop.language = 'en';
    show(<Footer />);
    expect(isolated(PHONE)).toHaveLength(1);
    expect(isolated(EMAIL)).toHaveLength(1);
  });
});

describe('the Account support card in Arabic', () => {
  it('isolates the phone number and the email address', () => {
    shop.siteContent.socialDisplay = { order: ['phone', 'email'] };
    show(<AccountSupportCard />);
    expect(isolated(PHONE)).toHaveLength(1);
    expect(isolated(EMAIL)).toHaveLength(1);
  });
});

describe('the isolation component', () => {
  it('is an inline element that forces left to right', () => {
    show(<Ltr className="x">-19%</Ltr>);
    const el = host.querySelector('bdi')!;
    expect(el.getAttribute('dir')).toBe('ltr');
    expect(el.className).toBe('x');
    expect(el.textContent).toBe('-19%');
  });
});

describe('no storefront text that needs it is left unisolated', () => {
  const read = (f: string) => fs.readFileSync(path.resolve(process.cwd(), f), 'utf8');
  const walk = (dir: string): string[] => fs.readdirSync(path.resolve(process.cwd(), dir), { withFileTypes: true })
    .flatMap(e => e.isDirectory() ? walk(`${dir}/${e.name}`) : e.name.endsWith('.tsx') ? [`${dir}/${e.name}`] : []);
  const storefront = walk('src/components')
    .filter(f => !/[\\/]admin[\\/]|[\\/](AdminView|PageCMSManager|AdminQuickEditor|TextStyleEditor|AdminGuard|SellerDashboard|HeroBanner)\.tsx$/.test(f));

  it('a "+961" prefix is always inside <Ltr>', () => {
    for (const file of storefront) {
      for (const line of read(file).split('\n')) {
        if (/>\s*\+961\s*</.test(line)) expect(line, file).toMatch(/<Ltr>\s*\+961\s*<\/Ltr>/);
      }
    }
  });

  it('a signed percentage badge (-{n}%) is always inside <Ltr>', () => {
    let seen = 0;
    for (const file of storefront) {
      for (const match of read(file).matchAll(/[^\n]*>\s*-\{[^}]+\}%\s*<[^\n]*/g)) {
        seen++;
        expect(match[0], file).toMatch(/<Ltr>-\{[^}]+\}%<\/Ltr>/);
      }
    }
    expect(seen).toBeGreaterThanOrEqual(2);
  });

  it('the footer and the support card put phone and email inside <Ltr>', () => {
    const footer = read('src/components/Footer.tsx');
    expect(footer).toContain('<Ltr>{footerData.phone}</Ltr>');
    expect(footer).toContain('<Ltr>{footerData.email}</Ltr>');
    const card = read('src/components/AccountSupportCard.tsx');
    expect(card).toContain('<Ltr>{phone}</Ltr>');
    expect(card).toContain('<Ltr>{email}</Ltr>');
  });

  it('emails shown inside Account and Checkout sentences are isolated', () => {
    const account = read('src/components/AccountView.tsx');
    expect(account).toContain('(<Ltr>{firebaseUser.email}</Ltr>)');
    expect(account).toContain('<bdi>{firebaseUser.displayName || firebaseUser.email}</bdi>');
    expect(read('src/components/CheckoutView.tsx')).toContain('<Ltr>{authUser.email || user.email}</Ltr>');
  });
});
