import type { PostgrestError } from '@supabase/supabase-js';

/**
 * Convert database/network/auth errors into safe UI copy.
 *
 * IMPORTANT: Postgres/PostgREST messages, hints and details can contain
 * table/column names, SQL, constraint names and internal configuration.
 * They must never be rendered directly to customers.
 */
export function toUserFacingError(
  error: unknown,
  fallback = 'Something went wrong. Please try again.'
): Error {
  if (error instanceof Error && error.name === 'CheckoutError') {
    return error;
  }

  const dbError = error as Partial<PostgrestError> & {
    code?: string;
    status?: number;
  } | null;

  const code = typeof dbError?.code === 'string' ? dbError.code : '';
  const message = typeof dbError?.message === 'string' ? dbError.message : '';

  if (code === '23505') {
    return new Error('That item already exists. Please review the value and try again.');
  }

  if (code === '23503') {
    return new Error('This action cannot be completed because related data is missing or still in use.');
  }

  if (code === '23502' || code === '22P02' || code === 'PGRST102') {
    return new Error('Some of the information provided is invalid. Please review it and try again.');
  }

  if (code === '42501' || /permission denied|row-level security/i.test(message)) {
    return new Error('You do not have permission to perform this action.');
  }

  if (code === 'PGRST301' || code === 'PGRST302' || /jwt|not authenticated|authentication required/i.test(message)) {
    return new Error('Your session has expired. Please sign in again.');
  }

  if (code.startsWith('08') || code === 'PGRST000' || code === 'PGRST001' || code === 'PGRST003') {
    return new Error('The service is temporarily unavailable. Please try again shortly.');
  }

  if (/failed to fetch|network|timeout|timed out/i.test(message)) {
    return new Error('Network problem. Please check your connection and try again.');
  }

  return new Error(fallback);
}

/**
 * Log the full diagnostic only to the developer console. Callers should pass
 * the original error here, while rendering only the sanitized Error above.
 */
export function logDatabaseError(context: string, error: unknown): void {
  if (typeof console !== 'undefined') {
    console.error(`[Yalla:${context}]`, error);
  }
}
