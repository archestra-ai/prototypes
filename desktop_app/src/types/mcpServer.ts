import { z } from 'zod';

import { selectMcpServerSchema } from '@backend/models/mcpServer';
import type { GetServerByNameResponses } from '@clients/archestra/catalog/gen';
import { McpServerUserConfigValuesSchema } from '@schemas';

/**
 * The following types represent how we store MCP servers in the application database
 */
export type McpServer = z.infer<typeof selectMcpServerSchema>;
export type McpServerUserConfigValues = z.infer<typeof McpServerUserConfigValuesSchema>;

/**
 * The below types represent what an MCP server looks like IN THE CATALOG (ie. what we get back from the catalog api)
 */
export type McpCatalogManifest = GetServerByNameResponses['200'];
export type McpCatalogServerConfig = McpCatalogManifest['server'];
export type McpCatalogUserConfig = McpCatalogManifest['user_config'];
