import BinaryRunner from '@backend/lib/utils/binaries';

class PodmanRuntime {
  private installedMachineName: string | null = null;

  private getPodmanBinaryRunner(
    commandArgs: string[],
    onStdout?: (data: string) => void,
    onStderr?: (data: string) => void
  ) {
    return new BinaryRunner('podman', 'podman-remote-static-v5.5.2', commandArgs, {}, onStdout, onStderr);
  }

  private parsePodmanMachineLsOutput(output: string) {
    const lines = output.split('\n');
    const machineName = lines[1].split(' ')[0];
    return machineName;
  }

  /**
   * An example of the output of the `podman machine ls` command:
   *
   * ❯ ./podman-remote-static-v5.5.2 machine ls
   * NAME                     VM TYPE     CREATED        LAST UP     CPUS        MEMORY      DISK SIZE
   * podman-machine-default*  applehv     3 minutes ago  Never       5           2GiB        100GiB
   */
  async checkInstalledMachines() {
    const machineLsCommand = this.getPodmanBinaryRunner(['machine', 'ls'], (data) => {
      this.installedMachineName = this.parsePodmanMachineLsOutput(data);
    });
    machineLsCommand.startProcess();
  }

  async ensurePodmanIsInstalled() {
    await this.checkInstalledMachines();

    if (!this.installedMachineName) {
      console.error('Podman is not installed');
      return false;
    } else {
      console.log(`Podman is installed and running on machine ${this.installedMachineName}`);
      return true;
    }
  }
}

export default new PodmanRuntime();
