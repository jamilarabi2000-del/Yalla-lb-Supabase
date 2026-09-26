import { supabase } from './supabase';
import { promptStepUpModal } from '../utils/adminMfa';
import { generateUuidV4 } from '../utils/uuid';

/**
 * Images the administrator uploads are saved as files in the public
 * `yalla-media` bucket, in up to three widths, and the CMS keeps only their
 * address. They used to be pasted into the site settings as text, which every
 * visitor downloaded on every page whether the image was shown or not.
 *
 * The widths are written after `#w=` at the end of the address. The browser
 * never sends that part, so the address works anywhere as it is, and the
 * storefront reads it to offer a phone the smaller file (responsiveImage.ts).
 *
 * Supabase resizes on request only on paid plans, so the sizes are made here,
 * once, in the administrator's browser.
 */

export const MEDIA_BUCKET = 'yalla-media';
export const IMAGE_WIDTHS = [480, 960, 1600] as const;
/** Every file gets a new name, so browsers and the CDN may keep it for a year. */
export const MEDIA_CACHE_SECONDS = '31536000';
/** The bucket's own limit (storage.buckets.file_size_limit). */
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const UPLOADABLE_AS_IS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' };

export interface UploadedImage {
  /** Public address of the widest file, with `#w=` listing every width saved. */
  url: string;
  widths: number[];
  /** Size of the widest file. */
  bytes: number;
}

/**
 * The widths to save for an image `natural` pixels wide: the widest is the
 * image itself, capped at `max`; smaller steps are kept only when they are
 * clearly smaller (under 80% of the widest).
 */
export function targetWidths(natural: number, max: number = IMAGE_WIDTHS[IMAGE_WIDTHS.length - 1]): number[] {
  const top = Math.max(1, Math.round(Math.min(natural, max)));
  return [...IMAGE_WIDTHS.filter(w => w < top * 0.8), top];
}

/** `cms/2026/09/<id>-960.webp`; without a width for a file saved as it is. */
export function mediaPath(folder: string, id: string, width: number | null, ext: string, now: Date = new Date()): string {
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${folder}/${now.getUTCFullYear()}/${month}/${id}${width === null ? '' : `-${width}`}.${ext}`;
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function withWidths(publicUrl: string, widths: number[]): string {
  return `${publicUrl}#w=${widths.join(',')}`;
}

/**
 * A pasted `data:image/...;base64,` value as a file. Decoded by hand: the
 * site's Content-Security-Policy does not let fetch() read data: addresses.
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(dataUrl.trim());
  if (!match) throw new Error('Not a pasted image.');
  const binary = atob(match[2].replace(/\s+/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: match[1].toLowerCase() });
}

const isPastedImage = (value: unknown): value is string =>
  typeof value === 'string' && /^data:image\/[a-z0-9.+-]+;base64,/i.test(value.trim());

/** Every distinct pasted image anywhere in the CMS content. */
export function findPastedImages(content: unknown): string[] {
  const found = new Set<string>();
  const walk = (value: unknown) => {
    if (isPastedImage(value)) found.add(value);
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') Object.values(value).forEach(walk);
  };
  walk(content);
  return [...found];
}

/** A copy of `content` with each string in `replacements` swapped for its new value. */
export function replaceStrings<T>(content: T, replacements: Map<string, string>): T {
  const walk = (value: unknown): unknown => {
    if (typeof value === 'string') return replacements.get(value) ?? value;
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v)]));
    }
    return value;
  };
  return walk(content) as T;
}

const needsStepUp = (error: { message?: string; statusCode?: string | number; status?: number }) =>
  String(error.statusCode ?? error.status ?? '') === '403' || /row-level security|unauthori[sz]ed/i.test(error.message ?? '');

/**
 * Saving a file needs a verified administrator (the bucket's upload rule is
 * is_admin_verified()). If the last authenticator code is too old, ask for it
 * once and try again.
 */
async function put(path: string, file: Blob, contentType: string): Promise<void> {
  const attempt = () => supabase.storage.from(MEDIA_BUCKET).upload(path, file, {
    cacheControl: MEDIA_CACHE_SECONDS,
    contentType,
    upsert: false,
  });
  let { error } = await attempt();
  if (error && needsStepUp(error)) {
    if (!(await promptStepUpModal())) throw new Error('Uploading images needs your authenticator code.');
    ({ error } = await attempt());
  }
  if (error) throw new Error(`The image could not be uploaded: ${error.message}`);
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('This file could not be read as an image.')); };
    img.src = url;
  });
}

function encode(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(resolve, type, quality));
}

/** Draw `img` at `width` and encode it: WebP where the browser can, JPEG otherwise. */
async function resized(img: HTMLImageElement, width: number, type: string, quality: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = Math.max(1, Math.round(img.naturalHeight * (width / img.naturalWidth)));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot resize images.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await encode(canvas, type, quality);
  if (!blob) throw new Error('This browser cannot resize images.');
  return blob;
}

/**
 * Resize `file` to the widths above and save each one to Storage. A file the
 * browser cannot draw (HEIC in some browsers) is saved as it is when the
 * bucket accepts its type.
 */
export async function uploadImage(
  file: Blob,
  { folder = 'cms', maxWidth = IMAGE_WIDTHS[IMAGE_WIDTHS.length - 1], quality = 0.8 }: { folder?: string; maxWidth?: number; quality?: number } = {},
): Promise<UploadedImage> {
  const id = generateUuidV4();
  const now = new Date();
  let img: HTMLImageElement | null = null;
  try {
    img = await loadImage(file);
  } catch {
    const ext = UPLOADABLE_AS_IS[file.type];
    if (!ext || file.size > MAX_UPLOAD_BYTES) {
      throw new Error('This image type cannot be used. Please choose a JPG, PNG or WebP under 8 MB.');
    }
    const path = mediaPath(folder, id, null, ext, now);
    await put(path, file, file.type);
    return { url: supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl, widths: [], bytes: file.size };
  }

  const widths = targetWidths(img.naturalWidth, maxWidth);
  // One format for every width, so the storefront can swap only the width.
  let type = 'image/webp';
  const first = await resized(img, widths[0], type, quality);
  if (first.type !== 'image/webp') type = 'image/jpeg';
  const ext = type === 'image/webp' ? 'webp' : 'jpg';

  let bytes = 0;
  for (const width of widths) {
    let blob = width === widths[0] && first.type === type ? first : await resized(img, width, type, quality);
    // Already this format at this width: keep it when re-encoding would only grow it.
    if (width === img.naturalWidth && file.type === type && file.size <= blob.size) blob = file;
    if (blob.size > MAX_UPLOAD_BYTES) throw new Error('The resized image is still over 8 MB.');
    await put(mediaPath(folder, id, width, ext, now), blob, type);
    bytes = blob.size;
  }

  const top = widths[widths.length - 1];
  const publicUrl = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(mediaPath(folder, id, top, ext, now)).data.publicUrl;
  return { url: withWidths(publicUrl, widths), widths, bytes };
}
