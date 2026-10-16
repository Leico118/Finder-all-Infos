// Assistant de configuration des clés : une étape par service, très guidée.
// L'utilisateur copie la clé sur le site ; en revenant dans Radar, elle est détectée et enregistrée toute seule.
import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { device } from '../native.js';
import { ReceiveKeys } from './KeyTransfer.jsx';

export const KEY_STEPS = [
  {
    id: 'gemini', name: 'Google Gemini', site: 'Google', need: 'Indispensable',
    role: 'C\'est l\'intelligence artificielle qui lit, traduit et résume les nouvelles pour vous.',
    url: 'https://aistudio.google.com/apikey', pattern: /AIza[0-9A-Za-z_-]{30,}/,
    save: k => api.setup({ ai_provider: 'gemini', ai_key: k }), done: st => st.ai.configured,
    howto: [
      'Touchez le bouton « Ouvrir le site de Google » ci-dessous.',
      'Connectez-vous avec votre compte Google (votre adresse Gmail) et acceptez les conditions si on vous les présente.',
      'Touchez « Create API key » (« Créer une clé API »). Si une clé est déjà affichée, passez directement à l\'étape suivante.',
      'Touchez l\'icône « Copier » à côté de la clé. Elle commence par AIza.',
      'Revenez dans Radar : la clé est trouvée et vérifiée toute seule.',
    ],
  },
  {
    id: 'groq', name: 'Groq', site: 'Groq', need: 'Recommandé',
    role: 'Une deuxième intelligence artificielle qui prend le relais quand Google est surchargé.',
    url: 'https://console.groq.com/keys', pattern: /gsk_[A-Za-z0-9]{20,}/,
    save: k => api.setup({ backup_key: k }), done: st => st.ai.backup,
    howto: [
      'Touchez le bouton « Ouvrir le site de Groq » ci-dessous.',
      'Touchez « Continue with Google » et choisissez votre compte Google.',
      'Touchez « Create API Key », écrivez « Radar » comme nom, puis touchez « Submit ».',
      'Touchez « Copy ». Attention : la clé (elle commence par gsk_) ne s\'affiche qu\'une seule fois.',
      'Revenez dans Radar : la clé est trouvée et vérifiée toute seule.',
    ],
  },
  {
    id: 'tavily', name: 'Tavily', site: 'Tavily', need: 'Recommandé',
    role: 'La recherche sur le web, qui retrouve aussi les nouvelles des semaines et des mois passés.',
    url: 'https://app.tavily.com/home', pattern: /tvly-[A-Za-z0-9_-]{16,}/,
    save: k => api.setup({ search_key: k }), done: st => st.search.configured,
    howto: [
      'Touchez le bouton « Ouvrir le site de Tavily » ci-dessous.',
      'Touchez « Continue with Google » et choisissez votre compte Google. Si une offre vous est proposée, choisissez l\'offre gratuite.',
      'Sur la page d\'accueil, repérez le cadre « API Keys » : une clé nommée « default » y est déjà prête.',
      'Touchez l\'icône « Copier » à droite de cette clé. Elle commence par tvly-.',
      'Revenez dans Radar : la clé est trouvée et vérifiée toute seule.',
    ],
  },
];

export default function KeySetup({ startAt, onFinish }) {
  const [status, setStatus] = useState(null);
  const [i, setI] = useState(() => Math.max(0, KEY_STEPS.findIndex(s => s.id === startAt)));
  const [state, setState] = useState('idle');            // idle | waiting | checking | ok | error
  const [msg, setMsg] = useState('');
  const [manual, setManual] = useState(false);
  const [text, setText] = useState('');
  const [proche, setProche] = useState(false);
  const tried = useRef(new Set());
  const step = KEY_STEPS[i];

  const load = () => api.status().then(st => { setStatus(st); return st; }).catch(() => null);
  useEffect(() => { load(); }, []);

  async function save(key, s = step) {
    setState('checking'); setMsg(`Vérification de la clé ${s.name}…`);
    try {
      await s.save(key);
      setState('ok'); setMsg(`✔ Clé ${s.name} enregistrée.`);
      setManual(false); setText('');
      await load();
    } catch (e) {
      setState('error'); setMsg(`✖ ${e.message}`);
    }
  }

  // Au retour dans Radar : clé copiée sur le site ? Elle est reconnue et enregistrée sans rien coller.
  useEffect(() => {
    const check = () => {
      const clip = device.clipboard();
      if (!clip) return;
      for (const s of KEY_STEPS) {
        const m = clip.match(s.pattern);
        if (m && !tried.current.has(m[0])) {
          tried.current.add(m[0]);
          if (s.id !== step.id) setI(KEY_STEPS.indexOf(s));
          save(m[0], s);
          return;
        }
      }
    };
    window.__radarFocus = () => setTimeout(check, 250);
    const onVis = () => document.visibilityState === 'visible' && setTimeout(check, 600);
    document.addEventListener('visibilitychange', onVis);
    check();
    return () => { window.__radarFocus = null; document.removeEventListener('visibilitychange', onVis); };
  }, [i]);

  const go = n => { setI(n); setState('idle'); setMsg(''); setManual(false); setProche(false); window.scrollTo(0, 0); };
  const done = status ? step.done(status) : false;
  const last = i === KEY_STEPS.length - 1;
  const next = () => (last ? onFinish() : go(i + 1));
  const open = () => { setState('waiting'); setMsg(''); device.openUrl(step.url); };

  return (
    <div className="pt-safe px-4 pb-10 animate-fade">
      <header className="mb-5">
        <p className="text-[13px] font-medium tracking-[0.28em] text-accent/80">CONFIGURER RADAR</p>
        <h1 className="mt-1 text-[28px] font-semibold leading-tight text-ink">Étape {i + 1} sur {KEY_STEPS.length}</h1>
        <div className="mt-3 flex gap-2" aria-hidden>
          {KEY_STEPS.map((s, k) => (
            <span key={s.id} className={`h-1.5 flex-1 rounded-full ${k < i || (k === i && done) ? 'bg-accent' : k === i ? 'bg-accent/40' : 'bg-line'}`} />
          ))}
        </div>
      </header>

      <section className="rounded-3xl bg-surface p-6 ring-1 ring-line animate-rise" key={step.id}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[24px] font-semibold text-ink">{step.name}</h2>
          <span className={`shrink-0 rounded-full px-3 py-1 text-[13px] font-semibold ${step.need === 'Indispensable' ? 'bg-accent text-bg' : 'bg-surface-2 text-muted ring-1 ring-line'}`}>{step.need}</span>
        </div>
        <p className="mt-2 text-[17px] leading-relaxed text-ink/85">{step.role}</p>
        <p className="mt-1 text-[15px] text-muted">Gratuit · aucune carte bancaire · à faire une seule fois.</p>

        {done && state !== 'ok' ? (
          <div className="mt-5 rounded-2xl bg-emerald-500/10 p-4 text-[17px] text-emerald-200 ring-1 ring-emerald-400/25">✔ Déjà configurée sur ce téléphone.</div>
        ) : state === 'ok' ? null : (
          <>
            <ol className="mt-5 space-y-3">
              {step.howto.map((h, k) => (
                <li key={k} className="flex gap-3 text-[17px] leading-relaxed text-ink/90">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent/15 text-[15px] font-bold text-accent">{k + 1}</span>
                  <span>{h}</span>
                </li>
              ))}
            </ol>
            <button onClick={open} className="mt-6 w-full rounded-2xl bg-ink px-5 py-4 text-[18px] font-semibold text-bg active:scale-[0.98]">
              Ouvrir le site de {step.site}
            </button>
          </>
        )}

        {(state === 'waiting' || state === 'checking') && (
          <p className="mt-4 flex items-center gap-3 text-[16px] text-muted" role="status">
            <span className="h-3 w-3 animate-pulse rounded-full bg-accent" />
            {state === 'checking' ? msg : 'Copiez la clé sur le site, puis revenez ici…'}
          </p>
        )}
        {(state === 'ok' || state === 'error') && (
          <p className={`mt-4 rounded-2xl p-4 text-[17px] ${state === 'ok' ? 'bg-emerald-500/10 text-emerald-200 ring-1 ring-emerald-400/25' : 'bg-red-500/10 text-red-200 ring-1 ring-red-400/20'}`} role="status">{msg}</p>
        )}

        {!manual ? (
          <button onClick={() => setManual(true)} className="mt-4 text-[15px] text-muted underline underline-offset-4">
            {done ? 'Remplacer cette clé' : 'Je préfère coller la clé moi-même'}
          </button>
        ) : (
          <div className="mt-4 space-y-3 animate-rise">
            <input value={text} onChange={e => setText(e.target.value)} placeholder={`Clé ${step.name}`} type="password" autoComplete="off" id={`key-${step.id}`}
              className="w-full rounded-2xl bg-surface-2 px-4 py-4 text-[17px] text-ink ring-1 ring-line outline-none focus:ring-accent/60" />
            <button onClick={() => save(text.trim())} disabled={text.trim().length < 10 || state === 'checking'}
              className="w-full rounded-2xl bg-ink px-5 py-3.5 text-[17px] font-semibold text-bg disabled:opacity-50">Vérifier et enregistrer</button>
          </div>
        )}
      </section>

      <div className="mt-5 flex gap-3">
        {i > 0 && <button onClick={() => go(i - 1)} className="rounded-2xl bg-surface px-5 py-4 text-[17px] text-ink ring-1 ring-line">‹ Retour</button>}
        {done || state === 'ok'
          ? <button onClick={next} className="flex-1 rounded-2xl bg-accent px-5 py-4 text-[18px] font-semibold text-bg">{last ? 'Terminer' : 'Étape suivante ›'}</button>
          : step.need !== 'Indispensable' && <button onClick={next} className="flex-1 rounded-2xl bg-surface px-5 py-4 text-[17px] text-muted ring-1 ring-line">{last ? 'Passer et terminer' : 'Passer cette étape'}</button>}
      </div>
      {step.need !== 'Indispensable' && !done && state !== 'ok' && (
        <p className="mt-3 text-center text-[14px] text-faint">Vous pourrez l'ajouter plus tard dans Réglages → Clés IA.</p>
      )}

      {i === 0 && !done && state !== 'ok' && (
        <div className="mt-8 border-t border-line pt-5">
          {!proche
            ? <button onClick={() => setProche(true)} className="w-full text-center text-[15px] text-muted underline underline-offset-4">Un proche vous a donné un code Radar ?</button>
            : <ReceiveKeys simple onDone={async () => { const st = await load(); if (st?.ai.configured) onFinish(); }} />}
        </div>
      )}
    </div>
  );
}
