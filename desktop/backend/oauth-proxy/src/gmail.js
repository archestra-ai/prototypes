const { google } = require('googleapis');

// Load OAuth credentials
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in environment variables.');
  throw new Error('Gmail OAuth credentials not configured');
}

const REDIRECT_URL = process.env.REDIRECT_URL || `http://localhost:${process.env.PORT}/oauth-callback/gmail`;

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URL);

// Gmail-specific OAuth scopes
const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
];

/**
 * Generate Gmail OAuth authorization URL
 * @param {string} state - CSRF protection state parameter
 * @returns {string} Authorization URL
 */
async function generateAuthUrl(state) {
  console.log('Gmail Client ID:', CLIENT_ID ? 'Set' : 'Not set');
  console.log('Gmail Client Secret:', CLIENT_SECRET ? 'Set' : 'Not set');

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: GMAIL_SCOPES,
    state: state,
    prompt: 'consent', // Force consent to get refresh token
  });

  return authUrl;
}

/**
 * Exchange authorization code for tokens
 * @param {string} code - Authorization code from Google
 * @returns {Object} Token object with access_token, refresh_token, expiry_date
 */
async function exchangeCodeForTokens(code) {
  try {
    const { tokens } = await oauth2Client.getToken(code);

    return {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
    };
  } catch (error) {
    console.error('Gmail token exchange error:', error);
    throw new Error(`Gmail token exchange failed: ${error.message}`);
  }
}

/**
 * Refresh access token using refresh token
 * @param {string} refreshToken - Refresh token
 * @returns {Object} New token object
 */
async function refreshAccessToken(refreshToken) {
  try {
    oauth2Client.setCredentials({
      refresh_token: refreshToken,
    });

    const { credentials } = await oauth2Client.refreshAccessToken();

    return {
      access_token: credentials.access_token,
      refresh_token: credentials.refresh_token || refreshToken,
      expiry_date: credentials.expiry_date,
    };
  } catch (error) {
    console.error('Gmail token refresh error:', error);
    throw new Error(`Gmail token refresh failed: ${error.message}`);
  }
}

module.exports = {
  generateAuthUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
};
