import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * A throw-away PostgreSQL server on a unix socket in a temporary directory, for running the
 * database migrations for real (roles, grants, row-level security, triggers) without touching
 * any project. It needs the PostgreSQL server programs (initdb, pg_ctl, psql) on this machine:
 * `postgresAvailable()` says whether they are there, so a test can say plainly that it did not run
 * rather than pass without having checked anything.
 *
 * PostgreSQL refuses to run as root, so when this process is root (a container) the programs are
 * run as the `postgres` operating-system user.
 */

const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;

/** The directory holding initdb, pg_ctl and psql, or null. */
export function findPostgresBin() {
  const candidates = [];
  if (process.env.PG_BIN) candidates.push(process.env.PG_BIN);
  try {
    for (const version of fs.readdirSync('/usr/lib/postgresql').sort((a, b) => Number(b) - Number(a))) candidates.push(`/usr/lib/postgresql/${version}/bin`);
  } catch { /* none installed there */ }
  for (const dir of (process.env.PATH || '').split(path.delimiter)) candidates.push(dir);
  return candidates.find(dir => dir && fs.existsSync(path.join(dir, 'initdb')) && fs.existsSync(path.join(dir, 'pg_ctl')) && fs.existsSync(path.join(dir, 'psql'))) ?? null;
}

export function postgresAvailable() {
  if (!findPostgresBin()) return false;
  if (isRoot) return spawnSync('id', ['postgres']).status === 0 && spawnSync('runuser', ['--help']).status === 0;
  return true;
}

/** Runs a program, as the postgres user when this process is root. */
function exec(bin, args, { input, cwd } = {}) {
  const [command, commandArgs] = isRoot ? ['runuser', ['-u', 'postgres', '--', bin, ...args]] : [bin, args];
  const result = spawnSync(command, commandArgs, { input, cwd: cwd ?? os.tmpdir(), encoding: 'utf8', env: { ...process.env, LC_ALL: 'C', PGOPTIONS: '' } });
  return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

/**
 * Starts the server. Returns:
 *   run(db, sql, opts)   run SQL in a database; throws on an error unless opts.allowError (then returns it)
 *   asRole(db, role, sql, { claims, settings })   run SQL as a role, the way the Data API does: SET ROLE plus the
 *                                                request's JWT claims, so auth.uid() answers for that user
 *   createDatabase(name, template)   a copy of a prepared database (fast, isolates one test from another)
 *   dump(db)   the database as pg_dump prints it (schema, privileges, policies and rows), to compare before and after
 *   stop()
 */
export function startScratchPostgres() {
  const bin = findPostgresBin();
  if (!bin) throw new Error('PostgreSQL server programs not found (set PG_BIN to the directory holding initdb, pg_ctl and psql)');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yalla-pg-'));
  if (isRoot) {
    spawnSync('chown', ['postgres:postgres', root]);
  }
  fs.chmodSync(root, 0o700);
  const data = path.join(root, 'data');
  const socketDir = path.join(root, 'sock');
  const init = exec(path.join(bin, 'initdb'), ['-D', data, '-U', 'postgres', '-A', 'trust', '-E', 'UTF8', '--no-locale']);
  if (init.status !== 0) throw new Error(`initdb failed: ${init.stderr}`);
  fs.mkdirSync(socketDir, { recursive: true });
  if (isRoot) spawnSync('chown', ['-R', 'postgres:postgres', socketDir]);
  const options = `-c listen_addresses='' -c unix_socket_directories='${socketDir}' -c fsync=off -c synchronous_commit=off -c full_page_writes=off -c max_connections=20 -c shared_buffers=16MB`;
  const start = exec(path.join(bin, 'pg_ctl'), ['-D', data, '-o', options, '-w', '-t', '60', '-l', path.join(root, 'server.log'), 'start']);
  if (start.status !== 0) throw new Error(`pg_ctl start failed: ${start.stderr}\n${start.stdout}`);

  const psql = (db, sql, extraArgs = []) => exec(path.join(bin, 'psql'), ['-X', '-q', '-t', '-A', '-F', '|', '-v', 'ON_ERROR_STOP=1', '-h', socketDir, '-U', 'postgres', '-d', db, ...extraArgs], { input: sql });

  const run = (db, sql, { allowError = false, singleTransaction = false } = {}) => {
    const result = psql(db, sql, singleTransaction ? ['--single-transaction'] : []);
    if (result.status !== 0 && !allowError) throw new Error(`SQL failed in ${db}:\n${result.stderr}\n--- sql ---\n${sql.slice(0, 600)}`);
    return { ok: result.status === 0, out: result.stdout.trim(), err: result.stderr.trim() };
  };

  const asRole = (db, role, sql, { claims = {}, settings = {}, allowError = false } = {}) => {
    const set = (name, value) => `do $$ begin perform set_config('${name}', '${String(value).replace(/'/g, "''")}', false); end $$;`;
    const prelude = [
      set('request.jwt.claims', JSON.stringify({ role, ...claims })),
      ...Object.entries(settings).map(([k, v]) => set(k, v)),
      `set role ${role};`,
    ].join('\n');
    return run(db, `${prelude}\n${sql}`, { allowError });
  };

  const createDatabase = (name, template = 'template0') => run('postgres', `create database "${name}" template "${template}";`);
  /** Everything about a database a migration could change (schema, privileges, policies) plus its rows, as text. */
  const dump = db => {
    const result = exec(path.join(bin, 'pg_dump'), ['-h', socketDir, '-U', 'postgres', '--no-comments', db]);
    if (result.status !== 0) throw new Error(`pg_dump failed: ${result.stderr}`);
    // Recent pg_dump versions bracket the output with \restrict / \unrestrict and a random key, different every time.
    return result.stdout.split('\n').filter(line => !/^\\(un)?restrict /.test(line)).join('\n');
  };
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    exec(path.join(bin, 'pg_ctl'), ['-D', data, '-m', 'immediate', '-w', 'stop']);
    fs.rmSync(root, { recursive: true, force: true });
  };
  return { root, socketDir, run, asRole, createDatabase, dump, stop };
}
