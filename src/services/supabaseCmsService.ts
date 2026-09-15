import { supabase } from '../lib/supabase';
import { CMSCustomBlock, SiteContent } from '../types';
import { DEFAULT_SITE_CONTENT } from '../data/cmsContent';

type CmsBlockRecord = CMSCustomBlock & {
  contentType?: 'text' | 'image' | 'product' | 'mixed' | 'empty';
  imageMobileUrl?: string;
  imageFit?: 'contain' | 'cover' | 'fill' | 'none';
  aspectRatioDesktop?: string;
  aspectRatioMobile?: string;
  productId?: string;
  isSlider?: boolean;
  sliderAutoplay?: boolean;
  sliderIntervalMs?: number;
  openInNewTab?: boolean;
  metadata?: Record<string, unknown>;
};

function mapSupabaseCmsBlock(row: Record<string, any>): CmsBlockRecord {
  return {
    id: String(row.id || ''), title: String(row.title || ''), subtitle: row.subtitle ?? undefined,
    content: String(row.content || ''), badge: row.badge ?? undefined,
    buttonText: row.button_text ?? undefined, buttonTextArabic: row.button_text_arabic ?? undefined,
    buttonUrl: row.button_url ?? undefined, imageUrl: row.image_url ?? undefined,
    bgStyle: (row.bg_style || 'light') as CMSCustomBlock['bgStyle'],
    customBgColor: row.custom_bg_color ?? undefined, customTextColor: row.custom_text_color ?? undefined,
    targetPage: (row.target_page || 'home') as CMSCustomBlock['targetPage'],
    position: (row.position || 'middle') as CMSCustomBlock['position'],
    isPublished: row.is_published !== undefined ? Boolean(row.is_published) : true,
    order: Number(row.display_order ?? 0), contentType: row.content_type || 'mixed',
    imageMobileUrl: row.image_mobile_url ?? undefined, imageFit: row.image_fit || 'contain',
    aspectRatioDesktop: row.aspect_ratio_desktop ?? undefined, aspectRatioMobile: row.aspect_ratio_mobile ?? undefined,
    productId: row.product_id ?? undefined, isSlider: Boolean(row.is_slider),
    sliderAutoplay: row.slider_autoplay !== undefined ? Boolean(row.slider_autoplay) : true,
    sliderIntervalMs: Number(row.slider_interval_ms ?? 5000), openInNewTab: Boolean(row.open_in_new_tab),
    metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
  };
}

export { mapSupabaseCmsBlock };
const PUBLIC_SITE_CONTENT_SELECT = 'content';

const fetchBlocks = async (publishedOnly: boolean): Promise<CMSCustomBlock[]> => {
  let request: any = supabase.from('cms_custom_blocks').select('*').order('display_order', { ascending: true });
  if (publishedOnly) request = request.eq('is_published', true);
  const { data, error } = await request;
  if (error) throw error;
  return (data ?? []).map(mapSupabaseCmsBlock) as CMSCustomBlock[];
};

export const supabaseCmsService = {
  async getPublicCmsBlocks(): Promise<CMSCustomBlock[]> {
    try { return await fetchBlocks(true); } catch (error) {
      console.warn('[supabaseCmsService] getPublicCmsBlocks:', error);
      return DEFAULT_SITE_CONTENT.customBlocks || [];
    }
  },

  async fetchAllPublicCmsBlocks(): Promise<CMSCustomBlock[]> {
    return this.getPublicCmsBlocks();
  },

  async fetchAllCmsBlocks(): Promise<CMSCustomBlock[]> {
    try { return await fetchBlocks(false); } catch (error) {
      console.warn('[supabaseCmsService] fetchAllCmsBlocks:', error);
      return DEFAULT_SITE_CONTENT.customBlocks || [];
    }
  },

  async fetchSiteContent(): Promise<SiteContent> {
    const { data, error } = await supabase.from('cms_site_content').select(PUBLIC_SITE_CONTENT_SELECT).eq('id', 'main').eq('published', true).maybeSingle();
    if (error || !data?.content) return DEFAULT_SITE_CONTENT;
    return { ...DEFAULT_SITE_CONTENT, ...data.content, customBlocks: Array.isArray(data.content.customBlocks) ? data.content.customBlocks : DEFAULT_SITE_CONTENT.customBlocks };
  },

  async fetchAdminSiteContent(): Promise<SiteContent> {
    const { data, error } = await supabase.from('cms_site_content').select('content, published, updated_at, updated_by').eq('id', 'main').maybeSingle();
    if (error || !data?.content) return DEFAULT_SITE_CONTENT;
    return { ...DEFAULT_SITE_CONTENT, ...data.content, customBlocks: Array.isArray(data.content.customBlocks) ? data.content.customBlocks : DEFAULT_SITE_CONTENT.customBlocks };
  },

  async saveSiteContent(content: SiteContent): Promise<void> {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id ?? null;

    // Snapshot the state being saved. RLS on cms_content_versions restricts this to authorized admins.
    const { error: versionError } = await supabase.from('cms_content_versions').insert({
      content,
      published: true,
      created_by: userId,
    });
    if (versionError) throw versionError;

    const { error } = await supabase.from('cms_site_content').upsert({ id: 'main', content, published: true, updated_by: userId, updated_at: new Date().toISOString() }, { onConflict: 'id' });
    if (error) throw error;
  },

  async restoreSiteContent(content: SiteContent): Promise<void> {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id ?? null;
    if (!userId) throw new Error('Authentication required.');

    // Preserve the CURRENT live state first, so Restore is reversible.
    const { data: current, error: currentError } = await supabase
      .from('cms_site_content')
      .select('content')
      .eq('id', 'main')
      .maybeSingle();
    if (currentError) throw currentError;
    if (current?.content) {
      const { error: snapshotError } = await supabase.from('cms_content_versions').insert({
        content: current.content,
        published: true,
        created_by: userId,
      });
      if (snapshotError) throw snapshotError;
    }

    const { error } = await supabase.from('cms_site_content').upsert({
      id: 'main',
      content,
      published: true,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
    if (error) throw error;
  },

  async upsertCustomBlock(block: Partial<CmsBlockRecord> & { id: string }): Promise<CMSCustomBlock> {
    const payload = {
      id: block.id, title: block.title ?? '', subtitle: block.subtitle ?? null, content: block.content ?? '', badge: block.badge ?? null,
      button_text: block.buttonText ?? null, button_text_arabic: block.buttonTextArabic ?? null, button_url: block.buttonUrl ?? null,
      image_url: block.imageUrl ?? null, bg_style: block.bgStyle ?? 'light', custom_bg_color: block.customBgColor ?? null,
      custom_text_color: block.customTextColor ?? null, target_page: block.targetPage ?? 'home', position: block.position ?? 'middle',
      is_published: block.isPublished ?? false, display_order: Number(block.order ?? 0), content_type: block.contentType ?? 'mixed',
      image_mobile_url: block.imageMobileUrl ?? null, image_fit: block.imageFit ?? 'contain', aspect_ratio_desktop: block.aspectRatioDesktop ?? null,
      aspect_ratio_mobile: block.aspectRatioMobile ?? null, product_id: block.productId ?? null, is_slider: block.isSlider ?? false,
      slider_autoplay: block.sliderAutoplay ?? true, slider_interval_ms: block.sliderIntervalMs ?? 5000, open_in_new_tab: block.openInNewTab ?? false,
      metadata: block.metadata ?? {}, updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from('cms_custom_blocks').upsert(payload, { onConflict: 'id' }).select('*').single();
    if (error) throw error;
    return mapSupabaseCmsBlock(data) as CMSCustomBlock;
  },

  async syncCustomBlocks(previous: CMSCustomBlock[], next: CMSCustomBlock[]): Promise<CMSCustomBlock[]> {
    const previousIds = new Set(previous.map(block => block.id));
    const nextIds = new Set(next.map(block => block.id));
    for (const block of next) await this.upsertCustomBlock(block);
    for (const id of previousIds) if (!nextIds.has(id)) await this.deleteCustomBlock(id);
    return next;
  },

  async deleteCustomBlock(id: string): Promise<void> {
    const { error } = await supabase.from('cms_custom_blocks').delete().eq('id', id);
    if (error) throw error;
  },
};
