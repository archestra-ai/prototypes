import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';

import { ToolHoverCard } from '@ui/components/ToolHoverCard';
import { ToolServerIcon } from '@ui/components/ToolServerIcon';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@ui/components/ui/collapsible';
import { Input } from '@ui/components/ui/input';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@ui/components/ui/sidebar';
import { formatToolName } from '@ui/lib/utils/tools';
import { useMcpServersStore, useNavigationStore, useToolsStore } from '@ui/stores';
import { NavigationViewKey } from '@ui/types';

interface McpServerWithToolsSidebarSectionProps {}

export default function McpServerWithToolsSidebarSection(_props: McpServerWithToolsSidebarSectionProps) {
  const { loadingInstalledMcpServers } = useMcpServersStore();
  const {
    addSelectedTool,
    getAllAvailableToolsGroupedByServer,
    getFilteredToolsGroupedByServer,
    toolSearchQuery,
    setToolSearchQuery,
  } = useToolsStore();
  const { setActiveView } = useNavigationStore();

  // State to track which servers are expanded
  const [expandedServers, setExpandedServers] = useState<Set<string>>(new Set());

  const allAvailableToolsGroupedByServer = getAllAvailableToolsGroupedByServer();
  const filteredToolsGroupedByServer = getFilteredToolsGroupedByServer();

  const hasAllAvailableTools = Object.keys(allAvailableToolsGroupedByServer).length > 0;
  const hasNoFilteredTools = Object.keys(filteredToolsGroupedByServer).length === 0;
  const toolSearchQueryIsEmpty = !toolSearchQuery.trim();

  const tools = toolSearchQueryIsEmpty ? allAvailableToolsGroupedByServer : filteredToolsGroupedByServer;

  // Toggle server expansion
  const toggleServerExpansion = (serverName: string) => {
    setExpandedServers((prev) => {
      const next = new Set(prev);
      if (next.has(serverName)) {
        next.delete(serverName);
      } else {
        next.add(serverName);
      }
      return next;
    });
  };

  // Initialize all servers as expanded on first render
  useEffect(() => {
    const serverNames = Object.keys(allAvailableToolsGroupedByServer);
    setExpandedServers(new Set(serverNames));
  }, []);

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Tools</SidebarGroupLabel>
      <SidebarGroupContent>
        <div className="px-4 pb-2">
          <Input
            placeholder="Search tools..."
            value={toolSearchQuery}
            onChange={(e) => setToolSearchQuery(e.target.value)}
            className="h-7 text-xs"
          />
        </div>
        <SidebarMenu>
          {loadingInstalledMcpServers ? (
            <SidebarMenuItem>
              <div className="flex items-center gap-2 px-2 py-1.5">
                <div className="h-3 w-3 animate-spin rounded-full border border-muted-foreground border-t-transparent" />
                <span className="text-xs text-muted-foreground">Loading...</span>
              </div>
            </SidebarMenuItem>
          ) : hasNoFilteredTools && hasAllAvailableTools ? (
            <SidebarMenuItem>
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                No tools found matching "{toolSearchQuery}"
              </div>
            </SidebarMenuItem>
          ) : (
            <>
              {Object.entries(tools).map(([serverName, tools]) => {
                const isExpanded = expandedServers.has(serverName);
                return (
                  <Collapsible
                    key={serverName}
                    open={isExpanded}
                    onOpenChange={() => toggleServerExpansion(serverName)}
                  >
                    <SidebarMenuItem>
                      <CollapsibleTrigger className="w-full">
                        <div className="flex items-center justify-between gap-2 px-2 py-1.5 bg-muted/50 rounded-md cursor-pointer hover:bg-muted/70 transition-colors w-full">
                          <div className="flex items-center gap-2">
                            <ToolServerIcon
                              toolServerName={serverName}
                              widthHeightClassName="w-4 h-4"
                              textClassName="text-[10px]"
                            />
                            <span className="text-sm font-medium capitalize">{serverName}</span>
                          </div>
                          {isExpanded ? (
                            <ChevronDown className="h-3 w-3 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-3 w-3 text-muted-foreground" />
                          )}
                        </div>
                      </CollapsibleTrigger>
                    </SidebarMenuItem>

                    <CollapsibleContent>
                      {tools.map((tool, idx) => {
                        const { serverName, name } = tool;
                        return (
                          <SidebarMenuItem key={`${serverName}-${idx}`}>
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
                                  className="justify-between text-sm w-full cursor-pointer"
                                  onClick={() => addSelectedTool(tool)}
                                >
                                  <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 bg-green-500 rounded-full" />
                                    <span>{formatToolName(name)}</span>
                                  </div>
                                  <ChevronRight className="h-3 w-3 text-muted-foreground" />
                                </SidebarMenuButton>
                              </div>
                            </ToolHoverCard>
                          </SidebarMenuItem>
                        );
                      })}
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}

              {(toolSearchQueryIsEmpty || hasNoFilteredTools) && (
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
  );
}
