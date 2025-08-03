import { sql } from 'drizzle-orm';
import { int, sqliteTable, text, json } from 'drizzle-orm/sqlite-core';
import { chatsTable } from './chat';

export const messagesTable = sqliteTable('messages', {
  id: int().primaryKey({ autoIncrement: true }),
  chatId: int('chat_id')
    .notNull()
    .references(() => chatsTable.id, { onDelete: 'cascade' }),
  
  // Core AI SDK message fields
  role: text('role', { enum: ['system', 'user', 'assistant', 'tool'] }).notNull(),
  content: text('content').notNull(), // Simple text content
  
  // Complex content for multi-part messages (optional)
  parts: json('parts').$type<Array<{
    type: 'text' | 'image' | 'tool-call' | 'tool-result';
    text?: string;
    image?: string;
    toolCallId?: string;
    toolName?: string;
    input?: any;
    output?: any;
  }>>(),
  
  // Tool calls for assistant messages
  toolCalls: json('tool_calls').$type<Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>>(),
  
  // Custom fields
  images: json('images').$type<string[]>(),
  thinking: text('thinking'),
  
  createdAt: text('created_at')
    .notNull()
    .default(sql`(current_timestamp)`),
});