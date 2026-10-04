import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { earlyScript, earlyTags } from '../scripts/earlyScript.mjs';

// A <script> for src/early.ts in index.html would be folded by Vite into the one large app
// file and run only after it had downloaded, which is what the script exists to avoid. The
// plugin makes it a second entry of the build and adds its tag to the page, first.
const chunk = { type: 'chunk', isEntry: true, name: 'early', fileName: 'assets/early-ZUk01fxs.js', imports: ['assets/earlyRequests-Cajsuru4.js'] };

describe('the tags that load the early script', () => {
  it('are the script first, and a preload for each file it imports, all at the very top of the head', () => {
    expect(earlyTags(chunk)).toEqual([
      { tag: 'script', attrs: { type: 'module', crossorigin: '', src: '/assets/early-ZUk01fxs.js' }, injectTo: 'head-prepend' },
      { tag: 'link', attrs: { rel: 'modulepreload', crossorigin: '', href: '/assets/earlyRequests-Cajsuru4.js' }, injectTo: 'head-prepend' },
    ]);
  });

  it('follow the site\'s base address', () => {
    expect((earlyTags(chunk, '/store')[0].attrs as any).src).toBe('/store/assets/early-ZUk01fxs.js');
    expect((earlyTags(chunk, '/store/')[1].attrs as any).href).toBe('/store/assets/earlyRequests-Cajsuru4.js');
  });

  it('are just the script for a chunk that imports nothing', () => {
    expect(earlyTags({ ...chunk, imports: [] })).toHaveLength(1);
  });
});

describe('the plugin', () => {
  const plugin = earlyScript() as any;

  it('adds the script as an entry of the build, and does nothing to the dev server', () => {
    expect(plugin.config({}, { command: 'build' })).toEqual({ build: { rollupOptions: { input: { early: path.resolve(process.cwd(), 'src/early.ts') } } } });
    expect(plugin.config({}, { command: 'serve' })).toBeUndefined();
  });

  it('in the dev server, points the page at the source file', () => {
    expect(plugin.transformIndexHtml.handler('<html></html>', {})).toEqual([{ tag: 'script', attrs: { type: 'module', src: '/src/early.ts' }, injectTo: 'head-prepend' }]);
  });

  it('in a build, adds the tags for the early chunk it finds', () => {
    plugin.configResolved({ base: '/' });
    const result = plugin.transformIndexHtml.handler('<html></html>', { bundle: { 'assets/main-x.js': { type: 'chunk', isEntry: true, name: 'main', fileName: 'assets/main-x.js' }, [chunk.fileName]: chunk } });
    expect(result.html).toBe('<html></html>');
    expect(result.tags).toEqual(earlyTags(chunk));
  });

  it('leaves the page alone if the build has no early chunk', () => {
    expect(plugin.transformIndexHtml.handler('<html></html>', { bundle: { 'assets/main-x.js': { type: 'chunk', isEntry: true, name: 'main', fileName: 'assets/main-x.js' } } })).toBe('<html></html>');
  });

  it('runs after the others, so the tags go in once the page is built', () => {
    expect(plugin.transformIndexHtml.order).toBe('post');
  });
});
