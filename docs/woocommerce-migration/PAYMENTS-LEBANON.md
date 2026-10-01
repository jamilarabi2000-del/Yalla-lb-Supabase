# PAYMENT ARCHITECTURE — LEBANON

Documented separately per master task §15: *"Do not hard-code a payment provider before verifying availability and WooCommerce compatibility. Payment provider selection must be documented separately."*

**Status: NO PROVIDER SELECTED. This document defines the architecture, the options and the verification gate. It is not a recommendation to sign with anyone.**

---

## 1. What exists today

**No payment gateway is integrated.** Verified in the current codebase:

- `supabase/functions/payment-webhook/index.ts` is a **47-line scaffold**. It verifies an HMAC-SHA256 signature in constant time, normalises `paid|failed|refunded|pending`, and writes one `order_events` row. It contains no provider SDK, no redirect flow, no 3DS handling and no refund path. Its own comment says *"Provider adapters should normalize into this contract before this boundary"* — those adapters do not exist.
- The `payment_method` enum in the live database is `cod_usd | cod_lbp | wish_omt | credit_card | whish_pay | omt_pay | cash_on_delivery` — intent is recorded, integration is not.
- `CheckoutView.tsx` renders four payment cards; **`cod_usd` is the default and the only one that completes an order**.

**Implication:** this is a greenfield build, not a migration. There is no live gateway relationship to preserve, no stored payment data to move, and no in-flight transactions to reconcile. That is a meaningful de-risking — the choice can be made on merit.

**Explicit constraint from master task §31: do not assume a Saudi payment provider.** Lebanon is the target market and provider availability there is materially different from the Gulf.

---

## 2. Requirements

| Requirement | Detail |
|---|---|
| Card schemes | Visa, Mastercard |
| Currency | **USD primary** (USD is the de-facto pricing currency in Lebanon today); LBP support desirable |
| 3-D Secure | Required — 3DS2 preferred |
| Refunds | Full and partial, initiated from WooCommerce admin |
| Webhooks | Signed, idempotent, replay-resistant |
| Payment verification | Server-side confirmation before the order advances past `pending` |
| Failure handling | Clear customer messaging; no stock leak; no duplicate charge |
| COD | Must remain — it is the current default and dominant in Lebanon |
| WooCommerce | An official or well-maintained gateway plugin, or a documented server-to-server API |
| Merchant eligibility | Must accept a **Lebanese registered business** |
| Settlement | To a Lebanese bank account, or a workable alternative |

---

## 3. Options to verify

Presented as candidates. **Each requires direct confirmation with the provider before selection.**

### Option A — Areeba
Lebanese fintech providing payment services to banks and merchants; the incumbent for many established Lebanese merchants, integrating directly with Lebanese banks.

| | |
|---|---|
| **Reported fees** | ~2–3%, negotiable on volume; settlement varies by bank |
| **WooCommerce** | Integration reported for WooCommerce; verify whether an official plugin exists or custom work is needed |
| **Onboarding** | Heavier paperwork; reportedly requires a registered Lebanese entity (a sole proprietorship / SARL) |
| **Strengths** | Local bank integration, brand trust with Lebanese consumers, stability at scale |
| **Risks** | Longest onboarding; plugin quality and maintenance must be verified; confirm 3DS2 and refund API support |

### Option B — Whish Money (whish pay)
Lebanese digital wallet and payment solution built for the local market; already anticipated in the schema (`whish_pay`, `wish_omt`).

| | |
|---|---|
| **Reported fees** | ~1–2%; settlement often same/next day |
| **WooCommerce** | Reported WordPress/Shopify integrations — verify the plugin's maintenance status |
| **Strengths** | Lowest reported fees, fast settlement, strong local consumer adoption, lighter onboarding |
| **Risks** | **Wallet-first, not a full card acquirer** — may not satisfy the Visa/Mastercard + 3DS requirement on its own. Likely a complement to a card gateway, not a replacement |

### Option C — International acquirer (Stripe / Checkout.com / Tap / MontyPay)
| | |
|---|---|
| **Critical caveat** | **Stripe does not list Lebanon as a supported country for merchant accounts.** Do not assume availability. Several providers serve Lebanese merchants only through a foreign entity |
| **Strengths** | Best-in-class WooCommerce plugins, excellent 3DS/refund/webhook APIs, strong documentation |
| **Risks** | Eligibility is the blocker, not technology. Registering a foreign entity to obtain access has tax, legal and settlement consequences that are a business decision, not an engineering one. MontyPay and Tap are reported to serve the region — verify Lebanon specifically |

### Option D — COD only at launch (**recommended interim**)
| | |
|---|---|
| **Cost** | $0 |
| **Why viable** | COD is already the default and the only working method; it dominates Lebanese e-commerce; the architecture below makes adding a gateway a contained change |
| **Enables** | Launch on schedule without blocking on merchant onboarding, which is the longest-lead item in this entire programme |
| **Risks** | Higher refusal/return rates; cash handling; no prepayment. Manageable, and already the status quo |

---

## 4. Recommended approach

**Launch with COD + a provider-agnostic gateway abstraction. Select the card provider in parallel, on evidence.**

Rationale:
1. Merchant onboarding (especially Areeba's) is the longest-lead item in the programme and is **not on the engineering critical path** if the abstraction exists.
2. COD already works and is what customers currently use — launching on it is not a downgrade.
3. Building the abstraction first means adding a provider later is a contained, testable change rather than a checkout rewrite.
4. Committing to a provider before verification would violate master task §15 and risks a costly reversal.

**Likely end state (to be confirmed by §6):** Areeba or a verified regional acquirer for cards, Whish Money as a local wallet option, COD retained permanently.

---

## 5. Architecture — provider-agnostic gateway layer

```
WooCommerce Checkout
        │
        ▼
Yalla Core payment abstraction
  ├── WC_Payment_Gateway subclass per provider
  ├── Yalla_Payment_Provider_Interface
  │     create_payment(order) → redirect|iframe|token
  │     verify_payment(reference) → status
  │     refund_payment(order, amount) → result
  │     handle_webhook(payload, signature) → normalized event
  └── Providers
        ├── COD                 (native Woo, always on)
        ├── Areeba adapter      (to build)
        ├── Whish adapter       (to build)
        └── <verified acquirer> (to build)
```

**Normalised webhook contract** — carry forward the one good idea from the existing scaffold:

| Field | Meaning |
|---|---|
| `order_id` | Yalla/Woo order reference |
| `payment_status` | `paid | failed | refunded | pending` |
| `event_id` | Provider event id, used for idempotency |
| `amount`, `currency` | Verified against the order server-side |

Each provider adapter normalises into this shape before the core handler sees it. The core handler stays provider-agnostic, exactly as the current Supabase scaffold intended.

### Non-negotiable rules
1. **Never store card data.** Use hosted redirect or iframe so PCI scope stays SAQ-A.
2. **Verify webhook signatures in constant time.** Reuse the `safeEqual` HMAC pattern already proven in `supabase/functions/payment-webhook/index.ts` — it is correct and should be ported verbatim in spirit.
3. **Idempotency on every webhook.** Store `event_id`; ignore replays. This pairs with the checkout idempotency requirement in DATA-MAPPING §6.
4. **Server-side amount verification.** Never trust the amount in a webhook or a client callback — compare against the order total before marking it paid.
5. **Order advances only on verified payment.** `pending` → `processing` happens on a verified webhook or a server-side status query, never on a browser redirect alone.
6. **Secrets in `wp-config.php` constants** or a secrets manager. Never in `wp_options` in plaintext. Master task §19 forbids exposing payment secrets.
7. **Stock is released on payment failure or timeout.** No silent stock leak.
8. **Full audit trail** — every payment state change written to the order timeline.

---

## 6. Verification gate — complete before selecting a provider

For each candidate, obtain **written confirmation from the provider**:

- [ ] Accepts a Lebanese registered business (state the entity type Yalla will use)
- [ ] Supports USD settlement; confirm LBP handling
- [ ] Supports Visa and Mastercard with 3DS2
- [ ] Provides a maintained WooCommerce plugin, **or** a documented REST API with current docs
- [ ] Supports full and partial refunds via API
- [ ] Provides signed webhooks; obtain the signature algorithm and verification sample
- [ ] Sandbox/test environment available before contract signature
- [ ] Full fee schedule in writing: transaction %, fixed fee, setup, monthly, chargeback, refund, FX
- [ ] Settlement period and destination bank confirmed
- [ ] Contract term, exit terms and data-portability terms
- [ ] Rolling reserve or holdback requirements disclosed
- [ ] If a plugin is supplied: last update date, WooCommerce version compatibility, known CVEs
- [ ] Reference from another Lebanese merchant at comparable volume

**No provider is selected until this checklist is complete for at least two candidates and the comparison is documented here.**

---

## 7. Open questions for the business

1. What Lebanese legal entity exists or will be registered? This gates every card option.
2. Expected monthly transaction volume and average order value? Fee negotiation depends on it.
3. Is USD-only acceptable at launch, or is LBP required from day one?
4. Is diaspora/international payment in scope at launch? (`diaspora_air` at $28 exists in the delivery model — international cards raise different acquiring questions.)
5. Is launching COD-only acceptable while card onboarding proceeds? **This is the key scheduling question in the entire programme** — if yes, nothing in payments blocks launch.

---

## Sources

Reviewed 2026-09-17. These are market-research sources, not provider documentation, and **do not substitute for the §6 verification gate**:

- [Payment Gateway Integration Lebanon — WebVue](https://webvue.com.lb/payment-gateways-lebanon/)
- [Best Secure Payment Gateway Integration in Lebanon — WebVue](https://webvue.com.lb/solutions/payment-gateways/)
- [Best Payment Gateway in Lebanon 2026: Tap vs Areeba — Voxire](https://voxire.com/blog/payment-gateways-lebanon-ecommerce-2026/)
- [7 Best Payment Gateways in Lebanon — WebSynergy](https://websynergy.tech/payment-gateways-lebanon-2025/)
- [Areeba](https://www.areeba.com/english/news/areeba-rolls-out-qr-code-payments-in-lebanon)
- [Whish Money](https://www.whish.money/whish-app)
- [Integration of Areeba Payment Gateway in WordPress — Codener](https://codener.com/a-guide-to-implementing-areeba-payment-gateway-in-wordpress-website/)
- [Payment Gateway Providers in Lebanon — IDAL (2019, dated but useful for the landscape)](https://investinlebanon.gov.lb/Content/uploads/SideBlock/200129024215368~Payment%20Gateway%20Providers%20in%20Lebanon.pdf)
