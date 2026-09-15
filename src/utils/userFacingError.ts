/**
 * Converts database/API failures into messages that are safe to show in the UI.
 *
 * IMPORTANT: Supabase/Postgres error.message/details/hint can contain schema,
 * table, constraint, SQL, RPC, or implementation details. Never render those
 * values directly in customer-facing UI.
 */
export interface UserFacingError extends Error {
  readonly publicCode: string;
  readonly retryable: boolean;
}

type DatabaseLikeError = {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  hint?: unknown;
  status?: unknown;
};

const makeError = (
  publicCode: string,
  message: string,
  retryable = false,
): UserFacingError => {
  const error = new Error(message) as UserFacingError;
  error.name = 'UserFacingError';
  Object.defineProperties(error, {
    publicCode: { value: publicCode, enumerable: true },
    retryable: { value: retryable, enumerable: true },
  });
  return error;
};

/**
 * Safe boundary for Supabase/Postgres/PostgREST failures.
 * The raw error is deliberately not copied into the returned Error object.
 */
export function toUserFacingError(
  input: unknown,
  fallback = 'Something went wrong. Please try again.',
): UserFacingError {
  if (
    input &&
    typeof input === 'object' &&
    (input as UserFacingError).name === 'UserFacingError'
  ) {
    return input as UserFacingError;
  }

  const error = (input ?? {}) as DatabaseLikeError;
  const code = typeof error.code === 'string' ? error.code.toUpperCase() : '';
  const message = typeof error.message === 'string' ? error.message : '';
  const status = typeof error.status === 'number' ? error.status : undefined;
  const signal = `${code} ${message}`.toLowerCase();

  if (code === '23505' || signal.includes('duplicate') || signal.includes('already exists')) {
    return makeError('DUPLICATE', 'This item already exists. Please review the values and try again.');
  }

  if (code === '23503' || signal.includes('foreign key')) {
    return makeError('DEPENDENCY', 'This item cannot be changed because it is still being used.');
  }

  if (code === '23514' || signal.includes('check constraint') || signal.includes('violates check')) {
    return makeError('INVALID_DATA', 'Some of the information is invalid. Please review it and try again.');
  }

  if (code === '42501' || status === 401 || status === 403 || signal.includes('permission denied') || signal.includes('row-level security')) {
    return makeError('FORBIDDEN', 'You do not have permission to perform this action. Please sign in again if needed.');
  }

  if (code === 'PGRST116') {
    return makeError('NOT_FOUND', 'The requested item could not be found.');
  }

  if (code === 'PGRST202' || code === 'PGRST106') {
    return makeError('SERVICE_CONFIGURATION', 'This feature is temporarily unavailable. Please try again later.');
  }

  if (
    status === 408 ||
    status === 429 ||
    signal.includes('timeout') ||
    signal.includes('failed to fetch') ||
    signal.includes('network') ||
    signal.includes('connection')
  ) {
    return makeError('NETWORK', 'A network problem occurred. Please check your connection and try again.', true);
  }

  return makeError('UNKNOWN', fallback, true);
}

/**
 * Convenience helper for async catch blocks.
 */
export function safeErrorMessage(
  input: unknown,
  fallback?: string,
): string {
  return toUserFacingError(input, fallback).message;
}
