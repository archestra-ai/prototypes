import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { app } from 'electron';
import path from 'node:path';

const DATABASE_NAME = 'archestra.db';
const MIGRATIONS_FOLDER = './migrations';

const db = drizzle({
  connection: { url: `file:${app.getPath('userData')}/${DATABASE_NAME}` },
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
