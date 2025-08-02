/**
 * Server Process Entry Point
 *
 * This file serves as a separate entry point for the Fastify server process.
 * It's built as a standalone JavaScript file by Vite and executed in a forked
 * Node.js process (not Electron renderer process).
 *
 * Why this exists:
 * 1. Electron's main process uses a different module system than our server code
 * 2. The server needs to run in a pure Node.js environment for native modules
 * 3. This separation allows hot-reloading of server code during development
 *
 * The forge.config.ts defines this as a build target, producing server-process.js
 * which main.ts spawns as a child process with ELECTRON_RUN_AS_NODE=1
 */
import './backend/server/index';
