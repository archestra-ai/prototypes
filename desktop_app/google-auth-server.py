#!/usr/bin/env python3

"""
Simple Google OAuth Server for Native Apps
Following: https://developers.google.com/identity/protocols/oauth2/native-app

REQUIREMENTS:
1. Create a Google OAuth 2.0 Client ID (type: Desktop/Installed application)
2. Download the client credentials JSON from Google Cloud Console
3. Save it as: secrets/client_secret.json
4. The JSON should have this structure:
   {
     "installed": {
       "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
       "client_secret": "YOUR_CLIENT_SECRET",
       "auth_uri": "https://accounts.google.com/o/oauth2/auth",
       "token_uri": "https://oauth2.googleapis.com/token",
       ...
     }
   }
"""

import http.server
import socketserver
import urllib.parse
import webbrowser
import json
import secrets
import hashlib
import base64
import urllib.request
import os
import sys
from urllib.error import HTTPError

# Load OAuth credentials from secrets file
SECRETS_FILE = 'secrets/client_secret.json'

try:
    if not os.path.exists(SECRETS_FILE):
        print(f"""
❌ ERROR: OAuth credentials file not found!

Please follow these steps:
1. Go to https://console.cloud.google.com/apis/credentials
2. Create an OAuth 2.0 Client ID (type: Desktop application)
3. Download the JSON credentials
4. Save it as: {SECRETS_FILE}

Directory structure should be:
  desktop_app/
    ├── google-auth-server.py
    └── secrets/
        └── client_secret.json
        """)
        sys.exit(1)
        
    with open(SECRETS_FILE, 'r') as f:
        creds = json.load(f)
        
    # Extract credentials from the JSON file
    if 'installed' in creds:
        oauth_config = creds['installed']
    elif 'web' in creds:
        oauth_config = creds['web']
    else:
        print("❌ ERROR: Invalid client secret file format!")
        sys.exit(1)
        
    CLIENT_ID = oauth_config['client_id']
    CLIENT_SECRET = oauth_config['client_secret']
    AUTH_URI = oauth_config.get('auth_uri', 'https://accounts.google.com/o/oauth2/v2/auth')
    TOKEN_URI = oauth_config.get('token_uri', 'https://oauth2.googleapis.com/token')
    
    print(f"✅ Loaded OAuth credentials from {SECRETS_FILE}")
    print(f"   Client ID: {CLIENT_ID[:50]}...")
    
except Exception as e:
    print(f"❌ ERROR loading credentials: {e}")
    sys.exit(1)

# Additional endpoints not in the credentials file
USERINFO_URI = 'https://www.googleapis.com/oauth2/v2/userinfo'

# Local server configuration
PORT = 8080
REDIRECT_URI = f'http://localhost:{PORT}/callback'

# Global to store auth results
auth_result = None

def base64_url_encode(data):
    """Base64url encode without padding"""
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode('ascii')

def generate_code_verifier():
    """Generate code verifier for PKCE"""
    return base64_url_encode(secrets.token_bytes(32))

def generate_code_challenge(verifier):
    """Generate code challenge from verifier"""
    digest = hashlib.sha256(verifier.encode('ascii')).digest()
    return base64_url_encode(digest)

class OAuthHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        """Handle OAuth callback"""
        global auth_result

        if self.path.startswith('/callback'):
            # Parse query parameters
            query = urllib.parse.urlparse(self.path).query
            params = urllib.parse.parse_qs(query)

            if 'code' in params:
                auth_result = {'code': params['code'][0]}
                # Send success page
                self.send_response(200)
                self.send_header('Content-Type', 'text/html')
                self.end_headers()
                html = """
                <html>
                <head><title>Success</title></head>
                <body style="font-family: system-ui; padding: 40px; text-align: center;">
                    <h1 style="color: #22c55e;">Authentication Successful!</h1>
                    <p>You can close this window and return to the terminal.</p>
                </body>
                </html>
                """
                self.wfile.write(html.encode('utf-8'))
            elif 'error' in params:
                auth_result = {'error': params.get('error', ['Unknown'])[0]}
                # Send error page
                self.send_response(200)
                self.send_header('Content-Type', 'text/html')
                self.end_headers()
                error_msg = params.get('error', ['Unknown'])[0]
                html = f"""
                <html>
                <head><title>Error</title></head>
                <body style="font-family: system-ui; padding: 40px; text-align: center;">
                    <h1 style="color: #ef4444;">Authentication Failed</h1>
                    <p>Error: {error_msg}</p>
                </body>
                </html>
                """
                self.wfile.write(html.encode('utf-8'))
        else:
            self.send_error(404)

    def log_message(self, format, *args):
        """Suppress default logging"""
        pass

def start_auth_flow():
    """Start OAuth flow with PKCE"""
    # Generate PKCE parameters
    code_verifier = generate_code_verifier()
    code_challenge = generate_code_challenge(code_verifier)
    state = base64_url_encode(secrets.token_bytes(16))

    # Build authorization URL
    params = {
        'client_id': CLIENT_ID,
        'redirect_uri': REDIRECT_URI,
        'response_type': 'code',
        'scope': 'openid email profile',
        'code_challenge': code_challenge,
        'code_challenge_method': 'S256',
        'state': state,
        'access_type': 'offline',
        'prompt': 'consent'
    }

    auth_url = f"{AUTH_URI}?{urllib.parse.urlencode(params)}"

    print(f"\n📋 Opening browser for authentication...")
    print(f"   If browser doesn't open, visit:\n   {auth_url}\n")

    # Open browser
    webbrowser.open(auth_url)

    # Start local server to receive callback
    global auth_result
    auth_result = None

    with socketserver.TCPServer(("", PORT), OAuthHandler) as httpd:
        print(f"⏳ Waiting for authentication callback on port {PORT}...")

        # Wait for one request
        while auth_result is None:
            httpd.handle_request()

    if 'error' in auth_result:
        print(f"\n❌ Authentication failed: {auth_result['error']}")
        return None, None

    print(f"\n✅ Authorization code received!")
    return auth_result['code'], code_verifier

def exchange_code_for_tokens(auth_code, code_verifier):
    """Exchange authorization code for tokens"""
    print("\n🔄 Exchanging code for tokens...")

    # Google requires client_secret even with PKCE
    params = {
        'grant_type': 'authorization_code',
        'code': auth_code,
        'redirect_uri': REDIRECT_URI,
        'client_id': CLIENT_ID,
        'client_secret': CLIENT_SECRET,  # Required by Google
        'code_verifier': code_verifier  # Additional security with PKCE
    }

    data = urllib.parse.urlencode(params).encode('utf-8')
    req = urllib.request.Request(
        TOKEN_URI,
        data=data,
        headers={'Content-Type': 'application/x-www-form-urlencoded'}
    )

    try:
        with urllib.request.urlopen(req) as response:
            tokens = json.loads(response.read())
            print("✅ Tokens received!")
            return tokens
    except HTTPError as e:
        error_body = e.read().decode('utf-8')
        print(f"❌ Token exchange failed: {error_body}")
        return None

def get_user_info(access_token):
    """Get user info using access token"""
    print("\n👤 Fetching user information...")

    req = urllib.request.Request(
        USERINFO_URI,
        headers={'Authorization': f'Bearer {access_token}'}
    )

    try:
        with urllib.request.urlopen(req) as response:
            user_info = json.loads(response.read())
            print("✅ User information received!")
            return user_info
    except HTTPError as e:
        print(f"❌ Failed to get user info: {e}")
        return None

def main():
    """Main flow"""
    print("""
╔════════════════════════════════════════════════════════╗
║     Google OAuth Flow for Native Apps                  ║
╠════════════════════════════════════════════════════════╣
║  This implements the complete OAuth flow including:    ║
║  • PKCE for additional security                        ║
║  • Local server for callback                           ║
║  • Token exchange with client secret                   ║
║  • User info retrieval                                 ║
╚════════════════════════════════════════════════════════╝
    """)

    # Step 1: Start auth flow
    auth_code, code_verifier = start_auth_flow()

    if not auth_code:
        return

    # Step 2: Exchange code for tokens
    tokens = exchange_code_for_tokens(auth_code, code_verifier)

    if not tokens:
        return

    # Display tokens
    print("\n📦 Tokens Received:")
    print("─" * 50)
    print(f"Access Token: {tokens['access_token'][:50]}...")
    print(f"Token Type: {tokens['token_type']}")
    print(f"Expires In: {tokens.get('expires_in', 'N/A')} seconds")
    if 'refresh_token' in tokens:
        print(f"Refresh Token: {tokens['refresh_token'][:50]}...")
    if 'id_token' in tokens:
        print(f"ID Token: {tokens['id_token'][:50]}...")

    # Step 3: Get user info
    if 'access_token' in tokens:
        user_info = get_user_info(tokens['access_token'])

        if user_info:
            print("\n👤 User Information:")
            print("─" * 50)
            print(f"Name: {user_info.get('name', 'N/A')}")
            print(f"Email: {user_info.get('email', 'N/A')}")
            print(f"Picture: {user_info.get('picture', 'N/A')}")
            print(f"ID: {user_info.get('id', 'N/A')}")
            print(f"Verified Email: {user_info.get('verified_email', 'N/A')}")

    print("\n✨ OAuth flow complete!")

    # Optionally refresh the access token
    if 'refresh_token' in tokens:
        refresh = input("\n🔄 Test token refresh? (y/n): ").lower()
        if refresh == 'y':
            print("\nRefreshing access token using refresh token...")

            # Exchange refresh token for new access token
            refresh_params = {
                'grant_type': 'refresh_token',
                'refresh_token': tokens['refresh_token'],
                'client_id': CLIENT_ID,
                'client_secret': CLIENT_SECRET  # Required by Google
            }

            refresh_data = urllib.parse.urlencode(refresh_params).encode('utf-8')
            refresh_req = urllib.request.Request(
                TOKEN_URI,
                data=refresh_data,
                headers={'Content-Type': 'application/x-www-form-urlencoded'}
            )

            try:
                with urllib.request.urlopen(refresh_req) as response:
                    new_tokens = json.loads(response.read())
                    print("\n✅ Token refresh successful!")
                    print("─" * 50)
                    print(f"New Access Token: {new_tokens['access_token'][:50]}...")
                    print(f"Expires In: {new_tokens.get('expires_in', 'N/A')} seconds")

                    # Test the new token
                    print("\n🧪 Testing new access token...")
                    test_req = urllib.request.Request(
                        USERINFO_URI,
                        headers={'Authorization': f'Bearer {new_tokens["access_token"]}'}
                    )

                    with urllib.request.urlopen(test_req) as test_response:
                        test_user = json.loads(test_response.read())
                        print(f"✅ New token works! User: {test_user.get('email', 'N/A')}")

            except HTTPError as e:
                error_body = e.read().decode('utf-8')
                print(f"❌ Token refresh failed: {error_body}")

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n👋 Cancelled by user")
    except Exception as e:
        print(f"\n❌ Error: {e}")
