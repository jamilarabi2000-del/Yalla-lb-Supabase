// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// The picker said "Image URL failed to load. A high-quality fallback is shown
// on the storefront." That was not true for every slide, said nothing about
// where the link pointed, and hid "open in new tab" exactly when it was
// needed. It now says where the address points, keeps the link, lets the
// administrator try again, and offers to upload the picture instead.
vi.mock('../src/lib/mediaUpload', () => ({
  uploadImage: vi.fn(),
  formatBytes: (n: number) => `${n} B`,
}));
const { MediaAssetPicker } = await import('../src/components/admin/cms/MediaAssetPicker');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
const IBB = 'https://i.ibb.co/xqBR6fmv/Lebanon-2-0.jpg';
const render = (value: string, onChange = vi.fn()) =>
  act(() => root.render(<MediaAssetPicker label="Slide image" value={value} onChange={onChange} />));
const preview = () => host.querySelector('img[alt="Preview"]') as HTMLImageElement | null;
const fail = (img: HTMLImageElement) => act(() => { img.dispatchEvent(new Event('error')); });
const alert = () => host.querySelector('[role="alert"]') as HTMLElement | null;
const button = (name: string) => [...host.querySelectorAll('button')].find(b => b.textContent?.includes(name)) as HTMLButtonElement | undefined;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

describe('an image that cannot be loaded', () => {
  it('says where the address points, and no longer promises a fallback', () => {
    render(IBB);
    expect(alert()).toBeNull();
    fail(preview()!);
    const text = alert()!.textContent!;
    expect(text).toContain('This image could not be loaded from i.ibb.co.');
    expect(text).toContain('Visitors may not see it either.');
    expect(text).toContain('uploading the picture itself is the reliable choice');
    expect(text).not.toMatch(/fallback|high-quality/i);
  });

  it('keeps a link that opens the address in a new tab', () => {
    render(IBB);
    fail(preview()!);
    const link = [...alert()!.querySelectorAll('a')].find(a => a.textContent?.includes('Open link'))!;
    expect(link.getAttribute('href')).toBe(IBB);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    // The small icon beside the field stays too, instead of vanishing on failure.
    expect(host.querySelector('a[title="Open image in new tab"]')).not.toBeNull();
  });

  it('Try again asks the server again with a fresh image', () => {
    render(IBB);
    const first = preview()!;
    fail(first);
    expect(preview()).toBeNull(); // the broken thumbnail is replaced by "Broken"
    act(() => button('Try again')!.click());
    expect(alert()).toBeNull();
    const second = preview()!;
    expect(second).not.toBe(first);
    expect(second.getAttribute('src')).toBe(IBB);
    fail(second);
    expect(alert()).not.toBeNull(); // still broken: it says so again
  });

  it('Upload instead opens the file chooser', () => {
    render(IBB);
    fail(preview()!);
    const input = host.querySelector('input[type="file"]') as HTMLInputElement;
    const click = vi.spyOn(input, 'click').mockImplementation(() => {});
    act(() => button('Upload instead')!.click());
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('goes away when the address is changed', () => {
    render(IBB);
    fail(preview()!);
    expect(alert()).not.toBeNull();
    render('https://i.ibb.co/other/ok.jpg');
    expect(alert()).toBeNull();
    expect(preview()).not.toBeNull();
  });

  it('only offers a link it can safely open', () => {
    render('javascript:alert(1)');
    fail(preview()!);
    expect([...alert()!.querySelectorAll('a')]).toHaveLength(0);
    expect(alert()!.textContent).toContain('This image could not be loaded.');
    expect(button('Upload instead')).toBeDefined();
  });

  it('shows nothing for an image that loads, or for an empty field', () => {
    render(IBB);
    expect(alert()).toBeNull();
    render('');
    expect(alert()).toBeNull();
  });
});
