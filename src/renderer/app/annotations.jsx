import React from 'react';

// Les annotations sont stockées en pixels « naturels » de l'image de la page,
// ce qui les rend indépendantes du zoom et identiques à l'écran et à l'impression.

export const PEN_COLORS = [
  { c: '#e03131', label: 'Rouge' },
  { c: '#2f9e44', label: 'Vert' },
  { c: '#1c7ed6', label: 'Bleu' },
  { c: '#f08c00', label: 'Orange' },
  { c: '#212529', label: 'Noir' },
];
export const HL_COLORS = ['#ffe066', '#8ce99a', '#74c0fc', '#ffa8a8'];

export const unit = (page) => Math.max(page.w, page.h) / 1000;

function smoothPath(pts) {
  if (!pts.length) return '';
  if (pts.length < 3) return `M${pts[0][0]},${pts[0][1]} ` + pts.slice(1).map((p) => `L${p[0]},${p[1]}`).join(' ') + (pts.length === 1 ? ` l0.01,0` : '');
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2; const my = (pts[i][1] + pts[i + 1][1]) / 2;
    d += ` Q${pts[i][0]},${pts[i][1]} ${mx},${my}`;
  }
  const l = pts[pts.length - 1];
  return d + ` L${l[0]},${l[1]}`;
}

function wavyPath(x1, y1, x2, y2, amp) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (len < 1) return `M${x1},${y1}`;
  const ux = (x2 - x1) / len; const uy = (y2 - y1) / len;
  const nx = -uy; const ny = ux;
  const wl = amp * 3; const n = Math.max(1, Math.round(len / wl));
  let d = `M${x1},${y1}`;
  for (let i = 0; i < n; i++) {
    const t0 = (i * len) / n; const t1 = ((i + 1) * len) / n; const tm = (t0 + t1) / 2;
    const s = i % 2 ? -1 : 1;
    d += ` Q${x1 + ux * tm + nx * amp * s},${y1 + uy * tm + ny * amp * s} ${x1 + ux * t1},${y1 + uy * t1}`;
  }
  return d;
}

export function Shape({ s, selected, onPointerDown }) {
  const common = { onPointerDown, style: onPointerDown ? { cursor: 'pointer' } : undefined };
  const sel = selected ? { filter: 'drop-shadow(0 0 3px rgba(59,91,219,.9))' } : {};
  switch (s.t) {
    case 'pen':
      return <path {...common} d={smoothPath(s.pts)} fill="none" stroke={s.c} strokeWidth={s.w} strokeLinecap="round" strokeLinejoin="round" style={{ ...common.style, ...sel }} />;
    case 'hl':
      return <path {...common} d={smoothPath(s.pts)} fill="none" stroke={s.c} strokeWidth={s.w} strokeLinecap="round" strokeLinejoin="round" opacity="0.4" style={{ ...common.style, ...sel, mixBlendMode: 'multiply' }} />;
    case 'line':
      return <line {...common} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={s.c} strokeWidth={s.w} strokeLinecap="round" style={{ ...common.style, ...sel }} />;
    case 'wave':
      return <path {...common} d={wavyPath(s.x1, s.y1, s.x2, s.y2, s.w * 1.6)} fill="none" stroke={s.c} strokeWidth={s.w} strokeLinecap="round" style={{ ...common.style, ...sel }} />;
    case 'ellipse':
      return <ellipse {...common} cx={s.x} cy={s.y} rx={Math.abs(s.rx)} ry={Math.abs(s.ry)} fill="none" stroke={s.c} strokeWidth={s.w} style={{ ...common.style, ...sel }} />;
    case 'text': {
      const lines = String(s.txt).split('\n');
      return (
        <text {...common} x={s.x} y={s.y} fill={s.c} fontSize={s.s} fontFamily="Roboto, Arial, sans-serif" fontWeight="600" fontStyle="italic" style={{ ...common.style, ...sel }} dominantBaseline="hanging">
          {lines.map((l, i) => <tspan key={i} x={s.x} dy={i ? s.s * 1.2 : 0}>{l || ' '}</tspan>)}
        </text>
      );
    }
    case 'stamp': {
      const glyph = s.txt.length <= 2;
      if (glyph) {
        return <text {...common} x={s.x} y={s.y} fill={s.c} fontSize={s.s * 1.6} fontFamily="Arial, sans-serif" fontWeight="900" textAnchor="middle" dominantBaseline="central" style={{ ...common.style, ...sel }}>{s.txt}</text>;
      }
      const w = s.txt.length * s.s * 0.58 + s.s * 0.9; const h = s.s * 1.45;
      return (
        <g {...common} transform={`rotate(-4 ${s.x} ${s.y})`} style={{ ...common.style, ...sel }}>
          <rect x={s.x - w / 2} y={s.y - h / 2} width={w} height={h} rx={h * 0.3} fill="none" stroke={s.c} strokeWidth={s.s * 0.11} />
          <text x={s.x} y={s.y} fill={s.c} fontSize={s.s} fontFamily="Roboto, Arial, sans-serif" fontWeight="800" textAnchor="middle" dominantBaseline="central" letterSpacing="0.5">{s.txt}</text>
        </g>
      );
    }
    default: return null;
  }
}

export function AnnotationSvg({ page, shapes = [], className = 'ann', children, ...rest }) {
  return (
    <svg className={className} viewBox={`0 0 ${page.w} ${page.h}`} preserveAspectRatio="none" {...rest}>
      {shapes.map((s) => <Shape key={s.id} s={s} />)}
      {children}
    </svg>
  );
}

// Transforme une annotation lors d'une rotation de page de 90° horaire.
// (x, y) → (H - y, x) où H est la hauteur de l'image avant rotation.
export function rotateShape(s, H) {
  const p = ([x, y]) => [H - y, x];
  switch (s.t) {
    case 'pen': case 'hl': return { ...s, pts: s.pts.map(p) };
    case 'line': case 'wave': { const [a, b] = p([s.x1, s.y1]); const [c, d] = p([s.x2, s.y2]); return { ...s, x1: a, y1: b, x2: c, y2: d }; }
    case 'ellipse': { const [x, y] = p([s.x, s.y]); return { ...s, x, y, rx: s.ry, ry: s.rx }; }
    default: { const [x, y] = p([s.x, s.y]); return { ...s, x, y }; }
  }
}

// Boîte englobante approximative (pour la gomme)
export function hitTest(s, x, y, tol) {
  const near = (ax, ay) => Math.hypot(ax - x, ay - y) < tol;
  switch (s.t) {
    case 'pen': case 'hl': return s.pts.some(([a, b]) => Math.hypot(a - x, b - y) < tol + s.w / 2);
    case 'line': case 'wave': {
      const dx = s.x2 - s.x1; const dy = s.y2 - s.y1; const l2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - s.x1) * dx + (y - s.y1) * dy) / l2));
      return near(s.x1 + t * dx, s.y1 + t * dy);
    }
    case 'ellipse': {
      const v = ((x - s.x) / (s.rx || 1)) ** 2 + ((y - s.y) / (s.ry || 1)) ** 2;
      return Math.abs(Math.sqrt(v) - 1) * Math.min(Math.abs(s.rx), Math.abs(s.ry)) < tol * 1.5;
    }
    case 'text': {
      const lines = String(s.txt).split('\n');
      const w = Math.max(...lines.map((l) => l.length)) * s.s * 0.55; const h = lines.length * s.s * 1.2;
      return x > s.x - tol && x < s.x + w + tol && y > s.y - tol && y < s.y + h + tol;
    }
    case 'stamp': {
      const w = s.txt.length <= 2 ? s.s * 1.6 : s.txt.length * s.s * 0.58 + s.s * 0.9;
      return Math.abs(x - s.x) < w / 2 + tol && Math.abs(y - s.y) < s.s + tol;
    }
    default: return false;
  }
}
