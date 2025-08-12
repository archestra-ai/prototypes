import { sql } from 'drizzle-orm';
import { int, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { createSelectSchema } from 'drizzle-zod';

export const onboardingTable = sqliteTable('onboarding', {
  id: int().primaryKey({ autoIncrement: true }),
  completed: int().notNull().default(0), // 0 = false, 1 = true
  completedAt: text(),
  createdAt: text()
    .notNull()
    .default(sql`(current_timestamp)`),
  updatedAt: text()
    .notNull()
    .default(sql`(current_timestamp)`),
});

export const SelectOnboardingSchema = createSelectSchema(onboardingTable);
