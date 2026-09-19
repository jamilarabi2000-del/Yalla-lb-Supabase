import DOMPurify from 'dompurify';

/**
 * Sanitizes CMS/admin rich text before it reaches dangerouslySetInnerHTML.
 * The builder intentionally supports a small document-style HTML subset only.
 *
 * This deliberately delegates to DOMPurify rather than hand-rolling an
 * allowlist. A parse -> strip -> re-serialize -> re-parse pipeline is the exact
 * shape that mutation-XSS bypasses target: unwrapping foreign-content elements
 * (svg/math) while preserving their children can turn markup that was inert on
 * the first parse into live markup on the second.
 */
const ALLOWED_TAGS = ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'h1', 'h2', 'ul', 'ol', 'li', 'a'];
const ALLOWED_ATTR = ['href', 'target', 'rel'];

/**
 * http(s), mailto and tel, plus same-document fragments and root-relative
 * paths. The negative lookahead rejects every scheme-relative form
 * ("//evil.com", "/\evil.com"), which browsers resolve off-origin.
 */
const ALLOWED_URI_REGEXP = /^(?:https?:|mailto:|tel:|#|\/(?![\\/]))/i;

let hookRegistered = false;

function registerHook(): void {
  if (hookRegistered) return;
  hookRegistered = true;

  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (!(node instanceof Element) || node.tagName !== 'A') return;
    const href = node.getAttribute('href') || '';
    if (/^https?:/i.test(href)) {
      node.setAttribute('rel', 'noopener noreferrer nofollow');
      node.setAttribute('target', '_blank');
    } else {
      node.removeAttribute('target');
      node.removeAttribute('rel');
    }
  });
}

export function sanitizeRichText(input: string | null | undefined): string {
  if (!input) return '';

  // Non-DOM contexts (SSR, tests) get a conservative tag strip.
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return input.replace(/<[^>]*>/g, '');
  }

  registerHook();

  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP,
    FORBID_TAGS: ['style', 'script', 'svg', 'math', 'template', 'noscript', 'iframe', 'object', 'embed', 'form'],
    FORBID_CONTENTS: ['style', 'script', 'svg', 'math', 'template', 'noscript'],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    // NOTE: do not set USE_PROFILES here. It overrides ALLOWED_TAGS, which
    // silently widens the allowlist to the whole HTML profile (<img>, <table>,
    // <input>, ...) instead of the small document subset the builder supports.
    RETURN_TRUSTED_TYPE: false,
  }) as unknown as string;
}
