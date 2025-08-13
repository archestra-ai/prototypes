import { sql } from 'drizzle-orm';
import { int, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { createSelectSchema } from 'drizzle-zod';

export const userTable = sqliteTable('user', {
  id: int().primaryKey({ autoIncrement: true }),
  hasCompletedOnboarding: int().notNull().default(0), // 0 = false, 1 = true
  collectTelemetryData: int().notNull().default(0), // 0 = false, 1 = true
  createdAt: text()
    .notNull()
    .default(sql`(current_timestamp)`),
  updatedAt: text()
    .notNull()
    .default(sql`(current_timestamp)`),
});

export const SelectUserSchema = createSelectSchema(userTable);
