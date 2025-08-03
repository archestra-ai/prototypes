import { sql } from 'drizzle-orm';
import { int, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { chatsTable } from './chat';

export const messagesTable = sqliteTable('messages', {
  id: int().primaryKey({ autoIncrement: true }),
  chatId: int('chat_id')
    .notNull()
    .references(() => chatsTable.id, { onDelete: 'cascade' }),
  
  // Simple message fields
  role: text('role', { enum: ['system', 'user', 'assistant', 'tool'] }).notNull(),
  content: text('content').notNull(),
  
  // Optional metadata stored as JSON
  metadata: text('metadata', { mode: 'json' }).$type<{
    images?: string[];
    thinking?: string;
    toolCalls?: any[];
    [key: string]: any;
  }>(),
  
  createdAt: text('created_at')
    .notNull()
    .default(sql`(current_timestamp)`),
});