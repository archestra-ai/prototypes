import { OAuthProvider } from './base.js';

/**
 * LinkedIn OAuth Provider
 * 
 * Implements OAuth 2.0 flow for LinkedIn authentication.
 * LinkedIn follows standard OAuth2 with refresh tokens.
 * 
 * Required environment variables:
 * - LINKEDIN_CLIENT_ID: Your LinkedIn app client ID
 * - LINKEDIN_CLIENT_SECRET: Your LinkedIn app client secret
 * 
 * Token endpoint: https://www.linkedin.com/oauth/v2/accessToken
 * Revoke endpoint: https://www.linkedin.com/oauth/v2/revoke
 * 
 * @see https://learn.microsoft.com/en-us/linkedin/shared/authentication/authentication
 */
export class LinkedInOAuthProvider extends OAuthProvider {
  /**
   * LinkedIn uses standard OAuth2 with refresh tokens.
   * The base class implementation handles the standard flow correctly,
   * so no customization is needed for token exchange or refresh.
   */
}