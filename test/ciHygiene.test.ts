import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// The workflows run third-party code with this repository's token. A tag such as @v4 can be moved to
// different code by whoever controls that repository; a commit SHA cannot. Dependabot keeps the pins
// current by pull request, reading the version written beside each one.
const dir = path.resolve(process.cwd(), '.github/workflows');
const workflows = fs.readdirSync(dir).filter(f => /\.ya?ml$/.test(f)).map(f => ({ file: f, text: fs.readFileSync(path.join(dir, f), 'utf8') }));
const uses = workflows.flatMap(({ file, text }) => [...text.matchAll(/^\s*-?\s*uses:\s*(\S+)(.*)$/gm)].map(m => ({ file, ref: m[1], rest: m[2] })));

describe('the GitHub workflows', () => {
  it('use at least the actions this repository relies on', () => {
    const names = new Set(uses.map(u => u.ref.split('@')[0]));
    for (const name of ['actions/checkout', 'actions/setup-node', 'github/codeql-action/init', 'supabase/setup-cli', 'gitleaks/gitleaks-action']) {
      expect(names.has(name), name).toBe(true);
    }
  });

  it('pin every action to a full commit SHA, with the version it was in a comment beside it', () => {
    for (const { file, ref, rest } of uses) {
      if (ref.startsWith('./')) continue;   // an action in this repository
      expect(ref, `${file}: ${ref}`).toMatch(/^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/);
      expect(rest, `${file}: ${ref} needs its version in a comment`).toMatch(/#\s*v\d+(\.\d+){0,2}\b/);
    }
  });

  it('pin the Supabase CLI to a named release instead of whatever is latest', () => {
    const integrity = workflows.find(w => w.file === 'migration-integrity.yml')!.text;
    expect(integrity).not.toMatch(/version:\s*latest/);
    expect(integrity).toMatch(/version:\s*\d+\.\d+\.\d+\s*$/m);
  });

  it('require the database migration tests to run in CI rather than skip', () => {
    const verify = workflows.find(w => w.file === 'verify.yml')!.text;
    expect(verify).toMatch(/REQUIRE_SCRATCH_POSTGRES:\s*'1'/);
    expect(verify).toContain('/usr/lib/postgresql/*/bin/initdb');
  });
});

describe('Dependabot', () => {
  const config = fs.readFileSync(path.resolve(process.cwd(), '.github/dependabot.yml'), 'utf8');

  it('watches both the pinned actions and the npm dependencies', () => {
    expect(config).toMatch(/package-ecosystem:\s*github-actions/);
    expect(config).toMatch(/package-ecosystem:\s*npm/);
    expect(config.match(/schedule:/g)).toHaveLength(2);
  });
});
