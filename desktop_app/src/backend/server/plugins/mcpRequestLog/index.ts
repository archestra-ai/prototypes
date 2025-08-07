import {
  ErrorResponseSchema,
  McpRequestLogFiltersSchema,
  McpRequestLogFiltersWithPaginationSchema,
  McpRequestLogStatsSchema,
  StringNumberIdSchema,
  generatePaginatedResponseSchema,
} from '@archestra/schemas';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import McpRequestLogModel, { selectMcpRequestLogSchema } from '@backend/models/mcpRequestLog';

const mcpRequestLogResponseSchema = selectMcpRequestLogSchema.transform((log) => ({
  ...log,
  id: log.id.toString(),
  status: log.statusCode >= 200 && log.statusCode < 300 ? 'success' : 'error',
}));

const mcpRequestLogRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    '/api/mcp_request_log',
    {
      schema: {
        operationId: 'getMcpRequestLogs',
        description: 'Get MCP request logs with filtering and pagination',
        tags: ['MCP Request Log'],
        querystring: McpRequestLogFiltersWithPaginationSchema,
        response: {
          200: generatePaginatedResponseSchema(mcpRequestLogResponseSchema),
        },
      },
    },
    async ({ query: { page = 1, pageSize = 50, ...filters } }, reply) => {
      const result = await McpRequestLogModel.getRequestLogs(filters, page, pageSize);
      return reply.send({
        data: result.logs,
        total: result.totalPages * pageSize,
        page,
        pageSize,
      });
    }
  );

  fastify.get(
    '/api/mcp_request_log/:id',
    {
      schema: {
        operationId: 'getMcpRequestLogById',
        description: 'Get a single MCP request log by ID',
        tags: ['MCP Request Log'],
        params: z.object({
          id: StringNumberIdSchema,
        }),
        response: {
          200: mcpRequestLogResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async ({ params: { id } }, reply) => {
      const log = await McpRequestLogModel.getRequestLogById(id);
      if (!log) {
        return reply.code(404).send({ error: 'Request log not found' });
      }

      return reply.send(log);
    }
  );

  fastify.get(
    '/api/mcp_request_log/stats',
    {
      schema: {
        operationId: 'getMcpRequestLogStats',
        description: 'Get MCP request log statistics',
        tags: ['MCP Request Log'],
        querystring: McpRequestLogFiltersSchema,
        response: {
          200: McpRequestLogStatsSchema,
        },
      },
    },
    async ({ query }, reply) => {
      const stats = await McpRequestLogModel.getRequestLogStats(query);
      return reply.send(stats);
    }
  );

  fastify.delete(
    '/api/mcp_request_log',
    {
      schema: {
        operationId: 'clearMcpRequestLogs',
        description: 'Clear MCP request logs',
        tags: ['MCP Request Log'],
        body: z.object({
          clearAll: z.boolean(),
        }),
        response: {
          200: z.object({ cleared: z.number() }),
        },
      },
    },
    async ({ body: { clearAll } }, reply) => {
      /**
       * If the user doesn't specify to clear all logs, we'll clear logs older than 7 days by default
       */
      const cleared = clearAll ? await McpRequestLogModel.clearAllLogs() : await McpRequestLogModel.cleanupOldLogs(7);
      return reply.send({ cleared });
    }
  );
};

export default mcpRequestLogRoutes;
