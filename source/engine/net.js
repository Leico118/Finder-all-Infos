// Accès réseau du moteur. Sur le téléphone, les requêtes passent par le code natif Android
// (pas de restriction CORS) ; dans les tests, par le fetch de Node.
let impl = (url, opts) => globalThis.fetch(url, opts.timeout && !opts.signal ? { ...opts, signal: AbortSignal.timeout(opts.timeout) } : opts);

export function setFetch(fn) { impl = fn; }

export function http(url, opts = {}) { return impl(url, opts); }

export const UA = 'Mozilla/5.0 (Linux; Android 15; ASUS_AI2401) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';

export async function fetchText(url, timeout = 15000) {
  const res = await http(url, {
    headers: {
      'user-agent': UA,
      accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8, */*;q=0.5',
      'accept-language': 'fr,en;q=0.8,zh-CN;q=0.6',
    },
    timeout,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));
