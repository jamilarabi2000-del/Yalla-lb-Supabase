import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Client-side inactivity control. Database RLS remains the authorization
 * boundary; this only limits how long an unattended browser session remains
 * usable.
 */
export const SESSION_INACTIVITY_MS = 30 * 60 * 1000;
const ACTIVITY_EVENTS: Array<keyof WindowEventMap> = [
  'mousemove',
  'mousedown',
  'keydown',
  'touchstart',
  'scroll',
  'pointerdown',
];

export function SessionSecurityGuard() {
  const lastActivityRef = useRef(Date.now());
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    let mounted = true;

    const touchActivity = () => {
      lastActivityRef.current = Date.now();
    };

    const schedule = () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(async () => {
        if (!mounted) return;
        const inactiveFor = Date.now() - lastActivityRef.current;
        if (inactiveFor >= SESSION_INACTIVITY_MS) {
          await supabase.auth.signOut({ scope: 'local' });
          return;
        }
        schedule();
      }, Math.min(60_000, SESSION_INACTIVITY_MS));
    };

    ACTIVITY_EVENTS.forEach(event => window.addEventListener(event, touchActivity, { passive: true }));
    schedule();

    return () => {
      mounted = false;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      ACTIVITY_EVENTS.forEach(event => window.removeEventListener(event, touchActivity));
    };
  }, []);

  return null;
}
