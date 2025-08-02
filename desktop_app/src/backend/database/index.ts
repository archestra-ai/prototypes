import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { app } from 'electron';
import path from 'node:path';

const DATABASE_NAME = 'archestra.db';
const DATABASE_PATH = path.join(app.getPath('userData'), DATABASE_NAME);

/**
 * TODO: this is a bit of a hack to get the path to the migrations folder "working"
 * (it's sorta clashing with .vite/build, investigate this further)
 */
const MIGRATIONS_FOLDER = '../../src/backend/database/migrations';

const db = drizzle({
  connection: DATABASE_PATH,
  // https://orm.drizzle.team/docs/sql-schema-declaration#camel-and-snake-casing
  casing: 'snake_case',
  // logger: true,
});

export async function runDatabaseMigrations() {
  try {
    console.log('Running database migrations...');

    // Get the absolute path to the migrations folder
    const migrationsFolder = path.join(__dirname, MIGRATIONS_FOLDER);

    // Run migrations
    await migrate(db, { migrationsFolder });

    console.log('Database migrations completed successfully');
  } catch (error) {
    console.error('Failed to run migrations:', error);
    throw error;
  }
}

export default db;
