import React, { useRef, useState } from 'react';
import { useStore, useToast } from '../store.jsx';
import { Icon, Logo } from '../icons.jsx';
import { PageHeader, Field, Seg, Switch, useConfirm } from '../ui.jsx';
import { exportBackup, restoreBlobs, isDesktop, openDataFolder } from '../platform.js';
import { readFileAsText } from '../utils.js';
import { DEFAULT_QUICK_COMMENTS, DEFAULT_STAMPS } from '../templates.js';
import { emptyData } from '../store.jsx';

export function SettingsPage({ version }) {
  const { data, mutate, replaceAll } = useStore();
  const toast = useToast();
  const confirm = useConfirm();
  const [withImages, setWithImages] = useState(true);
  const fileRef = useRef(null);
  const p = data.profile; const st = data.settings;
  const setP = (k, v) => mutate((d) => { d.profile[k] = v; });
  const setS = (k, v) => mutate((d) => { d.settings[k] = v; });

  const doExport = async () => {
    const r = await exportBackup(data, withImages);
    if (r?.ok) toast(r.path ? 'Sauvegarde enregistrée' : 'Sauvegarde téléchargée');
    else if (r && !r.canceled) toast('Échec de la sauvegarde', 'error');
  };

  const doImport = async (f) => {
    try {
      const json = JSON.parse(await readFileAsText(f));
      if (json?.app !== 'CorrigePro' || !json.data) { toast('Ce fichier n\'est pas une sauvegarde CorrigePro', 'error'); return; }
      const ok = await confirm({ title: 'Restaurer cette sauvegarde ?', danger: true, confirmLabel: 'Restaurer', message: `Sauvegarde du ${new Date(json.date).toLocaleString('fr-FR')}. Les données actuelles seront remplacées.` });
      if (!ok) return;
      await restoreBlobs(json.blobs);
      replaceAll(json.data);
      toast('Sauvegarde restaurée');
    } catch { toast('Fichier illisible', 'error'); }
  };

  const reset = async () => {
    if (!(await confirm({ title: 'Tout effacer ?', danger: true, confirmLabel: 'Tout effacer', message: 'Classes, grilles, évaluations et notes seront supprimées. Pensez à exporter une sauvegarde avant.' }))) return;
    replaceAll({ ...emptyData(), settings: { ...data.settings }, profile: { ...data.profile } });
    toast('Données effacées', 'info');
  };

  return (
    <>
      <PageHeader badge="Paramètres" badgeIcon="settings" title="Réglages" sub="Profil, apparence, outils de correction et sauvegardes" />
      <div className="page-content">
        <div className="grid-2" style={{ alignItems: 'start' }}>
          <div className="stack">
            <div className="card">
              <div className="card-hd"><div className="card-title"><Icon name="user" />Profil</div><span className="card-sub">Affiché en pied des grilles imprimées</span></div>
              <div className="card-body stack" style={{ gap: '.8rem' }}>
                <div className="row" style={{ gap: '.8rem' }}>
                  <Field label="Prénom" style={{ flex: 1 }}><input className="input" value={p.prenom} onChange={(e) => setP('prenom', e.target.value)} /></Field>
                  <Field label="Nom" style={{ flex: 1 }}><input className="input" value={p.nom} onChange={(e) => setP('nom', e.target.value)} /></Field>
                </div>
                <div className="row" style={{ gap: '.8rem' }}>
                  <Field label="Matière" style={{ flex: 1 }}><input className="input" value={p.matiere} onChange={(e) => setP('matiere', e.target.value)} placeholder="ex. Espagnol" /></Field>
                  <Field label="Établissement" style={{ flex: 1 }}><input className="input" value={p.etablissement} onChange={(e) => setP('etablissement', e.target.value)} /></Field>
                </div>
              </div>
            </div>
            <div className="card">
              <div className="card-hd"><div className="card-title"><Icon name="sun" />Affichage</div></div>
              <div className="card-body stack" style={{ gap: '.9rem' }}>
                <Field label="Thème"><Seg value={st.theme} onChange={(v) => setS('theme', v)} options={[{ value: 'light', label: 'Clair', icon: 'sun' }, { value: 'dark', label: 'Sombre', icon: 'moon' }]} /></Field>
                <Field label="Ordre des noms"><Seg value={st.nameOrder} onChange={(v) => setS('nameOrder', v)} options={[{ value: 'nom', label: 'NOM Prénom' }, { value: 'prenom', label: 'Prénom NOM' }]} /></Field>
              </div>
            </div>
            <div className="card">
              <div className="card-hd"><div className="card-title"><Icon name="save" />Sauvegardes</div></div>
              <div className="card-body stack" style={{ gap: '.8rem' }}>
                <div className="muted" style={{ fontSize: '.78rem', lineHeight: 1.5 }}>
                  {isDesktop ? 'Vos données sont enregistrées automatiquement sur cet ordinateur.' : 'Vos données sont enregistrées dans ce navigateur.'} Exportez régulièrement une sauvegarde pour les transférer ou les mettre à l'abri.
                </div>
                <Switch checked={withImages} onChange={setWithImages} label="Inclure les copies numérisées (fichier plus lourd)" />
                <div className="row-wrap">
                  <button className="btn btn-primary" onClick={doExport}><Icon name="download" />Exporter une sauvegarde</button>
                  <button className="btn" onClick={() => fileRef.current?.click()}><Icon name="upload" />Restaurer…</button>
                  {isDesktop && <button className="btn btn-quiet" onClick={openDataFolder}><Icon name="folder" />Dossier des données</button>}
                  <input ref={fileRef} type="file" hidden accept=".json,application/json" onChange={(e) => { if (e.target.files[0]) doImport(e.target.files[0]); e.target.value = ''; }} />
                </div>
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '.8rem' }}>
                  <button className="btn btn-danger-soft btn-sm" onClick={reset}><Icon name="trash" />Effacer toutes les données</button>
                </div>
              </div>
            </div>
          </div>
          <div className="stack">
            <div className="card">
              <div className="card-hd"><div className="card-title"><Icon name="edit" />Appréciations rapides</div><button className="btn btn-sm btn-quiet" onClick={() => setS('quickComments', DEFAULT_QUICK_COMMENTS)}>Réinitialiser</button></div>
              <div className="card-body">
                <textarea className="textarea" style={{ minHeight: 170 }} value={(st.quickComments || []).join('\n')} onChange={(e) => setS('quickComments', e.target.value.split('\n'))}
                  onBlur={(e) => setS('quickComments', e.target.value.split('\n').map((x) => x.trim()).filter(Boolean))} />
                <div className="field-hint mt-1">Une appréciation par ligne. Un clic dans le panneau de correction l'ajoute au commentaire.</div>
              </div>
            </div>
            <div className="card">
              <div className="card-hd"><div className="card-title"><Icon name="stamp" />Tampons d'annotation</div><button className="btn btn-sm btn-quiet" onClick={() => setS('stamps', DEFAULT_STAMPS)}>Réinitialiser</button></div>
              <div className="card-body">
                <textarea className="textarea" style={{ minHeight: 150 }} value={(st.stamps || []).join('\n')} onChange={(e) => setS('stamps', e.target.value.split('\n'))}
                  onBlur={(e) => setS('stamps', e.target.value.split('\n').map((x) => x.trim()).filter(Boolean))} />
                <div className="field-hint mt-1">Un tampon par ligne (ex. « ¡Muy bien! », « Conj. », « ✓ »). Les symboles courts s'affichent en grand.</div>
              </div>
            </div>
            <div className="card">
              <div className="card-body row" style={{ gap: '1rem' }}>
                <Logo size={44} />
                <div style={{ flex: 1 }}>
                  <div className="slab" style={{ fontWeight: 800 }}>CorrigePro <span className="faint" style={{ fontFamily: 'Roboto', fontWeight: 500, fontSize: '.76rem' }}>v{version}</span></div>
                  <div className="muted" style={{ fontSize: '.74rem', lineHeight: 1.5 }}>Correction de copies et grilles d'évaluation — de la famille ClassPro. Gratuit, sans inscription, 100 % local.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
