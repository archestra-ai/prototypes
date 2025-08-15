import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

import McpRequestLog from '@backend/models/mcpRequestLog';
import McpServerModel, { McpServerInstallSchema, McpServerSchema } from '@backend/models/mcpServer';
import ToolModel from '@backend/models/tools';
import ToolAnalysis from '@backend/models/tools/analysis';
import McpServerSandboxManager, { McpServerContainerLogsSchema } from '@backend/sandbox/manager';
import { ErrorResponseSchema } from '@backend/schemas';
import log from '@backend/utils/logger';

// Schema for available tools
const AvailableToolSchema = z.object({
  id: z.string().describe('Tool ID in format sanitizedServerId__sanitizedToolName'),
  name: z.string().describe('Tool name'),
  description: z.string().optional().describe('Tool description'),
  inputSchema: z.any().optional().describe('Tool input schema'),
  mcpServerId: z.string().describe('MCP server ID'),
  mcpServerName: z.string().describe('MCP server name'),
});

/**
 * Register our zod schemas into the global registry, such that they get output as components in the openapi spec
 * https://github.com/turkerdev/fastify-type-provider-zod?tab=readme-ov-file#how-to-create-refs-to-the-schemas
 */
z.globalRegistry.add(McpServerSchema, { id: 'McpServer' });
z.globalRegistry.add(McpServerContainerLogsSchema, { id: 'McpServerContainerLogs' });
z.globalRegistry.add(AvailableToolSchema, { id: 'AvailableTool' });

// Helper function to make schema JSON-serializable by removing symbols
const cleanSchema = (schema: any): any => {
  if (!schema) return undefined;

  try {
    // JSON.parse(JSON.stringify()) removes non-serializable properties like symbols
    return JSON.parse(JSON.stringify(schema));
  } catch {
    return undefined;
  }
};

const mcpServerRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    '/api/mcp_server',
    {
      schema: {
        operationId: 'getMcpServers',
        description: 'Get all installed MCP servers',
        tags: ['MCP Server'],
        response: {
          200: z.array(McpServerSchema),
        },
      },
    },
    async (_request, reply) => {
      const servers = await McpServerModel.getInstalledMcpServers();
      return reply.send(servers);
    }
  );

  fastify.post(
    '/api/mcp_server/install',
    {
      schema: {
        operationId: 'installMcpServer',
        description: 'Install an MCP server. Either from the catalog, or a customer server',
        tags: ['MCP Server'],
        body: McpServerInstallSchema,
        response: {
          200: McpServerSchema,
          400: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async ({ body }, reply) => {
      try {
        const server = await McpServerModel.installMcpServer(body);
        return reply.code(200).send(server);
      } catch (error: any) {
        log.error('Failed to install MCP server:', error);

        if (error.message?.includes('already installed')) {
          return reply.code(400).send({ error: error.message });
        }

        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  fastify.delete(
    '/api/mcp_server/:id',
    {
      schema: {
        operationId: 'uninstallMcpServer',
        description: 'Uninstall MCP server',
        tags: ['MCP Server'],
        params: z.object({
          id: z.string(),
        }),
        response: {
          200: z.object({ success: z.boolean() }),
        },
      },
    },
    async ({ params: { id } }, reply) => {
      await McpServerModel.uninstallMcpServer(id);
      return reply.code(200).send({ success: true });
    }
  );

  fastify.post(
    '/api/mcp_server/start_oauth',
    {
      schema: {
        operationId: 'startMcpServerOauth',
        description: 'Start MCP server OAuth flow',
        tags: ['MCP Server'],
        body: z.object({
          catalogName: z.string(),
        }),
        response: {
          200: z.object({ authUrl: z.string() }),
        },
      },
    },
    async ({ body: { catalogName } }, reply) => {
      return reply.send({ authUrl: `https://oauth-proxy.archestra.ai/auth/${catalogName}` });
    }
  );

  /**
   * Relevant docs:
   *
   * Fastify reply.hijack() docs: https://fastify.dev/docs/latest/Reference/Reply/#hijack
   * Excluding a route from the openapi spec: https://stackoverflow.com/questions/73950993/fastify-swagger-exclude-certain-routes
   */
  fastify.post(
    '/mcp_proxy/:id',
    {
      schema: {
        hide: true,
        description: 'Proxy requests to the containerized MCP server running in the Archestra.ai sandbox',
        tags: ['MCP Server'],
        params: z.object({
          id: z.string(),
        }),
        body: z
          .object({
            jsonrpc: z.string().optional(),
            id: z.union([z.string(), z.number()]).optional(),
            method: z.string().optional(),
            params: z.any().optional(),
            sessionId: z.string().optional(),
            mcpSessionId: z.string().optional(),
          })
          .passthrough(),
      },
    },
    async ({ params: { id }, body, headers }, reply) => {
      const mcpServers = await McpServerModel.getById(id);
      if (!mcpServers || mcpServers.length === 0) {
        return reply.code(404).send({ error: 'MCP server not found' });
      }
      const mcpServer = mcpServers[0];

      // Create MCP request log entry
      const requestId = uuidv4();
      const startTime = Date.now();
      let responseBody: string | null = null;
      let statusCode = 200;
      let errorMessage: string | null = null;

      try {
        fastify.log.info(`Proxying request to MCP server ${id}: ${JSON.stringify(body)}`);

        // Check if container exists BEFORE hijacking!
        const containerExists = McpServerSandboxManager.checkContainerExists(id);

        if (!containerExists) {
          // Container not ready yet, return 404 so UI can retry
          fastify.log.info(`Container ${id} not ready yet, returning 404`);
          statusCode = 404;
          errorMessage = 'MCP server container not ready yet';

          // Log the failed request
          await McpRequestLog.create({
            requestId,
            sessionId: body.sessionId || null,
            mcpSessionId: body.mcpSessionId || null,
            serverName: mcpServer.name || id,
            clientInfo: {
              userAgent: headers['user-agent'],
              clientName: 'Archestra Desktop App',
              clientVersion: '0.0.1',
              clientPlatform: process.platform,
            },
            method: body.method || null,
            requestHeaders: headers as Record<string, string>,
            requestBody: JSON.stringify(body),
            responseBody: JSON.stringify({ error: errorMessage, retry: true }),
            responseHeaders: {},
            statusCode,
            errorMessage,
            durationMs: Date.now() - startTime,
          });

          return reply.code(404).send({
            error: 'MCP server container not ready yet',
            retry: true,
          });
        }

        // Now hijack the response to handle streaming manually!
        reply.hijack();

        // Set up streaming response headers!
        reply.raw.writeHead(200, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        });

        // Create a custom writable stream to capture the response
        const responseChunks: Buffer[] = [];
        const originalWrite = reply.raw.write.bind(reply.raw);
        const originalEnd = reply.raw.end.bind(reply.raw);

        reply.raw.write = function (chunk: any, encoding?: any) {
          if (chunk) {
            responseChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          }
          return originalWrite(chunk, encoding);
        };

        reply.raw.end = function (chunk?: any, encoding?: any) {
          if (chunk) {
            responseChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          }
          responseBody = Buffer.concat(responseChunks).toString('utf-8');

          // If this was a tools/list request, analyze the tools asynchronously
          if (body.method === 'tools/list' && responseBody) {
            // Don't await this - let it run in the background
            (async () => {
              try {
                const responseData = JSON.parse(responseBody);
                if (responseData.result?.tools) {
                  // Convert array of tools to object keyed by tool name
                  const toolsObject: Record<string, any> = {};
                  for (const tool of responseData.result.tools) {
                    // Create a unique ID for the tool
                    const sanitizedServerId = id.replace(/[^a-zA-Z0-9_-]/g, '_');
                    const sanitizedToolName = tool.name.replace(/[^a-zA-Z0-9_-]/g, '_');
                    const toolId = `${sanitizedServerId}__${sanitizedToolName}`;
                    toolsObject[toolId] = tool;

                    // Save tool to database
                    await ToolModel.upsert({
                      id: toolId,
                      name: tool.name,
                      description: tool.description || undefined,
                      inputSchema: tool.inputSchema ? JSON.stringify(tool.inputSchema) : undefined,
                      mcpServerId: id,
                    } as any);
                  }

                  // Analyze the tools
                  const analysisResults = await ToolAnalysis.analyze(toolsObject);

                  // Update tools with analysis results
                  for (const [toolId, analysis] of Object.entries(analysisResults)) {
                    await ToolModel.updateAnalysis(toolId, analysis);
                  }

                  // Broadcast tool analysis results via WebSocket
                  const websocketServer = (fastify as any).websocketServer;
                  if (websocketServer) {
                    websocketServer.broadcast({
                      type: 'tools-analyzed',
                      mcpServerId: id,
                      tools: Object.keys(toolsObject).map((toolId) => ({
                        id: toolId,
                        ...analysisResults[toolId],
                      })),
                    });
                  }
                }
              } catch (error) {
                log.error('Failed to analyze tools:', error);
              }
            })();
          }

          // Log the successful request
          McpRequestLog.create({
            requestId,
            sessionId: body.sessionId || null,
            mcpSessionId: body.mcpSessionId || null,
            serverName: mcpServer.name || id,
            clientInfo: {
              userAgent: headers['user-agent'],
              clientName: 'Archestra Desktop App',
              clientVersion: '0.0.1',
              clientPlatform: process.platform,
            },
            method: body.method || null,
            requestHeaders: headers as Record<string, string>,
            requestBody: JSON.stringify(body),
            responseBody,
            responseHeaders: {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-cache',
            },
            statusCode,
            errorMessage: null,
            durationMs: Date.now() - startTime,
          }).catch((err) => {
            fastify.log.error('Failed to create MCP request log:', err);
          });

          return originalEnd(chunk, encoding);
        };

        // Stream the request to the container!
        await McpServerSandboxManager.streamToMcpServerContainer(id, body, reply.raw);

        // Return undefined when hijacking to prevent Fastify from sending response
        return;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : 'No stack trace';

        statusCode = 500;
        errorMessage = errorMsg;

        fastify.log.error(`Error proxying to MCP server ${id}: ${errorMsg}`);
        fastify.log.error(`Error stack trace: ${errorStack}`);

        // Log the failed request
        await McpRequestLog.create({
          requestId,
          sessionId: body.sessionId || null,
          mcpSessionId: body.mcpSessionId || null,
          serverName: mcpServer.name || id,
          clientInfo: {
            userAgent: headers['user-agent'],
            clientName: 'Archestra Desktop App',
            clientVersion: '0.0.1',
            clientPlatform: process.platform,
          },
          method: body.method || null,
          requestHeaders: headers as Record<string, string>,
          requestBody: JSON.stringify(body),
          responseBody: JSON.stringify({ error: errorMsg }),
          responseHeaders: {},
          statusCode,
          errorMessage,
          durationMs: Date.now() - startTime,
        });

        // If we haven't sent yet, we can still send error response
        if (!reply.sent) {
          return reply.code(500).send({
            error: error instanceof Error ? error.message : 'Failed to proxy request to MCP server',
          });
        } else if (!reply.raw.headersSent) {
          // If already hijacked, try to write error to raw response
          reply.raw.writeHead(500, { 'Content-Type': 'application/json' });
          reply.raw.end(
            JSON.stringify({
              error: error instanceof Error ? error.message : 'Failed to proxy request to MCP server',
            })
          );
        }
      }
    }
  );

  fastify.get(
    '/mcp_proxy/:id/logs',
    {
      schema: {
        operationId: 'getMcpServerLogs',
        description: 'Get logs for a specific MCP server container',
        tags: ['MCP Server'],
        params: z.object({
          id: z.string(),
        }),
        querystring: z.object({
          lines: z.coerce.number().optional().default(100),
        }),
        response: {
          200: McpServerContainerLogsSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async ({ params: { id }, query: { lines } }, reply) => {
      const mcpServers = await McpServerModel.getById(id);

      if (!mcpServers || mcpServers.length === 0) {
        return reply.code(404).send({ error: 'MCP server not found' });
      }

      try {
        const logs = await McpServerSandboxManager.getMcpServerLogs(id, lines);
        return reply.send(logs);
      } catch (error) {
        fastify.log.error(`Error getting logs for MCP server ${id}: ${error}`);
        return reply.code(404).send({
          error: error instanceof Error ? error.message : 'Failed to get logs',
        });
      }
    }
  );

  // Get all available tools from connected MCP servers
  fastify.get(
    '/api/mcp_server/tools',
    {
      schema: {
        operationId: 'getAvailableTools',
        description: 'Get all available tools from connected MCP servers',
        tags: ['MCP Server'],
        response: {
          200: z.array(AvailableToolSchema),
        },
      },
    },
    async (request, reply) => {
      const tools = McpServerSandboxManager.getAllTools();
      const servers = await McpServerModel.getAll();

      const toolList = Object.entries(tools).map(([id, tool]) => {
        // Tool IDs are now in format: sanitizedServerId__sanitizedToolName
        const parts = id.split('__');
        const sanitizedServerId = parts[0];
        const sanitizedToolName = parts.slice(1).join('__'); // Handle tool names that might contain '__'

        // Find the actual server by checking all servers
        // Since server IDs are sanitized, we need to find the match
        const server = servers.find((s) => s.id.replace(/[^a-zA-Z0-9_-]/g, '_') === sanitizedServerId);

        return {
          id,
          name: sanitizedToolName || id,
          description: tool.description,
          inputSchema: cleanSchema(tool.inputSchema),
          mcpServerId: server?.id || sanitizedServerId,
          mcpServerName: server?.name || 'Unknown',
        };
      });

      return reply.send(toolList);
    }
  );
};

export default mcpServerRoutes;
