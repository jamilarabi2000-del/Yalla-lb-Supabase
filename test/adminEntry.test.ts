import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { isAdminEntryPath, rememberedAdminEntry, sha256Hex, ADMIN_ENTRY_SHA256 } from '../src/lib/adminEntry';

// The console opens only at a private address. Its value is never in the
// repository, so these tests use a stand-in address configured the same way
// the real one can be (VITE_ADMIN_ENTRY_SHA256).

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), 'utf8');
const stripTs = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('recognising the private console address', () => {
  it('hashes with SHA-256', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(ADMIN_ENTRY_SHA256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('never opens for the addresses anyone would try', async () => {
    for (const p of ['/admin', '/admin/', '/seller', '/', '/administrator', '/products/soap', '/wp-admin', '/manage-']) {
      expect(await isAdminEntryPath(p), p).toBe(false);
    }
  });

  it('opens only for the configured address, and only exactly', async () => {
    const standIn = 'manage-teststandin0123456789';
    vi.stubEnv('VITE_ADMIN_ENTRY_SHA256', await sha256Hex(standIn));
    const entry = await import('../src/lib/adminEntry');
    expect(await entry.isAdminEntryPath('/' + standIn)).toBe(true);
    expect(await entry.isAdminEntryPath('/' + standIn + '/')).toBe(true);
    expect(await entry.isAdminEntryPath('/' + standIn.toUpperCase())).toBe(false);
    expect(await entry.isAdminEntryPath('/' + standIn.slice(0, -1))).toBe(false);
    expect(await entry.isAdminEntryPath('/x/' + standIn)).toBe(false);
  });

  it('ignores a malformed override and keeps the built-in fingerprint', async () => {
    vi.stubEnv('VITE_ADMIN_ENTRY_SHA256', 'not-a-hash');
    const entry = await import('../src/lib/adminEntry');
    expect(entry.ADMIN_ENTRY_SHA256).toBe(ADMIN_ENTRY_SHA256);
  });

  it('survives having no browser storage', () => {
    expect(rememberedAdminEntry()).toBeNull();
  });
});

describe('the app routes to it and nowhere else', () => {
  const app = stripTs(read('src/App.tsx'));
  const ctx = stripTs(read('src/context/ShopContext.tsx'));

  it('has no /admin or /seller page', () => {
    expect(app).not.toMatch(/rawPath === 'admin'|rawPath === 'seller'/);
    expect(ctx).not.toMatch(/path === 'admin'|path === 'seller'/);
    expect(ctx).toMatch(/\| 'admin'\s*\| 'favorites'\s*\| 'not_found';/);
    const navTab = ctx.slice(ctx.indexOf('export type NavTab'), ctx.indexOf(';', ctx.indexOf('export type NavTab')));
    expect(navTab).not.toContain("'seller'");
    expect(fs.existsSync(path.resolve(process.cwd(), 'src/components/SellerLoginView.tsx'))).toBe(false);
    expect(app).not.toMatch(/href="\/seller"/);
  });

  it('opens the console only for its private address or a signed-in admin', () => {
    expect(app).toMatch(/const adminOpen = activeTab === 'admin' && \(adminEntryOpen \|\| isAdminUser\);/);
    expect(app).toMatch(/const showNotFound = activeTab === 'not_found' \|\| \(activeTab === 'admin' && !adminOpen\);/);
    expect(app).toMatch(/\{adminOpen && <AdminErrorBoundary>/);
    expect(app).toMatch(/isAdminEntryPath\(rawPath\)\.then\(isEntry => \{[\s\S]*?if \(!isEntry\) return notFound\(\);\s*rememberAdminEntry\(rawPath\);\s*setAdminEntryOpen\(true\);/);
    // A CMS link to /admin used to open the console for anyone.
    expect(stripTs(read('src/components/HomeTopContainer.tsx'))).not.toMatch(/startsWith\('\/admin'\)/);
  });

  it('lets any link leave a missing page, Home included', () => {
    // /admin, /seller or a typo is a tab of its own, so a link to any page --
    // even Home, the tab underneath on arrival -- changes it and the 404 goes.
    // A separate "not found" flag that only the 404's own button cleared left
    // visitors stuck there.
    expect(app).not.toMatch(/notFoundPath/);
    expect(app).toMatch(/const notFound = \(\) => setActiveTab\('not_found'\);/);
    expect(app).toMatch(/onClick=\{\(\) => setActiveTab\('home'\)\}[^>]*>Back to Home</);
    // It keeps the address it was asked for, and nothing else is held back.
    const sync = app.slice(app.indexOf('let targetPath ='), app.indexOf('const targetUrl ='));
    expect(sync).toMatch(/if \(activeTab === 'not_found'\) return;/);
  });

  it('never writes /admin into the address bar', () => {
    const sync = app.slice(app.indexOf("if (activeTab === 'admin') {"), app.indexOf('const targetUrl ='));
    expect(sync).toMatch(/const entry = rememberedAdminEntry\(\);/);
    expect(sync).toMatch(/return;\s*\}\s*$/);
  });

  it('keeps the console and missing pages out of search results', () => {
    expect(app).toMatch(/if \(!adminOpen && !showNotFound\) return;\s*const meta = document\.createElement\('meta'\);\s*meta\.name = 'robots';\s*meta\.content = 'noindex, nofollow';/);
  });
});
