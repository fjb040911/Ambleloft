const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('extensionProbe', { ping: () => ipcRenderer.invoke('extension-probe:ping') });
