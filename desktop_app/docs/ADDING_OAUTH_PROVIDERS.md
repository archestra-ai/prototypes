# Adding OAuth Providers to Archestra

This guide helps you add OAuth providers (Jira, LinkedIn, MS Teams, etc.) to Archestra.

## Architecture

```
Desktop App (PKCE) → OAuth Proxy (Secrets) → Provider API
```

- **Desktop App**: Initiates OAuth, stores tokens as env vars
- **OAuth Proxy**: Holds client secrets, exchanges codes for tokens
- **Provider**: External OAuth service

## Step 1: OAuth Proxy Setup

### 1.1 Add Credentials

```bash
# oauth_proxy/.env
JIRA_CLIENT_ID=your-client-id
JIRA_CLIENT_SECRET=your-client-secret
```

### 1.2 Create Provider Class

```javascript
// oauth_proxy/src/providers/jira.js
import { OAuthProvider } from './base.js';

export class JiraOAuthProvider extends OAuthProvider {
  // Most providers work with base class
  // Only override for special cases:

  // Non-standard token response
  async exchangeCode(params) {
    const response = await super.exchangeCode(params);
    // Transform if needed
    return response;
  }

  // No refresh tokens
  async refreshToken(params) {
    throw new Error('Jira tokens do not expire');
  }
}
```

### 1.3 Register Provider

```javascript
// oauth_proxy/src/config/index.js
providers: {
  jira: {
    clientId: process.env.JIRA_CLIENT_ID,
    clientSecret: process.env.JIRA_CLIENT_SECRET,
    tokenEndpoint: 'https://auth.atlassian.com/oauth/token',
  }
}

// oauth_proxy/src/providers/index.js
import { JiraOAuthProvider } from './jira.js';

if (config.providers.jira.clientId) {
  providers.set('jira', new JiraOAuthProvider(config.providers.jira));
}
```

## Step 2: Desktop App Integration

### 2.1 Add Provider Definition

```typescript
// desktop_app/src/backend/config/oauth-providers.ts
jira: {
  name: 'jira',
  authorizationUrl: 'https://auth.atlassian.com/authorize',
  scopes: ['read:jira-user', 'write:jira-work'],
  usePKCE: true,
  clientId: 'your-public-client-id',

  // Map tokens to env vars
  tokenEnvVarPattern: {
    accessToken: 'JIRA_ACCESS_TOKEN',
    refreshToken: 'JIRA_REFRESH_TOKEN',
  },

  metadata: {
    displayName: 'Jira',
    supportsRefresh: true,
  }
}
```

### 2.2 Update Schema (if needed)

```typescript
// Only if adding new provider type
// desktop_app/src/backend/models/mcpServer/index.ts
oauthProvider: z.enum(['google', 'slack', 'slack-browser', 'jira']).optional();
```

## Step 3: Test

```bash
# Terminal 1
cd oauth_proxy && npm run dev

# Terminal 2
cd desktop_app && pnpm start
```

1. Go to Connectors page
2. Install MCP server using your provider
3. Complete OAuth flow
4. Verify tokens in database

## Special Cases

### Browser Authentication (No OAuth)

For providers where you extract tokens from their web UI:

```typescript
// desktop_app/src/backend/config/oauth-providers.ts
'jira-browser': {
  name: 'jira-browser',
  authorizationUrl: '',
  scopes: [],
  usePKCE: false,
  clientId: 'browser-auth',

  tokenEnvVarPattern: {
    accessToken: 'JIRA_ACCESS_TOKEN',
  },

  browserAuthConfig: {
    enabled: true,
    loginUrl: 'https://jira.com/login',

    navigationRules: (url) => url.includes('jira.com'),

    extractTokens: async (window) => {
      const { webContents, session } = window;
      const url = webContents.getURL();

      // Only on dashboard
      if (!url.includes('/dashboard')) return null;

      // Get from localStorage
      const token = await webContents.executeJavaScript(
        `localStorage.getItem('auth_token')`
      );

      // Get from cookies
      const cookies = await session.cookies.get({ name: 'session' });

      if (token) {
        return { access_token: token };
      }
      return null;
    }
  }
}
```

### File-Based Credentials

For providers needing credential files instead of env vars:

```typescript
jira: {
  // ... standard config ...

  tokenHandler: async (tokens, serverId) => {
    const creds = {
      type: 'authorized_user',
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
    };

    // Write to container
    await writeFileToContainer(serverId, '/home/appuser/.jira/credentials.json', JSON.stringify(creds, null, 2));
  };
}
```

### Custom Auth Parameters

```typescript
jira: {
  // ... standard config ...

  authorizationParams: {
    audience: 'api.atlassian.com',
    prompt: 'consent',
  }
}
```

## Connecting Providers to MCP Servers

### MCP Server Catalog Integration

MCP servers specify OAuth requirements in their catalog manifest:

```json
// Example: catalog entry for Jira MCP server
{
  "name": "company__jira-mcp-server",
  "display_name": "Jira MCP Server",
  "archestra_config": {
    "oauth": {
      "provider": "jira", // Must match provider name from oauth-providers.ts
      "required": true // OAuth required for installation
    }
  },
  "user_config": {
    "jira_url": {
      "type": "string",
      "required": true,
      "description": "Your Jira instance URL"
    }
  }
}
```

### How It Works

1. **Catalog defines provider**: `archestra_config.oauth.provider` specifies which OAuth provider to use
2. **UI detects OAuth**: Connectors page reads `archestra_config.oauth` from manifest
3. **Installation triggers OAuth**:
   ```typescript
   // Automatic in connectors.tsx
   const provider = mcpServer.archestra_config.oauth?.provider;
   if (mcpServer.archestra_config.oauth?.required) {
     startOAuthFlow(provider);
   }
   ```
4. **Tokens stored**: After OAuth, tokens saved to DB and added as env vars to MCP server

### Adding Your Provider to Catalog

1. Update catalog manifest:

   ```json
   {
     "archestra_config": {
       "oauth": {
         "provider": "yourprovider",
         "required": true
       }
     }
   }
   ```

2. Provider name must match exactly between:
   - OAuth proxy: `providers.set('yourprovider', ...)`
   - Desktop app: `oauthProviders['yourprovider'] = {...}`
   - Catalog: `"provider": "yourprovider"`

### Browser Auth in Catalog

For browser-based auth, catalog specifies the base provider:

```json
{
  "archestra_config": {
    "oauth": {
      "provider": "slack", // Base provider name
      "required": false
    },
    "browser_based": {
      "required": false // Allows browser auth option
    }
  }
}
```

UI automatically maps to browser provider when needed:

```typescript
// connectors.tsx handles this mapping
oauthProvider: useBrowserAuth && provider === 'slack'
  ? 'slack-browser' // Maps to browser auth provider
  : provider;
```
