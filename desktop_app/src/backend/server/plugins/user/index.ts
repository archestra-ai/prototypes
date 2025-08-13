import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import UserModel, { PatchUserSchema, SelectUserSchema as UserSchema } from '@backend/models/user';

/**
 * Register our zod schemas into the global registry, such that they get output as components in the openapi spec
 * https://github.com/turkerdev/fastify-type-provider-zod?tab=readme-ov-file#how-to-create-refs-to-the-schemas
 */
z.globalRegistry.add(UserSchema, { id: 'User' });

const userRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/api/user',
    {
      schema: {
        operationId: 'getUser',
        description: 'Get the current user',
        tags: ['User'],
        response: {
          200: UserSchema,
        },
      },
    },
    async (_request, _reply) => {
      return await UserModel.getUser();
    }
  );

  fastify.patch(
    '/api/user',
    {
      schema: {
        operationId: 'updateUser',
        description: 'Update user settings',
        tags: ['User'],
        body: PatchUserSchema,
        response: {
          200: UserSchema,
        },
      },
    },
    async ({ body }, _reply) => {
      return await UserModel.patchUser(body);
    }
  );

  // Backward compatibility endpoints
  fastify.get(
    '/api/onboarding/status',
    {
      schema: {
        operationId: 'getOnboardingStatus',
        description: 'Get onboarding status (backward compatibility)',
        tags: ['Onboarding'],
        response: {
          200: z.object({
            hasCompletedOnboarding: z.boolean(),
          }),
        },
      },
    },
    async (_request, _reply) => {
      const user = await UserModel.getUser();
      return { hasCompletedOnboarding: user.hasCompletedOnboarding };
    }
  );

  fastify.post(
    '/api/onboarding/complete',
    {
      schema: {
        operationId: 'completeOnboarding',
        description: 'Complete onboarding (backward compatibility)',
        tags: ['Onboarding'],
        response: {
          200: z.object({
            hasCompletedOnboarding: z.boolean(),
          }),
        },
      },
    },
    async (_request, _reply) => {
      const user = await UserModel.patchUser({ hasCompletedOnboarding: true });
      return { hasCompletedOnboarding: user.hasCompletedOnboarding };
    }
  );
};

export default userRoutes;
