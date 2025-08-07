import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import CloudProviderModel, {
  CloudProviderSchema,
  CloudProviderWithConfigSchema,
  SupportedCloudProviderTypesSchema,
} from '@backend/models/cloudProvider';
import { cloudProviderService } from '@backend/services/cloud-provider-service';

const cloudProviderRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get('/api/cloud-providers/available', {
    schema: {
      operationId: 'getAvailableCloudProviders',
      description: 'Get all available cloud providers with configuration status',
      tags: ['Cloud Providers'],
      response: {
        200: z.array(CloudProviderWithConfigSchema),
      },
    },
    handler: async (_request, reply) => {
      const providers = await cloudProviderService.getAllProvidersWithConfig();
      return reply.send(providers);
    },
  });

  fastify.post(
    '/api/cloud-providers',
    {
      schema: {
        operationId: 'configureCloudProvider',
        description: 'Configure a cloud provider with API key',
        tags: ['Cloud Providers'],
        body: z.object({
          type: SupportedCloudProviderTypesSchema,
          apiKey: z.string(),
        }),
        response: {
          200: CloudProviderSchema,
        },
      },
    },
    async ({ body: { type, apiKey } }, reply) => {
      const provider = await CloudProviderModel.upsert(type, apiKey);
      return reply.send(provider);
    }
  );

  fastify.delete(
    '/api/cloud-providers/:type',
    {
      schema: {
        operationId: 'deleteCloudProvider',
        description: 'Remove cloud provider configuration',
        tags: ['Cloud Providers'],
        params: z.object({
          type: SupportedCloudProviderTypesSchema,
        }),
        response: {
          200: z.object({
            success: z.boolean(),
          }),
        },
      },
    },
    async ({ params: { type } }, reply) => {
      await CloudProviderModel.delete(type);
      return reply.send({ success: true });
    }
  );

  fastify.get(
    '/api/cloud-providers/models',
    {
      schema: {
        operationId: 'getCloudProviderModels',
        description: 'Get all available models from configured providers',
        tags: ['Cloud Providers'],
        response: {
          200: z.array(
            z.object({
              id: z.string(),
              provider: SupportedCloudProviderTypesSchema,
            })
          ),
        },
      },
    },
    async (_request, reply) => {
      const models = await cloudProviderService.getAvailableModels();
      return reply.send(models);
    }
  );
};

export default cloudProviderRoutes;
