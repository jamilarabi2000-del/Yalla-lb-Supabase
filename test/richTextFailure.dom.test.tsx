// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// If the cleaner cannot be fetched (the connection dropped half-way), the reader
// still gets the words of the text, as plain text: never the unclean markup.
vi.mock('../src/utils/sanitizeRichText', () => { throw new Error('the file could not be fetched'); });
const { RichText } = await import('../src/lib/richText');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; });

describe('when the cleaner cannot be fetched', () => {
  it('shows nothing while it tries, then the words as plain text, with no markup and no code', async () => {
    act(() => { root.render(<RichText source={'<p onclick="window.__x=1">Fresh <b>olive</b> oil</p><script>window.__x=2</script><a href="javascript:window.__x=3">link</a>'} className="body" />); });
    expect(host.innerHTML).toBe('');
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 80)); });
    const box = host.querySelector('.body')!;
    expect(box.textContent).toBe('Fresh olive oillink');
    expect(box.children).toHaveLength(0);                  // text only: no elements inside
    expect(host.innerHTML).not.toMatch(/<p|<b>|<script|<a |onclick|javascript:/);
    expect((window as any).__x).toBeUndefined();
  });
});
