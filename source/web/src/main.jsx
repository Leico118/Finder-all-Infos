import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { isNative } from './native.js';
import './index.css';

createRoot(document.getElementById('root')).render(<App />);

// Hors application Android (aperçu web), cache hors ligne.
if (!isNative() && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
