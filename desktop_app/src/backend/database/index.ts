import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { app } from 'electron';
import path from 'node:path';

const DATABASE_NAME = 'archestra.db';
const DATABASE_PATH = path.join(app.getPath('userData'), DATABASE_NAME);

const db = drizzle({
  connection: DATABASE_PATH,
  // https://orm.drizzle.team/docs/sql-schema-declaration#camel-and-snake-casing
  casing: 'snake_case',
  // logger: true,
});

export async function runDatabaseMigrations() {
  try {
    console.log('Running database migrations...');
    console.log('Database path:', DATABASE_PATH);

    // In development, migrations are in src folder
    // In production, they should be bundled with the app
    const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

    let migrationsFolder: string;
    if (isDev) {
      // Development: Use absolute path from project root
      migrationsFolder = path.join(process.cwd(), 'src/backend/database/migrations');
    } else {
      // Production: Migrations should be bundled with the app
      migrationsFolder = path.join(__dirname, '../../src/backend/database/migrations');
    }

    console.log('Migrations folder:', migrationsFolder);

    // Run migrations
    await migrate(db, { migrationsFolder });

    console.log('Database migrations completed successfully');
  } catch (error) {
    console.error('Failed to run migrations:', error);
    throw error;
  }
}

export default db;
