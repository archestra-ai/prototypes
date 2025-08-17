import { createFileRoute } from '@tanstack/react-router';

import ArchestraMcpServer from '@ui/pages/SettingsPage/ArchestraMcpServer';
import McpRequestLogs from '@ui/pages/SettingsPage/McpRequestLogs';
import McpServers from '@ui/pages/SettingsPage/McpServers';
import { useMcpServersStore } from '@ui/stores';

export const Route = createFileRoute('/settings/mcp-servers')({
  component: McpServersSettings,
});

function McpServersSettings() {
  const { archestraMcpServer } = useMcpServersStore();
  const archestraMcpServerIsLoading = archestraMcpServer === null;

  return (
    <div className="space-y-6">
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
