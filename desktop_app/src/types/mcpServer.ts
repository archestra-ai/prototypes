import { z } from 'zod/v4';

import { selectMcpServerSchema } from '@backend/models/mcpServer';

export type McpServer = z.infer<typeof selectMcpServerSchema>;
