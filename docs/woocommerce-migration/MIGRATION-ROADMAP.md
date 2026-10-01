# MIGRATION ROADMAP

Sequenced plan for Yalla.lb → WordPress + WooCommerce on Hostinger.

**Audit date:** 2026-09-17 · **Status:** audit complete, awaiting review. No production changes.

---

## Sequencing principles

1. **Decisions and procurement before engineering.** The longest-lead items are external — merchant onboarding, carrier API confirmation, Meta template approval. Started late, they become the critical path; started early, they never block.
2. **Design fidelity is proven early, not hoped for late.** The theme foundation exists to answer "can this design survive the platform change?" before a catalogue is built on it.
3. **Tests before engines.** The promotions engine and the authorization matrix get their test suites written first, as executable specification.
4. **The manual path before the automated one.** Courier Type 3 (admin-assisted) is built before any API adapter, because it is the failure-mode floor for every courier.
5. **Nothing is retired until its replacement passes acceptance.** Supabase keeps serving until cutover is signed off.
6. **Every phase has an exit criterion.** "Looks done" is not a gate.

---

## Complexity scale

| Rating | Meaning | Rough effort |
|---|---|---|
| **XS** | Configuration or a handful of lines | < 1 day |
| **S** | Straightforward, native support exists | 1–3 days |
| **M** | Real work, adaptation needed | 3–10 days |
| **L** | Substantial custom build | 2–4 weeks |
| **XL** | Major subsystem with novel logic | 4+ weeks |

---

## Gate 0 — Decisions and procurement · **BLOCKING**

Nothing downstream is safe to build until these are settled. Most cost hours, not weeks.

| # | Decision | Complexity | Blocks | Recommendation |
|---|---|---|---|---|
| D1 | **Bilingual model** — sibling `_ar` meta vs duplicate posts | XS to decide, **XL to change later** | **All theme work** | Option A: sibling `_ar` meta |
| D2 | Repository layout — same repo vs new | XS | Where everything lands | Same repo, `wordpress/` directory, deployable subtrees |
| D3 | Launch on COD only? | XS | Whether payments are on the critical path | Yes — removes the longest-lead item from the path |
| D4 | The five failing tests — re-point or restore, per test | S | Admin auth + product-creation specification | Triage each; never weaken a test |
| D5 | Product URLs — UUID or slug | XS | SEO, routing | Slugs; nothing to 301, the catalogue is empty |
| D6 | Three bespoke hero layouts — keep or drop | XS | Banner CPT scope | Business call |
| D7 | Publish model — `is_published` or `publish_status` | XS | Product data model | Collapse to WordPress post status |
| D8 | Multiple saved addresses — needed at launch? | XS | Account scope | Defer; Woo's single billing/shipping is likely enough |
| D9 | Analytics — rebuild or external tool | XS | Whether `analytics_events` is ported | External tool |

### Procurement — start immediately, runs in parallel

| # | Item | Owner | Lead time | Gates |
|---|---|---|---|---|
| P1 | **Lebanese legal entity confirmed** | Business | Unknown | Every card payment option |
| P2 | Payment provider verification (2+ candidates, full checklist) | Business + engineering | Weeks | Phase 15 |
| P3 | Courier API confirmation in writing (Aramex / LibanPost / Wakilni) | Business | Weeks | Phase 13 |
| P4 | WhatsApp BSP selection + Meta template submission | Business + engineering | Weeks — approval can be refused | Phase 12 |
| P5 | Hostinger plan confirmed, staging + production provisioned | Business | Days | Phase 1 |

**If P1–P4 start at Gate 0, none of them ever blocks engineering.** If they start when engineering reaches them, each becomes a multi-week stall.

---

## Phase plan

### Phase 1 — Environment · **S** · depends on P5
WordPress + WooCommerce on Hostinger; SSL; staging/production split; system cron (not WP-Cron); off-site backups; PHP 8.1+; HPOS enabled.
**Exit:** a clean WooCommerce install reachable on staging, with backups verified by a restore test.

### Phase 2 — Theme foundation · **L** · depends on D1, D2, Phase 1
Design tokens ported from `src/index.css`; Tailwind v4 building against PHP templates; header, announcement ticker, navbar, search, mobile menu, footer; product card; empty/loading/error states; inline Lucide SVG icons; RTL; runtime theme tokens.
**Exit:** screenshot comparison against the running React app at 375 / 768 / 1024 / 1440 px in EN and AR, signed off. *This is the gate that proves the whole approach.*

> **Status: substantially complete.** Built earlier at the project owner's direction. 18 PHP files, Tailwind pipeline verified end-to-end. Not yet rendered against a live WordPress install — see "Current state" below.

### Phase 3 — Catalogue · **M** · depends on Phase 2
Archive, category pages, single product, gallery, badges, price display, sort, pagination, search UI.
**Exit:** a seeded catalogue renders correctly at all breakpoints in both languages.

### Phase 4 — Yalla Core foundation · **M** · parallel with Phases 2–3
Plugin bootstrap, autoloader, activation, settings API, Yalla admin menu, capability registration, REST scaffolding with `permission_callback` on every route, custom-table schema versioning.
**Exit:** plugin activates cleanly; capabilities registered; no REST route without a permission callback.

### Phase 5 — Authorization matrix · **L** · depends on Phase 4 · **addresses R1**
Enumerate all 88 RLS policies into an explicit matrix; one shared capability helper; protected-meta filtering; seller ownership boundaries; the endpoint × role test suite.
**Exit:** automated matrix tests pass for anonymous / customer / seller / admin across every endpoint. `cost_price_usd` never appears in an unauthenticated response.

### Phase 6 — Cart and checkout · **XL** · depends on Phases 3, 4
Cart drawer on the Store API; Lebanese address form; governorate-driven shipping zones; delivery speed; COD; **checkout idempotency + attempt log**; row-locked stock reduction; order statuses.
**Exit:** concurrent-checkout load test on the last unit shows no oversell; duplicate-submit produces one order.

### Phase 7 — Promotions engine · **XL** · depends on Phase 4 · **addresses R4**
**Tests first.** Port `pricing.test.ts` and `pricingParity.test.ts` to PHPUnit, then implement: automatic rules, spend thresholds, BOGO, bundles, first-order, seller/brand targeting, the 70% cap, cart threshold messaging.
**Exit:** every ported test passes; cart preview and checkout agree on every fixture.

### Phase 8 — Accounts · **M** · depends on Phase 6
Login, registration, My Account, order history, wishlist, **email OTP** (6-digit, 60s resend, expiry, single-use, rate-limited), admin step-up, phone uniqueness.
**Exit:** OTP rate limiting and single-use verified by test; step-up enforced server-side.

### Phase 9 — Content management · **L** · depends on Phase 4
Banner CPT with per-device art direction and scheduling; slider CPT; custom blocks CPT; homepage section ordering; 53 visibility flags; theme token settings; page copy.
**Exit:** an editor can build the current homepage end to end without touching code.

### Phase 10 — Orders and inventory · **M** · depends on Phases 6, 4
Custom order statuses; inventory ledger; order event timeline; admin order screens.
**Exit:** stock movements reconcile against the ledger; cancellation restores stock.

### Phase 11 — Email notifications · **M** · depends on Phase 10
SMTP via a transactional provider; Yalla-branded templates; the full transactional set including the custom statuses; OTP delivery.
**Exit:** every order-status transition sends the right email; deliverability verified (SPF/DKIM).

### Phase 12 — WhatsApp · **L** · depends on Phase 11, P4
BSP client; approved templates; Action Scheduler queue with retry and dead-letter; inbound webhook with constant-time signature verification; consent capture; per-event admin toggles.
**Exit:** templates approved; a failed send retries and surfaces in admin; consent respected.

### Phase 13 — Couriers · **L** · depends on Phases 10, 12, P3
Courier registry; adapter interface; **manual tier first**; WhatsApp dispatch with interactive Accept/Reject; API adapters only for carriers that confirmed access.
**Exit:** an order dispatches and returns a status through each configured tier; an unanswered dispatch escalates rather than stranding.

### Phase 14 — Sellers · **L** · depends on Phase 5
Seller role and taxonomy; dashboard; applications; ownership enforcement; commission recording.
**Exit:** a seller can see only their own products and orders — proven by the Phase 5 matrix tests.

### Phase 15 — Payments · **M** · depends on Phase 6, P1, P2
Provider-agnostic abstraction; the selected gateway; 3DS; refunds; signed idempotent webhooks; server-side amount verification; failure handling that releases stock.
**Exit:** sandbox success, failure, refund and webhook-replay all behave correctly.

### Phase 16 — Migration tooling · **M** · depends on Phases 3, 9
CSV product importer against the DATA-MAPPING contract; configuration seeding (6 regions, categories, CMS document); capability map import.
**Exit:** a dry run reproduces the reference configuration on a clean install.

### Phase 17 — SEO · **S** · depends on Phase 3
Sitemap, robots, canonicals, OpenGraph, product structured data, breadcrumbs, redirects.
**Exit:** valid structured data; sitemap submitted.

### Phase 18 — Performance · **M** · depends on all
Page caching with cart/checkout/account **excluded**; object caching; promotions-rule caching; image optimisation; query profiling; JS budget.
**Exit:** Lighthouse thresholds met on mobile and desktop for home, archive and product.

### Phase 19 — Security review · **M** · depends on all · **addresses R9**
All 16 risks reviewed; the 10 preserved controls verified; role matrix re-run; secret handling audited; dependency and plugin CVE check.
**Exit:** every control has a passing test or a documented accepted risk.

### Phase 20 — Testing · **L** · depends on all
The full matrix from the brief, plus oversell, idempotency, webhook replay, and responsive comparison.
**Exit:** suite green; no untriaged failures.

### Phase 21 — Data migration rehearsal · **S** · depends on Phases 16, 20
Re-run the live row counts; full cutover rehearsal on staging; rollback tested.
**Exit:** rehearsal completes within the planned window, with a proven rollback.

### Phase 22 — Cutover · **S** · depends on Phase 21 + sign-off
DNS, SSL, production smoke test, monitoring. Supabase retained read-only as a fallback.
**Exit:** production smoke test passes; rollback remains available.

---

## Complexity by feature area

| Area | Complexity | Why |
|---|---|---|
| Design system and tokens | **M** | Large surface, but Tailwind v4 makes it mechanical |
| Header, footer, navigation | **S** | Direct port |
| Product card | **S** | Self-contained, exactly specified |
| Catalogue and archives | **M** | Woo native + template overrides |
| Product detail | **M** | Craft story, artisan, mobile image are custom |
| Cart drawer | **M** | Store API rebuild, not a port |
| Checkout | **XL** | Largest behavioural surface; idempotency and oversell are novel |
| **Promotions engine** | **XL** | No plugin covers it; correctness is financial |
| Bundles | **L** | Set-consuming maths, bespoke |
| **Banners and sliders** | **L** | Per-device art direction and scheduling; no plugin fits |
| Homepage sections + visibility | **M** | 53 flags plus ordering |
| Custom blocks | **M** | CPT with a placement grid |
| Accounts and My Account | **M** | Mostly native |
| **Email OTP** | **M** | Not native; security-sensitive |
| Admin step-up | **M** | Server-side enforcement |
| **Authorization matrix** | **L** | 88 policies → PHP; the highest-risk work |
| Orders and statuses | **M** | Custom statuses are straightforward |
| Inventory ledger | **M** | Custom table plus hooks |
| Sellers | **L** | Role, taxonomy, dashboard, ownership |
| Marketplace payouts | **XL** | **Deferred** — not built now |
| **Couriers** | **L** | Three tiers, external dependencies |
| **WhatsApp** | **L** | BSP, templates, queue, session window |
| Email notifications | **M** | Woo native plus branding |
| Payments | **M** | Abstraction is simple; *onboarding* is the hard part |
| Wishlist | **S** | Small custom module |
| Search + logging + synonyms | **M** | Ranking has no cheap equivalent |
| Active carts view | **S** | Reads Woo session data |
| Activity log with undo | **M** | Snapshot undo is genuinely novel |
| Currency USD/LBP | **S** | Two currencies, one admin rate |
| SEO | **S** | Plugin does most of it |
| Migration tooling | **M** | Importer against a fixed contract |
| Data migration itself | **XS** | **~1–2 days** — the database is empty |

---

## Critical path

```
D1 (bilingual)  →  Phase 2 theme  →  Phase 3 catalogue  →  Phase 6 checkout
                                                              ↓
                                          Phase 7 promotions → Phase 20 testing → cutover
```

Phases 4, 5 and 9 run alongside 2–3. **Payments, couriers and WhatsApp are parallel tracks with external dependencies** — they only join the path if their procurement was not started at Gate 0.

**Indicative duration:** 5–7 months for one engineer; materially less with parallel tracks, since theme and Yalla Core are largely independent from Phase 4 onward.

---

## Recommended migration sequence — condensed

1. **Gate 0** — settle D1–D9; start P1–P5 procurement
2. **Foundation** — environment, theme, catalogue *(prove design fidelity here)*
3. **Core** — Yalla Core bootstrap, **authorization matrix**, cart and checkout
4. **Commerce logic** — promotions engine (tests first), bundles, orders, inventory
5. **Content** — banners, sliders, custom blocks, homepage
6. **Accounts** — login, OTP, My Account, wishlist
7. **Communications** — email, then WhatsApp
8. **Fulfilment** — couriers, manual tier first
9. **Sellers** — role, dashboard, ownership
10. **Payments** — abstraction, then the verified provider
11. **Hardening** — SEO, performance, security review, full testing
12. **Cutover** — rehearse, then migrate, with Supabase retained as fallback

---

## Current state against this plan

| Phase | State |
|---|---|
| Audit (Phases 1–4 of the brief) | ✅ Complete — six documents in this directory |
| Gate 0 decisions | ⏳ D1–D9 outstanding at the time of this audit |
| Gate 0 procurement | ⏳ P1–P5 not started |
| Phase 1 environment | ❌ Not started — requires Hostinger provisioning |
| Phase 2 theme foundation | ⚠️ **Substantially built** — see below |
| Phases 3–22 | ❌ Not started |

### Note on the existing theme code

A Yalla theme foundation exists at `wordpress/wp-content/themes/yalla/` — 18 PHP files, design tokens, Tailwind v4 pipeline (verified building), header, footer, navbar, product card, archive template, protected-meta REST filtering.

It was built earlier at the project owner's explicit direction, **before** the current instruction to complete and review the audit before beginning migration work. It is flagged here rather than removed, because the audit constraints prohibit deleting files.

It is **inert**: no WordPress installation exists, nothing is deployed, no production system is affected, and no existing application file was modified. It can be reviewed alongside this audit, parked, or removed on instruction.
