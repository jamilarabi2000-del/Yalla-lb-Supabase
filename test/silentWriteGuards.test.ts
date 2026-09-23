import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Guards the "silent write" class of bug.
 *
 * PostgREST reports an RLS-rejected write differently depending on the verb:
 *
 *   INSERT / UPSERT  a failed WITH CHECK raises 42501, and an ON CONFLICT DO
 *                    UPDATE whose existing row fails the UPDATE policy's USING
 *                    raises too. These are loud; `if (error)` catches them.
 *
 *   UPDATE / DELETE  USING *filters* rather than rejects. Non-matching rows are
 *                    simply not touched, and the request succeeds having
 *                    changed nothing. There is no error to catch.
 *
 * So an UPDATE or DELETE that inspects only `error` cannot tell "saved" from
 * "silently discarded", and the UI reports success either way. That is how the
 * discount-rule, bundle, order-status and search-log write paths all shipped
 * broken. The fix in each case was to project the affected rows back with
 * `.select()` and treat an empty result as the failure it is.
 *
 * This test keeps that closed: every supabase `.update()` / `.delete()` in
 * src/ must either project rows and check the count, or appear in
 * REVIEWED_UNGUARDED below with a reason someone has actually verified.
 */

const REPO_ROOT = path.resolve(__dirname, '..');
const SRC = path.join(REPO_ROOT, 'src');

/**
 * Blanks comment bodies while preserving every byte offset and newline, so
 * line numbers still match the real file.
 *
 * This matters more than it looks: the assertions below search source text,
 * and the code they guard is surrounded by comments that *describe* `.select()`
 * and row checks. Without this, a prose mention would satisfy the assertion and
 * deleting the real call would still pass.
 */
function blankComments(src: string): string {
  const out = src.split('');
  let i = 0;
  const n = src.length;
  let mode: null | 'line' | 'block' | '"' | "'" | '`' = null;

  while (i < n) {
    const c = src[i];
    const d = src[i + 1];

    if (mode === null) {
      if (c === '/' && d === '/') { out[i] = out[i + 1] = ' '; mode = 'line'; i += 2; continue; }
      if (c === '/' && d === '*') { out[i] = out[i + 1] = ' '; mode = 'block'; i += 2; continue; }
      if (c === '"' || c === "'" || c === '`') { mode = c; i++; continue; }
      i++; continue;
    }

    if (mode === 'line') {
      if (c === '\n') { mode = null; i++; continue; }
      out[i] = ' '; i++; continue;
    }

    if (mode === 'block') {
      if (c === '*' && d === '/') { out[i] = out[i + 1] = ' '; mode = null; i += 2; continue; }
      if (c !== '\n') out[i] = ' ';
      i++; continue;
    }

    // Inside a string literal: skip escapes, end on the matching quote.
    if (c === '\\') { i += 2; continue; }
    if (c === mode) mode = null;
    i++;
  }

  return out.join('');
}

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, acc);
    else if (/\.(ts|tsx)$/.test(full)) acc.push(full);
  }
  return acc;
}

interface WriteSite {
  file: string;
  line: number;
  op: 'update' | 'delete';
  table: string;
  projectsRows: boolean;
  checksRowCount: boolean;
}

/**
 * Finds supabase `.update()` / `.delete()` chains and reports, for each,
 * whether the rows are projected back and whether the count is inspected.
 */
function findWriteSites(): WriteSite[] {
  const sites: WriteSite[] = [];

  for (const file of sourceFiles(SRC)) {
    const code = blankComments(fs.readFileSync(file, 'utf8'));
    const lines = code.split('\n');

    lines.forEach((line, index) => {
      const verb = /\.delete\s*\(/.test(line)
        ? 'delete'
        : /\.update\s*\(/.test(line)
          ? 'update'
          : null;
      if (!verb) return;

      // Only count chains rooted in supabase.from('<table>'). This excludes
      // Array/Map/Set .delete() and any unrelated .update().
      const lookBack = lines.slice(Math.max(0, index - 8), index + 1).join('\n');
      const from = [...lookBack.matchAll(/\.from\(\s*['"]([a-z_]+)['"]\s*\)/g)].pop();
      if (!from) return;

      // The statement runs to the first terminator at or after this line.
      const forward = lines.slice(index, Math.min(lines.length, index + 30)).join('\n');
      const statement = forward.split(/;\s*(?:\n|$)/)[0] ?? forward;

      // A builder can be assigned and only finished later:
      //   const query = existing ? supabase.from(t).update(p) : ...insert(p);
      //   const { data, error } = await query.select('id');
      // The .select() and the row check then live outside this statement, so
      // follow the variable rather than reporting a false positive. The
      // assignment may sit a few lines above the verb, so walk back to the
      // head of the statement -- stopping at the previous one's terminator.
      const head: string[] = [];
      for (let back = index; back >= 0 && index - back <= 5; back--) {
        head.unshift(lines[back]);
        if (back < index && /[;{}]\s*$/.test(lines[back])) { head.shift(); break; }
      }
      const headText = head.join('\n');
      const assignedBuilder =
        !/\bawait\b/.test(headText) && headText.match(/(?:const|let|var)\s+(\w+)\s*=/)?.[1];
      const scope = assignedBuilder ? forward : statement;

      const projectsRows = /\.select\s*\(/.test(scope);

      // Name the destructured rows binding, then require it to be inspected:
      // `const { data: deletedRows, error }` -> deletedRows, else `data`.
      const startOfStatement = assignedBuilder
        ? forward
        : lines.slice(Math.max(0, index - 8), index + 1).join('\n');
      const binding =
        startOfStatement.match(/data\s*:\s*(\w+)/)?.[1] ??
        (/\bdata\b/.test(startOfStatement) ? 'data' : null);

      let checksRowCount = false;
      if (binding) {
        // The check must belong to this write: stop at the next query or the
        // next function, or a neighbour's `if (!data?.length)` would count.
        // Search from the end of this statement, which may itself hold another
        // .from() -- `cond ? from(t).update(p) : from(t).insert(p);`.
        let stmtEnd = index;
        while (stmtEnd < lines.length - 1 && !/;\s*$/.test(lines[stmtEnd])) stmtEnd++;
        let end = Math.min(lines.length, index + 30);
        for (let next = stmtEnd + 1; next < end; next++) {
          if (/\.from\(/.test(lines[next])
              || /^\s*(?:async\s+\w+\s*\(|(?:export\s+)?(?:async\s+)?function\b|const\s+\w+\s*=\s*async\b)/.test(lines[next])) {
            end = next;
            break;
          }
        }
        const after = lines.slice(index, end).join('\n');
        const b = binding.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        checksRowCount = new RegExp(
          `!\\s*${b}\\b|${b}\\s*\\?\\.\\s*length|${b}\\s*\\.\\s*length|${b}\\s*===?\\s*null`,
        ).test(after);
      }

      sites.push({
        file: path.relative(REPO_ROOT, file),
        line: index + 1,
        op: verb,
        table: from[1],
        projectsRows,
        checksRowCount,
      });
    });
  }

  return sites;
}

/**
 * Write sites deliberately left without a row-count guard, each with the
 * reason it is safe. Keyed by `<file>::<table>::<op>` so ordinary edits that
 * shift line numbers do not churn this list.
 *
 * Adding an entry here is a claim that someone checked the table's policies
 * and confirmed a filtered write either cannot happen or cannot mislead.
 */
const REVIEWED_UNGUARDED: Record<string, string> = {
  'src/context/ShopContext.tsx::profiles::update':
    'Best-effort profile sync after sign-up. The handle_new_user trigger owns row ' +
    'creation; this only backfills names and address from the local signup draft, ' +
    'is wrapped in its own try/catch, and is superseded by upsertProfile on the ' +
    'next profile save. A filtered write costs nothing the user cannot redo.',

  'src/services/platformService.ts::notifications::update':
    'markNotificationRead updates by id alone, but notifications_update_own ' +
    'restricts UPDATE to user_id = auth.uid() and notifications_own restricts ' +
    'SELECT the same way, so a caller can only ever hold the id of a row it is ' +
    'allowed to update.',

  'src/services/supabaseCatalogService.ts::product_images::delete':
    'Dependent-row cleanup. Every policy that would filter this delete ' +
    '(product_images_admin, and the restrictive verified-admin rule) is also ' +
    'enforced on the guarded products write earlier in the same function, which ' +
    'throws first. product_images.product_id is ON DELETE CASCADE besides.',

  'src/services/supabaseCatalogService.ts::product_private::delete':
    'Same as product_images above: gated by the guarded products write, and ' +
    'product_private.product_id is ON DELETE CASCADE.',

  'src/services/supabaseProductPatchService.ts::product_images::delete':
    'Reached only after the guarded products update at the top of patchProduct ' +
    'has proved the caller may write this product. The insert that follows has ' +
    'no permissive policy for a seller and raises, so a filtered delete cannot ' +
    'be reported as success.',

  'src/services/supabaseCommerceService.ts::coupons::delete':
    'public.coupons has exactly one permissive policy -- coupons_verified_admin_all ' +
    '(ALL, private.is_admin_verified() for both USING and WITH CHECK) -- and ' +
    'public.discount_rules has the identical predicate. Every coupons delete here ' +
    'sits next to a guarded discount_rules write that tests the same predicate and ' +
    'throws first: syncRuleCoupon only runs after the guarded insert/update, and in ' +
    'deleteDiscountRule the guarded rule delete follows. The two cannot disagree.',
};

describe('Supabase writes cannot fail silently', () => {
  const sites = findWriteSites();

  it('finds the update/delete call sites it is meant to be checking', () => {
    // Guards the scanner itself: if a refactor breaks the matching, this test
    // file would otherwise pass by finding nothing at all.
    expect(sites.length).toBeGreaterThan(10);
    expect(sites.some(s => s.table === 'orders' && s.op === 'update')).toBe(true);
  });

  it('projects rows back and checks the count on every update and delete', () => {
    const unguarded = sites.filter(s => !s.projectsRows || !s.checksRowCount);

    const unreviewed = unguarded.filter(
      s => !(`${s.file}::${s.table}::${s.op}` in REVIEWED_UNGUARDED),
    );

    const report = unreviewed
      .map(
        s =>
          `  ${s.file}:${s.line}  ${s.op} on "${s.table}"  ` +
          `(select=${s.projectsRows ? 'yes' : 'NO'}, ` +
          `row check=${s.checksRowCount ? 'yes' : 'NO'})`,
      )
      .join('\n');

    expect(
      unreviewed,
      unreviewed.length === 0
        ? ''
        : `An RLS-filtered UPDATE or DELETE succeeds with zero rows and no error, so ` +
          `these writes cannot tell "saved" from "silently discarded":\n\n${report}\n\n` +
          `Fix by projecting the affected rows with .select('id') and throwing when ` +
          `the result is empty -- or, if the site is genuinely safe, add it to ` +
          `REVIEWED_UNGUARDED in this file with the reason.\n`,
    ).toEqual([]);
  });

  it('keeps the reviewed-exception list free of stale entries', () => {
    const live = new Set(
      sites
        .filter(s => !s.projectsRows || !s.checksRowCount)
        .map(s => `${s.file}::${s.table}::${s.op}`),
    );

    const stale = Object.keys(REVIEWED_UNGUARDED).filter(key => !live.has(key));

    expect(
      stale,
      `These REVIEWED_UNGUARDED entries no longer match an unguarded write. ` +
        `The call was fixed, moved or removed -- delete the entry so the list ` +
        `keeps meaning what it says:\n${stale.map(s => `  ${s}`).join('\n')}\n`,
    ).toEqual([]);
  });
});
