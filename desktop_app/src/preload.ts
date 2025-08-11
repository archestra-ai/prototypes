// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  serverPort: 54587,
  websocketPort: 54588,
  ollamaPort: 54589,
});
