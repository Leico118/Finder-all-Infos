// Vérifie le chemin « téléphone » : native.js (pont Android simulé) → moteur → SQLite, réseau par le pont.
import { makeBridge } from './bridge.mjs';

const b = makeBridge();
const log = [];
globalThis.window = globalThis;
window.RadarBridge = {
  sql: (s, p, m) => b.sql(s, p, m),
  batch: j => b.batch(j),
  http(id, reqJson) {
    const req = JSON.parse(reqJson);
    log.push(req);
    setTimeout(() => {
      let res;
      if (req.url.includes('generativelanguage') && globalThis.__busy) res = { status: req.url.includes('2.5-flash-lite') ? 404 : 503, url: req.url, headers: {}, body: '{"error":{"code":503,"message":"The model is overloaded"}}' };
      else if (req.url.includes('generativelanguage') && globalThis.__offline) res = { error: 'UnknownHostException : Unable to resolve host "generativelanguage.googleapis.com": No address associated with hostname' };
      else if (req.url.includes('generativelanguage')) {
        if (globalThis.__deleteDuring) { const id = globalThis.__deleteDuring; globalThis.__deleteDuring = null; b.db.prepare('DELETE FROM topics WHERE id = ?').run(id); }
        if (globalThis.__steal) b.db.prepare(`UPDATE meta SET value='${Date.now()}|appli-ouverte|manual' WHERE key='lock'`).run();
        res = { status: 200, url: req.url, headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"ok": true}' }] } }] }) };
      } else if (req.url.includes('api.groq.com') && req.url.endsWith('/models')) {
        globalThis.__groqCalls = (globalThis.__groqCalls || 0) + 1;
        res = { status: 200, url: req.url, headers: {}, body: JSON.stringify({ data: [{ id: 'whisper-large-v3' }, { id: 'llama-3.1-8b-instant' }, { id: 'openai/gpt-oss-120b' }] }) };
      } else if (req.url.includes('api.groq.com')) {
        globalThis.__groqCalls = (globalThis.__groqCalls || 0) + 1;
        const bodyG = JSON.parse(req.body);
        globalThis.__groqModel = bodyG.model; globalThis.__groqUser = bodyG.messages[1].content;
        res = req.headers.authorization === 'Bearer gsk_BAD' ? { status: 401, url: req.url, headers: {}, body: '{"error":{"message":"Invalid API Key"}}' }
          : { status: 200, url: req.url, headers: {}, body: JSON.stringify({ choices: [{ message: { content: '{"ok": true}' } }] }) };
      } else if (req.url.includes('api.github.com')) {
        res = { status: 200, url: req.url, headers: {}, body: JSON.stringify({ tag_name: 'v1.0.9', published_at: '2026-10-15T15:00:00Z',
          assets: [{ name: 'Radar-v1.0.9.apk', browser_download_url: 'https://x/v.apk' }, { name: 'Radar.apk', browser_download_url: 'https://github.com/Leico118/Finder-all-Infos/releases/download/v1.0.9/Radar.apk', size: 7000000 }] }) };
      } else if (req.url.includes('api.tavily.com')) res = { status: 200, url: req.url, headers: {}, body: '{"results":[]}' };
      else if (req.url.includes('workers.dev')) res = { error: 'UnknownHostException : pas de réseau' };
      else res = { status: 200, url: req.url, headers: {}, body: '<rss><channel></channel></rss>' };
      window.__radarHttp(id, JSON.stringify(res));
    }, 5);
  },
  setDailyHour(h) { globalThis.__hour = h; },
  notify() {}, info: () => JSON.stringify({ platform: 'android', version: '1.0.0', notifications: false, batteryExempt: false }),
  requestNotifications() {}, requestBatteryExemption() {}, openUrl() {}, done() {},
};
const { api } = await import('../web/src/api.js');
let ok = 0, ko = 0;
const assert = (c, m) => { c ? ok++ : ko++; console.log(c ? 'ok -' : 'ÉCHEC:', m); };

const t = await api.topics();
assert(t.topics[0].id === 'find-x10-ultra', 'lecture via le pont natif');
const s = await api.setup({ ai_key: 'AIzaTEST' });
assert(s.ai_ok && log.at(-1).method === 'POST' && JSON.parse(log.at(-1).body).contents, 'requête Gemini passée par le pont (POST + corps JSON)');
assert(log.at(-1).headers['x-goog-api-key'] === 'AIzaTEST' && log.at(-1).timeout === 30000, 'en-têtes et délai transmis au code natif');
const r = await api.refresh('manual');
assert(r.collected === 1 && r.sources.length > 10, `collecte complète via le pont (${r.sources.length} sources)`);
assert(log.some(x => x.url.includes('news.google.com/rss/search')) && log.some(x => x.url.includes('bing.com/news')), 'Google Actualités et Bing interrogés depuis le téléphone');
const n0 = log.filter(x => x.url.includes('api.tavily.com')).length;
await api.setup({ search_key: 'tvly-TEST-1234567890' });
const r2 = await api.refresh('auto');
const tv = log.filter(x => x.url.includes('api.tavily.com')).length - n0;
assert(r2.collected === 0 && tv > 2, `clé Tavily ajoutée en cours de journée : recherche web lancée au passage suivant (${tv - 1} requêtes)`);
b.db.prepare(`INSERT INTO raw_items (id, topic_id, title_key, url, title, snippet, content, source_id, source_name, lang, kind, published_at, fetched_at, status) VALUES ('n1','find-x10-ultra','k1','https://x/1','Find X10 Ultra test','s','', 'x','x','en','target',1,1,'pending')`).run();
globalThis.__offline = true;
b.db.prepare("UPDATE meta SET value='0' WHERE key='lock'").run();
const r3 = await api.refresh('auto');
const row = b.db.prepare("SELECT status, attempts FROM raw_items WHERE id='n1'").get();
assert(row.status === 'pending' && Number(row.attempts) === 0 && /pas de connexion Internet/.test(r3.errors.join(' ')), 'coupure réseau : article gardé en attente, message clair');
globalThis.__offline = false;
// Verrous : l'application ouverte reprend la main ; la tâche de fond n'interrompt rien.
b.db.prepare(`UPDATE meta SET value='${Date.now()}|fond-123|background' WHERE key='lock'`).run();
let r4; try { r4 = await api.refresh('auto'); } catch (e) { r4 = e; }
assert(r4 && !r4.status && Array.isArray(r4.errors), 'passe de fond en cours : l\'appli ouverte prend la main sans attendre');
b.db.prepare(`UPDATE meta SET value='${Date.now()}|appli-ouverte|manual' WHERE key='lock'`).run();
let r5; try { r5 = await api.refresh('background'); } catch (e) { r5 = e; }
assert(r5.status === 409, 'tâche de fond : n\'interrompt pas l\'appli ouverte');
b.db.prepare("UPDATE meta SET value='0' WHERE key='lock'").run();
b.db.prepare("UPDATE raw_items SET status='pending', attempts=0 WHERE id='n1'").run();
globalThis.__steal = true;
const r6 = await api.refresh('background');
globalThis.__steal = false;
const row6 = b.db.prepare("SELECT status FROM raw_items WHERE id='n1'").get();
const lock6 = b.db.prepare("SELECT value FROM meta WHERE key='lock'").get().value;
assert(r6.preempted && row6.status === 'pending' && lock6.includes('appli-ouverte'), 'passe de fond reprise par l\'appli : s\'arrête sans rien appliquer ni libérer le verrou');
// Affichage progressif : le premier lot analysé est signalé avant la fin de la lecture des sources
b.db.prepare(`INSERT OR REPLACE INTO raw_items (id, topic_id, title_key, url, title, snippet, content, source_id, source_name, lang, kind, published_at, fetched_at, status) VALUES ('p1','find-x10-ultra','kp1','https://x/p1','Find X10 Ultra progressif','s','', 'x','x','en','target',1,1,'pending')`).run();
b.db.prepare("UPDATE meta SET value='0' WHERE key='lock'").run();
const events = [];
const rp = await api.refresh('manual', ev => events.push(ev));
const firstCards = events.findIndex(e => e.phase === 'cards');
const collectEnd = events.findIndex(e => e.phase === 'collect' && e.done === e.total && e.total > 0);
assert(firstCards >= 0 && collectEnd > firstCards && rp.analyzed >= 1, `résultat signalé pendant la collecte (événement ${firstCards} avant la fin de lecture ${collectEnd})`);
assert(events.some(e => e.phase === 'collect' && e.done > 0 && e.done < e.total), 'avancement de la lecture des sources signalé');
// Sujet supprimé pendant l'actualisation : aucune carte orpheline
b.db.prepare(`INSERT INTO cards (id, topic_id, category, reliability, title, summary, latest_at, first_seen_at, created_at, updated_at) VALUES ('ghost1','ancien-sujet','target','rumor','Tears of the Kingdom sur PC','x',5,5,5,5)`).run();
const listed = (await api.cards('all')).cards.map(c => c.id);
assert(!listed.includes('ghost1'), 'carte d\'un sujet supprimé jamais affichée');
b.db.prepare(`INSERT INTO topics (id, name, type, config, position, created_at, updated_at) VALUES ('nintendo','Nintendo','general','{"match":["Nintendo"]}',5,1,1)`).run();
b.db.prepare(`INSERT INTO raw_items (id, topic_id, title_key, url, title, snippet, content, source_id, source_name, lang, kind, published_at, fetched_at, status) VALUES ('nz1','nintendo','knz1','https://x/nz1','Zelda sur PC','s','', 'x','x','en','target',1,0,'pending')`).run();
b.db.prepare("UPDATE meta SET value='0' WHERE key='lock'").run();
globalThis.__deleteDuring = 'nintendo';
const rd = await api.refresh('manual');
const leftovers = b.db.prepare("SELECT (SELECT COUNT(*) FROM cards WHERE topic_id NOT IN (SELECT id FROM topics)) + (SELECT COUNT(*) FROM raw_items WHERE topic_id = 'nintendo') AS n").get().n;
assert(!globalThis.__deleteDuring && leftovers === 0 && !rd.errors.length, `sujet supprimé pendant l'analyse : rien de créé, restes effacés (${leftovers})`);
// Heure de la collecte automatique
await api.setup({ daily_hour: 12 });
const sh = await api.status();
assert(sh.daily_hour === 12 && new Date(sh.next_collect).getHours() === 12 && globalThis.__hour === 12, 'heure de collecte changée (12 h), Android reprogrammé');
let bad; try { await api.setup({ daily_hour: 25 }); } catch (e) { bad = e; }
assert(bad?.status === 400 && (await api.status()).daily_hour === 12, 'heure invalide refusée');
await api.setup({ daily_hour: 8 });
// Mode simplifié mémorisé
assert((await api.status()).ui_mode === '', 'mode d\'affichage pas encore choisi');
await api.setup({ ui_mode: 'simple' });
assert((await api.status()).ui_mode === 'simple', 'mode simplifié mémorisé');
await api.setup({ ui_mode: 'n-importe-quoi' });
assert((await api.status()).ui_mode === 'simple', 'valeur de mode invalide ignorée');
await api.setup({ ui_mode: 'full' });
// Google surchargé (503) : articles gardés en attente, sans compter d'échec, message clair
b.db.prepare(`INSERT OR REPLACE INTO raw_items (id, topic_id, title_key, url, title, snippet, content, source_id, source_name, lang, kind, published_at, fetched_at, status, attempts) VALUES ('busy1','find-x10-ultra','kb1','https://x/b1','Find X10 Ultra surcharge','s','', 'x','x','en','target',1,0,'pending',0)`).run();
b.db.prepare("UPDATE meta SET value='0' WHERE key='lock'").run();
globalThis.__busy = true;
const t0b = Date.now();
const rb503 = await api.refresh('auto');
globalThis.__busy = false;
const rowB = b.db.prepare("SELECT status, attempts FROM raw_items WHERE id='busy1'").get();
assert(rowB.status === 'pending' && Number(rowB.attempts) === 0 && /surchargés/.test(rb503.errors.join(' ')) && Date.now() - t0b < 60000,
  `Google surchargé : article gardé, aucun échec compté (${rowB.status}/${rowB.attempts})`);
// IA de secours (Groq) : prend le relais quand Google est surchargé
let badG; try { await api.setup({ backup_key: 'gsk_BAD' }); } catch (e) { badG = e; }
assert(badG?.status === 400 && /Groq refusée/.test(badG.message), 'clé Groq invalide refusée');
await api.setup({ backup_key: 'gsk_GOOD123456' });
assert((await api.status()).ai.backup === true && globalThis.__groqModel === 'openai/gpt-oss-120b', 'clé Groq enregistrée, meilleur modèle choisi automatiquement');
b.db.prepare(`INSERT OR REPLACE INTO raw_items (id, topic_id, title_key, url, title, snippet, content, source_id, source_name, lang, kind, published_at, fetched_at, status, attempts) VALUES ('bk1','find-x10-ultra','kbk1','https://x/bk1','Find X10 Ultra secours','s','', 'x','x','en','target',1,0,'pending',0)`).run();
b.db.prepare("UPDATE meta SET value='0' WHERE key='lock'").run();
globalThis.__busy = true; globalThis.__groqCalls = 0;
const t0g = Date.now();
const rg = await api.refresh('auto');
globalThis.__busy = false;
const rowG = b.db.prepare("SELECT status FROM raw_items WHERE id='bk1'").get();
const sumG = (await api.status()).last_summary;
assert(rowG.status !== 'pending' && globalThis.__groqCalls > 0 && !rg.errors.length && sumG.backup >= 1 && Date.now() - t0g < 30000,
  `Google surchargé : l'IA de secours a analysé l'article (${rowG.status}, ${sumG.backup} via Groq, ${Math.round((Date.now() - t0g) / 1000)} s)`);
// Installer Radar chez un proche : code créé sur un téléphone, importé sur un autre
const sc = await api.shareCode();
assert(/^RADAR1:[A-Za-z0-9_-]+$/.test(sc.code) && sc.search && sc.backup, 'code de partage créé (clés Gemini, Tavily et Groq)');
b.db.prepare("DELETE FROM meta WHERE key IN ('cfg_gemini_key','cfg_tavily_key','cfg_groq_key')").run();
assert(!(await api.status()).ai.configured, 'clés effacées (nouveau téléphone simulé)');
const imp = await api.importCode(`https://github.com/Leico118/Finder-all-Infos/releases/latest/download/Radar.apk#${sc.code}`);   // QR scanné depuis Radar
const stI = await api.status();
assert(imp.ai_ok && imp.search_ok && imp.backup_ok && stI.ai.configured && stI.search.configured && stI.ai.backup, 'code QR (lien de téléchargement + clés) importé : les trois clés installées');
assert(stI.keys_received.gemini && !stI.can_share, 'clés reçues marquées comme telles');
let reshare; try { await api.shareCode(); } catch (e) { reshare = e; }
assert(reshare?.status === 403, 'clés reçues d\'un proche : impossible de les partager à nouveau');
await api.setup({ ai_key: 'AIzaMINE-123456' });
const own = await api.shareCode();
assert(!own.search && !own.backup && (await api.status()).can_share, 'sa propre clé Gemini se partage, mais pas les clés Tavily/Groq reçues');
let badCode; try { await api.importCode('bonjour'); } catch (e) { badCode = e; }
assert(badCode?.status === 400 && /pas un code Radar/.test(badCode.message), 'texte sans code refusé avec un message clair');
let cut; try { await api.importCode(sc.code.slice(0, 20)); } catch (e) { cut = e; }
assert(cut?.status === 400, 'code tronqué refusé');
// Mise à jour proposée depuis GitHub
const up = await api.update();
assert(up.available && up.latest === '1.0.9' && up.current === '1.0.0' && up.url.endsWith('/v1.0.9/Radar.apk'), 'nouvelle version GitHub détectée avec le bon fichier');
// Collecte automatique désactivable
await api.setup({ auto_collect: false });
b.db.prepare("UPDATE meta SET value='0' WHERE key='lock'").run();
const nBefore = log.length;
const rb = await api.refresh('background');
assert(rb.skipped && log.length === nBefore && (await api.status()).auto_collect === false, 'collecte de 8 h désactivée : la tâche de fond ne fait rien');
await api.setup({ auto_collect: true });
assert((await api.status()).auto_collect === true, 'collecte de 8 h réactivée');
// Le message « Aucune clé IA » disparaît quand la clé est enregistrée
b.db.prepare("UPDATE meta SET value='Aucune clé IA : les articles sont collectés mais pas encore analysés (Réglages).' WHERE key='last_error'").run();
await api.setup({ ai_key: 'AIzaTEST2' });
assert((await api.status()).last_error === '', 'message « Aucune clé IA » effacé après enregistrement de la clé');
const st = await api.status();
assert(st.device.platform === 'android' && st.device.batteryExempt === false, 'infos du téléphone dans les réglages');
try { await api.card('inconnue'); assert(false, 'erreur 404'); } catch (e) { assert(e.status === 404, 'erreurs remontées à l\'interface'); }
console.log(`${ok} ok, ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
