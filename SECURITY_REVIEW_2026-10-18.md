# Red-team review — Yalla.lb — 2026-10-18

Requested: "a full bug, logic and security review, as deep as a red team or a real hacker who wants to find vulnerabilities."

## Bottom line

* **Nobody can take over an account, become an admin or seller, read other people's orders, change a price or a total, or get a
  free order.** I tried twelve concrete attacks of that kind against copies of the live rules; every one was stopped (section 3).
* **The most serious problem is not a break-in but a flood:** anyone can fill the free database with junk until the shop
  goes read-only and nobody can order (RT-1). The fix is already written and tested; it is waiting for your approval.
* **Five more real problems reproduced** (RT-2 to RT-6). Four are now **fixed on the live database** (RT-3, RT-4, RT-5 and RT-6, applied 2026-10-18 after a passing dry run);
  one has its fix written earlier and waiting (RT-2).
* **The review itself changed nothing on the live site or the live database.** Every proof ran in a scratch database on this machine.
  Afterwards, with your approval, two small database fixes were applied (migration versions `20261018182807` and
  `20261018182835`), and a site-only clean-up went to `main` (`11f067f`). The database before/after check showed only those
  two functions changed. RT-1 and RT-2 are still waiting on their dry run and your approval.

## 1. How I tested, and what I could not

**Read from the live project (read-only, no writes):** every table's security rules, grants and triggers; the text of the
functions that guard profiles, orders, products, reviews, seller applications and sign-in; the checkout function; storage
buckets and their rules; which tables broadcast live changes; the two deployed edge functions; Supabase's own advisor.
**Read from the repository:** all migrations, the two edge functions, the CI workflows, the security headers, the
rich-text cleaner, every place the pages build links or HTML, the git history for committed secrets, `npm audit`.
**Proved in a scratch PostgreSQL** (`node scripts/db/redteam-poc.mjs`, `test/db/redteam.db.test.ts`): function bodies and
rules in `test/db/fixture_redteam.sql` are copied from the live project, so an attack stopped there is stopped by the same
text that runs live.

**Not verified, and I will not pretend otherwise:**

| Not checked | Why |
| --- | --- |
| The live website in a browser | This session's network policy refuses `yalla-lb-supabase.vercel.app` (the proxy answers 403). To allow it: environment menu in the session title bar → Edit → Network access → add that host. |
| Supabase dashboard settings (allowed redirect URLs, e-mail code lifetime, CAPTCHA on/off, the sign-in hook switch) | No tool of mine reads them. |
| That the visitor's real address (`CF-Connecting-IP`) reaches the database | Supabase's own docs say it does; I could not test it without a write to the live project. The pending limiter migration is built to degrade safely if not, and `supabase/rollbacks/README.md` says how to check after applying. |
| Real phones, real Apache/LiteSpeed (Hostinger), real e-mail delivery | Not available here. |
| The Strix scanner | Installed as skills only, never run: it attacks a running target, and I would not point it at production without you asking. |

## 2. Findings, most serious first

Severity words: **High** = a stranger can hurt the shop with no account. **Medium** = needs an account, or hurts one person or
one rule. **Low** = small, or needs unusual conditions. Status: **Fixed** = applied to the live database and checked afterwards; **Fix ready** = written and tested here, waiting for you.

### RT-1 — Anyone can fill the free database and take the shop offline — HIGH — open; part-fixed 2026-10-20 (see status below)

*What:* searching, applying to be a seller and page analytics are open to visitors without sign-in. Two things are wrong
live today: (a) the "no more than 60 a minute" limit counts visitors by an address they write themselves
(`X-Forwarded-For`), so a script that writes a different one each time is never limited; (b) the search text and the seller
application have no size limit (the analytics one does: 4 KB).
*Proof (scratch DB, `test/db/rateLimit.db.test.ts`, `test/db/hardening.db.test.ts`):* 100 searches with 100 different forged
addresses → 0 refused, 100 stored; one anonymous request wrote a 1 MB search and a 1 MB application.
*Exploit:* the public API key is in the website's code. A script can add rows without limit and reach the free plan's
500 MB; Supabase then makes the database read-only and checkout stops until you clear it or pay. How fast depends on the
largest request Supabase's gateway accepts, which I did not test.
*Fix:* pending migrations D (size limits + a purge function) and E (count by the address Cloudflare sets, per account when
signed in, throttle never ban). Apply order and the dry run are in `supabase/rollbacks/README.md`.
*You:* approve the dry run, then the apply.

**Status 2026-10-20:** of the five older fixes, `…100000` (delete functions) and `…100200` (revoke needless browser rights, including visitors' read of the search log, coupons and seller applications) are applied (versions `20261020001140`, `20261020003138`), each checked before and after. The two that close the flood itself are not yet: `…10100000` (the rate limiter counts by the address Cloudflare saw instead of a header a visitor writes: dry run passed, apply stopped at the tool's approval step three times, nothing changed) and `…100300` (size caps, needs the SQL Editor).

### RT-2 — Anyone with an account can reserve other people's phone numbers — MEDIUM — open (fix ready since 10-04)

*What:* the table that keeps "one account per phone number" can be written directly by any signed-in user, with no limit.
*Proof:* a customer inserted `96171123456` for themselves, then 5,000 more numbers in one request (`F2`, `F2b` in
`scripts/db/redteam-poc.mjs`; the earlier `hardening.db.test.ts` shows the real owner is then refused with
`PHONE_ALREADY_REGISTERED`).
*Exploit:* squat a seller's or competitor's number so they cannot finish their profile; or fill the table.
*Fix:* pending migration B (only the profile trigger may write it). *You:* approval, as RT-1.

### RT-3 — Orders paid in Lebanese pounds ignore the rate you set — MEDIUM (latent) — FIXED 2026-10-18

*What:* the live checkout contains `v_lbp_rate numeric:=89500;`. The rate you keep in settings is never read, although
the storefront code says it is. Both are 89,500 today, so nobody is wrong yet. On the day you change the rate, the shop
will show one total and the order will record another on cash-on-delivery orders settled at the door.
*Evidence:* the live function text (quoted in the migration header). *Fix:* `20261018182807_checkout_uses_lbp_rate_and_locks_in_order`
reads the setting, with 89,500 as the fallback for a missing or non-numeric value (tested with `abc`, empty, `0`, `-5`,
`1e9`, `89 500`).

### RT-4 — Two shoppers can make each other's order fail — LOW/MEDIUM — FIXED 2026-10-18

*What:* checkout locks product rows in the order the basket lists them. Two baskets holding the same two products in
opposite order deadlock; the database cancels one order ("deadlock detected"). Retrying works. It gets likelier exactly
where it hurts: on best-sellers, in a busy hour.
*Proof:* reproduced with two simultaneous sessions (`F5`; `redteam.db.test.ts` "before"). *Fix:* same migration as RT-3
takes the locks first, in one fixed order. After it, the same two orders both succeed (tested).

### RT-5 — A seller can stamp their own products "Bestseller", "Featured", "New" and copy a product number — LOW/MEDIUM — FIXED 2026-10-18

*What:* the guard that stops sellers editing rating, cost, publishing and order forgot four columns the browser may write.
A seller calling the database directly (the seller screen never sends them) can put their products on the home page
and in the shop's own "Bestseller" badge, and overwrite the system product number with another product's.
*Proof:* `F1`; `redteam.db.test.ts`. *Fix:* `20261018182835_seller_cannot_set_storefront_flags`. Admin and the seller
screen are unaffected (tested).

### RT-6 — Anyone can lock any customer out of password sign-in — MEDIUM — FIXED (applied 2026-10-18, version 20261018234917)

*What:* the password check is a database function open to visitors. It locks an email after 5 wrong guesses in 15 minutes
(20 a day), **counted per email, not per person guessing**, and a locked email refuses even the correct password.
*Proof:* five wrong guesses from five different addresses, then the right password → `locked` (`F3`).
*Exploit:* knowing only a customer's or seller's email, keep them from signing in. They can still use "Forgot password"
(which skips the password step), so it is a nuisance, not a lock-out for good.
*Not covered by CAPTCHA:* Turnstile protects Supabase's own e-mail-code requests. This check is a database function that
receives only email and password, so, as far as the code shows, no CAPTCHA token reaches it.
*Fix (applied 2026-10-18 as version 20261018234917; checked on the project before and after: only the sign-in function changed):* `supabase/migrations/20261018234917_sign_in_lock_is_per_guesser.sql`. Five wrong guesses
in 15 minutes now lock **that guesser** out of **that e-mail**; the owner on their own connection is unaffected. A guesser who
rotates addresses is stopped by a per-e-mail ceiling of 50 in 15 minutes or 200 a day (it bounds a password attack to 200 tries a
day against one account; the password is only the first of two steps, an e-mailed code follows). A stranger now needs 50 failed
guesses spread over many addresses to lock the owner out, instead of 5.

### RT-7 — The sign-in check tells a stranger whether an e-mail has an account — LOW — product decision, noted

The same function answers `no_account` or `wrong`. This was chosen on purpose (task #35: unknown e-mail → "sign up
first"), so I have not changed it. It lets someone test a list of e-mails for membership. If that matters more to you than the
friendlier message, the answer should be the same for both.

### RT-8 — Every visitor's browser receives every seller's phone number — LOW/MEDIUM (privacy) — step 1 APPLIED 2026-10-18; step 2 (website) built, not deployed; step 3 (revoke) held

The shop's public read of sellers includes `contact_phone`; nothing a shopper sees ever displays it (only the admin and seller screens
do). Anyone calling the public API can list the phone numbers of all active sellers. (The column is granted to `anon` and `authenticated`
column by column; there is no table-wide SELECT, so a single column revoke closes it.)

*Fix (built 2026-10-18 on the review branch; three steps, in this order, each separately approved):*
1. **Database, additive only — APPLIED 2026-10-18** (version `20261018232313`, `supabase/migrations/20261018232313_seller_phone_private_routes.sql`; checked before and after: 92 → 96 functions, every other function, policy, table right, trigger and the sellers column rights unchanged). Two routes, built like
   `admin_list_seller_private()` (private SECURITY DEFINER function + thin SECURITY INVOKER wrapper, signed-in users only):
   `admin_list_seller_phones()` (every seller; raises `ADMIN_VERIFICATION_REQUIRED` unless the admin session is verified) and
   `my_seller_contact()` (no argument; the signed-in seller's own seller only; a customer or a seller without a seller gets no rows).
   Existing functions and table rights are not touched (confirmed by the before/after check). I did not add the phone to `admin_list_seller_private()` itself, so no live
   function is rewritten.
2. **Website** (on the branch, not deployed). `SELLER_COLUMNS` loses `contact_phone` (it feeds both the catalogue read and the page-head
   prefetch). `fetchSellerContactPhones()` asks the route for an administrator (all) or a seller (own); a visitor or customer never asks.
   Numbers are merged into the seller list in memory only: the browser's catalogue cache neither stores nor keeps one (an older cache is
   cleaned on load). If a route is not installed yet it falls back to reading the column, so steps 1 and 2 can go in either order; any
   *refusal* (for example an unverified admin session) is not retried through the column.
3. **Database, the revoke** — `supabase/pending/20261018210100_revoke_seller_phone_from_browsers.sql`, **held**. `revoke select
   (contact_phone) on public.sellers from anon, authenticated`; stops unless both routes exist, checks afterwards that neither role can
   read the column and the public columns still can (it fails and undoes itself if a table-wide grant would keep the column open).
   **Wait at least a day after step 2 is live:** a browser tab opened before the deploy still asks for the column and would get
   "permission denied" (an empty seller list) until reloaded. After it, any `select *` on sellers by a browser fails, so the website lists
   its columns (it does).
Rollbacks: step 1 drops the four functions; step 3 is one `grant select (contact_phone) ...` (which restores the exposure on purpose).

*Tests:* `test/db/sellerPhone.db.test.ts` (23, real PostgreSQL: the exposure before; verified admin, unverified admin, customer, seller,
visitor, a seller asking for another seller, a seller turned customer; revoke refused without routes, closes the column, leaves the other
columns and admin writes alone, twice, undone as a whole under a table-wide grant; both rollbacks; the dry run leaves nothing behind;
four deliberate breakages each caught) and `test/sellerPhonePrivate.test.ts` (17: what the storefront really requests, the routes and the
fallback, no fallback after a refusal, cache never holds a number). *Dry run:* `node scripts/db/dryrun-hardening.mjs --set=sellerphones --compact --evidence`.
*Not verified:* the admin Sellers / Sales Analytics screens and the seller dashboard in a real browser against the new routes. The routes
now exist on the project, but the deployed website does not call them yet (the change is on this branch, not on `main`); the revoke's dry run
also passed on the project (with a result row of: visitor cannot call either route, signed-in users can, the phone column closed to both
browser roles, the name column still readable; one seller has a number on file).

### RT-9 — Signed-in users can store unlimited data in their own rows — LOW/MEDIUM — fix written and tested, NOT applied

`carts.items`, `wishlists.product_ids`, `user_addresses`, `orders.shipping` (set by checkout from the browser) and, until RT-2's
fix, `phone_registry` have no size limit. Needs one account per megabyte-sized request, so it is slower than RT-1, but
sign-up is free and CAPTCHA is still off. *Fix (written 2026-10-18, tested, not applied):* `supabase/pending/20261018200100_size_limits_for_signed_in_writes.sql`, the same "NOT VALID
pattern as migration D: cart ≤ 512 KB (a full 50-line basket is about 300 KB), wishlist ≤ 500, shipping ≤ 8 KB, ≤ 20 addresses a
person, and length limits on the profile's text fields. Live data is tiny (largest cart 5 bytes, largest shipping record 304 bytes),
so no one is affected today.

### RT-10 — A Firebase key from before the move is in the public repository's history — LOW — owner step (task #112)

Commits `c4e0942` (added) and `5490d42` (removed) contain a Firebase web key (starts `AIzaSyDQI4…`). Such keys are meant to be
public, but yours belongs to a system you left. In Google Cloud → APIs & Services → Credentials, **delete it or restrict it**
to nothing. No Supabase secret, service-role key or token appears anywhere in the files or the history (searched).

### RT-11 — Smaller items

* **Moving off Vercel will break "create seller login" until you set one value.** The function allows only the two
  `vercel.app` addresses (plus whatever is in the `ALLOWED_ORIGINS`, `APP_URL` or `SITE_URL` secrets). On Hostinger, add
  your domain to the `ALLOWED_ORIGINS` secret of `admin-seller-provision` first.
* **A leftover function** `one-time-imgbb-migration` is still deployed. It only answers "410 disabled" and needs a login,
  so it is harmless; delete it for tidiness.
* **Leaked-password protection is off** (Supabase's advisor, the only warning it gives). It is a paid-plan feature.
* **The CI job that checks for schema drift** gets the database password as a repository secret on every pull request.
  Fine while only you can push; one more reason to keep the repository private (task #112).
* **Defence in depth:** the rule that lets a user insert their own profile row does not pin `is_otp_verified`, `email_verified`
  or `seller_id`. Not exploitable today (the row already exists and cannot be deleted), but a one-line `with check` would
  close the door for good. The app code never reads `is_otp_verified` (checkout's gate uses the e-mail confirmation instead), and it is not reset if
  the phone number changes, so do not build a rule on it without fixing that.
* **A product's `artisan` text** is editable by its seller and shown to shoppers. Intended (it is their name); noted because
  it can be set to another maker's name.

## 3. What I attacked and could not break

Run by `node scripts/db/redteam-poc.mjs` (lines `N1`–`N12`) and kept as regression tests in `test/db/redteam.db.test.ts`:

| Attack | Result |
| --- | --- |
| Customer sets own `role` to admin / `seller_id` | Reverted by trigger |
| Customer sets own `email_verified` / `is_otp_verified` | Refused (`PROFILE_SECURITY_FIELDS_FORBIDDEN`) |
| Customer re-inserts a privileged copy of own profile | Refused (row exists, no delete right) |
| Customer edits another profile | 0 rows (row-level security) |
| Customer lowers own order total | 0 rows (no update rule for customers) |
| Seller on the order lowers its total / marks it delivered | Refused (`ORDER_FINANCIAL_FIELDS_FORBIDDEN`, `ORDER_STATUS_TRANSITION_FORBIDDEN`) |
| Seller not on the order advances it | 0 rows |
| Seller sets own rating / review count / cost price | Refused (`PRODUCT_SECURITY_FIELDS_FORBIDDEN`) |
| Seller edits another seller's product | 0 rows |

Also checked and sound: every table has row-level security; orders can only be created through the checkout function
(a trigger refuses any other insert, and also unverified e-mails); prices, stock, region and delivery fee are all decided
on the server; stock cannot be oversold (conditional update); the live checkout has a guard so a coupon's rule is not applied twice (`v_coupon_rule_applied`), and total discounts are capped at 70%
(there are no coupons or discount rules in the shop yet, so this is read from the code, not exercised); admin writes need the authenticator code; the seller-login
function verifies the caller, the admin role and a fresh authenticator step before touching anything; storage accepts
only images up to 8 MB, only admins or the seller's own folder may write; the payment webhook (not deployed) verifies a
signature and rejects stale or replayed events; the page's security headers (no inline scripts, no outside script hosts,
framing denied) and its rich-text cleaner (small allow-list, no `style`, `svg`, `iframe`) are strong; the links I traced (WhatsApp, banner and slide buttons, custom blocks) are digits-only, scheme-checked or `noopener`; the preview message handler checks origin and sender; every spreadsheet
export passes through `sanitizeRowForCsv` (formula cells are neutralised); `npm audit` for production dependencies reports 0 vulnerabilities; the CI actions are pinned to
commits and run with read-only tokens.

## 4. What is in this branch

| File | What |
| --- | --- |
| `supabase/migrations/20261018182807_checkout_uses_lbp_rate_and_locks_in_order.sql` (+ rollback in `supabase/rollbacks/`) — **applied** | RT-3, RT-4. Patches the live function by exact text, refuses if the text is not found exactly once, checks grants unchanged. |
| `supabase/migrations/20261018182835_seller_cannot_set_storefront_flags.sql` (+ rollback) — **applied** | RT-5, same safeguards. |
| `test/db/redteam.db.test.ts`, `test/db/fixture_redteam.sql` | 38 tests: the guards that hold, and both migrations (before, after, twice, wrong function, rollback). Four deliberate breakages of the migrations were each caught by a test. |
| `scripts/db/redteam-poc.mjs` | Runs every proof above; prints `BLOCKED` / `CONFIRMED`. |

## 5. What I need from you, in order

1. **Dry-run the five older pending migrations (A–E)** on the live database, then, separately, approve the apply.
   This closes RT-1 and RT-2, the two that matter most. The Supabase tool gives up after 60 seconds and asks for approval on
   scripts that contain `alter table` / `drop policy`, so the reliable way is the SQL editor: `node scripts/db/dryrun-hardening.mjs --compact --evidence`.
   The dry run passed on the live database for change A and for both RT-3/RT-4/RT-5 fixes; B to E were not completed through the tool.
2. **RT-9 is written and tested** (not applied); RT-6 is applied. RT-9 goes through the same dry run and your approval as the five older ones.
   **RT-8** (seller phone numbers): the private routes are applied (additive, checked). The website change is on this branch, not on `main`,
   and the revoke is held. Order matters: routes (done), website live for a day, then the revoke; the revoke must never go first.
3. **Do** RT-10 (Firebase key) and, before leaving Vercel, RT-11's `ALLOWED_ORIGINS`.
4. **Allow the live site** in the session's network settings if you want me to look at it in a browser.

Applied to the live database so far: RT-3/RT-4, RT-5, RT-6 (sign-in lock per guesser) and the RT-8 private routes (step 1, additive). This report and the proof script are on the review branch, not on `main`.
