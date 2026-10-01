# Yalla.lb → WordPress + WooCommerce · Read-Only Audit

**Status: audit complete, awaiting review. No production changes. No existing application file modified.**

Audit date **2026-09-17** · commit `8a0b539` · live Supabase project `yjmpjuskgbbshrvhgmys`

---

## Required deliverables

| # | Document | Covers |
|---|---|---|
| 1 | **[CURRENT-YALLA-INVENTORY.md](./CURRENT-YALLA-INVENTORY.md)** | Every route, page, component, context, service, table, function, auth flow, design token and known bug. **§16 carries the full feature classification.** |
| 2 | **[UI-MAPPING.md](./UI-MAPPING.md)** | Every screen → WordPress template; full theme file plan; design-fidelity strategy |
| 3 | **[DATA-MAPPING.md](./DATA-MAPPING.md)** | Every Supabase column → WordPress entity / meta key / migration method |
| 4 | **[PLUGIN-BOM.md](./PLUGIN-BOM.md)** | Plugins required, rejected, costs, security considerations |
| 5 | **[MIGRATION-RISKS.md](./MIGRATION-RISKS.md)** | 16 risks, plus consolidated security and performance risk registers |
| 6 | **[MIGRATION-ROADMAP.md](./MIGRATION-ROADMAP.md)** | Gate 0 decisions and procurement, 22 phases, complexity by feature, critical path |

### Supporting

| Document | Covers |
|---|---|
| [PAYMENTS-LEBANON.md](./PAYMENTS-LEBANON.md) | Lebanon payment options, architecture, verification gate. **No provider selected** |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Repository recommendation, courier and WhatsApp design, Yalla Core module list |

---

## How findings are graded

Every finding carries an evidence grade. Confirmed findings and assumptions are never presented as equivalent.

| Grade | Meaning |
|---|---|
| **[C] CONFIRMED** | Verified by reading repository source, or by read-only query against the live Supabase project |
| **[A] ASSUMPTION** | Reasoned inference from the code. A working hypothesis, not a fact |
| **[U] UNVERIFIED** | Depends on an external party, vendor confirmation, or a live test not yet performed |

## Classification buckets

| Bucket | Share |
|---|---|
| **CUSTOM DEV REQUIRED** | ~52% |
| **REBUILD IN WP/WOO** | ~25% |
| **REUSE DESIGN** | ~15% |
| **REQUIRES DECISION** | ~8% |

Many features carry two buckets — typically REUSE DESIGN for the front end plus REBUILD IN WP/WOO for the engine behind it. That combination is the thesis of this migration.

**The headline:** "WooCommerce covers most of it" does **not** hold here. Just over half of all catalogued behaviour has no native WordPress or WooCommerce equivalent.

---

## The four findings that change the plan

### 1. The live database is effectively empty · **[C]**

0 products · 0 orders · 0 reviews · 0 storage objects · 1 user · 1 seller · 1 category · 6 regions · 1 CMS document.

The repository's seed files are blanked too — `src/data/products.ts` and `src/data/sellers.ts` export empty arrays.

**This is not a data-migration project.** Total data movement is 1–2 days. All value at risk is design, behaviour and business logic, which live in the React source. Risk shifts off ETL and onto storefront fidelity and re-implementing the discount and checkout engines.

### 2. Couriers, WhatsApp, payments and order email do not exist · **[C]**

They are described as things to migrate. They are **net-new development**:

- **Payment** — a 47-line HMAC webhook scaffold. No gateway, no 3DS, no refunds. COD is the only working method.
- **WhatsApp** — `wa.me` deep links and copy. Zero automation.
- **Courier** — status labels and a locally generated tracking number. No carrier, no API.
- **Email** — Supabase Auth mails only. **No order emails are sent.**

Each carries an external dependency that engineering effort cannot compress. Budget them separately.

### 3. Authorization is the largest technical risk · **[C]**

**88 RLS policies across 39 relations** enforce authorization at the database row, regardless of query path. WordPress has no equivalent — each becomes a PHP check that must hold across admin screens, REST routes, AJAX handlers and template queries. Missing one is a data-exposure bug.

### 4. `main` is currently broken, and was hiding more breakage · **[C]**

`main` fails `tsc --noEmit` (`Property 'brand' does not exist on type 'Product'`). Because lint short-circuits the CI job, **five source-contract tests have been failing invisibly**. One reflects a real atomicity regression: `supabaseProductService` is dead code, so product creation bypasses the `create_product_atomic` RPC.

---

## Decisions blocking the migration

| # | Decision | Recommendation | Blocks |
|---|---|---|---|
| D1 | Bilingual model | Sibling `_ar` meta (Option A) | **All theme work** |
| D2 | Repository layout | Same repo, `wordpress/`, deployable subtrees | Where everything lands |
| D3 | Launch on COD only? | Yes | Whether payments are on the critical path |
| D4 | The five failing tests | Triage each; never weaken a test | Admin auth specification |
| D5 | Product URLs | Slugs | SEO, routing |
| D6–D9 | Hero layouts, publish model, addresses, analytics | See roadmap | Scope |

Procurement to start in parallel: Lebanese legal entity, payment provider verification, courier API confirmation, WhatsApp BSP and template approval, Hostinger provisioning.

---

## Audit constraints observed

- ✅ Read-only audit completed before any recommendation
- ✅ No existing source file modified, deleted or overwritten
- ✅ `main` not changed — all work on a feature branch
- ✅ No generic WordPress theme proposed; the Yalla design is preserved
- ✅ No plugin assumed to cover custom functionality without checking against actual current behaviour
- ⚠️ A theme foundation was built earlier at the project owner's direction, before the instruction to complete the audit first. It is inert and flagged in [MIGRATION-ROADMAP.md](./MIGRATION-ROADMAP.md#note-on-the-existing-theme-code) rather than removed, since deleting files is prohibited here.

---

## Principles for the build

1. Preserve the Yalla visual design and customer journey — no generic WooCommerce storefront.
2. Use WooCommerce natively where it genuinely covers the behaviour; verify, never assume.
3. Keep Yalla-specific logic in one modular **Yalla Core** plugin, not many small plugins.
4. WooCommerce native → Yalla Core → *one* extension. Never overlapping plugins.
5. Admin controls **content**; the theme controls **presentation**. No hard-coded banners, fees or currency.
6. Do not retire Supabase until WordPress passes acceptance testing.
7. Do not regress below the current security posture.
