// Accès aux données. Dans l'application Android, le moteur tourne dans la page elle-même
// (window.RadarBridge présent) ; sinon (aperçu, tests), les mêmes routes passent par HTTP.
import { getEngine, isNative } from './native.js';

async function req(path, opts = {}) {
  const method = opts.method || 'GET';
  if (isNative()) {
    const r = await getEngine().handle(method, path, opts.body ?? null, { onProgress: opts.onProgress });
    if (r.status >= 400) throw Object.assign(new Error(r.data?.error || r.data?.reason || `Erreur ${r.status}`), { status: r.status, data: r.data });
    return r.data;
  }
  let res;
  try {
    res = await fetch(path, { method, headers: opts.body ? { 'content-type': 'application/json' } : {}, body: opts.body ? JSON.stringify(opts.body) : undefined });
  } catch {
    throw Object.assign(new Error('Connexion impossible.'), { status: 0 });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || data.reason || `Erreur ${res.status}`), { status: res.status, data });
  return data;
}

const q = o => Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
const post = (path, body) => req(path, { method: 'POST', body });

export const api = {
  cards: (filter, topic, since, unread) => req(`/api/cards?${q({ filter, topic, since, unread: unread ? 1 : undefined })}`),
  card: id => req(`/api/cards/${encodeURIComponent(id)}`),
  markRead: id => post(`/api/cards/${encodeURIComponent(id)}/read`),
  readAll: topic => post(`/api/read-all?${q({ topic })}`),
  specs: (topic, model) => req(`/api/specs?${q({ topic, model })}`),
  status: () => req('/api/status'),
  topics: () => req('/api/topics'),
  addTopic: text => post('/api/topics', { text }),
  updateTopic: (id, body) => req(`/api/topics/${encodeURIComponent(id)}`, { method: 'PUT', body }),
  buildModelSheet: (id, mid, body = {}) => post(`/api/topics/${encodeURIComponent(id)}/models/${encodeURIComponent(mid)}/sheet`, body),
  addModel: (id, name) => post(`/api/topics/${encodeURIComponent(id)}/models`, { name }),
  removeModel: (id, mid) => req(`/api/topics/${encodeURIComponent(id)}/models/${encodeURIComponent(mid)}`, { method: 'DELETE' }),
  cleanTopic: id => post(`/api/topics/${encodeURIComponent(id)}/clean`, {}),
  buildSheet: (id, body = {}) => post(`/api/topics/${encodeURIComponent(id)}/sheet`, body),
  deleteTopic: id => req(`/api/topics/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  refresh: (mode = 'manual', onProgress) => req(`/api/refresh?mode=${mode}`, { method: 'POST', onProgress }),
  setup: body => post('/api/setup', body),
  update: () => req('/api/update'),
  shareCode: () => req('/api/share-code'),
  importCode: code => post('/api/import-code', { code }),
};
