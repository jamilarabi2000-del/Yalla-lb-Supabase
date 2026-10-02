import type { SiteContent } from '../types';

/** The two messages CMS Studio sends to the storefront preview it frames. */
export type CmsPreviewMessage =
  | { type: 'CMS_DRAFT_UPDATE'; payload: SiteContent }
  | { type: 'CMS_LANG_UPDATE'; payload: 'ar' | 'en' };

type MessageLike = { origin: string; source: unknown; data: unknown };

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * What the preview page accepts from postMessage: a message from the CMS Studio
 * page that framed it (same origin, and that very window), in one of the two
 * shapes above. Preview mode is switched on by a public address (?cmsPreview=1),
 * so anything else, from any other window, is ignored.
 */
export function readPreviewMessage(
  event: MessageLike,
  ownOrigin: string,
  parentWindow: unknown,
): CmsPreviewMessage | null {
  if (event.origin !== ownOrigin || event.source !== parentWindow) return null;
  const { data } = event;
  if (!isPlainObject(data)) return null;
  if (data.type === 'CMS_DRAFT_UPDATE' && isPlainObject(data.payload)) {
    return { type: 'CMS_DRAFT_UPDATE', payload: data.payload as unknown as SiteContent };
  }
  if (data.type === 'CMS_LANG_UPDATE' && (data.payload === 'ar' || data.payload === 'en')) {
    return { type: 'CMS_LANG_UPDATE', payload: data.payload };
  }
  return null;
}
