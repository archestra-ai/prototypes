#!/usr/bin/env node
import { execSync, spawn } from 'child_process';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

/**
 * Script to run sqlite-web for database inspection
 * Automatically finds the Archestra database and opens sqlite-web
 */

// Function to find the database path based on platform
function getDatabasePath() {
  const platform = process.platform;
  let appDataDir;

  if (platform === 'darwin') {
    // macOS: ~/Library/Application Support/com.archestra-ai.app/archestra.db
    appDataDir = join(homedir(), 'Library', 'Application Support', 'com.archestra.ai');
  } else if (platform === 'win32') {
    // Windows: %APPDATA%/com.archestra-ai.app/archestra.db
    appDataDir = join(process.env.APPDATA || '', 'com.archestra.ai');
  } else {
    // Linux: ~/.local/share/com.archestra-ai.app/archestra.db
    appDataDir = join(homedir(), '.local', 'share', 'com.archestra.ai');
  }

  return join(appDataDir, 'archestra.db');
}

// Check if sqlite-web is installed
function checkSqliteWeb() {
  try {
    // First try direct access
    execSync('sqlite-web --version', { stdio: 'ignore' });
    return 'direct';
  } catch (error) {
    try {
      // Try via uv tool
      execSync('uv tool run sqlite-web --version', { stdio: 'ignore' });
      return 'uv';
    } catch (error2) {
      return false;
    }
  }
}

// Install sqlite-web if not available
function installSqliteWeb() {
  console.log('📦 Installing sqlite-web...');
  try {
    console.log('   Running: uv tool install sqlite-web');
    execSync('uv tool install sqlite-web', { stdio: 'inherit' });
    console.log('✅ sqlite-web installed successfully');
    return true;
  } catch (error) {
    console.log('❌ Failed to install with uv, trying pip...');
    try {
      console.log('   Running: pip install sqlite-web');
      execSync('pip install sqlite-web', { stdio: 'inherit' });
      console.log('✅ sqlite-web installed successfully');
      return true;
    } catch (error2) {
      console.log('❌ Failed to install with pip, trying pip3...');
      try {
        console.log('   Running: pip3 install sqlite-web');
        execSync('pip3 install sqlite-web', { stdio: 'inherit' });
        console.log('✅ sqlite-web installed successfully');
        return true;
      } catch (error3) {
        console.error('❌ Failed to install sqlite-web. Please install manually:');
        console.error('   uv tool install sqlite-web');
        console.error('   or');
        console.error('   pip install sqlite-web');
        return false;
      }
    }
  }
}

async function main() {
  console.log('🗄️  Archestra Database Inspector');
  console.log('================================');

  // Check if sqlite-web is installed
  const sqliteWebAvailable = checkSqliteWeb();
  if (!sqliteWebAvailable) {
    console.log('⚠️  sqlite-web not found. Installing...');
    if (!installSqliteWeb()) {
      process.exit(1);
    }
  }

  // Find database path
  const dbPath = getDatabasePath();
  console.log(`📍 Database path: ${dbPath}`);

  // Check if database exists
  if (!existsSync(dbPath)) {
    console.log('⚠️  Database not found. Make sure Archestra has been run at least once.');
    console.log('   The database will be created when you first launch the application.');
    console.log('   You can still run sqlite-web, but the database will be empty.');
    console.log('');
  }

  // Start sqlite-web
  console.log('🚀 Starting sqlite-web...');
  console.log('   Opening: http://localhost:8080');
  console.log('   Press Ctrl+C to stop');
  console.log('');

  // Re-check how sqlite-web is available after potential installation
  const currentSqliteWebAvailable = checkSqliteWeb();
  console.log(`🔍 sqlite-web available via: ${currentSqliteWebAvailable || 'not found'}`);

  // If it's not available directly, assume it was installed via uv
  const useUv = currentSqliteWebAvailable === 'uv' || (!currentSqliteWebAvailable && !sqliteWebAvailable);

  // Use appropriate command based on how sqlite-web is available
  const command = useUv ? 'uv' : 'sqlite-web';
  const args = useUv
    ? ['tool', 'run', 'sqlite-web', dbPath, '--host', '0.0.0.0', '--port', '8080']
    : [dbPath, '--host', '0.0.0.0', '--port', '8080'];

  console.log(`📟 Running command: ${command} ${args.join(' ')}`);

  const child = spawn(command, args, {
    stdio: 'inherit',
  });

  // Handle process termination
  process.on('SIGINT', () => {
    console.log('\n👋 Stopping sqlite-web...');
    child.kill('SIGINT');
    process.exit(0);
  });

  child.on('error', (error) => {
    console.error('❌ Error starting sqlite-web:', error.message);
    process.exit(1);
  });

  child.on('close', (code) => {
    console.log(`\n🛑 sqlite-web exited with code ${code}`);
  });
}

main().catch(console.error);
