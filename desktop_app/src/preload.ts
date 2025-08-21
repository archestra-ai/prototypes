// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { IpcRendererEvent, contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  serverPort: 54587,
  websocketPort: 54588,
  ollamaPort: 54589,
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  slackAuth: () => ipcRenderer.invoke('slack-auth'),
  onOAuthCallback: (callback: (params: any) => void) => {
    ipcRenderer.on('oauth-callback', (_event: IpcRendererEvent, params: any) => {
      callback(params);
    });
  },
  removeOAuthCallbackListener: () => {
    ipcRenderer.removeAllListeners('oauth-callback');
  },
});
