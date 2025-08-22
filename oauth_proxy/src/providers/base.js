import https from 'https';
import { URL, URLSearchParams } from 'url';

export class OAuthProvider {
  constructor(config) {
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.tokenEndpoint = config.tokenEndpoint;
    this.revokeEndpoint = config.revokeEndpoint;
  }

  /**
   * Make HTTPS request to OAuth provider
   */
  async makeRequest(endpoint, params) {
    const url = new URL(endpoint);
    const data = new URLSearchParams(params).toString();

    return new Promise((resolve, reject) => {
      const options = {
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(data),
        },
      };

      const req = https.request(options, (res) => {
        let body = '';
        
        res.on('data', (chunk) => {
          body += chunk;
        });
        
        res.on('end', () => {
          try {
            const response = JSON.parse(body);
            
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(response);
            } else {
              reject({
                statusCode: res.statusCode,
                error: response.error || 'Request failed',
                error_description: response.error_description,
              });
            }
          } catch (error) {
            reject({
              statusCode: res.statusCode,
              error: 'Invalid JSON response',
              body,
            });
          }
        });
      });

      req.on('error', (error) => {
        reject({
          error: 'Network error',
          message: error.message,
        });
      });

      req.write(data);
      req.end();
    });
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCode(params) {
    const requestParams = {
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: 'authorization_code',
      code: params.code,
      redirect_uri: params.redirect_uri,
    };

    // Add PKCE verifier if provided
    if (params.code_verifier) {
      requestParams.code_verifier = params.code_verifier;
    }

    // Add any additional provider-specific params
    const finalParams = this.prepareTokenRequest(requestParams, params);
    
    return this.makeRequest(this.tokenEndpoint, finalParams);
  }

  /**
   * Refresh access token
   */
  async refreshToken(params) {
    const requestParams = {
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: params.refresh_token,
    };

    // Add any additional provider-specific params
    const finalParams = this.prepareRefreshRequest(requestParams, params);
    
    return this.makeRequest(this.tokenEndpoint, finalParams);
  }

  /**
   * Revoke token
   */
  async revokeToken(params) {
    if (!this.revokeEndpoint) {
      throw new Error('Token revocation not supported for this provider');
    }

    const requestParams = {
      client_id: this.clientId,
      client_secret: this.clientSecret,
      token: params.token,
    };

    return this.makeRequest(this.revokeEndpoint, requestParams);
  }

  /**
   * Override in subclasses to add provider-specific parameters for token exchange
   */
  prepareTokenRequest(baseParams, originalParams) {
    return baseParams;
  }

  /**
   * Override in subclasses to add provider-specific parameters for token refresh
   */
  prepareRefreshRequest(baseParams, originalParams) {
    return baseParams;
  }
}