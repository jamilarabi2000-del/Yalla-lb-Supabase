import { supabase } from '../lib/supabase';
import { toUserFacingError } from '../utils/userFacingError';

/**
 * The longest search the database keeps (the search_logs_query_length check, migration
 * 20261004100300). Counted in characters as PostgreSQL counts them (code points), so a search
 * in Arabic or with an emoji is cut at the same place the check measures, never inside a character.
 */
export const MAX_LOGGED_SEARCH_LENGTH = 200;

/** A search as it is logged: cut to MAX_LOGGED_SEARCH_LENGTH characters, so a long paste is kept, not refused. */
export function forSearchLog(query: string): string {
  const characters = Array.from(query);
  return characters.length <= MAX_LOGGED_SEARCH_LENGTH ? query : characters.slice(0, MAX_LOGGED_SEARCH_LENGTH).join('');
}

/**
 * Admin-only data access helpers.
 * Authorization is enforced by Supabase RLS/database functions; this module
 * never uses a service-role key in the browser.
 */
export const supabaseAdminService = {
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
      query: forSearchLog(query),
      origin,
      user_id: userId,
      ...(at ? { created_at: at } : {}),
    });
    if (error) throw error;
  },
};
