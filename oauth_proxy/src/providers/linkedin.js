import { OAuthProvider } from './base.js';

/**
 * LinkedIn OAuth Provider
 * 
 * LinkedIn uses OAuth 2.0 with PKCE support for enhanced security.
 * Documentation: https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow
 * 
 * Security features:
 * - PKCE (Proof Key for Code Exchange) for enhanced security
 * - State parameter for CSRF protection (handled by base class)
 * - HTTPS-only endpoints
 * - Access tokens expire after 60 days
 * - Refresh tokens available with offline_access scope
 */
export class LinkedInOAuthProvider extends OAuthProvider {
  // LinkedIn follows standard OAuth 2.0 flow, so base class implementation works
  // No need to override methods unless specific customization is required
}