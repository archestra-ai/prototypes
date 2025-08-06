import { ServerConfig } from '@archestra/types';
import config from '@backend/config';
import { containerCreateLibpod, containerStartLibpod, containerWaitLibpod } from '@clients/libpod/gen/sdk.gen';

export default class PodmanContainer {
  private containerName: string;
  private command: string;
  private args: string[];
  private envVars: Record<string, string>;

  constructor(mcpServerSlug: string, serverConfig: ServerConfig) {
    this.containerName = `archestra-ai-${mcpServerSlug}-mcp-server`;
    this.command = serverConfig.command;
    this.args = serverConfig.args;
    this.envVars = serverConfig.env;
  }

  /**
   * Wait for container to be healthy
   * https://docs.podman.io/en/latest/_static/api.html#tag/containers/operation/ContainerWaitLibpod
   */
  private async waitContainerToBeHealthy() {
    try {
      return await containerWaitLibpod({
        path: {
          name: this.containerName,
        },
        query: {
          condition: ['healthy'],
        },
      });
    } catch (error) {
      console.error(`Error waiting for container ${this.containerName} to be healthy`, error);
      throw error;
    }
  }

  /**
   * https://docs.podman.io/en/latest/_static/api.html#tag/containers/operation/ContainerStartLibpod
   */
  private async startContainer() {
    try {
      return await containerStartLibpod({
        path: {
          name: this.containerName,
        },
      });
    } catch (error) {
      console.error(`Error starting container ${this.containerName}`, error);
      throw error;
    }
  }

  /**
   * https://docs.podman.io/en/latest/_static/api.html#tag/containers/operation/ContainerCreateLibpod
   */
  async startOrCreateContainer() {
    try {
      const { response } = await this.startContainer();

      if (response.status === 304) {
        console.log(`Container ${this.containerName} is already running.`);
        return;
      } else if (response.status === 204) {
        console.log(`Container ${this.containerName} started.`);
        return;
      }
    } catch (error) {
      console.error(`Error starting container ${this.containerName}`, error);
      throw error;
    }

    console.log(
      `Container ${this.containerName} does not exist, creating it with base image and command: ${this.command} ${this.args.join(' ')}`
    );

    try {
      const response = await containerCreateLibpod({
        body: {
          name: this.containerName,
          image: config.sandbox.baseDockerImage,
          command: [this.command, ...this.args],
          env: this.envVars,
          /**
           * Keep stdin open for interactive communication with MCP servers
           */
          stdin: true,
          /**
           * Remove indicates if the container should be removed once it has been started and exits. Optional
           */
          remove: true,
          // MCP servers communicate via stdin/stdout, not HTTP ports
          // portmappings: [
          //   {
          //     container_port: this.containerPort,
          //     host_port: this.hostPort,
          //   },
          // ],
        },
      });

      console.log(`Container ${this.containerName} created, now starting it`);
      await this.startContainer();

      // MCP servers don't have health checks, they communicate via stdin/stdout
      // Just verify the container is running
      console.log(`Container ${this.containerName} started`);
    } catch (error) {
      console.error(`Error creating container ${this.containerName}`, error);
      throw error;
    }
  }

  /**
   * NOTE: this isn't fully implemented/tested yet, just a placeholder for now 😅
   *
   * Need to figure out how to properly proxy stdio to the container..
   */
  proxyRequestToContainer(request: any) {
    console.log('Proxying request to MCP server', request);
  }
}
