import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { ReliabilityBadge } from './Badge.jsx';
import { IconChevron } from './Icons.jsx';
import { formatDate, hostOf } from '../util.js';

function SpecRow({ item, onOpenCard }) {
  const [open, setOpen] = useState(false);
  const hasHist = item.history?.length > 0;
  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <button className="flex w-full items-start justify-between gap-3 text-left" onClick={() => hasHist && setOpen(o => !o)}>
        <span className="pt-0.5 text-sm text-muted">{item.label}</span>
        <span className="flex items-start gap-1 text-right">
          <span>
            <span className={`block text-sm leading-snug ${item.value ? 'font-medium text-ink' : 'text-faint'}`}>{item.value || 'Inconnu'}</span>
            {item.reliability && <span className="mt-1 inline-block"><ReliabilityBadge value={item.reliability} small /></span>}
          </span>
          {hasHist && <IconChevron className={`mt-0.5 shrink-0 text-faint transition ${open ? 'rotate-180' : ''}`} />}
        </span>
      </button>
      {item.value && (item.source_url || item.card_id) && (
        <div className="mt-1.5 flex flex-wrap justify-end gap-x-3 gap-y-1 text-[11px]">
          {item.source_url && (
            <a href={item.source_url} target="_blank" rel="noopener noreferrer" className="text-faint underline decoration-white/20 underline-offset-2">
              {item.source_name || hostOf(item.source_url)}{item.source_date ? ` · ${formatDate(item.source_date)}` : ''}
            </a>
          )}
          {item.card_id && <button onClick={() => onOpenCard(item.card_id)} className="text-accent/80">Voir l'actualité</button>}
        </div>
      )}
      {open && (
        <ol className="mt-3 space-y-2 rounded-2xl bg-surface-2 p-3 animate-rise">
          {item.history.map((h, i) => (
            <li key={i} className="text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className={h.accepted ? 'text-ink' : 'text-faint line-through'}>{h.value}</span>
                <span className="shrink-0 text-faint">{formatDate(h.at)}</span>
              </div>
              {h.note && <p className="mt-0.5 text-faint">{h.note}</p>}
            </li>
          ))}
        </ol>
      )}
    </li>
  );
}

export default function Specs({ onOpenCard, topic: preferred }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const [topic, setTopic] = useState(preferred || '');
  useEffect(() => {
    setData(null);
    api.specs(topic).then(d => { setData(d); if (d.topic && d.topic.id !== topic) setTopic(d.topic.id); }).catch(e => setError(e.message));
  }, [topic]);

  return (
    <div className="pt-safe pb-safe px-4 animate-fade">
      <header className="mb-5">
        <p className="text-[11px] font-medium uppercase tracking-[0.32em] text-accent/80">{data?.topic?.name || 'Fiche technique'}</p>
        <h1 className="mt-1 text-[26px] font-semibold text-ink">Fiche technique</h1>
        {data?.topics?.length > 1 && (
          <nav className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
            {data.topics.map(t => (
              <button key={t.id} onClick={() => setTopic(t.id)}
                className={`shrink-0 rounded-2xl px-3.5 py-2 text-[13px] font-medium ${t.id === data.topic.id ? 'bg-accent text-bg' : 'bg-surface text-ink/80 ring-1 ring-line'}`}>
                {t.short || t.name}
              </button>
            ))}
          </nav>
        )}
        {data && data.topic === null && (
          <p className="mt-3 rounded-2xl bg-surface p-4 text-sm text-muted ring-1 ring-line">
            Aucun de vos sujets n'est un produit. La fiche technique apparaît pour les produits précis (téléphone, voiture, console…).
          </p>
        )}
        {data && data.total > 0 && (
          <>
            <p className="mt-1.5 text-xs text-muted">{data.known} caractéristique{data.known > 1 ? 's' : ''} renseignée{data.known > 1 ? 's' : ''} sur {data.total} · mise à jour automatique</p>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-accent/70 transition-all" style={{ width: `${(data.known / data.total) * 100}%` }} />
            </div>
          </>
        )}
      </header>

      {error && <div className="rounded-3xl bg-surface p-5 text-sm text-red-300 ring-1 ring-red-400/20">{error}</div>}
      {!data && !error && <div className="space-y-3">{[0, 1, 2].map(i => <div key={i} className="h-40 animate-pulse rounded-3xl bg-surface" />)}</div>}

      <div className="space-y-3">
        {data?.groups.map((g, i) => (
          <section key={g.id} className="rounded-3xl bg-surface p-5 ring-1 ring-line animate-rise" style={{ animationDelay: `${i * 40}ms` }}>
            <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-accent/90">{g.label}</h2>
            <ul className="divide-y divide-line">
              {g.items.map(item => <SpecRow key={item.key} item={item} onOpenCard={onOpenCard} />)}
            </ul>
          </section>
        ))}
      </div>
      {data && (
        <p className="px-2 pt-4 text-center text-[11px] leading-relaxed text-faint">
          Une valeur n'est remplacée que par une information de fiabilité égale ou supérieure. Touchez une ligne pour voir son historique.
        </p>
      )}
    </div>
  );
}
