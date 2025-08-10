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
import OllamaServer from '@backend/llms/ollama/server';
import McpServerSandboxManager from '@backend/sandbox';
import { startFastifyServer } from '@backend/server';
import WebSocketServer from '@backend/websocket';

const startup = async () => {
  McpServerSandboxManager.onSandboxStartupSuccess = () => {
    console.log('Sandbox startup successful 🥳');
  };
  McpServerSandboxManager.onSandboxStartupError = (error) => {
    console.error('Sandbox startup error 🥲:', error);
  };
  McpServerSandboxManager.start();

  WebSocketServer.start();
  await startFastifyServer();

  await OllamaServer.startServer();
};

/**
 * Cleanup function to gracefully shut down all services
 */
const cleanup = async () => {
  console.log('🛑 Server process cleanup starting...');

  try {
    // Stop the WebSocket server
    console.log('Stopping WebSocket server...');
    WebSocketServer.stop();

    // Stop the sandbox and all MCP servers
    console.log('Turning off sandbox...');
    McpServerSandboxManager.turnOffSandbox();

    // Stop the Ollama server
    console.log('Stopping Ollama server...');
    await OllamaServer.stopServer();

    console.log('✅ Server process cleanup completed');
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
  }
};

// Handle graceful shutdown on various signals
process.on('SIGTERM', async () => {
  console.log('Received SIGTERM signal');
  await cleanup();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Received SIGINT signal (Ctrl+C)');
  await cleanup();
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', async (error) => {
  console.error('Uncaught exception:', error);
  await cleanup();
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', async (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  await cleanup();
  process.exit(1);
});

// Handle process exit
process.on('exit', (code) => {
  console.log(`Server process exiting with code: ${code}`);
});

startup();
