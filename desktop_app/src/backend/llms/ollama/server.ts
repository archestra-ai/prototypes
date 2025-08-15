import { ChildProcess, spawn } from 'child_process';

import config from '@backend/config';
import { getBinaryExecPath } from '@backend/utils/binaries';
import log from '@backend/utils/logger';

class OllamaServer {
  private serverProcess: ChildProcess | null = null;
  private port = config.ollama.server.port;
  private isRunning: boolean = false;
  private binaryPath = getBinaryExecPath('ollama-v0.11.4');

  /**
   * Start the Ollama server
   */
  async startServer(): Promise<void> {
    if (this.isRunning) {
      log.info('Ollama server is already running');
      return;
    }

    try {
      log.info(`Starting Ollama server on port ${this.port}`);

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
        log.info(`[Ollama stdout]: ${data.toString()}`);
      });

      // Handle stderr
      this.serverProcess.stderr?.on('data', (data) => {
        log.error(`[Ollama stderr]: ${data.toString()}`);
      });

      // Handle process exit
      this.serverProcess.on('exit', (code, signal) => {
        log.info(`Ollama server exited with code ${code} and signal ${signal}`);
        this.isRunning = false;
        this.serverProcess = null;
      });

      // Handle errors
      this.serverProcess.on('error', (error) => {
        log.error('Failed to start Ollama server:', error);
        this.isRunning = false;
        this.serverProcess = null;
      });

      this.isRunning = true;

      log.info(`Ollama server started successfully on port ${this.port}`);

      // Ensure required models are available
      await this.ensureModelsAvailable();
    } catch (error) {
      log.error('Failed to start Ollama server:', error);
      throw error;
    }
  }

  /**
   * Ensure required models are available
   */
  private async ensureModelsAvailable(): Promise<void> {
    const requiredModels = config.ollama.requiredModels;

    for (const model of requiredModels) {
      log.info(`Checking if model ${model} is available...`);

      try {
        // Check if model exists by trying to get its info
        const response = await fetch(`${config.ollama.server.host}/api/show`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name: model }),
        });

        if (response.status === 404) {
          // Model doesn't exist, need to pull it
          log.info(`Model ${model} not found. Pulling...`);
          await this.pullModel(model);
        } else if (response.ok) {
          log.info(`Model ${model} is already available`);
        } else {
          log.error(`Failed to check model ${model}: ${response.statusText}`);
        }
      } catch (error) {
        log.error(`Error checking model ${model}:`, error);
      }
    }
  }

  /**
   * Pull a model from Ollama
   */
  private async pullModel(modelName: string): Promise<void> {
    try {
      const response = await fetch(`${config.ollama.server.host}/api/pull`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: modelName, stream: true }),
      });

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter((line) => line.trim());

        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (data.status) {
              log.info(`Pulling ${modelName}: ${data.status}`);
            }
            if (data.error) {
              throw new Error(data.error);
            }
          } catch (e) {
            // Ignore JSON parse errors for incomplete chunks
          }
        }
      }

      log.info(`Successfully pulled model ${modelName}`);
    } catch (error) {
      log.error(`Failed to pull model ${modelName}:`, error);
      throw error;
    }
  }

  /**
   * Stop the Ollama server
   */
  async stopServer(): Promise<void> {
    if (!this.isRunning || !this.serverProcess) {
      log.info('Ollama server is not running');
      return;
    }

    log.info('Stopping Ollama server...');

    return new Promise((resolve) => {
      if (this.serverProcess) {
        this.serverProcess.once('exit', () => {
          this.isRunning = false;
          this.serverProcess = null;
          log.info('Ollama server stopped');
          resolve();
        });

        // Try graceful shutdown first
        this.serverProcess.kill('SIGTERM');

        // Force kill after 5 seconds if still running
        setTimeout(() => {
          if (this.serverProcess) {
            log.info('Force killing Ollama server');
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
