import { CloudProvider, CloudProviderWithConfig, SupportedCloudProviderTypes } from '@archestra/types';
import cloudProviderModel from '@backend/models/cloudProvider';

import { PROVIDER_REGISTRY, getProviderForModel } from './provider-registry';

export class CloudProviderService {
  async getAllProvidersWithConfig(): Promise<CloudProviderWithConfig[]> {
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

  async getProviderConfigForModel(modelId: string): Promise<{ provider: CloudProvider; apiKey: string } | null> {
    const provider = getProviderForModel(modelId);
    if (!provider) return null;

    const config = await cloudProviderModel.getByType(provider.type);
    if (!config || !config.enabled) return null;

    return { provider, apiKey: config.apiKey };
  }

  async getAvailableModels(): Promise<Array<{ id: string; provider: SupportedCloudProviderTypes }>> {
    const configs = await cloudProviderModel.getAll();
    const models: Array<{ id: string; provider: SupportedCloudProviderTypes }> = [];

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
