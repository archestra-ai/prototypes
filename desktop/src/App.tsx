import { Bot, Code, Download, MessageCircle, Settings } from 'lucide-react';
import * as React from 'react';
import { useState } from 'react';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from './components/ui/sidebar';
import { Switch } from './components/ui/switch';
import ChatPage from './pages/ChatPage';
import ConnectorCatalogPage from './pages/ConnectorCatalogPage';
import LLMProvidersPage from './pages/LLMProvidersPage';
import SettingsPage from './pages/SettingsPage';
import { useDeveloperModeStore } from './stores/developer-mode-store';
import { useThemeStore } from './stores/theme-store';

import './index.css';

function App() {
  useThemeStore();

  const { isDeveloperMode, toggleDeveloperMode } = useDeveloperModeStore();
  const [activeView, setActiveView] = useState<'chat' | 'mcp' | 'llm-providers' | 'settings'>('chat');
  const [activeSubView, setActiveSubView] = useState<'ollama'>('ollama');

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
        return (
          <div className="space-y-6">
            <ChatPage />
          </div>
        );
      case 'llm-providers':
        return <LLMProvidersPage activeProvider={activeSubView} />;
      case 'mcp':
        return <ConnectorCatalogPage />;
      case 'settings':
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
              <h2 className="text-lg font-semibold whitespace-nowrap">archestra.ai</h2>
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
                      <SidebarMenuItem className="ml-6">
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
        </SidebarContent>
        <SidebarFooter className="p-4 group-data-[collapsible=icon]:p-2">
          <div className="flex items-center gap-3 group-data-[collapsible=icon]:justify-center">
            <div className="flex items-center gap-2 group-data-[collapsible=icon]:hidden">
              <Code className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Developer Mode</span>
            </div>
            <Switch
              checked={isDeveloperMode}
              onCheckedChange={toggleDeveloperMode}
              className="group-data-[collapsible=icon]:scale-75"
            />
            <Code className="h-4 w-4 text-muted-foreground hidden group-data-[collapsible=icon]:block" />
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">
              {navigationItems.find((item) => item.key === activeView)?.title}
              {activeView === 'llm-providers' && activeSubView && (
                <span className="text-muted-foreground ml-2">
                  / {activeSubView.charAt(0).toUpperCase() + activeSubView.slice(1)}
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
