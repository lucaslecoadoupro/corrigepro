import React from 'react';
import { FitBox, useBlobUrl } from './ui.jsx';
import { AnnotationSvg } from './annotations.jsx';
import { computeNote, critPoints, fmt, gridMax } from './utils.js';

// ═══════════════════════════════════════════════════════════════════════════
// Grille d'évaluation (contenu d'un emplacement de feuille)
// fill = { student, className, date, copy } → grille complétée ; sinon vierge
// ═══════════════════════════════════════════════════════════════════════════
export function GridContent({ grid, fill, compact, teacher }) {
  const crits = grid.criteria || [];
  const niveaux = grid.mode === 'niveaux';
  const max = gridMax(grid);
  const copy = fill?.copy;
  const res = copy ? computeNote(grid, copy) : null;
  const note = copy?.manualNote != null && copy.manualNote !== '' ? Number(copy.manualNote) : res?.note;
  const showNote = copy && note != null && !copy.absent;
  const fieldsOn = grid.fields || {};
  const scaleDiffers = Math.abs(max - grid.scale) > 0.001;

  return (
    <div className={`gs ${compact ? 'compact' : ''}`}>
      <div className="gs-hd">
        <div className="gs-hd-main">
          {grid.type && <div className="gs-type">{grid.type}</div>}
          <div className="gs-title">{grid.title || 'Grille d\'évaluation'}</div>
          {(grid.subtitle || fill?.evalTitle) && <div className="gs-subtitle">{[fill?.evalTitle !== grid.title ? fill?.evalTitle : null, grid.subtitle].filter(Boolean).join(' · ')}</div>}
        </div>
        <div className="gs-note">
          <div className="gs-note-label">Note</div>
          <div className={`gs-note-val ${showNote ? 'filled' : ''}`}>
            {copy?.absent ? <span style={{ fontSize: '11pt' }}>ABS</span> : showNote ? fmt(note, 2) : <span className="blank" />}
            <small> /{grid.scale}</small>
          </div>
        </div>
      </div>

      {(fieldsOn.nom || fieldsOn.classe || fieldsOn.date) && (
        <div className="gs-fields">
          {fieldsOn.nom && <div className="gs-field name" style={{ flex: 2.2 }}><b>Nom, prénom :</b><span>{fill?.student || ''}</span></div>}
          {fieldsOn.classe && <div className="gs-field" style={{ flex: 0.9 }}><b>Classe :</b><span>{fill?.className || ''}</span></div>}
          {fieldsOn.date && <div className="gs-field" style={{ flex: 1 }}><b>Date :</b><span>{fill?.date || ''}</span></div>}
        </div>
      )}

      {grid.instructions && <div className="gs-instr">{grid.instructions}</div>}

      <table className="gs-table">
        <thead>
          <tr>
            <th>Critères</th>
            {niveaux && grid.levels.map((l) => <th key={l.short} className="lvl-th">{l.short}<small>{l.label.replace('Maîtrise ', '').replace('maîtrise', '')}</small></th>)}
            <th className="c" style={{ width: niveaux ? '18mm' : '24mm' }}>{niveaux ? 'Points' : 'Points'}</th>
          </tr>
        </thead>
        <tbody>
          {crits.map((c) => {
            if (c.kind === 'section') return <tr key={c.id} className="sect"><td colSpan={niveaux ? grid.levels.length + 2 : 2}>{c.label}</td></tr>;
            const pts = copy ? critPoints(grid, copy, c) : null;
            const li = copy?.levels?.[c.id];
            return (
              <tr key={c.id}>
                <td>
                  <div className="crit-name">{c.label}</div>
                  {grid.showDesc && c.desc && <div className="crit-d">{c.desc}</div>}
                </td>
                {niveaux && grid.levels.map((l, i) => <td key={l.short} className="c"><span className={`box ${li === i ? 'x' : ''}`} /></td>)}
                <td className="c pts">
                  {pts != null ? <span className="val">{fmt(pts, 2)}</span> : <span className="blank" />} / {fmt(c.max, 2)}
                </td>
              </tr>
            );
          })}
          {copy && Number(copy.bonus) ? (
            <tr><td colSpan={niveaux ? grid.levels.length + 1 : 1}><div className="crit-name">{Number(copy.bonus) > 0 ? 'Bonus' : 'Pénalité'}</div></td><td className="c pts"><span className="val">{Number(copy.bonus) > 0 ? '+' : ''}{fmt(Number(copy.bonus), 2)}</span></td></tr>
          ) : null}
          <tr className="total">
            <td colSpan={niveaux ? grid.levels.length + 1 : 1}>
              Total{scaleDiffers ? <span style={{ fontWeight: 500, fontSize: '7.5pt', color: '#555' }}> — ramené sur {grid.scale}</span> : null}
            </td>
            <td className="c pts">{res && res.filled ? <span className="val">{fmt(res.raw, 2)}</span> : <span className="blank" />} / {fmt(max, 2)}</td>
          </tr>
        </tbody>
      </table>

      {niveaux && grid.showLegend && (
        <div className="gs-legend">{grid.levels.map((l) => <span key={l.short}><b>{l.short}</b> : {l.label} ({fmt(l.ratio * 100, 0)} %)</span>)}</div>
      )}

      {(grid.commentLines > 0 || copy?.comment) && (
        <div className="gs-comment">
          <div className="gs-comment-label">Appréciation</div>
          {copy?.comment
            ? <div className="gs-comment-text">{copy.comment}</div>
            : <div className="gs-lines">{Array.from({ length: grid.commentLines }, (_, i) => <div key={i} />)}</div>}
        </div>
      )}

      {grid.showSignature && (
        <div className="gs-sign"><div>Signature des parents</div><div>Signature de l'élève</div></div>
      )}
      {teacher && <div className="gs-foot"><span>{teacher}</span><span /></div>}
    </div>
  );
}

// Une feuille A4 contenant 1 ou 2 grilles
export function GridSheet({ grid, slots, teacher }) {
  const two = Number(grid.perSheet) === 2;
  const orient = grid.orientation === 'landscape' ? 'landscape' : 'portrait';
  const list = two ? [slots[0], slots[1]] : [slots[0]];
  return (
    <div className={`sheet ${orient}`}>
      <div className={`sheet-slots ${two ? 'two' : ''}`}>
        {list.map((fill, i) => (
          <div className="sheet-slot" key={i}>
            {fill !== undefined && (
              <FitBox deps={[grid, fill]}>
                <GridContent grid={grid} fill={fill} compact={two} teacher={teacher} />
              </FitBox>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Regroupe des grilles (une par élève ou vierges) en feuilles
export function buildGridSheets(grid, fills, teacher) {
  const per = Number(grid.perSheet) === 2 ? 2 : 1;
  const sheets = [];
  for (let i = 0; i < fills.length; i += per) {
    const slots = fills.slice(i, i + per);
    sheets.push(<GridSheet key={i} grid={grid} slots={slots} teacher={teacher} />);
  }
  return sheets;
}

// ═══════════════════════════════════════════════════════════════════════════
// Page de copie annotée, ajustée dans une zone (en mm) d'une feuille
// ═══════════════════════════════════════════════════════════════════════════
export function CopyInBox({ page, shapes, box }) {
  const url = useBlobUrl(page.id, page.v || 0);
  const ratio = page.w / page.h;
  let w = box.w; let h = w / ratio;
  if (h > box.h) { h = box.h; w = h * ratio; }
  return (
    <div className="pp-copy" style={{ left: `${box.x}mm`, top: `${box.y}mm`, width: `${box.w}mm`, height: `${box.h}mm` }}>
      <div className="pp-copy-inner" style={{ width: `${w}mm`, height: `${h}mm` }}>
        {url && <img src={url} alt="" />}
        <AnnotationSvg page={page} shapes={shapes} />
      </div>
    </div>
  );
}

// Côte à côte (A4 paysage) : copie à gauche, grille à droite sur la 1re page,
// puis pages suivantes de la copie deux par deux.
export function SideBySideSheets({ grid, fill, copy, teacher, keyPrefix = '' }) {
  const pages = copy?.pages || [];
  const out = [];
  const M = 8; // marge en mm
  const first = pages[0];
  out.push(
    <div key={keyPrefix + 'p0'} className="sheet landscape">
      {first ? (
        <CopyInBox page={first} shapes={copy.ann?.[first.id]} box={{ x: M, y: M, w: 297 * 0.55 - M * 1.5, h: 210 - 2 * M }} />
      ) : (
        <div style={{ position: 'absolute', left: `${M}mm`, top: `${M}mm`, width: `${297 * 0.55 - M * 1.5}mm`, height: `${210 - 2 * M}mm`, border: '0.3mm dashed #ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa', fontSize: '10pt' }}>Aucune copie numérisée</div>
      )}
      <div style={{ position: 'absolute', left: `${297 * 0.55}mm`, top: 0, width: `${297 * 0.45}mm`, height: '210mm' }}>
        <FitBox deps={[grid, fill, copy]}><GridContent grid={grid} fill={fill} compact teacher={teacher} /></FitBox>
      </div>
    </div>,
  );
  const rest = pages.slice(1);
  for (let i = 0; i < rest.length; i += 2) {
    const a = rest[i]; const b = rest[i + 1];
    const half = (297 - 3 * M) / 2;
    out.push(
      <div key={keyPrefix + 'p' + (i + 1)} className="sheet landscape">
        <div className="pp-tag">{fill?.student} — suite</div>
        <CopyInBox page={a} shapes={copy.ann?.[a.id]} box={{ x: M, y: M + 4, w: half, h: 210 - 2 * M - 4 }} />
        {b && <CopyInBox page={b} shapes={copy.ann?.[b.id]} box={{ x: 2 * M + half, y: M + 4, w: half, h: 210 - 2 * M - 4 }} />}
      </div>,
    );
  }
  return out;
}

// Copie puis grille (A4 portrait) : chaque page de copie en pleine page, puis la grille
export function SequentialSheets({ grid, fill, copy, teacher, keyPrefix = '' }) {
  const pages = copy?.pages || [];
  const out = pages.map((p, i) => (
    <div key={keyPrefix + 'c' + i} className="sheet portrait">
      <CopyInBox page={p} shapes={copy.ann?.[p.id]} box={{ x: 8, y: 8, w: 194, h: 281 }} />
    </div>
  ));
  out.push(<GridSheet key={keyPrefix + 'g'} grid={{ ...grid, orientation: 'portrait', perSheet: 1 }} slots={[fill]} teacher={teacher} />);
  return out;
}
