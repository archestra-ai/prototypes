import { google } from 'googleapis';
import { logger } from '@/logger';
import type { ServiceHandler, TokenResponse } from '@/types';

// Load OAuth credentials
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  logger.error('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in environment variables.');
  throw new Error('Google OAuth credentials not configured');
}

const REDIRECT_URL = process.env.REDIRECT_URL || `http://localhost:${process.env.PORT}/oauth-callback/google`;

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URL);

/**
 * Generate Google OAuth authorization URL
 * @param state - CSRF protection state parameter
 * @param scopes - OAuth scopes to request
 * @returns Authorization URL
 */
async function generateAuthUrl(state: string, scopes: string[]): Promise<string> {
  logger.debug('Generating Google auth URL', { 
    clientIdSet: !!CLIENT_ID, 
    clientSecretSet: !!CLIENT_SECRET,
    scopeCount: scopes.length 
  });

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    state: state,
    prompt: 'consent', // Force consent to get refresh token
  });

  return authUrl;
}

/**
 * Exchange authorization code for tokens
 * @param code - Authorization code from Google
 * @returns Token object with access_token, refresh_token, expiry_date
 */
async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  try {
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.access_token || !tokens.refresh_token) {
      throw new Error('Missing required tokens in response');
    }

    return {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date || undefined,
      token_type: tokens.token_type || undefined,
      scope: tokens.scope || undefined,
    };
  } catch (error) {
    logger.error('Google token exchange error:', error);
    throw new Error(`Google token exchange failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Refresh access token using refresh token
 * @param refreshToken - Refresh token
 * @returns New token object
 */
async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  try {
    oauth2Client.setCredentials({
      refresh_token: refreshToken,
    });

    const { credentials } = await oauth2Client.refreshAccessToken();

    if (!credentials.access_token) {
      throw new Error('No access token in refresh response');
    }

    return {
      access_token: credentials.access_token,
      refresh_token: credentials.refresh_token || refreshToken,
      expiry_date: credentials.expiry_date || undefined,
      token_type: credentials.token_type || undefined,
      scope: credentials.scope || undefined,
    };
  } catch (error) {
    logger.error('Google token refresh error:', error);
    throw new Error(`Google token refresh failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export const googleServiceHandler: ServiceHandler = {
  generateAuthUrl,
  exchangeCodeForTokens,
};

export default {
  generateAuthUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
};