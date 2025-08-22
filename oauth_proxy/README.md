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
   REDIRECT_URL=http://localhost:8080
   ```

3. **Run server:**
   ```bash
   pnpm start        # Production mode
   pnpm run dev      # Development with auto-reload
   ```

Server runs on `http://localhost:8080`
