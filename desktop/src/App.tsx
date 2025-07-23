import { Bot, ChevronRight, Download, MessageCircle, Plus, Settings } from 'lucide-react';
import * as React from 'react';
import { useState } from 'react';

import { SiteHeader } from './components/SiteHeader';
import { ToolHoverCard } from './components/ToolHoverCard';
import { ToolContext } from './components/kibo/ai-input';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from './components/ui/sidebar';
import { formatToolName } from './lib/format-tool-name';
import ChatPage from './pages/ChatPage';
import ConnectorCatalogPage from './pages/ConnectorCatalogPage';
import LLMProvidersPage from './pages/LLMProvidersPage';
import SettingsPage from './pages/SettingsPage';
import { useMCPServersStore } from './stores/mcp-servers-store';
import { useThemeStore } from './stores/theme-store';

import './index.css';

function App() {
  useThemeStore();
  const { loadingInstalledMCPServers } = useMCPServersStore();
  const allTools = useMCPServersStore.getState().allAvailableTools();

  const [activeView, setActiveView] = useState<'chat' | 'mcp' | 'llm-providers' | 'settings'>('chat');
  const [activeSubView, setActiveSubView] = useState<'ollama'>('ollama');
  const [selectedTools, setSelectedTools] = useState<ToolContext[]>([]);

  const handleToolClick = (serverName: string, toolName: string) => {
    // Get the tool description from the MCP servers store
    const allTools = useMCPServersStore.getState().allAvailableTools();
    const serverTools = allTools[serverName] || [];
    const toolInfo = serverTools.find((t) => t.name === toolName);

    // For now, all tools from available servers are considered enabled
    // In the future, this could check individual tool availability/permissions
    const newTool: ToolContext = {
      serverName,
      toolName,
      enabled: true,
      description: toolInfo?.description,
    };

    // Check if tool is already selected
    const isAlreadySelected = selectedTools.some(
      (tool) => tool.serverName === serverName && tool.toolName === toolName
    );

    if (!isAlreadySelected) {
      setSelectedTools((prev) => [...prev, newTool]);
    }
  };

  const handleToolRemove = (toolToRemove: ToolContext) => {
    setSelectedTools((prev) =>
      prev.filter((tool) => !(tool.serverName === toolToRemove.serverName && tool.toolName === toolToRemove.toolName))
    );
  };

  const navigationItems = [
    {
      title: 'Chat',
      icon: MessageCircle,
      key: 'chat' as const,
    },
    {
      title: 'LLM Providers',
      icon: Download,
      key: 'llm-providers' as const,
    },
    {
      title: 'Connectors',
      icon: Bot,
      key: 'mcp' as const,
    },
    {
      title: 'Settings',
      icon: Settings,
      key: 'settings' as const,
    },
  ];

  const renderContent = () => {
    switch (activeView) {
      case 'chat':
        return <ChatPage selectedTools={selectedTools} onToolRemove={handleToolRemove} />;
      case 'llm-providers':
        return (
          <div className="p-4">
            <LLMProvidersPage activeProvider={activeSubView} />
          </div>
        );
      case 'mcp':
        return (
          <div className="p-4">
            <ConnectorCatalogPage />
          </div>
        );
      case 'settings':
        return (
          <div className="p-4">
            <SettingsPage />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="[--header-height:2.25rem] h-screen flex flex-col">
      <SidebarProvider className="flex flex-col flex-1">
        <SiteHeader
          title={navigationItems.find((item) => item.key === activeView)?.title}
          breadcrumbs={
            activeView === 'llm-providers' && activeSubView
              ? [
                  navigationItems.find((item) => item.key === activeView)?.title,
                  activeSubView.charAt(0).toUpperCase() + activeSubView.slice(1),
                ]
              : [navigationItems.find((item) => item.key === activeView)?.title]
          }
        />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar
            collapsible="icon"
            className="border-r top-[var(--header-height)] h-[calc(100svh-var(--header-height))]"
          >
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
                              // TODO: when we add more LLM providers, we need to add a proper sub-navigation here
                              if (item.key === 'llm-providers') {
                                setActiveSubView('ollama');
                              }
                            }}
                            isActive={activeView === item.key}
                            tooltip={item.title}
                          >
                            <item.icon className="h-4 w-4" />
                            <span>{item.title}</span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                        {item.key === 'llm-providers' && activeView === 'llm-providers' && (
                          <SidebarMenuItem className="ml-6 group-data-[collapsible=icon]:hidden">
                            <SidebarMenuButton
                              onClick={() => setActiveSubView('ollama')}
                              isActive={activeSubView === 'ollama'}
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

              {/* Tools Group - Only show when on chat page */}
              {activeView === 'chat' && (
                <SidebarGroup>
                  <SidebarGroupLabel>Tools</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {loadingInstalledMCPServers ? (
                        <SidebarMenuItem>
                          <div className="flex items-center gap-2 px-2 py-1.5">
                            <div className="h-3 w-3 animate-spin rounded-full border border-muted-foreground border-t-transparent" />
                            <span className="text-xs text-muted-foreground">Loading...</span>
                          </div>
                        </SidebarMenuItem>
                      ) : Object.keys(allTools).length === 0 ? (
                        <SidebarMenuItem>
                          <SidebarMenuButton size="sm" className="justify-start text-muted-foreground">
                            <Plus className="h-4 w-4" />
                            <span>Add more</span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ) : (
                        <>
                          {Object.entries(allTools).map(([serverName, tools]) => (
                            <React.Fragment key={serverName}>
                              {/* Server Header */}
                              <SidebarMenuItem>
                                <div className="flex items-center gap-2 px-2 py-1.5 bg-muted/50 rounded-md">
                                  {serverName.toLowerCase() === 'gmail' && (
                                    <div className="w-4 h-4 bg-red-500 rounded-sm flex items-center justify-center">
                                      <span className="text-white text-[10px] font-bold">M</span>
                                    </div>
                                  )}
                                  {serverName.toLowerCase() === 'slack' && (
                                    <div className="w-4 h-4 bg-purple-500 rounded-sm flex items-center justify-center">
                                      <span className="text-white text-[10px] font-bold">#</span>
                                    </div>
                                  )}
                                  {!['gmail', 'slack'].includes(serverName.toLowerCase()) && (
                                    <div className="w-4 h-4 bg-blue-500 rounded-sm flex items-center justify-center">
                                      <span className="text-white text-[10px] font-bold">
                                        {serverName.charAt(0).toUpperCase()}
                                      </span>
                                    </div>
                                  )}
                                  <span className="text-sm font-medium capitalize">{serverName}</span>
                                </div>
                              </SidebarMenuItem>

                              {/* Tools under this server */}
                              {tools.map((tool, idx) => (
                                <SidebarMenuItem key={`${serverName}-${idx}`}>
                                  <ToolHoverCard
                                    tool={{
                                      serverName,
                                      toolName: tool.name,
                                      enabled: true,
                                      description: tool.description,
                                    }}
                                    side="right"
                                    align="start"
                                    showInstructions={true}
                                    instructionText="Click to add to context"
                                  >
                                    <div className="w-full">
                                      <SidebarMenuButton
                                        size="sm"
                                        className="justify-between text-sm w-full"
                                        onClick={() => handleToolClick(serverName, tool.name)}
                                      >
                                        <div className="flex items-center gap-2">
                                          <div className="w-2 h-2 bg-green-500 rounded-full" />
                                          <span>{formatToolName(tool.name)}</span>
                                        </div>
                                        <ChevronRight className="h-3 w-3 text-muted-foreground" />
                                      </SidebarMenuButton>
                                    </div>
                                  </ToolHoverCard>
                                </SidebarMenuItem>
                              ))}
                            </React.Fragment>
                          ))}

                          {/* Add more button */}
                          <SidebarMenuItem>
                            <SidebarMenuButton
                              size="sm"
                              className="justify-start text-muted-foreground"
                              onClick={() => setActiveView('mcp')}
                            >
                              <Plus className="h-4 w-4" />
                              <span>Add more</span>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        </>
                      )}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              )}
            </SidebarContent>
          </Sidebar>
          <SidebarInset className="overflow-hidden">
            <main className="flex-1 space-y-4 overflow-y-auto">{renderContent()}</main>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  );
}

export default App;
