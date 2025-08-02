import Database from 'better-sqlite3';
import { BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'path';
import { afterEach } from 'vitest';

// Create an in-memory database for tests
function createTestDatabase() {
  const sqlite = new Database(':memory:');
  const db = drizzle(sqlite, {
    casing: 'snake_case',
  });

  return { db, sqlite };
}

// Run migrations on test database
async function setupTestDatabase(db: BetterSQLite3Database) {
  const migrationsFolder = path.join(__dirname, '../../drizzle');
  await migrate(db, { migrationsFolder });
}

function useTestDatabase() {
  let testDb: BetterSQLite3Database;
  let sqlite: Database.Database;

  beforeEach(async () => {
    const result = createTestDatabase();
    testDb = result.db;
    sqlite = result.sqlite;
    await setupTestDatabase(testDb);
  });

  afterEach(() => {
    sqlite.close();
  });

  return () => testDb;
}

/**
 * runs a clean after each test case
 * in this case just creating a new in-memory database instance and running the migrations
 */
afterEach(() => {
  useTestDatabase;
});
