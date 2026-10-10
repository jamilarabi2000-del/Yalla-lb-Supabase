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

## The database hardening (Build 3): five migrations, in `supabase/pending/`

| Migration | What it changes | Undo with |
|---|---|---|
| `20261004100000_admin_delete_functions_callable` | A verified administrator can delete a category or a seller (both failed with "permission denied"). | `…100000….rollback.sql` |
| `20261004100100_phone_registry_written_only_by_trigger` | Signed-in users can no longer write `phone_registry` directly; the trigger still keeps it in step. | `…100100….rollback.sql` |
| `20261004100200_revoke_unneeded_browser_grants` | Takes MAINTAIN (PostgreSQL 17) from the browser roles, SELECT on four admin-only tables from anon, UPDATE/DELETE on the audit trail from browsers. | `…100200….rollback.sql` |
| `20261004100300_anonymous_insert_size_caps_and_log_purge` | Caps a logged search at 200 characters and a seller application at 16 kB (new rows only); adds a search-log purge function that nothing runs yet. | `…100300….rollback.sql` |
| `20261010100000_rate_limit_uses_edge_ip` | The anonymous-insert rate limit counts signed-out visitors by the address Cloudflare saw (`CF-Connecting-IP`, which a visitor cannot choose) instead of the first `X-Forwarded-For` address (which they can), and counts signed-in callers by account. Same limits, still only a throttle: nothing is banned or remembered. | `…10100000….rollback.sql` |

Every migration checks its own assumptions against the database first and stops, changing nothing, if one
does not hold; and each ends by checking the state it was meant to reach. They are safe to run twice.
`test/db/hardening.db.test.ts` runs all of this for real in a scratch PostgreSQL (`npm test`; CI requires it).

### Steps, each only with the owner's go-ahead

1. **Read-only preflight.** Run `scripts/db/preflight_hardening.sql`. It is a `READ ONLY` transaction that
   is rolled back, so the database refuses any write inside it. Read: which delete functions exist and
   whether they call `is_admin_verified`; the `phone_registry` policies (any policy that lets a client write
   will be dropped); insert triggers on the four tables; the longest existing search and application; the
   rate limiter's source.
2. **Dry run.** `node scripts/db/dryrun-hardening.mjs` (add `--compact` for a shorter script without comment
   lines, and `--evidence` to end with one row showing the state the migrations would leave) prints one script that applies the five migrations and rolls everything back; it sets a 3 s lock
   timeout first, so on the live database it gives up rather than queue behind other work. Every check inside them runs against the real data; nothing stays.
   (`test/db/dryrun.db.test.ts` proves the database is identical before and after.)
3. **Apply,** in order: 20261004100000, …100100, …100200, …100300, then 20261010100000.
4. **Check on the live site:** delete a test category from the admin panel; a storefront search still appears
   in Search Trends; the sign-up phone check still answers.
5. **If anything is wrong,** run the rollbacks in reverse order (20261010100000, then 100300, 100200, 100100, 100000).

### Order with the website

Deploy the website version that cuts a logged search to 200 characters (`forSearchLog` in
`src/services/supabaseAdminService.ts`) before or together with `…100300`. With an older page, a search
longer than 200 characters would still work, but its log row would be refused.

### Not done here, and why

- **Blocking addresses.** The limiter only ever throttles: past the limit an insert is refused until the minute is over,
  then works again. Nothing is banned and no address is remembered beyond the rows it wrote, because many shoppers in
  Lebanon share one mobile connection address and a ban would lock out innocent people.
- **How long to keep search logs** is the owner's decision. `private.purge_search_logs(interval)` exists for
  whatever schedule is chosen (it refuses less than 7 days); nothing schedules it.
- **`VALIDATE CONSTRAINT`** on the two size caps: only after the preflight shows no existing row over the limit.

### Not verifiable outside the project

The real bodies of the live-only functions, the live policies and grants (the migrations check them as they
run), and PostgreSQL 17's MAINTAIN privilege (the scratch server here is older; the revoke is skipped and says
so, and the dry run on the project exercises it).

### What the read-only preflight found on the live project (2026-10-06)

PostgreSQL 17.6; the migration role can `SET ROLE` to `anon` and `authenticated` (the safety probes need that).
The two private delete functions are SECURITY DEFINER, call `is_admin_verified`, and signed-in users cannot run
them: the bug is real on the project, not only in the repository. `phone_registry` has an ALL policy (owner **or
any administrator**) plus a *restrictive* policy requiring a verified administrator for administrators' changes;
migration B drops only permissive write policies, so the restrictive one stays. Every grant matched the audit
(MAINTAIN held on 23 tables). The rate limiter is SECURITY DEFINER and reads the leftmost `x-forwarded-for` (which is what migration
`20261010100000` replaces), so nothing in the first four migrations can break it. Largest existing search: 5 characters; no seller applications; database 47 MB.

### The rate limiter (`20261010100000_rate_limit_uses_edge_ip`)

Read from the live project on 2026-10-10 and rewritten from that source; the rollback puts the old body back verbatim.

- **Why the old one did not work.** Cloudflare (in front of every Supabase project) *adds* the real address to
  whatever `X-Forwarded-For` the visitor already sent, so the first address in the header is whatever the visitor
  typed: a different one per request gave every request a fresh budget. It also let signed-in callers through uncounted.
- **What it counts by now.** Signed out: `CF-Connecting-IP`, which Cloudflare sets itself (the project's gateway logs
  carry it on every request). IPv4 counts per address; IPv6 per /64, since one home connection is given billions of
  addresses inside it. Signed in, writing a row in their own name: per account, five times the signed-out allowance.
  No usable address: the old conservative shared cap (ten times the limit), so an unattributable flood is still bounded.
- **Same limits, same error.** 60 a minute (5 for seller applications), `RATE_LIMIT_EXCEEDED` / SQLSTATE 53400.
- **Independent of the host.** The browser talks to Supabase directly, so moving the website from Vercel to Hostinger
  changes nothing here.
- **The server decides what the counts read.** For a browser (`anon`/`authenticated`) the trigger clears any
  `client_ip` the caller sent and fixes `created_at`: never in the future (a planted future date would count against
  others for years); for `search_logs`, up to 24 hours back, because the app sends the time of a search queued while
  offline; for `seller_applications` and `analytics_events`, always now. Back-office writes (`service_role`, imports)
  are left alone.
- **Two soft limits, stated plainly.** (1) The count is read-then-insert, so concurrent requests from one address can
  overshoot a limit by a few rows (measured in review: 6 to 7 against a limit of 5 under 16 simultaneous sessions); a
  per-address advisory lock would make it hard, at the price of serialising those inserts; not done. (2) A script that
  backdates `search_logs` rows by hours slips past the per-minute count (a log table, 200 characters a row); a trusted
  insertion-time column would close it and is a schema change, so it is left for the owner to decide.
- **Checks.** It stops, changing nothing, unless the function is the SECURITY DEFINER limiter it was written against, its
  three triggers exist and the tables have the columns it reads. After replacing the function, a probe inserts as a
  signed-out visitor who sends a forged `X-Forwarded-For` and proves the row is recorded under the Cloudflare address
  (the probe is rolled back; if the new limiter fails on an ordinary insert the migration aborts rather than treating that as "inconclusive"). `test/db/rateLimit.db.test.ts` runs all of this, and the old behaviour, in a scratch PostgreSQL.
- **After applying, check once on the live site:** do one search, then look at the newest `search_logs` row: its
  `client_ip` should be your address. If it is empty the header did not reach the database; the limiter then falls back
  to the shared cap (nobody is blocked) and the migration should be rolled back and looked at again.
