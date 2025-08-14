import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';

import { ToolHoverCard } from '@ui/components/ToolHoverCard';
import { ToolServerIcon } from '@ui/components/ToolServerIcon';
import { Checkbox } from '@ui/components/ui/checkbox';
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
import { getAvailableTools } from '@ui/lib/clients/archestra/api/gen';
import type { AvailableTool } from '@ui/lib/clients/archestra/api/gen';
import { formatToolName } from '@ui/lib/utils/tools';
import { useChatStore, useNavigationStore } from '@ui/stores';
import { NavigationViewKey } from '@ui/types';

interface McpServerWithToolsSidebarSectionProps {}

export default function McpServerWithToolsSidebarSection(_props: McpServerWithToolsSidebarSectionProps) {
  const { selectedTools, setSelectedTools } = useChatStore();
  const { setActiveView } = useNavigationStore();
  const [availableTools, setAvailableTools] = useState<AvailableTool[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [toolSearchQuery, setToolSearchQuery] = useState('');

  // State to track which servers are expanded
  const [expandedServers, setExpandedServers] = useState<Set<string>>(new Set());

  // Fetch tools periodically
  useEffect(() => {
    const fetchTools = async () => {
      try {
        setIsLoading(true);
        const response = await getAvailableTools();
        const tools = (response.data as AvailableTool[]) || [];
        setAvailableTools(tools);

        // Initialize all servers as expanded on first fetch
        const serverNames = new Set(tools.map((t) => t.mcpServerName || 'Unknown'));
        setExpandedServers(serverNames);
      } catch (error) {
        console.error('Failed to fetch tools:', error);
        setAvailableTools([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTools();
    const interval = setInterval(fetchTools, 5000);
    return () => clearInterval(interval);
  }, []);

  // Filter tools based on search query
  const filteredTools = availableTools.filter((tool) => {
    if (!toolSearchQuery.trim()) return true;
    const searchLower = toolSearchQuery.toLowerCase();
    return (
      tool.name?.toLowerCase().includes(searchLower) ||
      tool.description?.toLowerCase().includes(searchLower) ||
      tool.mcpServerName?.toLowerCase().includes(searchLower)
    );
  });

  // Group tools by server
  const toolsByServer = filteredTools.reduce((acc: Record<string, AvailableTool[]>, tool: AvailableTool) => {
    const serverName = tool.mcpServerName || 'Unknown';
    if (!acc[serverName]) {
      acc[serverName] = [];
    }
    acc[serverName].push(tool);
    return acc;
  }, {});

  const hasTools = Object.keys(toolsByServer).length > 0;
  const toolSearchQueryIsEmpty = !toolSearchQuery.trim();

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

  // Handle tool selection
  const handleToolToggle = (toolId: string, checked: boolean) => {
    const newSelection = checked ? [...selectedTools, toolId] : selectedTools.filter((id) => id !== toolId);
    setSelectedTools(newSelection);
  };

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>
        Tools
        {selectedTools.length > 0 && (
          <span className="ml-2 px-1.5 py-0.5 text-xs bg-primary/10 text-primary rounded-full">
            {selectedTools.length}
          </span>
        )}
      </SidebarGroupLabel>
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
          {isLoading ? (
            <SidebarMenuItem>
              <div className="flex items-center gap-2 px-2 py-1.5">
                <div className="h-3 w-3 animate-spin rounded-full border border-muted-foreground border-t-transparent" />
                <span className="text-xs text-muted-foreground">Loading...</span>
              </div>
            </SidebarMenuItem>
          ) : !hasTools ? (
            <SidebarMenuItem>
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                {toolSearchQuery ? `No tools found matching "${toolSearchQuery}"` : 'No tools available'}
              </div>
            </SidebarMenuItem>
          ) : (
            <>
              {Object.entries(toolsByServer).map(([serverName, serverTools]) => {
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
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <ToolServerIcon
                              toolServerName={serverName}
                              widthHeightClassName="w-4 h-4"
                              textClassName="text-[10px]"
                            />
                            <span className="text-sm font-medium capitalize truncate">{serverName}</span>
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
                      {serverTools.map((tool) => {
                        const isSelected = selectedTools.includes(tool.id);
                        return (
                          <SidebarMenuItem key={tool.id}>
                            <div className="w-full">
                              <SidebarMenuButton
                                size="sm"
                                className="justify-between text-sm w-full cursor-pointer hover:bg-muted/50"
                                onClick={() => handleToolToggle(tool.id, !isSelected)}
                              >
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <Checkbox
                                    checked={isSelected}
                                    onCheckedChange={(checked) => handleToolToggle(tool.id, checked as boolean)}
                                    onClick={(e) => e.stopPropagation()}
                                    className="h-3 w-3"
                                  />
                                  <div className="w-2 h-2 bg-green-500 rounded-full flex-shrink-0" />
                                  <span className="truncate">{formatToolName(tool.name || tool.id)}</span>
                                </div>
                              </SidebarMenuButton>
                            </div>
                          </SidebarMenuItem>
                        );
                      })}
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}

              {(toolSearchQueryIsEmpty || !hasTools) && (
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
