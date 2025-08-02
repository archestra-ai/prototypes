import { Loader2 } from 'lucide-react';

import { Badge } from '@ui/components/ui/badge';
import { Button } from '@ui/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ui/components/ui/card';
import { useExternalMCPClientsStore } from '@ui/stores/external-mcp-clients-store';

export default function ExternalClients() {
  const {
    supportedExternalMCPClientNames,
    connectedExternalMCPClients,
    isConnectingExternalMCPClient,
    isDisconnectingExternalMCPClient,
    connectExternalMCPClient,
    disconnectExternalMCPClient,
  } = useExternalMCPClientsStore();

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {supportedExternalMCPClientNames.map((clientName) => {
        const connectedExternalMCPClient = connectedExternalMCPClients.find(
          (client) => client.client_name === clientName
        );
        const isConnected = connectedExternalMCPClient !== undefined;

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
                  variant={isConnected ? 'destructive' : 'outline'}
                  size="sm"
                  onClick={() =>
                    isConnected ? disconnectExternalMCPClient(clientName) : connectExternalMCPClient(clientName)
                  }
                  disabled={isConnectingExternalMCPClient || isDisconnectingExternalMCPClient}
                >
                  {isConnectingExternalMCPClient ? (
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
