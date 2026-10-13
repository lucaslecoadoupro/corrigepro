// ── Synchro par fichier entre appareils (ordinateur ⇄ téléphone/tablette) ────
// Les données sont découpées en « unités » (profil, classe, grille, évaluation,
// copie d'un élève). Chaque unité porte la date de sa dernière modification ;
// à la fusion, la plus récente gagne. Rien n'est jamais remplacé en bloc.

const SYNCED_SETTINGS = ['nameOrder', 'quickComments', 'stamps'];
const json = (v) => JSON.stringify(v);

export const SYNC_FILE_PREFIX = 'CorrigePro-synchro';

// Toutes les unités d'un jeu de données : Map clé → valeur
export function units(d) {
  const m = new Map();
  m.set('profile', d.profile);
  m.set('settings', Object.fromEntries(SYNCED_SETTINGS.map((k) => [k, d.settings?.[k]])));
  (d.classes || []).forEach((c) => m.set(`class:${c.id}`, c));
  (d.grids || []).forEach((g) => m.set(`grid:${g.id}`, g));
  (d.evals || []).forEach((e) => {
    const { copies, ...meta } = e;
    m.set(`eval:${e.id}`, meta);
    Object.entries(copies || {}).forEach(([sid, c]) => m.set(`copy:${e.id}:${sid}`, c));
  });
  return m;
}

// Empreinte de chaque unité, pour repérer ce qui a changé entre deux états
export const fingerprints = (d) => new Map([...units(d)].map(([k, v]) => [k, json(v)]));

export function ensureSync(d) {
  d.sync = d.sync || {};
  d.sync.device = d.sync.device || `dev-${Math.random().toString(36).slice(2, 10)}`;
  d.sync.stamps = d.sync.stamps || {};
  d.sync.tomb = d.sync.tomb || {};
  d.sync.lastExport = d.sync.lastExport || 0;
  return d.sync;
}

// Date les unités modifiées / supprimées depuis l'état précédent. Renvoie les nouvelles empreintes.
export function stampChanges(prevFp, d, now = Date.now()) {
  const s = ensureSync(d);
  const fp = fingerprints(d);
  for (const [k, v] of fp) {
    if (prevFp.get(k) !== v) { s.stamps[k] = now; delete s.tomb[k]; }
  }
  for (const k of prevFp.keys()) {
    if (!fp.has(k)) { s.tomb[k] = now; delete s.stamps[k]; }
  }
  return fp;
}

// Nombre d'unités modifiées depuis le dernier envoi
export function pendingCount(d) {
  const s = d.sync;
  if (!s) return 0;
  const since = s.lastExport || 0;
  return Object.values(s.stamps).filter((t) => t > since).length + Object.values(s.tomb).filter((t) => t > since).length;
}

// Fichier de synchro : tout l'état (petit) + les images des copies modifiées depuis le dernier envoi
export async function buildSyncFile(d, deviceName, getBlob, { allImages = false } = {}) {
  const s = ensureSync(d);
  // Premier envoi (ou demandé) : toutes les images
  const since = allImages || !s.lastExport ? -1 : s.lastExport;
  const out = { app: 'CorrigePro', kind: 'sync', v: 1, from: s.device, fromName: deviceName, at: Date.now(), units: {}, tomb: { ...s.tomb }, blobs: {} };
  for (const [k, v] of units(d)) {
    const ts = s.stamps[k] || 0;
    out.units[k] = { ts, value: v };
    if (k.startsWith('copy:') && ts > since) {
      for (const p of v.pages || []) { const b = await getBlob(p.id); if (b) out.blobs[p.id] = b; }
    }
  }
  return out;
}

export function isSyncFile(f) {
  return !!f && f.app === 'CorrigePro' && f.kind === 'sync' && f.units && typeof f.units === 'object';
}

const localTs = (s, k, exists) => Math.max(s.stamps[k] ?? (exists ? 0 : -1), s.tomb[k] ?? -1);

// Fusionne un fichier reçu dans d (modifié sur place). Renvoie un résumé des changements.
export function mergeSync(d, file) {
  const s = ensureSync(d);
  const have = units(d);
  const sum = { classes: 0, grids: 0, evals: 0, copies: 0, removed: 0 };
  const take = (k) => { const u = file.units[k]; return u && u.ts > localTs(s, k, have.has(k)); };
  const keys = Object.keys(file.units);
  const order = ['profile', 'settings', 'class:', 'grid:', 'eval:', 'copy:'];
  keys.sort((a, b) => order.findIndex((p) => a.startsWith(p)) - order.findIndex((p) => b.startsWith(p)));

  for (const k of keys) {
    if (!take(k)) continue;
    const { ts, value } = file.units[k];
    const [kind, id, sid] = k.split(':');
    if (kind === 'profile') d.profile = { ...d.profile, ...value };
    else if (kind === 'settings') Object.assign(d.settings, value);
    else if (kind === 'class') { upsert(d.classes, value); sum.classes++; }
    else if (kind === 'grid') { upsert(d.grids, value); sum.grids++; }
    else if (kind === 'eval') {
      const cur = d.evals.find((e) => e.id === id);
      upsert(d.evals, { ...value, copies: cur?.copies || {} });
      sum.evals++;
    } else if (kind === 'copy') {
      const ev = d.evals.find((e) => e.id === id);
      if (!ev) continue; // évaluation supprimée ici plus récemment : on ignore
      ev.copies = ev.copies || {};
      ev.copies[sid] = value;
      sum.copies++;
    } else continue;
    s.stamps[k] = ts;
    delete s.tomb[k];
  }

  for (const [k, ts] of Object.entries(file.tomb || {})) {
    if (ts <= localTs(s, k, have.has(k))) continue;
    const [kind, id, sid] = k.split(':');
    if (kind === 'class') d.classes = d.classes.filter((c) => c.id !== id);
    else if (kind === 'grid') d.grids = d.grids.filter((g) => g.id !== id);
    else if (kind === 'eval') d.evals = d.evals.filter((e) => e.id !== id);
    else if (kind === 'copy') { const ev = d.evals.find((e) => e.id === id); if (ev?.copies) delete ev.copies[sid]; }
    else continue;
    if (have.has(k)) sum.removed++;
    s.tomb[k] = ts;
    delete s.stamps[k];
  }
  return sum;
}

function upsert(list, v) {
  const i = list.findIndex((x) => x.id === v.id);
  if (i >= 0) list[i] = v; else list.push(v);
}

export function summaryText(sum) {
  const parts = [];
  if (sum.copies) parts.push(`${sum.copies} copie(s) / note(s)`);
  if (sum.evals) parts.push(`${sum.evals} évaluation(s)`);
  if (sum.classes) parts.push(`${sum.classes} classe(s)`);
  if (sum.grids) parts.push(`${sum.grids} grille(s)`);
  if (sum.removed) parts.push(`${sum.removed} suppression(s)`);
  return parts.length ? parts.join(', ') : 'déjà à jour';
}
