import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import Feed from './components/Feed.jsx';
import CardDetail from './components/CardDetail.jsx';
import Specs from './components/Specs.jsx';
import Settings from './components/Settings.jsx';
import { SimpleFeed, Welcome } from './components/Simple.jsx';
import KeySetup from './components/KeySetup.jsx';
import Tutorial, { FIRST_STEPS, FIRST_STEPS_TOPICS } from './components/Tutorial.jsx';
import { IconNews, IconSpecs, IconSettings } from './components/Icons.jsx';

const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* stockage indisponible */ } },
};

function parseHash() {
  const h = window.location.hash.replace(/^#/, '') || '/';
  const m = h.match(/^\/carte\/([\w-]+)/);
  if (m) return { view: 'card', id: m[1] };
  if (h.startsWith('/fiche')) return { view: 'specs' };
  if (h.startsWith('/cles')) return { view: 'keys', step: h.split('/')[2] || '' };
  if (h.startsWith('/reglages')) return { view: 'settings', topics: h.includes('sujets') };
  const st = h.match(/^\/s\/([^/]+)/);                     // mode simplifié : nouvelles d'un sujet (« tout » = tous)
  if (st) return { view: 'feed', stopic: decodeURIComponent(st[1]) };
  return { view: 'feed' };
}

export default function App() {
  const [route, setRoute] = useState(parseHash);
  // Mode d'affichage : 'simple' ou 'full' ; 'welcome' au premier lancement (choix proposé). Copie locale pour un affichage immédiat.
  const [mode, setMode] = useState(() => store.get('radar-mode') || '');
  const [topics, setTopics] = useState([]);
  const [topic, setTopicState] = useState(() => store.get('radar-topic') || '');
  const [filter, setFilterState] = useState('all');
  const [unreadOnly, setUnreadOnlyState] = useState(false);  // « Non lus » : bouton à part, combiné avec le filtre
  const unreadSince = useRef(0);                          // début de la consultation des non lus
  const setUnreadOnly = v => { if (v) unreadSince.current = Date.now(); setUnreadOnlyState(v); };
  const setFilter = f => {
    if (f === 'unread') { setUnreadOnly(true); return; }
    setFilterState(f);
  };
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState('');
  const [progress, setProgress] = useState(null);         // avancement en direct de l'actualisation
  const [fresh, setFresh] = useState(0);                  // cartes arrivées pendant l'actualisation
  const scrollPos = useRef(0);
  const navigatedInApp = useRef(false);
  const syncing = useRef(false);
  const [tuto, setTuto] = useState(false);                 // guide de démarrage affiché par-dessus l'application
  const closeTuto = target => { setTuto(false); if (target) window.location.hash = target; };

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    window.radarNavigate = r => { window.location.hash = `#${r}`; };       // ouverture depuis une notification
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const loadTopics = useCallback(async () => {
    try {
      const r = await api.topics();
      setTopics(r.topics);
      setTopicState(t => (t && !r.topics.some(x => x.id === t) ? '' : t));
    } catch { /* affiché par la liste */ }
  }, []);

  // Toujours le sujet et le filtre affichés à l'instant (et non ceux du début d'une actualisation),
  // et seule la réponse la plus récente est affichée : pas de mélange si l'on change de sujet en cours de route.
  const view = useRef({ filter, topic, unreadOnly });
  view.current = { filter, topic, unreadOnly };
  const loadSeq = useRef(0);
  const load = useCallback(async ({ quiet = false } = {}) => {
    const seq = ++loadSeq.current;
    const { filter: f, topic: t, unreadOnly: u } = view.current;
    if (!quiet) setLoading(true);
    try {
      const d = await api.cards(f, t, u ? unreadSince.current : undefined, u);
      if (seq !== loadSeq.current || view.current.filter !== f || view.current.topic !== t || view.current.unreadOnly !== u) return;   // réponse dépassée
      setData(d);
      setError('');
    } catch (e) {
      if (seq === loadSeq.current) setError(e.message);
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => { loadTopics(); }, []);
  useEffect(() => { if (route.view === 'settings' && route.topics) store.set(FIRST_STEPS_TOPICS, '1'); }, [route]);
  useEffect(() => {
    api.status().then(st => {
      const m = st.ui_mode || (st.ai?.configured ? 'full' : 'welcome');   // installation existante : mode complet
      setMode(m);
      if (m !== 'welcome') store.set('radar-mode', m);
    }).catch(() => setMode(m => m || 'full'));
  }, []);
  const changeMode = async m => {
    setMode(m);
    store.set('radar-mode', m);
    if (m === 'simple') { setFilterState('all'); setUnreadOnlyState(false); if (route.view === 'specs') window.location.hash = '#/'; }
    try { await api.setup({ ui_mode: m }); } catch { /* conservé localement */ }
  };
  const simple = mode === 'simple';
  useEffect(() => { load(); }, [filter, topic, unreadOnly]);

  const setTopic = id => {
    setTopicState(id);
    store.set('radar-topic', id);
    const t = topics.find(x => x.id === id);
    if (filter === 'competitors' && t && t.type !== 'product') setFilter('all');
    if (unreadOnly) unreadSince.current = Date.now();
  };

  useEffect(() => {
    const onVis = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [load]);

  useEffect(() => {
    if (route.view === 'feed') requestAnimationFrame(() => window.scrollTo(0, scrollPos.current));
    else if (!route.topics) window.scrollTo(0, 0);
  }, [route.view]);

  const go = hash => {
    if (route.view === 'feed') scrollPos.current = window.scrollY;
    navigatedInApp.current = true;
    window.location.hash = hash;
  };
  const back = () => {
    if (navigatedInApp.current && window.history.length > 1) window.history.back();
    else window.location.replace('#/');
  };

  // Bouton retour d'Android : Radar décide lui-même où revenir (et quand quitter l'application).
  const routeRef = useRef(route);
  routeRef.current = route;
  useEffect(() => {
    window.radarBack = () => {
      const r = routeRef.current;
      if (document.querySelector('[role=dialog]')) { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); return 'ok'; }
      if (r.view === 'card') { back(); return 'ok'; }                                  // article → liste d'où il venait
      if (r.view === 'keys') { window.location.replace('#/reglages'); return 'ok'; }
      if (r.view === 'feed' && r.stopic) { window.location.replace('#/'); return 'ok'; }  // sujet (mode simple) → accueil des sujets
      if (r.view !== 'feed') { window.location.replace('#/'); return 'ok'; }            // Réglages, fiche → actualités
      return 'exit';                                                                  // accueil : quitter
    };
    return () => { window.radarBack = null; };
  }, []);

  const wait = ms => new Promise(r => setTimeout(r, ms));

  // mode 'auto' : à l'ouverture (termine la collecte du jour et l'analyse) ; 'manual' : bouton Actualiser.
  // Les passages s'enchaînent tant qu'il reste des articles en attente.
  async function refresh({ auto = false } = {}) {
    if (syncing.current) return;
    syncing.current = true;
    setRefreshing(true);
    setFresh(0);
    let created = 0, updated = 0, fresh = 0, busyTries = 0, lastErr = '';
    let reloadTimer = null;
    const reloadSoon = () => {                                 // nouvelles cartes : affichées sans attendre la fin
      if (reloadTimer) return;
      reloadTimer = setTimeout(() => { reloadTimer = null; load({ quiet: true }); }, 300);
    };
    try {
      for (let pass = 1; pass <= 30; pass++) {
        setRefreshMsg('');
        setProgress({ phase: pass === 1 ? 'start' : 'cards', created, updated, pending: null });
        let r;
        const base = { created, updated };
        try {
          r = await api.refresh(auto || pass > 1 ? 'auto' : 'manual', ev => {
            if (ev.phase === 'cards') {
              const c = base.created + (ev.created || 0), u = base.updated + (ev.updated || 0);
              if (c + u > created + updated) { setFresh(c + u); reloadSoon(); }
              created = c; updated = u;
              setProgress(p => ({ ...p, phase: p?.phase === 'collect' || p?.phase === 'web' ? p.phase : 'cards', created: c, updated: u,
                pending: ev.pending, analyzed: ev.analyzed }));
            } else {
              setProgress(p => ({ ...p, ...ev }));
            }
          });
        } catch (e) {
          if (e.status === 409 && busyTries++ < 14) {           // autre synchronisation en cours
            setProgress(null);
            setRefreshMsg('Une autre synchronisation se termine, nouvel essai dans 20 secondes…');
            await wait(20000); pass--; continue;
          }
          throw e;
        }
        created = base.created + (r.created || 0); updated = base.updated + (r.updated || 0);
        fresh += (r.sources || []).reduce((a, s) => a + (s.inserted || 0), 0);
        lastErr = (r.errors || []).join(' ');
        await load({ quiet: true });
        if (r.collected) loadTopics();
        if (!r.pending) break;
        setProgress(p => ({ ...p, phase: 'cards', pending: r.pending }));
        if (!r.analyzed && lastErr) break;
      }
      const parts = [];
      if (fresh) parts.push(`${fresh} nouvel${fresh > 1 ? 's' : ''} article${fresh > 1 ? 's' : ''} trouvé${fresh > 1 ? 's' : ''}`);
      if (created) parts.push(`${created} nouvelle${created > 1 ? 's' : ''} carte${created > 1 ? 's' : ''}`);
      if (updated) parts.push(`${updated} carte${updated > 1 ? 's' : ''} mise${updated > 1 ? 's' : ''} à jour`);
      setRefreshMsg(lastErr ? `⚠ ${lastErr}` : (auto && !parts.length ? '' : `✔ À jour${parts.length ? ' : ' + parts.join(' · ') : ', aucune nouveauté'}.`));
    } catch (e) {
      setRefreshMsg(auto && e.status === 0 ? '' : e.message);
    } finally {
      if (reloadTimer) clearTimeout(reloadTimer);
      syncing.current = false;
      setRefreshing(false);
      setProgress(null);
      setTimeout(() => setRefreshMsg(''), 8000);
    }
  }

  // Pas d'actualisation à l'ouverture : uniquement avec le bouton « Actualiser » (et la collecte de 8 h si elle est activée).

  async function readAll() {
    await api.readAll(topic).catch(() => {});
    load();
  }

  const unread = Object.values(data?.unread_by_topic || {}).reduce((a, b) => a + b, 0);
  const tabs = [
    { id: 'feed', hash: '#/', label: 'Actualités', Icon: IconNews, badge: unread },
    ...(simple ? [] : [{ id: 'specs', hash: '#/fiche', label: 'Fiches', Icon: IconSpecs }]),
    { id: 'settings', hash: '#/reglages', label: 'Réglages', Icon: IconSettings },
  ];
  const activeTab = route.view === 'card' ? 'feed' : route.view;
  const currentTopic = topics.find(t => t.id === topic);

  if (mode === 'welcome') {
    return <div className="mx-auto min-h-screen max-w-xl"><Welcome onChoose={m => { changeMode(m); store.set(FIRST_STEPS, '1'); window.location.hash = '#/'; setTuto(true); }} /></div>;
  }

  return (
    <div className={`mx-auto min-h-screen max-w-xl ${simple ? 'simple-ui' : ''}`}>
      {route.view === 'feed' && simple && (
        <SimpleFeed topics={topics} topic={topic} setTopic={setTopic} stopic={route.stopic} data={data} loading={loading} error={error}
          refreshing={refreshing} refreshMsg={refreshMsg} progress={progress} onRefresh={() => refresh()} onOpen={id => go(`#/carte/${id}`)} />
      )}
      {route.view === 'feed' && !simple && (
        <Feed topics={topics} topic={topic} setTopic={setTopic} filter={filter} setFilter={setFilter} unreadOnly={unreadOnly} setUnreadOnly={setUnreadOnly} data={data} loading={loading}
          error={error} refreshing={refreshing} refreshMsg={refreshMsg} progress={progress} fresh={fresh}
          onRefresh={() => refresh()} onOpen={id => go(`#/carte/${id}`)}
          onReadAll={readAll} />
      )}
      {route.view === 'keys' && (
        <KeySetup startAt={route.step} onFinish={() => { loadTopics(); load(); window.location.hash = '#/'; }} />
      )}
      {route.view === 'card' && <CardDetail id={route.id} onBack={back} onRead={() => load()} simple={simple} />}
      {route.view === 'specs' && !simple && <Specs onOpenCard={id => go(`#/carte/${id}`)} topic={topic} />}
      {route.view === 'settings' && (
        <Settings onRefresh={() => refresh()} refreshing={refreshing} refreshMsg={refreshMsg} progress={progress}
          onTopicsChanged={() => { loadTopics(); load(); }} focusTopics={route.topics} simple={simple} onModeChange={changeMode}
          onTutorial={() => setTuto(true)} />
      )}

      {tuto && <Tutorial simple={simple} onClose={closeTuto} />}

      {route.view !== 'keys' && <nav className="app-nav nav-safe fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bg/85 backdrop-blur-xl">
        <ul className="mx-auto flex max-w-xl justify-around px-2 pt-2">
          {tabs.map(({ id, hash, label, Icon, badge }) => {
            const active = activeTab === id;
            return (
              <li key={id} className="flex-1">
                <button onClick={() => { navigatedInApp.current = false; window.location.replace(hash); }}
                  className={`flex w-full flex-col items-center gap-1 py-1 ${simple ? 'text-[15px]' : 'text-[11px]'}`}>
                  <span className={`relative grid place-items-center rounded-full transition ${simple ? 'h-10 w-20' : 'h-8 w-16'} ${active ? 'bg-accent/15 text-accent' : 'text-muted'}`}>
                    <Icon {...(simple ? { width: 28, height: 28 } : {})} />
                    {badge > 0 && (
                      <span className="absolute -right-0.5 -top-1 min-w-[18px] rounded-full bg-accent px-1 text-center text-[10px] font-bold leading-[18px] text-bg">
                        {badge > 99 ? '99+' : badge}
                      </span>
                    )}
                  </span>
                  <span className={active ? 'font-medium text-ink' : 'text-muted'}>{label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>}
    </div>
  );
}
