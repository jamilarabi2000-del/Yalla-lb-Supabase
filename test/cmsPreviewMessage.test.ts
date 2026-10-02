import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { readPreviewMessage } from '../src/lib/cmsPreviewMessage';

// The storefront preview that CMS Studio frames takes its draft from
// postMessage. Preview mode is switched on by a public address
// (?cmsPreview=1), so the page must only believe the window that framed it.
const read = (f: string) => fs.readFileSync(path.resolve(process.cwd(), f), 'utf8');
const ORIGIN = 'https://yalla-lb-supabase.vercel.app';
const studio = { name: 'the studio window' };
const stranger = { name: 'some other window' };
const draft = { hero: { title: 'Draft' } };

const message = (over: Partial<{ origin: string; source: unknown; data: unknown }> = {}) =>
  ({ origin: ORIGIN, source: studio, data: { type: 'CMS_DRAFT_UPDATE', payload: draft }, ...over });

describe('which messages the preview believes', () => {
  it('a draft from the Studio window, same origin', () => {
    expect(readPreviewMessage(message(), ORIGIN, studio)).toEqual({ type: 'CMS_DRAFT_UPDATE', payload: draft });
  });

  it('a language change from the Studio window', () => {
    for (const lang of ['ar', 'en'] as const) {
      expect(readPreviewMessage(message({ data: { type: 'CMS_LANG_UPDATE', payload: lang } }), ORIGIN, studio))
        .toEqual({ type: 'CMS_LANG_UPDATE', payload: lang });
    }
  });

  it('nothing from another origin, even when it claims to be the Studio', () => {
    expect(readPreviewMessage(message({ origin: 'https://evil.example' }), ORIGIN, studio)).toBeNull();
    expect(readPreviewMessage(message({ origin: 'http://yalla-lb-supabase.vercel.app' }), ORIGIN, studio)).toBeNull();
    expect(readPreviewMessage(message({ origin: 'null' }), ORIGIN, studio)).toBeNull();
  });

  it('nothing from a same-origin window that is not the parent', () => {
    expect(readPreviewMessage(message({ source: stranger }), ORIGIN, studio)).toBeNull();
    expect(readPreviewMessage(message({ source: null }), ORIGIN, studio)).toBeNull();
  });

  it('nothing in any other shape', () => {
    for (const data of [
      null, undefined, 'CMS_DRAFT_UPDATE', 5, [], [{ type: 'CMS_DRAFT_UPDATE' }],
      {}, { type: 'OTHER', payload: draft },
      { type: 'CMS_DRAFT_UPDATE' }, { type: 'CMS_DRAFT_UPDATE', payload: null },
      { type: 'CMS_DRAFT_UPDATE', payload: 'text' }, { type: 'CMS_DRAFT_UPDATE', payload: [draft] },
      { type: 'CMS_LANG_UPDATE' }, { type: 'CMS_LANG_UPDATE', payload: 'fr' },
      { type: 'CMS_LANG_UPDATE', payload: '<img src=x onerror=alert(1)>' }, { type: 'CMS_LANG_UPDATE', payload: { lang: 'ar' } },
    ]) {
      expect(readPreviewMessage(message({ data }), ORIGIN, studio), JSON.stringify(data)).toBeNull();
    }
  });
});

describe('both ends use it', () => {
  it('the Studio sends to its own origin, never to any page', () => {
    const sender = read('src/components/admin/cms/CMSLivePreview.tsx');
    expect(sender).not.toMatch(/postMessage\([^)]*'\*'/s);
    expect(sender.match(/window\.location\.origin/g)).toHaveLength(4);
  });

  it('the preview page listens only when framed, and only through the check', () => {
    const ctx = read('src/context/ShopContext.tsx');
    expect(ctx).toContain("import { readPreviewMessage } from '../lib/cmsPreviewMessage';");
    expect(ctx).toContain("if (!isCmsPreview || window.parent === window) return;");
    expect(ctx).toContain('readPreviewMessage(event, window.location.origin, window.parent)');
    expect(ctx).not.toMatch(/event\.data\.type === 'CMS_DRAFT_UPDATE'/);
  });
});
