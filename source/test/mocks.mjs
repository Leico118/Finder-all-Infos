// Réseau simulé partagé par les tests.
export const now = Date.now();
export const day = 86400000;
const rss = items => `<?xml version="1.0" encoding="UTF-8"?><rss><channel>${items.map(i =>
  `<item><title><![CDATA[${i.t}]]></title><link>${i.l}</link><pubDate>${new Date(i.d ?? now).toUTCString()}</pubDate><description><![CDATA[${i.s || i.t}]]></description>${i.src ? `<source url="x">${i.src}</source>` : ''}</item>`).join('')}</channel></rss>`;

// --- ancienne application web (pour la reprise des données)
const legacy = {
  cards: [{ id: 'old-1' }],
  card: { id: 'old-1', category: 'target', reliability: 'reliable', title: 'OPPO Find X10 Ultra : capteur 200 MP LOFIC', summary: 'Résumé',
    detail: 'Détail', technical: '', origin: 'Digital Chat Station', reliability_reason: 'DCS', spec_keys: ['camera_main'],
    official_confirmation: 0, contradiction: '', importance: 2, first_seen_at: now - 30 * day, latest_at: now - 10 * day,
    created_at: now - 9 * day, updated_at: now - 9 * day,
    sources: [{ url: 'https://www.notebookcheck.net/x10-lofic.html', title: 'Oppo Find X10 Ultra: Best-ever 200MP sensor', source_name: 'notebookcheck.net', lang: 'en', published_at: now - 10 * day, added_at: now - 9 * day }],
    history: [{ at: now - 9 * day, kind: 'created', note: 'Carte créée' }] },
  specs: { groups: [{ items: [{ key: 'camera_main', value: '200 MP LOFIC 1/1,12"', reliability: 'reliable', card_id: 'old-1', source_url: 'https://www.notebookcheck.net/x10-lofic.html', source_name: 'notebookcheck.net', source_date: now - 10 * day, updated_at: now - 9 * day, history: [{ value: '200 MP LOFIC 1/1,12"', reliability: 'reliable', note: '', accepted: 1, at: now - 9 * day }] }, { key: 'battery', value: null }] }] },
};

export const calls = { gemini: 0, topicGen: 0, tavily: [], gdelt: 0, notify: [] };
export let analysisPrompts = [];
export let topicResponse = null;
export function setTopicResponse(v) { topicResponse = v; }

export async function fakeFetch(url, opts = {}) {
  url = String(url);
  const J = o => new Response(JSON.stringify(o), { status: 200 });
  if (url.startsWith('https://find-x10-ultra.link6926.workers.dev')) {
    if (url.includes('/api/cards?')) return J({ cards: legacy.cards });
    if (url.includes('/api/cards/old-1')) return J(legacy.card);
    if (url.includes('/api/specs')) return J(legacy.specs);
  }
  if (url.includes('generativelanguage.googleapis.com')) {
    calls.gemini++;
    const body = JSON.parse(opts.body);
    const user = body.contents[0].parts[0].text;
    const system = body.systemInstruction.parts[0].text;
    if (!String(opts.headers['x-goog-api-key']).startsWith('AIzaGOOD')) return new Response('{"error":{"code":400,"message":"API key not valid"}}', { status: 400 });
    let out;
    if (user.startsWith('Réponds exactement')) out = { ok: true };
    else if (system.includes('Tu prépares la fiche')) {
      out = { spec_groups: [{ label: 'Repères', items: [{ key: 'dernier_modele', label: 'Dernier modèle annoncé' }, { key: 'battery', label: 'Batterie' }] }] };
    } else if (system.includes('Tu remplis la')) {
      const first = user.match(/"id":"([^"]+)"/)?.[1];
      out = { spec_updates: [{ key: 'battery', value: '80 kWh', reliability: 'official', ref: first }, { key: 'inventee', value: 'x', reliability: 'official', ref: first }] };
      if (user.includes('"models"')) out.models = [{ name: 'BYD Seal', kind: 'voiture' }, { name: 'BYD Seal', kind: 'voiture' }, { name: 'BYD Atto 2', kind: 'voiture' }];
    } else if (system.includes('Tu fais le tri')) {
      out = { remove: [...user.matchAll(/"id":"([^"]+)","title":"[^"]*(écouteurs|Fairbuds)/gi)].map(m => m[1]).concat(['id-inexistant']) };
    } else if (user.includes("Sujet tapé par l'utilisateur")) {
      calls.topicGen++;
      out = topicResponse;
    } else {
      analysisPrompts.push({ system, user });
      const lines = user.split('ARTICLES À ANALYSER (un JSON par ligne)\n')[1].split('\n\nCARTES')[0].split('\n').map(l => JSON.parse(l));
      const isByd = system.includes('Voitures BYD');
      const items = [], cards = [], specs = [];
      for (const l of lines) {
        if (/Pro Max/.test(l.title)) { items.push({ i: l.i, ref: null, ignore_reason: 'Concerne le X10 Pro Max' }); continue; }
        if (isByd) { items.push({ i: l.i, ref: 'new:1' }); continue; }
        if (l.kind === 'competitor') { items.push({ i: l.i, ref: 'new:2' }); continue; }
        if (/LOFIC/.test(l.title)) {                                   // déjà connu grâce à la reprise
          const id = user.match(/"id":"(old-1)"/)?.[1];
          items.push({ i: l.i, ref: id || 'new:3' }); continue;
        }
        items.push({ i: l.i, ref: 'new:1' });
      }
      if (items.some(x => x.ref === 'new:1')) cards.push(isByd
        ? { ref: 'new:1', category: 'target', reliability: 'official', title: 'BYD lance une nouvelle berline électrique', summary: 's', detail: 'd', importance: 3, spec_keys: ['battery'] }
        : { ref: 'new:1', category: 'target', reliability: 'reliable', title: 'Batterie de 8 000 mAh pour le Find X10 Ultra', summary: 's', detail: 'd', importance: 2, spec_keys: ['battery', 'inconnue'] });
      if (items.some(x => x.ref === 'new:2')) cards.push({ ref: 'new:2', category: 'competitor', reliability: 'rumor', title: 'Galaxy S27 Ultra : nouveau périscope', summary: 's', detail: 'd', importance: 2, competitor: { brand: 'Samsung', model: 'Galaxy S27 Ultra', why: 'zoom', comparison: 'n/a' } });
      if (!isByd) specs.push({ key: 'battery', value: '8 000 mAh', reliability: 'reliable', ref: 'new:1' });
      if (isByd) specs.push({ key: 'battery', value: '80 kWh', reliability: 'official', ref: 'new:1' });
      out = { items, cards, spec_updates: specs };
    }
    return J({ candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] } }] });
  }
  if (url === 'https://api.tavily.com/search') {
    const b = JSON.parse(opts.body);
    calls.tavily.push(b);
    if (!String(opts.headers.authorization).startsWith('Bearer tvly-GOOD')) return new Response('{"detail":"Unauthorized"}', { status: 401 });
    if (b.query === 'OPPO Find X10 Ultra 传感器') return J({ results: [{ title: 'OPPO Find X10 Ultra 测试两款传感器', url: 'https://www.zol.com.cn/x10.html', content: '数码闲聊站爆料 OPPO Find X10 Ultra 传感器' }] });
    if (b.query === '"OPPO Find X10 Ultra"') return J({ results: [
      { title: 'Oppo Find X10 Ultra is in testing with two big sensors for its 10x zoom', url: 'https://www.gsmarena.com/x10_two_sensors-news.php', content: 'Digital Chat Station says…', published_date: '2026-08-03' },
      { title: 'OPPO Find X10 Pro Max Indian price leaked', url: 'https://example.com/promax', content: 'Pro Max only' }] });
    return J({ results: [] });
  }
  if (url.includes('api.gdeltproject.org')) { calls.gdelt++; return new Response(rss([])); }
  if (url.includes('news.google.com/rss/search') && url.includes('X10%20Ultra') && url.includes('hl=en-US')) {
    return new Response(rss([
      { t: 'OPPO Find X10 Ultra to pack an 8,000mAh battery - GSMArena.com', l: 'https://news.google.com/rss/articles/AAA', src: 'GSMArena.com', d: now - 2 * day },
      { t: 'Oppo Find X10 Ultra: Best-ever 200MP sensor specs tipped - LOFIC', l: 'https://news.google.com/rss/articles/LOF', src: 'Notebookcheck', d: now - 3 * day },
      { t: 'Old Find X10 Ultra news from 2025', l: 'https://news.google.com/rss/articles/OLD', d: Date.parse('2025-06-01') },
    ]));
  }
  if (url.includes('news.google.com/rss/search') && url.includes('rivals') === false && url.includes('leak%20OR%20rumor')) {
    return new Response(rss([{ t: 'Galaxy S27 Ultra leak shows new periscope', l: 'https://www.sammobile.com/s27-periscope', d: now - day },
      { t: 'OPPO Find X10 Ultra vs Galaxy S27 Ultra', l: 'https://x.com/versus', d: now - day }]));
  }
  if (url.includes('news.google.com/rss/search') && /BYD|%E6%AF%94%E4%BA%9A%E8%BF%AA/.test(url)) {
    return new Response(rss([{ t: 'BYD dévoile une nouvelle berline électrique', l: 'https://www.automobile-propre.com/byd-berline', d: now - day },
      { t: '比亚迪 发布新车', l: 'https://auto.sina.com.cn/byd', d: now - day }]));
  }
  if (url === 'https://www.ithome.com/rss/') {
    return new Response(rss([{ t: 'OPPO Find X10 Ultra 电池 8000mAh 曝光', l: 'https://www.ithome.com/0/900/1.htm', d: now - day },
      { t: 'Galaxy S27 Ultra 渲染图曝光', l: 'https://www.ithome.com/0/900/2.htm', d: now - day },
      { t: '小米 新款路由器', l: 'https://www.ithome.com/0/900/3.htm', d: now - day }]));
  }
  if (/ithome\.com\/0\/900|gsmarena\.com\/x10|zol\.com\.cn|sammobile|automobile-propre|sina\.com\.cn/.test(url)) {
    return new Response('<html><meta property="og:description" content="Article complet"><p>' + 'Texte de l\'article détaillé. '.repeat(10) + '</p></html>');
  }
  return new Response(rss([]));
}

