import React, { useEffect } from 'react';
import { useTextRules } from '../hooks/useTextRules';
import { applyTextRuleTags } from '../lib/textStyleDom';
import { TEXT_RULE_ATTR, buildTextRulesCss } from '../lib/textStyleRules';

const STYLE_ID = 'yalla-text-rules';

/**
 * Applies the administrator's per-text styles for every visitor: finds each
 * styled text on the page, stamps it, and injects the matching CSS. Runs only
 * on storefront pages, never over the admin panel or seller portal.
 */
export const TextStyleLayer: React.FC<{ page: string; enabled: boolean }> = ({ page, enabled }) => {
  const { rules, editingId } = useTextRules();

  useEffect(() => {
    let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = enabled ? buildTextRulesCss(rules, page, editingId) : '';
  }, [rules, page, enabled, editingId]);

  useEffect(() => {
    const root = document.getElementById('root');
    if (!root) return;
    const list = Object.values(rules);
    if (!enabled || list.length === 0) {
      root.querySelectorAll(`[${TEXT_RULE_ATTR}]`).forEach(el => el.removeAttribute(TEXT_RULE_ATTR));
      return;
    }
    // Re-match after the page changes, at most once a frame. Stamping sets an
    // attribute, which this observer does not watch, so it cannot loop.
    let frame = 0;
    const run = () => { frame = 0; applyTextRuleTags(root, list, page); };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(run); };
    run();
    const observer = new MutationObserver(schedule);
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [rules, page, enabled]);

  return null;
};

export default TextStyleLayer;
