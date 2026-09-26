// @vitest-environment node
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// admin-seller-provision creates and resets seller sign-ins with the service
// role, which bypasses RLS, so the database's second-factor rule never saw it:
// it checked only profiles.role = 'admin', and a session with the password but
// not the authenticator code could issue a login. It now asks the database, as
// the caller, whether the session is a verified administrator before it reads
// the request or changes anything.
//
// The function runs on Deno with supabase-js from npm. Here it runs under Node
// against a fake client that answers like Supabase and records every call, so
// each case shows what the function did and what it never reached.

const state = vi.hoisted(() => ({
  env: {} as Record<string, string | undefined>,
  calls: [] as string[],
  callerClients: [] as { key: string; authorization?: string }[],
  verified: { data: false as unknown, error: null as unknown },
  actorRole: 'admin',
  handler: null as null | ((req: Request) => Promise<Response>),
}));

const ADMIN = '11111111-1111-4111-8111-111111111111';
const SELLER = '22222222-2222-4222-8222-222222222222';
const NEW_LOGIN = '33333333-3333-4333-8333-333333333333';
const BASE_ENV = {
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: 'sb_publishable_key' }),
  SUPABASE_ANON_KEY: 'legacy-anon-key',
};

vi.mock('npm:@supabase/supabase-js@2', () => {
  const answer = (table: string, op: string) => {
    if (op === 'insert' && table === 'admin_activities') return { data: { id: 'audit-1' }, error: null };
    if (op !== 'select') return { data: null, error: null };
    if (table === 'profiles') return { data: { role: state.actorRole }, error: null };
    if (table === 'sellers') {
      return { data: { id: SELLER, name_en: 'Shop', account_uid: null, account_email: null, has_account: false }, error: null };
    }
    return { data: null, error: null };
  };
  const from = (table: string) => {
    let op = 'select';
    const write = (kind: string) => () => { op = kind; state.calls.push(`${kind} ${table}`); return q; };
    const q: Record<string, unknown> = {
      select: () => q, eq: () => q, limit: () => q,
      insert: write('insert'), upsert: write('upsert'), update: write('update'),
      maybeSingle: async () => answer(table, op),
      single: async () => answer(table, op),
      then: (ok: (v: unknown) => unknown, fail: (e: unknown) => unknown) =>
        Promise.resolve(answer(table, op)).then(ok, fail),
    };
    return q;
  };
  return {
    createClient: (_url: string, key: string, options: { global?: { headers?: Record<string, string> } } = {}) => {
      if (key === state.env.SUPABASE_SERVICE_ROLE_KEY) {
        return {
          auth: {
            getUser: async (token: string) => token === 'admin-token'
              ? { data: { user: { id: ADMIN } }, error: null }
              : { data: { user: null }, error: new Error('invalid token') },
            admin: {
              createUser: async () => {
                state.calls.push('auth.admin.createUser');
                return { data: { user: { id: NEW_LOGIN } }, error: null };
              },
              updateUserById: async () => {
                state.calls.push('auth.admin.updateUserById');
                return { data: {}, error: null };
              },
            },
          },
          from,
        };
      }
      state.callerClients.push({ key, authorization: options.global?.headers?.Authorization });
      return {
        rpc: async (fn: string) => { state.calls.push(`rpc ${fn}`); return state.verified; },
      };
    },
  };
});

const entry = path.resolve(process.cwd(), 'supabase/functions/admin-seller-provision/index.ts');
const load = async () => {
  vi.resetModules();
  state.handler = null;
  await import(/* @vite-ignore */ entry);
  return state.handler!;
};

const provision = () => new Request('https://project.supabase.co/functions/v1/admin-seller-provision', {
  method: 'POST',
  headers: { Authorization: 'Bearer admin-token', 'Content-Type': 'application/json' },
  body: JSON.stringify({ sellerId: SELLER, email: 'shop@example.com', password: 'Vx7#mQ2!rT9$kL4p' }),
});

let handler: (req: Request) => Promise<Response>;

beforeAll(async () => {
  vi.stubGlobal('Deno', {
    env: { get: (k: string) => state.env[k] },
    serve: (h: (req: Request) => Promise<Response>) => { state.handler = h; },
  });
  state.env = { ...BASE_ENV };
  handler = await load();
});

beforeEach(() => {
  state.calls.length = 0;
  state.callerClients.length = 0;
  state.actorRole = 'admin';
});

describe('seller logins need a verified administrator session', () => {
  it('refuses a password-only administrator before reading the request or changing anything', async () => {
    state.verified = { data: false, error: null };
    const req = provision();
    const res = await handler(req);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'STEP_UP_REQUIRED' });
    expect(req.bodyUsed).toBe(false);
    expect(state.calls).toEqual(['rpc is_admin_verified']);
  });

  it('asks as the caller: the publishable key and the caller\'s token, never the service-role key', async () => {
    state.verified = { data: false, error: null };
    await handler(provision());
    expect(state.callerClients).toEqual([{ key: 'sb_publishable_key', authorization: 'Bearer admin-token' }]);
  });

  it('treats anything but true as not verified', async () => {
    for (const data of [null, undefined, 'true', 1, {}]) {
      state.calls.length = 0;
      state.verified = { data, error: null };
      const res = await handler(provision());
      expect(res.status, String(data)).toBe(403);
      expect(state.calls, String(data)).toEqual(['rpc is_admin_verified']);
    }
  });

  it('fails closed when the check itself errors', async () => {
    state.verified = { data: null, error: { message: 'connection lost' } };
    const res = await handler(provision());
    expect(res.status).toBe(500);
    expect(state.calls).toEqual(['rpc is_admin_verified']);
  });

  it('still turns away someone who is not an administrator', async () => {
    state.actorRole = 'customer';
    state.verified = { data: true, error: null };
    const res = await handler(provision());
    expect(res.status).toBe(403);
    expect(state.calls).toEqual([]);
  });

  it('lets a verified administrator create the login, audited before and after', async () => {
    state.verified = { data: true, error: null };
    const res = await handler(provision());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, sellerId: SELLER, accountUid: NEW_LOGIN });
    expect(state.calls).toEqual([
      'rpc is_admin_verified',
      'insert admin_activities',
      'auth.admin.createUser',
      'upsert profiles',
      'update sellers',
      'insert admin_activities',
    ]);
  });

  it('falls back to the legacy anon key, and will not start without a publishable key', async () => {
    state.env = { ...BASE_ENV, SUPABASE_PUBLISHABLE_KEYS: undefined };
    const legacy = await load();
    state.verified = { data: false, error: null };
    expect((await legacy(provision())).status).toBe(403);
    expect(state.callerClients).toEqual([{ key: 'legacy-anon-key', authorization: 'Bearer admin-token' }]);

    state.env = { ...BASE_ENV, SUPABASE_PUBLISHABLE_KEYS: undefined, SUPABASE_ANON_KEY: undefined };
    await expect(load()).rejects.toThrow('Supabase function environment is not configured.');
    state.env = { ...BASE_ENV };
  });
});

describe('the pieces around it', () => {
  const read = (f: string) => fs.readFileSync(path.resolve(process.cwd(), f), 'utf8');

  it('defines public.is_admin_verified() as a delegate only signed-in users can call', () => {
    const file = fs.readdirSync(path.resolve(process.cwd(), 'supabase/migrations'))
      .find(f => /(?:^|_)is_admin_verified_for_edge_functions\.sql$/.test(f));
    expect(file).toBeDefined();
    const sql = read(`supabase/migrations/${file}`).replace(/--.*$/gm, '');
    expect(sql).toMatch(/create or replace function public\.is_admin_verified\(\)\s+returns boolean\s+language sql\s+stable\s+security invoker\s+set search_path = ''\s+as \$\$ select private\.is_admin_verified\(\); \$\$;/);
    expect(sql).toContain('revoke all on function public.is_admin_verified() from public, anon;');
    expect(sql).toContain('grant execute on function public.is_admin_verified() to authenticated;');
    expect(sql).not.toMatch(/security definer/i);
  });

  it('asks the administrator for the authenticator code before calling the function', () => {
    const view = read('src/components/admin/SellersView.tsx');
    const manage = view.slice(view.indexOf('const manageAccount'));
    const ask = manage.indexOf('await assertHighRiskAuthorization(shop.authUser?.uid)');
    expect(ask).toBeGreaterThan(-1);
    expect(ask).toBeLessThan(manage.indexOf("functions.invoke('admin-seller-provision'"));
  });

  it('SECURITY.md lists the delegate and the Edge Function check', () => {
    const doc = read('SECURITY.md');
    expect(doc).toContain('| `is_admin_verified()` | `private.is_admin_verified()` |');
    expect(doc).toMatch(/`admin-seller-provision`, which creates and resets seller sign-ins, calls\s+`is_admin_verified\(\)` with the caller's own token/);
  });
});
