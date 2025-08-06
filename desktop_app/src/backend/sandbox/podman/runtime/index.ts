import { spawn } from 'node:child_process';

import { PodmanMachineStatus } from '@archestra/types';
import PodmanImage from '@backend/sandbox/podman/image';
import { getBinariesDirectory, getBinaryExecPath } from '@backend/utils/binaries';
import websocketService from '@backend/websocket';

import { PodmanMachineListOutput } from './types';

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

/**
 * https://docs.podman.io/en/latest/markdown/podman-machine.1.html
 */
export default class PodmanRuntime {
  private ARCHESTRA_MACHINE_NAME = 'archestra-ai-machine';
  private _machineStatus: PodmanMachineStatus = 'not_installed';

  private onMachineInstallationSuccess: () => void = () => {};
  private onMachineInstallationError: (error: Error) => void = () => {};

  private binaryPath = getBinaryExecPath('podman-remote-static-v5.5.2');

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
    this.onMachineInstallationSuccess = onMachineInstallationSuccess;
    this.onMachineInstallationError = onMachineInstallationError;
  }

  async pullBaseImageOnMachineInstallationSuccess() {
    try {
      websocketService.broadcast({
        type: 'sandbox-base-image-fetch-started',
        payload: {},
      });

      const image = new PodmanImage();
      await image.pullBaseImage();

      websocketService.broadcast({
        type: 'sandbox-base-image-fetch-completed',
        payload: {},
      });
    } catch (error) {
      websocketService.broadcast({
        type: 'sandbox-base-image-fetch-failed',
        payload: {
          error: `There was an error pulling the base image: ${error.message}`,
        },
      });

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
    this._machineStatus = 'initializing';
    this.runCommand({
      command: ['machine', 'start', this.ARCHESTRA_MACHINE_NAME],
      pipes: {
        onStdout: {
          callback: (data) => {
            const output = typeof data === 'string' ? data : JSON.stringify(data);
            // Look for "Starting machine" to indicate progress
            if (output.includes('Starting machine')) {
              websocketService.broadcast({
                type: 'sandbox-podman-runtime-progress',
                payload: {
                  percentage: 50,
                  message: 'Starting podman machine...',
                },
              });
            } else if (output.includes('started successfully')) {
              websocketService.broadcast({
                type: 'sandbox-podman-runtime-progress',
                payload: {
                  percentage: 100,
                  message: 'Podman machine started successfully',
                },
              });
            }
          },
        },
        onStderr: (data) => {
          stderrOutput += data;
        },
        onExit: (code, signal) => {
          if (code === 0) {
            this._machineStatus = 'running';
            // Call the success callback - socket setup will happen there first
            this.onMachineInstallationSuccess();
          } else {
            this._machineStatus = 'stopped';
            this.onMachineInstallationError(
              new Error(`Podman machine start failed with code ${code} and signal ${signal}. Error: ${stderrOutput}`)
            );
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
    this._machineStatus = 'initializing';
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

              websocketService.broadcast({
                type: 'sandbox-podman-runtime-progress',
                payload: {
                  percentage,
                  message: `Extracting podman machine image: ${current}MiB / ${total}MiB`,
                },
              });
            } else if (output.includes('Machine init complete')) {
              websocketService.broadcast({
                type: 'sandbox-podman-runtime-progress',
                payload: {
                  percentage: 90,
                  message: 'Machine initialization complete',
                },
              });
            } else if (output.includes('started successfully')) {
              websocketService.broadcast({
                type: 'sandbox-podman-runtime-progress',
                payload: {
                  percentage: 100,
                  message: 'Podman machine started successfully',
                },
              });
            }
          },
        },
        onExit: (code, signal) => {
          if (code === 0) {
            this._machineStatus = 'running';
            // Call the success callback - socket setup will happen there first
            this.onMachineInstallationSuccess();
          } else {
            this._machineStatus = 'not_installed';
            this.onMachineInstallationError(
              new Error(`Podman machine init failed with code ${code} and signal ${signal}`)
            );
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
              this._machineStatus = 'running';
              // Call the success callback - socket setup will happen there first
              this.onMachineInstallationSuccess();
            } else {
              // The archesta podman machine is installed, but not running. Let's start it.
              this._machineStatus = 'stopped';
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
            this._machineStatus = 'stopped';
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

  get machineStatus() {
    return this._machineStatus;
  }
}
