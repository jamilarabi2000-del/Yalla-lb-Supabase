// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import fs from 'node:fs';
import path from 'node:path';
import { RichText, plainTextOf } from '../src/lib/richText';

// DOMPurify, the library that cleans a CMS block's rich text, is about a fifth of the
// whole storefront and used to be in the first download of every page. It is now
// fetched the first time a page has rich text, and the text is shown only once it has
// been cleaned: never before, so unclean markup is never on the page.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const read = (f: string) => fs.readFileSync(path.resolve(process.cwd(), f), 'utf8');

let host: HTMLDivElement;
let root: Root;
const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 80)); });

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  (window as any).__pwn = undefined;
});
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; });

describe('rich text on the page', () => {
  // NOTE: this is the first test on purpose; once the cleaner has been fetched it stays fetched.
  it('shows nothing until it has been cleaned, then the clean text', async () => {
    act(() => { root.render(<RichText source="<p>Fresh <strong>olive</strong> oil</p>" className="body" />); });
    expect(host.innerHTML).toBe('');                       // the cleaner is still on its way
    await settle();
    expect(host.querySelector('.body')!.innerHTML).toBe('<p>Fresh <strong>olive</strong> oil</p>');
  });

  it('takes out everything that could run or load something, and keeps the safe formatting', async () => {
    const dirty = '<p onclick="window.__pwn=1">Hi</p><script>window.__pwn=2</script><img src="x" onerror="window.__pwn=3">'
      + '<a href="javascript:window.__pwn=4">bad</a><a href="https://example.com/x">good</a><iframe src="https://evil.example"></iframe>'
      + '<svg onload="window.__pwn=5"></svg><style>p{display:none}</style><h1>Title</h1>';
    act(() => { root.render(<RichText source={dirty} className="body" />); });
    await settle();
    const html = host.querySelector('.body')!.innerHTML;
    expect(html).not.toMatch(/<script|<img|<iframe|<svg|<style|onclick|onerror|onload|javascript:/i);
    expect(html).toContain('<p>Hi</p>');
    expect(html).toContain('<h1>Title</h1>');
    expect(host.querySelectorAll('a')).toHaveLength(2);
    const [bad, good] = [...host.querySelectorAll('a')];
    expect(bad.getAttribute('href')).toBeNull();
    expect(good.getAttribute('href')).toBe('https://example.com/x');
    expect(good.getAttribute('target')).toBe('_blank');
    expect(good.getAttribute('rel')).toBe('noopener noreferrer nofollow');
    expect((window as any).__pwn).toBeUndefined();
  });

  it('is shown at once the next time, with no gap, because the cleaner is already here', async () => {
    act(() => { root.render(<RichText source="<p>again</p>" className="body" />); });
    expect(host.querySelector('.body')!.innerHTML).toBe('<p>again</p>');
  });

  it('follows a change of text', async () => {
    act(() => { root.render(<RichText source="<p>one</p>" className="body" />); });
    await settle();
    act(() => { root.render(<RichText source="<p>two</p>" className="body" />); });
    expect(host.querySelector('.body')!.innerHTML).toBe('<p>two</p>');
  });

  it('passes the class on', async () => {
    act(() => { root.render(<RichText source="<p>x</p>" className="prose max-w-none" />); });
    await settle();
    expect(host.firstElementChild!.className).toBe('prose max-w-none');
  });
});

describe('the plain-text fallback, for when the cleaner cannot be fetched', () => {
  it('keeps the words and none of the markup', () => {
    expect(plainTextOf('<p>Hello <b>world</b> &amp; friends</p>')).toBe('Hello world & friends');
  });
  it('drops code, styles and embedded objects instead of reading them out', () => {
    expect(plainTextOf('<p>Keep</p><script>alert(1)</script><style>p{}</style><iframe src="x">frame</iframe><svg><text>vector</text></svg>')).toBe('Keep');
  });
  it('does not run anything while reading', () => {
    plainTextOf('<img src="x" onerror="window.__pwn=1"><script>window.__pwn=2</script>');
    expect((window as any).__pwn).toBeUndefined();
  });
});

describe('the cleaner is not in the first download', () => {
  it('the storefront reaches it only through the lazy component, never with a static import', () => {
    expect(read('src/components/CustomBlocksRenderer.tsx')).not.toMatch(/sanitizeRichText|dompurify/i);
    expect(read('src/components/CustomBlocksRenderer.tsx')).toContain("import { RichText } from '../lib/richText';");
    const lib = read('src/lib/richText.tsx');
    expect(lib).toContain("import('../utils/sanitizeRichText')");
    expect(lib).not.toMatch(/^import [^\n]*sanitizeRichText/m);
  });

  it('DOMPurify itself is imported from one file only', () => {
    const walk = (dir: string): string[] => fs.readdirSync(path.resolve(process.cwd(), dir), { withFileTypes: true })
      .flatMap(e => e.isDirectory() ? walk(`${dir}/${e.name}`) : /\.tsx?$/.test(e.name) ? [`${dir}/${e.name}`] : []);
    const importers = walk('src').filter(f => /from 'dompurify'/.test(read(f)));
    expect(importers).toEqual(['src/utils/sanitizeRichText.ts']);
  });
});
