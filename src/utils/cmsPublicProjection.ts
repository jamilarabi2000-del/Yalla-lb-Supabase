import { SiteContent, CMSCustomBlock, CMSNewsArticle, CMSPromoSliderConfig, CMSHeroMediaItem } from '../types';

/**
 * Projects a full CMS SiteContent tree into a sanitized public projection.
 * Strips unpublished articles, draft custom blocks, unpublished promo slides,
 * and unpublished hero items so that direct Firestore queries by unauthenticated
 * or unauthorized users only receive published storefront content.
 */
export function filterPublicCmsContent(content: SiteContent): SiteContent {
  if (!content) return content;

  // Deep clone to prevent mutating original state
  const clean: SiteContent = JSON.parse(JSON.stringify(content));

  // 1. Filter unpublished custom blocks
  if (Array.isArray(clean.customBlocks)) {
    clean.customBlocks = clean.customBlocks.filter((b: CMSCustomBlock) => b && b.isPublished !== false);
  }

  // 2. Filter unpublished news articles
  if (clean.newsSection && Array.isArray(clean.newsSection.articles)) {
    clean.newsSection.articles = clean.newsSection.articles.filter((a: CMSNewsArticle) => a && a.isPublished !== false);
  }

  // 3. Filter unpublished promo banner slides
  if (clean.promoBanner && Array.isArray(clean.promoBanner.slides)) {
    clean.promoBanner.slides = clean.promoBanner.slides.filter((s: CMSPromoSliderConfig) => s && s.isPublished !== false);
  }

  // 4. Filter unpublished hero media items
  if (clean.hero && Array.isArray(clean.hero.bgMediaItems)) {
    clean.hero.bgMediaItems = clean.hero.bgMediaItems.filter((m: CMSHeroMediaItem) => m && (m as any).isPublished !== false);
  }

  return clean;
}
