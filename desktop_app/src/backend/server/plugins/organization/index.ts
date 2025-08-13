import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import OrganizationModel from '@backend/models/organization';

const organizationRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/api/onboarding/status',
    {
      schema: {
        operationId: 'isOnboardingCompleted',
        description: 'Check if the onboarding process has been completed',
        tags: ['Organization'],
        response: {
          200: z.object({ completed: z.boolean() }),
        },
      },
    },
    async (_request, _reply) => {
      const completed = await OrganizationModel.isOnboardingCompleted();
      return { completed };
    }
  );

  fastify.post(
    '/api/onboarding/complete',
    {
      schema: {
        operationId: 'markOnboardingCompleted',
        description: 'Mark the onboarding process as completed',
        tags: ['Organization'],
      },
    },
    async (_request, _reply) => {
      await OrganizationModel.markOnboardingCompleted();
      return { success: true };
    }
  );
};

export default organizationRoutes;
