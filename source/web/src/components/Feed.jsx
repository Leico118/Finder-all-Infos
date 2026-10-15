import { ReliabilityBadge, CompetitorBadge, Chip } from './Badge.jsx';
import { IconRefresh, IconAlert } from './Icons.jsx';
import { cardDate, timeAgo } from '../util.js';
import { useEffect, useRef, useState } from 'react';
import RefreshProgress from './RefreshProgress.jsx';

// Séparateurs par mois (date de la dernière information de la carte).
const monthKey = ts => { if (!ts) return ''; const d = new Date(ts); return `${d.getFullYear()}-${d.getMonth()}`; };
function monthLabel(ts) {
  if (!ts) return 'Date inconnue';
  const d = new Date(ts);
  const m = d.toLocaleDateString('fr-FR', { month: 'long' });
  return d.getFullYear() === new Date().getFullYear() ? m : `${m} ${d.getFullYear()}`;
}

export default function Feed({ topics, topic, setTopic, filter, setFilter, data, loading, error, refreshing, refreshMsg, progress, fresh = 0, onRefresh, onOpen, onReadAll }) {
  // Cartes arrivées pendant la lecture : si l'utilisateur a fait défiler la liste, un bouton le ramène en haut.
  const [pill, setPill] = useState(0);
  const seen = useRef(0);
  useEffect(() => {
    if (fresh > seen.current && window.scrollY > 240) setPill(n => n + fresh - seen.current);
    seen.current = fresh;
    if (!fresh) setPill(0);
  }, [fresh]);
  useEffect(() => {
    const onScroll = () => window.scrollY < 120 && setPill(0);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  const counts = data?.counts || {};
  const cards = data?.cards || [];
  const current = topics.find(t => t.id === topic) || null;
  const byId = Object.fromEntries(topics.map(t => [t.id, t]));
  const showRivals = !current ? topics.some(t => t.type === 'product') : current.type === 'product';
  const filters = [
    ['all', 'Tout'],
    ...(counts.unread > 0 || filter === 'unread' ? [['unread', 'Non lus']] : []),
    ['leaks', current?.type === 'general' ? 'Non confirmé' : 'Leaks & rumeurs'],
    ['official', 'Officiel'],
    ...(showRivals ? [['competitors', 'Concurrents']] : []),
  ];
  const unreadBy = data?.unread_by_topic || {};
  const totalUnread = Object.values(unreadBy).reduce((a, b) => a + b, 0);

  return (
    <div className="pt-safe pb-safe px-4 animate-fade">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium tracking-[0.32em] text-accent/80">RADAR · VEILLE</p>
          <h1 className="mt-1 truncate text-[24px] font-semibold uppercase tracking-[0.12em] text-ink">
            {current ? current.short || current.name : 'Mes sujets'}
          </h1>
          <p className="mt-1.5 text-xs text-muted">
            Dernière synchronisation : <span className="text-ink/80">{timeAgo(data?.last_sync)}</span>
          </p>
        </div>
        <button onClick={onRefresh} disabled={refreshing} aria-label="Actualiser"
          className="mt-2 grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-surface ring-1 ring-line text-ink/90 transition active:scale-95 disabled:opacity-60">
          <IconRefresh className={refreshing ? 'animate-spin-slow' : ''} />
        </button>
      </header>

      {/* Sujets */}
      <nav className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4" aria-label="Sujets">
        {[{ id: '', short: 'Tous' }, ...topics].map(t => {
          const active = (topic || '') === t.id;
          const n = t.id ? unreadBy[t.id] : totalUnread;
          return (
            <button key={t.id || 'all'} onClick={() => setTopic(t.id)}
              className={`relative shrink-0 rounded-2xl px-3.5 py-2 text-[13px] font-medium transition ${
                active ? 'bg-accent text-bg' : 'bg-surface text-ink/80 ring-1 ring-line active:bg-surface-2'}`}>
              {t.short || t.name}
              {n > 0 && <span className={`ml-1.5 rounded-full px-1.5 text-[10px] font-bold ${active ? 'bg-bg/20 text-bg' : 'bg-accent/20 text-accent'}`}>{n}</span>}
            </button>
          );
        })}
        <a href="#/reglages/sujets" className="shrink-0 rounded-2xl px-3.5 py-2 text-[13px] font-medium text-accent border border-dashed border-accent/40">+ Sujet</a>
      </nav>

      {data?.setup && !data.setup.ai_configured && (
        <a href="#/reglages" className="mb-4 block rounded-2xl bg-accent/10 px-4 py-3 text-sm text-ink ring-1 ring-accent/30 animate-rise">
          <b className="text-accent">Première étape :</b> collez votre clé IA gratuite dans Réglages pour que les articles soient traduits et classés →
        </a>
      )}
      {data?.setup?.ai_configured && !data.setup.search_configured && (
        <a href="#/reglages" className="mb-4 block rounded-2xl bg-accent/10 px-4 py-3 text-sm text-ink ring-1 ring-accent/30 animate-rise">
          <b className="text-accent">Recommandé :</b> ajoutez la clé de recherche gratuite Tavily pour retrouver aussi les informations des mois passés →
        </a>
      )}

      {pill > 0 && (
        <button onClick={() => { window.scrollTo({ top: 0, behavior: 'smooth' }); setPill(0); }}
          className="fixed left-1/2 top-[calc(env(safe-area-inset-top)+12px)] z-30 -translate-x-1/2 rounded-full bg-accent px-4 py-2 text-[13px] font-semibold text-bg shadow-lg shadow-black/40 animate-rise">
          ↑ {pill} nouveauté{pill > 1 ? 's' : ''}
        </button>
      )}

      {refreshing && progress ? <RefreshProgress progress={progress} /> : refreshMsg && (
        <div className="mb-4 rounded-2xl bg-surface-2 px-4 py-3 text-sm text-ink/90 ring-1 ring-line animate-rise" role="status">{refreshMsg}</div>
      )}

      <nav className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4" aria-label="Filtres">
        {filters.map(([id, label]) => {
          const n = id === 'all' ? counts.all : counts[id];
          const active = filter === id;
          return (
            <button key={id} onClick={() => setFilter(id)}
              className={`shrink-0 rounded-full px-4 py-1.5 text-[13px] font-medium transition ${
                active ? 'bg-ink text-bg' : 'bg-surface text-muted ring-1 ring-line active:bg-surface-2'}`}>
              {id === 'unread' && <span className={`mr-1.5 inline-block h-1.5 w-1.5 -translate-y-px rounded-full ${active ? 'bg-bg' : 'bg-accent'}`} />}
              {label}{n ? <span className={`ml-1.5 text-xs ${active ? 'text-bg/60' : 'text-faint'}`}>{n}</span> : null}
            </button>
          );
        })}
      </nav>

      {counts.unread > 0 && (
        <div className="mb-3 flex items-center justify-between px-1 text-xs">
          {filter === 'unread'
            ? <span className="text-muted">Les cartes lues restent ici jusqu'à ce que vous quittiez ce filtre.</span>
            : <button onClick={() => { setFilter('unread'); window.scrollTo(0, 0); }} className="flex items-center gap-2 text-accent active:opacity-70">
                <span className="h-2 w-2 rounded-full bg-accent" />
                {counts.unread} actualité{counts.unread > 1 ? 's' : ''} non consultée{counts.unread > 1 ? 's' : ''} <span className="underline underline-offset-2">Voir</span>
              </button>}
          <button onClick={onReadAll} className="shrink-0 pl-3 text-muted active:text-ink">Tout marquer comme lu</button>
        </div>
      )}

      {error && !cards.length && <div className="rounded-3xl bg-surface p-5 text-sm text-red-300 ring-1 ring-red-400/20">{error}</div>}

      {loading && !cards.length && !error && (
        <div className="space-y-3">{[0, 1, 2].map(i => <div key={i} className="h-32 animate-pulse rounded-3xl bg-surface" />)}</div>
      )}

      {!loading && !error && !cards.length && filter === 'unread' && (
        <div className="rounded-3xl bg-surface p-6 text-center ring-1 ring-line">
          <p className="text-sm text-ink">✔ Tout est lu.</p>
          <button onClick={() => setFilter('all')} className="mt-2 text-xs text-accent underline underline-offset-2">Voir toutes les actualités</button>
        </div>
      )}

      {!loading && !error && !cards.length && filter !== 'unread' && (
        <div className="rounded-3xl bg-surface p-6 text-center ring-1 ring-line">
          <p className="text-sm text-ink">Aucune actualité ici pour le moment.</p>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            Les sources sont interrogées chaque jour à 8 h, puis les articles sont analysés petit à petit. Seules les informations
            réellement publiées apparaissent : un sujet tout juste ajouté se remplit au fil de la première collecte.
          </p>
        </div>
      )}

      <ul>
        {cards.map((c, i) => {
          const t = byId[c.topic_id];
          const month = monthKey(c.latest_at);
          const newMonth = i === 0 || month !== monthKey(cards[i - 1].latest_at);
          return (
            <li key={c.id} className={`animate-rise ${newMonth ? '' : 'mt-3'}`} style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}>
              {newMonth && (
                <div className={`flex items-center gap-3 px-1 pb-3 ${i === 0 ? 'pt-0' : 'pt-7'}`}>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent/80">{monthLabel(c.latest_at)}</span>
                  <span className="h-px flex-1 bg-line" />
                </div>
              )}
              <button onClick={() => onOpen(c.id)}
                className="block w-full rounded-3xl bg-surface p-4 text-left ring-1 ring-line transition active:scale-[0.985] active:bg-surface-2">
                <div className="mb-2 flex items-center justify-between gap-2 text-xs text-muted">
                  <span className="flex min-w-0 items-center gap-2">
                    {!topic && t && <span className="truncate font-medium text-accent/90">{t.short || t.name}</span>}
                    {!topic && t && <span className="text-faint">·</span>}
                    <span className="shrink-0">{cardDate(c.latest_at)}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {c.updated_since_read && <span className="text-accent">Mis à jour</span>}
                    {c.unread && <span className="h-2 w-2 rounded-full bg-accent" aria-label="Non lue" />}
                  </span>
                </div>
                <h2 className={`text-[15px] font-semibold leading-snug ${c.unread ? 'text-ink' : 'text-ink/75'}`}>{c.title}</h2>
                {c.summary && <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-muted">{c.summary}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {c.category === 'competitor' && <CompetitorBadge small />}
                  <ReliabilityBadge value={c.reliability} small type={t?.type} />
                  {c.category === 'competitor' && c.competitor_model && <Chip>{c.competitor_model}</Chip>}
                  <Chip>{c.source_count} source{c.source_count > 1 ? 's' : ''}</Chip>
                  {c.contradiction && <Chip className="text-amber-300"><IconAlert /> Contradiction</Chip>}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
