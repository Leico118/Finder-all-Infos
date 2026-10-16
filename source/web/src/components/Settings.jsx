import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { device, isNative } from '../native.js';
import RefreshProgress from './RefreshProgress.jsx';
import HourPicker, { hourLabel } from './HourPicker.jsx';
import { RELIABILITY, ReliabilityBadge, CompetitorBadge } from './Badge.jsx';
import { IconChevron } from './Icons.jsx';
import { formatDateTime, timeAgo } from '../util.js';
import Topics from './Topics.jsx';
import { BigButton } from './Simple.jsx';
import { ShareKeys, ReceiveKeys } from './KeyTransfer.jsx';
import ThemePicker from './ThemePicker.jsx';
import { KEY_STEPS } from './KeySetup.jsx';

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
function AppUpdate({ version, simple = false, onlyIfAvailable = false }) {
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
  if ((simple || onlyIfAvailable) && !available) return null;   // en haut / mode simplifié : seulement s'il y a une mise à jour
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

// Interrupteur du mode simplifié (affiché en bas des réglages, dans les deux modes).
function ModeBlock({ simple, onModeChange }) {
  return (
    <section className={`rounded-3xl bg-surface ring-1 ring-line animate-rise ${simple ? 'p-6' : 'p-5'}`}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className={simple ? 'text-[19px] font-medium text-ink' : 'text-sm text-ink'}>Mode simplifié</p>
          <p className={simple ? 'mt-1 text-[16px] text-muted' : 'text-xs text-muted'}>
            {simple ? 'Activé : gros caractères, l\'essentiel seulement.' : 'Gros caractères et uniquement l\'essentiel, pour une utilisation sans effort.'}
          </p>
        </div>
        <Switch on={simple} onClick={() => onModeChange(simple ? 'full' : 'simple')} label="Mode simplifié" />
      </div>
    </section>
  );
}

// Clés IA : état de chaque service et accès à l'assistant de configuration.
function KeysBlock({ status }) {
  return (
    <Block title="Clés IA">
      <ul className="divide-y divide-line">
        {KEY_STEPS.map(k => {
          const on = k.done(status);
          const received = on && status.keys_received?.[k.id];
          return (
            <li key={k.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink">{k.name} <span className="text-xs font-normal text-faint">· {k.need.toLowerCase()}</span></span>
                <span className={`block text-xs ${on ? 'text-emerald-300' : k.need === 'Indispensable' ? 'text-red-300' : 'text-muted'}`}>
                  {on ? (received ? '✔ Active (reçue d\'un proche)' : '✔ Active') : 'Non configurée'}
                </span>
              </span>
              <a href={`#/cles/${k.id}`} className={`shrink-0 rounded-2xl px-4 py-2 text-sm font-medium ${on ? 'bg-surface-2 text-ink ring-1 ring-line' : 'bg-ink text-bg'}`}>
                {on ? 'Modifier' : 'Configurer'}
              </a>
            </li>
          );
        })}
      </ul>
    </Block>
  );
}

// Radar pas encore prêt : un seul gros bouton vers l'assistant.
function SetupBanner({ simple }) {
  return (
    <section className={`rounded-3xl bg-accent/10 ring-1 ring-accent/40 animate-rise ${simple ? 'p-6' : 'p-5'}`}>
      <p className={`font-semibold text-ink ${simple ? 'text-[21px]' : 'text-base'}`}>Radar n'est pas encore configuré</p>
      <p className={`mt-1 text-muted ${simple ? 'text-[17px]' : 'text-sm'}`}>Quelques minutes, une seule fois : l'assistant vous guide pas à pas.</p>
      <a href="#/cles" className={`mt-4 block w-full rounded-2xl bg-accent text-center font-semibold text-bg ${simple ? 'py-4 text-[18px]' : 'py-3 text-[15px]'}`}>Configurer Radar</a>
    </section>
  );
}

export default function Settings({ onRefresh, refreshing, refreshMsg, progress, onTopicsChanged, focusTopics, simple = false, onModeChange }) {
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

  const [picker, setPicker] = useState(false);
  const toggleAuto = async () => { await api.setup({ auto_collect: !status.auto_collect }); load(); };
  const toggleNotify = async () => {
    const on = !status.notify_enabled;
    if (on && dev && !dev.notifications) device.requestNotifications();
    await api.setup({ notify: on });
    load();
  };
  const notifyOn = status && status.notify_enabled && (!dev || dev.notifications);

  const s = status?.last_summary;
  const needsSetup = status && !status.ai.configured;

  // ======================= Mode simplifié =======================
  if (simple) {
    return (
      <div className="pt-safe pb-safe px-4 animate-fade">
        <header className="mb-5">
          <h1 className="text-[30px] font-semibold text-ink">Réglages</h1>
        </header>
        {error && <div className="mb-4 rounded-3xl bg-surface p-5 text-[16px] text-red-300 ring-1 ring-red-400/20">{error}</div>}
        <div className="space-y-4">
          {needsSetup && <SetupBanner simple />}

          <section className="rounded-3xl bg-surface p-6 ring-1 ring-line animate-rise">
            <p className="text-[18px] text-ink">Dernière recherche : {timeAgo(status?.last_sync)}</p>
            <BigButton onClick={onRefresh} disabled={refreshing || needsSetup} className="mt-4 bg-ink text-bg">{refreshing ? 'Recherche en cours…' : 'Chercher les nouvelles'}</BigButton>
            {refreshing && progress ? <div className="mt-4"><RefreshProgress progress={progress} compact /></div>
              : refreshMsg && <p className="mt-3 text-[16px] text-muted">{refreshMsg}</p>}
          </section>

          <Topics simple onAdded={() => { load(); onTopicsChanged?.(); }} autoFocus={focusTopics} />

          <ThemePicker simple />
          <ModeBlock simple onModeChange={onModeChange} />

          {status && (
            <section className="rounded-3xl bg-surface p-6 ring-1 ring-line animate-rise">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[19px] font-medium text-ink">Alertes sur le téléphone</p>
                  <p className="mt-1 text-[16px] text-muted">Prévenir quand une nouvelle importante arrive.</p>
                </div>
                <Switch on={notifyOn} onClick={toggleNotify} label="Alertes sur le téléphone" />
              </div>
            </section>
          )}

          {isNative() && <AppUpdate version={dev?.version} simple />}
        </div>
      </div>
    );
  }

  // ======================= Mode complet =======================
  // Ordre : l'usage de tous les jours d'abord (actualiser, sujets, apparence), le technique ensuite, la version tout en bas.
  return (
    <div className="pt-safe pb-safe px-4 animate-fade">
      <header className="mb-5">
        <p className="text-[11px] font-medium tracking-[0.32em] text-accent/80">RADAR</p>
        <h1 className="mt-1 text-[26px] font-semibold text-ink">Réglages</h1>
      </header>

      {error && <div className="mb-3 rounded-3xl bg-surface p-5 text-sm text-red-300 ring-1 ring-red-400/20">{error}</div>}

      <div className="space-y-3">
        {needsSetup && <SetupBanner />}
        {isNative() && <AppUpdate version={dev?.version} onlyIfAvailable />}

        <Block title="Actualiser">
          <Btn onClick={onRefresh} disabled={refreshing || needsSetup} className="w-full bg-ink py-3 text-[15px] text-bg">{refreshing ? 'Synchronisation en cours…' : 'Actualiser maintenant'}</Btn>
          {refreshing && progress ? <div className="mt-3"><RefreshProgress progress={progress} compact /></div>
            : refreshMsg && <p className="mt-2 text-xs text-muted">{refreshMsg}</p>}
          <p className="mt-3 text-sm text-ink">Dernière synchronisation : {timeAgo(status?.last_sync)}</p>
          {s && (
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Dernier passage ({s.mode === 'background' ? 'automatique' : 'manuel'}) :
              {' '}{s.newItems} nouvel{s.newItems > 1 ? 's' : ''} article{s.newItems > 1 ? 's' : ''},
              {' '}{s.analyzed} analysé{s.analyzed > 1 ? 's' : ''}{s.backup ? ` (dont ${s.backup} par l'IA de secours)` : ''}, {s.created} carte{s.created > 1 ? 's' : ''} créée{s.created > 1 ? 's' : ''}
              {status?.pending ? ` · ${status.pending} en attente d'analyse` : ''}.
            </p>
          )}
          {status?.last_error && <p className="mt-3 rounded-2xl bg-red-500/10 p-3 text-xs text-red-200 ring-1 ring-red-400/20">{status.last_error}</p>}
          {/connexion Internet|UnknownHost/.test(status?.last_error || '') && (
            <p className="mt-2 text-[11px] leading-relaxed text-muted">
              Rien n'est perdu : les articles restent en attente. Si le message revient alors que le téléphone a du réseau, autorisez Radar en arrière-plan :
              Paramètres → Applications → Radar → <b>Données mobiles</b> → « Données en arrière-plan » activé, et <b>Batterie</b> → « Non restreinte ».
              Pensez aussi à un éventuel VPN, bloqueur de publicités ou « DNS privé ».
            </p>
          )}
          {status && (
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-4">
              <div className="min-w-0">
                <p className="text-sm text-ink">Collecte automatique</p>
                <p className="text-xs text-muted">{status.auto_collect ? `Chaque jour · prochaine : ${formatDateTime(status.next_collect)}` : 'Désactivée : rien ne se fait sans « Actualiser ».'}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2.5">
                <button onClick={() => setPicker(true)} disabled={!status.auto_collect} aria-label="Changer l'heure de la collecte automatique"
                  className="rounded-xl bg-surface-2 px-3 py-1.5 text-sm font-semibold tabular-nums text-ink ring-1 ring-accent/30 transition active:scale-95 disabled:opacity-40 disabled:ring-line">
                  {hourLabel(status.daily_hour ?? 8)}
                </button>
                <Switch on={status.auto_collect} onClick={toggleAuto} label="Collecte automatique" />
              </div>
            </div>
          )}
          {picker && status && (
            <HourPicker value={status.daily_hour ?? 8} onClose={() => setPicker(false)}
              onPick={async h => { await api.setup({ daily_hour: h }); setPicker(false); load(); }} />
          )}
        </Block>

        <Topics onAdded={() => { load(); onTopicsChanged?.(); }} autoFocus={focusTopics} />

        <ThemePicker />
        {onModeChange && <ModeBlock simple={false} onModeChange={onModeChange} />}

        {status && (
          <Block title="Notifications">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-ink">Nouveautés importantes</p>
                <p className="text-xs text-muted">Annonces officielles et informations majeures, une notification par sujet.</p>
              </div>
              <Switch on={notifyOn} onClick={toggleNotify} label="Notifications" />
            </div>
            {dev && !dev.notifications && status.notify_enabled && (
              <p className="mt-2 text-xs text-muted">Android bloque encore les notifications de Radar. <button className="text-accent underline" onClick={() => device.requestNotifications()}>Les autoriser</button></p>
            )}
          </Block>
        )}

        {status && <KeysBlock status={status} />}
        {isNative() && status?.can_share && <ShareKeys />}

        {isNative() && dev && (
          <Block title="Fonctionnement en arrière-plan" highlight={!dev.batteryExempt}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-ink">Économie de batterie</p>
                <p className="text-xs text-muted">{dev.batteryExempt ? 'Désactivée pour Radar : la collecte automatique peut se faire application fermée.' : 'Active : Android risque de bloquer la collecte automatique quand l\'application est fermée.'}</p>
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

        {isNative() && <AppUpdate version={dev?.version} />}
        {status?.legacy?.cards > 0 && (
          <p className="px-2 text-center text-[11px] text-faint">{status.legacy.cards} actualité{status.legacy.cards > 1 ? 's' : ''} reprise{status.legacy.cards > 1 ? 's' : ''} de l'application web Find X10 Ultra.</p>
        )}
      </div>
    </div>
  );
}
