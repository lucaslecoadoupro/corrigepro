import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Modal, ScaledSheet } from './ui.jsx';
import { Icon } from './icons.jsx';
import { printNow, isDesktop } from './platform.js';
import { useToast } from './store.jsx';

const PREVIEW_MAX = 16;

function waitForImages(root) {
  const imgs = [...root.querySelectorAll('img')];
  return Promise.all(imgs.map((im) => (im.complete && im.naturalWidth ? Promise.resolve() : new Promise((r) => { im.onload = r; im.onerror = r; setTimeout(r, 8000); }))));
}

// Rend les feuilles dans #print-root puis lance l'impression système
export function usePrintJob() {
  const [job, setJob] = useState(null);
  const toast = useToast();
  useEffect(() => {
    if (!job) return undefined;
    let cancelled = false;
    const style = document.createElement('style');
    style.id = 'cp-page-size';
    style.textContent = `@page { size: A4 ${job.orientation}; margin: 0; }`;
    document.head.appendChild(style);
    (async () => {
      const root = document.getElementById('print-root');
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      await waitForImages(root);
      if (document.fonts?.ready) await document.fonts.ready;
      await new Promise((r) => setTimeout(r, 120));
      if (cancelled) return;
      const res = await printNow({ landscape: job.orientation === 'landscape', title: job.title, pdf: job.pdf });
      if (res?.ok && job.pdf && res.path) toast?.('PDF enregistré', 'success');
      else if (res && res.ok === false && res.error) toast?.(`Impression impossible : ${res.error}`, 'error');
      setJob(null);
    })();
    return () => { cancelled = true; style.remove(); };
  }, [job, toast]);

  const portal = job ? createPortal(<>{job.sheets}</>, document.getElementById('print-root')) : null;
  return { start: (j) => setJob(j), busy: !!job, portal };
}

// Fenêtre d'aperçu avant impression
export function PrintDialog({ title, sub, orientation, sheets, options, onClose, fileName }) {
  const { start, busy, portal } = usePrintJob();
  const pw = orientation === 'landscape' ? 520 : 380;
  const shown = sheets.slice(0, PREVIEW_MAX);
  return (
    <Modal title={title} sub={sub} icon="printer" onClose={onClose} size="xwide"
      footer={<>
        <span className="faint" style={{ fontSize: '.74rem', marginRight: 'auto' }}>
          <Icon name="file" size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />
          {sheets.length} feuille{sheets.length > 1 ? 's' : ''} A4 · {orientation === 'landscape' ? 'paysage' : 'portrait'}
        </span>
        <button className="btn" onClick={onClose}>Fermer</button>
        {isDesktop && <button className="btn" disabled={busy || !sheets.length} onClick={() => start({ sheets, orientation, title: fileName || title, pdf: true })}><Icon name="pdf" />Enregistrer en PDF</button>}
        <button className="btn btn-primary" disabled={busy || !sheets.length} onClick={() => start({ sheets, orientation, title: fileName || title, pdf: false })}><Icon name="printer" />{busy ? 'Préparation…' : 'Imprimer'}</button>
      </>}>
      <div className="print-layout" style={{ gridTemplateColumns: options ? '290px 1fr' : '1fr' }}>
        {options && <div className="stack" style={{ overflowY: 'auto', paddingRight: '.25rem' }}>{options}</div>}
        <div className="print-preview scroll">
          {shown.map((s, i) => <ScaledSheet key={i} width={pw} orientation={orientation}>{s}</ScaledSheet>)}
          {sheets.length > PREVIEW_MAX && <div className="faint" style={{ fontSize: '.76rem' }}>… et {sheets.length - PREVIEW_MAX} autre(s) feuille(s), incluses à l'impression.</div>}
          {!sheets.length && <div className="faint" style={{ margin: 'auto' }}>Rien à imprimer avec ces options.</div>}
        </div>
      </div>
      {portal}
    </Modal>
  );
}
