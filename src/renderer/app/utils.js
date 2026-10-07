// ── Utilitaires généraux ─────────────────────────────────────────────────────

export const uid = (p = 'id') => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const deep = (o) => (typeof structuredClone === 'function' ? structuredClone(o) : JSON.parse(JSON.stringify(o)));

export function fmt(n, dec = 2) {
  if (n == null || Number.isNaN(n)) return '–';
  const r = Math.round(n * 10 ** dec) / 10 ** dec;
  return r.toLocaleString('fr-FR', { maximumFractionDigits: dec });
}

export function fmtDate(iso, opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fr-FR', opts);
}
export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Année scolaire avec bascule au 1er août (même logique que ClassPro)
export function defaultSchoolYear(d = new Date()) {
  const y = d.getFullYear();
  return d.getMonth() >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

export const CLASS_COLORS = ['#3b5bdb', '#7c3aed', '#0f9b6e', '#d97706', '#dc2626', '#0891b2', '#db2777', '#4d7c0f', '#475569'];

export function initials(s) {
  return `${(s.prenom || '').trim()[0] || ''}${(s.nom || '').trim()[0] || ''}`.toUpperCase() || '?';
}
export function studentName(s, order = 'nom') {
  if (!s) return '';
  const nom = (s.nom || '').toUpperCase();
  return order === 'prenom' ? `${s.prenom || ''} ${nom}`.trim() : `${nom} ${s.prenom || ''}`.trim();
}
export function sortStudents(list) {
  return [...list].sort((a, b) => (a.nom || '').localeCompare(b.nom || '', 'fr', { sensitivity: 'base' }) || (a.prenom || '').localeCompare(b.prenom || '', 'fr'));
}
export function avatarColor(str = '') {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return CLASS_COLORS[h % CLASS_COLORS.length];
}

// ── Import d'une liste d'élèves ─────────────────────────────────────────────
// Accepte : « NOM Prénom » par ligne (Pronote), CSV/TSV avec en-tête Nom/Prénom,
// ou « Nom ; Prénom ». Les noms en majuscules sont reconnus comme noms de famille.
const isUpperWord = (w) => w.length > 0 && w === w.toUpperCase() && /[A-ZÀ-Ý]/.test(w);
const capWord = (w) => w.toLowerCase().replace(/(^|[-' ])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());

export function splitFullName(full) {
  const words = full.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (!words.length) return null;
  if (words.length === 1) return { nom: words[0].toUpperCase(), prenom: '' };
  const upperIdx = words.map(isUpperWord);
  if (upperIdx[0]) {
    let k = 0;
    while (k < words.length && upperIdx[k]) k++;
    if (k === words.length) k = words.length - 1; // tout en majuscules : dernier mot = prénom
    return { nom: words.slice(0, k).join(' '), prenom: capWord(words.slice(k).join(' ')) };
  }
  if (upperIdx[words.length - 1]) { // « Prénom NOM »
    let k = words.length - 1;
    while (k > 0 && upperIdx[k - 1]) k--;
    return { nom: words.slice(k).join(' '), prenom: words.slice(0, k).join(' ') };
  }
  return { nom: words[0].toUpperCase(), prenom: words.slice(1).join(' ') };
}

export function parseStudents(text) {
  const lines = text.replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const seps = ['\t', ';', ','];
  const sep = seps.find((s) => lines.filter((l) => l.includes(s)).length >= Math.ceil(lines.length * 0.6));
  const clean = (c) => (c || '').replace(/^"|"$/g, '').trim();

  if (sep) {
    let rows = lines.map((l) => l.split(sep).map(clean));
    const head = rows[0].map((h) => h.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''));
    let iNom = head.findIndex((h) => h === 'nom' || h.startsWith('nom ') || h === 'last name' || h === 'nom de famille');
    let iPre = head.findIndex((h) => h.startsWith('prenom') || h === 'first name');
    let iFull = head.findIndex((h) => h === 'eleve' || h === 'eleves' || h === 'nom prenom' || h === 'nom et prenom' || h === 'apprenant');
    const hasHeader = iNom >= 0 || iPre >= 0 || iFull >= 0;
    if (hasHeader) rows = rows.slice(1);
    const out = [];
    for (const r of rows) {
      if (hasHeader && iNom >= 0 && iPre >= 0) {
        if (r[iNom] || r[iPre]) out.push({ nom: (r[iNom] || '').toUpperCase(), prenom: capWord(r[iPre] || '') });
      } else if (hasHeader && iFull >= 0) {
        const p = splitFullName(r[iFull] || ''); if (p) out.push(p);
      } else if (!hasHeader && r.length >= 2 && r[0] && r[1] && !/\d/.test(r[0] + r[1])) {
        out.push({ nom: r[0].toUpperCase(), prenom: capWord(r[1]) });
      } else {
        const p = splitFullName(r.filter(Boolean)[0] || ''); if (p) out.push(p);
      }
    }
    return out.filter((s) => s.nom || s.prenom);
  }
  return lines.map((l) => splitFullName(l.replace(/^\d+[.)\-\s]+/, ''))).filter(Boolean);
}

// ── ClassPro : lecture du fichier de sauvegarde JSON ────────────────────────
export function parseClassProClasses(json) {
  try {
    const entries = json?.entries;
    if (!entries) return null;
    const raw = entries['sc-classes'];
    const classes = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(classes)) return null;
    return classes.map((c) => ({
      name: c.name || 'Classe',
      students: (c.eleves || []).map((e) => (e.prenom != null ? { nom: (e.nom || '').toUpperCase(), prenom: e.prenom } : splitFullName(e.nom || ''))).filter(Boolean),
    }));
  } catch { return null; }
}

// ── Calcul des notes ────────────────────────────────────────────────────────
export function gridMax(grid) {
  return (grid?.criteria || []).filter((c) => c.kind !== 'section').reduce((s, c) => s + (Number(c.max) || 0), 0);
}

export function critPoints(grid, copy, crit) {
  if (!copy) return null;
  if (grid.mode === 'niveaux') {
    const li = copy.levels?.[crit.id];
    if (li == null || !grid.levels[li]) return null;
    return (Number(crit.max) || 0) * grid.levels[li].ratio;
  }
  const v = copy.scores?.[crit.id];
  return v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v);
}

export function roundTo(v, step) {
  if (!step || step === 'none') return Math.round(v * 100) / 100;
  const s = Number(step);
  return Math.round(v / s) * s;
}

export function computeNote(grid, copy) {
  const crits = (grid?.criteria || []).filter((c) => c.kind !== 'section');
  const max = gridMax(grid);
  let raw = 0; let filled = 0;
  for (const c of crits) {
    const p = critPoints(grid, copy, c);
    if (p != null) { raw += p; filled++; }
  }
  const bonus = Number(copy?.bonus) || 0;
  raw += bonus;
  const scale = Number(grid?.scale) || 20;
  const any = filled > 0 || bonus !== 0;
  const note = any && max > 0 ? clamp(roundTo((raw / max) * scale, grid.rounding ?? '0.5'), 0, scale) : null;
  return { raw, max, note, scale, filled, total: crits.length, complete: crits.length > 0 && filled === crits.length };
}

// Note d'une copie dans une évaluation (null si absent / non noté).
// onlyDone : ne compte que les copies validées (moyennes, statistiques).
export function copyNote(ev, studentId, onlyDone = false) {
  const c = ev.copies?.[studentId];
  if (!c || c.absent) return null;
  if (onlyDone && c.status !== 'done') return null;
  if (c.manualNote != null && c.manualNote !== '') return Number(c.manualNote);
  return computeNote(ev.grid, c).note;
}
export const to20 = (note, scale) => (note == null ? null : (note / (Number(scale) || 20)) * 20);

export function noteClass(n20) {
  if (n20 == null) return 'n-x';
  if (n20 >= 15) return 'n-a';
  if (n20 >= 12) return 'n-b';
  if (n20 >= 8) return 'n-c';
  return 'n-d';
}

export function mean(arr) {
  const v = arr.filter((x) => x != null && !Number.isNaN(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
export function weightedMean(pairs) { // [[value, weight]]
  const v = pairs.filter(([x]) => x != null);
  const w = v.reduce((s, [, k]) => s + k, 0);
  return w ? v.reduce((s, [x, k]) => s + x * k, 0) / w : null;
}
export function median(arr) {
  const v = arr.filter((x) => x != null).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

export function evalStats(ev, students) {
  const notes = students.map((s) => copyNote(ev, s.id, true)).filter((n) => n != null);
  const corrected = students.filter((s) => ev.copies?.[s.id]?.status === 'done').length;
  const absent = students.filter((s) => ev.copies?.[s.id]?.absent).length;
  const withCopy = students.filter((s) => (ev.copies?.[s.id]?.pages || []).length).length;
  return {
    count: notes.length, mean: mean(notes), median: median(notes),
    min: notes.length ? Math.min(...notes) : null, max: notes.length ? Math.max(...notes) : null,
    corrected, absent, withCopy, todo: students.length - corrected - absent,
  };
}

export function debounce(fn, ms) {
  let t;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.flush = (...a) => { clearTimeout(t); fn(...a); };
  return d;
}

export function readFileAsText(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsText(file); });
}
export function readFileAsDataURL(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
}
export function downloadText(name, text, type = 'application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
