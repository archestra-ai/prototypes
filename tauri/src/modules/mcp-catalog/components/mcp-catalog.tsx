import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { Separator } from "../../../components/ui/separator";
import { Badge } from "../../../components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { ScrollArea } from "../../../components/ui/scroll-area";
import { Textarea } from "../../../components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../../components/ui/collapsible";
import {
  Mail,
  Plus,
  Download,
  Trash2,
  ChevronDown,
  Server,
  Settings,
  CheckCircle,
  XCircle,
} from "lucide-react";

interface MCPServer {
  command: string;
  args: string[];
  env?: { [key: string]: string };
}

interface MCPCatalogsProps {
  mcpServers: { [key: string]: MCPServer };
  setMcpServers: React.Dispatch<React.SetStateAction<{ [key: string]: MCPServer }>>;
  mcpServerStatus: { [key: string]: string };
  setMcpServerStatus: React.Dispatch<React.SetStateAction<{ [key: string]: string }>>;
  mcpServerLoading: { [key: string]: boolean };
  setMcpServerLoading: React.Dispatch<React.SetStateAction<{ [key: string]: boolean }>>;
  mcpServerStatuses: { [key: string]: boolean };
  loadMcpTools: () => Promise<void>;
  loadMcpServerStatuses: () => Promise<void>;
}

export function MCPCatalog({
  mcpServers,
  setMcpServers,
  mcpServerStatus,
  setMcpServerStatus,
  mcpServerLoading,
  setMcpServerLoading,
  mcpServerStatuses,
  loadMcpTools,
  loadMcpServerStatuses,
}: MCPCatalogsProps) {
  const [currentServerName, setCurrentServerName] = useState("");
  const [currentServerCommand, setCurrentServerCommand] = useState("env");
  const [currentServerArgs, setCurrentServerArgs] = useState("");
  const [jsonImport, setJsonImport] = useState("");
  const [activeSection, setActiveSection] = useState<"none" | "import" | "add">("none");
  const [showGmailSetup, setShowGmailSetup] = useState(false);
  const [gmailTokens, setGmailTokens] = useState<any>(null);

  const serverListRef = useRef<HTMLDivElement>(null);

  // Check for existing Gmail tokens on component mount
  useEffect(() => {
    checkGmailTokens();

    // Listen for OAuth success events from Tauri
    const setupEventListeners = async () => {
      const { listen } = await import('@tauri-apps/api/event');

      const unlistenOauthSuccess = await listen('oauth-success', (event: any) => {
        if (event.payload.provider === 'gmail') {
          handleOAuthSuccess(event.payload.tokens);
        }
      });

      const unlistenOauthError = await listen('oauth-error', (event: any) => {
        console.error('OAuth error:', event.payload);
        alert(`OAuth error: ${event.payload}`);
      });

      return () => {
        unlistenOauthSuccess();
        unlistenOauthError();
      };
    };

    const cleanupPromise = setupEventListeners();

    return () => {
      cleanupPromise.then(cleanup => cleanup());
    };
  }, []);

  async function checkGmailTokens() {
    try {
      const tokens = await invoke("load_gmail_tokens") as any;
      setGmailTokens(tokens);
    } catch (error) {
      console.error("Failed to load Gmail tokens:", error);
    }
  }

  async function handleOAuthSuccess(tokens: any) {
    try {
      // Update local state
      setGmailTokens(tokens);

      // Add MCP server to the list with proper args
      setMcpServers((prev) => ({
        ...prev,
        "Gmail MCP Server": {
          command: "npx",
          args: [
            "@gongrzhe/server-gmail-autoauth-mcp",
            `--access-token=${tokens.access_token}`,
            `--refresh-token=${tokens.refresh_token}`
          ],
          env: {},
        },
      }));

      // Close the setup dialog
      setShowGmailSetup(false);

      // Update server status (the backend already started it)
      setMcpServerStatus((prev) => ({
        ...prev,
        "Gmail MCP Server": "Gmail MCP server started successfully"
      }));

      // Show success message
      alert("Gmail authentication successful! The MCP server has been configured and started.");

    } catch (error) {
      console.error("Failed to handle OAuth success:", error);
      alert("Failed to update UI after OAuth success. Please try again.");
    }
  }

  async function addMcpServer() {
    if (!currentServerName.trim()) {
      alert("Please enter a server name");
      return;
    }

    // Parse arguments respecting quotes
    const parseArgs = (argString: string): string[] => {
      const args: string[] = [];
      let current = '';
      let inQuote = false;
      let quoteChar = '';
      
      for (let i = 0; i < argString.length; i++) {
        const char = argString[i];
        
        if ((char === '"' || char === "'") && !inQuote) {
          inQuote = true;
          quoteChar = char;
        } else if (char === quoteChar && inQuote) {
          inQuote = false;
          quoteChar = '';
        } else if (char === ' ' && !inQuote) {
          if (current.trim()) {
            args.push(current.trim());
            current = '';
          }
        } else {
          current += char;
        }
      }
      
      if (current.trim()) {
        args.push(current.trim());
      }
      
      return args;
    };
    
    const args = currentServerArgs.trim() ? parseArgs(currentServerArgs) : [];

    try {
      await invoke("save_mcp_server", {
        name: currentServerName,
        command: currentServerCommand,
        args: args,
        env: {},
      });

      setMcpServers((prev) => ({
        ...prev,
        [currentServerName]: {
          command: currentServerCommand,
          args: args,
          env: {},
        },
      }));

      setCurrentServerName("");
      setCurrentServerArgs("");
      setActiveSection("none");

      // If Ollama is running, refresh MCP tools after a delay to allow server to start
      try {
        await invoke("get_ollama_port");
        // Ollama is running, wait a bit for the server to start
        setTimeout(async () => {
          // Load MCP tools and server statuses
          await loadMcpTools();
          await loadMcpServerStatuses();
        }, 3000); // Wait 3 seconds for server to initialize
      } catch {
        // Ollama not running, server will start when Ollama starts
      }

      setTimeout(() => {
        if (serverListRef.current) {
          serverListRef.current.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
          });
        }
      }, 100);
    } catch (error) {
      console.error("Failed to save MCP server:", error);
      alert("Failed to save MCP server. Please try again.");
    }
  }


  async function stopMcpServer(serverName: string) {
    setMcpServerLoading((prev) => ({ ...prev, [serverName]: true }));
    setMcpServerStatus((prev) => ({
      ...prev,
      [serverName]: "Stopping MCP server...",
    }));

    try {
      await invoke("stop_persistent_mcp_server", {
        name: serverName,
      });

      setMcpServerStatus((prev) => ({
        ...prev,
        [serverName]: "MCP server stopped",
      }));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "An unknown error occurred";
      setMcpServerStatus((prev) => ({
        ...prev,
        [serverName]: `Error stopping server: ${errorMsg}`,
      }));
    }

    setMcpServerLoading((prev) => ({ ...prev, [serverName]: false }));
  }

  async function removeMcpServer(serverName: string) {
    try {
      await invoke("delete_mcp_server", { name: serverName });

      setMcpServers((prev) => {
        const newServers = { ...prev };
        delete newServers[serverName];
        return newServers;
      });

      setMcpServerStatus((prev) => {
        const newStatus = { ...prev };
        delete newStatus[serverName];
        return newStatus;
      });

      setMcpServerLoading((prev) => {
        const newLoading = { ...prev };
        delete newLoading[serverName];
        return newLoading;
      });
    } catch (error) {
      console.error("Failed to delete MCP server:", error);
      alert("Failed to delete MCP server. Please try again.");
    }
  }

  async function importFromJson() {
    try {
      const parsed = JSON.parse(jsonImport);
      let serversToImport: { [key: string]: MCPServer } = {};

      if (parsed.mcpServers && typeof parsed.mcpServers === "object") {
        serversToImport = parsed.mcpServers;
      } else if (typeof parsed === "object") {
        serversToImport = parsed;
      } else {
        throw new Error("Invalid JSON format");
      }

      const validServers: { [key: string]: MCPServer } = {};
      Object.entries(serversToImport).forEach(([name, config]) => {
        if (typeof config === "object" && "command" in config && "args" in config && Array.isArray(config.args)) {
          validServers[name] = {
            command: config.command,
            args: config.args,
            env: config.env && typeof config.env === "object" ? config.env : {},
          };
        }
      });

      if (Object.keys(validServers).length > 0) {
        try {
          await Promise.all(
            Object.entries(validServers).map(([name, config]) => {
              return invoke("save_mcp_server", {
                name: name,
                command: config.command,
                args: config.args,
                env: config.env || {},
              });
            })
          );

          setMcpServers((prev) => ({
            ...prev,
            ...validServers,
          }));
          setJsonImport("");
          setActiveSection("none");
          alert(`Successfully imported ${Object.keys(validServers).length} server(s)!`);

          // If Ollama is running, refresh MCP tools after a delay to allow servers to start
          try {
            await invoke("get_ollama_port");
            // Ollama is running, wait a bit for the servers to start
            setTimeout(async () => {
              await loadMcpTools();
              await loadMcpServerStatuses();
            }, 3000); // Wait 3 seconds for servers to initialize
          } catch {
            // Ollama not running, servers will start when Ollama starts
          }

          setTimeout(() => {
            if (serverListRef.current) {
              serverListRef.current.scrollIntoView({
                behavior: "smooth",
                block: "nearest",
              });
            }
          }, 100);
        } catch (saveError) {
          console.error("Failed to save imported servers:", saveError);
          alert(`Failed to save imported servers: ${saveError instanceof Error ? saveError.message : "Unknown error"}`);
        }
      } else {
        alert("No valid servers found in the JSON");
      }
    } catch (error) {
      console.error("Error importing JSON:", error);
      alert(`Error importing JSON: ${error instanceof Error ? error.message : "Invalid JSON"}`);
    }
  }

  async function setupGmailServer() {
    try {
      // Check if OAuth proxy is available
      const proxyHealth = await invoke("check_oauth_proxy_health");

      if (!proxyHealth) {
        alert("OAuth proxy service is not running. Please start the OAuth proxy service first.");
        return;
      }

      // Start OAuth flow
      await invoke("start_gmail_auth") as { auth_url: string };

      // The browser will open automatically and handle the OAuth flow
      // The callback will save tokens and close the setup dialog

    } catch (error) {
      console.error("Failed to start Gmail auth:", error);
      alert("Failed to start Gmail authentication. Please try again.");
    }
  }



  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            Featured MCP Servers
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            <Card className="border-2 border-dashed border-primary/20 bg-primary/5">
              <CardContent className="pt-6">
                                  <div className="flex items-center justify-between">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Mail className="h-5 w-5 text-primary" />
                        <h4 className="font-semibold">Gmail MCP Server</h4>
                      </div>
                      <p className="text-sm text-muted-foreground">Access and manage your Gmail messages with AI</p>
                      <div className="flex gap-2">
                        <Badge variant="secondary">Email Management</Badge>
                        {gmailTokens ? (
                          <Badge variant="default" className="bg-green-500/10 text-green-600 border-green-500/20">
                            ✅ Authenticated
                          </Badge>
                        ) : (
                          <Badge variant="outline">OAuth Required</Badge>
                        )}
                      </div>
                    </div>
                    {gmailTokens ? (
                      <Button
                        onClick={() => {
                          setMcpServers((prev) => ({
                            ...prev,
                            "Gmail MCP Server": {
                              command: "npx",
                              args: ["@gongrzhe/server-gmail-autoauth-mcp"],
                              env: {},
                            },
                          }));
                        }}
                        className="flex items-center gap-2 bg-green-600 hover:bg-green-700"
                      >
                        <Plus className="h-4 w-4" />
                        Add to MCP
                      </Button>
                    ) : (
                      <Button onClick={() => setShowGmailSetup(true)} className="flex items-center gap-2">
                        <Settings className="h-4 w-4" />
                        Setup Gmail
                      </Button>
                    )}
                  </div>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      {showGmailSetup && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Gmail Authentication
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Click the button below to start the Gmail authentication process.
                This will open your browser where you can authorize access to your Gmail account.
              </p>
              <Card className="bg-muted/50">
                <CardContent className="pt-6">
                  <h5 className="font-medium mb-2">Instructions:</h5>
                  <ol className="text-sm space-y-1 text-muted-foreground list-decimal list-inside">
                    <li>Click "Start Authentication" below</li>
                    <li>Your browser will open to Google's authorization page</li>
                    <li>Sign in with your Google account</li>
                    <li>Grant permission to access your Gmail</li>
                    <li>You'll be redirected back to the app automatically</li>
                    <li>Your tokens will be saved and the MCP server will be configured</li>
                  </ol>
                </CardContent>
              </Card>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowGmailSetup(false)}>
                Cancel
              </Button>
              <Button onClick={setupGmailServer} className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                Start Authentication
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            MCP Servers Configuration
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="flex gap-2">
            <Collapsible
              className="w-full"
              open={activeSection === "import"}
              onOpenChange={(open: boolean) => setActiveSection(open ? "import" : "none")}
            >
              <CollapsibleTrigger asChild>
                <Button variant="outline" className="flex items-center gap-2 w-full">
                  <Download className="h-4 w-4" />
                  Import JSON
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-4 w-full">
                <Card className="bg-muted/50">
                  <CardHeader>
                    <CardTitle className="text-base">Import from JSON</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="json-import">MCP Configuration JSON</Label>
                      <Textarea
                        id="json-import"
                        value={jsonImport}
                        onChange={(e) => setJsonImport(e.target.value)}
                        placeholder={`Paste MCP JSON configuration, e.g.:
{
  "mcpServers": {
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp"]
    },
    "perplexity-ask": {
      "command": "npx",
      "args": ["-y", "server-perplexity-ask"],
      "env": {
        "PERPLEXITY_API_KEY": "your-api-key"
      }
    }
  }
}`}
                        className="min-h-32 font-mono text-sm"
                      />
                    </div>
                    <Button onClick={importFromJson} disabled={!jsonImport.trim()} className="flex items-center gap-2">
                      <Download className="h-4 w-4" />
                      Import Servers
                    </Button>
                  </CardContent>
                </Card>
              </CollapsibleContent>
            </Collapsible>

            <Collapsible
              open={activeSection === "add"}
              onOpenChange={(open: boolean) => setActiveSection(open ? "add" : "none")}
              className="w-full"
            >
              <CollapsibleTrigger asChild>
                <Button variant="outline" className="flex items-center gap-2 w-full">
                  <Plus className="h-4 w-4" />
                  Add New MCP
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-4">
                <Card className="bg-muted/50">
                  <CardHeader>
                    <CardTitle className="text-base">Add New MCP Server</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="server-name">Server Name</Label>
                      <Input
                        id="server-name"
                        value={currentServerName}
                        onChange={(e) => setCurrentServerName(e.target.value)}
                        placeholder="e.g., github, context7, browser-tools"
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                      <div className="md:col-span-3 space-y-2">
                        <Label htmlFor="server-args">Arguments</Label>
                        <Input
                          id="server-args"
                          value={currentServerArgs}
                          onChange={(e) => setCurrentServerArgs(e.target.value)}
                          placeholder={currentServerCommand === "http" 
                            ? "e.g., https://api.githubcopilot.com/mcp/ --header 'Authorization: Bearer your-token'"
                            : "e.g., GITHUB_PERSONAL_ACCESS_TOKEN=token npx -y @modelcontextprotocol/server-github"}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="server-command">Command</Label>
                        <Select value={currentServerCommand} onValueChange={setCurrentServerCommand}>
                          <SelectTrigger id="server-command">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="env">env</SelectItem>
                            <SelectItem value="npx">npx</SelectItem>
                            <SelectItem value="node">node</SelectItem>
                            <SelectItem value="http">http</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <Button
                      onClick={addMcpServer}
                      disabled={!currentServerName.trim()}
                      className="flex items-center gap-2"
                    >
                      <Plus className="h-4 w-4" />
                      Add Server Configuration
                    </Button>
                  </CardContent>
                </Card>
              </CollapsibleContent>
            </Collapsible>
          </div>

          <Separator />

          <div className="space-y-4">
            <h4 className="font-semibold flex items-center gap-2">
              <Server className="h-4 w-4" />
              Configured MCP Servers
            </h4>

            {Object.entries(mcpServers).length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="pt-6">
                  <div className="text-center py-8 text-muted-foreground">
                    <Server className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No servers configured yet.</p>
                    <p className="text-sm">Add your first MCP server to get started.</p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <ScrollArea className="h-96">
                <div className="space-y-3" ref={serverListRef}>
                  {Object.entries(mcpServers).map(([name, config]) => (
                    <Card key={name} className="hover:shadow-md transition-shadow">
                      <CardContent className="pt-6">
                        <div className="flex items-start justify-between">
                          <div className="space-y-2 flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="font-semibold">{name}</h4>
                              <Badge variant="outline" className="text-xs">
                                {config.command}
                              </Badge>
                              <Badge variant={mcpServerStatuses[name] ? "default" : "secondary"} className="text-xs">
                                {mcpServerStatuses[name] ? "🟢 Running" : "⚫ Stopped"}
                              </Badge>
                            </div>
                            <div className="text-sm text-muted-foreground space-y-1">
                              <div>
                                <span className="font-medium">Command:</span> {config.command}
                              </div>
                              <div>
                                <span className="font-medium">Args:</span> {config.args.join(" ") || "None"}
                              </div>
                            </div>
                            {mcpServerStatus[name] && (
                              <div
                                className={`text-sm p-2 rounded border ${
                                  mcpServerStatus[name].includes("Error")
                                    ? "bg-destructive/10 text-destructive border-destructive/20"
                                    : mcpServerStatus[name].includes("result") ||
                                      mcpServerStatus[name].includes("Auto-started")
                                    ? "bg-green-500/10 text-green-600 border-green-500/20"
                                    : "bg-muted text-muted-foreground border-muted"
                                }`}
                              >
                                {mcpServerStatus[name]}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2 ml-4">
                            {mcpServerStatuses[name] ? (
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => stopMcpServer(name)}
                                disabled={mcpServerLoading[name]}
                                className="flex items-center gap-2"
                              >
                                {mcpServerLoading[name] ? (
                                  <>
                                    <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                                    Stopping...
                                  </>
                                ) : (
                                  <>
                                    <XCircle className="h-3 w-3" />
                                    Stop
                                  </>
                                )}
                              </Button>
                            ) : (
                              <div className="text-sm text-muted-foreground">Auto-starts with Ollama</div>
                            )}
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => removeMcpServer(name)}
                              disabled={mcpServerLoading[name]}
                              className="flex items-center gap-2"
                            >
                              <Trash2 className="h-3 w-3" />
                              Remove
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
