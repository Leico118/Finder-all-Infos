import { ReliabilityBadge, CompetitorBadge, Chip } from './Badge.jsx';
import { IconRefresh, IconAlert } from './Icons.jsx';
import { cardDate, timeAgo, monthKey, monthLabel } from '../util.js';
import { useEffect, useRef, useState } from 'react';
import RefreshProgress from './RefreshProgress.jsx';
import { FirstSteps, FIRST_STEPS, firstStepsStore } from './Tutorial.jsx';

export default function Feed({ topics, topic, setTopic, filter, setFilter, unreadOnly = false, setUnreadOnly, data, loading, error, refreshing, refreshMsg, progress, fresh = 0, onRefresh, onOpen, onReadAll }) {
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
    ['leaks', current?.type === 'general' ? 'Non confirmé' : 'Leaks'],
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

      {/* Sujets : onglets soulignés (façon rubriques de journal), distincts des filtres */}
      <nav className="no-scrollbar -mx-4 mb-4 flex items-end gap-6 overflow-x-auto border-b border-line px-4" aria-label="Sujets">
        {[{ id: '', short: 'Tous' }, ...topics].map(t => {
          const active = (topic || '') === t.id;
          const n = t.id ? unreadBy[t.id] : totalUnread;
          return (
            <button key={t.id || 'all'} onClick={() => setTopic(t.id)} aria-current={active ? 'page' : undefined}
              className={`relative shrink-0 pb-3 pt-1 text-[15px] font-medium transition ${active ? 'text-ink' : 'text-muted active:text-ink'}`}>
              {t.short || t.name}
              {n > 0 && <sup className="ml-1 text-[11px] font-bold text-accent">{n}</sup>}
              {active && <span className="absolute inset-x-0 -bottom-px h-[3px] rounded-full bg-accent" />}
            </button>
          );
        })}
        <a href="#/reglages/sujets" aria-label="Ajouter un sujet"
          className="mb-2 grid h-8 w-8 shrink-0 place-items-center rounded-full text-[18px] leading-none text-accent ring-1 ring-accent/40 active:bg-accent/10">+</a>
      </nav>

      {data?.setup && <FirstSteps aiConfigured={data.setup.ai_configured} lastSync={data.last_sync} onRefresh={onRefresh} refreshing={refreshing} />}
      {data?.setup && !data.setup.ai_configured && firstStepsStore.get(FIRST_STEPS) !== '1' && (
        <a href="#/cles" className="mb-4 block rounded-2xl bg-accent/10 px-4 py-3 text-sm text-ink ring-1 ring-accent/30 animate-rise">
          <b className="text-accent">Première étape :</b> configurez Radar en quelques minutes pour que les articles soient traduits et classés →
        </a>
      )}
      {data?.setup?.ai_configured && !data.setup.search_configured && (
        <a href="#/cles/tavily" className="mb-4 block rounded-2xl bg-accent/10 px-4 py-3 text-sm text-ink ring-1 ring-accent/30 animate-rise">
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

      {/* Filtres : un seul sélecteur compact */}
      <div className="no-scrollbar mb-3 flex overflow-x-auto rounded-2xl bg-surface p-1 ring-1 ring-line" role="tablist" aria-label="Filtres">
        {filters.map(([id, label]) => {
          const n = id === 'all' ? counts.all : counts[id];
          const active = filter === id;
          return (
            <button key={id} onClick={() => setFilter(id)} role="tab" aria-selected={active}
              className={`min-w-fit flex-1 whitespace-nowrap rounded-xl px-3 py-2 text-[13px] font-medium transition ${active ? 'bg-ink text-bg' : 'text-muted active:text-ink'}`}>
              {label}{n ? <span className={`ml-1 text-[11px] ${active ? 'text-bg/60' : 'text-faint'}`}>{n}</span> : null}
            </button>
          );
        })}
      </div>

      {/* Non lus : à part, se combine avec le filtre choisi */}
      {(counts.unread > 0 || unreadOnly) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          <button onClick={() => { setUnreadOnly(!unreadOnly); window.scrollTo(0, 0); }} aria-pressed={unreadOnly}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-semibold transition active:scale-95 ${
              unreadOnly ? 'bg-accent text-bg' : 'text-accent ring-1 ring-accent/45'}`}>
            <span className={`h-2 w-2 rounded-full ${unreadOnly ? 'bg-bg' : 'bg-accent'}`} />
            {unreadOnly ? 'Non lus uniquement' : 'Non lus'}
            {counts.unread > 0 && <span className={unreadOnly ? 'text-bg/70' : 'text-accent/70'}>{counts.unread}</span>}
            {unreadOnly && <span aria-hidden className="ml-0.5">✕</span>}
          </button>
          {counts.unread > 0 && <button onClick={onReadAll} className="shrink-0 text-xs text-muted active:text-ink">Tout marquer comme lu</button>}
        </div>
      )}

      {error && !cards.length && <div className="rounded-3xl bg-surface p-5 text-sm text-red-300 ring-1 ring-red-400/20">{error}</div>}

      {loading && !cards.length && !error && (
        <div className="space-y-3">{[0, 1, 2].map(i => <div key={i} className="h-32 animate-pulse rounded-3xl bg-surface" />)}</div>
      )}

      {!loading && !error && !cards.length && unreadOnly && (
        <div className="rounded-3xl bg-surface p-6 text-center ring-1 ring-line">
          <p className="text-sm text-ink">✔ Tout est lu.</p>
          <button onClick={() => setUnreadOnly(false)} className="mt-2 text-xs text-accent underline underline-offset-2">Voir toutes les actualités</button>
        </div>
      )}

      {!loading && !error && !cards.length && filter !== 'unread' && (
        <div className="rounded-3xl bg-surface p-6 text-center ring-1 ring-line">
          <p className="text-sm text-ink">Aucune actualité ici pour le moment.</p>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            Les sources sont interrogées avec « Actualiser » ou chaque jour à l'heure choisie dans Réglages, puis les articles sont analysés petit à petit. Seules les informations
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
