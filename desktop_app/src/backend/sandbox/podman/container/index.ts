import type { RawReplyDefaultExpression } from 'fastify';
import fs from 'fs';
import path from 'path';

import {
  containerCreateLibpod,
  containerExecLibpod,
  containerLogsLibpod,
  containerStartLibpod,
  containerStopLibpod,
  containerWaitLibpod,
  execStartLibpod,
} from '@backend/clients/libpod/gen';
import config from '@backend/config';
import type { McpServer, McpServerConfig, McpServerUserConfigValues } from '@backend/models/mcpServer';

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

      // Start streaming logs to file and console
      await this.startStreamingLogs();
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
   * We need to execute the command that processes a single request and returns a response.
   */
  async streamToContainer(request: any, responseStream: RawReplyDefaultExpression) {
    console.log(`🔥 Executing MCP request in container ${this.containerName}`, request);

    try {
      console.log(`📋 Creating exec session for container ${this.containerName}...`);

      // 🎯 Create an exec session to run a command that processes the MCP request! 🎯
      const execResponse = await containerExecLibpod({
        path: {
          name: this.containerName,
        },
        body: {
          AttachStdin: true, // Send input
          AttachStdout: true, // Receive output
          AttachStderr: true, // Receive errors
          // For testing, let's just echo back the request to see if exec works
          Cmd: ['sh', '-c', `echo 'TEST RESPONSE: Received request in container ${this.containerName}'`],
          Tty: false, // No TTY for JSON-RPC communication
        },
      });

      console.log(`📊 Exec create response:`, {
        status: execResponse.response.status,
        data: execResponse.data,
        hasId: !!execResponse.data?.Id,
      });

      if (execResponse.response.status === 201 && execResponse.data?.Id) {
        console.log(`✅ Exec session created: ${execResponse.data.Id}`);

        // 🚀 Start the exec session to actually run the command! 🚀
        const startResponse = await execStartLibpod({
          path: {
            id: execResponse.data.Id,
          },
          body: {
            // The actual stdin data (our JSON-RPC request) is sent here if needed
            // But since we're using echo in the command, we don't need to send it again
          },
        });

        console.log(`📡 Exec start response status: ${startResponse.response.status}`);

        // 🔥 Check if we got a successful response 🔥
        if (startResponse.response.status === 200) {
          // The response should contain the stdout from our command
          // For now, let's see what we get back
          console.log('🎯 Exec response data:', startResponse.data);

          // If the response has data, write it to the stream
          if (startResponse.data) {
            responseStream.write(JSON.stringify(startResponse.data));
          } else {
            // Fallback response if no data
            responseStream.write(
              JSON.stringify({
                jsonrpc: '2.0',
                id: request.id || 1,
                result: {
                  status: 'executed',
                  container: this.containerName,
                  message: 'Command executed but no response data',
                },
              })
            );
          }
          responseStream.end();
        } else {
          throw new Error(`Failed to start exec session: ${startResponse.response.status}`);
        }
      } else {
        throw new Error(`Failed to create exec session: ${execResponse.response.status}`);
      }
    } catch (error) {
      console.error(`❌ Error executing in MCP server container ${this.containerName}:`, error);
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
              message: error instanceof Error ? error.message : 'Internal error',
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
