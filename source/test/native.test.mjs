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
      if (req.url.includes('generativelanguage')) {
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
const st = await api.status();
assert(st.device.platform === 'android' && st.device.batteryExempt === false, 'infos du téléphone dans les réglages');
try { await api.card('inconnue'); assert(false, 'erreur 404'); } catch (e) { assert(e.status === 404, 'erreurs remontées à l\'interface'); }
console.log(`${ok} ok, ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
