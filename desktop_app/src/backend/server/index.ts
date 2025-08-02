import fastify from 'fastify';

import { config } from './config/server';
import corsPlugin from './plugins/cors';
import chatRoutes from './routes/chat';

/**
 * Main server initialization function
 *
 * IMPORTANT: Everything is wrapped in an async function to avoid top-level await.
 * Top-level await is not supported in CommonJS modules, which is what Vite
 * builds for the server target. This caused the server-process.js build to fail.
 */
async function startServer() {
  const app = fastify({
    logger: config.logger,
    // Note: prettyPrint was removed from config as it's no longer supported
    // Use pino-pretty package if pretty logging is needed in development
  });

  // Register CORS plugin to allow requests from the Electron renderer
  await app.register(corsPlugin);

  // Register all chat-related routes under /api/chat
  await app.register(chatRoutes);

  const PORT = config.server.port; // Default: 3456
  const HOST = config.server.host; // Default: 127.0.0.1

  // Start the Fastify server
  try {
    await app.listen({ port: PORT, host: HOST });
    console.log(`Fastify server running on port ${PORT}`);
  } catch (err) {
    app.log.error(err);
    // Exit with error code to signal failure to parent process
    process.exit(1);
  }

  // Handle graceful shutdown for clean process termination
  const gracefulShutdown = async () => {
    console.log('Shutdown signal received, closing server...');
    await app.close(); // Close all connections properly
    console.log('Server closed');
    process.exit(0);
  };

  // Listen for termination signals from the parent process
  process.on('SIGTERM', gracefulShutdown); // Standard termination signal
  process.on('SIGINT', gracefulShutdown); // Ctrl+C signal
}

// Start the server and handle any initialization errors
startServer().catch((err) => {
  console.error('Failed to start server:', err);
  // Exit with error code to signal failure to parent process
  process.exit(1);
});
