import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// The database half of emailed sign-in codes (20260924170834, applied to the
// live project and saved here byte for byte).
const sql = fs.readFileSync(path.resolve(process.cwd(), 'supabase/migrations/20260924170834_email_code_sign_in.sql'), 'utf8');
const fn = (name: string) => sql.slice(sql.indexOf(`create or replace function public.${name}`), sql.indexOf('$function$;', sql.indexOf(`create or replace function public.${name}`)));

describe('handle_new_user keeps the sign-up details', () => {
  const body = fn('handle_new_user');

  it('copies City / Region and the rest of the form from user metadata, trimmed and bounded', () => {
    for (const key of ['first_name', 'last_name', 'default_city', 'default_address', 'default_building', 'default_notes']) {
      expect(body, key).toMatch(new RegExp(`nullif\\(left\\(btrim\\(coalesce\\(v_meta->>'${key}', ''\\)\\), \\d+\\), ''\\)`));
    }
  });

  it('never takes a role from what the browser sent', () => {
    expect(body).toContain("'customer'");
    expect(body).not.toMatch(/->>'role'/);
    expect(body).toContain('on conflict (id) do update set email = excluded.email');
  });

  it('runs with a fixed search path', () => {
    expect(body).toMatch(/security definer\s+set search_path to ''/);
  });
});

describe('custom_access_token_hook refuses password sessions to everyone but the administrator', () => {
  const body = fn('custom_access_token_hook');

  it('recognises a password sign-in and a refresh of one', () => {
    expect(body).toContain("coalesce(event->>'authentication_method', '') <> 'password'");
    expect(body).toContain(`@> '[{"method": "password"}]'::jsonb`);
  });

  it('lets only a profile with role admin through, and refuses the rest with 403', () => {
    expect(body).toContain("p.role = 'admin'");
    expect(body).toContain("'http_code', 403");
    expect(body).toContain("exception when invalid_text_representation");
  });

  it('can be called by Supabase Auth and nobody else', () => {
    expect(body).toMatch(/security definer\s+set search_path to ''/);
    expect(sql).toContain('revoke all on function public.custom_access_token_hook(jsonb) from public, anon, authenticated;');
    expect(sql).toContain('grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;');
    expect(sql.match(/grant /g)).toHaveLength(1);
  });
});
