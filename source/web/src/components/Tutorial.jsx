import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api.js';
import { RELIABILITY, ReliabilityBadge } from './Badge.jsx';

// Guide de démarrage : quelques écrans courts, à faire défiler du doigt.
// D'abord ce qu'il faut faire (dans l'ordre), ensuite à quoi servent les différentes parties.

const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* stockage indisponible */ } },
};
export const TUTO_DONE = 'radar-tuto-done';
export const FIRST_STEPS = 'radar-first-steps';          // « 1 » : afficher la carte « Premiers pas » (nouvelle installation)
export const FIRST_STEPS_TOPICS = 'radar-first-steps-topics';
export const firstStepsStore = store;

function RadarMark({ size = 96 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      <defs>
        <linearGradient id="tuto-sweep" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="var(--color-accent)" stopOpacity="0" />
          <stop offset="1" stopColor="var(--color-accent)" stopOpacity="0.35" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="44" fill="none" stroke="var(--color-muted)" strokeOpacity="0.4" strokeWidth="2.5" />
      <circle cx="50" cy="50" r="30" fill="none" stroke="var(--color-accent)" strokeWidth="3" />
      <circle cx="50" cy="50" r="15" fill="none" stroke="var(--color-muted)" strokeOpacity="0.4" strokeWidth="2.5" />
      <g className="tuto-sweep">
        <path d="M50 50 L50 6 A44 44 0 0 1 78.3 16.3 Z" fill="url(#tuto-sweep)" />
        <line x1="50" y1="50" x2="77" y2="17.8" stroke="var(--color-accent)" strokeWidth="3.5" strokeLinecap="round" />
      </g>
      <circle cx="50" cy="50" r="5.5" fill="var(--color-accent)" />
      <circle cx="33" cy="27" r="3" fill="var(--color-accent)" className="tuto-blip" />
    </svg>
  );
}

// ---------- Petites illustrations (maquettes en miniature de l'application) ----------
const Frame = ({ children }) => (
  <div className="w-full max-w-[330px] rounded-3xl bg-surface p-3.5 text-left ring-1 ring-line shadow-xl shadow-black/20">{children}</div>
);

function MiniCard({ big }) {
  return (
    <Frame>
      <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted">
        <span><span className="font-medium text-accent/90">Fairphone</span> · il y a 2 h</span>
        <span className="h-2 w-2 rounded-full bg-accent" />
      </div>
      <p className={`font-semibold leading-snug text-ink ${big ? 'text-[17px]' : 'text-[14px]'}`}>La date de sortie du prochain modèle se précise</p>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <ReliabilityBadge value="reliable" small />
        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted ring-1 ring-line">4 sources</span>
      </div>
    </Frame>
  );
}

function Legend({ big }) {
  return (
    <ul className={`mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-left ${big ? 'text-[15px]' : 'text-[12px]'}`}>
      {Object.keys(RELIABILITY).map(k => (
        <li key={k} className="flex items-center gap-2">
          <ReliabilityBadge value={k} small />
          <span className="text-muted">{{ official: 'confirmé', reliable: 'sérieux', rumor: 'à confirmer', unverified: 'prudence' }[k]}</span>
        </li>
      ))}
    </ul>
  );
}

function MiniFilters() {
  return (
    <Frame>
      <div className="mb-3 flex gap-4 border-b border-line text-[13px]">
        <span className="relative pb-2 font-medium text-ink">Tous<span className="absolute inset-x-0 -bottom-px h-[3px] rounded-full bg-accent" /></span>
        <span className="pb-2 text-muted">Fairphone<sup className="ml-0.5 text-[10px] font-bold text-accent">3</sup></span>
        <span className="pb-2 text-muted">Assurances</span>
      </div>
      <div className="flex rounded-xl bg-surface-2 p-1 text-[12px] ring-1 ring-line">
        {['Tout', 'Leaks', 'Officiel', 'Concurrents'].map((l, i) => (
          <span key={l} className={`flex-1 rounded-lg py-1.5 text-center ${i === 0 ? 'bg-ink font-medium text-bg' : 'text-muted'}`}>{l}</span>
        ))}
      </div>
      <span className="mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] font-semibold text-accent ring-1 ring-accent/45">
        <span className="h-2 w-2 rounded-full bg-accent" />Non lus <span className="text-accent/70">3</span>
      </span>
    </Frame>
  );
}

function MiniSheet() {
  const rows = [['Écran', '6,7 pouces', 'official'], ['Batterie', '5 000 mAh', 'reliable'], ['Prix', 'environ 600 €', 'rumor'], ['Sortie', 'Inconnu', null]];
  return (
    <Frame>
      <div className="mb-2 flex gap-2 text-[11px]">
        <span className="rounded-xl bg-accent/15 px-2.5 py-1.5 font-medium text-accent ring-1 ring-accent/40">L'essentiel</span>
        <span className="rounded-xl bg-surface-2 px-2.5 py-1.5 text-muted ring-1 ring-line">Modèle 6</span>
        <span className="rounded-xl border border-dashed border-line px-2.5 py-1.5 text-faint">+ Ajouter</span>
      </div>
      <ul className="divide-y divide-line text-[13px]">
        {rows.map(([k, v, r]) => (
          <li key={k} className="flex items-center justify-between py-1.5">
            <span className="text-muted">{k}</span>
            <span className="flex items-center gap-1.5">
              <span className={v === 'Inconnu' ? 'text-faint' : 'text-ink'}>{v}</span>
              {r && <span className="text-[8px]">{RELIABILITY[r].dot}</span>}
            </span>
          </li>
        ))}
      </ul>
    </Frame>
  );
}

function MiniList({ items, big }) {
  return (
    <ul className="w-full max-w-[340px] space-y-2 text-left">
      {items.map(([icon, title, text]) => (
        <li key={title} className="flex items-start gap-3 rounded-2xl bg-surface px-4 py-3 ring-1 ring-line">
          <span className={`shrink-0 ${big ? 'text-[24px]' : 'text-[19px]'}`} aria-hidden>{icon}</span>
          <span>
            <span className={`block font-medium text-ink ${big ? 'text-[17px]' : 'text-[14px]'}`}>{title}</span>
            <span className={`block leading-snug text-muted ${big ? 'text-[15px]' : 'text-[12px]'}`}>{text}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function Steps({ simple }) {
  const steps = [
    ['Connecter l\'IA', 'Deux clés gratuites, quelques minutes, une seule fois. Un assistant vous guide, sans rien à installer.'],
    ['Choisir vos sujets', 'Un téléphone, une marque, un thème… Un exemple est déjà là : gardez-le ou remplacez-le.'],
    [simple ? 'Chercher les nouvelles' : 'Actualiser', 'La première recherche prend quelques minutes. Les nouvelles s\'affichent au fur et à mesure.'],
  ];
  return (
    <ol className="w-full max-w-[340px] space-y-2.5 text-left">
      {steps.map(([t, d], i) => (
        <li key={t} className="flex items-start gap-3.5 rounded-2xl bg-surface px-4 py-3.5 ring-1 ring-line">
          <span className={`grid shrink-0 place-items-center rounded-full bg-accent font-bold text-bg ${simple ? 'h-9 w-9 text-[18px]' : 'h-7 w-7 text-[14px]'}`}>{i + 1}</span>
          <span>
            <span className={`block font-semibold text-ink ${simple ? 'text-[19px]' : 'text-[15px]'}`}>{t}</span>
            <span className={`mt-0.5 block leading-snug text-muted ${simple ? 'text-[16px]' : 'text-[13px]'}`}>{d}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function slidesFor(simple) {
  const welcome = {
    visual: <RadarMark size={simple ? 120 : 104} />,
    kicker: 'Bienvenue',
    title: 'Radar fait la veille à votre place',
    text: 'Il lit l\'actualité de vos sujets partout dans le monde, dans toutes les langues, et vous la résume en français. Ce petit guide prend une minute.',
  };
  const steps = {
    visual: <Steps simple={simple} />,
    kicker: 'Pour que tout fonctionne',
    title: '3 étapes, dans l\'ordre',
    text: simple ? '' : 'Pas d\'inquiétude : une carte « Premiers pas » vous rappellera où vous en êtes.',
  };
  if (simple) {
    return [welcome, steps,
      {
        visual: <div className="flex w-full flex-col items-center"><MiniCard big /><Legend big /></div>,
        kicker: 'Lire les nouvelles',
        title: 'Touchez, lisez, c\'est tout',
        text: 'Touchez un sujet, puis une nouvelle pour la lire en entier. Le point doré signale ce qui est nouveau. La pastille de couleur dit si l\'information est sûre.',
      },
      {
        visual: <MiniList big items={[
          ['🔔', 'Alertes', 'Être prévenu quand une nouvelle importante arrive.'],
          ['🎨', 'Couleurs', 'Choisir l\'apparence qui vous plaît.'],
          ['📖', 'Ce guide', 'Il se relance tout en bas des Réglages.'],
        ]} />,
        kicker: 'Réglages',
        title: 'Le reste est déjà réglé',
        text: 'Radar cherche aussi les nouvelles tout seul, une fois par jour.',
      }];
  }
  return [welcome, steps,
    {
      visual: <div className="flex w-full flex-col items-center"><MiniCard /><Legend /></div>,
      kicker: 'Actualités',
      title: 'Une carte = une information',
      text: 'Quand plusieurs sites parlent de la même chose, Radar les regroupe en une seule carte avec toutes les sources. La pastille indique à quel point c\'est sûr.',
    },
    {
      visual: <MiniFilters />,
      kicker: 'Actualités',
      title: 'Trier en un geste',
      text: 'En haut, choisissez un sujet. Dessous, gardez seulement l\'officiel, les fuites ou les concurrents. « Non lus » ne montre que les nouveautés.',
    },
    {
      visual: <MiniSheet />,
      kicker: 'Fiches',
      title: 'Ce qu\'on sait déjà, au même endroit',
      text: 'Radar tient une fiche à jour pour chaque sujet : les caractéristiques d\'un produit ou les repères clés d\'un thème. Vous pouvez ajouter un modèle précis.',
    },
    {
      visual: <MiniList items={[
        ['⏰', 'Collecte automatique', 'Chaque jour à l\'heure choisie, ou seulement quand vous actualisez.'],
        ['🔔', 'Notifications', 'Pour les annonces officielles et les infos majeures.'],
        ['🎨', 'Apparence', 'Plusieurs thèmes et couleurs.'],
        ['👓', 'Mode simplifié', 'Gros caractères, l\'essentiel seulement.'],
      ]} />,
      kicker: 'Réglages',
      title: 'À ajuster selon vos envies',
      text: 'Ce guide se relance à tout moment, tout en bas des Réglages.',
    }];
}

export default function Tutorial({ simple = false, onClose }) {
  const slides = slidesFor(simple);
  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);
  const [ready, setReady] = useState(null);             // IA déjà configurée ? (choisit le dernier bouton)
  const last = i === slides.length - 1;
  const touch = useRef(null);

  useEffect(() => { api.status().then(s => setReady(!!s.ai?.configured)).catch(() => setReady(false)); }, []);
  const go = n => { setDir(n > i ? 1 : -1); setI(Math.max(0, Math.min(slides.length - 1, n))); };
  const finish = target => {
    store.set(TUTO_DONE, '1');
    onClose(target);
  };
  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') { if (i > 0) go(i - 1); else finish(); }         // bouton retour d'Android : écran précédent
      if (e.key === 'ArrowRight') go(i + 1);
      if (e.key === 'ArrowLeft') go(i - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const s = slides[i];
  const big = simple;
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Guide de démarrage"
      className="tuto fixed inset-0 z-50 flex flex-col bg-bg"
      onTouchStart={e => { touch.current = e.touches[0].clientX; }}
      onTouchEnd={e => {
        if (touch.current == null) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        touch.current = null;
        if (dx < -50) go(i + 1); else if (dx > 50) go(i - 1);
      }}>
      <div className="pt-safe mx-auto flex w-full max-w-xl items-center justify-between px-5 pt-3">
        <span className={`font-medium tracking-[0.28em] text-accent/80 ${big ? 'text-[13px]' : 'text-[11px]'}`}>GUIDE · {i + 1}/{slides.length}</span>
        {!last && (
          <button onClick={() => finish()} className={`rounded-full px-3 py-1.5 text-muted active:text-ink ${big ? 'text-[17px]' : 'text-sm'}`}>Passer</button>
        )}
      </div>

      <div key={i} className={`mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-4 text-center ${dir > 0 ? 'tuto-in-right' : 'tuto-in-left'}`}>
        <div className="mb-7 flex w-full justify-center">{s.visual}</div>
        <p className={`font-semibold uppercase tracking-[0.2em] text-accent/90 ${big ? 'text-[13px]' : 'text-[11px]'}`}>{s.kicker}</p>
        <h2 className={`mt-2 font-semibold leading-tight text-ink ${big ? 'text-[27px]' : 'text-[23px]'}`}>{s.title}</h2>
        {s.text && <p className={`mt-3 max-w-[380px] leading-relaxed text-muted ${big ? 'text-[18px]' : 'text-[15px]'}`}>{s.text}</p>}
      </div>

      <div className="pb-safe mx-auto w-full max-w-xl px-5 pb-4">
        <div className="mb-4 flex justify-center gap-2" aria-hidden>
          {slides.map((_, n) => (
            <button key={n} onClick={() => go(n)} tabIndex={-1}
              className={`h-2 rounded-full transition-all ${n === i ? 'w-6 bg-accent' : 'w-2 bg-line'}`} />
          ))}
        </div>
        <div className="flex gap-3">
          {i > 0 && (
            <button onClick={() => go(i - 1)}
              className={`rounded-2xl bg-surface px-5 font-medium text-ink ring-1 ring-line active:scale-[0.98] ${big ? 'py-4 text-[18px]' : 'py-3.5 text-[15px]'}`}>Retour</button>
          )}
          {!last ? (
            <button onClick={() => go(i + 1)}
              className={`flex-1 rounded-2xl bg-accent font-semibold text-bg active:scale-[0.98] ${big ? 'py-4 text-[19px]' : 'py-3.5 text-[15px]'}`}>Suivant</button>
          ) : ready === false ? (
            <button onClick={() => finish('#/cles')}
              className={`flex-1 rounded-2xl bg-accent font-semibold text-bg active:scale-[0.98] ${big ? 'py-4 text-[19px]' : 'py-3.5 text-[15px]'}`}>Étape 1 : connecter l'IA →</button>
          ) : (
            <button onClick={() => finish()}
              className={`flex-1 rounded-2xl bg-accent font-semibold text-bg active:scale-[0.98] ${big ? 'py-4 text-[19px]' : 'py-3.5 text-[15px]'}`}>C'est parti</button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ---------- Carte « Premiers pas » : où en est l'utilisateur, et l'étape suivante en un bouton ----------
export function FirstSteps({ simple = false, aiConfigured, lastSync, onRefresh, refreshing }) {
  const [hidden, setHidden] = useState(() => store.get(FIRST_STEPS) !== '1');
  if (hidden) return null;
  const steps = [
    { title: 'Connecter l\'IA', done: !!aiConfigured, href: '#/cles', cta: 'Configurer' },
    { title: 'Choisir vos sujets', done: store.get(FIRST_STEPS_TOPICS) === '1', href: '#/reglages/sujets', cta: 'Mes sujets' },
    { title: simple ? 'Chercher les nouvelles' : 'Première actualisation', done: !!lastSync, action: onRefresh, cta: refreshing ? 'En cours…' : simple ? 'Chercher' : 'Actualiser' },
  ];
  const doneN = steps.filter(x => x.done).length;
  const close = () => { store.set(FIRST_STEPS, '0'); setHidden(true); };
  if (doneN === steps.length) { store.set(FIRST_STEPS, '0'); return null; }
  const next = steps.findIndex(x => !x.done);
  const btn = `shrink-0 rounded-xl bg-accent font-semibold text-bg active:scale-95 disabled:opacity-60 ${simple ? 'px-4 py-2.5 text-[16px]' : 'px-3 py-1.5 text-[13px]'}`;

  return (
    <section className={`mb-4 rounded-3xl bg-surface ring-1 ring-accent/30 animate-rise ${simple ? 'p-5' : 'p-4'}`} aria-label="Premiers pas">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className={`font-semibold text-ink ${simple ? 'text-[19px]' : 'text-[15px]'}`}>
          Premiers pas <span className={`font-normal text-muted ${simple ? 'text-[16px]' : 'text-[13px]'}`}>· {doneN}/{steps.length}</span>
        </p>
        <button onClick={close} className={`text-muted active:text-ink ${simple ? 'text-[15px]' : 'text-xs'}`}>Masquer</button>
      </div>
      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(doneN / steps.length) * 100}%` }} />
      </div>
      <ol className="space-y-2">
        {steps.map((st, n) => {
          const current = n === next;
          return (
            <li key={st.title} className={`flex items-center gap-3 ${!st.done && !current ? 'opacity-55' : ''}`}>
              <span className={`grid shrink-0 place-items-center rounded-full font-bold ${simple ? 'h-8 w-8 text-[16px]' : 'h-6 w-6 text-[12px]'} ${
                st.done ? 'bg-emerald-500/20 text-emerald-300' : current ? 'bg-accent text-bg' : 'bg-surface-2 text-muted ring-1 ring-line'}`}>
                {st.done ? '✓' : n + 1}
              </span>
              <span className={`min-w-0 flex-1 ${simple ? 'text-[17px]' : 'text-[14px]'} ${st.done ? 'text-muted line-through decoration-faint' : 'text-ink'}`}>{st.title}</span>
              {current && (st.href
                ? <a href={st.href} className={btn}>{st.cta}</a>
                : <button onClick={st.action} disabled={refreshing || !aiConfigured} className={btn}>{st.cta}</button>)}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
