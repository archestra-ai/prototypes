import { containerCreate, containerStart, containersStatsAllLibpod } from '@backend/lib/clients/libpod/gen/sdk.gen';

export default class PodmanContainer {
  private containerName: string;
  private imageName: string;
  private containerPort: number;
  private hostPort: number;
  private envVars: string[];

  constructor(imageName: string, containerPort: number, hostPort: number, envVars: Record<string, string>) {
    this.containerName = `archestra-ai-${imageName.replaceAll('/', '-')}-mcp-server`;
    this.imageName = imageName;
    this.containerPort = containerPort;
    this.hostPort = hostPort;
    this.envVars = Object.entries(envVars).map(([key, value]) => `${key}=${value}`);
  }

  private async checkContainerStatus(): Promise<{ exists: boolean; isRunning: boolean }> {
    try {
      const { response, data } = await containersStatsAllLibpod({
        query: {
          containers: [this.containerName],
          stream: false,
        },
      });

      if (response.status === 404) {
        console.log(`Container ${this.containerName} does not exist`);
        return { exists: false, isRunning: false };
      } else if (response.status !== 200) {
        console.error(`Error checking if container ${this.containerName} is running`, response);
        return { exists: true, isRunning: false };
      } else if (data && data.UpTime !== 0) {
        console.log(`Container ${this.containerName} is running`);
        return { exists: true, isRunning: true };
      } else {
        console.log(`Container ${this.containerName} is not running`);
        return { exists: true, isRunning: false };
      }
    } catch (error) {
      console.error(`Error checking if container ${this.containerName} is running`, error);
      return { exists: false, isRunning: false };
    }
  }

  private async startContainer() {
    try {
      const response = await containerStart({
        path: {
          name: this.containerName,
        },
      });
      return response;
    } catch (error) {
      console.error(`Error starting container ${this.containerName}`, error);
      throw error;
    }
  }

  /**
   * https://docs.podman.io/en/latest/_static/api.html#tag/containers-(compat)/operation/ContainerCreate
   */
  async startOrCreateContainer() {
    const { exists, isRunning } = await this.checkContainerStatus();
    if (exists && isRunning) {
      console.log(`Container ${this.containerName} is already running`);
      return;
    } else if (exists && !isRunning) {
      console.log(`Container ${this.containerName} exists but is not running, starting it`);
      await this.startContainer();
      return;
    }

    console.log(
      `Container ${this.containerName} does not exist, creating it with image ${this.imageName} on port ${this.containerPort}, and starting it`
    );

    try {
      const response = await containerCreate({
        body: {
          Name: this.containerName,
          Image: this.imageName,
          Env: this.envVars,
          ExposedPorts: {
            [this.containerPort]: {
              HostPort: this.hostPort,
            },
          },
        },
      });
      return response;
    } catch (error) {
      console.error(`Error creating container ${this.containerName}`, error);
      throw error;
    }
  }
}
