/**
 * Matching for the searchable dropdowns: every word typed must appear
 * somewhere in the option, ignoring case, accents, Arabic diacritics and the
 * spelling variants people type interchangeably (أ/إ/آ/ا, ى/ي, ة/ه, ؤ/و,
 * ئ/ي, tatweel, Arabic-Indic digits).
 */

const MARKS = /\p{M}+/gu;
const TATWEEL = /\u0640/g;
const ALEF_WASLA = /\u0671/g;
const ALEF_MAKSURA = /\u0649/g;
const TEH_MARBUTA = /\u0629/g;
const ARABIC_DIGITS = /[\u0660-\u0669\u06F0-\u06F9]/g;

export function foldForSearch(s: string): string {
  return s
    // Hamza and madda forms decompose to the bare letter plus a mark.
    .normalize('NFD')
    .replace(MARKS, '')
    .replace(TATWEEL, '')
    .replace(ALEF_WASLA, '\u0627')
    .replace(ALEF_MAKSURA, '\u064A')
    .replace(TEH_MARBUTA, '\u0647')
    .replace(ARABIC_DIGITS, d => {
      const c = d.charCodeAt(0);
      return String(c >= 0x06F0 ? c - 0x06F0 : c - 0x0660);
    })
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** A test for option labels against what the user typed; '' matches all. */
export function optionMatcher(query: string): (label: string) => boolean {
  const words = foldForSearch(query).split(' ').filter(Boolean);
  if (!words.length) return () => true;
  return label => {
    const hay = foldForSearch(label);
    return words.every(w => hay.includes(w));
  };
}
