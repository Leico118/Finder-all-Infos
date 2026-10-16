// Collecte quotidienne → enrichissement → analyse IA → fusion en cartes → fiche technique → notifications.
import { parseFeed, extractArticle, normalizeUrl, titleKey, hash } from './rss.js';
import { fetchText, sleep } from './net.js';
import { SITE_FEEDS, topicFeeds } from './sources.js';
import { topicMatchers } from './topics.js';
import { callAI, aiConfigured, analysisSystem, analysisUser, specKeys, backupActive, backupConfigured, lastAIProvider } from './ai.js';
import { searchConfigured, webSearch, pickQueries, DAILY_BUDGET } from './websearch.js';
import { refreshSheets } from './sheet.js';

const DAY = 86400000;
const BATCH = 6;
const LOCK_MS = 4 * 60 * 1000;      // verrou abandonné (application fermée en pleine passe) libéré après 4 min
export const RELIABILITY = ['unverified', 'rumor', 'reliable', 'official'];
const relRank = r => Math.max(0, RELIABILITY.indexOf(r));
const normRel = r => (RELIABILITY.includes(r) ? r : 'unverified');
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
// Coupure réseau (téléphone hors ligne, ou application privée d'Internet en arrière-plan).
export const isNetworkError = m => /UnknownHost|Unable to resolve|No address associated|ConnectException|SocketException|SSLException|EOFException|NoRouteToHost|délai dépassé|timeout|Network is unreachable/i.test(String(m || ''));
export const NETWORK_MSG = "pas de connexion Internet pour Radar (réseau coupé, ou application bloquée en arrière-plan par l'économie de batterie ou de données)";

const REL_FR = { official: 'Officiel', reliable: 'Fiable', rumor: 'Rumeur', unverified: 'Non vérifié' };

// ---------- Méta-données ----------
export async function getMeta(env, key) {
  const r = await env.DB.prepare('SELECT value FROM meta WHERE key = ?').bind(key).first();
  return r ? r.value : null;
}
export async function setMeta(env, key, value) {
  await env.DB.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .bind(key, value).run();
}

// Début de la collecte quotidienne la plus récente (8 h, heure locale du téléphone).
export function dayStart(env, now = Date.now()) {
  const d = new Date(now);
  d.setHours(Number(env.DAILY_HOUR ?? 8), 0, 0, 0);
  let start = d.getTime();
  if (start > now) { d.setDate(d.getDate() - 1); start = d.getTime(); }
  return start;
}

export async function loadTopics(env) {
  const { results } = await env.DB.prepare('SELECT * FROM topics ORDER BY position, created_at').all();
  return (results || []).map(t => ({ ...t, config: JSON.parse(t.config || '{}') }));
}

// ---------- Collecte ----------
async function saveSourceState(env, src, now, status, inserted) {
  const ok = status.startsWith('ok');
  await env.DB.prepare(
    `INSERT INTO source_state (id, name, topic_id, last_fetched, last_ok, last_status, last_new) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, last_fetched = excluded.last_fetched,
       last_ok = COALESCE(excluded.last_ok, source_state.last_ok), last_status = excluded.last_status, last_new = excluded.last_new`
  ).bind(src.id, src.name, src.topic_id || null, now, ok ? now : null, status, inserted).run();
}

async function insertItems(env, rows, now) {
  if (!rows.length) return 0;
  // Sujet supprimé pendant l'actualisation : ses articles ne sont plus enregistrés.
  const { results: alive } = await env.DB.prepare('SELECT id FROM topics').all();
  const ids = new Set((alive || []).map(r => r.id));
  rows = rows.filter(r => ids.has(r.topic_id));
  if (!rows.length) return 0;
  const stmts = [];
  for (const r of rows) {
    stmts.push(env.DB.prepare(
      `INSERT OR IGNORE INTO raw_items (id, topic_id, title_key, url, title, snippet, source_id, source_name, lang, kind, published_at, fetched_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`
    ).bind(await hash(r.topic_id + '|' + normalizeUrl(r.url)), r.topic_id, await hash(titleKey(r.title)), r.url, r.title, r.snippet || '',
      r.source_id, r.source_name, r.lang, r.kind, r.published ? Math.min(r.published, now) : null, now));
  }
  const res = await env.DB.batch(stmts);
  return res.reduce((n, x) => n + (x.meta?.changes || 0), 0);
}

// Âge maximal accepté : historique complet lors de la première collecte d'un sujet.
function minDate(topic, state, kind, now) {
  if (kind === 'competitor') return now - 14 * DAY;
  if (!state?.backfill_done) {
    const from = topic.config?.backfill_from ? Date.parse(topic.config.backfill_from) : NaN;
    return Number.isFinite(from) ? from : now - 60 * DAY;
  }
  return now - 45 * DAY;
}

// Rapproche les articles d'un flux des sujets concernés.
function matchItems(items, src, topics, states, now) {
  const rows = [];
  const rivalsPerTopic = {};
  for (const it of items) {
    const text = `${it.title} ${it.snippet}`;
    for (const t of topics) {
      if (src.topic_id && src.topic_id !== t.id) continue;
      const m = t._m;
      const isTopic = !!m.match?.test(text);
      let kind = null;
      if (src.kind === 'competitor') { if (!isTopic && m.rival?.test(text)) kind = 'competitor'; }   // flux « concurrents »
      else if (isTopic) kind = 'target';
      else if (src.scope === 'tech' && m.rival?.test(it.title)) kind = 'competitor';                // site spécialisé
      if (!kind) continue;
      if (it.published && it.published < minDate(t, states[t.id], kind, now)) continue;
      if (kind === 'competitor') {
        const cap = src.kind === 'competitor' ? 15 : 3;
        rivalsPerTopic[t.id] = (rivalsPerTopic[t.id] || 0) + 1;
        if (rivalsPerTopic[t.id] > cap) continue;
      }
      rows.push({ topic_id: t.id, kind, url: it.url, title: it.title, snippet: it.snippet, published: it.published,
        source_id: src.id, source_name: it.source || src.name, lang: src.lang });
    }
  }
  return rows;
}

async function collectFeed(env, src, topics, states, now) {
  let status, inserted = 0;
  try {
    const xml = await fetchText(src.url, 20000);
    const items = parseFeed(xml, 100);
    const rows = matchItems(items, src, topics, states, now);
    inserted = await insertItems(env, rows, now);
    status = `ok · ${items.total} lus · ${rows.length} pertinents · ${inserted} nouveaux`;
  } catch (e) {
    status = `erreur : ${e.name === 'AbortError' || e.name === 'TimeoutError' ? 'délai dépassé' : e.message.slice(0, 160)}`;
  }
  await saveSourceState(env, src, now, status, inserted);
  return { id: src.id, name: src.name, status, inserted };
}

async function pool(tasks, n) {
  const out = [];
  let i = 0;
  const run = async () => { while (i < tasks.length) { const k = i++; out[k] = await tasks[k](); } };
  await Promise.all(Array.from({ length: Math.min(n, tasks.length) }, run));
  return out;
}

async function collectWeb(env, topic, state, share, now, stats) {
  const src = { id: `t:${topic.id}:web`, name: 'Recherche web (Tavily)', topic_id: topic.id, lang: 'multi' };
  const { queries, cursor, wrapped } = pickQueries(topic, state, state?.backfill_done ? share : Math.max(share, 12));
  if (!queries.length) return;
  const since = state?.backfill_done
    ? new Date((state.last_collect || now) - 3 * DAY).toISOString().slice(0, 10)
    : new Date(minDate(topic, state, 'target', now)).toISOString().slice(0, 10);
  let status, inserted = 0;
  try {
    const results = await webSearch(env, topic, queries, since);
    const m = topic._m;
    const rows = results.filter(r => m.match?.test(`${r.title} ${r.snippet}`)).map(r => ({
      topic_id: topic.id, kind: 'target', url: r.url, title: r.title, snippet: r.snippet, published: r.published,
      source_id: src.id, source_name: r.source, lang: r.lang,
    }));
    inserted = await insertItems(env, rows, now);
    status = `ok · ${queries.length} recherches depuis le ${since} · ${rows.length} résultats · ${inserted} nouveaux`;
    await env.DB.prepare('UPDATE topic_state SET web_cursor = ?, web_cycles = web_cycles + ? WHERE topic_id = ?')
      .bind(cursor, wrapped ? 1 : 0, topic.id).run();
  } catch (e) {
    status = `erreur : ${e.message.slice(0, 200)}`;
  }
  await saveSourceState(env, src, now, status, inserted);
  stats.sources.push({ id: src.id, name: src.name, status, inserted });
}

// Collecte des sujets dont la collecte du jour n'a pas encore eu lieu (ou tous, en mode manuel).
async function collect(env, topics, now, manual, stats) {
  const since = dayStart(env, now);
  const { results: st } = await env.DB.prepare('SELECT * FROM topic_state').all();
  const states = Object.fromEntries((st || []).map(s => [s.topic_id, s]));
  const due = topics.filter(t => manual || !states[t.id] || (states[t.id].last_collect || 0) < since);
  for (const t of topics) t._m = topicMatchers(t);
  let collected = 0;
  if (due.length) {
    const feeds = [];
    for (const t of due) feeds.push(...topicFeeds(t, { first: !states[t.id]?.backfill_done }));
    const techTopics = due.filter(t => t.config?.tech);
    const siteDone = Number(await getMeta(env, 'sites_last') || 0);
    const readSites = techTopics.length && (manual || siteDone < since || techTopics.some(t => !states[t.id]?.backfill_done));
    const gdeltFeeds = feeds.filter(f => f.id.endsWith(':gdelt'));
    const otherFeeds = feeds.filter(f => !f.id.endsWith(':gdelt'));

    const total = otherFeeds.length + (readSites ? SITE_FEEDS.length : 0) + gdeltFeeds.length;
    let done = 0;
    const tracked = async (f, list) => {
      const r = await collectFeed(env, f, list, states, now);
      stats.progress?.({ phase: 'collect', done: ++done, total, found: (stats.found = (stats.found || 0) + (r.inserted || 0)) });
      return r;
    };
    stats.progress?.({ phase: 'collect', done: 0, total, found: 0 });
    const tasks = [
      ...otherFeeds.map(f => () => tracked(f, due)),
      ...(readSites ? SITE_FEEDS.map(f => () => tracked(f, techTopics)) : []),
    ];
    const gdeltRun = (async () => {              // GDELT : une requête toutes les 6 s au plus
      const out = [];
      for (const f of gdeltFeeds) { out.push(await tracked(f, due)); await sleep(env.GDELT_DELAY ?? 6000); }
      return out;
    })();
    stats.sources.push(...await pool(tasks, 5), ...await gdeltRun);
    if (readSites) await setMeta(env, 'sites_last', String(now));
  }
  for (const t of due) {
    await env.DB.prepare(
      `INSERT INTO topic_state (topic_id, last_collect, backfill_done) VALUES (?, ?, 1)
       ON CONFLICT(topic_id) DO UPDATE SET last_collect = excluded.last_collect, backfill_done = 1`
    ).bind(t.id, now).run();
  }
  collected = due.length;

  // Recherche web : une fois par jour et par sujet, indépendamment des flux (clé ajoutée en cours de journée, nouveau sujet…).
  if (searchConfigured(env)) {
    const share = Math.max(2, Math.floor(DAILY_BUDGET / Math.max(1, topics.length)));
    const { results: ws } = await env.DB.prepare(`SELECT id, last_fetched, last_ok, last_status FROM source_state WHERE id LIKE 't:%:web'`).all();
    const web = Object.fromEntries((ws || []).map(r => [r.id, r]));
    const { results: st2 } = await env.DB.prepare('SELECT * FROM topic_state').all();
    const states2 = Object.fromEntries((st2 || []).map(r => [r.topic_id, r]));
    for (const t of topics) {
      const w = web[`t:${t.id}:web`];
      if (w?.last_ok && w.last_ok >= since) continue;                                        // déjà faite aujourd'hui
      if (w?.last_status?.startsWith('erreur') && now - (w.last_fetched || 0) < 15 * 60000) continue;
      const state = states2[t.id] || { web_cursor: 0 };
      // Première recherche d'un sujet : historique complet, même si les flux viennent d'être lus.
      const firstWeb = !w?.last_ok;
      stats.progress?.({ phase: 'web', topic: t.config?.short || t.name });
      await collectWeb(env, t, firstWeb ? { ...state, backfill_done: 0 } : state, share, now, stats);
    }
  }
  return collected;
}

// ---------- Enrichissement : début du texte des articles ----------
async function enrich(env, max = 6) {
  const { results } = await env.DB.prepare(
    `SELECT id, url FROM raw_items WHERE status = 'pending' AND content IS NULL ORDER BY published_at DESC LIMIT ${max * 2}`).all();
  const rows = results || [];
  await pool(rows.map((r, k) => async () => {
    let content = '';
    if (k < max && !/news\.google\.com|reddit\.com|bing\.com\/news/.test(r.url)) {
      try { content = extractArticle(await fetchText(r.url, 12000)); } catch { content = ''; }
    }
    await env.DB.prepare('UPDATE raw_items SET content = ? WHERE id = ?').bind(content, r.id).run();
  }), 3);
}

// ---------- Analyse IA ----------
async function analyze(env, topicsById, now, stats, stillOwner = async () => true, size = BATCH) {
  const first = await env.DB.prepare(
    `SELECT topic_id FROM raw_items WHERE status = 'pending' AND content IS NOT NULL ORDER BY fetched_at, published_at DESC LIMIT 1`).first();
  if (!first) return 0;
  const exists = async id => !!(await env.DB.prepare('SELECT id FROM topics WHERE id = ?').bind(id).first());
  const topic = (await exists(first.topic_id)) ? topicsById[first.topic_id] : null;
  if (!topic) {
    await env.DB.prepare(`UPDATE raw_items SET status = 'ignored', reason = 'sujet supprimé' WHERE topic_id = ?`).bind(first.topic_id).run();
    return 1;
  }
  // IA de secours (limites gratuites plus serrées) : lots plus petits et moins de contexte.
  const backup = backupActive(env);
  const { results: pending } = await env.DB.prepare(
    `SELECT * FROM raw_items WHERE status = 'pending' AND content IS NOT NULL AND topic_id = ?
     ORDER BY (kind = 'target') DESC, published_at DESC LIMIT ${backup ? Math.min(size, 3) : size}`).bind(topic.id).all();
  const { results: cards } = await env.DB.prepare(
    `SELECT id, category, reliability, title, summary, competitor_model FROM cards WHERE topic_id = ? ORDER BY latest_at DESC LIMIT ${backup ? 30 : 80}`)
    .bind(topic.id).all();
  const { results: specs } = await env.DB.prepare('SELECT key, value, reliability FROM specs WHERE topic_id = ?').bind(topic.id).all();
  let out;
  try {
    out = await callAI(env, analysisSystem(topic), analysisUser(topic, { items: pending, cards: cards || [], specs: specs || [] }), { fallback: false });
    if (lastAIProvider() === 'groq') stats.backup = (stats.backup || 0) + pending.length;
  } catch (e) {
    if (e.busy && !e.fromBackup && backupConfigured(env)) return -2;      // Gemini surchargé : nouvel essai avec l'IA de secours
    if (isNetworkError(e.message)) throw new Error(`${NETWORK_MSG} [détail : ${str(e.message, 160)}]`);  // rien n'est perdu
    if (e.busy) throw e;                                                   // Google surchargé : pas compté comme un échec
    await env.DB.batch(pending.map(p => env.DB.prepare(
      `UPDATE raw_items SET attempts = attempts + 1, status = CASE WHEN attempts + 1 >= 6 THEN 'error' ELSE status END, reason = ? WHERE id = ?`
    ).bind(str(e.message, 300), p.id)));
    throw e;
  }
  if (!(await stillOwner())) return -1;                                   // une autre passe a pris la main : résultat ignoré
  if (!(await exists(topic.id))) return pending.length;                  // sujet supprimé pendant l'analyse : rien n'est créé
  await applyAnalysis(env, topic, pending, cards || [], out || {}, now, stats);
  return pending.length;
}

function cardFields(topic, def, fallbackKind) {
  const product = topic.type === 'product';
  let category = def.category === 'competitor' || def.category === 'target' ? def.category : fallbackKind;
  if (!product) category = 'target';
  const comp = category === 'competitor' && def.competitor && typeof def.competitor === 'object' ? def.competitor : {};
  const keys = specKeys(topic);
  return {
    category,
    reliability: normRel(def.reliability),
    reliability_reason: str(def.reliability_reason, 600),
    origin: str(def.origin, 300),
    title: str(def.title, 140),
    summary: str(def.summary, 400),
    detail: str(def.detail, 8000),
    technical: str(def.technical, 5000),
    spec_keys: JSON.stringify((Array.isArray(def.spec_keys) ? def.spec_keys : []).filter(k => keys.includes(k))),
    official_confirmation: def.official_confirmation ? 1 : 0,
    contradiction: str(def.contradiction, 1000),
    competitor_brand: str(comp.brand, 60),
    competitor_model: str(comp.model, 100),
    competitor_why: str(comp.why, 2000),
    competitor_comparison: str(comp.comparison, 3000),
    importance: Math.min(3, Math.max(1, Number(def.importance) || 1)),
    change_note: str(def.change_note, 600),
  };
}

async function applyAnalysis(env, topic, pending, cards, out, now, stats) {
  const DB = env.DB;
  const existing = new Map(cards.map(c => [c.id, c]));
  const defs = new Map((Array.isArray(out.cards) ? out.cards : []).filter(c => c && c.ref).map(c => [String(c.ref).trim(), c]));
  const byRef = new Map();
  const handled = new Set();
  const stmts = [];
  const refToId = new Map();
  const hist = (id, kind, note) => stmts.push(DB.prepare('INSERT INTO card_history (card_id, at, kind, note) VALUES (?, ?, ?, ?)').bind(id, now, kind, note));
  const ignore = (it, reason) => {
    handled.add(it.id);
    stmts.push(DB.prepare(`UPDATE raw_items SET status = 'ignored', reason = ? WHERE id = ?`).bind(str(reason, 300) || 'hors sujet', it.id));
    stats.ignored++;
  };

  for (const r of Array.isArray(out.items) ? out.items : []) {
    const it = pending[Number(r?.i)];
    if (!it || handled.has(it.id)) continue;
    const ref = typeof r.ref === 'string' && r.ref.trim() && r.ref !== 'null' ? r.ref.trim() : null;
    if (!ref || (!ref.startsWith('new:') && !existing.has(ref))) { ignore(it, r.ignore_reason); continue; }
    handled.add(it.id);
    if (!it.published_at && typeof r.date === 'string') {
      const d = Date.parse(r.date);
      if (Number.isFinite(d) && d <= now) {
        it.published_at = d;
        stmts.push(DB.prepare('UPDATE raw_items SET published_at = ? WHERE id = ?').bind(d, it.id));
      }
    }
    if (!byRef.has(ref)) byRef.set(ref, []);
    byRef.get(ref).push(it);
  }

  for (const [ref, its] of byRef) {
    const def = defs.get(ref);
    const pubs = its.map(i => i.published_at || now);
    const minPub = Math.min(...pubs), maxPub = Math.max(...pubs);
    let id;
    if (ref.startsWith('new:')) {
      if (!def || !str(def.title, 10)) { its.forEach(it => ignore(it, 'Analyse IA incomplète')); continue; }
      id = crypto.randomUUID();
      const f = cardFields(topic, def, its[0].kind);
      stmts.push(DB.prepare(
        `INSERT INTO cards (id, topic_id, category, reliability, title, summary, detail, technical, origin, reliability_reason,
          spec_keys, official_confirmation, contradiction, competitor_brand, competitor_model, competitor_why,
          competitor_comparison, importance, first_seen_at, latest_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(id, topic.id, f.category, f.reliability, f.title, f.summary, f.detail, f.technical, f.origin, f.reliability_reason,
        f.spec_keys, f.official_confirmation, f.contradiction, f.competitor_brand, f.competitor_model, f.competitor_why,
        f.competitor_comparison, f.importance, minPub, maxPub, now, now));
      hist(id, 'created', `Carte créée (${REL_FR[f.reliability]}) à partir de ${its.length} source(s).`);
      if (f.contradiction) hist(id, 'contradiction', f.contradiction);
      stats.created++;
      (stats.touched ||= new Set()).add(topic.id);
      if (f.reliability === 'official' || f.importance >= 2) stats.notify.push({ topic, id, title: f.title, rel: f.reliability, imp: f.importance });
    } else {
      id = ref;
      const prev = existing.get(ref);
      if (def && def.updated) {
        const f = cardFields(topic, def, prev.category);
        stmts.push(DB.prepare(
          `UPDATE cards SET reliability = ?, reliability_reason = COALESCE(NULLIF(?, ''), reliability_reason),
             origin = COALESCE(NULLIF(?, ''), origin), title = COALESCE(NULLIF(?, ''), title),
             summary = COALESCE(NULLIF(?, ''), summary), detail = COALESCE(NULLIF(?, ''), detail),
             technical = COALESCE(NULLIF(?, ''), technical),
             spec_keys = CASE WHEN ? = '[]' THEN spec_keys ELSE ? END,
             official_confirmation = MAX(official_confirmation, ?), contradiction = COALESCE(NULLIF(?, ''), contradiction),
             competitor_why = COALESCE(NULLIF(?, ''), competitor_why),
             competitor_comparison = COALESCE(NULLIF(?, ''), competitor_comparison),
             importance = MAX(importance, ?), latest_at = MAX(COALESCE(latest_at, 0), ?), updated_at = ?
           WHERE id = ?`
        ).bind(f.reliability, f.reliability_reason, f.origin, f.title, f.summary, f.detail, f.technical,
          f.spec_keys, f.spec_keys, f.official_confirmation, f.contradiction, f.competitor_why, f.competitor_comparison,
          f.importance, maxPub, now, id));
        hist(id, 'updated', f.change_note || `Mise à jour avec ${its.length} nouvelle(s) source(s).`);
        if (f.reliability !== prev.reliability) hist(id, 'reliability', `Fiabilité : ${REL_FR[prev.reliability] || prev.reliability} → ${REL_FR[f.reliability]}`);
        if (f.official_confirmation && f.reliability === 'official' && prev.reliability !== 'official') hist(id, 'official', 'Confirmation officielle.');
        if (f.contradiction) hist(id, 'contradiction', f.contradiction);
        stats.updated++;
        (stats.touched ||= new Set()).add(topic.id);
        if (f.reliability === 'official' && prev.reliability !== 'official') stats.notify.push({ topic, id, title: f.title || prev.title, rel: 'official', imp: 3 });
      } else {
        stmts.push(DB.prepare('UPDATE cards SET latest_at = MAX(COALESCE(latest_at, 0), ?) WHERE id = ?').bind(maxPub, id));
        hist(id, 'source', `${its.length} source(s) supplémentaire(s) rapportant la même information (pas une confirmation indépendante).`);
      }
    }
    refToId.set(ref, id);
    for (const it of its) {
      stmts.push(DB.prepare(
        `INSERT OR IGNORE INTO card_sources (card_id, url, title, source_name, lang, published_at, added_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(id, it.url, it.title, it.source_name, it.lang, it.published_at, now));
      stmts.push(DB.prepare(`UPDATE raw_items SET status = 'processed', card_id = ? WHERE id = ?`).bind(id, it.id));
    }
  }
  for (const it of pending) {
    if (handled.has(it.id)) continue;
    stmts.push(DB.prepare(
      `UPDATE raw_items SET attempts = attempts + 1, status = CASE WHEN attempts + 1 >= 3 THEN 'ignored' ELSE status END,
         reason = 'non traité par l''IA' WHERE id = ?`).bind(it.id));
  }
  if (stmts.length) await DB.batch(stmts);
  if (specKeys(topic).length) await applySpecs(env, topic, out.spec_updates, refToId, byRef, now);
}

export async function applySpecs(env, topic, updates, refToId, byRef, now) {
  if (!Array.isArray(updates)) return;
  const keys = specKeys(topic);
  for (const u of updates) {
    if (!u || !keys.includes(u.key)) continue;
    const value = str(u.value, 200);
    const ref = String(u.ref || '').trim();
    const cardId = refToId.get(ref);
    if (!value || !cardId) continue;
    const rel = normRel(u.reliability);
    const src = (byRef.get(ref) || [])[0];
    const cur = await env.DB.prepare('SELECT * FROM specs WHERE topic_id = ? AND key = ?').bind(topic.id, u.key).first();
    let accepted = false;
    let note = str(u.note, 400);
    if (!cur) accepted = true;
    else if (String(cur.value).toLowerCase() === value.toLowerCase()) {
      if (relRank(rel) <= relRank(cur.reliability)) continue;
      accepted = true;
      note = `Fiabilité relevée (${REL_FR[cur.reliability]} → ${REL_FR[rel]}). ${note}`;
    } else if (relRank(rel) >= relRank(cur.reliability)) {
      accepted = true;
      note = `Remplace « ${cur.value} » (${REL_FR[cur.reliability]}). ${note}`;
    } else {
      note = `Valeur divergente non retenue : « ${cur.value} » reste plus fiable. ${note}`;
    }
    const stmts = [env.DB.prepare(
      'INSERT INTO spec_history (topic_id, key, value, reliability, card_id, note, accepted, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(topic.id, u.key, value, rel, cardId, note.trim(), accepted ? 1 : 0, now)];
    if (accepted) {
      stmts.push(env.DB.prepare(
        `INSERT INTO specs (topic_id, key, value, reliability, card_id, source_url, source_name, source_date, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(topic_id, key) DO UPDATE SET value = excluded.value, reliability = excluded.reliability, card_id = excluded.card_id,
           source_url = excluded.source_url, source_name = excluded.source_name, source_date = excluded.source_date, updated_at = excluded.updated_at`
      ).bind(topic.id, u.key, value, rel, cardId, src?.url || null, src?.source_name || null, src?.published_at || null, now));
    }
    await env.DB.batch(stmts);
  }
}

// ---------- Notifications ----------
async function sendNotifications(env, list) {
  if (!list.length || !env.notify || (await getMeta(env, 'notify_enabled')) === '0') return;
  const byTopic = new Map();
  for (const n of list) {
    if (!byTopic.has(n.topic.id)) byTopic.set(n.topic.id, []);
    byTopic.get(n.topic.id).push(n);
  }
  for (const items of byTopic.values()) {
    items.sort((a, b) => b.imp - a.imp);
    const top = items[0];
    const name = top.topic.config?.short || top.topic.name;
    try {
      await env.notify({
        title: top.rel === 'official' ? `${name} — information officielle` : `${name} — nouveauté`,
        body: items.length > 1 ? `${top.title} (+${items.length - 1} autre${items.length > 2 ? 's' : ''})` : top.title,
        route: `/carte/${top.id}`,
      });
    } catch { /* notification facultative */ }
  }
}

// Restes d'un sujet supprimé (par exemple pendant une actualisation) : effacés.
export async function purgeOrphans(env) {
  const orphan = 'topic_id NOT IN (SELECT id FROM topics)';
  const cardOrphan = `card_id IN (SELECT id FROM cards WHERE ${orphan})`;
  // Fiches des modèles (« sujet~modèle ») : gardées tant que le sujet existe.
  const specOrphan = `NOT EXISTS (SELECT 1 FROM topics t WHERE topic_id = t.id OR topic_id LIKE t.id || '~%')`;
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM card_sources WHERE ${cardOrphan}`),
    env.DB.prepare(`DELETE FROM card_history WHERE ${cardOrphan}`),
    env.DB.prepare(`DELETE FROM card_reads WHERE ${cardOrphan}`),
    env.DB.prepare(`DELETE FROM cards WHERE ${orphan}`),
    env.DB.prepare(`DELETE FROM raw_items WHERE ${orphan}`),
    env.DB.prepare(`DELETE FROM specs WHERE ${specOrphan}`),
    env.DB.prepare(`DELETE FROM spec_history WHERE ${specOrphan}`),
  ]);
}

function preempted(stats) {
  delete stats.notify;
  delete stats.progress;
  return { ...stats, preempted: true };
}

// ---------- Passe complète ----------
// mode : 'manual' (bouton Actualiser), 'auto' (ouverture de l'appli), 'background' (tâche de fond horaire).
// Verrou « horodatage|instance|mode ». L'application ouverte (manual/auto) reprend la main sur une passe
// de fond ou sur une passe abandonnée (application fermée) ; la tâche de fond, elle, n'interrompt jamais rien.
const INSTANCE = Math.random().toString(36).slice(2, 10);
function parseLock(v) {
  const [ts, owner = '', m = ''] = String(v || '0').split('|');
  return { ts: Number(ts) || 0, owner, mode: m };
}
export async function ownsLock(env, token) {
  return parseLock(await getMeta(env, 'lock')).owner === token;
}

export async function tick(env, { mode = 'auto', budgetMs = 75000, onProgress = null } = {}) {
  const t0 = Date.now();
  const now = t0;
  const cur = parseLock(await getMeta(env, 'lock'));
  const fresh = now - cur.ts < LOCK_MS;
  if (fresh && (mode === 'background' || cur.owner === INSTANCE)) return { skipped: true, reason: 'Une synchronisation est déjà en cours.' };
  const token = `${INSTANCE}-${now}`;
  const stamp = () => setMeta(env, 'lock', `${Date.now()}|${token}|${mode}`);
  await stamp();
  const stats = { mode, sources: [], collected: 0, analyzed: 0, created: 0, updated: 0, ignored: 0, errors: [], notify: [] };
  if (onProgress) stats.progress = ev => { try { onProgress(ev); } catch { /* affichage facultatif */ } };
  try {
    await purgeOrphans(env);
    const topics = await loadTopics(env);
    const byId = Object.fromEntries(topics.map(t => [t.id, t]));
    // La collecte et l'analyse avancent en même temps : chaque carte prête est signalée tout de suite
    // (stats.progress), sans attendre la fin de la lecture de toutes les sources.
    let collecting = true, lost = false;
    const owner = () => ownsLock(env, token);
    const collectRun = collect(env, topics, now, mode === 'manual', stats).finally(() => { collecting = false; });
    const analysisRun = (async () => {
      if (!aiConfigured(env)) return;
      let first = true;
      while (Date.now() - t0 < budgetMs) {
        if (!(await owner())) { lost = true; return; }               // l'application ouverte a pris la main
        await stamp();                                                // la passe est toujours en vie
        await enrich(env, first ? 3 : 6);
        let n;
        try {
          n = await analyze(env, byId, now, stats, owner, first ? 3 : BATCH);   // petit premier lot : première carte plus vite
        } catch (e) {
          stats.errors.push(`Analyse IA : ${e.message}`);
          return;
        }
        if (n === -2) continue;                                       // bascule vers l'IA de secours
        if (n < 0) { lost = true; return; }
        if (n > 0) {
          first = false;
          stats.analyzed += n;
          const pending = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM raw_items WHERE status = 'pending'`).first())?.n || 0;
          stats.progress?.({ phase: 'cards', analyzed: stats.analyzed, created: stats.created, updated: stats.updated, pending });
          continue;
        }
        if (!collecting) return;                                      // plus rien à analyser ni à attendre
        await sleep(1500);                                            // les premiers articles arrivent
      }
    })();
    stats.collected = await collectRun.catch(async e => { await analysisRun.catch(() => {}); throw e; });
    stats.progress?.({ phase: 'analysis' });
    if (!(await owner())) { await analysisRun.catch(() => {}); return preempted(stats); }
    const failed = stats.sources.filter(s => s.status.startsWith('erreur'));
    if (stats.sources.length && failed.length === stats.sources.length && failed.every(s => isNetworkError(s.status))) {
      stats.errors.push(`Collecte : ${NETWORK_MSG}`);
    }
    if (!aiConfigured(env)) stats.errors.push('Aucune clé IA : les articles sont collectés mais pas encore analysés (Réglages).');
    await analysisRun;
    if (lost) return preempted(stats);
    await purgeOrphans(env);                                          // sujet supprimé pendant cette actualisation
    if (mode !== 'background' || Date.now() - t0 < budgetMs) {
      try { stats.sheets = await refreshSheets(env, await loadTopics(env), stats.touched); } catch { /* facultatif */ }
    }
    const { results: aliveT } = await env.DB.prepare('SELECT id FROM topics').all();
    const aliveIds = new Set((aliveT || []).map(r => r.id));
    await sendNotifications(env, stats.notify.filter(n => aliveIds.has(n.topic?.id)));
    const srcErr = stats.sources.filter(s => !s.status.startsWith('ok'));
    if (stats.collected) await setMeta(env, 'last_collect', String(now));
    await setMeta(env, 'last_sync', String(now));
    // Une passe de fond privée de réseau (veille Android) n'efface pas l'état de la dernière passe utile.
    const bgNetOnly = mode === 'background' && stats.errors.length && stats.errors.every(e => e.includes(NETWORK_MSG)) && !stats.analyzed;
    if (!bgNetOnly) await setMeta(env, 'last_error', stats.errors.join(' | '));
    await setMeta(env, 'last_summary', JSON.stringify({
      at: now, mode, topics: stats.collected, sources: stats.sources.length, sourceErrors: srcErr.length,
      newItems: stats.sources.reduce((n, s) => n + (s.inserted || 0), 0),
      analyzed: stats.analyzed, created: stats.created, updated: stats.updated, ignored: stats.ignored, backup: stats.backup || 0,
    }));
  } finally {
    if (await ownsLock(env, token)) await setMeta(env, 'lock', '0');
  }
  stats.pending = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM raw_items WHERE status = 'pending'`).first())?.n || 0;
  delete stats.notify;
  delete stats.progress;
  delete stats.found;
  delete stats.touched;
  return stats;
}
