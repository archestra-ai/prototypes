import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../../components/ui/collapsible";
import {
  Server,
  Wrench,
  ChevronDown,
  AlertCircle,
  CheckCircle,
  Loader2,
} from "lucide-react";
import type { ConnectedMCPServer } from "../../../types";
import { useMCPServers } from "../../../contexts/mcp-servers-context";

interface MCPServersProps {}

export default function MCPServers(_props: MCPServersProps) {
  const { installedMCPServers, loadingInstalledMCPServers, errorLoadingInstalledMCPServers } = useMCPServers();

  const getStatusIcon = (status: ConnectedMCPServer['status']) => {
    switch (status) {
      case 'connecting':
        return <Loader2 className="h-4 w-4 animate-spin text-yellow-500" />;
      case 'connected':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
    }
  };

  const getStatusBadge = (status: ConnectedMCPServer['status']) => {
    switch (status) {
      case 'connecting':
        return <Badge variant="outline" className="text-yellow-600 border-yellow-500">Connecting</Badge>;
      case 'connected':
        return <Badge variant="outline" className="text-green-600 border-green-500">Connected</Badge>;
      case 'error':
        return <Badge variant="outline" className="text-red-600 border-red-500">Error</Badge>;
    }
  };

  const totalNumberOfMCPTools = installedMCPServers.reduce((acc, server) => acc + server.tools.length, 0);

  return (
    <Collapsible defaultOpen>
      <Card>
        <CardHeader>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              className="w-full flex items-center justify-between p-0 h-auto"
            >
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
            {errorLoadingInstalledMCPServers && (
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
            {installedMCPServers.length === 0 && !loadingInstalledMCPServers && !errorLoadingInstalledMCPServers ? (
              <div className="text-center py-4 text-muted-foreground">
                <Server className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No MCP servers configured</p>
              </div>
            ) : (
              <div className="space-y-3">
                {installedMCPServers.map((server) => {
                  return (
                    <Card key={server.name} className="border-l-4 border-l-blue-500/20">
                      <CardContent className="pt-4">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {getStatusIcon(server.status)}
                              <h4 className="font-medium">{server.name}</h4>
                              {getStatusBadge(server.status)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {server.tools.length} tool{server.tools.length !== 1 ? 's' : ''}
                            </div>
                          </div>

                          <div className="text-xs text-muted-foreground font-mono bg-muted/50 px-2 py-1 rounded">
                            {server.url}
                          </div>

                          {server.status === 'error' && server.error && (
                            <div className="text-xs text-red-600 bg-red-50 dark:bg-red-950/30 px-2 py-1 rounded border border-red-200 dark:border-red-800">
                              Error: {server.error}
                            </div>
                          )}

                          {server.tools.length > 0 && (
                            <div className="space-y-2">
                              <h5 className="text-sm font-medium flex items-center gap-1">
                                <Wrench className="h-3 w-3" />
                                Available Tools
                              </h5>
                              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                {server.tools.map((tool) => (
                                  <div
                                    key={`${server.name}-${tool.name}`}
                                    className="p-2 border rounded-md bg-background/50 hover:bg-background transition-colors"
                                  >
                                    <div className="flex items-start justify-between">
                                      <div className="min-w-0 flex-1">
                                        <div className="font-mono text-sm font-medium truncate">
                                          {tool.name}
                                        </div>
                                        {tool.description && (
                                          <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                            {tool.description}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {server.status === 'connected' && server.tools.length === 0 && (
                            <div className="text-sm text-muted-foreground italic">
                              No tools available from this server
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            {installedMCPServers.length > 0 && (
              <div className="border-t pt-3 mt-4">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>
                    Total: {installedMCPServers.length} server{installedMCPServers.length !== 1 ? 's' : ''}, {totalNumberOfMCPTools} tool{totalNumberOfMCPTools !== 1 ? 's' : ''}
                  </span>
                  <span>
                    {installedMCPServers.filter(s => s.status === 'connected').length} connected
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
