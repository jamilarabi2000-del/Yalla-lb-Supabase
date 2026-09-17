import { safeErrorMessage, diagnosticError } from './errorSanitizer';

/**
 * PII redaction for anything that reaches a log or a diagnostic buffer.
 *
 * This module previously also exported a `dbMonitor` object and a set of
 * `monitored*Doc` helpers. They were Firestore-era shims: `dbMonitor.getSummary`
 * returned hardcoded counters including a permanent `writeSuccessRate: 100`,
 * `subscribe` returned a no-op unsubscribe, and the `monitored*` helpers
 * resolved to undefined without doing anything. Nothing in the application
 * called any of them -- the admin audit screen reads `public.admin_activities`
 * directly -- so they have been removed rather than left to look like working
 * instrumentation.
 */
export const redactPII = (data: any): any => {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map(redactPII);
  const copy = { ...data };
  for (const key of ['email', 'phone', 'address', 'fullName', 'firstName', 'lastName', 'shipping', 'profile', 'user']) {
    if (key in copy) copy[key] = '[REDACTED_PII]';
  }
  return copy;
};

export const sanitizeDocumentData = redactPII;

/** Add only sanitized diagnostics to the browser-visible monitoring buffer. */
export const sanitizeDatabaseError = (error: unknown) => {
  const safe = safeErrorMessage(error);
  const diagnostic = diagnosticError(error);
  return { errorMessage: safe, errorCode: diagnostic.code };
};
