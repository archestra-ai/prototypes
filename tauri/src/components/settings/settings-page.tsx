import { useState, useEffect } from "react";
import { Copy, Check, Server, ExternalLink, Loader2, Users, Monitor, Code, Zap } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";

import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Alert, AlertDescription } from "../ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";

const MCP_SERVER_URL = "http://127.0.0.1:54587";

type ClientStatus = "disconnected" | "connected" | "connecting" | "error";

interface ClientConnection {
  status: ClientStatus;
  lastConnected?: Date;
  error?: string;
}

export function SettingsPage() {
  const [serverStatus, setServerStatus] = useState<"loading" | "running" | "error">("loading");
  const [copySuccess, setCopySuccess] = useState(false);
  const [error, setError] = useState<string>("");
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [lastTestResult, setLastTestResult] = useState<"success" | "error" | null>(null);
  const [lastTestTime, setLastTestTime] = useState<Date | null>(null);
  
  // Client connection states
  const [clientConnections, setClientConnections] = useState<Record<string, ClientConnection>>({
    claude: { status: "disconnected" },
    vscode: { status: "disconnected" },
    cursor: { status: "disconnected" }
  });

  useEffect(() => {
    // Check server status on mount and periodically
    checkServerStatus();
    const serverInterval = setInterval(checkServerStatus, 5000);
    
    // Check client connection statuses on mount and periodically
    checkClientStatuses();
    const clientInterval = setInterval(checkClientStatuses, 10000);
    
    return () => {
      clearInterval(serverInterval);
      clearInterval(clientInterval);
    };
  }, []);

  const checkClientStatuses = async () => {
    const clients = ["cursor", "claude", "vscode"];
    
    for (const clientId of clients) {
      try {
        const isConnected = await invoke<boolean>("check_client_connection_status", { client: clientId });
        setClientConnections(prev => ({
          ...prev,
          [clientId]: { 
            status: isConnected ? "connected" : "disconnected"
          }
        }));
      } catch (err) {
        console.error(`Failed to check ${clientId} status:`, err);
        setClientConnections(prev => ({
          ...prev,
          [clientId]: { 
            status: "error", 
            error: `Failed to check connection status: ${err}`
          }
        }));
      }
    }
  };

  const checkServerStatus = async () => {
    try {
      const response = await fetch(`${MCP_SERVER_URL}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000), // Shorter timeout for status checks
      });
      
      if (response.ok) {
        setServerStatus("running");
        setError("");
      } else {
        setServerStatus("error");
        setError(`Server responded with status: ${response.status}`);
      }
    } catch (err) {
      setServerStatus("error");
      setError("Server not reachable");
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(MCP_SERVER_URL);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const testServerConnection = async () => {
    setIsTestingConnection(true);
    setError("");
    
    try {
      const response = await fetch(`${MCP_SERVER_URL}/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        // Add timeout
        signal: AbortSignal.timeout(5000),
      });
      
      if (response.ok) {
        const text = await response.text();
        console.log('Health check response:', text);
        setServerStatus("running");
        setError("");
        setLastTestResult("success");
        setLastTestTime(new Date());
      } else {
        setServerStatus("error");
        setError(`Server responded with status: ${response.status}`);
        setLastTestResult("error");
        setLastTestTime(new Date());
      }
    } catch (err) {
      console.error('Health check error:', err);
      setServerStatus("error");
      setError(`Connection failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setLastTestResult("error");
      setLastTestTime(new Date());
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleClientConnection = async (clientId: string) => {
    setClientConnections(prev => ({
      ...prev,
      [clientId]: { status: "connecting" }
    }));

    try {
      // Use the generic connect_mcp_client command
      await invoke("connect_mcp_client", { clientName: clientId });
      
      // Refresh status from database after successful connection
      const isConnected = await invoke<boolean>("check_client_connection_status", { client: clientId });
      setClientConnections(prev => ({
        ...prev,
        [clientId]: { 
          status: isConnected ? "connected" : "disconnected"
        }
      }));
    } catch (err) {
      console.error(`Failed to connect ${clientId}:`, err);
      setClientConnections(prev => ({
        ...prev,
        [clientId]: { 
          status: "error", 
          error: err instanceof Error ? err.message : "Failed to establish connection"
        }
      }));
    }
  };

  const handleClientDisconnection = async (clientId: string) => {
    setClientConnections(prev => ({
      ...prev,
      [clientId]: { status: "connecting" }
    }));

    try {
      // Use the generic disconnect_mcp_client command
      await invoke("disconnect_mcp_client", { clientName: clientId });
      
      // Refresh status from database after successful disconnection
      const isConnected = await invoke<boolean>("check_client_connection_status", { client: clientId });
      setClientConnections(prev => ({
        ...prev,
        [clientId]: { 
          status: isConnected ? "connected" : "disconnected"
        }
      }));
    } catch (err) {
      console.error(`Failed to disconnect ${clientId}:`, err);
      setClientConnections(prev => ({
        ...prev,
        [clientId]: { 
          status: "error", 
          error: err instanceof Error ? err.message : "Failed to disconnect"
        }
      }));
    }
  };

  const getClientStatusBadge = (status: ClientStatus) => {
    switch (status) {
      case "connected":
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Connected</Badge>;
      case "connecting":
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Connecting...</Badge>;
      case "error":
        return <Badge variant="destructive">Error</Badge>;
      case "disconnected":
      default:
        return <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">Disconnected</Badge>;
    }
  };

  const getStatusBadge = () => {
    switch (serverStatus) {
      case "running":
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Running</Badge>;
      case "error":
        return <Badge variant="destructive">Error</Badge>;
      case "loading":
        return <Badge variant="outline">Loading...</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

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
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5" />
                Archestra MCP Server
              </CardTitle>
              <CardDescription>
                The Model Context Protocol (MCP) server enables external applications to access your Archestra AI context and tools.
                Also serves as a proxy to route requests to other MCP servers running in sandboxes.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label htmlFor="server-status">Server Status</Label>
                  <div className="flex items-center gap-2">
                    {getStatusBadge()}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={testServerConnection}
                      disabled={isTestingConnection}
                    >
                      {isTestingConnection ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Testing...
                        </>
                      ) : (
                        "Test Connection"
                      )}
                    </Button>
                  </div>
                  {lastTestResult && lastTestTime && (
                    <p className="text-sm text-muted-foreground">
                      {lastTestResult === "success" 
                        ? "✓ Connection test successful" 
                        : "✗ Connection test failed"
                      } - {lastTestTime.toLocaleTimeString()}
                    </p>
                  )}
                </div>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="server-url">Server URL</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="server-url"
                    value={MCP_SERVER_URL}
                    readOnly
                    className="font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={copyToClipboard}
                    className="shrink-0"
                  >
                    {copySuccess ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => window.open(`${MCP_SERVER_URL}/health`, '_blank')}
                    className="shrink-0"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  Use this URL to connect external MCP clients. Supports both traditional MCP protocol and proxy routing.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-muted p-4 rounded-lg">
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    Native Tools
                  </h4>
                  <div className="space-y-1 text-sm">
                    <div>• get_context - Get current Archestra context</div>
                    <div>• update_context - Update project context</div>
                    <div>• set_active_models - Set active models</div>
                    <div>• list_resources - List available resources</div>
                    <div>• get_resource - Get specific resource</div>
                  </div>
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

          <Card>
            <CardHeader>
              <CardTitle>Application Information</CardTitle>
              <CardDescription>
                System information and application details.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Application Name</Label>
                  <p className="text-sm text-muted-foreground">Archestra AI</p>
                </div>
                <div>
                  <Label>Version</Label>
                  <p className="text-sm text-muted-foreground">0.1.0</p>
                </div>
                <div>
                  <Label>Platform</Label>
                  <p className="text-sm text-muted-foreground">Desktop (Tauri)</p>
                </div>
                <div>
                  <Label>MCP Protocol Version</Label>
                  <p className="text-sm text-muted-foreground">2024-11-05</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="clients" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Claude Desktop */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-gradient-to-br from-orange-400 to-orange-600 rounded-md flex items-center justify-center text-white font-bold text-sm">
                    C
                  </div>
                  Claude Desktop
                </CardTitle>
                <CardDescription>
                  Connect Anthropic's Claude Desktop app to your Archestra MCP server.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {getClientStatusBadge(clientConnections.claude.status)}
                    </div>
                    {clientConnections.claude.lastConnected && (
                      <p className="text-xs text-muted-foreground">
                        Last connected: {clientConnections.claude.lastConnected.toLocaleTimeString()}
                      </p>
                    )}
                    {clientConnections.claude.error && (
                      <p className="text-xs text-red-600">
                        {clientConnections.claude.error}
                      </p>
                    )}
                  </div>
                  <Button 
                    variant={clientConnections.claude.status === "connected" ? "destructive" : "outline"} 
                    size="sm"
                    onClick={() => clientConnections.claude.status === "connected" 
                      ? handleClientDisconnection("claude") 
                      : handleClientConnection("claude")
                    }
                    disabled={clientConnections.claude.status === "connecting"}
                  >
                    {clientConnections.claude.status === "connecting" ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Connecting...
                      </>
                    ) : clientConnections.claude.status === "connected" ? (
                      "Disconnect"
                    ) : (
                      "Connect"
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* VS Code */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-700 rounded-md flex items-center justify-center text-white">
                    <Code className="h-4 w-4" />
                  </div>
                  VS Code
                </CardTitle>
                <CardDescription>
                  Connect Visual Studio Code with MCP extension to Archestra.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {getClientStatusBadge(clientConnections.vscode.status)}
                    </div>
                    {clientConnections.vscode.lastConnected && (
                      <p className="text-xs text-muted-foreground">
                        Last connected: {clientConnections.vscode.lastConnected.toLocaleTimeString()}
                      </p>
                    )}
                    {clientConnections.vscode.error && (
                      <p className="text-xs text-red-600">
                        {clientConnections.vscode.error}
                      </p>
                    )}
                  </div>
                  <Button 
                    variant={clientConnections.vscode.status === "connected" ? "destructive" : "outline"} 
                    size="sm"
                    onClick={() => clientConnections.vscode.status === "connected" 
                      ? handleClientDisconnection("vscode") 
                      : handleClientConnection("vscode")
                    }
                    disabled={clientConnections.vscode.status === "connecting"}
                  >
                    {clientConnections.vscode.status === "connecting" ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Connecting...
                      </>
                    ) : clientConnections.vscode.status === "connected" ? (
                      "Disconnect"
                    ) : (
                      "Connect"
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Cursor */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-purple-700 rounded-md flex items-center justify-center text-white">
                    <Monitor className="h-4 w-4" />
                  </div>
                  Cursor
                </CardTitle>
                <CardDescription>
                  Connect Cursor AI editor to your Archestra MCP server.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {getClientStatusBadge(clientConnections.cursor.status)}
                    </div>
                    {clientConnections.cursor.lastConnected && (
                      <p className="text-xs text-muted-foreground">
                        Last connected: {clientConnections.cursor.lastConnected.toLocaleTimeString()}
                      </p>
                    )}
                    {clientConnections.cursor.error && (
                      <p className="text-xs text-red-600">
                        {clientConnections.cursor.error}
                      </p>
                    )}
                  </div>
                  <Button 
                    variant={clientConnections.cursor.status === "connected" ? "destructive" : "outline"} 
                    size="sm"
                    onClick={() => clientConnections.cursor.status === "connected" 
                      ? handleClientDisconnection("cursor") 
                      : handleClientConnection("cursor")
                    }
                    disabled={clientConnections.cursor.status === "connecting"}
                  >
                    {clientConnections.cursor.status === "connecting" ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Connecting...
                      </>
                    ) : clientConnections.cursor.status === "connected" ? (
                      "Disconnect"
                    ) : (
                      "Connect"
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Connection Instructions</CardTitle>
              <CardDescription>
                Step-by-step guide to connect external clients to your Archestra MCP server.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-medium">
                    1
                  </div>
                  <div>
                    <h4 className="font-medium">Ensure Archestra MCP Server is Running</h4>
                    <p className="text-sm text-muted-foreground">
                      Check the Servers tab to verify your MCP server status is "Running".
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-medium">
                    2
                  </div>
                  <div>
                    <h4 className="font-medium">Configure Your Client</h4>
                    <p className="text-sm text-muted-foreground">
                      Use the server URL <code className="bg-muted px-1 rounded">{MCP_SERVER_URL}</code> in your client's MCP configuration.
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-medium">
                    3
                  </div>
                  <div>
                    <h4 className="font-medium">Test the Connection</h4>
                    <p className="text-sm text-muted-foreground">
                      Use the "Test Connection" button above or try accessing tools from your client.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
