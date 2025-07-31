/**
 * This file will automatically be loaded by vite and run in the "renderer" context.
 * To learn more about the differences between the "main" and the "renderer" context in
 * Electron, visit:
 *
 * https://electronjs.org/docs/tutorial/process-model
 *
 * By default, Node.js integration in this file is disabled. When enabling Node.js integration
 * in a renderer process, please be aware of potential security implications. You can read
 * more about security risks here:
 *
 * https://electronjs.org/docs/tutorial/security
 *
 * To enable Node.js integration in this file, open up `main.ts` and enable the `nodeIntegration`
 * flag:
 *
 * ```
 *  // Create the browser window.
 *  mainWindow = new BrowserWindow({
 *    width: 800,
 *    height: 600,
 *    webPreferences: {
 *      nodeIntegration: true
 *    }
 *  });
 * ```
 */

import './index.css';

console.log('👋 This message is being logged by "renderer.ts", included via Vite');

declare global {
  interface Window {
    electronAPI: {
      getServerPort: () => Promise<number>;
      onServerPort: (callback: (port: number) => void) => void;
    }
  }
}

let serverPort: number | null = null;

async function fetchFromServer() {
  try {
    if (!serverPort) {
      serverPort = await window.electronAPI.getServerPort();
    }
    
    const response = await fetch(`http://127.0.0.1:${serverPort}/api/hello`);
    const data = await response.json();
    
    const responseDiv = document.getElementById('server-response');
    if (responseDiv) {
      responseDiv.innerHTML = `
        <h3>Server Response:</h3>
        <p>Message: ${data.message}</p>
        <p>Timestamp: ${data.timestamp}</p>
        <p>Server Port: ${serverPort}</p>
      `;
    }
  } catch (error) {
    console.error('Error fetching from server:', error);
    const responseDiv = document.getElementById('server-response');
    if (responseDiv) {
      responseDiv.innerHTML = `<p style="color: red;">Error: ${error.message}</p>`;
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const button = document.getElementById('fetch-data');
  button?.addEventListener('click', fetchFromServer);
  
  // Listen for server port updates
  window.electronAPI.onServerPort((port) => {
    serverPort = port;
    fetchFromServer();
  });
  
  // Try to fetch data on load
  fetchFromServer();
});