const ALLOWED_TAGS = new Set(['P','BR','STRONG','B','EM','I','U','S','H1','H2','UL','OL','LI','A']);

/**
 * Sanitizes CMS/admin rich text before it reaches dangerouslySetInnerHTML.
 * The builder intentionally supports a small document-style HTML subset only.
 */
export function sanitizeRichText(input: string | null | undefined): string {
  if (!input) return '';
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return input.replace(/<[^>]*>/g, '');
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(input, 'text/html');

  const cleanNode = (node: Node): void => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const element = child as HTMLElement;
        const tag = element.tagName.toUpperCase();

        if (!ALLOWED_TAGS.has(tag)) {
          const fragment = doc.createDocumentFragment();
          while (element.firstChild) fragment.appendChild(element.firstChild);
          element.replaceWith(fragment);
          cleanNode(node);
          continue;
        }

        for (const attr of Array.from(element.attributes)) {
          const name = attr.name.toLowerCase();
          const value = attr.value.trim();
          const allowedHref = tag === 'A' && name === 'href' && /^(https?:\/\/|mailto:|tel:|\/|#)/i.test(value);
          if (!(allowedHref || (tag === 'A' && name === 'target' && value === '_blank'))) {
            element.removeAttribute(attr.name);
          }
        }

        if (tag === 'A') {
          const href = element.getAttribute('href') || '';
          if (/^https?:\/\//i.test(href)) {
            element.setAttribute('rel', 'noopener noreferrer nofollow');
            element.setAttribute('target', '_blank');
          }
        }
        cleanNode(element);
      } else if (child.nodeType !== Node.TEXT_NODE) {
        child.parentNode?.removeChild(child);
      }
    }
  };

  cleanNode(doc.body);
  return doc.body.innerHTML;
}
