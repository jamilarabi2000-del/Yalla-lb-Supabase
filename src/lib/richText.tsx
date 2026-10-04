import React, { useEffect, useState } from 'react';

/**
 * The page's rich text (CMS blocks) is cleaned by DOMPurify, a library about a
 * fifth of the size of the whole storefront. It used to ship in the first
 * download of every page, whether or not the page had any rich text. It is now
 * fetched the first time a page has some, and the text is shown once it has been
 * cleaned: never before, so unclean markup is never on the page.
 */

type Sanitize = (html: string | null | undefined) => string;

let loaded: Sanitize | null = null;
let loading: Promise<Sanitize> | null = null;

export function loadRichTextSanitizer(): Promise<Sanitize> {
  if (loaded) return Promise.resolve(loaded);
  loading ??= import('../utils/sanitizeRichText').then(module => (loaded = module.sanitizeRichText));
  // a failed fetch may be tried again by the next page that needs it
  loading.catch(() => { loading = null; });
  return loading;
}

/**
 * The words of some markup and none of the markup, for the one case the cleaner
 * cannot be fetched (offline half-way): the reader still gets the text. The
 * markup is parsed in an inert document and only its text is kept.
 */
export function plainTextOf(html: string): string {
  if (typeof DOMParser === 'undefined') return html.replace(/<[^>]*>/g, '');
  const doc = new DOMParser().parseFromString(html, 'text/html');
  // what is not words (code, styles, embedded objects) is dropped, not read out as text
  doc.querySelectorAll('script, style, template, noscript, iframe, object, embed, svg, math').forEach(el => el.remove());
  return doc.body.textContent ?? '';
}

type Cleaner = Sanitize | 'failed' | null;

/** Rich text on the page: nothing until it is clean, then the clean markup. */
export const RichText: React.FC<{ source: string; className?: string }> = ({ source, className }) => {
  // (a function in state: wrapped, or React would call it as an initialiser)
  const [cleaner, setCleaner] = useState<Cleaner>(() => loaded);

  useEffect(() => {
    if (cleaner) return;
    let cancelled = false;
    loadRichTextSanitizer().then(
      sanitize => { if (!cancelled) setCleaner(() => sanitize); },
      () => { if (!cancelled) setCleaner('failed'); },
    );
    return () => { cancelled = true; };
  }, [cleaner]);

  if (!cleaner) return null;
  if (cleaner === 'failed') return <div className={className}>{plainTextOf(source)}</div>;
  return <div className={className} dangerouslySetInnerHTML={{ __html: cleaner(source) }} />;
};
