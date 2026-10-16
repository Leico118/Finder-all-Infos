// Sujets suivis : configuration, reconnaissance dans les textes, création assistée par IA.

export const MAX_TOPICS = 10;

// Fiche technique par défaut d'un smartphone (reprise de l'application Find X10 Ultra).
export const PHONE_SPEC_GROUPS = [
  { label: 'Photographie', items: [
    ['camera_main', 'Capteur principal'], ['camera_ultrawide', 'Ultra grand-angle'],
    ['camera_tele1', 'Téléobjectif périscope principal'], ['camera_tele2', 'Second téléobjectif'],
    ['camera_front', 'Caméra frontale'], ['camera_extra', "Vidéo, traitement d'image, partenariat optique"]] },
  { label: 'Processeur', items: [['soc', 'Puce (SoC)']] },
  { label: 'RAM et stockage', items: [['ram', 'RAM'], ['storage', 'Stockage']] },
  { label: 'Batterie et recharge', items: [
    ['battery', 'Batterie (capacité, technologie)'], ['charging_wired', 'Recharge filaire'], ['charging_wireless', 'Recharge sans fil']] },
  { label: 'Écran', items: [
    ['display_size', 'Diagonale'], ['display_res', 'Définition'], ['display_tech', 'Technologie de dalle'],
    ['display_brightness', 'Luminosité'], ['display_refresh', 'Fréquence de rafraîchissement']] },
  { label: 'Design', items: [
    ['design_dimensions', 'Dimensions et poids'], ['design_materials', 'Matériaux'], ['design_ip', 'Étanchéité (IP)'], ['design_colors', 'Coloris']] },
  { label: 'Logiciel', items: [['os', 'Système et interface'], ['updates', 'Suivi des mises à jour']] },
  { label: 'Commercialisation', items: [
    ['announce_date', "Date d'annonce"], ['release_china', 'Sortie en Chine'],
    ['release_global', 'Sortie internationale / Europe'], ['price', 'Prix']] },
];

// Sujet de départ : la configuration mise au point pour l'OPPO Find X10 Ultra.
export const DEFAULT_TOPIC = {
  id: 'find-x10-ultra',
  name: 'OPPO Find X10 Ultra',
  type: 'product',
  config: {
    short: 'Find X10 Ultra',
    description: "Smartphone photo haut de gamme d'OPPO, successeur du Find X9 Ultra.",
    match: ['X10 Ultra'],
    exclude: ['Find X10', 'Find X10 Pro', 'Find X10 Pro Max', 'Find X10 Mini', 'Find X9 Ultra'],
    owner: 'OPPO',
    queries: {
      fr: ['"Find X10 Ultra"'],
      en: ['"Find X10 Ultra"', 'OPPO "X10 Ultra" leak'],
      zh: ['"Find X10 Ultra"', 'OPPO Find X10 Ultra 爆料'],
    },
    // anglais et chinois alternés : la première recherche couvre les deux langues
    web_queries: [
      '"OPPO Find X10 Ultra"', 'OPPO Find X10 Ultra 爆料', '"Find X10 Ultra" leak', 'OPPO Find X10 Ultra 传感器',
      '"Find X10 Ultra" camera', 'OPPO Find X10 Ultra 影像', '"Find X10 Ultra" prototype', 'OPPO Find X10 Ultra 潜望长焦',
      '"Find X10 Ultra" sensor testing', 'OPPO Find X10 Ultra 测试', '"Find X10 Ultra" 200MP', 'OPPO Find X10 Ultra 摄像头',
      '"Find X10 Ultra" telephoto periscope', 'OPPO Find X10 Ultra 电池', '"Find X10 Ultra" LOFIC', 'OPPO Find X10 Ultra 处理器',
      '"Find X10 Ultra" battery', 'OPPO 下一代 Ultra 影像旗舰', '"Find X10 Ultra" specifications', 'OPPO 双潜望长焦 测试',
      '"Find X10 Ultra" release date', 'OPPO 200MP 传感器 测试', '"Find X10 Ultra" TENAA OR 3C OR Geekbench OR certification',
      'OPPO 下一代旗舰 原型机',
    ],

    rivals: ['Xiaomi 18 Ultra', 'vivo X500 Ultra', 'Galaxy S27 Ultra', 'Honor Magic 9 Pro', 'Huawei Pura 100 Ultra', 'iPhone 18 Pro Max'],
    leakers: ['Digital Chat Station (数码闲聊站)', 'Smart Pikachu (智慧皮卡丘)', 'Ice Universe', 'Yogesh Brar', 'OnLeaks', 'Abhishek Yadav'],
    tech: true,
    spec_groups: PHONE_SPEC_GROUPS,
    backfill_from: '2026-01-01',
  },
};

// ---------- Reconnaissance du sujet dans un texte ----------
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isLatin = s => /^[\p{Script=Latin}\p{N}\s\-'’&+.]+$/u.test(s);

// « X10 Ultra » → /x\s*10\s*ultra/ : tolère les espaces absents ou multiples, insensible à la casse.
export function phraseRegex(phrase) {
  const p = phrase.trim();
  if (!p) return null;
  if (!isLatin(p)) return esc(p);
  const parts = p.split(/\s+/).flatMap(w => w.split(/(?<=[a-z])(?=\d)|(?<=\d)(?=[a-z])/i)).map(esc);
  const body = parts.join('[\\s\\-]*');
  return /^[a-z0-9]/i.test(p) ? `(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])` : body;
}

export function buildMatcher(phrases) {
  const parts = (phrases || []).map(phraseRegex).filter(Boolean);
  if (!parts.length) return null;
  return new RegExp(parts.join('|'), 'iu');
}

export function topicMatchers(topic) {
  const c = topic.config || {};
  return {
    match: buildMatcher(c.match?.length ? c.match : [topic.name]),
    rival: topic.type === 'product' ? buildMatcher(c.rivals || []) : null,
  };
}

// ---------- Validation de la configuration ----------
const arr = (v, max = 20, len = 120) => (Array.isArray(v) ? v : [])
  .filter(x => typeof x === 'string' && x.trim()).map(x => x.trim().slice(0, len)).slice(0, max);
const slug = s => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9一-鿿]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'sujet';

// Rubriques de la fiche : techniques pour un produit (jusqu'à 10), « repères » pour un sujet général (jusqu'à 4).
export function parseGroups(list, type) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, type === 'product' ? 10 : 4).map(g => ({
    label: String(g?.label || '').trim().slice(0, 40),
    items: (Array.isArray(g?.items) ? g.items : []).slice(0, 10).map(it => Array.isArray(it)
      ? [String(it[0] || ''), String(it[1] || '')]
      : [String(it?.key || ''), String(it?.label || '')])
      .map(([k, l]) => [slug(k).replace(/-/g, '_').slice(0, 30), l.trim().slice(0, 60)])
      .filter(([k, l]) => k && l),
  })).filter(g => g.label && g.items.length);
}

export function sanitizeConfig(raw, fallbackName) {
  const name = (typeof raw?.name === 'string' && raw.name.trim()) ? raw.name.trim().slice(0, 60) : fallbackName;
  const type = raw?.type === 'product' ? 'product' : 'general';
  const q = raw?.queries || {};
  const groups = parseGroups(raw?.spec_groups, type);
  const config = {
    short: (typeof raw?.short === 'string' && raw.short.trim()) ? raw.short.trim().slice(0, 30) : name,
    description: typeof raw?.description === 'string' ? raw.description.trim().slice(0, 240) : '',
    match: arr(raw?.match, 12, 60),
    exclude: arr(raw?.exclude, 12, 60),
    owner: typeof raw?.owner === 'string' ? raw.owner.trim().slice(0, 60) : '',
    queries: { fr: arr(q.fr, 3), en: arr(q.en, 3), zh: arr(q.zh, 3) },
    web_queries: arr(raw?.web_queries, 12),
    rivals: type === 'product' ? arr(raw?.rivals, 8, 60) : [],
    leakers: arr(raw?.leakers, 8, 60),
    tech: !!raw?.tech,
    spec_groups: groups,
    backfill_from: null,
  };
  if (!config.match.length) config.match = [config.short || name];
  for (const lang of ['fr', 'en']) if (!config.queries[lang].length) config.queries[lang] = [`"${config.short}"`];
  if (!config.web_queries.length) config.web_queries = [name, ...config.queries.en];
  return { id: slug(name), name, type, config };
}

// ---------- Création d'un sujet à partir de quelques mots ----------
export const TOPIC_SYSTEM = `Tu configures une application de veille d'actualités. L'utilisateur tape quelques mots décrivant ce qu'il veut suivre.
Tu réponds UNIQUEMENT par un objet JSON valide. Textes en français.
Décide du type :
- "product" : un produit précis (téléphone, voiture, console, appareil…) annoncé ou attendu, pour lequel une fiche technique a du sens.
- "general" : un sujet plus large (une marque entière, un secteur, une personne, un événement, un thème).
N'invente pas de faits sur le sujet : tu prépares seulement les mots-clés et les recherches.`;

const SHEET_RULE = `adaptée à ce sujet précis :
- produit : fiche technique de 4 à 8 rubriques propres à ce type de produit (téléphone : écran, photo, performances, batterie, prix et sortie… ; appareil photo : capteur, autofocus, vidéo, objectifs compatibles, boîtier, prix et sortie… ; console : processeur, graphismes, stockage, manettes, jeux de lancement, prix et sortie… ; voiture : motorisation, batterie et autonomie, recharge, dimensions, équipements, prix et sortie) ;
- sujet général : « fiche repères » de 2 à 4 rubriques, 3 à 6 lignes chacune : faits concrets, vérifiables et qui évoluent dans le temps (ex. marque automobile : dernier modèle annoncé, modèles vendus en Europe, prix d'appel, ventes récentes, usines ; auteur : dernier livre paru, date de sortie, éditeur, prochain livre annoncé, prix reçus ; assurance maladie : prime moyenne annoncée, hausse prévue, date d'entrée en vigueur, décisions récentes ; jeu vidéo : studio, plateformes, date de sortie, prix, dernière bande-annonce).
Chaque ligne : une clé courte en snake_case et un libellé en français. Pas de valeurs : la fiche se remplit avec les actualités.`;

// Fiche d'un sujet existant (créée après coup).
export const SHEET_SYSTEM = `Tu prépares la fiche d'un sujet suivi dans une application de veille d'actualités.
Tu réponds UNIQUEMENT par un objet JSON valide. Textes en français. Tu ne fournis aucune valeur, seulement les rubriques et les lignes.`;

export function sheetUserPrompt(topic) {
  return `Sujet : « ${topic.name} » (${topic.type === 'product' ? 'produit précis' : 'sujet général'})${topic.config?.description ? ` — ${topic.config.description}` : ''}

Réponds avec ce JSON :
{ "spec_groups": [ { "label": "Rubrique", "items": [ { "key": "identifiant_court", "label": "Ligne" } ] } ] }
La fiche doit être ${SHEET_RULE}`;
}

export function topicUserPrompt(text) {
  const today = new Date().toISOString().slice(0, 10);
  return `Date du jour : ${today}
Sujet tapé par l'utilisateur : « ${text} »

Réponds avec ce JSON :
{
  "name": "nom complet et propre du sujet (ex. « OPPO Find X10 Ultra », « Voitures BYD »)",
  "short": "nom court pour l'affichage (2 à 3 mots)",
  "type": "product | general",
  "description": "une phrase neutre qui définit le sujet",
  "owner": "fabricant ou organisation concernée, sinon chaîne vide",
  "match": ["expressions dont la présence dans un titre ou un extrait indique que l'article parle du sujet, y compris en chinois ou autres langues si pertinent ; précises pour éviter les faux positifs"],
  "exclude": ["produits ou sujets voisins à ne pas confondre (autres modèles de la même gamme, homonymes)"],
  "queries": { "fr": ["1 à 2 requêtes d'actualité en français"], "en": ["1 à 2 requêtes en anglais"], "zh": ["0 à 2 requêtes en chinois si les médias chinois couvrent le sujet, sinon liste vide"] },
  "web_queries": ["6 à 10 requêtes variées pour un moteur de recherche web, en plusieurs langues, couvrant les angles utiles (fuites, annonces, caractéristiques, prix, sortie…)"],
  "rivals": ["pour un produit : 3 à 6 produits concurrents directs à surveiller ; sinon liste vide"],
  "leakers": ["pour un produit tech : informateurs réputés de ce domaine ; sinon liste vide"],
  "tech": true,
  "spec_groups": [ { "label": "Rubrique", "items": [ { "key": "identifiant_court", "label": "Caractéristique" } ] } ]
}
"spec_groups" : la fiche du sujet, ${SHEET_RULE}
"tech" : true si le sujet relève de la technologie grand public (smartphones, informatique, consoles, objets connectés), sinon false.`;
}
