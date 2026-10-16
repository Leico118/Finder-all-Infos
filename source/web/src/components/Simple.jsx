// Mode simplifié : gros caractères, l'essentiel seulement (pensé pour une utilisation sans effort).
import { useEffect, useState } from 'react';
import { IconRefresh, IconBack, IconExternal } from './Icons.jsx';
import RefreshProgress from './RefreshProgress.jsx';
import { monthKey, monthLabel, plainDate, timeAgo } from '../util.js';

export const SIMPLE_REL = {
  official: { label: 'Confirmé officiellement', dot: 'bg-emerald-400', text: 'text-emerald-300' },
  reliable: { label: 'Source sérieuse', dot: 'bg-sky-400', text: 'text-sky-300' },
  rumor: { label: 'Rumeur', dot: 'bg-orange-400', text: 'text-orange-300' },
  unverified: { label: 'Pas vérifié', dot: 'bg-zinc-400', text: 'text-zinc-300' },
};

export function SimpleReliability({ value, big = false }) {
  const r = SIMPLE_REL[value] || SIMPLE_REL.unverified;
  return (
    <span className={`inline-flex items-center gap-2 font-medium ${r.text} ${big ? 'text-[17px]' : 'text-[15px]'}`}>
      <span className={`h-3 w-3 rounded-full ${r.dot}`} aria-hidden />{r.label}
    </span>
  );
}

export function BigButton({ children, className = '', ...p }) {
  return (
    <button {...p} className={`flex w-full items-center justify-center gap-3 rounded-2xl px-5 py-4 text-[18px] font-semibold transition active:scale-[0.98] disabled:opacity-60 ${className}`}>
      {children}
    </button>
  );
}

// ---------- Liste des actualités ----------
// Avec plusieurs sujets, l'écran d'accueil présente un grand bouton par sujet ; on entre dans un sujet,
// puis « Mes sujets » ramène à l'accueil. Le choix est conservé en revenant d'une actualité.
let simpleHome = true;
export function goSimpleHome() { simpleHome = true; window.dispatchEvent(new Event('radar-simple-home')); }

function nouvelles(n) {
  return n > 0 ? `${n} nouvelle${n > 1 ? 's' : ''} à lire` : 'Rien de nouveau';
}

export function SimpleFeed({ topics, topic, setTopic, data, loading, error, refreshing, refreshMsg, progress, onRefresh, onOpen }) {
  const multi = topics.length > 1;
  const [home, setHomeState] = useState(multi && simpleHome);
  const setHome = v => { simpleHome = v; setHomeState(v); window.scrollTo(0, 0); };
  useEffect(() => { if (!multi && home) setHomeState(false); }, [multi]);
  useEffect(() => {                                       // onglet « Actualités » touché : retour à l'accueil des sujets
    const onHome = () => multi && setHome(true);
    window.addEventListener('radar-simple-home', onHome);
    return () => window.removeEventListener('radar-simple-home', onHome);
  }, [multi]);

  const cards = data?.cards || [];
  const current = topics.find(t => t.id === topic) || null;
  const byId = Object.fromEntries(topics.map(t => [t.id, t]));
  const unreadBy = data?.unread_by_topic || {};
  const unreadAll = Object.values(unreadBy).reduce((a, b) => a + b, 0);
  const unreadHere = topic ? unreadBy[topic] || 0 : unreadAll;
  const open = id => { setTopic(id); setHome(false); };

  const refreshBlock = (
    <>
      <BigButton onClick={onRefresh} disabled={refreshing} className="mb-4 bg-ink text-bg">
        <IconRefresh width={26} height={26} className={refreshing ? 'animate-spin-slow' : ''} />
        {refreshing ? 'Recherche en cours…' : 'Chercher les nouvelles'}
      </BigButton>
      {refreshing && progress && <RefreshProgress progress={progress} />}
      {!refreshing && refreshMsg && <p className="mb-4 rounded-2xl bg-surface-2 px-4 py-3 text-[16px] text-ink/90 ring-1 ring-line" role="status">{refreshMsg}</p>}
      {data?.setup && !data.setup.ai_configured && (
        <a href="#/reglages" className="mb-4 block rounded-2xl bg-accent/10 px-5 py-4 text-[17px] text-ink ring-1 ring-accent/30">
          Il reste un réglage à faire avant de pouvoir lire les nouvelles. <span className="text-accent underline">Ouvrir les réglages</span>
        </a>
      )}
    </>
  );

  // ---- Accueil : un grand bouton par sujet ----
  if (home && multi) {
    return (
      <div className="pt-safe pb-safe px-4 animate-fade">
        <header className="mb-4">
          <h1 className="text-[30px] font-semibold leading-tight text-ink">Mes sujets</h1>
          <p className="mt-1 text-[16px] text-muted">Touchez un sujet pour lire ses nouvelles.</p>
        </header>
        {refreshBlock}
        <ul className="space-y-3">
          {topics.map(t => {
            const n = unreadBy[t.id] || 0;
            return (
              <li key={t.id}>
                <button onClick={() => open(t.id)}
                  className={`flex w-full items-center gap-4 rounded-3xl p-5 text-left ring-1 transition active:scale-[0.99] ${n ? 'bg-surface ring-accent/40' : 'bg-surface/70 ring-line'}`}>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[21px] font-semibold leading-snug text-ink">{t.name}</span>
                    <span className={`mt-1 block text-[17px] ${n ? 'font-medium text-accent' : 'text-muted'}`}>{nouvelles(n)}</span>
                  </span>
                  {n > 0 && <span className="grid h-11 min-w-11 shrink-0 place-items-center rounded-full bg-accent px-2 text-[19px] font-bold text-bg">{n > 99 ? '99+' : n}</span>}
                  <span className="shrink-0 text-[28px] leading-none text-faint" aria-hidden>›</span>
                </button>
              </li>
            );
          })}
          <li>
            <button onClick={() => open('')}
              className="flex w-full items-center justify-between gap-4 rounded-3xl border border-dashed border-line p-5 text-left active:scale-[0.99]">
              <span>
                <span className="block text-[19px] font-medium text-ink/90">Toutes les nouvelles</span>
                <span className="mt-1 block text-[16px] text-muted">Tous les sujets mélangés, des plus récentes aux plus anciennes</span>
              </span>
              <span className="text-[28px] leading-none text-faint" aria-hidden>›</span>
            </button>
          </li>
        </ul>
      </div>
    );
  }

  // ---- Nouvelles d'un sujet (ou de tous) ----
  return (
    <div className="pt-safe pb-safe px-4 animate-fade">
      {multi && (
        <button onClick={() => setHome(true)} className="mb-3 -ml-1 flex items-center gap-1.5 rounded-full py-1.5 pr-3 text-[18px] text-accent active:opacity-70">
          <IconBack width={24} height={24} /> Mes sujets
        </button>
      )}
      <header className="mb-4">
        <h1 className="text-[30px] font-semibold leading-tight text-ink">{current ? current.name : (multi ? 'Toutes les nouvelles' : 'Actualités')}</h1>
        <p className="mt-1 text-[16px] text-muted">
          {unreadHere > 0 ? <span className="text-accent">{nouvelles(unreadHere)}</span> : 'Tout est lu'}
          {' · '}mis à jour {timeAgo(data?.last_sync)}
        </p>
      </header>
      {refreshBlock}

      {error && !cards.length && <div className="rounded-3xl bg-surface p-5 text-[16px] text-red-300 ring-1 ring-red-400/20">{error}</div>}
      {loading && !cards.length && !error && <div className="space-y-4">{[0, 1].map(i => <div key={i} className="h-40 animate-pulse rounded-3xl bg-surface" />)}</div>}
      {!loading && !error && !cards.length && (
        <div className="rounded-3xl bg-surface p-6 text-center ring-1 ring-line">
          <p className="text-[18px] text-ink">Pas encore de nouvelles ici.</p>
          <p className="mt-2 text-[16px] text-muted">Touchez « Chercher les nouvelles » ci-dessus.</p>
        </div>
      )}

      <ul>
        {cards.map((c, i) => {
          const t = byId[c.topic_id];
          const newMonth = i === 0 || monthKey(c.latest_at) !== monthKey(cards[i - 1].latest_at);
          return (
            <li key={c.id} className={newMonth ? '' : 'mt-4'}>
              {newMonth && (
                <div className={`flex items-center gap-3 px-1 pb-3 ${i === 0 ? '' : 'pt-8'}`}>
                  <span className="text-[14px] font-semibold uppercase tracking-[0.18em] text-accent/80">{monthLabel(c.latest_at)}</span>
                  <span className="h-px flex-1 bg-line" />
                </div>
              )}
              <button onClick={() => onOpen(c.id)}
                className={`block w-full rounded-3xl p-5 text-left ring-1 transition active:scale-[0.99] ${c.unread ? 'bg-surface ring-accent/35' : 'bg-surface/70 ring-line'}`}>
                <div className="mb-2 flex items-center justify-between gap-3 text-[15px] text-muted">
                  <span>{plainDate(c.latest_at)}{!topic && t ? ` · ${t.short || t.name}` : ''}</span>
                  {c.unread && <span className="shrink-0 rounded-full bg-accent px-2.5 py-0.5 text-[13px] font-bold text-bg">NOUVEAU</span>}
                </div>
                <h2 className={`text-[20px] font-semibold leading-snug ${c.unread ? 'text-ink' : 'text-ink/80'}`}>{c.title}</h2>
                {c.summary && <p className="mt-2 line-clamp-4 text-[17px] leading-relaxed text-ink/75">{c.summary}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
                  <SimpleReliability value={c.reliability} />
                  {c.category === 'competitor' && <span className="text-[15px] font-medium text-red-300">Concurrent</span>}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------- Détail d'une actualité ----------
export function SimpleCardDetail({ card, onBack }) {
  const [more, setMore] = useState(false);
  const paragraphs = (card.detail || '').split(/\n+/).map(s => s.trim()).filter(Boolean);
  const [main, ...others] = card.sources || [];
  return (
    <div className="space-y-5">
      <header className="px-1">
        <p className="mb-2 text-[15px] text-muted">{plainDate(card.latest_at)}{card.topic ? ` · ${card.topic.short || card.topic.name}` : ''}</p>
        <h1 className="text-[26px] font-semibold leading-tight text-ink">{card.title}</h1>
        <div className="mt-3"><SimpleReliability value={card.reliability} big /></div>
      </header>

      <section className="rounded-3xl bg-surface p-5 ring-1 ring-line">
        {card.summary && <p className="mb-4 text-[19px] font-medium leading-relaxed text-ink">{card.summary}</p>}
        <div className="space-y-4 text-[18px] leading-relaxed text-ink/90">{paragraphs.map((p, i) => <p key={i}>{p}</p>)}</div>
      </section>

      {main && (
        <a href={main.url} target="_blank" rel="noopener noreferrer"
          className="flex w-full items-center justify-center gap-3 rounded-2xl bg-ink px-5 py-4 text-[18px] font-semibold text-bg active:scale-[0.98]">
          Lire l'article d'origine <IconExternal width={22} height={22} />
        </a>
      )}
      {others.length > 0 && (
        <div>
          <button onClick={() => setMore(m => !m)} className="w-full rounded-2xl bg-surface px-5 py-3.5 text-[17px] text-ink/85 ring-1 ring-line">
            {more ? 'Masquer les autres articles' : `Voir ${others.length} autre${others.length > 1 ? 's' : ''} article${others.length > 1 ? 's' : ''}`}
          </button>
          {more && (
            <ul className="mt-3 space-y-3">
              {others.map(s => (
                <li key={s.url}>
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="block rounded-2xl bg-surface p-4 text-[16px] leading-snug text-ink/90 ring-1 ring-line">
                    <span className="mb-1 block text-[14px] text-muted">{s.source_name}</span>{s.title}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <BigButton onClick={onBack} className="bg-surface text-ink ring-1 ring-line"><IconBack width={26} height={26} /> Retour aux nouvelles</BigButton>
    </div>
  );
}

// ---------- Premier lancement : choix du mode ----------
export function Welcome({ onChoose }) {
  return (
    <div className="pt-safe pb-safe flex min-h-screen flex-col justify-center px-5 animate-fade">
      <p className="text-[12px] font-medium tracking-[0.32em] text-accent/80">RADAR</p>
      <h1 className="mt-2 text-[30px] font-semibold leading-tight text-ink">Bienvenue !</h1>
      <p className="mt-2 text-[17px] leading-relaxed text-muted">Comment souhaitez-vous utiliser l'application ?</p>
      <div className="mt-8 space-y-4">
        <button onClick={() => onChoose('simple')} className="block w-full rounded-3xl bg-accent/10 p-6 text-left ring-2 ring-accent/50 active:scale-[0.99]">
          <span className="block text-[22px] font-semibold text-ink">Mode simple</span>
          <span className="mt-1 block text-[17px] leading-relaxed text-muted">Gros caractères, uniquement l'essentiel : lire les nouvelles.</span>
        </button>
        <button onClick={() => onChoose('full')} className="block w-full rounded-3xl bg-surface p-6 text-left ring-1 ring-line active:scale-[0.99]">
          <span className="block text-[20px] font-semibold text-ink">Mode complet</span>
          <span className="mt-1 block text-[16px] leading-relaxed text-muted">Filtres, fiche technique, sources, historique et tous les réglages.</span>
        </button>
      </div>
      <p className="mt-6 text-center text-[14px] text-faint">Vous pourrez changer à tout moment dans les Réglages.</p>
    </div>
  );
}
