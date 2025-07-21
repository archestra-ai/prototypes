import { Server, Zap } from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { useMCPServers } from '../../../hooks/use-mcp-servers';

export default function ArchestraMCPServer() {
  const { archestraMCPServer } = useMCPServers();

  const getStatusBadge = () => {
    switch (archestraMCPServer.status) {
      case 'connected':
        return (
          <Badge
            variant="outline"
            className="bg-green-50 text-green-700 border-green-200"
          >
            Running
          </Badge>
        );
      case 'error':
        return <Badge variant="destructive">Error</Badge>;
      case 'connecting':
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
        <CardDescription>
          The Model Context Protocol (MCP) server enables external applications
          to access your Archestra AI context and tools. Also serves as a proxy
          to route requests to other MCP servers running in sandboxes.
        </CardDescription>
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
            <Input
              id="server-url"
              value={archestraMCPServer.url}
              readOnly
              className="font-mono text-sm"
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Use this URL to connect to the Archestra MCP server.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-muted p-4 rounded-lg">
            <h4 className="font-medium mb-2 flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Available Tools
            </h4>
            {archestraMCPServer.status === 'connecting' ? (
              <div className="space-y-1 text-sm">
                <div>Loading tools...</div>
              </div>
            ) : (
              <div className="space-y-1 text-sm">
                {archestraMCPServer.tools.map((tool) => (
                  <div key={tool.name}>
                    • {tool.name} - {tool.description}
                  </div>
                ))}
              </div>
            )}
            {archestraMCPServer.error && (
              <div className="space-y-1 text-sm">
                <div>Error loading tools: {archestraMCPServer.error}</div>
              </div>
            )}
          </div>

          <div className="bg-muted p-4 rounded-lg">
            <h4 className="font-medium mb-2 flex items-center gap-2">
              <Server className="h-4 w-4" />
              Proxy Routing
            </h4>
            <div className="space-y-1 text-sm">
              <div>• /proxy/&lt;tool&gt; - Route to sandboxed servers</div>
              <div>• Auto-discovery of available tools</div>
              <div>• JSON-RPC 2.0 compliant responses</div>
              <div>• Error handling and fallbacks</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
