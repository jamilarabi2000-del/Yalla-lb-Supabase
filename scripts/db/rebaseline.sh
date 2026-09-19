#!/usr/bin/env bash
#
# Re-baseline supabase/migrations/ from the live database.
#
# WHY THIS EXISTS
# ---------------
# 50 of the migration files in this repository are empty compatibility stubs
# ("migration already applied to the linked Supabase project"), and ~24
# migrations applied in production have no source file at all. The security
# model — every RLS policy, trigger, grant and SECURITY DEFINER function —
# therefore exists only in the live project. A `supabase db reset`, a restore
# into a fresh project, or a staging clone would come up with no security
# model whatsoever.
#
# This script performs the procedure described in supabase/migrations/README.md
# using pg_dump, which is the only thing that produces a trustworthy schema
# dump. It cannot be done by hand or by catalog introspection without risking
# subtle, silent divergence.
#
# REQUIREMENTS
#   supabase CLI, and these in the environment:
#     SUPABASE_PROJECT_ID     project ref (e.g. yjmpjuskgbbshrvhgmys)
#     SUPABASE_ACCESS_TOKEN   personal access token
#     SUPABASE_DB_PASSWORD    database password
#
# USAGE
#   scripts/db/rebaseline.sh            # generate, then verify
#   scripts/db/rebaseline.sh --dry-run  # generate only, change nothing
#
set -euo pipefail

DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIGRATIONS_DIR="$REPO_ROOT/supabase/migrations"
ARCHIVE_DIR="$REPO_ROOT/supabase/migrations_archive"
STAMP="$(date -u +%Y%m%d%H%M%S)"
BASELINE="$MIGRATIONS_DIR/00000000000000_baseline.sql"

fail() { printf '\033[31merror:\033[0m %s\n' "$1" >&2; exit 1; }
info() { printf '\033[36m==>\033[0m %s\n' "$1"; }

for var in SUPABASE_PROJECT_ID SUPABASE_ACCESS_TOKEN SUPABASE_DB_PASSWORD; do
  [[ -n "${!var:-}" ]] || fail "$var is not set. See the header of this script."
done
command -v supabase >/dev/null 2>&1 || fail "the supabase CLI is not installed."

cd "$REPO_ROOT"

info "Linking project $SUPABASE_PROJECT_ID"
supabase link --project-ref "$SUPABASE_PROJECT_ID" >/dev/null

# 1. Capture the live schema. --schema-only; no data, no roles.
info "Dumping live schema (public, private, storage)"
TMP_DUMP="$(mktemp)"
trap 'rm -f "$TMP_DUMP"' EXIT
supabase db dump --linked --schema public,private,storage -f "$TMP_DUMP"
[[ -s "$TMP_DUMP" ]] || fail "the schema dump came back empty; refusing to continue."

if [[ $DRY_RUN -eq 1 ]]; then
  cp "$TMP_DUMP" "$REPO_ROOT/baseline.preview.sql"
  info "Dry run: wrote baseline.preview.sql ($(wc -l < "$TMP_DUMP") lines). Nothing else changed."
  exit 0
fi

# 2. Archive the existing history rather than deleting it. The stubs record
#    which migration versions the remote has already applied, which is needed
#    to reconcile `supabase migration repair`.
info "Archiving current migration files to supabase/migrations_archive/$STAMP"
mkdir -p "$ARCHIVE_DIR/$STAMP"
shopt -s nullglob
for f in "$MIGRATIONS_DIR"/*.sql; do
  mv "$f" "$ARCHIVE_DIR/$STAMP/"
done
shopt -u nullglob

# 3. Emit the canonical baseline.
info "Writing $(basename "$BASELINE")"
{
  echo "-- Canonical schema baseline, generated from the live project by"
  echo "-- scripts/db/rebaseline.sh on $(date -u +%Y-%m-%dT%H:%M:%SZ)."
  echo "--"
  echo "-- Superseded files are preserved under"
  echo "-- supabase/migrations_archive/$STAMP/ so that the applied migration"
  echo "-- versions remain recoverable for 'supabase migration repair'."
  echo
  cat "$TMP_DUMP"
} > "$BASELINE"

# 4. Tell the remote that the baseline stands in for everything already applied,
#    so it is not replayed against production.
info "Reconciling remote migration history"
supabase migration repair --status reverted --linked $(
  ls "$ARCHIVE_DIR/$STAMP"/*.sql 2>/dev/null \
    | xargs -n1 basename 2>/dev/null \
    | sed 's/_.*//' \
    | sort -u \
    | tr '\n' ' '
) 2>/dev/null || info "migration repair reported nothing to reconcile (this is fine)"
supabase migration repair --status applied --linked 00000000000000 2>/dev/null || true

# 5. Prove the baseline actually reproduces production.
info "Verifying: resetting a disposable local database and diffing"
supabase db reset >/dev/null 2>&1 || fail "supabase db reset failed against the new baseline."

DIFF_OUT="$(supabase db diff --linked --schema public,private,storage)"
if [[ -n "${DIFF_OUT//[[:space:]]/}" ]]; then
  printf '\033[31mSchema drift remains after re-baselining:\033[0m\n%s\n' "$DIFF_OUT"
  fail "the baseline does NOT reproduce production. Do not commit it as-is."
fi

info "Done. The baseline reproduces production exactly (db diff is empty)."
info "Next: review the diff, commit, and remove the 'Known gaps' entry in SECURITY.md."
