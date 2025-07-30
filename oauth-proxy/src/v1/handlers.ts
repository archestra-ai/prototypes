import crypto from 'crypto';
import { Request, Response } from 'express';
import path from 'path';

import { GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET } from '@/consts';
import googleProvider from '@/google';
import { logger } from '@/logger';
import type { AuthState, GoogleMCPCatalogConnectorId, MCPCatalogConnectorId, ProviderHandler } from '@/types';

/**
 * Store auth states
 *
 * Eventually this should move to Redis since states are lost on deploys
 */
const authStates = new Map<string, AuthState>();

// Generic OAuth state management
function generateState(): string {
  // Use cryptographically secure random bytes for CSRF protection
  return crypto.randomBytes(32).toString('hex');
}

function storeState(state: string, data: Omit<AuthState, 'timestamp'>): void {
  authStates.set(state, { ...data, timestamp: Date.now() });

  // Clean up old states (older than 10 minutes)
  const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
  for (const [key, value] of authStates.entries()) {
    if (value.timestamp < tenMinutesAgo) {
      authStates.delete(key);
    }
  }
}

function getStoredState(state: string): AuthState | undefined {
  return authStates.get(state);
}

function removeState(state: string): void {
  authStates.delete(state);
}

function isGoogleProvider(provider: string): provider is 'google' {
  return provider === 'google';
}

// Provider routing function
function getProviderHandler(provider: string): ProviderHandler {
  if (isGoogleProvider(provider)) {
    return googleProvider;
  }

  throw new Error(`Unsupported OAuth provider: ${provider}`);
}

function isGoogleMCPCatalogConnectorId(
  mcpCatalogConnectorId: string
): mcpCatalogConnectorId is GoogleMCPCatalogConnectorId {
  const googleMCPCatalogConnectorIds: GoogleMCPCatalogConnectorId[] = [
    'gmail',
    'google-drive',
    'google-calendar',
    'google-docs',
    'google-sheets',
    'google-slides',
    'google-forms',
    'google-tasks',
    'google-chat',
  ];
  return googleMCPCatalogConnectorIds.includes(mcpCatalogConnectorId as GoogleMCPCatalogConnectorId);
}

function getMcpCatalogConnectorIdScopes(mcpCatalogConnectorId: MCPCatalogConnectorId): string[] {
  /**
   * Base scopes for all Google mcp catalog connectors
   *
   * see here for where we referenced these scopes for the Google Workspace MCP server that we use in our catalog
   * https://github.com/taylorwilsdon/google_workspace_mcp/blob/main/auth/scopes.py
   */
  const baseGoogleScopes = ['https://www.googleapis.com/auth/userinfo.email', 'openid'];

  switch (mcpCatalogConnectorId) {
    case 'gmail':
      return [
        ...baseGoogleScopes,
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.compose',
        'https://www.googleapis.com/auth/gmail.modify',
        'https://www.googleapis.com/auth/gmail.labels',
      ];
    case 'google-drive':
      return [
        ...baseGoogleScopes,
        'https://www.googleapis.com/auth/drive.readonly',
        'https://www.googleapis.com/auth/drive.file',
      ];
    case 'google-calendar':
      return [
        ...baseGoogleScopes,
        'https://www.googleapis.com/auth/calendar.readonly',
        'https://www.googleapis.com/auth/calendar.events',
      ];
    case 'google-docs':
      return [
        ...baseGoogleScopes,
        'https://www.googleapis.com/auth/documents.readonly',
        'https://www.googleapis.com/auth/documents',
      ];
    case 'google-sheets':
      return [
        ...baseGoogleScopes,
        'https://www.googleapis.com/auth/spreadsheets.readonly',
        'https://www.googleapis.com/auth/spreadsheets',
      ];
    case 'google-slides':
      return [
        ...baseGoogleScopes,
        'https://www.googleapis.com/auth/presentations.readonly',
        'https://www.googleapis.com/auth/presentations',
      ];
    case 'google-forms':
      return [
        ...baseGoogleScopes,
        'https://www.googleapis.com/auth/forms.body',
        'https://www.googleapis.com/auth/forms.body.readonly',
        'https://www.googleapis.com/auth/forms.responses.readonly',
      ];
    case 'google-tasks':
      return [
        ...baseGoogleScopes,
        'https://www.googleapis.com/auth/tasks.readonly',
        'https://www.googleapis.com/auth/tasks',
      ];
    case 'google-chat':
      return [
        ...baseGoogleScopes,
        'https://www.googleapis.com/auth/chat.messages.readonly',
        'https://www.googleapis.com/auth/chat.messages',
        'https://www.googleapis.com/auth/chat.spaces',
      ];
    default:
      throw new Error(`Unknown mcpCatalogConnectorId for scopes: ${mcpCatalogConnectorId}`);
  }
}

// Route handlers
export const handlers = {
  // GET /
  getIndex: (_req: Request, res: Response): void => {
    res.sendFile(path.join(__dirname, '..', '..', 'public', 'index.html'));
  },

  // GET /auth/:provider
  authProvider: async (req: Request<{ provider: string }>, res: Response): Promise<void> => {
    const { provider } = req.params;
    const { mcpCatalogConnectorId } = req.query;

    logger.info(`Received /auth/${provider} request`);

    if (
      !mcpCatalogConnectorId ||
      typeof mcpCatalogConnectorId !== 'string' ||
      !isGoogleMCPCatalogConnectorId(mcpCatalogConnectorId)
    ) {
      logger.warn('Missing mcpCatalogConnectorId in auth request', { provider, mcpCatalogConnectorId });
      res.status(400).json({ error: 'Missing mcpCatalogConnectorId' });
      return;
    }

    try {
      const providerHandler = getProviderHandler(provider);
      const scopes = getMcpCatalogConnectorIdScopes(mcpCatalogConnectorId);

      const state = generateState();
      const userId = (req.query.userId as string) || 'default';

      logger.debug('Generated state:', { state });
      logger.info(`Initiating ${provider} OAuth flow`, { provider, mcpCatalogConnectorId, scopeCount: scopes.length });

      // Store state for verification - include mcpCatalogConnectorId in state
      storeState(state, { userId, mcpCatalogConnectorId });

      // Delegate to provider-specific handler with scopes
      const authUrl = await providerHandler.generateAuthUrl(state, scopes);

      logger.debug('Generated auth URL', { provider, mcpCatalogConnectorId });
      logger.info('Sending auth response', { provider, mcpCatalogConnectorId, hasState: !!state });

      res.json({ auth_url: authUrl, state });
    } catch (error) {
      logger.error(`Error in /auth/${provider}:`, {
        provider,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
    }
  },

  // GET /oauth-callback/:provider
  oauthCallback: async (req: Request<{ provider: string }>, res: Response): Promise<void> => {
    const { provider } = req.params;
    const { code, state } = req.query;

    logger.info(`OAuth callback received for ${provider}`, {
      hasCode: !!code,
      hasState: !!state,
    });

    if (
      !code ||
      !state ||
      typeof code !== 'string' ||
      typeof state !== 'string'
    ) {
      logger.warn('Missing code or state in OAuth callback', {
        provider,
      });
      res.redirect(
        `/oauth-callback.html?provider=${provider}&error=${encodeURIComponent('Missing authorization code or state')}`
      );
      return;
    }

    // Verify state and get mcpCatalogConnectorId from stored state
    const storedState = getStoredState(state);

    if (!storedState) {
      logger.warn('Invalid or expired state', { provider, state });
      res.redirect(
        `/oauth-callback.html?provider=${provider}&error=${encodeURIComponent('Invalid or expired state')}`
      );
      return;
    }

    const { mcpCatalogConnectorId } = storedState;
    
    logger.info('Retrieved mcpCatalogConnectorId from stored state', {
      mcpCatalogConnectorId,
      provider,
    });
    
    if (!isGoogleMCPCatalogConnectorId(mcpCatalogConnectorId)) {
      logger.error('Invalid mcpCatalogConnectorId in stored state', {
        mcpCatalogConnectorId,
      });
      res.redirect(
        `/oauth-callback.html?provider=${provider}&error=${encodeURIComponent('Invalid service configuration')}`
      );
      return;
    }

    try {
      const providerHandler = getProviderHandler(provider);
      const scopes = getMcpCatalogConnectorIdScopes(mcpCatalogConnectorId);

      logger.info('Exchanging authorization code for tokens', { provider, mcpCatalogConnectorId });
      // Exchange code for tokens using provider-specific handler
      const tokens = await providerHandler.exchangeCodeForTokens(code);

      // Clean up state
      removeState(state);

      logger.info('Successfully exchanged code for tokens', {
        provider,
        mcpCatalogConnectorId,
        hasRefreshToken: !!tokens.refresh_token,
      });

      // For Google mcpCatalogConnectorIds, we need to pass additional parameters for credential file creation
      const params = new URLSearchParams({
        provider,
        mcpCatalogConnectorId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expiry_date: tokens.expiry_date?.toString() || '',
        token_uri: 'https://oauth2.googleapis.com/token',
        client_id: GOOGLE_OAUTH_CLIENT_ID || '',
        client_secret: GOOGLE_OAUTH_CLIENT_SECRET || '',
        scopes: scopes.join(','),
      });

      const redirectUrl = `/oauth-callback.html?${params.toString()}`;

      logger.info('Redirecting to callback page with tokens', { provider, mcpCatalogConnectorId });
      res.redirect(redirectUrl);
    } catch (error) {
      logger.error('Token exchange error:', {
        provider,
        mcpCatalogConnectorId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      const errorUrl = `/oauth-callback.html?provider=${provider}&mcpCatalogConnectorId=${mcpCatalogConnectorId}&error=${encodeURIComponent(
        error instanceof Error ? error.message : 'Token exchange failed'
      )}`;
      res.redirect(errorUrl);
    }
  },
};

export default handlers;
