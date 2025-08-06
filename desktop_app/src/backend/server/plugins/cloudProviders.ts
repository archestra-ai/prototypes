import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import cloudProviderModel from '@backend/models/cloudProvider';
import { PROVIDER_REGISTRY } from '@backend/services/provider-registry';
import { cloudProviderService, providerWithConfigSchema } from '@backend/services/cloud-provider-service';

// Request schemas
const configureProviderSchema = z.object({
  type: z.string(),
  apiKey: z.string(),
});

const modelsResponseSchema = z.object({
  models: z.array(
    z.object({
      id: z.string(),
      provider: z.string(),
    })
  ),
});

const cloudProviderRoutes: FastifyPluginAsync = async (fastify) => {
  // Get all available providers with config status
  fastify.get('/api/cloud-providers/available', {
    schema: {
      operationId: 'getAvailableCloudProviders',
      description: 'Get all available cloud providers with configuration status',
      tags: ['Cloud Providers'],
    },
    handler: async () => {
      const providers = await cloudProviderService.getAllProvidersWithConfig();
      return { providers };
    },
  });

  // Configure a provider
  fastify.post('/api/cloud-providers', {
    schema: {
      operationId: 'configureCloudProvider',
      description: 'Configure a cloud provider with API key',
      tags: ['Cloud Providers'],
    },
    handler: async (request) => {
      const { type, apiKey } = configureProviderSchema.parse(request.body);

      if (!PROVIDER_REGISTRY[type]) {
        throw new Error(`Unknown provider type: ${type}`);
      }

      return await cloudProviderModel.upsert(type, apiKey);
    },
  });

  // Delete provider config
  fastify.delete('/api/cloud-providers/:type', {
    schema: {
      operationId: 'deleteCloudProvider',
      description: 'Remove cloud provider configuration',
      tags: ['Cloud Providers'],
    },
    handler: async (request) => {
      const { type } = request.params as { type: string };
      await cloudProviderModel.delete(type);
      return { success: true };
    },
  });

  // Get available models from configured providers
  fastify.get('/api/cloud-providers/models', {
    schema: {
      operationId: 'getCloudProviderModels',
      description: 'Get all available models from configured providers',
      tags: ['Cloud Providers'],
    },
    handler: async () => {
      const models = await cloudProviderService.getAvailableModels();
      return { models };
    },
  });
};

export default cloudProviderRoutes;