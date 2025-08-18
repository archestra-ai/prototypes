import { Client } from '@modelcontextprotocol/sdk/client/index.js';

import { McpServer, PodmanContainerStatusSummary } from '@ui/lib/clients/archestra/api/gen';

export type McpServerUserConfigValues = McpServer['userConfigValues'];

export type ConnectedMcpServer = McpServer &
  PodmanContainerStatusSummary & {
    url: string;
    client: Client | null;
  };
