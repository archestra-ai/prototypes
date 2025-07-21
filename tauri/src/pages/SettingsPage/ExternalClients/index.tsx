import { Loader2 } from 'lucide-react';

import { Button } from '../../../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { useExternalMcpClients } from '../../../hooks/use-external-mcp-clients';

export default function ExternalClients() {
  const {
    supportedExternalMcpClientNames,
    connectedExternalMcpClients,
    isConnectingExternalMcpClient,
    isDisconnectingExternalMcpClient,
    connectExternalMcpClient,
    disconnectExternalMcpClient,
  } = useExternalMcpClients();

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {supportedExternalMcpClientNames.map((clientName) => {
        const connectedExternalMcpClient = connectedExternalMcpClients.find(
          (client) => client.client_name === clientName,
        );

        return (
          <Card key={clientName}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-orange-400 to-orange-600 rounded-md flex items-center justify-center text-white font-bold text-sm">
                  {clientName.charAt(0).toUpperCase()}
                </div>
                <span className="text-lg font-medium">{clientName}</span>
              </CardTitle>
              <CardDescription>
                Connect {clientName} to your Archestra MCP server.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    {connectedExternalMcpClient?.is_connected ? (
                      <Badge
                        variant="outline"
                        className="bg-green-50 text-green-700 border-green-200"
                      >
                        Connected
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="bg-gray-50 text-gray-700 border-gray-200"
                      >
                        Disconnected
                      </Badge>
                    )}
                  </div>
                  {connectedExternalMcpClient?.last_connected && (
                    <p className="text-xs text-muted-foreground">
                      Last connected:{' '}
                      {connectedExternalMcpClient.last_connected}
                    </p>
                  )}
                </div>
                <Button
                  variant={
                    connectedExternalMcpClient?.is_connected
                      ? 'destructive'
                      : 'outline'
                  }
                  size="sm"
                  onClick={() =>
                    connectedExternalMcpClient?.is_connected
                      ? disconnectExternalMcpClient(clientName)
                      : connectExternalMcpClient(clientName)
                  }
                  disabled={
                    isConnectingExternalMcpClient ||
                    isDisconnectingExternalMcpClient
                  }
                >
                  {isConnectingExternalMcpClient ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Connecting...
                    </>
                  ) : connectedExternalMcpClient?.is_connected ? (
                    'Disconnect'
                  ) : (
                    'Connect'
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
