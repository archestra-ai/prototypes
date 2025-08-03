import { FastifyInstance } from 'fastify';
import fastifyPlugin from 'fastify-plugin';

async function swaggerPlugin(fastify: FastifyInstance) {
  await fastify.register(import('@fastify/swagger'), {
    openapi: {
      openapi: '3.0.0',
      info: {
        title: 'Archestra API',
        description: 'API for managing chats, LLM integrations, and MCP servers in Archestra',
        version: '1.0.0',
      },
      servers: [
        {
          url: 'http://localhost:3456',
          description: 'Development server',
        },
      ],
      tags: [
        {
          name: 'chat',
          description: 'Chat management operations',
        },
        {
          name: 'llm',
          description: 'LLM streaming operations',
        },
        {
          name: 'ollama',
          description: 'Ollama proxy endpoints - proxies requests to local Ollama instance',
        },
      ],
    },
    transform: ({ schema, url }) => {
      // Add descriptions to schemas if needed
      return { schema, url };
    },
  });

  await fastify.register(import('@fastify/swagger-ui'), {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false,
    },
    uiHooks: {
      onRequest: function (_request, _reply, next) {
        next();
      },
      preHandler: function (_request, _reply, next) {
        next();
      },
    },
    staticCSP: true,
    transformSpecificationClone: true,
  });
}

export default fastifyPlugin(swaggerPlugin);