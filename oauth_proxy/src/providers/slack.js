import { OAuthProvider } from './base.js';

export class SlackOAuthProvider extends OAuthProvider {
  /**
   * Slack doesn't use standard OAuth2 refresh tokens
   * Access tokens don't expire unless explicitly revoked
   */
  async refreshToken(params) {
    throw new Error('Slack tokens do not expire and cannot be refreshed');
  }
  
  /**
   * Slack uses a slightly different response format
   * Override if we need to normalize the response
   */
  async exchangeCode(params) {
    const response = await super.exchangeCode(params);
    
    // Slack returns tokens in a different structure
    if (response.authed_user?.access_token) {
      return {
        access_token: response.authed_user.access_token,
        token_type: 'Bearer',
        scope: response.authed_user.scope,
        team: response.team,
        authed_user: response.authed_user,
      };
    }
    
    return response;
  }
}