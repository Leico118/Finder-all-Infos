// Page invisible lancée par Android toutes les heures (tâche de fond) : collecte du jour et analyse.
import { getEngine } from './native.js';

(async () => {
  let result;
  try {
    const r = await getEngine().handle('POST', '/api/refresh?mode=background', null);
    result = r.data;
  } catch (e) {
    result = { error: e.message || String(e) };
  }
  window.RadarBridge.done(JSON.stringify(result));
})();
