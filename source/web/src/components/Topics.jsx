import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { IconChevron } from './Icons.jsx';
import { timeAgo } from '../util.js';

const input = 'w-full rounded-2xl bg-surface-2 px-4 py-3 text-sm text-ink ring-1 ring-line outline-none focus:ring-accent/60';
const btn = 'rounded-2xl px-4 py-2.5 text-sm font-medium transition active:scale-[0.98] disabled:opacity-50';
const join = a => (a || []).join(', ');

const EXAMPLES = ['iPhone Duo', 'Galaxy S27 Ultra', 'Xiaomi 18 Pro Max', 'Voitures BYD', 'Nintendo Switch 3'];

function SimpleTopicRow({ t, onChanged }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <li className="flex items-center justify-between gap-3 py-4 first:pt-0 last:pb-0">
      <span className="min-w-0">
        <span className="block text-[18px] font-medium text-ink">{t.name}</span>
        <span className="block text-[15px] text-muted">{t.cards} actualité{t.cards > 1 ? 's' : ''}</span>
      </span>
      {!confirm
        ? <button onClick={() => setConfirm(true)} className="shrink-0 rounded-2xl bg-surface-2 px-4 py-2.5 text-[16px] text-red-300 ring-1 ring-line">Retirer</button>
        : <button disabled={busy} onClick={async () => { setBusy(true); try { await api.deleteTopic(t.id); onChanged(); } finally { setBusy(false); } }}
            className="shrink-0 rounded-2xl bg-red-500/80 px-4 py-2.5 text-[16px] font-semibold text-white">Oui, retirer</button>}
    </li>
  );
}

function TopicRow({ t, onChanged }) {
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState({ name: t.name, short: t.short, match: join(t.match), exclude: join(t.exclude), rivals: join(t.rivals), type: t.type });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [confirm, setConfirm] = useState(false);

  async function save() {
    setBusy(true); setMsg('');
    try { await api.updateTopic(t.id, edit); setMsg('✔ Enregistré.'); onChanged(); }
    catch (e) { setMsg(`✖ ${e.message}`); }
    finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true);
    try { await api.deleteTopic(t.id); onChanged(); }
    catch (e) { setMsg(`✖ ${e.message}`); setBusy(false); }
  }

  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <button className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setOpen(o => !o)}>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-ink">{t.name}</span>
          <span className="block text-xs text-muted">
            {t.type === 'product' ? 'Produit · fiche technique' : 'Sujet général'} · {t.cards} actualité{t.cards > 1 ? 's' : ''}
            {t.last_collect ? ` · collecte ${timeAgo(t.last_collect)}` : ' · première collecte à venir'}
          </span>
        </span>
        <IconChevron className={`shrink-0 text-faint transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-3 space-y-3 rounded-2xl bg-surface-2 p-4 animate-rise">
          {t.description && <p className="text-xs leading-relaxed text-muted">{t.description}</p>}
          <label className="block text-xs text-muted">Nom
            <input className={`${input} mt-1 bg-bg`} value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} id={`name-${t.id}`} />
          </label>
          <label className="block text-xs text-muted">Nom court (onglets)
            <input className={`${input} mt-1 bg-bg`} value={edit.short} onChange={e => setEdit({ ...edit, short: e.target.value })} id={`short-${t.id}`} />
          </label>
          <label className="block text-xs text-muted">Mots-clés reconnus dans les articles (séparés par des virgules)
            <textarea rows={2} className={`${input} mt-1 bg-bg`} value={edit.match} onChange={e => setEdit({ ...edit, match: e.target.value })} id={`match-${t.id}`} />
          </label>
          <label className="block text-xs text-muted">À ne pas confondre avec
            <textarea rows={2} className={`${input} mt-1 bg-bg`} value={edit.exclude} onChange={e => setEdit({ ...edit, exclude: e.target.value })} id={`excl-${t.id}`} />
          </label>
          {edit.type === 'product' && (
            <label className="block text-xs text-muted">Concurrents surveillés
              <textarea rows={2} className={`${input} mt-1 bg-bg`} value={edit.rivals} onChange={e => setEdit({ ...edit, rivals: e.target.value })} id={`riv-${t.id}`} />
            </label>
          )}
          <div className="flex gap-2 text-xs">
            {[['product', 'Produit'], ['general', 'Sujet général']].map(([v, l]) => (
              <button key={v} onClick={() => setEdit({ ...edit, type: v })}
                className={`rounded-full px-3 py-1.5 ${edit.type === v ? 'bg-ink text-bg' : 'bg-bg text-muted ring-1 ring-line'}`}>{l}</button>
            ))}
          </div>
          {t.web_queries?.length > 0 && (
            <details className="text-xs text-muted">
              <summary className="cursor-pointer text-faint">Recherches préparées par l'IA ({t.web_queries.length + Object.values(t.queries || {}).flat().length})</summary>
              <ul className="mt-2 list-disc space-y-0.5 pl-4">
                {[...Object.values(t.queries || {}).flat(), ...t.web_queries].map((q, i) => <li key={i}>{q}</li>)}
              </ul>
            </details>
          )}
          <div className="flex gap-2">
            <button onClick={save} disabled={busy} className={`${btn} flex-1 bg-ink text-bg`}>Enregistrer</button>
            {!confirm
              ? <button onClick={() => setConfirm(true)} disabled={busy} className={`${btn} bg-bg text-red-300 ring-1 ring-red-400/30`}>Supprimer</button>
              : <button onClick={remove} disabled={busy} className={`${btn} bg-red-500/80 text-white`}>Confirmer la suppression</button>}
          </div>
          {confirm && <p className="text-xs text-red-300">Les {t.cards} actualités de ce sujet seront effacées.</p>}
          {msg && <p className="text-xs text-muted">{msg}</p>}
        </div>
      )}
    </li>
  );
}

// Création en cours, conservée si l'écran Réglages est quitté puis rouvert pendant que l'IA travaille.
let pendingAdd = null;

export default function Topics({ onAdded, autoFocus, simple = false }) {
  const [data, setData] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const alive = useRef(true);
  const load = () => api.topics().then(d => alive.current && setData(d)).catch(e => alive.current && setMsg(e.message));

  async function follow(promise) {
    setBusy(true); setMsg('L\'IA prépare les mots-clés et les recherches…');
    try {
      const r = await promise;
      if (!alive.current) return;
      setText('');
      setMsg(`✔ « ${r.topic.name} » ${r.existing ? 'est bien dans vos sujets' : `ajouté (${r.topic.type === 'product' ? 'produit, avec fiche technique' : 'sujet général'}). Appuyez sur « Actualiser » pour lancer sa première recherche`}.`);
      onAdded?.(r.topic);
    } catch (e) { if (alive.current) setMsg(`✖ ${e.message}`); }
    finally { if (alive.current) { setBusy(false); load(); } }
  }

  useEffect(() => {
    alive.current = true;
    load();
    if (pendingAdd) follow(pendingAdd);
    return () => { alive.current = false; };
  }, []);

  function add(value = text) {
    if (value.trim().length < 2 || pendingAdd) return;
    pendingAdd = api.addTopic(value.trim()).finally(() => { pendingAdd = null; });
    follow(pendingAdd);
  }

  const full = data && data.topics.length >= data.max;
  const sz = simple
    ? { title: 'mb-1 text-[14px]', help: 'mb-4 text-[16px]', input: `${input} text-[18px] py-4`, btn: 'rounded-2xl px-5 py-4 text-[18px] font-semibold', msg: 'text-[16px]', ex: 'px-4 py-2 text-[16px]' }
    : { title: 'mb-1 text-[11px]', help: 'mb-4 text-xs', input, btn, msg: 'text-xs', ex: 'px-3 py-1 text-xs' };
  return (
    <section id="sujets" className="rounded-3xl bg-surface p-5 ring-1 ring-line animate-rise">
      <h2 className={`${sz.title} font-semibold uppercase tracking-[0.2em] text-accent/90`}>{simple ? 'Mes sujets suivis' : 'Mes sujets'}</h2>
      <p className={`${sz.help} leading-relaxed text-muted`}>
        {simple
          ? 'Écrivez un sujet (un téléphone, une voiture, un jeu…) puis touchez « Ajouter ».'
          : 'Tapez ce qui vous intéresse : un produit, une marque, un thème. L\'application cherche ensuite chaque jour en français, en anglais et en chinois.'}
      </p>
      <form onSubmit={e => { e.preventDefault(); add(); }} className={simple ? 'space-y-3' : 'flex gap-2'}>
        <input className={sz.input} value={text} onChange={e => setText(e.target.value)} placeholder="ex. voitures BYD" id="new-topic"
          disabled={busy || full} autoFocus={autoFocus} enterKeyHint="done" />
        <button type="submit" disabled={busy || full || text.trim().length < 2}
          className={`${sz.btn} shrink-0 bg-ink text-bg transition disabled:opacity-50 ${simple ? 'w-full' : ''}`}>{busy ? '…' : 'Ajouter'}</button>
      </form>
      {!data?.topics?.length || data.topics.length < 2 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {EXAMPLES.map(x => (
            <button key={x} onClick={() => setText(x)} className={`rounded-full bg-surface-2 text-muted ring-1 ring-line ${sz.ex}`}>{x}</button>
          ))}
        </div>
      ) : null}
      {full && <p className={`mt-2 text-muted ${sz.msg}`}>Maximum atteint ({data.max} sujets) : supprimez-en un pour en ajouter un autre.</p>}
      {msg && <p className={`mt-3 text-muted ${sz.msg}`} role="status">{msg}</p>}
      <ul className="mt-4 divide-y divide-line">
        {data?.topics.map(t => simple
          ? <SimpleTopicRow key={t.id} t={t} onChanged={() => { load(); onAdded?.(); }} />
          : <TopicRow key={t.id} t={t} onChanged={() => { load(); onAdded?.(); }} />)}
      </ul>
    </section>
  );
}
