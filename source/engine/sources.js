// Sources : flux de sites spécialisés (partagés entre sujets tech) et flux de recherche propres à chaque sujet.
// Depuis le téléphone, Google Actualités et Bing répondent normalement (contrairement aux serveurs Cloudflare).

const gnews = (q, lang) => {
  const p = { fr: ['fr', 'FR', 'FR:fr'], en: ['en-US', 'US', 'US:en'], zh: ['zh-CN', 'CN', 'CN:zh-Hans'] }[lang];
  return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=${p[0]}&gl=${p[1]}&ceid=${p[2]}`;
};
const bing = (q, mkt) => `https://www.bing.com/news/search?q=${encodeURIComponent(q)}&format=rss&mkt=${mkt}`;
const gdelt = (q, span) =>
  `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(q)}&mode=artlist&format=rss&maxrecords=75&sort=datedesc&timespan=${span}`;
const reddit = q => `https://www.reddit.com/search.rss?q=${encodeURIComponent(q)}&sort=new&t=month`;

const site = (id, name, lang, url) => ({ id: `site:${id}`, name, lang, url, scope: 'tech' });

// Sites spécialisés : lus une fois par jour, rapprochés de tous les sujets technologiques.
export const SITE_FEEDS = [
  site('ithome', 'IT之家 (ITHome)', 'zh', 'https://www.ithome.com/rss/'),
  site('mydrivers', '快科技 (MyDrivers)', 'zh', 'https://rss.mydrivers.com/Rss.aspx?Tid=1'),
  site('36kr', '36Kr', 'zh', 'https://36kr.com/feed'),
  site('igeekphone', 'IGeekPhone', 'en', 'https://www.igeekphone.com/feed/'),
  site('gsmarena', 'GSMArena', 'en', 'https://www.gsmarena.com/rss-news-reviews.php3'),
  site('gizmochina', 'Gizmochina', 'en', 'https://www.gizmochina.com/feed/'),
  site('notebookcheck', 'Notebookcheck', 'en', 'https://www.notebookcheck.net/RSS-Feed-Notebook-Reviews.8156.0.html'),
  site('androidauthority', 'Android Authority', 'en', 'https://www.androidauthority.com/feed/'),
  site('androidheadlines', 'Android Headlines', 'en', 'https://www.androidheadlines.com/feed'),
  site('gadgets360', 'Gadgets 360', 'en', 'https://feeds.feedburner.com/gadgets360-latest'),
  site('smartprix', 'Smartprix', 'en', 'https://www.smartprix.com/bytes/feed/'),
  site('phonearena', 'PhoneArena', 'en', 'https://www.phonearena.com/feed'),
  site('techradar', 'TechRadar', 'en', 'https://www.techradar.com/feeds.xml'),
  site('androidcentral', 'Android Central', 'en', 'https://www.androidcentral.com/feeds.xml'),
  site('androidpolice', 'Android Police', 'en', 'https://www.androidpolice.com/feed/'),
  site('9to5google', '9to5Google', 'en', 'https://9to5google.com/feed/'),
  site('xda', 'XDA Developers', 'en', 'https://www.xda-developers.com/feed/'),
  site('theverge', 'The Verge', 'en', 'https://www.theverge.com/rss/index.xml'),
  site('digitaltrends', 'Digital Trends', 'en', 'https://www.digitaltrends.com/feed/'),
  site('tomsguide', "Tom's Guide", 'en', 'https://www.tomsguide.com/feeds.xml'),
  site('wccftech', 'Wccftech', 'en', 'https://wccftech.com/feed/'),
  site('sammobile', 'SamMobile', 'en', 'https://www.sammobile.com/feed/'),
  site('huaweicentral', 'Huawei Central', 'en', 'https://www.huaweicentral.com/feed/'),
  site('fonearena', 'FoneArena', 'en', 'https://www.fonearena.com/blog/feed'),
  site('techpp', 'TechPP', 'en', 'https://techpp.com/feed/'),
  site('beebom', 'Beebom', 'en', 'https://beebom.com/feed/'),
  site('frandroid', 'Frandroid', 'fr', 'https://www.frandroid.com/feed'),
  site('lesnumeriques', 'Les Numériques', 'fr', 'https://www.lesnumeriques.com/rss.xml'),
  site('phonandroid', 'Phonandroid', 'fr', 'https://www.phonandroid.com/feed'),
  site('01net', '01net', 'fr', 'https://www.01net.com/feed/'),
  site('clubic', 'Clubic', 'fr', 'https://www.clubic.com/feed/news.rss'),
  site('numerama', 'Numerama', 'fr', 'https://www.numerama.com/feed/'),
  site('journaldugeek', 'Journal du Geek', 'fr', 'https://www.journaldugeek.com/feed/'),
  site('computerbase', 'ComputerBase', 'de', 'https://www.computerbase.de/rss/news.xml'),
  site('winfuture', 'WinFuture', 'de', 'https://static.winfuture.de/feeds/WinFuture-News-rss2.0.xml'),
  site('heise', 'Heise Online', 'de', 'https://www.heise.de/rss/heise-atom.xml'),
  site('hdblog', 'HDBlog', 'it', 'https://www.hdblog.it/feed/'),
  site('tuttoandroid', 'TuttoAndroid', 'it', 'https://www.tuttoandroid.net/feed/'),
];

// Flux de recherche d'un sujet (toutes langues). Chaque article doit citer le sujet.
export function topicFeeds(topic, { first = false } = {}) {
  const c = topic.config || {};
  const q = c.queries || {};
  const feeds = [];
  const add = (key, name, lang, url, kind = 'target') =>
    feeds.push({ id: `t:${topic.id}:${key}`, name, lang, url, kind, topic_id: topic.id, scope: 'topic' });
  (q.fr || []).slice(0, 2).forEach((s, i) => add(`gn-fr-${i}`, 'Google Actualités (FR)', 'fr', gnews(s, 'fr')));
  (q.en || []).slice(0, 2).forEach((s, i) => add(`gn-en-${i}`, 'Google Actualités (EN)', 'en', gnews(s, 'en')));
  (q.zh || []).slice(0, 2).forEach((s, i) => add(`gn-zh-${i}`, 'Google 新闻 (Chine)', 'zh', gnews(s, 'zh')));
  if (q.en?.[0]) add('bing-en', 'Bing Actualités (EN)', 'en', bing(q.en[0], 'en-US'));
  if (q.fr?.[0]) add('bing-fr', 'Bing Actualités (FR)', 'fr', bing(q.fr[0], 'fr-FR'));
  const main = c.short || topic.name;
  add('gdelt', 'GDELT — médias du monde entier', 'multi', gdelt(`"${main}"`, first ? '3months' : '1week'));
  add('reddit', 'Reddit', 'en', reddit(`"${main}"`));
  if (topic.type === 'product' && c.rivals?.length) {
    const rq = c.rivals.slice(0, 5).map(r => `"${r}"`).join(' OR ');
    add('rivals', 'Google Actualités — concurrents', 'en', gnews(`(${rq}) leak OR rumor OR launch`, 'en'), 'competitor');
  }
  return feeds;
}
