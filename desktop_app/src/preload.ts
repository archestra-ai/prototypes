// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { contextBridge, ipcRenderer } from 'electron';

// Server runs on static port 3456
contextBridge.exposeInMainWorld('electronAPI', {
  serverPort: 3456,
});
