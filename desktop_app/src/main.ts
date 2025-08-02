import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { fork, ChildProcess } from 'node:child_process';
import started from 'electron-squirrel-startup';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const SERVER_PORT = 3456;
let serverProcess: ChildProcess | null = null;

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
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

// Function to start the Express server in a child process
function startExpressServer(): void {
  const serverPath = path.join(__dirname, 'server-process.js');
  
  // Fork the server process
  serverProcess = fork(serverPath, [], {
    env: { ...process.env },
    silent: false // Allow console output from child process
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
app.on('ready', () => {
  startExpressServer();
  console.log(`Express server starting on port ${SERVER_PORT}`);
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
    
    app.exit();
  }
});

// Clean up on unexpected exit
process.on('exit', () => {
  if (serverProcess) {
    serverProcess.kill('SIGKILL');
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.