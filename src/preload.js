const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('subwaveWidget', {
  getSettings: () => ipcRenderer.invoke('widget:get-settings'),
  updateSettings: (patch) => ipcRenderer.invoke('widget:update-settings', patch),
  setViewMode: (mode) => ipcRenderer.invoke('widget:set-view-mode', mode),
  windowAction: (action) => ipcRenderer.invoke('widget:window-action', action),
  syncState: (patch) => ipcRenderer.send('widget:sync-state', patch),
  openExternal: (url) => ipcRenderer.invoke('widget:open-external', url),
  onTrayCommand: (callback) => {
    const listener = (_evt, payload) => callback(payload);
    ipcRenderer.on('tray:command', listener);
    return () => ipcRenderer.removeListener('tray:command', listener);
  },
});
