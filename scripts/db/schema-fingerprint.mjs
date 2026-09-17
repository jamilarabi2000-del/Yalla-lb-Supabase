#!/usr/bin/env node
/**
 * Schema drift detector.
 *
 * 69 of the 89 migration files in this repository are two-line stubs reading
 * "Compatibility marker: migration already applied to the linked Supabase
 * project". The real schema therefore lived only in the hosted database, and
 * that is exactly how the product-creation contract came to be fixed on disk
 * while production kept rejecting every create for days.
 *
 * This script reads the deployed schema's structure and compares it to
 * supabase/schema-fingerprint.json. It does not try to reproduce the DDL --
 * `supabase db pull` does that properly and is the right tool for a baseline.
 * What it does do is fail loudly the moment the database and the repository
 * stop agreeing, which is the failure this project actually suffered.
 *
 *   npm run db:fingerprint   # print the live fingerprint, write it on --write
 *   npm run db:verify        # exit 1 if the live schema differs from the file
 *
 * Requires a connection: set SUPABASE_DB_URL (Project settings -> Database ->
 * Connection string), or SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to go through
 * PostgREST. Without either it exits 0 with a clear skip message, so it never
 * turns into a check that silently passes while proving nothing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const fingerprintPath = path.join(repoRoot, 'supabase', 'schema-fingerprint.json');
const queryPath = path.join(here, 'fingerprint.sql');

const write = process.argv.includes('--write');
const verify = process.argv.includes('--verify');

const dbUrl = process.env.SUPABASE_DB_URL;
const restUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!dbUrl && !(restUrl && serviceKey)) {
  console.log(
    '[schema-fingerprint] skipped: set SUPABASE_DB_URL, or SUPABASE_URL + ' +
      'SUPABASE_SERVICE_ROLE_KEY, to check the deployed schema.',
  );
  process.exit(0);
}

const sql = fs.readFileSync(queryPath, 'utf8');

async function readLiveFingerprint() {
  if (dbUrl) {
    // pg is optional: only needed for the direct-connection path.
    const { default: pg } = await import('pg');
    const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
    await client.connect();
    try {
      const { rows } = await client.query(sql);
      return rows[0].fingerprint;
    } finally {
      await client.end();
    }
  }

  // PostgREST path: requires an `exec_sql`-style RPC to be available. If it is
  // not, say so rather than reporting a pass.
  const response = await fetch(`${restUrl}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ query: sql }),
  });
  if (!response.ok) {
    throw new Error(
      `Could not read the schema over PostgREST (${response.status}). ` +
        'Use SUPABASE_DB_URL for a direct connection instead.',
    );
  }
  return response.json();
}

function compare(live, committed) {
  const sections = ['functions', 'policies', 'columns', 'indexes', 'grants', 'triggers', 'rls'];
  const drift = [];
  for (const section of sections) {
    const a = live[section];
    const b = committed[section];
    if (!a || !b) {
      drift.push(`${section}: missing from ${!a ? 'the database' : 'the committed fingerprint'}`);
      continue;
    }
    if (a.hash !== b.hash) {
      drift.push(
        `${section}: live hash ${a.hash} (${a.count} objects) != committed ${b.hash} (${b.count} objects)`,
      );
    }
  }
  return drift;
}

const live = await readLiveFingerprint();

if (write) {
  const committed = fs.existsSync(fingerprintPath)
    ? JSON.parse(fs.readFileSync(fingerprintPath, 'utf8'))
    : {};
  const next = { ...committed, ...live };
  fs.writeFileSync(fingerprintPath, `${JSON.stringify(next, null, 2)}\n`);
  console.log('[schema-fingerprint] wrote supabase/schema-fingerprint.json');
  process.exit(0);
}

if (!verify) {
  console.log(JSON.stringify(live, null, 2));
  process.exit(0);
}

if (!fs.existsSync(fingerprintPath)) {
  console.error('[schema-fingerprint] supabase/schema-fingerprint.json is missing.');
  process.exit(1);
}

const drift = compare(live, JSON.parse(fs.readFileSync(fingerprintPath, 'utf8')));
if (drift.length === 0) {
  console.log('[schema-fingerprint] deployed schema matches the committed fingerprint.');
  process.exit(0);
}

console.error('[schema-fingerprint] the deployed schema and this repository disagree:\n');
for (const line of drift) console.error(`  - ${line}`);
console.error(
  '\nApply the missing migrations, or run `npm run db:fingerprint -- --write` and ' +
    'commit the result if the database is intentionally ahead.',
);
process.exit(1);
