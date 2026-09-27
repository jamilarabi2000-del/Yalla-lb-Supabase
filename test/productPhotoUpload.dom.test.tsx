// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import fs from 'node:fs';
import path from 'node:path';

// Product photos could only be pasted as links, so none were in Supabase
// Storage. The product form now has "Upload photo" (main photo) and "Upload
// photos" (gallery), which save each photo to Storage in up to three widths,
// exactly like the CMS image picker.
const uploadImage = vi.fn();
vi.mock('../src/lib/mediaUpload', () => ({ uploadImage: (...args: unknown[]) => uploadImage(...args) }));
const { ImageUploadButton } = await import('../src/components/admin/ImageUploadButton');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
const photo = (name: string) => new File([new Uint8Array([1, 2, 3])], name, { type: 'image/jpeg' });
const pick = async (files: File[]) => {
  const input = host.querySelector('input[type="file"]') as HTMLInputElement;
  Object.defineProperty(input, 'files', { configurable: true, value: files });
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
};

beforeEach(() => {
  uploadImage.mockReset();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

describe('the upload button', () => {
  it('saves a photo to the products folder and hands back its address', async () => {
    uploadImage.mockResolvedValue({ url: 'https://x.supabase.co/storage/v1/object/public/yalla-media/products/2026/09/a-1600.webp#w=480,960,1600', widths: [480, 960, 1600], bytes: 1 });
    const onUploaded = vi.fn();
    act(() => root.render(<ImageUploadButton onUploaded={onUploaded} />));
    expect(host.querySelector('button')!.textContent).toBe('Upload photo');
    expect((host.querySelector('input[type="file"]') as HTMLInputElement).accept).toBe('image/*');

    await pick([photo('soap.jpg')]);
    expect(uploadImage).toHaveBeenCalledWith(expect.any(File), { folder: 'products', maxWidth: 1600 });
    expect(onUploaded).toHaveBeenCalledWith('https://x.supabase.co/storage/v1/object/public/yalla-media/products/2026/09/a-1600.webp#w=480,960,1600');
    expect(host.querySelector('button')!.textContent).toBe('Upload photo');
    expect((host.querySelector('button') as HTMLButtonElement).disabled).toBe(false);
  });

  it('uploads several photos one after another, in the order picked, and shows progress', async () => {
    // Each upload stays open until the test lets it finish.
    const pending: ((v: unknown) => void)[] = [];
    uploadImage.mockImplementation((file: File) => new Promise(resolve => pending.push(() =>
      resolve({ url: `https://s/${file.name}-1600.webp#w=480,1600`, widths: [480, 1600], bytes: 1 }))));
    const onUploaded = vi.fn();
    act(() => root.render(<ImageUploadButton multiple label="Upload photos" onUploaded={onUploaded} />));
    expect((host.querySelector('input[type="file"]') as HTMLInputElement).multiple).toBe(true);
    const text = () => host.querySelector('button')!.textContent;

    await pick([photo('one'), photo('two'), photo('three')]);
    expect(text()).toBe('Uploading 1 of 3…');
    expect((host.querySelector('button') as HTMLButtonElement).disabled).toBe(true);
    await act(async () => pending[0](undefined));
    expect(text()).toBe('Uploading 2 of 3…');
    await act(async () => pending[1](undefined));
    expect(text()).toBe('Uploading 3 of 3…');
    await act(async () => pending[2](undefined));
    expect(text()).toBe('Upload photos');
    expect(onUploaded.mock.calls.map(c => c[0])).toEqual([
      'https://s/one-1600.webp#w=480,1600', 'https://s/two-1600.webp#w=480,1600', 'https://s/three-1600.webp#w=480,1600',
    ]);
  });

  it('says why when a photo cannot be saved, and keeps the ones already saved', async () => {
    uploadImage
      .mockResolvedValueOnce({ url: 'https://s/one-1600.webp#w=480,1600', widths: [480, 1600], bytes: 1 })
      .mockRejectedValueOnce(new Error('This image type cannot be used. Please choose a JPG, PNG or WebP under 8 MB.'));
    const onUploaded = vi.fn();
    act(() => root.render(<ImageUploadButton multiple onUploaded={onUploaded} />));
    await pick([photo('one'), photo('two')]);
    expect(onUploaded).toHaveBeenCalledTimes(1);
    expect(host.querySelector('[role="alert"]')!.textContent).toBe('This image type cannot be used. Please choose a JPG, PNG or WebP under 8 MB.');
  });

  it('lets the same file be picked again', async () => {
    uploadImage.mockResolvedValue({ url: 'https://s/a-1600.webp#w=480,1600', widths: [480, 1600], bytes: 1 });
    act(() => root.render(<ImageUploadButton onUploaded={vi.fn()} />));
    const input = host.querySelector('input[type="file"]') as HTMLInputElement;
    const cleared = vi.spyOn(input, 'value', 'set');
    await pick([photo('a')]);
    expect(cleared).toHaveBeenCalledWith('');
  });
});

describe('the product form', () => {
  const form = fs.readFileSync(path.resolve(process.cwd(), 'src/components/admin/ProductsCatalogManagement.tsx'), 'utf8');

  it('uploads the main photo into the main-photo field', () => {
    expect(form).toContain('<ImageUploadButton id="product-upload-image" label="Upload photo" onUploaded={url=>{setField(\'image\',url);setValidationErrors(v=>({...v,image:\'\'}));}}/>');
  });

  it('shows the new main photo even after an earlier link failed to load', () => {
    // A failed preview hides itself; a new address must get a fresh preview.
    expect(form).toContain('<img key={form.image} src={form.image} alt="Primary product preview"');
  });

  it('adds uploaded gallery photos the same way a pasted link is added', () => {
    expect(form).toContain('<ImageUploadButton id="product-upload-gallery" multiple label="Upload photos" onUploaded={url=>addMediaUrl(\'additionalImages\',url)}/>');
  });
});
