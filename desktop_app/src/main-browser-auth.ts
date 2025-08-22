/**
 * Generic Browser Authentication Handler
 *
 * This module provides a flexible browser-based authentication system
 * that works with any OAuth provider through configuration.
 */
import { BrowserWindow, ipcMain } from 'electron';

import { OAuthProviderDefinition } from './backend/config/oauth-provider-interface';
import { getOAuthProvider, hasOAuthProvider } from './backend/config/oauth-providers';
import log from './backend/utils/logger';

/**
 * Set up browser authentication handlers for all configured providers
 */
export function setupProviderBrowserAuthHandlers() {
  // Register IPC handler for provider browser auth
  ipcMain.handle('provider-browser-auth', async (_event, providerName: string) => {
    if (!hasOAuthProvider(providerName)) {
      throw new Error(`Provider ${providerName} not configured`);
    }

    const provider = getOAuthProvider(providerName);

    if (!provider.browserAuthConfig?.enabled) {
      throw new Error(`Browser auth not enabled for provider ${providerName}`);
    }

    return handleBrowserAuth(provider);
  });

  // Legacy support for Slack (backward compatibility)
  ipcMain.handle('slack-auth', async () => {
    const provider = getOAuthProvider('slack');
    return handleBrowserAuth(provider);
  });

  log.info('[Browser Auth] Provider browser auth handlers registered');
}

/**
 * Handle browser-based authentication for a provider
 */
async function handleBrowserAuth(provider: OAuthProviderDefinition): Promise<any> {
  return new Promise((resolve, reject) => {
    let authWindow: BrowserWindow | null = null;
    let detectedWorkspaceId: string | null = null;

    const config = provider.browserAuthConfig;
    if (!config) {
      reject(new Error(`No browser auth config for provider ${provider.name}`));
      return;
    }

    try {
      // Create a secure browser window for authentication
      authWindow = new BrowserWindow({
        width: 1024,
        height: 768,
        webPreferences: {
          // Security settings - keep all security features enabled
          nodeIntegration: false,
          contextIsolation: true,
          webSecurity: true,
          sandbox: true,
          // Use a separate session for authentication
          partition: `persist:${provider.name}-auth`,
          // Security: Block insecure content
          allowRunningInsecureContent: false,
        },
        // Show standard window chrome for transparency
        autoHideMenuBar: false,
        titleBarStyle: 'default',
        frame: true,
      });

      // Setup navigation handlers
      setupNavigationHandlers(authWindow, provider, (workspaceId) => {
        detectedWorkspaceId = workspaceId;
      });

      // Setup token extraction
      setupTokenExtraction(authWindow, provider, detectedWorkspaceId, resolve, reject);

      // Handle window closed
      authWindow.on('closed', () => {
        authWindow = null;
        reject(new Error('Authentication window was closed by user'));
      });

      // Load the login page
      authWindow.loadURL(config.loginUrl);
    } catch (error) {
      log.error(`[Browser Auth] Error creating auth window for ${provider.name}:`, error);
      if (authWindow) {
        authWindow.close();
      }
      reject(error);
    }
  });
}

/**
 * Set up navigation handlers for the authentication window
 */
function setupNavigationHandlers(
  authWindow: BrowserWindow,
  provider: OAuthProviderDefinition,
  onWorkspaceDetected: (workspaceId: string) => void
) {
  const config = provider.browserAuthConfig;
  if (!config) return;

  // Show URL in title for transparency
  authWindow.webContents.on('page-title-updated', (_event, title) => {
    const url = authWindow.webContents.getURL();
    // Only show provider domains in title for security
    if (config.navigationRules ? config.navigationRules(url) : true) {
      authWindow.setTitle(`${title} - ${url}`);
    }
  });

  // Security: Restrict navigation based on provider rules
  authWindow.webContents.on('will-navigate', (event, url) => {
    log.info(`[Browser Auth - ${provider.name}] Navigation attempt to:`, url);

    // Handle provider-specific protocols (e.g., slack://)
    if (config.workspacePattern) {
      const match = url.match(config.workspacePattern);
      if (match && match[1]) {
        event.preventDefault();
        onWorkspaceDetected(match[1]);
        log.info(`[Browser Auth - ${provider.name}] Detected workspace ID:`, match[1]);

        // Navigate to web version if needed
        if (provider.name === 'slack') {
          const webUrl = `https://app.slack.com/client/${match[1]}`;
          authWindow.loadURL(webUrl);
        }
        return;
      }
    }

    // Apply navigation rules
    if (config.navigationRules) {
      const isAllowed = config.navigationRules(url);
      if (!isAllowed) {
        log.warn(`[Browser Auth - ${provider.name}] Blocked navigation to:`, url);
        event.preventDefault();
      }
    }
  });

  // Handle new window requests
  authWindow.webContents.setWindowOpenHandler(({ url }) => {
    log.info(`[Browser Auth - ${provider.name}] New window request:`, url);

    // If it's an allowed URL, navigate in the same window
    if (config.navigationRules ? config.navigationRules(url) : true) {
      log.info(`[Browser Auth - ${provider.name}] Navigating to:`, url);
      authWindow.loadURL(url);
    }

    // Deny opening a new window
    return { action: 'deny' };
  });
}

/**
 * Set up token extraction logic for when authentication is complete
 */
function setupTokenExtraction(
  authWindow: BrowserWindow,
  provider: OAuthProviderDefinition,
  detectedWorkspaceId: string | null,
  resolve: (tokens: any) => void,
  reject: (error: Error) => void
) {
  const config = provider.browserAuthConfig;
  if (!config) return;

  // Extract tokens when page finishes loading
  authWindow.webContents.on('did-finish-load', async () => {
    const url = authWindow.webContents.getURL();
    log.info(`[Browser Auth - ${provider.name}] Page loaded:`, url);

    // Provider-specific token extraction
    try {
      // Pass workspace ID to extraction function if available
      const extractionContext = {
        url,
        workspaceId: detectedWorkspaceId,
        provider: provider.name,
      };

      // Try to extract tokens - pass the window and context properly
      const tokens = await config.extractTokens({
        webContents: authWindow.webContents,
        session: authWindow.webContents.session,
        context: extractionContext,
      });

      if (tokens) {
        log.info(`[Browser Auth - ${provider.name}] Successfully extracted tokens`);
        authWindow.close();
        resolve(tokens);
      }
    } catch (error) {
      // Token extraction might fail on intermediate pages, which is normal
      log.debug(`[Browser Auth - ${provider.name}] Token extraction attempt on ${url}:`, error);
    }
  });

  // Also listen for navigation within the same page (SPA navigation)
  authWindow.webContents.on('did-navigate-in-page', async () => {
    const url = authWindow.webContents.getURL();
    log.info(`[Browser Auth - ${provider.name}] In-page navigation:`, url);

    try {
      const extractionContext = {
        url,
        workspaceId: detectedWorkspaceId,
        provider: provider.name,
      };

      const tokens = await config.extractTokens({
        webContents: authWindow.webContents,
        session: authWindow.webContents.session,
        context: extractionContext,
      });

      if (tokens) {
        log.info(`[Browser Auth - ${provider.name}] Successfully extracted tokens after navigation`);
        authWindow.close();
        resolve(tokens);
      }
    } catch (error) {
      log.debug(`[Browser Auth - ${provider.name}] Token extraction attempt after navigation:`, error);
    }
  });
}

/**
 * Helper function to show messages in the browser window
 */
export async function showBrowserMessage(
  window: BrowserWindow,
  message: string,
  type: 'info' | 'error' | 'success' = 'info'
) {
  const backgroundColor = type === 'error' ? '#E01E5A' : type === 'success' ? '#2eb67d' : '#4A154B';

  await window.webContents.executeJavaScript(`
    const existingMessage = document.getElementById('archestra-message');
    if (!existingMessage) {
      const messageDiv = document.createElement('div');
      messageDiv.id = 'archestra-message';
      messageDiv.style.cssText = 'position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: ${backgroundColor}; color: white; padding: 15px 20px; border-radius: 8px; z-index: 10000; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);';
      messageDiv.innerHTML = '<strong>Archestra:</strong> ${message}';
      document.body.appendChild(messageDiv);
    } else {
      existingMessage.style.background = '${backgroundColor}';
      existingMessage.innerHTML = '<strong>Archestra:</strong> ${message}';
    }
  `);
}
