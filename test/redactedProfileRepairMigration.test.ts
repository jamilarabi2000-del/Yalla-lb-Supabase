import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// The repair for profiles saved with "[REDACTED_PII]" in place of their email,
// phone and names (20260924184334, applied to the live project and saved here
// byte for byte).
const sql = fs.readFileSync(path.resolve(process.cwd(), 'supabase/migrations/20260924184334_clear_redacted_profile_placeholders.sql'), 'utf8');
const code = sql.replace(/^--.*$/gm, '');

describe('clearing the "[REDACTED_PII]" placeholder from profiles', () => {
  it('touches only rows that hold it, and deletes nothing', () => {
    expect(code).toContain("'[REDACTED_PII]' in (p.email, p.phone, p.first_name, p.last_name)");
    expect(code).not.toMatch(/\b(delete|truncate|drop|alter)\b/i);
  });

  it('puts the sign-in email back and empties the other placeholders', () => {
    expect(code).toContain("email      = case when p.email = '[REDACTED_PII]' then u.email else p.email end");
    for (const column of ['phone', 'first_name', 'last_name']) {
      expect(code, column).toMatch(new RegExp(`${column}\\s*= nullif\\(p\\.${column}, '\\[REDACTED_PII\\]'\\)`));
    }
  });

  it('leaves the role and the delivery details alone', () => {
    expect(code).not.toMatch(/\brole\b/);
    expect(code).not.toMatch(/default_(city|address|building|notes)/);
  });
});
