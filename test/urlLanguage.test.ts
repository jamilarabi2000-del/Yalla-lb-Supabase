import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { addressWithLanguage, languageFromSearch } from '../src/lib/urlLanguage';

// The language button did nothing on addresses that carry ?lang=ar or
// ?lang=en (links people share, and the CMS preview's own address): the page
// applied the address's language again each time the shop context handed out
// a new setLanguage, which it did after every language change. Seen in
// Chromium on a phone and a desktop: before and after the click, still the
// same language. Now the address picks the language once, when the page opens.
const read = (f: string) => fs.readFileSync(path.resolve(process.cwd(), f), 'utf8');

describe('which language an address asks for', () => {
  it('?lang=ar and ?lang=en', () => {
    expect(languageFromSearch('?lang=ar')).toBe('ar');
    expect(languageFromSearch('?search=soap&lang=en&x=1')).toBe('en');
    expect(languageFromSearch('lang=ar')).toBe('ar');
  });

  it('nothing else', () => {
    for (const search of ['', '?', '?lang=', '?lang=fr', '?lang=AR', '?lang=ar,en', '?language=ar', '?cmsPreview=1', '?lang[]=ar']) {
      expect(languageFromSearch(search), search).toBeNull();
    }
  });
});

describe('keeping the address in step with the visitor\'s choice', () => {
  const base = 'https://shop.example';

  it('rewrites an existing ?lang= and keeps everything else', () => {
    expect(addressWithLanguage(`${base}/products?search=soap&lang=ar&page=2#top`, 'en'))
      .toBe(`${base}/products?search=soap&lang=en&page=2#top`);
    expect(addressWithLanguage(`${base}/?lang=en`, 'ar')).toBe(`${base}/?lang=ar`);
  });

  it('leaves an address alone when it has no ?lang= or already says so', () => {
    expect(addressWithLanguage(`${base}/products?search=soap`, 'ar')).toBeNull();
    expect(addressWithLanguage(`${base}/`, 'en')).toBeNull();
    expect(addressWithLanguage(`${base}/?lang=ar`, 'ar')).toBeNull();
  });

  it('replaces an unusable ?lang= value with the choice', () => {
    expect(addressWithLanguage(`${base}/?lang=fr`, 'en')).toBe(`${base}/?lang=en`);
    expect(addressWithLanguage(`${base}/?lang=`, 'ar')).toBe(`${base}/?lang=ar`);
  });
});

describe('the page uses it once, and setLanguage keeps one identity', () => {
  const app = read('src/App.tsx');
  const ctx = read('src/context/ShopContext.tsx');

  it('App applies the address language in an effect that runs only on mount', () => {
    expect(app).toMatch(/useEffect\(\(\) => \{\s+const fromAddress = languageFromSearch\(window\.location\.search\);\s+if \(fromAddress\) setLanguage\(fromAddress\);\s+\}, \[\]\);/);
  });

  it('the effect that depends on context functions no longer touches the language', () => {
    const effect = app.slice(app.indexOf('completeEmailLinkSignIn().catch'), app.indexOf('A link\'s ?lang= chooses the language once'));
    expect(effect).toContain('}, [completeEmailLinkSignIn]);');
    expect(effect).not.toContain('setLanguage');
    expect(app).not.toMatch(/\[setLanguage, completeEmailLinkSignIn\]/);
  });

  it('setLanguage is memoised with no dependencies', () => {
    expect(ctx).toMatch(/const setLanguage = useCallback\(\(lang: Language\) => \{[\s\S]*?\n  \}, \[\]\);/);
  });

  it('the first render still takes the language from the address, then from the last visit', () => {
    expect(ctx).toContain('const fromAddress = languageFromSearch(window.location.search);');
    expect(ctx).toContain("const saved = localStorage.getItem('yallalb_language');");
  });

  it('a CMS preview never saves its language or rewrites its address', () => {
    const body = ctx.slice(ctx.indexOf('const setLanguage = useCallback'), ctx.indexOf('}, [])', ctx.indexOf('const setLanguage = useCallback')));
    expect(body).toMatch(/if \(!isCmsPreview\) \{[\s\S]*localStorage\.setItem\('yallalb_language', lang\);[\s\S]*addressWithLanguage[\s\S]*\}/);
  });
});
