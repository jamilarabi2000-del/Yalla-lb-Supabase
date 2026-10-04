import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { TEXT_FONTS } from '../src/lib/textStyleRules';
import { PRELOADED_FONTS, fontPreload, fontPreloadTags } from '../scripts/fontPreload.mjs';

// The six font families loaded from one render-blocking stylesheet on Google's
// servers: nothing painted until a third-party host had answered. They are now
// served from this site (src/fonts.css and src/assets/fonts), under their
// ORIGINAL names, because those names are what Style Text, the theme picker and
// the CSS font stacks use.
const root = process.cwd();
const read = (f: string) => fs.readFileSync(path.resolve(root, f), 'utf8');
const css = read('src/fonts.css');

interface Face { family: string; style: string; weight: string; display: string; file: string; range: string }
const faces: Face[] = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(m => {
  const field = (name: string) => new RegExp(`${name}:\\s*([^;]+);`).exec(m[1])?.[1].trim() ?? '';
  return {
    family: field('font-family').replace(/['"]/g, ''),
    style: field('font-style'),
    weight: field('font-weight'),
    display: field('font-display'),
    file: /url\('\.\/assets\/fonts\/([^']+)'\)/.exec(m[1])?.[1] ?? '',
    range: field('unicode-range'),
  };
});
const FAMILIES = ['Plus Jakarta Sans', 'Playfair Display', 'Inter', 'Tajawal', 'Cairo', 'Amiri'];
const covers = (weight: string, wanted: number) => {
  const [lo, hi] = weight.split(/\s+/).map(Number);
  return wanted >= lo && wanted <= (hi ?? lo);
};

describe('nothing is loaded from Google any more', () => {
  it('the page has no link to a font host and no connection hint for one', () => {
    const html = read('index.html');
    expect(html).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
    expect(html).not.toMatch(/<link[^>]+rel="stylesheet"/);
  });

  it('the Content-Security-Policy no longer lets the page use Google\'s font hosts, in either header rule', () => {
    const vercel = JSON.parse(read('vercel.json'));
    const policies = vercel.headers.flatMap((rule: any) => rule.headers).filter((h: any) => h.key === 'Content-Security-Policy').map((h: any) => h.value as string);
    expect(policies).toHaveLength(2);
    for (const policy of policies) {
      expect(policy).not.toMatch(/googleapis|gstatic/);
      expect(policy).toContain("font-src 'self' data:;");
      expect(policy).toContain("style-src 'self' 'unsafe-inline';");
    }
    // the two rules still differ only in who may frame the page
    expect(policies[0].replace(/frame-ancestors [^;]+;/, '')).toBe(policies[1].replace(/frame-ancestors [^;]+;/, ''));
  });

  it('no source file points at the Google font hosts', () => {
    const walk = (dir: string): string[] => fs.readdirSync(path.resolve(root, dir), { withFileTypes: true })
      .flatMap(e => e.isDirectory() ? walk(`${dir}/${e.name}`) : /\.(tsx?|css|html)$/.test(e.name) ? [`${dir}/${e.name}`] : []);
    for (const file of [...walk('src'), 'index.html']) expect(read(file), file).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
  });
});

describe('the font rules', () => {
  it('declare the six original family names, and only those', () => {
    expect([...new Set(faces.map(f => f.family))]).toEqual(FAMILIES);
  });

  it('cover every family the theme picker and Style Text offer', () => {
    for (const font of TEXT_FONTS) expect(FAMILIES, font.label).toContain(font.label);
    expect(TEXT_FONTS.map(f => f.label)).toEqual(FAMILIES);
    const app = read('src/App.tsx');
    for (const name of FAMILIES) expect(app, name).toContain(`"${name}"`);
  });

  it('show text in the fallback font straight away', () => {
    expect(faces.length).toBeGreaterThan(0);
    for (const face of faces) expect(face.display, face.file).toBe('swap');
  });

  it('keep every weight the Google link asked for', () => {
    const wanted: Record<string, { style: string; weights: number[] }[]> = {
      'Plus Jakarta Sans': [{ style: 'normal', weights: [300, 400, 500, 600, 700, 800] }],
      'Playfair Display': [{ style: 'normal', weights: [600, 700] }, { style: 'italic', weights: [600] }],
      Inter: [{ style: 'normal', weights: [400, 500, 600, 700] }],
      Tajawal: [{ style: 'normal', weights: [400, 500, 700] }],
      Cairo: [{ style: 'normal', weights: [400, 600, 700] }],
      Amiri: [{ style: 'normal', weights: [400, 700] }],
    };
    for (const [family, groups] of Object.entries(wanted)) {
      for (const { style, weights } of groups) {
        for (const weight of weights) {
          for (const script of family === 'Tajawal' || family === 'Cairo' || family === 'Amiri' ? ['latin', 'arabic'] : ['latin']) {
            const hit = faces.some(f => f.family === family && f.style === style && f.file.includes(`-${script}-`) && covers(f.weight, weight));
            expect(hit, `${family} ${style} ${weight} ${script}`).toBe(true);
          }
        }
      }
    }
  });

  it('give each script its own file, with the right characters', () => {
    for (const face of faces) {
      if (face.file.includes('-latin-ext-')) expect(face.range, face.file).toMatch(/^U\+0100-/);
      else if (face.file.includes('-latin-')) expect(face.range, face.file).toMatch(/^U\+0000-00FF,/);
      else if (face.file.includes('-arabic-')) expect(face.range, face.file).toMatch(/^U\+0600-06FF,/);
      else throw new Error(`unexpected script in ${face.file}`);
    }
    for (const family of FAMILIES) {
      expect(faces.some(f => f.family === family && f.file.includes('-latin-') && !f.file.includes('-latin-ext-')), `${family} latin`).toBe(true);
    }
    for (const family of ['Tajawal', 'Cairo', 'Amiri']) {
      expect(faces.some(f => f.family === family && f.file.includes('-arabic-')), `${family} arabic`).toBe(true);
    }
  });

  it('no two rules use the same file for the same weight, and none is left without a rule', () => {
    const seen = new Set<string>();
    for (const face of faces) {
      const key = `${face.family}|${face.style}|${face.weight}|${face.file}`;
      expect(seen.has(key), key).toBe(false);
      seen.add(key);
    }
    const onDisk = fs.readdirSync(path.resolve(root, 'src/assets/fonts')).filter(n => n.endsWith('.woff2')).sort();
    expect([...new Set(faces.map(f => f.file))].sort()).toEqual(onDisk);
  });

  it('point at real WOFF2 files', () => {
    for (const face of faces) {
      const file = path.resolve(root, 'src/assets/fonts', face.file);
      expect(fs.existsSync(file), face.file).toBe(true);
      const bytes = fs.readFileSync(file);
      expect(bytes.subarray(0, 4).toString('latin1'), face.file).toBe('wOF2');
      expect(bytes.length, face.file).toBeGreaterThan(5000);
    }
  });

  it('are in the stylesheet every page loads', () => {
    expect(read('src/index.css')).toMatch(/^@import "tailwindcss";\n@import "\.\/fonts\.css";/);
  });
});

describe('licences', () => {
  it('each family\'s SIL Open Font License is kept with the files, and the README says where they came from', () => {
    for (const slug of ['plus-jakarta-sans', 'playfair-display', 'inter', 'tajawal', 'cairo', 'amiri']) {
      expect(read(`src/assets/fonts/licenses/${slug}.txt`), slug).toMatch(/SIL OPEN FONT LICENSE Version 1\.1/i);
    }
    const readme = read('src/assets/fonts/README.md');
    expect(readme).toContain('SIL Open Font License 1.1');
    for (const face of faces) expect(readme, face.file).toContain(face.file);
  });
});

describe('the preload of the font every page draws at once', () => {
  const build = [
    'assets/main-BGCVn3QY.css',
    'assets/plus-jakarta-sans-latin-wght-normal-eXO_dkmS.woff2',
    'assets/plus-jakarta-sans-latin-ext-wght-normal-DmpS2jIq.woff2',
    'assets/playfair-display-latin-wght-normal-BOwq7MWX.woff2',
    'assets/playfair-display-latin-wght-italic-DmbndNpe.woff2',
    'assets/cairo-arabic-wght-normal-CJWMIGCx.woff2',
    'assets/inter-latin-wght-normal-Dx4kXJAl.woff2',
  ];

  it('is a link, as a font, with crossorigin, using the hashed name', () => {
    expect(fontPreloadTags(build)).toEqual([
      { tag: 'link', attrs: { rel: 'preload', as: 'font', type: 'font/woff2', crossorigin: '', href: '/assets/playfair-display-latin-wght-normal-BOwq7MWX.woff2' }, injectTo: 'head' },
    ]);
  });

  it('is only for the Latin heading font: the body text is in the system font, so nothing is preloaded that no text is drawn in', () => {
    expect(PRELOADED_FONTS).toHaveLength(1);
    const hrefs = fontPreloadTags(build).map(t => t.attrs.href);
    for (const href of hrefs) expect(href).not.toMatch(/plus-jakarta|latin-ext|italic|arabic|inter|cairo|tajawal|amiri/);
    // the reason it is true: the app's root element sets the system font stack over the body's font
    expect(read('src/App.tsx')).toMatch(/className="min-h-screen flex flex-col[^"]*\bfont-sans\b/);
  });

  it('follows the site\'s base address', () => {
    expect(fontPreloadTags(build, '/store').map(t => t.attrs.href)[0]).toBe('/store/assets/playfair-display-latin-wght-normal-BOwq7MWX.woff2');
  });

  it('adds nothing when the files are not in the build', () => {
    expect(fontPreloadTags(['assets/main.css', 'assets/main.js'])).toEqual([]);
  });

  it('is part of the build, and leaves the page alone when there is nothing to add', () => {
    expect(read('vite.config.ts')).toMatch(/plugins: \[[^\]]*\bfontPreload\(\)[^\]]*\]/);
    const plugin = fontPreload() as any;
    expect(plugin.apply).toBe('build');
    expect(plugin.transformIndexHtml.order).toBe('post');
    expect(plugin.transformIndexHtml.handler('<html></html>', { bundle: {} })).toBe('<html></html>');
    const withFonts = plugin.transformIndexHtml.handler('<html></html>', { bundle: Object.fromEntries(build.map(n => [n, {}])) });
    expect(withFonts.tags).toHaveLength(1);
  });
});
