import { describe, expect, it } from 'vitest';
import { sanitizeError, safeErrorMessage } from '../src/utils/errorSanitizer';

describe('database error sanitization', () => {
  it('maps known Postgres errors to safe messages', () => {
    expect(safeErrorMessage({ code: '23505', message: 'duplicate key value violates constraint products_sku_key' }))
      .toBe('This item already exists.');
  });

  it('never returns raw SQL/schema details for unknown errors', () => {
    const result = sanitizeError({
      code: 'XX000',
      message: 'relation private.secret_table does not exist at SQL statement SELECT * FROM private.secret_table'
    });
    expect(result.message).toBe('Something went wrong. Please try again.');
    expect(result.message).not.toContain('private.secret_table');
    expect(result.message).not.toContain('SELECT');
  });

  it('maps authorization failures without exposing RLS policy names', () => {
    expect(safeErrorMessage({ code: '42501', message: 'new row violates row-level security policy secret_admin_policy' }))
      .toBe('You do not have permission to perform this action.');
  });

  it('handles primitive and empty errors safely', () => {
    expect(safeErrorMessage('database connection failed')).toBe('Something went wrong. Please try again.');
    expect(safeErrorMessage(null)).toBe('Something went wrong. Please try again.');
  });
});
