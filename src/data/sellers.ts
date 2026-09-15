import { Seller } from '../types';

/**
 * Production seller records are owned by Supabase.
 *
 * This legacy export is intentionally empty so bundled/sample sellers can
 * never become authoritative application data or a fallback identity source.
 */
export const DEFAULT_SELLERS: Seller[] = [];
