#!/usr/bin/env python3

"""
Google OAuth Proxy Server (Secret Handler)
This proxy server adds the client secret to OAuth requests.
It sits between the client and Google's OAuth servers.

REQUIREMENTS:
1. Create secrets/client_secret.json with your Google OAuth credentials
2. Run this server BEFORE running google-auth-server.py
"""

import http.server
import socketserver
import json
import urllib.request
import urllib.parse
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
    ├── google-proxy-server.py
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
    TOKEN_URI = oauth_config.get('token_uri', 'https://oauth2.googleapis.com/token')
    
    print(f"✅ Loaded OAuth credentials from {SECRETS_FILE}")
    print(f"   Client ID: {CLIENT_ID[:50]}...")
    print(f"   Secret: {'*' * 10} (hidden)")
    
except Exception as e:
    print(f"❌ ERROR loading credentials: {e}")
    sys.exit(1)

# Proxy server configuration
PROXY_PORT = 8888

class ProxyHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        """Handle health check"""
        if self.path == '/health':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'status': 'healthy'}).encode())
        else:
            self.send_error(404)
    
    def do_POST(self):
        """Handle token exchange requests"""
        if self.path == '/token':
            try:
                # Read request body
                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length)
                params = json.loads(post_data.decode('utf-8'))
                
                # Add client secret to the request
                params['client_secret'] = CLIENT_SECRET
                
                # Log the request (without showing the secret)
                grant_type = params.get('grant_type', 'unknown')
                print(f"\n🔄 Proxying {grant_type} request to Google...")
                
                # Forward to Google's token endpoint
                google_data = urllib.parse.urlencode(params).encode('utf-8')
                google_req = urllib.request.Request(
                    TOKEN_URI,
                    data=google_data,
                    headers={'Content-Type': 'application/x-www-form-urlencoded'}
                )
                
                try:
                    with urllib.request.urlopen(google_req) as google_response:
                        response_data = google_response.read()
                        
                        # Forward Google's response to client
                        self.send_response(200)
                        self.send_header('Content-Type', 'application/json')
                        self.end_headers()
                        self.wfile.write(response_data)
                        
                        print(f"✅ Successfully proxied {grant_type} request")
                        
                except HTTPError as e:
                    error_body = e.read().decode('utf-8')
                    self.send_response(e.code)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(error_body.encode())
                    
                    print(f"❌ Google returned error: {e.code}")
                    error_json = json.loads(error_body)
                    print(f"   Error: {error_json.get('error', 'unknown')}")
                    print(f"   Description: {error_json.get('error_description', 'No description')}")
                    
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                error_response = json.dumps({
                    'error': 'proxy_error',
                    'error_description': str(e)
                })
                self.wfile.write(error_response.encode())
                print(f"❌ Proxy error: {e}")
        else:
            self.send_error(404)
    
    def log_message(self, format, *args):
        """Custom logging"""
        # Only log errors, not every request
        if args[1] != '200':
            print(f"[{self.log_date_time_string()}] {format % args}")

def main():
    """Start the proxy server"""
    print("""
╔════════════════════════════════════════════════════════╗
║     Google OAuth Proxy Server (Secret Handler)         ║
╠════════════════════════════════════════════════════════╣
║  Server running at: http://localhost:8888              ║
║                                                        ║
║  This proxy server:                                    ║
║  • Stores the client secret securely                   ║
║  • Adds secret to token requests                       ║
║  • Forwards requests to Google OAuth                   ║
║                                                        ║
║  Architecture:                                         ║
║  Client (no secret) → Proxy (adds secret) → Google     ║
║                                                        ║
║  Press Ctrl+C to stop                                 ║
╚════════════════════════════════════════════════════════╝
    """)
    
    with socketserver.TCPServer(("", PROXY_PORT), ProxyHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n\n✅ Proxy server stopped")

if __name__ == '__main__':
    main()