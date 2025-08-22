/**
 * OAuth Provider Template
 * 
 * This is a template for creating new OAuth providers.
 * Copy this file and rename it to yourprovider.js, then customize as needed.
 * 
 * Most providers work with the base implementation, but you can override
 * methods for special cases.
 */

import { OAuthProvider } from './base.js';

/**
 * Template OAuth Provider
 * 
 * Replace "Template" with your provider name (e.g., "GitHub", "GitLab", etc.)
 */
export class TemplateOAuthProvider extends OAuthProvider {
  /**
   * Most providers work with the base implementation.
   * Only override methods if your provider needs special handling.
   */
  
  /**
   * Override this method if your provider returns tokens in a non-standard format.
   * 
   * @param {Object} params - Request parameters including code, redirect_uri, code_verifier
   * @returns {Promise<Object>} Standard OAuth token response
   * 
   * @example
   * async exchangeCode(params) {
   *   const response = await super.exchangeCode(params);
   *   
   *   // Transform non-standard response
   *   if (response.custom_format) {
   *     return {
   *       access_token: response.custom_format.token,
   *       refresh_token: response.custom_format.refresh,
   *       expires_in: response.custom_format.ttl,
   *       token_type: 'Bearer',
   *       scope: response.custom_format.permissions,
   *     };
   *   }
   *   
   *   return response;
   * }
   */
  
  /**
   * Override this method if your provider doesn't support refresh tokens.
   * 
   * @example
   * async refreshToken(params) {
   *   throw new Error('Template provider tokens do not expire and cannot be refreshed');
   * }
   */
  
  /**
   * Override this method to add provider-specific parameters to token requests.
   * 
   * @param {Object} baseParams - Standard OAuth parameters
   * @param {Object} originalParams - Original request parameters
   * @returns {Object} Modified parameters for token request
   * 
   * @example
   * prepareTokenRequest(baseParams, originalParams) {
   *   // Add provider-specific parameter
   *   baseParams.custom_param = 'custom_value';
   *   return baseParams;
   * }
   */
  
  /**
   * Override this method to add provider-specific parameters to refresh requests.
   * 
   * @param {Object} baseParams - Standard refresh parameters
   * @param {Object} originalParams - Original request parameters
   * @returns {Object} Modified parameters for refresh request
   * 
   * @example
   * prepareRefreshRequest(baseParams, originalParams) {
   *   // Add provider-specific parameter
   *   baseParams.custom_refresh_param = 'value';
   *   return baseParams;
   * }
   */
  
  /**
   * Add any custom methods your provider needs.
   * 
   * @example
   * async validateToken(token) {
   *   // Custom token validation logic
   *   const response = await this.makeRequest(this.validationEndpoint, { token });
   *   return response.valid;
   * }
   */
}

/**
 * Provider Metadata
 * 
 * Export metadata about your provider for discovery and documentation.
 * This helps the desktop app understand provider capabilities.
 */
export const metadata = {
  name: 'template',
  displayName: 'Template Provider',
  documentationUrl: 'https://provider.com/docs/oauth',
  
  // Token characteristics
  supportsRefresh: true,
  tokenExpiry: 3600, // seconds, or null if tokens don't expire
  
  // OAuth flow support
  supportsPKCE: true,
  supportsState: true,
  
  // Required configuration
  requiredEnvVars: [
    'TEMPLATE_CLIENT_ID',
    'TEMPLATE_CLIENT_SECRET',
  ],
  
  // Endpoints (these are typically set in config/index.js)
  endpoints: {
    authorization: 'https://provider.com/oauth/authorize',
    token: 'https://provider.com/oauth/token',
    revoke: 'https://provider.com/oauth/revoke', // optional
  },
  
  // Default scopes (can be overridden by desktop app)
  defaultScopes: ['read', 'write'],
  
  // Notes for developers
  notes: 'Any special considerations or quirks about this provider',
};