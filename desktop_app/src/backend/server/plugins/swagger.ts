import { FastifyInstance } from 'fastify';
import fastifyPlugin from 'fastify-plugin';

async function swaggerPlugin(fastify: FastifyInstance) {
  await fastify.register(import('@fastify/swagger'), {
    mode: 'dynamic',
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
      ],
    },
  });
}

export default fastifyPlugin(swaggerPlugin);