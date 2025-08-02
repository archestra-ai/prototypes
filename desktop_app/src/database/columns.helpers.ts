/**
 * https://orm.drizzle.team/docs/sql-schema-declaration#advanced
 */

import { sql } from 'drizzle-orm';
import { text } from 'drizzle-orm/sqlite-core';

export const timestamps = {
  updated_at: text('timestamp')
    .notNull()
    .default(sql`(current_timestamp)`),
  created_at: text('timestamp')
    .notNull()
    .default(sql`(current_timestamp)`),
  deleted_at: text('timestamp'),
};
