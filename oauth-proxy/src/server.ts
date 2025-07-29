import dotenv from 'dotenv';
import express from 'express';
import path from 'path';

import { logger } from '@/logger';
// Import v1 handlers
import v1Handlers from '@/v1/handlers';

dotenv.config();

const app = express();
const PORT_LOCALHOST = process.env.PORT || '3000';

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
app.get('/v1/auth/:service', v1Handlers.authService);
app.get('/v1/oauth-callback/:service', v1Handlers.oauthCallback);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// Start server
app.listen(PORT_LOCALHOST, () => {
  const baseUrl = process.env.REDIRECT_URL
    ? process.env.REDIRECT_URL.replace(/\/oauth-callback.*/, '')
    : `http://localhost:${PORT_LOCALHOST}`;

  logger.info('OAuth proxy server started successfully', {
    port: PORT_LOCALHOST,
    baseUrl,
    environment: process.env.NODE_ENV || 'development',
    nodeVersion: process.version,
  });

  logger.info('Service configuration', {
    healthCheckUrl: `${baseUrl}/health`,
    supportedServices: [
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
    authUrlPattern: `${baseUrl}/v1/auth/<service>`,
    callbackUrlPattern: `${baseUrl}/v1/oauth-callback/<service>`,
  });
});
