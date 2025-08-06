import { sql } from 'drizzle-orm';
import { int, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const cloudProvidersTable = sqliteTable('cloud_providers', {
  id: int().primaryKey({ autoIncrement: true }),
  providerType: text('provider_type').notNull().unique(),
  apiKey: text('api_key').notNull(), // TODO: Migrate to safeStorage later
  enabled: int({ mode: 'boolean' }).notNull().default(true),
  validatedAt: text('validated_at'),
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  updatedAt: text('updated_at').notNull().default(sql`(current_timestamp)`),
});

// Export types
export type CloudProvider = {
  id: number;
  providerType: string;
  apiKey: string;
  enabled: boolean;
  validatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NewCloudProvider = {
  providerType: string;
  apiKey: string;
  enabled?: boolean;
  validatedAt?: string | null;
};