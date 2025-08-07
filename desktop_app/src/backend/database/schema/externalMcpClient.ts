import { sql } from 'drizzle-orm';
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

export const ExternalMcpClientNameSchema = z.enum(['claude', 'cursor', 'vscode']);

export const externalMcpClientsTable = sqliteTable('external_mcp_clients', {
  clientName: text('client_name').$type<z.infer<typeof ExternalMcpClientNameSchema>>().primaryKey(),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(current_timestamp)`),
});

export const SelectExternalMcpClientSchema = createSelectSchema(externalMcpClientsTable);
