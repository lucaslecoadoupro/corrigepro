import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { loadData, saveData, blobs } from './platform.js';
import { deep, debounce, uid } from './utils.js';
import { DEFAULT_QUICK_COMMENTS, DEFAULT_STAMPS } from './templates.js';
import { fingerprints, stampChanges, mergeSync, ensureSync } from './sync.js';

export const DATA_VERSION = 1;

export function emptyData() {
  return {
    version: DATA_VERSION,
    profile: { prenom: '', nom: '', etablissement: '', matiere: '' },
    classes: [],
    grids: [],
    evals: [],
    settings: {
      theme: 'light',
      nameOrder: 'nom',
      quickComments: DEFAULT_QUICK_COMMENTS,
      stamps: DEFAULT_STAMPS,
      printLayout: 'side',
      onboarded: false,
    },
  };
}

function migrate(d) {
  const base = emptyData();
  if (!d || typeof d !== 'object') return base;
  return {
    ...base, ...d,
    profile: { ...base.profile, ...(d.profile || {}) },
    settings: { ...base.settings, ...(d.settings || {}) },
    classes: d.classes || [], grids: d.grids || [], evals: d.evals || [],
  };
}

const StoreCtx = createContext(null);
const ToastCtx = createContext(null);

export function StoreProvider({ children }) {
  const [data, setData] = useState(null);
  const [saveState, setSaveState] = useState('saved');
  const dataRef = useRef(null);
  const fpRef = useRef(new Map()); // empreintes du dernier état enregistré (synchro)

  const persist = useMemo(() => debounce(async (d) => {
    // Date les éléments modifiés depuis le dernier enregistrement (le champ sync n'est pas affiché)
    fpRef.current = stampChanges(fpRef.current, d);
    const r = await saveData(d);
    setSaveState(r?.ok === false ? 'error' : 'saved');
  }, 450), []);

  useEffect(() => {
    loadData().then((d) => { const m = migrate(d); ensureSync(m); fpRef.current = fingerprints(m); dataRef.current = m; setData(m); });
  }, []);

  useEffect(() => {
    const flush = () => dataRef.current && persist.flush(dataRef.current);
    // Mobile : l'appli peut être fermée sans « beforeunload » ; on enregistre dès qu'elle passe en arrière-plan
    const hide = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', hide);
    return () => { window.removeEventListener('beforeunload', flush); document.removeEventListener('visibilitychange', hide); };
  }, [persist]);

  // mutate(fn) : fn reçoit un brouillon (copie profonde) à modifier directement
  const mutate = useCallback((fn) => {
    setData((d) => {
      const n = deep(d);
      fn(n);
      dataRef.current = n;
      setSaveState('saving');
      persist(n);
      return n;
    });
  }, [persist]);

  // Fusion d'un fichier de synchro reçu. Les éléments reçus gardent leur date d'origine.
  const applySync = useCallback((file) => {
    const n = deep(dataRef.current);
    stampChanges(fpRef.current, n); // dater d'abord les modifications locales pas encore enregistrées
    const sum = mergeSync(n, file);
    fpRef.current = fingerprints(n);
    dataRef.current = n;
    setData(n);
    persist.flush(n);
    return sum;
  }, [persist]);

  const replaceAll = useCallback((d) => {
    const m = migrate(d);
    // Restauration / remise à zéro : on repart sans historique de synchro, pour ne pas
    // propager des suppressions en masse vers les autres appareils.
    const device = dataRef.current?.sync?.device;
    m.sync = device ? { device } : undefined;
    ensureSync(m);
    fpRef.current = fingerprints(m);
    dataRef.current = m;
    setData(m);
    persist.flush(m);
  }, [persist]);

  const value = useMemo(() => ({ data, mutate, replaceAll, applySync, saveState }), [data, mutate, replaceAll, applySync, saveState]);
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export const useStore = () => useContext(StoreCtx);

// ── Sélecteurs pratiques ────────────────────────────────────────────────────
export const findClass = (d, id) => d.classes.find((c) => c.id === id);
export const findGrid = (d, id) => d.grids.find((g) => g.id === id);
export const findEval = (d, id) => d.evals.find((e) => e.id === id);

export function ensureCopy(ev, studentId) {
  ev.copies = ev.copies || {};
  if (!ev.copies[studentId]) ev.copies[studentId] = { pages: [], ann: {}, scores: {}, levels: {}, bonus: 0, comment: '', status: 'todo', absent: false };
  return ev.copies[studentId];
}

// Supprime les images qui ne sont plus référencées par aucune copie
export async function collectGarbage(data, removedIds) {
  const used = new Set();
  data.evals.forEach((e) => Object.values(e.copies || {}).forEach((c) => (c.pages || []).forEach((p) => used.add(p.id))));
  const dead = removedIds.filter((id) => !used.has(id));
  if (dead.length) await blobs.remove(dead);
}

// ── Toasts ──────────────────────────────────────────────────────────────────
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((msg, type = 'success', ms = 3200) => {
    const id = uid('t');
    setToasts((t) => [...t, { id, msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ms);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-wrap">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              {t.type === 'error' ? <path d="M12 8v5M12 16.5v.01M12 3 2 20h20z" /> : t.type === 'info' ? <path d="M12 11v5M12 8v.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z" /> : <path d="M5 12.5l4.5 4.5L19 7.5" />}
            </svg>
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);
