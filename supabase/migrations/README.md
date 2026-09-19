# Migration source of truth

This directory is intended to be the complete, replayable database history for Yalla-lb-Supabase.

## Current state

The linked Supabase project contains migrations that are not all represented by executable SQL in this repository. Some repository migration files are compatibility stubs because their original SQL was applied directly to the linked project.

**Do not run `supabase db reset` against this repository and assume it reproduces production yet.** The migration-integrity workflow intentionally fails while this drift exists.

## Re-baselining procedure

Run `scripts/db/rebaseline.sh` (or `--dry-run` first). It automates every step
below and **fails loudly** if the generated baseline does not reproduce
production, so a subtly-wrong baseline cannot be committed by accident.
It needs `SUPABASE_PROJECT_ID`, `SUPABASE_ACCESS_TOKEN` and
`SUPABASE_DB_PASSWORD` in the environment.

1. Capture a schema-only dump of the linked production database for `public`, `private`, and `storage`.
2. Preserve the current migration files under an archive path.
3. Create one canonical baseline migration containing the live schema, RLS policies, functions, triggers, grants, storage policies, indexes, constraints, and views.
4. Reconcile all applied migration versions with the baseline migration history.
5. Reset a disposable database and replay the repository migrations.
6. Run `supabase db diff --linked --schema public,private,storage`; it must be empty.
7. Keep all future schema changes as executable migrations only.

The live database remains authoritative until this re-baseline is completed.
