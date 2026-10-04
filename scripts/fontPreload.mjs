/**
 * Tells the browser to start fetching the font every page draws at once while it
 * is still reading the HTML, instead of after it has read the stylesheet and laid
 * the text out. That is the heading font (Playfair Display, Latin): measured in a
 * real browser, headings are the only text drawn in a web font on a default page;
 * the body text uses the system font stack (the app's root element has Tailwind's
 * font-sans), so preloading the body font would download a file nothing draws in.
 * The Arabic and the other files are fetched only when a page has such characters.
 *
 * Vite gives each font file a hashed name at build time, so the link cannot be
 * written by hand in index.html: this adds it from the files the build made.
 * A preloaded font must carry `crossorigin`, even from the same site, or the
 * browser fetches it twice.
 */
export const PRELOADED_FONTS = [
  /(^|\/)playfair-display-latin-wght-normal-[\w-]+\.woff2$/,
];

/** The preload tags for whichever of the fonts are among `fileNames` (paths inside the build). */
export function fontPreloadTags(fileNames, base = '/') {
  const prefix = base.endsWith('/') ? base : `${base}/`;
  return PRELOADED_FONTS.flatMap(pattern => {
    const file = fileNames.find(name => pattern.test(name));
    return file
      ? [{ tag: 'link', attrs: { rel: 'preload', as: 'font', type: 'font/woff2', crossorigin: '', href: `${prefix}${file}` }, injectTo: 'head' }]
      : [];
  });
}

/** @returns {import('vite').Plugin} */
export function fontPreload() {
  let base = '/';
  return {
    name: 'preload-above-the-fold-fonts',
    apply: 'build',
    configResolved(config) { base = config.base; },
    transformIndexHtml: {
      order: 'post',
      handler(html, context) {
        const tags = fontPreloadTags(Object.keys(context.bundle ?? {}), base);
        return tags.length ? { html, tags } : html;
      },
    },
  };
}
