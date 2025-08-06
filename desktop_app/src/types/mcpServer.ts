import { z } from 'zod/v4';

import { selectMcpServerSchema } from '@backend/models/mcpServer';

export type ServerConfig = {
  command: string;
  args: string[];
  env: Record<string, string>;
};

export type McpServer = z.infer<typeof selectMcpServerSchema>;
