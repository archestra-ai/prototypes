import { FastifyInstance } from 'fastify';
import fastifyPlugin from 'fastify-plugin';
import { jsonSchemaTransform } from 'fastify-type-provider-zod';

async function swaggerPlugin(fastify: FastifyInstance) {
  await fastify.register(import('@fastify/swagger'), {
    openapi: {
      openapi: '3.0.0',
      info: {
        title: 'Archestra API',
        description: 'API for managing chats and messages',
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
    transform: jsonSchemaTransform,
  });
}

export default fastifyPlugin(swaggerPlugin);