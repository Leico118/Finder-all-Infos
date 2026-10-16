import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { ReliabilityBadge, CompetitorBadge, RELIABILITY } from './Badge.jsx';
import { IconBack, IconExternal, IconAlert } from './Icons.jsx';
import { formatDate, formatDateTime, hostOf, LANG_FR } from '../util.js';
import { SimpleCardDetail } from './Simple.jsx';

const HIST_LABEL = {
  created: 'Création', updated: 'Mise à jour', source: 'Nouvelle source', reliability: 'Fiabilité',
  contradiction: 'Contradiction', official: 'Confirmation officielle',
};

function Section({ title, children }) {
  return (
    <section className="rounded-3xl bg-surface p-5 ring-1 ring-line animate-rise">
      <h3 className="mb-3 text-[11px] font-semibold tracking-[0.2em] text-accent/90 uppercase">{title}</h3>
      {children}
    </section>
  );
}

function Paragraphs({ text }) {
  const parts = (text || '').split(/\n{2,}|\n/).map(s => s.trim()).filter(Boolean);
  return <div className="prose-fr text-[15px] leading-relaxed text-ink/90">{parts.map((p, i) => <p key={i}>{p}</p>)}</div>;
}

export default function CardDetail({ id, onBack, onRead, simple = false }) {
  const [card, setCard] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setCard(null); setError('');
    api.card(id).then(c => {
      if (!alive) return;
      setCard(c);
      if (c.unread) api.markRead(id).then(onRead).catch(() => {});
    }).catch(e => alive && setError(e.message));
    return () => { alive = false; };
  }, [id]);

  const rel = card ? RELIABILITY[card.reliability] || RELIABILITY.unverified : null;
  const type = card?.topic?.type || 'product';
  const topicName = card?.topic?.short || card?.topic?.name || '';

  return (
    <div className="pt-safe pb-safe px-4 animate-fade">
      <button onClick={onBack} className={`mb-4 -ml-2 flex items-center gap-1 rounded-full px-2 py-1.5 text-muted active:text-ink ${simple ? 'text-[18px]' : 'text-sm'}`}>
        <IconBack /> {simple ? 'Retour' : 'Actualités'}
      </button>

      {error && <div className="rounded-3xl bg-surface p-5 text-sm text-red-300 ring-1 ring-red-400/20">{error}</div>}
      {!card && !error && <div className="h-64 animate-pulse rounded-3xl bg-surface" />}

      {card && simple && <SimpleCardDetail card={card} onBack={onBack} />}

      {card && !simple && (
        <div className="space-y-3">
          <header className="px-1 pb-2 animate-rise">
            {topicName && <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-accent/80">{topicName}</p>}
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {card.category === 'competitor' && <CompetitorBadge />}
              <ReliabilityBadge value={card.reliability} type={type} />
            </div>
            <h1 className="text-[22px] font-semibold leading-tight text-ink">{card.title}</h1>
            <p className="mt-2 text-xs text-muted">
              Première source : {formatDate(card.first_seen_at)} · Dernière : {formatDate(card.latest_at)}
              {card.updated_at !== card.created_at && <> · Carte mise à jour le {formatDate(card.updated_at)}</>}
            </p>
          </header>

          {(card.official_confirmation === 1 || card.contradiction) && (
            <div className="space-y-2">
              {card.official_confirmation === 1 && (
                <div className="rounded-2xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200 ring-1 ring-emerald-400/20">
                  ✔ Information confirmée officiellement.
                </div>
              )}
              {card.contradiction && (
                <div className="flex gap-2 rounded-2xl bg-amber-500/10 px-4 py-3 text-sm text-amber-200 ring-1 ring-amber-400/20">
                  <IconAlert className="mt-0.5 shrink-0" /><span><b>Contradiction signalée :</b> {card.contradiction}</span>
                </div>
              )}
            </div>
          )}

          <Section title="Résumé approfondi">
            {card.summary && <p className="mb-3 text-[15px] font-medium leading-relaxed text-ink">{card.summary}</p>}
            <Paragraphs text={card.detail} />
          </Section>

          {card.category === 'competitor' && (card.competitor_why || card.competitor_comparison) && (
            <Section title={`Concurrent${card.competitor_model ? ` · ${card.competitor_model}` : ''}`}>
              {card.competitor_why && (<><p className="mb-1 text-xs font-medium text-muted">Pourquoi c'est important</p><Paragraphs text={card.competitor_why} /></>)}
              {card.competitor_comparison && (<><p className="mb-1 mt-4 text-xs font-medium text-muted">Comparaison avec {topicName}</p><Paragraphs text={card.competitor_comparison} /></>)}
            </Section>
          )}

          {card.specs?.length > 0 && (
            <Section title="Caractéristiques concernées">
              <ul className="divide-y divide-line">
                {card.specs.map(s => (
                  <li key={s.key} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                    <span className="text-sm text-muted">{s.label}</span>
                    <span className="text-right">
                      <span className={`block text-sm ${s.value ? 'text-ink' : 'text-faint'}`}>{s.value || 'Inconnu'}</span>
                      {s.reliability && <span className="mt-1 inline-block"><ReliabilityBadge value={s.reliability} small type={type} /></span>}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[11px] text-faint">Valeurs actuellement retenues dans la fiche technique.</p>
            </Section>
          )}

          {card.technical && (
            <Section title={type === 'general' ? 'Contexte' : 'Explications techniques'}>
              <Paragraphs text={card.technical} />
            </Section>
          )}

          <Section title="Fiabilité">
            <div className="mb-2"><ReliabilityBadge value={card.reliability} type={type} /></div>
            <p className="text-sm text-muted">{rel.desc}</p>
            {card.origin && <p className="mt-3 text-sm text-ink/90"><span className="text-muted">Origine de l'information : </span>{card.origin}</p>}
            {card.reliability_reason && <p className="mt-2 text-sm text-ink/90"><span className="text-muted">Justification : </span>{card.reliability_reason}</p>}
            {card.sources.length > 1 && (
              <p className="mt-3 text-xs text-faint">
                {card.sources.length} articles rapportent cette information. Des reprises d'une même information ne constituent pas des confirmations indépendantes.
              </p>
            )}
          </Section>

          <Section title={`Sources originales (${card.sources.length})`}>
            <ul className="space-y-2">
              {card.sources.map((s, i) => (
                <li key={s.url}>
                  <a href={s.url} target="_blank" rel="noopener noreferrer"
                     className="block rounded-2xl bg-surface-2 p-3 ring-1 ring-line transition active:bg-white/10">
                    <div className="flex items-center justify-between gap-2 text-xs text-muted">
                      <span className="truncate">{s.source_name || hostOf(s.url)}</span>
                      <span className="shrink-0">{formatDate(s.published_at)}</span>
                    </div>
                    <p className="mt-1 text-sm leading-snug text-ink/90">{s.title}</p>
                    <div className="mt-1.5 flex items-center gap-2 text-[11px] text-faint">
                      {i === 0 && <span className="text-accent/80">Plus ancienne repérée</span>}
                      {s.lang && s.lang !== 'fr' && <span>Article en {LANG_FR[s.lang] || s.lang}</span>}
                      <IconExternal className="ml-auto" />
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          </Section>

          {card.history?.length > 0 && (
            <Section title="Historique des modifications">
              <ol className="relative space-y-4 border-l border-line pl-4">
                {card.history.map((h, i) => (
                  <li key={i} className="relative">
                    <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-surface-2 ring-2 ring-accent/50" />
                    <p className="text-xs text-muted">{formatDateTime(h.at)} · {HIST_LABEL[h.kind] || h.kind}</p>
                    <p className="mt-0.5 text-sm text-ink/90">{h.note}</p>
                  </li>
                ))}
              </ol>
            </Section>
          )}

          <p className="px-2 pt-2 text-center text-[11px] leading-relaxed text-faint">
            Synthèse et traduction générées automatiquement à partir des sources ci-dessus. Vérifiez les articles d'origine.
          </p>
        </div>
      )}
    </div>
  );
}
