import { imageSrcSet } from './responsiveImage';

/**
 * The picture the home page shows first on a phone, worked out from the page's
 * settings, so it can start downloading the moment the settings arrive instead of
 * after the app has downloaded, started and drawn the banner. It is the largest thing
 * on the screen, so this is where a first visit on a slow connection spends its time.
 *
 * This must name the very file the banner will ask for, or it downloads a second
 * picture for nothing: it follows HomeTopContainer step by step (the first slide that is
 * on the air, its phone picture, the same list of sizes), and test/earlyHero.dom.test.tsx
 * renders the real banner and fails if the two ever disagree. Where it cannot be sure
 * (a video, a picture that is not an https address, a desktop screen where the picture's
 * display size depends on the promo panel beside it) it names nothing.
 */

export interface HeroPreload {
  href: string;
  /** The picture's other sizes, when it has some. */
  imagesrcset?: string;
  imagesizes?: string;
}

interface Slide { isPublished?: boolean; scheduleActive?: boolean; startDate?: string; endDate?: string; type?: string; url?: string; desktopImageUrl?: string; mobileUrl?: string; mobileImageUrl?: string }

/** Whether a slide is on the air (the banner's own rule: published, and inside its dates if it has any). */
function onTheAir(item: Slide, now: Date): boolean {
  if (item.isPublished === false) return false;
  if (item.scheduleActive) {
    if (item.startDate) {
      const start = new Date(item.startDate);
      if (!isNaN(start.getTime()) && now < start) return false;
    }
    if (item.endDate) {
      const end = new Date(item.endDate);
      if (!isNaN(end.getTime()) && now > end) return false;
    }
  }
  return true;
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

/** The first slide's phone picture, or null where it cannot be named with certainty. `settings` is the content of the page's settings row. */
export function phoneHeroPreload(settings: unknown, now: Date = new Date()): HeroPreload | null {
  const hero = (settings as { hero?: Record<string, unknown> } | null | undefined)?.hero;
  if (!hero || typeof hero !== 'object') return null;

  const items = (Array.isArray(hero.bgMediaItems) ? hero.bgMediaItems : []).filter((item): item is Slide => !!item && typeof item === 'object' && onTheAir(item as Slide, now));
  let url: string;
  if (items.length > 0) {
    const first = items[0];
    if ((first.type || 'image') === 'video') return null;
    const desktop = text(first.url) || text(first.desktopImageUrl) || text(hero.bgImageUrl);
    url = text(first.mobileUrl) || text(first.mobileImageUrl) || desktop;
  } else {
    url = text(hero.mobileImageUrl) || text(hero.bgImageUrl) || text(hero.desktopImageUrl);
  }
  // Nothing set means the banner shows its built-in photo, a file of the app's own.
  if (!url || !/^https:\/\//i.test(url)) return null;

  const imagesrcset = imageSrcSet(url);
  return imagesrcset ? { href: url, imagesrcset, imagesizes: '100vw' } : { href: url };
}
