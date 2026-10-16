// Analyse, traduction, classification et déduplication par IA (Gemini gratuit ou Claude).
import { http } from './net.js';

export function aiConfigured(env) {
  return (env.AI_PROVIDER || 'gemini') === 'anthropic' ? !!env.ANTHROPIC_API_KEY : !!env.GEMINI_API_KEY;
}

function extractJson(text) {
  if (!text) throw new Error('Réponse IA vide');
  const t = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('Réponse IA sans JSON');
  return JSON.parse(t.slice(a, b + 1));
}

// Modèles rapides d'abord (Flash-Lite répond en quelques secondes), puis repli.
let preferred = null;
const retired = new Set();                     // modèles qui répondent 404 (retirés par Google)
export const BUSY_MSG = 'les serveurs de Google sont momentanément surchargés. Rien n\'est perdu : les articles restent en attente et seront analysés à la prochaine actualisation.';
const MODELS = ['gemini-flash-lite-latest', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-flash-latest', 'gemini-2.5-flash-lite'];

const NET_ERR = /UnknownHost|Unable to resolve|No address associated|ConnectException|SocketException|NoRouteToHost|SSLException|EOFException|Network is unreachable|connexion/i;

async function callGemini(env, system, user) {
  const all = env.GEMINI_MODEL ? [env.GEMINI_MODEL] : (preferred ? [preferred, ...MODELS.filter(m => m !== preferred)] : MODELS);
  const models = all.filter(m => !retired.has(m));
  const ms = env.aiTimeout || 60000;
  const errors = [], netErrors = [];
  // Deux tours : si Google est surchargé (503/429/500), on attend un peu et on réessaie avant d'abandonner.
  for (let round = 0; round < 2; round++) {
    let busy = 0;
    errors.length = 0;
    for (const model of models) {
      if (retired.has(model)) continue;
      try {
        const res = await http(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: 'user', parts: [{ text: user }] }],
            generationConfig: { responseMimeType: 'application/json', temperature: 0.2, maxOutputTokens: 16000 },
          }),
          timeout: ms,
        });
        const body = await res.text();
        if (!res.ok) {
          const err = new Error(`Gemini ${res.status} : ${body.slice(0, 200)}`);
          err.code = res.status;
          throw err;
        }
        const data = JSON.parse(body);
        const out = extractJson((data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join(''));
        preferred = model;
        return out;
      } catch (e) {
        const slow = e.name === 'AbortError' || e.name === 'TimeoutError' || /délai|timeout/i.test(e.message);
        if (e.code === 400 || e.code === 401 || e.code === 403) throw new Error(`Clé Gemini refusée (${e.code}) : vérifiez-la dans Réglages.`);
        if (!e.code && NET_ERR.test(e.message)) {                       // coupure passagère : modèle suivant après une pause
          netErrors.push(e.message);
          if (netErrors.length >= 3) throw new Error(netErrors[netErrors.length - 1]);
          await new Promise(r => setTimeout(r, 3000));
          continue;
        }
        if (e.code === 404) { retired.add(model); continue; }           // modèle retiré par Google : on n'insiste plus
        if (!slow && ![429, 500, 503].includes(e.code) && !(e instanceof SyntaxError) && !/JSON/.test(e.message)) throw e;
        if (slow || [429, 500, 503].includes(e.code)) busy++;
        errors.push(`${model} : ${slow ? 'trop lent' : e.code ? `erreur ${e.code}` : 'réponse illisible'}`);
      }
    }
    if (!busy || round === 1 || backupConfigured(env)) break;      // IA de secours disponible : inutile d'attendre
    await new Promise(r => setTimeout(r, env.aiRetryDelay ?? 8000));
  }
  if (netErrors.length && !errors.length) throw new Error(netErrors[netErrors.length - 1]);
  if (errors.length && errors.every(x => /erreur (429|500|503)|trop lent/.test(x))) {
    // Surcharge passagère chez Google : rien n'est perdu, les articles restent en attente.
    throw Object.assign(new Error(BUSY_MSG), { busy: true });
  }
  throw new Error(`aucun modèle Gemini n'a répondu (${errors.join(' ; ') || 'aucun modèle disponible'})`);
}

async function callAnthropic(env, system, user) {
  const res = await http('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: env.ANTHROPIC_MODEL || 'claude-haiku-5-5', max_tokens: 16000, system, messages: [{ role: 'user', content: user }] }),
    timeout: env.aiTimeout || 90000,
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Anthropic ${res.status} : ${body.slice(0, 200)}`);
  return extractJson((JSON.parse(body).content || []).map(c => c.text || '').join(''));
}

// ---------- IA de secours : Groq (gratuit), utilisée quand Gemini est surchargé ----------
let geminiBusyUntil = 0;
let groqModel = null;
let lastProvider = 'gemini';
const GROQ = 'https://api.groq.com/openai/v1';
const GROQ_PREF = [/gpt-oss-120b/, /llama-3\.3-70b/, /llama-4-maverick/, /qwen3-32b/, /gpt-oss-20b/, /kimi-k2/, /llama-4-scout/, /llama/];

export const backupConfigured = env => !!env.GROQ_API_KEY;
export const backupActive = env => backupConfigured(env) && Date.now() < geminiBusyUntil;
export const lastAIProvider = () => lastProvider;

async function pickGroqModel(env, exclude = []) {
  if (groqModel && !exclude.includes(groqModel)) return groqModel;
  const res = await http(`${GROQ}/models`, { headers: { authorization: `Bearer ${env.GROQ_API_KEY}` }, timeout: 20000 });
  if (res.status === 401 || res.status === 403) throw new Error(`Clé Groq refusée (${res.status}) : vérifiez-la dans Réglages.`);
  if (!res.ok) throw Object.assign(new Error(`Groq indisponible (${res.status})`), { busy: true, fromBackup: true });
  const ids = (JSON.parse(await res.text()).data || []).filter(m => m.active !== false).map(m => m.id)
    .filter(id => !/whisper|guard|tts|embed|vision|compound/i.test(id) && !exclude.includes(id));
  for (const re of GROQ_PREF) { const id = ids.find(x => re.test(x)); if (id) return (groqModel = id); }
  if (ids[0]) return (groqModel = ids[0]);
  throw new Error('Groq ne propose aucun modèle utilisable');
}

export async function callGroq(env, system, user, { json = true } = {}) {
  const tried = [];
  for (let i = 0; i < 3; i++) {
    const model = await pickGroqModel(env, tried);
    const res = await http(`${GROQ}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model, temperature: 0.2, max_tokens: 6000,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        ...(json ? { response_format: { type: 'json_object' } } : {}),
      }),
      timeout: env.aiTimeout || 60000,
    });
    const body = await res.text();
    if (res.ok) {
      const text = JSON.parse(body).choices?.[0]?.message?.content || '';
      lastProvider = 'groq';
      return extractJson(text);
    }
    if (res.status === 401 || res.status === 403) throw new Error(`Clé Groq refusée (${res.status}) : vérifiez-la dans Réglages.`);
    if (res.status === 404 || /decommission|not.found|does not exist/i.test(body)) { tried.push(model); groqModel = null; continue; }
    if (res.status === 400 && json && /response_format|json/i.test(body)) return callGroq(env, system, user, { json: false });
    if ([413, 429, 500, 502, 503].includes(res.status)) {
      throw Object.assign(new Error(res.status === 413 ? 'demande trop longue pour l\'IA de secours' : BUSY_MSG), { busy: true, fromBackup: true });
    }
    throw new Error(`Groq ${res.status} : ${body.slice(0, 160)}`);
  }
  throw new Error('aucun modèle Groq n\'a répondu');
}

// opts.fallback : passer à Groq tout de suite si Gemini est surchargé (sinon l'appelant décide, cf. analyse).
// opts.primaryOnly : vérification d'une clé Gemini (jamais de relais).
export async function callAI(env, system, user, { fallback = true, primaryOnly = false } = {}) {
  if ((env.AI_PROVIDER || 'gemini') === 'anthropic') { lastProvider = 'anthropic'; return callAnthropic(env, system, user); }
  if (primaryOnly) return callGemini(env, system, user);
  if (backupActive(env)) return callGroq(env, system, user);
  try {
    const out = await callGemini(env, system, user);
    lastProvider = 'gemini';
    return out;
  } catch (e) {
    if (!e.busy || !backupConfigured(env)) throw e;
    geminiBusyUntil = Date.now() + 10 * 60000;                       // Gemini laissé au repos 10 minutes
    if (!fallback) throw e;
    return callGroq(env, system, user);
  }
}

// ---------- Consignes d'analyse adaptées au sujet ----------
export function specKeys(topic) {
  return (topic.config?.spec_groups || []).flatMap(g => g.items.map(([k]) => k));
}

export const sheetName = topic => (topic.type === 'product' ? 'fiche technique' : 'fiche repères');

export function analysisSystem(topic) {
  const c = topic.config || {};
  const product = topic.type === 'product';
  const sheet = specKeys(topic).length > 0;
  const owner = c.owner || 'l\'organisation concernée';
  const exclude = c.exclude?.length ? ` Ignore les articles qui portent sur ${c.exclude.join(', ')} ou tout autre sujet voisin, SAUF s'ils contiennent une information explicite sur ${topic.name} ; dans ce cas ne retiens que cette partie.` : '';
  const specDoc = sheet ? (c.spec_groups || []).map(g => `${g.label} : ${g.items.map(([k, l]) => `${k} (${l})`).join(', ')}`).join('\n') : '';
  const leakers = c.leakers?.length ? ` (par ex. ${c.leakers.join(', ')})` : '';
  const rules = [
    `N'invente jamais rien. N'utilise que ce qui figure dans les articles fournis. Aucune valeur, date ou nom absent des textes ne doit apparaître. N'utilise pas tes connaissances préalables pour compléter. Si un extrait est trop vague pour être exploité, ignore l'article.`,
    `Périmètre : uniquement ${topic.name}${c.description ? ` (${c.description})` : ''}.${exclude} Ignore aussi les articles où le sujet n'est cité qu'en passant, les promotions et les contenus sans information nouvelle.${c.focus ? ` IMPORTANT : l'utilisateur ne s'intéresse qu'à ceci : « ${c.focus} ». Tout article qui n'entre pas dans ce cadre est ignoré (ref null), même s'il concerne ${topic.name}.` : ''}`,
    product && c.rivals?.length
      ? `Concurrents (articles kind=competitor) : ne garde que les nouveautés majeures de produits concurrents à venir (${c.rivals.join(', ')} ou équivalents) susceptibles de rivaliser avec ${topic.name}. Ignore : tests de produits déjà commercialisés, promotions, accessoires, détails mineurs.`
      : `Il n'y a pas de catégorie concurrent pour ce sujet : category vaut toujours "target".`,
    `Fiabilité (champ reliability), jugée sur la SOURCE D'ORIGINE :
   - "official" : confirmé par ${owner} (communiqué, compte officiel, dirigeant s'exprimant publiquement) ou par un document officiel (certification, régulateur, décision publiée).
   - "reliable" : ${product ? `informateur reconnu ayant un bon historique${leakers} ou preuves crédibles (photos, documents, benchmark identifié)` : 'média sérieux qui rapporte des faits vérifiables, preuves crédibles (documents, chiffres, déclarations identifiées)'}.
   - "rumor" : plausible mais non confirmé ; source secondaire sans preuve.
   - "unverified" : source inconnue, spéculation, simple extrapolation.
   Plusieurs médias qui reprennent la même information ne sont PAS des confirmations indépendantes : le niveau dépend de la source d'origine.`,
    `Déduplication sémantique : avant de créer une carte, compare le SENS de l'article aux cartes existantes (même information formulée autrement ou dans une autre langue = doublon). Si c'est la même information, rattache l'article à la carte existante (ref = son id). Si plusieurs articles du lot rapportent une même information nouvelle, donne-leur la même ref "new:1", "new:2"… Crée une nouvelle carte uniquement pour une information réellement distincte.`,
    `Mise à jour : pour une carte existante, ajoute-la dans "cards" avec updated=true SEULEMENT si les nouveaux articles apportent une précision, une confirmation officielle, une contradiction ou justifient un changement de fiabilité ; réécris alors title/summary/detail/technical complets et décris le changement dans change_note. Sinon, rattache simplement l'article sans l'ajouter dans "cards".`,
    `Contradictions : si une information contredit une carte existante${sheet ? ` ou la ${sheetName(topic)}` : ''}, explique-le dans "contradiction" (sinon chaîne vide).`,
    `Dans les textes, distingue explicitement les faits (« selon … », « ${owner} a confirmé »), les hypothèses et les spéculations. Cite l'origine de l'information.`,
    sheet
      ? `${sheetName(topic)[0].toUpperCase()}${sheetName(topic).slice(1)} : propose des spec_updates uniquement pour des valeurs explicitement indiquées dans les articles, avec les clés autorisées ci-dessous. Valeur concise (quelques mots, avec la date si utile).`
      : `Pas de fiche pour ce sujet : spec_updates est toujours une liste vide et spec_keys une liste vide.`,
    `importance : 3 = annonce officielle ou information majeure ; 2 = information notable ; 1 = détail mineur.`,
  ];
  return `Tu es l'analyste éditorial d'une application de veille consacrée à : ${topic.name}.
Tu reçois des articles bruts (titre, extrait, parfois début d'article ; toutes langues) et l'état actuel de la base.
Tu réponds UNIQUEMENT par un objet JSON valide conforme au schéma fourni. Tout texte rédigé est en français clair et soigné.

RÈGLES ABSOLUES
${rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}${sheet ? `\n\nCLÉS DE ${sheetName(topic).toUpperCase()} AUTORISÉES\n${specDoc}` : ''}`;
}

export function analysisUser(topic, { items, cards, specs }) {
  const product = topic.type === 'product';
  const sheet = specKeys(topic).length > 0;
  const itemsTxt = items.map((it, i) => JSON.stringify({
    i, kind: it.kind, source: it.source_name, lang: it.lang,
    date: it.published_at ? new Date(it.published_at).toISOString().slice(0, 10) : null,
    url: it.url, title: it.title, snippet: it.snippet, article: it.content || undefined,
  })).join('\n');
  const cardsTxt = cards.length
    ? cards.map(c => JSON.stringify({ id: c.id, category: c.category, reliability: c.reliability,
        title: c.title, summary: (c.summary || '').slice(0, 240), model: c.competitor_model || undefined })).join('\n')
    : '(aucune carte pour l\'instant)';
  const specsTxt = specs.length ? specs.map(s => `${s.key} = ${s.value} [${s.reliability}]`).join('\n') : '(fiche vide)';
  return `ARTICLES À ANALYSER (un JSON par ligne)
${itemsTxt}

CARTES EXISTANTES (les plus récentes)
${cardsTxt}
${sheet ? `\n${sheetName(topic).toUpperCase()} ACTUELLE\n${specsTxt}\n` : ''}
Réponds avec ce JSON exact :
{
  "items": [ { "i": 0, "ref": "new:1 | <id d'une carte existante> | null", "ignore_reason": "raison courte si ref est null", "date": "AAAA-MM-JJ si l'article a date null et que sa date figure dans le texte, sinon null" } ],
  "cards": [ {
    "ref": "new:1 | <id existant>",
    "updated": true,
    "category": "${product ? 'target | competitor' : 'target'}",
    "reliability": "official | reliable | rumor | unverified",
    "reliability_reason": "justification courte du niveau",
    "origin": "source d'origine de l'information",
    "title": "titre factuel, 90 caractères max",
    "summary": "1 à 2 phrases, 220 caractères max",
    "detail": "résumé approfondi en 2 à 5 paragraphes séparés par \\n\\n, distinguant faits, hypothèses et spéculations",
    "technical": "${product ? 'explication technique vulgarisée des caractéristiques évoquées' : 'contexte utile pour comprendre l\'information'} (chaîne vide si sans objet)",
    "spec_keys": [],
    "official_confirmation": false,
    "contradiction": "",
    "change_note": "pour une mise à jour : ce qui a changé",
    "importance": 1${product ? `,
    "competitor": { "brand": "", "model": "", "why": "pourquoi cette nouveauté peut rivaliser avec ${topic.name}", "comparison": "comparaison factuelle avec la fiche ci-dessus ; si les données manquent, le dire" }` : ''}
  } ],
  "spec_updates": [${sheet ? ' { "key": "…", "value": "…", "reliability": "rumor", "ref": "new:1 | <id existant>", "note": "" } ' : ''}]
}
Chaque article doit figurer une fois dans "items". Les cartes "new:N" doivent toutes figurer dans "cards".`;
}

// ---------- Remplir une fiche à partir des actualités déjà trouvées ----------
// discover : pour un sujet général (une marque…), repérer aussi les modèles précis cités dans les actualités.
export function sheetFillSystem(topic, { discover = false, focus = '' } = {}) {
  const c = topic.config || {};
  const doc = (c.spec_groups || []).map(g => `${g.label} : ${g.items.map(([k, l]) => `${k} (${l})`).join(', ')}`).join('\n');
  return `Tu remplis la ${sheetName(topic)} de « ${topic.name} » à partir d'actualités déjà vérifiées et résumées.
Tu réponds UNIQUEMENT par un objet JSON valide. Valeurs en français, concises (quelques mots, avec la date si utile).
N'invente rien : une ligne ne reçoit une valeur que si une actualité fournie l'indique explicitement ; sinon ne la mentionne pas.
Si plusieurs actualités se contredisent, garde la plus fiable, puis la plus récente.
Fiabilité de chaque valeur = celle de l'actualité d'où elle vient (official, reliable, rumor, unverified).${focus ? `\nL'utilisateur ne s'intéresse qu'à : ${focus}. Ignore le reste.` : ''}${discover ? `
Liste aussi dans "models" les produits précis (modèles commerciaux, ex. « Fairphone 6 », « BYD Seal U ») de ce sujet qui sont explicitement cités dans les actualités${focus ? ', uniquement dans le cadre indiqué ci-dessus' : ''}, avec leur type en un mot (téléphone, voiture, écouteurs…). Pas d'accessoires ni de produits d'autres marques. Liste vide si aucun.` : ''}
${doc ? `\nLIGNES AUTORISÉES\n${doc}` : '\nPas de lignes à remplir : spec_updates est une liste vide.'}`;
}

export function sheetFillUser(cards, { discover = false } = {}) {
  return `ACTUALITÉS (une par ligne, des plus récentes aux plus anciennes)
${cards.map(c => JSON.stringify({ id: c.id, date: c.latest_at ? new Date(c.latest_at).toISOString().slice(0, 10) : null,
    reliability: c.reliability, title: c.title, summary: c.summary, detail: (c.detail || '').slice(0, 900) })).join('\n')}

Réponds avec ce JSON :
{ "spec_updates": [ { "key": "clé autorisée", "value": "…", "reliability": "official | reliable | rumor | unverified", "ref": "<id de l'actualité>", "note": "" } ]${discover ? `,
  "models": [ { "name": "nom exact du modèle", "kind": "type en un mot" } ]` : ''} }`;
}

// ---------- Tri des actualités déjà trouvées selon ce qui intéresse l'utilisateur ----------
export const CLEAN_SYSTEM = `Tu fais le tri dans les actualités d'une application de veille. Tu réponds UNIQUEMENT par un objet JSON valide.
Tu retires seulement les actualités qui sortent clairement du cadre indiqué par l'utilisateur ; en cas de doute, tu gardes.`;

export function cleanUser(topic, focus, cards) {
  return `Sujet : « ${topic.name} ». L'utilisateur ne s'intéresse qu'à : ${focus}

ACTUALITÉS
${cards.map(c => JSON.stringify({ id: c.id, title: c.title, summary: c.summary })).join('\n')}

Réponds avec ce JSON : { "remove": ["id des actualités hors cadre"] }`;
}
