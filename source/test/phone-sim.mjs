// Simule le téléphone : sert l'APK web compilée et un pont « natif » (SQLite + réseau simulé) au navigateur.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { makeBridge } from './bridge.mjs';
import { fakeFetch, setTopicResponse } from './mocks.mjs';

const ASSETS = process.argv[2];
const bridge = makeBridge();
setTopicResponse({ name: 'Voitures BYD', short: 'BYD', type: 'general', description: 'Constructeur automobile chinois.', owner: 'BYD',
  match: ['BYD', '比亚迪'], exclude: [], queries: { fr: ['BYD voiture'], en: ['BYD car'], zh: ['比亚迪 汽车'] }, web_queries: ['BYD new car'], rivals: [], tech: false, spec_groups: [] });
const types = { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png' };
const read = async req => { const c = []; for await (const x of req) c.push(x); return Buffer.concat(c).toString(); };
const notifications = [];

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/__sql') { const b = JSON.parse(await read(req)); res.end(bridge.sql(b.sql, b.params, b.mode)); return; }
  if (u.pathname === '/__batch') { res.end(bridge.batch(await read(req))); return; }
  if (u.pathname === '/__notify') { notifications.push(JSON.parse(await read(req))); res.end('{}'); return; }
  if (u.pathname === '/__notifications') { res.end(JSON.stringify(notifications)); return; }
  if (u.pathname === '/__http') {
    const r = JSON.parse(await read(req));
    try {
      const resp = await fakeFetch(r.url, { method: r.method, headers: r.headers, body: r.body });
      res.end(JSON.stringify({ status: resp.status, url: r.url, headers: {}, body: await resp.text() }));
    } catch (e) { res.end(JSON.stringify({ error: e.message })); }
    return;
  }
  let f = path.join(ASSETS, u.pathname === '/' ? 'index.html' : u.pathname);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
}).listen(5175, () => console.log('PHONE-SIM'));
