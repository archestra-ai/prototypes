import { FastifyPluginAsync } from 'fastify';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { z } from 'zod/v4';

import { PODMAN_MACHINE_STATUSES } from '@archestra/types';

// Response schemas
const sandboxStatusResponseSchema = z.object({
  isInitialized: z.boolean(),
  podmanMachineStatus: z.enum(PODMAN_MACHINE_STATUSES).describe('Status of the Podman machine'),
  // mcpServersStatus: z.record(z.string(), z.object({})), // TODO: implement later
});

// Type exports
export type SandboxStatusResponse = z.infer<typeof sandboxStatusResponseSchema>;

const sandboxRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * Get sandbox status
   */
  fastify.get(
    '/api/sandbox/status',
    {
      schema: {
        operationId: 'getSandboxStatus',
        description: 'Get the current status of the sandbox environment',
        tags: ['Sandbox'],
        response: {
          200: zodToJsonSchema(sandboxStatusResponseSchema as any),
        },
      },
    },
    async (request, reply) => {
      // Lazy import to avoid initialization during OpenAPI generation
      const sandboxManager = (await import('@backend/sandbox/manager')).default;
      const status = sandboxManager.getSandboxStatus();
      return reply.send(status);
    }
  );
};

export default sandboxRoutes;