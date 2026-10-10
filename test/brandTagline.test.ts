import { describe, it, expect } from 'vitest';
import { brandTagline } from '../src/lib/brandTagline';

// The Brand Tagline / Subtitle fields in Admin > CMS Studio > Navbar saved, but nothing on the store read them.
describe('the tagline under the brand name', () => {
  const navbar = { brandSubtitle: 'Lebanese Artisanal Marketplace', brandSubtitleArabic: 'السوق اللبناني للحرف والمنتجات الأصيلة' };

  it('is the English tagline for English and the Arabic one for Arabic', () => {
    expect(brandTagline(navbar, 'en')).toBe('Lebanese Artisanal Marketplace');
    expect(brandTagline(navbar, 'ar')).toBe('السوق اللبناني للحرف والمنتجات الأصيلة');
  });

  it('shows the English tagline to Arabic visitors when there is no Arabic one', () => {
    expect(brandTagline({ brandSubtitle: 'Lebanese Artisanal Marketplace' }, 'ar')).toBe('Lebanese Artisanal Marketplace');
    expect(brandTagline({ brandSubtitle: 'Lebanese Artisanal Marketplace', brandSubtitleArabic: '   ' }, 'ar')).toBe('Lebanese Artisanal Marketplace');
  });

  it('does not show the Arabic tagline to English visitors when the English one is cleared', () => {
    expect(brandTagline({ brandSubtitle: '', brandSubtitleArabic: 'السوق' }, 'en')).toBe('');
  });

  it('is empty (nothing is drawn) when it is cleared, blank, missing or not text', () => {
    for (const value of [undefined, null, {}, { brandSubtitle: '' }, { brandSubtitle: '   \n ' }, { brandSubtitle: 42 as unknown as string }]) {
      expect(brandTagline(value as never, 'en'), JSON.stringify(value)).toBe('');
      expect(brandTagline(value as never, 'ar'), JSON.stringify(value)).toBe('');
    }
  });

  it('trims, and turns line breaks and runs of spaces into one space, so a stray Enter cannot make a tall header', () => {
    expect(brandTagline({ brandSubtitle: '  Lebanese\n\nArtisanal   Marketplace \n' }, 'en')).toBe('Lebanese Artisanal Marketplace');
  });

  it('treats any language other than Arabic as English', () => {
    expect(brandTagline(navbar, 'fr')).toBe('Lebanese Artisanal Marketplace');
  });
});
