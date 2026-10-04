import { describe, it, expect } from 'vitest';
import { phoneHeroPreload } from '../src/lib/earlyHero';

// The home page's first picture is the largest thing on a phone's screen, and used to start
// downloading only after the app had downloaded, started and drawn the banner. It is named
// from the settings the moment they arrive. These cases follow the banner's own rules.
const NOW = new Date('2026-10-05T12:00:00Z');
const UNSPLASH = 'https://images.unsplash.com/photo-1544816155?auto=format&fit=crop&q=80&w=2000';
const STORED = 'https://abc.supabase.co/storage/v1/object/public/yalla-media/cms/2026/10/aaaa-1600.webp#w=480,960,1600';
const hero = (extra: Record<string, unknown>) => ({ hero: { title: 'T', ...extra } });
const item = (extra: Record<string, unknown> = {}) => ({ id: 'a', type: 'image', url: UNSPLASH, isPublished: true, ...extra });

describe('the first slide that is on the air', () => {
  it('is its picture, with the sizes the banner lists for a phone', () => {
    const preload = phoneHeroPreload(hero({ bgMediaItems: [item()] }), NOW)!;
    expect(preload.href).toBe(UNSPLASH);
    expect(preload.imagesizes).toBe('100vw');
    expect(preload.imagesrcset).toContain('w=480');
    expect(preload.imagesrcset).toContain('480w');
  });

  it('uses the phone picture where the slide has one', () => {
    const slide = item({ mobileUrl: 'https://i.ibb.co/m.png' });
    expect(phoneHeroPreload(hero({ bgMediaItems: [slide] }), NOW)).toEqual({ href: 'https://i.ibb.co/m.png' });
    expect(phoneHeroPreload(hero({ bgMediaItems: [item({ mobileImageUrl: 'https://i.ibb.co/m2.png' })] }), NOW)!.href).toBe('https://i.ibb.co/m2.png');
  });

  it('takes the other names the settings use for the desktop picture', () => {
    expect(phoneHeroPreload(hero({ bgMediaItems: [item({ url: undefined, desktopImageUrl: 'https://i.ibb.co/d.png' })] }), NOW)!.href).toBe('https://i.ibb.co/d.png');
    expect(phoneHeroPreload(hero({ bgImageUrl: 'https://i.ibb.co/bg.png', bgMediaItems: [item({ url: undefined })] }), NOW)!.href).toBe('https://i.ibb.co/bg.png');
  });

  it('is the first of several that are on the air, not another', () => {
    const items = [item({ id: 'one', url: 'https://i.ibb.co/one.png' }), item({ id: 'two', url: 'https://i.ibb.co/two.png' }), item({ id: 'three', url: 'https://i.ibb.co/three.png' })];
    expect(phoneHeroPreload(hero({ bgMediaItems: items }), NOW)!.href).toBe('https://i.ibb.co/one.png');
  });

  it('skips a slide that is not published, or not yet or no longer on the air', () => {
    const items = [
      item({ id: 'off', url: 'https://i.ibb.co/off.png', isPublished: false }),
      item({ id: 'later', url: 'https://i.ibb.co/later.png', scheduleActive: true, startDate: '2026-12-01T00:00:00Z' }),
      item({ id: 'over', url: 'https://i.ibb.co/over.png', scheduleActive: true, endDate: '2026-01-01T00:00:00Z' }),
      item({ id: 'live', url: 'https://i.ibb.co/live.png', scheduleActive: true, startDate: '2026-01-01T00:00:00Z', endDate: '2026-12-31T00:00:00Z' }),
    ];
    expect(phoneHeroPreload(hero({ bgMediaItems: items }), NOW)!.href).toBe('https://i.ibb.co/live.png');
  });

  it('ignores the dates of a slide whose schedule is off', () => {
    expect(phoneHeroPreload(hero({ bgMediaItems: [item({ url: 'https://i.ibb.co/x.png', scheduleActive: false, startDate: '2999-01-01T00:00:00Z' })] }), NOW)!.href).toBe('https://i.ibb.co/x.png');
  });

  it('is a stored upload\'s own list of widths', () => {
    const preload = phoneHeroPreload(hero({ bgMediaItems: [item({ url: STORED })] }), NOW)!;
    expect(preload.imagesrcset).toBe('https://abc.supabase.co/storage/v1/object/public/yalla-media/cms/2026/10/aaaa-480.webp 480w, https://abc.supabase.co/storage/v1/object/public/yalla-media/cms/2026/10/aaaa-960.webp 960w, https://abc.supabase.co/storage/v1/object/public/yalla-media/cms/2026/10/aaaa-1600.webp 1600w');
  });
});

describe('with no list of slides', () => {
  it('is the single hero picture, the phone one if there is one', () => {
    expect(phoneHeroPreload(hero({ bgImageUrl: 'https://i.ibb.co/bg.png', mobileImageUrl: 'https://i.ibb.co/phone.png' }), NOW)!.href).toBe('https://i.ibb.co/phone.png');
    expect(phoneHeroPreload(hero({ bgImageUrl: 'https://i.ibb.co/bg.png' }), NOW)!.href).toBe('https://i.ibb.co/bg.png');
    expect(phoneHeroPreload(hero({ desktopImageUrl: 'https://i.ibb.co/d.png' }), NOW)!.href).toBe('https://i.ibb.co/d.png');
  });

  it('is the single picture too when every slide in the list is off the air', () => {
    expect(phoneHeroPreload(hero({ bgImageUrl: 'https://i.ibb.co/bg.png', bgMediaItems: [item({ isPublished: false })] }), NOW)!.href).toBe('https://i.ibb.co/bg.png');
  });

  it('has no list of sizes for a picture that comes in one size', () => {
    expect(phoneHeroPreload(hero({ bgImageUrl: 'https://i.ibb.co/bg.png' }), NOW)).toEqual({ href: 'https://i.ibb.co/bg.png' });
  });
});

describe('where it cannot be sure it names nothing', () => {
  it('a first slide that is a video', () => {
    expect(phoneHeroPreload(hero({ bgMediaItems: [item({ type: 'video', url: 'https://cdn.example.com/v.mp4' })] }), NOW)).toBeNull();
  });
  it('no picture set: the banner shows its built-in photo, a file of the app\'s own', () => {
    expect(phoneHeroPreload(hero({}), NOW)).toBeNull();
    expect(phoneHeroPreload(hero({ bgMediaItems: [item({ url: '' })] }), NOW)).toBeNull();
  });
  it('an address that is not https', () => {
    expect(phoneHeroPreload(hero({ bgMediaItems: [item({ url: 'http://example.com/a.jpg' })] }), NOW)).toBeNull();
    expect(phoneHeroPreload(hero({ bgMediaItems: [item({ url: '/uploads/a.jpg' })] }), NOW)).toBeNull();
    expect(phoneHeroPreload(hero({ bgMediaItems: [item({ url: 'data:image/png;base64,AAAA' })] }), NOW)).toBeNull();
    expect(phoneHeroPreload(hero({ bgMediaItems: [item({ url: 'javascript:alert(1)' })] }), NOW)).toBeNull();
  });
  it('settings that are not what was expected', () => {
    for (const settings of [null, undefined, 'text', 42, [], {}, { hero: null }, { hero: 'x' }, { hero: { bgMediaItems: 'x' } }, { hero: { bgMediaItems: [null, 3, 'a'] } }]) {
      expect(() => phoneHeroPreload(settings, NOW), JSON.stringify(settings)).not.toThrow();
      expect(phoneHeroPreload(settings, NOW), JSON.stringify(settings)).toBeNull();
    }
  });
  it('values that are not text, even ones that read like an address once turned into text', () => {
    expect(phoneHeroPreload(hero({ bgMediaItems: [item({ url: 123, mobileUrl: { a: 1 } })], bgImageUrl: ['x'] }), NOW)).toBeNull();
    expect(phoneHeroPreload(hero({ bgMediaItems: [item({ url: ['https://i.ibb.co/a.png'] })] }), NOW)).toBeNull();
    expect(phoneHeroPreload(hero({ bgImageUrl: ['https://i.ibb.co/a.png'] }), NOW)).toBeNull();
    expect(() => phoneHeroPreload(hero({ bgMediaItems: [item({ url: ['https://i.ibb.co/a.png'] })] }), NOW)).not.toThrow();
  });
});
