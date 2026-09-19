export type ImageUrlValidation = { valid: boolean; error?: string; url?: string };

/**
 * Validate a browser-renderable external image URL without requiring a file extension.
 * CDN URLs such as Unsplash commonly return images from extensionless paths with query params.
 */
export function validateExternalImageUrl(value: string, required = false): ImageUrlValidation {
  const raw = String(value ?? '').trim();
  if (!raw) return required ? { valid: false, error: 'Image URL is required.' } : { valid: true, url: '' };

  let parsed: URL;
  try { parsed = new URL(raw); } catch { return { valid: false, error: 'Enter a valid image URL.' }; }

  if (parsed.protocol !== 'https:') {
    return { valid: false, error: 'Image URLs must use HTTPS.' };
  }

  // Never accept executable/non-network schemes or browser-local URLs.
  if (!parsed.hostname || parsed.username || parsed.password) {
    return { valid: false, error: 'Enter a public HTTPS image URL.' };
  }

  if (/\.html?(?:$|[?#])/i.test(parsed.pathname + parsed.search)) {
    return { valid: false, error: 'Use a direct image URL, not an HTML webpage.' };
  }

  return { valid: true, url: parsed.toString() };
}

export function isValidExternalImageUrl(value: string): boolean {
  return validateExternalImageUrl(value).valid;
}
