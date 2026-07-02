import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { initInstallPrompt } from './hooks/useInstallPrompt';

// Capture the PWA install prompt at startup - the `beforeinstallprompt` event
// fires once, early, before the user can navigate to the Profile install card.
initInstallPrompt();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// A long-open tab that lazy-imports a chunk removed by a newer deploy would 404;
// Vite emits `vite:preloadError` in that case - reload once to pull the fresh shell.
window.addEventListener('vite:preloadError', () => {
  window.location.reload();
});

// Register the service worker in PRODUCTION ONLY - dev keeps HMR untouched.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
