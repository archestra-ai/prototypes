import { AlertCircle, ChevronDown, Loader2, Server } from 'lucide-react';

import { MCPServerStatus } from '@types';
import { Button } from '@ui/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@ui/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@ui/components/ui/collapsible';
import { useMCPServersStore } from '@ui/stores/mcp-servers-store';

import MCPServer from './MCPServer';

interface MCPServersProps {}

export default function MCPServers(_props: MCPServersProps) {
  const { installedMCPServers, loadingInstalledMCPServers, errorLoadingInstalledMCPServers } = useMCPServersStore();

  const totalNumberOfMCPTools = installedMCPServers.reduce((acc, server) => acc + server.tools.length, 0);
  const hasErrorLoadingInstalledMCPServers = errorLoadingInstalledMCPServers !== null;

  return (
    <Collapsible defaultOpen>
      <Card>
        <CardHeader>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full flex items-center justify-between p-0 h-auto">
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5" />
                MCP Servers & Tools
                {loadingInstalledMCPServers && <Loader2 className="h-4 w-4 animate-spin" />}
              </CardTitle>
              <div className="flex items-center gap-2">
                <ChevronDown className="h-4 w-4" />
              </div>
            </Button>
          </CollapsibleTrigger>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="space-y-4">
            {hasErrorLoadingInstalledMCPServers && (
              <div className="text-center py-4 text-muted-foreground">
                <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Error loading MCP servers: {errorLoadingInstalledMCPServers}</p>
              </div>
            )}
            {loadingInstalledMCPServers && (
              <div className="text-center py-4 text-muted-foreground">
                <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin" />
                <p>Loading MCP servers...</p>
              </div>
            )}
            {installedMCPServers.length === 0 && !loadingInstalledMCPServers && !hasErrorLoadingInstalledMCPServers ? (
              <div className="text-center py-4 text-muted-foreground">
                <Server className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No MCP servers configured</p>
              </div>
            ) : (
              <div className="space-y-3">
                {installedMCPServers.map((server) => (
                  <MCPServer key={server.name} mcpServer={server} />
                ))}
              </div>
            )}

            {installedMCPServers.length > 0 && (
              <div className="border-t pt-3 mt-4">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>
                    Total: {installedMCPServers.length} server
                    {installedMCPServers.length !== 1 ? 's' : ''}, {totalNumberOfMCPTools} tool
                    {totalNumberOfMCPTools !== 1 ? 's' : ''}
                  </span>
                  <span>
                    {installedMCPServers.filter((s) => s.status === MCPServerStatus.Connected).length} connected
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
