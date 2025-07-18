const express = require('express');
const { google } = require('googleapis');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT_LOCALHOST = process.env.PORT;

app.use(express.json());
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Load OAuth credentials
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in environment variables. Shutting down.');
  process.exit(1);
}

const REDIRECT_URL = process.env.REDIRECT_URL || `http://localhost:${PORT_LOCALHOST}/oauth-callback`;

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URL
);

// Store temporary auth states (in production, use Redis or database)
const authStates = new Map();

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start OAuth flow
app.get('/auth/gmail', (req, res) => {
  console.log('Received /auth/gmail request');

  try {
    const state = Math.random().toString(36).substring(7);
    const userId = req.query.userId || 'default';

    console.log('Generated state:', state);
    console.log('Google Client ID:', process.env.GOOGLE_CLIENT_ID ? 'Set' : 'Not set');
    console.log('Google Client Secret:', process.env.GOOGLE_CLIENT_SECRET ? 'Set' : 'Not set');

    // Store state for verification
    authStates.set(state, { userId, timestamp: Date.now() });

    // Clean up old states (older than 10 minutes)
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    for (const [key, value] of authStates.entries()) {
      if (value.timestamp < tenMinutesAgo) {
        authStates.delete(key);
      }
    }

    const scopes = [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.modify'
    ];

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      state: state,
      prompt: 'consent' // Force consent to get refresh token
    });

    console.log('Generated auth URL:', authUrl);
    console.log('Sending response:', { auth_url: authUrl, state });

    res.json({ auth_url: authUrl, state });
  } catch (error) {
    console.error('Error in /auth/gmail:', error);
    res.status(500).json({ error: error.message });
  }
});

// OAuth callback
app.get('/oauth-callback', async (req, res) => {
  const { code, state } = req.query;

  console.log('OAuth callback received:', { code: code ? 'present' : 'missing', state: state || 'missing' });

  if (!code || !state) {
    console.log('Missing code or state, redirecting to error');
    return res.redirect(`/oauth-callback.html?error=${encodeURIComponent('Missing authorization code or state')}`);
  }

  // Verify state
  const storedState = authStates.get(state);

  if (!storedState) {
    console.log('Invalid or expired state, redirecting to error');
    return res.redirect(`/oauth-callback.html?error=${encodeURIComponent('Invalid or expired state')}`);
  }

  try {
    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);

    // Clean up state
    authStates.delete(state);

    // Redirect to the callback page with tokens
    const redirectUrl = `/oauth-callback.html?access_token=${tokens.access_token}&refresh_token=${tokens.refresh_token}&expiry_date=${tokens.expiry_date}`;

    res.redirect(redirectUrl);
  } catch (error) {
    console.error('Token exchange error:', error);
    const errorUrl = `/oauth-callback.html?error=${encodeURIComponent(error.message)}`;
    res.redirect(errorUrl);
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static files
app.use(express.static('public'));

// Start server
app.listen(PORT_LOCALHOST, () => {
  const baseUrl = REDIRECT_URL
    ? REDIRECT_URL.replace(/\/oauth-callback.*/, '')
    : `http://localhost:${PORT_LOCALHOST}`;
  console.log(`OAuth proxy server running on port ${PORT_LOCALHOST}`);
  console.log(`Auth URL: ${baseUrl}/auth/gmail`);
  console.log(`Health check URL: ${baseUrl}/health`);
  console.log(`Callback URL: ${REDIRECT_URL}`);
});
