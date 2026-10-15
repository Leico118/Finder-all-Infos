// Recherche web Tavily (gratuit : 1 000 recherches / mois). Le budget quotidien est partagé entre les sujets.
import { http, sleep } from './net.js';
import { cleanText } from './rss.js';

export const DAILY_BUDGET = 30;              // ≈ 900 recherches / mois
const CN_DOMAINS = ['weibo.com', 'm.weibo.cn', 'ithome.com', 'mydrivers.com', 'zol.com.cn', 'cnmo.com', 'pconline.com.cn',
  'sina.com.cn', 'qq.com', 'sohu.com', '36kr.com', 'bilibili.com', 'baidu.com', 'tenaa.com.cn', 'igeekphone.com'];
const hasCJK = s => /[一-鿿]/.test(s);

export function searchConfigured(env) { return !!env.TAVILY_API_KEY; }

export async function tavily(env, body) {
  const res = await http('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${env.TAVILY_API_KEY}` },
    body: JSON.stringify(body),
    timeout: 30000,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Tavily ${res.status} : ${text.slice(0, 160)}`);
  return JSON.parse(text);
}

// Renvoie les requêtes du jour pour un sujet (rotation dans la liste) et le nouveau curseur.
export function pickQueries(topic, state, share) {
  const list = topic.config?.web_queries || [];
  if (!list.length) return { queries: [], cursor: 0, wrapped: false };
  const n = Math.min(share, list.length);
  const start = (state?.web_cursor || 0) % list.length;
  const queries = [];
  for (let i = 0; i < n; i++) queries.push(list[(start + i) % list.length]);
  const cursor = (start + n) % list.length;
  return { queries, cursor, wrapped: start + n >= list.length };
}

// Résultats bruts (titre, url, extrait, date) pour une série de requêtes.
export async function webSearch(env, topic, queries, since) {
  const out = [];
  for (const q of queries) {
    const body = { query: q, search_depth: 'basic', max_results: 15, include_answer: false };
    if (since) body.start_date = since;
    if (hasCJK(q)) { body.topic = 'general'; if (topic.config?.tech) body.include_domains = CN_DOMAINS; }
    else body.topic = 'news';
    const data = await tavily(env, body);
    for (const r of data.results || []) {
      if (!r.url) continue;
      const pub = r.published_date ? Date.parse(r.published_date) : NaN;
      out.push({
        title: cleanText(r.title, 280),
        snippet: cleanText(r.content, 900),
        url: r.url,
        source: (() => { try { return new URL(r.url).hostname.replace(/^www\./, ''); } catch { return 'web'; } })(),
        published: Number.isFinite(pub) ? pub : null,
        lang: hasCJK(q) ? 'zh' : 'multi',
      });
    }
    await sleep(300);
  }
  return out;
}
