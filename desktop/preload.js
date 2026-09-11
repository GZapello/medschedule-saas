const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('isElectron', true);
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  version: '1.0.0'
});
