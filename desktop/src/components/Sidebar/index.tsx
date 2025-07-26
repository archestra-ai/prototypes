import { ChevronRight, Plus } from 'lucide-react';
import * as React from 'react';

import { DeleteChatConfirmation } from '@/components/DeleteChatConfirmation';
import { EditableTitle } from '@/components/EditableTitle';
import { SiteHeader } from '@/components/SiteHeader';
import { ToolHoverCard } from '@/components/ToolHoverCard';
import { ToolServerIcon } from '@/components/ToolServerIcon';
import {
  Sidebar as SidebarBase,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from '@/components/ui/sidebar';
import { NAVIGATION_ITEMS } from '@/consts';
import { formatToolName } from '@/lib/utils/tools';
import { useChatStore } from '@/stores/chat-store';
import { useMCPServersStore } from '@/stores/mcp-servers-store';
import { useNavigationStore } from '@/stores/navigation-store';
import { useThemeStore } from '@/stores/theme-store';
import { NavigationSubViewKey, NavigationViewKey } from '@/types';

import ToolSearch from './ToolSearch';

interface SidebarProps extends React.PropsWithChildren {}

export default function Sidebar({ children }: SidebarProps) {
  useThemeStore();
  const {
    loadingInstalledMCPServers,
    getToolsGroupedByServer,
    getFilteredToolsGroupedByServer,
    toolSearchQuery,
    addSelectedTool,
  } = useMCPServersStore();
  const { chats, currentChat, isLoadingChats, selectChat, createNewChat, deleteCurrentChat, updateChat } =
    useChatStore();
  const { activeView, activeSubView, setActiveView, setActiveSubView } = useNavigationStore();

  const currentChatId = currentChat?.chat?.id;

  const allTools = getToolsGroupedByServer();
  const filteredTools = getFilteredToolsGroupedByServer();

  const hasFilteredTools = Object.keys(filteredTools).length > 0;
  const searchQueryIsEmpty = !toolSearchQuery.trim();

  const tools = searchQueryIsEmpty ? allTools : filteredTools;

  console.log(
    `currentChatId: ${currentChatId},
    currentChat: ${JSON.stringify(currentChat)},
    chats: ${JSON.stringify(chats)}
    activeView: ${activeView},
    activeSubView: ${activeSubView}
    toolSearchQuery: ${toolSearchQuery}
    hasFilteredTools: ${hasFilteredTools}
    searchQueryIsEmpty: ${searchQueryIsEmpty}
    tools: ${JSON.stringify(tools)}
    allTools: ${JSON.stringify(allTools)}
    filteredTools: ${JSON.stringify(filteredTools)}
    loadingInstalledMCPServers: ${loadingInstalledMCPServers}
    `
  );

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
                            if (item.key === 'llm-providers') {
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
                      {item.key === 'chat' && activeView === 'chat' && (
                        <>
                          <SidebarMenuItem className="ml-6 group-data-[collapsible=icon]:hidden">
                            <SidebarMenuButton
                              onClick={createNewChat}
                              size="sm"
                              className="cursor-pointer hover:bg-accent/50 text-sm"
                            >
                              <Plus className="h-3 w-3" />
                              <span>New Chat</span>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                          {isLoadingChats ? (
                            <SidebarMenuItem className="ml-6 group-data-[collapsible=icon]:hidden">
                              <div className="flex items-center gap-2 px-2 py-1.5">
                                <div className="h-3 w-3 animate-spin rounded-full border border-muted-foreground border-t-transparent" />
                                <span className="text-xs text-muted-foreground">Loading chats...</span>
                              </div>
                            </SidebarMenuItem>
                          ) : chats.length === 0 ? (
                            <SidebarMenuItem className="ml-6 group-data-[collapsible=icon]:hidden">
                              <div className="px-2 py-1.5 text-xs text-muted-foreground">No chats yet</div>
                            </SidebarMenuItem>
                          ) : (
                            chats.map((chat) => {
                              const {
                                chat: { id, title },
                              } = chat;

                              return (
                                <SidebarMenuItem key={id} className="ml-6 group-data-[collapsible=icon]:hidden">
                                  <SidebarMenuButton
                                    onClick={() => selectChat(id)}
                                    isActive={currentChatId === id}
                                    size="sm"
                                    className="cursor-pointer hover:bg-accent/50 text-sm justify-between group"
                                  >
                                    {currentChatId === id ? (
                                      <EditableTitle
                                        title={title}
                                        isAnimated={!title}
                                        onSave={(newTitle) => updateChat(id, newTitle)}
                                      />
                                    ) : (
                                      <span className="truncate">{title || 'New Chat'}</span>
                                    )}
                                    {currentChatId === id && <DeleteChatConfirmation onDelete={deleteCurrentChat} />}
                                  </SidebarMenuButton>
                                </SidebarMenuItem>
                              );
                            })
                          )}
                        </>
                      )}
                      {item.key === 'llm-providers' && activeView === 'llm-providers' && (
                        <SidebarMenuItem className="ml-6 group-data-[collapsible=icon]:hidden">
                          <SidebarMenuButton
                            onClick={() => setActiveSubView(NavigationSubViewKey.Ollama)}
                            isActive={activeSubView === NavigationSubViewKey.Ollama}
                            size="sm"
                            className="cursor-pointer hover:bg-accent/50 text-sm"
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
            {activeView === NavigationViewKey.Chat && (
              <SidebarGroup className="group-data-[collapsible=icon]:hidden">
                <SidebarGroupLabel>Tools</SidebarGroupLabel>
                <SidebarGroupContent>
                  <ToolSearch />
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
                    ) : !hasFilteredTools ? (
                      <SidebarMenuItem>
                        <div className="px-2 py-1.5 text-xs text-muted-foreground">
                          No tools found matching "{toolSearchQuery}"
                        </div>
                      </SidebarMenuItem>
                    ) : (
                      <>
                        {Object.entries(tools).map(([serverName, tools]) => (
                          <React.Fragment key={serverName}>
                            <SidebarMenuItem>
                              <div className="flex items-center gap-2 px-2 py-1.5 bg-muted/50 rounded-md">
                                <ToolServerIcon
                                  toolServerName={serverName}
                                  widthHeightClassName="w-4 h-4"
                                  textClassName="text-[10px]"
                                />
                                <span className="text-sm font-medium capitalize">{serverName}</span>
                              </div>
                            </SidebarMenuItem>

                            {/* Tools under this server */}
                            {tools.map((tool, idx) => (
                              <SidebarMenuItem key={`${serverName}-${tool.name}-${idx}`}>
                                <ToolHoverCard
                                  tool={tool}
                                  side="right"
                                  align="start"
                                  showInstructions={true}
                                  instructionText="Click to add to context"
                                >
                                  <div className="w-full">
                                    <SidebarMenuButton
                                      size="sm"
                                      className="justify-between text-sm w-full"
                                      onClick={() => addSelectedTool(tool)}
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

                        {/* Add more button - only show if not searching or if no search results */}
                        {(searchQueryIsEmpty || !hasFilteredTools) && (
                          <SidebarMenuItem>
                            <SidebarMenuButton
                              size="sm"
                              className="justify-start text-muted-foreground"
                              onClick={() => setActiveView(NavigationViewKey.MCP)}
                            >
                              <Plus className="h-4 w-4" />
                              <span>Add more</span>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        )}
                      </>
                    )}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}
          </SidebarContent>
        </SidebarBase>
        <SidebarInset className="overflow-hidden">
          <main className="flex-1 space-y-4 overflow-y-auto">{children}</main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
