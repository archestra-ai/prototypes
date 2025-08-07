import { McpServerConfigSchema, McpServerUserConfigValuesSchema } from '@archestra/schemas';
import { z } from 'zod';

import { selectMcpServerSchema } from '@backend/models/mcpServer';

export type McpServer = z.infer<typeof selectMcpServerSchema>;
export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;
export type McpServerUserConfigValues = z.infer<typeof McpServerUserConfigValuesSchema>;
