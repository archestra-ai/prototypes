import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Get platform-specific application data directory
 * - macOS: ~/Library/Application Support/archestra
 * - Windows: %APPDATA%/archestra
 * - Linux: ~/.config/archestra
 */
function getAppDataPath(): string {
  const platform = process.platform;
  const homeDir = os.homedir();

  switch (platform) {
    case 'darwin':
      return path.join(homeDir, 'Library', 'Application Support', 'archestra');
    case 'win32':
      return path.join(process.env.APPDATA || homeDir, 'archestra');
    default: // linux and others
      return path.join(homeDir, '.config', 'archestra');
  }
}

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
  casing: 'snake_case' 
});

export async function runDatabaseMigrations() {
  try {
    console.log('Running database migrations...');
    console.log('Database path:', DATABASE_PATH);

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
