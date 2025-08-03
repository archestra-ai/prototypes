import { BrowserWindow, app } from 'electron';
import started from 'electron-squirrel-startup';
import getPort from 'get-port';
import { ChildProcess, fork } from 'node:child_process';
import path from 'node:path';

import { runDatabaseMigrations } from '@backend/database';
import { OllamaServer } from '@backend/llms/ollama';
import { MCPServerSandboxManager } from '@backend/mcpServerSandbox';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const SERVER_PORT = 3456;
let serverProcess: ChildProcess | null = null;
let ollamaServer: OllamaServer | null = null;

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    resizable: true,
    movable: true,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 16, y: 17 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  // Open the DevTools.
  mainWindow.webContents.openDevTools();
};

/**
 * Start the Fastify server in a separate Node.js process
 *
 * This function spawns the server as a child process because:
 * 1. The server needs access to native Node.js modules (better-sqlite3)
 * 2. Electron's renderer process has restrictions on native modules
 * 3. Running in a separate process allows for better error isolation
 * 4. The server can be restarted independently of the Electron app
 */
function startFastifyServer(): void {
  // server-process.js is built by Vite from src/server-process.ts
  // It's placed in the same directory as main.js after building
  const serverPath = path.join(__dirname, 'server-process.js');

  console.log(`Fastify server starting on port ${SERVER_PORT}`);

  // Fork creates a new Node.js process that can communicate with the parent
  serverProcess = fork(serverPath, [], {
    env: {
      ...process.env,
      // CRITICAL: This flag tells Electron to run this process as pure Node.js
      // Without it, the process would run as an Electron process and fail to load native modules
      ELECTRON_RUN_AS_NODE: '1',
    },
    silent: false, // Allow console output from child process for debugging
  });

  // Handle server process errors
  serverProcess.on('error', (error) => {
    console.error('Server process error:', error);
  });

  // Handle server process exit
  serverProcess.on('exit', (code, signal) => {
    console.log(`Server process exited with code ${code} and signal ${signal}`);
    serverProcess = null;
  });
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', async () => {
  await runDatabaseMigrations();

  const ollamaPort = await getPort();
  ollamaServer = new OllamaServer(ollamaPort);
  await ollamaServer.startProcess();

  /**
   * NOTE: for now the podman mcp server sandbox is still super experimental/WIP so don't
   * crash the app if it fails to start
   */
  try {
    await MCPServerSandboxManager.startAllInstalledMcpServers();
  } catch (error) {
    console.error('Error starting MCP servers:', error);
  }

  startFastifyServer();
  createWindow();
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Gracefully stop server on quit
app.on('before-quit', async (event) => {
  if (serverProcess || ollamaServer) {
    event.preventDefault();

    // Stop Ollama server
    if (ollamaServer) {
      try {
        await ollamaServer.stopProcess();
        console.log('Ollama server stopped');
      } catch (error) {
        console.error('Error stopping Ollama server:', error);
      }
    }

    // Stop all installed MCP servers
    await MCPServerSandboxManager.stopAllInstalledMcpServers();

    // Kill the server process gracefully
    if (serverProcess) {
      serverProcess.kill('SIGTERM');

      // Wait for process to exit
      await new Promise<void>((resolve) => {
        if (!serverProcess) {
          resolve();
          return;
        }

        serverProcess.on('exit', () => {
          resolve();
        });

        // Force kill after 5 seconds
        setTimeout(() => {
          if (serverProcess) {
            serverProcess.kill('SIGKILL');
          }
          resolve();
        }, 5000);
      });
    }

    app.exit();
  }
});

// Clean up on unexpected exit
process.on('exit', async () => {
  if (serverProcess) {
    serverProcess.kill('SIGKILL');
  }

  if (ollamaServer) {
    await ollamaServer.stopProcess();
  }

  /**
   * NOTE: for now the podman mcp server sandbox is still super experimental/WIP so don't
   * prevent shutting down the app if it fails to stop the podman machine
   */
  try {
    await MCPServerSandboxManager.stopAllInstalledMcpServers();
  } catch (error) {
    console.error('Error stopping MCP servers:', error);
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
