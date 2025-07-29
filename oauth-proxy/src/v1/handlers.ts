import path from 'path';
import { Request, Response } from 'express';
import { logger } from '@/logger';
import googleService from '@/google';
import type { AuthState, OAuthService, ServiceHandler, GoogleService } from '@/types';

// Store temporary auth states (in production, use Redis or database)
const authStates = new Map<string, AuthState>();

// Generic OAuth state management
function generateState(): string {
  return Math.random().toString(36).substring(7);
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

// Service routing function
function getServiceHandler(service: string): ServiceHandler {
  const lowerService = service.toLowerCase();
  
  if (isGoogleService(lowerService)) {
    return googleService;
  }
  
  throw new Error(`Unsupported OAuth service: ${service}`);
}

function isGoogleService(service: string): service is GoogleService {
  const googleServices: GoogleService[] = [
    'gmail',
    'google-drive',
    'google-calendar',
    'google-docs',
    'google-sheets',
    'google-slides',
    'google-forms',
    'google-tasks',
    'google-chat'
  ];
  return googleServices.includes(service as GoogleService);
}

function getServiceScopes(service: string): string[] {
  /**
   * Base scopes for all Google services
   *
   * see here for where we referenced these scopes for the Google Workspace MCP server that we use in our catalog
   * https://github.com/taylorwilsdon/google_workspace_mcp/blob/main/auth/scopes.py
   */
  const baseGoogleScopes = ['https://www.googleapis.com/auth/userinfo.email', 'openid'];

  switch (service.toLowerCase()) {
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
      throw new Error(`Unknown service for scopes: ${service}`);
  }
}

// Route handlers
export const handlers = {
  // GET /
  getIndex: (_req: Request, res: Response): void => {
    res.sendFile(path.join(__dirname, '..', '..', 'public', 'index.html'));
  },

  // GET /auth/:service
  authService: async (req: Request<{ service: string }>, res: Response): Promise<void> => {
    const { service } = req.params;

    logger.info(`Received /auth/${service} request`);

    try {
      const serviceHandler = getServiceHandler(service);
      const scopes = getServiceScopes(service);

      const state = generateState();
      const userId = (req.query.userId as string) || 'default';

      logger.debug('Generated state:', { state });
      logger.info(`Initiating ${service} OAuth flow`, { service, scopeCount: scopes.length });

      // Store state for verification
      storeState(state, { userId, service: service.toLowerCase() as OAuthService });

      // Delegate to service-specific handler with scopes
      const authUrl = await serviceHandler.generateAuthUrl(state, scopes);

      logger.debug('Generated auth URL', { service });
      logger.info('Sending auth response', { service, hasState: !!state });

      res.json({ auth_url: authUrl, state });
    } catch (error) {
      logger.error(`Error in /auth/${service}:`, { 
        service, 
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
    }
  },

  // GET /oauth-callback/:service
  oauthCallback: async (req: Request<{ service: string }>, res: Response): Promise<void> => {
    const { service } = req.params;
    const { code, state } = req.query;

    logger.info(`OAuth callback received for ${service}`, {
      service,
      hasCode: !!code,
      hasState: !!state,
    });

    if (!code || !state || typeof code !== 'string' || typeof state !== 'string') {
      logger.warn('Missing code or state in OAuth callback', { service });
      res.redirect(
        `/oauth-callback.html?service=${service}&error=${encodeURIComponent('Missing authorization code or state')}`
      );
      return;
    }

    // Verify state
    const storedState = getStoredState(state);

    if (!storedState) {
      logger.warn('Invalid or expired state', { service, state });
      res.redirect(
        `/oauth-callback.html?service=${service}&error=${encodeURIComponent('Invalid or expired state')}`
      );
      return;
    }

    // Verify service matches
    if (storedState.service !== service.toLowerCase()) {
      logger.error('Service mismatch in OAuth callback', {
        expected: storedState.service,
        received: service,
      });
      res.redirect(`/oauth-callback.html?service=${service}&error=${encodeURIComponent('Service mismatch')}`);
      return;
    }

    try {
      const serviceHandler = getServiceHandler(service);
      const scopes = getServiceScopes(service);

      logger.info('Exchanging authorization code for tokens', { service });
      // Exchange code for tokens using service-specific handler
      const tokens = await serviceHandler.exchangeCodeForTokens(code);

      // Clean up state
      removeState(state);

      logger.info('Successfully exchanged code for tokens', { service, hasRefreshToken: !!tokens.refresh_token });

      // For Google services, we need to pass additional parameters for credential file creation
      const params = new URLSearchParams({
        service: service,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expiry_date: tokens.expiry_date?.toString() || '',
        token_uri: 'https://oauth2.googleapis.com/token',
        client_id: process.env.GOOGLE_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        scopes: scopes.join(','),
      });

      const redirectUrl = `/oauth-callback.html?${params.toString()}`;

      logger.info('Redirecting to callback page with tokens', { service });
      res.redirect(redirectUrl);
    } catch (error) {
      logger.error('Token exchange error:', {
        service,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      const errorUrl = `/oauth-callback.html?service=${service}&error=${encodeURIComponent(
        error instanceof Error ? error.message : 'Token exchange failed'
      )}`;
      res.redirect(errorUrl);
    }
  },
};

export default handlers;