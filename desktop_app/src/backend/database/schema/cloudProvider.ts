import { sql } from 'drizzle-orm';
import { int, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { SupportedCloudProviderTypes } from '@archestra/types';

export const cloudProvidersTable = sqliteTable('cloud_providers', {
  id: int().primaryKey({ autoIncrement: true }),
  providerType: text().notNull().$type<SupportedCloudProviderTypes>().unique(),
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
