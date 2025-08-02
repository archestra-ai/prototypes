import { drizzle } from 'drizzle-orm/better-sqlite3';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

// Get the appropriate data directory based on platform
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

// Ensure the directory exists
if (!fs.existsSync(appDataPath)) {
  fs.mkdirSync(appDataPath, { recursive: true });
}

// Use require for better-sqlite3 to avoid bundling issues
const Database = require('better-sqlite3');
const sqlite = new Database(DATABASE_PATH);
const db = drizzle(sqlite, {
  casing: 'snake_case',
});

export default db;