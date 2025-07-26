import { ChevronRight, Plus } from 'lucide-react';
import * as React from 'react';

import { ToolHoverCard } from '@/components/ToolHoverCard';
import { ToolServerIcon } from '@/components/ToolServerIcon';
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

import ToolSearch from '../ToolSearch';

interface MCPServerWithToolsProps {}

export default function MCPServerWithTools(_props: MCPServerWithToolsProps) {
  const { loadingInstalledMCPServers, allTools, addSelectedTool, getFilteredTools, toolSearchQuery } =
    useMCPServersStore();
  const { setActiveView } = useNavigationStore();

  const filteredTools = getFilteredTools();

  const hasTools = Object.keys(allTools).length > 0;
  const hasNoTools = !hasTools;
  const hasNoFilteredTools = Object.keys(filteredTools).length === 0;
  const toolSearchQueryIsEmpty = !toolSearchQuery.trim();

  return (
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
              {Object.entries(filteredTools).map(([serverName, _tools]) => (
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

                  {allTools.map((tool, idx) => {
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
                              className="justify-between text-sm w-full"
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
