import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const ITEM = 44;                     // hauteur d'une ligne de la roue (px)
const HOURS = Array.from({ length: 24 }, (_, h) => h);
export const hourLabel = h => `${h} h`;

// Roue de sélection d'heure (feuille qui monte du bas de l'écran).
export default function HourPicker({ value, onClose, onPick }) {
  const wheel = useRef(null);
  const [sel, setSel] = useState(value);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (wheel.current) wheel.current.scrollTop = value * ITEM;
    const onKey = e => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onScroll = () => {
    const h = Math.round(wheel.current.scrollTop / ITEM);
    setSel(Math.max(0, Math.min(23, h)));
  };
  const goTo = h => wheel.current?.scrollTo({ top: h * ITEM, behavior: 'smooth' });

  // Affichée au niveau de la page entière (et non dans le bloc Réglages, dont l'animation piégerait la position).
  return createPortal(
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 animate-fade" onClick={onClose}>
      <div className="nav-safe w-full max-w-xl rounded-t-3xl bg-surface px-5 pt-5 ring-1 ring-line animate-rise" onClick={e => e.stopPropagation()}
        role="dialog" aria-label="Heure de la collecte automatique">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line" />
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent/90">Collecte automatique</p>
        <p className="mt-1 text-sm text-muted">Chaque jour à <span className="font-semibold text-ink">{hourLabel(sel)}</span></p>

        <div className="relative my-4 h-[220px] overflow-hidden">
          {/* bande de sélection */}
          <div className="pointer-events-none absolute inset-x-0 top-1/2 h-11 -translate-y-1/2 rounded-2xl bg-surface-2 ring-1 ring-accent/30" />
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-16 bg-gradient-to-b from-surface to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-16 bg-gradient-to-t from-surface to-transparent" />
          <div ref={wheel} onScroll={onScroll} className="no-scrollbar relative h-full snap-y snap-mandatory overflow-y-auto overscroll-contain"
            style={{ paddingTop: 110 - ITEM / 2, paddingBottom: 110 - ITEM / 2 }}>
            {HOURS.map(h => (
              <button key={h} onClick={() => goTo(h)} style={{ height: ITEM }}
                className={`block w-full snap-center text-center text-[22px] tabular-nums transition ${h === sel ? 'font-semibold text-ink' : 'text-faint'}`}>
                {hourLabel(h)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2 pb-4">
          <button onClick={onClose} className="flex-1 rounded-2xl bg-surface-2 py-3 text-sm font-medium text-ink ring-1 ring-line">Annuler</button>
          <button disabled={saving} onClick={async () => { setSaving(true); try { await onPick(sel); } finally { setSaving(false); } }}
            className="flex-1 rounded-2xl bg-ink py-3 text-sm font-semibold text-bg disabled:opacity-60">{saving ? '…' : 'Valider'}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
