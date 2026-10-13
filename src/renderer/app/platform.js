// ── Couche plateforme ───────────────────────────────────────────────────────
// En version Desktop (Electron), tout passe par window.corrigepro (preload) :
// données dans un fichier JSON, copies scannées en fichiers JPEG.
// En version navigateur, repli sur localStorage + IndexedDB.

import { uid } from './utils.js';

const api = typeof window !== 'undefined' ? window.corrigepro : null;
export const isDesktop = !!api;
export const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform || navigator.userAgent);

const LS_KEY = 'corrigepro-data-v1';

// Navigateur / appli mobile : IndexedDB (pas de limite à 5 Mo comme localStorage).
// Repli sur localStorage si IndexedDB est indisponible (navigation privée…).
let dataDbPromise = null;
function dataDb() {
  dataDbPromise = dataDbPromise || new Promise((res, rej) => {
    try {
      const req = indexedDB.open('corrigepro-data', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    } catch (e) { rej(e); }
  });
  return dataDbPromise;
}
const idbReq = (mode, fn) => dataDb().then((db) => new Promise((res, rej) => {
  const tx = db.transaction('kv', mode);
  const r = fn(tx.objectStore('kv'));
  tx.oncomplete = () => res(r?.result);
  tx.onerror = () => rej(tx.error);
}));

export async function loadData() {
  if (api) return api.loadData();
  // Demande au navigateur de ne pas effacer les données (important sur iPhone / iPad)
  try { navigator.storage?.persist?.(); } catch { /* facultatif */ }
  try {
    const d = await idbReq('readonly', (st) => st.get('data'));
    if (d) return d;
  } catch { /* repli localStorage */ }
  try { const raw = localStorage.getItem(LS_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}

export async function saveData(data) {
  if (api) return api.saveData(data);
  try {
    await idbReq('readwrite', (st) => st.put(data, 'data'));
    try { localStorage.removeItem(LS_KEY); } catch { /* ancienne copie : sans gravité */ }
    return { ok: true };
  } catch {
    try { localStorage.setItem(LS_KEY, JSON.stringify(data)); return { ok: true }; } catch (e) { return { ok: false, error: String(e) }; }
  }
}

// ── Synchro par fichier ─────────────────────────────────────────────────────
export function deviceName() {
  if (api) return isMac ? 'Mac' : 'PC';
  const ua = navigator.userAgent;
  if (/iPad|Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return 'iPad';
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? 'téléphone Android' : 'tablette Android';
  return 'navigateur';
}

export const syncIO = {
  watch: (dir) => (api?.syncWatch ? api.syncWatch(dir) : Promise.resolve({ on: false })),
  pickDir: () => (api?.syncPickDir ? api.syncPickDir() : Promise.resolve(null)),
  onIncoming: (cb) => (api?.onSyncIncoming ? api.onSyncIncoming(cb) : () => {}),
  // mode 'share' : menu de partage (mobile, macOS) ; 'save' : enregistrer le fichier
  async send(name, text, { dir, mode = 'share' } = {}) {
    if (api) return api.syncShare({ name, text, dir, mode });
    const file = new File([text], name, { type: 'application/json' });
    if (mode === 'share' && navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Synchro CorrigePro' }); return { ok: true, shared: true }; } catch (e) { if (e.name === 'AbortError') return { ok: false }; }
    }
    const { downloadText } = await import('./utils.js');
    downloadText(name, text);
    return { ok: true, downloaded: true };
  },
};

export async function appInfo() {
  if (api) return api.getInfo();
  return { version: '1.0.0', platform: 'web' };
}

// ── Stockage des images de copies ───────────────────────────────────────────
let idbPromise = null;
function idb() {
  if (idbPromise) return idbPromise;
  idbPromise = new Promise((res, rej) => {
    try {
      const req = indexedDB.open('corrigepro-blobs', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('blobs');
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    } catch (e) { rej(e); }
  });
  return idbPromise;
}
const memBlobs = new Map(); // repli ultime si IndexedDB est indisponible
const urlCache = new Map();

function dataUrlToBlob(dataUrl) {
  const [head, b64] = dataUrl.split(',');
  const mime = head.match(/:(.*?);/)[1];
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export const blobs = {
  async put(id, dataUrl) {
    if (api) return api.blobPut(id, dataUrl);
    try {
      const db = await idb();
      await new Promise((res, rej) => { const tx = db.transaction('blobs', 'readwrite'); tx.objectStore('blobs').put(dataUrl, id); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    } catch { memBlobs.set(id, dataUrl); }
    return { ok: true };
  },
  async getDataUrl(id) {
    if (api) return api.blobGet(id);
    try {
      const db = await idb();
      const v = await new Promise((res, rej) => { const r = db.transaction('blobs').objectStore('blobs').get(id); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
      if (v) return v;
    } catch { /* repli mémoire */ }
    return memBlobs.get(id) || null;
  },
  // URL directement utilisable dans <img src>
  // v : numéro de version de l'image (incrémenté après une rotation)
  async url(id, v = 0) {
    if (api) return `cpblob://img/${encodeURIComponent(id)}.jpg?v=${v}`;
    const key = `${id}@${v}`;
    if (urlCache.has(key)) return urlCache.get(key);
    const d = await this.getDataUrl(id);
    if (!d) return null;
    const u = URL.createObjectURL(dataUrlToBlob(d));
    urlCache.set(key, u);
    return u;
  },
  async remove(ids) {
    if (api) return api.blobDelete(ids);
    try {
      const db = await idb();
      await new Promise((res) => { const tx = db.transaction('blobs', 'readwrite'); ids.forEach((id) => tx.objectStore('blobs').delete(id)); tx.oncomplete = res; tx.onerror = res; });
    } catch { ids.forEach((id) => memBlobs.delete(id)); }
    return { ok: true };
  },
};

// ── Import de fichiers (images & PDF) → pages JPEG ──────────────────────────
const MAX_SIDE = 2200;

function loadImage(src) {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('Image illisible')); im.src = src; });
}

function canvasToPage(canvas) {
  return { dataUrl: canvas.toDataURL('image/jpeg', 0.86), w: canvas.width, h: canvas.height };
}

async function imageFileToPage(file) {
  const url = URL.createObjectURL(file);
  try {
    const im = await loadImage(url);
    const k = Math.min(1, MAX_SIDE / Math.max(im.naturalWidth, im.naturalHeight));
    const cv = document.createElement('canvas');
    cv.width = Math.round(im.naturalWidth * k); cv.height = Math.round(im.naturalHeight * k);
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.drawImage(im, 0, 0, cv.width, cv.height);
    return canvasToPage(cv);
  } finally { URL.revokeObjectURL(url); }
}

async function pdfFileToPages(file, onProgress) {
  const pdfjs = window.pdfjsLib;
  if (!pdfjs) throw new Error('Lecteur PDF indisponible');
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf, isEvalSupported: false }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const vp0 = page.getViewport({ scale: 1 });
    // Côté long ≈ 2000 px : lisible en zoom, léger à stocker
    const scale = Math.max(1, Math.min(3, 2000 / Math.max(vp0.width, vp0.height)));
    const vp = page.getViewport({ scale });
    const cv = document.createElement('canvas');
    cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    pages.push({ ...canvasToPage(cv), name: `${file.name} — p.${i}` });
    onProgress?.(i, doc.numPages);
    page.cleanup();
  }
  doc.destroy();
  return pages;
}

export async function filesToPages(files, onProgress) {
  const out = [];
  const list = [...files].sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true }));
  for (let f = 0; f < list.length; f++) {
    const file = list[f];
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    if (isPdf) {
      const pages = await pdfFileToPages(file, (i, n) => onProgress?.(`${file.name} : page ${i}/${n}`));
      pages.forEach((p) => out.push({ ...p, file: file.name }));
    } else if (/^image\//.test(file.type) || /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name)) {
      onProgress?.(`${file.name}`);
      out.push({ ...(await imageFileToPage(file)), name: file.name, file: file.name });
    }
  }
  return out;
}

// Enregistre des pages importées et renvoie leurs références pour copy.pages
export async function storePages(pages) {
  const stored = [];
  for (const p of pages) {
    const id = uid('pg');
    await blobs.put(id, p.dataUrl);
    stored.push({ id, w: p.w, h: p.h, name: p.name });
  }
  return stored;
}

// Rotation d'une page de 90° (sens horaire) → nouvelle image
export async function rotateDataUrl(dataUrl, dir = 1) {
  const im = await loadImage(dataUrl);
  const cv = document.createElement('canvas');
  cv.width = im.naturalHeight; cv.height = im.naturalWidth;
  const ctx = cv.getContext('2d');
  ctx.translate(cv.width / 2, cv.height / 2);
  ctx.rotate((dir * Math.PI) / 2);
  ctx.drawImage(im, -im.naturalWidth / 2, -im.naturalHeight / 2);
  return canvasToPage(cv);
}

// ── Impression ──────────────────────────────────────────────────────────────
export async function printNow({ landscape, title, pdf }) {
  if (api) {
    if (pdf) return api.printToPdf({ landscape: !!landscape, defaultName: title });
    return api.print({ landscape: !!landscape });
  }
  // Crochet de test automatisé : permet de capturer le rendu d'impression
  if (window.__CP_HOLD_PRINT) await new Promise((r) => { window.__CP_RELEASE = r; });
  else window.print();
  return { ok: true };
}

// ── Sauvegardes ─────────────────────────────────────────────────────────────
export async function exportBackup(data, withImages) {
  if (api) return api.exportBackup({ data, withImages });
  const payload = { app: 'CorrigePro', version: 1, date: new Date().toISOString(), data, blobs: {} };
  if (withImages) {
    for (const ev of data.evals || []) {
      for (const c of Object.values(ev.copies || {})) {
        for (const p of c.pages || []) payload.blobs[p.id] = await blobs.getDataUrl(p.id);
      }
    }
  }
  const { downloadText } = await import('./utils.js');
  downloadText(`CorrigePro-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload));
  return { ok: true };
}

export async function restoreBlobs(map) {
  for (const [id, d] of Object.entries(map || {})) if (d) await blobs.put(id, d);
}

export function openDataFolder() { api?.openDataFolder(); }
