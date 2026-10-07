import React, { useMemo, useRef, useState } from 'react';
import { useStore, useToast, findClass } from '../store.jsx';
import { useNav } from '../nav.jsx';
import { Icon } from '../icons.jsx';
import { PageHeader, Empty, Modal, Field, Menu, useConfirm, LineChart, Histogram, Sparkline, Trend, Seg } from '../ui.jsx';
import {
  uid, parseStudents, parseClassProClasses, readFileAsText, CLASS_COLORS, defaultSchoolYear, sortStudents,
  studentName, initials, avatarColor, copyNote, to20, noteClass, fmt, fmtDate, mean, weightedMean, evalStats,
} from '../utils.js';

export const LEVELS = ['6e', '5e', '4e', '3e', '2nde', '1re', 'Tle', 'BTS', 'Autre'];

export function classEvals(data, classId) {
  return data.evals.filter((e) => e.classId === classId).sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.createdAt || '').localeCompare(b.createdAt || ''));
}

export function studentAverage(evals, studentId) {
  return weightedMean(evals.map((e) => [to20(copyNote(e, studentId, true), e.grid.scale), Number(e.coef) || 1]));
}

// ═══════════════════════════════════════════════════════════════════════════
// Liste des classes
// ═══════════════════════════════════════════════════════════════════════════
export function ClassesPage() {
  const { data, mutate } = useStore();
  const nav = useNav();
  const toast = useToast();
  const confirm = useConfirm();
  const [modal, setModal] = useState(null);

  const totalStudents = data.classes.reduce((s, c) => s + c.students.length, 0);

  const remove = async (c) => {
    const n = data.evals.filter((e) => e.classId === c.id).length;
    const ok = await confirm({ title: `Supprimer la classe ${c.name} ?`, danger: true, confirmLabel: 'Supprimer', message: n ? `Les ${n} évaluation(s) de cette classe et leurs copies seront également supprimées. Cette action est définitive.` : 'Cette action est définitive.' });
    if (!ok) return;
    mutate((d) => { d.classes = d.classes.filter((x) => x.id !== c.id); d.evals = d.evals.filter((e) => e.classId !== c.id); });
    toast('Classe supprimée', 'info');
  };

  return (
    <>
      <PageHeader badge="Mes classes" badgeIcon="users" title="Classes & élèves"
        sub={`${data.classes.length} classe(s) · ${totalStudents} élève(s)`}
        actions={<>
          <button className="btn btn-ghost" onClick={() => setModal({ type: 'classpro' })}><Icon name="link" />Importer depuis ClassPro</button>
          <button className="btn btn-white" onClick={() => setModal({ type: 'new' })}><Icon name="plus" />Nouvelle classe</button>
        </>} />
      <div className="page-content">
        {data.classes.length === 0 ? (
          <div className="card"><Empty icon="users" title="Aucune classe pour l'instant" sub="Créez une classe en collant la liste de vos élèves (export Pronote, tableur…) ou récupérez vos classes depuis votre sauvegarde ClassPro.">
            <button className="btn" onClick={() => setModal({ type: 'classpro' })}><Icon name="link" />Depuis ClassPro</button>
            <button className="btn btn-primary" onClick={() => setModal({ type: 'new' })}><Icon name="plus" />Créer une classe</button>
          </Empty></div>
        ) : (
          <div className="grid-auto">
            {data.classes.map((c) => {
              const evs = classEvals(data, c.id);
              const avg = mean(c.students.map((s) => studentAverage(evs, s.id)));
              return (
                <div key={c.id} className="tile" onClick={() => nav({ page: 'class', id: c.id })}>
                  <div className="tile-top">
                    <div className="tile-icon" style={{ background: c.color }}>{c.name.slice(0, 3)}</div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="tile-title">{c.name}</div>
                      <div className="tile-sub">{c.level || 'Niveau non précisé'} · {c.year}</div>
                    </div>
                  </div>
                  <div className="row" style={{ gap: '1.25rem' }}>
                    <div><div className="slab" style={{ fontWeight: 800, fontSize: '1.25rem' }}>{c.students.length}</div><div className="faint" style={{ fontSize: '.66rem' }}>élèves</div></div>
                    <div><div className="slab" style={{ fontWeight: 800, fontSize: '1.25rem' }}>{evs.length}</div><div className="faint" style={{ fontSize: '.66rem' }}>évaluations</div></div>
                    <div><div className="slab" style={{ fontWeight: 800, fontSize: '1.25rem' }}>{avg == null ? '–' : fmt(avg, 1)}</div><div className="faint" style={{ fontSize: '.66rem' }}>moyenne /20</div></div>
                  </div>
                  <div className="tile-menu">
                    <Menu trigger={({ toggle }) => <button className="btn btn-quiet btn-icon btn-sm" onClick={toggle}><Icon name="more" /></button>}
                      items={[
                        { icon: 'edit', label: 'Modifier', onClick: () => setModal({ type: 'edit', cls: c }) },
                        { icon: 'clipboard', label: 'Nouvelle évaluation', onClick: () => nav({ page: 'evals', newFor: c.id }) },
                        '-',
                        { icon: 'trash', label: 'Supprimer la classe', danger: true, onClick: () => remove(c) },
                      ]} />
                  </div>
                </div>
              );
            })}
            <button className="tile add" onClick={() => setModal({ type: 'new' })}><Icon name="plus" /><span style={{ fontWeight: 600, fontSize: '.8rem' }}>Nouvelle classe</span></button>
          </div>
        )}
      </div>
      {modal?.type === 'new' && <ClassModal onClose={() => setModal(null)} onSaved={(id) => nav({ page: 'class', id })} />}
      {modal?.type === 'edit' && <ClassModal cls={modal.cls} onClose={() => setModal(null)} />}
      {modal?.type === 'classpro' && <ClassProImport onClose={() => setModal(null)} />}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Création / modification d'une classe avec import de la liste d'élèves
// ═══════════════════════════════════════════════════════════════════════════
export function ClassModal({ cls, onClose, onSaved, importOnly }) {
  const { data, mutate } = useStore();
  const toast = useToast();
  const [name, setName] = useState(cls?.name || '');
  const [level, setLevel] = useState(cls?.level || '');
  const [year, setYear] = useState(cls?.year || defaultSchoolYear());
  const [color, setColor] = useState(cls?.color || CLASS_COLORS[data.classes.length % CLASS_COLORS.length]);
  const [text, setText] = useState('');
  const fileRef = useRef(null);
  const parsed = useMemo(() => parseStudents(text), [text]);

  const onFile = async (f) => {
    if (!f) return;
    try { setText(await readFileAsText(f)); } catch { toast('Fichier illisible', 'error'); }
  };

  const save = () => {
    const students = parsed.map((s) => ({ id: uid('el'), ...s }));
    let id = cls?.id;
    mutate((d) => {
      if (cls) {
        const c = findClass(d, cls.id);
        if (!importOnly) Object.assign(c, { name: name.trim() || c.name, level, year, color });
        c.students = sortStudents([...c.students, ...students]);
      } else {
        id = uid('cls');
        d.classes.push({ id, name: name.trim() || 'Nouvelle classe', level, year, color, students: sortStudents(students), createdAt: new Date().toISOString() });
      }
    });
    toast(cls ? (students.length ? `${students.length} élève(s) ajouté(s)` : 'Classe mise à jour') : `Classe créée avec ${students.length} élève(s)`);
    onSaved?.(id);
    onClose();
  };

  return (
    <Modal title={importOnly ? 'Ajouter des élèves' : cls ? `Modifier ${cls.name}` : 'Nouvelle classe'} sub={importOnly ? cls.name : 'Informations et liste des élèves'} icon="users" size="wide" onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Annuler</button>
        <button className="btn btn-primary" onClick={save} disabled={!cls && !name.trim()}><Icon name="check" />{cls ? 'Enregistrer' : 'Créer la classe'}</button>
      </>}>
      <div className="stack">
        {!importOnly && (
          <div className="row" style={{ gap: '.9rem', alignItems: 'flex-end' }}>
            <Field label="Nom de la classe" style={{ flex: 1.4 }}><input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="ex. 3e B" /></Field>
            <Field label="Niveau" style={{ flex: 1 }}>
              <select className="select" value={level} onChange={(e) => setLevel(e.target.value)}>
                <option value="">—</option>{LEVELS.map((l) => <option key={l}>{l}</option>)}
              </select>
            </Field>
            <Field label="Année scolaire" style={{ flex: 1 }}><input className="input" value={year} onChange={(e) => setYear(e.target.value)} /></Field>
          </div>
        )}
        {!importOnly && (
          <Field label="Couleur">
            <div className="color-dots">{CLASS_COLORS.map((c) => <button key={c} type="button" className={`color-dot ${color === c ? 'on' : ''}`} style={{ background: c }} onClick={() => setColor(c)} aria-label={c} />)}</div>
          </Field>
        )}
        <div className="grid-2" style={{ alignItems: 'stretch' }}>
          <div className="field">
            <div className="row"><span className="field-label">{cls ? 'Élèves à ajouter' : 'Liste des élèves'}</span><span className="spacer" />
              <button type="button" className="btn btn-sm" onClick={() => fileRef.current?.click()}><Icon name="upload" />Fichier CSV / TXT</button>
              <input ref={fileRef} type="file" accept=".csv,.txt,.tsv,text/csv,text/plain" hidden onChange={(e) => { onFile(e.target.files[0]); e.target.value = ''; }} />
            </div>
            <textarea className="textarea" style={{ minHeight: 230, fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: '.76rem' }} value={text} onChange={(e) => setText(e.target.value)}
              placeholder={'Collez votre liste ici, un élève par ligne :\n\nDUPONT Marie\nMARTIN Lucas\nGARCÍA LÓPEZ Inés\n\nou un export CSV avec colonnes Nom ; Prénom'} />
            <span className="field-hint">Formats reconnus : « NOM Prénom » (Pronote), « Prénom NOM », CSV/tableur avec colonnes Nom et Prénom.</span>
          </div>
          <div className="field">
            <span className="field-label">Aperçu · {parsed.length} élève(s) détecté(s)</span>
            <div className="table-wrap scroll" style={{ height: 264 }}>
              {parsed.length ? (
                <table className="table"><thead><tr><th>#</th><th>Nom</th><th>Prénom</th></tr></thead>
                  <tbody>{parsed.map((s, i) => <tr key={i}><td className="faint">{i + 1}</td><td style={{ fontWeight: 700 }}>{s.nom}</td><td>{s.prenom}</td></tr>)}</tbody>
                </table>
              ) : <div className="faint" style={{ padding: '2rem 1rem', textAlign: 'center', fontSize: '.78rem' }}>L'aperçu s'affichera ici.<br />Vous pourrez aussi ajouter les élèves plus tard.</div>}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function ClassProImport({ onClose }) {
  const { mutate, data } = useStore();
  const toast = useToast();
  const [found, setFound] = useState(null);
  const [sel, setSel] = useState({});
  const fileRef = useRef(null);
  const onFile = async (f) => {
    try {
      const json = JSON.parse(await readFileAsText(f));
      const cls = parseClassProClasses(json);
      if (!cls || !cls.length) { toast('Aucune classe trouvée dans ce fichier', 'error'); return; }
      setFound(cls); setSel(Object.fromEntries(cls.map((_, i) => [i, true])));
    } catch { toast('Ce fichier n\'est pas une sauvegarde ClassPro valide', 'error'); }
  };
  const doImport = () => {
    const chosen = found.filter((_, i) => sel[i]);
    mutate((d) => {
      chosen.forEach((c, k) => d.classes.push({
        id: uid('cls'), name: c.name, level: (LEVELS.find((l) => c.name.startsWith(l.replace('e', ''))) || ''), year: defaultSchoolYear(),
        color: CLASS_COLORS[(data.classes.length + k) % CLASS_COLORS.length], students: sortStudents(c.students.map((s) => ({ id: uid('el'), ...s }))), createdAt: new Date().toISOString(),
      }));
    });
    toast(`${chosen.length} classe(s) importée(s) depuis ClassPro`);
    onClose();
  };
  return (
    <Modal title="Importer depuis ClassPro" sub="Récupérez vos classes et listes d'élèves" icon="link" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Annuler</button><button className="btn btn-primary" disabled={!found || !Object.values(sel).some(Boolean)} onClick={doImport}><Icon name="download" />Importer</button></>}>
      {!found ? (
        <div className="dropzone" onClick={() => fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('over'); }} onDragLeave={(e) => e.currentTarget.classList.remove('over')}
          onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove('over'); if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]); }}>
          <Icon name="upload" />
          <div className="dropzone-title">Choisir votre fichier ClassPro (.json)</div>
          <div className="dropzone-sub">Dans ClassPro : Fichier → Enregistrer (ou Exporter en JSON depuis la version HTML)</div>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => e.target.files[0] && onFile(e.target.files[0])} />
        </div>
      ) : (
        <div className="stack" style={{ gap: '.45rem' }}>
          {found.map((c, i) => (
            <label key={i} className="row" style={{ padding: '.6rem .8rem', border: '1px solid var(--border)', borderRadius: 10, cursor: 'pointer', background: sel[i] ? 'var(--accent-soft)' : 'var(--surface)' }}>
              <input type="checkbox" checked={!!sel[i]} onChange={(e) => setSel({ ...sel, [i]: e.target.checked })} />
              <b style={{ fontSize: '.84rem' }}>{c.name}</b><span className="spacer" /><span className="pill">{c.students.length} élèves</span>
            </label>
          ))}
        </div>
      )}
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Détail d'une classe
// ═══════════════════════════════════════════════════════════════════════════
export function ClassPage({ id, tab: initialTab }) {
  const { data, mutate } = useStore();
  const nav = useNav();
  const [tab, setTab] = useState(initialTab || 'results');
  const [modal, setModal] = useState(null);
  const cls = findClass(data, id);
  if (!cls) return <Empty icon="users" title="Classe introuvable" />;
  const evs = classEvals(data, id);
  const students = sortStudents(cls.students);
  const avgs = students.map((s) => studentAverage(evs, s.id));
  const classAvg = mean(avgs);
  const last = evs[evs.length - 1];
  const lastStats = last ? evalStats(last, students) : null;

  return (
    <>
      <PageHeader onBack={() => nav({ page: 'classes' })} backLabel="Toutes les classes" badge={`${cls.level || 'Classe'} · ${cls.year}`} badgeIcon="users" title={cls.name}
        actions={<>
          <button className="btn btn-ghost" onClick={() => setModal('edit')}><Icon name="edit" />Modifier</button>
          <button className="btn btn-white" onClick={() => nav({ page: 'evals', newFor: cls.id })}><Icon name="plus" />Nouvelle évaluation</button>
        </>}
        stats={[
          { label: 'Élèves', value: students.length },
          { label: 'Évaluations', value: evs.length },
          { label: 'Moyenne de classe', value: classAvg == null ? '–' : fmt(classAvg, 2), unit: classAvg == null ? '' : '/20' },
          { label: 'Dernière évaluation', value: lastStats?.mean == null ? '–' : fmt(lastStats.mean, 2), unit: lastStats?.mean == null ? '' : `/${last.grid.scale}` },
        ]} />
      <div className="page-content">
        <div className="tabs">
          <button className={`tab ${tab === 'results' ? 'on' : ''}`} onClick={() => setTab('results')}><Icon name="list" />Relevé de notes</button>
          <button className={`tab ${tab === 'evolution' ? 'on' : ''}`} onClick={() => setTab('evolution')}><Icon name="trend" />Évolution</button>
          <button className={`tab ${tab === 'students' ? 'on' : ''}`} onClick={() => setTab('students')}><Icon name="users" />Élèves ({students.length})</button>
        </div>
        {tab === 'results' && <ResultsTab cls={cls} evs={evs} students={students} avgs={avgs} onStudent={(s) => setModal({ student: s })} />}
        {tab === 'evolution' && <EvolutionTab cls={cls} evs={evs} students={students} onStudent={(s) => setModal({ student: s })} />}
        {tab === 'students' && <StudentsTab cls={cls} students={students} onImport={() => setModal('import')} mutate={mutate} />}
      </div>
      {modal === 'edit' && <ClassModal cls={cls} onClose={() => setModal(null)} />}
      {modal === 'import' && <ClassModal cls={cls} importOnly onClose={() => setModal(null)} />}
      {modal?.student && <StudentModal cls={cls} evs={evs} student={modal.student} students={students} onClose={() => setModal(null)} />}
    </>
  );
}

function NoteCell({ ev, studentId }) {
  const c = ev.copies?.[studentId];
  if (c?.absent) return <span className="note-chip n-x">Abs</span>;
  const n = copyNote(ev, studentId);
  if (n == null) return <span className="note-chip n-x">–</span>;
  return <span className={`note-chip ${noteClass(to20(n, ev.grid.scale))}`} title={c?.status !== 'done' ? 'Correction en cours' : ''} style={c?.status !== 'done' ? { fontStyle: 'italic', opacity: 0.75 } : undefined}>{fmt(n, 2)}</span>;
}

function ResultsTab({ cls, evs, students, avgs, onStudent }) {
  const nav = useNav();
  if (!evs.length) return <div className="card"><Empty icon="clipboard" title="Pas encore d'évaluation" sub={`Créez une première évaluation pour ${cls.name} : les notes apparaîtront ici au fil des corrections.`}><button className="btn btn-primary" onClick={() => nav({ page: 'evals', newFor: cls.id })}><Icon name="plus" />Nouvelle évaluation</button></Empty></div>;
  const evalMeans = evs.map((e) => evalStats(e, students).mean);
  return (
    <div className="table-wrap scroll" style={{ maxHeight: 'calc(100vh - 330px)' }}>
      <table className="table">
        <thead>
          <tr>
            <th className="sticky-col" style={{ minWidth: 200 }}>Élève</th>
            {evs.map((e) => (
              <th key={e.id} className="th-eval clickable" onClick={() => nav({ page: 'eval', id: e.id })} title="Ouvrir l'évaluation">
                {e.title}<small>{fmtDate(e.date, { day: 'numeric', month: 'short' })} · /{e.grid.scale}{Number(e.coef) !== 1 ? ` · coef ${e.coef}` : ''}</small>
              </th>
            ))}
            <th className="num" style={{ minWidth: 90 }}>Moyenne<br /><small style={{ textTransform: 'none', fontWeight: 500 }}>/20</small></th>
            <th style={{ minWidth: 150 }}>Évolution</th>
          </tr>
        </thead>
        <tbody>
          {students.map((s, i) => {
            const series = evs.map((e) => to20(copyNote(e, s.id, true), e.grid.scale));
            return (
              <tr key={s.id} className="clickable" onClick={() => onStudent(s)}>
                <td className="sticky-col">
                  <div className="row"><div className="avatar" style={{ background: avatarColor(s.id), width: 26, height: 26, fontSize: '.6rem' }}>{initials(s)}</div><span style={{ fontWeight: 600 }}>{studentName(s)}</span></div>
                </td>
                {evs.map((e) => <td key={e.id} className="num"><NoteCell ev={e} studentId={s.id} /></td>)}
                <td className="num"><span className={`note-chip ${noteClass(avgs[i])}`} style={{ fontSize: '.82rem' }}>{avgs[i] == null ? '–' : fmt(avgs[i], 2)}</span></td>
                <td><div className="row"><Sparkline values={series} /><Trend values={series} /></div></td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td className="sticky-col" style={{ background: 'var(--surface2)' }}>Moyenne de la classe</td>
            {evs.map((e, i) => <td key={e.id} className="num">{evalMeans[i] == null ? '–' : fmt(evalMeans[i], 2)}</td>)}
            <td className="num">{fmt(mean(avgs), 2)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function EvolutionTab({ cls, evs, students, onStudent }) {
  const [selEval, setSelEval] = useState(evs.length ? evs[evs.length - 1].id : null);
  if (!evs.length) return <div className="card"><Empty icon="trend" title="Aucune donnée pour l'instant" sub="Les courbes d'évolution se construisent au fil des évaluations corrigées." /></div>;
  const labels = evs.map((e) => e.title);
  const stats = evs.map((e) => evalStats(e, students));
  const mins = evs.map((e, i) => to20(stats[i].min, e.grid.scale));
  const maxs = evs.map((e, i) => to20(stats[i].max, e.grid.scale));
  const means = evs.map((e, i) => to20(stats[i].mean, e.grid.scale));
  const ev = evs.find((e) => e.id === selEval) || evs[evs.length - 1];
  const evNotes = students.map((s) => copyNote(ev, s.id, true)).filter((n) => n != null);
  const st = evalStats(ev, students);

  // Élèves en progression / en baisse sur les deux dernières évaluations notées
  const moves = students.map((s) => {
    const v = evs.map((e) => to20(copyNote(e, s.id, true), e.grid.scale)).filter((x) => x != null);
    return { s, d: v.length >= 2 ? v[v.length - 1] - v[v.length - 2] : null };
  }).filter((m) => m.d != null).sort((a, b) => b.d - a.d);

  return (
    <div className="stack">
      <div className="card">
        <div className="card-hd"><div className="card-title"><Icon name="trend" />Moyenne de la classe au fil des évaluations <span className="card-sub">(ramenée sur 20)</span></div>
          <div className="legend"><span><i style={{ background: 'var(--accent)' }} />Moyenne</span><span><i style={{ background: '#0f9b6e' }} />Meilleure note</span><span><i style={{ background: '#dc2626' }} />Note la plus basse</span></div>
        </div>
        <div className="card-body"><LineChart labels={labels} refLine={10} series={[
          { name: 'Meilleure', values: maxs, color: '#0f9b6e', width: 1.4, dash: '4 4' },
          { name: 'Plus basse', values: mins, color: '#dc2626', width: 1.4, dash: '4 4' },
          { name: 'Moyenne', values: means, color: 'var(--accent)', width: 2.8, area: true },
        ]} /></div>
      </div>
      <div className="grid-2">
        <div className="card">
          <div className="card-hd">
            <div className="card-title"><Icon name="chart" />Répartition des notes</div>
            <select className="select input-sm" style={{ width: 'auto', maxWidth: 220 }} value={ev.id} onChange={(e) => setSelEval(e.target.value)}>
              {evs.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
            </select>
          </div>
          <div className="card-body">
            <Histogram values={evNotes} max={Number(ev.grid.scale)} />
            <div className="row-wrap mt-2" style={{ gap: '.4rem' }}>
              <span className="pill accent">Moyenne {fmt(st.mean, 2)}</span><span className="pill">Médiane {fmt(st.median, 2)}</span>
              <span className="pill success">Max {fmt(st.max, 2)}</span><span className="pill danger">Min {fmt(st.min, 2)}</span>
              <span className="pill">{st.count} notes{st.absent ? ` · ${st.absent} abs.` : ''}</span>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-hd"><div className="card-title"><Icon name="sparkles" />Dynamiques récentes</div><span className="card-sub">écart entre les deux dernières notes</span></div>
          <div className="card-body flush scroll" style={{ maxHeight: 280, overflowY: 'auto' }}>
            {!moves.length ? <div className="faint" style={{ padding: '1.5rem', fontSize: '.78rem', textAlign: 'center' }}>Il faut au moins deux évaluations notées par élève.</div>
              : [...moves.slice(0, 5), ...(moves.length > 8 ? moves.slice(-3) : [])].map(({ s, d }) => (
                <div key={s.id} className="list-item" onClick={() => onStudent(s)}>
                  <div className="avatar" style={{ background: avatarColor(s.id), width: 28, height: 28, fontSize: '.6rem' }}>{initials(s)}</div>
                  <div className="li-main"><div className="li-title">{studentName(s)}</div></div>
                  <span className={`pill ${d >= 0.5 ? 'success' : d <= -0.5 ? 'danger' : ''}`}>{d > 0 ? '↗ +' : d < 0 ? '↘ ' : '→ '}{fmt(d, 1)} pt</span>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StudentsTab({ cls, students, onImport, mutate }) {
  const confirm = useConfirm();
  const [nom, setNom] = useState(''); const [prenom, setPrenom] = useState('');
  const upd = (sid, k, v) => mutate((d) => { const s = findClass(d, cls.id).students.find((x) => x.id === sid); s[k] = k === 'nom' ? v.toUpperCase() : v; });
  const add = () => {
    if (!nom.trim() && !prenom.trim()) return;
    mutate((d) => { const c = findClass(d, cls.id); c.students = sortStudents([...c.students, { id: uid('el'), nom: nom.trim().toUpperCase(), prenom: prenom.trim() }]); });
    setNom(''); setPrenom('');
  };
  const del = async (s) => {
    if (!(await confirm({ title: `Retirer ${studentName(s, 'prenom')} ?`, danger: true, confirmLabel: 'Retirer', message: 'Ses notes et copies dans les évaluations de cette classe seront conservées mais n\'apparaîtront plus.' }))) return;
    mutate((d) => { const c = findClass(d, cls.id); c.students = c.students.filter((x) => x.id !== s.id); });
  };
  return (
    <div className="card">
      <div className="card-hd">
        <div className="card-title"><Icon name="users" />Liste des élèves</div>
        <div className="row"><button className="btn btn-sm" onClick={onImport}><Icon name="upload" />Importer une liste</button></div>
      </div>
      <div className="card-body flush">
        <table className="table">
          <thead><tr><th style={{ width: 48 }}>#</th><th>Nom</th><th>Prénom</th><th style={{ width: 60 }} /></tr></thead>
          <tbody>
            {students.map((s, i) => (
              <tr key={s.id}>
                <td className="faint">{i + 1}</td>
                <td><input className="input input-sm" style={{ fontWeight: 700, border: '1px solid transparent', background: 'transparent' }} value={s.nom} onChange={(e) => upd(s.id, 'nom', e.target.value)} /></td>
                <td><input className="input input-sm" style={{ border: '1px solid transparent', background: 'transparent' }} value={s.prenom} onChange={(e) => upd(s.id, 'prenom', e.target.value)} /></td>
                <td><button className="btn btn-quiet btn-icon btn-sm btn-danger-soft" onClick={() => del(s)} title="Retirer"><Icon name="trash" /></button></td>
              </tr>
            ))}
            <tr>
              <td><Icon name="plus" size={15} style={{ color: 'var(--text3)' }} /></td>
              <td><input className="input input-sm" placeholder="NOM" value={nom} onChange={(e) => setNom(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} /></td>
              <td><input className="input input-sm" placeholder="Prénom" value={prenom} onChange={(e) => setPrenom(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} /></td>
              <td><button className="btn btn-primary btn-sm" onClick={add}>Ajouter</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Fiche élève : courbe personnelle vs moyenne de classe + détail par évaluation
function StudentModal({ cls, evs, student, students, onClose }) {
  const nav = useNav();
  const [sid, setSid] = useState(student.id);
  const s = students.find((x) => x.id === sid) || student;
  const idx = students.findIndex((x) => x.id === sid);
  const mine = evs.map((e) => to20(copyNote(e, s.id, true), e.grid.scale));
  const cls20 = evs.map((e) => to20(evalStats(e, students).mean, e.grid.scale));
  const avg = studentAverage(evs, s.id);
  const [view, setView] = useState('chart');
  return (
    <Modal title={studentName(s, 'prenom')} sub={`${cls.name} · moyenne ${avg == null ? '–' : fmt(avg, 2) + ' /20'}`} icon="user" size="wide" onClose={onClose}
      footer={<>
        <button className="btn" disabled={idx <= 0} onClick={() => setSid(students[idx - 1].id)}><Icon name="chevronLeft" />Précédent</button>
        <button className="btn" disabled={idx >= students.length - 1} onClick={() => setSid(students[idx + 1].id)}>Suivant<Icon name="chevronRight" /></button>
        <span className="spacer" />
        <button className="btn btn-primary" onClick={onClose}>Fermer</button>
      </>}>
      <div className="row" style={{ marginBottom: '.8rem' }}>
        <Seg value={view} onChange={setView} options={[{ value: 'chart', label: 'Courbe', icon: 'trend' }, { value: 'table', label: 'Détail', icon: 'list' }]} />
        <span className="spacer" />
        <div className="legend"><span><i style={{ background: 'var(--accent)' }} />{s.prenom || s.nom}</span><span><i style={{ background: 'var(--text3)' }} />Moyenne de classe</span></div>
      </div>
      {view === 'chart' ? (
        evs.length ? <LineChart labels={evs.map((e) => e.title)} refLine={10} height={260} series={[
          { name: 'Classe', values: cls20, color: 'var(--text3)', width: 1.6, dash: '5 4' },
          { name: s.prenom || s.nom, values: mine, color: 'var(--accent)', width: 2.8, area: true },
        ]} /> : <Empty icon="trend" title="Aucune évaluation" />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Évaluation</th><th>Date</th><th className="num">Note</th><th className="num">/20</th><th className="num">Classe</th><th>Appréciation</th></tr></thead>
            <tbody>
              {evs.map((e, i) => {
                const c = e.copies?.[s.id];
                return (
                  <tr key={e.id} className="clickable" onClick={() => { onClose(); nav({ page: 'correct', id: e.id, student: s.id }); }}>
                    <td style={{ fontWeight: 600 }}>{e.title}</td>
                    <td className="faint nowrap">{fmtDate(e.date)}</td>
                    <td className="num"><NoteCell ev={e} studentId={s.id} /> <span className="faint">/{e.grid.scale}</span></td>
                    <td className="num tnum">{mine[i] == null ? '–' : fmt(mine[i], 1)}</td>
                    <td className="num tnum faint">{cls20[i] == null ? '–' : fmt(cls20[i], 1)}</td>
                    <td style={{ fontSize: '.74rem', color: 'var(--text2)', maxWidth: 260 }}>{c?.comment || <span className="faint">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
