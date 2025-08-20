#!/usr/bin/env python3

"""
Google OAuth Client (No Secret)
This server handles the OAuth flow WITHOUT storing any secrets.
It communicates with the proxy server which adds the client secret.
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
from urllib.error import HTTPError

# OAuth Configuration (NO SECRET HERE)
CLIENT_ID = '354887056155-otc8l2ocrr0a7qnkbnt8u19bfh0rqudj.apps.googleusercontent.com'
AUTH_URI = 'https://accounts.google.com/o/oauth2/v2/auth'
PROXY_SERVER = 'http://localhost:8888'  # Our proxy server that has the secret
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
    """Exchange authorization code for tokens via proxy server"""
    print("\n🔄 Exchanging code for tokens (via proxy server)...")
    
    # Send request to proxy server (NO CLIENT SECRET HERE)
    params = {
        'grant_type': 'authorization_code',
        'code': auth_code,
        'redirect_uri': REDIRECT_URI,
        'client_id': CLIENT_ID,
        'code_verifier': code_verifier
    }
    
    data = json.dumps(params).encode('utf-8')
    req = urllib.request.Request(
        f'{PROXY_SERVER}/token',
        data=data,
        headers={'Content-Type': 'application/json'}
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

def refresh_token(refresh_token_value):
    """Refresh access token via proxy server"""
    print("\n🔄 Refreshing access token (via proxy server)...")
    
    # Send request to proxy server (NO CLIENT SECRET HERE)
    params = {
        'grant_type': 'refresh_token',
        'refresh_token': refresh_token_value,
        'client_id': CLIENT_ID
    }
    
    data = json.dumps(params).encode('utf-8')
    req = urllib.request.Request(
        f'{PROXY_SERVER}/token',
        data=data,
        headers={'Content-Type': 'application/json'}
    )
    
    try:
        with urllib.request.urlopen(req) as response:
            tokens = json.loads(response.read())
            print("✅ New access token received!")
            return tokens
    except HTTPError as e:
        error_body = e.read().decode('utf-8')
        print(f"❌ Token refresh failed: {error_body}")
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

def check_proxy_server():
    """Check if proxy server is running"""
    try:
        req = urllib.request.Request(f'{PROXY_SERVER}/health')
        with urllib.request.urlopen(req, timeout=2) as response:
            return response.status == 200
    except:
        return False

def main():
    """Main flow"""
    print("""
╔════════════════════════════════════════════════════════╗
║     Google OAuth Client (No Secret Stored)             ║
╠════════════════════════════════════════════════════════╣
║  Architecture:                                         ║
║  • This client has NO client secret                    ║
║  • Proxy server handles secret injection               ║
║  • Complete OAuth flow with PKCE                       ║
║                                                        ║
║  Flow: Client → Proxy Server → Google                  ║
╚════════════════════════════════════════════════════════╝
    """)
    
    # Check if proxy server is running
    if not check_proxy_server():
        print(f"""
❌ Proxy server is not running!

Please start the proxy server first:
  python3 google-proxy-server.py

The proxy server handles the client secret securely.
        """)
        return
    
    print("✅ Proxy server is running\n")
    
    # Step 1: Start auth flow
    auth_code, code_verifier = start_auth_flow()
    
    if not auth_code:
        return
    
    # Step 2: Exchange code for tokens (via proxy)
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
            new_tokens = refresh_token(tokens['refresh_token'])
            
            if new_tokens:
                print("─" * 50)
                print(f"New Access Token: {new_tokens['access_token'][:50]}...")
                print(f"Expires In: {new_tokens.get('expires_in', 'N/A')} seconds")
                
                # Test the new token
                print("\n🧪 Testing new access token...")
                test_req = urllib.request.Request(
                    USERINFO_URI,
                    headers={'Authorization': f'Bearer {new_tokens["access_token"]}'}
                )
                
                try:
                    with urllib.request.urlopen(test_req) as test_response:
                        test_user = json.loads(test_response.read())
                        print(f"✅ New token works! User: {test_user.get('email', 'N/A')}")
                except:
                    print("❌ Failed to verify new token")

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n👋 Cancelled by user")
    except Exception as e:
        print(f"\n❌ Error: {e}")