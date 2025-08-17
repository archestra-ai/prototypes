import FastifyHttpProxy from '@fastify/http-proxy';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import config from '@backend/config';

const {
  ollama: {
    server: { host: ollamaServerHost },
  },
} = config;

const ollamaProxyRoutes: FastifyPluginAsyncZod = async (fastify) => {
  // Register proxy for all Ollama API routes
  fastify.register(FastifyHttpProxy, {
    upstream: ollamaServerHost,
    prefix: '/llm/ollama', // All requests to /llm/ollama/* will be proxied
    rewritePrefix: '', // Remove the /llm/ollama prefix when forwarding
    websocket: false, // Disable WebSocket to avoid conflicts with existing WebSocket plugin
    http2: false,
    // Reply options
    replyOptions: {
      // Handle errors gracefully
      onError: (reply, error) => {
        fastify.log.error({ err: error }, 'Ollama proxy error');
        // Set CORS headers on error responses too
        reply
          .header('Access-Control-Allow-Origin', '*')
          .header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
          .header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
          .code(502)
          .send({
            error: 'Bad Gateway',
            message: 'Failed to connect to Ollama server',
            details: error.error.message,
          });
      },
    },
    httpMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'],
  });

  // Log proxy registration
  fastify.log.info(`Ollama proxy registered: /llm/ollama/* -> ${ollamaServerHost}/*`);
};

export default ollamaProxyRoutes;
