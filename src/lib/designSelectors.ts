/**
 * Dropdowns are buttons with role="combobox" (SearchableSelect), so the
 * design presets that mean buttons leave them out, and the one that means
 * form fields takes them in. Rules saved with an earlier preset selector are
 * read as the current one; a selector the admin typed is used as written.
 */
export const DESIGN_PRESET_SELECTORS = {
  headerButtons: 'header button:not([role="combobox"])',
  buttons: '#main-content button:not([role="combobox"])',
  inputs: '#main-content input,#main-content select,#main-content textarea,#main-content [role="combobox"]',
} as const;

const EARLIER_PRESETS: Record<string, string> = {
  'header button': DESIGN_PRESET_SELECTORS.headerButtons,
  '#main-content button': DESIGN_PRESET_SELECTORS.buttons,
  '#main-content input,#main-content select,#main-content textarea': DESIGN_PRESET_SELECTORS.inputs,
};

export const currentDesignSelector = (selector: string): string =>
  EARLIER_PRESETS[selector.trim()] ?? selector;
