// Reprise des actualités de l'ancienne application web Find X10 Ultra (Cloudflare), une seule fois.
import { http } from './net.js';
import { hash, normalizeUrl, titleKey } from './rss.js';
import { getMeta, setMeta } from './pipeline.js';
import { PHONE_SPEC_GROUPS } from './topics.js';

export const LEGACY_URL = 'https://find-x10-ultra.link6926.workers.dev';
const TOPIC = 'find-x10-ultra';

async function getJson(base, path) {
  const res = await http(base + path, { headers: { accept: 'application/json' }, timeout: 20000 });
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${path}`);
  return JSON.parse(await res.text());
}

export async function importLegacy(env, base = LEGACY_URL) {
  if (await getMeta(env, 'legacy_import')) return { skipped: true };
  const topic = await env.DB.prepare('SELECT id FROM topics WHERE id = ?').bind(TOPIC).first();
  if (!topic) { await setMeta(env, 'legacy_import', 'sans objet'); return { skipped: true }; }

  const list = await getJson(base, '/api/cards?filter=all&limit=200');
  const now = Date.now();
  let cards = 0;
  for (const c of list.cards || []) {
    const d = await getJson(base, `/api/cards/${encodeURIComponent(c.id)}`);
    const stmts = [env.DB.prepare(
      `INSERT OR IGNORE INTO cards (id, topic_id, category, reliability, title, summary, detail, technical, origin, reliability_reason,
         spec_keys, official_confirmation, contradiction, competitor_brand, competitor_model, competitor_why, competitor_comparison,
         importance, first_seen_at, latest_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(d.id, TOPIC, d.category, d.reliability, d.title, d.summary, d.detail, d.technical, d.origin, d.reliability_reason,
      JSON.stringify(d.spec_keys || []), d.official_confirmation ? 1 : 0, d.contradiction || '', d.competitor_brand || '',
      d.competitor_model || '', d.competitor_why || '', d.competitor_comparison || '', d.importance || 1,
      d.first_seen_at, d.latest_at, d.created_at, d.updated_at)];
    stmts.push(env.DB.prepare('INSERT OR REPLACE INTO card_reads (card_id, read_at) VALUES (?, ?)').bind(d.id, now));
    for (const s of d.sources || []) {
      stmts.push(env.DB.prepare(
        'INSERT OR IGNORE INTO card_sources (card_id, url, title, source_name, lang, published_at, added_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(d.id, s.url, s.title, s.source_name, s.lang, s.published_at, s.added_at));
      // L'article est marqué comme déjà traité : il ne sera pas analysé une seconde fois.
      stmts.push(env.DB.prepare(
        `INSERT OR IGNORE INTO raw_items (id, topic_id, title_key, url, title, snippet, content, source_id, source_name, lang, kind,
           published_at, fetched_at, status, card_id) VALUES (?, ?, ?, ?, ?, '', '', 'import', ?, ?, ?, ?, ?, 'processed', ?)`
      ).bind(await hash(TOPIC + '|' + normalizeUrl(s.url)), TOPIC, await hash(titleKey(s.title || s.url)), s.url, s.title,
        s.source_name, s.lang, d.category, s.published_at, now, d.id));
    }
    for (const h of [...(d.history || [])].reverse()) {
      stmts.push(env.DB.prepare('INSERT INTO card_history (card_id, at, kind, note) VALUES (?, ?, ?, ?)').bind(d.id, h.at, h.kind, h.note));
    }
    stmts.push(env.DB.prepare('INSERT INTO card_history (card_id, at, kind, note) VALUES (?, ?, ?, ?)')
      .bind(d.id, now, 'source', "Reprise depuis l'application web Find X10 Ultra."));
    await env.DB.batch(stmts);
    cards++;
  }

  const sp = await getJson(base, '/api/specs');
  const keys = new Set(PHONE_SPEC_GROUPS.flatMap(g => g.items.map(([k]) => k)));
  const stmts = [];
  for (const g of sp.groups || []) {
    for (const it of g.items || []) {
      if (!keys.has(it.key)) continue;
      if (it.value) {
        stmts.push(env.DB.prepare(
          `INSERT OR REPLACE INTO specs (topic_id, key, value, reliability, card_id, source_url, source_name, source_date, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(TOPIC, it.key, it.value, it.reliability, it.card_id, it.source_url, it.source_name, it.source_date, it.updated_at || now));
      }
      for (const h of it.history || []) {
        stmts.push(env.DB.prepare(
          'INSERT INTO spec_history (topic_id, key, value, reliability, card_id, note, accepted, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(TOPIC, it.key, h.value, h.reliability, h.card_id || null, h.note || '', h.accepted ? 1 : 0, h.at));
      }
    }
  }
  if (stmts.length) await env.DB.batch(stmts);
  await setMeta(env, 'legacy_import', JSON.stringify({ at: now, cards }));
  return { cards };
}
