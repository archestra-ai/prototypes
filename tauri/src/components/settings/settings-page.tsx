import { useState, useEffect } from "react";
import { Copy, Check, Server, ExternalLink, Loader2 } from "lucide-react";

import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Alert, AlertDescription } from "../ui/alert";

const MCP_SERVER_URL = "http://127.0.0.1:54587";

export function SettingsPage() {
  const [serverStatus, setServerStatus] = useState<"loading" | "running" | "error">("loading");
  const [copySuccess, setCopySuccess] = useState(false);
  const [error, setError] = useState<string>("");
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [lastTestResult, setLastTestResult] = useState<"success" | "error" | null>(null);
  const [lastTestTime, setLastTestTime] = useState<Date | null>(null);

  useEffect(() => {
    // Check server status on mount and periodically
    checkServerStatus();
    const interval = setInterval(checkServerStatus, 5000);
    return () => clearInterval(interval);
  }, []);

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
          Configure your Archestra AI desktop application settings and view system information.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            MCP Server Configuration
          </CardTitle>
          <CardDescription>
            The Model Context Protocol (MCP) server enables external applications like Claude Desktop 
            to access your Archestra AI context and tools.
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
              Use this URL to connect external MCP clients like Claude Desktop.
            </p>
          </div>

          <div className="bg-muted p-4 rounded-lg">
            <h4 className="font-medium mb-2">Available Tools</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
              <div>• get_context - Get current Archestra context</div>
              <div>• update_context - Update project context</div>
              <div>• set_active_models - Set active models</div>
              <div>• list_resources - List available resources</div>
              <div>• get_resource - Get specific resource</div>
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
    </div>
  );
}