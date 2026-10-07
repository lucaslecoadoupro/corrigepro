import React, { useState } from 'react';
import { useStore, useToast, findClass } from '../store.jsx';
import { useNav } from '../nav.jsx';
import { Icon, Logo } from '../icons.jsx';
import { PageHeader } from '../ui.jsx';
import { EvalListItem } from './Evals.jsx';
import { classEvals, studentAverage } from './Classes.jsx';
import { buildDemo } from '../demo.js';
import { evalStats, mean, fmt } from '../utils.js';

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Bonsoir' : h < 18 ? 'Bonjour' : 'Bonsoir';
}

export function HomePage() {
  const { data, replaceAll } = useStore();
  const nav = useNav();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const empty = !data.classes.length && !data.grids.length && !data.evals.length;

  const pending = data.evals.map((e) => ({ e, st: evalStats(e, findClass(data, e.classId)?.students || []) })).filter(({ st }) => st.todo > 0)
    .sort((a, b) => (b.e.date || '').localeCompare(a.e.date || ''));
  const toCorrect = pending.reduce((s, x) => s + x.st.todo, 0);
  const students = data.classes.reduce((s, c) => s + c.students.length, 0);
  const recent = [...data.evals].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 5);

  const loadDemo = async () => {
    setLoading(true);
    try { replaceAll(await buildDemo(data)); toast('Données d\'exemple chargées : explorez librement !'); } finally { setLoading(false); }
  };

  return (
    <>
      <PageHeader badge="Tableau de bord" badgeIcon="home" title={`${greeting()}${data.profile.prenom ? ` ${data.profile.prenom}` : ''} 👋`}
        sub={toCorrect ? `${toCorrect} copie${toCorrect > 1 ? 's' : ''} vous attend${toCorrect > 1 ? 'ent' : ''} dans ${pending.length} évaluation${pending.length > 1 ? 's' : ''}.` : 'Corrigez plus vite, imprimez moins, suivez mieux.'}
        actions={pending[0] && <button className="btn btn-white" onClick={() => nav({ page: 'eval', id: pending[0].e.id })}><Icon name="pen" />Reprendre la correction</button>}
        stats={[
          { label: 'Classes', value: data.classes.length },
          { label: 'Élèves', value: students },
          { label: 'Grilles', value: data.grids.length },
          { label: 'Copies à corriger', value: toCorrect },
        ]} />
      <div className="page-content">
        {empty && (
          <div className="card" style={{ marginBottom: '1.25rem', overflow: 'hidden' }}>
            <div className="card-body hero-welcome" style={{ padding: '1.5rem 1.6rem' }}>
              <Logo size={64} />
              <div style={{ flex: 1 }}>
                <div className="slab" style={{ fontSize: '1.25rem', fontWeight: 800 }}>Bienvenue dans CorrigePro</div>
                <div className="muted" style={{ fontSize: '.84rem', marginTop: '.2rem', maxWidth: 620, lineHeight: 1.55 }}>
                  Le compagnon de correction de ClassPro : vos classes, vos grilles d'évaluation imprimables et la correction de copies numérisées, côte à côte avec la grille. Tout reste sur votre ordinateur.
                </div>
              </div>
              <div className="stack" style={{ gap: '.45rem' }}>
                <button className="btn btn-primary" onClick={() => nav({ page: 'classes' })}><Icon name="plus" />Créer ma première classe</button>
                <button className="btn" onClick={loadDemo} disabled={loading}><Icon name="sparkles" />{loading ? 'Chargement…' : 'Essayer avec un exemple'}</button>
              </div>
            </div>
            <div className="grid-3" style={{ borderTop: '1px solid var(--border)', gap: 0 }}>
              {[['users', '1. Créez vos classes', 'Collez une liste Pronote ou importez vos classes ClassPro.'], ['grid', '2. Concevez vos grilles', 'Barème libre, points ou niveaux de maîtrise, 1 ou 2 grilles par page.'], ['pen', '3. Corrigez à l\'écran', 'Importez les scans, annotez la copie, notez dans la grille, imprimez.']].map(([ic, t, d], i) => (
                <div key={t} style={{ padding: '1rem 1.3rem', borderLeft: i ? '1px solid var(--border)' : 'none' }}>
                  <div className="row" style={{ fontWeight: 700, fontSize: '.84rem' }}><Icon name={ic} size={16} style={{ color: 'var(--accent)' }} />{t}</div>
                  <div className="muted" style={{ fontSize: '.75rem', marginTop: '.2rem', lineHeight: 1.45 }}>{d}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="quick-actions">
          {[
            { ic: 'users', c: '#3b5bdb', t: 'Nouvelle classe', d: 'Importer une liste d\'élèves', go: { page: 'classes' } },
            { ic: 'grid', c: '#7c3aed', t: 'Nouvelle grille', d: 'Concevoir une grille imprimable', go: { page: 'grids' } },
            { ic: 'clipboard', c: '#0f9b6e', t: 'Nouvelle évaluation', d: 'Associer une classe et une grille', go: { page: 'evals', newFor: data.classes[0]?.id || '' } },
            { ic: 'trend', c: '#d97706', t: 'Résultats', d: 'Relevés de notes et évolutions', go: data.classes[0] ? { page: 'class', id: data.classes[0].id, tab: 'evolution' } : { page: 'classes' } },
          ].map((q) => (
            <button key={q.t} className="qa" onClick={() => nav(q.go)}>
              <div className="qa-icon" style={{ background: q.c }}><Icon name={q.ic} /></div>
              <div><div className="qa-title">{q.t}</div><div className="qa-sub">{q.d}</div></div>
            </button>
          ))}
        </div>

        <div className="grid-2 mt-2" style={{ alignItems: 'start' }}>
          <div className="card">
            <div className="card-hd"><div className="card-title"><Icon name="pen" />Corrections en cours</div>{pending.length > 0 && <span className="pill warning">{toCorrect} copie(s)</span>}</div>
            <div className="card-body flush">
              {pending.length ? pending.slice(0, 6).map(({ e }) => <EvalListItem key={e.id} ev={e} onClick={() => nav({ page: 'eval', id: e.id })} />)
                : <div className="faint" style={{ padding: '1.6rem', textAlign: 'center', fontSize: '.8rem' }}>Aucune copie en attente. 🎉</div>}
            </div>
          </div>
          <div className="stack">
            <div className="card">
              <div className="card-hd"><div className="card-title"><Icon name="users" />Mes classes</div><button className="btn btn-sm btn-quiet" onClick={() => nav({ page: 'classes' })}>Tout voir<Icon name="chevronRight" /></button></div>
              <div className="card-body flush">
                {data.classes.length ? data.classes.map((c) => {
                  const evs = classEvals(data, c.id);
                  const avg = mean(c.students.map((s) => studentAverage(evs, s.id)));
                  return (
                    <div key={c.id} className="list-item" onClick={() => nav({ page: 'class', id: c.id })}>
                      <div className="li-icon" style={{ background: c.color, fontFamily: 'Roboto Slab', fontWeight: 800, fontSize: '.72rem' }}>{c.name.slice(0, 3)}</div>
                      <div className="li-main"><div className="li-title">{c.name}</div><div className="li-sub">{c.students.length} élèves · {evs.length} évaluation(s)</div></div>
                      <span className="pill accent">{avg == null ? '–' : `${fmt(avg, 1)} /20`}</span>
                      <Icon name="chevronRight" size={16} style={{ color: 'var(--text3)' }} />
                    </div>
                  );
                }) : <div className="faint" style={{ padding: '1.6rem', textAlign: 'center', fontSize: '.8rem' }}>Aucune classe.</div>}
              </div>
            </div>
            {recent.length > 0 && (
              <div className="card">
                <div className="card-hd"><div className="card-title"><Icon name="calendar" />Dernières évaluations</div></div>
                <div className="card-body flush">{recent.map((e) => <EvalListItem key={e.id} ev={e} compact onClick={() => nav({ page: 'eval', id: e.id })} />)}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
