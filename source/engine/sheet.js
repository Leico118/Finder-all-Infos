// Fiches : remplissage à partir des actualités, modèles repérés dans un sujet général et leurs fiches techniques.
import { callAI, aiConfigured, sheetFillSystem, sheetFillUser } from './ai.js';
import { applySpecs, setMeta } from './pipeline.js';

export const modelSheetId = (topic, model) => `${topic.id}~${model.id}`;
export const modelSlug = name => String(name).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'modele';

// Un modèle se manipule comme un petit sujet « produit » dont les valeurs sont rangées à part.
export function modelTopic(topic, model) {
  return { id: modelSheetId(topic, model), name: model.name, type: 'product',
    config: { spec_groups: model.groups || [], description: `${model.kind || 'produit'} — ${topic.name}` } };
}

export async function saveTopicConfig(env, topic) {
  await env.DB.prepare('UPDATE topics SET config = ?, updated_at = ? WHERE id = ?').bind(JSON.stringify(topic.config), Date.now(), topic.id).run();
}

// Remplit la fiche d'un sujet (ou d'un de ses modèles) avec ses actualités déjà trouvées.
export async function fillSheet(env, topic, { model = null } = {}) {
  const sheet = model ? modelTopic(topic, model) : topic;
  const discover = !model && topic.type === 'general';
  if (!(sheet.config.spec_groups || []).length && !discover) return { filled: 0, cards: 0 };
  const { results } = await env.DB.prepare(
    `SELECT id, reliability, title, summary, detail, latest_at FROM cards WHERE topic_id = ? AND category = 'target' ORDER BY latest_at DESC LIMIT 60`)
    .bind(topic.id).all();
  let cards = results || [];
  if (model) {                                                     // seulement les actualités qui parlent de ce modèle
    const n = model.name.toLowerCase();
    cards = cards.filter(c => `${c.title} ${c.summary} ${c.detail}`.toLowerCase().includes(n));
  }
  cards = cards.slice(0, 40);
  if (!cards.length) { await setMeta(env, `sheet_fill_${sheet.id}`, String(Date.now())); return { filled: 0, cards: 0 }; }
  const out = await callAI({ ...env, aiTimeout: 60000 }, sheetFillSystem(sheet, { discover, focus: topic.config.focus || '' }), sheetFillUser(cards, { discover }));
  const refToId = new Map(cards.map(c => [c.id, c.id]));
  const byRef = new Map();
  for (const c of cards) {
    const { results: src } = await env.DB.prepare('SELECT url, source_name, published_at FROM card_sources WHERE card_id = ? ORDER BY published_at DESC LIMIT 1').bind(c.id).all();
    byRef.set(c.id, src || []);
  }
  const count = async () => (await env.DB.prepare('SELECT COUNT(*) AS n FROM specs WHERE topic_id = ?').bind(sheet.id).first())?.n || 0;
  const before = await count();
  if ((sheet.config.spec_groups || []).length) await applySpecs(env, sheet, out?.spec_updates, refToId, byRef, Date.now());
  const filled = (await count()) - before;
  let models = 0;
  if (discover && Array.isArray(out?.models)) models = await mergeModels(env, topic, out.models);
  await setMeta(env, `sheet_fill_${sheet.id}`, String(Date.now()));
  return { filled, cards: cards.length, models };
}

// Ajoute les modèles repérés (sans doublon, 12 au plus) ; les fiches déjà générées sont conservées.
export async function mergeModels(env, topic, list) {
  const models = Array.isArray(topic.config.models) ? topic.config.models : [];
  let added = 0;
  for (const m of list.slice(0, 20)) {
    const name = String(m?.name || '').trim().slice(0, 60);
    if (name.length < 2) continue;
    const id = modelSlug(name);
    if (models.some(x => x.id === id)) continue;
    if (models.length >= 12) break;
    models.push({ id, name, kind: String(m?.kind || '').trim().slice(0, 30), groups: [] });
    added++;
  }
  topic.config.models = models;
  if (added) await saveTopicConfig(env, topic);
  return added;
}

// Après une actualisation : fiches des sujets qui ont reçu des nouveautés (au plus quelques appels à l'IA).
export async function refreshSheets(env, topics, touched, max = 4) {
  if (!aiConfigured(env) || !touched?.size) return 0;
  let calls = 0;
  for (const t of topics) {
    if (!touched.has(t.id)) continue;
    const jobs = [];
    if (t.type === 'general' && (t.config.spec_groups || []).length) jobs.push({});
    for (const m of t.config.models || []) if ((m.groups || []).length) jobs.push({ model: m });
    for (const j of jobs) {
      if (calls >= max) return calls;
      calls++;
      try { await fillSheet(env, t, j); } catch { /* nouvel essai à la prochaine actualisation */ }
    }
  }
  return calls;
}
