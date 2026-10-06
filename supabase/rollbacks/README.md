# Rollbacks, and how the database hardening is applied

Each file here undoes one migration of the same name. They live outside `supabase/migrations/` on purpose:
nothing applies them automatically. A rollback restores the state the migration found, including, where that
is the point, the weakness it closed; each file says exactly what it does and does not put back.

## Where the migrations wait: `supabase/pending/`

The hardening migrations are kept in `supabase/pending/` until the owner approves applying them. The project's
Supabase GitHub integration ("Deploy to production") is still switched on, and it can apply whatever is in
`supabase/migrations/` when `main` changes; keeping them out of that folder means merging the website can never
apply them by itself. When they are applied (with approval, in the order below), each file moves into
`supabase/migrations/` under the version the project recorded, as earlier migrations were (see commit 34e9ce6).

## The database hardening (Build 3): four migrations, in `supabase/pending/`

| Migration | What it changes | Undo with |
|---|---|---|
| `20261004100000_admin_delete_functions_callable` | A verified administrator can delete a category or a seller (both failed with "permission denied"). | `…100000….rollback.sql` |
| `20261004100100_phone_registry_written_only_by_trigger` | Signed-in users can no longer write `phone_registry` directly; the trigger still keeps it in step. | `…100100….rollback.sql` |
| `20261004100200_revoke_unneeded_browser_grants` | Takes MAINTAIN (PostgreSQL 17) from the browser roles, SELECT on four admin-only tables from anon, UPDATE/DELETE on the audit trail from browsers. | `…100200….rollback.sql` |
| `20261004100300_anonymous_insert_size_caps_and_log_purge` | Caps a logged search at 200 characters and a seller application at 16 kB (new rows only); adds a search-log purge function that nothing runs yet. | `…100300….rollback.sql` |

Every migration checks its own assumptions against the database first and stops, changing nothing, if one
does not hold; and each ends by checking the state it was meant to reach. They are safe to run twice.
`test/db/hardening.db.test.ts` runs all of this for real in a scratch PostgreSQL (`npm test`; CI requires it).

### Steps, each only with the owner's go-ahead

1. **Read-only preflight.** Run `scripts/db/preflight_hardening.sql`. It is a `READ ONLY` transaction that
   is rolled back, so the database refuses any write inside it. Read: which delete functions exist and
   whether they call `is_admin_verified`; the `phone_registry` policies (any policy that lets a client write
   will be dropped); insert triggers on the four tables; the longest existing search and application; the
   rate limiter's source.
2. **Dry run.** `node scripts/db/dryrun-hardening.mjs` prints one script that applies the four migrations and
   rolls everything back. Every check inside them runs against the real data; nothing stays.
   (`test/db/dryrun.db.test.ts` proves the database is identical before and after.)
3. **Apply,** in order: 100000, 100100, 100200, 100300.
4. **Check on the live site:** delete a test category from the admin panel; a storefront search still appears
   in Search Trends; the sign-up phone check still answers.
5. **If anything is wrong,** run the rollbacks in reverse order (100300, 100200, 100100, 100000).

### Order with the website

Deploy the website version that cuts a logged search to 200 characters (`forSearchLog` in
`src/services/supabaseAdminService.ts`) before or together with `…100300`. With an older page, a search
longer than 200 characters would still work, but its log row would be refused.

### Not done here, and why

- **The rate limiter** (`private.rate_limit_anonymous_insert`, audit SEC-2): it trusts the first address in
  `x-forwarded-for`, which a visitor can set, and skips signed-in callers. It exists only in the live project,
  so it has to be read there first (the preflight prints it) and rewritten from that, keeping whatever else it
  does: prefer `cf-connecting-ip` (as `is_phone_available` and `login_caller_key` already do) and count
  signed-in callers per account.
- **How long to keep search logs** is the owner's decision. `private.purge_search_logs(interval)` exists for
  whatever schedule is chosen (it refuses less than 7 days); nothing schedules it.
- **`VALIDATE CONSTRAINT`** on the two size caps: only after the preflight shows no existing row over the limit.

### Not verifiable outside the project

The real bodies of the live-only functions, the live policies and grants (the migrations check them as they
run), and PostgreSQL 17's MAINTAIN privilege (the scratch server here is older; the revoke is skipped and says
so, and the dry run on the project exercises it).
