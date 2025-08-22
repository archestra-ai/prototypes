import Fastify from 'fastify';
import cors from '@fastify/cors';
import formbody from '@fastify/formbody';
import { config } from './config/index.js';
import { initializeProviders, getAllProviders } from './providers/index.js';
import tokenRoutes from './routes/token.js';
import callbackRoutes from './routes/callback.js';
import providersRoute from './routes/providers.js';

export async function buildApp(httpsOptions = null) {
  // Initialize providers
  initializeProviders();

  // Create Fastify instance with HTTPS if provided
  const app = Fastify({
    https: httpsOptions,
    logger: process.env.NODE_ENV !== 'production' ? {
      level: process.env.LOG_LEVEL || 'info',
    } : false,
  });

  // Register plugins
  await app.register(cors, config.cors);
  await app.register(formbody);

  // Register routes
  await app.register(tokenRoutes);
  await app.register(callbackRoutes);
  await app.register(providersRoute);

  // Root endpoint - API documentation
  app.get('/', async (request, reply) => {
    const providers = getAllProviders();
    
    return {
      name: 'OAuth Proxy Server',
      version: '2.0.0',
      description: 'Secure OAuth proxy for PKCE-based token exchange',
      endpoints: {
        'GET /oauth/providers': 'List all configured and available providers',
        'GET /oauth/providers/:name': 'Get detailed information about a provider',
        'GET /oauth/providers/:name/status': 'Check if a provider is configured',
        'POST /oauth/token': {
          description: 'Exchange authorization code or refresh token',
          parameters: {
            grant_type: 'authorization_code | refresh_token',
            provider: providers.join(' | '),
            code: 'Authorization code (for authorization_code grant)',
            code_verifier: 'PKCE code verifier (optional)',
            redirect_uri: 'Redirect URI used in authorization',
            refresh_token: 'Refresh token (for refresh_token grant)',
          },
        },
        'POST /oauth/revoke': {
          description: 'Revoke an access or refresh token',
          parameters: {
            token: 'Token to revoke',
            provider: providers.join(' | '),
          },
        },
        'GET /health': 'Health check endpoint',
      },
      configured_providers: providers,
    };
  });

  return app;
}