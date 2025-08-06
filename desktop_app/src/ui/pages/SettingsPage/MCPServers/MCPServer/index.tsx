import { AlertCircle, CheckCircle, Loader2, Wrench } from 'lucide-react';

import { Badge } from '@ui/components/ui/badge';
import { Card, CardContent } from '@ui/components/ui/card';
import { ConnectedMcpServer, McpServerStatus } from '@ui/types';

interface McpServerProps {
  mcpServer: ConnectedMcpServer;
}

export default function McpServer({ mcpServer: { name, status, tools, url, error } }: McpServerProps) {
  const getStatusIcon = (status: ConnectedMcpServer['status']) => {
    switch (status) {
      case McpServerStatus.Connecting:
        return <Loader2 className="h-4 w-4 animate-spin text-yellow-500" />;
      case McpServerStatus.Connected:
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case McpServerStatus.Error:
        return <AlertCircle className="h-4 w-4 text-red-500" />;
    }
  };

  const getStatusBadge = (status: ConnectedMcpServer['status']) => {
    switch (status) {
      case McpServerStatus.Connecting:
        return (
          <Badge variant="outline" className="text-yellow-600 border-yellow-500">
            Connecting
          </Badge>
        );
      case McpServerStatus.Connected:
        return (
          <Badge variant="outline" className="text-green-600 border-green-500">
            Connected
          </Badge>
        );
      case McpServerStatus.Error:
        return (
          <Badge variant="outline" className="text-red-600 border-red-500">
            Error
          </Badge>
        );
    }
  };

  return (
    <Card className="border-l-4 border-l-blue-500/20">
      <CardContent className="pt-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {getStatusIcon(status)}
              <h4 className="font-medium">{name}</h4>
              {getStatusBadge(status)}
            </div>
            <div className="text-xs text-muted-foreground">
              {tools.length} tool
              {tools.length !== 1 ? 's' : ''}
            </div>
          </div>

          <div className="text-xs text-muted-foreground font-mono bg-muted/50 px-2 py-1 rounded">{url}</div>

          {status === McpServerStatus.Error && error && (
            <div className="text-xs text-red-600 bg-red-50 dark:bg-red-950/30 px-2 py-1 rounded border border-red-200 dark:border-red-800">
              Error: {error}
            </div>
          )}

          {tools.length > 0 && (
            <div className="space-y-2">
              <h5 className="text-sm font-medium flex items-center gap-1">
                <Wrench className="h-3 w-3" />
                Available Tools
              </h5>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {tools.map((tool) => (
                  <div
                    key={`${name}-${tool.name}`}
                    className="p-2 border rounded-md bg-background/50 hover:bg-background transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="font-mono text-sm font-medium truncate">{tool.name}</div>
                        {tool.description && (
                          <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{tool.description}</div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {status === McpServerStatus.Connected && tools.length === 0 && (
            <div className="text-sm text-muted-foreground italic">No tools available from this server</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
