import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

import PodmanImage, { PodmanImageStatusSummarySchema } from '@backend/sandbox/podman/image';
import { getBinariesDirectory, getBinaryExecPath } from '@backend/utils/binaries';

export const PodmanRuntimeStatusSummarySchema = z.object({
  /**
   * startupPercentage is a number between 0 and 100 that represents the percentage of the startup process that has been completed.
   */
  startupPercentage: z.number().min(0).max(100),
  /**
   * startupMessage is a string that gives a human-readable description of the current state of the startup process.
   */
  startupMessage: z.string().nullable(),
  /**
   * startupError is a string that gives a human-readable description of the error that occurred during the startup process (if one has)
   */
  startupError: z.string().nullable(),
  baseImage: PodmanImageStatusSummarySchema,
});

type PodmanRuntimeStatusSummary = z.infer<typeof PodmanRuntimeStatusSummarySchema>;

type RunCommandPipes<T extends object | object[]> = {
  onStdout?: {
    callback: (data: T | string) => void;
    attemptToParseOutputAsJson?: boolean;
  };
  onStderr?: (data: string) => void;
  onExit?: (code: number, signal: string) => void;
  onError?: (error: Error) => void;
};

type RunCommandOptions<T extends object | object[]> = {
  command: string[];
  pipes: RunCommandPipes<T>;
};

export type PodmanMachineListOutput = {
  Name: string;
  Default: boolean;
  Created: string;
  Running: boolean;
  Starting: boolean;
  LastUp: string;
  Stream: string;
  VMType: string;
  CPUs: number;
  Memory: string;
  DiskSize: string;
  Port: number;
  RemoteUsername: string;
  IdentityPath: string;
  UserModeNetworking: boolean;
}[];

export type PodmanMachineInspectOutput = {
  ConfigDir: {
    Path: string;
  };
  ConnectionInfo: {
    PodmanSocket: {
      Path: string;
    };
    PodmanPipe: null;
  };
  Resources: {
    CPUs: number;
    DiskSize: number;
    Memory: number;
    USBs: string[];
  };
  SSHConfig: {
    IdentityPath: string;
    Port: number;
    RemoteUsername: string;
  };
  UserModeNetworking: boolean;
  Rootful: boolean;
  Rosetta: boolean;
}[];

/**
 * https://docs.podman.io/en/latest/markdown/podman-machine.1.html
 */
export default class PodmanRuntime {
  private ARCHESTRA_MACHINE_NAME = 'archestra-ai-machine';

  private _machineStartupPercentage = 0;
  private _machineStartupMessage: string | null = null;
  private _machineStartupError: string | null = null;

  private onMachineInstallationSuccess: () => void = () => {};
  private onMachineInstallationError: (error: Error) => void = () => {};

  private registryAuthFilePath: string;
  private binaryPath = getBinaryExecPath('podman-remote-static-v5.5.2');

  private baseImage: PodmanImage;

  /**
   * NOTE: see here as to why we need to bundle, and configure, `gvproxy`, alongside `podman`:
   * https://podman-desktop.io/docs/troubleshooting/troubleshooting-podman-on-macos#unable-to-set-custom-binary-path-for-podman-on-macos
   * https://github.com/containers/podman/issues/11960#issuecomment-953672023
   *
   * NOTE: `gvproxy` MUST be named explicitly `gvproxy`. It cannot have the version appended to it, this is because
   * `podman` internally is looking specifically for that binary naming convention. As of this writing, the version
   * of `gvproxy` that we are using is [`v0.8.6`](https://github.com/containers/gvisor-tap-vsock/releases/tag/v0.8.6)
   *
   * See also `CONTAINERS_HELPER_BINARY_DIR` env var which is being passed into our podman commands below.
   */
  private gvproxyBinaryDirectory = getBinariesDirectory();

  constructor(onMachineInstallationSuccess: () => void, onMachineInstallationError: (error: Error) => void) {
    this.baseImage = new PodmanImage();

    this.onMachineInstallationSuccess = onMachineInstallationSuccess;
    this.onMachineInstallationError = onMachineInstallationError;

    /*
     * TODO: Use app.getPath('<thing>') from Electron to get proper directory where to store this sort of config
     *
     * Currently we're hardcoding to ~/Desktop/archestra/podman/auth.json because:
     * - This code runs in the backend Node.js process, not the Electron main process
     * - app.getPath() is only available in the Electron main process
     * - We need to either:
     *   1. Pass the path from the main process when starting the backend server
     *   2. Use IPC to request the path from the main process
     *   3. Use an environment variable set by the main process
     *
     * For now, using a hardcoded path for simplicity during development.
     */
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    this.registryAuthFilePath = path.join(homeDir, 'Desktop', 'archestra', 'podman', 'auth.json');

    // https://docs.podman.io/en/v5.2.2/markdown/podman-create.1.html#authfile-path
    if (!fs.existsSync(this.registryAuthFilePath)) {
      fs.mkdirSync(path.dirname(this.registryAuthFilePath), { recursive: true });
      fs.writeFileSync(this.registryAuthFilePath, '{}');
    }
  }

  async pullBaseImageOnMachineInstallationSuccess() {
    try {
      await this.baseImage.pullBaseImage();
    } catch (error) {
      throw error; // Re-throw to be handled by caller
    }
  }

  private runCommand<T extends object | object[]>({
    command,
    pipes: { onStdout, onStderr, onExit, onError },
  }: RunCommandOptions<T>): void {
    const commandForLogs = `${this.binaryPath} ${command.join(' ')}`;

    console.log(`[Podman command]: running ${commandForLogs}`);

    const commandProcess = spawn(this.binaryPath, command, {
      env: {
        ...process.env,
        /**
         * See here, `CONTAINERS_HELPER_BINARY_DIR` isn't well documented, but here is what I've found:
         * https://github.com/containers/podman/blob/0c4c9e4fbc0cf9cdcdcb5ea1683a2ffeddb03e77/hack/bats#L131
         * https://docs.podman.io/en/stable/markdown/podman.1.html#environment-variables
         */
        CONTAINERS_HELPER_BINARY_DIR: this.gvproxyBinaryDirectory,

        /**
         * Basically we don't want the podman machine to use the user's docker config (if one exists)
         *
         * From the podman docs (https://docs.podman.io/en/v5.2.2/markdown/podman-create.1.html#authfile-path):
         *
         * Path of the authentication file. Default is ${XDG_RUNTIME_DIR}/containers/auth.json on Linux, and $HOME/.
         * config/containers/auth.json on Windows/macOS. The file is created by podman login. If the authorization
         * state is not found there, $HOME/.docker/config.json is checked, which is set using docker login.
         *
         * Note: There is also the option to override the default path of the authentication file by setting the
         * REGISTRY_AUTH_FILE environment variable. This can be done with export REGISTRY_AUTH_FILE=path.
         */
        REGISTRY_AUTH_FILE: this.registryAuthFilePath,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (onStdout) {
      commandProcess.stdout?.on('data', (data) => {
        console.log(`[Podman stdout]: ${commandForLogs} ${data}`);

        let parsedData: T | string;
        if (onStdout.attemptToParseOutputAsJson) {
          try {
            parsedData = JSON.parse(data.toString()) as T;
          } catch (e) {
            console.error(
              `[Podman stdout]: ${commandForLogs} error parsing JSON: ${data}. Falling back to string parsing.`,
              e
            );
            parsedData = data.toString();
          }
        } else {
          parsedData = data.toString();
        }

        onStdout.callback(parsedData);
      });
    }

    if (onStderr) {
      commandProcess.stderr?.on('data', (data) => {
        console.log(`[Podman stderr]: ${commandForLogs} ${data}`);
        onStderr(data.toString());
      });
    }

    if (onExit) {
      commandProcess.on('exit', (code, signal) => {
        console.log(`[Podman exit]: ${commandForLogs} code=${code} signal=${signal}`);
        onExit(code, signal);
      });
    }

    if (onError) {
      commandProcess.on('error', (error) => {
        console.log(`[Podman error]: ${commandForLogs} ${error}`);
        onError(error);
      });
    }
  }

  /**
   * Output looks like this:
   * ❯ ./podman-remote-static-v5.5.2 machine start archestra-ai-machine
   * Starting machine "archestra-ai-machine"
   *
   * This machine is currently configured in rootless mode. If your containers
   * require root permissions (e.g. ports < 1024), or if you run into compatibility
   * issues with non-podman clients, you can switch using the following command:
   *
   *   podman machine set --rootful archestra-ai-machine
   *
   * API forwarding listening on: /var/run/docker.sock
   * Docker API clients default to this address. You do not need to set DOCKER_HOST.
   *
   * Machine "archestra-ai-machine" started successfully
   */
  private async startArchestraMachine() {
    let stderrOutput = '';

    this.runCommand({
      command: ['machine', 'start', this.ARCHESTRA_MACHINE_NAME],
      pipes: {
        onStdout: {
          callback: (data) => {
            const output = typeof data === 'string' ? data : JSON.stringify(data);
            // Look for "Starting machine" to indicate progress
            if (output.includes('Starting machine')) {
              this._machineStartupPercentage = 50;
              this._machineStartupMessage = 'Starting podman machine...';
            } else if (output.includes('started successfully')) {
              this._machineStartupPercentage = 100;
              this._machineStartupMessage = 'Podman machine started successfully';
            }
          },
        },
        onStderr: (data) => {
          stderrOutput += data;
        },
        onExit: (code, signal) => {
          if (code === 0) {
            this._machineStartupPercentage = 100;
            this._machineStartupMessage = 'Podman machine started successfully';

            // Call the success callback - socket setup will happen there first
            this.onMachineInstallationSuccess();
          } else {
            const errorMessage = `Podman machine start failed with code ${code} and signal ${signal}. Error: ${stderrOutput}`;

            this._machineStartupPercentage = 0;
            this._machineStartupMessage = errorMessage;

            this.onMachineInstallationError(new Error(errorMessage));
          }
        },
        onError: this.onMachineInstallationError,
      },
    });
  }

  /**
   * Output looks like this (while installing):
   * ❯ ./podman-remote-static-v5.5.2 machine init archestra-ai-machine --now
   * Looking up Podman Machine image at quay.io/podman/machine-os:5.5 to create VM
   * Extracting compressed file: podman-machine-default-arm64.raw [=============================================================================>] 885.6MiB / 885.7MiB
   *
   *
   * Once installation is complete, and the machine is started, output looks like this:
   *
   * ❯ ./podman-remote-static-v5.5.2 machine init archestra-ai-machine --now
   * Looking up Podman Machine image at quay.io/podman/machine-os:5.5 to create VM
   * Extracting compressed file: archestra-ai-machine-arm64.raw: done
   * Machine init complete
   * Starting machine "archestra-ai-machine"
   *
   * This machine is currently configured in rootless mode. If your containers
   * require root permissions (e.g. ports < 1024), or if you run into compatibility
   * issues with non-podman clients, you can switch using the following command:
   *
   *   podman machine set --rootful archestra-ai-machine
   *
   * API forwarding listening on: /var/run/docker.sock
   * Docker API clients default to this address. You do not need to set DOCKER_HOST.
   *
   *   Machine "archestra-ai-machine" started successfully
   *
   * ==============================
   * --now = Start machine now

  */
  private initArchestraMachine() {
    this._machineStartupPercentage = 0;
    this._machineStartupMessage = 'Initializing podman machine...';
    this._machineStartupError = null;

    this.runCommand({
      command: ['machine', 'init', '--now', this.ARCHESTRA_MACHINE_NAME],
      pipes: {
        onStdout: {
          callback: (data) => {
            const output = typeof data === 'string' ? data : JSON.stringify(data);

            // Parse extraction progress
            const extractionMatch = output.match(
              /Extracting compressed file:.*\[([=\s>]+)\]\s*(\d+\.?\d*)MiB\s*\/\s*(\d+\.?\d*)MiB/
            );
            if (extractionMatch) {
              const current = parseFloat(extractionMatch[2]);
              const total = parseFloat(extractionMatch[3]);
              const percentage = Math.round((current / total) * 100);

              this._machineStartupPercentage = percentage;
              this._machineStartupMessage = `Extracting podman machine image: ${current}MiB / ${total}MiB`;
            } else if (output.includes('Machine init complete')) {
              this._machineStartupPercentage = 90;
              this._machineStartupMessage = 'Machine initialization complete';
            } else if (output.includes('started successfully')) {
              this._machineStartupPercentage = 100;
              this._machineStartupMessage = 'Podman machine started successfully';
            }
          },
        },
        onExit: (code, signal) => {
          if (code === 0) {
            // Call the success callback - socket setup will happen there first
            this.onMachineInstallationSuccess();
          } else {
            const errorMessage = `Podman machine init failed with code ${code} and signal ${signal}`;

            this._machineStartupPercentage = 0;
            this._machineStartupMessage = errorMessage;

            this.onMachineInstallationError(new Error(errorMessage));
          }
        },
        onError: this.onMachineInstallationError,
      },
    });
  }

  /**
   * This method will check if the archesta podman machine is installed and running.
   * - If it's not installed, it will install it and start it.
   * - If it's installed but not running, it will start it.
   * - If it's installed and running, it will do nothing.
   *
   * ==============================
   *
   * NOTE: not sure under which circumstances podman machine ls will exit with a non-zero code,
   * or output to stderr, so we're not going to do anything with it for now
   */
  ensureArchestraMachineIsRunning() {
    this.runCommand<PodmanMachineListOutput>({
      command: ['machine', 'ls', '--format', 'json'],
      pipes: {
        onStdout: {
          attemptToParseOutputAsJson: true,
          callback: (installedPodmanMachines) => {
            if (!Array.isArray(installedPodmanMachines)) {
              this.onMachineInstallationError(
                new Error(`Podman machine ls returned non-array data: ${installedPodmanMachines}`)
              );
              return;
            }

            const archestraMachine = installedPodmanMachines.find(
              (machine) => machine.Name === this.ARCHESTRA_MACHINE_NAME
            );

            if (!archestraMachine) {
              // archestra podman machine is not installed, install (and start it)
              this.initArchestraMachine();
            } else if (archestraMachine.Running) {
              // We're all good to go. The archesta podman machine is installed and running.
              this._machineStartupPercentage = 100;
              this._machineStartupMessage = 'Podman machine is running';

              // Call the success callback - socket setup will happen there first
              this.onMachineInstallationSuccess();
            } else {
              // The archesta podman machine is installed, but not running. Let's start it.
              this._machineStartupPercentage = 25;
              this._machineStartupMessage = 'Podman machine is installed! Starting it...';

              this.startArchestraMachine();
            }
          },
        },
        onError: this.onMachineInstallationError,
      },
    });
  }

  /**
   * This method will stop the archesta podman machine.
   *
   * NOTE: for now we can just ignore stdio, stderr, and onExit callbacks..
   */
  stopArchestraMachine() {
    this.runCommand({
      command: ['machine', 'stop', this.ARCHESTRA_MACHINE_NAME],
      pipes: {
        onExit: (code) => {
          if (code === 0) {
            this._machineStartupPercentage = 0;
            this._machineStartupMessage = 'Podman machine stopped successfully';
            this._machineStartupError = null;
          }
        },
        onError: this.onMachineInstallationError,
      },
    });
  }

  /**
   * Get the socket address from the running podman machine.
   * This is needed to avoid conflicts with Docker/Orbstack.
   *
   * https://github.com/containers/podman/issues/16725#issuecomment-1338382533
   *
   * Output of this command looks like:
   *
   * $ podman machine inspect archestra-ai-machine --format '{{ .ConnectionInfo.PodmanSocket.Path }}'
   * /Users/myuser/.local/share/containers/podman/machine/archestra-ai-machine/podman.sock
   */
  async getSocketAddress(): Promise<string> {
    return new Promise((resolve, reject) => {
      let output = '';
      this.runCommand({
        command: [
          'machine',
          'inspect',
          this.ARCHESTRA_MACHINE_NAME,
          '--format',
          '{{ .ConnectionInfo.PodmanSocket.Path }}',
        ],
        pipes: {
          onStdout: {
            callback: (data) => {
              output += data.toString();
            },
          },
          onExit: (code) => {
            if (code === 0) {
              const socketPath = output.trim();
              if (socketPath) {
                console.log(`Found podman socket path: ${socketPath}`);
                resolve(socketPath);
              } else {
                reject(new Error('Could not find socket path in podman machine inspect output'));
              }
            } else {
              reject(new Error(`Failed to inspect podman machine. Exit code: ${code}`));
            }
          },
          onError: (error) => {
            reject(error);
          },
        },
      });
    });
  }

  get statusSummary(): PodmanRuntimeStatusSummary {
    return {
      startupPercentage: this._machineStartupPercentage,
      startupMessage: this._machineStartupMessage,
      startupError: this._machineStartupError,
      baseImage: this.baseImage.statusSummary,
    };
  }
}
