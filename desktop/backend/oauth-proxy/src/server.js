const express = require('express');
const path = require('path');
const dotenv = require('dotenv');

// Import service handlers
const gmailService = require('./gmail');

dotenv.config();

const app = express();
const PORT_LOCALHOST = process.env.PORT;

app.use(express.json());
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Store temporary auth states (in production, use Redis or database)
const authStates = new Map();

// Generic OAuth state management
function generateState() {
  return Math.random().toString(36).substring(7);
}

function storeState(state, data) {
  authStates.set(state, { ...data, timestamp: Date.now() });
  
  // Clean up old states (older than 10 minutes)
  const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
  for (const [key, value] of authStates.entries()) {
    if (value.timestamp < tenMinutesAgo) {
      authStates.delete(key);
    }
  }
}

function getStoredState(state) {
  return authStates.get(state);
}

function removeState(state) {
  authStates.delete(state);
}

// Service routing function
function getServiceHandler(service) {
  switch (service.toLowerCase()) {
    case 'gmail':
      return gmailService;
    default:
      throw new Error(`Unsupported OAuth service: ${service}`);
  }
}

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Generic OAuth initiation endpoint
app.get('/auth/:service', async (req, res) => {
  const { service } = req.params;
  
  console.log(`Received /auth/${service} request`);

  try {
    const serviceHandler = getServiceHandler(service);
    
    const state = generateState();
    const userId = req.query.userId || 'default';
    
    console.log('Generated state:', state);
    console.log(`Initiating ${service} OAuth flow`);
    
    // Store state for verification
    storeState(state, { userId, service });
    
    // Delegate to service-specific handler
    const authUrl = await serviceHandler.generateAuthUrl(state);
    
    console.log('Generated auth URL:', authUrl);
    console.log('Sending response:', { auth_url: authUrl, state });
    
    res.json({ auth_url: authUrl, state });
  } catch (error) {
    console.error(`Error in /auth/${service}:`, error);
    res.status(500).json({ error: error.message });
  }
});

// Service-specific OAuth callback endpoint
app.get('/oauth-callback/:service', async (req, res) => {
  const { service } = req.params;
  const { code, state } = req.query;

  console.log(`OAuth callback received for ${service}:`, { code: code ? 'present' : 'missing', state: state || 'missing' });

  if (!code || !state) {
    console.log('Missing code or state, redirecting to error');
    return res.redirect(`/oauth-callback.html?service=${service}&error=${encodeURIComponent('Missing authorization code or state')}`);
  }

  // Verify state
  const storedState = getStoredState(state);

  if (!storedState) {
    console.log('Invalid or expired state, redirecting to error');
    return res.redirect(`/oauth-callback.html?service=${service}&error=${encodeURIComponent('Invalid or expired state')}`);
  }

  // Verify service matches
  if (storedState.service !== service) {
    console.log('Service mismatch, redirecting to error');
    return res.redirect(`/oauth-callback.html?service=${service}&error=${encodeURIComponent('Service mismatch')}`);
  }

  try {
    const serviceHandler = getServiceHandler(service);
    
    // Exchange code for tokens using service-specific handler
    const tokens = await serviceHandler.exchangeCodeForTokens(code);

    // Clean up state
    removeState(state);

    // Redirect to the callback page with tokens and service info
    const redirectUrl = `/oauth-callback.html?service=${service}&access_token=${tokens.access_token}&refresh_token=${tokens.refresh_token}&expiry_date=${tokens.expiry_date}`;

    res.redirect(redirectUrl);
  } catch (error) {
    console.error('Token exchange error:', error);
    const errorUrl = `/oauth-callback.html?service=${service}&error=${encodeURIComponent(error.message)}`;
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
  const baseUrl = process.env.REDIRECT_URL
    ? process.env.REDIRECT_URL.replace(/\/oauth-callback.*/, '')
    : `http://localhost:${PORT_LOCALHOST}`;
  console.log(`OAuth proxy server running on port ${PORT_LOCALHOST}`);
  console.log(`Health check URL: ${baseUrl}/health`);
  console.log(`Supported services: gmail`);
  console.log(`Auth URL pattern: ${baseUrl}/auth/<service>`);
  console.log(`Callback URL pattern: ${baseUrl}/oauth-callback/<service>`);
});