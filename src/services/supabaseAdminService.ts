import { supabase } from '../lib/supabase';

/**
 * Admin-only data access helpers.
 * Authorization is enforced by Supabase RLS/database functions; this module
 * never uses a service-role key in the browser.
 */
export const supabaseAdminService = {
  async ping(): Promise<boolean> {
    try {
      const { error } = await supabase.from('regions').select('id').limit(1);
      return !error;
    } catch {
      return false;
    }
  },

  async fetchActivities(limit = 200) {
    const { data, error } = await supabase
      .from('admin_activities')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;

    return (data || []).map((row: any) => ({
      id: row.id,
      createdAt: row.created_at,
      actionType: row.action_type,
      summary: row.summary,
      details: row.details,
      actorId: row.actor_id,
      targetId: row.target_id,
      snapshotBefore: row.snapshot_before,
      snapshotAfter: row.snapshot_after,
    }));
  },

  async logSearch(query: string, origin: string) {
    const { error } = await supabase.from('search_logs').insert({
      query,
      origin,
      user_id: null,
    });
    if (error) throw error;
  },
};
