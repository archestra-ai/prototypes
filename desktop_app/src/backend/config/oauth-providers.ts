export interface OAuthProviderConfig {
  authorizationUrl: string;
  scopes: string[];
  usePKCE: boolean;
  clientId?: string; // Public client ID (not secret)
}

// These are PUBLIC client IDs (not secrets) - safe to hardcode
// The secrets are stored in the OAuth proxy server
export const oauthProviders: Record<string, OAuthProviderConfig> = {
  google: {
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    scopes: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.modify',
    ],
    usePKCE: true,
    // This should be the same client ID configured in the OAuth proxy
    clientId:
      process.env.GOOGLE_OAUTH_CLIENT_ID || '396993879434-hqvfev8s5v1ljesqj3fum2e60mj99g4l.apps.googleusercontent.com',
  },

  slack: {
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
    // This should be the same client ID configured in the OAuth proxy
    clientId: process.env.SLACK_OAUTH_CLIENT_ID || '9210991658150.9211748349222',
  },
};

/**
 * Get OAuth provider configuration
 */
export function getOAuthProvider(name: string): OAuthProviderConfig {
  const provider = oauthProviders[name.toLowerCase()];
  if (!provider) {
    throw new Error(`OAuth provider '${name}' not configured`);
  }
  return provider;
}
