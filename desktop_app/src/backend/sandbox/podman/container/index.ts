import config from '@backend/config';
import type { McpServer, McpServerConfig, McpServerUserConfigValues } from '@backend/models/mcpServer';
import {
  containerAttachLibpod,
  containerCreateLibpod,
  containerStartLibpod,
  containerStopLibpod,
  containerWaitLibpod,
} from '@clients/libpod/gen';

export default class PodmanContainer {
  private containerName: string;
  private command: string;
  private args: string[];
  private envVars: Record<string, string>;

  constructor({ name, serverConfig, userConfigValues }: McpServer) {
    this.containerName = PodmanContainer.prettifyServerNameIntoContainerName(name);
    const { command, args, env } = PodmanContainer.injectUserConfigValuesIntoServerConfig(
      serverConfig,
      userConfigValues
    );

    this.command = command;
    this.args = args;
    this.envVars = env;
  }

  private static prettifyServerNameIntoContainerName = (serverName: string) =>
    `archestra-ai-${serverName.replace(/ /g, '-').toLowerCase()}-mcp-server`;

  // TODO: implement this
  private static injectUserConfigValuesIntoServerConfig = (
    serverConfig: McpServerConfig,
    userConfigValues: McpServerUserConfigValues
  ) => {
    return {
      command: serverConfig.command,
      args: serverConfig.args,
      env: {
        ...serverConfig.env,
      },
    };
  };

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
      console.error(`Error waiting for MCP server container ${this.containerName} to be healthy`, error);
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
      console.error(`Error starting MCP server container ${this.containerName}`, error);
      throw error;
    }
  }

  /**
   * https://docs.podman.io/en/latest/_static/api.html#tag/containers/operation/ContainerCreateLibpod
   */
  async startOrCreateContainer() {
    console.log(
      `Starting MCP server container ${this.containerName} with command: ${this.command} ${this.args.join(' ')}`
    );

    try {
      const { response } = await this.startContainer();

      if (response.status === 304) {
        console.log(`MCP server container ${this.containerName} is already running.`);
        return;
      } else if (response.status === 204) {
        console.log(`MCP server container ${this.containerName} started.`);
        return;
      }
    } catch (error) {
      console.error(`Error starting MCP server container ${this.containerName}`, error);
      throw error;
    }

    console.log(
      `MCP server container ${this.containerName} does not exist, creating it with base image and command: ${this.command} ${this.args.join(' ')}`
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

      console.log(`MCP server container ${this.containerName} created, now starting it`);
      await this.startContainer();

      // MCP servers don't have health checks, they communicate via stdin/stdout
      // Just verify the container is running
      console.log(`MCP server container ${this.containerName} started`);
    } catch (error) {
      console.error(`Error creating MCP server container ${this.containerName}`, error);
      throw error;
    }
  }

  /**
   * https://docs.podman.io/en/latest/_static/api.html#tag/containers/operation/ContainerStopLibpod
   */
  async stopContainer() {
    console.log(`Stopping MCP server container ${this.containerName}`);

    try {
      const { response } = await containerStopLibpod({
        path: {
          name: this.containerName,
        },
      });
      const { status } = response;

      if (status === 204) {
        console.log(`MCP server container ${this.containerName} stopped`);
      } else if (status === 304) {
        console.log(`MCP server container ${this.containerName} already stopped`);
      } else if (status === 404) {
        console.log(`MCP server container ${this.containerName} not found, already stopped`);
      } else {
        console.error(`Error stopping MCP server container ${this.containerName}`, response);
      }
    } catch (error) {
      console.error(`Error stopping MCP server container ${this.containerName}`, error);
      throw error;
    }
  }

  /**
   * https://docs.podman.io/en/latest/_static/api.html#tag/containers/operation/ContainerAttachLibpod
   */
  async proxyRequestToContainer(request: any) {
    console.log(`Proxying request to MCP server container ${this.containerName}`, request);

    const { response } = await containerAttachLibpod({
      path: {
        name: this.containerName,
      },
    });

    const { status } = response;

    if (status === 200) {
      return response;
    } else {
      console.error(`Error proxying request to MCP server container ${this.containerName}`, response);
      throw new Error(`Error proxying request to MCP server container ${this.containerName}`);
    }
  }

  /**
   * 🚀 Stream bidirectional communication with the MCP server container! 🚀
   * https://docs.podman.io/en/latest/_static/api.html#tag/containers/operation/ContainerAttachLibpod
   */
  async streamToContainer(request: any, responseStream: any) {
    console.log(`🔥 Streaming to MCP server container ${this.containerName}`, request);

    try {
      // 🎯 Use the attach endpoint for bidirectional streaming! 🎯
      const attachResponse = await containerAttachLibpod({
        path: {
          name: this.containerName,
        },
        query: {
          stdin: true, // ✅ Enable stdin for sending requests
          stdout: true, // ✅ Enable stdout for receiving responses
          stderr: true, // ✅ Enable stderr for error messages
          stream: true, // ✅ Enable streaming mode
        },
      });

      // 💫 Handle the streaming connection! 💫
      if (attachResponse.response.status === 200) {
        // The attach endpoint returns a raw socket/stream connection
        // We need to handle the bidirectional streaming here

        // 🔥 Write the request to stdin 🔥
        // TODO: The actual implementation depends on how the libpod client handles streaming
        // This is a placeholder - we need to investigate the actual streaming API

        console.log('🎉 Successfully attached to container for streaming!');

        // For now, let's write a simple response to test
        responseStream.write(
          JSON.stringify({
            status: 'connected',
            container: this.containerName,
          })
        );
        responseStream.end();
      } else {
        throw new Error(`Failed to attach to container: ${attachResponse.response.status}`);
      }
    } catch (error) {
      console.error(`❌ Error streaming to MCP server container ${this.containerName}:`, error);
      throw error;
    }
  }
}
