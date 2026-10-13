// Vérification de la fusion des fichiers de synchro : node scripts/sync.test.mjs
import assert from 'node:assert';
import { fingerprints, stampChanges, buildSyncFile, mergeSync, pendingCount, isSyncFile } from '../src/renderer/app/sync.js';

const T = Date.now() - 100000; // dates proches de maintenant, comme en vrai
const base = () => ({
  profile: { prenom: 'L' }, settings: { nameOrder: 'nom', quickComments: [], stamps: [] },
  classes: [{ id: 'c1', name: '4B', students: [{ id: 's1' }, { id: 's2' }] }],
  grids: [{ id: 'g1', title: 'Participation' }],
  evals: [{ id: 'e1', title: 'P1', classId: 'c1', grid: { criteria: [] }, copies: {} }],
});
// Simule un appareil : état + empreintes, et une modification datée
const device = (d, t = T + 1000) => { const dev = { d, fp: new Map() }; dev.fp = stampChanges(dev.fp, dev.d, t); return dev; };
const edit = (dev, fn, t) => { fn(dev.d); dev.fp = stampChanges(dev.fp, dev.d, t); };
const send = async (dev) => { const f = await buildSyncFile(dev.d, 'x', async (id) => `img:${id}`); dev.d.sync.lastExport = Math.max(...Object.values(dev.d.sync.stamps)); return JSON.parse(JSON.stringify(f)); };
const receive = (dev, f) => { const sum = mergeSync(dev.d, f); dev.fp = fingerprints(dev.d); return sum; };

// 1. Le téléphone part d'un état vide et reçoit tout
const pc = device(base());
const phone = device({ profile: {}, settings: {}, classes: [], grids: [], evals: [] }, T + 500);
let f = await send(pc);
assert(isSyncFile(f));
receive(phone, f);
assert.strictEqual(phone.d.classes.length, 1);
assert.strictEqual(phone.d.evals[0].title, 'P1');

// 2. Modifications des deux côtés sur des élèves différents : les deux sont gardées
edit(phone, (d) => { d.evals[0].copies.s1 = { scores: { a: 4 } }; }, T + 2000);
edit(pc, (d) => { d.evals[0].copies.s2 = { scores: { a: 2 }, pages: [{ id: 'pg1' }] }; }, T + 2100);
receive(pc, await send(phone));
const fromPc = await send(pc);
assert.strictEqual(fromPc.blobs.pg1, 'img:pg1', 'image de la copie modifiée jointe');
receive(phone, fromPc);
for (const dev of [pc, phone]) {
  assert.strictEqual(dev.d.evals[0].copies.s1.scores.a, 4);
  assert.strictEqual(dev.d.evals[0].copies.s2.scores.a, 2);
}

// 3. Même copie modifiée des deux côtés : la plus récente gagne
edit(pc, (d) => { d.evals[0].copies.s1.scores.a = 1; }, T + 3000);
edit(phone, (d) => { d.evals[0].copies.s1.scores.a = 5; }, T + 3100);
receive(pc, await send(phone));
assert.strictEqual(pc.d.evals[0].copies.s1.scores.a, 5);
const sumOld = receive(phone, await send(pc)); // la version 3000 du pc est plus ancienne
assert.strictEqual(phone.d.evals[0].copies.s1.scores.a, 5);

// 4. Modifier l'évaluation (titre) ne fait pas perdre les copies locales
edit(phone, (d) => { d.evals[0].copies.s2.scores.a = 3; }, T + 4000);
edit(pc, (d) => { d.evals[0].title = 'Participation T1'; }, T + 4100);
receive(phone, await send(pc));
assert.strictEqual(phone.d.evals[0].title, 'Participation T1');
assert.strictEqual(phone.d.evals[0].copies.s2.scores.a, 3);

// 5. Suppression propagée, mais pas si l'autre côté a modifié après
edit(pc, (d) => { d.grids = []; }, T + 5000);
receive(phone, await send(pc));
assert.strictEqual(phone.d.grids.length, 0);
edit(phone, (d) => { d.classes[0].name = '4B bis'; }, T + 6100);
edit(pc, (d) => { d.classes = []; }, T + 6000);
receive(phone, await send(pc));
assert.strictEqual(phone.d.classes.length, 1, 'modif plus récente que la suppression : gardée');

// 6. Recevoir deux fois le même fichier ne change rien et ne crée pas de « modifications à envoyer »
f = await send(pc);
receive(phone, f);
const before = JSON.stringify(phone.d.evals);
const pend = pendingCount(phone.d);
receive(phone, f);
assert.strictEqual(JSON.stringify(phone.d.evals), before);
assert.strictEqual(pendingCount(phone.d), pend);

// 7. Un fichier quelconque n'est pas pris pour un fichier de synchro
assert(!isSyncFile({ app: 'CorrigePro', data: {} }));
assert(sumOld);
console.log('sync.test.mjs : OK');

// 8. Premier envoi d'un appareil : les images partent même sans date de modification
{
  const fresh = device({ profile: {}, settings: {}, classes: [], grids: [], evals: [{ id: 'e9', copies: { s: { pages: [{ id: 'p9' }] } } }] });
  fresh.d.sync.stamps = {}; // données présentes avant la synchro (non datées)
  const f9 = await buildSyncFile(fresh.d, 'x', async (id) => `img:${id}`);
  assert.strictEqual(f9.blobs.p9, 'img:p9');
  console.log('sync.test.mjs (premier envoi) : OK');
}

// 9. Saisie directe d'un critère (tableau de saisie, téléphone)
{
  const { setCritValue } = await import('../src/renderer/app/utils.js');
  const grid = { mode: 'points', scale: 20, rounding: '0.5', criteria: [{ id: 'a', kind: 'crit', max: 5 }, { id: 'b', kind: 'crit', max: 5 }] };
  const c = { scores: {}, levels: {}, status: 'todo' };
  setCritValue(grid, c, 'a', 9); assert.deepStrictEqual([c.scores.a, c.status], [5, 'progress'], 'ramené au maximum');
  setCritValue(grid, c, 'b', '2,5'); assert.deepStrictEqual([c.scores.b, c.status], [2.5, 'done'], 'virgule acceptée, copie complète');
  setCritValue(grid, c, 'b', ''); assert.deepStrictEqual([c.scores.b, c.status], [null, 'progress'], 'case vidée');
  setCritValue(grid, c, 'inconnu', 3); assert(!('inconnu' in c.scores), 'critère inconnu ignoré');
  const niv = { ...grid, mode: 'niveaux', levels: [{ ratio: 0 }, { ratio: 1 }] };
  const c2 = { scores: {}, levels: {} };
  setCritValue(niv, c2, 'a', 1); setCritValue(niv, c2, 'b', 7);
  assert.deepStrictEqual([c2.levels.a, c2.levels.b], [1, null], 'niveau hors liste refusé');
  console.log('sync.test.mjs (saisie directe) : OK');
}
