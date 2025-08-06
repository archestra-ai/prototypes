import { sql } from 'drizzle-orm';
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

import type { ExternalMcpClientName } from '@archestra/types';

export const externalMcpClientsTable = sqliteTable('external_mcp_clients', {
  clientName: text('client_name').$type<ExternalMcpClientName>().primaryKey(),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(current_timestamp)`),
});
