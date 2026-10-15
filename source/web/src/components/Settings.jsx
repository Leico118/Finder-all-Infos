import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { device, isNative } from '../native.js';
import { RELIABILITY, ReliabilityBadge, CompetitorBadge } from './Badge.jsx';
import { IconChevron } from './Icons.jsx';
import { formatDateTime, timeAgo } from '../util.js';
import Topics from './Topics.jsx';

const input = 'w-full rounded-2xl bg-surface-2 px-4 py-3 text-sm text-ink ring-1 ring-line outline-none focus:ring-accent/60';
const Btn = ({ children, className = '', ...p }) => (
  <button {...p} className={`rounded-2xl px-4 py-2.5 text-sm font-medium transition active:scale-[0.98] disabled:opacity-50 ${className}`}>{children}</button>
);

function Block({ title, children, highlight }) {
  return (
    <section className={`rounded-3xl p-5 ring-1 animate-rise ${highlight ? 'bg-accent/[0.07] ring-accent/30' : 'bg-surface ring-line'}`}>
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-accent/90">{title}</h2>
      {children}
    </section>
  );
}

function Link({ href, children }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent underline">{children}</a>;
}

function KeyForm({ label, placeholder, id, configured, onSave, children }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [editing, setEditing] = useState(!configured);
  useEffect(() => setEditing(!configured), [configured]);
  async function submit() {
    setBusy(true); setMsg('Vérification…');
    try { await onSave(value.trim()); setValue(''); setMsg('✔ Clé vérifiée et enregistrée.'); setEditing(false); }
    catch (e) { setMsg(`✖ ${e.message}`); }
    finally { setBusy(false); }
  }
  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink">{label} <span className="text-emerald-300">· active</span></p>
        <button onClick={() => setEditing(true)} className="text-xs text-accent">Changer de clé</button>
        {msg && <span className="sr-only">{msg}</span>}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {children}
      <input className={input} type="password" autoComplete="off" value={value} onChange={e => setValue(e.target.value)} placeholder={placeholder} id={id} />
      <Btn onClick={submit} disabled={busy || value.trim().length < 10} className="w-full bg-ink text-bg">{busy ? 'Vérification…' : 'Vérifier et enregistrer'}</Btn>
      {msg && <p className="text-xs text-muted">{msg}</p>}
    </div>
  );
}

function Switch({ on, onClick, label }) {
  return (
    <button onClick={onClick} role="switch" aria-checked={on} aria-label={label}
      className={`relative h-7 w-12 shrink-0 rounded-full transition ${on ? 'bg-accent' : 'bg-surface-2 ring-1 ring-line'}`}>
      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'left-6' : 'left-1'}`} />
    </button>
  );
}

// Version installée et mise à jour depuis GitHub, sans passer par le navigateur.
function AppUpdate({ version }) {
  const [info, setInfo] = useState(null);
  const [checking, setChecking] = useState(false);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const check = async () => {
    setChecking(true); setMsg('');
    try { setInfo(await api.update()); } catch (e) { setMsg(`Vérification impossible : ${e.message}`); }
    setChecking(false);
  };
  useEffect(() => { check(); }, []);
  const install = () => {
    setBusy(true); setMsg('Téléchargement…');
    const started = device.installUpdate(info.url, (state, detail) => {
      if (state === 'download') setMsg(`Téléchargement… ${detail}`);
      else if (state === 'installing') setMsg('Android va vous demander de confirmer la mise à jour : touchez « Mettre à jour ».');
      else { setMsg(detail); setBusy(false); }
    });
    if (!started) { device.openUrl(info.url); setBusy(false); setMsg(''); }
  };
  const available = info?.available;
  return (
    <Block title="Application" highlight={available}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-ink">{available ? `Nouvelle version ${info.latest} disponible` : `Radar ${version || info?.current || ''}`}</p>
          <p className="text-xs text-muted">
            {available ? `Version installée : ${info.current}. Vos sujets, clés et articles sont conservés.`
              : checking ? 'Recherche d\'une mise à jour…' : info ? 'Vous avez la dernière version.' : ''}
          </p>
        </div>
        {available
          ? <Btn onClick={install} disabled={busy} className="shrink-0 bg-ink text-bg">{busy ? '…' : 'Mettre à jour'}</Btn>
          : <Btn onClick={check} disabled={checking} className="shrink-0 bg-surface-2 text-ink ring-1 ring-line">Vérifier</Btn>}
      </div>
      {msg && <p className="mt-2 text-xs leading-relaxed text-muted">{msg}</p>}
    </Block>
  );
}

export default function Settings({ onRefresh, refreshing, refreshMsg, onTopicsChanged, focusTopics }) {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const [openGroup, setOpenGroup] = useState(null);
  const [dev, setDev] = useState(() => device.info());

  const load = () => api.status().then(s => { setStatus(s); setDev(s.device || device.info()); }).catch(e => setError(e.message));
  useEffect(() => { load(); }, [refreshing]);
  useEffect(() => {
    const onVis = () => document.visibilityState === 'visible' && load();      // retour depuis les réglages Android
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);
  useEffect(() => { if (focusTopics) document.getElementById('sujets')?.scrollIntoView({ block: 'start' }); }, [focusTopics]);

  const saveAI = async key => { await api.setup({ ai_provider: 'gemini', ai_key: key }); load(); onTopicsChanged?.(); };
  const saveSearch = async key => { await api.setup({ search_key: key }); load(); };
  const toggleAuto = async () => { await api.setup({ auto_collect: !status.auto_collect }); load(); };
  const toggleNotify = async () => {
    const on = !status.notify_enabled;
    if (on && dev && !dev.notifications) device.requestNotifications();
    await api.setup({ notify: on });
    load();
  };

  const s = status?.last_summary;
  const needsSetup = status && !status.ai.configured;

  return (
    <div className="pt-safe pb-safe px-4 animate-fade">
      <header className="mb-5">
        <p className="text-[11px] font-medium tracking-[0.32em] text-accent/80">RADAR</p>
        <h1 className="mt-1 text-[26px] font-semibold text-ink">Réglages</h1>
      </header>

      {error && <div className="mb-3 rounded-3xl bg-surface p-5 text-sm text-red-300 ring-1 ring-red-400/20">{error}</div>}

      <div className="space-y-3">
        {isNative() && <AppUpdate version={dev?.version} />}

        {status && (
          <Block title="Intelligence artificielle" highlight={needsSetup}>
            <KeyForm label="Google Gemini" placeholder="AIza…" id="gemini-key" configured={status.ai.configured} onSave={saveAI}>
              <p className="text-xs leading-relaxed text-muted">Indispensable : traduit, classe et regroupe les articles. Gratuit.</p>
              <ol className="list-decimal space-y-0.5 pl-4 text-xs leading-relaxed text-muted">
                <li>Ouvrez <Link href="https://aistudio.google.com/apikey">aistudio.google.com/apikey</Link> et connectez-vous avec Google.</li>
                <li>Touchez « Create API key », puis copiez la clé (elle commence par « AIza »).</li>
                <li>Collez-la ici.</li>
              </ol>
            </KeyForm>
          </Block>
        )}

        {status && (
          <Block title="Recherche web" highlight={status.ai.configured && !status.search.configured}>
            <KeyForm label="Tavily" placeholder="tvly-…" id="tavily-key" configured={status.search.configured} onSave={saveSearch}>
              <p className="text-xs leading-relaxed text-muted">Recommandé : retrouve les informations des mois passés et les sites sans flux (Weibo relayé, sites chinois…). Gratuit, 1 000 recherches par mois.</p>
              <ol className="list-decimal space-y-0.5 pl-4 text-xs leading-relaxed text-muted">
                <li>Ouvrez <Link href="https://app.tavily.com">app.tavily.com</Link> → « Sign up » (compte Google possible).</li>
                <li>Copiez la clé « API Key » (elle commence par « tvly- ») et collez-la ici.</li>
              </ol>
            </KeyForm>
          </Block>
        )}

        <Topics onAdded={() => { load(); onTopicsChanged?.(); }} autoFocus={focusTopics} />

        <Block title="Synchronisation">
          <p className="text-sm text-ink">Dernière synchronisation : {timeAgo(status?.last_sync)}</p>
          {status && <p className="mt-0.5 text-xs text-muted">{status.auto_collect ? `Prochaine collecte automatique : ${formatDateTime(status.next_collect)}` : 'Collecte automatique désactivée'}</p>}
          {s && (
            <p className="mt-3 text-xs leading-relaxed text-muted">
              Dernier passage ({s.mode === 'background' ? 'automatique' : 'manuel'}) :
              {' '}{s.topics} sujet{s.topics > 1 ? 's' : ''} collecté{s.topics > 1 ? 's' : ''}, {s.newItems} nouvel{s.newItems > 1 ? 's' : ''} article{s.newItems > 1 ? 's' : ''},
              {' '}{s.analyzed} analysé{s.analyzed > 1 ? 's' : ''}, {s.created} carte{s.created > 1 ? 's' : ''} créée{s.created > 1 ? 's' : ''}.
            </p>
          )}
          {status && <p className="mt-1 text-xs text-muted">Articles en attente d'analyse : {status.pending}</p>}
          {status?.last_error && <p className="mt-3 rounded-2xl bg-red-500/10 p-3 text-xs text-red-200 ring-1 ring-red-400/20">{status.last_error}</p>}
          {/connexion Internet|UnknownHost/.test(status?.last_error || '') && (
            <p className="mt-2 text-[11px] leading-relaxed text-muted">
              Rien n'est perdu : les articles restent en attente. Si le message revient alors que le téléphone a du réseau, autorisez Radar en arrière-plan :
              Paramètres → Applications → Radar → <b>Données mobiles</b> → « Données en arrière-plan » activé, et <b>Batterie</b> → « Non restreinte ».
              Pensez aussi à un éventuel VPN, bloqueur de publicités ou « DNS privé ».
            </p>
          )}
          <Btn onClick={onRefresh} disabled={refreshing} className="mt-4 w-full bg-ink text-bg">{refreshing ? 'Synchronisation en cours…' : 'Actualiser maintenant'}</Btn>
          {refreshMsg && <p className="mt-2 text-xs text-muted">{refreshMsg}</p>}
          <p className="mt-3 text-[11px] leading-relaxed text-faint">
            « Actualiser » interroge toutes les sources de vos sujets puis analyse tous les articles en attente. L'ouverture de l'application ne déclenche rien.
          </p>
          {status && (
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-4">
              <div>
                <p className="text-sm text-ink">Collecte automatique à 8 h</p>
                <p className="text-xs text-muted">{status.auto_collect ? 'Chaque matin, même application fermée.' : 'Désactivée : rien ne se fait sans « Actualiser ».'}</p>
              </div>
              <Switch on={status.auto_collect} onClick={toggleAuto} label="Collecte automatique à 8 h" />
            </div>
          )}
        </Block>

        {isNative() && dev && (
          <Block title="Fonctionnement en arrière-plan" highlight={!dev.batteryExempt}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-ink">Économie de batterie</p>
                <p className="text-xs text-muted">{dev.batteryExempt ? 'Désactivée pour Radar : la collecte de 8 h peut se faire application fermée.' : 'Active : Android risque de bloquer la collecte de 8 h quand l\'application est fermée.'}</p>
              </div>
              {dev.batteryExempt ? <span className="text-xs text-emerald-300">✔ OK</span>
                : <Btn onClick={() => device.requestBattery()} className="shrink-0 bg-ink text-bg">Autoriser</Btn>}
            </div>
            {!dev.batteryExempt && (
              <p className="mt-3 text-[11px] leading-relaxed text-faint">
                Sur ROG Phone, vérifiez aussi : Paramètres → Applications → Radar → Batterie → « Non restreinte », et dans Mobile Manager, autorisez le démarrage automatique de Radar.
              </p>
            )}
          </Block>
        )}

        {status && (
          <Block title="Notifications">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-ink">Nouveautés importantes</p>
                <p className="text-xs text-muted">Annonces officielles et informations majeures, une notification par sujet.</p>
              </div>
              <button onClick={toggleNotify} role="switch" aria-checked={status.notify_enabled && (!dev || dev.notifications)}
                className={`relative h-7 w-12 shrink-0 rounded-full transition ${status.notify_enabled && (!dev || dev.notifications) ? 'bg-accent' : 'bg-surface-2 ring-1 ring-line'}`}>
                <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${status.notify_enabled && (!dev || dev.notifications) ? 'left-6' : 'left-1'}`} />
              </button>
            </div>
            {dev && !dev.notifications && status.notify_enabled && (
              <p className="mt-2 text-xs text-muted">Android bloque encore les notifications de Radar. <button className="text-accent underline" onClick={() => device.requestNotifications()}>Les autoriser</button></p>
            )}
          </Block>
        )}

        {status?.source_groups && (
          <Block title="Sources surveillées">
            <ul className="divide-y divide-line">
              {status.source_groups.map(g => {
                const okN = g.sources.filter(x => x.last_status.startsWith('ok')).length;
                const open = openGroup === g.id;
                return (
                  <li key={g.id} className="py-2.5 first:pt-0 last:pb-0">
                    <button onClick={() => setOpenGroup(open ? null : g.id)} className="flex w-full items-center justify-between gap-2 text-left">
                      <span className="text-sm text-ink">{g.name}</span>
                      <span className="flex items-center gap-2 text-xs text-muted">{okN}/{g.sources.length} opérationnelles<IconChevron className={`text-faint transition ${open ? 'rotate-180' : ''}`} /></span>
                    </button>
                    {open && (
                      <ul className="mt-2 space-y-2 animate-rise">
                        {g.sources.map(src => (
                          <li key={src.id}>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs text-ink/90">{src.name}</span>
                              <span className={`h-2 w-2 shrink-0 rounded-full ${src.last_status.startsWith('ok') ? 'bg-emerald-400' : src.last_fetched ? 'bg-red-400' : 'bg-zinc-600'}`} />
                            </div>
                            <p className="text-[11px] text-faint">{src.last_fetched ? `${timeAgo(src.last_fetched)} — ${src.last_status}` : src.last_status}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </Block>
        )}

        <Block title="Niveaux de fiabilité">
          <ul className="space-y-3">
            {Object.entries(RELIABILITY).map(([k, r]) => (
              <li key={k} className="flex items-start gap-3">
                <span className="w-28 shrink-0"><ReliabilityBadge value={k} small /></span>
                <span className="text-xs leading-relaxed text-muted">{r.desc}{r.labelGeneral ? ` (« ${r.labelGeneral} » pour un sujet général.)` : ''}</span>
              </li>
            ))}
            <li className="flex items-start gap-3">
              <span className="w-28 shrink-0"><CompetitorBadge small /></span>
              <span className="text-xs leading-relaxed text-muted">Nouveauté d'un produit concurrent susceptible de rivaliser avec un de vos produits suivis.</span>
            </li>
          </ul>
        </Block>

        {status?.legacy?.cards > 0 && (
          <p className="px-2 text-center text-[11px] text-faint">{status.legacy.cards} actualité{status.legacy.cards > 1 ? 's' : ''} reprise{status.legacy.cards > 1 ? 's' : ''} de l'application web Find X10 Ultra.</p>
        )}
        {dev?.version && <p className="px-2 pb-2 text-center text-[11px] text-faint">Radar {dev.version}</p>}
      </div>
    </div>
  );
}
