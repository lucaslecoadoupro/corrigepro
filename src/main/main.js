// CorrigePro — processus principal Electron
const { app, BrowserWindow, ipcMain, dialog, shell, protocol, net, Menu, nativeTheme, ShareMenu } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const crypto = require('crypto');

const isMac = process.platform === 'darwin';
const isDev = process.argv.includes('--dev');

// Schéma cpblob:// pour afficher les copies stockées sur le disque sans les
// faire transiter en base64 par le renderer.
protocol.registerSchemesAsPrivileged([
  { scheme: 'cpblob', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

// ── Emplacements des données ────────────────────────────────────────────────
const dataDir = () => path.join(app.getPath('userData'), 'data');
const dataFile = () => path.join(dataDir(), 'corrigepro.json');
const copiesDir = () => path.join(dataDir(), 'copies');
const safeId = (id) => String(id).replace(/[^a-zA-Z0-9_-]/g, '');
const blobPath = (id) => path.join(copiesDir(), `${safeId(id)}.jpg`);

function ensureDirs() {
  fs.mkdirSync(copiesDir(), { recursive: true });
}

// Écriture atomique : fichier temporaire puis renommage (+ une copie de secours)
function writeAtomic(file, content) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, content);
  if (fs.existsSync(file)) {
    try { fs.copyFileSync(file, `${file}.bak`); } catch (_) { /* sans gravité */ }
  }
  fs.renameSync(tmp, file);
}

// ── Fenêtre ─────────────────────────────────────────────────────────────────
let win;
function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    title: 'CorrigePro',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0d1117' : '#f0f2f6',
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: isMac ? { x: 14, y: 14 } : undefined,
    icon: path.join(__dirname, '../../assets/icon.png'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });
  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, '../renderer/index.html'));
  if (isDev) win.webContents.openDevTools({ mode: 'detach' });

  // Les liens externes s'ouvrent dans le navigateur par défaut
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); }
  });
}

function buildMenu() {
  const template = [
    ...(isMac ? [{ label: app.name, submenu: [{ role: 'about', label: 'À propos de CorrigePro' }, { type: 'separator' }, { role: 'hide', label: 'Masquer CorrigePro' }, { role: 'hideOthers', label: 'Masquer les autres' }, { role: 'unhide', label: 'Tout afficher' }, { type: 'separator' }, { role: 'quit', label: 'Quitter CorrigePro' }] }] : []),
    { label: 'Fichier', submenu: [
      { label: 'Ouvrir le dossier des données', click: () => { ensureDirs(); shell.openPath(dataDir()); } },
      { type: 'separator' },
      isMac ? { role: 'close', label: 'Fermer la fenêtre' } : { role: 'quit', label: 'Quitter' },
    ] },
    { label: 'Édition', submenu: [
      { role: 'undo', label: 'Annuler' }, { role: 'redo', label: 'Rétablir' }, { type: 'separator' },
      { role: 'cut', label: 'Couper' }, { role: 'copy', label: 'Copier' }, { role: 'paste', label: 'Coller' }, { role: 'selectAll', label: 'Tout sélectionner' },
    ] },
    { label: 'Affichage', submenu: [
      { role: 'resetZoom', label: 'Taille réelle' }, { role: 'zoomIn', label: 'Agrandir' }, { role: 'zoomOut', label: 'Réduire' },
      { type: 'separator' }, { role: 'togglefullscreen', label: 'Plein écran' },
      ...(isDev ? [{ type: 'separator' }, { role: 'reload' }, { role: 'toggleDevTools' }] : []),
    ] },
    { label: 'Aide', submenu: [
      { label: 'Site de ClassPro', click: () => shell.openExternal('https://lucaslecoadoupro.github.io/classpro-desktop/') },
    ] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── IPC : données ───────────────────────────────────────────────────────────
ipcMain.handle('app:info', () => ({ version: app.getVersion(), platform: process.platform }));

ipcMain.handle('data:load', () => {
  ensureDirs();
  for (const f of [dataFile(), `${dataFile()}.bak`]) {
    try { if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { /* fichier abîmé : on tente la copie de secours */ }
  }
  return null;
});

ipcMain.handle('data:save', (_e, data) => {
  try { ensureDirs(); writeAtomic(dataFile(), JSON.stringify(data)); return { ok: true }; } catch (err) { return { ok: false, error: String(err) }; }
});

// ── IPC : synchro par fichier avec le téléphone / la tablette ───────────────
// Les fichiers reçus (AirDrop, Quick Share, Drive…) qui arrivent dans le dossier surveillé
// sont transmis au renderer, fusionnés, puis rangés dans data/synchro-recue.
const SYNC_PREFIX = 'CorrigePro-synchro';
let syncWatcher = null;
const syncSeen = new Set();

function readWhenStable(file, tries = 8) {
  return new Promise((resolve) => {
    let last = -1;
    const tick = (n) => {
      let size = -1;
      try { size = fs.statSync(file).size; } catch (_) { return resolve(null); }
      if (size > 0 && size === last) { try { return resolve(fs.readFileSync(file, 'utf8')); } catch (_) { return resolve(null); } }
      last = size;
      if (n <= 0) return resolve(null);
      setTimeout(() => tick(n - 1), 600);
    };
    tick(tries);
  });
}

function askRenderer(channel, payload) {
  if (!win || win.isDestroyed()) return Promise.resolve(null);
  const id = crypto.randomUUID();
  return new Promise((resolve) => {
    const done = (_e, rid, res) => { if (rid !== id) return; ipcMain.removeListener(`${channel}-done`, done); clearTimeout(t); resolve(res); };
    const t = setTimeout(() => { ipcMain.removeListener(`${channel}-done`, done); resolve(null); }, 30000);
    ipcMain.on(`${channel}-done`, done);
    win.webContents.send(channel, id, payload);
  });
}

async function importSyncFile(file) {
  const name = path.basename(file);
  if (syncSeen.has(name)) return;
  syncSeen.add(name);
  const text = await readWhenStable(file);
  if (!text) { syncSeen.delete(name); return; }
  const res = await askRenderer('sync:incoming', { name, text });
  // 'applied' : rangé ; 'own' (fichier envoyé par cet ordinateur) ou erreur : laissé en place
  if (res === 'applied') {
    try {
      const dest = path.join(dataDir(), 'synchro-recue');
      fs.mkdirSync(dest, { recursive: true });
      fs.renameSync(file, path.join(dest, name));
    } catch (_) { /* fichier déjà déplacé ou en lecture seule : sans gravité */ }
  }
  if (res == null) syncSeen.delete(name);
}

function scanSyncDir(dir) {
  let names = [];
  try { names = fs.readdirSync(dir); } catch (_) { return; }
  names.filter((n) => n.startsWith(SYNC_PREFIX) && n.endsWith('.json')).forEach((n) => importSyncFile(path.join(dir, n)));
}

ipcMain.handle('sync:watch', (_e, dir) => {
  if (syncWatcher) { syncWatcher.close(); syncWatcher = null; }
  if (!dir) return { on: false };
  const target = dir === 'downloads' ? app.getPath('downloads') : dir;
  try {
    let timer = null;
    syncWatcher = fs.watch(target, () => { clearTimeout(timer); timer = setTimeout(() => scanSyncDir(target), 400); });
    scanSyncDir(target);
    return { on: true, dir: target };
  } catch (err) { return { on: false, error: String(err) }; }
});

ipcMain.handle('sync:pick-dir', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'], title: 'Dossier où arrivent les fichiers du téléphone' });
  return r.canceled ? null : r.filePaths[0];
});

// Envoi : menu de partage macOS (AirDrop, Mail…) ou enregistrement dans un dossier
ipcMain.handle('sync:share', async (_e, { name, text, dir, mode }) => {
  if (mode === 'share' && isMac) {
    const tmp = path.join(app.getPath('temp'), name);
    fs.writeFileSync(tmp, text);
    new ShareMenu({ filePaths: [tmp] }).popup({ window: win });
    return { ok: true, shared: true };
  }
  const base = dir && dir !== 'downloads' ? dir : app.getPath('downloads');
  const r = await dialog.showSaveDialog(win, { defaultPath: path.join(base, name), filters: [{ name: 'Synchro CorrigePro', extensions: ['json'] }] });
  if (r.canceled) return { ok: false };
  syncSeen.add(path.basename(r.filePath)); // ne pas se ré-importer soi-même
  fs.writeFileSync(r.filePath, text);
  return { ok: true, path: r.filePath };
});

ipcMain.handle('data:open-folder', () => { ensureDirs(); shell.openPath(dataDir()); });

// ── IPC : images des copies ─────────────────────────────────────────────────
ipcMain.handle('blob:put', (_e, id, dataUrl) => {
  try {
    ensureDirs();
    const b64 = String(dataUrl).split(',')[1] || '';
    fs.writeFileSync(blobPath(id), Buffer.from(b64, 'base64'));
    return { ok: true };
  } catch (err) { return { ok: false, error: String(err) }; }
});

ipcMain.handle('blob:get', (_e, id) => {
  try { return `data:image/jpeg;base64,${fs.readFileSync(blobPath(id)).toString('base64')}`; } catch (_) { return null; }
});

ipcMain.handle('blob:delete', (_e, ids) => {
  for (const id of ids || []) { try { fs.unlinkSync(blobPath(id)); } catch (_) { /* déjà absent */ } }
  return { ok: true };
});

// ── IPC : impression ────────────────────────────────────────────────────────
ipcMain.handle('print:system', (e, { landscape }) => new Promise((resolve) => {
  const wc = e.sender;
  wc.print({ silent: false, printBackground: true, landscape: !!landscape, margins: { marginType: 'none' } }, (ok, reason) => {
    resolve(ok ? { ok: true } : { ok: reason === 'cancelled' ? true : false, error: reason === 'cancelled' ? undefined : reason });
  });
}));

ipcMain.handle('print:pdf', async (e, { landscape, defaultName }) => {
  const safe = String(defaultName || 'CorrigePro').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 120);
  const { canceled, filePath } = await dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender), {
    title: 'Enregistrer en PDF',
    defaultPath: path.join(app.getPath('documents'), `${safe}.pdf`),
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (canceled || !filePath) return { ok: false, canceled: true };
  try {
    const pdf = await e.sender.printToPDF({ printBackground: true, landscape: !!landscape, preferCSSPageSize: true, margins: { marginType: 'none' } });
    fs.writeFileSync(filePath, pdf);
    shell.showItemInFolder(filePath);
    return { ok: true, path: filePath };
  } catch (err) { return { ok: false, error: String(err) }; }
});

// ── IPC : sauvegardes ───────────────────────────────────────────────────────
ipcMain.handle('backup:export', async (e, { data, withImages }) => {
  const stamp = new Date().toISOString().slice(0, 10);
  const { canceled, filePath } = await dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender), {
    title: 'Exporter une sauvegarde CorrigePro',
    defaultPath: path.join(app.getPath('documents'), `CorrigePro-sauvegarde-${stamp}.json`),
    filters: [{ name: 'Sauvegarde CorrigePro', extensions: ['json'] }],
  });
  if (canceled || !filePath) return { ok: false, canceled: true };
  try {
    const payload = { app: 'CorrigePro', version: 1, date: new Date().toISOString(), data, blobs: {} };
    if (withImages) {
      for (const ev of data.evals || []) {
        for (const c of Object.values(ev.copies || {})) {
          for (const p of c.pages || []) {
            try { payload.blobs[p.id] = `data:image/jpeg;base64,${fs.readFileSync(blobPath(p.id)).toString('base64')}`; } catch (_) { /* image manquante */ }
          }
        }
      }
    }
    fs.writeFileSync(filePath, JSON.stringify(payload));
    return { ok: true, path: filePath };
  } catch (err) { return { ok: false, error: String(err) }; }
});

// ── Démarrage ───────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  ensureDirs();
  protocol.handle('cpblob', (req) => {
    const u = new URL(req.url);
    const id = decodeURIComponent(u.pathname.replace(/^\//, '').replace(/\.jpg$/, ''));
    return net.fetch(pathToFileURL(blobPath(id)).toString());
  });
  buildMenu();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (!isMac) app.quit(); });
