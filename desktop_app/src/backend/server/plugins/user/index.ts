import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import UserModel from '@backend/models/user';

const userRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/api/onboarding/status',
    {
      schema: {
        operationId: 'isOnboardingCompleted',
        description: 'Check if the onboarding process has been completed',
        tags: ['User'],
        response: {
          200: z.object({ completed: z.boolean() }),
        },
      },
    },
    async (_request, _reply) => {
      const completed = await UserModel.isOnboardingCompleted();
      return { completed };
    }
  );

  fastify.post(
    '/api/onboarding/complete',
    {
      schema: {
        operationId: 'markOnboardingCompleted',
        description: 'Mark the onboarding process as completed',
        tags: ['User'],
      },
    },
    async (_request, _reply) => {
      await UserModel.markOnboardingCompleted();
      return { success: true };
    }
  );
};

export default userRoutes;
