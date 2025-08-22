import { BrowserWindow, ipcMain } from 'electron';

import log from './backend/utils/logger';

/**
 * @deprecated This module is deprecated. Use the provider-based browser authentication system instead.
 * See main-browser-auth.ts and the 'slack-browser' provider configuration in oauth-providers.ts
 *
 * Legacy Slack authentication handler - kept for backward compatibility only.
 * Handles Slack authentication flow in a secure browser window
 * Extracts xoxc token from localStorage and xoxd token from cookies
 */
export function setupSlackAuthHandler() {
  ipcMain.handle('slack-auth', async () => {
    return new Promise((resolve, reject) => {
      let authWindow: BrowserWindow | null = null;
      let detectedWorkspaceId: string | null = null;

      try {
        // Create a secure browser window for Slack authentication
        authWindow = new BrowserWindow({
          width: 1024,
          height: 768,
          webPreferences: {
            // Security settings - keep all security features enabled
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: true, // Keep web security enabled for production
            sandbox: true, // Enable sandbox for additional security

            // Use a separate session for authentication
            partition: 'persist:slack-auth',

            // Security: Block insecure content
            allowRunningInsecureContent: false,
          },
          // Show standard window chrome for transparency
          autoHideMenuBar: false,
          titleBarStyle: 'default',
          frame: true,
        });

        // Setup security and navigation handlers
        setupNavigationHandlers(authWindow, (workspaceId) => {
          detectedWorkspaceId = workspaceId;
        });

        // Setup token extraction
        setupTokenExtraction(authWindow, detectedWorkspaceId, resolve, reject);

        // Handle window closed
        authWindow.on('closed', () => {
          authWindow = null;
          reject(new Error('Authentication window was closed by user'));
        });

        // Load Slack sign-in page
        authWindow.loadURL('https://slack.com/signin');
      } catch (error) {
        log.error('[Slack Auth] Error creating auth window:', error);
        if (authWindow) {
          authWindow.close();
        }
        reject(error);
      }
    });
  });
}

/**
 * Sets up navigation handlers to restrict navigation to Slack domains only
 */
function setupNavigationHandlers(authWindow: BrowserWindow, onWorkspaceDetected: (workspaceId: string) => void) {
  // Show URL in title for transparency
  authWindow.webContents.on('page-title-updated', (_event, title) => {
    const url = authWindow.webContents.getURL();
    // Only show Slack domains in title for security
    if (url.includes('slack.com')) {
      authWindow.setTitle(`${title} - ${url}`);
    }
  });

  // Security: Restrict navigation to Slack domains only
  authWindow.webContents.on('will-navigate', (event, url) => {
    log.info('[Slack Auth] Navigation attempt to:', url);

    // Handle slack:// protocol (desktop app deep links)
    if (url.startsWith('slack://')) {
      event.preventDefault();

      // Extract workspace ID from slack:// URL format: slack://T[WORKSPACE_ID]/...
      const workspaceMatch = url.match(/slack:\/\/([A-Z0-9]+)/);
      if (workspaceMatch && workspaceMatch[1]) {
        const workspaceId = workspaceMatch[1];
        onWorkspaceDetected(workspaceId);
        log.info('[Slack Auth] Detected workspace ID:', workspaceId);

        // Navigate to web version instead of opening desktop app
        const webUrl = `https://app.slack.com/client/${workspaceId}`;
        authWindow.loadURL(webUrl);
      }
      return;
    }

    // Security: Only allow navigation to official Slack domains
    const isSlackDomain =
      url.startsWith('https://slack.com/') || url.startsWith('https://app.slack.com/') || url.includes('.slack.com/');

    if (!isSlackDomain) {
      log.warn('[Slack Auth] Blocked navigation to non-Slack domain:', url);
      event.preventDefault();
    }
  });

  // Handle new window requests - navigate in same window for Slack URLs
  authWindow.webContents.setWindowOpenHandler(({ url }) => {
    log.info('[Slack Auth] New window request:', url);

    // If it's a Slack URL, navigate in the same window instead of opening new window
    if (
      url.startsWith('https://slack.com/') ||
      url.startsWith('https://app.slack.com/') ||
      url.includes('.slack.com/')
    ) {
      log.info('[Slack Auth] Navigating to:', url);
      authWindow.loadURL(url);
    }

    // Deny opening a new window but we've handled the navigation above
    return { action: 'deny' };
  });
}

/**
 * Sets up token extraction logic for when user reaches the workspace
 */
function setupTokenExtraction(
  authWindow: BrowserWindow,
  detectedWorkspaceId: string | null,
  resolve: (tokens: any) => void,
  reject: (error: Error) => void
) {
  // Extract tokens when page finishes loading
  authWindow.webContents.on('did-finish-load', async () => {
    const url = authWindow.webContents.getURL();
    log.info('[Slack Auth] Page loaded:', url);

    // Handle different page states
    if (url.includes('app.slack.com/client/')) {
      // We're in the workspace, extract tokens
      log.info('[Slack Auth] Detected workspace page, extracting tokens...');
      await extractTokens(authWindow, detectedWorkspaceId, resolve);
    } else if (url.includes('/ssb/redirect')) {
      // On redirect page, guide user to click "Slack in your browser"
      await showRedirectMessage(authWindow);
    } else if (url.includes('slack.com/signin')) {
      // On signin page, guide user to select workspace
      await showSigninMessage(authWindow);
    }
  });

  // Also listen for navigation within the same page (SPA navigation)
  authWindow.webContents.on('did-navigate-in-page', async () => {
    const url = authWindow.webContents.getURL();
    log.info('[Slack Auth] In-page navigation:', url);

    if (url.includes('app.slack.com/client/')) {
      log.info('[Slack Auth] Detected workspace page after navigation, extracting tokens...');
      await extractTokens(authWindow, detectedWorkspaceId, resolve);
    }
  });
}

/**
 * Extracts tokens from Slack workspace page
 */
async function extractTokens(
  authWindow: BrowserWindow,
  detectedWorkspaceId: string | null,
  resolve: (tokens: any) => void
) {
  try {
    // Show extraction message
    await authWindow.webContents.executeJavaScript(`
      const existingMessage = document.getElementById('archestra-message');
      if (!existingMessage) {
        const messageDiv = document.createElement('div');
        messageDiv.id = 'archestra-message';
        messageDiv.style.cssText = 'position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: #4A154B; color: white; padding: 15px 20px; border-radius: 8px; z-index: 10000; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);';
        messageDiv.innerHTML = '<strong>Archestra:</strong> Extracting Slack authentication tokens...';
        document.body.appendChild(messageDiv);
      }
    `);

    // Get xoxd token from cookies using Electron's API (can access HttpOnly cookies)
    const cookies = await authWindow.webContents.session.cookies.get({ name: 'd' });
    const dCookie = cookies.length > 0 ? cookies[0] : null;
    const xoxdToken = dCookie ? dCookie.value : null;

    // Get xoxc token from localStorage
    const result = await authWindow.webContents.executeJavaScript(`
      (function() {
        try {
          // Use detected workspace ID or extract from URL
          let workspaceId = '${detectedWorkspaceId || ''}';
          
          if (!workspaceId) {
            const urlMatch = window.location.pathname.match(/^\\/client\\/([A-Z0-9]+)/);
            if (urlMatch) {
              workspaceId = urlMatch[1];
            }
          }
          
          if (!workspaceId) {
            // Try to get from localStorage keys
            const localConfig = localStorage.getItem('localConfig_v2');
            if (localConfig) {
              const config = JSON.parse(localConfig);
              const teamIds = Object.keys(config.teams || {});
              if (teamIds.length > 0) {
                workspaceId = teamIds[0];
              }
            }
          }
          
          if (!workspaceId) {
            return { success: false, error: 'Could not determine workspace ID' };
          }
          
          // Get xoxc token from localStorage
          const localConfig = localStorage.getItem('localConfig_v2');
          if (!localConfig) {
            return { success: false, error: 'localConfig_v2 not found in localStorage' };
          }
          
          const config = JSON.parse(localConfig);
          if (!config.teams || !config.teams[workspaceId]) {
            return { success: false, error: 'Workspace not found in localConfig' };
          }
          
          const xoxcToken = config.teams[workspaceId].token;
          return { success: true, xoxcToken: xoxcToken };
          
        } catch (error) {
          return { success: false, error: error.message };
        }
      })();
    `);

    if (result.success && result.xoxcToken && xoxdToken) {
      const tokens = {
        slack_mcp_xoxc_token: result.xoxcToken,
        slack_mcp_xoxd_token: xoxdToken,
      };

      log.info('[Slack Auth] Successfully extracted both tokens');
      authWindow.close();
      resolve(tokens);
    } else {
      const error = !result.success
        ? result.error
        : !result.xoxcToken
          ? 'Missing xoxc token'
          : !xoxdToken
            ? 'Missing xoxd token (d cookie)'
            : 'Unknown error';

      log.error('[Slack Auth] Failed to extract tokens:', error);

      // Show error message
      await authWindow.webContents.executeJavaScript(`
        const messageDiv = document.getElementById('archestra-message');
        if (messageDiv) {
          messageDiv.style.background = '#E01E5A';
          messageDiv.innerHTML = '<strong>Archestra:</strong> Failed to extract tokens. Please ensure you are logged in.';
        }
      `);
    }
  } catch (error) {
    log.error('[Slack Auth] Error during token extraction:', error);
  }
}

/**
 * Shows message on redirect page
 */
async function showRedirectMessage(authWindow: BrowserWindow) {
  // First check if we're actually already in the workspace
  const currentUrl = authWindow.webContents.getURL();
  if (currentUrl.includes('app.slack.com/client/')) {
    log.info('[Slack Auth] Already in workspace, attempting token extraction...');
    // We're already in the workspace, extract tokens
    await extractTokens(authWindow, null, (tokens) => {
      // Token extraction succeeded, close window
      authWindow.close();
    });
    return;
  }

  await authWindow.webContents.executeJavaScript(`
    const existingMessage = document.getElementById('archestra-message');
    if (!existingMessage) {
      const messageDiv = document.createElement('div');
      messageDiv.id = 'archestra-message';
      messageDiv.style.cssText = 'position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: #4A154B; color: white; padding: 15px 20px; border-radius: 8px; z-index: 10000; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);';
      
      // Check if we're in the workspace (sometimes URL detection fails)
      if (document.querySelector('.p-workspace__sidebar') || document.querySelector('.p-client')) {
        messageDiv.innerHTML = '<strong>Archestra:</strong> Detected Slack workspace. <button onclick="window.archestraExtractTokens()" style="margin-left: 10px; padding: 5px 10px; background: white; color: #4A154B; border: none; border-radius: 4px; cursor: pointer;">Extract Tokens Now</button>';
        
        // Add extraction function to window
        window.archestraExtractTokens = function() {
          window.location.href = window.location.href; // Trigger a reload to force token extraction
        };
      } else {
        messageDiv.innerHTML = '<strong>Archestra:</strong> Click "Slack in your browser" to continue...';
      }
      
      document.body.appendChild(messageDiv);
    }
    
    // Highlight the browser link
    const browserLink = document.querySelector('a[href*="/client/"]');
    if (browserLink) {
      browserLink.style.cssText = 'border: 2px solid #4A154B !important; padding: 4px 8px !important; border-radius: 4px !important; background: #f8f8ff !important;';
    }
  `);
}

/**
 * Shows message on signin page
 */
async function showSigninMessage(authWindow: BrowserWindow) {
  await authWindow.webContents.executeJavaScript(`
    const existingMessage = document.getElementById('archestra-message');
    if (!existingMessage) {
      const messageDiv = document.createElement('div');
      messageDiv.id = 'archestra-message';
      messageDiv.style.cssText = 'position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: #4A154B; color: white; padding: 15px 20px; border-radius: 8px; z-index: 10000; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);';
      messageDiv.innerHTML = '<strong>Archestra:</strong> Please sign in and select a workspace...';
      document.body.appendChild(messageDiv);
    }
  `);
}
