import { describe, expect, it } from 'vitest';
import { toUserFacingError } from '../src/utils/userFacingError';

describe('toUserFacingError', () => {
  it('never exposes raw Postgres details for duplicate errors', () => {
    const error = toUserFacingError({
      code: '23505',
      message: 'duplicate key value violates unique constraint "profiles_email_key"',
      details: 'Key (email)=(secret@example.com) already exists.',
    });

    expect(error.message).toBe('This item already exists. Please review the values and try again.');
    expect(error.message).not.toContain('profiles_email_key');
    expect(error.message).not.toContain('secret@example.com');
  });

  it('maps RLS/permission failures to a generic authorization message', () => {
    const error = toUserFacingError({
      code: '42501',
      message: 'permission denied for table private_admin_secrets',
    });

    expect(error.message).toBe('You do not have permission to perform this action. Please sign in again if needed.');
    expect(error.message).not.toContain('private_admin_secrets');
  });

  it('maps transient network failures as retryable', () => {
    const error = toUserFacingError({
      message: 'TypeError: Failed to fetch https://internal.example.invalid',
    });

    expect(error.publicCode).toBe('NETWORK');
    expect(error.retryable).toBe(true);
    expect(error.message).not.toContain('internal.example.invalid');
  });

  it('does not copy arbitrary database errors into the returned Error', () => {
    const error = toUserFacingError({
      code: 'XX000',
      message: 'SQL statement leaked here',
      details: 'SELECT * FROM private.secret_table',
      hint: 'internal implementation detail',
    });

    expect(error.message).toBe('Something went wrong. Please try again.');
    expect(error.message).not.toContain('SQL');
    expect(error.message).not.toContain('secret_table');
  });
});
