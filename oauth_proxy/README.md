# OAuth Proxy

OAuth proxy service for handling OAuth authentication flows for MCP servers.

## Production

Build is triggered when any file from this folder is changed. Open Cloud Run in https://console.cloud.google.com/ for more details

## Local Development

1. **Install dependencies:**
   ```bash
   pnpm install
   ```

2. **Create `.env` file:**
   ```bash
   PORT=8080
   GOOGLE_CLIENT_ID=your_google_client_id
   GOOGLE_CLIENT_SECRET=your_google_client_secret
   SLACK_CLIENT_ID=your_slack_client_id
   SLACK_CLIENT_SECRET=your_slack_client_secret
   REDIRECT_URL=http://localhost:8080
   ```

3. **Run server:**
   ```bash
   pnpm start        # Production mode
   pnpm run dev      # Development with auto-reload
   ```

Server runs on `http://localhost:8080`

### Running with HTTPS locally

To run the OAuth proxy with HTTPS on localhost:

1. **Install mkcert** (if not already installed):
   ```bash
   # macOS
   brew install mkcert
   
   # Install the local CA
   mkcert -install
   ```

2. **Generate certificates** for localhost:
   ```bash
   cd oauth_proxy
   mkcert localhost
   ```
   This will create `localhost.pem` and `localhost-key.pem` files.

3. **Update `.env` file** to use HTTPS:
   ```bash
   USE_LOCAL_HTTPS=true
   REDIRECT_URL=https://localhost:8080/oauth-callback/gmail
   SLACK_REDIRECT_URL=https://localhost:8080/oauth-callback/slack
   ```

4. **Run the server:**
   ```bash
   pnpm start
   ```

Server will now run on `https://localhost:8080` with valid local certificates.
