import { PodmanMachineStatusSchema } from '@archestra/schemas';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

const sandboxRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    '/api/sandbox/status',
    {
      schema: {
        operationId: 'getSandboxStatus',
        description: 'Get the current status of the sandbox environment',
        tags: ['Sandbox'],
        response: {
          200: z.object({
            isInitialized: z.boolean(),
            podmanMachineStatus: PodmanMachineStatusSchema,
            // mcpServersStatus: z.record(z.string(), z.object({})), // TODO: implement later
          }),
        },
      },
    },
    async (_request, reply) => {
      // Lazy import to avoid initialization during OpenAPI generation
      const sandboxManager = (await import('@backend/sandbox/manager')).default;
      const status = sandboxManager.getSandboxStatus();
      return reply.send(status);
    }
  );
};

export default sandboxRoutes;
