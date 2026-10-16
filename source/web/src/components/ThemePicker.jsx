// Choix du thème et de la couleur (Réglages → Apparence). Le changement est immédiat.
import { useState } from 'react';
import { ACCENTS, THEMES, accentOf, loadTheme, saveTheme } from '../theme.js';

// Petit aperçu dessiné du thème (fond, carte, couleur).
function Preview({ theme, accent }) {
  const [bg, card] = theme.preview;
  const a = theme.accents ? (theme.light ? accent.light : accent.dark) : '#ffd60a';
  const glass = theme.id === 'verre';
  return (
    <div className="relative h-20 overflow-hidden rounded-2xl" aria-hidden
      style={{ background: glass ? `linear-gradient(160deg, ${accent.dark}aa, #1a140d 75%)` : bg }}>
      <div className="absolute left-2.5 right-2.5 top-2.5 h-7 rounded-xl"
        style={{ background: glass ? 'rgba(255,255,255,.13)' : card, border: `1px solid ${theme.light ? 'rgba(0,0,0,.08)' : 'rgba(255,255,255,.12)'}` }}>
        <span className="absolute left-2 top-2 h-1.5 w-10 rounded-full" style={{ background: theme.light ? '#1f1c17' : '#f2efe9', opacity: 0.8 }} />
        <span className="absolute left-2 top-4 h-1 w-14 rounded-full" style={{ background: theme.light ? '#1f1c17' : '#f2efe9', opacity: 0.35 }} />
      </div>
      <span className="absolute bottom-2.5 left-2.5 h-4 w-12 rounded-full" style={{ background: a }} />
      <span className="absolute bottom-2.5 right-2.5 h-4 w-4 rounded-full" style={{ background: glass ? 'rgba(255,255,255,.18)' : card }} />
    </div>
  );
}

export default function ThemePicker({ simple = false }) {
  const [t, setT] = useState(loadTheme);
  const theme = THEMES.find(x => x.id === t.theme) || THEMES[0];
  const accent = accentOf(t) || ACCENTS[0];
  const choose = next => { setT(next); saveTheme(next); };

  return (
    <section className={`rounded-3xl bg-surface ring-1 ring-line animate-rise ${simple ? 'p-6' : 'p-5'}`}>
      <h2 className={`mb-3 font-semibold uppercase tracking-[0.2em] text-accent/90 ${simple ? 'text-[14px]' : 'text-[11px]'}`}>Apparence</h2>
      <div className="grid grid-cols-2 gap-3">
        {THEMES.map(th => {
          const active = th.id === theme.id;
          const acc = th.accents ? (ACCENTS.find(a => a.id === (active ? t.accent : th.defaultAccent)) || ACCENTS.find(a => a.id === th.defaultAccent)) : ACCENTS[0];
          return (
            <button key={th.id} onClick={() => choose({ theme: th.id, accent: th.accents ? (active ? t.accent : th.defaultAccent) : t.accent })}
              aria-pressed={active}
              className={`rounded-3xl p-2 text-left transition active:scale-[0.98] ${active ? 'bg-surface-2 ring-2 ring-accent' : 'ring-1 ring-line'}`}>
              <Preview theme={th} accent={acc} />
              <span className={`mt-2 flex items-center justify-between px-1 font-semibold text-ink ${simple ? 'text-[18px]' : 'text-sm'}`}>
                {th.name}{active && <span className="text-accent" aria-hidden>✓</span>}
              </span>
              <span className={`block px-1 pb-1 leading-snug text-muted ${simple ? 'text-[15px]' : 'text-[11px]'}`}>{th.desc}</span>
            </button>
          );
        })}
      </div>

      {theme.accents && (
        <div className="mt-5">
          <p className={`mb-3 text-ink ${simple ? 'text-[17px]' : 'text-sm'}`}>Couleur <span className="text-muted">· {accent.name}</span></p>
          <div className="grid grid-cols-5 justify-items-center gap-y-3">
            {ACCENTS.map(a => {
              const active = a.id === accent.id;
              const c = theme.light ? a.light : a.dark;
              return (
                <button key={a.id} onClick={() => choose({ ...t, accent: a.id })} aria-label={a.name} aria-pressed={active}
                  className={`grid place-items-center rounded-full transition active:scale-90 ${simple ? 'h-14 w-14' : 'h-11 w-11'} ${active ? 'ring-2 ring-offset-2 ring-offset-transparent' : ''}`}
                  style={{ background: c, ...(active ? { boxShadow: `0 0 0 3px var(--color-surface), 0 0 0 5px ${c}` } : {}) }}>
                  {active && <span className={`font-bold ${theme.light ? 'text-white' : 'text-black/70'}`}>✓</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {!theme.accents && (
        <p className={`mt-4 text-muted ${simple ? 'text-[16px]' : 'text-xs'}`}>Ce thème garde ses couleurs fixes pour rester le plus lisible possible.</p>
      )}
    </section>
  );
}
