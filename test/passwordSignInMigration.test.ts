import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// The database half of password + emailed code sign-in. Part 1 checks the
// password and takes a note; part 2, the sign-in hook, lets an emailed code
// or link sign in only right after that note. Both were dry-run on the live
// project and rolled back before being saved here.
const dir = path.resolve(process.cwd(), 'supabase/migrations');
const files = fs.readdirSync(dir).sort();
const find = (suffix: string) => {
  const file = files.find(f => f.endsWith(suffix));
  if (!file) throw new Error(`missing migration *${suffix}`);
  return { file, sql: fs.readFileSync(path.join(dir, file), 'utf8') };
};
const part1 = find('_password_check_for_sign_in.sql');
const part2 = find('_code_sign_in_needs_password.sql');
const body = (sql: string, name: string) => {
  const start = sql.indexOf(`create or replace function ${name}(`);
  expect(start, name).toBeGreaterThan(-1);
  return sql.slice(start, sql.indexOf('$fn$;', start) + 5);
};

describe('part 1: the password check', () => {
  const check = body(part1.sql, 'private.verify_login_password');
  const reset = body(part1.sql, 'private.begin_password_reset');

  it('comes before the hook that relies on it', () => {
    expect(files.indexOf(part1.file)).toBeLessThan(files.indexOf(part2.file));
  });

  it("checks the password against the account's own bcrypt hash, up to bcrypt's 72 bytes", () => {
    expect(check).toContain("v_hash like '$2_$%'");
    expect(check).toContain("octet_length(coalesce(p_password, '')) between 1 and 72");
    expect(check).toContain('extensions.crypt(p_password, v_hash) = v_hash');
    expect(check).toContain('where u.email = v_email');
    expect(check).toContain('and u.deleted_at is null');
  });

  it('answers ok, wrong, no_account or locked, and nothing else', () => {
    const answers = [...check.matchAll(/return '([a-z_]+)';/g)].map(m => m[1]);
    expect(new Set(answers)).toEqual(new Set(['ok', 'wrong', 'no_account', 'locked']));
  });

  it('limits wrong guesses per email and per caller, in queue, and clears them on the right password', () => {
    expect(check).toContain('c_email_limit   constant integer  := 5;');
    expect(check).toContain('c_email_daily   constant integer  := 20;');
    expect(check).toContain('c_caller_limit  constant integer  := 30;');
    expect(check).toContain("c_email_window  constant interval := interval '15 minutes';");
    // Parallel guesses wait for each other: caller lock first, then email.
    const callerLock = check.indexOf("pg_advisory_xact_lock(hashtextextended('login_caller:'");
    const emailLock = check.indexOf("pg_advisory_xact_lock(hashtextextended('login_email:'");
    expect(callerLock).toBeGreaterThan(-1);
    expect(callerLock).toBeLessThan(emailLock);
    expect(emailLock).toBeLessThan(check.indexOf("return 'locked';"));
    // A lock is decided before the password is even looked at.
    expect(check.indexOf("return 'locked';")).toBeLessThan(check.indexOf('extensions.crypt('));
    expect(check.indexOf('delete from private.login_failures where email_key = v_email_key;'))
      .toBeLessThan(check.indexOf("values (v_user, 'password', now())"));
  });

  it('keeps emails and caller addresses only as hashes', () => {
    expect(check).toContain("v_email_key := encode(sha256(convert_to(v_email, 'UTF8')), 'hex');");
    const start = part1.sql.indexOf('create table if not exists private.login_failures');
    const columns = part1.sql.slice(start, part1.sql.indexOf(');', start)).replace(/--.*$/gm, '')
      .split('\n').slice(1).map(line => line.trim().split(/\s+/)[0]).filter(Boolean);
    expect(columns).toEqual(['id', 'email_key', 'caller_key', 'created_at']);
    expect(body(part1.sql, 'private.login_caller_key')).toContain("encode(sha256(convert_to(");
  });

  it('takes a note only on the right password, and for Forgot password says nothing either way', () => {
    expect(check.match(/insert into private\.login_proofs/g)).toHaveLength(1);
    expect(reset).toMatch(/returns void/);
    expect(reset).toContain("values (v_user, 'reset', now())");
    expect(reset).not.toMatch(/raise|return '/);
  });

  it('runs with a fixed search path, and writes, so it cannot be STABLE', () => {
    for (const name of ['private.verify_login_password', 'private.begin_password_reset']) {
      expect(body(part1.sql, name), name).toMatch(/volatile\s+security definer\s+set search_path = ''/);
    }
    for (const name of ['public.verify_login_password', 'public.begin_password_reset']) {
      expect(body(part1.sql, name), name).toMatch(/volatile\s+security invoker\s+set search_path = ''/);
    }
  });

  it('can be called signed out, while its tables stay closed to every client', () => {
    for (const fn of ['verify_login_password(text, text)', 'begin_password_reset(text)']) {
      expect(part1.sql).toContain(`grant execute on function public.${fn} to anon, authenticated;`);
      expect(part1.sql).toContain(`grant execute on function private.${fn} to anon, authenticated;`);
    }
    expect(part1.sql).toContain('revoke all on function private.login_caller_key() from public, anon, authenticated;');
    for (const table of ['login_proofs', 'login_failures']) {
      expect(part1.sql).toContain(`alter table private.${table} enable row level security;`);
      expect(part1.sql).toContain(`revoke all on table private.${table} from public, anon, authenticated;`);
      expect(part1.sql).toMatch(new RegExp(`create policy ${table}_no_client_access\\s+on private\\.${table}\\s+as restrictive\\s+for all\\s+to anon, authenticated\\s+using \\(false\\)\\s+with check \\(false\\);`));
    }
  });
});

describe('part 2: the sign-in hook enforces password + code', () => {
  const hook = part2.sql.slice(part2.sql.indexOf('create or replace function public.custom_access_token_hook'), part2.sql.indexOf('$function$;') + 11);

  it('lets the administrator through first, unchanged', () => {
    const admin = hook.indexOf("p.role = 'admin'");
    expect(admin).toBeGreaterThan(-1);
    expect(admin).toBeLessThan(hook.indexOf("v_method = 'password'"));
  });

  it('still refuses a password on its own, and a refresh of a session that began with one', () => {
    expect(hook).toContain("if v_method = 'password'");
    expect(hook).toContain(`@> '[{"method": "password"}]'::jsonb`);
    expect(hook).toContain("'Sign in with your password and the code we email you.'");
  });

  it('lets an emailed code or link sign in only within 15 minutes of the password step, once', () => {
    expect(hook).toContain("if v_method in ('otp', 'magiclink', 'email/signup', 'recovery', 'invite') then");
    expect(hook).toMatch(/delete from private\.login_proofs\s+where user_id = v_user\s+and proved_at > now\(\) - interval '15 minutes';\s+if found then/);
    expect(hook).toContain("'Enter your password first, then the code we email you.'");
  });

  it('passes refreshes, Google/Apple, email changes and a second factor, and refuses anything else', () => {
    expect(hook).toContain("if v_method in ('token_refresh', 'oauth', 'email_change', 'totp', 'mfa/totp', 'mfa/phone', 'mfa/webauthn') then");
    const last = hook.slice(hook.lastIndexOf('return jsonb_build_object('));
    expect(last).toContain("'This way of signing in is not available.'");
    expect(hook.match(/'http_code', 403/g)).toHaveLength(3);
  });

  it('is VOLATILE (it deletes the note it uses), definer, with a fixed search path', () => {
    expect(hook).toMatch(/volatile\s+security definer\s+set search_path to ''/);
    expect(hook).not.toMatch(/\bstable\b/);
    expect(hook).toContain("exception when invalid_text_representation");
  });

  it('can be called by Supabase Auth and nobody else', () => {
    expect(part2.sql).toContain('revoke all on function public.custom_access_token_hook(jsonb) from public, anon, authenticated;');
    expect(part2.sql).toContain('grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;');
    expect(part2.sql.match(/grant /g)).toHaveLength(1);
  });
});
