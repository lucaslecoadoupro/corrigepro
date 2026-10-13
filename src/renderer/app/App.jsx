import React, { useEffect, useMemo, useState } from 'react';
import { useStore, findClass } from './store.jsx';
import { NavCtx } from './nav.jsx';
import { Icon, Logo } from './icons.jsx';
import { appInfo, isDesktop, isMac } from './platform.js';
import { evalStats } from './utils.js';
import { HomePage } from './modules/Home.jsx';
import { ClassesPage, ClassPage } from './modules/Classes.jsx';
import { GridsPage, GridEditorPage } from './modules/Grids.jsx';
import { EvalsPage, EvalPage } from './modules/Evals.jsx';
import { CorrectionPage } from './modules/Correction.jsx';
import { SettingsPage } from './modules/Settings.jsx';
import { SyncModal, useSyncReceiver, syncPending } from './modules/Sync.jsx';

const NAV = [
  { section: 'Vue générale', items: [{ id: 'home', icon: 'home', label: 'Accueil', short: 'Accueil', match: ['home'] }] },
  { section: 'Mes classes', items: [
    { id: 'classes', icon: 'users', label: 'Classes & élèves', short: 'Classes', match: ['classes'] },
    { id: 'results', icon: 'trend', label: 'Résultats & évolution', short: 'Résultats', match: ['class'], mobile: 'hide' },
  ] },
  { section: 'Évaluation', items: [
    { id: 'grids', icon: 'grid', label: 'Grilles d\'évaluation', short: 'Grilles', match: ['grids', 'grid'] },
    { id: 'evals', icon: 'clipboard', label: 'Évaluations & copies', short: 'Évals', match: ['evals', 'eval', 'correct'] },
  ] },
  { section: 'Application', items: [
    { id: 'sync', icon: 'arrowUpDown', label: 'Synchroniser', short: 'Synchro', match: [] },
    { id: 'settings', icon: 'settings', label: 'Réglages', short: 'Réglages', match: ['settings'] },
  ] },
];

function useMedia(q) {
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => { const mq = window.matchMedia(q); const f = () => setM(mq.matches); mq.addEventListener('change', f); return () => mq.removeEventListener('change', f); }, [q]);
  return m;
}

export function App() {
  const { data, mutate, saveState } = useStore();
  const [route, setRoute] = useState({ page: 'home' });
  const [version, setVersion] = useState('1.0.0');
  const [syncOpen, setSyncOpen] = useState(false);
  const receiveSync = useSyncReceiver();
  const [collapsedPref, setCollapsedPref] = useState(() => localStorage.getItem('cp-sb-collapsed') === '1');

  useEffect(() => { appInfo().then((i) => i?.version && setVersion(i.version)); }, []);
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', data.settings.theme || 'light');
    document.documentElement.classList.toggle('is-mac', isDesktop && isMac);
  }, [data.settings.theme]);
  useEffect(() => { localStorage.setItem('cp-sb-collapsed', collapsedPref ? '1' : '0'); }, [collapsedPref]);

  const nav = useMemo(() => (r) => {
    if (r.page === 'sync') { setSyncOpen(true); return; }
    if (r.page === 'results') {
      const c = data.classes.find((x) => x.id === localStorage.getItem('cp-last-class')) || data.classes[0];
      setRoute(c ? { page: 'class', id: c.id, tab: 'results' } : { page: 'classes' });
      return;
    }
    if (r.page === 'class') localStorage.setItem('cp-last-class', r.id);
    setRoute(r);
  }, [data.classes]);

  const toCorrect = data.evals.reduce((s, e) => { const c = findClass(data, e.classId); return s + (c ? evalStats(e, c.students).todo : 0); }, 0);
  const phone = useMedia('(max-width: 760px)'); // barre d'onglets en bas
  const narrow = useMedia('(max-width: 1100px)'); // tablette : menu replié pour laisser la place
  const collapsed = collapsedPref || route.page === 'correct' || narrow;
  const p = data.profile;
  const who = [p.prenom, p.nom].filter(Boolean).join(' ');

  let page;
  switch (route.page) {
    case 'classes': page = <ClassesPage />; break;
    case 'class': page = <ClassPage key={route.id + (route.tab || '')} id={route.id} tab={route.tab} />; break;
    case 'grids': page = <GridsPage />; break;
    case 'grid': page = <GridEditorPage key={route.id} id={route.id} />; break;
    case 'evals': page = <EvalsPage newFor={route.newFor} newWithGrid={route.newWithGrid} />; break;
    case 'eval': page = <EvalPage key={route.id} id={route.id} />; break;
    case 'correct': page = <CorrectionPage key={route.id} id={route.id} student={route.student} />; break;
    case 'settings': page = <SettingsPage version={version} />; break;
    default: page = <HomePage />;
  }

  return (
    <NavCtx.Provider value={nav}>
      <div className={`shell ${route.page === 'correct' ? 'correcting' : ''}`}>
        <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
          <div className="sb-drag" />
          <div className="sb-logo" style={collapsed ? { justifyContent: 'center', padding: '.875rem .4rem' } : undefined}>
            <div className="sb-logo-icon"><Logo size={34} /></div>
            {!collapsed && <div className="sb-logo-text">CorrigePro<span>Correction & évaluation</span></div>}
          </div>
          <nav className="sb-nav">
            {NAV.map((sec) => (
              <div key={sec.section}>
                {!collapsed ? <div className="sb-section-label">{sec.section}</div> : <div style={{ height: '.6rem' }} />}
                {sec.items.map((it) => {
                  const on = it.match.includes(route.page) || (phone && it.id === 'classes' && route.page === 'class');
                  const badge = it.id === 'sync' ? (syncPending(data) || null) : it.id === 'evals' && toCorrect ? toCorrect : it.id === 'classes' && data.classes.length ? data.classes.length : null;
                  return (
                    <button key={it.id} className={`sb-item ${on ? 'on' : ''}`} data-mobile={it.mobile} onClick={() => nav({ page: it.id })} title={collapsed ? it.label : undefined}
                      style={collapsed && !phone ? { justifyContent: 'center', padding: '.55rem 0' } : undefined}>
                      <Icon name={it.icon} />
                      {(!collapsed || phone) && <span>{phone ? it.short : it.label}</span>}
                      {(!collapsed || phone) && badge != null && <span className="sb-badge">{badge}</span>}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
          <div className="sb-footer">
            {!collapsed && (
              <button className="sb-profile" onClick={() => nav({ page: 'settings' })}>
                <div className="sb-avatar">{((p.prenom || 'C')[0] + (p.nom || 'P')[0]).toUpperCase()}</div>
                <div style={{ minWidth: 0 }}>
                  <div className="sb-profile-name">{who || 'Mon profil'}</div>
                  <div className="sb-profile-meta">{[p.matiere, p.etablissement].filter(Boolean).join(' · ') || 'Compléter mon profil'}</div>
                </div>
              </button>
            )}
            <div className="sb-bottom-row" style={collapsed ? { flexDirection: 'column', gap: '.3rem' } : undefined}>
              {!collapsed && <span className="sb-version">v{version} · {saveState === 'saving' ? 'enregistrement…' : saveState === 'error' ? '⚠ non enregistré' : 'enregistré'}</span>}
              <div className="row" style={{ gap: 2, flexDirection: collapsed ? 'column' : 'row' }}>
                <button className="sb-icon-btn" title={data.settings.theme === 'dark' ? 'Thème clair' : 'Thème sombre'} onClick={() => mutate((d) => { d.settings.theme = d.settings.theme === 'dark' ? 'light' : 'dark'; })}>
                  <Icon name={data.settings.theme === 'dark' ? 'sun' : 'moon'} />
                </button>
                {route.page !== 'correct' && <button className="sb-icon-btn" title={collapsed ? 'Déplier le menu' : 'Replier le menu'} onClick={() => setCollapsedPref(!collapsedPref)}><Icon name="sidebar" /></button>}
              </div>
            </div>
          </div>
        </aside>
        <main className="main-area">{page}</main>
      </div>
      {syncOpen && <SyncModal receive={receiveSync} onClose={() => setSyncOpen(false)} />}
    </NavCtx.Provider>
  );
}
