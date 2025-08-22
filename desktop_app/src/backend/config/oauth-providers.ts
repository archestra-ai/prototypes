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
