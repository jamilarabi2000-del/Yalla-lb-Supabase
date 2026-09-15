# Yalla Supabase Security Gate — 2026-09-15

## Automated / database gates
- Firebase compatibility: no `firebase` or `firestore` references remain in the repository search index.
- Public privileged RPC exposure: hardened; remaining SECURITY DEFINER functions are internal/trigger paths.
- RLS: enabled on all platform foundation tables.
- Fine-grained permissions: role + explicit permission + ownership checks added.
- Inventory ledger: server-authoritative ledger RPC added.
- Order lifecycle audit: order event trigger added.
- Notifications, analytics, search synonyms and product SEO tables added.
- PostgreSQL ranked/trigram/unaccent search added with extensions moved to `extensions` schema.
- Admin audit records are immutable and visible through the Admin Security & Audit screen.
- Security Advisor final database state: only remaining warning is Supabase Auth `auth_leaked_password_protection`.

## Live Auth gate
Run `npm run security:live` with temporary non-production test accounts supplied as environment variables. The script checks:
- customer A/B profile and order IDOR isolation;
- seller A/B product and inventory isolation;
- private Storage ownership;
- global session revocation.

OTP expiry/replay requires a real mailbox because Supabase Auth delivers the code outside Postgres. Password reset and email verification likewise require a mailbox/browser verification step.

## Platform setting still requiring dashboard action
Supabase Leaked Password Protection is an Auth dashboard setting and is not exposed by the connected database-management tool. It must be enabled in Supabase Auth → Password Security before the security gate can be marked green.

## Deployment
The Netlify site is linked to `yalla-lb-supabase`. The connected deployment operation can generate the deploy command but cannot execute a repository checkout from this environment. The GitHub push therefore remains the source of truth until Netlify builds the latest commit.
