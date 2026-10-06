import fs from 'node:fs';
import path from 'node:path';
import { startScratchPostgres, postgresAvailable } from '../../scripts/db/scratchPostgres.mjs';

/**
 * The prepared database the hardening tests copy for each test: a Supabase-like stand-in
 * (fixture_base.sql), the repository's own SQL for the objects the migrations touch, replayed
 * unchanged, and the objects that exist only in the live project (fixture_live_only.sql).
 */
const root = process.cwd();
export const read = file => fs.readFileSync(path.resolve(root, file), 'utf8');
export const migration = name => read(`supabase/migrations/${name}`);

/** Repository migrations replayed as they are, in order, to build the "before" state. */
export const REPLAYED = [
  '20260919160000_admin_delete_category_transaction.sql',
  '20260923170000_enforce_phone_uniqueness.sql',
];

export { postgresAvailable };

export function prepareFixture() {
  const pg = startScratchPostgres();
  try {
    pg.run('postgres', 'create database fixture;');
    pg.run('fixture', read('test/db/fixture_base.sql'), { singleTransaction: true });
    for (const name of REPLAYED) pg.run('fixture', migration(name), { singleTransaction: true });
    pg.run('fixture', read('test/db/fixture_live_only.sql'), { singleTransaction: true });
  } catch (error) {
    pg.stop();
    throw error;
  }
  let n = 0;
  /** A fresh copy of the prepared database; one per test keeps tests from seeing each other's rows. */
  const fresh = () => { const name = `t${++n}`; pg.createDatabase(name, 'fixture'); return name; };
  return { pg, fresh, stop: () => pg.stop() };
}

export const ADMIN = '00000000-0000-4000-8000-0000000000a1';
export const SHOPPER = '00000000-0000-4000-8000-0000000000b2';
export const OTHER = '00000000-0000-4000-8000-0000000000c3';
