import { OAuthProvider } from './base.js';

export class MicrosoftOAuthProvider extends OAuthProvider {
  constructor(config) {
    super(config);
    
    // Microsoft has additional tenant parameter in endpoints
    this.tenant = config.tenant || 'common';
    this.tokenEndpoint = `https://login.microsoftonline.com/${this.tenant}/oauth2/v2.0/token`;
    this.revokeEndpoint = null; // Microsoft doesn't support token revocation via API
  }

  /**
   * Microsoft requires client_id and client_secret in the POST body
   * Base class already handles this correctly
   */
  prepareTokenRequest(baseParams, originalParams) {
    // Microsoft expects standard OAuth 2.0 parameters
    // The base class already includes client_id, client_secret, code, etc.
    return baseParams;
  }

  /**
   * Prepare refresh token request
   * Microsoft uses standard OAuth 2.0 refresh flow
   */
  prepareRefreshRequest(baseParams, originalParams) {
    return baseParams;
  }

  /**
   * Override revoke method since Microsoft doesn't support token revocation
   */
  async revokeToken(params) {
    // Microsoft doesn't provide a revoke endpoint
    // Tokens expire naturally or can be revoked through Azure AD portal
    throw new Error('Microsoft does not support programmatic token revocation. Tokens can be managed in Azure AD portal.');
  }
}