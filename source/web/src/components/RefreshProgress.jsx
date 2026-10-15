// Avancement en direct de l'actualisation : lecture des sources, recherche web, analyse.
// Les cartes prêtes s'affichent déjà dans la liste pendant que la recherche continue.
export default function RefreshProgress({ progress, compact = false }) {
  if (!progress) return null;
  const { phase, done = 0, total = 0, found = 0, topic, pending, created = 0, updated = 0 } = progress;
  const reading = phase === 'collect' && total > 0 && done < total;
  let label, ratio = null;
  if (phase === 'start') label = 'Démarrage de la recherche…';
  else if (reading) { label = `Lecture des sources · ${done}/${total}`; ratio = done / total; }
  else if (phase === 'web') label = `Recherche web${topic ? ` · ${topic}` : ''}…`;
  else label = pending ? `Analyse des articles · ${pending} en attente` : 'Analyse des articles…';
  const ready = created + updated;
  return (
    <div className={`${compact ? '' : 'mb-4'} overflow-hidden rounded-2xl bg-surface-2 ring-1 ring-line animate-rise`} role="status" aria-live="polite">
      <div className="px-4 pt-3 pb-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm text-ink/90">{label}</p>
          {found > 0 && <p className="shrink-0 text-[11px] text-muted">{found} article{found > 1 ? 's' : ''} trouvé{found > 1 ? 's' : ''}</p>}
        </div>
        <p className="mt-0.5 text-xs text-muted">
          {ready > 0
            ? <><span className="text-accent">{created > 0 ? `${created} nouvelle${created > 1 ? 's' : ''} carte${created > 1 ? 's' : ''}` : ''}{created > 0 && updated > 0 ? ' · ' : ''}{updated > 0 ? `${updated} mise${updated > 1 ? 's' : ''} à jour` : ''}</span> déjà {compact ? 'dans Actualités' : 'ci-dessous'} : la recherche continue.</>
            : 'Les nouvelles cartes apparaîtront ici dès qu\'elles sont prêtes.'}
        </p>
      </div>
      <div className="h-1 w-full bg-line/60">
        {ratio !== null
          ? <div className="h-full bg-accent transition-all duration-500" style={{ width: `${Math.max(4, ratio * 100)}%` }} />
          : <div className="h-full w-1/3 animate-indeterminate bg-accent/80" />}
      </div>
    </div>
  );
}
