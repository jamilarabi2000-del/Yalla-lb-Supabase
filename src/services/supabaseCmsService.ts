import { supabase } from '../lib/supabase';
import { CMSCustomBlock, SiteContent } from '../types';
import { DEFAULT_SITE_CONTENT } from '../data/cmsContent';

export function mapSupabaseCmsBlock(row: Record<string, any>): CMSCustomBlock {
  return {
    id: String(row.id || ''),
    title: String(row.title || ''),
    subtitle: row.subtitle ?? undefined,
    content: String(row.content || ''),
    badge: row.badge ?? undefined,
    buttonText: row.button_text ?? row.buttonText ?? undefined,
    buttonTextArabic: row.button_text_arabic ?? row.buttonTextArabic ?? undefined,
    buttonUrl: row.button_url ?? row.buttonUrl ?? undefined,
    imageUrl: row.image_url ?? row.imageUrl ?? undefined,
    bgStyle: (row.bg_style || row.bgStyle || 'light') as any,
    customBgColor: row.custom_bg_color ?? row.customBgColor ?? undefined,
    customTextColor: row.custom_text_color ?? row.customTextColor ?? undefined,
    targetPage: (row.target_page || row.targetPage || 'home') as any,
    position: (row.position || 'middle') as any,
    isPublished: row.is_published !== undefined ? Boolean(row.is_published) : (row.isPublished !== undefined ? Boolean(row.isPublished) : true),
    order: row.order != null ? Number(row.order) : 0,
  };
}

export const supabaseCmsService = {
  /**
   * Fetches public CMS custom blocks from get_public_cms_blocks() RPC or cms_blocks table.
   */
  async getPublicCmsBlocks(): Promise<CMSCustomBlock[]> {
    try {
      // 1. Try RPC get_public_cms_blocks()
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_public_cms_blocks');
      if (!rpcError && Array.isArray(rpcData) && rpcData.length > 0) {
        return rpcData.map(mapSupabaseCmsBlock);
      }

      // 2. Query cms_blocks table
      const { data, error } = await supabase
        .from('cms_blocks')
        .select('*')
        .eq('is_published', true)
        .order('order', { ascending: true });

      if (!error && data && data.length > 0) {
        return data.map(mapSupabaseCmsBlock);
      }

      return DEFAULT_SITE_CONTENT.customBlocks || [];
    } catch {
      return DEFAULT_SITE_CONTENT.customBlocks || [];
    }
  },

  /**
   * Fetches all CMS blocks (including drafts for Admin).
   */
  async fetchAllCmsBlocks(): Promise<CMSCustomBlock[]> {
    try {
      const { data, error } = await supabase
        .from('cms_blocks')
        .select('*')
        .order('order', { ascending: true });

      if (!error && data && data.length > 0) {
        return data.map(mapSupabaseCmsBlock);
      }

      return DEFAULT_SITE_CONTENT.customBlocks || [];
    } catch {
      return DEFAULT_SITE_CONTENT.customBlocks || [];
    }
  },

  /**
   * Fetches site content / theme / visibility config.
   */
  async fetchSiteContent(): Promise<SiteContent> {
    try {
      const { data, error } = await supabase
        .from('cms_content')
        .select('content')
        .eq('id', 'default')
        .maybeSingle();

      if (!error && data?.content) {
        return {
          ...DEFAULT_SITE_CONTENT,
          ...data.content,
        };
      }

      return DEFAULT_SITE_CONTENT;
    } catch {
      return DEFAULT_SITE_CONTENT;
    }
  },

  /**
   * Saves site content config to Supabase.
   */
  async saveSiteContent(content: SiteContent): Promise<void> {
    try {
      await supabase.from('cms_content').upsert({
        id: 'default',
        content,
        updated_at: new Date().toISOString(),
      });
    } catch (err) {
      console.warn('[supabaseCmsService] saveSiteContent error:', err);
    }
  },

  /**
   * Upserts a custom CMS block.
   */
  async upsertCustomBlock(block: Partial<CMSCustomBlock> & { id: string }): Promise<void> {
    const payload = {
      id: block.id,
      title: block.title,
      subtitle: block.subtitle,
      content: block.content,
      badge: block.badge,
      button_text: block.buttonText,
      button_text_arabic: block.buttonTextArabic,
      button_url: block.buttonUrl,
      image_url: block.imageUrl,
      bg_style: block.bgStyle,
      custom_bg_color: block.customBgColor,
      custom_text_color: block.customTextColor,
      target_page: block.targetPage,
      position: block.position,
      is_published: block.isPublished,
      order: block.order,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('cms_blocks').upsert(payload);
    if (error) {
      console.warn('[supabaseCmsService] upsertCustomBlock error:', error.message);
    }
  },

  /**
   * Deletes a custom CMS block by ID.
   */
  async deleteCustomBlock(id: string): Promise<void> {
    const { error } = await supabase.from('cms_blocks').delete().eq('id', id);
    if (error) {
      console.warn('[supabaseCmsService] deleteCustomBlock error:', error.message);
    }
  },
};
