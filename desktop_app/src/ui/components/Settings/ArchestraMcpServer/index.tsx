import { Server } from 'lucide-react';

import { Badge } from '@ui/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@ui/components/ui/card';
import { Input } from '@ui/components/ui/input';
import { Label } from '@ui/components/ui/label';
import config from '@ui/config';
import { ConnectedMcpServer } from '@ui/types';

interface ArchestraMcpServerProps {
  archestraMcpServer: ConnectedMcpServer;
}

export default function ArchestraMcpServer({ archestraMcpServer: { state } }: ArchestraMcpServerProps) {
  const getStatusBadge = () => {
    switch (state) {
      case 'running':
        return (
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
            Running
          </Badge>
        );
      case 'initializing':
        return <Badge variant="destructive">Error</Badge>;
      case 'error':
        return <Badge variant="outline">Loading...</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Server className="h-5 w-5" />
          Archestra MCP Server
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label htmlFor="server-status">Server Status</Label>
            <div className="flex items-center gap-2">{getStatusBadge()}</div>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="server-url">Server URL</Label>
          <div className="flex items-center gap-2">
            <Input id="server-url" value={config.archestra.mcpUrl} readOnly className="font-mono text-sm" />
          </div>
          <p className="text-sm text-muted-foreground">Use this URL to connect to the Archestra MCP server.</p>
        </div>
      </CardContent>
    </Card>
  );
}
