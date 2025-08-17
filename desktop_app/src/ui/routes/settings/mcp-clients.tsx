import { createFileRoute } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';

import { Badge } from '@ui/components/ui/badge';
import { Button } from '@ui/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ui/components/ui/card';
import { useExternalMcpClientsStore } from '@ui/stores';

export const Route = createFileRoute('/settings/mcp-clients')({
  component: ExternalClients,
});

export default function ExternalClients() {
  const {
    supportedExternalMcpClientNames,
    connectedExternalMcpClients,
    isConnectingExternalMcpClient,
    isDisconnectingExternalMcpClient,
    connectExternalMcpClient,
    disconnectExternalMcpClient,
  } = useExternalMcpClientsStore();

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {supportedExternalMcpClientNames.map((clientName) => {
        const connectedExternalMcpClient = connectedExternalMcpClients.find(
          (client) => client.clientName === clientName
        );
        const isConnected = connectedExternalMcpClient !== undefined;

        return (
          <Card key={clientName}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-orange-400 to-orange-600 rounded-md flex items-center justify-center text-white font-bold text-sm">
                  {clientName.charAt(0).toUpperCase()}
                </div>
                <span className="text-lg font-medium">{clientName}</span>
              </CardTitle>
              <CardDescription>Connect {clientName} to your Archestra MCP server.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                {isConnected && (
                  <div className="space-y-1">
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                      Connected
                    </Badge>
                  </div>
                )}
                <Button
                  className="cursor-pointer"
                  variant={isConnected ? 'destructive' : 'outline'}
                  size="sm"
                  onClick={() =>
                    isConnected ? disconnectExternalMcpClient(clientName) : connectExternalMcpClient(clientName)
                  }
                  disabled={isConnectingExternalMcpClient || isDisconnectingExternalMcpClient}
                >
                  {isConnectingExternalMcpClient ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Connecting...
                    </>
                  ) : isConnected ? (
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
