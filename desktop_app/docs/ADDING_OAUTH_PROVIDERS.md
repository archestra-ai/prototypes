# Adding OAuth Providers to Archestra

This guide explains how to add new OAuth providers to Archestra. The system uses a two-tier architecture with an OAuth proxy server (holds secrets) and the desktop application (initiates flows).

## Table of Contents

- [Quick Start](#quick-start)
- [Architecture Overview](#architecture-overview)
- [Step 1: OAuth Proxy Configuration](#step-1-oauth-proxy-configuration)
- [Step 2: Desktop App Integration](#step-2-desktop-app-integration)
- [Step 3: Special Cases](#step-3-special-cases)
- [Step 4: Testing](#step-4-testing)
- [Troubleshooting](#troubleshooting)

## Quick Start

For a standard OAuth provider (like GitHub, GitLab, etc.), you can add support in ~5 minutes:

1. **OAuth Proxy**: Add provider config to `oauth_proxy/.env` and create provider class
2. **Desktop App**: Add provider definition to `desktop_app/src/backend/config/oauth-providers.ts`
3. **Test**: Run both services and test the OAuth flow

## Architecture Overview

```
┌─────────────────┐     ┌──────────────┐     ┌──────────────┐
│  Desktop App    │────▶│ OAuth Proxy  │────▶│   Provider   │
│  (Electron)     │◀────│  (Secrets)   │◀────│  (Google,    │
│                 │     │              │     │   Slack...)  │
└─────────────────┘     └──────────────┘     └──────────────┘
```

- **Desktop App**: Initiates OAuth with PKCE, stores tokens
- **OAuth Proxy**: Holds client secrets, exchanges codes for tokens
- **Provider**: External OAuth provider (Google, Slack, etc.)

## Step 1: OAuth Proxy Configuration

### 1.1 Add Provider Credentials

Edit `oauth_proxy/.env`:

```bash
# Your new provider
YOURPROVIDER_CLIENT_ID=your-client-id-here
YOURPROVIDER_CLIENT_SECRET=your-client-secret-here
```

### 1.2 Create Provider Class

Create `oauth_proxy/src/providers/yourprovider.js`:

```javascript
import { OAuthProvider } from './base.js';

export class YourProviderOAuthProvider extends OAuthProvider {
  // Most providers work with the base implementation
  // Override methods only if needed for special cases

  // Example: Custom token response handling
  async exchangeCode(params) {
    const response = await super.exchangeCode(params);

    // Transform response if needed
    if (response.custom_field) {
      return {
        access_token: response.custom_field.token,
        refresh_token: response.custom_field.refresh,
        // ... standard OAuth fields
      };
    }

    return response;
  }

  // Example: No refresh token support
  async refreshToken(params) {
    throw new Error('YourProvider tokens do not expire');
  }
}
```

### 1.3 Register Provider

Edit `oauth_proxy/src/providers/index.js`:

```javascript
import { YourProviderOAuthProvider } from './yourprovider.js';

export function initializeProviders() {
  // ... existing providers ...

  // YourProvider OAuth
  if (config.providers.yourprovider.clientId && config.providers.yourprovider.clientSecret) {
    providers.set('yourprovider', new YourProviderOAuthProvider(config.providers.yourprovider));
    console.log('✓ YourProvider OAuth provider initialized');
  }
}
```

### 1.4 Add Provider Config

Edit `oauth_proxy/src/config/index.js`:

```javascript
export const config = {
  // ... existing config ...

  providers: {
    // ... existing providers ...

    yourprovider: {
      clientId: process.env.YOURPROVIDER_CLIENT_ID,
      clientSecret: process.env.YOURPROVIDER_CLIENT_SECRET,
      tokenEndpoint: 'https://yourprovider.com/oauth/token',
      revokeEndpoint: 'https://yourprovider.com/oauth/revoke', // optional
    },
  },
};
```

## Step 2: Desktop App Integration

### 2.1 Add Provider Definition

Edit `desktop_app/src/backend/config/oauth-providers.ts`:

```typescript
import { OAuthProviderDefinition } from './oauth-provider-interface';

export const oauthProviders: Record<string, OAuthProviderDefinition> = {
  // ... existing providers ...

  yourprovider: {
    name: 'yourprovider',
    authorizationUrl: 'https://yourprovider.com/oauth/authorize',
    scopes: ['read', 'write'], // Your required scopes
    usePKCE: true,
    clientId: process.env.YOURPROVIDER_OAUTH_CLIENT_ID || 'default-client-id',

    // Option 1: Standard environment variable approach
    tokenEnvVarPattern: {
      accessToken: 'YOURPROVIDER_ACCESS_TOKEN',
      refreshToken: 'YOURPROVIDER_REFRESH_TOKEN', // optional
    },

    // Option 2: Custom token handler (see Special Cases)
    // tokenHandler: async (tokens, serverId) => { ... }
  },
};
```

### 2.2 Environment Variables (Optional)

If using different client IDs for development:

```bash
# desktop_app/.env
YOURPROVIDER_OAUTH_CLIENT_ID=your-dev-client-id
```

## Step 3: Special Cases

### 3.1 File-Based Authentication (Like Google)

Some providers need credentials written to files instead of environment variables:

```typescript
yourprovider: {
  // ... standard config ...

  // Custom token handler writes to file
  tokenHandler: async (tokens, serverId) => {
    const credentials = {
      type: 'authorized_user',
      client_id: config.clientId,
      client_secret: 'secret-from-proxy',
      refresh_token: tokens.refresh_token,
      access_token: tokens.access_token,
    };

    // Write to container at specific path
    await writeFileToContainer(
      serverId,
      '/home/appuser/.yourprovider/credentials.json',
      JSON.stringify(credentials, null, 2)
    );
  },
}
```

### 3.2 Browser-Based Authentication

Some providers support extracting tokens directly from their web interface. The system now supports browser-based authentication through provider configuration.

#### Approach 1: Separate Provider for Browser Auth (Recommended)

Create a separate provider configuration for browser authentication:

```typescript
// desktop_app/src/backend/config/oauth-providers.ts

'yourprovider-browser': {
  name: 'yourprovider-browser',
  authorizationUrl: '', // Not used for browser auth
  scopes: [], // Not used for browser auth
  usePKCE: false,
  clientId: 'browser-auth', // Placeholder

  // Map extracted tokens to environment variables
  tokenEnvVarPattern: {
    accessToken: 'YOURPROVIDER_ACCESS_TOKEN',
    refreshToken: 'YOURPROVIDER_REFRESH_TOKEN', // optional
  },

  // Browser authentication configuration
  browserAuthConfig: {
    enabled: true,
    loginUrl: 'https://yourprovider.com/login',

    // Optional: Detect workspace/team IDs from URLs
    workspacePattern: /yourprovider:\/\/([A-Z0-9]+)/,

    // Control which URLs the user can navigate to
    navigationRules: (url: string) => {
      return url.includes('yourprovider.com');
    },

    // Extract tokens from the authenticated session
    extractTokens: async (window: any) => {
      const url = window.webContents.getURL();

      // Only extract tokens on specific pages
      if (!url.includes('yourprovider.com/dashboard')) {
        return null;
      }

      // Example: Get token from localStorage
      const token = await window.webContents.executeJavaScript(`
        localStorage.getItem('auth_token')
      `);

      // Example: Get token from cookies
      const cookies = await window.webContents.session.cookies.get({ name: 'session' });
      const sessionToken = cookies[0]?.value;

      if (token && sessionToken) {
        // Return tokens in standard format
        // These will be mapped according to tokenEnvVarPattern
        return {
          access_token: token,
          refresh_token: sessionToken,
        };
      }

      return null;
    },
  },

  metadata: {
    displayName: 'YourProvider (Browser Auth)',
    notes: 'Direct browser authentication - no OAuth app required',
  },
}
```

#### Approach 2: Single Provider with Both Methods

If you want one provider to support both OAuth and browser auth, you can check for a flag:

```typescript
yourprovider: {
  // ... standard OAuth config ...

  browserAuthConfig: {
    enabled: true,
    // ... browser auth config ...
  },

  // Custom token handler can detect token type
  tokenHandler: async (tokens, serverId) => {
    if ('browser_token' in tokens) {
      // Handle browser tokens differently
    } else {
      // Handle OAuth tokens
    }
  },
}
```

#### Real Example: Slack Browser Authentication

```typescript
'slack-browser': {
  name: 'slack-browser',
  authorizationUrl: '',
  scopes: [],
  usePKCE: false,
  clientId: 'browser-auth',

  tokenEnvVarPattern: {
    accessToken: 'SLACK_MCP_XOXC_TOKEN',
    refreshToken: 'SLACK_MCP_XOXD_TOKEN', // xoxd stored as "refresh"
  },

  browserAuthConfig: {
    enabled: true,
    loginUrl: 'https://slack.com/signin',
    workspacePattern: /slack:\/\/([A-Z0-9]+)/,

    navigationRules: (url) => {
      return url.startsWith('https://slack.com/') ||
             url.startsWith('https://app.slack.com/') ||
             url.includes('.slack.com/');
    },

    extractTokens: async (window) => {
      // Extract xoxc from localStorage and xoxd from cookies
      // See full implementation in oauth-providers.ts
    },
  },
}
```

#### UI Integration

In your MCP server installation flow:

```typescript
// Determine which provider to use
const provider = useBrowserAuth ? 'yourprovider-browser' : 'yourprovider';

// For browser auth
if (useBrowserAuth) {
  const tokens = await window.electronAPI.providerBrowserAuth(provider);
  // Tokens are automatically stored according to tokenEnvVarPattern
}
```

### 3.3 Non-Standard Token Response

If the provider returns tokens in a non-standard format, override in the OAuth proxy:

```javascript
// oauth_proxy/src/providers/yourprovider.js
async exchangeCode(params) {
  const response = await super.exchangeCode(params);

  // Transform non-standard response
  if (response.data?.oauth_token) {
    return {
      access_token: response.data.oauth_token,
      refresh_token: response.data.oauth_refresh_token,
      expires_in: response.data.ttl,
    };
  }

  return response;
}
```

### 3.4 Custom Authorization Parameters

For providers needing special auth parameters:

```typescript
// In provider definition
authorizationParams?: {
  // Standard params are handled automatically
  // Add any provider-specific params here
  custom_param?: string;
  prompt?: 'consent' | 'none';
}

// Example for Slack's user_scope
authorizationParams: {
  user_scope: 'identity.basic,identity.email',
}
```

## Step 4: Testing

### 4.1 Start Services

```bash
# Terminal 1: OAuth Proxy
cd oauth_proxy
npm run dev

# Terminal 2: Desktop App
cd desktop_app
pnpm start
```

### 4.2 Test OAuth Flow

1. Go to Connectors page in the app
2. Find an MCP server that uses your provider
3. Click "Install" and follow OAuth flow
4. Verify tokens are stored correctly

### 4.3 Verify Token Storage

**Environment Variables** (standard approach):

```bash
# Check the MCP server config in the database
# Should see YOURPROVIDER_ACCESS_TOKEN in server_config.environment
```

**File-Based** (custom handler):

```bash
# Check inside the container
podman exec <container-id> cat /home/appuser/.yourprovider/credentials.json
```

## Troubleshooting

### Common Issues

#### Provider Not Showing Up

- Check OAuth proxy logs for initialization
- Verify credentials in `.env` file
- Ensure provider is registered in `providers/index.js`

#### Token Exchange Fails

- Check OAuth proxy logs for detailed errors
- Verify redirect URI matches provider settings
- Ensure PKCE is correctly configured

#### Tokens Not Stored

- Check provider definition in desktop app
- Verify `tokenEnvVarPattern` or `tokenHandler` is defined
- Check server logs for storage errors

#### Special Auth Not Working

- Ensure IPC handler is registered in main process
- Check browser window security settings
- Verify domain restrictions for navigation

### Debug Mode

Enable detailed logging:

```bash
# OAuth Proxy
DEBUG=oauth:* npm run dev

# Desktop App
DEBUG=archestra:* pnpm start
```

### Provider-Specific Notes

#### Google

- Requires file-based credentials
- Uses service account pattern
- Tokens written to `~/.google/credentials.json` in container

#### Slack

- No refresh tokens (tokens don't expire)
- Supports both OAuth and browser-based auth
- Returns nested token structure

#### GitHub

- Tokens can be scoped to organizations
- Supports fine-grained personal access tokens
- May require app installation for org access

## Adding Your Provider to the Catalog

Once your provider is working:

1. Add to MCP server catalog if applicable
2. Update server's `oauth_provider` field
3. Test full installation flow
4. Submit PR with:
   - Provider implementation
   - Tests
   - Documentation updates

## Security Considerations

### General OAuth Security

1. **Never commit secrets** - Use environment variables
2. **Always use PKCE** for public clients
3. **Validate redirect URIs** to prevent attacks
4. **Store tokens securely** - Never in plain text files outside containers
5. **Implement token refresh** if provider supports it
6. **Clean up tokens** when server is uninstalled

### Browser Authentication Security

When implementing browser-based authentication:

1. **Domain Validation**: Always implement `navigationRules` to restrict navigation to official provider domains
2. **Secure Context**: Use `contextIsolation: true` and `sandbox: true` in browser windows
3. **Session Isolation**: Use separate partition for each provider (`partition: 'persist:provider-auth'`)
4. **Token Extraction**: Only extract tokens on verified pages (check URL patterns)
5. **Clear Session Data**: Clean up cookies and localStorage after token extraction
6. **Timeout Handling**: Implement timeouts for user authentication
7. **Error Messages**: Don't expose sensitive information in error messages

Example secure browser window configuration:

```typescript
const authWindow = new BrowserWindow({
  webPreferences: {
    nodeIntegration: false,
    contextIsolation: true,
    webSecurity: true,
    sandbox: true,
    partition: `persist:${provider.name}-auth`,
    allowRunningInsecureContent: false,
  },
});
```

## Questions?

- Check existing providers for examples
- Ask in GitHub discussions
- Review OAuth 2.0 specification for standard flows
