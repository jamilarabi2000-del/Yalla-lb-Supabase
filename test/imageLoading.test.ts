import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { imageSrcSet, responsiveImage } from '../src/lib/responsiveImage';

// The banner is the first thing a visitor sees: it now loads first, and only
// the version for the visitor's screen is downloaded (a hidden <img> still
// downloads, so phones used to fetch the desktop photo too). Images further
// down wait until they are scrolled near, and where a photo exists in several
// widths the browser picks the one the screen needs. Checked in real
// Chromium: a 390 px phone downloaded only the phone photo, at 960 px; a
// desktop only the desktop one; rotating a tablet swapped them.
const read = (f: string) => fs.readFileSync(path.resolve(process.cwd(), f), 'utf8');
const S = 'https://yjmpjuskgbbshrvhgmys.supabase.co/storage/v1/object/public/yalla-media/cms/2026/09/abc';

describe('which widths the browser is offered', () => {
  it('Storage uploads: the widths listed after #w=', () => {
    expect(imageSrcSet(`${S}-1600.webp#w=480,960,1600`))
      .toBe(`${S}-480.webp 480w, ${S}-960.webp 960w, ${S}-1600.webp 1600w`);
    expect(imageSrcSet(`${S}-1440.jpg#w=480,960,1440`))
      .toBe(`${S}-480.jpg 480w, ${S}-960.jpg 960w, ${S}-1440.jpg 1440w`);
  });

  it('Unsplash: resized on request, other settings kept', () => {
    const set = imageSrcSet('https://images.unsplash.com/photo-1?auto=format&fit=crop&q=80&w=2000')!;
    expect(set.split(', ')).toEqual([
      'https://images.unsplash.com/photo-1?auto=format&fit=crop&q=80&w=480 480w',
      'https://images.unsplash.com/photo-1?auto=format&fit=crop&q=80&w=960 960w',
      'https://images.unsplash.com/photo-1?auto=format&fit=crop&q=80&w=1600 1600w',
    ]);
    expect(imageSrcSet('https://images.unsplash.com/photo-2')).toContain('photo-2?w=480&auto=format 480w');
  });

  it('one-size images get none', () => {
    for (const url of [
      'https://i.ibb.co/abc/logo.png',
      `${S}-1600.webp`,                       // no widths listed
      `${S}-300.webp#w=300`,                  // only one
      `${S}-1600.webp#w=480,960`,             // the widest is not listed
      `http://127.0.0.1:54321/storage/v1/object/public/yalla-media/cms/a-1600.webp#w=480,1600`,
      'http://images.unsplash.com/photo-1',
      '/assets/raouche-abc.webp', 'data:image/webp;base64,AAAA', '', null, undefined,
    ]) expect(imageSrcSet(url), String(url)).toBeUndefined();
  });

  it('sizes only ever comes with a srcset', () => {
    expect(responsiveImage('https://i.ibb.co/x.png', '100vw')).toEqual({});
    expect(responsiveImage(`${S}-1600.webp#w=480,1600`, '100vw')).toEqual({ srcSet: `${S}-480.webp 480w, ${S}-1600.webp 1600w`, sizes: '100vw' });
  });
});

describe('the banner loads first', () => {
  const hero = read('src/components/HomeTopContainer.tsx');

  it('renders only the version for this screen', () => {
    expect(hero).toContain("const isDesktop = useMediaQuery('(min-width: 768px)');");
    expect(hero).toMatch(/\{!isDesktop && \(\s+<div className="w-full h-full block md:hidden relative">/);
    expect(hero).toMatch(/\{isDesktop && \(\s+<div className="w-full h-full hidden md:block relative">/);
  });

  it('puts the banner photo first in line, in the size the screen needs', () => {
    expect(hero.match(/fetchPriority="high"/g)).toHaveLength(2);
    expect(hero).toContain("{...responsiveImage(currentSlide.mobileUrl || currentSlide.url, '100vw')}");
    expect(hero).toContain('{...responsiveImage(currentSlide.url, heroSizes)}');
  });

  it('a broken banner photo still falls back to the built-in one', () => {
    // With a srcset present, changing src alone would not change the picture.
    expect(hero.match(/e\.currentTarget\.removeAttribute\('srcset'\);\s+e\.currentTarget\.src = raoucheSunsetImg;/g)).toHaveLength(2);
    const promo = read('src/components/HomepagePromoSlider.tsx');
    expect(promo.match(/e\.currentTarget\.removeAttribute\('srcset'\);\s+e\.currentTarget\.src = 'https:\/\/images\.unsplash\.com/g)).toHaveLength(2);
  });
});

describe('everything else waits until it is near', () => {
  const EXCLUDE = /[\\/]admin[\\/]|[\\/](AdminView|PageCMSManager|AdminQuickEditor|TextStyleEditor|AdminGuard|SellerDashboard|HeroBanner)\.tsx$/;
  const walk = (dir: string): string[] => fs.readdirSync(path.resolve(process.cwd(), dir), { withFileTypes: true })
    .flatMap(e => e.isDirectory() ? walk(`${dir}/${e.name}`) : e.name.endsWith('.tsx') ? [`${dir}/${e.name}`] : []);

  it('only first-screen and opened-on-request images load at once', () => {
    const eager: string[] = [];
    for (const file of walk('src/components').filter(f => !EXCLUDE.test(f))) {
      for (const tag of read(file).match(/<img\b[\s\S]*?\/>/g) ?? []) {
        if (!/loading="lazy"/.test(tag)) eager.push(`${path.basename(file)} ${/src=\{([^}]*)\}/.exec(tag)?.[1]}`);
      }
    }
    expect(eager.sort()).toEqual([
      // The banner (backdrop and photo), for the phone and for wider screens.
      'HomeTopContainer.tsx currentSlide.mobileUrl || currentSlide.url || raoucheSunsetImg',
      'HomeTopContainer.tsx currentSlide.mobileUrl || currentSlide.url || raoucheSunsetImg',
      'HomeTopContainer.tsx currentSlide.url || raoucheSunsetImg',
      'HomeTopContainer.tsx currentSlide.url || raoucheSunsetImg',
      // The promo panel beside the banner.
      'HomepagePromoSlider.tsx slide.imageUrl',
      'HomepagePromoSlider.tsx slide.imageUrl',
      'HomepagePromoSlider.tsx slide.imageUrl || selectedProduct.image',
      // The header.
      'Navbar.tsx authUser.photoURL',
      'Navbar.tsx siteContent?.navbar?.logoUrl || systemLogo',
      // The news article a shopper opened.
      'NewsSection.tsx selectedNews.image',
      'NewsSection.tsx selectedNews.image',
      // The product page's main photo.
      'ProductDetailView.tsx images[activeImage]',
    ].sort());
  });

  it('the product page\'s main photo comes first there', () => {
    expect(read('src/components/ProductDetailView.tsx')).toMatch(/<img src=\{images\[activeImage\]\} \{\.\.\.responsiveImage\(images\[activeImage\], '\(min-width: 1024px\) 50vw, 100vw'\)\} fetchPriority="high"/);
  });

  it('product cards offer the size their column needs', () => {
    expect(read('src/components/ProductCard.tsx')).toContain("{...responsiveImage(product.image, '(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw')}");
  });
});
