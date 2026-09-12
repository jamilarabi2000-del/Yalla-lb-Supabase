import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Gracefully absorb transient IndexedDB / database closing errors caused by iframe backgrounding/hiding
if (typeof window !== 'undefined') {
  const isIgnorableDbError = (err: any) => {
    const msg = (err?.message || err?.name || String(err || '')).toLowerCase();
    return (
      msg.includes('database is closing') ||
      msg.includes('database connection is closing') ||
      msg.includes('closing/hidden') ||
      msg.includes('closing') ||
      msg.includes('hidden') ||
      msg.includes('client is offline') ||
      msg.includes('the database connection was closed') ||
      msg.includes('indexeddb') ||
      msg.includes('abort')
    );
  };

  window.addEventListener('unhandledrejection', (event) => {
    if (isIgnorableDbError(event?.reason)) {
      // Prevent noisy crash on tab switch / iframe hide
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }
      console.warn('[Yalla.lb] Handled transient background database state:', event.reason);
    }
  }, true);

  window.addEventListener('error', (event) => {
    if (isIgnorableDbError(event?.error || event?.message)) {
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }
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
        <App />
      </StrictMode>,
    );
  } catch (error) {
    console.error('[Yalla.lb] Critical mount failure:', error);
    rootElement.innerHTML = `
      <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; background-color: #1a1a2e; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 24px;">
        <div style="max-width: 440px; width: 100%; background: #16213e; border-radius: 24px; padding: 32px; box-shadow: 0 20px 40px -15px rgba(0,0,0,0.5); text-align: center; border: 1px solid rgba(197, 160, 89, 0.3);">
          <div style="width: 48px; height: 48px; border-radius: 14px; background: rgba(197, 160, 89, 0.15); display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px; border: 1px solid rgba(197, 160, 89, 0.4); color: #c5a059; font-size: 24px; font-weight: bold;">
            Y
          </div>
          <h2 style="font-size: 20px; font-weight: 700; color: #f1f5f9; margin: 0 0 10px 0;">Yalla Marketplace</h2>
          <p style="font-size: 14px; color: #94a3b8; margin: 0 0 24px 0; line-height: 1.5;">Preparing your marketplace experience...</p>
          <button onclick="window.location.reload()" style="background-color: #c5a059; color: #1a1a2e; border: none; padding: 12px 24px; border-radius: 12px; font-size: 14px; font-weight: 700; cursor: pointer; transition: opacity 0.2s;">
            Refresh Storefront
          </button>
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
