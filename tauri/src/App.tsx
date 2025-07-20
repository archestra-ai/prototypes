import { invoke } from "@tauri-apps/api/core";
import { useState, useEffect } from "react";
import * as React from "react";
import {
  MessageCircle,
  Bot,
  Download,
  Settings,
} from "lucide-react";

import { ChatContainer } from "./modules/chat/components/chat-container";
import { MCPCatalog } from "./modules/mcp-catalog/components/mcp-catalog";
import { ModelsManager } from "./modules/models/components/models-manager";
import { SettingsPage } from "./components/settings/settings-page";
import { useMcpClient } from "./hooks/use-mcp-client";

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
  
  // Use the MCP client hook
  const { 
    mcpTools, 
    isLoading: isLoadingMcpTools,
    executeTool,
    getServerStatus 
  } = useMcpClient();
  const [activeView, setActiveView] = useState<
    "chat" | "mcp" | "models" | "settings"
  >("chat");
  const [activeSubView, setActiveSubView] = useState<"ollama" | null>(null);

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
    } catch (error) {
      console.error("Failed to load MCP servers:", error);
    }
  }

  const renderContent = () => {
    switch (activeView) {
      case "chat":
        return (
          <div className="space-y-6">
            <ChatContainer
              mcpTools={mcpTools}
              isLoadingTools={isLoadingMcpTools}
              executeTool={executeTool}
            />
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
          </div>
        </header>
        <main className="flex-1 space-y-4 p-4">{renderContent()}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default App;
