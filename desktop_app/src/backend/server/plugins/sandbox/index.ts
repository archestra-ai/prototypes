import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import McpServerSandboxManager, { ContainerStatusSchema, SandboxStatusSchema } from '@backend/sandbox/manager';

/**
 * Register our zod schemas into the global registry, such that they get output as components in the openapi spec
 * https://github.com/turkerdev/fastify-type-provider-zod?tab=readme-ov-file#how-to-create-refs-to-the-schemas
 */

z.globalRegistry.add(SandboxStatusSchema, { id: 'SandboxStatus' });
z.globalRegistry.add(ContainerStatusSchema, { id: 'McpServerContainerStatus' });

const sandboxRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    '/api/sandbox/status',
    {
      schema: {
        operationId: 'getSandboxStatus',
        description: 'Get the current status of the sandbox environment',
        tags: ['Sandbox'],
        response: {
          200: SandboxStatusSchema,
        },
      },
    },
    async (_request, reply) => {
      const status = await McpServerSandboxManager.getSandboxStatus();
      return reply.send(status);
    }
  );
};

export default sandboxRoutes;
