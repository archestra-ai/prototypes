import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import fs from 'node:fs';
import path from 'node:path';

import log from '@backend/utils/logger';
import { getAppDataPath } from '@backend/utils/paths';

const appDataPath = getAppDataPath();
const DATABASE_NAME = 'archestra.db';
const DATABASE_PATH = path.join(appDataPath, DATABASE_NAME);

// Ensure the directory exists before creating the database
// This prevents SQLite errors on first run
if (!fs.existsSync(appDataPath)) {
  fs.mkdirSync(appDataPath, { recursive: true });
}

const db = drizzle({
  connection: DATABASE_PATH,
  casing: 'snake_case',
});

export async function runDatabaseMigrations() {
  try {
    log.info('Running database migrations...');
    log.info('Database path:', DATABASE_PATH);

    // In development, migrations are in src folder
    // In production, they should be bundled with the app
    const isDev = process.env.NODE_ENV === 'development';

    let migrationsFolder: string;
    if (isDev) {
      // Development: Use absolute path from project root
      migrationsFolder = path.join(process.cwd(), 'src/backend/database/migrations');
    } else {
      // Production: Migrations should be bundled with the app
      migrationsFolder = path.join(__dirname, '../../src/backend/database/migrations');
    }

    log.info('Migrations folder:', migrationsFolder);

    // Run migrations
    await migrate(db, { migrationsFolder });

    log.info('Database migrations completed successfully');
  } catch (error) {
    log.error('Failed to run migrations:', error);
    throw error;
  }
}

export default db;
