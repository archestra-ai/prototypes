import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'node:path';

import config from '@backend/config';
import log from '@backend/utils/logger';
import { DATABASE_PATH } from '@backend/utils/paths';

const db = drizzle({
  connection: DATABASE_PATH,
  casing: 'snake_case',
});

export async function runDatabaseMigrations() {
  try {
    log.info('Running database migrations...');
    log.info('Database path:', DATABASE_PATH);

    /**
     * TODO: is this actually true?👇
     *
     * In development, migrations are in src folder
     * In production, they should be bundled with the app
     */
    let migrationsFolder: string;
    if (config.debug) {
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
