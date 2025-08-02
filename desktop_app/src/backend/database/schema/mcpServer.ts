import { int, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { timestamps } from '@backend/database/columns.helpers';

export const mcpServersTable = sqliteTable('mcp_servers', {
  id: int().primaryKey({ autoIncrement: true }),
  name: text().notNull().unique(),
  serverConfig: text('server_config', { mode: 'json' }).notNull(),
  ...timestamps,
});
