import { sql } from 'drizzle-orm';
import { int, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { z } from 'zod';

import { chatsTable } from './chat';

export const ChatMessageRoleSchema = z.enum(['user', 'assistant', 'system']);

export const messagesTable = sqliteTable('messages', {
  id: int().primaryKey({ autoIncrement: true }),
  chatId: int()
    .notNull()
    .references(() => chatsTable.id, { onDelete: 'cascade' }),
  role: text().$type<z.infer<typeof ChatMessageRoleSchema>>().notNull(),
  /**
   * TODO: we could strongly type content as such
   *
   * content: text({ mode: 'json' }).$type<ChatMessageContent>().notNull(),
   *
   * https://orm.drizzle.team/docs/column-types/sqlite#blob
   *
   *
   */
  content: text({ mode: 'json' }).notNull(),
  createdAt: text()
    .notNull()
    .default(sql`(current_timestamp)`),
});
