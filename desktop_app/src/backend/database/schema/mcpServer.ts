import { sql } from 'drizzle-orm';
import { int, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { ServerConfig } from '@archestra/types';

export const mcpServersTable = sqliteTable('mcp_servers', {
  id: int().primaryKey({ autoIncrement: true }),
  slug: text().notNull().unique(), // Catalog slug or UUID for custom servers
  name: text(), // Display name (from catalog or user-defined for custom)
  // https://orm.drizzle.team/docs/column-types/sqlite#blob
  serverConfig: text({ mode: 'json' }).$type<ServerConfig>().notNull(),
  createdAt: text()
    .notNull()
    .default(sql`(current_timestamp)`),
});
