import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import Feed from './components/Feed.jsx';
import CardDetail from './components/CardDetail.jsx';
import Specs from './components/Specs.jsx';
import Settings from './components/Settings.jsx';
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
  if (h.startsWith('/reglages')) return { view: 'settings', topics: h.includes('sujets') };
  return { view: 'feed' };
}

export default function App() {
  const [route, setRoute] = useState(parseHash);
  const [topics, setTopics] = useState([]);
  const [topic, setTopicState] = useState(() => store.get('radar-topic') || '');
  const [filter, setFilter] = useState('all');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState('');
  const scrollPos = useRef(0);
  const navigatedInApp = useRef(false);
  const syncing = useRef(false);

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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.cards(filter, topic));
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [filter, topic]);

  useEffect(() => { loadTopics(); }, []);
  useEffect(() => { load(); }, [filter, topic]);

  const setTopic = id => {
    setTopicState(id);
    store.set('radar-topic', id);
    const t = topics.find(x => x.id === id);
    if (filter === 'competitors' && t && t.type !== 'product') setFilter('all');
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
    else window.location.hash = '#/';
  };

  const wait = ms => new Promise(r => setTimeout(r, ms));

  // mode 'auto' : à l'ouverture (termine la collecte du jour et l'analyse) ; 'manual' : bouton Actualiser.
  // Les passages s'enchaînent tant qu'il reste des articles en attente.
  async function refresh({ auto = false } = {}) {
    if (syncing.current) return;
    syncing.current = true;
    setRefreshing(true);
    let created = 0, updated = 0, fresh = 0, busyTries = 0, lastErr = '';
    try {
      for (let pass = 1; pass <= 30; pass++) {
        setRefreshMsg(pass === 1
          ? (auto ? 'Mise à jour en cours…' : 'Recherche dans toutes les sources de vos sujets…')
          : `Analyse des articles en attente… (passage ${pass})`);
        let r;
        try {
          r = await api.refresh(auto || pass > 1 ? 'auto' : 'manual');
        } catch (e) {
          if (e.status === 409 && busyTries++ < 14) {           // collecte de fond en cours
            setRefreshMsg('Une autre synchronisation se termine, nouvel essai dans 20 secondes…');
            await wait(20000); pass--; continue;
          }
          throw e;
        }
        created += r.created || 0; updated += r.updated || 0;
        fresh += (r.sources || []).reduce((a, s) => a + (s.inserted || 0), 0);
        lastErr = (r.errors || []).join(' ');
        await load();
        if (r.collected) loadTopics();
        if (!r.pending) break;
        setRefreshMsg(`${r.pending} article${r.pending > 1 ? 's' : ''} en attente d'analyse…`);
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
      syncing.current = false;
      setRefreshing(false);
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
    { id: 'specs', hash: '#/fiche', label: 'Fiche technique', Icon: IconSpecs },
    { id: 'settings', hash: '#/reglages', label: 'Réglages', Icon: IconSettings },
  ];
  const activeTab = route.view === 'card' ? 'feed' : route.view;
  const currentTopic = topics.find(t => t.id === topic);

  return (
    <div className="mx-auto min-h-screen max-w-xl">
      {route.view === 'feed' && (
        <Feed topics={topics} topic={topic} setTopic={setTopic} filter={filter} setFilter={setFilter} data={data} loading={loading}
          error={error} refreshing={refreshing} refreshMsg={refreshMsg} onRefresh={() => refresh()} onOpen={id => go(`#/carte/${id}`)}
          onReadAll={readAll} />
      )}
      {route.view === 'card' && <CardDetail id={route.id} onBack={back} onRead={() => load()} />}
      {route.view === 'specs' && <Specs onOpenCard={id => go(`#/carte/${id}`)} topic={currentTopic?.type === 'product' ? topic : ''} />}
      {route.view === 'settings' && (
        <Settings onRefresh={() => refresh()} refreshing={refreshing} refreshMsg={refreshMsg}
          onTopicsChanged={() => { loadTopics(); load(); }} focusTopics={route.topics} />
      )}

      <nav className="nav-safe fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bg/85 backdrop-blur-xl">
        <ul className="mx-auto flex max-w-xl justify-around px-2 pt-2">
          {tabs.map(({ id, hash, label, Icon, badge }) => {
            const active = activeTab === id;
            return (
              <li key={id} className="flex-1">
                <button onClick={() => { navigatedInApp.current = false; window.location.hash = hash; }}
                  className="flex w-full flex-col items-center gap-1 py-1 text-[11px]">
                  <span className={`relative grid h-8 w-16 place-items-center rounded-full transition ${active ? 'bg-accent/15 text-accent' : 'text-muted'}`}>
                    <Icon />
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
      </nav>
    </div>
  );
}
