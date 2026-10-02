import React from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

export interface ToastData {
  id: string;
  message: string;
  type: 'success' | 'info' | 'warning' | 'error';
}

const STYLE: Record<ToastData['type'], { box: string; icon: React.ReactNode }> = {
  success: { box: 'border-[#16803C]/30 text-[#16803C]', icon: <CheckCircle2 className="w-4 h-4 text-[#16803C] flex-shrink-0" aria-hidden="true" /> },
  info: { box: 'border-[#E5E5E5] text-[#111111]', icon: <Info className="w-4 h-4 text-[#666666] flex-shrink-0" aria-hidden="true" /> },
  warning: { box: 'border-[#B89753]/40 text-[#7d6230]', icon: <AlertCircle className="w-4 h-4 text-[#7d6230] flex-shrink-0" aria-hidden="true" /> },
  error: { box: 'border-[#C62828]/40 text-[#C62828]', icon: <AlertCircle className="w-4 h-4 text-[#C62828] flex-shrink-0" aria-hidden="true" /> },
};

/**
 * The notification pill. Both live regions are always on the page, empty, so a
 * screen reader announces what appears in them (a region inserted together with
 * its message is often missed); errors go to the assertive one. It sits at the
 * end of the line, so it flips with the page direction, and on a phone at the
 * top below the header: at the bottom it covered the add-to-basket and
 * place-order buttons. It can be closed; errors and warnings stay up longer
 * than the 3.5 s everything used to get (see showToast).
 */
export const ToastHost: React.FC<{ toast: ToastData | null; onDismiss: () => void; language: string }> = ({ toast, onDismiss, language }) => {
  const pill = toast && (
    <div
      key={toast.id}
      className={`pointer-events-auto animate-fadeIn flex items-center gap-3 ps-4 pe-2 py-2 rounded-2xl shadow-xl border bg-white text-xs font-semibold max-w-sm ${STYLE[toast.type].box}`}
    >
      {STYLE[toast.type].icon}
      {/* Each message reads in its own direction, whatever the page language: a server's English sentence on an Arabic page kept its "!" at the wrong end. */}
      <span dir="auto" className="min-w-0 break-words">{toast.message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={language === 'ar' ? 'إغلاق' : 'Close'}
        className="shrink-0 inline-flex items-center justify-center min-h-8 min-w-8 rounded-lg text-current opacity-70 hover:opacity-100 hover:bg-black/5 cursor-pointer"
      >
        <X className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  );

  return (
    <div className="fixed z-50 pointer-events-none top-24 inset-x-4 sm:inset-x-auto sm:top-auto sm:bottom-6 sm:end-6 flex justify-center sm:justify-end">
      <div role="status" aria-live="polite" aria-atomic="true">{toast && toast.type !== 'error' ? pill : null}</div>
      <div role="alert" aria-live="assertive" aria-atomic="true">{toast && toast.type === 'error' ? pill : null}</div>
    </div>
  );
};
