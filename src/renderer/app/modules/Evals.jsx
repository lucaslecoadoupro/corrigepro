import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, useToast, findClass, findEval, findGrid, ensureCopy, collectGarbage } from '../store.jsx';
import { useNav } from '../nav.jsx';
import { Icon } from '../icons.jsx';
import { PageHeader, Empty, Modal, Field, Menu, useConfirm, Seg, useBlobUrl } from '../ui.jsx';
import { buildGridSheets, SideBySideSheets, SequentialSheets } from '../sheets.jsx';
import { PrintDialog } from '../print.jsx';
import { NewGridModal, teacherLine } from './Grids.jsx';
import { filesToPages, blobs } from '../platform.js';
import { uid, deep, todayISO, fmt, fmtDate, sortStudents, studentName, initials, avatarColor, copyNote, computeNote, evalStats, to20, noteClass } from '../utils.js';

const STATUS = {
  todo: { label: 'À corriger', color: 'var(--text3)' },
  progress: { label: 'En cours', color: 'var(--warning)' },
  done: { label: 'Corrigée', color: 'var(--success)' },
  absent: { label: 'Absent', color: 'var(--text3)' },
};
export const copyStatus = (c) => (c?.absent ? 'absent' : c?.status || 'todo');

// ═══════════════════════════════════════════════════════════════════════════
// Liste des évaluations
// ═══════════════════════════════════════════════════════════════════════════
export function EvalsPage({ newFor, newWithGrid }) {
  const { data } = useStore();
  const nav = useNav();
  const [creating, setCreating] = useState(newFor || newWithGrid ? { classId: newFor, gridId: newWithGrid } : null);
  const [filter, setFilter] = useState('all');
  useEffect(() => { if (newFor || newWithGrid) setCreating({ classId: newFor, gridId: newWithGrid }); }, [newFor, newWithGrid]);

  const evs = [...data.evals].sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
  const shown = evs.filter((e) => filter === 'all' || e.classId === filter);
  const toCorrect = data.evals.reduce((s, e) => { const c = findClass(data, e.classId); return s + (c ? evalStats(e, c.students).todo : 0); }, 0);

  return (
    <>
      <PageHeader badge="Évaluation" badgeIcon="clipboard" title="Évaluations & copies"
        sub={`${data.evals.length} évaluation(s) · ${toCorrect} copie(s) restant à corriger`}
        actions={<button className="btn btn-white" onClick={() => setCreating({})}><Icon name="plus" />Nouvelle évaluation</button>} />
      <div className="page-content">
        {data.classes.length > 1 && data.evals.length > 0 && (
          <div className="row-wrap" style={{ marginBottom: '1rem' }}>
            <Seg value={filter} onChange={setFilter} options={[{ value: 'all', label: 'Toutes' }, ...data.classes.map((c) => ({ value: c.id, label: c.name }))]} />
          </div>
        )}
        {!data.evals.length ? (
          <div className="card"><Empty icon="clipboard" title="Aucune évaluation" sub="Une évaluation associe une classe à une grille. Vous pourrez ensuite importer les copies scannées (PDF, JPG, PNG) et les corriger à l'écran.">
            <button className="btn btn-primary" onClick={() => setCreating({})}><Icon name="plus" />Nouvelle évaluation</button>
          </Empty></div>
        ) : (
          <div className="card"><div className="card-body flush">
            {shown.map((e) => <EvalListItem key={e.id} ev={e} onClick={() => nav({ page: 'eval', id: e.id })} />)}
          </div></div>
        )}
      </div>
      {creating && <EvalModal initial={creating} onClose={() => { setCreating(null); if (newFor || newWithGrid) nav({ page: 'evals' }); }} onCreated={(id) => nav({ page: 'eval', id })} />}
    </>
  );
}

export function EvalListItem({ ev, onClick, compact }) {
  const { data } = useStore();
  const cls = findClass(data, ev.classId);
  const students = cls?.students || [];
  const st = evalStats(ev, students);
  const total = students.length - st.absent;
  const pct = total ? (st.corrected / total) * 100 : 0;
  return (
    <div className="list-item" onClick={onClick}>
      <div className="li-icon" style={{ background: cls?.color || '#475569' }}><Icon name="clipboard" /></div>
      <div className="li-main">
        <div className="li-title">{ev.title}</div>
        <div className="li-sub">{cls?.name || 'Classe supprimée'} · {fmtDate(ev.date)} · {ev.grid.type} · /{ev.grid.scale}</div>
      </div>
      {!compact && <div style={{ width: 160 }}>
        <div className="row" style={{ justifyContent: 'space-between', fontSize: '.68rem', color: 'var(--text2)', marginBottom: 3 }}><span>{st.corrected}/{total} corrigées</span><span>{Math.round(pct)} %</span></div>
        <div className={`progress ${pct >= 100 ? 'success' : ''}`}><div style={{ width: `${pct}%` }} /></div>
      </div>}
      <div style={{ width: 86, textAlign: 'right' }}>
        {st.mean != null ? <span className={`note-chip ${noteClass(to20(st.mean, ev.grid.scale))}`}>{fmt(st.mean, 1)}</span> : <span className="note-chip n-x">–</span>}
      </div>
      <Icon name="chevronRight" size={16} style={{ color: 'var(--text3)' }} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Création / modification d'une évaluation
// ═══════════════════════════════════════════════════════════════════════════
export function EvalModal({ initial = {}, ev, onClose, onCreated }) {
  const { data, mutate } = useStore();
  const toast = useToast();
  const [title, setTitle] = useState(ev?.title || '');
  const [classId, setClassId] = useState(ev?.classId || initial.classId || data.classes[0]?.id || '');
  const [gridId, setGridId] = useState(ev?.gridId || initial.gridId || data.grids[0]?.id || '');
  const [date, setDate] = useState(ev?.date || todayISO());
  const [coef, setCoef] = useState(ev?.coef ?? 1);
  const [newGrid, setNewGrid] = useState(false);
  const grid = findGrid(data, gridId);

  useEffect(() => { if (!ev && !title && grid) setTitle(grid.title); }, [gridId]); // eslint-disable-line

  const save = () => {
    if (ev) {
      mutate((d) => { const e = findEval(d, ev.id); Object.assign(e, { title: title.trim() || e.title, date, coef: Number(coef) || 1 }); });
      toast('Évaluation mise à jour');
      onClose();
      return;
    }
    const id = uid('ev');
    mutate((d) => {
      d.evals.push({ id, title: title.trim() || grid.title, classId, gridId, grid: deep(grid), date, coef: Number(coef) || 1, copies: {}, createdAt: new Date().toISOString() });
    });
    toast('Évaluation créée');
    onClose();
    onCreated?.(id);
  };

  if (!ev && (!data.classes.length || !data.grids.length)) {
    return (
      <Modal title="Nouvelle évaluation" icon="clipboard" onClose={onClose} footer={<button className="btn" onClick={onClose}>Fermer</button>}>
        <Empty icon="info" title="Il manque un élément" sub={!data.classes.length ? 'Créez d\'abord une classe (menu Classes & élèves).' : 'Créez d\'abord une grille d\'évaluation.'}>
          {!data.grids.length && data.classes.length > 0 && <button className="btn btn-primary" onClick={() => setNewGrid(true)}><Icon name="plus" />Créer une grille</button>}
        </Empty>
        {newGrid && <NewGridModal onClose={() => setNewGrid(false)} onCreated={(id) => setGridId(id)} />}
      </Modal>
    );
  }

  return (
    <Modal title={ev ? 'Modifier l\'évaluation' : 'Nouvelle évaluation'} sub={ev ? ev.title : 'Associez une classe et une grille'} icon="clipboard" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Annuler</button><button className="btn btn-primary" onClick={save} disabled={!ev && (!classId || !grid)}><Icon name="check" />{ev ? 'Enregistrer' : 'Créer'}</button></>}>
      <div className="stack" style={{ gap: '.85rem' }}>
        {!ev && (
          <div className="row" style={{ gap: '.8rem', alignItems: 'flex-end' }}>
            <Field label="Classe" style={{ flex: 1 }}>
              <select className="select" value={classId} onChange={(e) => setClassId(e.target.value)}>{data.classes.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.students.length} élèves</option>)}</select>
            </Field>
            <Field label="Grille d'évaluation" style={{ flex: 1.3 }}>
              <div className="row">
                <select className="select" value={gridId} onChange={(e) => setGridId(e.target.value)}>{data.grids.map((g) => <option key={g.id} value={g.id}>{g.title} (/{g.scale})</option>)}</select>
                <button className="btn btn-icon" title="Nouvelle grille" onClick={() => setNewGrid(true)}><Icon name="plus" /></button>
              </div>
            </Field>
          </div>
        )}
        <Field label="Intitulé"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ex. Expression écrite — Mi ciudad ideal" autoFocus /></Field>
        <div className="row" style={{ gap: '.8rem' }}>
          <Field label="Date" style={{ flex: 1 }}><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Coefficient" style={{ flex: 1 }}><input type="number" className="input" min="0" step="0.5" value={coef} onChange={(e) => setCoef(e.target.value)} /></Field>
        </div>
        {!ev && grid && (
          <div className="sum-bar ok" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
            <Icon name="info" /><span>La grille « {grid.title} » est copiée dans l'évaluation : la modifier ensuite n'altérera pas les notes déjà saisies.</span>
          </div>
        )}
      </div>
      {newGrid && <NewGridModal onClose={() => setNewGrid(false)} onCreated={(id) => setGridId(id)} />}
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Page d'une évaluation : élèves, copies, statut, notes
// ═══════════════════════════════════════════════════════════════════════════
export function EvalPage({ id }) {
  const { data, mutate } = useStore();
  const nav = useNav();
  const toast = useToast();
  const confirm = useConfirm();
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(null);
  const [over, setOver] = useState(null);
  const ev = findEval(data, id);
  const cls = ev && findClass(data, ev.classId);
  if (!ev || !cls) return <Empty icon="clipboard" title="Évaluation introuvable" />;
  const students = sortStudents(cls.students);
  const st = evalStats(ev, students);
  const total = students.length - st.absent;

  const firstTodo = students.find((s) => !['done', 'absent'].includes(copyStatus(ev.copies?.[s.id])))?.id || students[0]?.id;

  const attachTo = async (sid, files) => {
    setBusy('Lecture des fichiers…');
    try {
      const pages = await filesToPages(files, (m) => setBusy(m));
      if (!pages.length) { toast('Aucune image ou PDF reconnu', 'error'); return; }
      const stored = [];
      for (const p of pages) { const pid = uid('pg'); await blobs.put(pid, p.dataUrl); stored.push({ id: pid, w: p.w, h: p.h, name: p.name }); }
      mutate((d) => { const c = ensureCopy(findEval(d, id), sid); c.pages.push(...stored); c.absent = false; });
      toast(`${stored.length} page(s) ajoutée(s) à la copie`);
    } catch (e) { toast(`Import impossible : ${e.message}`, 'error'); } finally { setBusy(null); }
  };

  const toggleAbsent = (sid) => mutate((d) => { const c = ensureCopy(findEval(d, id), sid); c.absent = !c.absent; });

  const clearPages = async (sid) => {
    if (!(await confirm({ title: 'Retirer les pages de cette copie ?', danger: true, confirmLabel: 'Retirer', message: 'Les images et annotations seront supprimées. Les points saisis sont conservés.' }))) return;
    const ids = (ev.copies?.[sid]?.pages || []).map((p) => p.id);
    mutate((d) => { const c = ensureCopy(findEval(d, id), sid); c.pages = []; c.ann = {}; });
    blobs.remove(ids); // chaque image n'appartient qu'à une seule copie
  };

  const remove = async () => {
    if (!(await confirm({ title: `Supprimer « ${ev.title} » ?`, danger: true, confirmLabel: 'Supprimer', message: 'Toutes les notes, copies et annotations de cette évaluation seront supprimées définitivement.' }))) return;
    const ids = Object.values(ev.copies || {}).flatMap((c) => (c.pages || []).map((p) => p.id));
    mutate((d) => { d.evals = d.evals.filter((e) => e.id !== id); });
    blobs.remove(ids);
    nav({ page: 'evals' });
  };

  return (
    <>
      <PageHeader onBack={() => nav({ page: 'evals' })} backLabel="Évaluations" badge={`${cls.name} · ${fmtDate(ev.date)}`} badgeIcon="clipboard" title={ev.title}
        sub={`${ev.grid.type} · noté sur ${ev.grid.scale}${Number(ev.coef) !== 1 ? ` · coefficient ${ev.coef}` : ''}`}
        actions={<>
          <Menu trigger={({ toggle }) => <button className="btn btn-ghost" onClick={toggle}><Icon name="more" />Plus</button>}
            items={[
              { icon: 'edit', label: 'Modifier l\'évaluation', onClick: () => setModal('edit') },
              { icon: 'users', label: 'Voir les résultats de la classe', onClick: () => nav({ page: 'class', id: cls.id }) },
              '-',
              { icon: 'trash', label: 'Supprimer l\'évaluation', danger: true, onClick: remove },
            ]} />
          <button className="btn btn-ghost" onClick={() => setModal('print')}><Icon name="printer" />Imprimer</button>
          <button className="btn btn-ghost" onClick={() => setModal('import')}><Icon name="upload" />Importer des copies</button>
          <button className="btn btn-white" onClick={() => nav({ page: 'correct', id, student: firstTodo })}><Icon name="pen" />{st.corrected ? 'Continuer la correction' : 'Commencer la correction'}</button>
        </>}
        stats={[
          { label: 'Corrigées', value: `${st.corrected}`, unit: `/${total}` },
          { label: 'Copies numérisées', value: st.withCopy, unit: `/${students.length}` },
          { label: 'Moyenne', value: st.mean == null ? '–' : fmt(st.mean, 2), unit: st.mean == null ? '' : `/${ev.grid.scale}` },
          { label: 'Médiane', value: st.median == null ? '–' : fmt(st.median, 2) },
          { label: 'Min · Max', value: st.min == null ? '–' : `${fmt(st.min, 1)} · ${fmt(st.max, 1)}` },
        ]} />
      <div className="page-content">
        {busy && <div className="sum-bar ok" style={{ marginBottom: '1rem', background: 'var(--accent-soft)', color: 'var(--accent)' }}><Icon name="upload" /><span>{busy}</span></div>}
        <div className="card">
          <div className="card-hd">
            <div className="card-title"><Icon name="users" />Copies des élèves</div>
            <span className="card-sub">Astuce : glissez un fichier sur la ligne d'un élève pour l'associer à sa copie.</span>
          </div>
          <div className="card-body flush">
            <div className="copy-row head"><span /><span>Élève</span><span>Copie</span><span>Statut</span><span style={{ textAlign: 'center' }}>Note</span><span /></div>
            {students.map((s) => {
              const c = ev.copies?.[s.id];
              const status = copyStatus(c);
              const n = copyNote(ev, s.id);
              const res = c ? computeNote(ev.grid, c) : null;
              return (
                <div key={s.id} className={`copy-row ${over === s.id ? 'drop-over' : ''}`}
                  onDragOver={(e) => { e.preventDefault(); setOver(s.id); }} onDragLeave={() => setOver(null)}
                  onDrop={(e) => { e.preventDefault(); setOver(null); if (e.dataTransfer.files.length) attachTo(s.id, e.dataTransfer.files); }}>
                  <div className="avatar" style={{ background: avatarColor(s.id) }}>{initials(s)}</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '.82rem' }}>{studentName(s, data.settings.nameOrder)}</div>
                    {c?.comment && <div className="faint" style={{ fontSize: '.7rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.comment}</div>}
                  </div>
                  <div className="row">
                    {(c?.pages || []).length ? (
                      <><div className="thumbs">{c.pages.slice(0, 3).map((p) => <Thumb key={p.id} id={p.id} />)}</div><span className="faint" style={{ fontSize: '.7rem' }}>{c.pages.length} p.</span></>
                    ) : <label className="btn btn-sm btn-quiet" style={{ cursor: 'pointer' }}><Icon name="upload" />Ajouter<input type="file" hidden multiple accept="image/*,.pdf,application/pdf" onChange={(e) => { if (e.target.files.length) attachTo(s.id, e.target.files); e.target.value = ''; }} /></label>}
                  </div>
                  <div style={{ fontSize: '.74rem', fontWeight: 600, color: STATUS[status].color }}><span className="status-dot" style={{ background: STATUS[status].color }} />{STATUS[status].label}</div>
                  <div style={{ textAlign: 'center' }}>
                    {status === 'absent' ? <span className="note-chip n-x">Abs</span> : n != null ? <span className={`note-chip ${noteClass(to20(n, ev.grid.scale))}`}>{fmt(n, 2)}</span> : <span className="note-chip n-x">{res && res.filled ? '…' : '–'}</span>}
                  </div>
                  <div className="row" style={{ justifyContent: 'flex-end', gap: '.25rem' }}>
                    <button className="btn btn-sm" disabled={status === 'absent'} onClick={() => nav({ page: 'correct', id, student: s.id })}><Icon name="pen" />Corriger</button>
                    <Menu trigger={({ toggle }) => <button className="btn btn-quiet btn-icon btn-sm" onClick={toggle}><Icon name="more" /></button>}
                      items={[
                        { icon: 'user', label: c?.absent ? 'Marquer présent' : 'Marquer absent', onClick: () => toggleAbsent(s.id) },
                        { icon: 'printer', label: 'Imprimer cette copie', onClick: () => setModal({ print: s.id }) },
                        (c?.pages || []).length ? { icon: 'trash', label: 'Retirer les pages numérisées', danger: true, onClick: () => clearPages(s.id) } : null,
                      ]} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {modal === 'edit' && <EvalModal ev={ev} onClose={() => setModal(null)} />}
      {modal === 'import' && <BulkImportModal ev={ev} students={students} onClose={() => setModal(null)} />}
      {(modal === 'print' || modal?.print) && <EvalPrintDialog ev={ev} cls={cls} onlyStudent={modal?.print} onClose={() => setModal(null)} />}
    </>
  );
}

function Thumb({ id }) {
  const url = useBlobUrl(id);
  return <div className="thumb-mini" style={{ backgroundImage: url ? `url("${url}")` : undefined }} />;
}

// ═══════════════════════════════════════════════════════════════════════════
// Import en lot : un PDF de toute la classe (ou plusieurs fichiers) → copies
// ═══════════════════════════════════════════════════════════════════════════
function norm(s) { return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }

function BulkImportModal({ ev, students, onClose }) {
  const { mutate } = useStore();
  const toast = useToast();
  const [pages, setPages] = useState(null);
  const [progress, setProgress] = useState('');
  const [per, setPer] = useState(1);
  const [strategy, setStrategy] = useState('order');
  const [assign, setAssign] = useState([]);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);
  const present = students.filter((s) => !ev.copies?.[s.id]?.absent);

  const load = async (files) => {
    setProgress('Lecture…');
    try {
      const p = await filesToPages(files, setProgress);
      setPages(p);
      const multiFile = new Set(p.map((x) => x.file)).size > 1;
      setStrategy(multiFile ? 'file' : 'order');
      if (!multiFile && present.length && p.length % present.length === 0) setPer(p.length / present.length);
    } catch (e) { toast(`Lecture impossible : ${e.message}`, 'error'); } finally { setProgress(''); }
  };

  // Regroupement des pages en copies
  const groups = useMemo(() => {
    if (!pages) return [];
    if (strategy === 'file') {
      const m = new Map();
      pages.forEach((p, i) => { if (!m.has(p.file)) m.set(p.file, []); m.get(p.file).push(i); });
      return [...m.entries()].map(([file, idx]) => ({ label: file, idx }));
    }
    const out = [];
    for (let i = 0; i < pages.length; i += per) out.push({ label: `Pages ${i + 1}${per > 1 ? `–${Math.min(pages.length, i + per)}` : ''}`, idx: Array.from({ length: Math.min(per, pages.length - i) }, (_, k) => i + k) });
    return out;
  }, [pages, per, strategy]);

  useEffect(() => {
    setAssign(groups.map((g, i) => {
      if (strategy === 'file') {
        const f = norm(g.label);
        const hit = present.find((s) => norm(s.nom) && f.includes(norm(s.nom)) && (!s.prenom || f.includes(norm(s.prenom).split(' ')[0])))
          || present.find((s) => norm(s.nom) && f.includes(norm(s.nom)));
        return hit?.id || present[i]?.id || '';
      }
      return present[i]?.id || '';
    }));
  }, [groups]); // eslint-disable-line

  const confirmImport = async () => {
    setSaving(true);
    try {
      const plan = [];
      for (let g = 0; g < groups.length; g++) {
        const sid = assign[g]; if (!sid) continue;
        const stored = [];
        for (const i of groups[g].idx) { const pid = uid('pg'); await blobs.put(pid, pages[i].dataUrl); stored.push({ id: pid, w: pages[i].w, h: pages[i].h, name: pages[i].name }); }
        plan.push([sid, stored]);
      }
      mutate((d) => { const e = findEval(d, ev.id); plan.forEach(([sid, st]) => { const c = ensureCopy(e, sid); c.pages.push(...st); c.absent = false; }); });
      toast(`${plan.length} copie(s) importée(s)`);
      onClose();
    } catch (e) { toast(`Erreur : ${e.message}`, 'error'); setSaving(false); }
  };

  const assigned = assign.filter(Boolean).length;
  const dupes = assign.filter((a, i) => a && assign.indexOf(a) !== i).length;

  return (
    <Modal title="Importer des copies" sub={`${ev.title} · ${students.length} élèves`} icon="upload" size="xwide" onClose={onClose}
      footer={pages ? <>
        <span className="faint" style={{ fontSize: '.74rem', marginRight: 'auto' }}>{pages.length} page(s) · {groups.length} copie(s) · {assigned} associée(s){dupes ? ` · ${dupes} élève(s) en double` : ''}</span>
        <button className="btn" onClick={() => setPages(null)}>Changer de fichiers</button>
        <button className="btn btn-primary" disabled={!assigned || saving} onClick={confirmImport}><Icon name="check" />{saving ? 'Import…' : `Importer ${assigned} copie(s)`}</button>
      </> : <button className="btn" onClick={onClose}>Annuler</button>}>
      {!pages ? (
        <div className="stack">
          <div className="dropzone" style={{ padding: '2.5rem' }} onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('over'); }} onDragLeave={(e) => e.currentTarget.classList.remove('over')}
            onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove('over'); if (e.dataTransfer.files.length) load(e.dataTransfer.files); }}>
            <Icon name="upload" />
            <div className="dropzone-title">{progress || 'Déposez vos copies scannées ici'}</div>
            <div className="dropzone-sub">PDF (un seul fichier pour toute la classe, ou un par élève), JPG ou PNG — plusieurs fichiers acceptés</div>
            <input ref={fileRef} type="file" multiple hidden accept="image/*,.pdf,application/pdf" onChange={(e) => e.target.files.length && load(e.target.files)} />
          </div>
          <div className="grid-3" style={{ gap: '.75rem' }}>
            {[['fileText', 'Un PDF pour la classe', 'Scannez la pile de copies dans l\'ordre de la liste : les pages sont réparties automatiquement.'],
              ['users', 'Un fichier par élève', 'Si le nom de l\'élève figure dans le nom du fichier, l\'association est automatique.'],
              ['edit', 'Tout est ajustable', 'Vérifiez et corrigez l\'attribution de chaque copie avant de valider.']].map(([ic, t, d]) => (
              <div key={t} className="card" style={{ padding: '.8rem .9rem' }}><div className="row" style={{ fontWeight: 700, fontSize: '.8rem', marginBottom: '.25rem' }}><Icon name={ic} size={15} style={{ color: 'var(--accent)' }} />{t}</div><div className="faint" style={{ fontSize: '.72rem', lineHeight: 1.45, color: 'var(--text2)' }}>{d}</div></div>
            ))}
          </div>
        </div>
      ) : (
        <div className="stack" style={{ gap: '.8rem' }}>
          <div className="row-wrap" style={{ gap: '1rem' }}>
            <Field label="Regroupement">
              <Seg value={strategy} onChange={setStrategy} options={[{ value: 'order', label: 'Par nombre de pages', icon: 'layers' }, { value: 'file', label: 'Un fichier = une copie', icon: 'file' }]} />
            </Field>
            {strategy === 'order' && (
              <Field label="Pages par copie">
                <div className="row"><button className="btn btn-sm btn-icon" onClick={() => setPer(Math.max(1, per - 1))}><Icon name="minus" /></button><b className="tnum" style={{ minWidth: 20, textAlign: 'center' }}>{per}</b><button className="btn btn-sm btn-icon" onClick={() => setPer(per + 1)}><Icon name="plus" /></button></div>
              </Field>
            )}
          </div>
          <div className="assign-list scroll" style={{ maxHeight: '48vh', overflowY: 'auto' }}>
            {groups.map((g, gi) => (
              <div key={gi} className="assign-group">
                <div className="assign-pages">{g.idx.map((i) => <div key={i} className="assign-thumb" style={{ backgroundImage: `url(${pages[i].dataUrl})` }}><span>{i + 1}</span></div>)}</div>
                <div style={{ width: 280, flexShrink: 0 }}>
                  <div className="faint" style={{ fontSize: '.66rem', marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.label}</div>
                  <select className="select input-sm" value={assign[gi] || ''} onChange={(e) => setAssign(assign.map((a, k) => (k === gi ? e.target.value : a)))}
                    style={assign[gi] && assign.indexOf(assign[gi]) !== gi ? { borderColor: 'var(--warning)' } : undefined}>
                    <option value="">— Ne pas importer —</option>
                    {students.map((s) => <option key={s.id} value={s.id}>{studentName(s)}{(ev.copies?.[s.id]?.pages || []).length ? ' (a déjà une copie)' : ''}</option>)}
                  </select>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Impression d'une évaluation (copies corrigées, grilles complétées)
// ═══════════════════════════════════════════════════════════════════════════
export function EvalPrintDialog({ ev, cls, onlyStudent, onClose }) {
  const { data, mutate } = useStore();
  const [content, setContent] = useState('copies');
  const [layout, setLayout] = useState(data.settings.printLayout || 'side');
  const [who, setWho] = useState(onlyStudent ? 'one' : 'done');
  const [perSheet, setPerSheet] = useState(2);
  const [orientation, setOrientation] = useState('portrait');
  const students = sortStudents(cls.students);
  const teacher = teacherLine(data);

  const list = students.filter((s) => {
    const c = ev.copies?.[s.id];
    if (who === 'one') return s.id === onlyStudent;
    if (c?.absent) return false;
    if (who === 'done') return c?.status === 'done';
    return true;
  });
  const fillOf = (s) => ({ student: studentName(s, data.settings.nameOrder), className: cls.name, date: fmtDate(ev.date), copy: ev.copies?.[s.id] || null, evalTitle: ev.title });

  const sheets = useMemo(() => {
    if (content === 'grids') return buildGridSheets({ ...ev.grid, perSheet, orientation }, list.map(fillOf), teacher);
    const out = [];
    list.forEach((s) => {
      const args = { grid: ev.grid, fill: fillOf(s), copy: ev.copies?.[s.id], teacher, keyPrefix: s.id };
      out.push(...(layout === 'side' ? SideBySideSheets(args) : SequentialSheets(args)));
    });
    return out;
  }, [content, layout, who, perSheet, orientation, ev]); // eslint-disable-line

  const orient = content === 'grids' ? orientation : layout === 'side' ? 'landscape' : 'portrait';

  return (
    <PrintDialog title={onlyStudent ? `Imprimer la copie de ${studentName(students.find((s) => s.id === onlyStudent), 'prenom')}` : `Imprimer — ${ev.title}`}
      sub={`${list.length} élève(s)`} orientation={orient} sheets={sheets} onClose={onClose} fileName={`${ev.title} - ${cls.name}`}
      options={<>
        <Field label="Contenu">
          <Seg block value={content} onChange={setContent} options={[{ value: 'copies', label: 'Copies + grille', icon: 'layout' }, { value: 'grids', label: 'Grilles seules', icon: 'grid' }]} />
        </Field>
        {content === 'copies' ? (
          <Field label="Mise en page">
            <div className="stack" style={{ gap: '.4rem' }}>
              {[['side', 'Côte à côte (paysage)', 'Copie à gauche, grille complétée à droite — comme à l\'écran'], ['seq', 'Copie puis grille (portrait)', 'Chaque page en pleine page, la grille à la fin']].map(([v, t, d]) => (
                <button key={v} className={`type-opt ${layout === v ? 'on' : ''}`} onClick={() => { setLayout(v); mutate((dd) => { dd.settings.printLayout = v; }); }}><b>{t}</b><span>{d}</span></button>
              ))}
            </div>
          </Field>
        ) : (
          <>
            <Field label="Grilles par feuille"><Seg block value={perSheet} onChange={setPerSheet} options={[{ value: 1, label: '1' }, { value: 2, label: '2 (économie)' }]} /></Field>
            <Field label="Orientation"><Seg block value={orientation} onChange={setOrientation} options={[{ value: 'portrait', label: 'Portrait' }, { value: 'landscape', label: 'Paysage' }]} /></Field>
          </>
        )}
        {!onlyStudent && (
          <Field label="Élèves">
            <Seg block value={who} onChange={setWho} options={[{ value: 'done', label: 'Copies corrigées' }, { value: 'all', label: 'Tous les présents' }]} />
          </Field>
        )}
        {content === 'copies' && list.some((s) => !(ev.copies?.[s.id]?.pages || []).length) && (
          <div className="sum-bar warn"><Icon name="info" /><span>Certaines copies ne sont pas numérisées : seule leur grille sera imprimée.</span></div>
        )}
      </>} />
  );
}
