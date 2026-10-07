import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './icons.jsx';
import { blobs } from './platform.js';
import { fmt } from './utils.js';

// ── En-tête de page (dégradé ClassPro) ──────────────────────────────────────
export function PageHeader({ badge, badgeIcon, title, sub, actions, stats, onBack, backLabel = 'Retour' }) {
  return (
    <div className="page-hd">
      <div className="hd-drag" />
      <div style={{ position: 'relative', zIndex: 1, minWidth: 0 }}>
        {onBack && <button className="phd-back" onClick={onBack}><Icon name="arrowLeft" />{backLabel}</button>}
        {badge && <div className="phd-badge">{badgeIcon && <Icon name={badgeIcon} />}{badge}</div>}
        <div className="phd-title">{title}</div>
        {sub && <div className="phd-sub">{sub}</div>}
      </div>
      {actions && <div className="phd-actions">{actions}</div>}
      {stats && (
        <div className="phd-stats">
          {stats.map((s) => (
            <div className="phstat" key={s.label}>
              <div className="phstat-label">{s.label}</div>
              <div className="phstat-value">{s.value}{s.unit && <small>{s.unit}</small>}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Empty({ icon = 'info', title, sub, children }) {
  return (
    <div className="empty">
      <div className="empty-icon"><Icon name={icon} /></div>
      <div className="empty-title">{title}</div>
      {sub && <div className="empty-sub">{sub}</div>}
      {children && <div className="row mt-1">{children}</div>}
    </div>
  );
}

export function Field({ label, hint, children, style }) {
  return (
    <label className="field" style={style}>
      {label && <span className="field-label">{label}</span>}
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Switch({ checked, onChange, label }) {
  return (
    <label className="switch">
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="track" />
      {label}
    </label>
  );
}

export function Seg({ value, options, onChange, block }) {
  return (
    <div className={`seg ${block ? 'block' : ''}`}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)} title={o.title}>
          {o.icon && <Icon name={o.icon} />}{o.label}
        </button>
      ))}
    </div>
  );
}

// ── Modale ──────────────────────────────────────────────────────────────────
export function Modal({ title, sub, icon = 'info', onClose, children, footer, size, bodyStyle }) {
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return createPortal(
    <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className={`modal ${size || ''}`} role="dialog" aria-modal="true">
        <div className="modal-hd">
          <div className="modal-hd-icon"><Icon name={icon} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="modal-title">{title}</div>
            {sub && <div className="modal-sub">{sub}</div>}
          </div>
          <button className="btn btn-quiet btn-icon" onClick={onClose} aria-label="Fermer"><Icon name="x" /></button>
        </div>
        <div className="modal-body" style={bodyStyle}>{children}</div>
        {footer && <div className="modal-ft">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

// ── Confirmation ────────────────────────────────────────────────────────────
const ConfirmCtx = createContext(null);
export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const confirm = useCallback((opts) => new Promise((resolve) => setState({ ...opts, resolve })), []);
  const close = (v) => { state?.resolve(v); setState(null); };
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {state && (
        <Modal title={state.title || 'Confirmer'} icon={state.danger ? 'alert' : 'info'} onClose={() => close(false)}
          footer={<>
            <button className="btn" onClick={() => close(false)}>Annuler</button>
            <button className={`btn ${state.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => close(true)} autoFocus>{state.confirmLabel || 'Confirmer'}</button>
          </>}>
          <div style={{ fontSize: '.84rem', lineHeight: 1.6, color: 'var(--text2)' }}>{state.message}</div>
        </Modal>
      )}
    </ConfirmCtx.Provider>
  );
}
export const useConfirm = () => useContext(ConfirmCtx);

// ── Menu déroulant ──────────────────────────────────────────────────────────
export function Menu({ trigger, items, align = 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const h = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  return (
    <div className="menu-wrap" ref={ref} onClick={(e) => e.stopPropagation()}>
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div className={`menu ${align === 'left' ? 'left' : ''}`}>
          {items.filter(Boolean).map((it, i) => (it === '-' ? <div key={i} className="menu-sep" /> : (
            <button key={i} className={`menu-item ${it.danger ? 'danger' : ''}`} disabled={it.disabled} onClick={() => { setOpen(false); it.onClick(); }}>
              {it.icon && <Icon name={it.icon} />}
              <span>{it.label}{it.hint && <small>{it.hint}</small>}</span>
            </button>
          )))}
        </div>
      )}
    </div>
  );
}

// ── Image de copie (résolution asynchrone de l'URL) ─────────────────────────
export function useBlobUrl(id, v = 0) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let alive = true;
    if (!id) { setUrl(null); return undefined; }
    blobs.url(id, v).then((u) => { if (alive) setUrl(u); });
    return () => { alive = false; };
  }, [id, v]);
  return url;
}

// ── Mise à l'échelle automatique d'un contenu dans une boîte fixe ──────────
// Utilisé pour faire tenir une grille dans une demi-page A4.
export function FitBox({ children, deps = [] }) {
  const outer = useRef(null);
  const inner = useRef(null);
  const [k, setK] = useState(1);
  useLayoutEffect(() => {
    const o = outer.current; const i = inner.current;
    if (!o || !i) return;
    i.style.transform = 'none';
    i.style.width = `${o.clientWidth}px`;
    const need = i.scrollHeight;
    const avail = o.clientHeight;
    let s = need > avail ? avail / need : 1;
    if (s < 1) { // on élargit le contenu pour qu'il garde ses proportions après réduction
      i.style.width = `${o.clientWidth / s}px`;
      const need2 = i.scrollHeight;
      s = Math.min(1, avail / need2);
    }
    i.style.transform = `scale(${s})`;
    setK(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return (
    <div className="fitbox" ref={outer} data-scale={k}>
      <div className="fitbox-inner" ref={inner}>{children}</div>
    </div>
  );
}

// ── Aperçu réduit d'une feuille A4 (mm → px) ────────────────────────────────
export function ScaledSheet({ width, children, orientation = 'portrait' }) {
  const mmW = orientation === 'portrait' ? 210 : 297;
  const mmH = orientation === 'portrait' ? 297 : 210;
  const pxW = mmW * 3.7795;
  const k = width / pxW;
  return (
    <div className="pv-page" style={{ width, height: mmH * 3.7795 * k, position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
      <div style={{ transform: `scale(${k})`, transformOrigin: 'top left', position: 'absolute', top: 0, left: 0 }}>{children}</div>
    </div>
  );
}

// ── Graphiques SVG ──────────────────────────────────────────────────────────
export function LineChart({ series, labels, height = 230, yMax = 20, yStep = 5, refLine }) {
  const wrap = useRef(null);
  const [w, setW] = useState(600);
  const [hover, setHover] = useState(null);
  useLayoutEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    if (wrap.current) ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);
  const pad = { l: 34, r: 14, t: 14, b: 42 };
  const iw = Math.max(10, w - pad.l - pad.r); const ih = height - pad.t - pad.b;
  const n = labels.length;
  const x = (i) => pad.l + (n <= 1 ? iw / 2 : (i * iw) / (n - 1));
  const y = (v) => pad.t + ih - (v / yMax) * ih;
  const ticks = []; for (let v = 0; v <= yMax; v += yStep) ticks.push(v);
  return (
    <div className="chart-wrap" ref={wrap}>
      <svg width={w} height={height} style={{ display: 'block' }} onMouseLeave={() => setHover(null)}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={w - pad.r} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeDasharray={v === 0 ? '' : '3 4'} />
            <text x={pad.l - 8} y={y(v) + 3.5} textAnchor="end" fontSize="10" fill="var(--text3)">{v}</text>
          </g>
        ))}
        {refLine != null && <line x1={pad.l} x2={w - pad.r} y1={y(refLine)} y2={y(refLine)} stroke="var(--text3)" strokeWidth="1" strokeDasharray="6 4" opacity=".7" />}
        {labels.map((l, i) => {
          const room = n > 1 ? iw / (n - 1) : iw;
          const maxC = Math.max(6, Math.floor(room / 6.2));
          const anchor = n > 1 && i === 0 ? 'start' : n > 1 && i === n - 1 ? 'end' : 'middle';
          const tx = anchor === 'start' ? x(i) - 6 : anchor === 'end' ? x(i) + 6 : x(i);
          return <text key={i} x={tx} y={height - pad.b + 16} textAnchor={anchor} fontSize="10" fill="var(--text2)">{l.length > maxC ? l.slice(0, maxC - 1) + '…' : l}<title>{l}</title></text>;
        })}
        {series.map((s) => {
          const pts = s.values.map((v, i) => (v == null ? null : [x(i), y(v)]));
          const segs = []; let cur = [];
          pts.forEach((p) => { if (p) cur.push(p); else if (cur.length) { segs.push(cur); cur = []; } });
          if (cur.length) segs.push(cur);
          return (
            <g key={s.name}>
              {s.area && segs.map((sg, k) => sg.length > 1 && (
                <path key={'a' + k} d={`M${sg[0][0]},${y(0)} ` + sg.map((p) => `L${p[0]},${p[1]}`).join(' ') + ` L${sg[sg.length - 1][0]},${y(0)} Z`} fill={s.color} opacity=".08" />
              ))}
              {segs.map((sg, k) => <polyline key={k} points={sg.map((p) => p.join(',')).join(' ')} fill="none" stroke={s.color} strokeWidth={s.width || 2.2} strokeDasharray={s.dash || ''} strokeLinejoin="round" strokeLinecap="round" />)}
              {pts.map((p, i) => p && <circle key={i} cx={p[0]} cy={p[1]} r={hover === i ? 5 : 3.5} fill="var(--surface)" stroke={s.color} strokeWidth="2" />)}
            </g>
          );
        })}
        {labels.map((_, i) => (
          <rect key={i} x={x(i) - (n > 1 ? iw / (n - 1) / 2 : iw / 2)} y={pad.t} width={n > 1 ? iw / (n - 1) : iw} height={ih} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} stroke="var(--text3)" strokeWidth="1" opacity=".5" pointerEvents="none" />}
      </svg>
      {hover != null && (
        <div className="chart-tip" style={{ left: x(hover), top: pad.t + 10 }}>
          <b>{labels[hover]}</b>
          {series.map((s) => <div key={s.name}><span style={{ color: s.color }}>●</span> {s.name} : {s.values[hover] == null ? '–' : fmt(s.values[hover], 2)}</div>)}
        </div>
      )}
    </div>
  );
}

export function Histogram({ values, max = 20, bins = 5, color = 'var(--accent)', height = 170 }) {
  const step = max / bins;
  const counts = Array.from({ length: bins }, (_, i) => values.filter((v) => (i === bins - 1 ? v >= i * step && v <= max : v >= i * step && v < (i + 1) * step)).length);
  const top = Math.max(1, ...counts);
  const colors = ['#dc2626', '#ea580c', '#d97706', '#3b5bdb', '#0f9b6e'];
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height, paddingTop: 18 }}>
      {counts.map((c, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
          <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--text2)' }}>{c || ''}</div>
          <div style={{ width: '100%', height: `${(c / top) * 100}%`, minHeight: c ? 4 : 2, background: bins === 5 ? colors[i] : color, opacity: c ? 0.85 : 0.15, borderRadius: '6px 6px 2px 2px', transition: 'height .3s' }} />
          <div style={{ fontSize: '.64rem', color: 'var(--text3)', whiteSpace: 'nowrap' }}>{fmt(i * step, 1)}–{fmt((i + 1) * step, 1)}</div>
        </div>
      ))}
    </div>
  );
}

export function Sparkline({ values, w = 90, h = 24, max = 20, color = 'var(--accent)' }) {
  const pts = values.map((v, i) => (v == null ? null : [values.length === 1 ? w / 2 : (i * (w - 6)) / (values.length - 1) + 3, h - 3 - (v / max) * (h - 6)])).filter(Boolean);
  if (!pts.length) return <span className="faint">–</span>;
  const last = pts[pts.length - 1];
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <line x1="0" x2={w} y1={h - 3 - (10 / max) * (h - 6)} y2={h - 3 - (10 / max) * (h - 6)} stroke="var(--border)" strokeDasharray="2 3" />
      {pts.length > 1 && <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />}
      <circle cx={last[0]} cy={last[1]} r="2.6" fill={color} />
    </svg>
  );
}

export function Trend({ values }) {
  const v = values.filter((x) => x != null);
  if (v.length < 2) return null;
  const d = v[v.length - 1] - v[v.length - 2];
  if (Math.abs(d) < 0.5) return <span className="pill" title="Stable">→ stable</span>;
  return d > 0
    ? <span className="pill success" title="Progression">↗ +{fmt(d, 1)}</span>
    : <span className="pill danger" title="Baisse">↘ {fmt(d, 1)}</span>;
}
