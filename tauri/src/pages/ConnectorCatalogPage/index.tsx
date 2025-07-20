import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/label";
import { Badge } from "../../components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Textarea } from "../../components/ui/textarea";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../../components/ui/collapsible";
import {
  Download,
  ChevronDown,
  Settings,
  CheckCircle,
  Code,
  Globe,
  Database,
  FileText,
  Search,
  MessageSquare,
  Package,
} from "lucide-react";

interface ServerConfig {
  transport: string;
  command: string;
  args: string[];
  env: { [key: string]: string };
}

interface MCPServer {
  server_config: ServerConfig;
}

interface OAuthConfig {
  provider: string;
  required: boolean;
}

interface ConnectorCatalogEntry {
  id: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  author: string;
  version: string;
  homepage: string;
  repository: string;
  oauth?: OAuthConfig;
  server_config: ServerConfig;
  image?: string;
}

interface ConnectorCatalog {
  connectors: ConnectorCatalogEntry[];
}

interface ConnectorCatalogPageProps {
  mcpServers: { [key: string]: MCPServer };
  setMcpServers: React.Dispatch<
    React.SetStateAction<{ [key: string]: MCPServer }>
  >;
  setMcpServerStatus: React.Dispatch<
    React.SetStateAction<{ [key: string]: string }>
  >;
}

export default function ConnectorCatalogPage({
  mcpServers,
  setMcpServers,
  setMcpServerStatus,
}: ConnectorCatalogPageProps) {
  const [jsonImport, setJsonImport] = useState("");
  const [activeSection, setActiveSection] = useState<
    "none" | "import" | "add" | "developer"
  >("none");
  const [catalog, setCatalog] = useState<ConnectorCatalog | null>(null);
  const [installingConnector, setInstallingConnector] = useState<string | null>(
    null,
  );

  // Fetch data on component mount
  useEffect(() => {
    fetchCatalog();
  }, []);

  async function fetchCatalog() {
    try {
      const catalogData = (await invoke(
        "get_mcp_connector_catalog",
      )) as ConnectorCatalog;
      setCatalog(catalogData);
    } catch (error) {
      console.error("Failed to fetch MCP connector catalog:", error);
    }
  }

  async function installConnector(connector: ConnectorCatalogEntry) {
    setInstallingConnector(connector.id);

    try {
      // Check if OAuth is required
      if (connector.oauth?.required) {
        try {
          // Start OAuth flow
          await invoke("start_oauth_auth", { service: connector.id });

          // For OAuth connectors, the backend will handle the installation after successful auth
          alert(
            `OAuth setup started for ${connector.title}. Please complete the authentication in your browser.`,
          );
        } catch (error) {
          console.error(`Failed to start OAuth for ${connector.title}:`, error);
          alert(
            `Failed to start OAuth setup for ${connector.title}. Please try again.`,
          );
        }
      } else {
        // Regular installation
        await invoke("save_mcp_server_from_catalog", {
          connectorId: connector.id,
        });

        // Update local state
        setMcpServers((prev) => ({
          ...prev,
          [connector.title]: {
            server_config: connector.server_config,
          },
        }));

        setMcpServerStatus((prev) => ({
          ...prev,
          [connector.title]: "Connector installed successfully",
        }));
      }
    } catch (error) {
      console.error("Failed to install connector:", error);
      alert(`Failed to install ${connector.title}. Please try again.`);
    } finally {
      setInstallingConnector(null);
    }
  }

  async function saveMcpServer(name: string, serverConfig: ServerConfig) {
    try {
      await invoke("save_mcp_server", {
        name: name,
        serverConfig: serverConfig,
      });
    } catch (error) {
      console.error("Failed to save MCP server:", error);
      throw error;
    }
  }

  const getCategoryIcon = (category: string) => {
    switch (category.toLowerCase()) {
      case "documentation":
        return <FileText className="h-5 w-5" />;
      case "database":
        return <Database className="h-5 w-5" />;
      case "web":
        return <Globe className="h-5 w-5" />;
      case "search":
        return <Search className="h-5 w-5" />;
      case "communication":
        return <MessageSquare className="h-5 w-5" />;
      case "developer-tools":
        return <Code className="h-5 w-5" />;
      default:
        return <Package className="h-5 w-5" />;
    }
  };

  async function importFromJson() {
    try {
      const parsed = JSON.parse(jsonImport);
      let serversToImport: { [key: string]: any } = {};

      if (parsed.mcpServers && typeof parsed.mcpServers === "object") {
        serversToImport = parsed.mcpServers;
      } else if (typeof parsed === "object") {
        serversToImport = parsed;
      } else {
        throw new Error("Invalid JSON format");
      }

      const validServers: { [key: string]: MCPServer } = {};
      Object.entries(serversToImport).forEach(([name, config]) => {
        if (typeof config === "object") {
          // Handle both old and new format
          let serverConfig: ServerConfig;
          if ("server_config" in config) {
            serverConfig = config.server_config;
          } else if ("command" in config && "args" in config) {
            serverConfig = {
              transport: "stdio",
              command: config.command,
              args: Array.isArray(config.args) ? config.args : [],
              env:
                config.env && typeof config.env === "object" ? config.env : {},
            };
          } else {
            return; // Skip invalid config
          }

          validServers[name] = {
            server_config: serverConfig,
          };
        }
      });

      if (Object.keys(validServers).length > 0) {
        try {
          await Promise.all(
            Object.entries(validServers).map(([name, config]) => {
              return saveMcpServer(name, config.server_config);
            }),
          );

          setMcpServers((prev) => ({
            ...prev,
            ...validServers,
          }));
          setJsonImport("");
          setActiveSection("none");

          alert(`Successfully imported ${Object.keys(validServers).length} server(s)!`);
        } catch (saveError) {
          console.error("Failed to save imported servers:", saveError);
          alert(
            `Failed to save imported servers: ${saveError instanceof Error ? saveError.message : "Unknown error"}`,
          );
        }
      } else {
        alert("No valid servers found in the JSON");
      }
    } catch (error) {
      console.error("Error importing JSON:", error);
      alert(
        `Error importing JSON: ${error instanceof Error ? error.message : "Invalid JSON"}`,
      );
    }
  }

  return (
    <div className="space-y-6">
      {/* Connector Catalog */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Connector Catalog
          </CardTitle>
        </CardHeader>
        <CardContent>
          {catalog ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {catalog.connectors.map((connector) => {
                const isInstalled = Object.keys(mcpServers).some(
                  (name) => name === connector.title,
                );
                const isInstalling = installingConnector === connector.id;

                return (
                  <Card
                    key={connector.id}
                    className={`transition-all duration-200 hover:shadow-md ${
                      isInstalled ? "border-green-500/50 bg-green-50/50" : ""
                    }`}
                  >
                    <CardContent className="pt-6">
                      <div className="space-y-4">
                        <div className="flex items-start justify-between">
                          <div className="space-y-2 flex-1">
                            <div className="flex items-center gap-2">
                              {getCategoryIcon(connector.category)}
                              <h4 className="font-semibold">
                                {connector.title}
                              </h4>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {connector.description}
                            </p>
                            <div className="flex gap-2">
                              <Badge variant="secondary" className="text-xs">
                                {connector.category.replace("-", " ")}
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                {connector.server_config.transport}
                              </Badge>
                              {connector.oauth?.required && (
                                <Badge variant="outline" className="text-xs">
                                  OAuth
                                </Badge>
                              )}
                              {isInstalled && (
                                <Badge
                                  variant="default"
                                  className="text-xs bg-green-500/10 text-green-600 border-green-500/20"
                                >
                                  ✅ Installed
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex justify-end">
                          <Button
                            size="sm"
                            onClick={() => installConnector(connector)}
                            disabled={isInstalled || isInstalling}
                            className="flex items-center gap-2"
                          >
                            {isInstalling ? (
                              <>
                                <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                                Installing...
                              </>
                            ) : isInstalled ? (
                              <>
                                <CheckCircle className="h-3 w-3" />
                                Installed
                              </>
                            ) : connector.oauth?.required ? (
                              <>
                                <Settings className="h-4 w-4" />
                                Setup OAuth
                              </>
                            ) : (
                              <>
                                <Download className="h-4 w-4" />
                                Install
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Loading connector catalog...</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Developer Section */}
      <Collapsible
        open={activeSection === "developer"}
        onOpenChange={(open: boolean) =>
          setActiveSection(open ? "developer" : "none")
        }
      >
        <Card>
          <CardHeader>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className="w-full flex items-center justify-between p-0 h-auto"
              >
                <CardTitle className="flex items-center gap-2">
                  <Code className="h-5 w-5" />
                  Developer
                </CardTitle>
                <ChevronDown className="h-4 w-4" />
              </Button>
            </CollapsibleTrigger>
          </CardHeader>

          <CollapsibleContent>
            <CardContent className="space-y-6">
              <Card className="bg-muted/50">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Download className="h-4 w-4" />
                    Import from JSON
                  </CardTitle>
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
      "server_config": {
        "transport": "stdio",
        "command": "npx",
        "args": ["-y", "@upstash/context7-mcp"],
        "env": {}
      }
    }
  }
}`}
                      className="min-h-32 font-mono text-sm"
                    />
                  </div>
                  <Button
                    onClick={importFromJson}
                    disabled={!jsonImport.trim()}
                    className="flex items-center gap-2 w-full"
                  >
                    <Download className="h-4 w-4" />
                    Import Servers
                  </Button>
                </CardContent>
              </Card>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
}
