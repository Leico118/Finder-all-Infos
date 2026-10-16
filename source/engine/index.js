// Moteur local de l'application : mêmes routes que l'ancienne API web, exécutées sur le téléphone.
import { SCHEMA, SCHEMA_VERSION } from './schema.js';
import { setFetch, http } from './net.js';
import { tick, getMeta, setMeta, dayStart, loadTopics, purgeOrphans } from './pipeline.js';
import { aiConfigured, callAI, callGroq, backupConfigured, CLEAN_SYSTEM, cleanUser } from './ai.js';
import { fillSheet, mergeModels, modelTopic, saveTopicConfig, modelSlug } from './sheet.js';
import { searchConfigured, tavily } from './websearch.js';
import { DEFAULT_TOPIC, MAX_TOPICS, TOPIC_SYSTEM, topicUserPrompt, sanitizeConfig, SHEET_SYSTEM, sheetUserPrompt, parseGroups } from './topics.js';
import { SITE_FEEDS, topicFeeds } from './sources.js';
import { importLegacy } from './legacy.js';

const parse = v => { try { return JSON.parse(v); } catch { return null; } };
const ok = (data, status = 200) => ({ status, data });
const fail = (error, status = 400) => ({ status, data: { error } });

const FILTERS = {
  all: '',
  leaks: `c.category = 'target' AND c.reliability != 'official'`,
  official: `c.category = 'target' AND c.reliability = 'official'`,
  competitors: `c.category = 'competitor'`,
};

const UPDATE_REPO = 'Leico118/Finder-all-Infos';

// platform : { DB, fetch, notify, info } fournis par Android (ou par les tests).
export function createEngine(platform) {
  if (platform.fetch) setFetch(platform.fetch);
  const base = { DB: platform.DB, DAILY_HOUR: platform.dailyHour ?? 8, GDELT_DELAY: platform.gdeltDelay, aiRetryDelay: platform.aiRetryDelay };
  let ready = null;

  async function env() {
    if (!ready) ready = init().catch(e => { ready = null; throw e; });
    await ready;
    const { results } = await base.DB.prepare(`SELECT key, value FROM meta WHERE key LIKE 'cfg_%'`).all();
    const c = Object.fromEntries((results || []).map(r => [r.key.slice(4), r.value]));
    return {
      ...base,
      AI_PROVIDER: c.ai_provider || 'gemini',
      GEMINI_API_KEY: c.gemini_key || '',
      ANTHROPIC_API_KEY: c.anthropic_key || '',
      TAVILY_API_KEY: c.tavily_key || '',
      GROQ_API_KEY: c.groq_key || '',
      SHARED: { gemini: c.shared_gemini === '1', tavily: c.shared_tavily === '1', groq: c.shared_groq === '1' },   // clés reçues d'un proche
      AUTO_COLLECT: c.auto_collect !== '0',
      UI_MODE: c.ui_mode === 'simple' || c.ui_mode === 'full' ? c.ui_mode : '',
      DAILY_HOUR: /^\d+$/.test(c.daily_hour || '') && Number(c.daily_hour) < 24 ? Number(c.daily_hour) : base.DAILY_HOUR,
      notify: platform.notify,
    };
  }

  async function init() {
    let version = null;
    try { version = (await base.DB.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).first())?.value; } catch { /* première ouverture */ }
    if (version === SCHEMA_VERSION) return;
    await base.DB.batch(SCHEMA.map(s => base.DB.prepare(s)));
    const now = Date.now();
    await base.DB.prepare('INSERT OR IGNORE INTO topics (id, name, type, config, position, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)')
      .bind(DEFAULT_TOPIC.id, DEFAULT_TOPIC.name, DEFAULT_TOPIC.type, JSON.stringify(DEFAULT_TOPIC.config), now, now).run();
    await base.DB.prepare(`INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)`).bind(SCHEMA_VERSION).run();
  }

  const setCfg = (key, value) => base.DB.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').bind(`cfg_${key}`, value).run();

  // ---------- Lecture ----------
  async function listCards(E, q) {
    const topic = q.get('topic') || '';
    const where = ['c.topic_id IN (SELECT id FROM topics)'];   // jamais de carte d'un sujet supprimé
    const args = [];
    if (topic) { where.push('c.topic_id = ?'); args.push(topic); }
    // « Non lus » se combine avec les autres filtres ; les cartes lues pendant la consultation (depuis « since ») restent affichées.
    if (q.get('filter') === 'unread' || q.get('unread') === '1') {
      const since = Number(q.get('since')) || 0;
      where.push(`(r.read_at IS NULL OR r.read_at < c.updated_at${since ? ' OR r.read_at >= ?' : ''})`);
      if (since) args.push(since);
    }
    const f = FILTERS[q.get('filter')] || '';
    if (f) where.push(f);
    const limit = Math.min(300, Number(q.get('limit')) || 150);
    const { results } = await E.DB.prepare(
      `SELECT c.id, c.topic_id, c.category, c.reliability, c.title, c.summary, c.latest_at, c.first_seen_at, c.created_at, c.updated_at,
              c.importance, c.official_confirmation, c.contradiction, c.competitor_model, r.read_at,
              (SELECT COUNT(*) FROM card_sources s WHERE s.card_id = c.id) AS source_count
       FROM cards c LEFT JOIN card_reads r ON r.card_id = c.id ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY c.latest_at DESC LIMIT ${limit}`).bind(...args).all();
    const cw = topic ? 'WHERE c.topic_id = ?' : 'WHERE c.topic_id IN (SELECT id FROM topics)';
    const counts = await E.DB.prepare(
      `SELECT COUNT(*) AS all_count,
         SUM(CASE WHEN category = 'target' AND reliability != 'official' THEN 1 ELSE 0 END) AS leaks,
         SUM(CASE WHEN category = 'target' AND reliability = 'official' THEN 1 ELSE 0 END) AS official,
         SUM(CASE WHEN category = 'competitor' THEN 1 ELSE 0 END) AS competitors,
         SUM(CASE WHEN r.read_at IS NULL OR r.read_at < c.updated_at THEN 1 ELSE 0 END) AS unread
       FROM cards c LEFT JOIN card_reads r ON r.card_id = c.id ${cw}`).bind(...(topic ? [topic] : [])).first();
    const { results: unreadBy } = await E.DB.prepare(
      `SELECT c.topic_id, COUNT(*) AS n FROM cards c LEFT JOIN card_reads r ON r.card_id = c.id
       WHERE (r.read_at IS NULL OR r.read_at < c.updated_at) AND c.topic_id IN (SELECT id FROM topics) GROUP BY c.topic_id`).all();
    const pending = (await E.DB.prepare(`SELECT COUNT(*) AS n FROM raw_items WHERE status = 'pending'`).first())?.n || 0;
    return ok({
      cards: (results || []).map(c => ({ ...c, unread: !c.read_at || c.read_at < c.updated_at,
        updated_since_read: !!c.read_at && c.read_at < c.updated_at, contradiction: !!c.contradiction })),
      counts: { all: counts?.all_count || 0, leaks: counts?.leaks || 0, official: counts?.official || 0,
        competitors: counts?.competitors || 0, unread: counts?.unread || 0 },
      unread_by_topic: Object.fromEntries((unreadBy || []).map(r => [r.topic_id, r.n])),
      pending,
      last_sync: Number(await getMeta(E, 'last_sync')) || null,
      setup: { ai_configured: aiConfigured(E), search_configured: searchConfigured(E) },
    });
  }

  async function getCard(E, id) {
    const card = await E.DB.prepare('SELECT c.*, r.read_at FROM cards c LEFT JOIN card_reads r ON r.card_id = c.id WHERE c.id = ?').bind(id).first();
    if (!card) return fail('Carte introuvable', 404);
    const topicRow = await E.DB.prepare('SELECT * FROM topics WHERE id = ?').bind(card.topic_id).first();
    const topic = topicRow ? { ...topicRow, config: parse(topicRow.config) || {} } : null;
    const { results: sources } = await E.DB.prepare(
      'SELECT url, title, source_name, lang, published_at, added_at FROM card_sources WHERE card_id = ? ORDER BY published_at ASC').bind(id).all();
    const { results: history } = await E.DB.prepare('SELECT at, kind, note FROM card_history WHERE card_id = ? ORDER BY at DESC, id DESC').bind(id).all();
    const keys = parse(card.spec_keys) || [];
    const labels = Object.fromEntries((topic?.config?.spec_groups || []).flatMap(g => g.items));
    let specs = [];
    if (keys.length) {
      const { results } = await E.DB.prepare(
        `SELECT key, value, reliability FROM specs WHERE topic_id = ? AND key IN (${keys.map(() => '?').join(',')})`).bind(card.topic_id, ...keys).all();
      const byKey = Object.fromEntries((results || []).map(s => [s.key, s]));
      specs = keys.map(k => ({ key: k, label: labels[k] || k, value: byKey[k]?.value || null, reliability: byKey[k]?.reliability || null }));
    }
    return ok({ ...card, spec_keys: keys, specs, sources: sources || [], history: history || [],
      topic: topic ? { id: topic.id, name: topic.name, short: topic.config.short, type: topic.type } : null,
      unread: !card.read_at || card.read_at < card.updated_at });
  }

  // Fiches : technique pour un produit, « repères » pour un sujet général ; tous les sujets en ont une (ou peuvent en avoir une).
  async function getSpecs(E, q) {
    const topics = await loadTopics(E);
    const topic = topics.find(t => t.id === q.get('topic')) || topics.find(t => (t.config.spec_groups || []).length) || topics[0];
    const list = topics.map(t => ({ id: t.id, name: t.name, short: t.config.short, type: t.type, has_sheet: (t.config.spec_groups || []).length > 0 }));
    if (!topic) return ok({ topics: [], topic: null, groups: [], known: 0, total: 0 });
    const { results: counts } = await E.DB.prepare(
      `SELECT topic_id, COUNT(*) AS n, MAX(updated_at) AS at FROM specs WHERE topic_id = ? OR topic_id LIKE ? || '~%' GROUP BY topic_id`).bind(topic.id, topic.id).all();
    const cnt = Object.fromEntries((counts || []).map(r => [r.topic_id, r]));
    const size = groups => (groups || []).reduce((n, g) => n + g.items.length, 0);
    const models = (topic.config.models || []).map(m => ({ id: m.id, name: m.name, kind: m.kind, has_sheet: (m.groups || []).length > 0,
      known: cnt[`${topic.id}~${m.id}`]?.n || 0, total: size(m.groups), updated_at: cnt[`${topic.id}~${m.id}`]?.at || null }));
    const main = { known: cnt[topic.id]?.n || 0, total: size(topic.config.spec_groups), updated_at: cnt[topic.id]?.at || null };
    const model = (topic.config.models || []).find(m => m.id === q.get('model') && (m.groups || []).length) || null;
    const sheet = model ? modelTopic(topic, model) : topic;
    const cardsN = (await E.DB.prepare('SELECT COUNT(*) AS n FROM cards WHERE topic_id = ?').bind(topic.id).first())?.n || 0;
    const { results: specs } = await E.DB.prepare('SELECT * FROM specs WHERE topic_id = ?').bind(sheet.id).all();
    const { results: hist } = await E.DB.prepare(
      'SELECT key, value, reliability, note, accepted, at, card_id FROM spec_history WHERE topic_id = ? ORDER BY at DESC LIMIT 400').bind(sheet.id).all();
    const byKey = Object.fromEntries((specs || []).map(s => [s.key, s]));
    const histByKey = {};
    for (const h of hist || []) (histByKey[h.key] ||= []).push(h);
    const groups = (sheet.config.spec_groups || []).map((g, i) => ({
      id: `g${i}`, label: g.label,
      items: g.items.map(([key, label]) => {
        const s = byKey[key];
        return { key, label, value: s?.value || null, reliability: s?.reliability || null, card_id: s?.card_id || null,
          source_url: s?.source_url || null, source_name: s?.source_name || null, source_date: s?.source_date || null,
          updated_at: s?.updated_at || null, history: (histByKey[key] || []).slice(0, 8) };
      }),
    }));
    const total = groups.reduce((n, g) => n + g.items.length, 0);
    const known = groups.reduce((n, g) => n + g.items.filter(i => i.value).length, 0);
    return ok({ topics: list, topic: { id: topic.id, name: topic.name, type: topic.type, cards: cardsN, focus: topic.config.focus || '' },
      model: model ? { id: model.id, name: model.name, kind: model.kind } : null, models, main, groups, known, total,
      updated_at: (model ? models.find(x => x.id === model.id)?.updated_at : main.updated_at) || null,
      filled_at: Number(await getMeta(E, `sheet_fill_${sheet.id}`)) || null });
  }

  // Crée la fiche d'un sujet qui n'en a pas (ou la refait), puis la remplit avec les actualités déjà trouvées.
  async function buildSheet(E, id, body) {
    const row = await E.DB.prepare('SELECT * FROM topics WHERE id = ?').bind(id).first();
    if (!row) return fail('Sujet introuvable', 404);
    if (!aiConfigured(E)) return fail("Ajoutez d'abord votre clé Gemini.");
    const topic = { ...row, config: parse(row.config) || {} };
    if (!(topic.config.spec_groups || []).length || body?.regenerate) {
      let raw;
      try { raw = await callAI({ ...E, aiTimeout: 45000 }, SHEET_SYSTEM, sheetUserPrompt(topic)); }
      catch (e) { return fail(`L'IA n'a pas pu préparer la fiche : ${e.message}`, 502); }
      const groups = parseGroups(raw?.spec_groups, topic.type);
      if (!groups.length) return fail('L\'IA n\'a pas proposé de fiche exploitable, réessayez.', 502);
      topic.config.spec_groups = groups;
      await E.DB.prepare('UPDATE topics SET config = ?, updated_at = ? WHERE id = ?').bind(JSON.stringify(topic.config), Date.now(), id).run();
    }
    return sheetResult(E, topic);
  }

  async function sheetResult(E, topic, opts) {
    try { return ok({ ok: true, ...(await fillSheet(E, topic, opts)) }); }
    catch (e) { return fail(`Fiche prête, mais le remplissage a échoué : ${e.message}`, 502); }
  }

  // Fiche technique d'un modèle repéré dans un sujet général (ex. « Fairphone 6 » dans « Fairphone »).
  async function buildModelSheet(E, id, mid, body) {
    const topic = (await loadTopics(E)).find(t => t.id === id);
    if (!topic) return fail('Sujet introuvable', 404);
    if (!aiConfigured(E)) return fail("Ajoutez d'abord votre clé Gemini.");
    const model = (topic.config.models || []).find(m => m.id === mid);
    if (!model) return fail('Modèle introuvable', 404);
    if (!(model.groups || []).length || body?.regenerate) {
      let raw;
      try { raw = await callAI({ ...E, aiTimeout: 45000 }, SHEET_SYSTEM, sheetUserPrompt({ name: model.name, type: 'product', config: { description: `${model.kind || 'produit'} de ${topic.name}` } })); }
      catch (e) { return fail(`L'IA n'a pas pu préparer la fiche : ${e.message}`, 502); }
      const groups = parseGroups(raw?.spec_groups, 'product');
      if (!groups.length) return fail('L\'IA n\'a pas proposé de fiche exploitable, réessayez.', 502);
      model.groups = groups;
      await saveTopicConfig(E, topic);
    }
    return sheetResult(E, topic, { model });
  }

  async function addModel(E, id, body) {
    const topic = (await loadTopics(E)).find(t => t.id === id);
    if (!topic) return fail('Sujet introuvable', 404);
    const name = String(body?.name || '').trim().slice(0, 60);
    if (name.length < 2) return fail('Tapez le nom du modèle.');
    const mid = modelSlug(name);
    const twin = (topic.config.models || []).find(m => m.id === mid);
    if (twin) return fail(`« ${twin.name} » est déjà dans la liste.`, 409);
    if ((topic.config.models || []).length >= 12) return fail('12 modèles au maximum : retirez-en un d\'abord.');
    await mergeModels(E, topic, [{ name, kind: '' }]);
    return ok({ ok: true, model: { id: mid, name }, models: topic.config.models });
  }

  async function removeModel(E, id, mid) {
    const topic = (await loadTopics(E)).find(t => t.id === id);
    if (!topic) return fail('Sujet introuvable', 404);
    topic.config.models = (topic.config.models || []).filter(m => m.id !== mid);
    await saveTopicConfig(E, topic);
    await E.DB.batch([`${id}~${mid}`].flatMap(sid => [
      E.DB.prepare('DELETE FROM specs WHERE topic_id = ?').bind(sid), E.DB.prepare('DELETE FROM spec_history WHERE topic_id = ?').bind(sid)]));
    return ok({ ok: true });
  }

  // Retire les actualités déjà trouvées qui sortent de « ce qui m'intéresse ».
  async function cleanTopic(E, id) {
    const topic = (await loadTopics(E)).find(t => t.id === id);
    if (!topic) return fail('Sujet introuvable', 404);
    if (!topic.config.focus) return fail('Indiquez d\'abord ce qui vous intéresse dans ce sujet.');
    if (!aiConfigured(E)) return fail("Ajoutez d'abord votre clé Gemini.");
    const { results: cards } = await E.DB.prepare('SELECT id, title, summary FROM cards WHERE topic_id = ? ORDER BY latest_at DESC LIMIT 120').bind(id).all();
    if (!cards?.length) return ok({ removed: 0 });
    let out;
    try { out = await callAI({ ...E, aiTimeout: 60000 }, CLEAN_SYSTEM, cleanUser(topic, topic.config.focus, cards)); }
    catch (e) { return fail(`Tri impossible : ${e.message}`, 502); }
    const ids = new Set(cards.map(c => c.id));
    const remove = (Array.isArray(out?.remove) ? out.remove : []).map(String).filter(x => ids.has(x));
    if (remove.length) {
      await E.DB.batch(remove.flatMap(cid => [
        E.DB.prepare('DELETE FROM card_sources WHERE card_id = ?').bind(cid),
        E.DB.prepare('DELETE FROM card_history WHERE card_id = ?').bind(cid),
        E.DB.prepare('DELETE FROM card_reads WHERE card_id = ?').bind(cid),
        E.DB.prepare('UPDATE specs SET card_id = NULL WHERE card_id = ?').bind(cid),
        E.DB.prepare('DELETE FROM cards WHERE id = ? AND topic_id = ?').bind(cid, id),
      ]));
    }
    return ok({ removed: remove.length });
  }

  async function getStatus(E) {
    const topics = await loadTopics(E);
    const { results: states } = await E.DB.prepare('SELECT * FROM source_state').all();
    const byId = Object.fromEntries((states || []).map(s => [s.id, s]));
    const { results: ts } = await E.DB.prepare('SELECT * FROM topic_state').all();
    const tsBy = Object.fromEntries((ts || []).map(s => [s.topic_id, s]));
    const pending = (await E.DB.prepare(`SELECT COUNT(*) AS n FROM raw_items WHERE status = 'pending'`).first())?.n || 0;
    const sourceRow = s => ({ id: s.id, name: s.name, lang: s.lang, last_fetched: byId[s.id]?.last_fetched || null,
      last_ok: byId[s.id]?.last_ok || null, last_status: byId[s.id]?.last_status || 'pas encore interrogée' });
    const groups = topics.map(t => ({
      id: t.id, name: t.config.short || t.name,
      sources: [...topicFeeds(t), { id: `t:${t.id}:web`, name: 'Recherche web (Tavily)', lang: 'multi' }].map(sourceRow),
      last_collect: tsBy[t.id]?.last_collect || null,
    }));
    if (topics.some(t => t.config.tech)) groups.push({ id: 'sites', name: 'Sites spécialisés (sujets tech)', sources: SITE_FEEDS.map(sourceRow) });
    const nextStart = dayStart(E) + 86400000;
    return ok({
      last_sync: Number(await getMeta(E, 'last_sync')) || null,
      last_collect: Number(await getMeta(E, 'last_collect')) || null,
      next_collect: nextStart,
      last_error: (await getMeta(E, 'last_error')) || '',
      last_summary: parse(await getMeta(E, 'last_summary')),
      legacy: parse(await getMeta(E, 'legacy_import')),
      pending,
      ai: { configured: aiConfigured(E), provider: E.AI_PROVIDER, backup: backupConfigured(E) },
      keys_received: E.SHARED,
      can_share: aiConfigured(E) && !E.SHARED.gemini,
      search: { configured: searchConfigured(E) },
      notify_enabled: (await getMeta(E, 'notify_enabled')) !== '0',
      auto_collect: E.AUTO_COLLECT,
      ui_mode: E.UI_MODE,
      daily_hour: E.DAILY_HOUR,
      device: platform.info ? await platform.info() : null,
      source_groups: groups,
    });
  }

  // ---------- Sujets ----------
  async function listTopics(E) {
    const topics = await loadTopics(E);
    const { results } = await E.DB.prepare('SELECT topic_id, COUNT(*) AS n FROM cards GROUP BY topic_id').all();
    const counts = Object.fromEntries((results || []).map(r => [r.topic_id, r.n]));
    const { results: ts } = await E.DB.prepare('SELECT * FROM topic_state').all();
    const tsBy = Object.fromEntries((ts || []).map(s => [s.topic_id, s]));
    return ok({ topics: topics.map(t => ({ id: t.id, name: t.name, type: t.type, short: t.config.short, description: t.config.description,
      match: t.config.match, exclude: t.config.exclude, rivals: t.config.rivals, queries: t.config.queries, web_queries: t.config.web_queries,
      tech: !!t.config.tech, spec_groups: t.config.spec_groups, focus: t.config.focus || '', models: (t.config.models || []).map(m => m.name), cards: counts[t.id] || 0, last_collect: tsBy[t.id]?.last_collect || null })),
      max: MAX_TOPICS });
  }

  // Une seule création à la fois par texte : un second appui (ou un écran rouvert) reçoit le même résultat.
  const creating = new Map();
  function createTopic(E, body) {
    const key = String(body?.text || '').trim().toLowerCase();
    if (!creating.has(key)) creating.set(key, doCreateTopic(E, body).finally(() => creating.delete(key)));
    return creating.get(key);
  }

  async function doCreateTopic(E, body) {
    const text = String(body?.text || '').trim().slice(0, 80);
    if (text.length < 2) return fail('Tapez au moins deux caractères.');
    const topics = await loadTopics(E);
    if (topics.length >= MAX_TOPICS) return fail(`Vous suivez déjà ${MAX_TOPICS} sujets : supprimez-en un d'abord.`);
    if (!aiConfigured(E)) return fail("Ajoutez d'abord votre clé Gemini (Réglages → Intelligence artificielle).");
    let raw;
    try { raw = await callAI({ ...E, aiTimeout: 45000 }, TOPIC_SYSTEM, topicUserPrompt(text)); }
    catch (e) { return fail(`L'IA n'a pas pu préparer ce sujet : ${e.message}`, 502); }
    const t = sanitizeConfig(raw, text);
    const now = Date.now();
    // Liste relue après la réponse de l'IA (qui prend du temps) : un sujet identique vient peut-être d'être créé.
    const current = await loadTopics(E);
    const twin = current.find(x => x.name.toLowerCase() === t.name.toLowerCase() && now - (x.created_at || 0) < 15 * 60000);
    if (twin) return ok({ topic: { id: twin.id, name: twin.name, type: twin.type, ...twin.config }, existing: true });
    if (current.length >= MAX_TOPICS) return fail(`Vous suivez déjà ${MAX_TOPICS} sujets : supprimez-en un d'abord.`);
    let id = t.id, n = 2;
    while (current.some(x => x.id === id)) id = `${t.id}-${n++}`;
    await E.DB.prepare('INSERT OR IGNORE INTO topics (id, name, type, config, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(id, t.name, t.type, JSON.stringify(t.config), current.length, now, now).run();
    return ok({ topic: { id, name: t.name, type: t.type, ...t.config } });
  }

  async function updateTopic(E, id, body) {
    const row = await E.DB.prepare('SELECT * FROM topics WHERE id = ?').bind(id).first();
    if (!row) return fail('Sujet introuvable', 404);
    const config = parse(row.config) || {};
    const list = v => String(v || '').split(/[,\n;]/).map(s => s.trim()).filter(Boolean).slice(0, 12);
    const name = typeof body?.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 60) : row.name;
    if (typeof body?.short === 'string' && body.short.trim()) config.short = body.short.trim().slice(0, 30);
    if (body?.match !== undefined) { const m = list(body.match); if (m.length) config.match = m; }
    if (body?.exclude !== undefined) config.exclude = list(body.exclude);
    if (body?.rivals !== undefined) config.rivals = list(body.rivals);
    if (typeof body?.focus === 'string') config.focus = body.focus.trim().slice(0, 240);
    const type = body?.type === 'product' || body?.type === 'general' ? body.type : row.type;
    if (type === 'product' && !(config.spec_groups || []).length) config.spec_groups = [];
    await E.DB.prepare('UPDATE topics SET name = ?, type = ?, config = ?, updated_at = ? WHERE id = ?')
      .bind(name, type, JSON.stringify(config), Date.now(), id).run();
    return ok({ ok: true });
  }

  async function deleteTopic(E, id) {
    const stmts = [
      E.DB.prepare('DELETE FROM card_sources WHERE card_id IN (SELECT id FROM cards WHERE topic_id = ?)').bind(id),
      E.DB.prepare('DELETE FROM card_history WHERE card_id IN (SELECT id FROM cards WHERE topic_id = ?)').bind(id),
      E.DB.prepare('DELETE FROM card_reads WHERE card_id IN (SELECT id FROM cards WHERE topic_id = ?)').bind(id),
      E.DB.prepare('DELETE FROM cards WHERE topic_id = ?').bind(id),
      E.DB.prepare('DELETE FROM raw_items WHERE topic_id = ?').bind(id),
      E.DB.prepare(`DELETE FROM specs WHERE topic_id = ? OR topic_id LIKE ? || '~%'`).bind(id, id),
      E.DB.prepare(`DELETE FROM spec_history WHERE topic_id = ? OR topic_id LIKE ? || '~%'`).bind(id, id),
      E.DB.prepare('DELETE FROM topic_state WHERE topic_id = ?').bind(id),
      E.DB.prepare('DELETE FROM source_state WHERE topic_id = ?').bind(id),
      E.DB.prepare('DELETE FROM topics WHERE id = ?').bind(id),
    ];
    await E.DB.batch(stmts);
    await purgeOrphans(E);
    return ok({ ok: true });
  }

  // ---------- Réglages ----------
  async function setup(E, body) {
    const result = { ok: true };
    if (body?.notify !== undefined) await setMeta(E, 'notify_enabled', body.notify ? '1' : '0');
    if (body?.ui_mode === 'simple' || body?.ui_mode === 'full') await setCfg('ui_mode', body.ui_mode);
    if (body?.auto_collect !== undefined) await setCfg('auto_collect', body.auto_collect ? '1' : '0');
    if (body?.daily_hour !== undefined) {
      const h = Number(body.daily_hour);
      if (!Number.isInteger(h) || h < 0 || h > 23) return fail('Heure invalide (0 à 23).');
      await setCfg('daily_hour', String(h));
      try { await platform.setDailyHour?.(h); } catch { /* reprogrammation facultative */ }
      result.daily_hour = h;
    }
    const skey = String(body?.search_key || '').trim();
    if (skey) {
      try { await tavily({ TAVILY_API_KEY: skey }, { query: 'actualités', max_results: 1 }); }
      catch (e) { return fail(`Clé Tavily refusée : ${e.message.slice(0, 160)}`); }
      await setCfg('tavily_key', skey);
      await setCfg('shared_tavily', '0');
      result.search_ok = true;
    }
    const bkey = String(body?.backup_key || '').trim();
    if (bkey) {
      try {
        const out = await callGroq({ ...E, GROQ_API_KEY: bkey, aiTimeout: 30000 }, 'Tu réponds uniquement en JSON.', 'Réponds exactement {"ok": true}');
        if (!out || out.ok !== true) throw new Error('réponse inattendue');
      } catch (e) { return fail(`Clé Groq refusée : ${e.message.slice(0, 200)}`); }
      await setCfg('groq_key', bkey);
      await setCfg('shared_groq', '0');
      result.backup_ok = true;
    }
    const key = String(body?.ai_key || '').trim();
    if (key) {
      const p = body?.ai_provider === 'anthropic' ? 'anthropic' : 'gemini';
      const testEnv = { ...E, AI_PROVIDER: p, aiTimeout: 30000, [p === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'GEMINI_API_KEY']: key };
      try {
        const out = await callAI(testEnv, 'Tu réponds uniquement en JSON.', 'Réponds exactement {"ok": true}', { primaryOnly: true });
        if (!out || out.ok !== true) throw new Error('réponse inattendue');
      } catch (e) { return fail(`Clé refusée par ${p === 'anthropic' ? 'Anthropic' : 'Google'} : ${e.message.slice(0, 200)}`); }
      await setCfg(p === 'anthropic' ? 'anthropic_key' : 'gemini_key', key);
      await setCfg('ai_provider', p);
      if (p === 'gemini') await setCfg('shared_gemini', '0');
      result.ai_ok = true;
      // L'ancien message « Aucune clé IA » ne doit pas rester affiché une fois la clé enregistrée.
      const last = (await getMeta(E, 'last_error')) || '';
      if (last.includes('Aucune clé IA')) await setMeta(E, 'last_error', last.split(' | ').filter(x => !x.includes('Aucune clé IA')).join(' | '));
    }
    return ok(result);
  }

  async function refresh(E, q, ctx = {}) {
    const mode = ['auto', 'manual', 'background'].includes(q.get('mode')) ? q.get('mode') : 'manual';
    if (mode === 'background' && !E.AUTO_COLLECT) return ok({ skipped: true, reason: 'Collecte automatique désactivée dans les réglages.' });
    if (!(await getMeta(E, 'legacy_import'))) {
      try { await importLegacy(E); } catch (e) { /* nouvel essai à la prochaine passe */ }
    }
    const budget = mode === 'background' ? 8 * 60000 : 75000;
    const r = await tick(E, { mode, budgetMs: Number(q.get('budget')) || budget, onProgress: ctx.onProgress });
    return ok(r, r.skipped ? 409 : 200);
  }

  // ---------- Installer Radar chez un proche : les clés passent d'un téléphone à l'autre ----------
  const b64 = str => btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unb64 = s => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));
  async function shareCode(E) {
    if (!aiConfigured(E) || E.AI_PROVIDER !== 'gemini') return fail('Ajoutez d\'abord votre clé Gemini.');
    // Une clé reçue d'un proche ne peut pas être transmise à nouveau : seul son propriétaire la partage.
    if (E.SHARED.gemini) return fail('Les clés de ce téléphone ont été reçues d\'un proche : elles ne peuvent pas être partagées à nouveau.', 403);
    const own = { g: E.GEMINI_API_KEY };
    if (E.TAVILY_API_KEY && !E.SHARED.tavily) own.t = E.TAVILY_API_KEY;
    if (E.GROQ_API_KEY && !E.SHARED.groq) own.q = E.GROQ_API_KEY;
    return ok({ code: `RADAR1:${b64(JSON.stringify(own))}`, search: !!own.t, backup: !!own.q });
  }
  async function importCode(E, body) {
    const m = String(body?.code || '').match(/RADAR1:([A-Za-z0-9_-]{10,})/);
    if (!m) return fail('Ce n\'est pas un code Radar. Sur l\'autre téléphone : Réglages → Installer Radar chez un proche.');
    let data;
    try { data = JSON.parse(unb64(m[1])); } catch { return fail('Code Radar incomplet : recopiez-le en entier.'); }
    if (!data?.g) return fail('Code Radar incomplet : recopiez-le en entier.');
    const r = await setup(E, { ai_provider: 'gemini', ai_key: data.g });             // clé Gemini vérifiée
    if (r.status >= 400) return r;
    await setCfg('shared_gemini', '1');
    let search_ok = false;
    if (data.t) { const r2 = await setup(E, { search_key: data.t }); search_ok = r2.status < 400; if (search_ok) await setCfg('shared_tavily', '1'); }
    let backup_ok = false;
    if (data.q) { const r3 = await setup(E, { backup_key: data.q }); backup_ok = r3.status < 400; if (backup_ok) await setCfg('shared_groq', '1'); }
    return ok({ ok: true, ai_ok: true, search_ok, backup_ok });
  }

  // ---------- Mise à jour de l'application (dernière version publiée sur GitHub) ----------
  const cmpVersion = (a, b) => {
    const x = String(a).replace(/^v/, '').split('.').map(Number), y = String(b).replace(/^v/, '').split('.').map(Number);
    for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return Math.sign(d); }
    return 0;
  };
  async function checkUpdate() {
    const device = platform.info ? await platform.info() : null;
    const current = device?.version || '';
    const res = await http(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'Radar-Android' }, timeout: 20000 });
    if (!res.ok) return fail(`GitHub ne répond pas (${res.status})`, 502);
    let rel;
    try { rel = JSON.parse(await res.text()); } catch { return fail('réponse de GitHub illisible, réessayez plus tard', 502); }
    const asset = (rel.assets || []).find(a => a.name === 'Radar.apk') || (rel.assets || []).find(a => /\.apk$/.test(a.name));
    const latest = String(rel.tag_name || '').replace(/^v/, '');
    return ok({ current, latest, available: !!(asset && current && latest && cmpVersion(latest, current) > 0),
      url: asset?.browser_download_url || null, size: asset?.size || null, published_at: rel.published_at || null });
  }

  // ---------- Routeur ----------
  // ctx.onProgress (facultatif) : avancement de l'actualisation, pour afficher les cartes au fur et à mesure.
  async function handle(method, path, body, ctx = {}) {
    const url = new URL(path, 'https://radar.local');
    const p = decodeURIComponent(url.pathname).replace(/\/+$/, '');
    const q = url.searchParams;
    try {
      const E = await env();
      let m;
      if (method === 'GET' && p === '/api/cards') return await listCards(E, q);
      if (method === 'GET' && (m = p.match(/^\/api\/cards\/([\w-]+)$/))) return await getCard(E, m[1]);
      if (method === 'POST' && (m = p.match(/^\/api\/cards\/([\w-]+)\/read$/))) {
        await E.DB.prepare('INSERT OR REPLACE INTO card_reads (card_id, read_at) VALUES (?, ?)').bind(m[1], Date.now()).run();
        return ok({ ok: true });
      }
      if (method === 'POST' && p === '/api/read-all') {
        const t = q.get('topic');
        await E.DB.prepare(`INSERT OR REPLACE INTO card_reads (card_id, read_at) SELECT id, ? FROM cards ${t ? 'WHERE topic_id = ?' : ''}`)
          .bind(Date.now(), ...(t ? [t] : [])).run();
        return ok({ ok: true });
      }
      if (method === 'GET' && p === '/api/specs') return await getSpecs(E, q);
      if (method === 'GET' && p === '/api/status') return await getStatus(E);
      if (method === 'GET' && p === '/api/topics') return await listTopics(E);
      if (method === 'POST' && p === '/api/topics') return await createTopic(E, body);
      if (method === 'PUT' && (m = p.match(/^\/api\/topics\/([\w一-鿿-]+)$/))) return await updateTopic(E, m[1], body);
      if (method === 'DELETE' && (m = p.match(/^\/api\/topics\/([\w一-鿿-]+)$/))) return await deleteTopic(E, m[1]);
      if (method === 'POST' && (m = p.match(/^\/api\/topics\/([\w一-鿿-]+)\/sheet$/))) return await buildSheet(E, m[1], body);
      if (method === 'POST' && (m = p.match(/^\/api\/topics\/([\w一-鿿-]+)\/models\/([\w-]+)\/sheet$/))) return await buildModelSheet(E, m[1], m[2], body);
      if (method === 'POST' && (m = p.match(/^\/api\/topics\/([\w一-鿿-]+)\/models$/))) return await addModel(E, m[1], body);
      if (method === 'DELETE' && (m = p.match(/^\/api\/topics\/([\w一-鿿-]+)\/models\/([\w-]+)$/))) return await removeModel(E, m[1], m[2]);
      if (method === 'POST' && (m = p.match(/^\/api\/topics\/([\w一-鿿-]+)\/clean$/))) return await cleanTopic(E, m[1]);
      if (method === 'POST' && p === '/api/setup') return await setup(E, body);
      if (method === 'POST' && p === '/api/refresh') return await refresh(E, q, ctx);
      if (method === 'GET' && p === '/api/update') return await checkUpdate();
      if (method === 'GET' && p === '/api/share-code') return await shareCode(E);
      if (method === 'POST' && p === '/api/import-code') return await importCode(await env(), body);
      return fail('Route inconnue', 404);
    } catch (e) {
      return fail(e.message || String(e), 500);
    }
  }

  return { handle, tick: opts => env().then(E => tick(E, opts)), importLegacy: () => env().then(E => importLegacy(E)) };
}
