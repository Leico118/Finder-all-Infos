// Thèmes de l'interface : couleurs appliquées par variables CSS (instantané, sans recharger).
// Chaque teinte existe en version pour fond sombre (dark) et pour fond clair (light).
export const ACCENTS = [
  { id: 'sable', name: 'Sable', dark: '#d9c4a3', light: '#8a6a3a' },
  { id: 'bleu', name: 'Bleu', dark: '#86b0e8', light: '#2f63a8' },
  { id: 'sarcelle', name: 'Sarcelle', dark: '#6fc2b6', light: '#1f7a70' },
  { id: 'vert', name: 'Vert', dark: '#8fd18f', light: '#2f7d32' },
  { id: 'miel', name: 'Miel', dark: '#e2b45e', light: '#9a6b12' },
  { id: 'ambre', name: 'Ambre', dark: '#f0a15a', light: '#b5591a' },
  { id: 'brique', name: 'Brique', dark: '#ec8a6e', light: '#b5452b' },
  { id: 'rose', name: 'Rose', dark: '#ee98b2', light: '#b23a62' },
  { id: 'prune', name: 'Prune', dark: '#c49be3', light: '#7b4ea6' },
  { id: 'gris', name: 'Gris', dark: '#c4c0b8', light: '#5f5b55' },
];

export const THEMES = [
  { id: 'noir', name: 'Noir', desc: 'Sobre et professionnel', accents: true, defaultAccent: 'sable', light: false, bar: '#0a0a0c',
    preview: ['#0a0a0c', '#1c1c22'] },
  { id: 'verre', name: 'Verre', desc: 'Bulles translucides sur fond coloré', accents: true, defaultAccent: 'miel', light: false, bar: null,
    preview: ['#4a3a1c', '#2a241c'] },
  { id: 'papier', name: 'Papier', desc: 'Clair, comme une page de journal', accents: true, defaultAccent: 'bleu', light: true, bar: '#f3efe6',
    preview: ['#f3efe6', '#fffdf8'] },
  { id: 'contraste', name: 'Contraste', desc: 'Lisibilité maximale : noir, blanc et jaune', accents: false, light: false, bar: '#000000',
    preview: ['#000000', '#ffd60a'] },
];

const KEY = 'radar-theme';

export function loadTheme() {
  try {
    const t = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (t && THEMES.some(x => x.id === t.theme)) return t;
  } catch { /* stockage indisponible */ }
  return { theme: 'noir', accent: 'sable' };
}

export function accentOf(t) {
  const theme = THEMES.find(x => x.id === t.theme) || THEMES[0];
  if (!theme.accents) return null;
  return ACCENTS.find(a => a.id === t.accent) || ACCENTS.find(a => a.id === theme.defaultAccent);
}

export function applyTheme(t) {
  const theme = THEMES.find(x => x.id === t.theme) || THEMES[0];
  const root = document.documentElement;
  root.dataset.theme = theme.id;
  const a = accentOf(t);
  if (a) {
    root.style.setProperty('--color-accent', theme.light ? a.light : a.dark);
    root.style.setProperty('--tint', a.dark);                          // teinte du fond (thème Verre)
  } else {
    root.style.removeProperty('--color-accent');
    root.style.removeProperty('--tint');
  }
  // Barres d'Android assorties (heure, batterie, navigation)
  try {
    const bar = theme.bar || mixHex(a?.dark || '#e2b45e', '#16120c', 0.42);
    window.RadarBridge?.setSystemBars?.(bar, theme.light);
  } catch { /* hors application Android */ }
}

export function saveTheme(t) {
  try { localStorage.setItem(KEY, JSON.stringify(t)); } catch { /* stockage indisponible */ }
  applyTheme(t);
}

function mixHex(a, b, w) {
  const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return '#' + x.map((v, i) => Math.round(v * w + y[i] * (1 - w)).toString(16).padStart(2, '0')).join('');
}
