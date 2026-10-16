// Installer Radar chez un proche : les clés passent d'un téléphone à l'autre (code QR, message ou copier-coller).
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { device } from '../native.js';

function QrCode({ text }) {
  const m = device.qr(text);
  if (!m?.rows) return null;
  const d = m.rows.flatMap((row, y) => [...row].map((c, x) => (c === '1' ? `M${x} ${y}h1v1h-1z` : ''))).join('');
  return (
    <svg viewBox={`0 0 ${m.size} ${m.size}`} className="mx-auto block aspect-square w-full max-w-[260px] rounded-2xl bg-white" shapeRendering="crispEdges"
      role="img" aria-label="Code QR Radar">
      <path d={d} fill="#000" />
    </svg>
  );
}

// ---------- Côté téléphone déjà configuré ----------
export function ShareKeys() {
  const [code, setCode] = useState(null);
  const [msg, setMsg] = useState('');
  const show = async () => {
    try { setCode(await api.shareCode()); setMsg(''); } catch (e) { setMsg(e.message); }
  };
  const message = c => `Code pour configurer Radar :\n${c}\n\nCopie ce message en entier, puis ouvre Radar : il le trouvera tout seul.`;
  return (
    <section className="rounded-3xl bg-surface p-5 ring-1 ring-line animate-rise">
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-accent/90">Installer Radar chez un proche</h2>
      {!code ? (
        <>
          <p className="text-xs leading-relaxed text-muted">
            Évite à un proche de créer ses propres clés : son Radar se configure en scannant un code affiché ici, ou à partir d'un message.
          </p>
          <button onClick={show} className="mt-3 w-full rounded-2xl bg-ink px-4 py-2.5 text-sm font-medium text-bg active:scale-[0.98]">Afficher mon code</button>
        </>
      ) : (
        <div className="space-y-3 animate-rise">
          <p className="text-sm text-ink">Sur le téléphone du proche, dans Radar : <b>« Scanner le code d'un proche »</b>.</p>
          <QrCode text={code.code} />
          <div className="flex gap-2">
            <button onClick={() => device.shareText(message(code.code))} className="flex-1 rounded-2xl bg-ink px-4 py-2.5 text-sm font-medium text-bg">Envoyer par message</button>
            <button onClick={() => setCode(null)} className="rounded-2xl bg-surface-2 px-4 py-2.5 text-sm text-ink ring-1 ring-line">Masquer</button>
          </div>
          <p className="text-[11px] leading-relaxed text-faint">
            Ce code contient vos clés ({['Gemini', code.search && 'Tavily', code.backup && 'Groq'].filter(Boolean).join(', ')}) : votre proche utilisera vos quotas gratuits, partagés entre vos deux téléphones.
            Ne le donnez qu'à des personnes de confiance.
          </p>
        </div>
      )}
      {msg && <p className="mt-2 text-xs text-red-300">{msg}</p>}
    </section>
  );
}

// ---------- Côté nouveau téléphone ----------
export function ReceiveKeys({ simple = false, onDone }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [inClipboard, setInClipboard] = useState(false);
  const [paste, setPaste] = useState(false);
  const [text, setText] = useState('');

  useEffect(() => { setInClipboard(/RADAR1:[A-Za-z0-9_-]{10,}/.test(device.clipboard())); }, []);

  async function use(code) {
    setBusy(true); setMsg('Vérification du code…');
    try {
      const r = await api.importCode(code);
      setMsg(r.search_ok ? '✔ Radar est prêt.' : '✔ Radar est prêt (recherche web non incluse).');
      onDone?.();
    } catch (e) { setMsg(`✖ ${e.message}`); }
    finally { setBusy(false); }
  }
  async function scan() {
    setMsg('');
    const r = await device.scanQr();
    if (r.text) use(r.text);
    else if (r.error) setMsg(`✖ ${r.error}`);
  }
  function fromClipboard() {
    const c = device.clipboard();
    if (/RADAR1:/.test(c)) use(c);
    else { setPaste(true); setMsg('Aucun code trouvé dans le presse-papiers : collez-le ci-dessous.'); }
  }

  const big = simple ? 'py-4 text-[18px]' : 'py-3 text-[15px]';
  return (
    <div className="space-y-3">
      <p className={`${simple ? 'text-[17px]' : 'text-sm'} leading-relaxed text-ink/90`}>
        Quelqu'un de votre entourage utilise déjà Radar ? Sur son téléphone : <b>Réglages → Installer Radar chez un proche</b>.
      </p>
      {inClipboard && (
        <button onClick={() => use(device.clipboard())} disabled={busy}
          className={`w-full rounded-2xl bg-accent px-4 font-semibold text-bg ${big}`}>Utiliser le code reçu par message</button>
      )}
      {device.canScan() && (
        <button onClick={scan} disabled={busy} className={`w-full rounded-2xl font-semibold ${inClipboard ? 'bg-surface-2 text-ink ring-1 ring-line' : 'bg-ink text-bg'} ${big}`}>
          📷 Scanner le code d'un proche
        </button>
      )}
      {!inClipboard && (
        <button onClick={fromClipboard} disabled={busy} className={`w-full rounded-2xl bg-surface-2 text-ink ring-1 ring-line ${big}`}>
          J'ai reçu le code par message
        </button>
      )}
      {paste && (
        <div className="space-y-2 animate-rise">
          <textarea rows={3} value={text} onChange={e => setText(e.target.value)} placeholder="Collez ici le message reçu"
            className="w-full rounded-2xl bg-surface-2 px-4 py-3 text-sm text-ink ring-1 ring-line outline-none focus:ring-accent/60" />
          <button onClick={() => use(text)} disabled={busy || text.length < 12} className={`w-full rounded-2xl bg-ink font-semibold text-bg disabled:opacity-50 ${big}`}>Valider</button>
        </div>
      )}
      {msg && <p className={`${simple ? 'text-[16px]' : 'text-xs'} text-muted`} role="status">{msg}</p>}
    </div>
  );
}
