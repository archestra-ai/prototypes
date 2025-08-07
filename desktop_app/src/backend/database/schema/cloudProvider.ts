import { sql } from 'drizzle-orm';
import { int, sqliteTable, text } from 'drizzle-orm/sqlite-core';
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

export const cloudProvidersTable = sqliteTable('cloud_providers', {
  id: int().primaryKey({ autoIncrement: true }),
  providerType: text().notNull().$type<z.infer<typeof SupportedCloudProviderTypesSchema>>().unique(),
  apiKey: text().notNull(), // TODO: Migrate to safeStorage later
  enabled: int({ mode: 'boolean' }).notNull().default(true),
  validatedAt: text(),
  createdAt: text()
    .notNull()
    .default(sql`(current_timestamp)`),
  updatedAt: text()
    .notNull()
    .default(sql`(current_timestamp)`),
});
