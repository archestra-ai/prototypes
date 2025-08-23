import { getProvider, getAllProviders } from '../providers/index.js';

export default async function tokenRoutes(fastify) {
  // Token exchange/refresh endpoint
  fastify.post('/oauth/token', {
    schema: {
      body: {
        type: 'object',
        required: ['grant_type', 'provider'],
        properties: {
          grant_type: { 
            type: 'string',
            enum: ['authorization_code', 'refresh_token']
          },
          provider: { type: 'string' },
          
          // For authorization_code grant
          code: { 
            type: 'string',
            minLength: 1,
            maxLength: 2048, // Reasonable limit for auth codes
          },
          redirect_uri: { 
            type: 'string',
            format: 'uri',
            maxLength: 2048,
          },
          code_verifier: { 
            type: 'string',
            minLength: 43, // PKCE spec requirement
            maxLength: 128, // PKCE spec requirement
            pattern: '^[A-Za-z0-9-._~]+$', // Base64url characters only
          },
          
          // For refresh_token grant
          refresh_token: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            access_token: { type: 'string' },
            token_type: { type: 'string' },
            expires_in: { type: 'number' },
            refresh_token: { type: 'string' },
            scope: { type: 'string' },
          },
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            error_description: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { grant_type, provider, ...params } = request.body;

    // Validate provider
    const validProviders = getAllProviders();
    if (!validProviders.includes(provider.toLowerCase())) {
      return reply.code(400).send({
        error: 'invalid_request',
        error_description: `Invalid provider. Valid providers are: ${validProviders.join(', ')}`,
      });
    }

    try {
      // Get the provider instance
      const oauthProvider = getProvider(provider);

      let response;
      
      // Handle different grant types
      switch (grant_type) {
        case 'authorization_code':
          if (!params.code) {
            return reply.code(400).send({
              error: 'invalid_request',
              error_description: 'Missing required parameter: code',
            });
          }
          
          response = await oauthProvider.exchangeCode(params);
          break;

        case 'refresh_token':
          if (!params.refresh_token) {
            return reply.code(400).send({
              error: 'invalid_request',
              error_description: 'Missing required parameter: refresh_token',
            });
          }
          
          response = await oauthProvider.refreshToken(params);
          break;

        default:
          return reply.code(400).send({
            error: 'unsupported_grant_type',
            error_description: `Grant type '${grant_type}' is not supported`,
          });
      }

      // Return the token response
      return reply.send(response);
      
    } catch (error) {
      fastify.log.error(error);
      
      // Handle provider errors
      if (error.statusCode) {
        return reply.code(error.statusCode || 400).send({
          error: error.error || 'invalid_request',
          error_description: error.error_description || 'Token exchange failed',
        });
      }
      
      // Handle other errors
      return reply.code(400).send({
        error: 'invalid_request',
        error_description: 'Token exchange failed',
      });
    }
  });

  // Token revocation endpoint
  fastify.post('/oauth/revoke', {
    schema: {
      body: {
        type: 'object',
        required: ['token', 'provider'],
        properties: {
          token: { type: 'string' },
          provider: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { token, provider } = request.body;

    try {
      const oauthProvider = getProvider(provider);
      await oauthProvider.revokeToken({ token });
      
      return reply.send({ success: true });
      
    } catch (error) {
      fastify.log.error(error);
      
      return reply.code(400).send({
        error: 'invalid_request',
        error_description: error.message,
      });
    }
  });

  // Health check
  fastify.get('/health', async (request, reply) => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  });
}