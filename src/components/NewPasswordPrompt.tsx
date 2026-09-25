import React, { useState } from 'react';
import { Eye, EyeOff, KeyRound, LogOut } from 'lucide-react';
import { useShop } from '../context/ShopContext';
import { useDialog } from '../hooks/useDialog';
import { newPasswordProblem, passwordRulesHint } from '../lib/passwordSignIn';

/**
 * Forgot password's last step. A reset code or link signs the account in;
 * this asks for the new password, typed twice, before anything else. The
 * only ways on are saving it or signing out: Escape does not dismiss it.
 * Sellers and the administrator get the stricter password rules.
 */
export const NewPasswordPrompt: React.FC = () => {
  const { authUser, passwordRecoveryPending, setNewPassword, signOutUser, isAdminUser, isSellerUser, language, showToast } = useShop();
  const ar = language === 'ar';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [shown, setShown] = useState(false);
  const [saving, setSaving] = useState(false);
  const open = Boolean(authUser?.uid) && passwordRecoveryPending;
  const { containerRef } = useDialog({ isOpen: open, onClose: () => {} });

  if (!open) return null;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = newPasswordProblem(password, confirm, language, isAdminUser || isSellerUser);
    if (problem) {
      showToast(problem, 'warning');
      return;
    }
    setSaving(true);
    try {
      await setNewPassword(password);
      setPassword('');
      setConfirm('');
    } catch {
      // setNewPassword has already said what went wrong.
    } finally {
      setSaving(false);
    }
  };

  const label = 'block text-[11px] font-bold uppercase tracking-wider text-[#666666] mb-1';
  const input = 'w-full px-4 py-2.5 pe-11 bg-[#F8F8F6] text-[#171717] text-sm rounded-lg border border-[#E5E5E5] focus:outline-none focus:border-[#B89753] focus:bg-white';

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div
        ref={containerRef}
        id="new-password-prompt"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-password-prompt-title"
        aria-describedby="new-password-prompt-text"
        className="bg-white rounded-xl shadow-2xl border border-[#E5E5E5] max-w-md w-full max-h-[90vh] overflow-y-auto p-6"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-[#B89753]/10 text-[#7d6230] flex items-center justify-center shrink-0">
            <KeyRound className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <h2 id="new-password-prompt-title" className="font-serif font-bold text-[#171717] text-base">
              {ar ? 'اختر كلمة مرور جديدة' : 'Choose a new password'}
            </h2>
            <p id="new-password-prompt-text" className="text-xs text-[#666666]">
              {ar ? 'ستستخدمها مع الرمز الذي نرسله إلى بريدك في كل مرة تسجّل فيها الدخول.' : 'You will use it, with the code we email you, each time you sign in.'}
            </p>
          </div>
        </div>
        <form onSubmit={save} className="space-y-4">
          <div>
            <label htmlFor="new-password-input" className={label}>{ar ? 'كلمة المرور الجديدة *' : 'New Password *'}</label>
            <div className="relative">
              <input
                id="new-password-input"
                type={shown ? 'text' : 'password'}
                autoComplete="new-password"
                maxLength={72}
                value={password}
                onChange={e => setPassword(e.target.value)}
                className={input}
                autoFocus
                required
              />
              <button
                type="button"
                onClick={() => setShown(value => !value)}
                aria-label={shown ? (ar ? 'إخفاء كلمة المرور' : 'Hide password') : (ar ? 'إظهار كلمة المرور' : 'Show password')}
                aria-pressed={shown}
                className="absolute end-3 top-1/2 -translate-y-1/2 text-[#666666] hover:text-[#171717] cursor-pointer"
              >
                {shown ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
              </button>
            </div>
          </div>
          <div>
            <label htmlFor="new-password-confirm" className={label}>{ar ? 'تأكيد كلمة المرور *' : 'Confirm Password *'}</label>
            <input
              id="new-password-confirm"
              type={shown ? 'text' : 'password'}
              autoComplete="new-password"
              maxLength={72}
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              className={input}
              required
            />
          </div>
          <p className="text-[11px] text-[#666666]">
            {isAdminUser || isSellerUser
              ? (ar ? '12 حرفاً على الأقل، مع أحرف كبيرة وصغيرة ورقم ورمز خاص.' : 'At least 12 characters, with upper- and lower-case letters, a number and a symbol.')
              : passwordRulesHint(language)}
          </p>
          <button
            type="submit"
            id="new-password-save"
            disabled={saving}
            className="w-full py-3 bg-[#171717] hover:bg-black text-white font-bold rounded-lg text-xs uppercase tracking-wider transition-all shadow-sm cursor-pointer disabled:bg-neutral-300 disabled:cursor-not-allowed"
          >
            {saving ? (ar ? 'جارٍ الحفظ…' : 'Saving…') : (ar ? 'حفظ كلمة المرور' : 'Save password')}
          </button>
          <button
            type="button"
            onClick={() => { void signOutUser(); }}
            disabled={saving}
            className="w-full inline-flex items-center justify-center gap-1.5 text-[11px] font-bold text-[#666666] hover:text-[#171717] cursor-pointer disabled:opacity-50"
          >
            <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{ar ? 'إلغاء وتسجيل الخروج' : 'Cancel and sign out'}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
