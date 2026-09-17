import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { SessionSecurityGuard } from './components/SessionSecurityGuard';
import './index.css';

// Gracefully absorb transient browser database errors caused by iframe/tab backgrounding.
if (typeof window !== 'undefined') {
  /**
   * Narrowly matches the browser-storage teardown noise that a backgrounded tab
   * produces, and nothing else.
   *
   * This used to match any message containing 'abort', 'closing', 'hidden' or
   * 'indexeddb'. AbortError is what a cancelled or failed fetch throws, so real
   * Supabase network failures were being silently absorbed and downgraded to a
   * console warning -- the application looked healthy while requests failed.
   */
  const isIgnorableDbError = (err: any) => {
    const msg = (err?.message || err?.name || String(err || '')).toLowerCase();
    return (
      msg.includes('database is closing') ||
      msg.includes('database connection is closing') ||
      msg.includes('the database connection was closed') ||
      msg.includes('closing/hidden') ||
      msg.includes('a mutation operation was attempted on a database that did not allow mutations')
    );
  };

  window.addEventListener('unhandledrejection', (event) => {
    if (isIgnorableDbError(event?.reason)) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      console.warn('[Yalla.lb] Handled transient background database state:', event.reason);
    }
  }, true);

  window.addEventListener('error', (event) => {
    if (isIgnorableDbError(event?.error || event?.message)) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      console.warn('[Yalla.lb] Handled transient database error:', event.message);
    }
  }, true);
}

const mountApp = () => {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    console.error('[Yalla.lb] Root element #root not found.');
    return;
  }

  try {
    createRoot(rootElement).render(
      <StrictMode>
        <SessionSecurityGuard />
        <App />
      </StrictMode>,
    );
  } catch (error) {
    console.error('[Yalla.lb] Critical mount failure:', error);
    rootElement.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#F7F7F8;color:#111111;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:24px;">
        <div style="max-width:440px;width:100%;background:#FFFFFF;border-radius:24px;padding:32px;box-shadow:0 20px 40px -15px rgba(0,0,0,.18);text-align:center;border:1px solid rgba(184,151,83,.25);">
          <div style="width:48px;height:48px;border-radius:14px;background:#F3E5AB;display:inline-flex;align-items:center;justify-content:center;margin-bottom:16px;border:1px solid rgba(184,151,83,.4);color:#8F7137;font-size:24px;font-weight:bold;">Y</div>
          <h2 style="font-size:20px;font-weight:700;color:#111111;margin:0 0 10px 0;">Yalla Marketplace</h2>
          <p style="font-size:14px;color:#666666;margin:0 0 24px 0;line-height:1.5;">Preparing your marketplace experience...</p>
          <button onclick="window.location.reload()" style="background:#B89753;color:#FFFFFF;border:none;padding:12px 24px;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;">Refresh Storefront</button>
        </div>
      </div>
    `;
  }
};

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountApp);
  } else {
    mountApp();
  }
}
