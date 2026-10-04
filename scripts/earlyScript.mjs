import path from 'node:path';

/**
 * Makes src/early.ts a small file of its own, fetched and run before the app's.
 *
 * A <script> for it in index.html would not do: Vite folds every script in the
 * page into the one app file, so the script would run only after ~250 kB had
 * downloaded, which is exactly what it exists to avoid. So it is a second entry of
 * the build, and its tag is added to the page here, first among the scripts (module
 * scripts run in the order they appear). The little it imports (src/lib/earlyRequests.ts)
 * comes in its own file; it is announced with modulepreload so it downloads alongside
 * rather than after.
 *
 * (A <script> with the code written into the page is not an option either: the
 * security policy allows only scripts from this site's own files.)
 */

/** The tags that load the built early chunk: the script itself, and a preload for each file it imports. */
export function earlyTags(chunk, base = '/') {
  const prefix = base.endsWith('/') ? base : `${base}/`;
  const tags = [{ tag: 'script', attrs: { type: 'module', crossorigin: '', src: `${prefix}${chunk.fileName}` }, injectTo: 'head-prepend' }];
  for (const file of chunk.imports ?? []) {
    tags.push({ tag: 'link', attrs: { rel: 'modulepreload', crossorigin: '', href: `${prefix}${file}` }, injectTo: 'head-prepend' });
  }
  return tags;
}

/** @returns {import('vite').Plugin} */
export function earlyScript() {
  let base = '/';
  return {
    name: 'early-first-reads',
    configResolved(config) { base = config.base; },
    config(_config, { command }) {
      if (command !== 'build') return undefined;
      return { build: { rollupOptions: { input: { early: path.resolve(process.cwd(), 'src/early.ts') } } } };
    },
    transformIndexHtml: {
      order: 'post',
      handler(html, context) {
        // The dev server serves the file as it is.
        if (!context.bundle) return [{ tag: 'script', attrs: { type: 'module', src: '/src/early.ts' }, injectTo: 'head-prepend' }];
        const chunk = Object.values(context.bundle).find(item => item.type === 'chunk' && item.isEntry && item.name === 'early');
        if (!chunk) return html;
        return { html, tags: earlyTags(chunk, base) };
      },
    },
  };
}
