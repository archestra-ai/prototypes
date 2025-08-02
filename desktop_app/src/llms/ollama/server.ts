import { ChildProcess, spawn } from 'child_process';
import * as net from 'net';
import * as path from 'path';
import { app } from 'electron';
import * as os from 'os';

export default class OllamaServer {
  private serverProcess: ChildProcess | null = null;
  private port: number | null = null;
  private isRunning: boolean = false;

  constructor() {}

  /**
   * Get a random available port
   */
  private async getAvailablePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = net.createServer();
      server.listen(0, '127.0.0.1', () => {
        const { port } = server.address() as net.AddressInfo;
        server.close(() => resolve(port));
      });
      server.on('error', reject);
    });
  }

  /**
   * Get the platform-specific Ollama binary path
   */
  private getOllamaBinaryPath(): string {
    const platform = os.platform();
    const arch = os.arch();
    
    let binaryName: string;
    
    if (platform === 'darwin') {
      if (arch === 'arm64') {
        binaryName = 'ollama-v0.9.6-aarch64-apple-darwin';
      } else {
        binaryName = 'ollama-v0.9.6-x64_64-apple-darwin';
      }
    } else if (platform === 'win32') {
      binaryName = 'ollama-v0.9.6-x86_64-pc-windows-msvc.exe';
    } else if (platform === 'linux') {
      if (arch === 'arm64') {
        binaryName = 'ollama-v0.9.6-aarch64-unknown-linux-gnu';
      } else {
        binaryName = 'ollama-v0.9.6-x86_64-unknown-linux-gnu';
      }
    } else {
      throw new Error(`Unsupported platform: ${platform}`);
    }

    // In development, use the resources directory
    // In production, binaries will be in the app's resources directory
    const isDev = !app.isPackaged;
    const resourcesPath = isDev 
      ? path.join(app.getAppPath(), 'resources', 'binaries')
      : path.join(process.resourcesPath, 'binaries');
    
    return path.join(resourcesPath, binaryName);
  }

  /**
   * Start the Ollama server
   */
  async startServer(): Promise<void> {
    if (this.isRunning) {
      console.log('Ollama server is already running');
      return;
    }

    try {
      // Get an available port
      this.port = await this.getAvailablePort();
      console.log(`Starting Ollama server on port ${this.port}`);

      // Get the binary path
      const binaryPath = this.getOllamaBinaryPath();
      console.log(`Using Ollama binary: ${binaryPath}`);

      // Set up environment variables
      const env = {
        ...process.env,
        OLLAMA_HOST: `127.0.0.1:${this.port}`,
        OLLAMA_ORIGINS: 'http://localhost:54587',
        OLLAMA_DEBUG: '0'
      };

      // Spawn the Ollama process
      this.serverProcess = spawn(binaryPath, ['serve'], {
        env,
        stdio: ['ignore', 'pipe', 'pipe']
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
        this.port = null;
      });

      // Handle errors
      this.serverProcess.on('error', (error) => {
        console.error('Failed to start Ollama server:', error);
        this.isRunning = false;
        this.serverProcess = null;
        this.port = null;
      });

      this.isRunning = true;
      
      // Give the server a moment to start up
      await new Promise(resolve => setTimeout(resolve, 2000));
      
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
          this.port = null;
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

  /**
   * Get the current port the server is running on
   */
  getPort(): number | null {
    return this.port;
  }

  /**
   * Check if the server is running
   */
  isServerRunning(): boolean {
    return this.isRunning;
  }
}
