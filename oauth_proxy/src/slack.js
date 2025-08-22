const https = require('https');
const querystring = require('querystring');

// Load OAuth credentials
const CLIENT_ID = process.env.SLACK_CLIENT_ID;
const CLIENT_SECRET = process.env.SLACK_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing SLACK_CLIENT_ID or SLACK_CLIENT_SECRET in environment variables.');
  throw new Error('Slack OAuth credentials not configured');
}

// Slack OAuth scopes - these are common scopes for workspace access
const SLACK_SCOPES = [
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
  'files:write'
].join(',');

/**
 * Get the redirect URL based on environment
 */
function getRedirectUrl() {
  // Always use HTTPS for local development
  return process.env.SLACK_REDIRECT_URL || 'https://localhost:8080/oauth-callback/slack';
}

/**
 * Generate Slack OAuth authorization URL
 * @param {string} state - CSRF protection state parameter
 * @returns {string} Authorization URL
 */
async function generateAuthUrl(state) {
  const redirectUrl = getRedirectUrl();
  
  console.log('Slack Client ID:', CLIENT_ID ? 'Set' : 'Not set');
  console.log('Slack Client Secret:', CLIENT_SECRET ? 'Set' : 'Not set');
  console.log('Slack Redirect URL:', redirectUrl);

  const params = querystring.stringify({
    client_id: CLIENT_ID,
    scope: SLACK_SCOPES,
    redirect_uri: redirectUrl,
    state: state,
    // For Slack, we use 'user_scope' for user token scopes
    user_scope: SLACK_SCOPES
  });

  const authUrl = `https://slack.com/oauth/v2/authorize?${params}`;
  
  return authUrl;
}

/**
 * Make HTTPS request helper
 * @param {Object} options - Request options
 * @param {string} postData - POST data
 * @returns {Promise<Object>} Response data
 */
function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.ok === false) {
            reject(new Error(response.error || 'Slack API error'));
          } else {
            resolve(response);
          }
        } catch (error) {
          reject(new Error(`Failed to parse response: ${error.message}`));
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    if (postData) {
      req.write(postData);
    }
    
    req.end();
  });
}

/**
 * Exchange authorization code for tokens
 * @param {string} code - Authorization code from Slack
 * @returns {Object} Token object with access_token, refresh_token, expiry_date
 */
async function exchangeCodeForTokens(code) {
  try {
    const redirectUrl = getRedirectUrl();
    
    const postData = querystring.stringify({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code: code,
      redirect_uri: redirectUrl
    });

    const options = {
      hostname: 'slack.com',
      path: '/api/oauth.v2.access',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const response = await makeRequest(options, postData);
    
    // Slack returns different token structure
    // authed_user contains the user token
    const userToken = response.authed_user?.access_token;
    const botToken = response.access_token; // This is the bot token if bot scopes were requested
    
    // Slack doesn't use refresh tokens in the same way as Google
    // Tokens don't expire unless explicitly revoked
    const result = {
      access_token: userToken || botToken,
      // Include additional Slack-specific data
      team_id: response.team?.id,
      team_name: response.team?.name,
      user_id: response.authed_user?.id,
      scope: response.authed_user?.scope || response.scope
    };
    
    // Only include refresh_token and expiry_date if they exist (they won't for Slack)
    return result;
  } catch (error) {
    console.error('Slack token exchange error:', error);
    throw new Error(`Slack token exchange failed: ${error.message}`);
  }
}

/**
 * Refresh access token - Not applicable for Slack
 * Slack tokens don't expire, so this is a no-op
 * @param {string} refreshToken - Not used for Slack
 * @returns {Object} Returns the same token
 */
async function refreshAccessToken(refreshToken) {
  // Slack doesn't use refresh tokens
  // Tokens are valid until explicitly revoked
  throw new Error('Slack tokens do not expire and cannot be refreshed');
}

module.exports = {
  generateAuthUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
};