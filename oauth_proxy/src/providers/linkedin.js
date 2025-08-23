import { OAuthProvider } from './base.js';

/**
 * LinkedIn OAuth Provider
 * 
 * LinkedIn uses OAuth 2.0 with PKCE support for enhanced security.
 * Documentation: https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow
 */
export class LinkedInOAuthProvider extends OAuthProvider {
  // LinkedIn follows standard OAuth 2.0 flow, so base class implementation works
  // No need to override methods unless specific customization is required
}