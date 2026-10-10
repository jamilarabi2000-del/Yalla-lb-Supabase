import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// At 1024px the English header overflowed the screen by 10px (the menu button was partly off screen), and from 1024
// to about 1200px the search box shrank to its padding (106px, no room to type). The full navigation bar needs
// room beside the brand, the search box and the buttons that it only has from 1280px (measured in real Chromium,
// English and Arabic, 1000-1400px). Below that the menu button, which lists the same pages, stays.
const source = fs.readFileSync(path.resolve(process.cwd(), 'src/components/Navbar.tsx'), 'utf8');
const classOf = (marker: RegExp) => source.match(marker)?.[1].split(/\s+/) ?? [];

describe('the header between 1024 and 1280px', () => {
  it('shows the navigation bar only from 1280px (xl)', () => {
    const nav = classOf(/<nav className="([^"]+)"/);
    expect(nav).toContain('hidden');
    expect(nav).toContain('xl:flex');
    expect(nav).not.toContain('lg:flex');
  });

  it('keeps the menu button until 1280px', () => {
    const button = classOf(/id="mobile-menu-toggle-btn"[\s\S]*?className="([^"]+)"/);
    expect(button).toContain('xl:hidden');
    expect(button).not.toContain('lg:hidden');
  });

  it('keeps the menu panel until 1280px, so the button always has something to open', () => {
    const panel = classOf(/mobileMenuOpen && <div className="([^"]+)"/);
    expect(panel).toContain('xl:hidden');
    expect(panel).not.toContain('lg:hidden');
  });

  it('uses no other lg-only switch between the bar and the menu', () => {
    expect(source).not.toMatch(/\blg:(hidden|flex)\b/);
  });
});
