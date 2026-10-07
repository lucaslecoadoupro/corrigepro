import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useStore, useToast, findClass, findEval, ensureCopy } from '../store.jsx';
import { useNav } from '../nav.jsx';
import { Icon } from '../icons.jsx';
import { Empty, Menu, useBlobUrl, useConfirm } from '../ui.jsx';
import { Shape, PEN_COLORS, HL_COLORS, unit, hitTest, rotateShape } from '../annotations.jsx';
import { EvalPrintDialog, copyStatus } from './Evals.jsx';
import { filesToPages, blobs, rotateDataUrl } from '../platform.js';
import { uid, fmt, sortStudents, studentName, computeNote, critPoints, clamp, avatarColor, initials } from '../utils.js';

const TOOLS = [
  { id: 'hand', icon: 'hand', label: 'Déplacer (H)', key: 'h' },
  { id: 'pen', icon: 'pen', label: 'Stylo (P)', key: 'p' },
  { id: 'hl', icon: 'highlighter', label: 'Surligneur (S)', key: 's' },
  { id: 'line', icon: 'underline', label: 'Souligner (U)', key: 'u' },
  { id: 'wave', icon: 'wave', label: 'Souligner en vague — erreur de langue (V)', key: 'v' },
  { id: 'ellipse', icon: 'circle', label: 'Entourer (O)', key: 'o' },
  { id: 'text', icon: 'type', label: 'Texte (T)', key: 't' },
  { id: 'stamp', icon: 'stamp', label: 'Tampon / annotation rapide (M)', key: 'm' },
  { id: 'eraser', icon: 'eraser', label: 'Gomme (E)', key: 'e' },
];

const WaveIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" width="17" height="17"><path d="M5 5v5a7 7 0 0 0 14 0V5" opacity=".45" /><path d="M3 19q2-3 4 0t4 0 4 0 4 0 2 0" /></svg>
);

// ═══════════════════════════════════════════════════════════════════════════
export function CorrectionPage({ id, student }) {
  const { data, mutate } = useStore();
  const nav = useNav();
  const toast = useToast();
  const ev = findEval(data, id);
  const cls = ev && findClass(data, ev.classId);
  const students = useMemo(() => (cls ? sortStudents(cls.students) : []), [cls]);
  const [sid, setSid] = useState(student || students[0]?.id);
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState(PEN_COLORS[0].c);
  const [hlColor, setHlColor] = useState(HL_COLORS[0]);
  const [stamp, setStamp] = useState(data?.settings.stamps?.[0] || '✓');
  const [stampOpen, setStampOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [rightW, setRightW] = useState(() => Number(localStorage.getItem('cp-right-w')) || 440);
  const [printing, setPrinting] = useState(false);
  const [hist, setHist] = useState({ undo: [], redo: [] });
  const [importing, setImporting] = useState(null);

  useEffect(() => { setHist({ undo: [], redo: [] }); }, [sid]);

  const copy = ev?.copies?.[sid];
  const idx = students.findIndex((s) => s.id === sid);
  const s = students[idx];

  // ── Modification des annotations d'une page (avec historique) ────────────
  // copyRef garde la dernière version connue (mise à jour de façon optimiste)
  // pour que des modifications rapprochées (gomme glissée) ne s'écrasent pas.
  const copyRef = useRef(copy);
  copyRef.current = copy;
  const histRef = useRef(hist);
  histRef.current = hist;

  const writeAnn = useCallback((pageId, shapes) => {
    const cur = copyRef.current || {};
    copyRef.current = { ...cur, ann: { ...(cur.ann || {}), [pageId]: shapes } };
    mutate((d) => {
      const c = ensureCopy(findEval(d, id), sid);
      c.ann = { ...(c.ann || {}), [pageId]: shapes };
      if (c.status === 'todo') c.status = 'progress';
    });
  }, [mutate, id, sid]);

  const setPageShapes = useCallback((pageId, updater, record = true) => {
    const before = copyRef.current?.ann?.[pageId] || [];
    const after = typeof updater === 'function' ? updater(before) : updater;
    if (after === before) return;
    writeAnn(pageId, after);
    if (record) setHist((h) => ({ undo: [...h.undo.slice(-80), { pageId, before, after }], redo: [] }));
  }, [writeAnn]);

  const undo = useCallback(() => {
    const h = histRef.current; const last = h.undo[h.undo.length - 1]; if (!last) return;
    writeAnn(last.pageId, last.before);
    setHist({ undo: h.undo.slice(0, -1), redo: [...h.redo, last] });
  }, [writeAnn]);
  const redo = useCallback(() => {
    const h = histRef.current; const last = h.redo[h.redo.length - 1]; if (!last) return;
    writeAnn(last.pageId, last.after);
    setHist({ undo: [...h.undo, last], redo: h.redo.slice(0, -1) });
  }, [writeAnn]);

  const updateCopy = useCallback((fn) => mutate((d) => {
    const c = ensureCopy(findEval(d, id), sid);
    fn(c);
    if (c.status === 'todo') c.status = 'progress';
  }), [mutate, id, sid]);

  const go = (dir) => { const n = students[idx + dir]; if (n) setSid(n.id); };
  const nextTodo = () => {
    for (let k = 1; k <= students.length; k++) {
      const n = students[(idx + k) % students.length];
      const st = copyStatus(ev.copies?.[n.id]);
      if (st !== 'done' && st !== 'absent') return n.id;
    }
    return null;
  };
  const validate = () => {
    mutate((d) => { ensureCopy(findEval(d, id), sid).status = 'done'; });
    const n = nextTodo();
    if (n && n !== sid) { setSid(n); toast(`Copie validée — au tour de ${studentName(students.find((x) => x.id === n), 'prenom')}`); } else toast('Toutes les copies sont corrigées 🎉');
  };

  // ── Raccourcis clavier ───────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === 'Enter') { e.preventDefault(); validate(); return; }
      if (typing) return;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
      if (mod && (e.key === '+' || e.key === '=')) { e.preventDefault(); setZoom((z) => clamp(z * 1.15, 0.4, 3)); return; }
      if (mod && e.key === '-') { e.preventDefault(); setZoom((z) => clamp(z / 1.15, 0.4, 3)); return; }
      if (mod && e.key === '0') { e.preventDefault(); setZoom(1); return; }
      if (e.altKey && e.key === 'ArrowRight') { go(1); return; }
      if (e.altKey && e.key === 'ArrowLeft') { go(-1); return; }
      if (mod || e.altKey) return;
      const t = TOOLS.find((x) => x.key === e.key.toLowerCase());
      if (t) setTool(t.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ── Redimensionnement du panneau droit ───────────────────────────────────
  const startResize = (e) => {
    e.preventDefault();
    const x0 = e.clientX; const w0 = rightW;
    const el = e.currentTarget; el.classList.add('drag');
    const mv = (m) => setRightW(clamp(w0 - (m.clientX - x0), 340, 760));
    const up = () => { el.classList.remove('drag'); window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  };
  useEffect(() => { localStorage.setItem('cp-right-w', String(rightW)); }, [rightW]);

  const attach = async (files) => {
    setImporting('Lecture des fichiers…');
    try {
      const pages = await filesToPages(files, setImporting);
      const stored = [];
      for (const p of pages) { const pid = uid('pg'); await blobs.put(pid, p.dataUrl); stored.push({ id: pid, w: p.w, h: p.h, name: p.name }); }
      updateCopy((c) => { c.pages.push(...stored); c.absent = false; });
      if (stored.length) toast(`${stored.length} page(s) ajoutée(s)`);
    } catch (err) { toast(`Import impossible : ${err.message}`, 'error'); } finally { setImporting(null); }
  };

  if (!ev || !cls) return <Empty icon="clipboard" title="Évaluation introuvable" />;
  if (!s) return <Empty icon="users" title="Aucun élève dans cette classe" />;

  const corrected = students.filter((x) => copyStatus(ev.copies?.[x.id]) === 'done').length;
  const present = students.filter((x) => !ev.copies?.[x.id]?.absent).length;

  return (
    <div className="corr">
      <div className="corr-bar">
        <div className="hd-drag" />
        <button className="btn btn-ghost btn-sm" onClick={() => nav({ page: 'eval', id })}><Icon name="arrowLeft" />Copies</button>
        <div className="corr-title">{ev.title}<small>{cls.name} · {corrected}/{present} corrigées · /{ev.grid.scale}</small></div>
        <span className="spacer" />
        <div className="student-switch">
          <button className="btn btn-ghost btn-sm" disabled={idx <= 0} onClick={() => go(-1)} title="Élève précédent (Alt+←)"><Icon name="chevronLeft" /></button>
          <div className="avatar" style={{ background: avatarColor(s.id), width: 26, height: 26, fontSize: '.6rem' }}>{initials(s)}</div>
          <select value={sid} onChange={(e) => setSid(e.target.value)}>
            {students.map((x) => {
              const st = copyStatus(ev.copies?.[x.id]);
              return <option key={x.id} value={x.id}>{st === 'done' ? '✓ ' : st === 'absent' ? '⊘ ' : st === 'progress' ? '• ' : '   '}{studentName(x, data.settings.nameOrder)}</option>;
            })}
          </select>
          <button className="btn btn-ghost btn-sm" disabled={idx >= students.length - 1} onClick={() => go(1)} title="Élève suivant (Alt+→)"><Icon name="chevronRight" /></button>
        </div>
        <span className="spacer" />
        <button className="btn btn-ghost btn-sm" onClick={() => setPrinting(true)}><Icon name="printer" />Imprimer</button>
      </div>

      <div className="corr-main">
        <div className="corr-left">
          <Toolbar {...{ tool, setTool, color, setColor, hlColor, setHlColor, stamp, setStamp, stampOpen, setStampOpen, zoom, setZoom, undo, redo, hist, stamps: data.settings.stamps }}
            onClear={copy?.pages?.length ? () => copy.pages.forEach((p) => (copy.ann?.[p.id]?.length ? setPageShapes(p.id, []) : null)) : null}
            onAdd={attach} />
          {copy?.absent ? (
            <div className="viewer"><Empty icon="user" title={`${studentName(s, 'prenom')} est noté(e) absent(e)`} sub="Aucune note ne sera comptée pour cette évaluation.">
              <button className="btn" onClick={() => updateCopy((c) => { c.absent = false; c.status = 'todo'; })}>Marquer présent(e)</button>
            </Empty></div>
          ) : copy?.pages?.length ? (
            <Viewer key={sid} copy={copy} tool={tool} color={color} hlColor={hlColor} stamp={stamp} zoom={zoom} setZoom={setZoom} setPageShapes={setPageShapes} updateCopy={updateCopy} />
          ) : (
            <NoCopy student={s} onFiles={attach} busy={importing} />
          )}
        </div>
        <div className="corr-split" onPointerDown={startResize} title="Redimensionner" />
        <div className="corr-right" style={{ width: rightW }}>
          <ScorePanel key={sid} ev={ev} copy={copy} student={s} updateCopy={updateCopy} onValidate={validate} settings={data.settings}
            onAbsent={() => updateCopy((c) => { c.absent = !c.absent; if (c.absent) c.status = 'todo'; })} />
        </div>
      </div>
      {printing && <EvalPrintDialog ev={ev} cls={cls} onlyStudent={sid} onClose={() => setPrinting(false)} />}
    </div>
  );
}

// ── Barre d'outils ──────────────────────────────────────────────────────────
function Toolbar({ tool, setTool, color, setColor, hlColor, setHlColor, stamp, setStamp, stampOpen, setStampOpen, zoom, setZoom, undo, redo, hist, stamps, onClear, onAdd }) {
  const fileRef = useRef(null);
  const popRef = useRef(null);
  useEffect(() => {
    if (!stampOpen) return undefined;
    const h = (e) => { if (!popRef.current?.contains(e.target)) setStampOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [stampOpen, setStampOpen]);
  return (
    <div className="toolbar">
      {TOOLS.map((t) => (
        t.id === 'stamp' ? (
          <div key={t.id} style={{ position: 'relative' }} ref={popRef}>
            <button className={`tool ${tool === 'stamp' ? 'on' : ''}`} title={t.label} onClick={() => { setTool('stamp'); setStampOpen(!stampOpen || tool !== 'stamp'); }} style={{ width: 'auto', padding: '0 .5rem', gap: '.3rem' }}>
              <Icon name="stamp" /><span style={{ fontSize: '.72rem', fontWeight: 700, maxWidth: 70, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stamp}</span>
            </button>
            {stampOpen && (
              <div className="stamp-pop">
                <div className="field-label" style={{ marginBottom: '.4rem' }}>Choisir le tampon</div>
                <div className="stamp-grid">
                  {stamps.map((x) => <button key={x} className={`stamp-opt ${stamp === x ? 'on' : ''}`} onClick={() => { setStamp(x); setTool('stamp'); setStampOpen(false); }}>{x}</button>)}
                </div>
                <div className="field-hint mt-1">Personnalisez la liste dans Réglages.</div>
              </div>
            )}
          </div>
        ) : (
          <button key={t.id} className={`tool ${tool === t.id ? 'on' : ''}`} title={t.label} onClick={() => setTool(t.id)}>
            {t.icon === 'wave' ? <WaveIcon /> : <Icon name={t.icon} />}
          </button>
        )
      ))}
      <div className="tool-sep" />
      {tool === 'hl'
        ? HL_COLORS.map((c) => <button key={c} className={`swatch ${hlColor === c ? 'on' : ''}`} style={{ background: c }} onClick={() => setHlColor(c)} title="Couleur du surligneur" />)
        : PEN_COLORS.map((c) => <button key={c.c} className={`swatch ${color === c.c ? 'on' : ''}`} style={{ background: c.c }} onClick={() => setColor(c.c)} title={c.label} />)}
      <div className="tool-sep" />
      <button className="tool" onClick={undo} disabled={!hist.undo.length} title="Annuler (Ctrl/Cmd+Z)"><Icon name="undo" /></button>
      <button className="tool" onClick={redo} disabled={!hist.redo.length} title="Rétablir (Ctrl/Cmd+Maj+Z)"><Icon name="redo" /></button>
      <span className="spacer" />
      <button className="tool" onClick={() => setZoom((z) => clamp(z / 1.2, 0.4, 3))} title="Dézoomer"><Icon name="zoomOut" /></button>
      <button className="tool-label" style={{ border: 'none', background: 'none', cursor: 'pointer' }} onClick={() => setZoom(1)} title="Ajuster à la largeur">{Math.round(zoom * 100)} %</button>
      <button className="tool" onClick={() => setZoom((z) => clamp(z * 1.2, 0.4, 3))} title="Zoomer"><Icon name="zoomIn" /></button>
      <div className="tool-sep" />
      <Menu trigger={({ toggle }) => <button className="tool" onClick={toggle} title="Plus"><Icon name="more" /></button>}
        items={[
          { icon: 'upload', label: 'Ajouter des pages à la copie', hint: 'PDF, JPG ou PNG', onClick: () => fileRef.current?.click() },
          onClear && { icon: 'eraser', label: 'Effacer toutes les annotations', danger: true, onClick: onClear },
        ]} />
      <input ref={fileRef} type="file" hidden multiple accept="image/*,.pdf,application/pdf" onChange={(e) => { if (e.target.files.length) onAdd(e.target.files); e.target.value = ''; }} />
    </div>
  );
}

function NoCopy({ student, onFiles, busy }) {
  const ref = useRef(null);
  const [over, setOver] = useState(false);
  return (
    <div className="viewer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className={`dropzone ${over ? 'over' : ''}`} style={{ maxWidth: 480, width: '100%', padding: '2.5rem 2rem', background: 'var(--surface)' }} onClick={() => ref.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files); }}>
        <Icon name="upload" />
        <div className="dropzone-title">{busy || `Ajouter la copie de ${studentName(student, 'prenom')}`}</div>
        <div className="dropzone-sub">Déposez un PDF, des photos ou des scans (JPG, PNG) — ou cliquez pour parcourir.<br />Vous pouvez aussi noter directement avec la grille, sans copie numérisée.</div>
        <input ref={ref} type="file" hidden multiple accept="image/*,.pdf,application/pdf" onChange={(e) => { if (e.target.files.length) onFiles(e.target.files); e.target.value = ''; }} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Visionneuse : pages de la copie + calque d'annotation
// ═══════════════════════════════════════════════════════════════════════════
function Viewer({ copy, tool, color, hlColor, stamp, zoom, setZoom, setPageShapes, updateCopy }) {
  const ref = useRef(null);
  const [vw, setVw] = useState(800);
  const confirm = useConfirm();
  useLayoutEffect(() => {
    const ro = new ResizeObserver(([e]) => setVw(e.contentRect.width));
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  // Ctrl/Cmd + molette = zoom
  useEffect(() => {
    const el = ref.current; if (!el) return undefined;
    const w = (e) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); setZoom((z) => clamp(z * (e.deltaY < 0 ? 1.08 : 1 / 1.08), 0.4, 3)); } };
    el.addEventListener('wheel', w, { passive: false });
    return () => el.removeEventListener('wheel', w);
  }, [setZoom]);

  // Déplacement à la main
  const pan = useRef(null);
  const onDown = (e) => {
    if (tool !== 'hand') return;
    pan.current = { x: e.clientX, y: e.clientY, sl: ref.current.scrollLeft, st: ref.current.scrollTop };
    ref.current.style.cursor = 'grabbing';
  };
  const onMove = (e) => {
    if (!pan.current) return;
    ref.current.scrollLeft = pan.current.sl - (e.clientX - pan.current.x);
    ref.current.scrollTop = pan.current.st - (e.clientY - pan.current.y);
  };
  const onUp = () => { pan.current = null; if (ref.current) ref.current.style.cursor = ''; };

  const baseW = Math.min(1100, Math.max(300, vw - 110));
  const rotate = async (page) => {
    const d = await blobs.getDataUrl(page.id);
    if (!d) return;
    const r = await rotateDataUrl(d, 1);
    await blobs.put(page.id, r.dataUrl);
    updateCopy((c) => {
      const p = c.pages.find((x) => x.id === page.id);
      const H = p.h;
      p.w = r.w; p.h = r.h; p.v = (p.v || 0) + 1;
      c.ann = { ...c.ann, [p.id]: (c.ann?.[p.id] || []).map((sh) => rotateShape(sh, H)) };
    });
  };
  const removePage = async (page) => {
    if (!(await confirm({ title: 'Supprimer cette page ?', danger: true, confirmLabel: 'Supprimer', message: 'La page et ses annotations seront retirées de la copie.' }))) return;
    updateCopy((c) => { c.pages = c.pages.filter((x) => x.id !== page.id); const a = { ...c.ann }; delete a[page.id]; c.ann = a; });
    blobs.remove([page.id]);
  };
  const movePage = (i, dir) => updateCopy((c) => { const j = i + dir; if (j < 0 || j >= c.pages.length) return; [c.pages[i], c.pages[j]] = [c.pages[j], c.pages[i]]; });

  return (
    <div className="viewer scroll" ref={ref} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp} style={{ cursor: tool === 'hand' ? 'grab' : undefined }}>
      <div className="viewer-pages" style={{ width: baseW * zoom }}>
        {copy.pages.map((p, i) => (
          <Page key={p.id} page={p} index={i} count={copy.pages.length} width={baseW * zoom} shapes={copy.ann?.[p.id] || []}
            tool={tool} color={color} hlColor={hlColor} stamp={stamp} setShapes={(u, rec) => setPageShapes(p.id, u, rec)}
            onRotate={() => rotate(p)} onRemove={() => removePage(p)} onMove={(d) => movePage(i, d)} />
        ))}
      </div>
    </div>
  );
}

function Page({ page, index, count, width, shapes, tool, color, hlColor, stamp, setShapes, onRotate, onRemove, onMove }) {
  const url = useBlobUrl(page.id, page.v || 0);
  const svgRef = useRef(null);
  const [draft, setDraft] = useState(null);
  const [textEdit, setTextEdit] = useState(null); // { x, y, txt, id? }
  const u = unit(page);
  const height = (width * page.h) / page.w;
  const k = width / page.w; // px écran par px naturel

  const pt = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * page.w, ((e.clientY - r.top) / r.height) * page.h];
  };

  const erasing = useRef(false);
  const eraseAt = (x, y) => {
    const hit = [...shapes].reverse().find((s) => hitTest(s, x, y, 8 * u));
    if (hit) setShapes((arr) => arr.filter((s) => s.id !== hit.id));
  };

  const down = (e) => {
    if (tool === 'hand' || e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault(); // évite que le clic ne retire le focus de la zone de texte qui va s'ouvrir
    const [x, y] = pt(e);
    if (tool === 'eraser') { erasing.current = true; svgRef.current.setPointerCapture(e.pointerId); eraseAt(x, y); return; }
    if (tool === 'text') {
      const hit = [...shapes].reverse().find((s) => s.t === 'text' && hitTest(s, x, y, 4 * u));
      if (hit) setTextEdit({ x: hit.x, y: hit.y, txt: hit.txt, id: hit.id, c: hit.c, s: hit.s });
      else setTextEdit({ x, y, txt: '', c: color, s: 24 * u });
      return;
    }
    if (tool === 'stamp') {
      setShapes((arr) => [...arr, { id: uid('a'), t: 'stamp', x, y, c: color, s: 26 * u, txt: stamp }]);
      return;
    }
    svgRef.current.setPointerCapture(e.pointerId);
    if (tool === 'pen') setDraft({ id: uid('a'), t: 'pen', c: color, w: 3 * u, pts: [[x, y]] });
    else if (tool === 'hl') setDraft({ id: uid('a'), t: 'hl', c: hlColor, w: 16 * u, pts: [[x, y]] });
    else if (tool === 'line' || tool === 'wave') setDraft({ id: uid('a'), t: tool, c: color, w: (tool === 'wave' ? 2.4 : 3) * u, x1: x, y1: y, x2: x, y2: y });
    else if (tool === 'ellipse') setDraft({ id: uid('a'), t: 'ellipse', c: color, w: 3 * u, x, y, rx: 0, ry: 0, ox: x, oy: y });
  };

  const move = (e) => {
    if (erasing.current) { const [x, y] = pt(e); eraseAt(x, y); return; }
    if (!draft) return;
    const [x, y] = pt(e);
    const shift = e.shiftKey;
    setDraft((d) => {
      if (!d) return d;
      if (d.t === 'pen' || d.t === 'hl') {
        const last = d.pts[d.pts.length - 1];
        if (Math.hypot(x - last[0], y - last[1]) < 1.2 * u) return d;
        // Surligneur : Maj maintenue = trait parfaitement horizontal
        const np = d.t === 'hl' && shift ? [x, d.pts[0][1]] : [x, y];
        return { ...d, pts: [...d.pts, np] };
      }
      if (d.t === 'line' || d.t === 'wave') {
        // aimantation horizontale (sauf Maj) : souligner une ligne d'écriture
        return { ...d, x2: x, y2: shift ? y : (Math.abs(y - d.y1) < 10 * u ? d.y1 : y) };
      }
      if (d.t === 'ellipse') return { ...d, x: (d.ox + x) / 2, y: (d.oy + y) / 2, rx: Math.abs(x - d.ox) / 2, ry: Math.abs(y - d.oy) / 2 };
      return d;
    });
  };

  const up = () => {
    if (erasing.current) { erasing.current = false; return; }
    if (!draft) return;
    const d = draft; setDraft(null);
    if ((d.t === 'line' || d.t === 'wave') && Math.hypot(d.x2 - d.x1, d.y2 - d.y1) < 4 * u) return;
    if (d.t === 'ellipse' && (d.rx < 3 * u || d.ry < 3 * u)) return;
    const { ox, oy, ...clean } = d;
    setShapes((arr) => [...arr, clean]);
  };

  const commitText = () => {
    const t = textEdit; setTextEdit(null);
    if (!t) return;
    const txt = t.txt.replace(/\s+$/, '');
    if (t.id) setShapes((arr) => (txt ? arr.map((s) => (s.id === t.id ? { ...s, txt } : s)) : arr.filter((s) => s.id !== t.id)));
    else if (txt) setShapes((arr) => [...arr, { id: uid('a'), t: 'text', x: t.x, y: t.y, c: t.c, s: t.s, txt }]);
  };

  const cursor = { pen: 'crosshair', hl: 'crosshair', line: 'crosshair', wave: 'crosshair', ellipse: 'crosshair', text: 'text', stamp: 'copy', eraser: 'cell', hand: 'grab' }[tool];

  return (
    <div className="page-wrap" style={{ width, height }}>
      <div className="page-label">Page {index + 1}/{count}</div>
      {url ? <img src={url} alt={`Page ${index + 1}`} draggable={false} /> : <div style={{ width: '100%', height: '100%', background: 'var(--surface3)' }} />}
      <svg ref={svgRef} className="ann" viewBox={`0 0 ${page.w} ${page.h}`} preserveAspectRatio="none"
        style={{ cursor, pointerEvents: tool === 'hand' ? 'none' : 'auto' }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        {shapes.filter((s) => !(textEdit?.id && s.id === textEdit.id)).map((s) => <Shape key={s.id} s={s} />)}
        {draft && <Shape s={draft} />}
      </svg>
      {textEdit && (
        <textarea className="ann-text-input" autoFocus value={textEdit.txt}
          style={{ left: textEdit.x * k - 6, top: textEdit.y * k - 4, fontSize: Math.max(11, textEdit.s * k), color: textEdit.c, fontStyle: 'italic', lineHeight: 1.2, width: Math.max(180, (Math.max(...textEdit.txt.split('\n').map((l) => l.length), 8) + 2) * textEdit.s * k * 0.55), height: (textEdit.txt.split('\n').length * 1.2 + 0.6) * Math.max(11, textEdit.s * k) }}
          onChange={(e) => setTextEdit({ ...textEdit, txt: e.target.value })}
          onBlur={commitText}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitText(); } if (e.key === 'Escape') setTextEdit(null); e.stopPropagation(); }}
          placeholder="Commentaire… (Entrée pour valider, Maj+Entrée pour une nouvelle ligne)" />
      )}
      <div className="page-tools">
        <button onClick={onRotate} title="Pivoter de 90°"><Icon name="rotate" /></button>
        {index > 0 && <button onClick={() => onMove(-1)} title="Monter la page"><Icon name="chevronUp" /></button>}
        {index < count - 1 && <button onClick={() => onMove(1)} title="Descendre la page"><Icon name="chevronDown" /></button>}
        <button onClick={onRemove} title="Supprimer la page"><Icon name="trash" /></button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Panneau de notation (grille interactive)
// ═══════════════════════════════════════════════════════════════════════════
function quickValues(max) {
  if (max <= 0) return [0];
  if (max <= 4) { const v = []; for (let x = 0; x <= max + 1e-9; x += 0.5) v.push(Math.round(x * 2) / 2); return v; }
  if (max <= 10) { const v = []; for (let x = 0; x <= max + 1e-9; x += 1) v.push(x); if (v[v.length - 1] !== max) v.push(max); return v; }
  return [0, max / 4, max / 2, (3 * max) / 4, max].map((x) => Math.round(x * 2) / 2);
}

function ScorePanel({ ev, copy, student, updateCopy, onValidate, onAbsent, settings }) {
  const grid = ev.grid;
  const res = computeNote(grid, copy);
  const manual = copy?.manualNote != null && copy.manualNote !== '';
  const note = manual ? Number(copy.manualNote) : res.note;
  const status = copyStatus(copy);
  const [showManual, setShowManual] = useState(manual);
  useEffect(() => setShowManual(manual), [student.id]); // eslint-disable-line

  const setScore = (cid, v) => updateCopy((c) => { c.scores = { ...c.scores, [cid]: v }; });
  const setLevel = (cid, li) => updateCopy((c) => { const cur = c.levels?.[cid]; c.levels = { ...c.levels, [cid]: cur === li ? null : li }; });
  const appendComment = (t) => updateCopy((c) => { c.comment = c.comment ? `${c.comment.replace(/\s+$/, '')} ${t}` : t; });
  const fullMarks = () => updateCopy((c) => {
    grid.criteria.filter((x) => x.kind !== 'section').forEach((x) => {
      if (grid.mode === 'niveaux') c.levels = { ...c.levels, [x.id]: grid.levels.length - 1 };
      else c.scores = { ...c.scores, [x.id]: x.max };
    });
  });
  const reset = () => updateCopy((c) => { c.scores = {}; c.levels = {}; c.bonus = 0; c.manualNote = null; });

  const ratio = note != null ? note / grid.scale : null;
  const noteColor = ratio == null ? 'var(--text3)' : ratio >= 0.75 ? 'var(--success)' : ratio >= 0.6 ? 'var(--accent)' : ratio >= 0.4 ? 'var(--warning)' : 'var(--danger)';

  return (
    <>
      <div className="score-hero">
        <div className="score-big" style={{ color: noteColor }}>{copy?.absent ? 'Abs' : note == null ? '–' : fmt(note, 2)}<small> /{grid.scale}</small></div>
        <div className="score-meta" style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: '.84rem' }}>{studentName(student, 'prenom')}</div>
          <div>{manual ? 'Note saisie manuellement' : `${fmt(res.raw, 2)} / ${fmt(res.max, 2)} pts · ${res.filled}/${res.total} critères`}</div>
          <div className="progress" style={{ marginTop: 5, width: 150 }}><div style={{ width: `${res.total ? (res.filled / res.total) * 100 : 0}%`, background: res.complete ? 'var(--success)' : undefined }} /></div>
        </div>
        <Menu trigger={({ toggle }) => <button className="btn btn-quiet btn-icon" onClick={toggle}><Icon name="more" /></button>}
          items={[
            { icon: 'sparkles', label: 'Tout au maximum', onClick: fullMarks },
            { icon: 'edit', label: showManual ? 'Masquer la note manuelle' : 'Saisir la note manuellement', onClick: () => setShowManual(!showManual) },
            { icon: 'user', label: copy?.absent ? 'Marquer présent(e)' : 'Marquer absent(e)', onClick: onAbsent },
            '-',
            { icon: 'undo', label: 'Réinitialiser la notation', danger: true, onClick: reset },
          ]} />
      </div>

      <div className="panel-scroll scroll">
        {grid.criteria.map((c) => {
          if (c.kind === 'section') return <div key={c.id} className="section-label">{c.label}</div>;
          const pts = critPoints(grid, copy, c);
          return (
            <div key={c.id} className={`crit ${pts != null ? 'filled' : ''}`}>
              <div className="crit-hd">
                <div className="crit-label">{c.label}{c.desc && <div className="crit-desc">{c.desc}</div>}</div>
                {grid.mode === 'niveaux' ? (
                  <div className="crit-max">{pts != null ? <b style={{ color: 'var(--text)', fontSize: '.84rem' }}>{fmt(pts, 2)}</b> : '–'} / {fmt(c.max, 2)}</div>
                ) : (
                  <div className="crit-max row" style={{ gap: '.3rem' }}>
                    <input className="input input-sm input-num" style={{ width: 58 }} type="number" min="0" max={c.max} step="0.25" value={copy?.scores?.[c.id] ?? ''} placeholder="–"
                      onChange={(e) => setScore(c.id, e.target.value === '' ? null : clamp(Number(e.target.value), 0, Number(c.max)))} />
                    / {fmt(c.max, 2)}
                  </div>
                )}
              </div>
              {grid.mode === 'niveaux' ? (
                <div className="lvl-row" style={{ gridTemplateColumns: `repeat(${grid.levels.length}, 1fr)` }}>
                  {grid.levels.map((l, li) => {
                    const on = copy?.levels?.[c.id] === li;
                    return <button key={li} className={`lvl ${on ? 'on' : ''}`} style={on ? { background: l.color } : undefined} onClick={() => setLevel(c.id, li)} title={l.label}><b>{l.short}</b>{fmt(c.max * l.ratio, 1)} pt</button>;
                  })}
                </div>
              ) : (
                <div className="crit-ctl">
                  {quickValues(Number(c.max)).map((v) => <button key={v} className={`qbtn ${pts === v ? 'on' : ''}`} onClick={() => setScore(c.id, pts === v ? null : v)}>{fmt(v, 2)}</button>)}
                </div>
              )}
            </div>
          );
        })}

        <div className="section-label">Ajustements</div>
        <div className="row" style={{ gap: '.5rem' }}>
          <span style={{ fontSize: '.78rem', fontWeight: 600, flex: 1 }}>Bonus / pénalité <span className="faint" style={{ fontWeight: 400 }}>(en points de grille)</span></span>
          <button className="btn btn-sm btn-icon" onClick={() => updateCopy((c) => { c.bonus = (Number(c.bonus) || 0) - 0.5; })}><Icon name="minus" /></button>
          <input className="input input-sm input-num" type="number" step="0.5" value={copy?.bonus || 0} onChange={(e) => updateCopy((c) => { c.bonus = Number(e.target.value) || 0; })} />
          <button className="btn btn-sm btn-icon" onClick={() => updateCopy((c) => { c.bonus = (Number(c.bonus) || 0) + 0.5; })}><Icon name="plus" /></button>
        </div>
        {showManual && (
          <div className="row mt-1" style={{ gap: '.5rem' }}>
            <span style={{ fontSize: '.78rem', fontWeight: 600, flex: 1 }}>Note finale forcée <span className="faint" style={{ fontWeight: 400 }}>(remplace le calcul)</span></span>
            <input className="input input-sm input-num" type="number" min="0" max={grid.scale} step="0.25" value={copy?.manualNote ?? ''} placeholder="auto"
              onChange={(e) => updateCopy((c) => { c.manualNote = e.target.value === '' ? null : clamp(Number(e.target.value), 0, Number(grid.scale)); })} />
            <span className="faint" style={{ fontSize: '.74rem' }}>/{grid.scale}</span>
          </div>
        )}

        <div className="section-label">Appréciation</div>
        <textarea className="textarea" style={{ minHeight: 82 }} value={copy?.comment || ''} placeholder={`Appréciation pour ${student.prenom || 'l\'élève'}…`}
          onChange={(e) => updateCopy((c) => { c.comment = e.target.value; })} />
        <div className="chips mt-1">
          {(settings.quickComments || []).map((t) => <button key={t} className="chip" onClick={() => appendComment(t)}>{t}</button>)}
        </div>
      </div>

      <div className="panel-ft">
        {status === 'done'
          ? <button className="btn btn-block" onClick={() => updateCopy((c) => { c.status = 'progress'; })}><Icon name="edit" />Rouvrir la copie</button>
          : null}
        <button className="btn btn-success btn-block" onClick={onValidate} disabled={copy?.absent} title="Ctrl/Cmd + Entrée">
          <Icon name="check" />{status === 'done' ? 'Copie suivante' : 'Valider et passer à la suivante'}
        </button>
      </div>
    </>
  );
}
