/**
 * Safe URL validation and sanitization
 * Protects against javascript:, data: (script execution), vbscript:, and file: URL injections
 */

const ALLOWED_SCHEMES = ['http:', 'https:', 'mailto:', 'tel:'];
const ALLOWED_IMAGE_SCHEMES = ['http:', 'https:', 'blob:', 'data:'];

export function hasControlCharacters(url: string): boolean {
  // eslint-disable-next-line no-control-regex
  return /[\x00-\x1F\x7F]/.test(url);
}

export function isSafeUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  
  const trimmed = url.trim();
  if (!trimmed) return false;

  if (hasControlCharacters(trimmed)) return false;
  if (trimmed.startsWith('//')) return false; // block protocol-relative

  // Relative URLs are considered safe
  if (trimmed.startsWith('/') || trimmed.startsWith('#') || trimmed.startsWith('./') || trimmed.startsWith('../')) {
    return true;
  }

  // Handle WhatsApp web and app links
  if (trimmed.startsWith('https://wa.me/') || trimmed.startsWith('whatsapp://')) {
    return true;
  }

  try {
    const baseOrigin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'https://yalla.lb';
    const parsed = new URL(trimmed, baseOrigin);
    return ALLOWED_SCHEMES.includes(parsed.protocol);
  } catch {
    return false;
  }
}

export function isSafeImageUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  
  const trimmed = url.trim();
  if (!trimmed) return false;

  if (hasControlCharacters(trimmed)) return false;
  if (trimmed.startsWith('//')) return false;

  // Relative URLs are safe
  if (trimmed.startsWith('/') || trimmed.startsWith('./') || trimmed.startsWith('../')) {
    return true;
  }

  // Safe data:image MIME types (excluding svg+xml to prevent embedded XSS)
  if (trimmed.startsWith('data:image/')) {
    if (trimmed.toLowerCase().includes('svg+xml')) return false;
    return /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=\s]+$/i.test(trimmed);
  }

  if (trimmed.startsWith('blob:')) {
    return true;
  }

  try {
    const baseOrigin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'https://yalla.lb';
    const parsed = new URL(trimmed, baseOrigin);
    return ALLOWED_IMAGE_SCHEMES.includes(parsed.protocol);
  } catch {
    return false;
  }
}

export function safeImageUrl(url: string | null | undefined): string | undefined {
  return isSafeImageUrl(url) ? url?.trim() : undefined;
}

export function sanitizeUrl(url: string | null | undefined, fallback: string = '#'): string {
  if (!url || typeof url !== 'string') return fallback;
  return isSafeUrl(url) ? url.trim() : fallback;
}

export function safeExternalUrl(url: string | null | undefined): string | undefined {
  return isSafeUrl(url) ? url?.trim() : undefined;
}

export function safeHref(url: string | null | undefined, fallback: string = '#'): string {
  return isSafeUrl(url) ? url!.trim() : fallback;
}
