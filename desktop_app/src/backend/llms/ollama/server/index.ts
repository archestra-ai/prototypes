import { ChildProcess, spawn } from 'child_process';

import config from '@backend/config';
import { getBinaryExecPath } from '@backend/utils/binaries';

class OllamaServer {
  private serverProcess: ChildProcess | null = null;
  private port = config.ollama.server.port;
  private isRunning: boolean = false;
  private binaryPath = getBinaryExecPath('ollama-v0.9.6');

  /**
   * Start the Ollama server
   */
  async startServer(): Promise<void> {
    if (this.isRunning) {
      console.log('Ollama server is already running');
      return;
    }

    try {
      console.log(`Starting Ollama server on port ${this.port}`);

      // Set up environment variables
      const env = {
        /**
         * Ollama needs the HOME environment variable to be set to the user's home directory
         * so that it can write to the user's .ollama directory
         */
        HOME: process.env.HOME,
        OLLAMA_HOST: `localhost:${this.port}`,
        OLLAMA_ORIGINS: 'http://localhost:54587',
        OLLAMA_DEBUG: '0',
      };

      // Spawn the Ollama process
      this.serverProcess = spawn(this.binaryPath, ['serve'], {
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      // Handle stdout
      this.serverProcess.stdout?.on('data', (data) => {
        console.log(`[Ollama stdout]: ${data.toString()}`);
      });

      // Handle stderr
      this.serverProcess.stderr?.on('data', (data) => {
        console.error(`[Ollama stderr]: ${data.toString()}`);
      });

      // Handle process exit
      this.serverProcess.on('exit', (code, signal) => {
        console.log(`Ollama server exited with code ${code} and signal ${signal}`);
        this.isRunning = false;
        this.serverProcess = null;
      });

      // Handle errors
      this.serverProcess.on('error', (error) => {
        console.error('Failed to start Ollama server:', error);
        this.isRunning = false;
        this.serverProcess = null;
      });

      this.isRunning = true;

      console.log(`Ollama server started successfully on port ${this.port}`);
    } catch (error) {
      console.error('Failed to start Ollama server:', error);
      throw error;
    }
  }

  /**
   * Stop the Ollama server
   */
  async stopServer(): Promise<void> {
    if (!this.isRunning || !this.serverProcess) {
      console.log('Ollama server is not running');
      return;
    }

    console.log('Stopping Ollama server...');

    return new Promise((resolve) => {
      if (this.serverProcess) {
        this.serverProcess.once('exit', () => {
          this.isRunning = false;
          this.serverProcess = null;
          console.log('Ollama server stopped');
          resolve();
        });

        // Try graceful shutdown first
        this.serverProcess.kill('SIGTERM');

        // Force kill after 5 seconds if still running
        setTimeout(() => {
          if (this.serverProcess) {
            console.log('Force killing Ollama server');
            this.serverProcess.kill('SIGKILL');
          }
        }, 5000);
      } else {
        resolve();
      }
    });
  }
}

export default new OllamaServer();
