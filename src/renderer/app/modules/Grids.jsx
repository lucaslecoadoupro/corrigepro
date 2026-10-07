import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useStore, useToast, findGrid } from '../store.jsx';
import { useNav } from '../nav.jsx';
import { Icon } from '../icons.jsx';
import { PageHeader, Empty, Modal, Field, Menu, useConfirm, Seg, Switch, ScaledSheet } from '../ui.jsx';
import { GridSheet, buildGridSheets } from '../sheets.jsx';
import { PrintDialog } from '../print.jsx';
import { GRID_TYPES, SCALES, ROUNDINGS, SOCLE_LEVELS, newGrid } from '../templates.js';
import { uid, deep, gridMax, fmt, fmtDate, sortStudents, studentName, todayISO, debounce } from '../utils.js';

const TYPE_COLORS = { ee: '#3b5bdb', eo: '#7c3aed', ce: '#0891b2', co: '#0f9b6e', ctrl: '#d97706', tf: '#db2777', comp: '#4d7c0f', custom: '#475569' };

export function teacherLine(data) {
  const p = data.profile;
  return [[p.prenom, p.nom].filter(Boolean).join(' '), p.matiere, p.etablissement].filter(Boolean).join(' · ');
}

// ═══════════════════════════════════════════════════════════════════════════
// Bibliothèque de grilles
// ═══════════════════════════════════════════════════════════════════════════
export function GridsPage() {
  const { data, mutate } = useStore();
  const nav = useNav();
  const toast = useToast();
  const confirm = useConfirm();
  const [creating, setCreating] = useState(false);
  const [printing, setPrinting] = useState(null);

  const duplicate = (g) => {
    const n = { ...deep(g), id: uid('grid'), title: `${g.title} (copie)`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    n.criteria = n.criteria.map((c) => ({ ...c, id: uid(c.kind === 'section' ? 'sec' : 'cr') }));
    mutate((d) => { d.grids.push(n); });
    toast('Grille dupliquée');
  };
  const remove = async (g) => {
    if (!(await confirm({ title: `Supprimer « ${g.title} » ?`, danger: true, confirmLabel: 'Supprimer', message: 'Les évaluations déjà créées avec cette grille ne sont pas affectées (elles en conservent une copie).' }))) return;
    mutate((d) => { d.grids = d.grids.filter((x) => x.id !== g.id); });
  };

  return (
    <>
      <PageHeader badge="Évaluation" badgeIcon="grid" title="Grilles d'évaluation"
        sub="Concevez vos grilles une fois, réutilisez-les pour chaque classe et imprimez-les en économisant le papier."
        actions={<button className="btn btn-white" onClick={() => setCreating(true)}><Icon name="plus" />Nouvelle grille</button>} />
      <div className="page-content">
        {!data.grids.length ? (
          <div className="card"><Empty icon="grid" title="Créez votre première grille" sub="Partez d'un modèle (expression écrite, compréhension orale, compétences du socle…) puis adaptez critères, barème et mise en page.">
            <button className="btn btn-primary" onClick={() => setCreating(true)}><Icon name="plus" />Nouvelle grille</button>
          </Empty></div>
        ) : (
          <div className="grid-auto">
            {data.grids.map((g) => {
              const used = data.evals.filter((e) => e.gridId === g.id).length;
              return (
                <div key={g.id} className="tile" onClick={() => nav({ page: 'grid', id: g.id })}>
                  <div className="tile-top">
                    <div className="tile-icon" style={{ background: TYPE_COLORS[g.typeId] || '#475569' }}><Icon name={g.mode === 'niveaux' ? 'target' : 'grid'} /></div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="tile-title">{g.title}</div>
                      <div className="tile-sub">{g.type}</div>
                    </div>
                  </div>
                  <div className="tile-meta">
                    <span className="pill accent">/{g.scale}</span>
                    <span className="pill">{g.criteria.filter((c) => c.kind !== 'section').length} critères</span>
                    <span className="pill">{g.mode === 'niveaux' ? 'Niveaux de maîtrise' : 'Points'}</span>
                    <span className="pill"><Icon name="file" />{g.orientation === 'landscape' ? 'Paysage' : 'Portrait'}{Number(g.perSheet) === 2 ? ' · 2/page' : ''}</span>
                    {used > 0 && <span className="pill success">{used} évaluation{used > 1 ? 's' : ''}</span>}
                  </div>
                  <div className="tile-menu">
                    <Menu trigger={({ toggle }) => <button className="btn btn-quiet btn-icon btn-sm" onClick={toggle}><Icon name="more" /></button>}
                      items={[
                        { icon: 'printer', label: 'Imprimer…', onClick: () => setPrinting(g) },
                        { icon: 'copy', label: 'Dupliquer', onClick: () => duplicate(g) },
                        { icon: 'clipboard', label: 'Créer une évaluation', onClick: () => nav({ page: 'evals', newWithGrid: g.id }) },
                        '-',
                        { icon: 'trash', label: 'Supprimer', danger: true, onClick: () => remove(g) },
                      ]} />
                  </div>
                </div>
              );
            })}
            <button className="tile add" onClick={() => setCreating(true)}><Icon name="plus" /><span style={{ fontWeight: 600, fontSize: '.8rem' }}>Nouvelle grille</span></button>
          </div>
        )}
      </div>
      {creating && <NewGridModal onClose={() => setCreating(false)} onCreated={(id) => nav({ page: 'grid', id })} />}
      {printing && <GridPrintDialog grid={printing} onClose={() => setPrinting(null)} />}
    </>
  );
}

export function NewGridModal({ onClose, onCreated }) {
  const { mutate } = useStore();
  const [type, setType] = useState('ee');
  const create = () => {
    const g = newGrid(type);
    mutate((d) => { d.grids.push(g); });
    onCreated?.(g.id);
    onClose();
  };
  return (
    <Modal title="Nouvelle grille" sub="Choisissez un type d'évaluation pour partir d'un modèle" icon="grid" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Annuler</button><button className="btn btn-primary" onClick={create}><Icon name="arrowRight" />Créer et personnaliser</button></>}>
      <div className="type-grid">
        {GRID_TYPES.map((t) => (
          <button key={t.id} className={`type-opt ${type === t.id ? 'on' : ''}`} onClick={() => setType(t.id)} onDoubleClick={() => { setType(t.id); setTimeout(create, 0); }}>
            <b>{t.label}</b><span>{t.hint}</span>
          </button>
        ))}
      </div>
      <div className="field-hint mt-2">Tout reste modifiable : critères, barème, type de notation, mise en page.</div>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Éditeur de grille
// ═══════════════════════════════════════════════════════════════════════════
export function GridEditorPage({ id }) {
  const { data, mutate } = useStore();
  const nav = useNav();
  const toast = useToast();
  const confirm = useConfirm();
  const stored = findGrid(data, id);
  const [g, setG] = useState(() => (stored ? deep(stored) : null));
  const [printing, setPrinting] = useState(false);
  const [customScale, setCustomScale] = useState(stored ? !SCALES.includes(Number(stored.scale)) : false);

  const persist = useMemo(() => debounce((ng) => mutate((d) => {
    const i = d.grids.findIndex((x) => x.id === ng.id);
    if (i >= 0) d.grids[i] = { ...ng, updatedAt: new Date().toISOString() };
  }), 350), [mutate]);
  const gRef = useRef(g);
  const dirty = useRef(false);
  useEffect(() => () => { if (dirty.current && gRef.current) persist.flush(gRef.current); }, [persist]);

  if (!g) return <Empty icon="grid" title="Grille introuvable" />;

  const set = (patch) => setG((old) => {
    const n = { ...old, ...(typeof patch === 'function' ? patch(old) : patch) };
    gRef.current = n; dirty.current = true;
    persist(n);
    return n;
  });
  const setCrit = (cid, patch) => set((o) => ({ criteria: o.criteria.map((c) => (c.id === cid ? { ...c, ...patch } : c)) }));
  const move = (i, dir) => set((o) => { const a = [...o.criteria]; const j = i + dir; if (j < 0 || j >= a.length) return {}; [a[i], a[j]] = [a[j], a[i]]; return { criteria: a }; });
  const delCrit = (cid) => set((o) => ({ criteria: o.criteria.filter((c) => c.id !== cid) }));
  const addCrit = (kind) => set((o) => ({ criteria: [...o.criteria, kind === 'section' ? { id: uid('sec'), kind: 'section', label: 'Nouvelle partie' } : { id: uid('cr'), kind: 'crit', label: `Critère ${o.criteria.filter((c) => c.kind !== 'section').length + 1}`, desc: '', max: 2 }] }));

  const max = gridMax(g);
  const ok = Math.abs(max - g.scale) < 0.001;
  const fitToScale = () => set((o) => {
    const m = gridMax(o); if (!m) return {};
    const k = o.scale / m;
    const crits = o.criteria.map((c) => (c.kind === 'section' ? c : { ...c, max: Math.round(c.max * k * 2) / 2 }));
    // corrige l'arrondi sur le dernier critère
    const diff = o.scale - gridMax({ criteria: crits });
    const last = [...crits].reverse().find((c) => c.kind !== 'section');
    if (last && Math.abs(diff) > 0.001) last.max = Math.max(0.5, Math.round((last.max + diff) * 4) / 4);
    return { criteria: crits };
  });

  const remove = async () => {
    if (!(await confirm({ title: `Supprimer « ${g.title} » ?`, danger: true, confirmLabel: 'Supprimer', message: 'Les évaluations déjà créées avec cette grille conservent leur propre copie.' }))) return;
    mutate((d) => { d.grids = d.grids.filter((x) => x.id !== g.id); });
    nav({ page: 'grids' });
  };

  const typeObj = GRID_TYPES.find((t) => t.id === g.typeId);

  return (
    <>
      <PageHeader onBack={() => { persist.flush(g); nav({ page: 'grids' }); }} backLabel="Toutes les grilles" badge={g.type || 'Grille'} badgeIcon="grid" title={g.title || 'Sans titre'}
        sub={`Barème sur ${g.scale} · ${g.criteria.filter((c) => c.kind !== 'section').length} critères · enregistrement automatique`}
        actions={<>
          <button className="btn btn-ghost" onClick={remove}><Icon name="trash" />Supprimer</button>
          <button className="btn btn-ghost" onClick={() => { persist.flush(g); nav({ page: 'evals', newWithGrid: g.id }); }}><Icon name="clipboard" />Créer une évaluation</button>
          <button className="btn btn-white" onClick={() => { persist.flush(g); setPrinting(true); }}><Icon name="printer" />Imprimer</button>
        </>} />
      <div className="page-content">
        <div className="editor">
          <div className="stack">
            <div className="card">
              <div className="card-hd"><div className="card-title"><Icon name="edit" />Informations</div></div>
              <div className="card-body stack" style={{ gap: '.8rem' }}>
                <Field label="Titre"><input className="input" value={g.title} onChange={(e) => set({ title: e.target.value })} /></Field>
                <div className="row" style={{ gap: '.8rem' }}>
                  <Field label="Type d'évaluation" style={{ flex: 1 }}>
                    <input className="input" list="grid-types" value={g.type} onChange={(e) => set({ type: e.target.value, typeId: GRID_TYPES.find((t) => t.label === e.target.value)?.id || g.typeId })} />
                    <datalist id="grid-types">{GRID_TYPES.filter((t) => t.id !== 'custom').map((t) => <option key={t.id} value={t.label} />)}</datalist>
                  </Field>
                  <Field label="Sous-titre (facultatif)" style={{ flex: 1 }}><input className="input" value={g.subtitle} placeholder="ex. Séquence 2 — El mundo hispano" onChange={(e) => set({ subtitle: e.target.value })} /></Field>
                </div>
                <Field label="Consigne (facultatif)"><textarea className="textarea" style={{ minHeight: 54 }} value={g.instructions} placeholder="Rappel de la consigne, imprimé en haut de la grille" onChange={(e) => set({ instructions: e.target.value })} /></Field>
              </div>
            </div>

            <div className="card">
              <div className="card-hd"><div className="card-title"><Icon name="target" />Notation</div></div>
              <div className="card-body stack" style={{ gap: '.85rem' }}>
                <Field label="Noté sur">
                  <div className="row-wrap">
                    <Seg value={customScale ? 'x' : Number(g.scale)} onChange={(v) => { if (v === 'x') { setCustomScale(true); } else { setCustomScale(false); set({ scale: v }); } }}
                      options={[...SCALES.map((s) => ({ value: s, label: `/${s}` })), { value: 'x', label: 'Autre' }]} />
                    {customScale && <input className="input input-sm input-num" type="number" min="1" value={g.scale} onChange={(e) => set({ scale: Math.max(1, Number(e.target.value) || 1) })} />}
                  </div>
                </Field>
                <div className="row" style={{ gap: '.8rem', alignItems: 'flex-start' }}>
                  <Field label="Mode de notation" style={{ flex: 1.3 }}>
                    <Seg block value={g.mode} onChange={(v) => set({ mode: v, levels: g.levels?.length ? g.levels : SOCLE_LEVELS.map((l) => ({ ...l })) })}
                      options={[{ value: 'points', label: 'Points par critère', icon: 'list' }, { value: 'niveaux', label: 'Niveaux de maîtrise', icon: 'target' }]} />
                  </Field>
                  <Field label="Arrondi de la note" style={{ flex: 1 }}>
                    <select className="select" value={g.rounding} onChange={(e) => set({ rounding: e.target.value })}>{ROUNDINGS.map((r) => <option key={r.v} value={r.v}>{r.label}</option>)}</select>
                  </Field>
                </div>
                {g.mode === 'niveaux' && (
                  <div>
                    <div className="field-label" style={{ marginBottom: '.35rem' }}>Niveaux (part des points du critère)</div>
                    <div className="stack" style={{ gap: '.35rem' }}>
                      {g.levels.map((l, i) => (
                        <div key={i} className="row">
                          <span style={{ width: 10, height: 10, borderRadius: 3, background: l.color, flexShrink: 0 }} />
                          <input className="input input-sm" style={{ width: 70, fontWeight: 700 }} value={l.short} onChange={(e) => set((o) => ({ levels: o.levels.map((x, k) => (k === i ? { ...x, short: e.target.value } : x)) }))} />
                          <input className="input input-sm" value={l.label} onChange={(e) => set((o) => ({ levels: o.levels.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)) }))} />
                          <input className="input input-sm input-num" type="number" min="0" max="100" value={Math.round(l.ratio * 100)} onChange={(e) => set((o) => ({ levels: o.levels.map((x, k) => (k === i ? { ...x, ratio: Math.max(0, Math.min(100, Number(e.target.value) || 0)) / 100 } : x)) }))} />
                          <span className="faint" style={{ fontSize: '.72rem' }}>%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="card">
              <div className="card-hd">
                <div className="card-title"><Icon name="list" />Critères</div>
                <div className="row">
                  <button className="btn btn-sm" onClick={() => addCrit('section')}><Icon name="layers" />Partie</button>
                  <button className="btn btn-sm btn-primary" onClick={() => addCrit('crit')}><Icon name="plus" />Critère</button>
                </div>
              </div>
              <div className="card-body">
                {g.criteria.map((c, i) => (
                  <div key={c.id} className={`crit-edit ${c.kind === 'section' ? 'section' : ''}`}>
                    <div className="crit-handle">
                      <button onClick={() => move(i, -1)} title="Monter"><Icon name="chevronUp" /></button>
                      <button onClick={() => move(i, 1)} title="Descendre"><Icon name="chevronDown" /></button>
                    </div>
                    {c.kind === 'section' ? (
                      <>
                        <input className="input input-sm" style={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em', fontSize: '.72rem', gridColumn: 'span 2' }} value={c.label} onChange={(e) => setCrit(c.id, { label: e.target.value })} />
                      </>
                    ) : (
                      <>
                        <div className="stack" style={{ gap: '.3rem' }}>
                          <input className="input input-sm" style={{ fontWeight: 700 }} value={c.label} onChange={(e) => setCrit(c.id, { label: e.target.value })} placeholder="Intitulé du critère" />
                          <input className="input input-sm" style={{ fontSize: '.72rem', color: 'var(--text2)' }} value={c.desc || ''} onChange={(e) => setCrit(c.id, { desc: e.target.value })} placeholder="Description / indicateurs (facultatif)" />
                        </div>
                        <div className="row" style={{ gap: '.25rem' }}>
                          <input className="input input-sm input-num" style={{ width: 56 }} type="number" min="0" step="0.5" value={c.max} onChange={(e) => setCrit(c.id, { max: Math.max(0, Number(e.target.value) || 0) })} title="Points" />
                          <span className="faint" style={{ fontSize: '.68rem' }}>pts</span>
                        </div>
                      </>
                    )}
                    <button className="btn btn-quiet btn-icon btn-sm btn-danger-soft" onClick={() => delCrit(c.id)} title="Supprimer"><Icon name="trash" /></button>
                  </div>
                ))}
                {!g.criteria.length && <div className="faint" style={{ textAlign: 'center', padding: '1rem', fontSize: '.78rem' }}>Ajoutez un premier critère.</div>}
                <div className={`sum-bar ${ok ? 'ok' : 'warn'}`}>
                  <Icon name={ok ? 'check' : 'alert'} />
                  <span style={{ flex: 1 }}>{ok ? <>Total des critères : <b>{fmt(max)}</b> points = barème /{g.scale}</> : <>Total des critères : <b>{fmt(max)}</b> points, barème /{g.scale}. La note sera automatiquement ramenée sur {g.scale}.</>}</span>
                  {!ok && max > 0 && <button className="btn btn-sm" onClick={fitToScale}><Icon name="wand" />Ajuster à {g.scale}</button>}
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-hd"><div className="card-title"><Icon name="printer" />Mise en page</div></div>
              <div className="card-body stack" style={{ gap: '.9rem' }}>
                <div className="row" style={{ gap: '.6rem' }}>
                  {[
                    { o: 'portrait', p: 1, label: 'Portrait', mini: { w: 30, h: 42, dir: 'column', n: 1 } },
                    { o: 'portrait', p: 2, label: 'Portrait · 2 par page', mini: { w: 30, h: 42, dir: 'column', n: 2 } },
                    { o: 'landscape', p: 1, label: 'Paysage', mini: { w: 42, h: 30, dir: 'row', n: 1 } },
                    { o: 'landscape', p: 2, label: 'Paysage · 2 par page', mini: { w: 42, h: 30, dir: 'row', n: 2 } },
                  ].map((L) => (
                    <button key={L.label} className={`layout-opt ${g.orientation === L.o && Number(g.perSheet) === L.p ? 'on' : ''}`} onClick={() => set({ orientation: L.o, perSheet: L.p })}>
                      <div className="mini" style={{ width: L.mini.w, height: L.mini.h, flexDirection: L.mini.dir }}>{Array.from({ length: L.mini.n }, (_, i) => <i key={i} />)}</div>
                      {L.label}
                    </button>
                  ))}
                </div>
                {Number(g.perSheet) === 2 && <div className="field-hint"><Icon name="scissors" size={12} style={{ verticalAlign: '-2px' }} /> Deux grilles par feuille A4, avec un trait de coupe : moitié moins de photocopies.</div>}
                <div className="grid-2" style={{ gap: '.7rem' }}>
                  <Switch checked={g.fields?.nom} onChange={(v) => set({ fields: { ...g.fields, nom: v } })} label="Champ « Nom, prénom »" />
                  <Switch checked={g.fields?.classe} onChange={(v) => set({ fields: { ...g.fields, classe: v } })} label="Champ « Classe »" />
                  <Switch checked={g.fields?.date} onChange={(v) => set({ fields: { ...g.fields, date: v } })} label="Champ « Date »" />
                  <Switch checked={g.showDesc} onChange={(v) => set({ showDesc: v })} label="Descriptions des critères" />
                  {g.mode === 'niveaux' && <Switch checked={g.showLegend} onChange={(v) => set({ showLegend: v })} label="Légende des niveaux" />}
                  <Switch checked={g.showSignature} onChange={(v) => set({ showSignature: v })} label="Zone de signatures" />
                </div>
                <Field label={`Lignes pour l'appréciation : ${g.commentLines}`}>
                  <input type="range" min="0" max="8" value={g.commentLines} onChange={(e) => set({ commentLines: Number(e.target.value) })} />
                </Field>
              </div>
            </div>
          </div>

          <div className="editor-preview">
            <PreviewPane grid={g} teacher={teacherLine(data)} />
            {typeObj && <div className="field-hint mt-1" style={{ textAlign: 'center' }}>Aperçu à l'échelle — le contenu s'adapte automatiquement à la taille de la feuille.</div>}
          </div>
        </div>
      </div>
      {printing && <GridPrintDialog grid={g} onClose={() => setPrinting(false)} />}
    </>
  );
}

function PreviewPane({ grid, teacher }) {
  const ref = useRef(null);
  const [w, setW] = useState(460);
  useLayoutEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width - 40));
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  const landscape = grid.orientation === 'landscape';
  const width = Math.min(w, landscape ? 640 : 470);
  const slots = Number(grid.perSheet) === 2 ? [null, null] : [null];
  return (
    <div className="preview-desk" ref={ref}>
      <ScaledSheet width={width} orientation={grid.orientation}>
        <GridSheet grid={grid} slots={slots} teacher={teacher} />
      </ScaledSheet>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Impression des grilles vierges ou pré-remplies
// ═══════════════════════════════════════════════════════════════════════════
export function GridPrintDialog({ grid, onClose, defaultClassId }) {
  const { data } = useStore();
  const [mode, setMode] = useState(defaultClassId ? 'class' : data.classes.length ? 'class' : 'blank');
  const [classId, setClassId] = useState(defaultClassId || data.classes[0]?.id || '');
  const [count, setCount] = useState(30);
  const [date, setDate] = useState('');
  const [orientation, setOrientation] = useState(grid.orientation);
  const [perSheet, setPerSheet] = useState(Number(grid.perSheet) || 1);
  const g = { ...grid, orientation, perSheet };
  const cls = data.classes.find((c) => c.id === classId);

  const fills = useMemo(() => {
    if (mode === 'blank') return Array.from({ length: Math.max(1, count) }, () => null);
    if (!cls) return [];
    return sortStudents(cls.students).map((s) => ({ student: studentName(s, data.settings.nameOrder), className: cls.name, date: date ? fmtDate(date) : '' }));
  }, [mode, count, cls, date, data.settings.nameOrder]);

  const sheets = useMemo(() => buildGridSheets(g, fills, teacherLine(data)), [g.orientation, g.perSheet, grid, fills]); // eslint-disable-line

  return (
    <PrintDialog title={`Imprimer « ${grid.title} »`} sub={perSheet === 2 ? `${fills.length} grilles sur ${sheets.length} feuilles` : `${sheets.length} feuille(s)`}
      orientation={orientation} sheets={sheets} onClose={onClose} fileName={`Grille - ${grid.title}`}
      options={<>
        <Field label="Contenu">
          <Seg block value={mode} onChange={setMode} options={[{ value: 'class', label: 'Noms d\'une classe', icon: 'users' }, { value: 'blank', label: 'Vierges', icon: 'file' }]} />
        </Field>
        {mode === 'class' ? (
          <>
            {data.classes.length ? (
              <Field label="Classe"><select className="select" value={classId} onChange={(e) => setClassId(e.target.value)}>{data.classes.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.students.length})</option>)}</select></Field>
            ) : <div className="field-hint">Aucune classe : créez-en une pour pré-remplir les noms.</div>}
            <Field label="Date à imprimer (facultatif)"><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          </>
        ) : (
          <Field label="Nombre de grilles"><input type="number" className="input" min="1" max="200" value={count} onChange={(e) => setCount(Math.max(1, Math.min(200, Number(e.target.value) || 1)))} /></Field>
        )}
        <Field label="Orientation"><Seg block value={orientation} onChange={setOrientation} options={[{ value: 'portrait', label: 'Portrait' }, { value: 'landscape', label: 'Paysage' }]} /></Field>
        <Field label="Grilles par feuille"><Seg block value={perSheet} onChange={setPerSheet} options={[{ value: 1, label: '1 par feuille' }, { value: 2, label: '2 par feuille' }]} /></Field>
        {perSheet === 2 && <div className="sum-bar ok"><Icon name="scissors" /><span>{fills.length} grilles sur <b>{sheets.length}</b> feuilles au lieu de {fills.length}.</span></div>}
      </>} />
  );
}

export { todayISO };
