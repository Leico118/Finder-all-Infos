// Liaison avec le code Android (RadarBridge) : base SQLite, réseau, notifications, réglages du téléphone.
import { createEngine } from '../../engine/index.js';
import { nativeDB } from '../../engine/nativedb.js';

const bridge = () => (typeof window !== 'undefined' ? window.RadarBridge : undefined);
export const isNative = () => !!bridge();

// --- Réseau : requête exécutée par Android, réponse renvoyée par window.__radarHttp(id, json)
const waiting = new Map();
let seq = 0;
if (typeof window !== 'undefined') {
  window.__radarHttp = (id, json) => {
    const cb = waiting.get(id);
    if (!cb) return;
    waiting.delete(id);
    cb(JSON.parse(json));
  };
}

function nativeFetch(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const id = `h${++seq}`;
    const timeout = opts.timeout || 30000;
    const timer = setTimeout(() => {
      waiting.delete(id);
      reject(Object.assign(new Error('délai dépassé'), { name: 'TimeoutError' }));
    }, timeout + 5000);
    waiting.set(id, r => {
      clearTimeout(timer);
      if (r.error) return reject(new Error(r.error));
      const headers = Object.fromEntries(Object.entries(r.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
      resolve({
        ok: r.status >= 200 && r.status < 300, status: r.status, url: r.url,
        headers: { get: k => headers[String(k).toLowerCase()] ?? null },
        text: async () => r.body || '',
        json: async () => JSON.parse(r.body || 'null'),
      });
    });
    bridge().http(id, JSON.stringify({ url, method: opts.method || 'GET', headers: opts.headers || {}, body: opts.body ?? null, timeout }));
  });
}

let engine = null;
export function getEngine() {
  if (!engine) {
    const b = bridge();
    engine = createEngine({
      DB: nativeDB(b),
      fetch: nativeFetch,
      notify: async n => b.notify(n.title, n.body, n.route || ''),
      info: async () => JSON.parse(b.info()),
      setDailyHour: async h => b.setDailyHour && b.setDailyHour(h),
    });
  }
  return engine;
}

// --- Fonctions du téléphone utilisées par les réglages
export const device = {
  info: () => (isNative() ? JSON.parse(bridge().info()) : null),
  requestNotifications: () => isNative() && bridge().requestNotifications(),
  requestBattery: () => isNative() && bridge().requestBatteryExemption(),
  // Mise à jour : téléchargement + installation par Android ; l'avancement arrive par window.__radarUpdate(état, détail).
  installUpdate: (url, onProgress) => {
    if (!isNative() || !bridge().installUpdate) return false;
    window.__radarUpdate = (state, detail) => onProgress?.(state, detail);
    bridge().installUpdate(url);
    return true;
  },
  // Installer Radar chez un proche
  qr: text => (isNative() && bridge().qrMatrix ? JSON.parse(bridge().qrMatrix(text)) : null),
  canScan: () => isNative() && !!bridge().scanQr,
  scanQr: () => new Promise(resolve => {
    window.__radarScan = json => resolve(JSON.parse(json));
    bridge().scanQr();
  }),
  shareText: text => (isNative() && bridge().shareText ? (bridge().shareText(text), true) : false),
  clipboard: () => { try { return isNative() && bridge().readClipboard ? bridge().readClipboard() || '' : ''; } catch { return ''; } },
  openUrl: url => (isNative() ? bridge().openUrl(url) : window.open(url, '_blank', 'noopener')),
};
