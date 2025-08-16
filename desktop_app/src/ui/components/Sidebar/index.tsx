import * as React from 'react';

import { SiteHeader } from '@ui/components/SiteHeader';
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
} from '@ui/components/ui/sidebar';
import config from '@ui/config';
import { useNavigationStore } from '@ui/stores';
import { NavigationSubViewKey, NavigationViewKey } from '@ui/types';

import ChatSidebarSection from './ChatSidebarSection';
import McpServerWithToolsSidebarSection from './McpServerWithToolsSidebarSection';

interface SidebarProps extends React.PropsWithChildren {}

export default function Sidebar({ children }: SidebarProps) {
  const { activeView, activeSubView, setActiveView } = useNavigationStore();

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
                  <ChatSidebarSection />
                  {config.navigation.map((item) => (
                    <React.Fragment key={item.key}>
                      {item.key !== NavigationViewKey.Chat && (
                        <SidebarMenuItem>
                          <SidebarMenuButton
                            onClick={() => {
                              setActiveView(item.key);
                            }}
                            isActive={activeView === item.key}
                            className="cursor-pointer hover:bg-accent/50"
                          >
                            <item.icon className="h-4 w-4" />
                            <span>{item.title}</span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      )}
                    </React.Fragment>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            {activeView === NavigationViewKey.Chat && <McpServerWithToolsSidebarSection />}
          </SidebarContent>
        </SidebarBase>
        <SidebarInset className="overflow-hidden">
          <main className="flex-1 space-y-4 overflow-y-auto">{children}</main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
