import { OAuthProvider } from './base.js';

export class LinkedInOAuthProvider extends OAuthProvider {
  /**
   * LinkedIn uses standard OAuth2 with refresh tokens
   * No special handling needed - base class handles it correctly
   */
}