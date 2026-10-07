// Pont sécurisé entre l'interface et le système de fichiers
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('corrigepro', {
  getInfo: () => ipcRenderer.invoke('app:info'),
  loadData: () => ipcRenderer.invoke('data:load'),
  saveData: (data) => ipcRenderer.invoke('data:save', data),
  openDataFolder: () => ipcRenderer.invoke('data:open-folder'),
  blobPut: (id, dataUrl) => ipcRenderer.invoke('blob:put', id, dataUrl),
  blobGet: (id) => ipcRenderer.invoke('blob:get', id),
  blobDelete: (ids) => ipcRenderer.invoke('blob:delete', ids),
  print: (opts) => ipcRenderer.invoke('print:system', opts),
  printToPdf: (opts) => ipcRenderer.invoke('print:pdf', opts),
  exportBackup: (opts) => ipcRenderer.invoke('backup:export', opts),
});
