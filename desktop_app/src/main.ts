import { app, BrowserWindow, ipcMain } from 'electron';
import started from 'electron-squirrel-startup';
import path from 'node:path';
import { runDatabaseMigrations } from './database';
import { MCPServer } from './models';
import { startServer, stopServer } from './server';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

let serverPort: number | null = null;

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
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
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
  }

  // Open the DevTools.
  mainWindow.webContents.openDevTools();

  // Send server port to renderer when ready
  mainWindow.webContents.on('did-finish-load', () => {
    if (serverPort) {
      mainWindow.webContents.send('server-port', serverPort);
    }
  });
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', async () => {
  await runDatabaseMigrations();

  try {
    serverPort = await startServer();
    console.log(`Server started on port ${serverPort}`);
  } catch (error) {
    console.error('Failed to start server:', error);
  }
  createWindow();

  // TODO: this is just an example for testing, remove this later
  MCPServer.create('test', {
    url: 'http://localhost:3000',
  });

  const servers = await MCPServer.getAll();
  console.log(servers);
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

// Handle server port request from renderer
ipcMain.handle('get-server-port', () => {
  return serverPort;
});

// Gracefully stop server on quit
app.on('before-quit', async (event) => {
  event.preventDefault();
  await stopServer();
  app.exit();
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
