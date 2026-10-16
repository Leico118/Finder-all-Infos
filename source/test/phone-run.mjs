import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const out = process.argv[2];
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 });
// Pont injecté avant le chargement de la page, comme addJavascriptInterface sur Android.
await ctx.addInitScript(() => {
  const sync = (url, body) => { const x = new XMLHttpRequest(); x.open('POST', url, false); x.send(body); return x.responseText; };
  window.RadarBridge = {
    sql: (sql, params, mode) => sync('/__sql', JSON.stringify({ sql, params, mode })),
    batch: json => sync('/__batch', json),
    http: (id, req) => { fetch('/__http', { method: 'POST', body: req }).then(r => r.text()).then(t => window.__radarHttp(id, t)); },
    notify: (title, body, route) => { fetch('/__notify', { method: 'POST', body: JSON.stringify({ title, body, route }) }); },
    info: () => JSON.stringify({ platform: 'android', version: '1.0.0', notifications: true, batteryExempt: false }),
    requestNotifications() {}, requestBatteryExemption() { window.__battery = true; }, openUrl(u) { window.__opened = u; }, done() {},
    readClipboard: () => window.__clip || '',
  };
});
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
const shot = n => p.screenshot({ path: `${out}/p-${n}.png` });
await p.goto('http://localhost:5175/index.html'); await p.waitForTimeout(3000); await shot('1-first');
const welcome = await p.isVisible('text=Bienvenue');                     // premier lancement : choix du mode
if (welcome) { await p.click('text=Mode complet'); await p.waitForTimeout(1000); }
// Assistant de configuration : Gemini détectée toute seule dans le presse-papiers au retour dans Radar
await p.click('button:has-text("Ouvrir le site de Google")'); const opened = await p.evaluate(() => window.__opened);
await shot('1b-assistant');
await p.evaluate(() => { window.__clip = 'Voici ma clé AIzaGOOD-abcdefghijklmnopqrstuvwxyz0123'; window.__radarFocus(); });
await p.waitForSelector('text=Clé Google Gemini enregistrée', { timeout: 20000 });
const autoKey = true;
await p.click('text=Étape suivante'); await p.waitForTimeout(500);
await p.click('text=Passer cette étape'); await p.waitForTimeout(500);            // Groq : facultatif
await p.click('text=Je préfère coller la clé moi-même'); await p.fill('#key-tavily', 'tvly-GOOD-1234567890');
await p.click('text=Vérifier et enregistrer'); await p.waitForSelector('text=Clé Tavily enregistrée', { timeout: 20000 });
await p.click('text=Terminer'); await p.waitForTimeout(800);
await p.goto('http://localhost:5175/index.html#/reglages'); await p.waitForTimeout(1500);
await p.fill('#new-topic', 'voiture BYD'); await p.click('text=Ajouter'); await p.waitForTimeout(2000); await shot('2-settings');
await p.click('text=Autoriser'); const battery = await p.evaluate(() => window.__battery === true);
await p.goto('http://localhost:5175/index.html#/'); await p.waitForTimeout(500);
await p.click('[aria-label="Actualiser"]'); await p.waitForFunction(() => document.body.innerText.includes('À jour') || document.body.innerText.includes('⚠'), null, { timeout: 120000 });
await p.waitForTimeout(500); await shot('3-feed');
const text = await p.evaluate(() => document.body.innerText);
await p.click('li button >> nth=0'); await p.waitForTimeout(1500); await shot('4-card');
await p.goto('http://localhost:5175/index.html#/fiche'); await p.waitForTimeout(1500); await shot('5-specs');
const notes = await (await p.request.get('http://localhost:5175/__notifications')).json();
console.log(JSON.stringify({ errors: errs, battery, notifications: notes.map(n => n.title),
  hasX10: text.includes('8 000 mAh'), hasByd: text.includes('BYD lance'), welcome, autoKey, opened,
  legacy: text.includes('LOFIC') }));
await b.close();
