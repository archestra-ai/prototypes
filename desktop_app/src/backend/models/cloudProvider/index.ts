import { eq } from 'drizzle-orm';
import { z } from 'zod';

import db from '@backend/database';
import {
  SelectCloudProviderSchema,
  SupportedCloudProviderTypesSchema,
  cloudProvidersTable,
} from '@backend/database/schema/cloudProvider';

export const CloudProviderRegistrySchema = z.object({
  type: SupportedCloudProviderTypesSchema,
  name: z.string(),
  apiKeyUrl: z.string().url(),
  apiKeyPlaceholder: z.string(),
  baseUrl: z.string().url(),
  models: z.array(z.string()), // Just model IDs
  headers: z.record(z.string(), z.string()).optional(),
});

/**
 * Combined schema for API responses (merges definition + config)
 */
export const CloudProviderRegistryWithConfigSchema = CloudProviderRegistrySchema.extend({
  configured: z.boolean(),
  enabled: z.boolean(),
  validatedAt: z.string().nullable(),
});

export type CloudProviderRegistry = z.infer<typeof CloudProviderRegistrySchema>;
export type CloudProviderRegistryWithConfig = z.infer<typeof CloudProviderRegistryWithConfigSchema>;
export type SupportedCloudProviderTypes = z.infer<typeof SupportedCloudProviderTypesSchema>;

// Provider definitions - easy to update in code
const PROVIDER_REGISTRY: Record<SupportedCloudProviderTypes, CloudProviderRegistry> = {
  anthropic: {
    type: 'anthropic',
    name: 'Claude (Anthropic)',
    apiKeyUrl: 'https://console.anthropic.com/settings/keys',
    apiKeyPlaceholder: 'sk-ant-api03-...',
    baseUrl: 'https://api.anthropic.com/v1',
    models: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'],
    headers: {
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'messages-2023-12-15',
    },
  },
  openai: {
    type: 'openai',
    name: 'OpenAI',
    apiKeyUrl: 'https://platform.openai.com/api-keys',
    apiKeyPlaceholder: 'sk-...',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  },
  deepseek: {
    type: 'deepseek',
    name: 'DeepSeek',
    apiKeyUrl: 'https://platform.deepseek.com/api_keys',
    apiKeyPlaceholder: 'sk-...',
    baseUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-reasoner'],
  },
  gemini: {
    type: 'gemini',
    name: 'Google Gemini',
    apiKeyUrl: 'https://aistudio.google.com/apikey',
    apiKeyPlaceholder: 'AIza...',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-1.5-pro'],
  },
};

// Helper function to get provider for a model
function getProviderForModel(modelId: string): CloudProviderRegistry | null {
  for (const provider of Object.values(PROVIDER_REGISTRY)) {
    if (provider.models.includes(modelId)) {
      return provider;
    }
  }
  return null;
}

export default class CloudProviderModel {
  static async getAll() {
    return await db.select().from(cloudProvidersTable);
  }

  static async getByType(type: (typeof cloudProvidersTable.$inferSelect)['providerType']) {
    const [provider] = await db.select().from(cloudProvidersTable).where(eq(cloudProvidersTable.providerType, type));
    return provider;
  }

  static async upsert(type: (typeof cloudProvidersTable.$inferSelect)['providerType'], apiKey: string) {
    const existing = await this.getByType(type);

    if (existing) {
      await db
        .update(cloudProvidersTable)
        .set({
          apiKey,
          updatedAt: new Date().toISOString(),
          validatedAt: new Date().toISOString(),
        })
        .where(eq(cloudProvidersTable.providerType, type));
    } else {
      await db.insert(cloudProvidersTable).values({
        providerType: type,
        apiKey,
        validatedAt: new Date().toISOString(),
      });
    }

    const result = await this.getByType(type);
    if (!result) throw new Error('Failed to upsert provider');
    return result;
  }

  static async delete(type: (typeof cloudProvidersTable.$inferSelect)['providerType']) {
    await db.delete(cloudProvidersTable).where(eq(cloudProvidersTable.providerType, type));
  }

  static async getAllProvidersWithConfig(): Promise<CloudProviderRegistryWithConfig[]> {
    const configs = await CloudProviderModel.getAll();

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

  static async getProviderConfigForModel(
    modelId: string
  ): Promise<{ provider: CloudProviderRegistry; apiKey: string } | null> {
    const provider = getProviderForModel(modelId);
    if (!provider) return null;

    const config = await CloudProviderModel.getByType(provider.type);
    if (!config || !config.enabled) return null;

    return { provider, apiKey: config.apiKey };
  }

  static async getAvailableModels(): Promise<Array<{ id: string; provider: SupportedCloudProviderTypes }>> {
    const configs = await CloudProviderModel.getAll();
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

export { SelectCloudProviderSchema as CloudProviderSchema, SupportedCloudProviderTypesSchema };
