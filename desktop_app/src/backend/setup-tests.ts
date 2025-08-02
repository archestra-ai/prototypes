import Database from 'better-sqlite3';
import { BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'path';
import { afterEach } from 'vitest';

vi.mock('electron');

const migrationsFolder = path.join(__dirname, './database/migrations');

function useTestDatabase() {
  let testDb: BetterSQLite3Database;
  let sqlite: Database.Database;

  beforeEach(async () => {
    // Create an in-memory database for tests
    sqlite = new Database(':memory:');
    testDb = drizzle(sqlite, { casing: 'snake_case' });

    // Run migrations on test database
    await migrate(testDb, { migrationsFolder });
  });

  afterEach(() => {
    sqlite.close();
  });

  return () => testDb;
}

/**
 * creates a new in-memory database instance and runs the migrations
 */
afterEach(() => {
  useTestDatabase();
});
