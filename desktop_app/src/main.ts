import * as Sentry from '@sentry/electron/main';
import chokidar from 'chokidar';
import { BrowserWindow, app, ipcMain, shell } from 'electron';
import started from 'electron-squirrel-startup';
import { ChildProcess, fork } from 'node:child_process';
import path from 'node:path';
import { updateElectronApp } from 'update-electron-app';

import log from '@backend/utils/logger';

import config from './config';

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
 * Start the backendin a separate Node.js process
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

        // If process doesn't exit after 5 seconds, force kill it
        setTimeout(() => {
          if (existingProcess.killed === false) {
            log.warn('Server process did not exit gracefully, force killing');
            existingProcess.kill('SIGKILL');
          }
          resolve();
        }, 5000);
      } else {
        resolve();
      }
    });

    // Wait a bit more to ensure ports are released
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  /**
   * Fork creates a new Node.js process that can communicate with the parent
   * pass --transpileOnly (disable type checking) to increase startup speed
   *
   * https://github.com/fastify/fastify/discussions/3795#discussioncomment-4690921
   */
  serverProcess = fork(serverPath, ['--transpileOnly'], {
    env: {
      ...process.env,
      // CRITICAL: This flag tells Electron to run this process as pure Node.js
      // Without it, the process would run as an Electron process and fail to load native modules
      ELECTRON_RUN_AS_NODE: '1',
      /**
       * NOTE: we are passing these paths in here because electron's app object is not available in
       * forked processes..
       *
       * According to https://www.electronjs.org/docs/latest/api/app#appgetpathname
       *
       * userData - The directory for storing your app's configuration files, which by default is the appData directory
       * appended with your app's name. By convention files storing user data should be written to this directory, and
       * it is not recommended to write large files here because some environments may backup this directory to cloud
       * storage.
       * logs - Directory for your app's log folder.
       */
      ARCHESTRA_USER_DATA_PATH: app.getPath('userData'),
      ARCHESTRA_LOGS_PATH: app.getPath('logs'),
    },
    silent: false, // Allow console output from child process for debugging
  });

  // Handle server process errors
  serverProcess.on('error', (error) => {
    log.error('Server process error:', error);
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

// Set up IPC handler for Slack authentication
ipcMain.handle('slack-auth', async () => {
  return new Promise((resolve, reject) => {
    // Create a new browser window for Slack authentication
    const authWindow = new BrowserWindow({
      width: 1024,
      height: 768,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: false, // Disable web security to allow JavaScript execution
        partition: 'persist:slack-auth', // Use a persistent session
      },
      // Show standard window chrome with menu bar
      autoHideMenuBar: false,
      titleBarStyle: 'default',
      frame: true,
      menuBarVisible: true,
    });

    // Store workspace ID when we detect it
    let detectedWorkspaceId: string | null = null;

    // Show the URL in the window title
    authWindow.webContents.on('page-title-updated', (event, title) => {
      const url = authWindow.webContents.getURL();
      authWindow.setTitle(`${title} - ${url}`);
    });

    // Prevent external navigation and opening new windows
    authWindow.webContents.on('will-navigate', (event, url) => {
      console.log('Navigation attempt to:', url);

      // Block slack:// protocol URLs (desktop app links)
      if (url.startsWith('slack://')) {
        event.preventDefault();

        // Extract workspace ID from the slack:// URL
        const match = url.match(/slack:\/\/([A-Z0-9]+)/);
        if (match && match[1]) {
          detectedWorkspaceId = match[1];
          console.log('Detected workspace ID from slack:// URL:', detectedWorkspaceId);
          // When slack:// is attempted, we know we're authenticated, so check for tokens
          checkForTokens(authWindow.webContents.getURL());
        }
        return;
      }

      // Allow navigation within Slack domains
      if (!url.startsWith('https://slack.com/') && !url.startsWith('https://app.slack.com/')) {
        event.preventDefault();
      }
    });

    // Also handle new window requests
    authWindow.webContents.on('new-window', (event, url) => {
      event.preventDefault();
      if (url.startsWith('slack://')) {
        // When slack:// is attempted, check for tokens
        checkForTokens(authWindow.webContents.getURL());
      }
    });

    // Prevent opening new windows (like when Slack tries to open desktop app)
    authWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('slack://')) {
        // When slack:// is attempted, check for tokens
        checkForTokens(authWindow.webContents.getURL());
        return { action: 'deny' };
      }
      // Prevent opening any new windows, load in the same window instead
      if (url.startsWith('https://slack.com/') || url.startsWith('https://app.slack.com/')) {
        authWindow.loadURL(url);
      }
      return { action: 'deny' };
    });

    // Open dev tools for debugging (you can remove this later)
    authWindow.webContents.openDevTools();

    // Load Slack sign-in page
    authWindow.loadURL('https://slack.com/signin');

    // Function to extract tokens
    const extractTokens = async () => {
      try {
        // First get the xoxd token from cookies using Electron's API
        const cookies = await authWindow.webContents.session.cookies.get({ name: 'd' });
        const dCookie = cookies.length > 0 ? cookies[0] : null;
        const xoxdToken = dCookie ? dCookie.value : null;
        console.log('Found d cookie via Electron API:', xoxdToken ? `yes (length: ${xoxdToken.length})` : 'no');

        const result = await authWindow.webContents.executeJavaScript(`
              (function() {
                try {
                  // Use the detected workspace ID if available
                  let workspaceId = '${detectedWorkspaceId || ''}';
                  
                  // If not provided, try to extract from URL
                  if (!workspaceId) {
                    const clientMatch = window.location.pathname.match(/^\\/client\\/([A-Z0-9]+)/);
                    if (clientMatch) {
                      workspaceId = clientMatch[1];
                    }
                  }
                  
                  // If still not found, try to extract from localStorage keys
                  if (!workspaceId) {
                    const localConfig = localStorage.getItem('localConfig_v2');
                    if (localConfig) {
                      const config = JSON.parse(localConfig);
                      // Get the first workspace ID from teams object
                      const teamIds = Object.keys(config.teams || {});
                      if (teamIds.length > 0) {
                        workspaceId = teamIds[0];
                      }
                    }
                  }
                  
                  if (!workspaceId) {
                    return {
                      success: false,
                      error: 'Could not extract workspace ID (tried detected: ${detectedWorkspaceId || 'none'}, URL, and localStorage)'
                    };
                  }
                  
                  console.log('Using workspace ID:', workspaceId);
                  
                  // Debug: Check localStorage
                  console.log('localStorage keys:', Object.keys(localStorage));
                  console.log('Looking for localConfig_v2...');
                  
                  // Get xoxc token from localStorage
                  const localConfig = localStorage.getItem('localConfig_v2');
                  if (!localConfig) {
                    // Try other possible keys
                    const possibleKeys = ['localConfig', 'localConfig_v1', 'localConfig_v2', 'boot_data'];
                    for (const key of possibleKeys) {
                      const value = localStorage.getItem(key);
                      if (value) {
                        console.log('Found localStorage key:', key, 'with value length:', value.length);
                        try {
                          const parsed = JSON.parse(value);
                          if (parsed.teams) {
                            console.log('Found teams in', key, ':', Object.keys(parsed.teams));
                          }
                        } catch (e) {
                          console.log('Could not parse', key);
                        }
                      }
                    }
                    
                    return {
                      success: false,
                      error: 'localConfig_v2 not found in localStorage. Available keys: ' + Object.keys(localStorage).join(', ')
                    };
                  }
                  
                  console.log('Found localConfig_v2, parsing...');
                  const config = JSON.parse(localConfig);
                  console.log('Config teams:', config.teams ? Object.keys(config.teams) : 'no teams');
                  
                  if (!config.teams || !config.teams[workspaceId]) {
                    return {
                      success: false,
                      error: 'Workspace ' + workspaceId + ' not found in localConfig. Available teams: ' + (config.teams ? Object.keys(config.teams).join(', ') : 'none')
                    };
                  }
                  
                  const xoxcToken = config.teams[workspaceId].token;
                  console.log('Found xoxc token:', xoxcToken ? 'yes (length: ' + xoxcToken.length + ')' : 'no');
                  
                  // Return just the xoxc token, xoxd will be added from Electron's cookie API
                  return {
                    success: true,
                    xoxcToken: xoxcToken
                  };
                } catch (error) {
                  return {
                    success: false,
                    error: error.message
                  };
                }
              })();
            `);

        console.log('Token extraction result:', result);

        if (result.success && result.xoxcToken && xoxdToken) {
          // Both tokens found, close the window and resolve
          const tokens = {
            slack_mcp_xoxc_token: result.xoxcToken,
            slack_mcp_xoxd_token: xoxdToken,
          };
          console.log('Both tokens found successfully!');
          authWindow.close();
          resolve(tokens);
          return true;
        } else {
          const error = !result.success
            ? result.error
            : !result.xoxcToken
              ? 'Missing xoxc token'
              : !xoxdToken
                ? 'Missing xoxd token (d cookie)'
                : 'Unknown error';
          console.error('Failed to extract tokens:', error);
          return false;
        }
      } catch (error) {
        console.error('Error extracting tokens:', error);
        return false;
      }
    };

    // Handle when the user has signed in and navigated to a workspace
    const checkForTokens = async (url: string) => {
      // Check if we're on the redirect page or client page
      if (url.includes('/ssb/redirect') || url.includes('app.slack.com/client/')) {
        // Wait a bit for the page to fully load, then try to extract tokens
        setTimeout(async () => {
          await extractTokens();
        }, 1000);
      }
    };

    // Inject script to fix workspace clicks
    const injectWorkspaceClickHandler = async () => {
      await authWindow.webContents.executeJavaScript(`
        // Find all workspace links and fix their behavior
        const workspaceLinks = document.querySelectorAll('a[href*="/client/"], button[aria-label*="Launch"]');
        
        workspaceLinks.forEach(link => {
          // Remove any existing click handlers
          const newLink = link.cloneNode(true);
          link.parentNode.replaceChild(newLink, link);
          
          // Add our own click handler
          newLink.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            // Extract the workspace URL
            let targetUrl = newLink.href || newLink.getAttribute('data-href');
            
            // If no href, try to find it in the parent elements
            if (!targetUrl) {
              const parent = newLink.closest('a[href]');
              if (parent) targetUrl = parent.href;
            }
            
            if (targetUrl && targetUrl.includes('/client/')) {
              // Navigate directly to the workspace URL
              window.location.href = targetUrl;
            } else {
              // Try to extract workspace ID from the page and construct URL
              const workspaceElement = newLink.closest('[data-workspace-id]') || 
                                       newLink.closest('[data-team-id]');
              if (workspaceElement) {
                const workspaceId = workspaceElement.getAttribute('data-workspace-id') || 
                                   workspaceElement.getAttribute('data-team-id');
                if (workspaceId) {
                  window.location.href = 'https://app.slack.com/client/' + workspaceId;
                }
              }
            }
          });
        });
        
        console.log('Fixed ' + workspaceLinks.length + ' workspace links');
      `);
    };

    // Listen to multiple navigation events to catch the workspace URL
    authWindow.webContents.on('did-navigate', async (event, url) => {
      // Update the title bar with the URL
      authWindow.setTitle(`Slack Authentication - ${url}`);
      checkForTokens(url);
    });

    authWindow.webContents.on('did-navigate-in-page', async (event, url) => {
      checkForTokens(url);
    });

    authWindow.webContents.on('did-frame-navigate', async (event, url) => {
      checkForTokens(url);
    });

    // When page finishes loading, check if we're on the right page and inject helper
    authWindow.webContents.on('did-finish-load', async () => {
      const url = authWindow.webContents.getURL();

      // Handle the redirect page - navigate to workspace
      if (url.includes('/ssb/redirect')) {
        console.log('On redirect page, navigating to workspace...');

        // Show message
        await authWindow.webContents.executeJavaScript(`
          // Add a message to the page
          const existingMessage = document.getElementById('archestra-message');
          if (!existingMessage) {
            const messageDiv = document.createElement('div');
            messageDiv.id = 'archestra-message';
            messageDiv.style.cssText = 'position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: #4A154B; color: white; padding: 15px 20px; border-radius: 8px; z-index: 10000; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);';
            messageDiv.innerHTML = '<strong>Archestra:</strong> Navigating to workspace...';
            document.body.appendChild(messageDiv);
          }
        `);

        // If we have a workspace ID, navigate directly to it
        if (detectedWorkspaceId) {
          console.log('Navigating to workspace with ID:', detectedWorkspaceId);
          authWindow.loadURL(`https://app.slack.com/client/${detectedWorkspaceId}`);
        } else {
          // Try to click the "Slack in your browser" link
          await authWindow.webContents.executeJavaScript(`
            const browserLink = document.querySelector('a[href*="/client/"]');
            if (browserLink) {
              console.log('Found browser link, navigating to:', browserLink.href);
              window.location.href = browserLink.href;
            } else {
              // Alternative: look for any link with text containing "browser"
              const links = Array.from(document.querySelectorAll('a'));
              const targetLink = links.find(link => link.textContent.toLowerCase().includes('browser'));
              if (targetLink) {
                console.log('Found browser link by text, navigating to:', targetLink.href);
                window.location.href = targetLink.href;
              }
            }
          `);
        }
      } else if (url.includes('app.slack.com/client/')) {
        // Inject a message to inform the user and try to extract tokens
        await authWindow.webContents.executeJavaScript(`
          // Add a message to the page
          const existingMessage = document.getElementById('archestra-message');
          if (!existingMessage) {
            const messageDiv = document.createElement('div');
            messageDiv.id = 'archestra-message';
            messageDiv.style.cssText = 'position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: #4A154B; color: white; padding: 15px 20px; border-radius: 8px; z-index: 10000; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);';
            messageDiv.innerHTML = '<strong>Archestra:</strong> Extracting Slack authentication tokens...';
            document.body.appendChild(messageDiv);
          }
        `);

        // Try to extract tokens immediately
        const success = await extractTokens();

        if (!success) {
          // If extraction failed, show an error message
          await authWindow.webContents.executeJavaScript(`
            const messageDiv = document.getElementById('archestra-message');
            if (messageDiv) {
              messageDiv.style.background = '#E01E5A';
              messageDiv.innerHTML = '<strong>Archestra:</strong> Please make sure you are logged into Slack. You may need to refresh the page.';
            }
          `);
        }
      } else if (url.includes('slack.com/ssb/signin_redirect') || url.includes('slack.com/signin')) {
        // We're on the workspace selection page or signin page

        // Check if there are workspace buttons
        const hasWorkspaces = await authWindow.webContents.executeJavaScript(`
          document.querySelectorAll('button:not([disabled])').length > 0
        `);

        if (hasWorkspaces) {
          // Extract workspace information and manually navigate
          const workspaceInfo = await authWindow.webContents.executeJavaScript(`
            (function() {
              // First, look for the redirect links directly
              const redirectLinks = document.querySelectorAll('a[href*="/ssb/redirect"]');
              if (redirectLinks.length > 0) {
                // Get the first workspace link (Archestra)
                const firstLink = redirectLinks[0];
                return { redirectUrl: firstLink.href };
              }
              
              // Alternative: Find the first workspace button (Archestra)
              const buttons = Array.from(document.querySelectorAll('button'));
              const openButton = buttons.find(btn => btn.textContent.includes('Open'));
              
              if (openButton) {
                // Find the workspace container
                const container = openButton.closest('[role="listitem"], article, div[class*="workspace"]');
                if (container) {
                  // Look for workspace URL in various places
                  const link = container.querySelector('a[href*="slack.com"]');
                  const domain = container.querySelector('[class*="domain"], [class*="url"]');
                  
                  if (link) {
                    return { url: link.href };
                  } else if (domain && domain.textContent) {
                    // Extract domain like "archestra-ai.slack.com"
                    const domainText = domain.textContent.trim();
                    if (domainText.includes('.slack.com')) {
                      // Convert domain to workspace URL
                      const workspaceName = domainText.replace('.slack.com', '');
                      // We need to get the workspace ID, let's try clicking the button
                      return { needsClick: true, domain: domainText };
                    }
                  }
                }
                
                // Try to extract from the page data
                const scriptTags = Array.from(document.querySelectorAll('script'));
                for (const script of scriptTags) {
                  const content = script.textContent || '';
                  const match = content.match(/"team_id":"(T[A-Z0-9]+)"/);
                  if (match) {
                    return { workspaceId: match[1] };
                  }
                }
              }
              
              return { error: 'Could not find workspace info' };
            })();
          `);

          console.log('Workspace info:', workspaceInfo);

          if (workspaceInfo.redirectUrl) {
            // Navigate to the redirect URL
            console.log('Navigating to redirect URL:', workspaceInfo.redirectUrl);
            authWindow.loadURL(workspaceInfo.redirectUrl);
          } else if (workspaceInfo.workspaceId) {
            // Navigate directly to the workspace
            authWindow.loadURL(`https://app.slack.com/client/${workspaceInfo.workspaceId}`);
          } else if (workspaceInfo.url) {
            // Navigate to the found URL
            authWindow.loadURL(workspaceInfo.url);
          } else {
            // Show message to user
            await authWindow.webContents.executeJavaScript(`
              // Add a message to guide the user
              const existingMessage = document.getElementById('archestra-message');
              if (!existingMessage) {
                const messageDiv = document.createElement('div');
                messageDiv.id = 'archestra-message';
                messageDiv.style.cssText = 'position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: #4A154B; color: white; padding: 15px 20px; border-radius: 8px; z-index: 10000; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);';
                messageDiv.innerHTML = '<strong>Archestra:</strong> Attempting to auto-select first workspace...';
                document.body.appendChild(messageDiv);
              }
            `);

            // Try to auto-click the first workspace using the specific selector
            await authWindow.webContents.executeJavaScript(`
              // Find the Open button more specifically
              const openButtons = document.querySelectorAll('button');
              let clicked = false;
              
              for (const button of openButtons) {
                if (button.textContent.trim() === 'Open' && !button.disabled) {
                  console.log('Found Open button, attempting to click...');
                  
                  // Try multiple click methods
                  try {
                    // Method 1: Direct click
                    button.click();
                    clicked = true;
                  } catch (e) {
                    console.log('Direct click failed:', e);
                  }
                  
                  if (!clicked) {
                    try {
                      // Method 2: Dispatch mouse event
                      const clickEvent = new MouseEvent('click', {
                        view: window,
                        bubbles: true,
                        cancelable: true
                      });
                      button.dispatchEvent(clickEvent);
                      clicked = true;
                    } catch (e) {
                      console.log('Mouse event failed:', e);
                    }
                  }
                  
                  if (!clicked) {
                    // Method 3: Find the parent link and navigate to it
                    const parentLink = button.closest('a');
                    if (parentLink && parentLink.href) {
                      console.log('Found parent link:', parentLink.href);
                      window.location.href = parentLink.href;
                      clicked = true;
                    }
                  }
                  
                  break;
                }
              }
              
              if (!clicked) {
                // Last resort: Look for the workspace link directly
                const workspaceLinks = document.querySelectorAll('a[href*=".slack.com/ssb/redirect"]');
                if (workspaceLinks.length > 0) {
                  console.log('Found workspace redirect link:', workspaceLinks[0].href);
                  window.location.href = workspaceLinks[0].href;
                }
              }
            `);
          }
        }
      }
    });

    // Handle window closed
    authWindow.on('closed', () => {
      reject(new Error('Authentication window was closed'));
    });
  });
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', async () => {
  if (config.debug) {
    const serverPath = path.resolve(__dirname, '.vite/build/server-process.js');

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
