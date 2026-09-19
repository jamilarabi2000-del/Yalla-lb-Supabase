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

/**
 * Any scheme-relative form. Browsers normalise "\" to "/" in special schemes,
 * so "/\evil.com", "\/evil.com" and "\\evil.com" all navigate off-origin
 * exactly like "//evil.com" does.
 */
function isSchemeRelative(value: string): boolean {
  return /^[\\/]{2}/.test(value);
}

function isRelativeForm(value: string): boolean {
  return /^[.\\/]/.test(value);
}

function currentOrigin(): string {
  return typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : 'https://yalla.lb';
}

export function isSafeUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;

  const trimmed = url.trim();
  if (!trimmed) return false;

  if (hasControlCharacters(trimmed)) return false;
  if (isSchemeRelative(trimmed)) return false;

  // Pure fragments never leave the current document.
  if (trimmed.startsWith('#')) return true;

  const baseOrigin = currentOrigin();
  try {
    const parsed = new URL(trimmed, baseOrigin);

    // A "relative" URL is only safe once it demonstrably resolves back to our
    // own origin. Never trust the leading character alone.
    if (isRelativeForm(trimmed)) {
      return parsed.origin === new URL(baseOrigin).origin;
    }

    // WhatsApp links, validated as parsed URLs rather than by prefix match.
    if (parsed.protocol === 'https:' && parsed.hostname === 'wa.me') return true;
    if (parsed.protocol === 'whatsapp:') return true;

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
  if (isSchemeRelative(trimmed)) return false;

  // Safe data:image MIME types (excluding svg+xml to prevent embedded XSS)
  if (trimmed.startsWith('data:image/')) {
    if (trimmed.toLowerCase().includes('svg+xml')) return false;
    return /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=\s]+$/i.test(trimmed);
  }

  if (trimmed.startsWith('blob:')) {
    return true;
  }

  const baseOrigin = currentOrigin();
  try {
    const parsed = new URL(trimmed, baseOrigin);
    if (isRelativeForm(trimmed)) {
      return parsed.origin === new URL(baseOrigin).origin;
    }
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
