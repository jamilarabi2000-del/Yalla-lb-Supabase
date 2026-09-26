import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('../src/lib/supabase', () => ({ supabase: {} }));
import {
  dataUrlToBlob, findPastedImages, formatBytes, mediaPath, replaceStrings, targetWidths, withWidths,
} from '../src/lib/mediaUpload';
import { isSafeImageUrl } from '../src/lib/safeUrl';

// The two hero photos were pasted into the site settings as text: 158 kB of
// the 180 kB every visitor downloaded before the page filled in. Uploads are
// now saved as files in Storage, in up to three widths, and the settings keep
// only the address. A browser check (real Chromium, fake Storage) covered the
// resizing, the upload requests and the CMS button end to end.
const read = (f: string) => fs.readFileSync(path.resolve(process.cwd(), f), 'utf8');

describe('the widths saved for an upload', () => {
  it('keeps the image\'s own width, capped, plus clearly smaller steps', () => {
    expect(targetWidths(3000)).toEqual([480, 960, 1600]);
    expect(targetWidths(1440)).toEqual([480, 960, 1440]);
    expect(targetWidths(1000)).toEqual([480, 1000]);
    expect(targetWidths(700)).toEqual([480, 700]);
    expect(targetWidths(300)).toEqual([300]);
    // The tab icon and the logo: one or two files, never near-duplicates.
    expect(targetWidths(2000, 256)).toEqual([256]);
    expect(targetWidths(2000, 800)).toEqual([480, 800]);
    expect(targetWidths(2000, 1200)).toEqual([480, 1200]);
  });

  it('names files by month and width, and lists the widths after #w=', () => {
    const now = new Date(Date.UTC(2026, 8, 26));
    expect(mediaPath('cms', 'abc', 960, 'webp', now)).toBe('cms/2026/09/abc-960.webp');
    expect(mediaPath('cms', 'abc', null, 'jpg', now)).toBe('cms/2026/09/abc.jpg');
    expect(withWidths('https://x.supabase.co/storage/v1/object/public/yalla-media/cms/2026/09/abc-1600.webp', [480, 960, 1600]))
      .toBe('https://x.supabase.co/storage/v1/object/public/yalla-media/cms/2026/09/abc-1600.webp#w=480,960,1600');
  });

  it('the storefront\'s safe-image check accepts these addresses', () => {
    expect(isSafeImageUrl('https://yjmpjuskgbbshrvhgmys.supabase.co/storage/v1/object/public/yalla-media/cms/2026/09/abc-1600.webp#w=480,960,1600')).toBe(true);
  });

  it('formats sizes for the upload note', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(900)).toBe('900 B');
    expect(formatBytes(45172)).toBe('44.1 KB');
    expect(formatBytes(1706967)).toBe('1.6 MB');
  });
});

describe('moving pasted photos out of the settings', () => {
  const tiny = 'data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==';
  const content = {
    hero: { bgImageUrl: 'https://images.unsplash.com/photo-1?w=1200', bgMediaItems: [{ url: tiny, mobileUrl: tiny }, { url: 'https://i.ibb.co/a.png' }] },
    navbar: { logoUrl: 'data:image/png;base64,iVBORw0KGgo=' },
    footer: { text: 'data: not an image' },
  };

  it('finds every distinct pasted image, and only those', () => {
    expect(findPastedImages(content)).toEqual([tiny, 'data:image/png;base64,iVBORw0KGgo=']);
    expect(findPastedImages({ a: 'https://x/y.webp', b: [1, null, true] })).toEqual([]);
  });

  it('swaps each for its new address everywhere, without touching the original', () => {
    const moved = new Map([[tiny, 'https://s/cms/a-1440.webp#w=480,960,1440']]);
    const next = replaceStrings(content, moved);
    expect(next.hero.bgMediaItems[0]).toEqual({ url: 'https://s/cms/a-1440.webp#w=480,960,1440', mobileUrl: 'https://s/cms/a-1440.webp#w=480,960,1440' });
    expect(next.hero.bgMediaItems[1]).toEqual({ url: 'https://i.ibb.co/a.png' });
    expect(next.navbar.logoUrl).toBe('data:image/png;base64,iVBORw0KGgo=');
    expect(content.hero.bgMediaItems[0].url).toBe(tiny);
  });

  it('decodes a pasted image to its bytes without fetch (the CSP blocks data: fetches)', async () => {
    const blob = dataUrlToBlob(tiny);
    expect(blob.type).toBe('image/webp');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...bytes.slice(8, 12))).toBe('WEBP');
    expect(() => dataUrlToBlob('data:text/html;base64,PGgxPg==')).toThrow('Not a pasted image.');
    expect(() => dataUrlToBlob('https://x/y.png')).toThrow('Not a pasted image.');
  });
});

describe('every CMS upload goes to Storage', () => {
  it('no upload pastes an image into the settings any more', () => {
    const walk = (dir: string): string[] => fs.readdirSync(path.resolve(process.cwd(), dir), { withFileTypes: true })
      .flatMap(e => e.isDirectory() ? walk(`${dir}/${e.name}`) : /\.tsx?$/.test(e.name) ? [`${dir}/${e.name}`] : []);
    for (const file of walk('src')) {
      expect(read(file), file).not.toMatch(/readAsDataURL|optimizeImageFile|toDataURL\(/);
    }
    expect(fs.existsSync(path.resolve(process.cwd(), 'src/utils/imageOptimizer.ts'))).toBe(false);
  });

  it('the image picker, the logo and the SEO tab all upload', () => {
    expect(read('src/components/admin/cms/MediaAssetPicker.tsx')).toMatch(/await uploadImage\(file, \{ maxWidth: isBanner \? 1600 : 1200 \}\)/);
    expect(read('src/components/admin/cms/CMSNavbarTab.tsx')).toMatch(/await uploadImage\(file, \{ maxWidth: isFavicon \? 256 : 800, quality: 0\.85 \}\)/);
    expect(read('src/components/admin/cms/CMSSeoTab.tsx')).toMatch(/await uploadImage\(file, \{ maxWidth: isFavicon \? 256 : 1200, quality: 0\.85 \}\)/);
  });

  it('files are cached a year, never overwritten, and a refusal asks for the code', () => {
    const lib = read('src/lib/mediaUpload.ts');
    expect(lib).toContain("export const MEDIA_BUCKET = 'yalla-media';");
    expect(lib).toContain("export const MEDIA_CACHE_SECONDS = '31536000';");
    expect(lib).toMatch(/cacheControl: MEDIA_CACHE_SECONDS,\s+contentType,\s+upsert: false,/);
    expect(lib).toMatch(/if \(error && needsStepUp\(error\)\) \{\s+if \(!\(await promptStepUpModal\(\)\)\)/);
  });

  it('the CMS offers to move pasted photos, into the draft only', () => {
    const cms = read('src/components/PageCMSManager.tsx');
    expect(cms).toContain('const pastedPhotos = useMemo(() => findPastedImages(cmsForm), [cmsForm]);');
    expect(cms).toContain('if (moved.size > 0) handleUpdate(prev => replaceStrings(prev, moved));');
    expect(cms).toMatch(/\{pastedPhotos\.length > 0 && \(\s+<button/);
  });
});
