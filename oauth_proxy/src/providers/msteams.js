import { OAuthProvider } from './base.js';

/**
 * Microsoft Teams OAuth Provider
 * Uses Azure AD v2.0 endpoints for authentication
 */
export class MSTeamsOAuthProvider extends OAuthProvider {
  /**
   * MS Teams uses standard OAuth flow with Azure AD
   * The base provider implementation should work fine,
   * but we'll add specific handling if needed in the future
   */
  
  /**
   * Override token request to add Azure AD specific parameters if needed
   */
  prepareTokenRequest(baseParams, originalParams) {
    // Azure AD v2.0 supports standard OAuth parameters
    // Add any MS Teams specific parameters here if needed
    return baseParams;
  }

  /**
   * Override refresh request to add Azure AD specific parameters if needed
   */
  prepareRefreshRequest(baseParams, originalParams) {
    // Azure AD v2.0 supports standard refresh token flow
    return baseParams;
  }

  /**
   * Override error handling to provide MS Teams specific guidance
   */
  async makeRequest(endpoint, params) {
    try {
      return await super.makeRequest(endpoint, params);
    } catch (error) {
      // Enhance error messages with MS Teams specific guidance
      if (error.error === 'invalid_client') {
        error.error_description = (error.error_description || '') + 
          ' Please verify your Azure AD app registration and client credentials.';
      } else if (error.error === 'invalid_grant') {
        error.error_description = (error.error_description || '') + 
          ' The authorization code or refresh token may have expired. Please re-authenticate.';
      } else if (error.error === 'unauthorized_client') {
        error.error_description = (error.error_description || '') + 
          ' Ensure your Azure AD app has the required permissions and admin consent if needed.';
      } else if (error.error === 'invalid_scope') {
        error.error_description = (error.error_description || '') + 
          ' One or more requested Microsoft Graph scopes are invalid or require admin consent.';
      }
      throw error;
    }
  }
}