// Onglet « Fiches » : une étagère de fiches par sujet (fiche du sujet + une par modèle choisi), puis la fiche sélectionnée.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api.js';
import { RELIABILITY } from './Badge.jsx';
import { IconChevron, IconRefresh } from './Icons.jsx';
import { formatDate, hostOf, timeAgo } from '../util.js';

const DOT = { official: 'bg-emerald-400', reliable: 'bg-sky-400', rumor: 'bg-orange-400', unverified: 'bg-zinc-400' };

function Progress({ known, total, className = '' }) {
  const pct = total ? Math.round((known / total) * 100) : 0;
  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-line ${className}`} aria-hidden>
      <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${Math.max(pct, known ? 4 : 0)}%` }} />
    </div>
  );
}

// ---------- Une ligne de la fiche ----------
function SpecRow({ item, onOpenCard, type }) {
  const [open, setOpen] = useState(false);
  const known = !!item.value;
  const rel = RELIABILITY[item.reliability];
  const relLabel = rel ? (type === 'general' && rel.labelGeneral ? rel.labelGeneral : rel.label) : '';
  if (!known) {
    return (
      <li className="flex items-center justify-between gap-4 py-2.5">
        <span className="text-[14px] text-muted">{item.label}</span>
        <span className="text-[14px] text-faint">—</span>
      </li>
    );
  }
  return (
    <li className="py-3">
      <button className="flex w-full items-start justify-between gap-4 text-left" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span className="pt-0.5 text-[14px] text-muted">{item.label}</span>
        <span className="flex items-start gap-1.5">
          <span className="text-right">
            <span className="block text-[15px] font-semibold leading-snug text-ink">{item.value}</span>
            {rel && (
              <span className="mt-1 inline-flex items-center gap-1.5 text-[11px] text-muted">
                <span className={`h-1.5 w-1.5 rounded-full ${DOT[item.reliability] || DOT.unverified}`} />{relLabel}
              </span>
            )}
          </span>
          <IconChevron className={`mt-0.5 shrink-0 text-faint transition ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {open && (
        <div className="mt-3 space-y-2 rounded-2xl bg-surface-2 p-3 text-xs animate-rise">
          {item.source_url && (
            <a href={item.source_url} target="_blank" rel="noopener noreferrer" className="block text-muted underline decoration-line underline-offset-2">
              Source : {item.source_name || hostOf(item.source_url)}{item.source_date ? ` · ${formatDate(item.source_date)}` : ''}
            </a>
          )}
          {item.card_id && <button onClick={() => onOpenCard(item.card_id)} className="font-medium text-accent">Voir l'actualité →</button>}
          {item.history?.length > 1 && (
            <ol className="space-y-1.5 border-t border-line pt-2">
              {item.history.map((h, i) => (
                <li key={i}>
                  <div className="flex items-center justify-between gap-2">
                    <span className={h.accepted ? 'text-ink' : 'text-faint line-through'}>{h.value}</span>
                    <span className="shrink-0 text-faint">{formatDate(h.at)}</span>
                  </div>
                  {h.note && <p className="mt-0.5 text-faint">{h.note}</p>}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </li>
  );
}

// ---------- Fenêtre « Ajouter un modèle » ----------
function AddModel({ topic, onClose, onAdded }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    const onKey = e => e.key === 'Escape' && onClose();             // bouton retour d'Android
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  async function submit(e) {
    e.preventDefault();
    if (name.trim().length < 2) return;
    setBusy(true); setErr('');
    try { const r = await api.addModel(topic.id, name.trim()); onAdded(r.model); }
    catch (e2) { setErr(e2.message); setBusy(false); }
  }
  return createPortal(
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 animate-fade" onClick={onClose}>
      <form onSubmit={submit} onClick={e => e.stopPropagation()} role="dialog" aria-label="Ajouter un modèle"
        className="nav-safe w-full max-w-xl rounded-t-3xl bg-surface px-5 pt-5 ring-1 ring-line animate-rise">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line" />
        <p className="text-lg font-semibold text-ink">Ajouter un modèle</p>
        <p className="mt-1 text-sm text-muted">Le nom exact d'un produit de « {topic.name} », tel qu'il apparaît dans les actualités.</p>
        <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Nom du modèle"
          className="mt-4 w-full rounded-2xl bg-surface-2 px-4 py-3.5 text-[16px] text-ink ring-1 ring-line outline-none focus:ring-accent/60" />
        {err && <p className="mt-2 text-sm text-red-300">{err}</p>}
        <div className="flex gap-2 py-4">
          <button type="button" onClick={onClose} className="flex-1 rounded-2xl bg-surface-2 py-3 text-sm font-medium text-ink ring-1 ring-line">Annuler</button>
          <button disabled={busy || name.trim().length < 2} className="flex-1 rounded-2xl bg-ink py-3 text-sm font-semibold text-bg disabled:opacity-50">{busy ? '…' : 'Ajouter'}</button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

// ---------- Page ----------
export default function Specs({ onOpenCard, topic: preferred }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [topic, setTopic] = useState(preferred || '');
  const [sel, setSel] = useState('');                    // '' = fiche du sujet, sinon id d'un modèle
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [onlyKnown, setOnlyKnown] = useState(false);
  const [menu, setMenu] = useState(false);
  const [adding, setAdding] = useState(false);
  const shelf = useRef(null);

  const load = (t = topic, m = sel) => api.specs(t, m).then(d => {
    setData(d); setError('');
    if (d.topic && d.topic.id !== t) setTopic(d.topic.id);
    return d;
  }).catch(e => setError(e.message));

  useEffect(() => { setData(null); setSel(''); setMsg(''); setMenu(false); load(topic, ''); }, [topic]);

  const models = data?.models || [];
  const selModel = models.find(m => m.id === sel) || null;
  const isGeneral = data?.topic?.type === 'general';
  const sheetKind = selModel || !isGeneral ? 'Fiche technique' : 'Fiche repères';
  const hasSheet = data?.groups?.length > 0 && (!selModel || selModel.has_sheet);
  const needsCreate = data?.topic && (selModel ? !selModel.has_sheet : !data.groups.length);
  const showShelf = data?.topic && (isGeneral || models.length > 0);

  async function select(id) {
    setSel(id); setMsg(''); setMenu(false);
    const m = models.find(x => x.id === id);
    if (!id || m?.has_sheet) await load(topic, id);
  }

  async function act(kind) {
    setMenu(false);
    const model = selModel;
    setBusy(kind);
    setMsg(kind === 'fill' ? 'Lecture des actualités déjà trouvées…'
      : `L'IA prépare la fiche${model ? ` de ${model.name}` : ''}, puis la remplit avec les actualités…`);
    try {
      const r = model ? await api.buildModelSheet(topic, model.id, { regenerate: kind === 'redo' })
        : await api.buildSheet(topic, { regenerate: kind === 'redo' });
      await load(topic, model?.id || '');
      const parts = [];
      if (r.filled) parts.push(`${r.filled} information${r.filled > 1 ? 's' : ''} ajoutée${r.filled > 1 ? 's' : ''}`);
      if (r.models) parts.push(`${r.models} modèle${r.models > 1 ? 's' : ''} repéré${r.models > 1 ? 's' : ''}`);
      setMsg(parts.length ? `✔ ${parts.join(' · ')}.` : '✔ Fiche à jour. Elle se complétera au fil des actualités.');
    } catch (e) { setMsg(`✖ ${e.message}`); }
    finally { setBusy(''); }
  }

  async function remove() {
    if (!selModel) return;
    setMenu(false);
    await api.removeModel(topic, selModel.id).catch(() => {});
    setSel(''); await load(topic, '');
  }

  const tiles = data?.topic ? [
    { id: '', name: isGeneral ? 'L\'essentiel' : data.topic.name, kind: isGeneral ? 'Fiche repères' : 'Fiche technique',
      has: data.main?.total > 0, known: data.main?.known || 0, total: data.main?.total || 0 },
    ...models.map(m => ({ id: m.id, name: m.name, kind: m.kind || 'Modèle', has: m.has_sheet, known: m.known, total: m.total })),
  ] : [];

  return (
    <div className="pt-safe pb-safe px-4 animate-fade">
      <header className="mb-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.32em] text-accent/80">Radar</p>
        <h1 className="mt-1 text-[26px] font-semibold text-ink">Fiches</h1>
      </header>

      {data?.topics?.length > 1 && (
        <nav className="no-scrollbar -mx-4 mb-5 flex items-end gap-6 overflow-x-auto border-b border-line px-4" aria-label="Sujets">
          {data.topics.map(t => {
            const active = t.id === data.topic?.id;
            return (
              <button key={t.id} onClick={() => setTopic(t.id)} aria-current={active ? 'page' : undefined}
                className={`relative shrink-0 pb-3 pt-1 text-[15px] font-medium ${active ? 'text-ink' : 'text-muted'}`}>
                {t.short || t.name}
                {active && <span className="absolute inset-x-0 -bottom-px h-[3px] rounded-full bg-accent" />}
              </button>
            );
          })}
        </nav>
      )}

      {error && <div className="rounded-3xl bg-surface p-5 text-sm text-red-300 ring-1 ring-red-400/20">{error}</div>}
      {!data && !error && <div className="space-y-3">{[0, 1].map(i => <div key={i} className="h-36 animate-pulse rounded-3xl bg-surface" />)}</div>}

      {data && !data.topic && (
        <div className="rounded-3xl bg-surface p-6 text-center ring-1 ring-line">
          <p className="text-sm text-ink">Ajoutez d'abord un sujet à suivre.</p>
          <a href="#/reglages/sujets" className="mt-3 inline-block text-sm text-accent underline">Ajouter un sujet</a>
        </div>
      )}

      {/* Étagère : la fiche du sujet + une vignette par modèle */}
      {showShelf && (
        <section className="mb-5">
          <div className="mb-2 flex items-baseline justify-between px-1">
            <p className="text-[13px] font-medium text-ink">{models.length ? 'Choisissez une fiche' : 'Fiche du sujet'}</p>
            {isGeneral && <p className="text-[11px] text-faint">{models.length ? `${models.length} modèle${models.length > 1 ? 's' : ''} repéré${models.length > 1 ? 's' : ''}` : 'les modèles cités apparaîtront ici'}</p>}
          </div>
          <div ref={shelf} className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 py-1">
            {tiles.map(t => {
              const active = sel === t.id;
              return (
                <button key={t.id || 'main'} onClick={() => select(t.id)} aria-pressed={active}
                  className={`flex w-40 shrink-0 snap-start flex-col justify-between rounded-3xl p-4 text-left transition active:scale-[0.98] ${
                    active ? 'bg-surface-2 ring-2 ring-accent' : t.has ? 'bg-surface ring-1 ring-line' : 'border border-dashed border-line bg-transparent'}`}
                  style={{ minHeight: '7.5rem' }}>
                  <span>
                    <span className="block text-[11px] uppercase tracking-[0.14em] text-muted">{t.kind}</span>
                    <span className="mt-1 line-clamp-2 block text-[15px] font-semibold leading-snug text-ink">{t.name}</span>
                  </span>
                  {t.has ? (
                    <span className="mt-3 block">
                      <Progress known={t.known} total={t.total} />
                      <span className="mt-1.5 block text-[11px] text-muted">{t.known} / {t.total} connues</span>
                    </span>
                  ) : (
                    <span className="mt-3 block text-[12px] font-medium text-accent">+ Créer la fiche</span>
                  )}
                </button>
              );
            })}
            {isGeneral && (
              <button onClick={() => setAdding(true)}
                className="grid w-28 shrink-0 snap-start place-items-center rounded-3xl border border-dashed border-line p-4 text-center text-[13px] text-muted active:scale-[0.98]"
                style={{ minHeight: '7.5rem' }}>
                <span><span className="block text-2xl leading-none text-accent">+</span><span className="mt-1 block">Ajouter un modèle</span></span>
              </button>
            )}
          </div>
        </section>
      )}

      {/* Fiche à créer */}
      {needsCreate && (
        <section className="rounded-3xl bg-accent/[0.07] p-6 ring-1 ring-accent/30 animate-rise">
          <p className="text-[11px] uppercase tracking-[0.18em] text-accent/90">{sheetKind}</p>
          <p className="mt-1 text-xl font-semibold text-ink">{selModel ? selModel.name : data.topic.name}</p>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {selModel
              ? 'Les caractéristiques propres à ce modèle, remplies avec les actualités qui en parlent, puis tenues à jour à chaque actualisation.'
              : isGeneral
                ? 'L\'essentiel à retenir sur ce sujet (dernières annonces, dates, chiffres, prix…), rempli avec les actualités déjà trouvées. Les modèles cités seront aussi repérés.'
                : 'Les caractéristiques propres à ce type de produit, remplies avec les actualités déjà trouvées.'}
          </p>
          <button onClick={() => act('build')} disabled={!!busy} className="mt-5 w-full rounded-2xl bg-ink px-4 py-3.5 text-[15px] font-semibold text-bg disabled:opacity-60">
            {busy ? 'Préparation… (quelques secondes)' : 'Créer la fiche'}
          </button>
          {selModel && (
            <button onClick={remove} className="mt-2 w-full py-2 text-xs text-muted underline underline-offset-4">Ne m'intéresse pas : retirer ce modèle</button>
          )}
        </section>
      )}

      {msg && <p className="mb-3 mt-3 rounded-2xl bg-surface-2 px-4 py-3 text-sm text-ink/90 ring-1 ring-line animate-rise" role="status">{msg}</p>}

      {/* Fiche sélectionnée */}
      {hasSheet && !needsCreate && (
        <>
          <section className="relative rounded-3xl bg-surface p-5 ring-1 ring-line animate-rise">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-[0.18em] text-accent/90">{sheetKind}</p>
                <h2 className="mt-1 text-[22px] font-semibold leading-tight text-ink">{selModel ? selModel.name : data.topic.name}</h2>
              </div>
              <div className="flex shrink-0 gap-2">
                <button onClick={() => act('fill')} disabled={!!busy} aria-label="Mettre à jour la fiche"
                  className="grid h-10 w-10 place-items-center rounded-2xl bg-surface-2 text-ink ring-1 ring-line active:scale-95 disabled:opacity-50">
                  <IconRefresh width={18} height={18} className={busy === 'fill' ? 'animate-spin-slow' : ''} />
                </button>
                <button onClick={() => setMenu(m => !m)} aria-label="Autres actions"
                  className="grid h-10 w-10 place-items-center rounded-2xl bg-surface-2 text-lg leading-none text-ink ring-1 ring-line active:scale-95">⋯</button>
              </div>
            </div>
            {menu && (
              <div className="absolute right-5 top-16 z-10 w-60 overflow-hidden rounded-2xl bg-surface-2 text-sm shadow-xl shadow-black/40 ring-1 ring-line animate-rise">
                <button onClick={() => act('redo')} className="block w-full px-4 py-3 text-left text-ink active:bg-surface">Refaire les rubriques</button>
                {selModel && <button onClick={remove} className="block w-full border-t border-line px-4 py-3 text-left text-red-300 active:bg-surface">Retirer ce modèle</button>}
              </div>
            )}
            <Progress known={data.known} total={data.total} className="mt-4" />
            <p className="mt-2 flex justify-between text-xs text-muted">
              <span><b className="text-ink">{data.known}</b> sur {data.total} informations connues</span>
              {data.updated_at && <span>mise à jour {timeAgo(data.updated_at)}</span>}
            </p>
          </section>

          <div className="my-3 flex gap-2" role="tablist" aria-label="Lignes affichées">
            {[[false, 'Tout'], [true, 'Seulement ce qui est connu']].map(([v, l]) => (
              <button key={l} onClick={() => setOnlyKnown(v)} role="tab" aria-selected={onlyKnown === v}
                className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium ${onlyKnown === v ? 'bg-ink text-bg' : 'text-muted ring-1 ring-line'}`}>{l}</button>
            ))}
          </div>

          <div className="space-y-3">
            {data.groups.map((g, i) => {
              const items = onlyKnown ? g.items.filter(x => x.value) : g.items;
              if (!items.length) return null;
              const k = g.items.filter(x => x.value).length;
              return (
                <section key={g.id} className="rounded-3xl bg-surface px-5 py-4 ring-1 ring-line animate-rise" style={{ animationDelay: `${i * 40}ms` }}>
                  <div className="mb-1 flex items-baseline justify-between">
                    <h3 className="text-[13px] font-semibold text-ink">{g.label}</h3>
                    <span className="text-[11px] text-faint">{k}/{g.items.length}</span>
                  </div>
                  <ul className="divide-y divide-line">
                    {items.map(item => <SpecRow key={item.key} item={item} onOpenCard={onOpenCard} type={selModel ? 'product' : data.topic.type} />)}
                  </ul>
                </section>
              );
            })}
            {onlyKnown && data.known === 0 && (
              <p className="rounded-3xl bg-surface p-5 text-center text-sm text-muted ring-1 ring-line">Rien de connu pour l'instant : la fiche se remplira au fil des actualités.</p>
            )}
          </div>

          <p className="px-2 pt-5 text-center text-[11px] leading-relaxed text-faint">
            La fiche se complète toute seule à chaque actualisation. Une information n'est remplacée que par une autre au moins aussi fiable. Touchez une ligne pour voir sa source et son historique.
          </p>
        </>
      )}

      {adding && data?.topic && (
        <AddModel topic={data.topic} onClose={() => setAdding(false)}
          onAdded={async m => { setAdding(false); await load(topic, ''); setSel(m.id); setMsg(''); }} />
      )}
    </div>
  );
}
