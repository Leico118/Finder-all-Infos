// Test de bout en bout du moteur local : base SQLite réelle (via le pont simulé), réseau simulé.
import { makeBridge } from './bridge.mjs';
import { nativeDB } from '../engine/nativedb.js';
import { createEngine } from '../engine/index.js';

let failures = 0, passed = 0;
const assert = (c, m) => { if (c) { passed++; console.log('ok -', m); } else { failures++; console.error('ÉCHEC:', m); } };

import { fakeFetch, calls, analysisPrompts, setTopicResponse, now, day } from './mocks.mjs';
let topicResponse;
const bridge = makeBridge();
const engine = createEngine({
  DB: nativeDB(bridge), fetch: fakeFetch, gdeltDelay: 0,
  notify: async n => { calls.notify.push(n); },
  info: async () => ({ platform: 'test' }),
});
const api = async (method, path, body) => engine.handle(method, path, body);

// 1. Premier lancement
let r = await api('GET', '/api/topics');
assert(r.status === 200 && r.data.topics.length === 1 && r.data.topics[0].id === 'find-x10-ultra', 'premier lancement : sujet Find X10 Ultra créé');
r = await api('GET', '/api/cards');
assert(r.data.setup.ai_configured === false && r.data.cards.length === 0, 'aucune clé IA au départ');

// 2. Réglages
assert((await api('POST', '/api/setup', { ai_key: 'AIzaBAD' })).status === 400, 'mauvaise clé Gemini refusée');
assert((await api('POST', '/api/setup', { ai_key: 'AIzaGOOD' })).data.ai_ok, 'clé Gemini vérifiée');
assert((await api('POST', '/api/setup', { search_key: 'tvly-BAD' })).status === 400, 'mauvaise clé Tavily refusée');
assert((await api('POST', '/api/setup', { search_key: 'tvly-GOOD' })).data.search_ok, 'clé Tavily vérifiée');

// 3. Création d'un sujet général à partir de deux mots
setTopicResponse(topicResponse = { name: 'Voitures BYD', short: 'BYD', type: 'general', description: 'Constructeur automobile chinois BYD.', owner: 'BYD',
  match: ['BYD', '比亚迪'], exclude: [], queries: { fr: ['BYD voiture'], en: ['BYD car'], zh: ['比亚迪 汽车'] },
  web_queries: ['BYD new car', 'BYD électrique'], rivals: ['Tesla Model 3'], tech: false, spec_groups: [{ label: 'x', items: [{ key: 'a', label: 'b' }] }] });
r = await api('POST', '/api/topics', { text: 'voiture BYD' });
assert(r.status === 200 && r.data.topic.id === 'voitures-byd' && r.data.topic.type === 'general', 'sujet « voiture BYD » préparé par l\'IA');
assert(r.data.topic.spec_groups.length === 0 && r.data.topic.rivals.length === 0, 'sujet général : ni fiche technique ni concurrents');
assert((await api('POST', '/api/topics', { text: 'x' })).status === 400, 'texte trop court refusé');

// 4. Première synchronisation (manuelle)
r = await api('POST', '/api/refresh?mode=manual');
console.log('passe 1 :', JSON.stringify({ collected: r.data.collected, created: r.data.created, analyzed: r.data.analyzed, ignored: r.data.ignored, pending: r.data.pending, errors: r.data.errors }));
assert(r.status === 200 && r.data.collected === 2, 'collecte des 2 sujets');
const raws = bridge.db.prepare('SELECT topic_id, kind, url, status, source_id, published_at FROM raw_items').all();
assert(raws.some(x => x.source_id === 'import' && x.status === 'processed'), 'reprise : articles de l\'ancienne appli marqués comme traités');
assert(!raws.some(x => x.url.includes('OLD')), 'article antérieur à 2026 écarté (historique depuis le 1er janvier)');
assert(raws.some(x => x.topic_id === 'find-x10-ultra' && x.url.includes('ithome.com/0/900/1')), 'site spécialisé rattaché au X10 Ultra');
assert(raws.some(x => x.topic_id === 'find-x10-ultra' && x.kind === 'competitor' && x.url.includes('900/2')), 'concurrent repéré sur un site spécialisé');
assert(!raws.some(x => x.url.includes('900/3')), 'article sans rapport ignoré');
assert(!raws.some(x => x.topic_id === 'voitures-byd' && x.url.includes('ithome')), 'sujet non tech : sites tech non utilisés');
assert(raws.some(x => x.topic_id === 'voitures-byd' && x.url.includes('sina.com.cn')), 'sujet BYD : article chinois retrouvé (比亚迪)');
assert(raws.some(x => x.url.includes('zol.com.cn')), 'Tavily : requête chinoise');
const { DEFAULT_TOPIC } = await import('../engine/topics.js');
const X10Q = DEFAULT_TOPIC.config.web_queries;
const tx = calls.tavily.filter(b => b.max_results === 15);
assert(tx.filter(b => X10Q.includes(b.query)).length === 15 && tx.every(b => b.start_date), 'Tavily : 15 requêtes au premier passage (part du budget, minimum 12), avec date de départ');
assert(tx.find(b => b.query === 'OPPO Find X10 Ultra 传感器')?.include_domains?.includes('weibo.com'), 'Tavily : requêtes chinoises ciblées sur les sites chinois (sujet tech)');
assert(tx.find(b => X10Q.includes(b.query)).start_date === '2026-01-01', 'Tavily : historique depuis le 1er janvier 2026');

const cards = bridge.db.prepare('SELECT * FROM cards').all();
console.log('cartes :', cards.map(c => `${c.topic_id}/${c.category}/${c.reliability}: ${c.title}`).join(' | '));
assert(cards.some(c => c.id === 'old-1'), 'reprise : carte de l\'ancienne application');
assert(cards.some(c => c.topic_id === 'find-x10-ultra' && /8 000 mAh/.test(c.title)), 'nouvelle carte X10 Ultra');
assert(cards.some(c => c.topic_id === 'find-x10-ultra' && c.category === 'competitor'), 'carte concurrent');
assert(cards.some(c => c.topic_id === 'voitures-byd' && c.category === 'target' && c.reliability === 'official'), 'carte BYD (officiel)');
const lofic = bridge.db.prepare("SELECT COUNT(*) n FROM card_sources WHERE card_id = 'old-1'").get().n;
assert(lofic >= 2, 'doublon : nouvel article LOFIC rattaché à la carte reprise');
const byd = analysisPrompts.find(p => p.system.includes('Voitures BYD'));
assert(byd && !byd.system.includes('CLÉS DE FICHE') && byd.system.includes('category vaut toujours "target"'), 'consignes IA adaptées au sujet général');
const x10p = analysisPrompts.find(p => p.system.includes('OPPO Find X10 Ultra'));
assert(x10p && x10p.system.includes('Find X10 Pro Max') && x10p.system.includes('camera_tele1'), 'consignes IA produit : exclusions et fiche technique');
assert(bridge.db.prepare("SELECT COUNT(*) n FROM specs WHERE topic_id = 'voitures-byd'").get().n === 0, 'pas de fiche technique pour BYD');
const sp = (await api('GET', '/api/specs?topic=find-x10-ultra')).data;
const bat = sp.groups.flatMap(g => g.items).find(i => i.key === 'battery');
const cam = sp.groups.flatMap(g => g.items).find(i => i.key === 'camera_main');
assert(bat.value === '8 000 mAh' && cam.value.startsWith('200 MP'), 'fiche technique : reprise + nouvelle valeur');
assert(calls.notify.length === 2 && calls.notify.some(n => n.title.startsWith('BYD')) && calls.notify[0].route.startsWith('/carte/'), 'une notification par sujet');

// 5. Lecture
r = await api('GET', '/api/cards?topic=voitures-byd');
assert(r.data.cards.length === 1 && r.data.cards[0].unread, 'filtre par sujet');
r = await api('GET', '/api/cards');
assert(r.data.unread_by_topic['voitures-byd'] === 1 && r.data.cards.find(c => c.id === 'old-1').unread === false, 'non lus par sujet ; cartes reprises déjà lues');
r = await api('GET', '/api/cards?topic=find-x10-ultra&filter=competitors');
assert(r.data.cards.length >= 1 && r.data.cards.every(c => c.category === 'competitor') && r.data.counts.competitors === r.data.cards.length, 'filtre Concurrents');
const cid = (await api('GET', '/api/cards?topic=voitures-byd')).data.cards[0].id;
r = await api('GET', `/api/cards/${cid}`);
assert(r.data.topic.short === 'BYD' && r.data.sources.length >= 1 && r.data.history.length >= 1, 'détail d\'une carte');
await api('POST', `/api/cards/${cid}/read`);
assert((await api('GET', '/api/cards?topic=voitures-byd')).data.counts.unread === 0, 'marquage lu');

// 6. Ouverture de l'appli plus tard dans la journée : pas de nouvelle collecte
const before = calls.tavily.length;
r = await api('POST', '/api/refresh?mode=auto');
assert(r.data.collected === 0 && calls.tavily.length === before, 'ouverture : pas de nouvelle recherche le même jour');
r = await api('POST', '/api/refresh?mode=manual');
assert(r.data.collected === 2 && calls.tavily.length === before, 'Actualiser : relit les flux, mais Tavily une seule fois par jour');

// 7. Lendemain 8 h : collecte automatique
bridge.db.prepare('UPDATE topic_state SET last_collect = ?').run(now - 2 * day);
bridge.db.prepare('UPDATE source_state SET last_ok = ?, last_fetched = ?').run(now - 2 * day, now - 2 * day);
bridge.db.prepare("UPDATE meta SET value = '0' WHERE key IN ('lock', 'sites_last')").run();
r = await api('POST', '/api/refresh?mode=background');
const tx2 = calls.tavily.slice(before).filter(b => b.max_results === 15);
assert(r.data.collected === 2 && tx2.length === 15 + 2, 'lendemain : collecte de tous les sujets, budget Tavily partagé (15 + 2)');
assert(tx2.filter(b => X10Q.includes(b.query))[0].query === X10Q[15] && tx2.filter(b => X10Q.includes(b.query)).length === 15, 'Tavily : rotation des requêtes d\'un jour à l\'autre');

// 8. Modification et suppression d'un sujet
r = await api('PUT', '/api/topics/voitures-byd', { match: 'BYD, 比亚迪, Denza', type: 'general' });
assert(r.status === 200 && (await api('GET', '/api/topics')).data.topics.find(t => t.id === 'voitures-byd').match.includes('Denza'), 'modification des mots-clés');
r = await api('DELETE', '/api/topics/voitures-byd');
assert(r.status === 200 && bridge.db.prepare("SELECT COUNT(*) n FROM cards WHERE topic_id = 'voitures-byd'").get().n === 0, 'suppression d\'un sujet et de ses cartes');
// Création en double (second appui, écran rouvert) : un seul sujet, pas d'erreur
setTopicResponse({ ...topicResponse, name: 'Nintendo Switch 3' });
const [c1, c2] = await Promise.all([api('POST', '/api/topics', { text: 'Nintendo' }), api('POST', '/api/topics', { text: 'nintendo' })]);
const c3 = await api('POST', '/api/topics', { text: 'Nintendo Switch' });
const nN = bridge.db.prepare("SELECT COUNT(*) n FROM topics WHERE name = 'Nintendo Switch 3'").get().n;
assert(c1.status === 200 && c2.status === 200 && c3.status === 200 && c3.data.existing && nN === 1, `création en double : un seul sujet, aucune erreur (${c1.status}/${c2.status}/${c3.status}, ${nN})`);
await api('DELETE', `/api/topics/${c1.data.topic.id}`);
const st = (await api('GET', '/api/status')).data;
assert(st.source_groups.length === 2 && st.source_groups[0].sources.length >= 6 && st.next_collect > now, 'état des sources et prochaine collecte');

console.log(`\n${passed} contrôles réussis, ${failures} échec(s).`);
process.exitCode = failures ? 1 : 0;

// Aperçu de l'interface (captures d'écran) : SERVE=<dossier des assets> node test/engine.test.mjs
if (process.env.SERVE) {
  setTopicResponse({ ...topicResponse, name: 'Voitures BYD' });
  await api('POST', '/api/topics', { text: 'voiture BYD' });
  bridge.db.prepare("UPDATE meta SET value='0' WHERE key='lock'").run();
  await api('POST', '/api/refresh?mode=manual');
  const http = await import('node:http'); const fs = await import('node:fs'); const path = await import('node:path');
  const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.svg': 'image/svg+xml' };
  http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname.startsWith('/api/')) {
      const chunks = []; for await (const c of req) chunks.push(c);
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
      const r = await engine.handle(req.method, u.pathname + u.search, body);
      res.writeHead(r.status, { 'content-type': 'application/json' }); res.end(JSON.stringify(r.data)); return;
    }
    let f = path.join(process.env.SERVE, u.pathname === '/' ? 'index.html' : u.pathname);
    if (!fs.existsSync(f)) f = path.join(process.env.SERVE, 'index.html');
    res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
  }).listen(5174, () => console.log('SERVING'));
}
