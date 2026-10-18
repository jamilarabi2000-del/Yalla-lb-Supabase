import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Crawlers ask for /robots.txt. Without the file the single-page fallback answered with the shop's HTML page, which
// crawlers read as a malformed robots file. The file lets everything in and says nothing about the back office: the
// admin address is private, and a Disallow line would announce it to everyone who reads the file.
const robots = fs.readFileSync(path.resolve(process.cwd(), 'public/robots.txt'), 'utf8');

describe('public/robots.txt', () => {
  it('lets every crawler in', () => {
    expect(robots).toMatch(/^User-agent: \*$/m);
    expect(robots).toMatch(/^Allow: \/$/m);
  });
  it('does not block the shop', () => {
    expect(robots).not.toMatch(/^Disallow:\s*\/\s*$/m);
  });
  it('names no private path, so it does not reveal the admin or seller address', () => {
    expect(robots).not.toMatch(/disallow/i);
    expect(robots).not.toMatch(/admin|seller/i);
  });
  it('is plain text a crawler can parse (no HTML)', () => {
    expect(robots).not.toMatch(/[<>]/);
  });
});
