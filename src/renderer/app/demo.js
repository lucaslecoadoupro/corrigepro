// Jeu de données d'exemple : permet de découvrir l'application sans rien préparer.
import { uid, deep, defaultSchoolYear, sortStudents } from './utils.js';
import { newGrid } from './templates.js';
import { blobs } from './platform.js';

const NAMES = [
  ['BERNARD', 'Léa'], ['CARON', 'Hugo'], ['DIAZ', 'Inès'], ['DUBOIS', 'Nathan'], ['FAURE', 'Chloé'], ['FERNANDEZ', 'Lucas'],
  ['GARCIA', 'Manon'], ['GIRARD', 'Théo'], ['LAMBERT', 'Camille'], ['LEFEBVRE', 'Enzo'], ['LOPEZ', 'Jade'], ['MARTIN', 'Louis'],
  ['MOREAU', 'Zoé'], ['MULLER', 'Tom'], ['PEREZ', 'Lina'], ['PETIT', 'Gabriel'], ['ROBERT', 'Emma'], ['ROUX', 'Raphaël'],
  ['SANCHEZ', 'Alice'], ['SIMON', 'Jules'], ['THOMAS', 'Sarah'], ['VINCENT', 'Adam'], ['NAVARRO', 'Lola'], ['BLANC', 'Noah'],
];

const TEXTS = [
  ['Mi ciudad ideal', 'En mi ciudad ideal hay muchos parques y', 'zonas verdes. No hay coches en el centro,', 'la gente va en bici o a pie. Me gustaría', 'que haya un gran mercado los sábados', 'donde se puede comprar frutas y verduras', 'de la región. También quiero una', 'biblioteca enorme y un cine al aire libre.', 'Los jóvenes podrían hacer deporte gratis', 'en un polideportivo moderno. Para mí,', 'lo más importante es que la ciudad sea', 'tranquila y que todos se respeten.'],
  ['Mi ciudad ideal', 'Mi ciudad ideal esta cerca del mar.', 'Hay una playa muy grande y muchos', 'restaurantes de pescado. Yo vivo en una', 'casa con jardín y tengo un perro.', 'En mi ciudad, los habitantes son', 'simpáticos y la vida es barata.', 'Hay un estadio de fútbol porque me', 'encanta el fútbol. No hay contaminación', 'porque los autobuses son eléctricos.'],
];

function makePage(title, lines, name, seed) {
  const W = 1240; const H = 1754;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fdfdfb'; ctx.fillRect(0, 0, W, H);
  // papier Seyès simplifié
  for (let y = 260; y < H - 80; y += 64) {
    ctx.strokeStyle = 'rgba(70,110,200,.28)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    ctx.strokeStyle = 'rgba(120,150,220,.12)'; ctx.lineWidth = 1;
    for (let k = 1; k < 4; k++) { ctx.beginPath(); ctx.moveTo(0, y + k * 16); ctx.lineTo(W, y + k * 16); ctx.stroke(); }
  }
  ctx.strokeStyle = 'rgba(220,60,90,.45)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(170, 0); ctx.lineTo(170, H); ctx.stroke();
  const ink = '#1d3a8a';
  ctx.fillStyle = ink;
  ctx.font = 'italic 34px "Segoe Print", "Bradley Hand", "Comic Sans MS", cursive';
  ctx.fillText(name, 200, 110);
  ctx.fillText('3e B', 940, 110);
  ctx.font = 'italic 44px "Segoe Print", "Bradley Hand", "Comic Sans MS", cursive';
  ctx.fillText(title, 420, 210);
  ctx.font = 'italic 36px "Segoe Print", "Bradley Hand", "Comic Sans MS", cursive';
  let r = seed;
  const rnd = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
  lines.forEach((l, i) => {
    ctx.save();
    ctx.translate(200 + rnd() * 8, 312 + i * 64 + (rnd() - 0.5) * 4);
    ctx.rotate((rnd() - 0.5) * 0.008);
    ctx.fillText(l, 0, 0);
    ctx.restore();
  });
  return { dataUrl: cv.toDataURL('image/jpeg', 0.85), w: W, h: H };
}

export async function buildDemo(base) {
  const d = deep(base);
  const students = sortStudents(NAMES.map(([nom, prenom]) => ({ id: uid('el'), nom, prenom })));
  const cls = { id: uid('cls'), name: '3e B', level: '3e', year: defaultSchoolYear(), color: '#3b5bdb', students, createdAt: new Date().toISOString() };
  const cls2 = { id: uid('cls'), name: '4e A', level: '4e', year: defaultSchoolYear(), color: '#7c3aed', students: sortStudents(NAMES.slice(0, 18).map(([nom, prenom], i) => ({ id: uid('el'), nom: NAMES[(i * 7) % NAMES.length][0], prenom: NAMES[(i * 5 + 3) % NAMES.length][1] }))), createdAt: new Date().toISOString() };

  const gEE = { ...newGrid('ee'), title: 'Expression écrite', subtitle: 'Séquence 2 — La ciudad', perSheet: 2 };
  const gCO = { ...newGrid('co'), title: 'Compréhension orale' };
  const gTF = { ...newGrid('tf'), title: 'Tâche finale — Guía turística', commentLines: 2 };
  d.grids.push(gEE, gCO, gTF);

  const now = new Date();
  const dayISO = (offset) => { const x = new Date(now); x.setDate(x.getDate() - offset); return x.toISOString().slice(0, 10); };

  let seed = 7;
  const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const fillPoints = (grid, skill, drift) => {
    const scores = {};
    grid.criteria.filter((c) => c.kind !== 'section').forEach((c) => {
      const v = Math.max(0, Math.min(c.max, (skill + drift + (rand() - 0.5) * 0.35) * c.max));
      scores[c.id] = Math.round(v * 2) / 2;
    });
    return scores;
  };
  const skills = Object.fromEntries(students.map((s) => [s.id, 0.35 + rand() * 0.55]));

  const mkEval = (title, grid, offset, drift, coef = 1) => {
    const ev = { id: uid('ev'), title, classId: cls.id, gridId: grid.id, grid: deep(grid), date: dayISO(offset), coef, copies: {}, createdAt: new Date(now - offset * 864e5).toISOString() };
    students.forEach((s, i) => {
      if (i === 5 && offset > 40) { ev.copies[s.id] = { pages: [], ann: {}, scores: {}, levels: {}, bonus: 0, comment: '', status: 'todo', absent: true }; return; }
      const sk = skills[s.id] + drift * (i % 3 === 0 ? 1.6 : i % 3 === 1 ? 0.4 : -0.6);
      const copy = { pages: [], ann: {}, scores: {}, levels: {}, bonus: 0, comment: '', status: 'done', absent: false };
      if (grid.mode === 'niveaux') grid.criteria.filter((c) => c.kind !== 'section').forEach((c) => { copy.levels[c.id] = Math.max(0, Math.min(3, Math.round(sk * 3 + (rand() - 0.5)))); });
      else copy.scores = fillPoints(grid, sk, 0);
      ev.copies[s.id] = copy;
    });
    return ev;
  };

  const e1 = mkEval('Compréhension orale — En el mercado', gCO, 63, -0.04);
  const e2 = mkEval('Tâche finale — Guía de mi ciudad', gTF, 35, 0.02, 2);
  const e3 = mkEval('Compréhension orale — Un día en Madrid', gCO, 18, 0.05);
  const e4 = { id: uid('ev'), title: 'Expression écrite — Mi ciudad ideal', classId: cls.id, gridId: gEE.id, grid: deep(gEE), date: dayISO(2), coef: 1, copies: {}, createdAt: now.toISOString() };

  // Copies numérisées d'exemple pour la dernière évaluation
  const sample = students.slice(0, 3);
  for (let i = 0; i < sample.length; i++) {
    const s = sample[i];
    const page = makePage(TEXTS[i % 2][0], TEXTS[i % 2].slice(1), `${s.prenom} ${s.nom}`, 11 + i * 17);
    const pid = uid('pg');
    await blobs.put(pid, page.dataUrl);
    e4.copies[s.id] = { pages: [{ id: pid, w: page.w, h: page.h, name: 'copie.jpg' }], ann: {}, scores: {}, levels: {}, bonus: 0, comment: '', status: 'todo', absent: false };
  }
  // la première copie est déjà partiellement corrigée pour montrer le rendu
  const first = e4.copies[sample[0].id];
  const pg = first.pages[0];
  const crit = gEE.criteria.filter((c) => c.kind !== 'section');
  first.scores = { [crit[0].id]: 4, [crit[1].id]: 3.5, [crit[2].id]: 3 };
  first.status = 'progress';
  first.ann[pg.id] = [
    { id: uid('a'), t: 'wave', c: '#e03131', w: 4, x1: 312, y1: 580, x2: 452, y2: 580 },
    { id: uid('a'), t: 'text', c: '#e03131', s: 30, x: 820, y: 532, txt: 'se pueda (subj.)' },
    { id: uid('a'), t: 'stamp', c: '#e03131', s: 32, x: 120, y: 556, txt: '✗' },
    { id: uid('a'), t: 'ellipse', c: '#2f9e44', w: 4, x: 905, y: 812, rx: 92, ry: 34 },
    { id: uid('a'), t: 'stamp', c: '#2f9e44', s: 34, x: 1105, y: 808, txt: 'Très bien' },
    { id: uid('a'), t: 'hl', c: '#ffe066', w: 22, pts: [[205, 941], [810, 941]] },
  ];

  d.classes.push(cls, cls2);
  d.evals.push(e1, e2, e3, e4);
  return d;
}
