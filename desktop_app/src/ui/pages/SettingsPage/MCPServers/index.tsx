import { AlertCircle, ChevronDown, Loader2, Server, Settings } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@ui/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@ui/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@ui/components/ui/collapsible';
import { useMcpServersStore } from '@ui/stores/mcp-servers-store';
import { McpServerStatus } from '@ui/types';

import McpServer from './McpServer';
import SettingsDialog from './SettingsDialog';

interface McpServersProps {}

export default function McpServers(_props: McpServersProps) {
  const { installedMcpServers, loadingInstalledMcpServers, errorLoadingInstalledMcpServers } = useMcpServersStore();
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);

  const totalNumberOfMcpTools = installedMcpServers.reduce((acc, server) => acc + server.tools.length, 0);
  const hasErrorLoadingInstalledMcpServers = errorLoadingInstalledMcpServers !== null;

  return (
    <Collapsible defaultOpen>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between p-6">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="flex-1 justify-between p-0 h-auto cursor-pointer">
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5" />
                MCP Servers & Tools
                {loadingInstalledMcpServers && <Loader2 className="h-4 w-4 animate-spin" />}
              </CardTitle>
              <ChevronDown className="h-4 w-4" />
            </Button>
          </CollapsibleTrigger>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 ml-2 cursor-pointer"
            onClick={() => setSettingsDialogOpen(true)}
          >
            <Settings className="h-4 w-4" />
          </Button>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="space-y-4">
            {hasErrorLoadingInstalledMcpServers && (
              <div className="text-center py-4 text-muted-foreground">
                <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Error loading MCP servers: {errorLoadingInstalledMcpServers}</p>
              </div>
            )}
            {loadingInstalledMcpServers && (
              <div className="text-center py-4 text-muted-foreground">
                <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin" />
                <p>Loading MCP servers...</p>
              </div>
            )}
            {installedMcpServers.length === 0 && !loadingInstalledMcpServers && !hasErrorLoadingInstalledMcpServers ? (
              <div className="text-center py-4 text-muted-foreground">
                <Server className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No MCP servers configured</p>
              </div>
            ) : (
              <div className="space-y-3">
                {installedMcpServers.map((server) => (
                  <McpServer key={server.name} mcpServer={server} />
                ))}
              </div>
            )}

            {installedMcpServers.length > 0 && (
              <div className="border-t pt-3 mt-4">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>
                    Total: {installedMcpServers.length} server
                    {installedMcpServers.length !== 1 ? 's' : ''}, {totalNumberOfMcpTools} tool
                    {totalNumberOfMcpTools !== 1 ? 's' : ''}
                  </span>
                  <span>
                    {installedMcpServers.filter((s) => s.status === McpServerStatus.Connected).length} connected
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>

      <SettingsDialog open={settingsDialogOpen} onOpenChange={setSettingsDialogOpen} />
    </Collapsible>
  );
}
