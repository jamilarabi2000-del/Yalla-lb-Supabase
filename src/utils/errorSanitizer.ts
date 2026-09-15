/**
 * Convert backend/database errors into safe client-facing messages.
 * Never expose SQL, schema/table names, constraint names, hints, or raw
 * PostgREST/Postgres messages to users or browser-visible diagnostics.
 */
export type SafeError = {
  message: string;
  code?: string;
};

const SAFE_MESSAGES: Record<string, string> = {
  '23505': 'This item already exists.',
  '23503': 'This action cannot be completed because related data is missing.',
  '23514': 'The submitted information is not valid.',
  '42501': 'You do not have permission to perform this action.',
  'PGRST116': 'The requested record could not be found.',
  'PGRST301': 'Your session has expired. Please sign in again.',
  '401': 'Your session has expired. Please sign in again.',
  '403': 'You do not have permission to perform this action.',
  '404': 'The requested record could not be found.',
  '409': 'This action conflicts with a newer change. Please try again.',
  '429': 'Too many requests. Please wait a moment and try again.'
};

const SAFE_TEXT_PATTERNS: Array<[RegExp, string]> = [
  [/not authenticated|jwt|session.*expired|invalid.*token/i, SAFE_MESSAGES.PGRST301],
  [/permission denied|not authorized|forbidden|row-level security/i, SAFE_MESSAGES['42501']],
  [/duplicate|already exists|unique constraint/i, SAFE_MESSAGES['23505']],
  [/foreign key|violates.*reference/i, SAFE_MESSAGES['23503']],
  [/check constraint|violates.*check/i, SAFE_MESSAGES['23514']],
  [/too many requests|rate limit/i, SAFE_MESSAGES['429']]
];

export function sanitizeError(error: unknown, fallback = 'Something went wrong. Please try again.'): SafeError {
  const source = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const code = typeof source.code === 'string' ? source.code : undefined;
  if (code && SAFE_MESSAGES[code]) return { message: SAFE_MESSAGES[code], code };

  const raw = typeof source.message === 'string' ? source.message : typeof error === 'string' ? error : '';
  for (const [pattern, message] of SAFE_TEXT_PATTERNS) {
    if (pattern.test(raw)) return { message, ...(code ? { code } : {}) };
  }

  return { message: fallback, ...(code ? { code } : {}) };
}

export function safeErrorMessage(error: unknown, fallback?: string): string {
  return sanitizeError(error, fallback).message;
}

/** Diagnostic-only representation. Never intended for UI/toasts. */
export function diagnosticError(error: unknown): { code?: string; message: string } {
  const source = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  return {
    ...(typeof source.code === 'string' ? { code: source.code } : {}),
    message: typeof source.message === 'string' ? source.message : String(error ?? '')
  };
}
