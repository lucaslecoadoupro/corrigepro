import React from 'react';

// Jeu d'icônes trait (style Lucide), dessinées en SVG inline : aucune dépendance réseau.
const P = {
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M10 21v-6h4v6" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.6 3.3-5.5 6.5-5.5s5.9 1.9 6.5 5.5" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8" /><path d="M18 14.8c2 .7 3.3 2.4 3.6 5.2" /></>,
  grid: <><rect x="3.5" y="3.5" width="17" height="17" rx="2" /><path d="M3.5 9.5h17M3.5 15h17M9.5 9.5V20.5" /></>,
  clipboard: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1" /><path d="M8.5 11.5 10.5 13.5 15 9" /><path d="M8.5 17h7" /></>,
  pen: <><path d="M4 20l1-4.5L16 4.5a2.1 2.1 0 0 1 3 3L8 18.5 4 20z" /><path d="M14 6.5l3 3" /></>,
  chart: <><path d="M4 20V4" /><path d="M4 20h16" /><path d="M7 15l4-4 3 3 5-6" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c.3.6.9 1 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  minus: <><path d="M5 12h14" /></>,
  x: <><path d="M6 6l12 12M18 6 6 18" /></>,
  check: <><path d="M5 12.5l4.5 4.5L19 7.5" /></>,
  chevronLeft: <><path d="M15 6l-6 6 6 6" /></>,
  chevronRight: <><path d="M9 6l6 6-6 6" /></>,
  chevronUp: <><path d="M6 15l6-6 6 6" /></>,
  chevronDown: <><path d="M6 9l6 6 6-6" /></>,
  arrowLeft: <><path d="M19 12H5M11 6l-6 6 6 6" /></>,
  arrowRight: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  printer: <><path d="M6 9V3h12v6" /><rect x="3" y="9" width="18" height="8" rx="2" /><path d="M6 14h12v7H6z" /></>,
  upload: <><path d="M12 15V4M7 9l5-5 5 5" /><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /></>,
  download: <><path d="M12 4v11M7 10l5 5 5-5" /><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /></>,
  file: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6" /></>,
  fileText: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="9.5" r="1.8" /><path d="M21 16l-5-5-9 9" /></>,
  trash: <><path d="M4 7h16M10 11v6M14 11v6" /><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" /><path d="M9 7V4h6v3" /></>,
  edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>,
  copy: <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" /></>,
  more: <><circle cx="5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="19" cy="12" r="1.3" /></>,
  highlighter: <><path d="M9 11l-5 5v4h4l5-5" /><path d="M13 15l7.5-7.5a2.1 2.1 0 0 0-3-3L10 12z" /><path d="M14 20h7" /></>,
  type: <><path d="M5 6V4h14v2M12 4v16M9 20h6" /></>,
  stamp: <><path d="M9 4h6l-1 7h4a2 2 0 0 1 2 2v2H4v-2a2 2 0 0 1 2-2h4z" /><path d="M5 19h14" /></>,
  eraser: <><path d="M7 21h13" /><path d="M5.5 15.5 14 7l5 5-7.5 7.5a2 2 0 0 1-2.8 0l-3.2-3.2a2 2 0 0 1 0-2.8z" /><path d="M9.5 11.5l5 5" /></>,
  hand: <><path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12" /><path d="M11 11V4.5a1.5 1.5 0 0 1 3 0V11" /><path d="M14 11V6.5a1.5 1.5 0 0 1 3 0V14" /><path d="M8 13l-1.6-1.6a1.6 1.6 0 0 0-2.3 2.3L8 18c1.5 1.8 3 3 5.5 3H14a5 5 0 0 0 5-5v-6.5a1.5 1.5 0 0 0-3 0" /></>,
  undo: <><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></>,
  redo: <><path d="M15 14l5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" /></>,
  zoomIn: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3M11 8v6M8 11h6" /></>,
  zoomOut: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3M8 11h6" /></>,
  rotate: <><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" /></>,
  maximize: <><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></>,
  circle: <><circle cx="12" cy="12" r="8" /></>,
  underline: <><path d="M6 4v7a6 6 0 0 0 12 0V4" /><path d="M4 21h16" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="16" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  folder: <><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></>,
  save: <><path d="M5 3h11l4 4v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 1-2z" /><path d="M8 3v5h7V3M8 21v-7h8v7" /></>,
  alert: <><path d="M12 3 2 20h20z" /><path d="M12 10v4M12 17.5v.01" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8v.01" /></>,
  sparkles: <><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /><path d="M19 15l.8 2.2 2.2.8-2.2.8L19 21l-.8-2.2-2.2-.8 2.2-.8z" /></>,
  layers: <><path d="M12 3 2 8l10 5 10-5z" /><path d="M2 13l10 5 10-5" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c.8-4 4-6 8-6s7.2 2 8 6" /></>,
  list: <><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" /></>,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>,
  trend: <><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></>,
  book: <><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M4 19V5M19 19v2H6" /></>,
  scissors: <><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M8.1 8.1 20 20M8.1 15.9 20 4" /></>,
  layout: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M13 4v16" /></>,
  menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>,
  wand: <><path d="M15 4V2M15 10V8M11 6h2M17 6h2" /><path d="M3 21 14 10" /><path d="M18.5 13.5v1.5M17.8 14.2h1.5" /></>,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  sidebar: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></>,
  arrowUpDown: <><path d="M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4" /></>,
  pdf: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6" /><path d="M8 16v-4h1.5a1.3 1.3 0 0 1 0 2.6H8M13 12v4h1a2 2 0 0 0 0-4zM18 12h-2v4M16 14h1.6" strokeWidth="1.3" /></>,
};

export function Icon({ name, size, className, style, strokeWidth = 1.9 }) {
  const content = P[name] || P.info;
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" width={size} height={size}
      className={className} style={style} aria-hidden="true">
      {content}
    </svg>
  );
}

// Logo CorrigePro : même écusson que ClassPro (fond noir, liseré doré),
// avec une copie et une coche rouge au lieu du livre.
export function Logo({ size = 34 }) {
  return (
    <svg width={size} height={size * 1.1} viewBox="0 0 100 110" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="cgsf" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#1a1a1a" /><stop offset="100%" stopColor="#0d0d0d" /></linearGradient>
        <linearGradient id="cggs" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#d4b483" /><stop offset="100%" stopColor="#a8864e" /></linearGradient>
        <linearGradient id="cgpp" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#ffffff" /><stop offset="100%" stopColor="#d2d2d2" /></linearGradient>
      </defs>
      <path d="M50 8 L84 22 L84 58 Q84 80 50 96 Q16 80 16 58 L16 22 Z" fill="url(#cgsf)" stroke="url(#cggs)" strokeWidth="2.8" strokeLinejoin="round" />
      <path d="M34 36 H60 L68 44 V74 H34 Z" fill="url(#cgpp)" stroke="#b8b8b8" strokeWidth=".5" />
      <path d="M60 36 V44 H68" fill="#cfcfcf" />
      <path d="M39 49 H56 M39 55 H60 M39 61 H52" stroke="#a9a9a9" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M44 64 L50 70 L66 50" fill="none" stroke="#e03131" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="50" y1="16" x2="50" y2="26" stroke="#d4b483" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="44" y1="21" x2="56" y2="21" stroke="#d4b483" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
