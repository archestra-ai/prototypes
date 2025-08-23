# Azure App Registration for Microsoft Teams MCP Server

This guide walks you through registering an Azure AD application for use with the Microsoft Teams MCP server in Archestra.

## Prerequisites

- Microsoft Azure account with an active subscription
- Microsoft Teams admin access (for app permissions)
- Access to Azure Portal (https://portal.azure.com)

## Step 1: Create Azure AD App Registration

1. Navigate to [Azure Portal](https://portal.azure.com)
2. Go to **Azure Active Directory** → **App registrations**
3. Click **New registration**
4. Configure the app:
   - **Name**: `Archestra MS Teams MCP Server` (or your preferred name)
   - **Supported account types**: Choose based on your needs:
     - **Single tenant**: For use within your organization only
     - **Multitenant**: For use across multiple organizations
   - **Redirect URI**:
     - Platform: **Web**
     - URI: `archestra-ai://oauth-callback`

5. Click **Register**

## Step 2: Configure Authentication

1. In your app registration, go to **Authentication**
2. Under **Platform configurations**, ensure your redirect URI is listed
3. Under **Advanced settings**:
   - Enable **Allow public client flows**: **Yes** (required for PKCE)
4. Click **Save**

## Step 3: Configure API Permissions

1. Go to **API permissions**
2. Click **Add a permission**
3. Select **Microsoft Graph**
4. Choose **Delegated permissions**
5. Add the following permissions:
   - `offline_access` (for refresh tokens)
   - `User.Read` (basic user profile)
   - `ChannelMessage.Send`
   - `ChannelMessage.Read.All`
   - `Chat.Create`
   - `Chat.ReadWrite`
   - `Chat.Read`
   - `ChatMessage.Read`
   - `ChatMessage.Send`
   - `Team.ReadBasic.All`
   - `TeamMember.Read.All`

6. Click **Add permissions**
7. (Optional) Click **Grant admin consent** if you're an admin

## Step 4: Create Client Secret

1. Go to **Certificates & secrets**
2. Click **New client secret**
3. Add a description: `Archestra OAuth Proxy Secret`
4. Choose expiration period (recommend 24 months)
5. Click **Add**
6. **IMPORTANT**: Copy the secret value immediately - you won't be able to see it again!

## Step 5: Gather Required Information

From the **Overview** page, collect:

- **Application (client) ID**: This is your `TEAMS_APP_ID` and `MSTEAMS_CLIENT_ID`
- **Directory (tenant) ID**: This is your `TEAMS_APP_TENANT_ID`
- **Client Secret**: The value you copied in Step 4 is your `TEAMS_APP_PASSWORD` and `MSTEAMS_CLIENT_SECRET`

## Step 6: Configure OAuth Proxy

Add the following to your OAuth proxy `.env` file:

```bash
MSTEAMS_CLIENT_ID=<your-application-client-id>
MSTEAMS_CLIENT_SECRET=<your-client-secret>
```

## Step 7: Configure MCP Server Environment

When installing the MS Teams MCP server in Archestra, you'll need to provide:

```bash
TEAMS_APP_ID=<your-application-client-id>
TEAMS_APP_PASSWORD=<your-client-secret>
TEAMS_APP_TYPE=SingleTenant  # or MultiTenant
TEAMS_APP_TENANT_ID=<your-tenant-id>  # Only for SingleTenant
TEAM_ID=<your-teams-group-id>
TEAMS_CHANNEL_ID=<your-teams-channel-id>
```

### Finding Team and Channel IDs

1. **Team ID**:
   - Open Microsoft Teams
   - Click the three dots (...) next to your team name
   - Select **Get link to team**
   - The URL contains the team ID after `groupId=`

2. **Channel ID**:
   - Navigate to the channel in Teams
   - Click the three dots (...) next to the channel name
   - Select **Get link to channel**
   - The URL contains the channel ID (URL-encoded)
   - **Note**: You may need to URL-decode special characters

## Step 8: Test the Integration

1. Start the OAuth proxy server
2. In Archestra, install the MS Teams MCP server
3. Complete the OAuth flow when prompted
4. Verify the server can access your Teams channels

## Troubleshooting

### Common Issues

1. **"Invalid client" error**:
   - Verify client ID and secret are correct
   - Ensure the secret hasn't expired
   - Check that you're using the correct tenant endpoint

2. **"Insufficient privileges" error**:
   - Ensure all required permissions are granted
   - Admin consent may be required for some permissions
   - User must have access to the specified Teams and channels

3. **"Invalid redirect URI" error**:
   - Verify `archestra-ai://oauth-callback` is registered
   - Ensure it's added as a Web platform redirect URI

4. **Token refresh issues**:
   - Ensure `offline_access` permission is granted
   - Check token expiry handling in your implementation

## Security Best Practices

1. **Rotate secrets regularly** - Set calendar reminders before expiry
2. **Use least privilege** - Only request permissions you actually need
3. **Restrict app access** - Use conditional access policies if available
4. **Monitor app usage** - Review sign-in logs in Azure AD
5. **Secure storage** - Never commit secrets to version control

## Additional Resources

- [Microsoft Graph permissions reference](https://learn.microsoft.com/en-us/graph/permissions-reference)
- [Azure AD app registration documentation](https://learn.microsoft.com/en-us/azure/active-directory/develop/quickstart-register-app)
- [Microsoft Teams MCP Server documentation](https://github.com/InditexTech/mcp-teams-server)
- [OAuth 2.0 and Microsoft identity platform](https://learn.microsoft.com/en-us/azure/active-directory/develop/v2-oauth2-auth-code-flow)
