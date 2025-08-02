import Database from 'better-sqlite3';
import { BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'path';

vi.mock('electron');
vi.mock('@backend/database');

let testDb: BetterSQLite3Database;
let sqlite: Database.Database;

/**
 * creates a new in-memory database instance and runs the migrations
 */
beforeEach(async () => {
  // Create an in-memory database for tests
  sqlite = new Database(':memory:');
  testDb = drizzle(sqlite, { casing: 'snake_case' });

  // Run migrations on test database
  await migrate(testDb, { migrationsFolder: path.join(__dirname, './database/migrations') });

  // Set the test database in the mock
  const { setMockDb } = await import('@backend/database/__mocks__/index');
  setMockDb(testDb);
});

afterEach(() => {
  sqlite?.close();
});
