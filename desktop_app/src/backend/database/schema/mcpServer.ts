import type { DxtManifestMcpConfig, DxtUserConfigValues } from '@anthropic-ai/dxt';
import { sql } from 'drizzle-orm';
import { int, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const mcpServersTable = sqliteTable('mcp_servers', {
  id: int().primaryKey({ autoIncrement: true }),
  slug: text().notNull().unique(), // Catalog slug or UUID for custom servers
  name: text(), // Display name (from catalog or user-defined for custom)
  // https://orm.drizzle.team/docs/column-types/sqlite#blob
  serverConfig: text({ mode: 'json' }).$type<DxtManifestMcpConfig>().notNull(),
  /**
   * `userConfigValues` are user-provided/custom values for `serverConfig`
   * (think API keys, etc)
   *
   * This is only used for mcp servers installed via the catalog, as it allows users to provide
   * dynamic configuration
   */
  userConfigValues: text({ mode: 'json' }).$type<DxtUserConfigValues>(),
  createdAt: text()
    .notNull()
    .default(sql`(current_timestamp)`),
});
