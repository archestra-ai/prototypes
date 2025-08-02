import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

/**
 * Server-specific database configuration
 * 
 * This is a separate database module for the server process because:
 * 1. The main database module (`src/database/index.ts`) imports Electron APIs
 * 2. The server runs in a pure Node.js process without Electron context
 * 3. We need to manually resolve the app data path without Electron's app.getPath()
 */

/**
 * Get platform-specific application data directory
 * 
 * Mirrors Electron's app.getPath('userData') behavior:
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

/**
 * IMPORTANT: Using require() instead of import for better-sqlite3
 * 
 * This is a workaround for native module loading issues in Electron:
 * - better-sqlite3 contains native .node bindings
 * - Vite/Rollup tries to bundle these bindings, which fails
 * - require() bypasses the bundler and loads the module at runtime
 * - The vite.server.config.ts marks better-sqlite3 as external
 */
const Database = require('better-sqlite3');
const sqlite = new Database(DATABASE_PATH);
const db = drizzle(sqlite, {
  casing: 'snake_case', // Match the desktop app's database convention
});

/**
 * Run database migrations
 * This ensures the database schema is up to date before the server starts
 */
export async function runServerMigrations() {
  try {
    console.log('Running server database migrations...');
    
    // Get the absolute path to the migrations folder
    const migrationsFolder = path.join(__dirname, '../../src/backend/database/migrations');
    
    // Run migrations
    await migrate(db, { migrationsFolder });
    
    console.log('Server database migrations completed successfully');
  } catch (error) {
    console.error('Failed to run server migrations:', error);
    throw error;
  }
}

export default db;