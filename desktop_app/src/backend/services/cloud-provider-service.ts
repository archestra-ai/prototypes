import { z } from 'zod';

import cloudProviderModel from '@backend/models/cloudProvider';
import { PROVIDER_REGISTRY, ProviderDefinition, getProviderForModel, providerDefinitionSchema } from './provider-registry';

// Combined schema for API responses (merges definition + config)
export const providerWithConfigSchema = providerDefinitionSchema.extend({
  configured: z.boolean(),
  enabled: z.boolean(),
  validatedAt: z.string().nullable(),
});

export type ProviderWithConfig = z.infer<typeof providerWithConfigSchema>;

export class CloudProviderService {
  async getAllProvidersWithConfig(): Promise<ProviderWithConfig[]> {
    const configs = await cloudProviderModel.getAll();

    return Object.values(PROVIDER_REGISTRY).map((definition) => {
      const config = configs.find((c) => c.providerType === definition.type);

      return {
        ...definition,
        configured: !!config,
        enabled: config?.enabled ?? false,
        validatedAt: config?.validatedAt ?? null,
      };
    });
  }

  async getProviderConfigForModel(modelId: string): Promise<{ provider: ProviderDefinition; apiKey: string } | null> {
    const provider = getProviderForModel(modelId);
    if (!provider) return null;

    const config = await cloudProviderModel.getByType(provider.type);
    if (!config || !config.enabled) return null;

    return { provider, apiKey: config.apiKey };
  }

  async getAvailableModels(): Promise<Array<{ id: string; provider: string }>> {
    const configs = await cloudProviderModel.getAll();
    const models: Array<{ id: string; provider: string }> = [];

    for (const config of configs) {
      if (!config.enabled) continue;

      const definition = PROVIDER_REGISTRY[config.providerType];
      if (!definition) continue;

      for (const modelId of definition.models) {
        models.push({ id: modelId, provider: config.providerType });
      }
    }

    return models;
  }
}

export const cloudProviderService = new CloudProviderService();