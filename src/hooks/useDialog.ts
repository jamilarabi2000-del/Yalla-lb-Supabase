import { useEffect, useRef } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface UseDialogOptions {
  isOpen: boolean;
  onClose: () => void;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
}

export function useDialog({ isOpen, onClose, initialFocusRef }: UseDialogOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;

    // Save previous active element to restore focus on close
    previousActiveElement.current = document.activeElement as HTMLElement;

    // Lock body scroll
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Focus initial element or container ONCE on opening dialog
    const timer = setTimeout(() => {
      // Don't shift focus if active element is already inside the modal
      if (containerRef.current && containerRef.current.contains(document.activeElement)) {
        return;
      }

      if (initialFocusRef?.current) {
        initialFocusRef.current.focus();
      } else if (containerRef.current) {
        // Prefer focusing the first interactive text input if available
        // Dropdowns (SearchableSelect) are text fields with role="combobox".
        const inputs = containerRef.current.querySelectorAll<HTMLElement>(
          'input:not([type="hidden"]), select, textarea, [role="combobox"]'
        );
        if (inputs.length > 0) {
          inputs[0].focus();
        } else {
          const focusable = containerRef.current.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          );
          if (focusable.length > 0) {
            focusable[0].focus();
          }
        }
      }
    }, 50);

    // Escape closes. Tab goes round inside the dialog: from the last control
    // to the first, and back with Shift+Tab, instead of leaving for the page
    // behind it (the cart drawer let Tab reach the footer links). It acts only
    // when focus is already inside, so it never takes focus from something
    // stacked above this dialog (a confirmation) or from a list drawn outside it.
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !containerRef.current) return;
      const active = document.activeElement as HTMLElement | null;
      if (!active || !containerRef.current.contains(active)) return;
      const controls = [...containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
        .filter(el => el.getClientRects().length > 0);
      if (controls.length === 0) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (e.shiftKey && (active === first || active === containerRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(timer);
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      if (previousActiveElement.current && typeof previousActiveElement.current.focus === 'function') {
        previousActiveElement.current.focus();
      }
    };
  }, [isOpen]);

  return { containerRef };
}
