import cors from '@fastify/cors';
import fastify from 'fastify';
import { streamableHttp } from 'fastify-mcp';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';

import config from '@backend/config';
import chatRoutes from '@backend/server/plugins/chat';
import cloudProviderRoutes from '@backend/server/plugins/cloudProviders';
import externalMcpClientRoutes from '@backend/server/plugins/externalMcpClient';
import llmRoutes from '@backend/server/plugins/llm';
import ollamaLLMRoutes from '@backend/server/plugins/llm/ollama';
import { createArchestraMcpServer } from '@backend/server/plugins/mcp';
import mcpRequestLogRoutes from '@backend/server/plugins/mcpRequestLog';
import mcpServerRoutes from '@backend/server/plugins/mcpServer';
import ollamaRoutes from '@backend/server/plugins/ollama';
import sandboxRoutes from '@backend/server/plugins/sandbox';

const app = fastify({
  logger: {
    level: 'info',
    serializers: {
      req: (req) => ({ method: req.method, url: req.url }),
      res: (res) => ({ statusCode: res.statusCode }),
    },
  },
});

/**
 * Add schema validator and serializer
 * https://github.com/turkerdev/fastify-type-provider-zod?tab=readme-ov-file#how-to-use
 */
app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

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
app.register(chatRoutes);
app.register(cloudProviderRoutes);
app.register(llmRoutes);
app.register(ollamaLLMRoutes);
app.register(externalMcpClientRoutes);
app.register(mcpRequestLogRoutes);
app.register(mcpServerRoutes);
app.register(ollamaRoutes);
app.register(sandboxRoutes);

app.register(streamableHttp, {
  // Set to `true` if you want a stateful server
  stateful: false,
  mcpEndpoint: '/mcp',
  // sessions: new Sessions<StreamableHTTPServerTransport>()
  createServer: createArchestraMcpServer,
});

export const startServer = async () => {
  const { http } = config.server;

  // Start the Fastify server
  try {
    await app.listen({ port: http.port, host: http.host });
    app.log.info(`Fastify server running on port ${http.port}`);
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
