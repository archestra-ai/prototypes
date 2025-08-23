# Azure AD App Registration for Microsoft 365 OAuth

This guide walks you through setting up an Azure AD application for Microsoft 365 OAuth integration with Archestra.

## Prerequisites

- Microsoft Azure account with access to Azure Active Directory
- Admin permissions to create app registrations

## Step 1: Create Azure AD App Registration

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to **Azure Active Directory** → **App registrations**
3. Click **New registration**
4. Configure the app:
   - **Name**: `Archestra Microsoft 365 Integration` (or your preferred name)
   - **Supported account types**:
     - For personal accounts only: "Accounts in any organizational directory and personal Microsoft accounts"
     - For work/school accounts only: "Accounts in any organizational directory"
     - For both: "Accounts in any organizational directory and personal Microsoft accounts" (recommended)
   - **Redirect URI**:
     - Platform: Web
     - URI: `https://oauth-proxy-new-354887056155.europe-west1.run.app/callback`

## Step 2: Configure API Permissions

1. In your app registration, go to **API permissions**
2. Click **Add a permission** → **Microsoft Graph** → **Delegated permissions**
3. Add the following permissions:

### Core Permissions (Always Required)

- `User.Read` - Sign in and read user profile
- `offline_access` - Maintain access to data

### Email Permissions

- `Mail.Read` - Read user mail
- `Mail.Send` - Send mail as the user
- `Mail.ReadWrite` - Read and write user mail

### Calendar Permissions

- `Calendars.Read` - Read user calendars
- `Calendars.ReadWrite` - Read and write user calendars

### File Permissions (OneDrive)

- `Files.Read` - Read user files
- `Files.ReadWrite` - Read and write user files
- `Files.Read.All` - Read all files user can access
- `Files.ReadWrite.All` - Read and write all files user can access

### OneNote Permissions

- `Notes.Read` - Read user OneNote notebooks
- `Notes.Create` - Create pages in user notebooks

### To Do Permissions

- `Tasks.Read` - Read user tasks
- `Tasks.ReadWrite` - Create, read, update and delete user tasks

### Planner Permissions

- `Tasks.Read.Shared` - Read user and shared tasks
- `Tasks.ReadWrite.Shared` - Create, read, update, and delete user and shared tasks

### Contacts Permissions

- `Contacts.Read` - Read user contacts
- `Contacts.ReadWrite` - Read and write user contacts

### Search Permissions

- `ExternalItem.Read.All` - Read external items

### Organization Mode Permissions (Teams, SharePoint)

- `Chat.Read` - Read user chat messages
- `Chat.ReadWrite` - Read and write user chat messages
- `Team.ReadBasic.All` - Read basic team information
- `Channel.ReadBasic.All` - Read basic channel information
- `ChannelMessage.Read.All` - Read channel messages
- `ChannelMessage.Send` - Send channel messages
- `Sites.Read.All` - Read items in all site collections
- `Sites.ReadWrite.All` - Edit or delete items in all site collections
- `User.Read.All` - Read all users' full profiles
- `Mail.Read.Shared` - Read shared mailboxes
- `Mail.Send.Shared` - Send mail from shared mailboxes

4. Click **Grant admin consent** (if you have admin permissions)

## Step 3: Create Client Secret

1. Go to **Certificates & secrets**
2. Click **New client secret**
3. Add a description: `Archestra OAuth Secret`
4. Choose expiration (recommend 24 months)
5. Click **Add**
6. **IMPORTANT**: Copy the secret value immediately - you won't be able to see it again!

## Step 4: Get Application IDs

1. Go to **Overview** in your app registration
2. Copy these values:
   - **Application (client) ID**: This is your `MICROSOFT_CLIENT_ID`
   - **Directory (tenant) ID**: This is your `MICROSOFT_TENANT_ID` (use "common" for multi-tenant)

## Step 5: Configure OAuth Proxy

Add these environment variables to your OAuth proxy `.env` file:

```bash
# oauth_proxy/.env
MICROSOFT_CLIENT_ID=your-application-client-id
MICROSOFT_CLIENT_SECRET=your-client-secret
MICROSOFT_TENANT_ID=common  # or your specific tenant ID
```

## Step 6: Configure Desktop App (Optional)

If you want to use a custom client ID for the desktop app, set this environment variable:

```bash
# desktop_app/.env
MICROSOFT_OAUTH_CLIENT_ID=your-application-client-id
```

## Testing Your Configuration

1. Start the OAuth proxy:

   ```bash
   cd oauth_proxy && npm run dev
   ```

2. Start Archestra:

   ```bash
   cd desktop_app && pnpm start
   ```

3. Go to Connectors page and install a Microsoft 365 MCP server
4. Complete the OAuth flow
5. Verify tokens are stored in the database

## Troubleshooting

### Common Issues

1. **"Invalid client" error**: Check that your client ID and secret are correct
2. **"Invalid redirect URI" error**: Ensure the redirect URI matches exactly
3. **"Unauthorized client" error**: Grant admin consent for the permissions
4. **"Invalid tenant" error**: Check your tenant ID configuration

### Token Information

The Microsoft OAuth integration stores tokens as follows:

- Access token: `MS365_MCP_OAUTH_TOKEN`
- Refresh token: `MS365_MCP_REFRESH_TOKEN`
- Token expiry: `MS365_MCP_TOKEN_EXPIRY`

These environment variables are automatically added to the MCP server container.

## Security Notes

- Never commit client secrets to version control
- Rotate client secrets regularly (every 12-24 months)
- Use the principle of least privilege - only request permissions you need
- Consider using separate app registrations for development and production

## Additional Resources

- [Microsoft identity platform documentation](https://docs.microsoft.com/en-us/azure/active-directory/develop/)
- [Microsoft Graph permissions reference](https://docs.microsoft.com/en-us/graph/permissions-reference)
- [OAuth 2.0 authorization code flow](https://docs.microsoft.com/en-us/azure/active-directory/develop/v2-oauth2-auth-code-flow)
