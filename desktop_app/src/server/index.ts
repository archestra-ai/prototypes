import fastify from 'fastify';
import { config } from './config/server';
import corsPlugin from './plugins/cors';
import chatRoutes from './routes/chat';

const app = fastify({
  logger: config.logger,
});

// Register plugins
await app.register(corsPlugin);

// Register routes
await app.register(chatRoutes);

const PORT = config.server.port;
const HOST = config.server.host;

// Start server on static port
try {
  await app.listen({ port: PORT, host: HOST });
  console.log(`Fastify server running on port ${PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

// Handle graceful shutdown
const gracefulShutdown = async () => {
  console.log('Shutdown signal received, closing server...');
  await app.close();
  console.log('Server closed');
  process.exit(0);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);