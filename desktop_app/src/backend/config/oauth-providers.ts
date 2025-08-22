import { OAuthProviderDefinition, OAuthProviderRegistry, TokenResponse } from './oauth-provider-interface';

// Legacy interface for backward compatibility
export interface OAuthProviderConfig {
  authorizationUrl: string;
  scopes: string[];
  usePKCE: boolean;
  clientId?: string; // Public client ID (not secret)
}

/**
 * Registry of OAuth providers with extensible token handling.
 * These are PUBLIC client IDs (not secrets) - safe to hardcode.
 * The secrets are stored in the OAuth proxy server.
 */
export const oauthProviders: OAuthProviderRegistry = {
  google: {
    name: 'google',
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    scopes: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.modify',
    ],
    usePKCE: true,
    clientId:
      process.env.GOOGLE_OAUTH_CLIENT_ID || '354887056155-5b4rlcofccknibd4fv3ldud9vvac3rdf.apps.googleusercontent.com',

    // Google will use a custom token handler to write credentials to a file
    // This will be implemented when the special case is needed
    // tokenHandler: async (tokens, serverId) => {
    //   // Write credentials.json to container
    // },

    // For now, use standard env vars
    tokenEnvVarPattern: {
      accessToken: 'GOOGLE_MCP_ACCESS_TOKEN',
      refreshToken: 'GOOGLE_MCP_REFRESH_TOKEN',
      expiryDate: 'GOOGLE_MCP_TOKEN_EXPIRY',
    },

    metadata: {
      displayName: 'Google',
      documentationUrl: 'https://developers.google.com/identity/protocols/oauth2',
      supportsRefresh: true,
      notes: 'Will transition to file-based credentials in the future',
    },
  },

  slack: {
    name: 'slack',
    authorizationUrl: 'https://slack.com/oauth/v2/authorize',
    scopes: [
      'channels:read',
      'channels:history',
      'chat:write',
      'groups:read',
      'groups:history',
      'im:read',
      'im:history',
      'mpim:read',
      'mpim:history',
      'users:read',
      'users:read.email',
      'team:read',
      'files:read',
      'files:write',
    ],
    usePKCE: true,
    clientId: process.env.SLACK_OAUTH_CLIENT_ID || '9210991658150.9211748349222',

    // Slack uses standard env vars
    tokenEnvVarPattern: {
      accessToken: 'SLACK_MCP_ACCESS_TOKEN',
      // Slack doesn't use refresh tokens
    },

    // Slack-specific authorization parameters
    authorizationParams: {
      user_scope: 'identity.basic,identity.email,identity.team,identity.avatar',
    },

    // Slack supports browser-based auth as an alternative
    requiresSpecialAuth: true,

    metadata: {
      displayName: 'Slack',
      documentationUrl: 'https://api.slack.com/authentication/oauth-v2',
      supportsRefresh: false,
      notes: 'Tokens do not expire. Supports both OAuth and browser-based authentication.',
    },
  },

  'slack-browser': {
    name: 'slack-browser',
    authorizationUrl: '', // Not used for browser auth
    scopes: [], // Not used for browser auth
    usePKCE: false, // Not used for browser auth
    clientId: 'browser-auth', // Placeholder

    // Browser tokens use different env vars
    tokenEnvVarPattern: {
      accessToken: 'SLACK_MCP_XOXC_TOKEN',
      refreshToken: 'SLACK_MCP_XOXD_TOKEN', // xoxd stored as "refresh" for consistency
    },

    // Browser-based authentication configuration
    browserAuthConfig: {
      enabled: true,
      loginUrl: 'https://slack.com/signin',
      workspacePattern: /slack:\/\/([A-Z0-9]+)/,

      navigationRules: (url: string) => {
        // Only allow navigation to official Slack domains
        return (
          url.startsWith('https://slack.com/') ||
          url.startsWith('https://app.slack.com/') ||
          url.includes('.slack.com/')
        );
      },

      extractTokens: async (windowWithContext: any) => {
        // Extract the actual window parts and context
        const { webContents, session, context } = windowWithContext;
        const url = webContents.getURL();

        console.log('[Slack Browser Auth] Attempting token extraction on:', url);

        // Only try to extract on workspace pages
        if (!url.includes('app.slack.com/client/')) {
          console.log('[Slack Browser Auth] Not a workspace page, skipping token extraction');
          return null;
        }

        console.log('[Slack Browser Auth] On workspace page, extracting tokens...');

        // Get xoxd token from cookies
        const cookies = await session.cookies.get({ name: 'd' });
        const dCookie = cookies.length > 0 ? cookies[0] : null;
        const xoxdToken = dCookie ? dCookie.value : null;

        console.log('[Slack Browser Auth] Found xoxd token:', !!xoxdToken);

        // Pass the workspace ID from context if available
        const contextWorkspaceId = context?.workspaceId || '';

        // Get xoxc token from localStorage
        const result = await webContents.executeJavaScript(`
          (function() {
            try {
              console.log('[Slack Token Extraction] Starting token extraction...');
              console.log('[Slack Token Extraction] Current URL:', window.location.pathname);
              
              // Use workspace ID from context or extract from URL
              let workspaceId = '${contextWorkspaceId}';
              console.log('[Slack Token Extraction] Context workspace ID:', workspaceId || 'none');
              
              if (!workspaceId) {
                const urlMatch = window.location.pathname.match(/^\\/client\\/([A-Z0-9]+)/);
                if (urlMatch) {
                  workspaceId = urlMatch[1];
                  console.log('[Slack Token Extraction] Extracted workspace ID from URL:', workspaceId);
                }
              }
              
              if (!workspaceId) {
                // Try to get from localStorage
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
                return { success: false, error: 'localConfig_v2 not found' };
              }
              
              const config = JSON.parse(localConfig);
              if (!config.teams || !config.teams[workspaceId]) {
                return { success: false, error: 'Workspace not found in config' };
              }
              
              const xoxcToken = config.teams[workspaceId].token;
              return { success: true, xoxcToken: xoxcToken, workspaceId: workspaceId };
              
            } catch (error) {
              return { success: false, error: error.message };
            }
          })();
        `);

        console.log('[Slack Browser Auth] Token extraction result:', {
          success: result.success,
          hasXoxcToken: !!result.xoxcToken,
          hasXoxdToken: !!xoxdToken,
          error: result.error,
        });

        if (result.success && result.xoxcToken && xoxdToken) {
          // Log success
          console.log(`[Slack Browser Auth] Successfully extracted tokens for workspace ${result.workspaceId}`);

          // Return tokens in format expected by tokenEnvVarPattern
          return {
            access_token: result.xoxcToken, // Will be mapped to SLACK_MCP_XOXC_TOKEN
            refresh_token: xoxdToken, // Will be mapped to SLACK_MCP_XOXD_TOKEN
          };
        }

        // Log the error for debugging
        if (!result.success) {
          console.error('[Slack Browser Auth] Token extraction failed:', result.error);
        } else if (!xoxdToken) {
          console.error('[Slack Browser Auth] Missing xoxd token (d cookie)');
        } else if (!result.xoxcToken) {
          console.error('[Slack Browser Auth] Missing xoxc token');
        }

        return null;
      },
    },

    metadata: {
      displayName: 'Slack (Browser Auth)',
      documentationUrl: 'https://api.slack.com/authentication',
      supportsRefresh: false,
      notes: 'Direct browser authentication using xoxc/xoxd tokens. No OAuth app required.',
    },
  },
};

/**
 * Get OAuth provider definition
 */
export function getOAuthProvider(name: string): OAuthProviderDefinition {
  const provider = oauthProviders[name.toLowerCase()];
  if (!provider) {
    throw new Error(`OAuth provider '${name}' not configured`);
  }
  return provider;
}

/**
 * Get OAuth provider configuration (legacy format for backward compatibility)
 */
export function getOAuthProviderConfig(name: string): OAuthProviderConfig {
  const provider = getOAuthProvider(name);
  return {
    authorizationUrl: provider.authorizationUrl,
    scopes: provider.scopes,
    usePKCE: provider.usePKCE,
    clientId: provider.clientId,
  };
}

/**
 * Check if a provider is configured
 */
export function hasOAuthProvider(name: string): boolean {
  return name.toLowerCase() in oauthProviders;
}

/**
 * Get all configured provider names
 */
export function getOAuthProviderNames(): string[] {
  return Object.keys(oauthProviders);
}
