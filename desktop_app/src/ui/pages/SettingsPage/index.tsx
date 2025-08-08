import { Server, Users } from 'lucide-react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@ui/components/ui/tabs';
import { useMcpServersStore } from '@ui/stores/mcp-servers-store';
import { useSandboxStore } from '@ui/stores/sandbox-store';

import ArchestraMcpServer from './ArchestraMCPServer';
import ExternalClients from './ExternalClients';
import McpRequestLogs from './MCPRequestLogs';
import McpServers from './MCPServers';
import { SandboxStartupProgress } from './SandboxStartupProgress';

export default function SettingsPage() {
  const { archestraMcpServer } = useMcpServersStore();
  const { isInitialized: sandboxEnvironmentIsUp } = useSandboxStore();
  const archestraMcpServerIsLoading = archestraMcpServer === null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Settings</h2>
        <p className="text-muted-foreground">
          Configure your Archestra AI desktop application settings and manage MCP connections.
        </p>
      </div>

      <Tabs defaultValue="servers" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="servers" className="flex items-center gap-2">
            <Server className="h-4 w-4" />
            Servers
          </TabsTrigger>
          <TabsTrigger value="clients" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Clients
          </TabsTrigger>
        </TabsList>

        <TabsContent value="servers" className="space-y-6">
          {archestraMcpServerIsLoading ? (
            <div>Loading Archestra MCP server...</div>
          ) : (
            <ArchestraMcpServer archestraMcpServer={archestraMcpServer} />
          )}
          {sandboxEnvironmentIsUp ? <McpServers /> : <SandboxStartupProgress />}
          <McpRequestLogs />
        </TabsContent>

        <TabsContent value="clients" className="space-y-6">
          <ExternalClients />
        </TabsContent>
      </Tabs>
    </div>
  );
}
