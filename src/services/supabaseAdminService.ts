import { supabase } from '../lib/supabase';
import { toUserFacingError } from '../utils/userFacingError';

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
    if (error) throw toUserFacingError(error, 'Unable to load activity history right now.');

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

  /**
   * Records a storefront search. A signed-in shopper's search carries their
   * account (search_insert accepts user_id = auth.uid() or null). `at` is sent
   * only for a search queued while offline, so it keeps the time it happened.
   * The error is thrown as PostgREST returned it, so the caller can tell a
   * dropped connection, worth retrying, from a refusal.
   */
  async logSearch(query: string, origin: string, userId: string | null = null, at?: string) {
    const { error } = await supabase.from('search_logs').insert({
      query,
      origin,
      user_id: userId,
      ...(at ? { created_at: at } : {}),
    });
    if (error) throw error;
  },
};
