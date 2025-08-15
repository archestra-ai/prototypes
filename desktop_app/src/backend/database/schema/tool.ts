import { relations } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { mcpServersTable } from './mcpServer';

export const tools = sqliteTable('tools', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  inputSchema: text('input_schema'), // JSON string
  mcpServerId: text('mcp_server_id')
    .notNull()
    .references(() => mcpServersTable.id, { onDelete: 'cascade' }),

  // Analysis results
  isRead: integer('is_read', { mode: 'boolean' }),
  isWrite: integer('is_write', { mode: 'boolean' }),
  idempotent: integer('idempotent', { mode: 'boolean' }),
  reversible: integer('reversible', { mode: 'boolean' }),

  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date()),
});

export const toolsRelations = relations(tools, ({ one }) => ({
  mcpServer: one(mcpServersTable, {
    fields: [tools.mcpServerId],
    references: [mcpServersTable.id],
  }),
}));
