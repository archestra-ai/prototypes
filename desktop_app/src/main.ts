import * as Sentry from '@sentry/electron/main';
import chokidar from 'chokidar';
import { BrowserWindow, app, ipcMain, shell } from 'electron';
import started from 'electron-squirrel-startup';
import { ChildProcess, fork } from 'node:child_process';
import path from 'node:path';
import { updateElectronApp } from 'update-electron-app';

import log from '@backend/utils/logger';

import config from './config';
import { setupSlackAuthHandler } from './main-slack-auth';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

/**
 * Configure Sentry for error monitoring, logs, session replay, and tracing
 * https://docs.sentry.io/platforms/javascript/guides/electron/#configure
 */
Sentry.init({
  dsn: config.sentry.dsn,
  /**
   * TODO: pull from User.collectTelemetryData..
   */
});

/**
 * Enable automatic updates
 * https://github.com/electron/update-electron-app?tab=readme-ov-file#usage
 */
updateElectronApp({
  repo: `${config.build.github.owner}/${config.build.github.repoName}`,
  updateInterval: config.build.updateInterval,
});

let serverProcess: ChildProcess | null = null;

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    resizable: true,
    movable: true,
    titleBarStyle: 'hiddenInset',
    titleBarOverlay: {
      color: '#00000000',
      symbolColor: '#ffffff',
      height: 36,
    },
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
 * Start the backend in a separate Node.js process
 *
 * This function spawns the backend as a child process because:
 * 1. The backend needs access to native Node.js modules (better-sqlite3)
 * 2. Electron's renderer process has restrictions on native modules
 * 3. Running in a separate process allows for better error isolation
 * 4. The server can be restarted independently of the Electron app
 */
async function startBackendServer(): Promise<void> {
  // server-process.js is built by Vite from src/server-process.ts
  // It's placed in the same directory as main.js after building
  const serverPath = path.join(__dirname, 'server-process.js');

  // If there's an existing server process, kill it and wait for it to exit
  if (serverProcess) {
    await new Promise<void>((resolve) => {
      const existingProcess = serverProcess;

      // Set up a one-time listener for the exit event
      if (existingProcess) {
        existingProcess.once('exit', () => {
          log.info('Previous server process has exited');
          resolve();
        });

        // Send SIGTERM to trigger graceful shutdown
        existingProcess.kill('SIGTERM');

        // Fallback: Force kill after 2 seconds if process doesn't exit gracefully
        setTimeout(() => {
          if (existingProcess.exitCode === null) {
            log.warn('Server process did not exit gracefully, forcing kill');
            existingProcess.kill('SIGKILL');
          }
          resolve();
        }, 2000);
      } else {
        resolve();
      }
    });

    serverProcess = null;
  }

  log.info(`Starting backend server from: ${serverPath}`);

  /**
   * Set up paths for the backend server
   * These are used by the backend to know where to store data
   */
  const userDataPath = app.getPath('userData');
  const logsPath = path.join(userDataPath, 'logs');

  serverProcess = fork(serverPath, [], {
    env: {
      ...process.env,
      NODE_ENV: config.debug ? 'development' : 'production',
      /**
       * The backend server needs to know where to store data
       * We pass these as environment variables since the server
       * runs in a separate process and doesn't have access to
       * Electron's app.getPath() directly
       */
      ARCHESTRA_USER_DATA_PATH: userDataPath,
      ARCHESTRA_LOGS_PATH: logsPath,
    },
    silent: true, // Capture stdout/stderr so we can log it
  });

  // Log server output
  serverProcess.stdout?.on('data', (data) => {
    log.info(`[Server]: ${data.toString().trim()}`);
  });

  serverProcess.stderr?.on('data', (data) => {
    log.error(`[Server Error]: ${data.toString().trim()}`);
  });

  // Handle server errors
  serverProcess.on('error', (error) => {
    log.error('Failed to start server process:', error);
  });

  // Handle server process exit
  serverProcess.on('exit', (code, signal) => {
    log.info(`Server process exited with code ${code} and signal ${signal}`);
    serverProcess = null;
  });
}

// Set up IPC handler for opening external links
ipcMain.handle('open-external', async (_event, url: string) => {
  await shell.openExternal(url);
});

// Set up Slack authentication handler
setupSlackAuthHandler();

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', async () => {
  if (config.debug) {
    const serverPath = path.join(__dirname, 'server-process.js');

    chokidar.watch(serverPath).on('change', async () => {
      log.info('Restarting server..');
      await startBackendServer();
    });
  }
  await startBackendServer();
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
  if (serverProcess) {
    event.preventDefault();

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
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
