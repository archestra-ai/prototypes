import { FastifyPluginAsync } from 'fastify';

import { MCPRequestLog as MCPRequestLogModel } from '@backend/models/mcpRequestLog';
import { McpRequestLogStats, McpRequestLog as McpRequestLogType } from '@types';

interface LogQueryParams {
  // Filters
  server_name?: string;
  method?: string;
  status?: string;
  search?: string;
  date_from?: string;
  date_to?: string;
  // Pagination
  page?: number;
  page_size?: number;
}

interface ClearLogsBody {
  clear_all?: boolean;
}

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  page_size: number;
}

const mcpRequestLogRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * Get MCP request logs with filtering and pagination
   */
  fastify.get<{
    Querystring: LogQueryParams;
    Reply: PaginatedResponse<McpRequestLogType>;
  }>(
    '/api/mcp_request_log',
    {
      schema: {
        operationId: 'getMcpRequestLogs',
        description: 'Get MCP request logs with filtering and pagination',
        tags: ['MCP Request Log'],
        querystring: {
          type: 'object',
          properties: {
            server_name: { type: 'string' },
            method: { type: 'string' },
            status: { type: 'string', enum: ['success', 'error'] },
            search: { type: 'string' },
            date_from: { type: 'string', format: 'date-time' },
            date_to: { type: 'string', format: 'date-time' },
            page: { type: 'number', minimum: 1, default: 1 },
            page_size: { type: 'number', minimum: 1, maximum: 100, default: 50 },
          },
        },
        response: {
          200: {
            description: 'Paginated list of MCP request logs',
            type: 'object',
            properties: {
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    request_id: { type: 'string' },
                    session_id: { type: 'string' },
                    mcp_session_id: { type: 'string' },
                    server_name: { type: 'string' },
                    client_info: { type: 'string' },
                    method: { type: 'string' },
                    status: { type: 'string', enum: ['pending', 'success', 'error'] },
                    duration_ms: { type: 'number' },
                    timestamp: { type: 'string', format: 'date-time' },
                    request: { type: 'string' },
                    response: { type: 'string' },
                    error: { type: 'string' },
                    headers: { type: 'object' },
                  },
                  required: ['id', 'server_name', 'method', 'status', 'timestamp'],
                },
              },
              total: { type: 'number' },
              page: { type: 'number' },
              page_size: { type: 'number' },
            },
            required: ['data', 'total', 'page', 'page_size'],
          },
          500: {
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { page = 1, page_size = 50, ...filters } = request.query;

        const result = await MCPRequestLogModel.getRequestLogs(filters, page, page_size);

        return reply.send({
          data: result.logs,
          total: result.totalPages * page_size,
          page,
          page_size,
        });
      } catch (error) {
        fastify.log.error({ err: error }, 'Failed to get MCP request logs');
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  /**
   * Get a single MCP request log by ID
   */
  fastify.get<{
    Params: { id: string };
    Reply: McpRequestLogType | { error: string };
  }>(
    '/api/mcp_request_log/:id',
    {
      schema: {
        operationId: 'getMcpRequestLogById',
        description: 'Get a single MCP request log by ID',
        tags: ['MCP Request Log'],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
        response: {
          200: {
            description: 'MCP request log',
            type: 'object',
            properties: {
              id: { type: 'string' },
              request_id: { type: 'string' },
              session_id: { type: 'string' },
              mcp_session_id: { type: 'string' },
              server_name: { type: 'string' },
              client_info: { type: 'string' },
              method: { type: 'string' },
              status: { type: 'string', enum: ['pending', 'success', 'error'] },
              duration_ms: { type: 'number' },
              timestamp: { type: 'string', format: 'date-time' },
              request: { type: 'string' },
              response: { type: 'string' },
              error: { type: 'string' },
              headers: { type: 'object' },
            },
            required: ['id', 'server_name', 'method', 'status', 'timestamp'],
          },
          404: {
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
          500: {
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const id = parseInt(request.params.id, 10);
        if (isNaN(id)) {
          return reply.code(400).send({ error: 'Invalid ID format' });
        }

        const log = await MCPRequestLogModel.getRequestLogById(id);

        if (!log) {
          return reply.code(404).send({ error: 'Request log not found' });
        }

        return reply.send(log);
      } catch (error) {
        fastify.log.error({ err: error }, 'Failed to get MCP request log');
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  /**
   * Get MCP request log statistics
   */
  fastify.get<{
    Querystring: LogQueryParams;
    Reply: McpRequestLogStats;
  }>(
    '/api/mcp_request_log/stats',
    {
      schema: {
        operationId: 'getMcpRequestLogStats',
        description: 'Get MCP request log statistics',
        tags: ['MCP Request Log'],
        querystring: {
          type: 'object',
          properties: {
            server_name: { type: 'string' },
            method: { type: 'string' },
            status: { type: 'string', enum: ['success', 'error'] },
            date_from: { type: 'string', format: 'date-time' },
            date_to: { type: 'string', format: 'date-time' },
          },
        },
        response: {
          200: {
            description: 'MCP request log statistics',
            type: 'object',
            properties: {
              totalRequests: { type: 'number' },
              successCount: { type: 'number' },
              errorCount: { type: 'number' },
              avgDurationMs: { type: 'number' },
              requestsPerServer: {
                type: 'object',
                additionalProperties: { type: 'number' },
              },
            },
            required: ['totalRequests', 'successCount', 'errorCount', 'avgDurationMs', 'requestsPerServer'],
          },
          500: {
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const stats = await MCPRequestLogModel.getRequestLogStats(request.query);
        return reply.send(stats);
      } catch (error) {
        fastify.log.error({ err: error }, 'Failed to get MCP request log stats');
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  /**
   * Clear MCP request logs
   */
  fastify.delete<{
    Body: ClearLogsBody;
    Reply: { cleared: number } | { error: string };
  }>(
    '/api/mcp_request_log',
    {
      schema: {
        operationId: 'clearMcpRequestLogs',
        description: 'Clear MCP request logs',
        tags: ['MCP Request Log'],
        body: {
          type: 'object',
          properties: {
            clear_all: { type: 'boolean', default: false },
          },
        },
        response: {
          200: {
            description: 'Number of logs cleared',
            type: 'object',
            properties: {
              cleared: { type: 'number' },
            },
            required: ['cleared'],
          },
          500: {
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { clear_all = false } = request.body || {};

        const cleared = clear_all
          ? await MCPRequestLogModel.clearAllLogs()
          : await MCPRequestLogModel.cleanupOldLogs(7); // Clear logs older than 7 days by default

        return reply.send({ cleared });
      } catch (error) {
        fastify.log.error({ err: error }, 'Failed to clear MCP request logs');
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );
};

export default mcpRequestLogRoutes;
