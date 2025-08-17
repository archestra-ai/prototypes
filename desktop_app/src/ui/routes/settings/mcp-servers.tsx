import { createFileRoute } from '@tanstack/react-router';

import ArchestraMcpServer from '@ui/components/Settings/ArchestraMcpServer';
import McpRequestLogs from '@ui/components/Settings/McpRequestLogs';
import McpServers from '@ui/components/Settings/McpServers';
import { useMcpServersStore } from '@ui/stores';

export const Route = createFileRoute('/settings/mcp-servers')({
  component: McpServersSettings,
});

function McpServersSettings() {
  const { archestraMcpServer } = useMcpServersStore();
  const archestraMcpServerIsLoading = archestraMcpServer === null;

  return (
    <div className="space-y-3">
      {archestraMcpServerIsLoading ? (
        <div>Loading Archestra MCP server...</div>
      ) : (
        <ArchestraMcpServer archestraMcpServer={archestraMcpServer} />
      )}
      <McpServers />
      <McpRequestLogs />
    </div>
  );
}
