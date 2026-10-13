import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useStore, useToast } from '../store.jsx';
import { Icon } from '../icons.jsx';
import { Modal, Switch } from '../ui.jsx';
import { blobs, restoreBlobs, deviceName, syncIO, isDesktop, isMac } from '../platform.js';
import { buildSyncFile, isSyncFile, pendingCount, summaryText, SYNC_FILE_PREFIX } from '../sync.js';
import { readFileAsText } from '../utils.js';

const ago = (ts) => {
  if (!ts) return '';
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return 'à l\'instant';
  if (m < 60) return `il y a ${m} min`;
  if (m < 60 * 24) return `il y a ${Math.round(m / 60)} h`;
  return new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
};

// Réception d'un fichier de synchro, quelle que soit sa provenance (dossier surveillé,
// glisser-déposer, sélecteur de fichier). Renvoie 'applied' | 'own' | 'invalid'.
// quiet : fichier trouvé dans le dossier surveillé, il y reste ; on ne le signale pas à chaque lancement.
export function useSyncReceiver() {
  const { data, applySync, mutate } = useStore();
  const toast = useToast();
  const dataRef = useRef(data);
  dataRef.current = data;

  const receive = useCallback(async (text, quiet = false) => {
    let file;
    try { file = JSON.parse(text); } catch { file = null; }
    if (!isSyncFile(file)) { if (!quiet) toast('Ce fichier n\'est pas un fichier de synchro CorrigePro', 'error'); return 'invalid'; }
    if (file.from === dataRef.current.sync?.device) { if (!quiet) toast('Ce fichier a été envoyé par cet appareil', 'info'); return 'own'; }
    await restoreBlobs(file.blobs);
    const sum = applySync(file);
    mutate((d) => { d.sync.peers = { ...(d.sync.peers || {}), [file.from]: { name: file.fromName || 'autre appareil', at: Date.now() } }; });
    toast(`Reçu de ${file.fromName || 'l\'autre appareil'} : ${summaryText(sum)}`, 'success', 5000);
    return 'applied';
  }, [applySync, mutate, toast]);

  // Ordinateur : fichiers arrivés dans le dossier surveillé
  useEffect(() => syncIO.onIncoming(({ text }) => receive(text, true)), [receive]);
  const dir = data.settings.syncDir;
  useEffect(() => { if (isDesktop) syncIO.watch(dir || null); }, [dir]);

  // Appli mobile Android : fichier reçu via « Partager vers CorrigePro » (déposé par le service worker)
  useEffect(() => {
    if (isDesktop || !window.caches) return;
    (async () => {
      try {
        const box = await caches.open('cp-inbox');
        const hit = await box.match('inbox.json');
        if (!hit) return;
        await box.delete('inbox.json');
        if (location.search.includes('recu')) history.replaceState(null, '', location.pathname);
        receive(await hit.text());
      } catch { /* pas de boîte de réception */ }
    })();
  }, []); // eslint-disable-line

  // Glisser-déposer d'un fichier de synchro n'importe où dans la fenêtre
  useEffect(() => {
    const over = (e) => { if ([...(e.dataTransfer?.items || [])].some((i) => i.kind === 'file')) e.preventDefault(); };
    const drop = async (e) => {
      const f = [...(e.dataTransfer?.files || [])].find((x) => x.name.startsWith(SYNC_FILE_PREFIX));
      if (!f || e.defaultPrevented) return;
      e.preventDefault();
      receive(await readFileAsText(f));
    };
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => { window.removeEventListener('dragover', over); window.removeEventListener('drop', drop); };
  }, [receive]);

  return receive;
}

// Badge du menu : seulement une fois la synchro utilisée, pour ne pas importuner les autres
export function syncPending(data) {
  const used = data.sync?.lastExport || Object.keys(data.sync?.peers || {}).length;
  return used ? pendingCount(data) : 0;
}

export function SyncModal({ receive, onClose }) {
  const { data, mutate } = useStore();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const pending = pendingCount(data);
  const peers = Object.values(data.sync?.peers || {}).sort((a, b) => b.at - a.at);
  const dir = data.settings.syncDir;
  const target = isDesktop ? 'au téléphone / à la tablette' : 'à l\'ordinateur';

  // Première ouverture sur ordinateur : on surveille Téléchargements (AirDrop, Quick Share y déposent les fichiers)
  useEffect(() => { if (isDesktop && dir === undefined) mutate((d) => { d.settings.syncDir = 'downloads'; }); }, []); // eslint-disable-line

  const send = async (mode, allImages = false) => {
    setBusy(true);
    try {
      const f = await buildSyncFile(data, deviceName(), (id) => blobs.getDataUrl(id), { allImages });
      const t = new Date();
      const stamp = `${t.getFullYear()}${String(t.getMonth() + 1).padStart(2, '0')}${String(t.getDate()).padStart(2, '0')}-${String(t.getHours()).padStart(2, '0')}h${String(t.getMinutes()).padStart(2, '0')}`;
      // Nom sans accents ni espaces : passe partout (AirDrop, Quick Share, Drive, mail)
      const dev = deviceName().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-');
      const name = `${SYNC_FILE_PREFIX}-${dev}-${stamp}.json`;
      const r = await syncIO.send(name, JSON.stringify(f), { dir, mode });
      if (!r?.ok) return;
      mutate((d) => { d.sync.lastExport = f.at; });
      toast(r.downloaded ? 'Fichier téléchargé : envoyez-le à l\'autre appareil' : r.path ? 'Fichier enregistré' : 'Fichier prêt à être partagé');
    } catch (e) { toast(`Envoi impossible : ${e.message}`, 'error'); } finally { setBusy(false); }
  };

  const pickFile = async (files) => {
    const f = files?.[0];
    if (!f) return;
    const res = await receive(await readFileAsText(f));
    if (res === 'applied') onClose();
  };

  const chooseDir = async () => {
    const p = await syncIO.pickDir();
    if (p) mutate((d) => { d.settings.syncDir = p; });
  };

  return (
    <Modal title="Synchroniser" sub="Ordinateur ⇄ téléphone ou tablette, sans compte ni internet" icon="arrowUpDown" onClose={onClose}
      footer={<button className="btn" onClick={onClose}>Fermer</button>}>
      <div className="stack" style={{ gap: '1rem' }}>
        <div className="sum-bar ok" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
          <Icon name="info" />
          <span>
            {!data.sync?.lastExport ? 'Premier envoi : toutes vos données partiront, copies numérisées comprises.' : pending ? `${pending} modification(s) depuis le dernier envoi.` : 'Aucune modification depuis le dernier envoi.'}
            {peers[0] && ` Dernière réception : ${peers[0].name}, ${ago(peers[0].at)}.`}
            {' '}Les deux appareils fusionnent leurs changements : rien n'est écrasé en bloc.
          </span>
        </div>

        <div className="card" style={{ padding: '1rem' }}>
          <div className="row" style={{ fontWeight: 700, marginBottom: '.35rem' }}><Icon name="upload" size={16} />Envoyer {target}</div>
          <div className="faint" style={{ fontSize: '.74rem', lineHeight: 1.45, marginBottom: '.7rem' }}>
            {isDesktop
              ? (isMac ? 'AirDrop, Mail, Messages… ou enregistrez le fichier dans un dossier partagé (Drive, iCloud). Sur le téléphone : Synchroniser → Recevoir.' : 'Enregistrez le fichier dans un dossier que le téléphone voit (Google Drive, OneDrive) ou envoyez-le par Quick Share / mail. Sur le téléphone : Synchroniser → Recevoir.')
              : 'Choisissez AirDrop, Quick Share, Drive ou Mail. Sur l\'ordinateur, CorrigePro récupère le fichier tout seul s\'il arrive dans le dossier surveillé (Téléchargements par défaut).'}
          </div>
          <div className="row-wrap" style={{ gap: '.5rem' }}>
            {(!isDesktop || isMac) && <button className="btn btn-primary" disabled={busy} onClick={() => send('share')}><Icon name="upload" />{busy ? 'Préparation…' : 'Partager'}</button>}
            {isDesktop && <button className={`btn ${isMac ? '' : 'btn-primary'}`} disabled={busy} onClick={() => send('save')}><Icon name="save" />Enregistrer le fichier…</button>}
            <button className="btn btn-quiet btn-sm" disabled={busy} onClick={() => send(isDesktop && !isMac ? 'save' : 'share', true)} title="Utile si un envoi précédent a été perdu">Tout renvoyer, avec les copies numérisées</button>
          </div>
        </div>

        <div className="card" style={{ padding: '1rem' }}>
          <div className="row" style={{ fontWeight: 700, marginBottom: '.35rem' }}><Icon name="download" size={16} />Recevoir</div>
          {isDesktop && (
            <div className="stack" style={{ gap: '.45rem', marginBottom: '.7rem' }}>
              <Switch checked={!!dir} onChange={(v) => mutate((d) => { d.settings.syncDir = v ? 'downloads' : null; })} label="Récupérer automatiquement les fichiers reçus" />
              {dir && (
                <div className="row" style={{ gap: '.5rem', fontSize: '.74rem' }}>
                  <Icon name="folder" size={15} />
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dir === 'downloads' ? 'Téléchargements' : dir}</span>
                  <button className="btn btn-sm btn-quiet" onClick={chooseDir}>Changer…</button>
                </div>
              )}
              <div className="faint" style={{ fontSize: '.72rem', lineHeight: 1.45 }}>AirDrop et Quick Share déposent les fichiers dans Téléchargements. Choisissez votre dossier Google Drive, OneDrive ou iCloud pour recevoir ce que le téléphone y envoie. Vous pouvez aussi glisser un fichier de synchro sur la fenêtre.</div>
            </div>
          )}
          <button className={`btn ${isDesktop ? '' : 'btn-primary'}`} onClick={() => fileRef.current?.click()}><Icon name="file" />Choisir un fichier de synchro…</button>
          <input ref={fileRef} type="file" hidden accept=".json,application/json" onChange={(e) => { pickFile(e.target.files); e.target.value = ''; }} />
        </div>
      </div>
    </Modal>
  );
}
