// Niveaux de fiabilité. Le libellé « fiable » s'adapte au type de sujet (produit : fuite ; général : source).
export const RELIABILITY = {
  official: { label: 'Officiel', dot: '🟢', cls: 'bg-emerald-500/12 text-emerald-300 ring-emerald-400/25',
    desc: 'Confirmé par le fabricant ou l\'organisation concernée, ou par un document officiel (certification, régulateur).' },
  reliable: { label: 'Leak fiable', labelGeneral: 'Source fiable', dot: '🔵', cls: 'bg-sky-500/12 text-sky-300 ring-sky-400/25',
    desc: 'Informateur reconnu, média sérieux ou preuves crédibles (photos, documents, chiffres).' },
  rumor: { label: 'Rumeur', dot: '🟠', cls: 'bg-orange-500/12 text-orange-300 ring-orange-400/25',
    desc: 'Information plausible mais non confirmée.' },
  unverified: { label: 'Non vérifié', dot: '⚪', cls: 'bg-zinc-500/15 text-zinc-300 ring-zinc-400/20',
    desc: 'Source inconnue ou spéculation.' },
};

export const relLabel = (value, type) => {
  const r = RELIABILITY[value] || RELIABILITY.unverified;
  return type === 'general' && r.labelGeneral ? r.labelGeneral : r.label;
};

export function ReliabilityBadge({ value, small = false, type = 'product' }) {
  const r = RELIABILITY[value] || RELIABILITY.unverified;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full ring-1 ${r.cls} ${small ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'} font-medium whitespace-nowrap`}>
      <span aria-hidden className="text-[9px] leading-none">{r.dot}</span>{relLabel(value, type)}
    </span>
  );
}

export function CompetitorBadge({ small = false }) {
  return (
    <span className={`inline-flex items-center rounded-full bg-red-500/15 text-red-300 ring-1 ring-red-400/30 ${small ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]'} font-bold tracking-[0.12em]`}>
      CONCURRENT
    </span>
  );
}

export function Chip({ children, className = '' }) {
  return <span className={`inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-muted ${className}`}>{children}</span>;
}
