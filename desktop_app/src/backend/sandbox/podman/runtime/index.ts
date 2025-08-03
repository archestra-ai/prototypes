import { spawn } from 'node:child_process';

import { getBinaryExecPath } from '@backend/lib/utils/binaries';

class PodmanRuntime {
  private ARCHESTRA_MACHINE_NAME = 'archestra-ai-machine';
  private machineIsInstalled: boolean = false;
  private machineIsRunning: boolean = false;

  private binaryPath = getBinaryExecPath('podman-remote-static-v5.5.2');

  private runCommand(
    command: string[],
    onStdout: (data: string) => void,
    onStderr: (data: string) => void,
    onExit: (code: number, signal: string) => void,
    onError: (error: Error) => void,
    asJsonFormat = false
  ): void;
  private runCommand<T>(
    command: string[],
    onStdout: (data: T) => void,
    onStderr: (data: string) => void,
    onExit: (code: number, signal: string) => void,
    onError: (error: Error) => void,
    asJsonFormat = true
  ): void {
    const commandArgs = asJsonFormat ? [...command, '--format=json'] : command;
    const process = spawn(this.binaryPath, commandArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    process.stdout?.on('data', (data) => {
      let parsedData;
      if (asJsonFormat) {
        parsedData = JSON.parse(data.toString()) as T;
      } else {
        parsedData = data.toString();
      }

      console.log(`[Podman stdout]: ${parsedData}`);
      onStdout(parsedData);
    });
    process.stderr?.on('data', (data) => {
      onStderr(data.toString());
    });
    process.on('exit', onExit);
    process.on('error', onError);
  }

  /**
   * Output looks like this:
   *
   * ❯ ./podman-remote-static-v5.5.2 machine start
   * Starting machine "podman-machine-default"
   *
   * This machine is currently configured in rootless mode. If your containers
   * require root permissions (e.g. ports < 1024), or if you run into compatibility
   * issues with non-podman clients, you can switch using the following command:
   *
   *   podman machine set --rootful
   *
   * API forwarding listening on: /var/run/docker.sock
   * Docker API clients default to this address. You do not need to set DOCKER_HOST.
   *
   *   Machine "podman-machine-default" started successfully
   *
   */
  private async startMachine() {
    console.log('Starting podman machine');

    this.runCommand(
      ['machine', 'start'],
      (output) => {
        console.log(`[Podman stdout]: ${output}`);
      },
      (error) => {
        console.error(`[Podman stderr]: ${error}`);
      },
      (code, signal) => {
        console.log(`[Podman exit]: ${code} ${signal}`);
      },
      (error) => {
        console.error(`[Podman error]: ${error}`);
      }
    );
  }

  /**
   *
   * Output looks like this (while installing):
   * ❯ ./podman-remote-static-v5.5.2 machine init
   * Looking up Podman Machine image at quay.io/podman/machine-os:5.5 to create VM
   * Extracting compressed file: podman-machine-default-arm64.raw [=============================================================================>] 885.6MiB / 885.7MiB
   *
   *
   * Once installation is complete, output looks like this:
   *
   * ❯ ./podman-remote-static-v5.5.2 machine init
   * Looking up Podman Machine image at quay.io/podman/machine-os:5.5 to create VM
   * Extracting compressed file: podman-machine-default-arm64.raw: done
   * Machine init complete
   * To start your machine run:
   *
   *   podman machine start
   *
   */
  private initMachine() {
    console.log('Initializing podman machine');

    this.runCommand(
      ['machine', 'init'],
      (output) => {},
      (error) => {},
      (code, signal) => {},
      (error) => {
        console.error(`[Podman error]: ${error}`);
      }
    );
  }

  /**
   * An example of the output of the `podman machine ls` command:
   *
   * When there is no machine installed:
   *
   * ❯ ./podman-remote-static-v5.5.2 machine ls
   * NAME        VM TYPE     CREATED     LAST UP     CPUS        MEMORY      DISK SIZE
   *
   * When a machine is installed, but not started:
   *
   * ❯ ./podman-remote-static-v5.5.2 machine ls
   * NAME                     VM TYPE     CREATED        LAST UP     CPUS        MEMORY      DISK SIZE
   * podman-machine-default*  applehv     3 minutes ago  Never       5           2GiB        100GiB
   *
   * When a machine is installed, and started:
   *
   * ❯ ./podman-remote-static-v5.5.2 machine ls
   * NAME                     VM TYPE     CREATED         LAST UP            CPUS        MEMORY      DISK SIZE
   * podman-machine-default*  applehv     14 minutes ago  Currently running  5           2GiB        100GiB
   *
   *
   */
  async checkInstalledMachines() {
    console.log('Checking podman installed machines');

    const machineLsCommand = this.getPodmanBinaryRunner(['machine', 'ls'], (output) => {
      const lines = output.split('\n');
      const firstLine = lines[1];
      const machineName = firstLine.split(' ')[0];

      /**
       * TODO: need to properly handle all of the above documented cases
       */
      if (firstLine.includes('Currently running')) {
        this.installedMachineName = machineName;
        this.installedMachineIsRunning = true;
      } else if (firstLine.includes('Never')) {
        this.installedMachineName = machineName;
      } else {
      }
    });
    machineLsCommand.startProcess();
  }

  async ensurePodmanIsInstalled() {
    await this.checkInstalledMachines();

    // if (!this.installedMachineName) {
    //   console.error('Podman is not installed');
    //   return false;
    // } else {
    //   console.log(`Podman is installed and running on machine ${this.installedMachineName}`);
    //   return true;
    // }
  }

  async stopPodmanMachine() {
    const stopMachineCommand = this.getPodmanBinaryRunner(['machine', 'stop']);
    stopMachineCommand.startProcess();
  }
}

export default new PodmanRuntime();
