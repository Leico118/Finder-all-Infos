const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function formatDate(ts) {
  return ts ? dateFmt.format(new Date(ts)) : '—';
}
export function formatDateTime(ts) {
  return ts ? dateTimeFmt.format(new Date(ts)) : '—';
}
export function timeAgo(ts) {
  if (!ts) return 'jamais';
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return 'à l\'instant';
  const m = Math.round(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  if (d < 7) return `il y a ${d} j`;
  return `le ${formatDate(ts)}`;
}
export function cardDate(ts) {
  if (!ts) return '';
  return Date.now() - ts < 86400000 ? timeAgo(ts) : formatDate(ts);
}
export function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}
export const LANG_FR = { en: 'anglais', zh: 'chinois', fr: 'français', de: 'allemand', es: 'espagnol' };
