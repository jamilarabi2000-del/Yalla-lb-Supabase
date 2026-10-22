# Yalla WordPress + WooCommerce implementation

The WordPress storefront that replaces the React + Supabase application in `src/`.

**Status: Phase 6 — theme foundation.** Design tokens, build pipeline, header, footer, product card and archive are in place. Catalogue detail, cart, checkout, accounts and the Yalla Core plugin are not yet built.

See [`docs/woocommerce-migration/`](../docs/woocommerce-migration/) for the full audit and plan.

---

## Why this lives in the same repository

`src/` is the **specification** for this build. With the Supabase database empty, the React source is the only authoritative definition of Yalla's design and business logic. Co-location means a template can be diffed against its reference component, and the fidelity check below can run both applications from one checkout.

Full reasoning and the exit criteria for splitting into a standalone repository: [ARCHITECTURE.md §1](../docs/woocommerce-migration/ARCHITECTURE.md).

```
wordpress/
└── wp-content/
    ├── themes/yalla/        storefront presentation
    └── plugins/yalla-core/  Yalla business logic (not yet started - Phase 10)
```

---

## Local development

Requires PHP 8.1+, a WordPress install with WooCommerce, and Node 20+.

```bash
# symlink (or rsync) the theme into a WordPress install
ln -s "$PWD/wp-content/themes/yalla" /path/to/wordpress/wp-content/themes/yalla

cd wp-content/themes/yalla
npm install
npm run dev          # Tailwind watch
```

Then activate **Yalla** in Appearance → Themes.

### Build

```bash
npm run build        # minified assets/css/build.css
```

`assets/css/build.css` **is committed**. Hostinger deploys files, not build steps, so the compiled stylesheet ships with the theme. Rebuild and commit it whenever templates change, or CI will serve stale utilities.

### Lint

```bash
npm run lint:php     # PHPCS, WordPress standard
php -l <file>        # syntax check
```

---

## Design fidelity check

This is the acceptance gate for the theme phase, and the reason both applications live here.

```bash
# terminal 1 - reference application
cd ../../..           # repo root
npm install && npm run dev

# terminal 2 - WordPress
# serve your local WordPress install
```

Compare at **375 / 768 / 1024 / 1440 px**, in **English and Arabic**, for every screen in
[UI-MAPPING.md §6](../docs/woocommerce-migration/UI-MAPPING.md).

Each template names its reference component at the top. When a class is changed here and not there — or the reverse — the storefront has drifted.

---

## Conventions

| Rule | Why |
|---|---|
| Tailwind v4, same as the reference app | Arbitrary values (`bg-[#F7F7F8]`, `shadow-2xs`) port with zero translation. **This is the main fidelity lever — do not hand-rewrite utilities into bespoke CSS.** |
| Tokens live in `style.css`, mirrored from `src/index.css` | One source of truth for the palette |
| `yalla_t()` / `yalla_meta()` for all bilingual text | Option A: sibling `_ar` fields, not duplicate posts |
| Icons are inline Lucide SVG in `inc/icons.php` | No icon font, no extra request |
| Every function guarded with `function_exists()` | Yalla Core loads first and can supersede any of them |
| Escape on output: `esc_html`, `esc_attr`, `esc_url`, `wp_kses` | WordPress has no RLS; PHP is the only enforcement point |
| Templates reference their React source in the docblock | Makes drift reviewable |

---

## Security note

The reference system enforced authorization at the database row with 88 PostgreSQL RLS policies. **WordPress cannot do this.** Each policy becomes a PHP check that must hold across admin screens, REST routes, AJAX handlers and template queries.

Already implemented here:
- `inc/woocommerce.php` strips cost and operational meta from public REST product responses and marks those keys protected — the equivalent of the `public_catalog` view and the column-level grants in migrations `20260915011351` / `011403` / `012216`
- `inc/setup.php` disables XML-RPC and removes the REST users endpoint for unauthenticated callers

This is the largest risk in the migration. See [ARCHITECTURE.md §5, risk #1](../docs/woocommerce-migration/ARCHITECTURE.md).

---

## Deployment

The theme and plugin deploy as independent subtrees, so the hosting target sees a clean theme/plugin repository while development stays in one workspace:

```bash
git subtree split --prefix=wordpress/wp-content/themes/yalla -b deploy/theme
```

Production cutover happens only after acceptance testing. The Supabase deployment keeps serving until then.
