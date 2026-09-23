/**
 * Opens the Account page on its sign-in form.
 *
 * The Account page starts on the orders tab, where a signed-out visitor sees
 * an empty list; the sign-in form is under the profile tab. The Seller Portal
 * links send sellers there, so they ask for the form: a one-time flag the
 * page reads as it opens, and an event for when it is already open.
 */
const KEY = 'yalla.accountSignIn';
export const ACCOUNT_SIGNIN_EVENT = 'yalla:account-signin';

export function requestAccountSignIn(): void {
  try { sessionStorage.setItem(KEY, '1'); } catch { /* storage unavailable */ }
  window.dispatchEvent(new Event(ACCOUNT_SIGNIN_EVENT));
}

/** True once per request; clears it. */
export function takeAccountSignInRequest(): boolean {
  try {
    const requested = sessionStorage.getItem(KEY) === '1';
    sessionStorage.removeItem(KEY);
    return requested;
  } catch {
    return false;
  }
}
