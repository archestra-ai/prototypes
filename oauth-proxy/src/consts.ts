export const NODE_ENV = process.env.NODE_ENV || 'development';
export const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

export const PORT = process.env.PORT || '3000';

export const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
export const GOOGLE_REDIRECT_URL = `${BASE_URL}/v1/oauth-callback/google`;

export const GOOGLE_OAUTH_CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
export const GOOGLE_OAUTH_CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

if (!GOOGLE_OAUTH_CLIENT_ID || !GOOGLE_OAUTH_CLIENT_SECRET) {
  throw new Error('Google OAuth credentials not configured');
}
