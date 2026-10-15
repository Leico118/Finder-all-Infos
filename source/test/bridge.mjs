// Imitation, en Node, du pont SQLite Android (mêmes entrées/sorties JSON que RadarBridge.java).
import { DatabaseSync } from 'node:sqlite';

export function makeBridge(file = ':memory:') {
  const db = new DatabaseSync(file);
  const bind = params => JSON.parse(params || '[]').map(v => (typeof v === 'number' && Number.isInteger(v) ? BigInt(v) : v));
  const norm = row => row && Object.fromEntries(Object.entries(row).map(([k, v]) => [k, typeof v === 'bigint' ? Number(v) : v]));
  const exec = (sql, params, mode) => {
    const st = db.prepare(sql);
    st.setReadBigInts(true);
    if (mode === 'all') return { rows: st.all(...bind(params)).map(norm) };
    if (mode === 'first') return { row: norm(st.get(...bind(params))) ?? null };
    const r = st.run(...bind(params));
    return { changes: Number(r.changes), lastId: Number(r.lastInsertRowid) };
  };
  return {
    db,
    sql(sql, params, mode) {
      try { return JSON.stringify(exec(sql, params, mode)); } catch (e) { return JSON.stringify({ error: e.message }); }
    },
    batch(json) {
      const list = JSON.parse(json);
      try {
        db.exec('BEGIN');
        const results = list.map(s => ({ changes: exec(s.sql, JSON.stringify(s.params || []), 'run').changes }));
        db.exec('COMMIT');
        return JSON.stringify({ results });
      } catch (e) {
        try { db.exec('ROLLBACK'); } catch { /* déjà annulée */ }
        return JSON.stringify({ error: e.message });
      }
    },
  };
}
