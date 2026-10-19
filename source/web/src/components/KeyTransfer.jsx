// Installer Radar chez un proche : les clés passent d'un téléphone à l'autre (code QR, message ou copier-coller).
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { device } from '../native.js';

function QrCode({ text }) {
  const m = device.qr(text);
  if (!m?.rows) return null;
  const d = m.rows.flatMap((row, y) => [...row].map((c, x) => (c === '1' ? `M${x} ${y}h1v1h-1z` : ''))).join('');
  return (
    <svg viewBox={`0 0 ${m.size} ${m.size}`} className="mx-auto block aspect-square w-full max-w-[300px] rounded-2xl bg-white" shapeRendering="crispEdges"
      role="img" aria-label="Code QR Radar">
      <path d={d} fill="#000" />
    </svg>
  );
}

// ---------- Côté téléphone déjà configuré ----------
// Un seul code QR fait tout : scanné avec l'appareil photo, il ouvre Chrome et télécharge Radar ;
// scanné ensuite depuis Radar (« Scanner le code d'un proche »), il configure les clés.
// Les clés sont après le « # » du lien : cette partie n'est jamais envoyée à GitHub ni à aucun site.
export const APP_URL = 'https://github.com/Leico118/Finder-all-Infos/releases/latest/download/Radar.apk';

export function ShareApp({ canShare = false }) {
  const [open, setOpen] = useState(false);
  const [withKeys, setWithKeys] = useState(canShare);
  const [code, setCode] = useState(null);
  const [msg, setMsg] = useState('');
  useEffect(() => { setWithKeys(canShare); }, [canShare]);
  useEffect(() => {
    if (!open || !withKeys || code) return;
    api.shareCode().then(c => { setCode(c); setMsg(''); }).catch(e => { setMsg(e.message); setWithKeys(false); });
  }, [open, withKeys]);
  const keys = withKeys && code;
  const qrText = keys ? `${APP_URL}#${code.code}` : APP_URL;
  const message = keys
    ? `Pour installer Radar, ouvre ce lien sur ton téléphone Android :\n${APP_URL}\n\nUne fois Radar installé, copie ce message en entier puis ouvre Radar : il se configurera tout seul.\n${code.code}`
    : `Pour installer Radar, ouvre ce lien sur ton téléphone Android :\n${APP_URL}`;

  return (
    <section className="rounded-3xl bg-surface p-5 ring-1 ring-line animate-rise">
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-accent/90">Installer Radar chez un proche</h2>
      {!open ? (
        <>
          <p className="text-xs leading-relaxed text-muted">
            Votre proche scanne un code avec l'appareil photo de son téléphone : Chrome s'ouvre et télécharge Radar.{canShare ? ' Le même code configure ensuite ses clés.' : ''}
          </p>
          <button onClick={() => setOpen(true)} className="mt-3 w-full rounded-2xl bg-ink px-4 py-2.5 text-sm font-medium text-bg active:scale-[0.98]">Afficher le code QR</button>
        </>
      ) : (
        <div className="space-y-3 animate-rise">
          {withKeys && !code ? <div className="mx-auto aspect-square w-full max-w-[260px] animate-pulse rounded-2xl bg-surface-2" /> : <QrCode text={qrText} />}
          <ol className="space-y-2 text-sm leading-snug text-ink/90">
            <li className="flex gap-2.5"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent text-[11px] font-bold text-bg">1</span>
              <span>Votre proche ouvre l'<b>appareil photo</b> et vise le code, puis touche le lien qui apparaît : Radar se télécharge dans Chrome.</span></li>
            <li className="flex gap-2.5"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent text-[11px] font-bold text-bg">2</span>
              <span>Il touche <b>« Ouvrir »</b> à la fin du téléchargement, puis <b>« Installer »</b>. Si Android le demande, il autorise Chrome à installer des applications.</span></li>
            {keys && <li className="flex gap-2.5"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent text-[11px] font-bold text-bg">3</span>
              <span>Dans Radar, il touche <b>« Scanner le code d'un proche »</b> et scanne ce même code : c'est configuré.</span></li>}
          </ol>
          {canShare && (
            <label className="flex items-center justify-between gap-3 rounded-2xl bg-surface-2 px-4 py-3 ring-1 ring-line">
              <span className="min-w-0">
                <span className="block text-sm text-ink">Inclure mes clés</span>
                <span className="block text-[11px] leading-snug text-muted">{withKeys ? 'Votre proche n\'aura rien à configurer.' : 'Votre proche créera ses propres clés.'}</span>
              </span>
              <input type="checkbox" checked={withKeys} onChange={e => setWithKeys(e.target.checked)} className="h-5 w-5 shrink-0 accent-[var(--color-accent)]" />
            </label>
          )}
          <div className="flex gap-2">
            <button onClick={() => device.shareText(message)} disabled={withKeys && !code} className="flex-1 rounded-2xl bg-ink px-4 py-2.5 text-sm font-medium text-bg disabled:opacity-50">Envoyer par message</button>
            <button onClick={() => setOpen(false)} className="rounded-2xl bg-surface-2 px-4 py-2.5 text-sm text-ink ring-1 ring-line">Masquer</button>
          </div>
          {keys && (
            <p className="text-[11px] leading-relaxed text-faint">
              Ce code contient vos clés ({['Gemini', code.search && 'Tavily', code.backup && 'Groq'].filter(Boolean).join(', ')}) : votre proche utilisera vos quotas gratuits, partagés entre vos deux téléphones, et ne pourra pas les transmettre à son tour depuis Radar.
              Ne le montrez qu'à des personnes de confiance.
            </p>
          )}
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
