import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { isNative } from './native.js';
import './index.css';
import { applyTheme, loadTheme } from './theme.js';

applyTheme(loadTheme());                    // thème appliqué avant le premier affichage (pas de flash)

createRoot(document.getElementById('root')).render(<App />);

// Hors application Android (aperçu web), cache hors ligne.
if (!isNative() && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
