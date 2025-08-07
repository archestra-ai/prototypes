import { sql } from 'drizzle-orm';
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

import type { McpServerConfig, McpServerUserConfigValues } from '@archestra/types';

export const mcpServersTable = sqliteTable('mcp_servers', {
  /**
   * Catalog "name" (unique identifier) or UUID for custom servers
   */
  id: text().primaryKey(),
  /**
   * Display name (from catalog or user-defined for custom)
   */
  name: text(),
  /**
   * https://orm.drizzle.team/docs/column-types/sqlite#blob
   */
  serverConfig: text({ mode: 'json' }).$type<McpServerConfig>().notNull(),
  /**
   * `userConfigValues` are user-provided/custom values for `DxtManifestMcpConfig`
   * (think API keys, etc)
   *
   * This is only used for mcp servers installed via the catalog, as it allows users to provide
   * dynamic configuration
   *
   * See https://github.com/anthropics/dxt/blob/main/MANIFEST.md#variable-substitution-in-user-configuration
   */
  userConfigValues: text({ mode: 'json' }).$type<McpServerUserConfigValues>(),
  createdAt: text()
    .notNull()
    .default(sql`(current_timestamp)`),
});
