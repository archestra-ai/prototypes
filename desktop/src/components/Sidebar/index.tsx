import * as React from 'react';

import { SiteHeader } from '@/components/SiteHeader';
import {
  Sidebar as SidebarBase,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from '@/components/ui/sidebar';
import { NAVIGATION_ITEMS } from '@/consts';
import { useNavigationStore } from '@/stores/navigation-store';
import { NavigationSubViewKey, NavigationViewKey } from '@/types';

import ChatSidebarSection from './ChatSidebarSection';
import LLMProvidersSidebarSection from './LLMProvidersSidebarSection';
import MCPServerWithToolsSidebarSection from './MCPServerWithToolsSidebarSection';

interface SidebarProps extends React.PropsWithChildren {}

export default function Sidebar({ children }: SidebarProps) {
  const { activeView, activeSubView, setActiveView, setActiveSubView } = useNavigationStore();

  return (
    <SidebarProvider className="flex flex-col flex-1">
      <SiteHeader activeView={activeView} activeSubView={activeSubView} />
      <div className="flex flex-1 overflow-hidden">
        <SidebarBase
          collapsible="icon"
          className="border-r top-[var(--header-height)] h-[calc(100svh-var(--header-height))]"
        >
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {NAVIGATION_ITEMS.map((item) => (
                    <React.Fragment key={item.key}>
                      <SidebarMenuItem>
                        <SidebarMenuButton
                          onClick={() => {
                            setActiveView(item.key);
                            // TODO: when we add more LLM providers, we need to add a proper sub-navigation here
                            if (item.key === NavigationViewKey.LLMProviders) {
                              setActiveSubView(NavigationSubViewKey.Ollama);
                            }
                          }}
                          isActive={activeView === item.key}
                          tooltip={item.title}
                          className="cursor-pointer hover:bg-accent/50"
                        >
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      {item.key === NavigationViewKey.Chat && activeView === NavigationViewKey.Chat && (
                        <ChatSidebarSection />
                      )}
                      {item.key === NavigationViewKey.LLMProviders && activeView === NavigationViewKey.LLMProviders && (
                        <LLMProvidersSidebarSection />
                      )}
                    </React.Fragment>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            {activeView === NavigationViewKey.Chat && <MCPServerWithToolsSidebarSection />}
          </SidebarContent>
        </SidebarBase>
        <SidebarInset className="overflow-hidden">
          <main className="flex-1 space-y-4 overflow-y-auto">{children}</main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
