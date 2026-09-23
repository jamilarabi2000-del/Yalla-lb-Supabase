import { useEffect, useSyncExternalStore } from 'react';
import { supabaseCmsService } from '../services/supabaseCmsService';
import type { CMSTextRule, TextRuleMap } from '../lib/textStyleRules';

/**
 * One copy of the per-text rules for the whole app: the layer that applies
 * them for every visitor and the admin editor that changes them read the same
 * store, so a save shows on the page at once.
 */
let rules: TextRuleMap = {};
let editingId: string | null = null;
let loading: Promise<void> | null = null;
let snapshot: { rules: TextRuleMap; editingId: string | null } = { rules, editingId };
const listeners = new Set<() => void>();

const emit = () => {
  snapshot = { rules, editingId };
  listeners.forEach(listener => listener());
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
const getSnapshot = () => snapshot;

export function loadTextRules(): Promise<void> {
  if (!loading) {
    loading = supabaseCmsService.fetchTextRules()
      .then(next => { rules = next; emit(); })
      .catch(err => {
        // The storefront renders normally without them; allow a later retry.
        console.warn('[text styles] could not load:', err);
        loading = null;
      });
  }
  return loading;
}

export function useTextRules() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  useEffect(() => { loadTextRules(); }, []);
  return state;
}

export async function saveTextRule(rule: CMSTextRule): Promise<void> {
  rules = await supabaseCmsService.updateTextRules(current => ({ ...current, [rule.id]: rule }));
  emit();
}

export async function removeTextRule(id: string): Promise<void> {
  rules = await supabaseCmsService.updateTextRules(current => {
    const next = { ...current };
    delete next[id];
    return next;
  });
  emit();
}

/** The rule open in the editor is left out of the page CSS, so the preview shows exactly the draft. */
export function setEditingTextRule(id: string | null): void {
  if (editingId === id) return;
  editingId = id;
  emit();
}
