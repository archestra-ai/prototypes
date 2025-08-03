import FastifyHttpProxy from '@fastify/http-proxy';
import { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';

// Default Ollama port - can be overridden by environment variable
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';

const ollamaRoutes: FastifyPluginAsync<FastifyPluginOptions, any, ZodTypeProvider> = async (fastify) => {
  // Register proxy for all Ollama API routes - no OpenAPI documentation needed
  await fastify.register(FastifyHttpProxy, {
    upstream: OLLAMA_HOST,
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
            details: error.message 
          });
      },
    },
  });

  // Log proxy registration
  fastify.log.info(`Ollama proxy registered: /llm/ollama/* -> ${OLLAMA_HOST}/*`);
};

export default ollamaRoutes;