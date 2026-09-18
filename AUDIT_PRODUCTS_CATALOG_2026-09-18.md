# Admin Audit — Products & Catalog Management (Products section)

**Date:** 2026-09-18
**Scope:** `src/components/admin/ProductsCatalogManagement.tsx` and the code paths it
drives (`ShopContext.updateProduct` / `reorderProducts`, `supabaseProductService`,
`supabaseCatalogService.upsertProduct`, `src/lib/productValidation.ts`).
Storefront files are referenced only where they consume what this screen writes.

Out of scope: Categories, CMS, Sellers, Orders, Reviews.

Every finding below was verified against the source at commit `5b89dc3`. Line numbers
refer to that commit.

---

## Severity summary

| ID | Severity | Issue |
| :--- | :--- | :--- |
| P1 | Critical | Storefront sequence ordering is never written to the database |
| P2 | Critical | Promo price stored inverted — customer is charged the higher price |
| P3 | High | Cleared fields never clear in the database |
| P4 | High | Image-URL validation is dead code (regex bug) |
| P5 | High | Unsaved sequence edits are silently discarded |
| P6 | High | Edit form is reset by unrelated seller refreshes |
| P7 | High | Bulk actions hit invisible products and always report success |
| P8 | Medium | A product with a live promotion can no longer be saved |
| P9 | Medium | Promotion rule replacement is non-atomic and over-broad |
| P10 | Medium | Double-discount exposure (product column + discount rule) |
| P11 | Medium | Category displayed and exported as a raw UUID |
| P12 | Medium | Quick price/stock edit loses focus after every character |
| P13 | Medium | Low-stock badge ignores the configured threshold |
| P14 | Medium | CSV bulk upload silently drops rows and misreports the result |
| P15 | Medium | `saveQuick` has no error handling |
| P16–P20 | Low | Defaults, feedback and confirmation inconsistencies |

---

## P1 — Critical: storefront sequence ordering is never written to the database

**Current behaviour.** "Organize Sequence" → reorder → **Save Products Order** calls
`saveOrder()` (`ProductsCatalogManagement.tsx:318`), which awaits
`reorderProducts(sequence)` and then toasts
`Saved storefront sequence for N products.`

`reorderProducts` (`src/context/ShopContext.tsx:1787-1814`) does exactly three things:

```ts
setProducts(updatedProducts);                                  // React state
localStorage.setItem(CATALOG_CACHE_KEYS.products, JSON.stringify(updatedProducts));
await logAdminActivity('product_update', 'Products reordered', …);
```

There is **no Supabase write anywhere in the function.** `products.display_order` is
never updated. A repo-wide search for a `display_order` write on the products table
returns only category/CMS/media writers — nothing for product ranking.

**Impact.** The merchandising order an admin carefully builds survives only in that
one browser's `localStorage`. Every other admin, every visitor, and that same admin
after a cache clear or on another device sees the old order. The success toast and the
admin-activity log entry both claim it was saved, so the failure is invisible — this is
the worst kind of data loss because nobody finds out until the storefront looks wrong.
The recent commits `01cd421`, `207b371`, `adeff2a` built increasingly elaborate UI on
top of a save path that does not persist.

**Fix.** Persist the ranking, and only report success once the write lands:

```ts
const reorderProducts = async (orderedProducts: Product[]) => {
  const rows = orderedProducts.map((p, idx) => ({ id: p.id, display_order: idx + 1 }));
  const previous = products;                       // for rollback

  setProducts(/* optimistic, as today */);

  const { error } = await supabase.rpc('admin_reorder_products', { p_rows: rows });
  if (error) {
    setProducts(previous);                         // roll back the optimistic state
    throw error;                                   // saveOrder already surfaces this
  }

  await logAdminActivity('product_update', 'Products reordered', …);
};
```

Prefer a `SECURITY DEFINER` RPC that updates every row in one statement/transaction, so a
partial failure cannot leave half the catalogue renumbered:

```sql
create or replace function public.admin_reorder_products(p_rows jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then
    raise exception using errcode='42501', message='Administrator authorization required';
  end if;

  update public.products p
  set display_order = (r->>'display_order')::int
  from jsonb_array_elements(p_rows) r
  where p.id = (r->>'id')::uuid;
end; $$;
```

A plain `upsert` on `products` would also work but risks blanking columns and fights the
column-level grants added in `enforce_product_column_least_privilege`; the RPC is cleaner.

---

## P2 — Critical: promo price is stored inverted, so customers are charged the higher price

**Current behaviour.** The form treats **Price (USD)** as the regular price and
**Promo Price** as the temporary lower selling price — that is stated in the comment at
`ProductsCatalogManagement.tsx:477` and implemented in `setPromoPrice` (line 517):

```ts
const discount = discountFromPrices(regular, validPromo);   // (regular - promo) / regular
```

The promo value is held in `form.originalPriceUSD`, and the save payload (line 195) keeps
it there only when it is *lower* than the regular price:

```ts
originalPriceUSD: (() => {
  const promo = Number(form.originalPriceUSD || 0);
  return promo > 0 && promo < price ? promo : undefined;   // promo is the LOWER number
})(),
priceUSD: price,                                            // regular is the HIGHER number
```

So a product priced $100 with a $80 promo is written as
`price_usd = 100`, `original_price_usd = 80`, `discount_percentage = 20`.

The storefront reads those columns with the opposite convention. `ProductCard.tsx:163-171`:

```tsx
<span className="font-black">{formatPrice(product.priceUSD)}</span>
{product.originalPriceUSD && (
  <span className="line-through">{formatPrice(product.originalPriceUSD)}</span>
)}
```

and `ProductDetailView.tsx:40` computes the discount as
`p.priceUSD < p.originalPriceUSD ? … : 0` — it expects `originalPriceUSD` to be the
**higher** pre-discount price.

**Impact.** The shopper sees **"$100  ~~$80~~"** with a *20% OFF* badge, and the cart
charges $100. The strike-through is on the cheaper number, the discount is never applied
to what is paid, and the badge advertises a reduction the customer does not receive.
This is simultaneously a revenue-integrity bug, a consumer-trust problem, and — because
the storefront visibly advertises a discount it does not honour — a consumer-protection
exposure. Nothing downstream corrects it: `upsertProduct` (`supabaseCatalogService.ts:1258`)
maps the fields straight through.

**Fix.** Make the admin form write the same convention the storefront reads:
`price_usd` = what the customer pays now, `original_price_usd` = the higher struck-through
price, present only while a promotion is active.

```ts
const regular = Number(form.priceUSD);                 // "Price (USD)" — the list price
const promo   = Number(form.originalPriceUSD || 0);    // "Promo Price" — what they pay
const hasPromo = promo > 0 && promo < regular;

// …in the payload:
priceUSD:         hasPromo ? promo   : regular,
originalPriceUSD: hasPromo ? regular : null,   // null, not undefined — see P3
discountPercentage: hasPromo ? discountFromPrices(regular, promo) : null,
```

Rename the state key from `originalPriceUSD` to `promoPriceUSD` inside the form so the
field name stops meaning the opposite of the column it lands in — that naming collision is
what hid this bug.

**Migrate the existing rows.** Any product already saved with a promo is stored inverted
and must be corrected, not just fixed going forward:

```sql
update public.products
set price_usd = original_price_usd,
    original_price_usd = price_usd
where original_price_usd is not null
  and original_price_usd < price_usd;
```

Run it once, after the code fix ships, and check the affected rows first with the matching
`select`.

---

## P3 — High: cleared fields never clear in the database

**Current behaviour.** The payload converts every empty optional field to `undefined`
(`ProductsCatalogManagement.tsx:193-207`), e.g.

```ts
lowStockNotice:  String(form.lowStockNotice || '').trim() || undefined,
costPriceUSD:    Number(form.costPriceUSD) > 0 ? Number(form.costPriceUSD) : undefined,
seoTitle:        String(form.seoTitle || '').trim() || undefined,
```

On the edit path this reaches `upsertProduct`, which builds its payload through
`stripUndefined` (`supabaseCatalogService.ts:55-61`, "Remove undefined properties from a
payload"). Undefined keys are deleted before the upsert, so the column keeps its old value.

**Impact.** Clearing a field in the UI appears to work — the input empties, the save
succeeds, the toast says "Product updated successfully" — and the old value silently
remains live. Concretely: **a promotion cannot be ended from this screen.** Blank the
promo price, save, reopen: the old `original_price_usd` is still there and the storefront
still shows the (inverted, per P2) sale. The same applies to cost price, low-stock notice,
custom stock label, every SEO field, weight/volume and Arabic name.

`undefined` is the right signal for *"this call did not mention the field"* — which is how
targeted updates like the publish toggle avoid blanking columns, per the comment at
`ShopContext.tsx:4463`. The bug is that the full-form save uses the same signal for
*"the admin deliberately emptied this."*

**Fix.** Separate the two meanings. The form modal always submits every field it owns, so
it should send `null` for cleared values and let null through to the database:

```ts
const cleared = (v: string) => { const t = String(v ?? '').trim(); return t === '' ? null : t; };

lowStockNotice: cleared(form.lowStockNotice),
seoTitle:       cleared(form.seoTitle),
costPriceUSD:   Number(form.costPriceUSD) > 0 ? Number(form.costPriceUSD) : null,
```

and in `stripUndefined`, drop only `undefined`, never `null` (confirm the current
implementation at `supabaseCatalogService.ts:55-61` does not also filter `null`). Partial
callers such as `updateProduct(id, { isPublished })` keep passing `undefined` for
everything else and keep their current protection.

---

## P4 — High: image-URL validation is dead code

**Current behaviour.** `ProductsCatalogManagement.tsx:486`:

```ts
const imageLooksLikeWebPage = (url: string) => /\\.html?(?:[?#]|$)/i.test(url.trim());
```

In a regex literal `\\` is an **escaped backslash** — it matches a literal `\` character,
then `.` matches any character. The pattern therefore means "a backslash, any character,
then `htm`/`html`", which no ordinary URL contains. Verified:

```
https://x.com/a.html      → false   (should be true)
https://x.com/a.htm?q=1   → false   (should be true)
https://x.com/img.jpg     → false   (correct)
```

**Impact.** Both consumers are inert: the blocking validation at line 164
(`'Use a direct image URL, not an .html webpage.'`) never fires, and the inline red warning
under the image preview at line 616 never renders. Admins can save a webpage URL as the
primary image; the storefront then renders a broken image, and because `ProductCard`'s
`<img>` has no `onError` fallback the product shows an empty box.

**Fix.** One character:

```ts
const imageLooksLikeWebPage = (url: string) => /\.html?(?:[?#]|$)/i.test(url.trim());
```

Worth pairing with a real check, since a direct-looking URL can still 404 — the form
already renders a preview `<img>` (line 616) with `onError`; hook that into
`validationErrors.image` so a failed load blocks the save.

---

## P5 — High: unsaved sequence edits are silently discarded

**Current behaviour.** `ProductsCatalogManagement.tsx:78-80`:

```ts
React.useEffect(() => {
  setSequence([...filtered].sort((a, b) => (a.displayOrder ?? 999999) - (b.displayOrder ?? 999999)));
}, [filtered]);
```

`filtered` is a `useMemo` over `products` (line 68), and `products` comes from ShopContext,
which is refreshed by Supabase Realtime and by the `yalla-products-changed` event this very
component dispatches after a create (line 245).

**Impact.** Any product change from any source — a realtime update from another admin, a
publish toggle, a quick price save, or simply typing in the search box — rebuilds
`sequence` from the database order and throws away the drag-ordering in progress.
`orderDirty` is **not** cleared, so the button keeps reading
`Save Products Order (N pending)` over an order that has already reverted. Pressing it then
saves the database's existing order back over itself.

**Fix.** Do not clobber pending work:

```ts
React.useEffect(() => {
  if (orderDirty) {
    // Reconcile only membership: keep the admin's ranking, append new products,
    // drop ones that disappeared.
    setSequence(prev => {
      const byId = new Map(filtered.map(p => [p.id, p]));
      const kept = prev.filter(p => byId.has(p.id)).map(p => byId.get(p.id)!);
      const added = filtered.filter(p => !prev.some(q => q.id === p.id));
      return [...kept, ...added];
    });
    return;
  }
  setSequence([...filtered].sort((a, b) => (a.displayOrder ?? 999999) - (b.displayOrder ?? 999999)));
}, [filtered, orderDirty]);
```

Also guard navigation away from the tab while `orderDirty` is true.

---

## P6 — High: the edit form is reset by unrelated seller refreshes

**Current behaviour.** `ProductsCatalogManagement.tsx:107-126`:

```ts
React.useEffect(() => {
  if (!editing) return;
  const linkedSeller = sellers.find(s => s.id === editing.sellerId);
  setForm({ ...emptyProduct(), ...editing, /* …every field rebuilt… */ });
}, [editing, sellers]);
```

**Impact.** `sellers` is a live array from ShopContext. Any refresh of it produces a new
array reference, the effect re-runs, and `setForm` **replaces the entire form object** with
values rebuilt from `editing` — the pristine product. An admin half-way through editing a
description loses every unsaved change mid-typing, with no warning. The same effect also
fights the async promotion loader in `openEdit` (line 86), which merges
`promotionScheduleEnabled` / `promotionStartAt` / `promotionEndAt` into the form after its
`discount_rules` query resolves: a later `sellers` refresh wipes those too, so a scheduled
promotion can silently drop off the form before the admin saves.

**Fix.** Key the reset to the product identity only, and resolve the seller separately
without rebuilding the form:

```ts
React.useEffect(() => {
  if (!editing) return;
  setForm({ ...emptyProduct(), ...editing, /* … */ });
}, [editing?.id]);          // not the whole `editing` object, and not `sellers`

// Fill seller-derived fields in a second effect that merges instead of replacing:
React.useEffect(() => {
  const linked = sellers.find(s => s.id === editing?.sellerId);
  if (!linked) return;
  setForm((v: any) => ({
    ...v,
    seller:       v.seller       || linked.nameEn || '',
    arabicSeller: v.arabicSeller || linked.nameAr || '',
    artisan:      v.artisan      || linked.nameEn || '',
    origin:       v.origin       || linked.region || '',
  }));
}, [editing?.sellerId, sellers]);
```

The existing fallback effect at lines 128-150 already uses this merge shape and can stay.

---

## P7 — High: bulk actions hit invisible products and always report success

Three separate defects in the same flow.

**7a — selection is never pruned when filters change.** `selected` (line 52) holds product
IDs across filter changes. Select 10 products, then change the category filter: those 10
stay selected but are off-screen. **Delete** then removes products the admin cannot see and
did not mean to include. `bulkDelete` (line 301) confirms with
`Delete ${selected.size} selected product(s)?` — a count that does not match what is on
screen.

**7b — success is reported unconditionally.** `bulkPublish` (line 296):

```ts
await Promise.allSettled([...selected].map(id => updateProduct(id, { isPublished: published })));
showToast(`${selected.size} product(s) ${published ? 'published live' : 'saved as drafts'}.`, 'success');
```

`allSettled` never rejects, and the result array is discarded. If all 20 updates fail —
RLS denial, network loss, a validation throw from `updateProduct` — the admin is told
20 products were published. `bulkDelete` has no error handling at all.

**7c — `allSelected` is wrong across filters.** Line 82:
`filtered.length > 0 && selected.size === filtered.length`. With 5 visible products and 5
selected-but-hidden ones, the header reads "Clear Selection" although nothing visible is
ticked.

**Fix.**

```ts
const visibleSelected = useMemo(
  () => filtered.filter(p => selected.has(p.id)).map(p => p.id),
  [filtered, selected]
);
const allSelected = filtered.length > 0 && visibleSelected.length === filtered.length;

const bulkPublish = async (published: boolean) => {
  if (!visibleSelected.length) return;
  const results = await Promise.allSettled(
    visibleSelected.map(id => updateProduct(id, { isPublished: published }))
  );
  const ok = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.length - ok;
  showToast(
    failed
      ? `${ok} product(s) updated, ${failed} failed.`
      : `${ok} product(s) ${published ? 'published live' : 'saved as drafts'}.`,
    failed ? 'warning' : 'success'
  );
};
```

Apply the same `visibleSelected` scoping and result counting to `bulkDelete`, and prune
`selected` down to visible IDs whenever the filters change.

---

## P8 — Medium: a product with a live promotion can no longer be saved

**Current behaviour.** Validation at lines 168-172:

```ts
} else if (startAt && startAt <= now) {
  errors.promotionStartAt = 'Promotion cannot start in the past. Select the current date/time or a future date/time.';
}
```

**Impact.** `openEdit` restores `promotionStartAt` from the stored rule (line 96). Once the
promotion has begun, that timestamp is in the past by definition, so **every subsequent
save of that product fails** — including saves that have nothing to do with pricing, like
fixing a typo or adjusting stock. The admin is told to pick a future start date for a
promotion that is already running.

**Fix.** Only enforce a future start on a schedule the admin is actually creating or moving:

```ts
const originalStart = editing ? loadedPromotionStartAt : null;   // captured in openEdit
const startChanged  = String(form.promotionStartAt || '') !== String(originalStart || '');

if (!String(form.promotionStartAt || '').trim()) {
  errors.promotionStartAt = 'Promotion start date and time are required when scheduling is enabled.';
} else if (startChanged && startAt && startAt <= now) {
  errors.promotionStartAt = 'A new promotion cannot start in the past.';
}
```

The end-date rule (`endAt <= now`) is legitimate as-is: an expired end date should block a
save regardless.

---

## P9 — Medium: promotion rule replacement is non-atomic and over-broad

**Current behaviour.** Lines 265-290: select all `discount_rules` matching
`{ target: 'product', targetValue: savedProductId }`, `delete` them, then `insert` the new
one — three separate round trips with no transaction.

**Impact.** If the insert fails (network drop, RLS, validation) the delete has already
committed: the product silently ends up with **no** promotion, and the admin sees only a
generic error. The `.contains()` match is also untargeted — it removes *any* rule aimed at
that product, including ones created by a campaign tool or another admin, not just the
single rule this screen manages.

**Fix.** Move the replace into one server-side transaction:

```sql
create or replace function public.admin_set_product_promotion(
  p_product_id uuid, p_rule jsonb
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then
    raise exception using errcode='42501', message='Administrator authorization required';
  end if;

  delete from public.discount_rules
  where rule @> jsonb_build_object('target','product','targetValue',p_product_id::text)
    and rule->>'source' = 'product_form';        -- only rules this screen owns

  if p_rule is not null then
    insert into public.discount_rules(name, description, is_active, rule)
    values (p_rule->>'name', p_rule->>'description', true,
            p_rule->'rule' || jsonb_build_object('source','product_form'));
  end if;
end; $$;
```

Tagging rules with `source: 'product_form'` on insert is what makes the delete safe to
scope; add it to the insert at line 275 in the same change.

---

## P10 — Medium: double-discount exposure

**Current behaviour.** A single save writes the discount in two places: onto the product
row as `discount_percentage` (payload line 196 → `upsertProduct` line 1262) **and** into
`discount_rules` as a percentage rule targeting that product (line 275).

**Impact.** If the checkout path applies rule-based discounts on top of a price that
already reflects `discount_percentage`, the reduction lands twice — a 20% promo becomes 36%
off. The existing migration `20260917023644_fix_checkout_coupon_double_apply_and_rate_limit`
shows this class of bug has already bitten once on the coupon path.

**Fix.** Pick one source of truth. The cleaner option is to let `discount_rules` own
*scheduled* promotions and keep `products.discount_percentage` strictly for the always-on
price relationship derived from `price_usd`/`original_price_usd`:

```ts
discountPercentage: payload.promotionScheduleEnabled ? null : computedDiscount,
```

Then verify the checkout RPC's ordering with a test that places an order against a product
carrying both a `discount_percentage` and an active rule, and asserts the charged total.
Until that test exists this remains a live risk, not a theoretical one.

---

## P11 — Medium: category displayed and exported as a raw UUID

**Current behaviour.** `Product.category` deliberately holds the category **UUID** —
`supabaseCatalogService.ts:130-135`: *"Product.category intentionally contains the Supabase
category UUID."* The form validates it as a UUID (line 176). But two places render it as
if it were a label:

- `ProductCard`, line ~437: `<span className="…truncate…">{p.category}</span>`
- `downloadCatalog`, line 372: `category: p.category || ''`

**Impact.** The admin grid shows `9f3c1a2e-7b44-…` where the category name belongs, and the
"Catalog CSV" export ships UUIDs — unusable for a supplier or a spreadsheet review. The
filter itself is correct (line 73 compares UUID to UUID), so this is presentation only.

A related nuisance: the search haystack (line 70) includes `p.category`, i.e. the UUID, so
typing a category name never matches on category.

**Fix.**

```ts
const categoryNameById = useMemo(
  () => new Map(categories.map((c: any) => [c.id, c.nameEn || c.name || ''])),
  [categories]
);
const categoryLabel = (p: Product) => categoryNameById.get(p.category) || '—';
```

Use `categoryLabel(p)` in the card and in the CSV export, and put it in the search haystack
in place of the raw UUID.

---

## P12 — Medium: quick price/stock edit loses focus after every character

**Current behaviour.** `ProductCard` is declared **inside** the component body (line 420)
and rendered as an element (line 693):

```tsx
const ProductCard = ({ p, index }) => { … };            // new function identity each render
…
{sequence.map((p, i) => <ProductCard key={p.id} p={p} index={i} />)}
```

**Impact.** Typing in the PRICE or STOCK box calls `setQuick` → `setQuickValues` → the
parent re-renders → `ProductCard` is a brand-new function → React sees a different element
type, unmounts the old subtree and mounts a new one. The `<input>` is destroyed and
recreated, so **focus is lost after every keystroke** and the admin must click back into
the field for each character. Every card in the grid remounts on every keystroke, which
also makes the screen sluggish with a large catalogue.

Note the `Modal` on line 714 is invoked as `{modalOpen && Modal()}` — a plain function call,
which inlines its JSX into the parent tree and therefore does **not** remount. The modal is
fine; only the grid cards are affected. (This is also why the bug may look intermittent:
it reproduces in the grid, not in the edit form.)

**Fix.** Either match the modal's pattern:

```tsx
{sequence.map((p, i) => <React.Fragment key={p.id}>{ProductCard({ p, index: i })}</React.Fragment>)}
```

or, better, hoist `ProductCard` to module scope and pass what it needs as props
(`quickValues[p.id]`, `setQuick`, `saveQuick`, `openEdit`, `updateProduct`, `deleteProduct`,
`toggle`, `selected.has(p.id)`, `viewMode`), wrapping it in `React.memo` so unrelated cards
stop re-rendering.

---

## P13 — Medium: low-stock badge ignores the configured threshold

**Current behaviour.** Line 421: `const stockState = Number(p.stock) <= 0 ? 'out' : Number(p.stock) <= 5 ? 'low' : 'ok';`

**Impact.** The form collects a per-product **Low Stock Threshold** (defaulting to 5 at
payload line 199) and persists it, but the card ignores it and hardcodes 5. A product whose
threshold is 50 shows a healthy green "120 in stock" right down to 6 units, so the warning
the admin configured never appears where they look for it.

**Fix.**

```ts
const threshold = Number(p.lowStockThreshold ?? 5);
const stockState = Number(p.stock) <= 0 ? 'out' : Number(p.stock) <= threshold ? 'low' : 'ok';
```

---

## P14 — Medium: CSV bulk upload silently drops rows and misreports the result

**Current behaviour.** `handleBulkUpload`, lines 383-410:

```ts
if (!name) continue;
if (!Number.isFinite(price) || price <= 0 || !Number.isInteger(stock) || stock < 0) continue;
if (!categoryId || !brand) continue;
try { await supabaseProductService.createProduct({ … }); created++; }
catch { /* keep valid rows importing */ }
…
showToast(`Bulk upload complete: ${created} product(s) imported.`, created ? 'success' : 'warning');
```

**Impact.** Four problems compound:

1. Rows failing any guard are skipped with no record of which or why.
2. Per-row server errors are swallowed by the bare `catch {}`.
3. The toast reports only the created count — importing 100 rows of which 90 failed reads
   as "Bulk upload complete: 10 product(s) imported." with a green success style.
4. Unlike the manual form, there is **no duplicate seller-item-code check**
   (`checkDuplicateProductNumber` is never called here), so a re-run of the same CSV
   creates duplicates of every row.

Also `await` in a `for` loop means one round trip per row — a 500-row import is 500
sequential requests with no progress indicator and no cancel.

**Fix.** Collect outcomes and report them honestly:

```ts
const skipped: { row: number; reason: string }[] = [];
const failed:  { row: number; reason: string }[] = [];
// …push a reason at every `continue`, and in catch (e) { failed.push({ row: i + 2, reason: e?.message }); }

showToast(
  `Imported ${created} of ${rows.length}. ${skipped.length} skipped, ${failed.length} failed.`,
  failed.length || skipped.length ? 'warning' : 'success'
);
if (skipped.length || failed.length) csvDownload([...skipped, ...failed], 'yalla_import_errors.csv');
```

Add the duplicate-code check before each create, and batch the inserts (chunks of ~25 via
`Promise.all`) with a progress count so a large import is usable.

---

## P15 — Medium: `saveQuick` has no error handling

**Current behaviour.** Lines 364-372:

```ts
await updateProduct(p.id, { priceUSD: price, stock });
showToast(`${p.name} price/stock updated.`, 'success');
```

**Impact.** `updateProduct` throws on a duplicate seller-item-code, on a seller
authorization failure (`ShopContext.tsx:4392-4397`) and on any Supabase error. The throw
escapes an `onClick` handler as an unhandled promise rejection: no toast, no message, the
edited value stays on screen looking saved. Meanwhile `updateProduct` has already applied
its optimistic `setProducts`, so the grid shows the new price until the next refresh
silently reverts it.

**Fix.**

```ts
try {
  await updateProduct(p.id, { priceUSD: price, stock });
  showToast(`${p.name} price/stock updated.`, 'success');
} catch (e: any) {
  showToast(e?.message || 'Could not update price/stock.', 'error');
}
```

The same guard belongs on the inline publish toggle (line 445) and the card delete
(line 446), which are both bare `onClick={() => updateProduct(…)}` calls.

---

## P16–P20 — Low

**P16 — inconsistent `isNewArrival` default.** `emptyProduct()` sets `isNewArrival: true`
(line 19, per commit `2a70a0d`), but the edit effect coerces with `?? false` (line 115). An
existing product whose column is null flips to "not a new arrival" merely by being opened
and saved. Use one default in both places.

**P17 — `goToRank` fails silently.** Lines 357-359 `return` without feedback when the typed
rank is non-numeric or out of range, so "Move to: 99 → Go" on a 40-product list does
nothing and says nothing. Show a toast or mark the input invalid.

**P18 — misleading toast on reset.** `resetOrder` (line 332) discards the admin's work and
reports it with a `'success'` toast. Use `'info'`/`'warning'` wording
("Sequence changes discarded").

**P19 — dead payload fields.** `promotionScheduleEnabled`, `promotionStartAt` and
`promotionEndAt` are assembled into the payload (lines 197-199) and passed to
`updateProduct`, but `upsertProduct` maps an explicit column list that does not include
them, so they are dropped. Harmless today — the schedule genuinely lives in
`discount_rules` — but it reads as if the product row stores them. Drop them from the
payload or add a comment.

**P20 — inconsistent delete confirmation.** The grid card deletes immediately
(`onClick={() => deleteProduct(p.id)}`, line 446). Bulk delete confirms (line 302) and the
sequence-table delete confirms (line 706). Add the same `window.confirm` to the card so one
mis-click cannot destroy a product.

---

## Suggested order of work

1. **P1** and **P2** first — both are actively wrong in production, and P2 needs the data
   migration as well as the code change.
2. **P3**, since P2's "end the promotion" path depends on being able to clear a column.
3. **P5**, **P6**, **P7** — silent loss of admin work.
4. **P4**, **P8**, **P12**, **P15** — small, self-contained, high daily annoyance.
5. **P9**, **P10** with a checkout total test; **P11**, **P13**, **P14**.
6. **P16–P20** as cleanup.

P1, P2, P3 and P10 all warrant a regression test: they are the four that change what a
customer is charged or what the storefront shows, and all four currently fail silently.
