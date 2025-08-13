import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import OnboardingModel from '@backend/models/onboarding';

const onboardingRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/api/onboarding/status',
    {
      schema: {
        operationId: 'isOnboardingCompleted',
        description: 'Check if the onboarding process has been completed',
        tags: ['Onboarding'],
        response: {
          200: z.object({ completed: z.boolean() }),
        },
      },
    },
    async (_request, _reply) => {
      const completed = await OnboardingModel.isOnboardingCompleted();
      return { completed };
    }
  );

  fastify.post(
    '/api/onboarding/complete',
    {
      schema: {
        operationId: 'markOnboardingCompleted',
        description: 'Mark the onboarding process as completed',
        tags: ['Onboarding'],
      },
    },
    async (_request, _reply) => {
      await OnboardingModel.markOnboardingCompleted();
      return { success: true };
    }
  );
};

export default onboardingRoutes;
