/**
 * Provider Discovery Route
 * 
 * This endpoint allows the desktop app to discover which OAuth providers
 * are configured and available in the proxy.
 */

import { getAllProviders } from '../providers/index.js';

/**
 * Provider metadata registry
 * Add metadata for each provider here
 */
const providerMetadata = {
  google: {
    name: 'google',
    displayName: 'Google',
    documentationUrl: 'https://developers.google.com/identity/protocols/oauth2',
    supportsRefresh: true,
    tokenExpiry: 3600,
    supportsPKCE: true,
    supportsState: true,
    endpoints: {
      authorization: 'https://accounts.google.com/o/oauth2/v2/auth',
      token: 'https://oauth2.googleapis.com/token',
      revoke: 'https://oauth2.googleapis.com/revoke',
    },
    defaultScopes: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.modify',
    ],
    notes: 'Supports both service account and user authentication flows',
  },
  
  slack: {
    name: 'slack',
    displayName: 'Slack',
    documentationUrl: 'https://api.slack.com/authentication/oauth-v2',
    supportsRefresh: false,
    tokenExpiry: null, // Tokens don't expire
    supportsPKCE: true,
    supportsState: true,
    endpoints: {
      authorization: 'https://slack.com/oauth/v2/authorize',
      token: 'https://slack.com/api/oauth.v2.access',
      revoke: 'https://slack.com/api/auth.revoke',
    },
    defaultScopes: [
      'channels:read',
      'chat:write',
      'users:read',
    ],
    notes: 'Tokens do not expire. Returns user tokens in nested structure.',
  },

  msteams: {
    name: 'msteams',
    displayName: 'Microsoft Teams',
    documentationUrl: 'https://learn.microsoft.com/en-us/graph/auth-v2-user',
    supportsRefresh: true,
    tokenExpiry: 3600,
    supportsPKCE: true,
    supportsState: true,
    endpoints: {
      authorization: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
      token: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      revoke: null, // Azure AD doesn't support token revocation via API
    },
    defaultScopes: [
      'offline_access',
      'User.Read',
      'ChannelMessage.Send',
      'Chat.Create',
      'Chat.ReadWrite',
      'Team.ReadBasic.All',
      'TeamMember.Read.All',
    ],
    notes: 'Uses Azure AD v2.0 endpoint. Requires Azure app registration. Supports tenant-specific endpoints via MSTEAMS_TENANT_ID.',
  },
};

export default async function providersRoute(fastify, opts) {
  /**
   * GET /oauth/providers
   * 
   * Returns list of configured OAuth providers with their metadata
   */
  fastify.get('/oauth/providers', async (request, reply) => {
    try {
      const configuredProviders = getAllProviders();
      
      // Build response with metadata for configured providers
      const providers = configuredProviders.map(name => {
        const metadata = providerMetadata[name] || {
          name,
          displayName: name.charAt(0).toUpperCase() + name.slice(1),
          notes: 'No metadata available',
        };
        
        return {
          ...metadata,
          configured: true,
        };
      });
      
      // Add unconfigured providers for reference
      const unconfiguredProviders = Object.keys(providerMetadata)
        .filter(name => !configuredProviders.includes(name))
        .map(name => ({
          ...providerMetadata[name],
          configured: false,
          notes: 'Provider not configured. Add credentials to .env file.',
        }));
      
      return {
        configured: providers,
        available: unconfiguredProviders,
        total: providers.length,
      };
    } catch (error) {
      fastify.log.error('Failed to get providers:', error);
      reply.code(500).send({
        error: 'Failed to retrieve provider list',
      });
    }
  });
  
  /**
   * GET /oauth/providers/:name
   * 
   * Returns detailed information about a specific provider
   */
  fastify.get('/oauth/providers/:name', async (request, reply) => {
    const { name } = request.params;
    
    try {
      const configuredProviders = getAllProviders();
      const metadata = providerMetadata[name.toLowerCase()];
      
      if (!metadata) {
        return reply.code(404).send({
          error: 'Provider not found',
          message: `Provider '${name}' is not recognized`,
        });
      }
      
      const isConfigured = configuredProviders.includes(name.toLowerCase());
      
      return {
        ...metadata,
        configured: isConfigured,
        status: isConfigured ? 'ready' : 'not_configured',
      };
    } catch (error) {
      fastify.log.error(`Failed to get provider ${name}:`, error);
      reply.code(500).send({
        error: 'Failed to retrieve provider information',
      });
    }
  });
  
  /**
   * GET /oauth/providers/:name/status
   * 
   * Quick check if a provider is configured and ready
   */
  fastify.get('/oauth/providers/:name/status', async (request, reply) => {
    const { name } = request.params;
    
    try {
      const configuredProviders = getAllProviders();
      const isConfigured = configuredProviders.includes(name.toLowerCase());
      
      return {
        provider: name,
        configured: isConfigured,
        status: isConfigured ? 'ready' : 'not_configured',
      };
    } catch (error) {
      fastify.log.error(`Failed to check provider ${name} status:`, error);
      reply.code(500).send({
        error: 'Failed to check provider status',
      });
    }
  });
}