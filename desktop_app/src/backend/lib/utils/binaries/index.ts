/**
 * This file is used to get the path to the binaries for a list of supported binaries.
 *
 * See https://stackoverflow.com/questions/33152533/bundling-precompiled-binary-into-electron-app
 */
import { ChildProcess, spawn } from 'child_process';
import { app } from 'electron';
import fs from 'fs';
import { arch, platform } from 'os';
import path from 'path';

type SupportedPlatform = 'linux' | 'mac' | 'win';
type SupportedArchitecture = 'arm64' | 'x86_64';
type SupportedBinary = 'ollama-v0.9.6' | 'podman-remote-static-v5.5.2';

const getPlatform = (): SupportedPlatform => {
  switch (platform()) {
    case 'aix':
    case 'freebsd':
    case 'linux':
    case 'openbsd':
    case 'android':
      return 'linux';
    case 'darwin':
    case 'sunos':
      return 'mac';
    case 'win32':
      return 'win';
    default:
      throw new Error(`Unsupported platform: ${platform()}`);
  }
};

const getArchitecture = (): SupportedArchitecture => {
  switch (arch()) {
    // 32-bit ARM, different from aarch64
    // case 'arm':
    //   return 'arm';
    // case 'ia32':
    //   return 'x86';
    case 'arm64':
      return 'arm64';
    // this is the same as x86_64
    case 'x64':
      return 'x86_64';
    default:
      throw new Error(`Unsupported architecture: ${arch()}`);
  }
};

const PLATFORM = getPlatform();
const ARCHITECTURE = getArchitecture();

const binariesPath = app.isPackaged
  ? path.join(process.resourcesPath, 'bin')
  : path.join(app.getAppPath(), 'resources', 'bin', PLATFORM, ARCHITECTURE);

export const getBinaryExecPath = (binaryName: SupportedBinary) => {
  const binaryPath = path.resolve(path.join(binariesPath, `${binaryName}${PLATFORM === 'win' ? '.exe' : ''}`));
  if (!fs.existsSync(binaryPath)) {
    throw new Error(`Binary ${binaryName} not found at ${binaryPath}`);
  }
  return binaryPath;
};

export default class BinaryRunner {
  private process: ChildProcess | null = null;
  private isRunning: boolean = false;

  private PROCESS_NAME: string;
  private BINARY_NAME: SupportedBinary;
  private COMMAND_ARGS: string[];
  private COMMAND_ENV: NodeJS.ProcessEnv;

  constructor(processName: string, binaryName: SupportedBinary, commandArgs: string[], commandEnv: NodeJS.ProcessEnv) {
    this.PROCESS_NAME = processName;
    this.BINARY_NAME = binaryName;
    this.COMMAND_ARGS = commandArgs;
    this.COMMAND_ENV = commandEnv;
  }

  /**
   * Start the process
   */
  async startProcess(): Promise<void> {
    if (this.isRunning) {
      console.log(`${this.PROCESS_NAME} is already running`);
      return;
    }

    try {
      // Get the binary path
      const binaryPath = getBinaryExecPath(this.BINARY_NAME);
      console.log(`Using ${this.BINARY_NAME} binary: ${binaryPath}`);

      // Spawn the process
      this.process = spawn(binaryPath, this.COMMAND_ARGS, {
        env: this.COMMAND_ENV,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      // Handle stdout
      this.process.stdout?.on('data', (data) => {
        console.log(`[${this.PROCESS_NAME} stdout]: ${data.toString()}`);
      });

      // Handle stderr
      this.process.stderr?.on('data', (data) => {
        console.error(`[${this.PROCESS_NAME} stderr]: ${data.toString()}`);
      });

      // Handle process exit
      this.process.on('exit', (code, signal) => {
        console.log(`${this.PROCESS_NAME} exited with code ${code} and signal ${signal}`);
        this.isRunning = false;
        this.process = null;
      });

      // Handle errors
      this.process.on('error', (error) => {
        console.error(`Failed to start ${this.PROCESS_NAME}:`, error);
        this.isRunning = false;
        this.process = null;
      });

      this.isRunning = true;

      console.log(`${this.PROCESS_NAME} started successfully`);
    } catch (error) {
      console.error(`Failed to start ${this.PROCESS_NAME}:`, error);
      throw error;
    }
  }

  /**
   * Stop the process
   */
  async stopProcess(): Promise<void> {
    if (!this.isRunning || !this.process) {
      console.log(`${this.PROCESS_NAME} is not running`);
      return;
    }

    console.log(`Stopping ${this.PROCESS_NAME}...`);

    return new Promise((resolve) => {
      if (this.process) {
        this.process.once('exit', () => {
          this.isRunning = false;
          this.process = null;
          console.log(`${this.PROCESS_NAME} stopped`);
          resolve();
        });

        // Try graceful shutdown first
        this.process.kill('SIGTERM');

        // Force kill after 5 seconds if still running
        setTimeout(() => {
          if (this.process) {
            console.log(`Force killing ${this.PROCESS_NAME}`);
            this.process.kill('SIGKILL');
          }
        }, 5000);
      } else {
        resolve();
      }
    });
  }
}
