# Yalla — Supabase Setup

## Current production backend

- Supabase project: `Yalla`
- Project ref: `yjmpjuskgbbshrvhgmys`
- Region: `ap-south-1`
- Database: PostgreSQL 17
- Frontend: React + Vite
- Hosting target: Netlify

## Frontend environment

Create `.env.local` locally from `.env.example` and set:

```text
VITE_SUPABASE_URL=https://yjmpjuskgbbshrvhgmys.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<Supabase publishable key>
APP_URL=http://localhost:3000
```

Never put a Supabase service-role/secret key in the frontend.

## Database

The Supabase project already contains the Yalla schema, RLS policies, checkout protections, catalog view, CMS model, review protections, and storage policies. RLS is enabled on the public application tables.

Storage buckets:

- `yalla-media` — public product/CMS media
- `yalla-private` — private seller/admin files

## Authentication

Yalla uses Supabase Auth. Email/password and passwordless email OTP/magic-link flows are implemented through `supabase.auth`.

For production, configure the Supabase Auth URL configuration with the live application URL and its redirect paths. Do not add Firebase credentials or Firebase Auth configuration.

## First administrator

A newly created Supabase Auth user is a customer by default. After the administrator account has been created and email-confirmed, grant the account the `admin` role using the repository's controlled admin script or the Supabase SQL/MCP tooling. Never expose a service-role key in browser code.

## Verification

Run:

```bash
npm install
npm run verify
```

`npm run verify` performs TypeScript validation, the complete Vitest suite, and a production Vite build.

## Netlify

The repository contains `netlify.toml` with:

- build command: `npm run build`
- publish directory: `dist`
- SPA fallback to `/index.html`

Set these Netlify build variables:

```text
VITE_SUPABASE_URL=https://yjmpjuskgbbshrvhgmys.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<Supabase publishable key>
APP_URL=<live application URL>
```

## Security baseline

- RLS must remain enabled on all exposed public tables.
- Never ship `service_role` or secret Supabase keys to the browser.
- Authorization must be based on authoritative database role checks, not editable user metadata.
- Checkout stock and order totals must remain server/database authoritative.
- Review rating counters must remain database controlled.
- Storage write policies must remain restricted to the appropriate authenticated/admin/seller roles.

## Remaining deployment step

The Netlify project must be connected to this GitHub repository (`jamilarabi2000-del/Yalla-lb-Supabase`) or deployed from a checkout of this repository. Once connected, every push to `main` can build using the existing `netlify.toml` configuration.
