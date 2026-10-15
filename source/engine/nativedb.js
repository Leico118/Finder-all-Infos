// Base SQLite du téléphone, exposée au moteur avec la même interface que Cloudflare D1
// (prepare().bind().run()/all()/first() et batch()). Le pont natif répond en JSON.
function check(json) {
  const r = JSON.parse(json);
  if (r.error) throw new Error(`SQLite : ${r.error}`);
  return r;
}
const clean = args => args.map(v => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v));

class Statement {
  constructor(bridge, sql) { this.bridge = bridge; this.sql = sql; this.args = []; }
  bind(...args) { this.args = clean(args); return this; }
  async run() { const r = check(this.bridge.sql(this.sql, JSON.stringify(this.args), 'run')); return { meta: { changes: r.changes, last_row_id: r.lastId } }; }
  async all() { return { results: check(this.bridge.sql(this.sql, JSON.stringify(this.args), 'all')).rows }; }
  async first() { return check(this.bridge.sql(this.sql, JSON.stringify(this.args), 'first')).row ?? null; }
}

export function nativeDB(bridge) {
  return {
    prepare: sql => new Statement(bridge, sql),
    async batch(stmts) {
      const r = check(bridge.batch(JSON.stringify(stmts.map(s => ({ sql: s.sql, params: s.args })))));
      return r.results.map(x => ({ meta: { changes: x.changes } }));
    },
  };
}
