/**
 * https://orm.drizzle.team/docs/sql-schema-declaration#advanced
 */

import { sql } from 'drizzle-orm';
import { text } from 'drizzle-orm/sqlite-core';

export const timestamps = {
  updatedAt: text('timestamp')
    .notNull()
    .default(sql`(current_timestamp)`),
  createdAt: text('timestamp')
    .notNull()
    .default(sql`(current_timestamp)`),
  deletedAt: text('timestamp'),
};
