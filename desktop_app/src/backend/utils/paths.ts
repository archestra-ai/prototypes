import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Get platform-specific application data directory
 * - macOS: ~/Library/Application Support/archestra
 * - Windows: %APPDATA%/archestra
 * - Linux: ~/.config/archestra
 */
export function getAppDataPath(): string {
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

/**
 * Get the logs directory path
 * Creates the directory if it doesn't exist
 */
export function getLogsPath(): string {
  const appDataPath = getAppDataPath();
  const logsPath = path.join(appDataPath, 'logs');

  // Ensure the directory exists
  if (!fs.existsSync(logsPath)) {
    fs.mkdirSync(logsPath, { recursive: true });
  }

  return logsPath;
}

/**
 * Get the path for a specific MCP server log file
 */
export function getMcpServerLogPath(containerName: string): string {
  const logsPath = getLogsPath();
  return path.join(logsPath, `${containerName}.log`);
}
