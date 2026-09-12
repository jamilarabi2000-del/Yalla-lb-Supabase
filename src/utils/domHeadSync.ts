import { SiteContent } from '../types';
import { safeImageUrl } from '../lib/safeUrl';

const DEFAULT_FAVICON = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23f59e0b"%3E%3Cpath d="M12 2l9 4.9v9.8L12 22l-9-4.9V6.9z"/%3E%3C/svg%3E';

function setMetaTag(attributeName: 'name' | 'property', key: string, content: string | undefined) {
  if (!content) return;
  let tag = document.querySelector(`meta[${attributeName}="${key}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attributeName, key);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content);
}

function getMimeTypeFromUrl(url: string): string {
  if (url.startsWith('data:image/')) {
    const match = url.match(/^data:(image\/[a-z0-9\+\-\.]+);/i);
    if (match && match[1]) {
      return match[1];
    }
  }
  if (url.startsWith('data:image/x-icon') || url.startsWith('data:image/vnd.microsoft.icon') || url.toLowerCase().includes('.ico')) {
    return 'image/x-icon';
  }
  if (url.startsWith('data:image/svg+xml') || url.toLowerCase().includes('.svg')) {
    return 'image/svg+xml';
  }
  if (url.startsWith('data:image/webp') || url.toLowerCase().includes('.webp')) {
    return 'image/webp';
  }
  if (url.startsWith('data:image/jpeg') || url.startsWith('data:image/jpg') || url.toLowerCase().includes('.jpg') || url.toLowerCase().includes('.jpeg')) {
    return 'image/jpeg';
  }
  return 'image/png';
}

export function syncDomHead(siteContent: SiteContent | null | undefined, language: 'en' | 'ar' = 'en') {
  if (typeof document === 'undefined') return;

  // 1. Dynamic Favicon Icon Synchronization
  const rawFavicon = siteContent?.seo?.faviconUrl?.trim() || siteContent?.navbar?.faviconUrl?.trim() || DEFAULT_FAVICON;
  const validatedFavicon = safeImageUrl(rawFavicon) || DEFAULT_FAVICON;

  if (validatedFavicon) {
    const mimeType = getMimeTypeFromUrl(validatedFavicon);

    // Browsers often cache favicon by node reference: removing old link nodes and appending fresh ones forces tab icon refresh
    const existingIconLinks = document.querySelectorAll<HTMLLinkElement>("link[rel*='icon'], link[rel='apple-touch-icon']");
    existingIconLinks.forEach((link) => {
      link.parentNode?.removeChild(link);
    });

    // Create fresh rel="icon"
    const standardIcon = document.createElement('link');
    standardIcon.rel = 'icon';
    standardIcon.type = mimeType;
    standardIcon.href = validatedFavicon;
    document.head.appendChild(standardIcon);

    // Create fresh rel="shortcut icon"
    const shortcutIcon = document.createElement('link');
    shortcutIcon.rel = 'shortcut icon';
    shortcutIcon.type = mimeType;
    shortcutIcon.href = validatedFavicon;
    document.head.appendChild(shortcutIcon);

    // Create fresh rel="apple-touch-icon"
    const appleTouchIcon = document.createElement('link');
    appleTouchIcon.rel = 'apple-touch-icon';
    appleTouchIcon.href = validatedFavicon;
    document.head.appendChild(appleTouchIcon);
  }

  // 2. Titles & Meta Descriptions
  const seo = siteContent?.seo;
  const navbar = siteContent?.navbar;

  const resolvedTitle = language === 'ar'
    ? (seo?.arabicTitle || seo?.title || navbar?.brandNameArabic || 'يلا لبنان - السوق الحرفي والمونة اللبنانية الأصيلة')
    : (seo?.title || navbar?.brandName || 'Yalla — Lebanese Craftsmanship & Commerce');

  const resolvedDescription = language === 'ar'
    ? (seo?.arabicDescription || seo?.description || 'سوق لبناني أصيل يربط الحرفيين بالمستهلكين.')
    : (seo?.description || 'A premium marketplace bridging Lebanese craftsmanship with modern digital commerce.');

  document.title = resolvedTitle;
  setMetaTag('name', 'description', resolvedDescription);

  // 3. SEO Keywords
  const keywords = language === 'ar'
    ? (seo?.arabicKeywords?.length ? seo.arabicKeywords.join(', ') : seo?.keywords?.join(', '))
    : (seo?.keywords?.length ? seo.keywords.join(', ') : undefined);

  if (keywords) {
    setMetaTag('name', 'keywords', keywords);
  }

  // 4. Social Sharing Meta Tags (Open Graph & Twitter Cards)
  const socialImage = safeImageUrl(seo?.ogImageUrl || validatedFavicon || navbar?.logoUrl);

  setMetaTag('property', 'og:title', resolvedTitle);
  setMetaTag('property', 'og:description', resolvedDescription);
  setMetaTag('property', 'og:site_name', navbar?.brandName || 'Yalla.lb');
  if (socialImage) {
    setMetaTag('property', 'og:image', socialImage);
    setMetaTag('name', 'twitter:image', socialImage);
  }

  setMetaTag('name', 'twitter:title', resolvedTitle);
  setMetaTag('name', 'twitter:description', resolvedDescription);
}
