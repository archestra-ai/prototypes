import type {
  BrowserTokenResponse,
  OAuthProviderDefinition,
  OAuthProviderRegistry,
  TokenResponse,
} from './oauth-provider-interface';

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

    // Token pattern is required but handled by browser auth mapping
    tokenEnvVarPattern: {
      accessToken: 'SLACK_MCP_XOXC_TOKEN', // Maps to primary_token
      refreshToken: 'SLACK_MCP_XOXD_TOKEN', // Maps to secondary_token
    },

    // Browser-based authentication configuration
    browserAuthConfig: {
      enabled: true,
      loginUrl: 'https://slack.com/signin',
      workspacePattern: /slack:\/\/([A-Z0-9]+)/,

      // Map browser tokens to environment variables
      tokenMapping: {
        primary: 'SLACK_MCP_XOXC_TOKEN',
        secondary: 'SLACK_MCP_XOXD_TOKEN',
      },

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

          // Return proper BrowserTokenResponse
          return {
            primary_token: result.xoxcToken,
            secondary_token: xoxdToken,
            workspace_id: result.workspaceId,
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

  linkedin: {
    name: 'linkedin',
    authorizationUrl: 'https://www.linkedin.com/oauth/v2/authorization',
    // LinkedIn OAuth scopes for comprehensive access
    // - openid, profile, email: Basic user information
    // - w_member_social: Allows posting on LinkedIn
    // - r_liteprofile, r_emailaddress: Read profile and email
    scopes: ['openid', 'profile', 'email', 'w_member_social', 'r_liteprofile', 'r_emailaddress'],
    usePKCE: true,
    clientId: process.env.LINKEDIN_OAUTH_CLIENT_ID || '',

    // LinkedIn OAuth tokens mapped to environment variables
    // These will be passed to the MCP server container
    tokenEnvVarPattern: {
      accessToken: 'LINKEDIN_MCP_ACCESS_TOKEN',
      refreshToken: 'LINKEDIN_MCP_REFRESH_TOKEN',
      expiryDate: 'LINKEDIN_MCP_TOKEN_EXPIRY',
    },

    metadata: {
      displayName: 'LinkedIn',
      documentationUrl: 'https://learn.microsoft.com/en-us/linkedin/shared/authentication/authentication',
      supportsRefresh: true,
      notes: 'Standard OAuth 2.0 implementation with refresh token support.',
    },
  },

  'linkedin-browser': {
    name: 'linkedin-browser',
    authorizationUrl: '', // Not used for browser auth
    scopes: [], // Not used for browser auth
    usePKCE: false, // Not used for browser auth
    clientId: 'browser-auth', // Placeholder

    // Token pattern for LinkedIn cookie
    // The li_at cookie is LinkedIn's main session cookie
    tokenEnvVarPattern: {
      accessToken: 'LINKEDIN_COOKIE', // Maps to primary_token (li_at cookie)
    },

    // Browser-based authentication configuration
    // This allows users to authenticate by logging into LinkedIn directly
    // and extracting the session cookie, avoiding the need for OAuth app setup
    browserAuthConfig: {
      enabled: true,
      loginUrl: 'https://www.linkedin.com/login',

      // Map browser tokens to environment variables
      // LinkedIn MCP server expects the cookie in LINKEDIN_COOKIE env var
      tokenMapping: {
        primary: 'LINKEDIN_COOKIE',
      },

      navigationRules: (url: string) => {
        // Only allow navigation to official LinkedIn domains over HTTPS
        // Handle various LinkedIn subdomains and regional variations
        const linkedInDomainPattern = /^https:\/\/([\w-]+\.)?linkedin\.com\//;
        return linkedInDomainPattern.test(url);
      },

      extractTokens: async (windowWithContext: any) => {
        try {
          // Extract the actual window parts and context
          const { webContents, session } = windowWithContext;
          const url = webContents.getURL();

          console.log('[LinkedIn Browser Auth] Attempting token extraction');

          // Fast path: early return if not LinkedIn domain
          // Support both www and non-www variants
          const isLinkedInDomain = url.includes('linkedin.com/');
          if (!isLinkedInDomain) {
            console.log('[LinkedIn Browser Auth] Not a LinkedIn page, skipping token extraction');
            return null;
          }

          // Check if user is logged in by looking for specific LinkedIn paths
          // LinkedIn redirects to these paths after successful login
          // Check most common path first for performance
          // Also handle regional variations like /home for some locales
          const isLoggedIn =
            url.includes('/feed') || url.includes('/in/') || url.includes('/mynetwork') || url.includes('/home');
          if (!isLoggedIn) {
            console.log('[LinkedIn Browser Auth] User not logged in yet, waiting...');
            return null;
          }

          // User is logged in, proceed with cookie extraction

          // Get li_at cookie which is the session cookie
          // Use specific filters to reduce cookie lookup overhead
          const cookies = await session.cookies.get({
            name: 'li_at',
            domain: '.linkedin.com',
            url: 'https://www.linkedin.com',
          });

          // Handle edge case: no cookies found
          if (!cookies || cookies.length === 0) {
            console.error('[LinkedIn Browser Auth] No li_at cookie found');
            return null;
          }

          // Handle edge case: multiple cookies (use the first non-expired one)
          const validCookie = cookies.find((cookie) => {
            const now = Date.now() / 1000;
            return !cookie.expirationDate || cookie.expirationDate > now;
          });

          if (!validCookie) {
            console.error('[LinkedIn Browser Auth] All li_at cookies are expired');
            return null;
          }

          const liAtToken = validCookie.value;

          // Enhanced validation for edge cases
          if (liAtToken && liAtToken.length > 10 && liAtToken.trim() === liAtToken) {
            // Validate cookie format (li_at cookies are typically long strings)
            // Additional validation to ensure cookie appears valid
            if (!liAtToken.includes(' ') && !liAtToken.includes('\n') && !liAtToken.includes('\t')) {
              // Log success
              console.log('[LinkedIn Browser Auth] Successfully extracted LinkedIn session cookie');

              // Return proper BrowserTokenResponse
              return {
                primary_token: liAtToken,
              };
            } else {
              console.error('[LinkedIn Browser Auth] Invalid cookie format detected');
            }
          }

          // Log the error for debugging
          if (!liAtToken) {
            console.error('[LinkedIn Browser Auth] Missing li_at cookie');
          } else {
            console.error('[LinkedIn Browser Auth] Invalid li_at cookie format');
          }
          return null;
        } catch (error) {
          console.error('[LinkedIn Browser Auth] Error extracting tokens:', error);
          return null;
        }
      },
    },

    metadata: {
      displayName: 'LinkedIn (Browser Auth)',
      documentationUrl: 'https://github.com/stickerdaniel/linkedin-mcp-server',
      supportsRefresh: false,
      notes: 'Direct browser authentication using LinkedIn session cookie (li_at). No OAuth app required.',
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
