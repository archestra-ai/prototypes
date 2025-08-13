import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { SelectUserSchema } from '@backend/database/schema/user';
import UserModel from '@backend/models/user';

const userRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/api/user',
    {
      schema: {
        operationId: 'getUser',
        description: 'Get the current user',
        tags: ['User'],
        response: {
          200: SelectUserSchema,
        },
      },
    },
    async (_request, _reply) => {
      const user = await UserModel.getUser();
      return user;
    }
  );

  fastify.patch(
    '/api/user',
    {
      schema: {
        operationId: 'updateUser',
        description: 'Update user settings',
        tags: ['User'],
        body: z.object({
          hasCompletedOnboarding: z.number().min(0).max(1).optional(),
          collectTelemetryData: z.number().min(0).max(1).optional(),
        }),
        response: {
          200: SelectUserSchema,
        },
      },
    },
    async (request, _reply) => {
      const updates = request.body as {
        hasCompletedOnboarding?: number;
        collectTelemetryData?: number;
      };
      const user = await UserModel.updateUser(updates);
      return user;
    }
  );
};

export default userRoutes;
