import { ChevronRight, Plus } from 'lucide-react';
import * as React from 'react';

import { ToolHoverCard } from '@/components/ToolHoverCard';
import { ToolServerIcon } from '@/components/ToolServerIcon';
import { Input } from '@/components/ui/input';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { formatToolName } from '@/lib/utils/tools';
import { useMCPServersStore } from '@/stores/mcp-servers-store';
import { useNavigationStore } from '@/stores/navigation-store';
import { NavigationViewKey } from '@/types';

interface MCPServerWithToolsSidebarSectionProps {}

export default function MCPServerWithToolsSidebarSection(_props: MCPServerWithToolsSidebarSectionProps) {
  const {
    loadingInstalledMCPServers,
    addSelectedTool,
    getAllAvailableToolsGroupedByServer,
    getFilteredToolsGroupedByServer,
    toolSearchQuery,
    setToolSearchQuery,
  } = useMCPServersStore();
  const { setActiveView } = useNavigationStore();

  const allAvailableToolsGroupedByServer = getAllAvailableToolsGroupedByServer();
  const filteredToolsGroupedByServer = getFilteredToolsGroupedByServer();

  const hasAllAvailableTools = Object.keys(allAvailableToolsGroupedByServer).length > 0;
  const hasNoTools = !hasAllAvailableTools;
  const hasNoFilteredTools = Object.keys(filteredToolsGroupedByServer).length === 0;
  const toolSearchQueryIsEmpty = !toolSearchQuery.trim();

  const tools = toolSearchQueryIsEmpty ? allAvailableToolsGroupedByServer : filteredToolsGroupedByServer;

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
          {loadingInstalledMCPServers ? (
            <SidebarMenuItem>
              <div className="flex items-center gap-2 px-2 py-1.5">
                <div className="h-3 w-3 animate-spin rounded-full border border-muted-foreground border-t-transparent" />
                <span className="text-xs text-muted-foreground">Loading...</span>
              </div>
            </SidebarMenuItem>
          ) : hasNoTools ? (
            <SidebarMenuItem>
              <SidebarMenuButton size="sm" className="justify-start text-muted-foreground">
                <Plus className="h-4 w-4" />
                <span>Add more</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ) : hasNoFilteredTools ? (
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
                </React.Fragment>
              ))}

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
