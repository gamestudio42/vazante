// Minimal bridge: the page gets a quit button in the main menu, nothing else.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- sandboxed preloads must be CommonJS
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vazanteDesktop', {
  quit: () => ipcRenderer.send('vazante:quit'),
});
