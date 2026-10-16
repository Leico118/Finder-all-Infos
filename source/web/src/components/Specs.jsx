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
  const [busy, setBusy] = useState('');                 // '' | 'build' | 'fill' | 'redo'
  const [msg, setMsg] = useState('');
  const [topic, setTopic] = useState(preferred || '');

  const load = (id = topic) => api.specs(id).then(d => { setData(d); setError(''); if (d.topic && d.topic.id !== id) setTopic(d.topic.id); return d; })
    .catch(e => setError(e.message));
  useEffect(() => { setData(null); setMsg(''); load(topic); }, [topic]);

  const product = data?.topic?.type === 'product';
  const sheetName = product ? 'Fiche technique' : 'Fiche repères';
  const hasSheet = data?.groups?.length > 0;

  async function run(kind) {
    setBusy(kind);
    setMsg(kind === 'fill' ? 'L\'IA relit les actualités déjà trouvées…' : 'L\'IA prépare la fiche, puis la remplit avec les actualités déjà trouvées…');
    try {
      const r = await api.buildSheet(data.topic.id, { regenerate: kind === 'redo' });
      await load(data.topic.id);
      const src = r.cards > 1 ? `aux ${r.cards} actualités déjà trouvées` : 'à l\'actualité déjà trouvée';
      setMsg(r.cards ? (r.filled ? `✔ ${r.filled} ligne${r.filled > 1 ? 's' : ''} complétée${r.filled > 1 ? 's' : ''} grâce ${src}.` : '✔ Fiche prête : les actualités déjà trouvées ne donnaient pas encore de valeur, elle se remplira au fil des nouvelles.')
        : '✔ Fiche prête : elle se remplira au fil des actualités.');
    } catch (e) { setMsg(`✖ ${e.message}`); }
    finally { setBusy(''); }
  }

  return (
    <div className="pt-safe pb-safe px-4 animate-fade">
      <header className="mb-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.32em] text-accent/80">Fiches</p>
        <h1 className="mt-1 text-[26px] font-semibold leading-tight text-ink">{data?.topic?.name || 'Fiches'}</h1>
        {data?.topic && <p className="mt-1 text-sm text-muted">{sheetName}{hasSheet ? ` · ${data.known}/${data.total} renseignée${data.known > 1 ? 's' : ''}` : ''}</p>}
      </header>

      {data?.topics?.length > 1 && (
        <nav className="no-scrollbar -mx-4 mb-4 flex items-end gap-6 overflow-x-auto border-b border-line px-4" aria-label="Sujets">
          {data.topics.map(t => {
            const active = t.id === data.topic?.id;
            return (
              <button key={t.id} onClick={() => setTopic(t.id)}
                className={`relative shrink-0 pb-3 pt-1 text-[15px] font-medium ${active ? 'text-ink' : t.has_sheet ? 'text-muted' : 'text-faint'}`}>
                {t.short || t.name}
                {active && <span className="absolute inset-x-0 -bottom-px h-[3px] rounded-full bg-accent" />}
              </button>
            );
          })}
        </nav>
      )}

      {error && <div className="rounded-3xl bg-surface p-5 text-sm text-red-300 ring-1 ring-red-400/20">{error}</div>}
      {!data && !error && <div className="space-y-3">{[0, 1, 2].map(i => <div key={i} className="h-40 animate-pulse rounded-3xl bg-surface" />)}</div>}

      {data && !data.topic && (
        <div className="rounded-3xl bg-surface p-6 text-center ring-1 ring-line">
          <p className="text-sm text-ink">Ajoutez d'abord un sujet à suivre.</p>
          <a href="#/reglages/sujets" className="mt-3 inline-block text-sm text-accent underline">Ajouter un sujet</a>
        </div>
      )}

      {/* Sujet sans fiche : on la crée (et on la remplit avec ce qui est déjà connu) */}
      {data?.topic && !hasSheet && (
        <section className="rounded-3xl bg-accent/[0.07] p-6 ring-1 ring-accent/30 animate-rise">
          <p className="text-base font-semibold text-ink">Pas encore de fiche pour ce sujet</p>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {product
              ? 'L\'IA prépare les caractéristiques propres à ce type de produit (un appareil photo, une console ou une voiture n\'ont pas les mêmes), puis les remplit avec les actualités.'
              : 'L\'IA prépare une fiche repères avec l\'essentiel à retenir sur ce sujet : dernières annonces, dates, chiffres, prix…, puis la remplit avec les actualités.'}
          </p>
          <button onClick={() => run('build')} disabled={!!busy} className="mt-4 w-full rounded-2xl bg-ink px-4 py-3 text-[15px] font-semibold text-bg disabled:opacity-60">
            {busy ? 'Préparation…' : 'Créer la fiche'}
          </button>
        </section>
      )}

      {hasSheet && (
        <div className="mb-4 h-1 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full bg-accent/70 transition-all" style={{ width: `${(data.known / data.total) * 100}%` }} />
        </div>
      )}

      {msg && <p className="mb-3 mt-3 rounded-2xl bg-surface-2 px-4 py-3 text-sm text-ink/90 ring-1 ring-line" role="status">{msg}</p>}

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

      {hasSheet && (
        <div className="mt-4 space-y-2">
          {data.topic.cards > 0 && (
            <button onClick={() => run('fill')} disabled={!!busy}
              className="w-full rounded-2xl bg-surface px-4 py-3 text-sm font-medium text-ink ring-1 ring-line disabled:opacity-60">
              {busy === 'fill' ? 'Lecture des actualités…' : data.topic.cards > 1 ? `Compléter avec les ${data.topic.cards} actualités déjà trouvées` : 'Compléter avec l\'actualité déjà trouvée'}
            </button>
          )}
          <button onClick={() => run('redo')} disabled={!!busy} className="w-full py-2 text-xs text-muted underline underline-offset-4 disabled:opacity-60">
            {busy === 'redo' ? 'Préparation…' : 'Les rubriques ne conviennent pas ? Refaire la fiche'}
          </button>
          <p className="px-2 pt-2 text-center text-[11px] leading-relaxed text-faint">
            La fiche se met à jour toute seule à chaque actualisation. Une valeur n'est remplacée que par une information de fiabilité égale ou supérieure. Touchez une ligne pour voir son historique.
          </p>
        </div>
      )}
    </div>
  );
}
