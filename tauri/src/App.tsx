import { invoke } from "@tauri-apps/api/core";
import { useState, useRef, useEffect } from "react";
import * as React from "react";
import {
  MessageCircle,
  Bot,
  Bug,
  Download,
  Settings,
  Power,
} from "lucide-react";

import { useOllamaServer } from "./modules/chat/contexts/ollama-server-context";

import { Button } from "./components/ui/button";
import { ScrollArea } from "./components/ui/scroll-area";
import { ChatContainer } from "./modules/chat/components/chat-container";
import { MCPCatalog } from "./modules/mcp-catalog/components/mcp-catalog";
import { ModelsManager } from "./modules/models/components/models-manager";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { SettingsPage } from "./components/settings/settings-page";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarProvider,
  SidebarTrigger,
  SidebarInset,
  SidebarHeader,
} from "./components/ui/sidebar";

import "./index.css";

function App() {
  const [mcpServers, setMcpServers] = useState<{
    [key: string]: {
      server_config: {
        transport: string;
        command: string;
        args: string[];
        env: { [key: string]: string };
      };
    };
  }>({});
  const [, setMcpServerStatus] = useState<{
    [key: string]: string;
  }>({});
  const [mcpTools, setMcpTools] = useState<
    Array<{
      serverName: string;
      tool: {
        name: string;
        description?: string;
        input_schema: any;
      };
    }>
  >([]);
  const [isLoadingMcpTools, setIsLoadingMcpTools] = useState(false);
  const [activeView, setActiveView] = useState<
    "chat" | "mcp" | "models" | "settings"
  >("chat");
  const [activeSubView, setActiveSubView] = useState<"ollama" | null>(null);
  const [debugInfo, setDebugInfo] = useState<string>("");
  const [proxyRunning, setProxyRunning] = useState<boolean>(false);
  const [proxyLoading, setProxyLoading] = useState<boolean>(false);

  const debugRef = useRef<HTMLDivElement>(null);

  const navigationItems = [
    {
      title: "Chat",
      icon: MessageCircle,
      key: "chat" as const,
    },
    {
      title: "LLM Providers",
      icon: Download,
      key: "models" as const,
    },
    {
      title: "Connectors",
      icon: Bot,
      key: "mcp" as const,
    },
    {
      title: "Settings",
      icon: Settings,
      key: "settings" as const,
    },
  ];

  useEffect(() => {
    loadMcpServersFromDb();

    // Set up periodic refresh of MCP tools for automatic discovery
    const interval = setInterval(() => {
      loadMcpTools();
    }, 5000); // Refresh every 5 seconds

    return () => clearInterval(interval);
  }, []);

  async function loadMcpServersFromDb() {
    try {
      const servers = await invoke<{
        [key: string]: {
          server_config: {
            transport: string;
            command: string;
            args: string[];
            env: { [key: string]: string };
          };
        };
      }>("load_mcp_servers");
      setMcpServers(servers);

      // Also load MCP tools
      await loadMcpTools();
    } catch (error) {
      console.error("Failed to load MCP servers:", error);
    }
  }

  async function loadMcpTools() {
    try {
      setIsLoadingMcpTools(true);
      const tools = await invoke<
        Array<
          [
            string,
            {
              name: string;
              description?: string;
              input_schema: any;
            },
          ]
        >
      >("get_mcp_tools");

      const formattedTools = tools.map(([serverName, tool]) => ({
        serverName,
        tool,
      }));
      setMcpTools(formattedTools);
    } catch (error) {
      console.error("Failed to load MCP tools:", error);
    } finally {
      setIsLoadingMcpTools(false);
    }
  }

  async function debugMcpBridge() {
    try {
      const debug = await invoke<string>("debug_mcp_bridge");
      setDebugInfo(debug);

      // Scroll to debug section after setting info
      setTimeout(() => {
        if (debugRef.current) {
          debugRef.current.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        }
      }, 100);
    } catch (error) {
      console.error("Failed to debug MCP bridge:", error);
      setDebugInfo(`Error: ${error}`);

      // Still scroll to show the error
      setTimeout(() => {
        if (debugRef.current) {
          debugRef.current.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        }
      }, 100);
    }
  }

  async function checkProxyStatus() {
    try {
      const running = await invoke<boolean>("check_mcp_proxy_health");
      setProxyRunning(running);
    } catch (e) {
      setProxyRunning(false);
    }
  }

  useEffect(() => {
    checkProxyStatus();
    const interval = setInterval(checkProxyStatus, 100000000);
    return () => clearInterval(interval);
  }, []);

  async function handleToggleProxy() {
    setProxyLoading(true);
    try {
      console.log("Checking proxy status");
      console.log({ proxyRunning });
      if (proxyRunning) {
        await invoke("stop_mcp_proxy");
      } else {
        await invoke("start_mcp_proxy");
      }
      setTimeout(checkProxyStatus, 1000); // Give it a moment to update
    } finally {
      setProxyLoading(false);
    }
  }

  console.log({ mcpServers, mcpTools });

  const renderContent = () => {
    switch (activeView) {
      case "chat":
        return (
          <div className="space-y-6">
            <ChatContainer
              mcpTools={mcpTools}
              isLoadingTools={isLoadingMcpTools}
            />
            {debugInfo && (
              <Card ref={debugRef}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Bug className="h-5 w-5" />
                    MCP Bridge Debug Info
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-96 w-full">
                    <pre className="text-sm font-mono whitespace-pre-wrap bg-slate-950 text-slate-50 p-4 rounded-md">
                      {debugInfo}
                    </pre>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}
          </div>
        );
      case "models":
        return <ModelsManager />;
      case "mcp":
        return (
          <MCPCatalog
            mcpServers={mcpServers}
            setMcpServers={setMcpServers}
            setMcpServerStatus={setMcpServerStatus}
          />
        );
      case "settings":
        return <SettingsPage />;
      default:
        return null;
    }
  };

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" className="border-r">
        <SidebarHeader className="p-4 group-data-[collapsible=icon]:p-2">
          <div className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center">
            <div className="w-8 h-8 bg-gradient-to-br from-primary to-accent rounded-md flex items-center justify-center text-white font-bold text-sm shrink-0">
              A
            </div>
            <div className="group-data-[collapsible=icon]:hidden overflow-hidden">
              <h2 className="text-lg font-semibold whitespace-nowrap">
                archestra.ai
              </h2>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {navigationItems.map((item) => (
                  <React.Fragment key={item.key}>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        onClick={() => {
                          setActiveView(item.key);
                          if (item.key === "models") {
                            setActiveSubView("ollama");
                          } else {
                            setActiveSubView(null);
                          }
                        }}
                        isActive={activeView === item.key}
                        tooltip={item.title}
                      >
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    {/* Sub-navigation for LLM Providers */}
                    {item.key === "models" && activeView === "models" && (
                      <SidebarMenuItem className="ml-6">
                        <SidebarMenuButton
                          onClick={() => setActiveSubView("ollama")}
                          isActive={activeSubView === "ollama"}
                          size="sm"
                          className="text-sm"
                        >
                          <span>Ollama</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )}
                  </React.Fragment>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">
              {navigationItems.find((item) => item.key === activeView)?.title}
              {activeView === "models" && activeSubView && (
                <span className="text-muted-foreground ml-2">
                  /{" "}
                  {activeSubView.charAt(0).toUpperCase() +
                    activeSubView.slice(1)}
                </span>
              )}
            </h1>
            <Button
              onClick={handleToggleProxy}
              variant={proxyRunning ? "default" : "outline"}
              className={`flex items-center gap-2 ${proxyRunning ? "bg-green-600 hover:bg-green-700" : ""}`}
              disabled={proxyLoading}
              title={proxyRunning ? "Stop Guardrails Proxy" : "Start MCP Proxy"}
            >
              <Power
                className={`h-4 w-4 ${proxyRunning ? "text-green-400" : "text-gray-400"}`}
              />
              {proxyRunning ? "Guardrails Proxy Running" : "Start MCP Proxy"}
            </Button>
            {activeView === "chat" && (
              <Button
                onClick={debugMcpBridge}
                variant="outline"
                size="sm"
                className="flex items-center gap-2"
              >
                <Bug className="h-4 w-4" />
                Debug MCP Bridge
              </Button>
            )}
          </div>
        </header>
        <main className="flex-1 space-y-4 p-4">{renderContent()}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default App;
