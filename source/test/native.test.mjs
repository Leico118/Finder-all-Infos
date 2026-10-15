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
      if (req.url.includes('generativelanguage') && globalThis.__offline) res = { error: 'UnknownHostException : Unable to resolve host "generativelanguage.googleapis.com": No address associated with hostname' };
      else if (req.url.includes('generativelanguage')) {
        if (globalThis.__steal) b.db.prepare(`UPDATE meta SET value='${Date.now()}|appli-ouverte|manual' WHERE key='lock'`).run();
        res = { status: 200, url: req.url, headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"ok": true}' }] } }] }) };
      } else if (req.url.includes('api.tavily.com')) res = { status: 200, url: req.url, headers: {}, body: '{"results":[]}' };
      else if (req.url.includes('workers.dev')) res = { error: 'UnknownHostException : pas de réseau' };
      else res = { status: 200, url: req.url, headers: {}, body: '<rss><channel></channel></rss>' };
      window.__radarHttp(id, JSON.stringify(res));
    }, 5);
  },
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
const st = await api.status();
assert(st.device.platform === 'android' && st.device.batteryExempt === false, 'infos du téléphone dans les réglages');
try { await api.card('inconnue'); assert(false, 'erreur 404'); } catch (e) { assert(e.status === 404, 'erreurs remontées à l\'interface'); }
console.log(`${ok} ok, ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
