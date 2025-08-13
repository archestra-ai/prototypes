/**
 * NOTE: ARCHESTRA_USER_DATA_PATH and ARCHESTRA_LOGS_PATH are set in the main process
 *
 * see main.ts for more details
 */
import path from 'node:path';

export const USER_DATA_DIRECTORY = process.env.ARCHESTRA_USER_DATA_PATH;
export const LOGS_DIRECTORY = process.env.ARCHESTRA_LOGS_PATH;

export const DATABASE_PATH = path.join(USER_DATA_DIRECTORY, 'archestra.db');
export const PODMAN_REGISTRY_AUTH_FILE_PATH = path.join(USER_DATA_DIRECTORY, 'podman', 'auth.json');
