import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { DESIGN_PRESET_SELECTORS, currentDesignSelector } from '../src/lib/designSelectors';

// Every dropdown in the app is a SearchableSelect: pick from the list or type
// to find the option. These pin that, and the places that had to learn that a
// dropdown is now a button with role="combobox".

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), 'utf8');
const stripTs = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const sources = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => {
  const p = path.join(dir, d.name);
  return d.isDirectory() ? sources(p) : /\.tsx$/.test(d.name) ? [p] : [];
});

describe('dropdowns', () => {
  it('no native <select> is left anywhere in the app', () => {
    const offenders = sources('src').filter(f => /<select[\s>]/.test(stripTs(read(f))));
    expect(offenders).toEqual([]);
  });

  it('every file that shows a dropdown uses the searchable one', () => {
    const users = sources('src').filter(f => /<SearchableSelect[\s>]/.test(read(f)));
    expect(users.length).toBeGreaterThanOrEqual(19);
    for (const f of users) expect(read(f), f).toMatch(/import \{[^}]*\bSearchableSelect\b[^}]*\} from '[./]+(ui\/|components\/ui\/)?SearchableSelect'/);
  });
});

describe('a dropdown is not styled as a button', () => {
  const app = stripTs(read('src/App.tsx'));

  it('the Buttons and Navigation text styles leave dropdowns out', () => {
    expect(app).toContain(`cssFor('button', ':root #main-content button:not([role="combobox"]), :root #main-content [role="button"]')`);
    expect(app).toContain(`cssFor('nav', ':root nav a, :root nav button:not([role="combobox"])')`);
    expect(app).toContain(`slot === 'button' ? '#main-content button:not([role="combobox"]),#main-content [role="button"]'`);
    expect(app).not.toMatch(/#main-content button[,'"]/);
  });

  it('design presets: buttons leave dropdowns out, form fields take them in', () => {
    expect(DESIGN_PRESET_SELECTORS.buttons).toBe('#main-content button:not([role="combobox"])');
    expect(DESIGN_PRESET_SELECTORS.headerButtons).toBe('header button:not([role="combobox"])');
    expect(DESIGN_PRESET_SELECTORS.inputs).toContain('#main-content [role="combobox"]');
    const controls = stripTs(read('src/components/admin/cms/CMSDesignControls.tsx'));
    expect(controls).toContain('selector:DESIGN_PRESET_SELECTORS.buttons');
    expect(controls).toContain('selector:DESIGN_PRESET_SELECTORS.headerButtons');
    expect(controls).toContain('selector:DESIGN_PRESET_SELECTORS.inputs');
  });

  it('rules saved with an earlier preset get the current selector; typed ones are kept', () => {
    expect(currentDesignSelector('#main-content button')).toBe(DESIGN_PRESET_SELECTORS.buttons);
    expect(currentDesignSelector('header button')).toBe(DESIGN_PRESET_SELECTORS.headerButtons);
    expect(currentDesignSelector('#main-content input,#main-content select,#main-content textarea')).toBe(DESIGN_PRESET_SELECTORS.inputs);
    expect(currentDesignSelector('.hero button')).toBe('.hero button');
    expect(app).toMatch(/currentDesignSelector\(rule\.selector\.replace\(\/\[\{\}\]\/g, ''\)\)/);
  });
});

describe('the rest of the app knows about the list', () => {
  it('a modal still focuses its first field when that field is a dropdown', () => {
    expect(read('src/hooks/useDialog.ts')).toContain(`'input:not([type="hidden"]), select, textarea, [role="combobox"]'`);
  });

  it('the text-style editor leaves Escape to an open dropdown', () => {
    const editor = stripTs(read('src/components/TextStyleEditor.tsx'));
    const onKey = editor.slice(editor.indexOf('const onKey'), editor.indexOf('const redraw'));
    expect(onKey).toMatch(/if \(e\.key !== 'Escape'\) return;\s*if \(e\.target instanceof Element && e\.target\.closest\(`\[\$\{SELECT_POPOVER_ATTR\}\]`\)\) return;\s*e\.stopPropagation\(\);/);
  });
});
