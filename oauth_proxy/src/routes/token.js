import { getProvider } from '../providers/index.js';

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
          code: { type: 'string' },
          redirect_uri: { type: 'string' },
          code_verifier: { type: 'string' },
          
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
          error_description: error.error_description || error.message,
        });
      }
      
      // Handle other errors
      return reply.code(400).send({
        error: 'invalid_request',
        error_description: error.message,
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