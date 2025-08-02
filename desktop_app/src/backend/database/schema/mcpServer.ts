import { int, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { timestamps } from '@backend/database/columns.helpers';
import { ServerConfig } from '@types';

export const mcpServersTable = sqliteTable('mcp_servers', {
  id: int().primaryKey({ autoIncrement: true }),
  name: text().notNull().unique(),
  // https://orm.drizzle.team/docs/column-types/sqlite#blob
  serverConfig: text('server_config', { mode: 'json' }).$type<ServerConfig>().notNull(),
  ...timestamps,
});
