import { type GetMcpRequestLogsData } from '@ui/lib/clients/archestra/api/gen';

/**
 * NOTE: see the comment in desktop_app/src/backend/server/plugins/mcpRequestLog/index.ts
 *
 * Basically there is some bug in fastify-swagger (or fastify-type-provider-zod?), preventing us from exporting the
 * McpRequestLogFilters "schema" nicely in the openapi spec, and thereby in the codegen'd types
 */
export type McpRequestLogFilters = GetMcpRequestLogsData['query'];
