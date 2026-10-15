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
const MODELS = ['gemini-flash-lite-latest', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-flash-latest', 'gemini-2.5-flash-lite'];

const NET_ERR = /UnknownHost|Unable to resolve|No address associated|ConnectException|SocketException|NoRouteToHost|SSLException|EOFException|Network is unreachable|connexion/i;

async function callGemini(env, system, user) {
  const models = env.GEMINI_MODEL ? [env.GEMINI_MODEL] : (preferred ? [preferred, ...MODELS.filter(m => m !== preferred)] : MODELS);
  const ms = env.aiTimeout || 60000;
  const errors = [], netErrors = [];
  for (const model of models) {
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
      if (!slow && ![404, 429, 500, 503].includes(e.code) && !(e instanceof SyntaxError) && !/JSON/.test(e.message)) throw e;
      errors.push(`${model} : ${slow ? 'trop lent' : e.code ? `erreur ${e.code}` : 'réponse illisible'}`);
    }
  }
  if (netErrors.length && !errors.length) throw new Error(netErrors[netErrors.length - 1]);
  throw new Error(`aucun modèle Gemini n'a répondu (${errors.join(' ; ')})`);
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

export function callAI(env, system, user) {
  return (env.AI_PROVIDER || 'gemini') === 'anthropic' ? callAnthropic(env, system, user) : callGemini(env, system, user);
}

// ---------- Consignes d'analyse adaptées au sujet ----------
export function specKeys(topic) {
  return (topic.config?.spec_groups || []).flatMap(g => g.items.map(([k]) => k));
}

export function analysisSystem(topic) {
  const c = topic.config || {};
  const product = topic.type === 'product';
  const owner = c.owner || 'l\'organisation concernée';
  const exclude = c.exclude?.length ? ` Ignore les articles qui portent sur ${c.exclude.join(', ')} ou tout autre sujet voisin, SAUF s'ils contiennent une information explicite sur ${topic.name} ; dans ce cas ne retiens que cette partie.` : '';
  const specDoc = product ? (c.spec_groups || []).map(g => `${g.label} : ${g.items.map(([k, l]) => `${k} (${l})`).join(', ')}`).join('\n') : '';
  const leakers = c.leakers?.length ? ` (par ex. ${c.leakers.join(', ')})` : '';
  const rules = [
    `N'invente jamais rien. N'utilise que ce qui figure dans les articles fournis. Aucune valeur, date ou nom absent des textes ne doit apparaître. N'utilise pas tes connaissances préalables pour compléter. Si un extrait est trop vague pour être exploité, ignore l'article.`,
    `Périmètre : uniquement ${topic.name}${c.description ? ` (${c.description})` : ''}.${exclude} Ignore aussi les articles où le sujet n'est cité qu'en passant, les promotions et les contenus sans information nouvelle.`,
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
    `Contradictions : si une information contredit une carte existante${product ? ' ou la fiche technique' : ''}, explique-le dans "contradiction" (sinon chaîne vide).`,
    `Dans les textes, distingue explicitement les faits (« selon … », « ${owner} a confirmé »), les hypothèses et les spéculations. Cite l'origine de l'information.`,
    product
      ? `Fiche technique : propose des spec_updates uniquement pour des valeurs explicitement indiquées dans les articles, avec les clés autorisées ci-dessous. Valeur concise.`
      : `Pas de fiche technique pour ce sujet : spec_updates est toujours une liste vide et spec_keys une liste vide.`,
    `importance : 3 = annonce officielle ou information majeure ; 2 = information notable ; 1 = détail mineur.`,
  ];
  return `Tu es l'analyste éditorial d'une application de veille consacrée à : ${topic.name}.
Tu reçois des articles bruts (titre, extrait, parfois début d'article ; toutes langues) et l'état actuel de la base.
Tu réponds UNIQUEMENT par un objet JSON valide conforme au schéma fourni. Tout texte rédigé est en français clair et soigné.

RÈGLES ABSOLUES
${rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}${product ? `\n\nCLÉS DE FICHE TECHNIQUE AUTORISÉES\n${specDoc}` : ''}`;
}

export function analysisUser(topic, { items, cards, specs }) {
  const product = topic.type === 'product';
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
${product ? `\nFICHE TECHNIQUE ACTUELLE\n${specsTxt}\n` : ''}
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
  "spec_updates": [${product ? ' { "key": "…", "value": "…", "reliability": "rumor", "ref": "new:1 | <id existant>", "note": "" } ' : ''}]
}
Chaque article doit figurer une fois dans "items". Les cartes "new:N" doivent toutes figurer dans "cards".`;
}
