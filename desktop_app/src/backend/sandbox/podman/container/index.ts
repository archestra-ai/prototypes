import type { RawReplyDefaultExpression } from 'fastify';
import fs from 'fs';
import path from 'path';
import type { Duplex } from 'stream';
import { Agent, upgrade } from 'undici';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

import {
  containerCreateLibpod,
  containerLogsLibpod,
  containerStartLibpod,
  containerStopLibpod,
  containerWaitLibpod,
} from '@backend/clients/libpod/gen';
import config from '@backend/config';
import type { McpServer, McpServerConfig, McpServerUserConfigValues } from '@backend/models/mcpServer';
import log from '@backend/utils/logger';

export const PodmanContainerStateSchema = z.enum([
  'not_created',
  'created',
  'initializing',
  'running',
  'error',
  'restarting',
  'stopping',
  'stopped',
  'exited',
]);

export const PodmanContainerStatusSummarySchema = z.object({
  /**
   * startupPercentage is a number between 0 and 100 that represents the percentage of the startup process that has been completed.
   */
  startupPercentage: z.number().min(0).max(100),
  /**
   * state is the current state of the container.
   */
  state: PodmanContainerStateSchema,
  /**
   * message is a string that gives a human-readable description of the current state of the container.
   */
  message: z.string().nullable(),
  /**
   * error is a string that gives a human-readable description of any errors that may have occured
   * during the container startup process (if one has)
   */
  error: z.string().nullable(),
});

type PodmanContainerState = z.infer<typeof PodmanContainerStateSchema>;
type PodmanContainerStatusSummary = z.infer<typeof PodmanContainerStatusSummarySchema>;

export default class PodmanContainer {
  containerName: string;

  private command: string;
  private args: string[];
  private envVars: Record<string, string>;

  private startupPercentage = 0;
  private state: PodmanContainerState;
  private statusMessage: string | null = null;
  private statusError: string | null = null;

  private socketPath: string | null = null;

  // Connection pooling for MCP server communication
  private mcpSocket: Duplex | null = null;
  private mcpSocketConnecting: boolean = false;
  private pendingRequests: Map<string, (response: any) => void> = new Map();

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

  constructor({ name, serverConfig, userConfigValues }: McpServer, socketPath: string) {
    this.containerName = PodmanContainer.prettifyServerNameIntoContainerName(name);
    const { command, args, env } = PodmanContainer.injectUserConfigValuesIntoServerConfig(
      serverConfig,
      userConfigValues
    );

    this.command = command;
    this.args = args;
    this.envVars = env;

    // Set the socket path for the container (needed for attach operations)
    this.socketPath = socketPath;

    // Initialize state
    this.state = 'not_created';
    this.startupPercentage = 0;
    this.statusMessage = 'Container not yet created';
    this.statusError = null;

    // Set up log file path
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    const logsDir = path.join(homeDir, 'Desktop', 'archestra', 'logs');
    this.logFilePath = path.join(logsDir, `${this.containerName}.log`);

    // Ensure logs directory exists
    this.ensureLogDirectoryExists(logsDir);
  }

  /**
   * NOTE: they're certain naming restrictions/conventions that we should follow here
   *
   * See:
   * https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#dns-subdomain-names
   */
  private static prettifyServerNameIntoContainerName = (serverName: string) =>
    `archestra-ai-${serverName.replace(/ /g, '-').toLowerCase()}-mcp-server`;

  private ensureLogDirectoryExists(logsDir: string) {
    try {
      fs.mkdirSync(logsDir, { recursive: true });
      log.info(`Ensured log directory exists: ${logsDir}`);
    } catch (error) {
      log.error(`Failed to create log directory: ${logsDir}`, error);
    }
  }

  private async startLoggingToFile() {
    try {
      // Create write stream for log file (append mode)
      this.logStream = fs.createWriteStream(this.logFilePath, { flags: 'a' });
      this.logStream.write(`\n=== Container started at ${new Date().toISOString()} ===\n`);
      log.info(`Started logging to: ${this.logFilePath}`);
    } catch (error) {
      log.error(`Failed to create log file stream:`, error);
    }
  }

  private stopLoggingToFile() {
    if (this.logStream) {
      this.logStream.write(`\n=== Container stopped at ${new Date().toISOString()} ===\n`);
      this.logStream.end();
      this.logStream = null;
      log.info(`Stopped logging to file`);
    }
  }

  /**
   * Start streaming container logs to both console and file
   */
  async startStreamingLogs() {
    if (this.isStreamingLogs) {
      log.info(`Already streaming logs for ${this.containerName}`);
      return;
    }

    this.isStreamingLogs = true;
    log.info(`Starting to stream logs for ${this.containerName}`);

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
      log.info(`Container logs streaming started for ${this.containerName}`);
    } catch (error) {
      log.error(`Failed to start streaming logs:`, error);
      this.isStreamingLogs = false;
    }
  }

  /**
   * Stop streaming container logs
   */
  stopStreamingLogs() {
    if (!this.isStreamingLogs) {
      return;
    }

    log.info(`Stopping log streaming for ${this.containerName}`);
    this.isStreamingLogs = false;
    this.stopLoggingToFile();
  }

  private setContainerAsRunning() {
    this.state = 'running';
    this.startupPercentage = 100;
    this.statusMessage = 'Container is running';
    this.statusError = null;
  }

  private setContainerAsError(error: string) {
    this.state = 'error';
    this.startupPercentage = 0;
    this.statusMessage = null;
    this.statusError = error;
  }

  /**
   * Get recent logs from the log file
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
      log.error(`Failed to read logs:`, error);
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
      log.error(`Error starting MCP server container ${this.containerName}`, error);
      throw error;
    }
  }

  /**
   * https://docs.podman.io/en/latest/_static/api.html#tag/containers/operation/ContainerCreateLibpod
   */
  async startOrCreateContainer() {
    log.info(
      `Starting MCP server container ${this.containerName} with command: ${this.command} ${this.args.join(' ')}`
    );

    // Update state to initializing
    this.state = 'initializing';
    this.startupPercentage = 10;
    this.statusMessage = 'Starting MCP server container';
    this.statusError = null;

    try {
      const { response } = await this.startContainer();

      if (response.status === 304) {
        log.info(`MCP server container ${this.containerName} is already running.`);

        // Update state
        this.setContainerAsRunning();

        // Start streaming logs even if container was already running
        await this.startStreamingLogs();
        return;
      } else if (response.status === 204) {
        log.info(`MCP server container ${this.containerName} started.`);

        // Update state
        this.state = 'initializing';
        this.startupPercentage = 50;
        this.statusMessage = 'Container started, waiting for health check';

        // Wait for container to be healthy before considering it ready
        await this.waitForHealthy();

        // Start streaming logs for newly started container
        await this.startStreamingLogs();

        this.setContainerAsRunning();
        return;
      }
    } catch (error) {
      // If container doesn't exist (404), we'll create it below
      if (error && typeof error === 'object' && 'response' in error && (error as any).response?.status === 404) {
        log.info(`Container ${this.containerName} doesn't exist, will create it...`);
        this.startupPercentage = 20;
        this.statusMessage = 'Container does not exist, creating new container';
      } else {
        log.error(`Error starting MCP server container ${this.containerName}`, error);
        this.setContainerAsError(error instanceof Error ? error.message : 'Failed to start container');
        throw error;
      }
    }

    log.info(
      `MCP server container ${this.containerName} does not exist, creating it with base image and command: ${this.command} ${this.args.join(' ')}`
    );

    try {
      // Update state for creation
      this.state = 'created';
      this.startupPercentage = 30;
      this.statusMessage = 'Creating container';

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

      if (response.response.status !== 201) {
        throw new Error(`Failed to create container: ${response.response.status}`);
      }

      if (!response.data?.Id) {
        throw new Error('Container created but no ID returned');
      }

      log.info(`MCP server container ${this.containerName} created with ID: ${response.data.Id}`);

      // Update state
      this.startupPercentage = 40;
      this.statusMessage = 'Container created, starting it';

      await this.startContainer();

      // Wait for container to be healthy
      log.info(`MCP server container ${this.containerName} started, waiting for it to be healthy...`);
      this.startupPercentage = 60;
      this.statusMessage = 'Container started, waiting for health check';

      await this.waitForHealthy();

      // Start streaming logs to file and console
      this.startupPercentage = 90;
      this.statusMessage = 'Container healthy, starting log streaming';

      await this.startStreamingLogs();

      this.setContainerAsRunning();
    } catch (error) {
      log.error(`Error creating MCP server container ${this.containerName}`, error);
      this.setContainerAsError(error instanceof Error ? error.message : 'Failed to create container');
      throw error;
    }
  }

  /**
   * Wait for container to be healthy using Podman's native wait API
   */
  async waitForHealthy(): Promise<boolean> {
    log.info(`Waiting for container ${this.containerName} to be healthy...`);

    try {
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
        log.info(`Container ${this.containerName} is healthy!`);
        this.startupPercentage = 80;
        this.statusMessage = 'Container is healthy';
        return true;
      }

      this.statusMessage = 'Container health check failed';
      return false;
    } catch (error) {
      log.error(`Error waiting for container ${this.containerName} to be healthy:`, error);
      this.statusError = error instanceof Error ? error.message : 'Health check failed';
      return false;
    }
  }

  /**
   * https://docs.podman.io/en/latest/_static/api.html#tag/containers/operation/ContainerStopLibpod
   */
  async stopContainer() {
    log.info(`Stopping MCP server container ${this.containerName}`);

    // Update state
    this.state = 'stopping';
    this.statusMessage = 'Stopping container';
    this.statusError = null;

    // Close MCP socket connection if exists
    if (this.mcpSocket) {
      log.info('Closing MCP socket connection');
      this.mcpSocket.destroy();
      this.mcpSocket = null;
    }

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
        log.info(`MCP server container ${this.containerName} stopped`);
        this.state = 'stopped';
        this.statusMessage = 'Container stopped successfully';
      } else if (status === 304) {
        log.info(`MCP server container ${this.containerName} already stopped`);
        this.state = 'stopped';
        this.statusMessage = 'Container was already stopped';
      } else if (status === 404) {
        log.info(`MCP server container ${this.containerName} not found, already stopped`);
        this.state = 'not_created';
        this.statusMessage = 'Container not found';
      } else {
        log.error(`Error stopping MCP server container ${this.containerName}`, response);
        this.setContainerAsError(`Unexpected status: ${status}`);
      }

      this.startupPercentage = 0;
    } catch (error) {
      log.error(`Error stopping MCP server container ${this.containerName}`, error);
      this.setContainerAsError(error instanceof Error ? error.message : 'Failed to stop container');
      throw error;
    }
  }

  /**
   * Get or create a persistent socket connection to the MCP server container
   */
  private async getOrCreateMcpSocket(): Promise<Duplex> {
    // If we already have a socket, return it
    if (this.mcpSocket && !this.mcpSocket.destroyed) {
      return this.mcpSocket;
    }

    // If we're already connecting, wait for it
    if (this.mcpSocketConnecting) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return this.getOrCreateMcpSocket();
    }

    this.mcpSocketConnecting = true;

    try {
      log.info(`Creating new MCP socket connection to ${this.containerName}`);

      // First check if container is healthy
      const containerIsHealthy = await this.waitForHealthy();
      if (!containerIsHealthy) {
        throw new Error(`Container ${this.containerName} is not healthy`);
      }

      // Create an agent for the unix socket
      const agent = new Agent({
        connect: { socketPath: this.socketPath },
      });

      // Use undici.upgrade() for WebSocket-style upgrades
      const { socket } = await upgrade(
        `http://localhost/v5.0.0/libpod/containers/${this.containerName}/attach?stream=true&stdin=true&stdout=true&stderr=true`,
        {
          method: 'POST',
          dispatcher: agent,
          protocol: 'tcp',
        }
      );

      if (!socket) {
        throw new Error('Failed to create socket');
      }

      log.info('MCP socket connection established');
      this.mcpSocket = socket;
      this.mcpSocketConnecting = false;

      // Set up socket data handler
      let responseBuffer = Buffer.alloc(0);

      socket.on('data', (chunk: Buffer) => {
        responseBuffer = Buffer.concat([responseBuffer, chunk]);

        // Process multiplexed stream format
        while (responseBuffer.length >= 8) {
          // Read the 8-byte header
          const streamType = responseBuffer[0]; // 0=stdin, 1=stdout, 2=stderr
          const payloadSize = responseBuffer.readUInt32BE(4);

          // Check if we have the full payload
          if (responseBuffer.length < 8 + payloadSize) {
            break; // Wait for more data
          }

          // Extract the payload
          const payload = responseBuffer.slice(8, 8 + payloadSize);
          responseBuffer = responseBuffer.slice(8 + payloadSize);

          // Process stdout (stream type 1)
          if (streamType === 1) {
            const text = payload.toString('utf-8').trim();
            if (text && text.startsWith('{')) {
              try {
                const parsed = JSON.parse(text);
                log.debug(`Received MCP message:`, { id: parsed.id, method: parsed.method });

                // Handle responses with IDs
                if (parsed.id !== undefined && this.pendingRequests.has(parsed.id.toString())) {
                  const callback = this.pendingRequests.get(parsed.id.toString());
                  this.pendingRequests.delete(parsed.id.toString());
                  callback?.(parsed);
                } else if (parsed.method) {
                  // This is a notification - we might need to handle these differently
                  log.debug(`MCP notification: ${parsed.method}`);
                }
              } catch (e) {
                log.error(`Failed to parse MCP message: ${text}`);
              }
            }
          } else if (streamType === 2) {
            // stderr
            const text = payload.toString('utf-8').trim();
            if (text) {
              log.debug(`Container stderr: ${text}`);
            }
          }
        }
      });

      socket.on('error', (err: Error) => {
        log.error('MCP socket error:', err);
        this.mcpSocket = null;
        // Reject all pending requests
        for (const [id, callback] of this.pendingRequests) {
          callback({
            jsonrpc: '2.0',
            id,
            error: {
              code: -32603,
              message: `Socket error: ${err.message}`,
            },
          });
        }
        this.pendingRequests.clear();
      });

      socket.on('close', () => {
        log.info('MCP socket closed');
        this.mcpSocket = null;
        // Reject all pending requests
        for (const [id, callback] of this.pendingRequests) {
          callback({
            jsonrpc: '2.0',
            id,
            error: {
              code: -32603,
              message: 'Connection closed',
            },
          });
        }
        this.pendingRequests.clear();
      });

      return socket;
    } catch (error) {
      this.mcpSocketConnecting = false;
      throw error;
    }
  }

  /**
   * Stream bidirectional communication with the MCP server container!
   *
   * MCP servers communicate via stdin/stdout using JSON-RPC protocol.
   *
   * We use raw HTTP requests here instead of the libpod SDK because the container attach
   * endpoint hijacks the HTTP connection to create a bidirectional TCP stream. The SDK
   * doesn't support this hijacking mechanism - after the 101 Upgrade response, the connection
   * becomes a raw TCP socket for stdin/stdout/stderr multiplexing, which requires manual
   * handling of the stream protocol.
   *
   * https://docs.podman.io/en/latest/_static/api.html#tag/containers/operation/ContainerAttachLibpod
   */
  async streamToContainer(requestBody: any, responseStream: RawReplyDefaultExpression) {
    // Log the original request
    log.info(`MCP request:`, {
      method: requestBody.method,
      id: requestBody.id,
      idType: typeof requestBody.id,
    });

    const originalId = requestBody.id;

    try {
      // Get or create the socket connection
      const socket = await this.getOrCreateMcpSocket();

      // For notifications (no ID), just send and return immediately
      if (requestBody.id === undefined && requestBody.method?.includes('notification')) {
        const jsonRequest = JSON.stringify(requestBody) + '\n';
        socket.write(jsonRequest);
        log.info(`Sent notification: ${requestBody.method}`);

        // Return empty success response for notifications
        responseStream.write('{}');
        responseStream.end();
        return;
      }

      // For requests with IDs, we need to track the response
      const requestId = originalId !== undefined ? originalId.toString() : uuidv4();

      // Prepare the JSON-RPC request with newline (MCP servers expect line-delimited JSON)
      const jsonRequest = JSON.stringify(requestBody) + '\n';
      log.info(`Sending JSON-RPC request: ${jsonRequest}`);

      // Set up response handler
      const responsePromise = new Promise<any>((resolve) => {
        this.pendingRequests.set(requestId, resolve);
      });

      // Send the request
      socket.write(jsonRequest);

      // Wait for response with timeout
      const timeoutPromise = new Promise<any>((resolve) => {
        setTimeout(() => {
          resolve({
            jsonrpc: '2.0',
            id: originalId,
            error: {
              code: -32603,
              message: 'Timeout waiting for MCP server response',
            },
          });
        }, 30000); // 30 second timeout
      });

      const response = await Promise.race([responsePromise, timeoutPromise]);

      // Clean up pending request if it's still there
      this.pendingRequests.delete(requestId);

      // Send response back to client
      const responseJson = JSON.stringify(response);
      log.info(`Sending response back to client: ${responseJson.substring(0, 100)}...`);
      responseStream.write(responseJson);
      responseStream.end();
    } catch (error) {
      log.error(`Error in streamToContainer:`, error);
      responseStream.write(
        JSON.stringify({
          jsonrpc: '2.0',
          id: originalId,
          error: {
            code: -32603,
            message: error instanceof Error ? error.message : 'Unknown error',
          },
        })
      );
      responseStream.end();
    }
  }

  get statusSummary(): PodmanContainerStatusSummary {
    return {
      startupPercentage: this.startupPercentage,
      state: this.state,
      message: this.statusMessage,
      error: this.statusError,
    };
  }
}
