import express from 'express';
import path from 'path';

import { BASE_URL, GOOGLE_REDIRECT_URL, NODE_ENV, PORT } from '@/consts';
import { logger } from '@/logger';
import v1Handlers from '@/v1/handlers';

const app = express();

app.use(express.json());
app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.url}`, {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  next();
});

// Routes
app.get('/', v1Handlers.getIndex);

// V1 API routes
app.get('/v1/auth/:provider', v1Handlers.authProvider);
app.get('/v1/oauth-callback/:provider', v1Handlers.oauthCallback);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// Start server
app.listen(PORT, () => {
  logger.info('OAuth proxy server started successfully', {
    port: PORT,
    baseUrl: BASE_URL,
    googleRedirectUrl: GOOGLE_REDIRECT_URL,
    environment: NODE_ENV,
    nodeVersion: process.version,
  });

  logger.info('Provider configuration', {
    healthCheckUrl: `${BASE_URL}/health`,
    supportedMcpCatalogConnectorId: [
      'gmail',
      'google-drive',
      'google-calendar',
      'google-docs',
      'google-sheets',
      'google-slides',
      'google-forms',
      'google-tasks',
      'google-chat',
    ],
    authUrlPattern: `${BASE_URL}/v1/auth/<provider>`,
    callbackUrlPattern: `${BASE_URL}/v1/oauth-callback/<provider>`,
  });
});
