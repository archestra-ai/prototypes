import type { RawReplyDefaultExpression } from 'fastify';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';

import {
  containerCreateLibpod,
  containerExecLibpod,
  containerInspectLibpod,
  containerLogsLibpod,
  containerStartLibpod,
  containerStopLibpod,
  containerWaitLibpod,
  execStartLibpod,
} from '@backend/clients/libpod/gen';
import config from '@backend/config';
import type { McpServer, McpServerConfig, McpServerUserConfigValues } from '@backend/models/mcpServer';

export const ContainerStatusSchema = z.object({
  exists: z.boolean(),
  running: z.boolean(),
  state: z.string().optional(),
  health: z.string().optional(),
});

export type ContainerStatus = z.infer<typeof ContainerStatusSchema>;

export default class PodmanContainer {
  containerName: string;
  private command: string;
  private args: string[];
  private envVars: Record<string, string>;
  /*
   * TODO: Use app.getPath('logs') from Electron to get proper logs directory
   *
   * Currently we're hardcoding to ~/Desktop/archestra/logs/<container-name>.log because:
   * - This code runs in the backend Node.js process, not the Electron main process
   * - app.getPath() is only available in the Electron main process
   * - We need to either:
   *   1. Pass the logs path from the main process when starting the backend server
   *   2. Use IPC to request the path from the main process
   *   3. Use an environment variable set by the main process
   *
   * For now, using a hardcoded path for simplicity during development.
   */
  logFilePath: string;
  private logStream: fs.WriteStream | null = null;
  private isStreamingLogs = false;

  constructor({ name, serverConfig, userConfigValues }: McpServer) {
    this.containerName = PodmanContainer.prettifyServerNameIntoContainerName(name);
    const { command, args, env } = PodmanContainer.injectUserConfigValuesIntoServerConfig(
      serverConfig,
      userConfigValues
    );

    this.command = command;
    this.args = args;
    this.envVars = env;

    // Set up log file path
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    const logsDir = path.join(homeDir, 'Desktop', 'archestra', 'logs');
    this.logFilePath = path.join(logsDir, `${this.containerName}.log`);

    // Ensure logs directory exists
    this.ensureLogDirectoryExists(logsDir);
  }

  private static prettifyServerNameIntoContainerName = (serverName: string) =>
    `archestra-ai-${serverName.replace(/ /g, '-').toLowerCase()}-mcp-server`;

  private ensureLogDirectoryExists(logsDir: string) {
    try {
      fs.mkdirSync(logsDir, { recursive: true });
      console.log(`📁 Ensured log directory exists: ${logsDir}`);
    } catch (error) {
      console.error(`❌ Failed to create log directory: ${logsDir}`, error);
    }
  }

  private async startLoggingToFile() {
    try {
      // Create write stream for log file (append mode)
      this.logStream = fs.createWriteStream(this.logFilePath, { flags: 'a' });
      this.logStream.write(`\n=== Container started at ${new Date().toISOString()} ===\n`);
      console.log(`📝 Started logging to: ${this.logFilePath}`);
    } catch (error) {
      console.error(`❌ Failed to create log file stream:`, error);
    }
  }

  private stopLoggingToFile() {
    if (this.logStream) {
      this.logStream.write(`\n=== Container stopped at ${new Date().toISOString()} ===\n`);
      this.logStream.end();
      this.logStream = null;
      console.log(`📝 Stopped logging to file`);
    }
  }

  /**
   * 🚀 Start streaming container logs to both console and file
   */
  async startStreamingLogs() {
    if (this.isStreamingLogs) {
      console.log(`📋 Already streaming logs for ${this.containerName}`);
      return;
    }

    this.isStreamingLogs = true;
    console.log(`🎬 Starting to stream logs for ${this.containerName}`);

    try {
      // Start logging to file
      await this.startLoggingToFile();

      // Stream logs from container
      const logsResponse = await containerLogsLibpod({
        path: {
          name: this.containerName,
        },
        query: {
          follow: true, // Stream logs
          stdout: true, // Include stdout
          stderr: true, // Include stderr
          timestamps: true, // Include timestamps
          tail: 'all', // Get all logs
        },
      });

      // TODO: Handle the streaming response
      // The actual implementation will depend on how the libpod client handles streaming
      console.log(`📊 Container logs streaming started for ${this.containerName}`);
    } catch (error) {
      console.error(`❌ Failed to start streaming logs:`, error);
      this.isStreamingLogs = false;
    }
  }

  /**
   * 🛑 Stop streaming container logs
   */
  stopStreamingLogs() {
    if (!this.isStreamingLogs) {
      return;
    }

    console.log(`🛑 Stopping log streaming for ${this.containerName}`);
    this.isStreamingLogs = false;
    this.stopLoggingToFile();
  }

  /**
   * 📖 Get recent logs from the log file
   */
  async getRecentLogs(lines: number = 100): Promise<string> {
    try {
      if (!fs.existsSync(this.logFilePath)) {
        return `No logs available yet for ${this.containerName}`;
      }

      // Read the log file
      const logContent = await fs.promises.readFile(this.logFilePath, 'utf-8');
      const logLines = logContent.split('\n');

      // Return the last N lines
      return logLines.slice(-lines).join('\n');
    } catch (error) {
      console.error(`❌ Failed to read logs:`, error);
      return `Error reading logs: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

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
        // Start streaming logs even if container was already running
        await this.startStreamingLogs();
        return;
      } else if (response.status === 204) {
        console.log(`MCP server container ${this.containerName} started.`);
        // Wait for container to be healthy before considering it ready
        await this.waitForHealthy();
        // Start streaming logs for newly started container
        await this.startStreamingLogs();
        return;
      }
    } catch (error) {
      // If container doesn't exist (404), we'll create it below
      if (error && typeof error === 'object' && 'response' in error && (error as any).response?.status === 404) {
        console.log(`Container ${this.containerName} doesn't exist, will create it...`);
      } else {
        console.error(`Error starting MCP server container ${this.containerName}`, error);
        throw error;
      }
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
           * Don't auto-remove the container - we need it to persist for MCP communication
           */
          remove: false,
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

      // Wait for container to be healthy
      console.log(`MCP server container ${this.containerName} started, waiting for it to be healthy...`);
      await this.waitForHealthy();

      // Start streaming logs to file and console
      await this.startStreamingLogs();
    } catch (error) {
      console.error(`Error creating MCP server container ${this.containerName}`, error);
      throw error;
    }
  }

  /**
   * Check if the container exists and is running
   */
  async checkContainerStatus(): Promise<ContainerStatus> {
    try {
      const { response, data } = await containerInspectLibpod({
        path: {
          name: this.containerName,
        },
      });

      if (response.status === 200 && data) {
        const state = data.State;
        const health = state?.Health?.Status;

        return {
          exists: true,
          running: state?.Running === true,
          state: state?.Status,
          health: health || 'none',
        };
      }

      return { exists: false, running: false };
    } catch (error) {
      console.log(`Container ${this.containerName} not found or error checking status:`, error);
      return { exists: false, running: false };
    }
  }

  /**
   * Wait for container to be healthy using Podman's native wait API
   */
  async waitForHealthy(timeoutSeconds: number = 30): Promise<boolean> {
    console.log(`🏥 Waiting for container ${this.containerName} to be healthy...`);

    try {
      // First check if container has a health check defined
      const status = await this.checkContainerStatus();
      if (status.health === 'none') {
        console.log(`✅ Container ${this.containerName} has no health check defined, considering it ready`);
        return true;
      }

      // Use containerWaitLibpod to wait for healthy condition
      const response = await containerWaitLibpod({
        path: {
          name: this.containerName,
        },
        query: {
          condition: ['healthy'],
          interval: '500ms',
        },
      });

      if (response.response.status === 200) {
        console.log(`✅ Container ${this.containerName} is healthy!`);
        return true;
      }

      return false;
    } catch (error) {
      console.error(`❌ Error waiting for container ${this.containerName} to be healthy:`, error);
      // If wait fails, fall back to checking current status
      const status = await this.checkContainerStatus();
      return status.health === 'healthy' || status.health === 'none';
    }
  }

  /**
   * https://docs.podman.io/en/latest/_static/api.html#tag/containers/operation/ContainerStopLibpod
   */
  async stopContainer() {
    console.log(`Stopping MCP server container ${this.containerName}`);

    // Stop streaming logs before stopping container
    this.stopStreamingLogs();

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
   * 🚀 Stream bidirectional communication with the MCP server container! 🚀
   *
   * MCP servers communicate via stdin/stdout using JSON-RPC protocol.
   * This is a temporary implementation - MCP servers should be running continuously
   * and we should attach to their stdin/stdout, not use exec.
   */
  async streamToContainer(request: any, responseStream: RawReplyDefaultExpression) {
    console.log(`🔥 Handling MCP request for container ${this.containerName}`, request);

    try {
      // First check if container exists and is running
      const containerStatus = await this.checkContainerStatus();

      if (!containerStatus.exists) {
        // Container doesn't exist - it may have been removed or never created
        throw new Error(`Container ${this.containerName} does not exist. It may need to be restarted.`);
      }

      if (!containerStatus.running) {
        // Container exists but is not running - try to restart it
        console.log(
          `⚠️ Container ${this.containerName} is not running (state: ${containerStatus.state}). Attempting to restart...`
        );

        try {
          await this.startContainer();
          console.log(`✅ Container ${this.containerName} restarted successfully`);
        } catch (restartError) {
          throw new Error(
            `Container ${this.containerName} is not running and failed to restart: ${restartError instanceof Error ? restartError.message : 'Unknown error'}`
          );
        }
      }

      // TODO: This is a temporary implementation using exec
      // The proper implementation should:
      // 1. Keep the MCP server process running continuously in the container
      // 2. Attach to the container's stdin/stdout streams
      // 3. Send JSON-RPC requests via stdin and receive responses via stdout
      // 4. Handle multiplexing of multiple concurrent requests

      console.log(`📋 Creating exec session for container ${this.containerName} (temporary implementation)...`);

      // For now, we'll use exec to demonstrate the flow
      // In a real implementation, we'd need to maintain a persistent connection
      const execResponse = await containerExecLibpod({
        path: {
          name: this.containerName,
        },
        body: {
          AttachStdin: true,
          AttachStdout: true,
          AttachStderr: true,
          // Echo back a test response to verify the exec mechanism works
          Cmd: [
            'sh',
            '-c',
            `echo '{"jsonrpc":"2.0","id":${request.id || 1},"result":{"message":"MCP server container ${this.containerName} received request","test":true}}'`,
          ],
          Tty: false,
        },
      });

      if (execResponse.response.status === 201 && execResponse.data?.Id) {
        console.log(`✅ Exec session created: ${execResponse.data.Id}`);

        const startResponse = await execStartLibpod({
          path: {
            id: execResponse.data.Id,
          },
          body: {},
        });

        console.log(`📡 Exec start response status: ${startResponse.response.status}`);

        if (startResponse.response.status === 200) {
          // Send the response back
          const responseData = startResponse.data || {
            jsonrpc: '2.0',
            id: request.id || 1,
            result: {
              message: `Temporary exec implementation - container ${this.containerName} is running`,
              warning:
                'This is a temporary implementation. MCP servers should use persistent stdin/stdout connections.',
            },
          };

          responseStream.write(JSON.stringify(responseData));
          responseStream.end();
        } else {
          throw new Error(`Failed to start exec session: ${startResponse.response.status}`);
        }
      } else {
        throw new Error(
          `Failed to create exec session: ${execResponse.response.status} - ${JSON.stringify(execResponse.data)}`
        );
      }
    } catch (error) {
      console.error(`❌ Error communicating with MCP server container ${this.containerName}:`, error);
      console.error(`Error details:`, {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        errorType: error?.constructor?.name,
      });

      // Send error response in JSON-RPC format
      try {
        responseStream.write(
          JSON.stringify({
            jsonrpc: '2.0',
            id: request.id || 1,
            error: {
              code: -32603,
              message: `Container communication error: ${error instanceof Error ? error.message : 'Unknown error'}`,
              data: {
                container: this.containerName,
                hint: 'Check container logs for more details',
              },
            },
          })
        );
        responseStream.end();
      } catch (writeError) {
        console.error(`❌ Failed to write error response:`, writeError);
      }

      throw error;
    }
  }
}
