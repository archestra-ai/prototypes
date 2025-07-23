import { Bot, Download, MessageCircle, Settings } from 'lucide-react';
import * as React from 'react';
import { useState } from 'react';

import { SiteHeader } from './components/SiteHeader';
import {
  Sidebar,
  SidebarContent,
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
import ChatPage from './pages/ChatPage';
import ConnectorCatalogPage from './pages/ConnectorCatalogPage';
import LLMProvidersPage from './pages/LLMProvidersPage';
import SettingsPage from './pages/SettingsPage';
import { useThemeStore } from './stores/theme-store';

import './index.css';

function App() {
  useThemeStore();

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
        return <ChatPage />;
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
