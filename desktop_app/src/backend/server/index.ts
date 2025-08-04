import fastify from 'fastify';
import cors from 'fastify/cors';

import config from '@backend/config';
import chatRoutes from '@backend/server/plugins/chat';
import externalMcpClientRoutes from '@backend/server/plugins/externalMcpClient';
import llmRoutes from '@backend/server/plugins/llm';
import mcpRequestLogRoutes from '@backend/server/plugins/mcpRequestLog';
import mcpServerRoutes from '@backend/server/plugins/mcpServer';
import ollamaRoutes from '@backend/server/plugins/ollama';
import websocketPlugin from '@backend/server/plugins/websocket';

const app = fastify({
  logger: config.server.logger,
  // Note: prettyPrint was removed from config as it's no longer supported
  // Use pino-pretty package if pretty logging is needed in development
});

app.register(cors, {
  // Allow all origins in development
  origin: true,
  credentials: true,
  // Ensure all methods are allowed
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  // Allow common headers
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  // Expose headers that might be needed
  exposedHeaders: ['X-Total-Count'],
  // Cache preflight response for 1 hour
  maxAge: 3600,
});
app.register(websocketPlugin);
app.register(chatRoutes);
app.register(llmRoutes);
app.register(externalMcpClientRoutes);
app.register(mcpRequestLogRoutes);
app.register(mcpServerRoutes);
app.register(ollamaRoutes);

export const startServer = async () => {
  const { port, host } = config.server;

  // Start the Fastify server
  try {
    await app.listen({ port, host });
    app.log.info(`Fastify server running on port ${port}`);
  } catch (err) {
    app.log.error(err);
    // Exit with error code to signal failure to parent process
    process.exit(1);
  }

  // Handle graceful shutdown for clean process termination
  const gracefulShutdown = async () => {
    app.log.info('Shutdown signal received, closing server...');
    await app.close(); // Close all connections properly
    app.log.info('Server closed');
    process.exit(0);
  };

  // Listen for termination signals from the parent process
  process.on('SIGTERM', gracefulShutdown); // Standard termination signal
  process.on('SIGINT', gracefulShutdown); // Ctrl+C signal
};
