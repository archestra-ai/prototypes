import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { generatePaginatedResponseSchema } from '@schemas';
import McpRequestLogModel, { selectMcpRequestLogSchema } from '@backend/models/mcpRequestLog';

// Request schemas
const logQueryParamsSchema = z.object({
  serverName: z.string().optional(),
  method: z.string().optional(),
  status: z.enum(['success', 'error']).optional(),
  search: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

const logQueryParamsWithPaginationSchema = logQueryParamsSchema.extend({
  page: z.number().min(1).default(1).optional(),
  pageSize: z.number().min(1).max(100).default(50).optional(),
});

const clearLogsBodySchema = z.object({
  clearAll: z.boolean(),
});

// Response schemas
const mcpRequestLogResponseSchema = selectMcpRequestLogSchema.transform((log) => ({
  ...log,
  id: log.id.toString(),
  status: log.statusCode >= 200 && log.statusCode < 300 ? 'success' : 'error',
}));

const mcpRequestLogStatsSchema = z.object({
  totalRequests: z.number(),
  successCount: z.number(),
  errorCount: z.number(),
  avgDurationMs: z.number(),
  requestsPerServer: z.record(z.string(), z.number()),
});

// Type exports
type LogQueryParams = z.infer<typeof logQueryParamsSchema>;
type LogQueryParamsWithPagination = z.infer<typeof logQueryParamsWithPaginationSchema>;
type ClearLogsBody = z.infer<typeof clearLogsBodySchema>;

const mcpRequestLogRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * Get MCP request logs with filtering and pagination
   */
  fastify.get<{
    Querystring: LogQueryParamsWithPagination;
  }>(
    '/api/mcp_request_log',
    {
      schema: {
        operationId: 'getMcpRequestLogs',
        description: 'Get MCP request logs with filtering and pagination',
        tags: ['MCP Request Log'],
        querystring: logQueryParamsWithPaginationSchema,
        response: {
          200: generatePaginatedResponseSchema(mcpRequestLogResponseSchema),
        },
      },
    },
    async (request, reply) => {
      try {
        const { page = 1, pageSize = 50, ...filters } = request.query;

        const result = await McpRequestLogModel.getRequestLogs(filters, page, pageSize);

        return reply.send({
          data: result.logs,
          total: result.totalPages * pageSize,
          page,
          pageSize,
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
  }>(
    '/api/mcp_request_log/:id',
    {
      schema: {
        operationId: 'getMcpRequestLogById',
        description: 'Get a single MCP request log by ID',
        tags: ['MCP Request Log'],
        response: {
          200: mcpRequestLogResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const id = parseInt(request.params.id, 10);
        if (isNaN(id)) {
          return reply.code(400).send({ error: 'Invalid ID format' });
        }

        const log = await McpRequestLogModel.getRequestLogById(id);

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
  }>(
    '/api/mcp_request_log/stats',
    {
      schema: {
        operationId: 'getMcpRequestLogStats',
        description: 'Get MCP request log statistics',
        tags: ['MCP Request Log'],
        querystring: logQueryParamsSchema,
        response: {
          200: mcpRequestLogStatsSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const stats = await McpRequestLogModel.getRequestLogStats(request.query);
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
  }>(
    '/api/mcp_request_log',
    {
      schema: {
        operationId: 'clearMcpRequestLogs',
        description: 'Clear MCP request logs',
        tags: ['MCP Request Log'],
        body: clearLogsBodySchema,
        response: {
          200: z.object({ cleared: z.number() }),
        },
      },
    },
    async (request, reply) => {
      try {
        const cleared = request.body.clearAll
          ? await McpRequestLogModel.clearAllLogs()
          : await McpRequestLogModel.cleanupOldLogs(7); // Clear logs older than 7 days by default

        return reply.send({ cleared });
      } catch (error) {
        fastify.log.error({ err: error }, 'Failed to clear MCP request logs');
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );
};

export default mcpRequestLogRoutes;
