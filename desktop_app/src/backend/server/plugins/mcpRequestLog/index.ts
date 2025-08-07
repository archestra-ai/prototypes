import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import McpRequestLogModel, {
  McpRequestLogFiltersSchema,
  McpRequestLogSchema,
  McpRequestLogStatsSchema,
} from '@backend/models/mcpRequestLog';
import { ErrorResponseSchema, StringNumberIdSchema } from '@backend/schemas';

export const McpRequestLogFiltersWithPaginationSchema = McpRequestLogFiltersSchema.extend({
  page: z.number().min(1).default(1).optional(),
  pageSize: z.number().min(1).max(100).default(50).optional(),
});

/**
 * Register our zod schemas into the global registry, such that they get output as components in the openapi spec
 * https://github.com/turkerdev/fastify-type-provider-zod?tab=readme-ov-file#how-to-create-refs-to-the-schemas
 */
z.globalRegistry.add(McpRequestLogSchema, { id: 'McpRequestLog' });

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
          200: z.object({
            data: z.array(McpRequestLogSchema),
            total: z.number(),
            page: z.number(),
            pageSize: z.number(),
          }),
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
          200: McpRequestLogSchema,
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
