// Analyse légère de flux RSS 2.0 / Atom, sans dépendance (économe en CPU).

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(s) {
  if (!s) return '';
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return String.fromCodePoint(code); } catch { return ''; }
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

export function cleanText(s, max = 0) {
  if (!s) return '';
  let t = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  t = decodeEntities(t);                       // le HTML est souvent encodé dans le XML
  t = t.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ');
  t = t.replace(/<[^>]+>/g, ' ');
  t = decodeEntities(t);
  t = t.replace(/\s+/g, ' ').trim();
  return max && t.length > max ? t.slice(0, max).trim() + '…' : t;
}

function tag(block, name) {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i');
  const m = block.match(re);
  return m ? m[1] : '';
}

function parseDate(s) {
  const t = Date.parse(cleanText(s));
  return Number.isFinite(t) ? t : null;
}

// Les liens Bing passent par une redirection : on récupère l'URL réelle.
function resolveLink(link) {
  try {
    const u = new URL(link);
    if (u.hostname.endsWith('bing.com') && u.searchParams.get('url')) return u.searchParams.get('url');
  } catch { /* lien relatif ou invalide */ }
  return link;
}

// Découpe <item>…</item> (ou <entry>) par recherche de chaînes : bien plus rapide qu'une regex
// sur un flux de plusieurs centaines de Ko.
function splitBlocks(xml, name, max) {
  const out = [];
  const open = `<${name}`, close = `</${name}>`;
  let i = 0;
  while (out.length < max) {
    let a = xml.indexOf(open, i);
    while (a >= 0 && !/[\s>]/.test(xml[a + open.length])) a = xml.indexOf(open, a + 1);
    if (a < 0) break;
    const b = xml.indexOf(close, a);
    if (b < 0) break;
    out.push(xml.slice(a, b + close.length));
    i = b + close.length;
  }
  return out;
}

// quick(bloc brut, titre brut) : tri rapide avant tout nettoyage (économise le CPU).
export function parseFeed(xml, max = 60, quick = null) {
  if (!xml) return Object.assign([], { total: 0 });
  let atom = false;
  let blocks = splitBlocks(xml, 'item', max);
  if (!blocks.length) { atom = true; blocks = splitBlocks(xml, 'entry', max); }
  const out = [];
  out.total = blocks.length;
  for (const b of blocks) {
    // tri rapide sur le début du bloc (titre, lien, résumé) avant tout décodage
    const head = b.length > 2500 ? b.slice(0, 2500) : b;
    const rawTitle = tag(head, 'title');
    if (quick && !quick(head, rawTitle)) continue;
    let title = cleanText(rawTitle, 300);
    let link = cleanText(tag(b, 'link'));
    if (!link || atom) {
      const m = b.match(/<link[^>]*href=["']([^"']+)["'][^>]*>/i);
      if (m) link = decodeEntities(m[1]);
    }
    if (!link) link = cleanText(tag(b, 'guid'));
    link = resolveLink(link);
    if (!title || !/^https?:\/\//i.test(link)) continue;
    const source = cleanText(tag(b, 'source') || tag(b, 'News:Source'), 100);
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3)).trim();
    const snippet = cleanText(
      tag(b, 'description') || tag(b, 'summary') || tag(b, 'content:encoded') || tag(b, 'content'), 700);
    const published = parseDate(tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date'));
    out.push({ title, url: link, snippet: snippet === title ? '' : snippet, source, published });
  }
  return out;
}

// Extraction sommaire du texte d'un article (description + premiers paragraphes).
export function extractArticle(html, max = 2500) {
  if (!html) return '';
  const head = html.slice(0, 200000);
  const desc = head.match(/<meta[^>]+(?:property|name)=["'](?:og:description|description)["'][^>]+content=["']([^"']+)["']/i);
  const parts = [];
  if (desc) parts.push(cleanText(desc[1]));
  const paras = head.match(/<p[\s>][\s\S]*?<\/p>/gi) || [];
  for (const p of paras) {
    const t = cleanText(p);
    if (t.length > 60) parts.push(t);
    if (parts.join(' ').length > max) break;
  }
  return parts.join('\n').slice(0, max);
}

export function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    for (const k of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|ref$|ocid|cmpid|oc$)/i.test(k)) u.searchParams.delete(k);
    }
    u.hostname = u.hostname.replace(/^www\.|^m\./, '');
    return u.toString().replace(/\/$/, '');
  } catch { return url; }
}

export function titleKey(title) {
  return title.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().slice(0, 140);
}

export async function hash(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join('');
}
