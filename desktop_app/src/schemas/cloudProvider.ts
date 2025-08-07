import { z } from 'zod';

export const SupportedCloudProviderTypesSchema = z.enum(['anthropic', 'openai', 'deepseek', 'gemini']);

export const CloudProviderSchema = z.object({
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
export const CloudProviderWithConfigSchema = CloudProviderSchema.extend({
  configured: z.boolean(),
  enabled: z.boolean(),
  validatedAt: z.string().nullable(),
});
