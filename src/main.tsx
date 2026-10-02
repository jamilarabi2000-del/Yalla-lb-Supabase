import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { SessionSecurityGuard } from './components/SessionSecurityGuard';
import { showCrashScreen } from './lib/crashScreen';
import './index.css';

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
    showCrashScreen(rootElement, () => window.location.reload());
  }
};

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountApp);
  } else {
    mountApp();
  }
}
