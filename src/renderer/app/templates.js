import { uid } from './utils.js';

// Niveaux de maîtrise du socle commun (échelle officielle à 4 niveaux)
export const SOCLE_LEVELS = [
  { short: 'MI', label: 'Maîtrise insuffisante', ratio: 0, color: '#dc2626' },
  { short: 'MF', label: 'Maîtrise fragile', ratio: 1 / 3, color: '#d97706' },
  { short: 'MS', label: 'Maîtrise satisfaisante', ratio: 2 / 3, color: '#3b5bdb' },
  { short: 'TBM', label: 'Très bonne maîtrise', ratio: 1, color: '#0f9b6e' },
];

export const SCALES = [10, 20, 30, 40, 50, 100];
export const ROUNDINGS = [
  { v: 'none', label: 'Au centième' },
  { v: '0.25', label: 'Au quart de point' },
  { v: '0.5', label: 'Au demi-point' },
  { v: '1', label: 'Au point entier' },
];

const c = (label, max, desc = '') => ({ id: uid('cr'), kind: 'crit', label, desc, max });
const s = (label) => ({ id: uid('sec'), kind: 'section', label });

// Types d'évaluation proposés à la création d'une grille
export const GRID_TYPES = [
  {
    id: 'ee', label: 'Expression écrite', hint: 'Production écrite, rédaction',
    mode: 'points', build: () => [
      s('Contenu'),
      c('Respect de la consigne', 4, 'Type de texte, longueur, toutes les étapes demandées'),
      c('Cohérence et organisation', 4, 'Enchaînement des idées, connecteurs, paragraphes'),
      s('Langue'),
      c('Richesse du lexique', 4, 'Vocabulaire varié et précis, réemploi du lexique étudié'),
      c('Correction grammaticale', 6, 'Conjugaisons, accords, structures'),
      c('Orthographe et ponctuation', 2),
    ],
  },
  {
    id: 'eo', label: 'Expression orale', hint: 'Prise de parole en continu',
    mode: 'points', build: () => [
      c('Contenu et pertinence', 4, 'Le message répond à la consigne'),
      c('Aisance et fluidité', 4, 'Débit, peu d\'hésitations, autonomie par rapport aux notes'),
      c('Prononciation et intonation', 4),
      c('Richesse du lexique', 4),
      c('Correction de la langue', 4),
    ],
  },
  {
    id: 'ce', label: 'Compréhension écrite', hint: 'Lecture d\'un document',
    mode: 'points', build: () => [
      c('Identification du document', 4, 'Nature, source, thème général'),
      c('Repérage des informations', 8, 'Personnages, lieux, faits essentiels'),
      c('Compréhension fine', 6, 'Sentiments, intentions, implicite'),
      c('Justification par le texte', 2, 'Citations pertinentes'),
    ],
  },
  {
    id: 'co', label: 'Compréhension orale', hint: 'Audio ou vidéo',
    mode: 'points', build: () => [
      c('Compréhension globale', 6, 'Situation, thème, interlocuteurs'),
      c('Repérage des informations', 8, 'Éléments explicites'),
      c('Compréhension détaillée', 6, 'Nuances, opinions, informations implicites'),
    ],
  },
  {
    id: 'ctrl', label: 'Contrôle de connaissances', hint: 'Exercices numérotés',
    mode: 'points', build: () => [
      c('Exercice 1', 5), c('Exercice 2', 5), c('Exercice 3', 5), c('Exercice 4', 5),
    ],
  },
  {
    id: 'tf', label: 'Tâche finale / projet', hint: 'Évaluation par niveaux de maîtrise',
    mode: 'niveaux', build: () => [
      c('Réalisation de la tâche', 5, 'Le projet répond à la consigne et est complet'),
      c('Qualité de la production', 5, 'Créativité, soin, organisation'),
      c('Mobilisation des acquis', 5, 'Réemploi des outils de la séquence'),
      c('Autonomie et implication', 5),
    ],
  },
  {
    id: 'comp', label: 'Compétences du socle', hint: 'MI / MF / MS / TBM',
    mode: 'niveaux', build: () => [
      s('Domaine 1 — Les langages pour penser et communiquer'),
      c('Comprendre, s\'exprimer en utilisant une langue étrangère', 5),
      c('Comprendre, s\'exprimer en utilisant la langue française à l\'écrit et à l\'oral', 5),
      s('Domaine 2 — Méthodes et outils pour apprendre'),
      c('Organiser son travail personnel', 5),
      s('Domaine 3 — Formation de la personne et du citoyen'),
      c('Coopérer et réaliser des projets', 5),
    ],
  },
  { id: 'custom', label: 'Personnalisée', hint: 'Partir d\'une grille vide', mode: 'points', build: () => [c('Critère 1', 10), c('Critère 2', 10)] },
];

export function newGrid(typeId = 'ee') {
  const t = GRID_TYPES.find((x) => x.id === typeId) || GRID_TYPES[0];
  return {
    id: uid('grid'),
    title: t.id === 'custom' ? 'Nouvelle grille' : t.label,
    subtitle: '',
    type: t.label,
    typeId: t.id,
    scale: 20,
    rounding: '0.5',
    mode: t.mode,
    levels: SOCLE_LEVELS.map((l) => ({ ...l })),
    criteria: t.build(),
    orientation: 'portrait',
    perSheet: 1,
    fields: { nom: true, classe: true, date: true },
    instructions: '',
    showDesc: true,
    commentLines: 3,
    showLegend: true,
    showSignature: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export const DEFAULT_QUICK_COMMENTS = [
  'Très bon travail !', 'Bon travail, continue ainsi.', 'Travail sérieux mais des erreurs de langue.',
  'Relis-toi attentivement.', 'Revois les conjugaisons.', 'Développe davantage tes idées.',
  'Attention à l\'orthographe.', 'Des progrès, bravo !', 'Travail insuffisant.',
];

export const DEFAULT_STAMPS = ['✓', '✗', '?', '!', 'Bien', 'Très bien', 'Conj.', 'Accord', 'Ortho', 'Voc.', 'Syntaxe', 'Hors-sujet'];
