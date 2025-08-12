import { ChevronRight, Circle, Loader2, Plus } from 'lucide-react';
import * as React from 'react';

import { ToolHoverCard } from '@ui/components/ToolHoverCard';
import { ToolServerIcon } from '@ui/components/ToolServerIcon';
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
import { useMcpServersStore, useNavigationStore, useSandboxStore, useToolsStore } from '@ui/stores';
import { NavigationViewKey } from '@ui/types';

interface McpServerWithToolsSidebarSectionProps {}

export default function McpServerWithToolsSidebarSection(_props: McpServerWithToolsSidebarSectionProps) {
  const { loadingInstalledMcpServers, installedMcpServers } = useMcpServersStore();
  const {
    addSelectedTool,
    getAllAvailableToolsGroupedByServer,
    getFilteredToolsGroupedByServer,
    toolSearchQuery,
    setToolSearchQuery,
  } = useToolsStore();
  const { setActiveView } = useNavigationStore();
  const { statusSummary } = useSandboxStore();

  const allAvailableToolsGroupedByServer = getAllAvailableToolsGroupedByServer();
  const filteredToolsGroupedByServer = getFilteredToolsGroupedByServer();

  const hasAllAvailableTools = Object.keys(allAvailableToolsGroupedByServer).length > 0;
  const hasNoFilteredTools = Object.keys(filteredToolsGroupedByServer).length === 0;
  const toolSearchQueryIsEmpty = !toolSearchQuery.trim();

  const tools = toolSearchQueryIsEmpty ? allAvailableToolsGroupedByServer : filteredToolsGroupedByServer;

  // Check if any MCP servers are initializing
  const hasInitializingServers = installedMcpServers.some(
    (server) => server.state === 'initializing' || server.state === 'created'
  );
  const isBaseImagePulling =
    statusSummary.runtime.baseImage.pullPercentage > 0 && statusSummary.runtime.baseImage.pullPercentage < 100;
  const isPodmanInitializing = statusSummary.status === 'initializing';

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
          ) : (isPodmanInitializing || isBaseImagePulling || hasInitializingServers) && toolSearchQueryIsEmpty ? (
            // Show initializing servers with loading states
            <>
              {isPodmanInitializing && (
                <SidebarMenuItem>
                  <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>
                      {statusSummary.runtime.startupMessage || 'Initializing sandbox...'}
                      {statusSummary.runtime.startupPercentage > 0 && (
                        <span className="ml-1">({statusSummary.runtime.startupPercentage}%)</span>
                      )}
                    </span>
                  </div>
                </SidebarMenuItem>
              )}

              {isBaseImagePulling && (
                <SidebarMenuItem>
                  <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>
                      {statusSummary.runtime.baseImage.pullMessage || 'Pulling base image...'}
                      {statusSummary.runtime.baseImage.pullPercentage > 0 && (
                        <span className="ml-1">({statusSummary.runtime.baseImage.pullPercentage}%)</span>
                      )}
                    </span>
                  </div>
                </SidebarMenuItem>
              )}

              {installedMcpServers.map((server) => {
                const isInitializing = server.state === 'initializing' || server.state === 'created';
                if (!isInitializing && !server.tools.length) return null;

                return (
                  <React.Fragment key={server.id}>
                    <SidebarMenuItem>
                      <div className="flex items-center gap-2 px-2 py-1.5 bg-muted/50 rounded-md">
                        <ToolServerIcon
                          toolServerName={server.name}
                          widthHeightClassName="w-4 h-4"
                          textClassName="text-[10px]"
                        />
                        <span className="text-sm font-medium capitalize flex-1">{server.name}</span>
                        {isInitializing && <Circle className="h-2 w-2 fill-yellow-500 text-yellow-500" />}
                      </div>
                    </SidebarMenuItem>

                    {isInitializing ? (
                      <SidebarMenuItem>
                        <div className="flex items-center gap-2 px-8 py-1 text-xs text-muted-foreground">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          <span>Loading tools...</span>
                        </div>
                      </SidebarMenuItem>
                    ) : (
                      server.tools.map((tool, idx) => {
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
                      })
                    )}
                  </React.Fragment>
                );
              })}

              {!hasInitializingServers &&
                hasAllAvailableTools &&
                // Show regular tools if no servers are initializing
                Object.entries(tools).map(([serverName, tools]) => (
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
            </>
          ) : hasNoFilteredTools && hasAllAvailableTools ? (
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
