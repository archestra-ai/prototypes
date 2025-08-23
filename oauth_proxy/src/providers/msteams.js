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
}