# LinkedIn OAuth Setup Guide

This guide walks you through setting up OAuth 2.0 authentication for LinkedIn in Archestra, specifically for use with MCP servers that need LinkedIn access.

## Prerequisites

- LinkedIn account
- LinkedIn Developer account (free)
- Access to create LinkedIn apps

## Step 1: Create a LinkedIn App

1. Go to [LinkedIn Developers](https://www.linkedin.com/developers/)
2. Click **"Create app"**
3. Fill in the required information:
   - **App name**: Choose a descriptive name (e.g., "Archestra MCP Integration")
   - **LinkedIn Page**: Select or create a company page (required)
   - **App logo**: Upload a logo (120x120px minimum)
   - **Legal agreement**: Check the box to accept terms

4. Click **"Create app"**

## Step 2: Configure OAuth Settings

1. In your app dashboard, go to the **"Auth"** tab
2. Under **"OAuth 2.0 settings"**, add redirect URLs:
   - For local development: `http://localhost:8080/callback`
   - For production OAuth proxy: `https://your-oauth-proxy-domain.com/callback`
   - For desktop app deep link: `archestra-ai://oauth-callback`

3. Under **"OAuth 2.0 scopes"**, add the required scopes:
   - `openid` - OpenID Connect authentication
   - `profile` - Basic profile information
   - `email` - Email address
   - `offline_access` - Required for refresh tokens (automatically included)

   Additional scopes may be required depending on your MCP server needs:
   - `w_member_social` - Share content on LinkedIn
   - `r_liteprofile` - Lite profile details
   - `r_emailaddress` - Email address (legacy)

## Step 3: Get Your Credentials

1. In the **"Auth"** tab, find your credentials:
   - **Client ID**: This is your public identifier
   - **Client Secret**: Click **"Show"** to reveal (keep this secret!)

2. Copy these values - you'll need them for configuration

## Step 4: Configure Archestra

### Desktop App Configuration

The LinkedIn OAuth provider is already configured in Archestra. You must provide your own client ID:

1. Set environment variable:

   ```bash
   export LINKEDIN_OAUTH_CLIENT_ID=your_client_id_here
   ```

### OAuth Proxy Configuration

1. Add to your OAuth proxy `.env` file:

   ```env
   LINKEDIN_CLIENT_ID=your_client_id_here
   LINKEDIN_CLIENT_SECRET=your_client_secret_here
   ```

2. Restart the OAuth proxy server

## Step 5: Using LinkedIn OAuth with MCP Servers

### In MCP Server Catalog

MCP servers that require LinkedIn OAuth should specify in their manifest:

```json
{
  "name": "your-company__linkedin-mcp-server",
  "display_name": "LinkedIn MCP Server",
  "archestra_config": {
    "oauth": {
      "provider": "linkedin",
      "required": true
    }
  }
}
```

### Environment Variables in MCP Server

After OAuth authentication, the following environment variables are available to your MCP server:

- `LINKEDIN_ACCESS_TOKEN` - OAuth access token
- `LINKEDIN_REFRESH_TOKEN` - OAuth refresh token (if available)
- `LINKEDIN_TOKEN_EXPIRY` - Token expiration timestamp

## Step 6: Token Management

LinkedIn OAuth tokens typically expire after 60 days. Archestra handles token refresh automatically when:

1. A refresh token is provided
2. The token is approaching expiration
3. The MCP server is running

## Troubleshooting

### Common Issues

1. **"Invalid redirect URI"**
   - Ensure the redirect URI in your LinkedIn app matches exactly
   - Check for trailing slashes and protocol (http vs https)

2. **"Unauthorized scope"**
   - LinkedIn requires app review for certain scopes
   - Start with basic scopes: `openid`, `profile`, `email`
   - Request additional scopes through LinkedIn's review process

3. **"Invalid client credentials"**
   - Verify client ID and secret are correctly copied
   - Check for extra spaces or line breaks
   - Ensure OAuth proxy has the correct environment variables

### Testing Your Setup

1. Start the OAuth proxy:

   ```bash
   cd oauth_proxy
   npm run dev
   ```

2. Start Archestra:

   ```bash
   cd desktop_app
   pnpm start
   ```

3. Install an MCP server that uses LinkedIn OAuth
4. Complete the OAuth flow
5. Verify tokens are stored in the database

## Security Best Practices

1. **Never commit secrets**: Keep `LINKEDIN_CLIENT_SECRET` out of version control
2. **Use HTTPS in production**: OAuth callbacks should use HTTPS
3. **Limit scopes**: Only request the minimum scopes needed
4. **Rotate secrets regularly**: Update your client secret periodically
5. **Monitor usage**: Check LinkedIn's developer dashboard for unusual activity

## LinkedIn API Rate Limits

Be aware of LinkedIn's API rate limits:

- Daily application rate limit
- Per-user rate limit
- Specific endpoint limits

Monitor your usage in the LinkedIn Developer Dashboard.

## Additional Resources

- [LinkedIn OAuth Documentation](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow)
- [LinkedIn API Reference](https://learn.microsoft.com/en-us/linkedin/shared/api-guide/concepts)
- [LinkedIn Scopes Reference](https://learn.microsoft.com/en-us/linkedin/shared/references/migrations/default-scopes-migration)
- [Archestra OAuth Provider Guide](./ADDING_OAUTH_PROVIDERS.md)
